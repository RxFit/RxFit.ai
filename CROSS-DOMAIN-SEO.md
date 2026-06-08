# Cross-Domain SEO Strategy: rxfit.ai ↔ app.rxfit.ai

RxFit runs as two web properties under one brand:

- **`rxfit.ai`** — the marketing site + blog (this repo).
- **`app.rxfit.ai`** — the product web app (a **separate** codebase, not this repo).

`app.rxfit.ai` already has stronger organic authority. The deliberate strategy is to
treat both properties as a single brand so that authority is shared, and to channel
discovery traffic from the blog into the app.

## What this repo already does (done, no action needed)

- **Crawlable cross-links** to `https://app.rxfit.ai` (real `<a href>`, not JS redirects):
  - `SiteHeader.tsx` — "Log In / Open App" button
  - `SiteFooter.tsx` — footer link (rendered on landing, blog index, blog posts)
  - `LandingPage.tsx` — header anchor
  - `BlogPost.tsx` — in-content author-bio contextual link (UTM-tagged via `appendUtm`)
- **Unified `Organization` JSON-LD** (`client/src/lib/seo.tsx`): `url: https://rxfit.ai`,
  brand logo, and a `sameAs` array that includes `https://app.rxfit.ai` + social profiles.
- **`llms.txt`** lists `https://app.rxfit.ai` as the same brand for AI assistants.
- **`/sitemap.xml`** and **`/robots.txt`** served from `server/routes.ts` (robots allows the
  major AI crawlers and points at the sitemap).

## Manual steps (MUST be done OUTSIDE this repo)

These cannot be done from this codebase — they live on the other app or in external tools.

- [ ] **Reciprocal links FROM `app.rxfit.ai`** back to `https://rxfit.ai` and
      `https://rxfit.ai/blog` (add to the app's header/nav and/or footer as real `<a href>`).
- [ ] **Mirror the `Organization` JSON-LD** on `app.rxfit.ai` with a **matching `sameAs`**
      array (same entries, including `https://rxfit.ai`) so both properties declare the same brand.
- [ ] **Google Search Console — single domain property** for `rxfit.ai` (verify via DNS TXT).
      A *domain* property covers all subdomains, so `rxfit.ai` and `app.rxfit.ai` roll up together.
- [ ] **Submit both sitemaps** in Search Console: `https://rxfit.ai/sitemap.xml` and the
      app's own sitemap (`https://app.rxfit.ai/sitemap.xml`).
- [ ] **Consistent NAP / brand name / logo** across both properties (and social profiles in `sameAs`).

## Notes

- Keep the `sameAs` arrays identical on both properties — mismatches weaken the "one brand" signal.
- When adding new social or brand profiles, update `sameAs` in `client/src/lib/seo.tsx`
  **and** mirror it on app.rxfit.ai.
