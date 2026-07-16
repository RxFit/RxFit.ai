/**
 * Guards the landing page's AEO structured data: FAQPage JSON-LD and
 * Product/Offer JSON-LD with the three plan prices. If a refactor drops or
 * corrupts these shapes, this fails npm test AND npm run build.
 */
import { describe, it, expect } from "vitest";
import { FAQ_ITEMS, FAQ_JSONLD, PRICING_JSONLD } from "./landing-seo";
import { PLAN_PRICING, TRIAL_COPY, jsonLdPrice } from "./stripe-constants";

describe("landing page FAQPage JSON-LD", () => {
  it("is a valid FAQPage with at least 4 Question/Answer pairs", () => {
    expect(FAQ_JSONLD["@context"]).toBe("https://schema.org");
    expect(FAQ_JSONLD["@type"]).toBe("FAQPage");
    expect(FAQ_JSONLD.mainEntity.length).toBeGreaterThanOrEqual(4);
    for (const q of FAQ_JSONLD.mainEntity) {
      expect(q["@type"]).toBe("Question");
      expect(q.name.trim().length).toBeGreaterThan(0);
      expect(q.acceptedAnswer["@type"]).toBe("Answer");
      expect(q.acceptedAnswer.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("answers the two key AEO questions: what is RxFit and what does it cost", () => {
    const questions = FAQ_ITEMS.map((it) => it.q.toLowerCase());
    expect(questions.some((q) => q.includes("what is rxfit"))).toBe(true);
    const costFaq = FAQ_ITEMS.find((it) => it.q.toLowerCase().includes("cost"));
    expect(costFaq).toBeDefined();
    // The pricing answer must quote all three current prices.
    expect(costFaq!.a).toContain("$49/month");
    expect(costFaq!.a).toContain("$490/year");
    expect(costFaq!.a).toContain("$997 one-time");
  });
});

describe("landing page Product/Offer JSON-LD", () => {
  it("is a valid Product with brand, url, and image", () => {
    expect(PRICING_JSONLD["@context"]).toBe("https://schema.org");
    expect(PRICING_JSONLD["@type"]).toBe("Product");
    expect(PRICING_JSONLD.name.length).toBeGreaterThan(0);
    expect(PRICING_JSONLD.brand.name).toBe("RxFit.ai");
    expect(PRICING_JSONLD.url).toMatch(/^https:\/\/rxfit\.ai\//);
    expect(PRICING_JSONLD.image).toMatch(/^https:\/\/rxfit\.ai\//);
  });

  it("has exactly three Offers whose prices match the plan copy ($49/mo, $490/yr, $997)", () => {
    const offers = PRICING_JSONLD.offers;
    expect(offers).toHaveLength(3);
    const byName = Object.fromEntries(offers.map((o) => [o.name, o]));
    expect(byName["The Kickstart"].price).toBe("49.00");
    expect(byName["The Committed"].price).toBe("490.00");
    expect(byName["The Transformation"].price).toBe("997.00");
    for (const o of offers) {
      expect(o["@type"]).toBe("Offer");
      expect(o.priceCurrency).toBe("USD");
      expect(o.availability).toBe("https://schema.org/InStock");
      expect(o.url).toMatch(/^https:\/\/rxfit\.ai\//);
      expect(o.description.length).toBeGreaterThan(0);
    }
    // Recurring plans carry billing-period detail for rich results.
    expect(byName["The Kickstart"].priceSpecification?.unitCode).toBe("MON");
    expect(byName["The Committed"].priceSpecification?.unitCode).toBe("ANN");
    expect(byName["The Committed"].priceSpecification?.price).toBe("490.00");
    expect(byName["The Kickstart"].priceSpecification?.price).toBe("49.00");
  });
});

describe("PLAN_PRICING single source of truth", () => {
  it("keeps display strings internally consistent with the numeric amounts", () => {
    for (const tier of ["kickstart", "committed", "transformation"] as const) {
      const p = PLAN_PRICING[tier];
      expect(p.display).toBe(`$${p.amount}`);
      expect(jsonLdPrice(tier)).toBe(p.amount.toFixed(2));
    }
    expect(PLAN_PRICING.kickstart.perMonth).toBe(`${PLAN_PRICING.kickstart.display}/month`);
    expect(PLAN_PRICING.kickstart.perMonthShort).toBe(`${PLAN_PRICING.kickstart.display}/mo`);
    expect(PLAN_PRICING.committed.perYear).toBe(`${PLAN_PRICING.committed.display}/year`);
    expect(PLAN_PRICING.transformation.oneTime).toBe(`${PLAN_PRICING.transformation.display} one-time`);
    expect(TRIAL_COPY).toBe(`${PLAN_PRICING.kickstart.trialDays}-day free trial`);
  });

  it("drives the JSON-LD offers and the FAQ cost answer from the same values", () => {
    const byName = Object.fromEntries(PRICING_JSONLD.offers.map((o) => [o.name, o]));
    expect(byName[PLAN_PRICING.kickstart.name].price).toBe(jsonLdPrice("kickstart"));
    expect(byName[PLAN_PRICING.committed.name].price).toBe(jsonLdPrice("committed"));
    expect(byName[PLAN_PRICING.transformation.name].price).toBe(jsonLdPrice("transformation"));

    const costFaq = FAQ_ITEMS.find((it) => it.q.toLowerCase().includes("cost"))!;
    expect(costFaq.a).toContain(PLAN_PRICING.kickstart.perMonth);
    expect(costFaq.a).toContain(PLAN_PRICING.committed.perYear);
    expect(costFaq.a).toContain(PLAN_PRICING.transformation.oneTime);
    expect(costFaq.a).toContain(TRIAL_COPY);
  });
});
