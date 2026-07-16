/**
 * Unit tests for the SEO feedback loop's pure logic:
 * striking-distance detection, refresh-candidate selection, refresh cadence,
 * internal-link caps, and the interlinking appendix.
 */
import { describe, it, expect } from "vitest";
import {
  detectStrikingDistance,
  pickRefreshCandidate,
  pageToSlug,
  type StrikingPost,
} from "./seoFeedback";
import { isRefreshDue } from "./blogScheduler";
import { maxInternalLinks, buildRelatedReadingAppendix, rankPostsByRelevance } from "./blogGenerator";

function row(page: string, query: string, position: number, impressions: number, clicks = 0) {
  return {
    page,
    query,
    clicks,
    impressions,
    ctrBps: impressions > 0 ? Math.round((clicks / impressions) * 10000) : 0,
    positionX100: Math.round(position * 100),
  };
}

describe("pageToSlug", () => {
  it("extracts slugs from blog paths only", () => {
    expect(pageToSlug("/blog/my-post")).toBe("my-post");
    expect(pageToSlug("/blog")).toBeNull();
    expect(pageToSlug("/")).toBeNull();
    expect(pageToSlug("/blog/my-post/extra")).toBeNull();
  });
});

describe("detectStrikingDistance", () => {
  it("keeps only queries in positions 5-20 with enough impressions", () => {
    const rows = [
      row("/blog/a", "in range", 8, 100),
      row("/blog/a", "too good", 2, 500),
      row("/blog/a", "too deep", 35, 400),
      row("/blog/a", "too few impressions", 10, 5),
      row("/", "not a post", 9, 300),
    ];
    const out = detectStrikingDistance(rows);
    expect(out).toHaveLength(1);
    expect(out[0].slug).toBe("a");
    expect(out[0].queries.map((q) => q.query)).toEqual(["in range"]);
    expect(out[0].opportunity).toBe(100);
  });

  it("ranks posts by total striking impressions and queries by impressions", () => {
    const rows = [
      row("/blog/small", "q1", 10, 50),
      row("/blog/big", "q2", 12, 300),
      row("/blog/big", "q3", 7, 900),
    ];
    const out = detectStrikingDistance(rows);
    expect(out.map((p) => p.slug)).toEqual(["big", "small"]);
    expect(out[0].queries.map((q) => q.query)).toEqual(["q3", "q2"]);
    expect(out[0].opportunity).toBe(1200);
  });

  it("includes boundary positions 5 and 20", () => {
    const rows = [row("/blog/a", "low edge", 5, 30), row("/blog/a", "high edge", 20, 30)];
    expect(detectStrikingDistance(rows)[0].queries).toHaveLength(2);
  });
});

describe("pickRefreshCandidate", () => {
  const now = new Date("2026-07-16T12:00:00Z");
  const post = (slug: string, date: string, updatedDate: string | null = null) => ({
    slug,
    date,
    updatedDate,
    createdAt: new Date(date),
  });
  const striking = (slug: string): StrikingPost => ({
    slug,
    opportunity: 100,
    queries: [{ query: "q", clicks: 1, impressions: 100, ctr: 0.01, position: 8 }],
  });

  it("prefers striking-distance posts", () => {
    const posts = [post("old", "2026-01-01"), post("hit", "2026-05-01")];
    const out = pickRefreshCandidate(posts, [striking("hit")], now);
    expect(out?.slug).toBe("hit");
    expect(out?.reason).toBe("striking-distance");
    expect(out?.queries).toHaveLength(1);
  });

  it("skips striking posts refreshed within the last 14 days", () => {
    const posts = [post("hit", "2026-01-01", "2026-07-10"), post("stale", "2026-02-01")];
    const out = pickRefreshCandidate(posts, [striking("hit")], now);
    expect(out?.slug).toBe("stale");
    expect(out?.reason).toBe("freshness");
  });

  it("falls back to the oldest stale post (>= 45 days)", () => {
    const posts = [post("newish", "2026-07-01"), post("oldest", "2026-01-01"), post("older", "2026-03-01")];
    const out = pickRefreshCandidate(posts, [], now);
    expect(out?.slug).toBe("oldest");
    expect(out?.reason).toBe("freshness");
  });

  it("uses updatedDate over date for staleness", () => {
    const posts = [post("refreshed-recently", "2025-01-01", "2026-07-01")];
    expect(pickRefreshCandidate(posts, [], now)).toBeNull();
  });

  it("returns null when nothing qualifies", () => {
    const posts = [post("fresh", "2026-07-01")];
    expect(pickRefreshCandidate(posts, [], now)).toBeNull();
  });
});

describe("isRefreshDue", () => {
  const now = new Date("2026-07-16T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  it("is not due while a new post is due (publishing has priority)", () => {
    expect(isRefreshDue(undefined, daysAgo(10), now)).toBe(false);
    expect(isRefreshDue(daysAgo(30), undefined, now)).toBe(false);
  });

  it("is due when never refreshed and no new post is due", () => {
    expect(isRefreshDue(undefined, daysAgo(1), now)).toBe(true);
  });

  it("respects the 4-day refresh interval", () => {
    expect(isRefreshDue(daysAgo(5), daysAgo(1), now)).toBe(true);
    expect(isRefreshDue(daysAgo(2), daysAgo(1), now)).toBe(false);
  });
});

describe("maxInternalLinks", () => {
  it("caps at ~5 links per 1,000 words with a floor of 5", () => {
    expect(maxInternalLinks(400)).toBe(5);
    expect(maxInternalLinks(1000)).toBe(5);
    expect(maxInternalLinks(1500)).toBe(8);
    expect(maxInternalLinks(2000)).toBe(10);
  });
});

describe("buildRelatedReadingAppendix", () => {
  it("builds a safe markdown link", () => {
    expect(buildRelatedReadingAppendix({ slug: "my-post", title: "My Post" })).toBe(
      "\n\n**Related reading:** [My Post](/blog/my-post)",
    );
  });

  it("strips markdown-significant characters from titles", () => {
    const out = buildRelatedReadingAppendix({
      slug: "x",
      title: "Evil](/bad) [link\\",
    });
    expect(out).toBe("\n\n**Related reading:** [Evil/bad link](/blog/x)");
  });
});

describe("rankPostsByRelevance", () => {
  it("puts topically overlapping posts first and uses pillar as a tiebreak", () => {
    const posts = [
      { slug: "unrelated", title: "Stripe billing tips", pillar: "other" },
      { slug: "same-pillar", title: "Random musings", pillar: "sleep" },
      { slug: "match", title: "Sleep tracking with wearables", pillar: "sleep" },
    ];
    const ranked = rankPostsByRelevance({ theme: "sleep tracking wearables", pillar: "sleep" }, posts);
    expect(ranked[0].slug).toBe("match");
    expect(ranked[1].slug).toBe("same-pillar");
  });
});
