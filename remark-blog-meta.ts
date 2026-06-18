import { existsSync } from "node:fs";
import path from "node:path";
import { visit } from "unist-util-visit";
import { toString as mdastToString } from "mdast-util-to-string";
import { valueToEstree } from "estree-util-value-to-estree";

export interface TocEntry {
  id: string;
  text: string;
  depth: number;
}

// Components every published post should contain (see content/blog/README.md
// publish checklist). Drives the build-time author lint warnings below.
const REQUIRED_COMPONENTS = ["TLDR", "FAQ"] as const;
const MIN_INTERNAL_LINKS = 3;

/**
 * Emits non-fatal authoring warnings while MDX compiles so a draft previewed at
 * /blog/<slug> surfaces missing TL;DR / FAQ / hero image / internal links
 * before it's published. Warnings never fail the build — they're a checklist,
 * not a gate.
 */
function lintPost(tree: any, file: any) {
  const filePath: string | undefined = file?.path || file?.history?.[file.history.length - 1];
  const basename = filePath ? path.basename(filePath) : "post.mdx";
  const source: string = typeof file?.value === "string" ? file.value : String(file?.value ?? "");

  const presentComponents = new Set<string>();
  let internalLinks = 0;

  visit(tree, (node: any) => {
    if (
      (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
      typeof node.name === "string"
    ) {
      presentComponents.add(node.name);
    }
    if (node.type === "link" && typeof node.url === "string" && node.url.startsWith("/")) {
      internalLinks += 1;
    }
  });

  const warnings: string[] = [];

  for (const name of REQUIRED_COMPONENTS) {
    if (!presentComponents.has(name)) {
      warnings.push(`missing <${name}> block`);
    }
  }

  // Hero image: must be declared in frontmatter AND the file must exist on disk.
  const heroMatch = source.match(/^heroImage:\s*["']?([^"'\n]+)["']?\s*$/m);
  const heroImage = heroMatch?.[1]?.trim();
  if (!heroImage) {
    warnings.push("missing heroImage in frontmatter");
  } else {
    const heroPath = path.join(process.cwd(), "client", "public", heroImage.replace(/^\//, ""));
    if (!existsSync(heroPath)) {
      warnings.push(`hero image not found at client/public${heroImage}`);
    }
  }

  if (internalLinks < MIN_INTERNAL_LINKS) {
    warnings.push(`only ${internalLinks} internal link(s) — need at least ${MIN_INTERNAL_LINKS}`);
  }

  if (warnings.length > 0) {
    const lines = warnings.map((w) => `  ⚠ ${w}`).join("\n");
    console.warn(`\n[blog-lint] ${basename} has authoring issues:\n${lines}\n`);
  }
}

function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

function exportConst(name: string, value: unknown) {
  return {
    type: "ExportNamedDeclaration",
    specifiers: [],
    source: null,
    declaration: {
      type: "VariableDeclaration",
      kind: "const",
      declarations: [
        {
          type: "VariableDeclarator",
          id: { type: "Identifier", name },
          init: valueToEstree(value),
        },
      ],
    },
  };
}

/**
 * Computes reading time and a heading-based table of contents from the MDX
 * mdast at build time, then injects them as named ESM exports (`readingMinutes`
 * and `toc`). The `?raw` glob cannot be used for this because the MDX plugin
 * strips the query and compiles the file regardless. We also assign the heading
 * `id` ourselves so the TOC anchors match exactly (rehype-slug leaves existing
 * ids untouched).
 */
export function remarkBlogMeta() {
  return (tree: any, file: any) => {
    lintPost(tree, file);

    const toc: TocEntry[] = [];
    const slugs = new Map<string, number>();

    visit(tree, "heading", (node: any) => {
      if (node.depth !== 2) return;
      const text = mdastToString(node);
      let id = slugify(text);
      const seen = slugs.get(id);
      if (seen !== undefined) {
        slugs.set(id, seen + 1);
        id = `${id}-${seen + 1}`;
      } else {
        slugs.set(id, 0);
      }
      node.data = node.data || {};
      node.data.hProperties = { ...(node.data.hProperties || {}), id };
      toc.push({ id, text, depth: node.depth });
    });

    let words = 0;
    visit(tree, (node: any) => {
      if (node.type === "text" || node.type === "inlineCode") {
        words += node.value.trim().split(/\s+/).filter(Boolean).length;
      }
    });
    const readingMinutes = Math.max(1, Math.round(words / 200));

    const program = {
      type: "Program",
      sourceType: "module",
      body: [exportConst("toc", toc), exportConst("readingMinutes", readingMinutes)],
    };

    tree.children.unshift({
      type: "mdxjsEsm",
      value: "",
      data: { estree: program },
    });
  };
}
