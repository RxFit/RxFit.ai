import { PLAN_PRICING, TRIAL_COPY } from "./stripe-constants";

/**
 * Compare-page structured data (FAQPage JSON-LD) used by
 * client/src/pages/ComparePage.tsx via the Seo jsonLd prop, and validated by
 * shared/compare-seo.test.ts + scripts/validate-seo.mjs so a refactor can't
 * silently drop it.
 */

export const COMPARE_FAQ = [
  {
    q: "Is RxFit.ai a replacement for a personal trainer?",
    a: `For most people whose main challenge is consistency, yes. RxFit gives you a real human coach who reviews your wearable data and adjusts your plan daily, for ${PLAN_PRICING.kickstart.perMonth} instead of $400–$800/month. A traditional in-person trainer is still the better choice if you need hands-on form correction or supervised injury rehab.`,
  },
  {
    q: "How is RxFit different from fitness apps like workout trackers?",
    a: "Fitness apps collect data and serve template programs, but no human ever looks at your numbers or holds you accountable. RxFit adds a dedicated human coach on top of the AI dashboard — someone who sees your sleep, recovery, and training data and messages you throughout the week.",
  },
  {
    q: "How much does RxFit cost compared to a personal trainer?",
    a: `RxFit starts at ${PLAN_PRICING.kickstart.perMonth} with a ${TRIAL_COPY}. A traditional personal trainer typically costs $400–$800/month for two to three sessions per week — roughly ten times the price for a few hours of weekly contact.`,
  },
  {
    q: "Do I need a wearable device to use RxFit?",
    a: "RxFit works best with a wearable or health app such as Oura, Garmin, Apple Health, or Strava, because your coach uses that data to personalize your plan. Most members already own one before joining.",
  },
];

export const COMPARE_FAQ_JSONLD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: COMPARE_FAQ.map((it) => ({
    "@type": "Question",
    name: it.q,
    acceptedAnswer: { "@type": "Answer", text: it.a },
  })),
};
