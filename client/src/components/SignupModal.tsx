import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, X, Loader2 } from "lucide-react";
import { getClientReferenceId } from "@/lib/utm";

export default function SignupModal({
  isOpen,
  onClose,
  plan,
  priceId,
}: {
  isOpen: boolean;
  onClose: () => void;
  plan: string;
  priceId: string | null;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isRedirecting, setIsRedirecting] = useState(false);

  const mutation = useMutation({
    mutationFn: async (data: { email: string; name: string; plan: string; priceId: string }) => {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, clientReferenceId: getClientReferenceId() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Something went wrong");
      return json;
    },
    onSuccess: (data) => {
      if (data.url) {
        setIsRedirecting(true);
        window.location.href = data.url;
      }
    },
    onError: (err: Error) => {
      setErrorMsg(err.message);
      setIsRedirecting(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (!priceId) {
      setErrorMsg("Pricing not loaded yet. Please try again.");
      return;
    }
    mutation.mutate({ email, name, plan, priceId });
  };

  const planLabels: Record<string, string> = {
    kickstart: "The Kickstart — 7-Day Free Trial",
    committed: "The Committed — Annual Plan",
    transformation: "The Transformation — VIP Access",
  };

  const handleClose = () => {
    setEmail("");
    setName("");
    setErrorMsg("");
    setIsRedirecting(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
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
              onClick={handleClose}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white transition-colors"
              data-testid="button-close-modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <h3 className="text-2xl font-bold text-white mb-2">Get Started with RxFit.ai</h3>
              <p className="text-sm text-slate-400">{planLabels[plan] || plan}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  data-testid="input-name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@email.com"
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  data-testid="input-email"
                />
              </div>

              {errorMsg && (
                <p className="text-sm text-red-400" data-testid="text-error">{errorMsg}</p>
              )}

              <button
                type="submit"
                disabled={mutation.isPending || isRedirecting}
                className="w-full btn-primary py-4 rounded-xl text-lg flex items-center justify-center gap-2 disabled:opacity-50"
                data-testid="button-submit-signup"
              >
                {mutation.isPending || isRedirecting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    {isRedirecting ? "Redirecting to checkout..." : "Processing..."}
                  </>
                ) : (
                  <>
                    {plan === "transformation" ? "Continue to Payment" : "Start Free Trial"}
                    <ChevronRight className="w-5 h-5" />
                  </>
                )}
              </button>

              <p className="text-xs text-slate-500 text-center">
                Secure checkout powered by Stripe. Cancel anytime.
              </p>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
