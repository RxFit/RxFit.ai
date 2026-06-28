# Threat Model

## Project Overview

RxFit.ai is a public-facing landing site and blog for a HealthTech SaaS product. The production stack is a React/Vite frontend served by an Express backend with PostgreSQL storage for leads, Stripe for checkout and billing, Gmail for transactional email, and Google Sheets for lead syncing. The site is publicly reachable at `https://rxfit.ai`; there is no implemented end-user authentication layer in this repo, so server-side route exposure must be evaluated as internet-accessible by default.

## Assets

- **Lead data** -- names, email addresses, selected plans, and timestamps stored in PostgreSQL and copied to Google Sheets. This is direct PII and a marketing/sales asset.
- **Stripe customer and billing objects** -- Checkout sessions, customer IDs, pricing data, portal sessions, and synced Stripe records in the `stripe` schema. Misuse can expose customer identity or allow unauthorized subscription management.
- **Outbound messaging capability** -- Gmail connector access used to send lead and welcome emails. Abuse could let attackers trigger trusted emails from the business account.
- **Application secrets and connector credentials** -- database URL, Stripe secrets, and Replit connector tokens for Gmail/Sheets/Stripe. Compromise would expose customer data and payment operations.
- **Business reputation and service quotas** -- public forms that trigger email, Stripe, or Sheets work can be abused for spam, noisy data creation, or resource exhaustion.

## Trust Boundaries

- **Browser to Express API** -- all `/api/*` routes receive untrusted client input from the public internet and must not rely on frontend behavior, `Origin`, or obscurity for protection.
- **Express API to PostgreSQL** -- the server can read and write lead data plus synced Stripe data. Query safety and access control at the route layer are critical.
- **Express API to Stripe** -- the server uses a secret Stripe key to create checkout sessions, retrieve session data, look up customers, and mint billing portal sessions.
- **Express API to Google Gmail / Sheets** -- public requests can indirectly trigger outbound email and spreadsheet writes through server-side connectors.
- **Public landing site to separate product app (`app.rxfit.ai`)** -- cross-domain links and customer handoff data cross a repo and hostname boundary; values forwarded to the product app must be treated as attacker-observable.
- **Development/build tooling to production runtime** -- Vite, prerendering, MDX compilation, and diagnostic scripts exist, but only runtime-reachable server handlers and static assets are in production scope unless a build-time path is shown to influence deployed behavior.

## Scan Anchors

- **Production entry point:** `server/index.ts`
- **Primary public API surface:** `server/routes.ts`
- **Highest-risk integrations:** `server/stripeClient.ts`, `server/webhookHandlers.ts`, `server/emailService.ts`, `server/gmailClient.ts`, `server/sheetsService.ts`
- **Persistent data model:** `shared/schema.ts`, `server/storage.ts`, `server/db.ts`
- **Public surfaces:** landing pages, blog pages, `/api/leads`, `/api/stripe/*`, `/sitemap.xml`, `/robots.txt`
- **Authenticated/admin surfaces:** none implemented in this repo; any sensitive route must enforce its own protection or be treated as public
- **Usually dev-only / lower-priority unless proven reachable:** `script/`, `server/vite.ts`, build-time MDX processing, local seeding utilities

## Threat Categories

### Spoofing

This project accepts requests from unauthenticated internet users and also receives Stripe webhooks. The application must verify Stripe webhook signatures on every webhook request and must not treat a browser origin, a caller-supplied email address, or a customer ID as proof of identity. Sensitive billing or data-export routes must require a server-side authorization mechanism or an equivalent single-use proof tied to the requesting user.

### Tampering

Public requests can create leads, initiate Stripe Checkout, and trigger downstream Gmail and Sheets actions. The server must validate every user-controlled field and must derive security-sensitive or business-sensitive values server-side where possible. Client-provided values such as plan identifiers, return-flow identifiers, and cross-domain handoff fields must not be trusted to authorize access or change protected state.

### Information Disclosure

The app stores lead PII and can retrieve Stripe customer details. Public endpoints must not expose lead lists, customer identifiers, email addresses, or connector-derived data to unauthenticated callers. Error handling and logging must avoid leaking secrets, full third-party objects, or sensitive response bodies.

### Denial of Service

Public endpoints can trigger database writes, Stripe API calls, Gmail sends, and Google Sheets writes. The application must bound abuse on these routes with rate limiting or equivalent controls so attackers cannot exhaust quotas, generate large volumes of trusted outbound email, or create unbounded backend work.

### Elevation of Privilege

The largest privilege boundary in this repo is between anonymous visitors and sensitive operational capabilities such as viewing all leads or generating Stripe billing portal sessions. The backend must enforce that only the rightful user can access their own billing resources and that administrative or sales data exports are not reachable from public routes. All database access must remain parameterized, and sensitive identifiers from Stripe must not be accepted as bearer secrets without additional authorization context.
