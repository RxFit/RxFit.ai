import { visit } from "unist-util-visit";
import { toString as mdastToString } from "mdast-util-to-string";
import { valueToEstree } from "estree-util-value-to-estree";

export interface TocEntry {
  id: string;
  text: string;
  depth: number;
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
  return (tree: any) => {
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
