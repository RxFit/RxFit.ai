# RxFit.ai Landing Page

## Overview
RxFit.ai is a HealthTech SaaS landing page designed for lead capture and conversion. The product combines AI health data integration (wearables/apps) with real human personal trainer/accountability coaching.

## Current State
- **Frontend:** Dark Mode SaaS landing page with glassmorphism effects, Teal (#2DD4BF) and Coral (#FB923C) accents on a deep slate (#0F172A) background.
- **Backend:** Express server with PostgreSQL database for lead capture.
- **Typography:** Inter font family throughout.

## Project Architecture
- `client/src/pages/LandingPage.tsx` — Main landing page with signup modal
- `client/src/index.css` — Design system (dark mode SaaS theme with glassmorphism utilities)
- `shared/schema.ts` — Database schema (users, leads tables)
- `server/routes.ts` — API routes (`POST /api/leads`, `GET /api/leads`)
- `server/storage.ts` — Database storage interface using Drizzle ORM
- `server/db.ts` — PostgreSQL connection pool

## Key Features
- Hero section with animated dashboard mockup
- Problem/Agitation section highlighting pain points
- Solution features section (AI Hub, Human Coach)
- 3-tier Value Stack pricing (Kickstart $49/mo, Committed $490/yr, Transformation $997)
- Lead capture modal triggered by all CTA buttons, saves to PostgreSQL
- Testimonial section
- Mobile responsive

## User Preferences
- Dark mode SaaS aesthetic preferred
- Original landing page layout (not sidebar/dashboard layout)
- Avoid executive-heavy branding for broader audience appeal
