declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Record<string, unknown> }) => void;
  }
}

/**
 * Fire a Plausible custom event. Safe to call even when the Plausible
 * script hasn't loaded (e.g. in local dev) — it simply no-ops.
 */
export function track(event: string, props?: Record<string, unknown>) {
  try {
    window.plausible?.(event, props ? { props } : undefined);
  } catch {
    /* ignore */
  }
}
