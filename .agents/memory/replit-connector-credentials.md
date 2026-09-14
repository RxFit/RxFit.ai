---
name: Replit connector credential fetch quirks
description: How to reliably fetch connector secrets and owner email when the v2 connection API filter breaks
---

# Replit connector credential fetch quirks

- The `/api/v2/connection` endpoint returns **zero items when the `connector_names` (or `environment`) query filter is supplied**, even though the connections exist and are healthy. Fetch with only `include_secrets=true` and filter client-side by `connector_name` / `environment`.
  - **Why:** After re-authorizing connections (July 2026), all filtered queries returned `items: []` while unfiltered queries returned full settings including secrets. The old client snippets that filtered by name silently broke.
  - **How to apply:** Use the shared helper in `server/connectorSettings.ts` for any new connector client instead of copying the old filtered-fetch snippet.
- The re-authorized Gmail connection is **send-only** (scopes: gmail.send, gmail.labels, addons). `users.getProfile` fails with "insufficient authentication scopes", so the owner's own address can't be read from Gmail. Fallback: Drive `GET /drive/v3/about?fields=user` with the Google Sheets connection token returns the owner's `emailAddress` (same Google account). `OWNER_NOTIFICATION_EMAIL` env var overrides everything and is now set (shared env), so owner notifications don't depend on any connector.
- `@replit/connectors-sdk` proxy works for Gmail (`connectors.proxy('google-mail', ...)`) but the Stripe proxy returned "Unrecognized request URL" for valid paths — don't rely on it for Stripe; use the raw secret key from connection settings.
- The GitHub connection cannot push from the shell. `git push origin` fails with "Invalid username or token. Password authentication is not supported" (no credential helper configured), and `listConnections("github")` + `getClient().auth(...)` returns only `{type}` — no token — for every auth type (oauth/token/oauth-user/installation).
  - **Why:** The connector holds the credential but never exposes a raw token usable as a git password; tried all auth variants in one session, none yielded a pushable token.
  - **How to apply:** Don't burn attempts on shell `git push` to GitHub here. Tell the user to push via Replit's Git pane (which authenticates through the integration) — the merge itself can be completed and verified locally without the push.
