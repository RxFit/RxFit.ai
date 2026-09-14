/**
 * Webhook dispatch contract (server/webhookHandlers.ts):
 *  - the sync library processes the payload FIRST (it verifies the Stripe
 *    signature and throws on a bad one — recovery must never run on an
 *    unverified payload)
 *  - invoice.payment_failed events dispatch into the payment-recovery flow
 *    with the invoice object
 *  - other event types do not
 *  - a recovery failure never breaks the webhook (sync already succeeded)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above top-level consts, so the mock fns must
// be created in vi.hoisted to be reachable when the factories run.
const { processWebhookMock, recoveryMock } = vi.hoisted(() => ({
  processWebhookMock: vi.fn(),
  recoveryMock: vi.fn(),
}));

vi.mock("./stripeClient", () => ({
  getStripeSync: vi.fn().mockImplementation(async () => ({
    processWebhook: processWebhookMock,
  })),
}));

vi.mock("./paymentRecovery", () => ({
  handleInvoicePaymentFailed: recoveryMock,
}));

import { WebhookHandlers } from "./webhookHandlers";

function payloadOf(event: unknown): Buffer {
  return Buffer.from(JSON.stringify(event), "utf8");
}

const PAYMENT_FAILED_EVENT = {
  id: "evt_1",
  type: "invoice.payment_failed",
  data: { object: { id: "in_123", customer: "cus_1", customer_email: "a@b.c" } },
};

describe("WebhookHandlers.processWebhook dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    processWebhookMock.mockResolvedValue(undefined);
    recoveryMock.mockResolvedValue("sent");
  });

  it("dispatches invoice.payment_failed into payment recovery with the invoice object", async () => {
    await WebhookHandlers.processWebhook(payloadOf(PAYMENT_FAILED_EVENT), "sig");

    expect(processWebhookMock).toHaveBeenCalledTimes(1);
    expect(recoveryMock).toHaveBeenCalledTimes(1);
    expect(recoveryMock).toHaveBeenCalledWith(PAYMENT_FAILED_EVENT.data.object);
  });

  it("does not dispatch other event types", async () => {
    await WebhookHandlers.processWebhook(
      payloadOf({ id: "evt_2", type: "invoice.paid", data: { object: { id: "in_9" } } }),
      "sig",
    );

    expect(processWebhookMock).toHaveBeenCalledTimes(1);
    expect(recoveryMock).not.toHaveBeenCalled();
  });

  it("never runs recovery when signature verification fails (sync throws)", async () => {
    processWebhookMock.mockRejectedValueOnce(new Error("bad signature"));

    await expect(
      WebhookHandlers.processWebhook(payloadOf(PAYMENT_FAILED_EVENT), "bad-sig"),
    ).rejects.toThrow("bad signature");
    expect(recoveryMock).not.toHaveBeenCalled();
  });

  it("a recovery failure does not break the webhook response", async () => {
    recoveryMock.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      WebhookHandlers.processWebhook(payloadOf(PAYMENT_FAILED_EVENT), "sig"),
    ).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it("rejects non-Buffer payloads before touching Stripe", async () => {
    await expect(
      WebhookHandlers.processWebhook("not-a-buffer" as unknown as Buffer, "sig"),
    ).rejects.toThrow("Payload must be a Buffer");
    expect(processWebhookMock).not.toHaveBeenCalled();
    expect(recoveryMock).not.toHaveBeenCalled();
  });
});
