#!/usr/bin/env node
/**
 * SEO / structured-data validation for the blog.
 *
 * For every content/blog/*.mdx post this script mirrors the JSON-LD that
 * client/src/lib/seo.tsx (Article, BreadcrumbList, Organization, WebSite) and
 * client/src/components/blog/MdxComponents.tsx (FAQPage) generate at runtime,
 * then validates the resulting shapes. It also confirms that every image the
 * tags reference (hero, author photo, default OG image, logo) resolves to a
 * real file in client/public.
 *
 * Exits non-zero on any error so it can run as a CI-style validation step.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLOG_DIR = path.join(ROOT, "content", "blog");
const PUBLIC_DIR = path.join(ROOT, "client", "public");
const INDEX_HTML = path.join(ROOT, "client", "index.html");

const SITE_URL = "https://rxfit.ai";

const errors = [];
const warnings = [];
const err = (file, msg) => errors.push(`${file}: ${msg}`);
const warn = (file, msg) => warnings.push(`${file}: ${msg}`);

/* ---------------- frontmatter parsing (simple YAML subset) ------------- */

function parseFrontmatter(raw, file) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) {
    err(file, "missing frontmatter block (--- ... ---)");
    return { fm: {}, body: raw };
  }
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) {
      err(file, `unparseable frontmatter line: ${JSON.stringify(line)}`);
      continue;
    }
    const [, key, valueRaw] = kv;
    let value = valueRaw.trim();
    try {
      if (value.startsWith('"') || value.startsWith("[") || value.startsWith("{")) {
        value = JSON.parse(value);
      }
    } catch {
      err(file, `frontmatter value for "${key}" is not valid JSON: ${valueRaw}`);
      continue;
    }
    fm[key] = value;
  }
  return { fm, body: raw.slice(m[0].length) };
}

/* ---------------- FAQ extraction from the MDX body ---------------------- */

function extractFaqItems(body, file) {
  const start = body.indexOf("<FAQ");
  if (start === -1) return null;
  const itemsIdx = body.indexOf("items=", start);
  if (itemsIdx === -1) {
    err(file, "<FAQ> found but no items= prop");
    return null;
  }
  const braceStart = body.indexOf("{", itemsIdx);
  let depth = 0;
  let end = -1;
  let inString = false;
  let stringChar = "";
  for (let i = braceStart; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === stringChar) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inString = true;
      stringChar = ch;
    } else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    err(file, "<FAQ items={...}> braces never close");
    return null;
  }
  const expr = body.slice(braceStart + 1, end).trim();
  try {
    // Frontend-authored array literal; evaluated only by this local check.
    const items = new Function(`return (${expr});`)();
    if (!Array.isArray(items)) throw new Error("items is not an array");
    return items;
  } catch (e) {
    err(file, `could not evaluate <FAQ items>: ${e.message}`);
    return null;
  }
}

/* ---------------- JSON-LD builders (mirror seo.tsx) --------------------- */

