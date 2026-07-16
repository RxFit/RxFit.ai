# RxFit.ai Landing Page

## Overview
RxFit.ai is a HealthTech SaaS landing page designed for lead capture, conversion, and payment processing. The product combines AI health data integration (wearables/apps) with real human personal trainer/accountability coaching.

## Current State
- **Frontend:** "RxFit Concierge" Lux-Industrial / Command-HUD aesthetic — champagne-gold accent (light `hsl(38 60% 42%)` / dark `hsl(43 53% 54%)`) with light ("Warm White Luxury") and dark ("Dark Luxury") themes. Theme toggle in nav (defaults to dark; persisted in localStorage; no-flash inline script). Glassmorphism modules, HUD detailing (mono command labels, sharp lucide icons, faint full-screen grid overlay).
- **Backend:** Express server with PostgreSQL database for lead capture and Stripe integration for payments.
- **Payments:** Stripe Checkout integration with 3 pricing tiers, webhooks, and success page.
- **Typography:** Inter (body, self-hosted), Space Grotesk (display/headings), JetBrains Mono (HUD command labels).

## Project Architecture
- `client/src/pages/LandingPage.tsx` — Main landing page (pricing buttons open the shared signup modal via `useSignupModal`)
- `client/src/pages/SuccessPage.tsx` — Post-payment success page with link to app.rxfit.ai
- `client/src/pages/BlogIndex.tsx` — Blog index: pillar filter chips + responsive post-card grid
- `client/src/pages/BlogPost.tsx` — Blog post template: breadcrumb, byline, hero, MDX content, sticky TOC, author bio, related posts, CRO surfaces
- `client/src/components/SignupModal.tsx` — Extracted signup modal (email/name → Stripe Checkout)
- `client/src/components/SignupModalProvider.tsx` — Context provider exposing `useSignupModal().open(plan)` app-wide
- `client/src/components/SiteHeader.tsx` / `SiteFooter.tsx` — Shared nav/footer with crawlable `app.rxfit.ai` cross-links
- `client/src/components/blog/MdxComponents.tsx` — Brand MDX primitives (`TLDR`, `KeyTakeaways`, `CTACard`, `FAQ`, `Stat`, `Callout`, `Comparison`) + element overrides
- `client/src/components/blog/StickyFooterCta.tsx` / `ExitIntentModal.tsx` — CRO surfaces (dismissable sticky bar; desktop exit-intent → `/api/leads`)
- `client/src/lib/blogLoader.ts` — Loads `content/blog/*.mdx` at build time; reads `readingMinutes`/`toc` injected by `remarkBlogMeta`
- `client/src/lib/seo.tsx` — `<Seo>` head manager + Article/BreadcrumbList/Organization JSON-LD (shared Organization w/ `sameAs`)
- `client/src/lib/analytics.ts` — Plausible `track(event, props)` wrapper (safe no-op when not loaded)
- `client/src/lib/utm.ts` — UTM capture/persistence, `appendUtm`, and `getClientReferenceId` for Stripe attribution
- `remark-blog-meta.ts` — Build-time remark plugin: injects `readingMinutes` + `toc` exports and assigns H2 ids
- `shared/stripe-constants.ts` — Live Stripe price IDs (single source of truth for landing + blog CTAs)
- `content/blog/*.mdx` — Blog posts (frontmatter + MDX body); see `content/blog/README.md` author guide
- `client/public/llms.txt` — AI-assistant summary of the site (AEO/GEO)
- `server/*.test.ts` + `vitest.config.ts` — Vitest unit tests for the publishing safety gates (`validateDraft`, `sanitizeUrl`/`markdownToHtml`, scheduler `isPostDue`); run with `npm test` (registered as the `test` validation step). Tests also run automatically at the start of `npm run build` (`script/build.ts` runs `vitest run` first and exits non-zero on failure), so a failing safety test blocks every deploy.
- `scripts/validate-seo.mjs` — SEO/structured-data check for MDX posts (JSON-LD shapes, image files, default OG image) plus internal link validation (every `/blog/...` and root-relative link in MDX bodies must match an MDX slug or `shared/site.ts` STATIC_ROUTES); registered as the `seo` validation step
- `client/src/index.css` — Design system (dark mode SaaS theme with glassmorphism utilities)
- `shared/schema.ts` — Database schema (users, leads, generated_posts, keyword_themes tables)
- `shared/generated-blog.ts` — Types/zod schemas shared by the AI blog publisher (server + client)
- `server/exaClient.ts` — Exa research API client (EXA_API_KEY secret)
- `server/blogGenerator.ts` — AI post pipeline: theme → Exa research → gpt-5.4 (json_object) → validate w/ one retry (incl. disallowed-URL-scheme rejection + internal-link target check: `/blog/...` links must match an existing MDX/DB slug, other root-relative links must be in `shared/site.ts` STATIC_ROUTES) → hero image (best-effort) → publish to DB → Gmail notification; loud failure email + rethrow
- `server/heroImage.ts` — gpt-image-1 hero image generation (brand Lux-Industrial prompt, per-pillar scenes) + Replit Object Storage upload (`public/blog-heroes/<slug>.webp`); served via `GET /blog-heroes/:file`
- `server/backfill-hero-images.ts` — Manual CLI: `npx tsx server/backfill-hero-images.ts` generates hero images for published posts missing one
- `server/credentialHealthCheck.ts` — Boot + hourly check that Stripe/Gmail connector credentials still resolve; retries once (15s) to avoid transient false alarms, alerts owner by email only on the healthy→broken transition (via `sendCredentialAlertEmail` in `emailService.ts`); if the alert email itself fails to send (e.g. Gmail is the broken service), falls back to appending an alert row to the "RxFit Alerts" tab of the leads spreadsheet (`appendCredentialAlertToSheet` in `sheetsService.ts`, separate google-sheet connector); logs loudly if both channels fail; logs recovery. Production-only (or `CREDENTIAL_HEALTHCHECK=true` in dev)
- `server/blogScheduler.ts` — Hourly + boot check; publishes when the newest post is ≥3 days old; pg advisory lock prevents double-publish; runs in production (or `BLOG_AUTOPUBLISH=true` in dev)
- `server/blogSsr.ts` — Runtime crawler HTML for DB posts (head mirrors seo.tsx incl. JSON-LD; marked-rendered body with raw-HTML escaping + URL scheme sanitization, brand classes, TOC ids)
- `server/generate-post.ts` — Manual CLI: `npx tsx server/generate-post.ts` publishes one post now
- `client/src/lib/generatedPosts.ts` — react-query hooks for `/api/blog/posts*` + frontmatter adapter
- `client/src/components/blog/GeneratedPostContent.tsx` — Renders DB posts with the same brand primitives (TLDR/KeyTakeaways/CTACard/FAQ) via ReactMarkdown
- `server/routes.ts` — API routes (leads, Stripe checkout, products, session retrieval, email+sheets triggers)
- `server/storage.ts` — Database storage interface using Drizzle ORM
- `server/db.ts` — PostgreSQL connection pool (with SSL for production)
- `server/stripeClient.ts` — Stripe client with Replit connector credentials
- `server/webhookHandlers.ts` — Stripe webhook processing via stripe-replit-sync
- `server/seed-products.ts` — Script to create Stripe products/prices (run manually)
- `server/index.ts` — Express server with Stripe init (graceful failure), webhook route (before express.json), and app startup
- `server/gmailClient.ts` — Gmail API client via Replit connector
- `server/emailService.ts` — Automated email service (welcome email after payment, lead nurture email on signup)
- `server/sheetsClient.ts` — Google Sheets API client via Replit connector
- `server/sheetsService.ts` — Auto-sync leads to Google Sheets ("RxFit Leads" tab)

