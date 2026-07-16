import { describe, it, expect } from "vitest";
import { sanitizeUrl, markdownToHtml } from "./blogSsr";

describe("sanitizeUrl", () => {
  it("passes through relative URLs, anchors, and safe schemes", () => {
    expect(sanitizeUrl("/blog/some-post")).toBe("/blog/some-post");
    expect(sanitizeUrl("#pricing")).toBe("#pricing");
    expect(sanitizeUrl("relative/path")).toBe("relative/path");
    expect(sanitizeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
    expect(sanitizeUrl("mailto:hi@rxfit.ai")).toBe("mailto:hi@rxfit.ai");
    expect(sanitizeUrl("tel:+15551234567")).toBe("tel:+15551234567");
  });

  it("replaces dangerous schemes with #", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("#");
    expect(sanitizeUrl("data:text/html;base64,PHNjcmlwdD4=")).toBe("#");
    expect(sanitizeUrl("vbscript:msgbox(1)")).toBe("#");
    expect(sanitizeUrl("file:///etc/passwd")).toBe("#");
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(sanitizeUrl("  JaVaScRiPt:alert(1)  ")).toBe("#");
    expect(sanitizeUrl("  HTTPS://example.com  ")).toBe("HTTPS://example.com");
  });

  it("strips control characters used to smuggle schemes", () => {
    expect(sanitizeUrl("java\u0000script:alert(1)")).toBe("#");
    expect(sanitizeUrl("java\tscript:alert(1)".replace("\t", "\u0001"))).toBe("#");
  });
});

describe("markdownToHtml", () => {
  it("renders basic markdown with brand classes", () => {
    const html = markdownToHtml("## Heading\n\nA paragraph with **bold** text.");
    expect(html).toContain("<h2 id=");
    expect(html).toContain('class="text-3xl font-bold');
    expect(html).toContain('<p class="text-lg');
    expect(html).toContain("<strong>bold</strong>");
  });

  it("escapes raw HTML so it cannot inject markup", () => {
    const html = markdownToHtml('Hello <script>alert(1)</script> and <img src=x onerror=alert(1)>');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script");
  });

  it("sanitizes javascript: links to #", () => {
    const html = markdownToHtml("[click me](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });

  it("sanitizes data: image sources", () => {
    const html = markdownToHtml("![pic](data:text/html,evil)");
    expect(html).not.toContain("data:text/html");
  });

  it("keeps safe internal and external links", () => {
    const html = markdownToHtml("[internal](/blog/post) and [external](https://example.com)");
    expect(html).toContain('href="/blog/post"');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('class="text-primary hover:text-primary/80');
  });

  it("assigns heading ids matching the TOC slugs, deduped in order", () => {
    const html = markdownToHtml("## My First Section\n\ntext\n\n## My First Section\n\ntext\n\n## Another One\n\ntext");
    expect(html).toContain('<h2 id="my-first-section"');
    expect(html).toContain('<h2 id="my-first-section-1"');
    expect(html).toContain('<h2 id="another-one"');
  });
});
