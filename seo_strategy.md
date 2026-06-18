# SEO Strategy

## In scope
- Public marketing homepage (`/`)
- Blog index (`/blog`)
- Blog posts (`/blog/:slug`)
- Shared public metadata, crawlability, and social/AI crawler surfaces (`client/index.html`, `robots.txt`, `sitemap.xml`, `llms.txt`)

## Out of scope
- Authenticated product app on `app.rxfit.ai` (separate repository)
- API routes (`/api/**`)
- Post-purchase success page (`/success`) because it is intentionally blocked from indexing
- Admin or internal-only surfaces if added later

## Target audience
- People using wearables or health apps who want coaching, accountability, and clearer interpretation of their health data.

## Primary keywords
- AI fitness coaching
- wearable data coaching
- health accountability coach
- HRV guide
- AI coach vs personal trainer

## Dismissed categories
- (None yet)

## Notes
- The public site is built with Vite + React and served by Express.
- In-scope public routes are prerendered at build time into static HTML, so Google, social crawlers, and AI crawlers can read route-specific content and metadata without waiting for client-side rendering.
- `app.rxfit.ai` remains a separate repository and should only be considered for reciprocal cross-domain SEO work, not direct source edits in this repo.
