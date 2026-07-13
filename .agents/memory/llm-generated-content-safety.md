---
name: LLM-generated content safety
description: Rules for safely rendering AI-generated markdown into crawler/SSR HTML on this site
---

Rule: Treat LLM-generated markdown as untrusted user input everywhere it is rendered.

**Why:** A code review of the automated blog publisher found that escaping `<` before `marked.parse` is not enough — marked does not block `javascript:`/`data:` URLs in links/images, so stored LLM output could inject click-triggered XSS into the server-rendered crawler pages.

**How to apply:** Sanitize URL schemes (allow only http(s)/mailto/tel/relative) at render time via marked `walkTokens`, AND reject disallowed schemes at publish time in the generator's validation (defense in depth). On the client, ReactMarkdown's default URL transform already handles this — keep raw HTML disabled.
