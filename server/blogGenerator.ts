/**
 * AI blog auto-publisher pipeline: pick the next keyword theme from the
 * rotating queue → research it with Exa → write a post with the LLM
 * (Replit-managed OpenAI access) → validate → publish to the DB (live
 * immediately, no redeploy) → notify the owner via Gmail.
 *
 * Fails loudly: any error sends a failure email and rethrows.
 */
import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { parse as parseYaml } from "yaml";
import { storage } from "./storage";
import { researchTheme, type ExaResult } from "./exaClient";
import { sendPostPublishedEmail, sendPostFailureEmail } from "./emailService";
import { generateAndStoreHeroImage } from "./heroImage";
import {
  extractToc,
  computeReadingMinutes,
  countInternalLinks,
  slugifyHeading,
  SEED_KEYWORD_THEMES,
} from "@shared/generated-blog";
import type { GeneratedPost, FaqItem } from "@shared/schema";

const AUTHOR = "RxFit.ai Research Team";
const AUTHOR_BIO =
  "The RxFit.ai Research Team turns peer-reviewed studies and wearable-data trends into practical coaching guidance. Every post is reviewed against our coaching methodology: AI insight, human accountability.";

/** Lazily construct the LLM client so importing this module never crashes the
 *  server when credentials are absent — the pipeline fails loudly at run time
 *  instead (failure email + rethrow). */
function getOpenAI(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error(
      "OpenAI credentials missing (AI_INTEGRATIONS_OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_BASE_URL) — install the Replit OpenAI integration.",
    );
  }
  return new OpenAI({ apiKey, baseURL });
}

interface ExistingPostRef {
  slug: string;
  title: string;
}

/** Frontmatter of the build-time MDX posts (for dedupe + internal link targets). */
function getStaticPostRefs(): ExistingPostRef[] {
  const blogDir = path.resolve(process.cwd(), "content", "blog");
  if (!fs.existsSync(blogDir)) return [];
  return fs
    .readdirSync(blogDir)
    .filter((f) => f.endsWith(".mdx") && !f.startsWith("_"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(blogDir, file), "utf-8");
      const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const data: Record<string, any> = m ? (parseYaml(m[1]) ?? {}) : {};
      return { slug: (data.slug as string) || file.replace(/\.mdx$/, ""), title: (data.title as string) || file };
    });
}

interface LlmPostDraft {
  title: string;
  seoTitle: string;
  slug: string;
  description: string;
  tags: string[];
  targetKeyword: string;
  recommendedPlan: string;
  tldr: string;
  keyTakeaways: string[];
  bodyMarkdown: string;
  faq: FaqItem[];
}

function buildPrompt(
  theme: string,
  pillar: string,
  research: ExaResult[],
  existingPosts: ExistingPostRef[],
): string {
  const sources = research
    .map(
      (r, i) =>
        `SOURCE ${i + 1}: ${r.title}\nURL: ${r.url}${r.publishedDate ? `\nPublished: ${r.publishedDate}` : ""}\nEXCERPT:\n${r.text.slice(0, 2000)}`,
    )
    .join("\n\n---\n\n");

  const existing = existingPosts.map((p) => `- "${p.title}" → /blog/${p.slug}`).join("\n");

  return `You are the senior content writer for RxFit.ai, a HealthTech SaaS that pairs an AI health dashboard (syncs wearables like Apple Watch, Oura, Whoop, Garmin) with a real human accountability coach. Brand voice: authoritative but warm, evidence-driven, practical, zero fluff. Audience: busy professionals 30-55 who own wearables but struggle with consistency.

TASK: Write one complete, publication-ready blog post on the keyword theme: "${theme}" (content pillar: ${pillar}).

RESEARCH SOURCES (use these for facts and statistics; cite claims inline as markdown links to the source URL):
${sources}

EXISTING POSTS on the site (do NOT duplicate their angle; DO link to at least 2 of them as internal links, plus link to /#pricing or /blog where natural):
${existing}

REQUIREMENTS:
- 1200-1800 words in the markdown body.
- Structure the body with 4-6 H2 sections ("## Heading"). Use H3 sparingly. NO H1 in the body. Do not repeat the title in the body. Do not include TL;DR, key takeaways, or FAQ in the body — those are separate fields.
- At least 3 internal links in the body (markdown links starting with "/", e.g. [our AI coaching guide](/blog/some-slug), [pricing](/#pricing)).
- At least 2 external citation links to the research source URLs.
- Use short paragraphs, bolded key phrases, and occasional bulleted lists. No raw HTML, no images, no tables.
- End the body with a short section that naturally leads the reader toward trying RxFit.ai.
- description: 140-160 characters, compelling meta description with the target keyword.
- slug: lowercase-kebab-case, 3-7 words, keyword-first.
- tags: 3-5 short topical tags.
- recommendedPlan: one of "kickstart", "committed", "transformation" — pick what fits the reader intent.
- tldr: 2-3 sentence summary (plain text).
- keyTakeaways: 4-5 punchy one-sentence takeaways.
- faq: 4-6 question/answer pairs (each answer 2-4 sentences, plain text) targeting People-Also-Ask style queries about the theme.

Respond with ONLY a JSON object with exactly these keys:
{
  "title": string,
  "seoTitle": string (<= 60 chars, includes target keyword),
  "slug": string,
  "description": string,
  "tags": string[],
  "targetKeyword": string,
  "recommendedPlan": "kickstart" | "committed" | "transformation",
  "tldr": string,
  "keyTakeaways": string[],
  "bodyMarkdown": string,
  "faq": [{ "q": string, "a": string }]
}`;
}

