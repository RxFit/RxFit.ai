---
name: MDX ?raw glob is unusable; compute meta with a remark plugin
description: Why reading-time/TOC for MDX posts must be derived at build via a remark plugin, not a ?raw import
---

# MDX `?raw` glob returns the compiled component, not source text

In this Vite + `@mdx-js/rollup` setup, you cannot get the raw markdown source of an
`.mdx` file via `import.meta.glob(..., { query: '?raw', import: 'default' })`.

**Why:** `@mdx-js/rollup` registers its transform with `enforce: 'pre'` and, inside the
transform, does `const [path] = id.split('?')` — it strips the query and compiles any id
whose path ends in `.mdx`. So the `?raw` request is compiled to an MDX module and the
"raw" value you get back is actually the default-exported component (a function). Symptom:
`TypeError: raw.split is not a function` (or `readingTime(raw)` getting a function).

**How to apply:** Derive anything that needs the source (reading time, table of contents,
word count) at build time with a **remark plugin** (`remark-blog-meta.ts`) that walks the
mdast and injects named ESM exports via an `mdxjsEsm` node + `estree-util-value-to-estree`.
That plugin also sets each H2's `id` (`node.data.hProperties.id`) so the generated TOC
anchors match exactly — `rehype-slug` leaves existing ids untouched. The loader then reads
`mod.readingMinutes` / `mod.toc` instead of any raw text.
