import { getStripeSync } from './stripeClient';
import { handleInvoicePaymentFailed } from './paymentRecovery';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // The sync's processWebhook threw nothing → the signature was verified
    // against THIS exact payload, so parsing the same buffer is safe.
    // Side effects (payment recovery) must never break the 200 response:
    // Stripe would retry delivery, and the sync half is already persisted.
    try {
      const event = JSON.parse(payload.toString('utf8'));
      if (event?.type === 'invoice.payment_failed' && event.data?.object) {
        const outcome = await handleInvoicePaymentFailed(event.data.object);
        console.log(`[payment-recovery] invoice.payment_failed handled: ${outcome}`);
      }
    } catch (error) {
      console.error('[payment-recovery] Recovery dispatch failed (webhook sync already succeeded):', error);
    }
  }
}
