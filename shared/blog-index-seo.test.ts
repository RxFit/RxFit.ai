import { describe, it, expect } from "vitest";
import {
  BLOG_INDEX_TITLE,
  BLOG_INDEX_DESCRIPTION,
  buildBlogCollectionJsonLd,
  type BlogIndexPostInput,
} from "./blog-index-seo";
import { SITE_URL } from "./site";

const newest: BlogIndexPostInput = {
  slug: "newest-post",
  title: "Newest Post Title",
  description: "Newest post description.",
  date: "2026-07-10",
  updatedDate: "2026-07-14",
  heroImage: "/blog-heroes/newest-post.webp",
  author: "RxFit Coaching Team",
};

const older: BlogIndexPostInput = {
  slug: "older-post",
  title: "Older Post Title",
  description: "Older post description.",
  date: "2026-06-01",
  author: "RxFit Coaching Team",
};

describe("blog index SEO constants", () => {
  it("exports a non-empty title and description", () => {
    expect(BLOG_INDEX_TITLE).toContain("RxFit");
    expect(BLOG_INDEX_DESCRIPTION.length).toBeGreaterThan(50);
  });
});

describe("buildBlogCollectionJsonLd", () => {
  const jsonLd = buildBlogCollectionJsonLd([newest, older]) as any;

  it("emits a Blog node with canonical /blog url and the shared description", () => {
    expect(jsonLd["@context"]).toBe("https://schema.org");
    expect(jsonLd["@type"]).toBe("Blog");
    expect(jsonLd.url).toBe(`${SITE_URL}/blog`);
    expect(jsonLd.name).toBe("The RxFit.ai Blog");
    expect(jsonLd.description).toBe(BLOG_INDEX_DESCRIPTION);
  });

  it("includes the RxFit.ai Organization publisher with logo", () => {
    expect(jsonLd.publisher["@type"]).toBe("Organization");
    expect(jsonLd.publisher.name).toBe("RxFit.ai");
    expect(jsonLd.publisher.url).toBe(SITE_URL);
    expect(jsonLd.publisher.logo).toEqual({
      "@type": "ImageObject",
      url: `${SITE_URL}/logo.png`,
    });
  });

  it("lists every post as an ordered ItemList of BlogPostings", () => {
    const list = jsonLd.mainEntity;
    expect(list["@type"]).toBe("ItemList");
    expect(list.numberOfItems).toBe(2);
    expect(list.itemListElement).toHaveLength(2);

    const [first, second] = list.itemListElement;
    expect(first["@type"]).toBe("ListItem");
    expect(first.position).toBe(1);
    expect(first.url).toBe(`${SITE_URL}/blog/newest-post`);
    expect(first.name).toBe("Newest Post Title");
    expect(second.position).toBe(2);
    expect(second.url).toBe(`${SITE_URL}/blog/older-post`);
  });

  it("builds BlogPosting items with headline, dates, description, and author", () => {
    const posting = jsonLd.mainEntity.itemListElement[0].item;
    expect(posting["@type"]).toBe("BlogPosting");
    expect(posting.headline).toBe("Newest Post Title");
    expect(posting.url).toBe(`${SITE_URL}/blog/newest-post`);
    expect(posting.datePublished).toBe("2026-07-10");
    expect(posting.dateModified).toBe("2026-07-14");
    expect(posting.description).toBe("Newest post description.");
    expect(posting.author).toEqual({ "@type": "Person", name: "RxFit Coaching Team" });
  });

  it("absolutizes relative hero images and omits image/dateModified when absent", () => {
    const withHero = jsonLd.mainEntity.itemListElement[0].item;
    expect(withHero.image).toBe(`${SITE_URL}/blog-heroes/newest-post.webp`);

    const noHero = jsonLd.mainEntity.itemListElement[1].item;
    expect(noHero).not.toHaveProperty("image");
    expect(noHero).not.toHaveProperty("dateModified");
  });

  it("keeps absolute hero image URLs untouched", () => {
    const absolute = buildBlogCollectionJsonLd([
      { ...older, heroImage: "https://cdn.example.com/hero.webp" },
    ]) as any;
    expect(absolute.mainEntity.itemListElement[0].item.image).toBe(
      "https://cdn.example.com/hero.webp",
    );
  });

  it("handles an empty post list (numberOfItems 0, no items)", () => {
    const empty = buildBlogCollectionJsonLd([]) as any;
    expect(empty.mainEntity.numberOfItems).toBe(0);
    expect(empty.mainEntity.itemListElement).toEqual([]);
  });

  it("round-trips through JSON.stringify (fully serializable)", () => {
    const parsed = JSON.parse(JSON.stringify(jsonLd));
    expect(parsed.mainEntity.itemListElement[0].item.headline).toBe("Newest Post Title");
  });
});
