import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProductsHandler } from "./productsRoute";
import { ProductsSnapshotStore, type SnapshotPersistence } from "./productsSnapshot";

function mockRes() {
  const res: any = {
    statusCode: 200,
    body: undefined as any,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function memPersistence(initial: any[] | null = null): SnapshotPersistence {
  let stored = initial ? { data: initial, cachedAt: Date.now() - 60_000 } : null;
  return {
    async save(snapshot) {
      stored = snapshot;
    },
    async load() {
      return stored;
    },
  };
}

const CATALOG = [
  {
    id: "prod_1",
    name: "Kickstart",
    description: "desc",
    metadata: { tier: "kickstart" },
    prices: [{ id: "price_1", unit_amount: 4900, currency: "usd", recurring: {}, metadata: {} }],
  },
];

const DB_ROWS = [
  {
    product_id: "prod_1",
    product_name: "Kickstart",
    product_description: "desc",
    product_metadata: { tier: "kickstart" },
    price_id: "price_1",
    unit_amount: 4900,
    currency: "usd",
    recurring: {},
    price_metadata: {},
  },
];

describe("/api/stripe/products route handler (outage fallback wiring)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves the live DB catalog, records the snapshot, and reports healthy", async () => {
    const store = new ProductsSnapshotStore(memPersistence());
    const record = vi.spyOn(store, "record");
    const report = vi.fn();
    const handler = createProductsHandler({
      db: { execute: vi.fn().mockResolvedValue({ rows: DB_ROWS }) },
      getStripeClient: vi.fn(),
      snapshotStore: store,
      reportPricingServing: report,
    });

    const res = mockRes();
    await handler({} as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.stale).toBeUndefined();
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe("prod_1");
    expect(res.body.data[0].prices[0].id).toBe("price_1");
    expect(record).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(true);
  });

  it("falls back to the Stripe API when the DB has no rows", async () => {
    const store = new ProductsSnapshotStore(memPersistence());
    const stripe = {
      products: { list: vi.fn().mockResolvedValue({ data: [{ id: "prod_1", name: "Kickstart", description: "desc", metadata: {} }] }) },
      prices: { list: vi.fn().mockResolvedValue({ data: [{ id: "price_1", unit_amount: 4900, currency: "usd", recurring: {}, metadata: {} }] }) },
    };
    const handler = createProductsHandler({
      db: { execute: vi.fn().mockResolvedValue({ rows: [] }) },
      getStripeClient: vi.fn().mockResolvedValue(stripe),
      snapshotStore: store,
      reportPricingServing: vi.fn(),
    });

    const res = mockRes();
    await handler({} as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data[0].prices[0].id).toBe("price_1");
    expect(res.body.stale).toBeUndefined();
  });

  it("serves stale:true from the in-memory snapshot when both DB and Stripe fail", async () => {
    const store = new ProductsSnapshotStore(memPersistence());
    await store.record(CATALOG);
    const report = vi.fn();
    const handler = createProductsHandler({
      db: { execute: vi.fn().mockRejectedValue(new Error("db down")) },
      getStripeClient: vi.fn().mockRejectedValue(new Error("stripe down")),
      snapshotStore: store,
      reportPricingServing: report,
    });

    const res = mockRes();
    await handler({} as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.stale).toBe(true);
    expect(res.body.data).toEqual(CATALOG);
    expect(report).toHaveBeenCalledWith(false, expect.any(Error));
    expect(String(report.mock.calls[0][1])).toContain("STALE");
  });

  it("serves stale:true from the persisted snapshot on a fresh boot during an outage", async () => {
    const store = new ProductsSnapshotStore(memPersistence(CATALOG));
    const handler = createProductsHandler({
      db: { execute: vi.fn().mockRejectedValue(new Error("db down")) },
      getStripeClient: vi.fn().mockRejectedValue(new Error("stripe down")),
      snapshotStore: store,
      reportPricingServing: vi.fn(),
    });

    const res = mockRes();
    await handler({} as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.stale).toBe(true);
    expect(res.body.data).toEqual(CATALOG);
  });

  it("returns 500 (and reports broken) only when no snapshot exists anywhere", async () => {
    const store = new ProductsSnapshotStore(memPersistence());
    const report = vi.fn();
    const handler = createProductsHandler({
      db: { execute: vi.fn().mockRejectedValue(new Error("db down")) },
      getStripeClient: vi.fn().mockRejectedValue(new Error("stripe down")),
      snapshotStore: store,
      reportPricingServing: report,
    });

    const res = mockRes();
    await handler({} as any, res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ message: "Failed to list products." });
    expect(report).toHaveBeenCalledWith(false, expect.any(Error));
    expect(String(report.mock.calls[0][1])).toContain("no snapshot fallback");
  });

  it("still serves the stale snapshot when snapshot persistence load also fails (memory copy)", async () => {
    const failingPersistence: SnapshotPersistence = {
      save: vi.fn().mockRejectedValue(new Error("persist down")),
      load: vi.fn().mockRejectedValue(new Error("persist down")),
    };
    const store = new ProductsSnapshotStore(failingPersistence);
    await store.record(CATALOG);
    const handler = createProductsHandler({
      db: { execute: vi.fn().mockRejectedValue(new Error("db down")) },
      getStripeClient: vi.fn().mockRejectedValue(new Error("stripe down")),
      snapshotStore: store,
      reportPricingServing: vi.fn(),
    });

    const res = mockRes();
    await handler({} as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.stale).toBe(true);
  });
});
