---
name: Google Search Console integration
description: How GSC data access works here — no Replit connector exists; service-account secret pattern.
---

Rule: There is no Replit connector for Google Search Console. Integrate via a Google service account: user pastes the full JSON key into a secret (`GSC_SERVICE_ACCOUNT_JSON`) and adds the service account's `client_email` as a user on the Search Console property. Auth with `google.auth.JWT` and scope `webmasters.readonly`.

**Why:** searchIntegrations returned no GSC connector; the Gmail/Sheets connectors' OAuth tokens do not carry Search Console scopes.

**How to apply:** Any future Search Console work (or other Google APIs without a connector) should follow this service-account-secret pattern rather than hunting for a connector. GSC analytics data lags ~2 days — end query windows 2 days before today. Property IDs look like `sc-domain:example.com` (domain property) or `https://example.com/` (URL-prefix property).
