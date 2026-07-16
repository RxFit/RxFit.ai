import { describe, it, expect } from "vitest";
import { validateDraft, type LlmPostDraft } from "./blogGenerator";

function goodBody(): string {
  const para = "This is a sentence about wearable data and coaching consistency. ".repeat(6);
  const sections = [
    `## Why Wearable Data Matters\n\n${para.repeat(4)}\n\nSee [our guide](/blog/wearable-guide) for more.`,
    `## Turning Numbers Into Action\n\n${para.repeat(4)}\n\nCheck [pricing](/#pricing) today.`,
    `## The Role of a Human Coach\n\n${para.repeat(4)}\n\nRead [the blog](/blog) and this [study](https://example.com/study).`,
    `## Getting Started\n\n${para.repeat(4)}`,
  ];
  return sections.join("\n\n");
}

function makeDraft(overrides: Partial<LlmPostDraft> = {}): LlmPostDraft {
  return {
    title: "How Wearable Data Improves Consistency",
    seoTitle: "Wearable Data Consistency Guide",
    slug: "wearable-data-consistency",
    description:
      "Learn how to turn wearable data into consistent daily habits with an AI dashboard and a real human accountability coach behind you.",
    tags: ["wearables", "consistency", "coaching"],
    targetKeyword: "wearable data consistency",
    recommendedPlan: "kickstart",
    tldr: "Wearable data alone does not change behavior. Pairing it with human accountability does.",
    keyTakeaways: ["Takeaway one.", "Takeaway two.", "Takeaway three.", "Takeaway four."],
    bodyMarkdown: goodBody(),
    faq: [
      { q: "Q1?", a: "Answer one." },
      { q: "Q2?", a: "Answer two." },
      { q: "Q3?", a: "Answer three." },
      { q: "Q4?", a: "Answer four." },
    ],
    ...overrides,
  };
}

const noSlugs = new Set<string>();

describe("validateDraft", () => {
  it("accepts a well-formed draft", () => {
    expect(validateDraft(makeDraft(), noSlugs)).toEqual([]);
  });

  it("rejects missing required string fields", () => {
    for (const field of ["title", "description", "slug", "tldr", "bodyMarkdown"] as const) {
      const errors = validateDraft(makeDraft({ [field]: "" }), noSlugs);
      expect(errors.some((e) => e.includes(`missing or empty field: ${field}`))).toBe(true);
    }
  });

  it("rejects whitespace-only required fields", () => {
    const errors = validateDraft(makeDraft({ title: "   " }), noSlugs);
    expect(errors.some((e) => e.includes("missing or empty field: title"))).toBe(true);
  });

  it("rejects too few key takeaways", () => {
    const errors = validateDraft(makeDraft({ keyTakeaways: ["one", "two"] }), noSlugs);
    expect(errors).toContain("keyTakeaways must contain at least 3 items");
  });

  it("rejects too few or incomplete FAQ pairs", () => {
    expect(
      validateDraft(makeDraft({ faq: [{ q: "Q?", a: "A." }] }), noSlugs),
    ).toContain("faq must contain at least 4 complete q/a pairs");
    expect(
      validateDraft(
        makeDraft({
          faq: [
            { q: "Q1?", a: "A." },
            { q: "Q2?", a: "" },
            { q: "Q3?", a: "A." },
            { q: "Q4?", a: "A." },
          ],
        }),
        noSlugs,
      ),
    ).toContain("faq must contain at least 4 complete q/a pairs");
  });

  it("rejects too few tags", () => {
    expect(validateDraft(makeDraft({ tags: ["one"] }), noSlugs)).toContain(
      "tags must contain at least 2 items",
    );
  });

  it("rejects a body with fewer than 3 H2 sections", () => {
    const body = `## Only Section\n\n${"word ".repeat(800)}\n\n[a](/blog/x) [b](/blog/y) [c](/#pricing)`;
    const errors = validateDraft(makeDraft({ bodyMarkdown: body }), noSlugs);
    expect(errors.some((e) => e.includes("H2 sections"))).toBe(true);
  });

  it("rejects a body shorter than 700 words", () => {
    const body = `## A\n\nshort body\n\n## B\n\nstill short\n\n## C\n\n[a](/blog/x) [b](/blog/y) [c](/#pricing)`;
    const errors = validateDraft(makeDraft({ bodyMarkdown: body }), noSlugs);
    expect(errors.some((e) => e.includes("words (need >= 700)"))).toBe(true);
  });

  it("rejects a body with fewer than 3 internal links", () => {
    const body = `## A\n\n${"word ".repeat(300)}\n\n## B\n\n${"word ".repeat(300)}\n\n## C\n\n${"word ".repeat(300)}\n\n[one](/blog/x) [ext](https://example.com)`;
    const errors = validateDraft(makeDraft({ bodyMarkdown: body }), noSlugs);
    expect(errors.some((e) => e.includes("internal links (need >= 3)"))).toBe(true);
  });

  it("rejects javascript: and data: links in the body", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox"]) {
      const body = `${goodBody()}\n\nClick [here](${bad}) now.`;
      const errors = validateDraft(makeDraft({ bodyMarkdown: body }), noSlugs);
      expect(errors.some((e) => e.includes("disallowed URL scheme"))).toBe(true);
    }
  });

  it("allows http, https, mailto, tel, and relative links", () => {
    const body = `${goodBody()}\n\n[a](https://x.com) [b](http://x.com) [c](mailto:hi@x.com) [d](tel:+15551234) [e](/blog) [f](#anchor)`;
    expect(validateDraft(makeDraft({ bodyMarkdown: body }), noSlugs)).toEqual([]);
  });

  it("rejects a description outside 100-180 chars", () => {
    expect(
      validateDraft(makeDraft({ description: "too short" }), noSlugs).some((e) =>
        e.includes("chars (want 100-180)"),
      ),
    ).toBe(true);
    expect(
      validateDraft(makeDraft({ description: "x".repeat(200) }), noSlugs).some((e) =>
        e.includes("chars (want 100-180)"),
      ),
    ).toBe(true);
  });

  it("rejects an invalid recommendedPlan", () => {
    const errors = validateDraft(makeDraft({ recommendedPlan: "platinum" }), noSlugs);
    expect(errors.some((e) => e.includes("invalid recommendedPlan"))).toBe(true);
  });

  it("rejects a duplicate slug (after slugification)", () => {
    const existing = new Set(["wearable-data-consistency"]);
    const errors = validateDraft(makeDraft(), existing);
    expect(errors.some((e) => e.includes("slug already exists"))).toBe(true);

    const errors2 = validateDraft(makeDraft({ slug: "Wearable Data Consistency" }), existing);
    expect(errors2.some((e) => e.includes("slug already exists"))).toBe(true);
  });

  it("collects multiple errors at once", () => {
    const errors = validateDraft(
      makeDraft({ title: "", tags: [], recommendedPlan: "nope", bodyMarkdown: "## A\n\ntiny" }),
      noSlugs,
    );
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });
});
