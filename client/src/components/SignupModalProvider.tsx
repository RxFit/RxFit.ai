import React, { createContext, useContext, useEffect, useState } from "react";
import SignupModal from "./SignupModal";
import { PLAN_PRICING, type PlanTier } from "@shared/stripe-constants";

interface SignupModalContextValue {
  open: (plan: PlanTier) => void;
  close: () => void;
}

export type PricingStatus = "loading" | "ready" | "error";

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
  const [priceIds, setPriceIds] = useState<Partial<Record<PlanTier, string>>>({});
  const [pricingStatus, setPricingStatus] = useState<PricingStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stripe/products")
      .then((res) => {
        if (!res.ok) throw new Error(`products fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const ids: Partial<Record<PlanTier, string>> = {};
        for (const product of data.data || []) {
          const tier = product.metadata?.tier as PlanTier | undefined;
          if (tier && tier in PLAN_PRICING && product.prices?.[0]?.id) {
            ids[tier] = product.prices[0].id;
          }
        }
        if (Object.keys(ids).length > 0) {
          setPriceIds(ids);
          setPricingStatus("ready");
        } else {
          setPricingStatus("error");
        }
      })
      .catch(() => {
        if (!cancelled) setPricingStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const open = (plan: PlanTier) => {
    setSelectedPlan(plan);
    setModalOpen(true);
  };
  const close = () => setModalOpen(false);

  const priceId = priceIds[selectedPlan] || null;
  // A missing tier in an otherwise-good response is still an error for that plan.
  const effectiveStatus: PricingStatus =
    pricingStatus === "ready" && !priceId ? "error" : pricingStatus;

  return (
    <SignupModalContext.Provider value={{ open, close }}>
      {children}
      <SignupModal
        isOpen={modalOpen}
        onClose={close}
        plan={selectedPlan}
        priceId={priceId}
        pricingStatus={effectiveStatus}
      />
    </SignupModalContext.Provider>
  );
}
