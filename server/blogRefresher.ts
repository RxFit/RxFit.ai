/**
 * Automated post-refresh pipeline (SEO feedback loop).
 *
 * Picks a DB-published post to improve — striking-distance posts from the
 * latest GSC snapshot first, otherwise the oldest stale post — re-researches
 * the topic with Exa, has the LLM rewrite/update the post (optimizing for the
 * striking-distance queries when present), re-validates through the same
 * safety gates as new posts, and updates the row IN PLACE. The slug (URL)
 * NEVER changes. Sets updatedDate / refreshCount / lastRefreshedAt so
 * freshness signals (JSON-LD dateModified, visible "Updated" byline, sitemap
 * lastmod) flow through automatically.
 *
 * Fails loudly: any error sends a failure email and rethrows.
 */
import { storage } from "./storage";
import { researchTheme } from "./exaClient";
import {
  getOpenAI,
  getStaticPostRefs,
  rankPostsByRelevance,
  validateDraft,
  type ExistingPostRef,
  type LlmPostDraft,
} from "./blogGenerator";
import { sendPostRefreshedEmail, sendPostFailureEmail } from "./emailService";
import { appendAlertToSheet } from "./sheetsService";
import { findStrikingDistancePosts, pickRefreshCandidate, type StrikingQuery } from "./seoFeedback";
import { extractToc, computeReadingMinutes } from "@shared/generated-blog";
import { STATIC_ROUTES } from "@shared/site";
import type { GeneratedPost } from "@shared/schema";
import {
  checkExternalLinks,
  linkHealthErrors,
  linkHealthWarnings,
  type LinkCheckOptions,
} from "./linkHealth";

