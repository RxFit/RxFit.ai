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
**Copy-paste-ready snippets for each code step are provided in the next section.**

- [ ] **Reciprocal links FROM `app.rxfit.ai`** back to `https://rxfit.ai` and
      `https://rxfit.ai/blog` (add to the app's header/nav and/or footer as real `<a href>`).
- [ ] **Mirror the `Organization` JSON-LD** on `app.rxfit.ai` with a **matching `sameAs`**
      array (same entries, including `https://rxfit.ai`) so both properties declare the same brand.
- [ ] **Google Search Console — single domain property** for `rxfit.ai` (verify via DNS TXT).
      A *domain* property covers all subdomains, so `rxfit.ai` and `app.rxfit.ai` roll up together.
- [ ] **Submit both sitemaps** in Search Console: `https://rxfit.ai/sitemap.xml` and the
      app's own sitemap (`https://app.rxfit.ai/sitemap.xml`).
- [ ] **Consistent NAP / brand name / logo** across both properties (and social profiles in `sameAs`).

## Handoff: paste-ready snippets for `app.rxfit.ai`

Hand these to whoever maintains the `app.rxfit.ai` repo. They are derived from this
repo's source of truth (`client/src/lib/seo.tsx`) — keep them identical when either side changes.

### 1. Reciprocal links (header/nav)

Add real, crawlable anchors (not JS `router.push`/`onClick` redirects) so search engines
follow them. Plain HTML:

```html
<a href="https://rxfit.ai" rel="home">RxFit.ai</a>
<a href="https://rxfit.ai/blog">Blog</a>
```

JSX equivalent (if the app is React):

```jsx
<a href="https://rxfit.ai" rel="home">RxFit.ai</a>
<a href="https://rxfit.ai/blog">Blog</a>
```

### 2. Reciprocal links (footer)

Mirror the same two links in the footer so they appear on every page:

```html
<nav aria-label="RxFit brand">
  <a href="https://rxfit.ai">Home</a>
  <a href="https://rxfit.ai/blog">Blog</a>
</nav>
```

### 3. Mirrored Organization JSON-LD

Inject this in the `<head>` of `app.rxfit.ai`. The `sameAs` array (and `url`/`name`/`logo`)
**must stay byte-for-byte identical** to this repo's `ORGANIZATION_JSONLD`. When you add a new
social/brand profile, update it in **both** places.

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "RxFit.ai",
  "url": "https://rxfit.ai",
  "logo": "https://rxfit.ai/logo.png",
  "description": "RxFit.ai pairs an AI health dashboard with a real human coach to turn wearable data into daily, consistent action.",
  "sameAs": [
    "https://app.rxfit.ai",
    "https://twitter.com/rxfitai",
    "https://www.instagram.com/rxfitai",
    "https://www.linkedin.com/company/rxfitai"
  ]
}
</script>
```

### 4. Google Search Console (external tool, no code)

1. Add a **Domain property** for `rxfit.ai` (not a URL-prefix property) — it covers
   `rxfit.ai`, `www.rxfit.ai`, and `app.rxfit.ai` together.
2. Verify by adding the **DNS TXT record** GSC gives you at the domain registrar/DNS host.
3. Once verified, submit both sitemaps: `https://rxfit.ai/sitemap.xml` and
   `https://app.rxfit.ai/sitemap.xml`.

## Notes

- Keep the `sameAs` arrays identical on both properties — mismatches weaken the "one brand" signal.
- When adding new social or brand profiles, update `sameAs` in `client/src/lib/seo.tsx`
  **and** mirror it on app.rxfit.ai.