function buildArticleJsonLd(fm) {
  const canonical = `${SITE_URL}/blog/${fm.slug}`;
  const absImage = fm.heroImage
    ? fm.heroImage.startsWith("http")
      ? fm.heroImage
      : `${SITE_URL}${fm.heroImage}`
    : `${SITE_URL}/opengraph.jpg`;
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: fm.title,
    description: fm.description,
    image: absImage,
    url: canonical,
    mainEntityOfPage: canonical,
    datePublished: fm.date,
    dateModified: fm.updatedDate ?? fm.date,
    author: fm.author
      ? { "@type": "Person", name: fm.author }
      : { "@type": "Organization", name: "RxFit.ai" },
    publisher: {
      "@type": "Organization",
      name: "RxFit.ai",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/logo.png` },
    },
  };
}

function buildBreadcrumbJsonLd(fm) {
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Blog", path: "/blog" },
    { name: fm.title, path: `/blog/${fm.slug}` },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: b.name,
      item: `${SITE_URL}${b.path}`,
    })),
  };
}

function buildFaqJsonLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
}

const ORGANIZATION_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "RxFit.ai",
  url: SITE_URL,
  logo: `${SITE_URL}/logo.png`,
  sameAs: ["https://app.rxfit.ai"],
};

/* ---------------- shape validators -------------------------------------- */

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const isAbsUrl = (v) => isNonEmptyString(v) && /^https:\/\//.test(v);
const isIsoDate = (v) => isNonEmptyString(v) && !Number.isNaN(Date.parse(v));

function validateJsonLdSerializable(obj, label, file) {
  try {
    const s = JSON.stringify(obj);
    JSON.parse(s);
  } catch (e) {
    err(file, `${label} JSON-LD is not serializable: ${e.message}`);
    return false;
  }
  return true;
}

function validateArticle(ld, file) {
  if (!validateJsonLdSerializable(ld, "Article", file)) return;
  if (ld["@context"] !== "https://schema.org") err(file, "Article @context must be https://schema.org");
  if (ld["@type"] !== "Article") err(file, "Article @type must be 'Article'");
  if (!isNonEmptyString(ld.headline)) err(file, "Article headline is missing/empty");
  if (isNonEmptyString(ld.headline) && ld.headline.length > 110)
    warn(file, `Article headline is ${ld.headline.length} chars (>110 may be truncated by Google)`);
  if (!isNonEmptyString(ld.description)) err(file, "Article description is missing/empty");
  if (!isAbsUrl(ld.image)) err(file, `Article image must be an absolute https URL (got ${ld.image})`);
  if (!isAbsUrl(ld.url)) err(file, "Article url must be an absolute https URL");
  if (!isAbsUrl(ld.mainEntityOfPage)) err(file, "Article mainEntityOfPage must be an absolute https URL");
  if (!isIsoDate(ld.datePublished)) err(file, `Article datePublished is not a valid date (got ${ld.datePublished})`);
  if (!isIsoDate(ld.dateModified)) err(file, `Article dateModified is not a valid date (got ${ld.dateModified})`);
  const a = ld.author;
  if (!a || !["Person", "Organization"].includes(a["@type"]) || !isNonEmptyString(a.name))
    err(file, "Article author must be a Person/Organization with a name");
  const p = ld.publisher;
  if (!p || p["@type"] !== "Organization" || !isNonEmptyString(p.name) || !isAbsUrl(p.logo?.url))
    err(file, "Article publisher must be an Organization with a name and absolute logo URL");
}

function validateBreadcrumbs(ld, file) {
  if (!validateJsonLdSerializable(ld, "BreadcrumbList", file)) return;
  if (ld["@type"] !== "BreadcrumbList") err(file, "BreadcrumbList @type is wrong");
  const items = ld.itemListElement;
  if (!Array.isArray(items) || items.length < 2) {
    err(file, "BreadcrumbList must have at least 2 items");
    return;
  }
  items.forEach((it, i) => {
    if (it["@type"] !== "ListItem") err(file, `Breadcrumb item ${i} @type must be ListItem`);
    if (it.position !== i + 1) err(file, `Breadcrumb item ${i} position must be ${i + 1} (got ${it.position})`);
    if (!isNonEmptyString(it.name)) err(file, `Breadcrumb item ${i} name is missing/empty`);
    if (!isAbsUrl(it.item)) err(file, `Breadcrumb item ${i} item must be an absolute https URL`);
  });
}

function validateFaq(ld, file) {
  if (!validateJsonLdSerializable(ld, "FAQPage", file)) return;
  if (ld["@type"] !== "FAQPage") err(file, "FAQPage @type is wrong");
  const qs = ld.mainEntity;
  if (!Array.isArray(qs) || qs.length === 0) {
    err(file, "FAQPage mainEntity must be a non-empty array");
    return;
  }
  qs.forEach((q, i) => {
    if (q["@type"] !== "Question") err(file, `FAQ entry ${i} @type must be Question`);
    if (!isNonEmptyString(q.name)) err(file, `FAQ entry ${i} question text is missing/empty`);
    if (q.acceptedAnswer?.["@type"] !== "Answer" || !isNonEmptyString(q.acceptedAnswer?.text))
      err(file, `FAQ entry ${i} acceptedAnswer must be an Answer with text`);
  });
}

function validateOrganization(ld, file) {
  if (!validateJsonLdSerializable(ld, "Organization", file)) return;
  if (ld["@type"] !== "Organization") err(file, "Organization @type is wrong");
  if (!isNonEmptyString(ld.name)) err(file, "Organization name is missing");
  if (!isAbsUrl(ld.url)) err(file, "Organization url must be absolute https");
  if (!isAbsUrl(ld.logo)) err(file, "Organization logo must be absolute https");
  if (!Array.isArray(ld.sameAs) || !ld.sameAs.every(isAbsUrl))
    err(file, "Organization sameAs must be an array of absolute https URLs");
}

/* ---------------- image resolution --------------------------------------- */

function checkPublicImage(imgPath, label, file) {
  if (!isNonEmptyString(imgPath)) {
    err(file, `${label} is missing/empty`);
    return;
  }
  if (imgPath.startsWith("http")) return; // external URL, can't verify on disk
  if (!imgPath.startsWith("/")) {
    err(file, `${label} must be a root-relative path (got ${imgPath})`);
    return;
  }
  const abs = path.join(PUBLIC_DIR, imgPath);
  if (!abs.startsWith(PUBLIC_DIR + path.sep)) {
    err(file, `${label} escapes client/public (${imgPath})`);
    return;
  }
  if (!fs.existsSync(abs)) err(file, `${label} does not resolve to a real file: client/public${imgPath}`);
  else if (fs.statSync(abs).size === 0) err(file, `${label} file is empty: client/public${imgPath}`);
}

/* ---------------- internal link extraction -------------------------------- */

function loadStaticRoutes() {
  const sitePath = path.join(ROOT, "shared", "site.ts");
  const src = fs.readFileSync(sitePath, "utf8");
  const m = src.match(/STATIC_ROUTES\s*=\s*\[([\s\S]*?)\]/);
  if (!m) {
    errors.push("shared/site.ts: could not locate STATIC_ROUTES array");
    return [];
  }
  const routes = [...m[1].matchAll(/"([^"]+)"/g)].map((r) => r[1]);
  if (routes.length === 0) errors.push("shared/site.ts: STATIC_ROUTES parsed as empty");
  return routes;
}

function extractInternalLinks(body) {
  const links = [];
  // Markdown links/images: [text](/path) — capture root-relative targets only.
  for (const m of body.matchAll(/\]\(\s*(\/[^)\s]*)\s*(?:"[^"]*"\s*)?\)/g)) links.push(m[1]);
  // JSX/HTML href="/path" or href={"/path"} in the MDX body.
  for (const m of body.matchAll(/href=\{?["'](\/[^"']*)["']\}?/g)) links.push(m[1]);
  return links;
}

function checkInternalLinks(file, body, knownSlugs, staticRoutes) {
  for (const raw of extractInternalLinks(body)) {
    // Strip query string and fragment before route matching.
    const target = raw.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
    if (target.startsWith("/blog-heroes/") || /\.[a-z0-9]+$/i.test(target)) continue; // asset paths checked elsewhere
    const blogMatch = target.match(/^\/blog\/([^/]+)$/);
    if (blogMatch) {
      if (!knownSlugs.has(blogMatch[1]))
        err(file, `internal link points to unknown blog post: ${raw} (no MDX or published DB post with slug "${blogMatch[1]}")`);
      continue;
    }
    if (!staticRoutes.includes(target))
      err(file, `internal link points to unknown route: ${raw} (not in shared/site.ts STATIC_ROUTES or /blog/:slug)`);
  }
}

/* ---------------- per-post validation ------------------------------------ */

const REQUIRED_FM = ["title", "slug", "date", "author", "description", "heroImage", "tags", "pillar"];

function validatePost(filePath) {
  const file = path.relative(ROOT, filePath);
  const raw = fs.readFileSync(filePath, "utf8");
  const { fm, body } = parseFrontmatter(raw, file);

  for (const key of REQUIRED_FM) {
    if (fm[key] === undefined || fm[key] === "") err(file, `frontmatter missing required field "${key}"`);
  }
  if (fm.slug && `${fm.slug}.mdx` !== path.basename(filePath) && `_${fm.slug}.mdx` !== path.basename(filePath))
    err(file, `slug "${fm.slug}" does not match filename`);
  if (fm.date && !isIsoDate(fm.date)) err(file, `date "${fm.date}" is not a valid date`);
  if (fm.updatedDate && !isIsoDate(fm.updatedDate)) err(file, `updatedDate "${fm.updatedDate}" is not a valid date`);
  if (isNonEmptyString(fm.description)) {
    if (fm.description.length > 170) warn(file, `meta description is ${fm.description.length} chars (>170 will be truncated)`);
    if (fm.description.length < 50) warn(file, `meta description is only ${fm.description.length} chars (<50 is weak)`);
  }
  if (fm.seoTitle && fm.seoTitle.length > 65) warn(file, `seoTitle is ${fm.seoTitle.length} chars (>65 may be truncated)`);
  if (fm.tags && (!Array.isArray(fm.tags) || fm.tags.length === 0)) err(file, "tags must be a non-empty array");

  checkPublicImage(fm.heroImage, "heroImage", file);
  if (fm.authorPhoto) checkPublicImage(fm.authorPhoto, "authorPhoto", file);

  if (isNonEmptyString(fm.title) && isNonEmptyString(fm.slug)) {
    validateArticle(buildArticleJsonLd(fm), file);
    validateBreadcrumbs(buildBreadcrumbJsonLd(fm), file);
  }

  const faqItems = extractFaqItems(body, file);
  if (faqItems) {
    faqItems.forEach((it, i) => {
      if (!isNonEmptyString(it?.q)) err(file, `FAQ item ${i} has no question (q)`);
      if (!isNonEmptyString(it?.a)) err(file, `FAQ item ${i} has no answer (a)`);
    });
    validateFaq(buildFaqJsonLd(faqItems), file);
  }

  return { slug: fm.slug, body, file };
}

/* ---------------- site-wide checks --------------------------------------- */

function validateSiteDefaults() {
  const file = "client/index.html";
  if (!fs.existsSync(INDEX_HTML)) {
    err(file, "client/index.html not found");
    return;
  }
  const html = fs.readFileSync(INDEX_HTML, "utf8");
  for (const tag of [
    ['property="og:image"', "og:image"],
    ['name="twitter:image"', "twitter:image"],
  ]) {
    const re = new RegExp(`<meta\\s+${tag[0]}\\s+content="([^"]+)"`);
    const m = html.match(re);
    if (!m) {
      err(file, `default ${tag[1]} meta tag is missing`);
      continue;
    }
    const url = m[1];
    if (url.startsWith(SITE_URL)) {
      checkPublicImage(url.slice(SITE_URL.length), `default ${tag[1]}`, file);
    } else if (url.startsWith("/")) {
      checkPublicImage(url, `default ${tag[1]}`, file);
    } else {
      warn(file, `default ${tag[1]} points off-site (${url}); cannot verify file exists`);
    }
  }
  // The Seo component's fallback image and the Organization/publisher logo.
  checkPublicImage("/opengraph.jpg", "Seo default OG image (/opengraph.jpg)", file);
  checkPublicImage("/logo.png", "Organization logo (/logo.png)", "client/src/lib/seo.tsx");
  validateOrganization(ORGANIZATION_JSONLD, "client/src/lib/seo.tsx");
}

