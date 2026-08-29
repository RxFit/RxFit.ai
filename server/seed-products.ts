import { getUncachableStripeClient } from './stripeClient';
import { PLAN_PRICING } from '@shared/stripe-constants';

async function createProducts() {
  const stripe = await getUncachableStripeClient();

  // Refuse to run against a live account. This script name-matches products
  // ("Kickstart", "Committed", "Transformation") which do NOT exist in the live
  // catalog — the real tiers are three prices on one "RxFit.ai" product — so it
  // would create duplicates, including a recurring yearly Transformation price
  // where the real one is one-time. It is a test/sandbox seeding tool.
  const probe = await stripe.products.list({ limit: 1 });
  if (probe.data[0]?.livemode) {
    throw new Error(
      "Refusing to seed products against a LIVE Stripe account. This script is for test/sandbox accounts only: " +
        "the live catalog already carries the site's tiers as three prices on a single product, and seeding would " +
        "create duplicates plus a recurring Transformation price where the live one is one-time. " +
        "Point STRIPE_SECRET_KEY at a test key before running it.",
    );
  }

  const existingProducts = await stripe.products.list({ limit: 100 });
  const existingNames = existingProducts.data.map(p => p.name);

  if (!existingNames.includes('Kickstart')) {
    console.log('Creating Kickstart product...');
    const kickstart = await stripe.products.create({
      name: 'Kickstart',
      description: 'AI-powered health dashboard with basic coach check-ins. Perfect for getting started.',
      metadata: {
        tier: 'kickstart',
        features: 'AI Health Hub,Basic Coach Check-ins,Wearable Integration,Weekly Progress Reports',
      },
    });
    await stripe.prices.create({
      product: kickstart.id,
      unit_amount: PLAN_PRICING.kickstart.amount * 100,
      currency: 'usd',
      recurring: { interval: 'month', trial_period_days: PLAN_PRICING.kickstart.trialDays },
      metadata: { tier: 'kickstart', billing: 'monthly' },
    });
    console.log(`Created Kickstart: ${kickstart.id}`);
  } else {
    console.log('Kickstart already exists, skipping.');
  }

  if (!existingNames.includes('Committed')) {
    console.log('Creating Committed product...');
    const committed = await stripe.products.create({
      name: 'Committed',
      description: 'Full AI suite with dedicated personal trainer. Best value for serious fitness goals.',
      metadata: {
        tier: 'committed',
        features: 'Everything in Kickstart,Dedicated Personal Trainer,Custom Workout Plans,Nutrition Coaching,Daily Accountability',
        popular: 'true',
      },
    });
    await stripe.prices.create({
      product: committed.id,
      unit_amount: PLAN_PRICING.committed.amount * 100,
      currency: 'usd',
      recurring: { interval: 'year' },
      metadata: { tier: 'committed', billing: 'yearly' },
    });
    console.log(`Created Committed: ${committed.id}`);
  } else {
    console.log('Committed already exists, skipping.');
  }

  if (!existingNames.includes('Transformation')) {
    console.log('Creating Transformation product...');
    const transformation = await stripe.products.create({
      name: 'Transformation',
      description: 'Complete 12-week body transformation program with elite coaching and premium AI features.',
      metadata: {
        tier: 'transformation',
        features: 'Everything in Committed,Elite 1-on-1 Coaching,12-Week Transformation Program,Priority Support,Advanced AI Analytics',
      },
    });
    await stripe.prices.create({
      product: transformation.id,
      unit_amount: PLAN_PRICING.transformation.amount * 100,
      currency: 'usd',
      recurring: { interval: 'year' },
      metadata: { tier: 'transformation', billing: 'one-time-equivalent' },
    });
    console.log(`Created Transformation: ${transformation.id}`);
  } else {
    console.log('Transformation already exists, skipping.');
  }

  console.log('Done! Products will sync to database via webhooks.');
}

createProducts().catch(console.error);
