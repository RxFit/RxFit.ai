/**
 * Type declarations for scripts/priceGuards.mjs so TypeScript code
 * (server/blogGenerator.ts validateDraft) can import the SAME guard
 * implementation the validate-seo build gate uses — one scanner, no drift.
 */
export interface GuardPricing {
  amounts: number[];
  savings: number[];
  trialDays: number;
}

export function parsePlanPricing(src: string): GuardPricing | { error: string };

export function scanCodeForHardcodedPrices(
  pricing: GuardPricing,
  relPath: string,
  content: string,
): string[];

export function scanMdxPriceClaims(pricing: GuardPricing, file: string, body: string): string[];

export function scanSummaryPriceClaims(
  pricing: GuardPricing,
  file: string,
  fields: {
    tldr?: string | null;
    description?: string | null;
    keyTakeaways?: ReadonlyArray<string | null | undefined> | null;
  },
): string[];

export function scanFaqPriceClaims(
  pricing: GuardPricing,
  file: string,
  faq: ReadonlyArray<{ q?: string | null; a?: string | null } | null | undefined>,
): string[];
