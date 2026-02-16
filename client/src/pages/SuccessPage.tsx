import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2, ExternalLink } from "lucide-react";

export default function SuccessPage() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");

    if (!sessionId) {
      setStatus("success");
      return;
    }

    fetch(`/api/stripe/session/${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.customer_email) setEmail(data.customer_email);
        setStatus("success");
      })
      .catch(() => {
        setStatus("success");
      });
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-teal-500/10 blur-[120px] rounded-full -z-10" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="glass-card rounded-3xl p-10 max-w-lg w-full text-center"
      >
        {status === "loading" ? (
          <div className="py-12">
            <Loader2 className="w-12 h-12 animate-spin text-teal-400 mx-auto mb-4" />
            <p className="text-slate-400">Confirming your payment...</p>
          </div>
        ) : (
          <>
            <div className="w-20 h-20 rounded-full bg-teal-500/20 flex items-center justify-center text-teal-400 mx-auto mb-6">
              <Check className="w-10 h-10" />
            </div>

            <h1 className="text-3xl font-bold text-white mb-3" data-testid="text-success-title">
              Welcome to RxFit.ai!
            </h1>

            <p className="text-slate-400 mb-2">
              Your payment was successful{email ? ` and a confirmation has been sent to` : ""}.
            </p>
            {email && (
              <p className="text-teal-400 font-medium mb-6" data-testid="text-success-email">{email}</p>
            )}

            <div className="bg-white/5 rounded-xl p-6 mb-8 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-3">What happens next?</h3>
              <ul className="space-y-3 text-left text-sm text-slate-300">
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                  Check your email for login credentials
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                  Connect your wearable devices in the dashboard
                </li>
                <li className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-teal-500/20 text-teal-400 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                  Your coach will reach out within 24 hours
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <a
                href="https://app.rxfit.ai"
                className="btn-primary w-full py-4 rounded-xl text-lg flex items-center justify-center gap-2"
                data-testid="link-go-to-app"
              >
                Go to Your Dashboard
                <ExternalLink className="w-5 h-5" />
              </a>
              <a
                href="/"
                className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                data-testid="link-back-home"
              >
                Back to homepage
              </a>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
