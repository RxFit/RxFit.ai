import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, Mail } from "lucide-react";
import { track } from "@/lib/analytics";

const SHOWN_KEY = "rxfit_exit_shown";

export default function ExitIntentModal({ slug }: { slug?: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    // Desktop only (fine pointer), once per session.
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (sessionStorage.getItem(SHOWN_KEY) === "1") return;

    const onLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) {
        sessionStorage.setItem(SHOWN_KEY, "1");
        setOpen(true);
        track("cta_exit_modal_show", { slug });
        document.removeEventListener("mouseleave", onLeave);
      }
    };
    document.addEventListener("mouseleave", onLeave);
    return () => document.removeEventListener("mouseleave", onLeave);
  }, [slug]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "blog_exit_intent", plan: "kickstart" }),
      });
      if (!res.ok) throw new Error("failed");
      setStatus("done");
      track("cta_exit_modal_submit", { slug });
    } catch {
      setStatus("error");
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          data-testid="exit-intent-modal"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.3 }}
            className="glass-card rounded-2xl p-8 w-full max-w-md relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white transition-colors"
              data-testid="button-close-exit"
            >
              <X className="w-5 h-5" />
            </button>

            {status === "done" ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-teal-500/15 flex items-center justify-center text-teal-400 mx-auto mb-4">
                  <Mail className="w-6 h-6" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">You're on the list!</h3>
                <p className="text-slate-400">Check your inbox — we'll send your next steps shortly.</p>
              </div>
            ) : (
              <>
                <div className="mb-6">
                  <h3 className="text-2xl font-bold text-white mb-2">Before you go…</h3>
                  <p className="text-sm text-slate-400">
                    Get our weekly breakdown of wearable data, coaching science, and what actually
                    moves the needle. No spam.
                  </p>
                </div>
                <form onSubmit={submit} className="space-y-4">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@email.com"
                    className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    data-testid="input-exit-email"
                  />
                  {status === "error" && <p className="text-sm text-red-400">Something went wrong. Try again.</p>}
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="w-full btn-primary py-3 rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                    data-testid="button-exit-submit"
                  >
                    {status === "loading" ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send me the insights"}
                  </button>
                </form>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
