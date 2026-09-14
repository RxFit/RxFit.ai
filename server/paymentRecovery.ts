import { eq } from "drizzle-orm";
import { db } from "./db";
import { paymentRecoverySends } from "@shared/schema";
import { getUncachableStripeClient } from "./stripeClient";
import { sendCardDeclinedEmailOrThrow, getCardDeclinedSmsText } from "./emailService";
import { SITE_URL } from "@shared/site";

/**
 * Payment-recovery flow for Stripe `invoice.payment_failed` webhooks.
 *
 * One recovery message per invoice, ever:
 *  1. claimInvoice atomically inserts a row keyed by invoice id — a repeated
 *     failure webhook for the same invoice conflicts and the event is
 *     skipped as a duplicate (Stripe retries a failed payment several times,
 *     and each retry re-fires the event).
 *  2. A Stripe Billing Portal session provides the secure update-card URL
 *     (no login needed, hosted by Stripe).
 *  3. The card-declined email is sent. The SMS nudge goes through a
 *     GoHighLevel inbound webhook when GHL_SMS_WEBHOOK_URL is configured;
 *     without it the flow is email-only and says so loudly in the log.
 *  4. If the email send FAILS, the claim is released so Stripe's next
 *     scheduled retry re-attempts the whole flow — a Gmail outage must not
 *     permanently silence recovery for that invoice — and the owner gets an
 *     alerts-sheet row.
 *
 * Dependencies are injectable (same factory pattern as checkoutRoute.ts /
 * productsRoute.ts) so the orchestration is covered by a route-level test
 * without a real Stripe/Gmail/DB.
 */

export type RecoveryOutcome = "sent" | "duplicate" | "skipped-no-email" | "failed";

export interface PaymentRecoveryDeps {
  /** Atomically claim the invoice. Returns false when it was already claimed. */
  claimInvoice: (rec: {
    invoiceId: string;
    customerId: string;
    customerEmail: string;
    amountDueCents: number | null;
  }) => Promise<boolean>;
  /** Release a claim after a failed send so the next Stripe retry re-attempts. */
  releaseInvoice: (invoiceId: string) => Promise<void>;
  /** Secure update-card URL (Stripe Billing Portal session). Throws on failure. */
  createUpdateCardUrl: (customerId: string) => Promise<string>;
  /** Card-declined email. THROWS on failure so the claim can be released. */
  sendEmail: (to: string, name: string, updateUrl: string) => Promise<void>;
  /** SMS nudge. Best-effort: must never throw (email already went out). */
  sendSms: (ctx: { name: string; email: string; updateUrl: string }) => Promise<void>;
  /** Owner heads-up via the alerts sheet. Best-effort: must never throw. */
  alertOwner: (title: string, message: string) => Promise<void>;
  /** Resolve customer email/name when the invoice payload doesn't carry them. */
  resolveCustomer: (customerId: string) => Promise<{ email: string | null; name: string | null }>;
}

const defaultDeps: PaymentRecoveryDeps = {
  async claimInvoice(rec) {
    const inserted = await db
      .insert(paymentRecoverySends)
      .values(rec)
      .onConflictDoNothing({ target: paymentRecoverySends.invoiceId })
      .returning({ id: paymentRecoverySends.id });
    return inserted.length > 0;
  },
  async releaseInvoice(invoiceId) {
    await db.delete(paymentRecoverySends).where(eq(paymentRecoverySends.invoiceId, invoiceId));
  },
  async createUpdateCardUrl(customerId) {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: SITE_URL,
    });
    return session.url;
  },
  sendEmail: sendCardDeclinedEmailOrThrow,
  async sendSms({ name, email, updateUrl }) {
    const webhookUrl = process.env.GHL_SMS_WEBHOOK_URL;
    const message = getCardDeclinedSmsText(name, updateUrl);
    if (!webhookUrl) {
      // Email-only v1: no GoHighLevel connection is configured in this
      // workspace, so the SMS nudge is skipped — loudly, never silently.
      console.warn(
        `[payment-recovery] SMS nudge for ${email} skipped — GHL_SMS_WEBHOOK_URL is not configured (email-only mode).`,
      );
      return;
    }
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, message }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`GHL webhook responded ${res.status}`);
      console.log(`[payment-recovery] SMS nudge handed to GoHighLevel for ${email}`);
    } catch (error) {
      // SMS is the secondary channel; the email already went out. Log loudly
      // and move on — a GHL hiccup must not fail the whole recovery flow.
      console.error(`[payment-recovery] SMS nudge for ${email} failed:`, error);
    }
  },
  async alertOwner(title, message) {
    try {
      const { appendAlertToSheet } = await import("./sheetsService");
      await appendAlertToSheet({ title, message });
    } catch (sheetError) {
      console.error("[payment-recovery] Owner alert could not be recorded in the sheet:", sheetError);
    }
  },
  async resolveCustomer(customerId) {
    const stripe = await getUncachableStripeClient();
    const customer = await stripe.customers.retrieve(customerId);
    const record = customer as { deleted?: boolean; email?: string | null; name?: string | null };
    if (record.deleted) return { email: null, name: null };
    return { email: record.email ?? null, name: record.name ?? null };
  },
};

