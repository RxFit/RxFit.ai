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
    re: new RegExp(`\\$${a}(?![\\d.])`, "g"),
  }));
  const trialRes = [
    new RegExp(`\\b${trialDays}[-\\s][Dd]ay\\b`, "g"),
    new RegExp(`free for ${trialDays} days`, "gi"),
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
    for (const m of sentence.matchAll(/\$(\d+)(?![\d.])/g)) {
      const val = Number(m[1]);
      if (!allowedDollars.has(val))
        out.push(`${file}: RxFit price mention "$${m[1]}" does not match any PLAN_PRICING amount/savings (${[...allowedDollars].join(", ")}) — update this sentence: "${sentence.trim().slice(0, 100)}"`);
    }
  }
  return out;
}
