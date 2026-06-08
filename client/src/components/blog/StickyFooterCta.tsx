import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { X, Sparkles } from "lucide-react";
import { useSignupModal } from "@/components/SignupModalProvider";
import { track } from "@/lib/analytics";

const DISMISS_KEY = "rxfit_sticky_dismissed";

export default function StickyFooterCta({ slug }: { slug?: string }) {
  const { open } = useSignupModal();
  const [location] = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
    const t = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(t);
  }, []);

  if (!visible || location === "/success") return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
    track("cta_sticky_dismiss", { slug });
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[90] border-t border-white/10 bg-slate-950/90 backdrop-blur-md"
      data-testid="sticky-footer-cta"
    >
      <div className="container mx-auto px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:flex w-9 h-9 rounded-full bg-teal-500/15 items-center justify-center text-teal-400 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <p className="text-sm text-slate-200 truncate">
            Ready to turn your data into action? <span className="hidden sm:inline text-slate-400">Coach + AI, free for 7 days.</span>
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              track("cta_sticky_click", { slug });
              open("kickstart");
            }}
            className="btn-primary px-5 py-2.5 rounded-full text-sm whitespace-nowrap"
            data-testid="button-sticky-trial"
          >
            Try RxFit free for 7 days
          </button>
          <button
            onClick={dismiss}
            className="p-2 text-slate-400 hover:text-white"
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