async function draftPost(
  theme: string,
  pillar: string,
  research: ExaResult[],
  existingPosts: ExistingPostRef[],
): Promise<LlmPostDraft> {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-5.4",
    messages: [{ role: "user", content: buildPrompt(theme, pillar, research, existingPosts) }],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("LLM returned an empty response");
  return JSON.parse(content) as LlmPostDraft;
}

function validateDraft(draft: LlmPostDraft, existingSlugs: Set<string>): string[] {
  const errors: string[] = [];
  const required: (keyof LlmPostDraft)[] = [
    "title",
    "description",
    "slug",
    "tldr",
    "bodyMarkdown",
  ];
  for (const field of required) {
    if (!draft[field] || typeof draft[field] !== "string" || !(draft[field] as string).trim()) {
      errors.push(`missing or empty field: ${field}`);
    }
  }
  if (!Array.isArray(draft.keyTakeaways) || draft.keyTakeaways.length < 3) {
    errors.push("keyTakeaways must contain at least 3 items");
  }
  if (
    !Array.isArray(draft.faq) ||
    draft.faq.length < 4 ||
    draft.faq.some((f) => !f?.q?.trim() || !f?.a?.trim())
  ) {
    errors.push("faq must contain at least 4 complete q/a pairs");
  }
  if (!Array.isArray(draft.tags) || draft.tags.length < 2) {
    errors.push("tags must contain at least 2 items");
  }
  if (draft.bodyMarkdown) {
    const h2Count = (draft.bodyMarkdown.match(/^##\s+/gm) || []).length;
    if (h2Count < 3) errors.push(`body has only ${h2Count} H2 sections (need >= 3)`);
    const words = draft.bodyMarkdown.split(/\s+/).filter(Boolean).length;
    if (words < 700) errors.push(`body is only ${words} words (need >= 700)`);
    const internal = countInternalLinks(draft.bodyMarkdown);
    if (internal < 3) errors.push(`body has only ${internal} internal links (need >= 3)`);
    // Defense in depth: reject any markdown link/image whose URL uses a scheme
    // other than http(s)/mailto/tel (e.g. javascript:, data:) before publishing.
    const urlMatches = Array.from(draft.bodyMarkdown.matchAll(/\]\(\s*<?([^)\s>]+)/g));
    for (const m of urlMatches) {
      const url = m[1].trim();
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(https?:|mailto:|tel:)/i.test(url)) {
        errors.push(`body contains link with disallowed URL scheme: ${url.slice(0, 60)}`);
      }
    }
  }
  if (draft.description && (draft.description.length < 100 || draft.description.length > 180)) {
    errors.push(`description is ${draft.description.length} chars (want 100-180)`);
  }
  if (!["kickstart", "committed", "transformation"].includes(draft.recommendedPlan)) {
    errors.push(`invalid recommendedPlan: ${draft.recommendedPlan}`);
  }
  if (draft.slug && existingSlugs.has(slugifyHeading(draft.slug))) {
    errors.push(`slug already exists: ${draft.slug}`);
  }
  return errors;
}