/**
 * Landing page AEO wiring: the FAQPage + Product/Offer JSON-LD lives in
 * shared/landing-seo.ts (shape-validated by shared/landing-seo.test.ts), but
 * it only ships if LandingPage.tsx actually passes it into the Seo jsonLd
 * prop. Guard that wiring so a refactor can't silently drop it.
 */
function validateLandingJsonLdWiring() {
  const file = "client/src/pages/LandingPage.tsx";
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    err(file, "LandingPage.tsx not found");
    return;
  }
  const src = fs.readFileSync(abs, "utf8");
  if (!/import\s*\{[^}]*PRICING_JSONLD[^}]*\}\s*from\s*["']@shared\/landing-seo["']/.test(src)) {
    err(file, "must import PRICING_JSONLD from @shared/landing-seo (Product/Offer JSON-LD wiring)");
  }
  if (!/import\s*\{[^}]*FAQ_JSONLD[^}]*\}\s*from\s*["']@shared\/landing-seo["']/.test(src)) {
    err(file, "must import FAQ_JSONLD from @shared/landing-seo (FAQPage JSON-LD wiring)");
  }
  const jsonLdProp = src.match(/jsonLd=\{\[([\s\S]*?)\]\}/);
  if (!jsonLdProp) {
    err(file, "Seo jsonLd prop not found — landing page no longer emits FAQPage/Product JSON-LD");
    return;
  }
  if (!jsonLdProp[1].includes("PRICING_JSONLD")) {
    err(file, "Seo jsonLd prop no longer includes PRICING_JSONLD (Product/Offer structured data dropped)");
  }
  if (!jsonLdProp[1].includes("FAQ_JSONLD")) {
    err(file, "Seo jsonLd prop no longer includes FAQ_JSONLD (FAQPage structured data dropped)");
  }
}

