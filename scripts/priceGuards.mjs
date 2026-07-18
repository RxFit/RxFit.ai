/**
 * Pure price-drift guard helpers used by scripts/validate-seo.mjs and
 * regression-tested in scripts/priceGuards.test.ts, so a refactor of these
 * patterns can't quietly stop catching drift.
 *
 * All functions are side-effect free: they take source text and return
 * arrays of error strings (empty = clean).
 */

/**
 * Parse PLAN_PRICING amounts/savings/trialDays from stripe-constants source.
 * Returns { amounts, savings, trialDays } or { error } when unparseable.
 */
export function parsePlanPricing(src) {
  // Scope parsing to the PLAN_PRICING block so unrelated numbers elsewhere in
  // the file can never leak into the allowed set.
  const block = src.match(/PLAN_PRICING\s*=\s*\{([\s\S]*?)\}\s*as\s*const/);
  if (!block) return { error: "could not locate the PLAN_PRICING block" };
  const amounts = [...block[1].matchAll(/amount:\s*(\d+)/g)].map((m) => Number(m[1]));
  const savings = [...block[1].matchAll(/savings:\s*"\$(\d+)"/g)].map((m) => Number(m[1]));
  const trial = block[1].match(/trialDays:\s*(\d+)/);
  if (amounts.length === 0 || !trial) return { error: "could not parse PLAN_PRICING amounts/trialDays" };
  return { amounts, savings, trialDays: Number(trial[1]) };
}

/**
 * In code files, literal plan amounts and trial phrases are always
 * violations — they must come from PLAN_PRICING / TRIAL_COPY instead.
 * Returns error strings (one per offending line).
 */
export function scanCodeForHardcodedPrices(pricing, relPath, content) {
  const out = [];
  const { amounts, trialDays } = pricing;
  const amountRes = amounts.map((a) => ({
    amount: a,
    // (?!\d) stops half-matching longer amounts ("$490" for a=49);
    // (?!\.\d) stops half-matching cents ("$49.99") while still matching a
    // sentence-ending "$49." — a plain period after the amount is a match.
    re: new RegExp(`\\$${a}(?!\\d)(?!\\.\\d)`, "g"),
  }));
  const trialRes = [
    new RegExp(`\\b${trialDays}[-\\s][Dd]ay\\b`, "g"),
    new RegExp(`free for ${trialDays} days`, "gi"),
  ];
  // Stripe API literals: a numeric unit_amount / trial_period_days in code is
  // always drift-prone — it must be computed from PLAN_PRICING instead
  // (e.g. `unit_amount: PLAN_PRICING.kickstart.amount * 100`).
  const stripeLiteralRes = [
    {
      re: /\bunit_amount\s*:\s*\d+/g,
      msg: "hardcoded Stripe unit_amount — derive it from PLAN_PRICING (amount * 100) in shared/stripe-constants.ts",
    },
    {
      re: /\btrial_period_days\s*:\s*\d+/g,
      msg: "hardcoded Stripe trial_period_days — derive it from PLAN_PRICING.kickstart.trialDays in shared/stripe-constants.ts",
    },
  ];
  const lines = content.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const { amount, re } of amountRes) {
      if (re.test(line))
        out.push(`${relPath}: line ${i + 1}: hardcoded plan price "$${amount}" — derive it from PLAN_PRICING in shared/stripe-constants.ts`);
      re.lastIndex = 0;
    }
    for (const re of trialRes) {
      if (re.test(line))
        out.push(`${relPath}: line ${i + 1}: hardcoded trial copy ("${line.trim().slice(0, 80)}") — derive it from PLAN_PRICING.kickstart.trialDays / TRIAL_COPY`);
      re.lastIndex = 0;
    }
    for (const { re, msg } of stripeLiteralRes) {
      if (re.test(line)) out.push(`${relPath}: line ${i + 1}: ${msg}`);
      re.lastIndex = 0;
    }
  });
  return out;
}

/**
 * MDX prose can't import constants inside <FAQ items> (validate-seo evals
 * them standalone), so instead of banning literals we verify any RxFit price
 * or trial claim still matches the current constants.
 * Returns error strings.
 */
