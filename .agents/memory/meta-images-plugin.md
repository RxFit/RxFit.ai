---
name: metaImagesPlugin og:image rewrite
description: How og:image/twitter:image get rewritten at build time, and what it does NOT cover.
---

`vite-plugin-meta-images.ts` (`metaImagesPlugin`) rewrites the `og:image` and
`twitter:image` meta tags in `client/index.html` at build/serve time to
`https://<deployment-domain>/opengraph.<ext>` (png|jpg|jpeg, first found in
`client/public/`). The deployment domain comes from
`REPLIT_INTERNAL_APP_DOMAIN` or `REPLIT_DEV_DOMAIN`.

**Why this matters:**
- The static `content="..."` value in `index.html` is effectively cosmetic —
  the plugin overrides it whenever a domain env var is present. The static
  value is only used as the fallback when NO domain is found, so it must still
  be a valid, absolute, existing URL.
- The plugin does NOT touch client-injected meta or JSON-LD. The `Seo`
  component (`client/src/lib/seo.tsx`) sets per-page og:image (e.g. blog hero)
  and the Article JSON-LD `image` at runtime — those fallbacks are independent
  and must point at real files on their own.
- Because the plugin uses the Replit deployment domain (not the custom
  `rxfit.ai` domain), social-card images for non-article pages resolve to the
  `*.replit.dev`/internal domain rather than the canonical brand domain.

**How to apply:** When auditing OG/social images, check three places, not one:
index.html static fallback, the metaImagesPlugin rewrite, and the runtime
`Seo`/JSON-LD fallbacks.
