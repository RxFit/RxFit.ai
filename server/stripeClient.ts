import Stripe from 'stripe';
import { dbSslConfig } from '@shared/db-ssl.mjs';

async function getCredentials() {
  // PREFER direct API keys from Secrets (for Live mode)
  const directSecretKey = process.env.STRIPE_SECRET_KEY;
  const directPublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  
  if (directSecretKey) {
    console.log("[Stripe] Using direct API keys from Secrets (Live mode)");
    return {
      publishableKey: directPublishableKey || '',
      secretKey: directSecretKey,
    };
  }

  // FALLBACK: Replit Connector (Sandbox mode)
  console.log("[Stripe] No STRIPE_SECRET_KEY found, falling back to Replit Connector");
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('No Stripe credentials found. Set STRIPE_SECRET_KEY in Replit Secrets, or configure the Stripe Connector.');
  }

  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  const { getConnectionSettings } = await import('./connectorSettings');
  const connection = await getConnectionSettings('stripe', targetEnvironment);

  // Gate on the SECRET alone. Every consumer that matters -- checkout, session
  // retrieval, the billing portal, StripeSync -- needs only the secret key, so
  // a connection carrying a usable secret but no publishable key must not take
  // down all of Stripe. Optional chaining also stops a connection with no
  // `settings` object throwing a bare TypeError into the alert email instead
  // of this diagnostic.
  const secret = connection?.settings?.secret;
  if (!secret) {
    throw new Error(`Stripe ${targetEnvironment} connection not found via Connector. Set STRIPE_SECRET_KEY in Replit Secrets instead.`);
  }

  return {
    publishableKey: connection?.settings?.publishable ?? '',
    secretKey: secret,
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