export function scanMdxPriceClaims(pricing, file, body) {
  const out = [];
  const { amounts, savings, trialDays } = pricing;
  const allowedDollars = new Set([...amounts, ...savings]);
  // Trial claims are checked everywhere in the body ("7-day free trial",
  // "free for 7 days" are always about OUR trial; "7-day trend" is not
  // matched, so HRV-style prose stays clean).
  for (const m of body.matchAll(/(\d+)[-\s]day free trial/gi)) {
    if (Number(m[1]) !== trialDays)
      out.push(`${file}: trial claim "${m[0]}" no longer matches PLAN_PRICING trialDays (${trialDays})`);
  }
  for (const m of body.matchAll(/free for (\d+) days/gi)) {
    if (Number(m[1]) !== trialDays)
      out.push(`${file}: trial claim "${m[0]}" no longer matches PLAN_PRICING trialDays (${trialDays})`);
  }
  // Dollar claims are checked per sentence: any $N inside a sentence that
  // mentions RxFit must equal a current plan amount (or documented savings).
  // Competitor/trainer prices live in sentences that don't mention RxFit.
  const sentences = body.split(/(?<=[.!?])\s+|\n/);
  for (const sentence of sentences) {
    if (!/rxfit/i.test(sentence)) continue;
    // (?!\d)(?!\.\d): don't half-match cents ("$49.99"), but DO match a
    // whole-dollar amount at sentence end ("RxFit is $53.").
    for (const m of sentence.matchAll(/\$(\d+)(?!\d)(?!\.\d)/g)) {
      const val = Number(m[1]);
      if (!allowedDollars.has(val))
        out.push(`${file}: RxFit price mention "$${m[1]}" does not match any PLAN_PRICING amount/savings (${[...allowedDollars].join(", ")}) — update this sentence: "${sentence.trim().slice(0, 100)}"`);
    }
  }
  return out;
}

/**
 * Summary-surface price claims: a draft's tldr, description, and
 * keyTakeaways render on the live post (and description in meta tags), so a
 * wrong RxFit price or trial length there would ship just as silently as in
 * the body. Runs the SAME body scanner per field with a per-field label so
 * retry feedback (and build-gate errors) name exactly which surface to fix.
 * Same policy as the body scan: trial claims are checked everywhere, dollar
 * amounts only in sentences that mention RxFit (competitor prices in
 * non-RxFit sentences stay legal). Used by validateDraft at publish time AND
 * by the validate-seo DB gate after price changes.
 * Returns error strings (empty = clean); tolerates missing/malformed fields.
 */
export function scanSummaryPriceClaims(pricing, file, fields) {
  const out = [];
  const { tldr, description, keyTakeaways } = fields ?? {};
  if (typeof tldr === "string" && tldr) {
    out.push(...scanMdxPriceClaims(pricing, `${file}: tldr`, tldr));
  }
  if (typeof description === "string" && description) {
    out.push(...scanMdxPriceClaims(pricing, `${file}: description`, description));
  }
  (Array.isArray(keyTakeaways) ? keyTakeaways : []).forEach((takeaway, i) => {
    if (typeof takeaway === "string" && takeaway) {
      out.push(...scanMdxPriceClaims(pricing, `${file}: keyTakeaways[${i}]`, takeaway));
    }
  });
  return out;
}

/**
 * FAQ price claims: each q/a pair is checked as ONE unit (the question
 * usually names RxFit while the answer carries the price, so sentence-level
 * scanning would miss it). Trial-length claims are checked in every pair;
 * dollar amounts are checked when the pair mentions RxFit — any $N in an
 * RxFit pair must be a current plan amount or documented savings, so
 * competitor prices must live in non-RxFit pairs (same policy as the body
 * scan). Used by validateDraft at publish time AND by the validate-seo DB
 * gate after price changes.
 * Returns error strings (empty = clean).
 */
export function scanFaqPriceClaims(pricing, file, faq) {
  const out = [];
  const { amounts, savings, trialDays } = pricing;
  const allowedDollars = new Set([...amounts, ...savings]);
  (Array.isArray(faq) ? faq : []).forEach((item, i) => {
    const text = `${item?.q ?? ""} ${item?.a ?? ""}`;
    const label = `${file}: faq[${i}]`;
    for (const m of text.matchAll(/(\d+)[-\s]day free trial/gi)) {
      if (Number(m[1]) !== trialDays)
        out.push(`${label}: trial claim "${m[0]}" no longer matches PLAN_PRICING trialDays (${trialDays})`);
    }
    for (const m of text.matchAll(/free for (\d+) days/gi)) {
      if (Number(m[1]) !== trialDays)
        out.push(`${label}: trial claim "${m[0]}" no longer matches PLAN_PRICING trialDays (${trialDays})`);
    }
    if (!/rxfit/i.test(text)) return;
    // Same pattern as the body scan: no cents half-matches, but
    // sentence-ending "$53." is a match.
    for (const m of text.matchAll(/\$(\d+)(?!\d)(?!\.\d)/g)) {
      const val = Number(m[1]);
      if (!allowedDollars.has(val))
        out.push(`${label}: RxFit price mention "$${m[1]}" does not match any PLAN_PRICING amount/savings (${[...allowedDollars].join(", ")}) — fix this Q/A: "${text.trim().slice(0, 100)}"`);
    }
  });
  return out;
}
