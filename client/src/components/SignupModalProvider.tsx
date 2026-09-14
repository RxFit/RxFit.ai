import React, { createContext, useContext, useState } from "react";
import SignupModal from "./SignupModal";
import { LIVE_PRICE_IDS, type PlanTier } from "@shared/stripe-constants";

interface SignupModalContextValue {
  open: (plan: PlanTier) => void;
  close: () => void;
}

const SignupModalContext = createContext<SignupModalContextValue | null>(null);

export function useSignupModal(): SignupModalContextValue {
  const ctx = useContext(SignupModalContext);
  if (!ctx) {
    throw new Error("useSignupModal must be used within a SignupModalProvider");
  }
  return ctx;
}

/**
 * The price a buyer is sent to checkout with comes from LIVE_PRICE_IDS, and the
 * server re-derives it from `plan` regardless (see server/checkoutSession.ts).
 *
 * This provider used to fetch /api/stripe/products and override the pinned IDs
 * via `product.metadata.tier -> product.prices[0].id`. That mapping assumes one
 * Stripe product per tier; the real catalog puts all three tiers on a SINGLE
 * product, so the override could only ever collapse every tier onto one
 * arbitrary price (the cheapest via the DB path, the newest via the API path).
 * It was inert only because no product carried metadata.tier — adding one would
 * have started mischarging. Removed rather than repaired.
 */
export function SignupModalProvider({ children }: { children: React.ReactNode }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>("kickstart");
  const open = (plan: PlanTier) => {
    setSelectedPlan(plan);
    setModalOpen(true);
  };
  const close = () => setModalOpen(false);

  return (
    <SignupModalContext.Provider value={{ open, close }}>
      {children}
      <SignupModal
        isOpen={modalOpen}
        onClose={close}
        plan={selectedPlan}
        priceId={LIVE_PRICE_IDS[selectedPlan]}
      />
    </SignupModalContext.Provider>
  );
}
