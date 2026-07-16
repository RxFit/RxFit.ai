import { describe, it, expect } from "vitest";
import { evaluateTransition } from "./credentialHealthCheck";

describe("evaluateTransition", () => {
  it("stays healthy without alerting when the check passes", () => {
    const r = evaluateTransition({ healthy: true, alerted: false }, true);
    expect(r.shouldAlert).toBe(false);
    expect(r.recovered).toBe(false);
    expect(r.next).toEqual({ healthy: true, alerted: false });
  });

  it("alerts on the healthy → broken transition", () => {
    const r = evaluateTransition({ healthy: true, alerted: false }, false);
    expect(r.shouldAlert).toBe(true);
    expect(r.next).toEqual({ healthy: false, alerted: true });
  });

  it("does not re-alert while the service stays broken", () => {
    const r = evaluateTransition({ healthy: false, alerted: true }, false);
    expect(r.shouldAlert).toBe(false);
    expect(r.next).toEqual({ healthy: false, alerted: true });
  });

  it("reports recovery and resets alert state so a future outage alerts again", () => {
    const r = evaluateTransition({ healthy: false, alerted: true }, true);
    expect(r.recovered).toBe(true);
    expect(r.shouldAlert).toBe(false);
    expect(r.next).toEqual({ healthy: true, alerted: false });

    const again = evaluateTransition(r.next, false);
    expect(again.shouldAlert).toBe(true);
  });
});
