/**
 * Guards the /compare page's AEO structured data: FAQPage JSON-LD quoting the
 * current plan pricing. If a refactor drops or corrupts this shape, this
 * fails npm test AND npm run build.
 */
import { describe, it, expect } from "vitest";
import { COMPARE_FAQ, COMPARE_FAQ_JSONLD } from "./compare-seo";
import { PLAN_PRICING, TRIAL_COPY } from "./stripe-constants";

describe("compare page FAQPage JSON-LD", () => {
  it("is a valid FAQPage with at least 4 Question/Answer pairs", () => {
    expect(COMPARE_FAQ_JSONLD["@context"]).toBe("https://schema.org");
    expect(COMPARE_FAQ_JSONLD["@type"]).toBe("FAQPage");
    expect(COMPARE_FAQ_JSONLD.mainEntity.length).toBeGreaterThanOrEqual(4);
    for (const q of COMPARE_FAQ_JSONLD.mainEntity) {
      expect(q["@type"]).toBe("Question");
      expect(q.name.trim().length).toBeGreaterThan(0);
      expect(q.acceptedAnswer["@type"]).toBe("Answer");
      expect(q.acceptedAnswer.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("mirrors COMPARE_FAQ one-to-one", () => {
    expect(COMPARE_FAQ_JSONLD.mainEntity).toHaveLength(COMPARE_FAQ.length);
    COMPARE_FAQ.forEach((it, i) => {
      expect(COMPARE_FAQ_JSONLD.mainEntity[i].name).toBe(it.q);
      expect(COMPARE_FAQ_JSONLD.mainEntity[i].acceptedAnswer.text).toBe(it.a);
    });
  });

  it("answers the key comparison questions: trainer replacement and cost", () => {
    const questions = COMPARE_FAQ.map((it) => it.q.toLowerCase());
    expect(questions.some((q) => q.includes("personal trainer"))).toBe(true);
    const costFaq = COMPARE_FAQ.find((it) => it.q.toLowerCase().includes("cost"));
    expect(costFaq).toBeDefined();
    // Price/trial copy must derive from the live constants, not stale literals.
    expect(costFaq!.a).toContain(PLAN_PRICING.kickstart.perMonth);
    expect(costFaq!.a).toContain(TRIAL_COPY);
  });
});
