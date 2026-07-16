import { describe, it, expect } from "vitest";
import { isPostDue } from "./blogScheduler";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-07-16T12:00:00Z");

describe("isPostDue", () => {
  it("is due when no post has ever been published", () => {
    expect(isPostDue(undefined, now)).toBe(true);
  });

  it("is not due when the latest post is newer than 3 days", () => {
    expect(isPostDue(new Date(now.getTime() - 1 * DAY), now)).toBe(false);
    expect(isPostDue(new Date(now.getTime() - 2.9 * DAY), now)).toBe(false);
    expect(isPostDue(now, now)).toBe(false);
  });

  it("is due when the latest post is exactly 3 days old or older", () => {
    expect(isPostDue(new Date(now.getTime() - 3 * DAY), now)).toBe(true);
    expect(isPostDue(new Date(now.getTime() - 10 * DAY), now)).toBe(true);
  });
});