## Stripe Integration
- **Products:** Kickstart ($49/mo with 7-day trial), Committed ($490/yr), Transformation ($997/yr)
- **Webhook:** Registered before express.json middleware, processes via stripe-replit-sync
- **Products API:** Falls back to Stripe API if DB sync hasn't populated yet
- **Checkout flow:** Modal collects email/name → creates Stripe Checkout session → redirects to Stripe → returns to /success page
- **Customer Portal:** POST `/api/stripe/customer-portal` accepts `customerId` or `email`, creates a Stripe Billing Portal session, returns portal URL. CORS enabled for app.rxfit.ai.
- **Cross-domain billing:** Success page passes Stripe customer ID (`cid` query param) to app.rxfit.ai for seamless subscription management
- **Seed script:** `npx tsx server/seed-products.ts` to create products in Stripe

## Email & Sheets Integrations
- **Gmail:** Sends branded welcome emails after Stripe checkout and lead signup emails on form submission
- **Google Sheets:** Auto-syncs all leads to "RxFit Leads" tab in configured spreadsheet (LEADS_SPREADSHEET_ID env var)
- **Spreadsheet columns:** Date, Email, Name, Plan, Source (lead_capture/stripe_checkout), Status (lead/paid)

## Blog & SEO
- **Location:** Blog lives on `rxfit.ai` at `/blog` (index) and `/blog/:slug` (posts). Wouter routing.
- **Authoring:** Posts are MDX in `content/blog/*.mdx` (frontmatter + body). See `content/blog/README.md` for the schema, image conventions, and publish checklist. Drafts whose slug starts with `_` are hidden from the index and sitemap but reachable by direct URL.
- **Build pipeline:** `@mdx-js/rollup` compiles MDX (configured in `vite.config.ts`); `remark-blog-meta.ts` injects `readingMinutes` + a heading-based `toc` and assigns H2 ids (the `?raw` glob can't be used — the MDX plugin strips the query and compiles anyway). `blogLoader.ts` eager-loads all posts.
- **MDX components:** Brand primitives in `client/src/components/blog/MdxComponents.tsx` (`TLDR`, `KeyTakeaways`, `CTACard`, `FAQ`, `Stat`, `Callout`, `Comparison`) plus element overrides.
- **SEO / AEO / GEO:** `client/src/lib/seo.tsx` manages per-page `<title>`/meta (without clobbering default `og:image`/`twitter:image`) and injects `Article` + `BreadcrumbList` + `Organization` JSON-LD. `FAQ` emits `FAQPage` JSON-LD. `server/routes.ts` serves dynamic `/sitemap.xml` (fs + gray-matter, 5-min cache) and `/robots.txt` (allows GPTBot/PerplexityBot/ClaudeBot/Google-Extended/CCBot); `client/public/llms.txt` summarizes the site for AI assistants.
- **CRO:** Tier-aware inline `<CTACard>`, dismissable `StickyFooterCta`, desktop `ExitIntentModal` (→ `/api/leads`). All open the shared signup modal via `useSignupModal()`.
- **Attribution:** `client/src/lib/utm.ts` captures/persists UTMs and builds a `client_reference_id` (`slug|source|medium|campaign`) passed through `/api/stripe/checkout`.
- **Analytics:** Plausible (`data-domain=rxfit.ai` in `client/index.html`); `client/src/lib/analytics.ts` tracks `pageview`, `scroll_50`, `scroll_90`, `cta_*` events.
- **Cross-domain authority:** Crawlable `<a href="https://app.rxfit.ai">` links in header/footer/landing/post + Organization `sameAs`. Reciprocal links FROM app.rxfit.ai are a manual step — see `CROSS-DOMAIN-SEO.md`.

## Automated AI Blog Publisher
- **Cadence:** In production, `server/blogScheduler.ts` checks hourly (and at boot) and publishes a new post whenever the newest published post is ≥3 days old. A Postgres advisory lock prevents double-publish across instances. In dev the scheduler is off unless `BLOG_AUTOPUBLISH=true`; publish manually with `npx tsx server/generate-post.ts`.
- **Pipeline:** rotating keyword theme (`keyword_themes` table, least-recently-used first) → Exa search for fresh sources (`server/exaClient.ts`, `EXA_API_KEY` secret) → gpt-5.4 via Replit OpenAI integration (`AI_INTEGRATIONS_OPENAI_API_KEY/BASE_URL`, `response_format: json_object`) → strict validation (required fields, ≥3 H2s, ≥700 words, ≥3 internal links, meta length, unique slug, no disallowed URL schemes) with one retry → best-effort hero image (gpt-image-1 → Replit Object Storage `public/blog-heroes/<slug>.webp`, stored as `/blog-heroes/<slug>.webp`; failure logs and publishes without an image) → insert into `generated_posts` → Gmail publish notification. Any failure sends a failure email to the owner (`OWNER_NOTIFICATION_EMAIL` env var; connector-based fallbacks exist) and rethrows (loud failure).
- **Serving (no redeploy):** `GET /api/blog/posts` + `/api/blog/posts/:slug` serve DB posts; runtime `GET /blog/:slug` in `server/routes.ts` returns full crawler HTML via `server/blogSsr.ts` (falls through to static files for MDX slugs; SPA shell in dev). `prerender.ts` saves the raw built shell to `dist/public/template.html` for this. `/sitemap.xml` merges DB posts with MDX posts.
- **Client:** `BlogIndex`/`BlogPost` merge DB posts with MDX posts via `client/src/lib/generatedPosts.ts`; `GeneratedPostContent.tsx` renders markdown with the brand primitives (TLDR, KeyTakeaways, mid-article CTACard, FAQ). `main.tsx` renders fresh (no hydration) when the shell has `data-runtime-ssr`.
- **Security:** LLM markdown is never trusted — raw HTML is escaped and link/image URL schemes are sanitized in `blogSsr.ts` (render-time) and rejected in `blogGenerator.ts` validation (publish-time); client uses ReactMarkdown (no raw HTML, safe URL transform).
- **gpt-5.4 notes:** do not pass `temperature`/`max_tokens`; `response_format: {type: "json_object"}` works.

## Key Features
- Blog with SEO/AEO/CRO infrastructure (MDX posts, JSON-LD, sitemap/robots/llms.txt, CTAs, analytics)
- Hero section with animated dashboard mockup and rotating notification cards
- Problem/Agitation section highlighting pain points
- Solution features section (AI Hub, Human Coach)
- 3-tier Value Stack pricing with Stripe Checkout
- Lead capture (saved to PostgreSQL alongside Stripe checkout)
- Automated welcome emails via Gmail after signup/payment
- Lead auto-sync to Google Sheets
- Success page with next steps and link to app.rxfit.ai
- Testimonial section
- Mobile responsive

## User Preferences
- "RxFit Concierge" champagne-gold Lux-Industrial / Command-HUD aesthetic (supersedes the prior teal/coral palette)
- Support BOTH light and dark themes with a nav theme toggle; dark is the default
- Original landing page layout (not sidebar/dashboard layout)
- Premium/concierge brand feel is welcome (supersedes the earlier "avoid executive-heavy branding" note)
- Keep brand name "RxFit.ai" and the existing logo.png
- Subdomain architecture: landing on rxfit.ai, product app on app.rxfit.ai
