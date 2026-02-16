import { getUncachableStripeClient } from './stripeClient';

async function createProducts() {
  const stripe = await getUncachableStripeClient();

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
      unit_amount: 4900,
      currency: 'usd',
      recurring: { interval: 'month', trial_period_days: 7 },
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
      unit_amount: 49000,
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
      unit_amount: 99700,
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
