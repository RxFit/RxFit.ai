tail -n 50 server/routes.ts
  grep -n "return httpServer;" server/routes.ts
    LINE=$(grep -n "return httpServer;" server/routes.ts | head -n 1 | cut -d: -f1)
head -n $((LINE-1)) server/routes.ts > routes.ts.fix
  cat /tmp/diag_patch.ts >> routes.ts.fix
    tail -n +$LINE server/routes.ts | sed '/\/\/ Diagnostic endpoint/,$d' >> routes.ts.fix
      mv routes.ts.fix server/routes.ts
        import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertLeadSchema } from "@shared/schema";
import { z } from "zod";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { sendLeadEmail, sendWelcomeEmail } from "./emailService";
import { appendLeadToSheet } from "./sheetsService";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/leads", async (req, res) => {
    try {
      const parsed = insertLeadSchema.parse(req.body);

      const existing = await storage.getLeadByEmail(parsed.email);
      if (existing) {
        return res.status(200).json({ message: "You're already on the list!", lead: existing });
      }

      const lead = await storage.createLead(parsed);

      sendLeadEmail(parsed.email, parsed.name || '').catch(() => {});
      appendLeadToSheet({
        email: parsed.email,
        name: parsed.name || undefined,
        plan: parsed.plan || undefined,
        source: 'lead_capture',
        status: 'lead',
      }).catch(() => {});

      return res.status(201).json({ message: "You're in! Check your email for next steps.", lead });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Please enter a valid email address.", errors: error.errors });
      }
      console.error("Error creating lead:", error);
      return res.status(500).json({ message: "Something went wrong. Please try again." });
    }
  });

  app.get("/api/leads", async (_req, res) => {
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
      const { priceId, email, name, plan } = req.body;

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

      const session = await stripe.checkout.sessions.create(sessionParams);

      return res.json({ url: session.url });
    } catch (error: any) {
      console.error("Error creating checkout session:", error);
      return res.status(500).json({ message: "Failed to create checkout session." });
    }
  });

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

      if ((session.payment_status === 'paid' || session.status === 'complete') && email) {
        sendWelcomeEmail(email, customerName, planName).catch(() => {});
        appendLeadToSheet({
          email,
          name: customerName,
          plan: planName,
          source: 'stripe_checkout',
          status: 'paid',
        }).catch(() => {});
      }

      return res.json({
        status: session.status,
        customer_email: email,
        customer_id: customerId,
        payment_status: session.payment_status,
      });
    } catch (error) {
      console.error("Error retrieving session:", error);
      return res.status(500).json({ message: "Failed to retrieve session." });
    }
  });

  app.post("/api/stripe/customer-portal", async (req, res) => {
    try {
      const { customerId, email } = req.body;
      const stripe = await getUncachableStripeClient();

      let resolvedCustomerId = customerId;

      if (!resolvedCustomerId && email) {
        const customers = await stripe.customers.list({ email, limit: 1 });
        if (customers.data.length > 0) {
          resolvedCustomerId = customers.data[0].id;
        }
      }

      if (!resolvedCustomerId) {
        return res.status(400).json({ message: "No customer found. Please provide a valid customer ID or email." });
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

  return httpServer;
}
