import { describe, it, expect } from "vitest";
import { verifyPrerenderedRoute } from "./prerenderVerify";

const okHead =
  '<title>Compare | RxFit.ai</title>\n<link rel="canonical" href="https://rxfit.ai/compare" />';
const notFoundHead =
  '<title>Page not found | RxFit.ai</title>\n<link rel="canonical" href="https://rxfit.ai/404" />';

describe("verifyPrerenderedRoute", () => {
  it("accepts a normally rendered route", () => {
    expect(() =>
      verifyPrerenderedRoute("/compare", "<div>Compare page</div>", okHead),
    ).not.toThrow();
  });

  it("throws when the rendered body is empty", () => {
    expect(() => verifyPrerenderedRoute("/compare", "", okHead)).toThrow(
      /empty body/,
    );
    expect(() => verifyPrerenderedRoute("/compare", "   \n", okHead)).toThrow(
      /empty body/,
    );
  });

  it("throws when a route falls through to the NotFound (404) page", () => {
    expect(() =>
      verifyPrerenderedRoute("/new-page", "<div>404 — Page not found</div>", notFoundHead),
    ).toThrow(/NotFound \(404\) page/);
  });

  it("does not confuse a page canonical containing '404' text with the NotFound canonical", () => {
    const head =
      '<link rel="canonical" href="https://rxfit.ai/blog/what-is-a-404-error" />';
    expect(() =>
      verifyPrerenderedRoute("/blog/what-is-a-404-error", "<div>post</div>", head),
    ).not.toThrow();
  });
});
