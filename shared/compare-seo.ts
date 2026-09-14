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
    a: "Fitness apps and workout trackers such as Strava typically record activity or serve template programs, but they do not provide a person who reviews your full picture and follows up when consistency drops. RxFit combines an AI dashboard with a dedicated human coach who sees your sleep, recovery, and training trends, helps translate them into practical adjustments, and messages you throughout the week. The difference is not just more data; it is ongoing interpretation, judgment, and accountability based on the data you already collect.",
  },
  {
    q: "How much does RxFit cost compared to a personal trainer?",
    a: `RxFit starts at ${PLAN_PRICING.kickstart.perMonth} with a ${TRIAL_COPY}. A traditional personal trainer typically costs $400–$800/month for two to three sessions per week — roughly ten times the price for a few hours of weekly contact.`,
  },
  {
    q: "Do I need a wearable device to use RxFit?",
    a: "RxFit works best with a wearable or health app such as Oura, Garmin, Apple Health, or Strava because sleep, recovery, activity, and training data give your coach more context for personalizing recommendations. Most members already use one before joining. Without connected biometric data, your coach can still work from the goals, habits, schedule, and progress information you share, but the dashboard will have less objective data to analyze and daily adjustments may be less precise.",
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
