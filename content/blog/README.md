# RxFit.ai Blog — Author Guide

Posts are authored as **MDX** files in this directory (`content/blog/<slug>.mdx`). They are
loaded at build time by `@mdx-js/rollup` and rendered by the post template at
`client/src/pages/BlogPost.tsx` using the brand component library in
`client/src/components/blog/MdxComponents.tsx`.

## Frontmatter schema

Every post must start with a YAML frontmatter block:

```yaml
---
title: "AI Fitness Coach vs Personal Trainer: Which Wins in 2026?"
slug: "ai-coach-vs-personal-trainer"        # must match the filename (without .mdx)
date: "2026-01-15"                            # ISO date, drives sort order + <lastmod>
author: "Dr. Sarah Chen"
authorBio: "Sarah is RxFit.ai's head of coaching science with 12 years in sports physiology."
authorPhoto: "/blog/ai-coach-vs-personal-trainer/author.jpg"  # optional
description: "A data-driven comparison of AI fitness coaching vs traditional personal trainers." # 140-160 chars, used for <meta description> + OG
heroImage: "/blog/ai-coach-vs-personal-trainer/hero.jpg"
tags: ["AI Coaching", "Personal Training"]
pillar: "AI Coaching"                         # one of: "AI Coaching" | "Wearables" | "Accountability"
targetKeyword: "AI fitness coach vs personal trainer"
recommendedPlan: "kickstart"                  # kickstart | committed | transformation
---
```

## Image conventions

- Hero image: `client/public/blog/<slug>/hero.jpg` (16:9, e.g. 1200×675), ≤150KB (referenced as `/blog/<slug>/hero.jpg`). Use optimized JPEG for heroes — they double as the page's `og:image`/`twitter:image`, and JPEG is universally supported by social scrapers (some reject WebP).
- Author photo (optional): `client/public/blog/authors/<author-slug>.webp`, square ~128×128, ≤10KB (referenced as `/blog/authors/<author-slug>.webp`). Page-only, so WebP is fine.
- Inline images: keep small (≤150KB), prefer WebP, always provide descriptive `alt` text.
- Always compress and resize to the rendered dimensions before committing — files in `client/public` are copied as-is (not optimized by Vite). Keep the `heroImage` / `authorPhoto` frontmatter path in sync with the actual file extension.

> Reading time and the on-page table of contents are computed automatically at build
> time from the post body by the `remarkBlogMeta` plugin (`remark-blog-meta.ts`) — no
> frontmatter fields needed. H2 headings become the TOC entries.

## MDX components available

Drop these directly into post bodies (no import needed — provided by `<MDXProvider>`):

- `<TLDR>…</TLDR>` — teal glass card; put a 2–4 sentence summary at the **top** of every post (AI extraction / AEO).
- `<KeyTakeaways items={["…","…"]} />` — orange check-list of the main points.
- `<CTACard plan="kickstart" />` — tier-aware conversion card; place around ~60% scroll.
- `<FAQ items={[{ q: "…", a: "…" }]} />` — accordion + emits `FAQPage` JSON-LD (required for AEO).
- `<Stat value="92%" label="of users…" source="https://…" />` — large stat with cited source.
- `<Callout type="tip">…</Callout>` — `tip | warning | info` colored callout.
- `<Comparison columns={["", "AI", "Trainer"]} rows={[["Cost","$49","$300"]]} />` — responsive comparison table.

## Draft → preview → publish flow

Authoring is safe by default: you can write a post, see exactly how it renders, fix
any warnings, and only then make it public. Nothing is published until you rename the
file.

1. **Create a draft.** Copy the skeleton below into a new file whose name starts with an
   underscore: `content/blog/_my-post.mdx`. Set `slug: "_my-post"` (the slug **must** match
   the filename, including the leading `_`). Drafts are automatically hidden from the blog
   index (`/blog`) and the `sitemap.xml`.
2. **Preview it.** Start the dev server and open `http://localhost:5000/blog/_my-post`. An
   orange **"Draft preview"** banner appears at the top, and the page carries a
   `noindex,nofollow` robots tag so search engines won't pick it up even if someone shares
   the URL. The page renders identically to a published post otherwise.
3. **Check the warnings.** Every time the post compiles (dev server reload or `npm run build`)
   the build-time linter prints `[blog-lint]` warnings to the terminal if the post is missing
   a `<TLDR>`, a `<FAQ>`, a hero image (frontmatter field **and** the file on disk), or has
   fewer than 3 internal links. These are warnings, not errors — they never fail the build,
   but clearing them means the post passes the publish checklist below.
4. **Publish.** Once the preview looks right and the warnings are gone, rename the file to
   drop the leading underscore (`_my-post.mdx` → `my-post.mdx`) and update `slug` to match
   (`"_my-post"` → `"my-post"`). The post now appears in the index and the sitemap. Commit.

### Draft skeleton (copy/paste)

```mdx
---
title: "Your headline here"
slug: "_my-post"
date: "2026-01-01"
author: "Dr. Mara Ellison"
authorBio: "One-sentence credibility line for the author."
authorPhoto: "/blog/authors/mara-ellison.webp"
description: "140–160 char summary used for the meta description and social cards."
heroImage: "/blog/_my-post/hero.jpg"
tags: ["AI Coaching"]
pillar: "AI Coaching"
targetKeyword: "your target keyword"
recommendedPlan: "kickstart"
---

<TLDR>
2–4 sentence summary that answers the headline up front (AI extraction / AEO).
</TLDR>

Opening paragraph.

## A question-shaped H2?

Body copy. Link to [another post](/blog/ai-coach-vs-personal-trainer), the
[pricing section](/#pricing), and the [home page](/) so you clear the ≥3 internal-link bar.

<KeyTakeaways items={["First point", "Second point", "Third point"]} />

<CTACard plan="kickstart" />

<FAQ
  items={[
    { q: "First question?", a: "Answer." },
    { q: "Second question?", a: "Answer." },
    { q: "Third question?", a: "Answer." },
    { q: "Fourth question?", a: "Answer." }
  ]}
/>
```

## Publish checklist

- [ ] `<TLDR>` at the very top.
- [ ] `<KeyTakeaways>` near the top.
- [ ] Question-shaped H2s (`## How does HRV work?`).
- [ ] At least one inline `<CTACard>` with the frontmatter `recommendedPlan`.
- [ ] `<FAQ>` block with 4–6 Q&A pairs at the end.
- [ ] **≥3 internal links** to other blog posts or `/` / `/#pricing`.
- [ ] All **outbound** links open in a new tab (handled automatically by the `a` override).
- [ ] Descriptive `alt` text on every image.
- [ ] UTM is appended automatically on outbound app links — no manual work needed.
- [ ] Author bio filled in frontmatter.
- [ ] Hero image present at `client/public/blog/<slug>/hero.jpg` (≤200KB).
