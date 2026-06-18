---
name: Blog author lint (build-time)
description: How the MDX build-time linter decides "missing TLDR/FAQ/hero/internal-links" and why.
---

The `remarkBlogMeta` plugin (`remark-blog-meta.ts`) also runs a non-fatal author lint that
prints `[blog-lint]` warnings during dev/build. It checks: `<TLDR>` present, `<FAQ>` present,
`heroImage` declared in frontmatter AND the file existing under `client/public`, and ≥3
internal links.

**Internal links are counted as markdown `link` nodes whose url starts with `/` only.**
Component-driven links (`<CTACard>`, author-bio app link) are NOT counted because they don't
appear as mdast `link` nodes.

**Why:** the ≥3-internal-link checklist rule is about author-written cross-links between posts
/ to `/` / to `/#pricing` for SEO, not runtime CTA chrome. As of this writing the 3 seed posts
(`ai-coach-vs-personal-trainer`, `accountability-gap-fitness-apps`, `how-to-read-your-hrv`)
have zero markdown internal links, so they legitimately trip this warning — it is accurate
signal, not a false positive.

**How to apply:** warnings never fail the build. If you want to silence them on the seed posts,
add real markdown cross-links between posts. New files aren't picked up by the running dev
server's eager glob until a workflow restart.