export function createPaymentRecoveryHandler(overrides: Partial<PaymentRecoveryDeps> = {}) {
  const deps: PaymentRecoveryDeps = { ...defaultDeps, ...overrides };

  return async function handleInvoicePaymentFailed(invoice: any): Promise<RecoveryOutcome> {
    const invoiceId = String(invoice?.id ?? "");
    if (!invoiceId) {
      console.error("[payment-recovery] invoice.payment_failed without an invoice id — cannot process.");
      return "failed";
    }
    const customerId =
      typeof invoice.customer === "string" ? invoice.customer : (invoice.customer?.id ?? "");

    let email: string | null = invoice.customer_email ?? null;
    let name: string | null = invoice.customer_name ?? null;
    if (!email && customerId) {
      email = (await deps.resolveCustomer(customerId)).email;
    }
    if (!name && customerId) {
      name = (await deps.resolveCustomer(customerId)).name;
    }

    if (!email) {
      console.error(
        `[payment-recovery] Invoice ${invoiceId} failed but no customer email is available — ` +
          `no recovery message can be sent. Follow up manually.`,
      );
      await deps.alertOwner(
        `Payment recovery NOT sent — no email for invoice ${invoiceId}`,
        `Invoice: ${invoiceId}\nCustomer: ${customerId || "unknown"}\nThe payment failed but Stripe has no email for this customer, so no recovery email/SMS could be sent. Reach out manually if you know who this is.`,
      );
      return "skipped-no-email";
    }

    const claimed = await deps.claimInvoice({
      invoiceId,
      customerId,
      customerEmail: email,
      amountDueCents: typeof invoice.amount_due === "number" ? invoice.amount_due : null,
    });
    if (!claimed) {
      console.log(`[payment-recovery] Invoice ${invoiceId} already triggered a recovery message — skipping duplicate.`);
      return "duplicate";
    }

    try {
      const updateUrl = await deps.createUpdateCardUrl(customerId);
      await deps.sendEmail(email, name ?? "", updateUrl);
      await deps.sendSms({ name: name ?? "", email, updateUrl });
      console.log(`[payment-recovery] Recovery flow sent for invoice ${invoiceId} (${email}).`);
      return "sent";
    } catch (error) {
      // Release the claim so Stripe's next dunning retry re-attempts the whole
      // flow — otherwise a transient Gmail/Stripe outage would permanently
      // silence recovery for this invoice.
      await deps.releaseInvoice(invoiceId);
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[payment-recovery] Recovery send for invoice ${invoiceId} failed (claim released, will retry):`, error);
      await deps.alertOwner(
        `Payment recovery email FAILED for ${email} — automatic retry armed`,
        `Invoice: ${invoiceId}\nRecipient: ${email}${name ? ` (${name})` : ""}\nError: ${message}\nThe dedupe claim was released, so Stripe's next retry of this invoice will attempt the recovery email again.`,
      );
      return "failed";
    }
  };
}

/** Production handler bound to the real Stripe/Gmail/DB dependencies. */
export const handleInvoicePaymentFailed = createPaymentRecoveryHandler();
