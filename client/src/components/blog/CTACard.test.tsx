/**
 * @vitest-environment jsdom
 *
 * Guards the inline CTA card impression contract: `cta_card_shown`
 * {slug, tier} fires exactly once per card, the first time the card becomes
 * at least half visible (IntersectionObserver, threshold 0.5) — never for
 * cards the reader doesn't scroll to. This gives Plausible a true
 * impression→click denominator per tier and placement depth, so a low click
 * count can be told apart from "the card sits below where readers stop."
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";

const trackMock = vi.fn();
vi.mock("@/lib/analytics", () => ({
  track: (...args: unknown[]) => trackMock(...args),
}));

const openMock = vi.fn();
vi.mock("@/components/SignupModalProvider", () => ({
  useSignupModal: () => ({ open: openMock }),
}));

import { CTACard } from "./MdxComponents";

/** Minimal IntersectionObserver stand-in: tests drive visibility manually. */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly options?: IntersectionObserverInit;
  elements = new Set<Element>();
  disconnected = false;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    MockIntersectionObserver.instances.push(this);
  }
  observe(el: Element) {
    this.elements.add(el);
  }
  unobserve(el: Element) {
    this.elements.delete(el);
  }
  disconnect() {
    this.elements.clear();
    this.disconnected = true;
  }
  /** Simulate the observed element(s) crossing the visibility threshold. */
  intersect(isIntersecting: boolean, ratio = isIntersecting ? 0.6 : 0) {
    const entries = Array.from(this.elements).map(
      (target) =>
        ({ target, isIntersecting, intersectionRatio: ratio }) as IntersectionObserverEntry,
    );
    act(() => this.callback(entries, this as unknown as IntersectionObserver));
  }
}

function eventsNamed(name: string) {
  return trackMock.mock.calls.filter(([event]) => event === name);
}

function lastObserver() {
  const inst = MockIntersectionObserver.instances.at(-1);
  if (!inst) throw new Error("no IntersectionObserver was created");
  return inst;
}

describe("CTACard impression tracking", () => {
  beforeEach(() => {
    trackMock.mockClear();
    openMock.mockClear();
    MockIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("fires cta_card_shown {slug, tier} once the card first becomes half visible — not on mount", () => {
    render(<CTACard plan="kickstart" slug="test-post" />);

    // Card renders and is observed at the 50% visibility threshold,
    // but no impression fires before it scrolls into view.
    expect(screen.getByTestId("blog-cta-kickstart")).toBeTruthy();
    const observer = lastObserver();
    expect(observer.options?.threshold).toBe(0.5);
    expect(observer.elements.size).toBe(1);
    expect(eventsNamed("cta_card_shown")).toHaveLength(0);

    observer.intersect(true);
    expect(eventsNamed("cta_card_shown")).toEqual([
      ["cta_card_shown", { slug: "test-post", tier: "kickstart" }],
    ]);
  });

  it("does NOT fire while the card is only barely visible (isIntersecting but ratio < 0.5)", () => {
    render(<CTACard plan="kickstart" slug="test-post" />);
    const observer = lastObserver();

    // Browsers report isIntersecting=true at ANY non-zero visibility; the
    // impression must still wait for the 50% ratio.
    observer.intersect(true, 0.3);
    expect(eventsNamed("cta_card_shown")).toHaveLength(0);

    observer.intersect(true, 0.6);
    expect(eventsNamed("cta_card_shown")).toEqual([
      ["cta_card_shown", { slug: "test-post", tier: "kickstart" }],
    ]);
  });

  it("never fires for a card that never scrolls into view", () => {
    render(<CTACard plan="committed" slug="test-post" />);

    // Observer callbacks with isIntersecting=false (e.g. initial observation
    // of an off-screen card) must not count as impressions.
    lastObserver().intersect(false);
    expect(eventsNamed("cta_card_shown")).toHaveLength(0);
  });

  it("fires exactly once per card across repeated intersections and re-renders", () => {
    const { rerender } = render(<CTACard plan="kickstart" slug="test-post" />);
    const observer = lastObserver();

    observer.intersect(true);
    // Scroll away and back — same card, no second impression.
    observer.intersect(false);
    observer.intersect(true);
    // Re-render with identical props must not re-arm the observer.
    rerender(<CTACard plan="kickstart" slug="test-post" />);
    lastObserver().intersect(true);

    expect(eventsNamed("cta_card_shown")).toHaveLength(1);
    // The firing observer stopped watching after the impression.
    expect(observer.disconnected).toBe(true);
  });

  it("fires a NEW impression when the card is reused for a different slug (SPA navigation)", () => {
    const { rerender } = render(<CTACard plan="kickstart" slug="post-one" />);
    lastObserver().intersect(true);

    rerender(<CTACard plan="kickstart" slug="post-two" />);
    lastObserver().intersect(true);

    expect(eventsNamed("cta_card_shown")).toEqual([
      ["cta_card_shown", { slug: "post-one", tier: "kickstart" }],
      ["cta_card_shown", { slug: "post-two", tier: "kickstart" }],
    ]);
  });

  it("tracks each card on the page independently with its own tier", () => {
    render(
      <>
        <CTACard plan="kickstart" slug="test-post" />
        <CTACard plan="transformation" slug="test-post" />
      </>,
    );
    const [first, second] = MockIntersectionObserver.instances;

    // Only the first card is scrolled to.
    first.intersect(true);
    expect(eventsNamed("cta_card_shown")).toEqual([
      ["cta_card_shown", { slug: "test-post", tier: "kickstart" }],
    ]);

    second.intersect(true);
    expect(eventsNamed("cta_card_shown")).toEqual([
      ["cta_card_shown", { slug: "test-post", tier: "kickstart" }],
      ["cta_card_shown", { slug: "test-post", tier: "transformation" }],
    ]);
  });

  it("keeps the click event intact alongside the impression", () => {
    render(<CTACard plan="kickstart" slug="test-post" />);
    lastObserver().intersect(true);

    fireEvent.click(screen.getByTestId("button-blog-cta-kickstart"));
    expect(eventsNamed("cta_inline_click")).toEqual([
      ["cta_inline_click", { plan: "kickstart", slug: "test-post" }],
    ]);
    expect(openMock).toHaveBeenCalledWith("kickstart");
    expect(eventsNamed("cta_card_shown")).toHaveLength(1);
  });

  it("renders safely (no impression, no crash) when IntersectionObserver is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<CTACard plan="kickstart" slug="test-post" />);

    expect(screen.getByTestId("blog-cta-kickstart")).toBeTruthy();
    expect(eventsNamed("cta_card_shown")).toHaveLength(0);
  });
});
