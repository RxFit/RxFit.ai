import Stripe from 'stripe';
import { dbSslConfig } from '@shared/db-ssl.mjs';

async function getCredentials() {
  const directSecretKey = process.env.STRIPE_SECRET_KEY;
  const directPublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  if (!directSecretKey) {
    throw new Error('No Stripe secret key available. Set STRIPE_SECRET_KEY in Replit Secrets.');
  }

  if (!directPublishableKey) {
    throw new Error('No Stripe publishable key available. Set STRIPE_PUBLISHABLE_KEY in Replit Secrets.');
  }

  return {
    publishableKey: directPublishableKey,
    secretKey: directSecretKey,
  };
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey);
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  // Fail loudly rather than serving `{ publishableKey: "" }`, which a browser
  // would only surface as an opaque Stripe.js error.
  if (!publishableKey) {
    throw new Error('No Stripe publishable key available. Set STRIPE_PUBLISHABLE_KEY in Replit Secrets.');
  }
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
        ssl: dbSslConfig(),
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