function validateCompareJsonLdWiring() {
  const file = "client/src/pages/ComparePage.tsx";
  const abs = path.join(ROOT, file);
  if (!fs.existsSync(abs)) {
    err(file, "ComparePage.tsx not found");
    return;
  }
  const src = fs.readFileSync(abs, "utf8");
  if (!/import\s*\{[^}]*COMPARE_FAQ_JSONLD[^}]*\}\s*from\s*["']@shared\/compare-seo["']/.test(src)) {
    err(file, "must import COMPARE_FAQ_JSONLD from @shared/compare-seo (FAQPage JSON-LD wiring)");
  }
  const jsonLdProp = src.match(/jsonLd=\{\[([\s\S]*?)\]\}/);
  if (!jsonLdProp) {
    err(file, "Seo jsonLd prop not found — compare page no longer emits FAQPage JSON-LD");
    return;
  }
  if (!jsonLdProp[1].includes("COMPARE_FAQ_JSONLD")) {
    err(file, "Seo jsonLd prop no longer includes COMPARE_FAQ_JSONLD (FAQPage structured data dropped)");
  }
}

/**
 * Hardcoded-price drift guard: all plan price/trial copy must derive from
 * PLAN_PRICING/TRIAL_COPY in shared/stripe-constants.ts. This scan fails the
 * build when a literal plan amount ("$49") or trial phrase ("7-day free
 * trial", "free for 7 days") re-appears in client pages/components, and when
 * MDX blog prose states an RxFit price or trial length that no longer matches
 * the current constants (so a price change can't leave stale copy behind).
 */