function buildRefreshPrompt(
  post: GeneratedPost,
  queries: StrikingQuery[],
  research: Awaited<ReturnType<typeof researchTheme>>,
  existingPosts: ExistingPostRef[],
): string {
  const sources = research
    .map(
      (r, i) =>
        `SOURCE ${i + 1}: ${r.title}\nURL: ${r.url}${r.publishedDate ? `\nPublished: ${r.publishedDate}` : ""}\nEXCERPT:\n${r.text.slice(0, 2000)}`,
    )
    .join("\n\n---\n\n");

  const ranked = rankPostsByRelevance(
    { theme: post.keywordTheme, pillar: post.pillar, tags: post.tags },
    existingPosts.filter((p) => p.slug !== post.slug),
  );
  const existing = ranked
    .map((p, i) => `- "${p.title}" → /blog/${p.slug}${i < 5 ? "  (MOST RELEVANT)" : ""}`)
    .join("\n");

  const queryBlock =
    queries.length > 0
      ? `SEARCH PERFORMANCE DATA (Google Search Console): this post currently ranks in "striking distance" (positions 5-20) for these queries. Your PRIMARY goal is to better satisfy the intent behind them — address them directly in headings, body copy, and FAQ where natural (never keyword-stuff):
${queries.map((q) => `- "${q.query}" — position ${q.position.toFixed(1)}, ${q.impressions} impressions, ${q.clicks} clicks`).join("\n")}\n`
      : `No search-query data is available for this post. Your goal is a freshness update: modernize statistics, replace dated references, tighten weak sections, and improve clarity.\n`;

  return `You are the senior content writer for RxFit.ai, a HealthTech SaaS that pairs an AI health dashboard (syncs wearables like Apple Watch, Oura, Whoop, Garmin) with a real human accountability coach. Brand voice: authoritative but warm, evidence-driven, practical, zero fluff.

TASK: REFRESH and improve the existing blog post below. Keep its topic, angle, and overall structure recognizable — this is an update, not a new article. Improve depth, freshness, and search intent coverage.

${queryBlock}
EXISTING POST (title: "${post.title}", target keyword: "${post.targetKeyword}", pillar: ${post.pillar}):
---
${post.bodyMarkdown}
---

FRESH RESEARCH SOURCES (use for updated facts/statistics; cite claims inline as markdown links to the source URL):
${sources}

OTHER POSTS on the site, ordered by topical relevance (DO keep/add links to at least 2 of them — prefer the ones marked MOST RELEVANT; keep internal links to at most ~5 per 1,000 words):
${existing}

REQUIREMENTS:
- 1200-1800 words in the markdown body.
- 4-6 H2 sections ("## Heading"). H3 sparingly. NO H1. No TL;DR/key takeaways/FAQ inside the body — those are separate fields.
- At least 3 internal links (markdown links starting with "/"). Every /blog/... link MUST use a slug copied EXACTLY from the OTHER POSTS list. Other internal links must be one of: ${STATIC_ROUTES.join(", ")} (fragments like /#pricing are fine).
- At least 2 external citation links to the research source URLs.
- Short paragraphs, bolded key phrases, occasional bullet lists. No raw HTML, no images, no tables.
- End with a short section leading the reader toward trying RxFit.ai.
- slug: return EXACTLY "${post.slug}" — the URL must not change.
- description: 140-160 characters with the target keyword.
- tags: 3-5 short topical tags.
- recommendedPlan: one of "kickstart", "committed", "transformation".
- tldr: 2-3 sentence summary (plain text).
- keyTakeaways: 4-5 punchy one-sentence takeaways.
- faq: 4-6 q/a pairs (answers 2-4 sentences, plain text)${queries.length > 0 ? " — cover the striking-distance queries where they read like natural questions" : ""}.

Respond with ONLY a JSON object with exactly these keys:
{
  "title": string,
  "seoTitle": string (<= 60 chars, includes target keyword),
  "slug": "${post.slug}",
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

async function draftRefresh(
  post: GeneratedPost,
  queries: StrikingQuery[],
  research: Awaited<ReturnType<typeof researchTheme>>,
  existingPosts: ExistingPostRef[],
): Promise<LlmPostDraft> {
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-5.4",
    messages: [
      { role: "user", content: buildRefreshPrompt(post, queries, research, existingPosts) },
    ],
    response_format: { type: "json_object" },
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("LLM returned an empty response");
  const draft = JSON.parse(content) as LlmPostDraft;
  // The URL is immutable: never trust the model to preserve it.
  draft.slug = post.slug;
  return draft;
}

/** Validate a refresh draft: same gates as new posts, minus the own-slug uniqueness check. */
export function validateRefreshDraft(
  draft: LlmPostDraft,
  ownSlug: string,
  allSlugs: Set<string>,
): string[] {
  return validateDraft(draft, allSlugs).filter(
    (e) => !e.startsWith("slug already exists"),
  );
}

/**
 * validateRefreshDraft plus outbound link health. A refresh rewrites the whole
 * body, so it can introduce dead or staging citations exactly as a new post
 * can — the refresh path needs the same gate.
 */
export async function validateRefreshDraftIncludingLinks(
  draft: LlmPostDraft,
  ownSlug: string,
  allSlugs: Set<string>,
  opts: LinkCheckOptions = {},
): Promise<string[]> {
  const errors = validateRefreshDraft(draft, ownSlug, allSlugs);
  const results = await checkExternalLinks(draft.bodyMarkdown ?? "", opts);

  const warnings = linkHealthWarnings(results);
  if (warnings.length > 0) {
    console.warn(
      `[blog-refresher] Non-blocking link warnings:\n- ${warnings.join("\n- ")}`,
    );
  }

  return [...errors, ...linkHealthErrors(results)];
}

/**
 * Run one refresh cycle. Returns the refreshed post, or null when no post
 * currently needs a refresh. Sends a failure email and rethrows on error.
 */
export async function refreshOnePost(forcedSlug?: string): Promise<GeneratedPost | null> {
  let stage = "refresh-selection";
  try {
    const dbPosts = await storage.getPublishedGeneratedPosts();
    if (dbPosts.length === 0) return null;

    let candidate: { slug: string; reason: "striking-distance" | "freshness"; queries: StrikingQuery[] } | null;
    if (forcedSlug) {
      if (!dbPosts.some((p) => p.slug === forcedSlug)) {
        throw new Error(`No DB-published post with slug "${forcedSlug}"`);
      }
      const striking = await findStrikingDistancePosts().catch(() => []);
      const match = striking.find((s) => s.slug === forcedSlug);
      candidate = { slug: forcedSlug, reason: match ? "striking-distance" : "freshness", queries: match?.queries ?? [] };
    } else {
      const striking = await findStrikingDistancePosts();
      candidate = pickRefreshCandidate(dbPosts, striking);
    }
    if (!candidate) {
      console.log("[blog-refresher] No post needs a refresh right now");
      return null;
    }

    const post = dbPosts.find((p) => p.slug === candidate!.slug)!;
    console.log(
      `[blog-refresher] Refreshing /blog/${post.slug} (${candidate.reason}${candidate.queries.length > 0 ? `, ${candidate.queries.length} target queries` : ""})`,
    );

    stage = "exa-research";
    const researchQuery =
      candidate.queries.length > 0 ? candidate.queries[0].query : post.targetKeyword || post.keywordTheme;
    const research = await researchTheme(researchQuery);
    console.log(`[blog-refresher] Exa returned ${research.length} sources`);

    stage = "llm-refresh";
    const existingPosts: ExistingPostRef[] = [
      ...getStaticPostRefs(),
      ...dbPosts.map((p) => ({ slug: p.slug, title: p.title, pillar: p.pillar, tags: p.tags })),
    ];
    const allSlugs = new Set(existingPosts.map((p) => p.slug));

    let draft = await draftRefresh(post, candidate.queries, research, existingPosts);

    stage = "validation";
    let errors = await validateRefreshDraftIncludingLinks(draft, post.slug, allSlugs);
    if (errors.length > 0) {
      console.warn(`[blog-refresher] Refresh draft failed validation, retrying once:\n- ${errors.join("\n- ")}`);
      stage = "llm-refresh-retry";
      draft = await draftRefresh(post, candidate.queries, research, existingPosts);
      stage = "validation";
      errors = await validateRefreshDraftIncludingLinks(draft, post.slug, allSlugs);
      if (errors.length > 0) {
        throw new Error(`Refresh draft failed validation twice:\n- ${errors.join("\n- ")}`);
      }
    }

    stage = "update";
    const bodyMarkdown = draft.bodyMarkdown.trim();
    const today = new Date().toISOString().slice(0, 10);
    const updated = await storage.updateGeneratedPost(post.id, {
      title: draft.title.trim(),
      seoTitle: draft.seoTitle?.trim() || draft.title.trim(),
      description: draft.description.trim(),
      targetKeyword: draft.targetKeyword?.trim() || post.targetKeyword,
      tags: draft.tags.map((t) => t.trim()).filter(Boolean),
      recommendedPlan: draft.recommendedPlan,
      tldr: draft.tldr.trim(),
      keyTakeaways: draft.keyTakeaways.map((k) => k.trim()).filter(Boolean),
      bodyMarkdown,
      faq: draft.faq.map((f) => ({ q: f.q.trim(), a: f.a.trim() })),
      toc: extractToc(bodyMarkdown),
      readingMinutes: computeReadingMinutes(bodyMarkdown),
      sources: research.map((r) => ({ title: r.title, url: r.url })),
      updatedDate: today,
      refreshCount: post.refreshCount + 1,
      lastRefreshedAt: new Date(),
    });
    console.log(`[blog-refresher] Refreshed: /blog/${updated.slug} (refresh #${updated.refreshCount})`);

    stage = "notification";
    try {
      await sendPostRefreshedEmail(
        updated,
        candidate.reason,
        candidate.queries.map((q) => q.query),
      );
    } catch (emailError) {
      console.error("[blog-refresher] Post refreshed but notification email failed:", emailError);
    }

    return updated;
  } catch (error) {
    console.error(`[blog-refresher] FAILED at stage "${stage}":`, error);
    const emailSent = await sendPostFailureEmail(`refresh:${stage}`, error);
    if (!emailSent) {
      // Gmail itself may be down — fall back to the "RxFit Alerts" sheet tab
      // (separate google-sheet connector) so the owner still finds out.
      try {
        const message = error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}` : String(error);
        await appendAlertToSheet({
          title: `Blog post refresh FAILED at stage "refresh:${stage}" (failure email could not be sent)`,
          message,
        });
        console.log("[blog-refresher] Fallback failure alert row appended to Google Sheet");
      } catch (sheetError) {
        console.error(
          "[blog-refresher] BOTH failure alert channels failed (Gmail email + Google Sheet):",
          sheetError,
        );
      }
    }
    throw error;
  }
}
