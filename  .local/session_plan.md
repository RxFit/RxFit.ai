# Objective
Audit the project's public-facing SEO posture from source code only and produce prioritized, actionable findings.

# Relevant information
- Framework: Vite + React SPA served by Express
- Routing: `wouter` client-side routes in `client/src/App.tsx`
- Public routes in scope: `/`, `/blog`, `/blog/:slug`
- Public routes out of scope: `/success` (intentionally blocked in `robots.txt`)
- HTML shell: `client/index.html`
- Dynamic crawl endpoints: `server/routes.ts` serves `/robots.txt` and `/sitemap.xml`
- Production fallback: `server/static.ts` serves `index.html` for unmatched paths
- Dev fallback: `server/vite.ts` serves `index.html` for unmatched paths
- Route-level SEO: `client/src/lib/seo.tsx` mutates `<head>` in `useEffect` after JS runs
- Blog content: `content/blog/*.mdx`, eager-loaded through `client/src/lib/blogLoader.ts`

# Route rendering classification
- `/` — SPA-rendered marketing page; initial HTML contains only shared shell tags
- `/blog` — SPA-rendered client route; route-specific title/description/canonical/JSON-LD added only after JS executes
- `/blog/:slug` — SPA-rendered client route; article title/description/canonical/JSON-LD added only after JS executes
- Unknown routes — SPA shell returned with HTTP 200, then client-side NotFound component renders

# Tasks

### T001: Crawlability & indexation audit
- **Blocked By**: []
- **Details**:
  - Validate `robots.txt`, `sitemap.xml`, route fallback behavior, canonical handling, noindex usage, and 404 behavior.
  - Files: `server/routes.ts`, `server/index.ts`, `server/static.ts`, `server/vite.ts`, `client/index.html`, `client/src/lib/seo.tsx`
  - Acceptance: Every public crawl/indexation risk is either cleared or filed with concrete evidence.

### T002: SPA-vs-SSR / metadata visibility audit
- **Blocked By**: []
- **Details**:
  - Determine what Google, social crawlers, and AI crawlers can see in initial HTML for each public route.
  - Files: `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx`, `client/src/lib/seo.tsx`, `client/src/pages/LandingPage.tsx`, `client/src/pages/BlogIndex.tsx`, `client/src/pages/BlogPost.tsx`
  - Acceptance: Architectural rendering issues are documented with affected routes and file-level fixes.

### T003: On-page meta, structured data, and content signal audit
- **Blocked By**: []
- **Details**:
  - Check titles, descriptions, canonicals, OG/Twitter coverage, JSON-LD, heading hierarchy, and editorial metadata.
  - Files: `client/index.html`, `client/src/lib/seo.tsx`, `client/src/pages/*.tsx`, `content/blog/*.mdx`
  - Acceptance: Missing/incomplete head tags or content-signal issues are either cleared or filed.

### T004: Performance proxies, assets, and trust/internal-link audit
- **Blocked By**: []
- **Details**:
  - Check oversized public assets, render-blocking shared resources, favicon coverage, and broken public/footer links.
  - Files: `client/index.html`, `client/public/**`, `client/src/assets/**`, `client/src/components/SiteFooter.tsx`, `client/src/pages/LandingPage.tsx`, `client/src/pages/BlogIndex.tsx`, `client/src/pages/BlogPost.tsx`
  - Acceptance: Only source-supportable, user-visible performance/trust issues are filed.
