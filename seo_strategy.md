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
- The site is a Vite + React SPA served by Express.
- Public routes currently rely on client-side routing (`wouter`) and client-side head updates for most page-specific SEO.
