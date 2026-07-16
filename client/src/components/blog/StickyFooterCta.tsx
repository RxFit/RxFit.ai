import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { X, Sparkles } from "lucide-react";
import { useSignupModal } from "@/components/SignupModalProvider";
import { track } from "@/lib/analytics";
import { PLAN_PRICING } from "@shared/stripe-constants";
import {
  STICKY_DISMISS_KEY,
  CTA_ENGAGED_KEY,
  isStickyDismissed,
  daysSinceDismissal,
} from "@shared/cta-frequency";

export default function StickyFooterCta({ slug }: { slug?: string }) {
  const { open } = useSignupModal();
  const [location] = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STICKY_DISMISS_KEY);
    const now = Date.now();
    if (isStickyDismissed(stored, now)) {
      // The STICKY_DISMISS_DAYS dismissal cap is hiding the bar on this
      // pageview — track it so Plausible can show how often the cap fires
      // and at what age.
      track("cta_sticky_suppressed", { slug, days_since_dismiss: daysSinceDismissal(stored, now) });
      return;
    }
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, [slug]);

  if (!visible || location === "/success") return null;

  const dismiss = () => {
    localStorage.setItem(STICKY_DISMISS_KEY, String(Date.now()));
    setVisible(false);
    track("cta_sticky_dismiss", { slug });
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[90] border-t border-border bg-card/90 backdrop-blur-md"
      data-testid="sticky-footer-cta"
    >
      <div className="container mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex w-9 h-9 rounded-full bg-primary/15 items-center justify-center text-primary shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <p className="text-sm text-foreground truncate">
            Ready to turn your data into action? <span className="hidden sm:inline text-muted-foreground">Coach + AI, free for {PLAN_PRICING.kickstart.trialDays} days.</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              // High intent: suppress the exit-intent modal for this session.
              sessionStorage.setItem(CTA_ENGAGED_KEY, "1");
              track("cta_sticky_click", { slug });
              open("kickstart");
            }}
            className="btn-primary px-5 py-2.5 rounded-full text-sm whitespace-nowrap"
            data-testid="button-sticky-trial"
          >
            Try RxFit free for {PLAN_PRICING.kickstart.trialDays} days
          </button>
          <button
            onClick={dismiss}
            className="p-2 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
            data-testid="button-sticky-dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