function loadPlanPricing() {
  const src = fs.readFileSync(path.join(ROOT, "shared", "stripe-constants.ts"), "utf8");
  // Scope parsing to the PLAN_PRICING block so unrelated numbers elsewhere in
  // the file can never leak into the allowed set.
  const block = src.match(/PLAN_PRICING\s*=\s*\{([\s\S]*?)\}\s*as\s*const/);
  if (!block) {
    errors.push("shared/stripe-constants.ts: could not locate the PLAN_PRICING block");
    return null;
  }
  const amounts = [...block[1].matchAll(/amount:\s*(\d+)/g)].map((m) => Number(m[1]));
  const savings = [...block[1].matchAll(/savings:\s*"\$(\d+)"/g)].map((m) => Number(m[1]));
  const trial = block[1].match(/trialDays:\s*(\d+)/);
  if (amounts.length === 0 || !trial) {
    errors.push("shared/stripe-constants.ts: could not parse PLAN_PRICING amounts/trialDays");
    return null;
  }
  return { amounts, savings, trialDays: Number(trial[1]) };
}

function scanForHardcodedPrices(pricing) {
  if (!pricing) return;
  const { amounts, trialDays } = pricing;
  const codeDirs = ["client/src/pages", "client/src/components"];
  const codeFiles = [];
  for (const dir of codeDirs) {
    const stack = [path.join(ROOT, dir)];
    while (stack.length) {
      const d = stack.pop();
      if (!fs.existsSync(d)) continue;
      for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/\.(tsx?|jsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) codeFiles.push(full);
      }
    }
  }
  // In code, literal plan amounts and trial phrases are always violations —
  // they must come from PLAN_PRICING / TRIAL_COPY instead.
  const amountRes = amounts.map((a) => ({
    amount: a,
    re: new RegExp(`\\$${a}(?![\\d.])`, "g"),
  }));
  const trialRes = [
    new RegExp(`\\b${trialDays}[-\\s][Dd]ay\\b`, "g"),
    new RegExp(`free for ${trialDays} days`, "gi"),
  ];
  for (const f of codeFiles) {
    const rel = path.relative(ROOT, f);
    const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const { amount, re } of amountRes) {
        if (re.test(line))
          err(rel, `line ${i + 1}: hardcoded plan price "$${amount}" — derive it from PLAN_PRICING in shared/stripe-constants.ts`);
        re.lastIndex = 0;
      }
      for (const re of trialRes) {
        if (re.test(line))
          err(rel, `line ${i + 1}: hardcoded trial copy ("${line.trim().slice(0, 80)}") — derive it from PLAN_PRICING.kickstart.trialDays / TRIAL_COPY`);
        re.lastIndex = 0;
      }
    });
  }
}

