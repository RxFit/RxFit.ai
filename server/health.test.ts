import { describe, it, expect, vi, afterEach } from "vitest";
import { healthPayload } from "./health";

describe("healthPayload", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports the process as up with the stamped build and whole-second uptime", () => {
    vi.stubEnv("RXFIT_BUILD_ID", "64b2372 built 2026-09-17T14:00Z");
    const p = healthPayload(new Date("2026-09-17T15:00:00.000Z"), 123.9);
    expect(p).toEqual({
      status: "ok",
      build: "64b2372 built 2026-09-17T14:00Z",
      uptimeSeconds: 123,
      checkedAt: "2026-09-17T15:00:00.000Z",
    });
  });

  it("exposes only liveness fields — nothing from a connector, lead or customer", () => {
    const keys = Object.keys(healthPayload()).sort();
    expect(keys).toEqual(["build", "checkedAt", "status", "uptimeSeconds"]);
  });
});
