import { describe, it, expect } from "vitest";
import { parseResendArgs } from "./resendArgs";

describe("parseResendArgs", () => {
  it("parses a welcome re-send with name and plan", () => {
    expect(
      parseResendArgs(["welcome", "jane@example.com", "--name", "Jane Doe", "--plan", "Committed"]),
    ).toEqual({ kind: "welcome", email: "jane@example.com", name: "Jane Doe", plan: "Committed" });
  });

  it("parses a lead re-send and defaults plan to Kickstart, name to empty", () => {
    expect(parseResendArgs(["lead", "sam@example.com"])).toEqual({
      kind: "lead",
      email: "sam@example.com",
      name: "",
      plan: "Kickstart",
    });
  });

  it("accepts flags in any position", () => {
    expect(parseResendArgs(["--name", "Sam", "lead", "sam@example.com"])).toMatchObject({
      kind: "lead",
      email: "sam@example.com",
      name: "Sam",
    });
  });

  it("rejects an unknown kind", () => {
    expect(() => parseResendArgs(["nudge", "a@b.co"])).toThrow(/must be "welcome" or "lead"/);
    expect(() => parseResendArgs([])).toThrow(/must be "welcome" or "lead"/);
  });

  it("rejects a missing or invalid email", () => {
    expect(() => parseResendArgs(["welcome"])).toThrow(/valid recipient email/);
    expect(() => parseResendArgs(["welcome", "not-an-email"])).toThrow(/valid recipient email/);
  });

  it("rejects unknown flags, dangling flag values, and extra positionals", () => {
    expect(() => parseResendArgs(["welcome", "a@b.co", "--nope"])).toThrow(/Unknown flag/);
    expect(() => parseResendArgs(["welcome", "a@b.co", "--name"])).toThrow(/Missing value/);
    expect(() => parseResendArgs(["welcome", "a@b.co", "extra"])).toThrow(/extra arguments/);
  });
});
