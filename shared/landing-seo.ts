import { SITE_URL } from "./site";
import { PLAN_PRICING, TRIAL_COPY, jsonLdPrice } from "./stripe-constants";

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
    a: `RxFit has three plans: ${PLAN_PRICING.kickstart.name} at ${PLAN_PRICING.kickstart.perMonth} with a ${TRIAL_COPY} (AI dashboard, device sync, weekly coach check-in), ${PLAN_PRICING.committed.name} at ${PLAN_PRICING.committed.perYear} paid upfront (saves ${PLAN_PRICING.committed.savings} and adds priority coach access), and ${PLAN_PRICING.transformation.name} at ${PLAN_PRICING.transformation.oneTime} (1-on-1 deep-dive coaching and an executive wellness audit).`,
  },
  {
    q: "Is there a free trial, and can I cancel anytime?",
    a: `Yes. ${PLAN_PRICING.kickstart.name} plan includes a ${TRIAL_COPY}, and you can cancel your subscription at any time from the billing portal — no long-term contract or cancellation fee.`,
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
      name: PLAN_PRICING.kickstart.name,
      description: `AI dashboard access, device sync for all brands, and a weekly coach check-in. Includes a ${TRIAL_COPY}.`,
      price: jsonLdPrice("kickstart"),
      priceCurrency: "USD",
      url: `${SITE_URL}/#pricing`,
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: jsonLdPrice("kickstart"),
        priceCurrency: "USD",
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: "MON",
      },
    },
    {
      "@type": "Offer",
      name: PLAN_PRICING.committed.name,
      description: `Everything in Kickstart plus priority coach access, paid annually upfront — saves ${PLAN_PRICING.committed.savings} per year.`,
      price: jsonLdPrice("committed"),
      priceCurrency: "USD",
      url: `${SITE_URL}/#pricing`,
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        price: jsonLdPrice("committed"),
        priceCurrency: "USD",
        billingDuration: 1,
        billingIncrement: 1,
        unitCode: "ANN",
      },
    },
    {
      "@type": "Offer",
      name: PLAN_PRICING.transformation.name,
      description: "One-time VIP program: 1-on-1 deep-dive strategy, executive wellness audit, daily live coaching, lifetime community access.",
      price: jsonLdPrice("transformation"),
      priceCurrency: "USD",
      url: `${SITE_URL}/#pricing`,
      availability: "https://schema.org/InStock",
    },
  ],
};
