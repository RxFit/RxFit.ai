/**
 * @vitest-environment jsdom
 *
 * Guards the sticky-bar impression contract: `cta_sticky_shown` fires exactly
 * when the bar actually becomes visible (after the 1.2s show delay, never on
 * /success, never on a suppressed pageview), once per slug — so Plausible's
 * click/dismiss/suppression rates have a true impression denominator instead
 * of raw pageviews.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { STICKY_DISMISS_KEY } from "@shared/cta-frequency";

const trackMock = vi.fn();
vi.mock("@/lib/analytics", () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

const openMock = vi.fn();
vi.mock("@/components/SignupModalProvider", () => ({
  useSignupModal: () => ({ open: openMock }),
}));

let mockLocation = "/blog/test-post";
vi.mock("wouter", () => ({
  useLocation: () => [mockLocation, vi.fn()],
}));

import StickyFooterCta from "./StickyFooterCta";

function eventsNamed(name: string) {
  return trackMock.mock.calls.filter(([event]) => event === name);
}

describe("StickyFooterCta impression tracking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    trackMock.mockClear();
    openMock.mockClear();
    mockLocation = "/blog/test-post";
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("fires cta_sticky_shown with the slug only after the 1.2s show delay", () => {
    render(<StickyFooterCta slug="test-post" />);

    expect(screen.queryByTestId("sticky-footer-cta")).toBeNull();
    expect(eventsNamed("cta_sticky_shown")).toHaveLength(0);

    act(() => vi.advanceTimersByTime(1199));
    expect(eventsNamed("cta_sticky_shown")).toHaveLength(0);

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByTestId("sticky-footer-cta")).toBeTruthy();
    expect(eventsNamed("cta_sticky_shown")).toEqual([
      ["cta_sticky_shown", { slug: "test-post" }],
    ]);
  });

  it("fires the impression only once per slug across re-renders", () => {
    const { rerender } = render(<StickyFooterCta slug="test-post" />);
    act(() => vi.advanceTimersByTime(1200));
    rerender(<StickyFooterCta slug="test-post" />);
    act(() => vi.advanceTimersByTime(5000));

    expect(eventsNamed("cta_sticky_shown")).toHaveLength(1);
  });

  it("fires a NEW impression when the slug changes while the bar stays mounted (SPA navigation)", () => {
    const { rerender } = render(<StickyFooterCta slug="post-one" />);
    act(() => vi.advanceTimersByTime(1200));
    expect(eventsNamed("cta_sticky_shown")).toEqual([["cta_sticky_shown", { slug: "post-one" }]]);

    rerender(<StickyFooterCta slug="post-two" />);
    act(() => vi.advanceTimersByTime(1200));
    expect(eventsNamed("cta_sticky_shown")).toEqual([
      ["cta_sticky_shown", { slug: "post-one" }],
      ["cta_sticky_shown", { slug: "post-two" }],
    ]);
  });

  it("never fires an impression on /success even after the delay", () => {
    mockLocation = "/success";
    render(<StickyFooterCta slug="test-post" />);
    act(() => vi.advanceTimersByTime(5000));

    expect(screen.queryByTestId("sticky-footer-cta")).toBeNull();
    expect(eventsNamed("cta_sticky_shown")).toHaveLength(0);
  });

  it("fires cta_sticky_suppressed instead of an impression when the 7-day dismissal cap hides the bar", () => {
    localStorage.setItem(STICKY_DISMISS_KEY, String(Date.now() - 24 * 60 * 60 * 1000));
    render(<StickyFooterCta slug="test-post" />);
    act(() => vi.advanceTimersByTime(5000));

    expect(screen.queryByTestId("sticky-footer-cta")).toBeNull();
    expect(eventsNamed("cta_sticky_shown")).toHaveLength(0);
    expect(eventsNamed("cta_sticky_suppressed")).toEqual([
      ["cta_sticky_suppressed", { slug: "test-post", days_since_dismiss: 1 }],
    ]);
  });

  it("keeps the click and dismiss events intact alongside the impression", () => {
    render(<StickyFooterCta slug="test-post" />);
    act(() => vi.advanceTimersByTime(1200));

    fireEvent.click(screen.getByTestId("button-sticky-trial"));
    expect(eventsNamed("cta_sticky_click")).toEqual([["cta_sticky_click", { slug: "test-post" }]]);
    expect(openMock).toHaveBeenCalledWith("kickstart");

    fireEvent.click(screen.getByTestId("button-sticky-dismiss"));
    expect(eventsNamed("cta_sticky_dismiss")).toEqual([
      ["cta_sticky_dismiss", { slug: "test-post" }],
    ]);
    expect(screen.queryByTestId("sticky-footer-cta")).toBeNull();
    // Exactly one impression across the whole interaction.
    expect(eventsNamed("cta_sticky_shown")).toHaveLength(1);
  });
});
