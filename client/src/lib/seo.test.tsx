/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Seo } from "./seo";

const BASE_PROPS = {
  description: "A test description.",
  canonicalPath: "/test",
};

function propertyMeta(key: string): HTMLMetaElement | null {
  return document.head.querySelector(`meta[property="${key}"]`);
}

describe("Seo social metadata during client navigation", () => {
  afterEach(() => {
    cleanup();
    document.head.querySelectorAll('[data-seo="true"]').forEach((element) => element.remove());
  });

  it("removes fallback dimensions for a custom image and restores them when navigating back", () => {
    const { rerender } = render(<Seo {...BASE_PROPS} title="Fallback Page" />);

    expect(propertyMeta("og:image:width")?.content).toBe("1280");
    expect(propertyMeta("og:image:height")?.content).toBe("720");

    rerender(
      <Seo
        {...BASE_PROPS}
        title="Custom Image Article"
        type="article"
        image="/images/blog/custom.webp"
      />,
    );

    expect(propertyMeta("og:image")?.content).toContain("/images/blog/custom.webp");
    expect(propertyMeta("og:image:width")).toBeNull();
    expect(propertyMeta("og:image:height")).toBeNull();

    rerender(<Seo {...BASE_PROPS} title="Fallback Page" />);

    expect(propertyMeta("og:image:width")?.content).toBe("1280");
    expect(propertyMeta("og:image:height")?.content).toBe("720");
  });
});