import { eq } from "drizzle-orm";
import { productsSnapshots } from "@shared/schema";

export interface ProductsSnapshot {
  data: any[];
  cachedAt: number;
}

export interface SnapshotPersistence {
  save(snapshot: ProductsSnapshot): Promise<void>;
  load(): Promise<ProductsSnapshot | null>;
}

const SNAPSHOT_ID = "singleton";

/**
 * DB-backed persistence for the last-known-good products snapshot, so the
 * fallback survives server restarts/redeploys. Uses a single upserted row.
 */
export function createDbSnapshotPersistence(db: {
  insert: (table: any) => any;
  select: () => any;
}): SnapshotPersistence {
  return {
    async save(snapshot: ProductsSnapshot): Promise<void> {
      await db
        .insert(productsSnapshots)
        .values({
          id: SNAPSHOT_ID,
          data: snapshot.data,
          cachedAt: new Date(snapshot.cachedAt),
        })
        .onConflictDoUpdate({
          target: productsSnapshots.id,
          set: {
            data: snapshot.data,
            cachedAt: new Date(snapshot.cachedAt),
          },
        });
    },
    async load(): Promise<ProductsSnapshot | null> {
      const rows = await db
        .select()
        .from(productsSnapshots)
        .where(eq(productsSnapshots.id, SNAPSHOT_ID))
        .limit(1);
      const row = rows[0];
      if (!row || !Array.isArray(row.data) || row.data.length === 0) {
        return null;
      }
      return {
        data: row.data,
        cachedAt: new Date(row.cachedAt).getTime(),
      };
    },
  };
}

/**
 * Last-known-good products snapshot store: an in-memory copy for fast
 * fallback, backed by DB persistence so a fresh boot during a Stripe
 * outage can still serve the snapshot instead of 500ing.
 *
 * Persistence failures are deliberately swallowed (with a loud log):
 * the live response must never fail because the snapshot write failed,
 * and the fallback must never fail because the snapshot read failed —
 * it just degrades back to memory-only behavior.
 */
export class ProductsSnapshotStore {
  private memory: ProductsSnapshot | null = null;

  constructor(private readonly persistence: SnapshotPersistence) {}

  /** Record a freshly-verified live catalog (memory + best-effort persist). */
  async record(data: any[]): Promise<void> {
    if (!Array.isArray(data) || data.length === 0) return;
    const snapshot: ProductsSnapshot = { data, cachedAt: Date.now() };
    this.memory = snapshot;
    try {
      await this.persistence.save(snapshot);
    } catch (error) {
      console.error(
        "[products-snapshot] Failed to persist last-known-good products snapshot (memory copy still active):",
        error,
      );
    }
  }

  /**
   * Get the last-known-good snapshot for outage fallback. Prefers the
   * in-memory copy; on a fresh boot (empty memory) falls back to the
   * persisted copy and re-caches it in memory. Returns null when neither
   * source has a usable snapshot.
   */
  async getFallback(): Promise<ProductsSnapshot | null> {
    if (this.memory) return this.memory;
    try {
      const persisted = await this.persistence.load();
      if (persisted) {
        this.memory = persisted;
        return persisted;
      }
    } catch (error) {
      console.error(
        "[products-snapshot] Failed to load persisted products snapshot:",
        error,
      );
    }
    return null;
  }
}
