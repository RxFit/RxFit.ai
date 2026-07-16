import { describe, it, expect, vi } from "vitest";
import {
  ProductsSnapshotStore,
  type ProductsSnapshot,
  type SnapshotPersistence,
} from "./productsSnapshot";

const CATALOG = [
  {
    id: "prod_1",
    name: "Kickstart",
    metadata: { tier: "kickstart" },
    prices: [{ id: "price_1", unit_amount: 4900 }],
  },
];

function memPersistence(initial: ProductsSnapshot | null = null): SnapshotPersistence & {
  stored: ProductsSnapshot | null;
} {
  const state = { stored: initial } as { stored: ProductsSnapshot | null };
  return {
    get stored() {
      return state.stored;
    },
    set stored(v) {
      state.stored = v;
    },
    async save(snapshot) {
      state.stored = snapshot;
    },
    async load() {
      return state.stored;
    },
  };
}

describe("ProductsSnapshotStore", () => {
  it("records a snapshot to memory and persistence", async () => {
    const persistence = memPersistence();
    const store = new ProductsSnapshotStore(persistence);

    await store.record(CATALOG);

    expect(persistence.stored?.data).toEqual(CATALOG);
    const fallback = await store.getFallback();
    expect(fallback?.data).toEqual(CATALOG);
  });

  it("ignores empty catalogs (never overwrites a good snapshot with nothing)", async () => {
    const persistence = memPersistence({ data: CATALOG, cachedAt: 123 });
    const store = new ProductsSnapshotStore(persistence);

    await store.record([]);

    expect(persistence.stored?.data).toEqual(CATALOG);
  });

  it("survives a persistence write failure (memory copy still serves)", async () => {
    const persistence: SnapshotPersistence = {
      save: vi.fn().mockRejectedValue(new Error("db down")),
      load: vi.fn().mockResolvedValue(null),
    };
    const store = new ProductsSnapshotStore(persistence);

    await expect(store.record(CATALOG)).resolves.toBeUndefined();
    const fallback = await store.getFallback();
    expect(fallback?.data).toEqual(CATALOG);
  });

  it("restart-with-outage: a fresh store (empty memory) loads the persisted snapshot", async () => {
    // Simulates a redeploy: process restarted (new store, no memory copy),
    // live catalog fetch failing — fallback must come from the DB row.
    const persistence = memPersistence({ data: CATALOG, cachedAt: 1_700_000_000_000 });
    const freshBootStore = new ProductsSnapshotStore(persistence);

    const fallback = await freshBootStore.getFallback();

    expect(fallback).not.toBeNull();
    expect(fallback!.data).toEqual(CATALOG);
    expect(fallback!.cachedAt).toBe(1_700_000_000_000);
  });

  it("restart-with-outage: caches the persisted snapshot in memory after first load", async () => {
    const persistence = memPersistence({ data: CATALOG, cachedAt: 1 });
    const load = vi.spyOn(persistence, "load");
    const store = new ProductsSnapshotStore(persistence);

    await store.getFallback();
    await store.getFallback();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("returns null when neither memory nor persistence has a snapshot", async () => {
    const store = new ProductsSnapshotStore(memPersistence());
    expect(await store.getFallback()).toBeNull();
  });

  it("returns null (no throw) when the persistence load itself fails — full outage still 500s cleanly", async () => {
    const persistence: SnapshotPersistence = {
      save: vi.fn(),
      load: vi.fn().mockRejectedValue(new Error("db unreachable")),
    };
    const store = new ProductsSnapshotStore(persistence);
    expect(await store.getFallback()).toBeNull();
  });
});
