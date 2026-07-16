import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import type { ProductsSnapshotStore } from "./productsSnapshot";

export interface ProductsRouteDeps {
  db: { execute: (query: any) => Promise<{ rows: any[] }> };
  getStripeClient: () => Promise<any>;
  snapshotStore: ProductsSnapshotStore;
  reportPricingServing: (ok: boolean, error?: Error) => void | Promise<void>;
}

/**
 * The /api/stripe/products handler, extracted into a factory with injectable
 * dependencies so the outage-fallback wiring (live fetch fails ->
 * snapshotStore.getFallback() -> stale:true response, or 500 only when no
 * snapshot exists) can be exercised by a route-level test
 * (server/productsRoute.test.ts) without a real DB or Stripe client.
 */
export function createProductsHandler(deps: ProductsRouteDeps) {
  const { db, getStripeClient, snapshotStore, reportPricingServing } = deps;

  return async function productsHandler(_req: Request, res: Response) {
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
        const stripe = await getStripeClient();
        const products = await stripe.products.list({ active: true, limit: 10 });
        for (const product of products.data) {
          const prices = await stripe.prices.list({ product: product.id, active: true });
          productsData.push({
            id: product.id,
            name: product.name,
            description: product.description,
            metadata: product.metadata,
            prices: prices.data.map((p: any) => ({
              id: p.id,
              unit_amount: p.unit_amount,
              currency: p.currency,
              recurring: p.recurring,
              metadata: p.metadata,
            })),
          });
        }
      }

      if (productsData.length > 0) {
        await snapshotStore.record(productsData);
      }
      // Fresh catalog served — mark the pricing-serving monitor healthy
      // (fire-and-forget; must never delay or fail the response).
      void reportPricingServing(true);
      return res.json({ data: productsData });
    } catch (error) {
      console.error("Error listing products:", error);
      const snapshot = await snapshotStore.getFallback();
      if (snapshot) {
        console.warn(
          `Serving last-known-good products snapshot from ${new Date(snapshot.cachedAt).toISOString()}`,
        );
        // Buyers are seeing a stale last-known-good catalog — alert the owner
        // via the credential-health chain (once per outage).
        void reportPricingServing(
          false,
          new Error(
            `Serving STALE last-known-good products snapshot from ${new Date(snapshot.cachedAt).toISOString()} — live catalog unavailable: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
        return res.json({ data: snapshot.data, stale: true });
      }
      // No snapshot at all — buyers see no pricing and checkout is disabled.
      void reportPricingServing(
        false,
        new Error(
          `Products endpoint FAILED with no snapshot fallback — buyers see no pricing and checkout is disabled: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return res.status(500).json({ message: "Failed to list products." });
    }
  };
}
