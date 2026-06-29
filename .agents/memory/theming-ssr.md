---
name: Theming + SSR prerender
description: How light/dark theming must be wired so it survives the prerender + hydrate pipeline on this site.
---

This marketing site is Tailwind v4 **CSS-first** (no `tailwind.config.ts`). Color
tokens are defined in `client/src/index.css` as HSL channel triplets under `:root`
(light) and `.dark` (dark), then exposed to Tailwind via `@theme inline` mapping
`--color-*: hsl(var(--*))`. Add new semantic colors there, not in a JS config.

The site is **prerendered to static HTML** (`entry-server.tsx` + `script/prerender.ts`)
and then hydrated. Theme wiring must respect that:

**Rule:** the theme React state must default to `dark` on the server, and a no-flash
inline `<script>` in `client/index.html` must toggle `.dark` on `<html>` before paint
(reading `localStorage 'theme'`, default dark). Any client component that renders
theme-dependent markup (e.g. a Sun/Moon toggle) must use a `mounted` flag so its first
client render matches the server render.

**Why:** prerendered HTML is generated without a browser, so it has no `localStorage`
and no user theme. If React state derives the theme from the DOM/storage during the
initial render instead of defaulting to the same value the server used, hydration
mismatches (and toggle-icon flicker) result. The inline pre-paint script is what
actually prevents the light/dark flash; React only mirrors that state afterward.

**How to apply:** when adding theme-aware UI, default to dark on server, gate any
storage/DOM reads behind `useEffect`/mounted, and never assume `window`/`localStorage`
exists at module/render time.