/**
 * MDX prose can't import constants inside <FAQ items> (validate-seo evals
 * them standalone), so instead of banning literals we verify any RxFit price
 * or trial claim still matches the current constants.
 */
function scanMdxPriceClaims(pricing, file, body) {
  if (!pricing) return;
  const { amounts, savings, trialDays } = pricing;
  const allowedDollars = new Set([...amounts, ...savings]);
  // Trial claims are checked everywhere in the body ("7-day free trial",
  // "free for 7 days" are always about OUR trial; "7-day trend" is not
  // matched, so HRV-style prose stays clean).
  for (const m of body.matchAll(/(\d+)[-\s]day free trial/gi)) {
    if (Number(m[1]) !== trialDays)
      err(file, `trial claim "${m[0]}" no longer matches PLAN_PRICING trialDays (${trialDays})`);
  }
  for (const m of body.matchAll(/free for (\d+) days/gi)) {
    if (Number(m[1]) !== trialDays)
      err(file, `trial claim "${m[0]}" no longer matches PLAN_PRICING trialDays (${trialDays})`);
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
        err(file, `RxFit price mention "$${m[1]}" does not match any PLAN_PRICING amount/savings (${[...allowedDollars].join(", ")}) — update this sentence: "${sentence.trim().slice(0, 100)}"`);
    }
  }
}

/**
 * DB-published post link check: AI-generated posts in generated_posts are
 * link-validated once at publish time, but if a static route is later removed
 * or renamed (STATIC_ROUTES changes) the links inside already-published posts
 * silently break. Re-validate every live DB post's internal links against the
 * CURRENT routes + slugs so a route change fails the build loudly instead.
 * Skips (with a warning) only when DATABASE_URL is not set; any DB error is a
 * hard failure so this gate can't be silently bypassed.
 */
async function validateDbPostLinks(mdxSlugs, staticRoutes) {
  const label = "generated_posts";
  if (!process.env.DATABASE_URL) {
    warn(label, "DATABASE_URL not set — skipping link validation for DB-published posts");
    return;
  }
  let pg;
  try {
    pg = (await import("pg")).default;
  } catch (e) {
    err(label, `could not load pg driver: ${e.message}`);
    return;
  }
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 15000,
  });
  try {
    const { rows } = await pool.query(
      `SELECT slug, body_markdown FROM generated_posts WHERE status = 'published'`,
    );
    const allSlugs = new Set([...mdxSlugs, ...rows.map((r) => r.slug)]);
    for (const row of rows) {
      checkInternalLinks(`generated_posts/${row.slug}`, row.body_markdown ?? "", allSlugs, staticRoutes);
    }
    console.log(`Checked internal links in ${rows.length} DB-published post(s).`);
  } catch (e) {
    err(label, `failed to validate DB-published post links: ${e.message}`);
  } finally {
    await pool.end().catch(() => {});
  }
}

/* ---------------- run ------------------------------------------------------ */

const files = fs
  .readdirSync(BLOG_DIR)
  .filter((f) => f.endsWith(".mdx"))
  .map((f) => path.join(BLOG_DIR, f));

if (files.length === 0) errors.push("content/blog: no .mdx posts found");

const slugs = new Map();
const posts = [];
for (const f of files) {
  const post = validatePost(f);
  posts.push(post);
  if (post.slug) {
    if (slugs.has(post.slug)) err(path.relative(ROOT, f), `duplicate slug "${post.slug}" (also in ${slugs.get(post.slug)})`);
    else slugs.set(post.slug, path.basename(f));
  }
}

// Second pass: verify every internal link resolves to a known route or slug.
const staticRoutes = loadStaticRoutes();
const knownSlugs = new Set(slugs.keys());
for (const post of posts) checkInternalLinks(post.file, post.body, knownSlugs, staticRoutes);

validateSiteDefaults();
validateLandingJsonLdWiring();
validateCompareJsonLdWiring();

const planPricing = loadPlanPricing();
scanForHardcodedPrices(planPricing);
for (const post of posts) scanMdxPriceClaims(planPricing, post.file, post.body);

await validateDbPostLinks(knownSlugs, staticRoutes);

for (const w of warnings) console.warn(`WARN  ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR ${e}`);
  console.error(`\nSEO validation failed: ${errors.length} error(s), ${warnings.length} warning(s) across ${files.length} post(s).`);
  process.exit(1);
}
console.log(`SEO validation passed: ${files.length} post(s) checked, ${warnings.length} warning(s).`);
