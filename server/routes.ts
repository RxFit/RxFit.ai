import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeadSchema } from "@shared/schema";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { sendWelcomeEmail, sendLeadEmail } from "./emailService";
import { appendLeadToSheet } from "./sheetsService";
import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { SITE_URL } from "@shared/site";
import { renderGeneratedPostPage } from "./blogSsr";
import { getHeroImageBytes } from "./heroImage";

function parseFrontmatter(raw: string): Record<string, any> {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  return parseYaml(m[1]) ?? {};
}

const leadsRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/leads", leadsRateLimit, async (req, res) => {
    try {
      const parsed = insertLeadSchema.parse(req.body);

      const existing = await storage.getLeadByEmail(parsed.email);
      if (existing) {
        return res.status(200).json({ message: "You're in! Check your email for next steps." });
      }

      await storage.createLead(parsed);

      appendLeadToSheet({
        email: parsed.email,
        name: parsed.name || undefined,
        plan: parsed.plan || undefined,
        source: 'lead_capture',
        status: 'lead',
      }).catch(() => {});

      sendLeadEmail(parsed.email, parsed.name || 'there').catch(() => {});

      return res.status(200).json({ message: "You're in! Check your email for next steps." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Please enter a valid email address.", errors: error.errors });
      }
      console.error("Error creating lead:", error);
      return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.get("/api/leads", async (req, res) => {
    const adminKey = process.env.ADMIN_API_KEY;
    if (!adminKey || req.headers["x-admin-key"] !== adminKey) {
      return res.status(401).json({ message: "Unauthorized." });
    }
    try {
      const allLeads = await storage.getLeads();
      return res.status(200).json(allLeads);
    } catch (error) {
      console.error("Error fetching leads:", error);
      return res.status(500).json({ message: "Something went wrong." });
    }
  });

  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      return res.json({ publishableKey: key });
    } catch (error) {
      console.error("Error getting publishable key:", error);
      return res.status(500).json({ message: "Failed to get Stripe config." });
    }
  });

  app.get("/api/stripe/products", async (_req, res) => {
    try {
      let productsData: any[] = [];

      const result = await db.execute(
        sql`
          SELECT 
            p.id as product_id,
            p.name as product_name,
            p.description as product_description,
            p.metadata as product_metadata,
            pr.id as price_id,
            pr.unit_amount,
            pr.currency,
            pr.recurring,
            pr.metadata as price_metadata
          FROM stripe.products p
          LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
          WHERE p.active = true
          ORDER BY pr.unit_amount ASC
        `
      );

      if (result.rows.length > 0) {
        const productsMap = new Map();
        for (const row of result.rows) {
          const r = row as any;
          if (!productsMap.has(r.product_id)) {
            productsMap.set(r.product_id, {
              id: r.product_id,
              name: r.product_name,
              description: r.product_description,
              metadata: r.product_metadata,
              prices: [],
            });
          }
          if (r.price_id) {
            productsMap.get(r.product_id).prices.push({
              id: r.price_id,
              unit_amount: r.unit_amount,
              currency: r.currency,
              recurring: r.recurring,
              metadata: r.price_metadata,
            });
          }
        }
        productsData = Array.from(productsMap.values());
      } else {
        const stripe = await getUncachableStripeClient();
        const products = await stripe.products.list({ active: true, limit: 10 });
        for (const product of products.data) {
          const prices = await stripe.prices.list({ product: product.id, active: true });
          productsData.push({
            id: product.id,
            name: product.name,
            description: product.description,
            metadata: product.metadata,
            prices: prices.data.map(p => ({
              id: p.id,
              unit_amount: p.unit_amount,
              currency: p.currency,
              recurring: p.recurring,
              metadata: p.metadata,
            })),
          });
        }
      }

      return res.json({ data: productsData });
    } catch (error) {
      console.error("Error listing products:", error);
      return res.status(500).json({ message: "Failed to list products." });
    }
  });

  app.post("/api/stripe/checkout", async (req, res) => {
    try {
      const { priceId, email, name, plan, clientReferenceId } = req.body;

      if (!priceId) {
        return res.status(400).json({ message: "Price ID is required." });
      }

      const existing = await storage.getLeadByEmail(email);
      if (!existing && email) {
        try {
          await storage.createLead({ email, name: name || undefined, plan: plan || 'kickstart' });
        } catch (e) {
        }
      }

      const stripe = await getUncachableStripeClient();
      const priceObj = await stripe.prices.retrieve(priceId);

      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const sessionParams: any = {
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/#pricing`,
        allow_promotion_codes: true,
      };
      sessionParams.mode = priceObj.recurring ? 'subscription' : 'payment';

      if (email) {
        sessionParams.customer_email = email;
      }

      if (clientReferenceId && typeof clientReferenceId === 'string') {
        sessionParams.client_reference_id = clientReferenceId.slice(0, 200);
      }

      const session = await stripe.checkout.sessions.create(sessionParams);

      return res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", { priceId: req.body.priceId, error: error.message, code: error.code, type: error.type });
      return res.status(500).json({ message: "Failed to create checkout session." });
    }
  });

  // Track sessions whose post-purchase side effects have already been fired.
  // An in-memory Set is sufficient: side effects are idempotent at the business
  // level and the webhook is the authoritative trigger; this guard prevents
  // repeated sends when the success page URL is replayed.
  const processedSessions = new Set<string>();

  app.get("/api/stripe/session/:sessionId", async (req, res) => {
    try {
      const stripe = await getUncachableStripeClient();
      const session = await stripe.checkout.sessions.retrieve(req.params.sessionId, {
        expand: ['line_items', 'line_items.data.price.product'],
      });

      const email = session.customer_details?.email || '';
      const customerName = session.customer_details?.name || '';
      const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || '';
      const lineItem = session.line_items?.data?.[0];
      const product = lineItem?.price?.product as any;
      const planName = product?.name || 'RxFit.ai';

      const sessionId = req.params.sessionId;
      if ((session.payment_status === 'paid' || session.status === 'complete') && email) {
        if (!processedSessions.has(sessionId)) {
          processedSessions.add(sessionId);
          sendWelcomeEmail(email, customerName, planName).catch(() => {});
          appendLeadToSheet({
            email,
            name: customerName,
            plan: planName,
            source: 'stripe_checkout',
            status: 'paid',
          }).catch(() => {});
        }
      }

      return res.json({
        status: session.status,
        payment_status: session.payment_status,
      });
    } catch (error) {
      console.error("Error retrieving session:", error);
      return res.status(500).json({ message: "Failed to retrieve session." });
    }
  });

  app.post("/api/stripe/customer-portal", async (req, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ message: "A valid checkout session ID is required." });
      }

      const stripe = await getUncachableStripeClient();

      // Resolve the customer from the Stripe session — never trust a caller-supplied
      // customer ID or email address as proof of identity.
      let session: any;
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId);
      } catch {
        return res.status(400).json({ message: "Invalid session ID." });
      }

      if (session.payment_status !== 'paid' && session.status !== 'complete') {
        return res.status(403).json({ message: "Session has not been paid." });
      }

      const resolvedCustomerId = typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;

      if (!resolvedCustomerId) {
        return res.status(400).json({ message: "No customer associated with this session." });
      }

      const portalSession = await stripe.billingPortal.sessions.create({
        customer: resolvedCustomerId,
        return_url: 'https://app.rxfit.ai',
      });

      return res.json({ url: portalSession.url });
    } catch (error: any) {
      console.error("Error creating portal session:", error);
      return res.status(500).json({ message: "Failed to create billing portal session." });
    }
  });


  // Diagnostic: check Stripe prices and connection mode
  app.get("/api/diag/stripe-prices", async (_req, res) => {
    try {
      const stripe = await getUncachableStripeClient();
      const prices = await stripe.prices.list({ active: true, limit: 100 });
      const products = await stripe.products.list({ active: true, limit: 100 });
      const priceDetails = prices.data.map((p: any) => ({
        id: p.id, product: p.product, unit_amount: p.unit_amount,
        currency: p.currency, type: p.type, recurring: p.recurring, livemode: p.livemode,
      }));
      const productDetails = products.data.map((pr: any) => ({
        id: pr.id, name: pr.name, livemode: pr.livemode,
      }));
      res.json({
        timestamp: new Date().toISOString(),
        livemode: prices.data[0]?.livemode ?? 'no prices found',
        prices: priceDetails, products: productDetails,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ---- AI-generated blog posts (DB-backed, live without redeploy) ----

  app.get("/api/blog/posts", async (_req, res) => {
    try {
      const posts = await storage.getPublishedGeneratedPosts();
      return res.json(
        posts.map((p) => ({
          slug: p.slug,
          title: p.title,
          seoTitle: p.seoTitle,
          description: p.description,
          pillar: p.pillar,
          tags: p.tags,
          author: p.author,
          authorBio: p.authorBio,
          heroImage: p.heroImage,
          recommendedPlan: p.recommendedPlan,
          date: p.date,
          readingMinutes: p.readingMinutes,
        })),
      );
    } catch (error) {
      console.error("Error listing generated posts:", error);
      return res.status(500).json({ message: "Failed to load posts." });
    }
  });

  app.get("/api/blog/posts/:slug", async (req, res) => {
    try {
      const post = await storage.getGeneratedPostBySlug(req.params.slug);
      if (!post || post.status !== "published") {
        return res.status(404).json({ message: "Post not found." });
      }
      return res.json({
        slug: post.slug,
        title: post.title,
        seoTitle: post.seoTitle,
        description: post.description,
        pillar: post.pillar,
        tags: post.tags,
        author: post.author,
        authorBio: post.authorBio,
        heroImage: post.heroImage,
        recommendedPlan: post.recommendedPlan,
        date: post.date,
        readingMinutes: post.readingMinutes,
        tldr: post.tldr,
        keyTakeaways: post.keyTakeaways,
        bodyMarkdown: post.bodyMarkdown,
        faq: post.faq,
        toc: post.toc,
      });
    } catch (error) {
      console.error("Error loading generated post:", error);
      return res.status(500).json({ message: "Failed to load post." });
    }
  });

  // AI-generated hero images live in object storage (they must survive
  // redeploys); this route serves them under a stable site-relative path so
  // heroImage values work in the client, the crawler HTML, and og:image.
  app.get("/blog-heroes/:file", async (req, res) => {
    const file = req.params.file;
    // Slug-derived filenames only — no traversal, no other extensions.
    if (!/^[a-z0-9-]+\.webp$/.test(file)) {
      return res.status(404).json({ message: "Not found." });
    }
    try {
      const bytes = await getHeroImageBytes(file);
      if (!bytes) return res.status(404).json({ message: "Not found." });
      res.setHeader("Content-Type", "image/webp");
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      return res.send(bytes);
    } catch (error) {
      console.error("Error serving hero image:", error);
      return res.status(500).json({ message: "Failed to load image." });
    }
  });

  // Runtime SSR for generated posts: prerendered MDX posts are static files,
  // but DB posts appear after the deploy, so their crawlable HTML is rendered
  // on request. Falls through (next()) for non-DB slugs so the static
  // prerendered file — or the 404 shell — is served instead. In dev the
  // template doesn't exist and the Vite SPA shell takes over.
  app.get("/blog/:slug", async (req, res, next) => {
    try {
      const post = await storage.getGeneratedPostBySlug(req.params.slug);
      if (!post || post.status !== "published") return next();
      const page = renderGeneratedPostPage(post);
      if (!page) return next();
      return res.status(200).type("html").send(page);
    } catch (error) {
      console.error("Error rendering generated post page:", error);
      return next();
    }
  });

  // ---- SEO / AEO crawlable endpoints ----

  type BlogMeta = { slug: string; date: string };
  let postsCache: { data: BlogMeta[]; expires: number } | null = null;

  const readBlogPosts = (): BlogMeta[] => {
    if (postsCache && postsCache.expires > Date.now()) {
      return postsCache.data;
    }
    const dir = path.resolve(process.cwd(), "content", "blog");
    let data: BlogMeta[] = [];
    try {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"));
      data = files
        .map((file) => {
          const raw = fs.readFileSync(path.join(dir, file), "utf-8");
          const fm = parseFrontmatter(raw);
          const slug = fm.slug || file.replace(/\.mdx$/, "");
          return { slug, date: fm.date || new Date().toISOString().slice(0, 10) };
        })
        .filter((p) => !p.slug.startsWith("_"));
    } catch (err) {
      console.error("Error reading blog posts for sitemap:", err);
    }
    postsCache = { data, expires: Date.now() + 5 * 60 * 1000 };
    return data;
  };

  // Always emit the canonical origin so the sitemap and robots file agree with
  // every page-level canonical (which also uses SITE_URL), regardless of which
  // hostname requested them.
  const baseUrl = SITE_URL;

  // Stable last-modified dates for static pages. Update a page's date here
  // whenever its content is intentionally changed so crawlers receive accurate
  // freshness signals rather than "today" on every request.
  const STATIC_PAGE_DATES: Record<string, string> = {
    "/": "2026-06-18",
    "/blog": "2026-06-18",
    "/compare": "2026-07-16",
    "/privacy": "2026-06-18",
    "/terms": "2026-06-18",
    "/contact": "2026-06-18",
  };

  app.get("/sitemap.xml", async (_req, res) => {
    const staticUrls = [
      { loc: "/", lastmod: STATIC_PAGE_DATES["/"], priority: "1.0" },
      { loc: "/blog", lastmod: STATIC_PAGE_DATES["/blog"], priority: "0.8" },
      { loc: "/compare", lastmod: STATIC_PAGE_DATES["/compare"], priority: "0.8" },
      { loc: "/privacy", lastmod: STATIC_PAGE_DATES["/privacy"], priority: "0.3" },
      { loc: "/terms", lastmod: STATIC_PAGE_DATES["/terms"], priority: "0.3" },
      { loc: "/contact", lastmod: STATIC_PAGE_DATES["/contact"], priority: "0.4" },
    ];
    const mdxPosts = readBlogPosts();
    let generatedPosts: { slug: string; date: string }[] = [];
    try {
      const mdxSlugs = new Set(mdxPosts.map((p) => p.slug));
      generatedPosts = (await storage.getPublishedGeneratedPosts())
        .filter((p) => !mdxSlugs.has(p.slug))
        .map((p) => ({ slug: p.slug, date: p.date }));
    } catch (err) {
      console.error("Error reading generated posts for sitemap:", err);
    }
    const postUrls = [...mdxPosts, ...generatedPosts].map((p) => ({
      loc: `/blog/${p.slug}`,
      lastmod: new Date(p.date).toISOString().slice(0, 10),
      priority: "0.7",
    }));
    const urls = [...staticUrls, ...postUrls]
      .map(
        (u) =>
          `  <url>\n    <loc>${baseUrl}${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
      )
      .join("\n");
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
    res.header("Content-Type", "application/xml");
    res.send(xml);
  });

  app.get("/robots.txt", (_req, res) => {
    const body = `User-agent: *
Allow: /
Disallow: /api/
Disallow: /success

# Explicitly welcome AI crawlers so our content can be cited (AEO/GEO)
# Each group repeats the shared disallows so dedicated groups don't override them
User-agent: GPTBot
Allow: /
Disallow: /api/
Disallow: /success

User-agent: PerplexityBot
Allow: /
Disallow: /api/
Disallow: /success

User-agent: ClaudeBot
Allow: /
Disallow: /api/
Disallow: /success

User-agent: Google-Extended
Allow: /
Disallow: /api/
Disallow: /success

User-agent: CCBot
Allow: /
Disallow: /api/
Disallow: /success

Sitemap: ${baseUrl}/sitemap.xml
`;
    res.header("Content-Type", "text/plain");
    res.send(body);
  });

  return httpServer;
}
