export const STICKY_DISMISS_KEY = "rxfit_sticky_dismissed_at";
export const EXIT_SHOWN_KEY = "rxfit_exit_shown";
export const CTA_ENGAGED_KEY = "rxfit_cta_engaged";
export const EXIT_SUPPRESSED_TRACKED_KEY = "rxfit_exit_suppressed_tracked";

export const STICKY_DISMISS_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isStickyDismissed(
  storedValue: string | null,
  now: number,
  days: number = STICKY_DISMISS_DAYS,
): boolean {
  if (!storedValue) return false;
  const dismissedAt = Number(storedValue);
  if (!Number.isFinite(dismissedAt)) return false;
  if (dismissedAt > now) return true;
  return now - dismissedAt < days * DAY_MS;
}

/**
 * Whole days since the sticky bar was dismissed, for analytics props on the
 * suppression event. null when nothing valid is stored; a clock-skewed
 * future timestamp reports 0 (mirrors isStickyDismissed staying dismissed).
 */
export function daysSinceDismissal(storedValue: string | null, now: number): number | null {
  if (!storedValue) return null;
  const dismissedAt = Number(storedValue);
  if (!Number.isFinite(dismissedAt)) return null;
  if (dismissedAt > now) return 0;
  return Math.floor((now - dismissedAt) / DAY_MS);
}

export type ExitModalDecision = "show" | "suppressed_engaged" | "already_shown";

/**
 * Why the exit-intent modal will or won't appear. "already_shown" is the
 * normal once-per-session behavior (not a cap worth tracking);
 * "suppressed_engaged" is the engagement cap firing — the tracked moment.
 */
export function exitModalDecision(
  exitShownValue: string | null,
  ctaEngagedValue: string | null,
): ExitModalDecision {
  if (exitShownValue === "1") return "already_shown";
  if (ctaEngagedValue === "1") return "suppressed_engaged";
  return "show";
}

export function shouldShowExitModal(
  exitShownValue: string | null,
  ctaEngagedValue: string | null,
): boolean {
  return exitModalDecision(exitShownValue, ctaEngagedValue) === "show";
}
