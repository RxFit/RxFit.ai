/**
 * Integration-style test for the draft-retry feedback loop: forces the first
 * LLM draft to fail validation and asserts the SECOND request's prompt
 * contains the first attempt's exact validation errors.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();

vi.mock("openai", () => ({
  default: class OpenAI {
    chat = { completions: { create: createMock } };
  },
}));

vi.mock("./storage", () => ({
  storage: {
    seedKeywordThemes: vi.fn().mockResolvedValue(undefined),
    getNextKeywordTheme: vi
      .fn()
      .mockResolvedValue({ id: 1, theme: "hrv training", pillar: "recovery" }),
    getPublishedGeneratedPosts: vi.fn().mockResolvedValue([]),
    createGeneratedPost: vi
      .fn()
      .mockImplementation(async (p: any) => ({ ...p, id: 1 })),
    markKeywordThemeUsed: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("./exaClient", () => ({
  researchTheme: vi.fn().mockResolvedValue([
    { title: "Source A", url: "https://example.com/a", text: "HRV research text." },
    { title: "Source B", url: "https://example.com/b", text: "More research text." },
  ]),
}));

vi.mock("./heroImage", () => ({
  generateAndStoreHeroImage: vi.fn().mockResolvedValue(null),
}));

vi.mock("./emailService", () => ({
  sendPostPublishedEmail: vi.fn().mockResolvedValue(undefined),
  sendPostFailureEmail: vi.fn().mockResolvedValue(undefined),
}));

function makeBody(): string {
  const para = "Wearable data only helps when someone turns it into daily action and accountability. ".repeat(15);
  return [
    "## Why HRV matters",
    para,
    "See [our blog](/blog) and [pricing](/#pricing) plus [compare options](/compare).",
    "## Reading the trend",
    para,
    "Backed by [research](https://example.com/a) and [more research](https://example.com/b).",
    "## Turning data into action",
    para,
    "## Next steps",
    para,
  ].join("\n\n");
}

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    title: "How to Train With HRV",
    seoTitle: "HRV Training Guide",
    slug: "hrv-training-guide-test",
    description:
      "Learn how to use heart rate variability to guide daily training decisions, with practical thresholds and a simple morning routine.",
    tags: ["hrv", "recovery", "training"],
    targetKeyword: "hrv training",
    recommendedPlan: "kickstart",
    tldr: "HRV tells you when to push and when to rest. Use trends, not single readings.",
    keyTakeaways: ["One", "Two", "Three", "Four"],
    bodyMarkdown: makeBody(),
    faq: [
      { q: "Q1?", a: "A1." },
      { q: "Q2?", a: "A2." },
      { q: "Q3?", a: "A3." },
      { q: "Q4?", a: "A4." },
    ],
    ...overrides,
  };
}

describe("generateAndPublishPost retry feedback", () => {
  beforeEach(() => {
    createMock.mockReset();
    vi.clearAllMocks();
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY = "test-key";
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = "https://example.com/v1";
  });

  it("includes the first attempt's validation errors in the retry prompt", async () => {
    // First draft: invalid (empty title, bad plan). Second draft: valid.
    createMock
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify(makeDraft({ title: "", recommendedPlan: "nope" })),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(makeDraft()) } }],
      });

    const { generateAndPublishPost } = await import("./blogGenerator");
    const post = await generateAndPublishPost();
    expect(post.slug).toBe("hrv-training-guide-test");

    expect(createMock).toHaveBeenCalledTimes(2);
    const firstPrompt = createMock.mock.calls[0][0].messages[0].content as string;
    const retryPrompt = createMock.mock.calls[1][0].messages[0].content as string;

    // The first prompt carries no rejection feedback.
    expect(firstPrompt).not.toContain("REJECTED");

    // The retry prompt contains the exact validation errors from attempt one.
    expect(retryPrompt).toContain("REJECTED");
    expect(retryPrompt).toContain("missing or empty field: title");
    expect(retryPrompt).toContain("invalid recommendedPlan: nope");
  });

  it("fails loudly when both drafts are rejected: rethrows, emails the owner, publishes nothing", async () => {
    const badDraft = () => ({
      choices: [
        {
          message: {
            content: JSON.stringify(makeDraft({ title: "", recommendedPlan: "nope" })),
          },
        },
      ],
    });
    createMock.mockResolvedValueOnce(badDraft()).mockResolvedValueOnce(badDraft());

    const { generateAndPublishPost } = await import("./blogGenerator");
    const { sendPostFailureEmail } = await import("./emailService");
    const { storage } = await import("./storage");

    await expect(generateAndPublishPost()).rejects.toThrow(
      /failed validation twice[\s\S]*missing or empty field: title[\s\S]*invalid recommendedPlan: nope/,
    );

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(sendPostFailureEmail).toHaveBeenCalledTimes(1);
    const [stage, error] = vi.mocked(sendPostFailureEmail).mock.calls[0];
    expect(stage).toBe("validation");
    expect(String(error)).toContain("failed validation twice");
    expect(storage.createGeneratedPost).not.toHaveBeenCalled();
    expect(storage.markKeywordThemeUsed).not.toHaveBeenCalled();
  });
});
