/**
 * Guards the contract between client/index.html (the SPA shell saved as
 * dist/public/template.html at build time) and server/blogSsr.ts, which
 * injects crawler HTML for DB-backed posts into that shell at runtime.
 * If someone renames/removes the seo:start block, the #root div, or the
 * <!--app-html--> placeholder, these tests (and the prerender step, which
 * calls the same verifier) fail instead of production silently serving
 * broken crawler HTML.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { verifySsrTemplateMarkers } from "./blogSsr";

const INDEX_HTML = fs.readFileSync(
  path.resolve(__dirname, "..", "client", "index.html"),
  "utf-8",
);

describe("verifySsrTemplateMarkers", () => {
  it("passes on the real client/index.html shell", () => {
    expect(verifySsrTemplateMarkers(INDEX_HTML)).toEqual([]);
  });

  it("flags a removed seo:start/seo:end block", () => {
    const drifted = INDEX_HTML.replace(/<!-- seo:start[\s\S]*?seo:end -->/, "");
    const problems = verifySsrTemplateMarkers(drifted);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("seo:start");
  });

  it("flags a renamed root div", () => {
    const drifted = INDEX_HTML.replace('<div id="root">', '<div id="app">');
    const problems = verifySsrTemplateMarkers(drifted);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('<div id="root">');
  });

  it("flags a removed app-html placeholder", () => {
    const drifted = INDEX_HTML.replace("<!--app-html-->", "");
    const problems = verifySsrTemplateMarkers(drifted);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("<!--app-html-->");
  });

  it("reports all problems at once on an empty template", () => {
    expect(verifySsrTemplateMarkers("<html></html>")).toHaveLength(3);
  });
});
