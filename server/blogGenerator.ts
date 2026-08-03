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
import {
  checkExternalLinks,
  linkHealthErrors,
  linkHealthWarnings,
  type LinkCheckOptions,
} from "./linkHealth";
import { sendPostPublishedEmail, sendPostFailureEmail } from "./emailService";
import { appendAlertToSheet } from "./sheetsService";
import { generateAndStoreHeroImage } from "./heroImage";
import {
  extractToc,
  computeReadingMinutes,
  countInternalLinks,
  slugifyHeading,
  SEED_KEYWORD_THEMES,
} from "@shared/generated-blog";
import type { GeneratedPost, FaqItem } from "@shared/schema";
import { STATIC_ROUTES } from "@shared/site";
import { PLAN_PRICING, TRIAL_COPY } from "@shared/stripe-constants";

const AUTHOR = "RxFit.ai Research Team";
const AUTHOR_BIO =
  "The RxFit.ai Research Team turns peer-reviewed studies and wearable-data trends into practical coaching guidance. Every post is reviewed against our coaching methodology: AI insight, human accountability.";

/** Lazily construct the LLM client so importing this module never crashes the
 *  server when credentials are absent — the pipeline fails loudly at run time
 *  instead (failure email + rethrow). */
export function getOpenAI(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) {
    throw new Error(
      "OpenAI credentials missing (AI_INTEGRATIONS_OPENAI_API_KEY / AI_INTEGRATIONS_OPENAI_BASE_URL) — install the Replit OpenAI integration.",
    );
  }
  return new OpenAI({ apiKey, baseURL });
}

export interface ExistingPostRef {
  slug: string;
  title: string;
  pillar?: string;
  tags?: string[];
}

/* ------------------------------------------------------------------ */
/* Topical relevance ranking for internal-link candidates               */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "for", "with", "your",
  "how", "why", "what", "is", "are", "on", "vs", "you", "our", "at", "by",
]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

/**
 * Score existing posts by topical relevance to a theme/pillar/tags and return
 * them most-relevant-first. Pure; used for both prompt-candidate selection and
 * post-publish interlinking.
 */
export function rankPostsByRelevance(
  target: { theme: string; pillar?: string; tags?: string[] },
  posts: ExistingPostRef[],
): ExistingPostRef[] {
  const targetTokens = tokenize(`${target.theme} ${(target.tags ?? []).join(" ")}`);
  const scored = posts.map((p) => {
    const postTokens = tokenize(`${p.title} ${p.slug.replace(/-/g, " ")} ${(p.tags ?? []).join(" ")}`);
    let overlap = 0;
    targetTokens.forEach((t) => {
      if (postTokens.has(t)) overlap++;
    });
    let score = overlap * 2;
    if (target.pillar && p.pillar && target.pillar === p.pillar) score += 1;
    return { post: p, score };
  });
  return scored.sort((a, b) => b.score - a.score).map((s) => s.post);
}

/** Internal-link cap: ~5 links per 1,000 words, floor of 5. */
export function maxInternalLinks(wordCount: number): number {
  return Math.max(5, Math.ceil((wordCount / 1000) * 5));
}

/** Frontmatter of the build-time MDX posts (for dedupe + internal link targets). */
export function getStaticPostRefs(): ExistingPostRef[] {
  const blogDir = path.resolve(process.cwd(), "content", "blog");
  if (!fs.existsSync(blogDir)) return [];
  return fs
    .readdirSync(blogDir)
    .filter((f) => f.endsWith(".mdx") && !f.startsWith("_"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(blogDir, file), "utf-8");
      const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      const data: Record<string, any> = m ? (parseYaml(m[1]) ?? {}) : {};
      return {
        slug: (data.slug as string) || file.replace(/\.mdx$/, ""),
        title: (data.title as string) || file,
        pillar: (data.pillar as string) || undefined,
        tags: Array.isArray(data.tags) ? (data.tags as string[]) : undefined,
      };
    });
}

