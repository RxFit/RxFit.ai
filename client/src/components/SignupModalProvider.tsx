import React, { createContext, useContext, useEffect, useState } from "react";
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

export function SignupModalProvider({ children }: { children: React.ReactNode }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanTier>("kickstart");
  const [priceIds, setPriceIds] = useState<Record<string, string>>(LIVE_PRICE_IDS);

  useEffect(() => {
    fetch("/api/stripe/products")
      .then((res) => res.json())
      .then((data) => {
        const ids: Record<string, string> = {};
        for (const product of data.data || []) {
          const tier = product.metadata?.tier;
          if (tier && product.prices?.[0]?.id) {
            ids[tier] = product.prices[0].id;
          }
        }
        if (Object.keys(ids).length > 0) {
          setPriceIds((prev) => ({ ...prev, ...ids }));
        }
      })
      .catch(() => {});
  }, []);

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
        priceId={priceIds[selectedPlan] || null}
      />
    </SignupModalContext.Provider>
  );
}
