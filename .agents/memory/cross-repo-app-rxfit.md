---
name: Cross-repo — app.rxfit.ai lives in a separate private GitHub repo
description: RxFit is two repos; cross-domain SEO work may require editing the OTHER repo via the GitHub connection.
---

# RxFit is split across two repositories

- **This workspace** = `rxfit.ai` — marketing site + blog only.
- **`app.rxfit.ai`** = the product web app, a **separate private GitHub repo**:
  `github.com/RxFit/AppRxFitai` (default branch `main`). It is a large monorepo;
  the public marketing surface is `client/src/pages/landing.tsx` (has its own
  `<nav>` header + `<footer>`) and `client/index.html` (head/meta/JSON-LD).

**Why this matters:** Cross-domain SEO tasks ("one brand" authority, reciprocal
links, mirrored Organization JSON-LD) span BOTH properties. Work described as
"add X on app.rxfit.ai" cannot be done from this workspace's files — it must be
made in the AppRxFitai repo.

**How to apply:**
- Use the Replit **GitHub connection** (`listConnections('github')[0].settings.access_token`)
  to clone/push: `https://x-access-token:<token>@github.com/RxFit/AppRxFitai.git`.
- Keep the Organization JSON-LD (`sameAs`, url, name, logo) **identical** to this
  repo's `client/src/lib/seo.tsx` `ORGANIZATION_JSONLD`. Mismatches weaken the signal.
- **Gotcha:** `/tmp` is wiped between agent turns — clone, edit, commit, and push
  within a single turn (or re-clone each turn). The notebook (`code_execution`) also
  resets between turns, so re-fetch the token each time.
- The remaining cross-domain step (Google Search Console domain property + DNS TXT
  verify + submit both sitemaps) is **manual/user-only** — no agent/repo can do it.
