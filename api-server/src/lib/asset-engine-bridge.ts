/**
 * Asset Engine Bridge — wires the JS asset-manager.js engine into TS routes.
 *
 * Design:
 *   - One asset store per request (cheap; the engine is in-memory only).
 *   - Hydrated lazily from `fixed_assets` rows the route actually needs.
 *   - All mutations stay in memory until the route persists them via the
 *     helpers below (engineAssetToRow + UPDATE / INSERT / etc.).
 *
 * Source-of-truth for the engine shape: onyx-procurement/src/assets/asset-manager.js
 *
 * AGENT-226 — Asset Manager Engine Wiring + Never-Delete Enforcement
 */

// asset-manager.js is a CommonJS module under the onyx-procurement package.
// We import it via a relative path because there is no workspace alias for
// the procurement package today; the file path is stable. esbuild bundles
// the CJS source into the ESM output at build time.
// @ts-ignore — JS source ships its own runtime contract
import * as assetManagerModule from "../../../onyx-procurement/src/assets/asset-manager.js";

const assetManager: any =
  (assetManagerModule as any).default || (assetManagerModule as any);
const { createAssetStore, METHODS, CATEGORY_RATES } = assetManager;

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export type AssetRow = Record<string, any>;
export type EngineAsset = Record<string, any>;
export type AssetStore = ReturnType<typeof createAssetStore>;

// ════════════════════════════════════════════════════════════════════════
// ROW ↔ ENGINE MAPPERS
// ════════════════════════════════════════════════════════════════════════

/**
 * Map a fixed_assets row (snake_case, DB types) into the engine asset shape.
 * Numbers are coerced; statuses are normalised to UPPER per engine convention.
 */
export function rowToEngineAsset(r: AssetRow): EngineAsset {
  const numericId = Number(r.id);
  const engineId = `FA-${numericId}`;
  const cost = Number(r.purchase_price ?? r.purchase_cost ?? r.cost ?? 0);
  const salvage = Number(r.residual_value ?? r.salvage_value ?? 0);
  const accum = Number(r.accumulated_depreciation ?? 0);
  const revaluation = Number(r.revaluation_surplus ?? 0);
  const impairment = Number(r.impairment_loss ?? 0);
  const computedNbv = cost + revaluation - impairment - accum;
  const currentNbv = Number(r.current_value ?? r.current_nbv ?? computedNbv);
  const status = String(r.status || "active").toUpperCase();

  return {
    id: engineId,
    db_id: numericId,
    name: r.asset_name || r.name || `Asset ${numericId}`,
    name_he: r.name_he || null,
    category: r.category || "MACHINERY_GENERAL",
    serial_no: r.serial_number || r.serial_no || null,
    location: r.location || "UNASSIGNED",
    custodian: r.assigned_to || r.custodian || null,
    acquisition_date:
      r.purchase_date instanceof Date
        ? r.purchase_date.toISOString().slice(0, 10)
        : r.purchase_date || r.acquisition_date || null,
    cost,
    salvage_value: salvage,
    useful_life_years: Number(r.useful_life_years || 0),
    depreciation_method: String(
      r.depreciation_method || METHODS.STRAIGHT_LINE,
    ).toLowerCase(),
    depreciation_rate: Number(r.depreciation_rate || 0) / (Number(r.depreciation_rate || 0) > 1 ? 100 : 1),
    accumulated_depreciation: accum,
    current_nbv: Number.isFinite(currentNbv) ? currentNbv : 0,
    status,
    barcode: r.barcode || `FA-${numericId}`,
    total_units_capacity: r.total_units_capacity ?? null,
    units_used: Number(r.units_used ?? 0),
    impairment_loss: impairment,
    revaluation_surplus: revaluation,
    last_depreciated_to:
      r.last_depreciated_to instanceof Date
        ? r.last_depreciated_to.toISOString().slice(0, 10)
        : r.last_depreciated_to ||
          (r.purchase_date instanceof Date
            ? r.purchase_date.toISOString().slice(0, 10)
            : r.purchase_date) ||
          null,
    created_at: r.created_at || new Date().toISOString(),
  };
}

/**
 * Reverse mapper — engine asset back to a partial row suitable for
 * UPDATE fixed_assets SET ... WHERE id = .
 */
export function engineAssetToRow(a: EngineAsset): AssetRow {
  return {
    id: a.db_id ?? Number(String(a.id).replace(/^FA-/, "")),
    purchase_price: a.cost,
    residual_value: a.salvage_value,
    accumulated_depreciation: a.accumulated_depreciation,
    current_value: a.current_nbv,
    revaluation_surplus: a.revaluation_surplus,
    impairment_loss: a.impairment_loss,
    last_depreciated_to: a.last_depreciated_to,
    status: String(a.status || "active").toLowerCase(),
    disposal_date: a.disposal_date || null,
    disposal_price: a.disposal_proceeds ?? null,
    disposal_gain_loss: a.disposal_gain_loss ?? null,
  };
}

// ════════════════════════════════════════════════════════════════════════
// STORE LOADER
// ════════════════════════════════════════════════════════════════════════

/**
 * Build a fresh in-memory asset store for the active assets that the
 * caller is about to operate on. Pass `assetIds` to scope a single asset;
 * omit to hydrate the entire active register (used by depreciation runs).
 */
export async function loadStoreForRequest(opts: {
  assetIds?: number[];
  onlyActive?: boolean;
} = {}): Promise<AssetStore> {
  const store = createAssetStore();
  let where = "WHERE 1=1";
  if (opts.onlyActive !== false) {
    where +=
      " AND LOWER(status) IN ('active','fully_depreciated','disposed')";
  }
  if (opts.assetIds && opts.assetIds.length > 0) {
    const ids = opts.assetIds
      .filter((n) => Number.isFinite(n))
      .map((n) => Number(n))
      .join(",");
    if (ids) where += ` AND id IN (${ids})`;
  }
  const result = await db.execute(
    sql.raw(`SELECT * FROM fixed_assets ${where}`),
  );
  const rows = (result.rows || []) as AssetRow[];
  for (const r of rows) {
    try {
      store.hydrate(rowToEngineAsset(r));
    } catch {
      // duplicate / invalid row — skip; engine errors should not 500 the route
    }
  }
  return store;
}

/** Convenience — hydrate a single asset and return both the store + engine view. */
export async function loadAssetForRequest(numericId: number): Promise<{
  store: AssetStore;
  asset: EngineAsset | null;
  engineId: string;
}> {
  const store = await loadStoreForRequest({ assetIds: [numericId] });
  const engineId = `FA-${numericId}`;
  const asset = store.getAsset(engineId);
  return { store, asset, engineId };
}

// ════════════════════════════════════════════════════════════════════════
// CATEGORY CATALOG (read-only export for /categories endpoint)
// ════════════════════════════════════════════════════════════════════════

export function listCategories() {
  return Object.entries(CATEGORY_RATES).map(([code, meta]: [string, any]) => ({
    code,
    he: meta.he,
    en: meta.en,
    rate: meta.rate,
    useful_life: meta.useful_life,
    accelerated: meta.accelerated,
  }));
}

export { METHODS, CATEGORY_RATES };
