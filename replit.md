# RxFit.ai Landing Page

## Overview
RxFit.ai is a HealthTech SaaS landing page designed for lead capture, conversion, and payment processing. The product combines AI health data integration (wearables/apps) with real human personal trainer/accountability coaching.

## Current State
- **Frontend:** Dark Mode SaaS landing page with glassmorphism effects, Teal (#2DD4BF) and Coral (#FB923C) accents on a deep slate (#0F172A) background.
- **Backend:** Express server with PostgreSQL database for lead capture and Stripe integration for payments.
- **Payments:** Stripe Checkout integration with 3 pricing tiers, webhooks, and success page.
- **Typography:** Inter font family throughout.

## Project Architecture
- `client/src/pages/LandingPage.tsx` — Main landing page with signup modal (redirects to Stripe Checkout)
- `client/src/pages/SuccessPage.tsx` — Post-payment success page with link to app.rxfit.ai
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

## Key Features
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
