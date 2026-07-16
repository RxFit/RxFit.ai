import { SITE_URL } from "./site";

/**
 * Landing-page structured data (FAQPage + Product/Offer JSON-LD) used by
 * client/src/pages/LandingPage.tsx via the Seo jsonLd prop, and validated by
 * shared/landing-seo.test.ts + scripts/validate-seo.mjs so a refactor can't
 * silently drop it.
 */

export const FAQ_ITEMS = [
  {
    q: "What is RxFit.ai?",
    a: "RxFit.ai is an AI-powered health coaching service that combines wearable data from devices like Oura, Garmin, and Apple Health with a dedicated human accountability coach. The AI dashboard analyzes your biometrics daily, and your coach turns that data into a specific plan and keeps you consistent.",
  },
  {
    q: "How is RxFit different from a fitness app or an AI chatbot?",
    a: "Apps and chatbots give generic advice and are easy to ignore. RxFit assigns you a real human coach who sees your actual sleep, recovery, and training data and adjusts your workouts and nutrition daily. The AI does the analysis; the human provides the judgment and accountability.",
  },
  {
    q: "Which wearables and apps does RxFit work with?",
    a: "RxFit syncs with all major wearables and health apps, including Oura, Garmin, Apple Health, Strava, and SnapCalorie. Your data is combined into a single dashboard with a daily readiness score.",
  },
  {
    q: "How much does RxFit.ai cost?",
    a: "RxFit has three plans: The Kickstart at $49/month with a 7-day free trial (AI dashboard, device sync, weekly coach check-in), The Committed at $490/year paid upfront (saves $98 and adds priority coach access), and The Transformation at $997 one-time (1-on-1 deep-dive coaching and an executive wellness audit).",
  },
  {
    q: "Is there a free trial, and can I cancel anytime?",
    a: "Yes. The Kickstart plan includes a 7-day free trial, and you can cancel your subscription at any time from the billing portal — no long-term contract or cancellation fee.",
  },
  {
    q: "Who is RxFit.ai for?",
    a: "RxFit is built for busy professionals and high-performers who already track their health data but struggle to turn it into consistent daily action. If you own a wearable and want expert direction plus real accountability without hiring a $500/month personal trainer, RxFit is designed for you.",
  },
];

export const FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((it) => ({
    "@type": "Question",
    name: it.q,
    acceptedAnswer: { "@type": "Answer", text: it.a },
  })),
};

export const PRICING_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: "RxFit.ai Health Coaching",
  description:
    "AI health dashboard plus a dedicated human accountability coach. Syncs with Oura, Garmin, Apple Health, Strava, and more.",
  brand: { "@type": "Brand", name: "RxFit.ai" },
  url: `${SITE_URL}/#pricing`,
  image: `${SITE_URL}/opengraph.jpg`,
  offers: [
    {
      "@type": "Offer",
      name: "The Kickstart",
      description: "AI dashboard access, device sync for all brands, and a weekly coach check-in. Includes a 7-day free trial.",
      price: "49.00",
      priceCurrency: "USD",
      url: `${SITE_URL}/#pricing`,
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "49.00",
        priceCurrency: "USD",
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: "MON",
      },
    },
    {
      "@type": "Offer",
      name: "The Committed",
      description: "Everything in Kickstart plus priority coach access, paid annually upfront — saves $98 per year.",
      price: "490.00",
      priceCurrency: "USD",
      url: `${SITE_URL}/#pricing`,
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: "490.00",
        priceCurrency: "USD",
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: "ANN",
      },
    },
    {
      "@type": "Offer",
      name: "The Transformation",
      description: "One-time VIP program: 1-on-1 deep-dive strategy, executive wellness audit, daily live coaching, lifetime community access.",
      price: "997.00",
      priceCurrency: "USD",
      url: `${SITE_URL}/#pricing`,
      availability: "https://schema.org/InStock",
    },
  ],
};
