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

- Hero image: `client/public/blog/<slug>/hero.png` (16:9, e.g. 1200×675), ≤200KB (referenced as `/blog/<slug>/hero.png`).
- Author photo (optional): `client/public/blog/authors/<author-slug>.png`, square, ≤100KB (referenced as `/blog/authors/<author-slug>.png`).
- Inline images: keep ≤200KB, always provide descriptive `alt` text.
- `.jpg` works too — just keep the `heroImage` / `authorPhoto` frontmatter path in sync with the actual file extension.

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
