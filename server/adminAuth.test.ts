import { describe, it, expect } from "vitest";
import { isAdminAuthorized } from "./adminAuth";

describe("isAdminAuthorized", () => {
  it("rejects everything when no admin key is configured (routes disabled)", () => {
    expect(isAdminAuthorized("anything", undefined)).toBe(false);
    expect(isAdminAuthorized("anything", "")).toBe(false);
  });

  it("rejects missing, non-string, empty, and wrong keys", () => {
    expect(isAdminAuthorized(undefined, "secret")).toBe(false);
    expect(isAdminAuthorized(["secret"], "secret")).toBe(false);
    expect(isAdminAuthorized("", "secret")).toBe(false);
    expect(isAdminAuthorized("wrong", "secret")).toBe(false);
    expect(isAdminAuthorized("secret-but-longer", "secret")).toBe(false);
  });

  it("accepts the exact configured key", () => {
    expect(isAdminAuthorized("secret", "secret")).toBe(true);
  });
});
