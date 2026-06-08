# RxFit.ai Landing Page

## Overview
RxFit.ai is a HealthTech SaaS landing page designed for lead capture, conversion, and payment processing. The product combines AI health data integration (wearables/apps) with real human personal trainer/accountability coaching.

## Current State
- **Frontend:** Dark Mode SaaS landing page with glassmorphism effects, Teal (#2DD4BF) and Coral (#FB923C) accents on a deep slate (#0F172A) background.
- **Backend:** Express server with PostgreSQL database for lead capture and Stripe integration for payments.
- **Payments:** Stripe Checkout integration with 3 pricing tiers, webhooks, and success page.
- **Typography:** Inter font family throughout.

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
- `client/src/index.css` — Design system (dark mode SaaS theme with glassmorphism utilities)
- `shared/schema.ts` — Database schema (users, leads tables)
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
- Dark mode SaaS aesthetic preferred
- Original landing page layout (not sidebar/dashboard layout)
- Avoid executive-heavy branding for broader audience appeal
- Subdomain architecture: landing on rxfit.ai, product app on app.rxfit.ai
