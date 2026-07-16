import crypto from "node:crypto";

/**
 * Pure admin-key check shared by the internal/admin routes (/api/leads,
 * /api/internal/credential-health*). Same semantics as the original
 * /api/leads guard: when ADMIN_API_KEY is unset the routes are effectively
 * disabled (always 401), so nothing sensitive is ever public by default.
 * Comparison is constant-time to avoid timing side channels.
 */
export function isAdminAuthorized(
  providedKey: unknown,
  configuredKey: string | undefined,
): boolean {
  if (!configuredKey || typeof providedKey !== "string" || providedKey.length === 0) {
    return false;
  }
  const a = Buffer.from(providedKey);
  const b = Buffer.from(configuredKey);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
