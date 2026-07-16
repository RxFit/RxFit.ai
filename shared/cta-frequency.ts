export const STICKY_DISMISS_KEY = "rxfit_sticky_dismissed_at";
export const EXIT_SHOWN_KEY = "rxfit_exit_shown";
export const CTA_ENGAGED_KEY = "rxfit_cta_engaged";

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

export function shouldShowExitModal(
  exitShownValue: string | null,
  ctaEngagedValue: string | null,
): boolean {
  if (exitShownValue === "1") return false;
  if (ctaEngagedValue === "1") return false;
  return true;
}
