import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { parseFrontmatter, readMdxIndexCards } from "./mdxIndexCards";

// The hand-written-post index pipeline: a regression in frontmatter parsing,
// field mapping, reading-time math, or the draft/untitled filters would
// silently drop MDX posts from the crawler-facing /blog index while the
// route-level tests (which mock readMdxCards) stayed green.

const FM = (fields: string) => `---\n${fields}\n---\n`;

/** Builds the injectable seams from an in-memory {fileName: raw} map. */
function fakeDir(files: Record<string, string>) {
  return {
    dir: "/fake/blog",
    listFiles: (dir: string) => {
      expect(dir).toBe("/fake/blog");
      return Object.keys(files);
    },
    readFile: (filePath: string) => {
      const name = path.basename(filePath);
      if (!(name in files)) throw new Error(`unexpected read: ${filePath}`);
      return files[name];
    },
  };
}

describe("parseFrontmatter", () => {
  it("parses the YAML block into an object", () => {
    const fm = parseFrontmatter(FM('title: "Hello"\ntags:\n  - a\n  - b') + "body");
    expect(fm.title).toBe("Hello");
    expect(fm.tags).toEqual(["a", "b"]);
  });

  it("handles CRLF line endings", () => {
    const fm = parseFrontmatter('---\r\ntitle: "Win"\r\n---\r\nbody');
    expect(fm.title).toBe("Win");
  });

  it("returns {} when there is no frontmatter", () => {
    expect(parseFrontmatter("# Just markdown\n\nNo frontmatter here.")).toEqual({});
  });

  it("returns {} for an unclosed frontmatter block", () => {
    expect(parseFrontmatter("---\ntitle: broken\nno closing fence")).toEqual({});
  });
});

describe("readMdxIndexCards field mapping", () => {
  it("maps every frontmatter field onto the BlogIndexCard", () => {
    const cards = readMdxIndexCards(
      fakeDir({
        "post.mdx": FM(
          [
            'slug: "custom-slug"',
            'title: "My Post"',
            'description: "A description."',
            'date: "2026-01-05"',
            'updatedDate: "2026-02-01"',
            'heroImage: "/blog-heroes/custom-slug.webp"',
            'author: "Dr. Coach"',
            "tags:",
            '  - "AI Coaching"',
            '  - "Wearables"',
          ].join("\n"),
        ) + "Body words here.",
      }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      slug: "custom-slug",
      title: "My Post",
      description: "A description.",
      date: "2026-01-05",
      updatedDate: "2026-02-01",
      heroImage: "/blog-heroes/custom-slug.webp",
      author: "Dr. Coach",
      tags: ["AI Coaching", "Wearables"],
      readingMinutes: 1,
    });
  });

  it("falls back to the file name for a missing slug and safe defaults for optionals", () => {
    const cards = readMdxIndexCards(
      fakeDir({ "from-filename.mdx": FM('title: "T"') + "body" }),
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].slug).toBe("from-filename");
    expect(cards[0].description).toBe("");
    expect(cards[0].date).toBe("");
    expect(cards[0].updatedDate).toBeUndefined();
    expect(cards[0].heroImage).toBeUndefined();
    expect(cards[0].author).toBe("");
    expect(cards[0].tags).toEqual([]);
  });

  it("coerces a non-array tags value to []", () => {
    const cards = readMdxIndexCards(
      fakeDir({ "p.mdx": FM('title: "T"\ntags: "not-a-list"') + "body" }),
    );
    expect(cards[0].tags).toEqual([]);
  });
});

describe("readMdxIndexCards reading time", () => {
  it("computes word-count reading time at 200 wpm", () => {
    const body = Array(400).fill("word").join(" ");
    const cards = readMdxIndexCards(fakeDir({ "p.mdx": FM('title: "T"') + body }));
    expect(cards[0].readingMinutes).toBe(2);
  });

  it("never reports less than 1 minute", () => {
    const cards = readMdxIndexCards(fakeDir({ "p.mdx": FM('title: "T"') + "tiny body" }));
    expect(cards[0].readingMinutes).toBe(1);
  });

  it("does not count frontmatter lines as body words", () => {
    // 100 body words with a bulky frontmatter block: if frontmatter leaked
    // into the word count, this would round up to 1+ extra minute at ~300
    // words. 100/200 rounds to 1 either way, so instead compare against a
    // frontmatter-free file with the same body.
    const body = Array(250).fill("w").join(" "); // 250 words → round(1.25) = 1
    const padding = Array.from({ length: 200 }, (_, i) => `padKey${i}: "value"`).join("\n");
    const withFm = readMdxIndexCards(
      fakeDir({ "p.mdx": FM(`title: "T"\n${padding}`) + body }),
    );
    expect(withFm[0].readingMinutes).toBe(1);
  });
});

describe("readMdxIndexCards filtering", () => {
  it("excludes _-prefixed draft files", () => {
    const cards = readMdxIndexCards(
      fakeDir({
        "_draft.mdx": FM('title: "Draft"') + "body",
        "real.mdx": FM('title: "Real"') + "body",
      }),
    );
    expect(cards.map((c) => c.slug)).toEqual(["real"]);
  });

  it("excludes posts whose frontmatter slug is _-prefixed even if the file name is not", () => {
    const cards = readMdxIndexCards(
      fakeDir({ "published-name.mdx": FM('slug: "_hidden"\ntitle: "T"') + "body" }),
    );
    expect(cards).toEqual([]);
  });

  it("excludes untitled posts", () => {
    const cards = readMdxIndexCards(
      fakeDir({
        "untitled.mdx": FM('description: "no title"') + "body",
        "no-frontmatter.mdx": "just a body",
        "titled.mdx": FM('title: "Yes"') + "body",
      }),
    );
    expect(cards.map((c) => c.slug)).toEqual(["titled"]);
  });

  it("ignores non-.mdx files", () => {
    const cards = readMdxIndexCards(
      fakeDir({
        "README.md": FM('title: "Not a post"') + "body",
        "notes.txt": "text",
        "post.mdx": FM('title: "Post"') + "body",
      }),
    );
    expect(cards.map((c) => c.slug)).toEqual(["post"]);
  });
});

describe("readMdxIndexCards against a real fixture directory", () => {
  it("reads .mdx files from disk with the default fs seams", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mdx-cards-"));
    try {
      fs.writeFileSync(
        path.join(dir, "disk-post.mdx"),
        FM('title: "Disk Post"\ndate: "2026-03-01"') + Array(300).fill("w").join(" "),
      );
      fs.writeFileSync(path.join(dir, "_wip.mdx"), FM('title: "WIP"') + "body");
      const cards = readMdxIndexCards({ dir });
      expect(cards).toHaveLength(1);
      expect(cards[0].slug).toBe("disk-post");
      expect(cards[0].title).toBe("Disk Post");
      expect(cards[0].readingMinutes).toBe(2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults to the real content/blog directory and finds the live posts", () => {
    const cards = readMdxIndexCards();
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.title).toBeTruthy();
      expect(card.slug).toBeTruthy();
      expect(card.slug.startsWith("_")).toBe(false);
      expect(card.readingMinutes).toBeGreaterThanOrEqual(1);
    }
  });
});
