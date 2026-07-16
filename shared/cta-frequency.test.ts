import { describe, it, expect } from "vitest";
import {
  isStickyDismissed,
  shouldShowExitModal,
  exitModalDecision,
  daysSinceDismissal,
  STICKY_DISMISS_DAYS,
} from "./cta-frequency";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

describe("isStickyDismissed", () => {
  it("is not dismissed when nothing is stored", () => {
    expect(isStickyDismissed(null, NOW)).toBe(false);
    expect(isStickyDismissed("", NOW)).toBe(false);
  });

  it("is dismissed for a recent timestamp within the cap window", () => {
    expect(isStickyDismissed(String(NOW - 1000), NOW)).toBe(true);
    expect(isStickyDismissed(String(NOW - (STICKY_DISMISS_DAYS - 1) * DAY_MS), NOW)).toBe(true);
  });

  it("expires after the cap window so the bar can return", () => {
    expect(isStickyDismissed(String(NOW - STICKY_DISMISS_DAYS * DAY_MS), NOW)).toBe(false);
    expect(isStickyDismissed(String(NOW - 30 * DAY_MS), NOW)).toBe(false);
  });

  it("treats a garbage value as not dismissed (fails open, shows the bar)", () => {
    expect(isStickyDismissed("not-a-number", NOW)).toBe(false);
  });

  it("legacy '1' flag parses as timestamp 1 (ancient) and is treated as expired", () => {
    expect(isStickyDismissed("1", NOW)).toBe(false);
  });

  it("a clock-skewed future timestamp stays dismissed rather than flickering", () => {
    expect(isStickyDismissed(String(NOW + DAY_MS), NOW)).toBe(true);
  });

  it("respects a custom day window", () => {
    expect(isStickyDismissed(String(NOW - 2 * DAY_MS), NOW, 1)).toBe(false);
    expect(isStickyDismissed(String(NOW - 2 * DAY_MS), NOW, 3)).toBe(true);
  });
});

describe("shouldShowExitModal", () => {
  it("shows when neither flag is set", () => {
    expect(shouldShowExitModal(null, null)).toBe(true);
  });

  it("suppresses once shown this session", () => {
    expect(shouldShowExitModal("1", null)).toBe(false);
  });

  it("suppresses for the session once the sticky CTA was clicked", () => {
    expect(shouldShowExitModal(null, "1")).toBe(false);
    expect(shouldShowExitModal("1", "1")).toBe(false);
  });
});

describe("exitModalDecision", () => {
  it("shows when neither flag is set", () => {
    expect(exitModalDecision(null, null)).toBe("show");
  });

  it("already_shown wins over the engagement cap (not a tracked suppression)", () => {
    expect(exitModalDecision("1", null)).toBe("already_shown");
    expect(exitModalDecision("1", "1")).toBe("already_shown");
  });

  it("reports the engagement cap as the tracked suppression reason", () => {
    expect(exitModalDecision(null, "1")).toBe("suppressed_engaged");
  });

  it("stays consistent with shouldShowExitModal", () => {
    for (const shown of [null, "1"]) {
      for (const engaged of [null, "1"]) {
        expect(shouldShowExitModal(shown, engaged)).toBe(
          exitModalDecision(shown, engaged) === "show",
        );
      }
    }
  });
});

describe("daysSinceDismissal", () => {
  it("is null when nothing valid is stored", () => {
    expect(daysSinceDismissal(null, NOW)).toBe(null);
    expect(daysSinceDismissal("", NOW)).toBe(null);
    expect(daysSinceDismissal("not-a-number", NOW)).toBe(null);
  });

  it("reports whole days since dismissal", () => {
    expect(daysSinceDismissal(String(NOW - 1000), NOW)).toBe(0);
    expect(daysSinceDismissal(String(NOW - 2 * DAY_MS), NOW)).toBe(2);
    expect(daysSinceDismissal(String(NOW - (6 * DAY_MS + DAY_MS / 2)), NOW)).toBe(6);
  });

  it("reports 0 for a clock-skewed future timestamp (matches isStickyDismissed staying dismissed)", () => {
    expect(daysSinceDismissal(String(NOW + DAY_MS), NOW)).toBe(0);
  });
});