export interface LlmPostDraft {
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

  // Most topically relevant posts first so the model links to related content,
  // not just whatever happens to be at the top of a flat list.
  const ranked = rankPostsByRelevance({ theme, pillar }, existingPosts);
  const existing = ranked
    .map((p, i) => `- "${p.title}" → /blog/${p.slug}${i < 5 ? "  (MOST RELEVANT)" : ""}`)
    .join("\n");

  return `You are the senior content writer for RxFit.ai, a HealthTech SaaS that pairs an AI health dashboard (syncs wearables like Apple Watch, Oura, Whoop, Garmin) with a real human accountability coach. Brand voice: authoritative but warm, evidence-driven, practical, zero fluff. Audience: busy professionals 30-55 who own wearables but struggle with consistency.

TASK: Write one complete, publication-ready blog post on the keyword theme: "${theme}" (content pillar: ${pillar}).

RXFIT PRICING FACTS (if you mention RxFit pricing anywhere, use these EXACT current numbers — never invent or round prices): ${PLAN_PRICING.kickstart.name} is ${PLAN_PRICING.kickstart.perMonth} with a ${TRIAL_COPY}; ${PLAN_PRICING.committed.name} is ${PLAN_PRICING.committed.perYear} (saves ${PLAN_PRICING.committed.savings} vs monthly); ${PLAN_PRICING.transformation.name} is ${PLAN_PRICING.transformation.oneTime}.

RESEARCH SOURCES (use these for facts and statistics; cite claims inline as markdown links to the source URL):
${sources}

EXISTING POSTS on the site, ordered by topical relevance to this theme (do NOT duplicate their angle; DO link to at least 2 of them — prefer the ones marked MOST RELEVANT — plus link to /#pricing or /blog where natural; keep internal links to at most ~5 per 1,000 words):
${existing}

REQUIREMENTS:
- 1200-1800 words in the markdown body.
- Structure the body with 4-6 H2 sections ("## Heading"). Use H3 sparingly. NO H1 in the body. Do not repeat the title in the body. Do not include TL;DR, key takeaways, or FAQ in the body — those are separate fields.
- At least 3 internal links in the body (markdown links starting with "/", e.g. [our AI coaching guide](/blog/some-slug), [pricing](/#pricing)).
- CRITICAL: every internal /blog/... link MUST use a slug copied EXACTLY from the EXISTING POSTS list above. Never invent or guess a slug. Other internal links must be one of: ${STATIC_ROUTES.join(", ")} (fragments like /#pricing are fine). Posts with made-up links are rejected.
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

/**
 * Feedback message appended to the retry prompt when the first draft fails
 * validation, so the model knows exactly what to fix instead of guessing.
 * Exported for testing.
 */
export function buildRetryFeedback(errors: string[]): string {
  return `IMPORTANT — YOUR PREVIOUS DRAFT WAS REJECTED. It failed validation for these exact reasons:
${errors.map((e) => `- ${e}`).join("\n")}

Write a fresh draft that fixes EVERY one of these problems while still meeting all of the original requirements above. This is your final attempt; if any of these issues remain, the post will not be published.`;
}

async function draftPost(
  theme: string,
  pillar: string,
  research: ExaResult[],
  existingPosts: ExistingPostRef[],
  previousErrors?: string[],
): Promise<LlmPostDraft> {
  let prompt = buildPrompt(theme, pillar, research, existingPosts);
  if (previousErrors && previousErrors.length > 0) {
    prompt += `\n\n${buildRetryFeedback(previousErrors)}`;
  }
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-5.4",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("LLM returned an empty response");
  return JSON.parse(content) as LlmPostDraft;
}

/** Root-relative link targets in the markdown body (mirrors scripts/validate-seo.mjs). */
export function extractInternalLinks(body: string): string[] {
  return Array.from(body.matchAll(/\]\(\s*(\/[^)\s]*)\s*(?:"[^"]*"\s*)?\)/g), (m) => m[1]);
}

export function validateDraft(draft: LlmPostDraft, existingSlugs: Set<string>): string[] {
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
    const linkCap = maxInternalLinks(words);
    if (internal > linkCap) {
      errors.push(`body has ${internal} internal links (max ${linkCap} for ${words} words)`);
    }
    // Defense in depth: reject any markdown link/image whose URL uses a scheme
    // other than http(s)/mailto/tel (e.g. javascript:, data:) before publishing.
    const urlMatches = Array.from(draft.bodyMarkdown.matchAll(/\]\(\s*<?([^)\s>]+)/g));
    for (const m of urlMatches) {
      const url = m[1].trim();
      if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(https?:|mailto:|tel:)/i.test(url)) {
        errors.push(`body contains link with disallowed URL scheme: ${url.slice(0, 60)}`);
      }
    }
    // Every internal link must resolve to a real page: a static route, an
    // existing blog post slug, or an asset path — otherwise readers hit 404s.
    for (const raw of extractInternalLinks(draft.bodyMarkdown)) {
      const target = raw.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
      if (target.startsWith("/blog-heroes/") || /\.[a-z0-9]+$/i.test(target)) continue;
      const blogMatch = target.match(/^\/blog\/([^/]+)$/);
      if (blogMatch) {
        if (!existingSlugs.has(blogMatch[1])) {
          errors.push(`body links to unknown blog post: ${raw} (no post with slug "${blogMatch[1]}")`);
        }
        continue;
      }
      if (!(STATIC_ROUTES as readonly string[]).includes(target)) {
        errors.push(`body links to unknown route: ${raw} (not a static route or /blog/:slug)`);
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

/* ------------------------------------------------------------------ */
/* Post-publish interlinking: link the new post from older DB posts     */
/* ------------------------------------------------------------------ */

/**
 * Build the markdown appended to an older post that links the new one.
 * Escapes markdown-significant characters in the title so LLM-authored titles
 * can never alter link structure.
 */
/**
 * validateDraft plus outbound link health.
 *
 * Kept separate from validateDraft so that function stays synchronous and
 * pure — it is also used for retry feedback and by the refresher, and neither
 * should be forced to await the network.
 *
 * Both sets of errors are returned together so a single retry can fix
 * everything at once rather than surfacing structural problems first and link
 * problems only on the next pass. Transient link failures are logged but never
 * returned: a briefly-unreachable publisher must not block a correct post.
 */
export async function validateDraftIncludingLinks(
  draft: LlmPostDraft,
  existingSlugs: Set<string>,
  opts: LinkCheckOptions = {},
): Promise<string[]> {
  const errors = validateDraft(draft, existingSlugs);
  const results = await checkExternalLinks(draft.bodyMarkdown ?? "", opts);

  const warnings = linkHealthWarnings(results);
  if (warnings.length > 0) {
    console.warn(
      `[blog-publisher] Non-blocking link warnings:\n- ${warnings.join("\n- ")}`,
    );
  }

  return [...errors, ...linkHealthErrors(results)];
}

export function buildRelatedReadingAppendix(newPost: { slug: string; title: string }): string {
  const safeTitle = newPost.title.replace(/[\[\]()\\]/g, "").trim();
  return `\n\n**Related reading:** [${safeTitle}](/blog/${newPost.slug})`;
}

/**
 * Add a link to the freshly published post from 1-3 topically related older
 * DB posts, skipping any that already link to it or are at their link cap.
 * Only touches bodyMarkdown (no heading changes, so toc stays valid).
 */
async function linkNewPostFromOlderPosts(
  newPost: GeneratedPost,
  olderDbPosts: GeneratedPost[],
): Promise<void> {
  const candidates = rankPostsByRelevance(
    { theme: newPost.keywordTheme, pillar: newPost.pillar, tags: newPost.tags },
    olderDbPosts
      .filter((p) => p.slug !== newPost.slug)
      .map((p) => ({ slug: p.slug, title: p.title, pillar: p.pillar, tags: p.tags })),
  ).slice(0, 3);

  const bySlug = new Map(olderDbPosts.map((p) => [p.slug, p]));
  for (const ref of candidates) {
    const older = bySlug.get(ref.slug);
    if (!older) continue;
    if (older.bodyMarkdown.includes(`(/blog/${newPost.slug})`)) continue;
    const words = older.bodyMarkdown.split(/\s+/).filter(Boolean).length;
    if (countInternalLinks(older.bodyMarkdown) >= maxInternalLinks(words)) continue;
    const updatedBody = older.bodyMarkdown.trimEnd() + buildRelatedReadingAppendix(newPost);
    await storage.updateGeneratedPost(older.id, {
      bodyMarkdown: updatedBody,
      readingMinutes: computeReadingMinutes(updatedBody),
    });
    console.log(`[blog-publisher] Linked new post from /blog/${older.slug}`);
  }
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
      ...dbPosts.map((p) => ({ slug: p.slug, title: p.title, pillar: p.pillar, tags: p.tags })),
    ];
    const existingSlugs = new Set(existingPosts.map((p) => p.slug));

    let draft = await draftPost(theme.theme, theme.pillar, research, existingPosts);

    stage = "validation";
    let errors = await validateDraftIncludingLinks(draft, existingSlugs);
    if (errors.length > 0) {
      console.warn(`[blog-publisher] Draft failed validation, retrying once:\n- ${errors.join("\n- ")}`);
      stage = "llm-draft-retry";
      draft = await draftPost(theme.theme, theme.pillar, research, existingPosts, errors);
      stage = "validation";
      errors = await validateDraftIncludingLinks(draft, existingSlugs);
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

    stage = "interlinking";
    // Best-effort: link the new post FROM topically related older DB posts so
    // it isn't orphaned. A failure here must never roll back the publish.
    try {
      await linkNewPostFromOlderPosts(post, dbPosts);
    } catch (linkError) {
      console.error("[blog-publisher] Interlinking failed (post is still live):", linkError);
    }

    stage = "notification";
    try {
      await sendPostPublishedEmail(post);
    } catch (emailError) {
      // The post is live; a notification failure should not roll it back.
      console.error("[blog-publisher] Post published but notification email failed:", emailError);
      // Low-severity fallback alert: append a row to the "RxFit Alerts" sheet
      // tab (separate google-sheet connector) so a broken Gmail connector
      // becomes visible instead of posts silently appearing. Best-effort —
      // a sheet failure must not turn a notification hiccup into a pipeline
      // failure either.
      try {
        const message =
          emailError instanceof Error ? emailError.message : String(emailError);
        await appendAlertToSheet({
          title: `Blog post published but the notification email FAILED — /blog/${post.slug}`,
          message: `The post is LIVE at /blog/${post.slug}. Only the "post published" email could not be sent (check the Gmail connector). Error: ${message}`,
        });
        console.log("[blog-publisher] Notification-failure alert row appended to Google Sheet");
      } catch (sheetError) {
        console.error(
          "[blog-publisher] Notification email failed AND the sheet alert also failed — publish notifications are silently broken:",
          sheetError,
        );
      }
    }

    return post;
  } catch (error) {
    console.error(`[blog-publisher] FAILED at stage "${stage}":`, error);
    const emailSent = await sendPostFailureEmail(stage, error);
    if (!emailSent) {
      // Gmail itself may be down — fall back to the "RxFit Alerts" sheet tab
      // (separate google-sheet connector) so the owner still finds out.
      try {
        const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}` : String(error);
        await appendAlertToSheet({
          title: `Blog auto-publish FAILED at stage "${stage}" (failure email could not be sent)`,
          message,
        });
        console.log("[blog-publisher] Fallback failure alert row appended to Google Sheet");
      } catch (sheetError) {
        console.error(
          "[blog-publisher] BOTH failure alert channels failed (Gmail email + Google Sheet):",
          sheetError,
        );
      }
    }
    throw error;
  }
}