/**
 * Run one full generate-and-publish cycle. Returns the published post.
 * Sends a failure email and rethrows on any error.
 */
export async function generateAndPublishPost(): Promise<GeneratedPost> {
  let stage = "setup";
  try {
    await storage.seedKeywordThemes(SEED_KEYWORD_THEMES.map((t) => ({ ...t, active: true })));

    stage = "keyword-selection";
    const theme = await storage.getNextKeywordTheme();
    if (!theme) throw new Error("Keyword queue is empty — no active themes to write about");
    console.log(`[blog-publisher] Selected theme: "${theme.theme}" (${theme.pillar})`);

    stage = "exa-research";
    const research = await researchTheme(theme.theme);
    console.log(`[blog-publisher] Exa returned ${research.length} sources`);

    stage = "llm-draft";
    const staticPosts = getStaticPostRefs();
    const dbPosts = await storage.getPublishedGeneratedPosts();
    const existingPosts: ExistingPostRef[] = [
      ...staticPosts,
      ...dbPosts.map((p) => ({ slug: p.slug, title: p.title })),
    ];
    const existingSlugs = new Set(existingPosts.map((p) => p.slug));

    let draft = await draftPost(theme.theme, theme.pillar, research, existingPosts);

    stage = "validation";
    let errors = validateDraft(draft, existingSlugs);
    if (errors.length > 0) {
      console.warn(`[blog-publisher] Draft failed validation, retrying once:\n- ${errors.join("\n- ")}`);
      stage = "llm-draft-retry";
      draft = await draftPost(theme.theme, theme.pillar, research, existingPosts);
      stage = "validation";
      errors = validateDraft(draft, existingSlugs);
      if (errors.length > 0) {
        throw new Error(`Generated draft failed validation twice:\n- ${errors.join("\n- ")}`);
      }
    }

    stage = "hero-image";
    let slug = slugifyHeading(draft.slug);
    if (existingSlugs.has(slug)) slug = `${slug}-${new Date().getFullYear()}`;
    // Best-effort: a hero-image failure must never block the post itself.
    let heroImage: string | null = null;
    try {
      heroImage = await generateAndStoreHeroImage(slug, draft.title.trim(), theme.pillar);
    } catch (heroError) {
      console.error(
        `[blog-publisher] Hero image generation failed for "${slug}" — publishing without one:`,
        heroError,
      );
    }

    stage = "publish";
    const bodyMarkdown = draft.bodyMarkdown.trim();
    const toc = extractToc(bodyMarkdown);
    const readingMinutes = computeReadingMinutes(bodyMarkdown);
    const today = new Date().toISOString().slice(0, 10);

    const post = await storage.createGeneratedPost({
      slug,
      title: draft.title.trim(),
      seoTitle: draft.seoTitle?.trim() || draft.title.trim(),
      description: draft.description.trim(),
      keywordTheme: theme.theme,
      targetKeyword: draft.targetKeyword?.trim() || theme.theme,
      pillar: theme.pillar,
      tags: draft.tags.map((t) => t.trim()).filter(Boolean),
      author: AUTHOR,
      authorBio: AUTHOR_BIO,
      heroImage,
      recommendedPlan: draft.recommendedPlan,
      tldr: draft.tldr.trim(),
      keyTakeaways: draft.keyTakeaways.map((k) => k.trim()).filter(Boolean),
      bodyMarkdown,
      faq: draft.faq.map((f) => ({ q: f.q.trim(), a: f.a.trim() })),
      toc,
      readingMinutes,
      sources: research.map((r) => ({ title: r.title, url: r.url })),
      status: "published",
      date: today,
    });

    await storage.markKeywordThemeUsed(theme.id);
    console.log(`[blog-publisher] Published: /blog/${post.slug}`);

    stage = "notification";
    try {
      await sendPostPublishedEmail(post);
    } catch (emailError) {
      // The post is live; a notification failure should not roll it back.
      console.error("[blog-publisher] Post published but notification email failed:", emailError);
    }

    return post;
  } catch (error) {
    console.error(`[blog-publisher] FAILED at stage "${stage}":`, error);
    await sendPostFailureEmail(stage, error);
    throw error;
  }
}
