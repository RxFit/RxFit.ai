/**
 * Public liveness endpoint payload for GET /api/health.
 *
 * Why: the UptimeRobot monitor "rxfit prod /api/health" sat at 0% uptime for
 * the whole week of Sept 6–12 because this route did not exist — the SPA
 * served its 404 page for it. A liveness probe that can never pass is worse
 * than none: real outages are indistinguishable from the permanent red.
 *
 * Threat model (threat_model.md): every /api/* route is internet-accessible.
 * This payload therefore carries nothing derived from a connector, no lead or
 * customer data, and no secret — only "the process is up", the stamped build
 * id (so a stale deployment is visible without the admin key) and uptime.
 * It never touches the database, Stripe, Gmail or Sheets, so it cannot be
 * used to exhaust a quota. Dependency health lives behind the admin-keyed
 * /api/internal/credential-health.
 */
import { describeBuild } from "./buildInfo";

export interface HealthPayload {
  status: "ok";
  build: string;
  uptimeSeconds: number;
  checkedAt: string;
}

export function healthPayload(
  now: Date = new Date(),
  uptimeSeconds: number = process.uptime(),
): HealthPayload {
  return {
    status: "ok",
    build: describeBuild(),
    uptimeSeconds: Math.max(0, Math.floor(uptimeSeconds)),
    checkedAt: now.toISOString(),
  };
}
