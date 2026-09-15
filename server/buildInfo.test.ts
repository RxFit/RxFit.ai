import { describe, it, expect } from "vitest";
import { DEV_BUILD_ID, describeBuild, formatBuildId } from "./buildInfo";

describe("describeBuild", () => {
  it("names an unbundled dev process plainly when no build id was stamped", () => {
    expect(describeBuild(undefined)).toBe(DEV_BUILD_ID);
    expect(describeBuild("   ")).toBe(DEV_BUILD_ID);
  });

  it("returns the stamped id verbatim", () => {
    expect(describeBuild("c116d85 built 2026-09-15T00:00Z")).toBe(
      "c116d85 built 2026-09-15T00:00Z",
    );
  });
});

describe("formatBuildId", () => {
  const builtAt = new Date("2026-09-15T01:02:03.456Z");

  it("joins sha and minute-precision build time", () => {
    expect(formatBuildId({ sha: "c116d85", dirty: false, builtAt })).toBe(
      "c116d85 built 2026-09-15T01:02Z",
    );
  });

  it("flags a dirty tree, so a deploy from uncommitted edits is visible in every alert", () => {
    expect(formatBuildId({ sha: "c116d85", dirty: true, builtAt })).toBe(
      "c116d85-dirty built 2026-09-15T01:02Z",
    );
  });

  it("still produces an id when git is unavailable at build time", () => {
    expect(formatBuildId({ sha: null, dirty: false, builtAt })).toBe(
      "unknown-commit built 2026-09-15T01:02Z",
    );
  });
});
