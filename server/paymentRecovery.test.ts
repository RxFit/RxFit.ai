/**
 * Contract tests for the payment-recovery orchestrator
 * (createPaymentRecoveryHandler in server/paymentRecovery.ts).
 *
 * Locked behavior:
 *  - first invoice.payment_failed for an invoice → claim, portal URL, email,
 *    SMS, outcome "sent"
 *  - the update-card URL is a Stripe Billing Portal session created for the
 *    invoice's customer, and is the URL the email/SMS carry
 *  - a repeated failure for the SAME invoice (claim conflict) → no resend,
 *    outcome "duplicate" (Stripe retries failed payments several times)
 *  - a failed send RELEASES the claim so Stripe's next retry re-attempts,
 *    and the owner gets an alerts-sheet row — outcome "failed"
 *  - no reachable customer email → no claim, no send, owner alerted —
 *    outcome "skipped-no-email"
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPaymentRecoveryHandler, type PaymentRecoveryDeps } from "./paymentRecovery";

const INVOICE = {
  id: "in_test_123",
  customer: "cus_test_456",
  customer_email: "mark@example.com",
  customer_name: "Mark Estes",
  amount_due: 12900,
};

function makeDeps(overrides: Partial<PaymentRecoveryDeps> = {}) {
  const deps: PaymentRecoveryDeps = {
    claimInvoice: vi.fn().mockResolvedValue(true),
    releaseInvoice: vi.fn().mockResolvedValue(undefined),
    createUpdateCardUrl: vi.fn().mockResolvedValue("https://billing.stripe.com/p/session/test_123"),
    sendEmail: vi.fn().mockResolvedValue(undefined),
    sendSms: vi.fn().mockResolvedValue(undefined),
    alertOwner: vi.fn().mockResolvedValue(undefined),
    resolveCustomer: vi.fn().mockResolvedValue({ email: null, name: null }),
    ...overrides,
  };
  return deps;
}

describe("payment recovery orchestrator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the card-declined email with a billing-portal update link on first failure", async () => {
    const deps = makeDeps();
    const handle = createPaymentRecoveryHandler(deps);

    await expect(handle({ ...INVOICE })).resolves.toBe("sent");

    expect(deps.claimInvoice).toHaveBeenCalledWith({
      invoiceId: "in_test_123",
      customerId: "cus_test_456",
      customerEmail: "mark@example.com",
      amountDueCents: 12900,
    });
    expect(deps.createUpdateCardUrl).toHaveBeenCalledWith("cus_test_456");
    expect(deps.sendEmail).toHaveBeenCalledWith(
      "mark@example.com",
      "Mark Estes",
      "https://billing.stripe.com/p/session/test_123",
    );
    expect(deps.sendSms).toHaveBeenCalledWith({
      name: "Mark Estes",
      email: "mark@example.com",
      updateUrl: "https://billing.stripe.com/p/session/test_123",
    });
    expect(deps.alertOwner).not.toHaveBeenCalled();
  });

  it("never double-sends when the same invoice fails repeatedly", async () => {
    const deps = makeDeps({ claimInvoice: vi.fn().mockResolvedValue(false) });
    const handle = createPaymentRecoveryHandler(deps);

    await expect(handle({ ...INVOICE })).resolves.toBe("duplicate");

    expect(deps.createUpdateCardUrl).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.sendSms).not.toHaveBeenCalled();
  });

  it("releases the claim and alerts the owner when the email send fails (retry armed)", async () => {
    const deps = makeDeps({
      sendEmail: vi.fn().mockRejectedValue(new Error("gmail down")),
    });
    const handle = createPaymentRecoveryHandler(deps);

    await expect(handle({ ...INVOICE })).resolves.toBe("failed");

    expect(deps.releaseInvoice).toHaveBeenCalledWith("in_test_123");
    expect(deps.alertOwner).toHaveBeenCalledTimes(1);
    const [title, message] = vi.mocked(deps.alertOwner).mock.calls[0];
    expect(title).toContain("mark@example.com");
    expect(title).toContain("retry");
    expect(message).toContain("in_test_123");
    expect(message).toContain("gmail down");
    // SMS never fires when the email (the primary channel) didn't go out.
    expect(deps.sendSms).not.toHaveBeenCalled();
  });

  it("skips loudly (owner alerted, no claim) when no customer email is reachable", async () => {
    const deps = makeDeps();
    const handle = createPaymentRecoveryHandler(deps);

    await expect(
      handle({ id: "in_noemail", customer: "cus_noemail", amount_due: 5000 }),
    ).resolves.toBe("skipped-no-email");

    expect(deps.resolveCustomer).toHaveBeenCalledWith("cus_noemail");
    expect(deps.claimInvoice).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
    expect(deps.alertOwner).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deps.alertOwner).mock.calls[0][0]).toContain("in_noemail");
  });

  it("falls back to the Stripe customer record when the invoice has no email/name", async () => {
    const deps = makeDeps({
      resolveCustomer: vi.fn().mockResolvedValue({ email: "sapan@example.com", name: "Sapan Shahani" }),
    });
    const handle = createPaymentRecoveryHandler(deps);

    await expect(
      handle({ id: "in_lookup", customer: "cus_lookup", amount_due: 9900 }),
    ).resolves.toBe("sent");

    expect(deps.sendEmail).toHaveBeenCalledWith(
      "sapan@example.com",
      "Sapan Shahani",
      "https://billing.stripe.com/p/session/test_123",
    );
  });

  it("does not call the customer lookup when the invoice already carries email + name", async () => {
    const deps = makeDeps();
    const handle = createPaymentRecoveryHandler(deps);

    await handle({ ...INVOICE });

    expect(deps.resolveCustomer).not.toHaveBeenCalled();
  });

  it("fails loudly on a payload without an invoice id", async () => {
    const deps = makeDeps();
    const handle = createPaymentRecoveryHandler(deps);

    await expect(handle({ customer: "cus_x" })).resolves.toBe("failed");
    expect(deps.claimInvoice).not.toHaveBeenCalled();
  });
});
