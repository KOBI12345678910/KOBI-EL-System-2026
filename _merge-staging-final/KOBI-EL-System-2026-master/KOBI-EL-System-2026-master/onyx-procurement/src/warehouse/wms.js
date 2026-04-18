/**
 * ONYX Procurement — Warehouse Management System (WMS)
 * ────────────────────────────────────────────────────────────────
 * Agent X-31 — Swarm 3B — Techno-Kol Uzi Mega-ERP (Kobi 2026)
 *
 * Full-stack warehouse operations layer for an Israeli metal-fab
 * shop. Bins, stock tracking, putaway, picking, packing, shipping,
 * cycle counts, inter-warehouse transfers, kitting, and lot/serial
 * traceability. Designed as a pure in-memory module that can be
 * snapshot-persisted to JSON/Supabase by the caller.
 *
 * Bilingual Hebrew/English. Zero external runtime dependencies. Pure
 * vanilla Node — no npm packages, nothing beyond `crypto` for ids.
 *
 * ────────────────────────────────────────────────────────────────
 * Design rules (Swarm 3B / Agent X-31 charter)
 * ────────────────────────────────────────────────────────────────
 *
 *   1. NEVER delete. Every mutation appends a movement record; the
 *      removeWarehouse / removeBin helpers soft-archive only.
 *   2. Hebrew bilingual. Every user-facing string has a Hebrew and
 *      English form, and every error message carries both.
 *   3. Zero deps. Only `node:crypto` is touched, and that's optional —
 *      if missing, a simple monotonic id generator is used instead.
 *   4. Barcode compatibility. `receiveFromBarcode(payload, …)` hooks
 *      into the shape produced by Agent 86 (barcode-scanner).
 *   5. Deterministic. No Date.now() in tests — optional `clock()`
 *      override lets the suite control time.
 *
 * ────────────────────────────────────────────────────────────────
 * Data model
 * ────────────────────────────────────────────────────────────────
 *
 *   Warehouse     { id, code, name_he, name_en, address, archived }
 *   Zone          { id, warehouse_id, code, type, name_he, name_en }
 *                 type ∈ {receive, bulk, pick, ship, qa, quarantine}
 *   Aisle         { id, zone_id, code }
 *   Rack          { id, aisle_id, code }
 *   Shelf         { id, rack_id, code, level }  // level 0 = floor
 *   Bin           { id, shelf_id, code, capacity, abc_class, archived }
 *                 abc_class ∈ {A, B, C} — A items live near the ship zone
 *
 *   Stock         { item_id × bin_id × lot_no × serial_no = qty }
 *                 Expiry dates are tracked per lot.
 *
 *   Movement      { id, kind, when, who, item_id, qty,
 *                   from_bin, to_bin, lot_no, serial_no, ref,
 *                   note_he, note_en }
 *                 kind ∈ {
 *                   receive, putaway, move, pick, pack, ship,
 *                   adjust, cycle_count, transfer_out, transfer_in,
 *                   kit_assemble, kit_disassemble
 *                 }
 *
 *   PickList      { id, order_id, status, lines[], path[] }
 *                 status ∈ {open, picking, picked, packed, shipped}
 *   PackList      { id, order_id, pickList_id, cartons[], weight, status }
 *
 *   CycleCount    { id, bin_id, counted, expected, variance, resolved }
 *
 * ────────────────────────────────────────────────────────────────
 * Public API (stable)
 * ────────────────────────────────────────────────────────────────
 *
 *   Factory
 *     createWMS(opts?)                    → store instance
 *
 *   Master data
 *     addWarehouse({code,name_he,name_en,address})        → warehouse
 *     addZone({warehouse_id,code,type,name_he,name_en})   → zone
 *     addAisle({zone_id,code})                            → aisle
 *     addRack({aisle_id,code})                            → rack
 *     addShelf({rack_id,code,level})                      → shelf
 *     addBin({shelf_id,code,capacity,abc_class})          → bin
 *     archiveBin(bin_id, reason)                          → void (soft)
 *     listBins(warehouse_id?)                             → bin[]
 *
 *   Core operations
 *     receivePO(poId, items[], targetBins[])              → movement id[]
 *     receiveFromBarcode(payload, binId, who?)            → movement id
 *     suggestPutaway(itemId, qty)                         → bin
 *     generatePickList(orderId, rules?)                   → pickList
 *     confirmPick(pickId, itemId, qty, binId)             → void
 *     packOrder(orderId, pickedItems)                     → packId
 *     shipOrder(packId, carrier?)                         → delivery note id
 *     cycleCount(binId, counted, itemId?)                 → { variance, adjustment }
 *     transfer(fromBin, toBin, itemId, qty)               → movement id
 *     kitAssemble(kitSku, components[], toBin)            → movement id
 *     kitDisassemble(kitSku, fromBin, components[])       → movement id
 *     getStock(itemId, warehouseId?)                      → { total, byBin[] }
 *     adjustStock(binId, itemId, delta, reason)           → movement id
 *     getMovements(filter?)                               → movement[]
 *
 *   Snapshot / restore
 *     snapshot()            → JSON-serialisable object
 *     restore(snapshot)     → void
 *
 * ────────────────────────────────────────────────────────────────
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
//  ID generator (optional crypto)
// ═══════════════════════════════════════════════════════════════

let _randomUUID = null;
try {
  // eslint-disable-next-line global-require
  _randomUUID = require('node:crypto').randomUUID;
} catch (_e) {
  _randomUUID = null;
}

let _idCounter = 0;
function makeId(prefix) {
  _idCounter += 1;
  if (_randomUUID) {
    return `${prefix}_${_randomUUID().slice(0, 8)}_${_idCounter}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${_idCounter}`;
}

// ═══════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════

const ZONE_TYPE = Object.freeze({
  RECEIVE:    'receive',
  BULK:       'bulk',
  PICK:       'pick',
  SHIP:       'ship',
  QA:         'qa',
  QUARANTINE: 'quarantine',
});

const ZONE_TYPES_HE = Object.freeze({
  receive:    'אזור קבלה',
  bulk:       'אזור אחסון סיטונאי',
  pick:       'אזור ליקוט',
  ship:       'אזור משלוח',
  qa:         'אזור בקרת איכות',
  quarantine: 'אזור הסגר',
});

const ABC_CLASS = Object.freeze({ A: 'A', B: 'B', C: 'C' });

const PICK_RULES = Object.freeze({
  FIFO: 'FIFO',  // First In First Out  (oldest receive date)
  FEFO: 'FEFO',  // First Expiry First Out (oldest expiry)
  LIFO: 'LIFO',  // Last In First Out   (newest receive)
});

const MOVEMENT_KIND = Object.freeze({
  RECEIVE:         'receive',
  PUTAWAY:         'putaway',
  MOVE:            'move',
  PICK:            'pick',
  PACK:            'pack',
  SHIP:            'ship',
  ADJUST:          'adjust',
  CYCLE_COUNT:     'cycle_count',
  TRANSFER_OUT:    'transfer_out',
  TRANSFER_IN:     'transfer_in',
  KIT_ASSEMBLE:    'kit_assemble',
  KIT_DISASSEMBLE: 'kit_disassemble',
});

const PICK_STATUS = Object.freeze({
  OPEN:    'open',
  PICKING: 'picking',
  PICKED:  'picked',
  PACKED:  'packed',
  SHIPPED: 'shipped',
});

// ═══════════════════════════════════════════════════════════════
//  Bilingual errors
// ═══════════════════════════════════════════════════════════════

function bilErr(he, en, status = 400) {
  const e = new Error(`${en} | ${he}`);
  e.status = status;
  e.message_he = he;
  e.message_en = en;
  return e;
}

function requireArg(val, he, en) {
  if (val === undefined || val === null || val === '') {
    throw bilErr(he, en, 400);
  }
}

function requireNonNegNumber(n, he, en) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
    throw bilErr(he, en, 400);
  }
}

// ═══════════════════════════════════════════════════════════════
//  Stock key helper
//  A stock row is keyed by (bin, item, lot, serial). Lots and
//  serials are optional — when absent, we use the empty string.
// ═══════════════════════════════════════════════════════════════

function stockKey(binId, itemId, lotNo, serialNo) {
  return `${binId}::${itemId}::${lotNo || ''}::${serialNo || ''}`;
}

// ═══════════════════════════════════════════════════════════════
//  FACTORY — createWMS
// ═══════════════════════════════════════════════════════════════

function createWMS(opts = {}) {
  // Override the clock for deterministic tests
  const clock = typeof opts.clock === 'function'
    ? opts.clock
    : () => new Date().toISOString();

  // In-memory store ----------------------------------------------------
  const state = {
    warehouses: new Map(),   // id → warehouse
    zones:      new Map(),
    aisles:     new Map(),
    racks:      new Map(),
    shelves:    new Map(),
    bins:       new Map(),
    stock:      new Map(),   // stockKey → { bin_id, item_id, lot_no, serial_no, qty, expiry, received_at }
    movements:  [],          // append-only array
    pickLists:  new Map(),
    packLists:  new Map(),
    deliveryNotes: new Map(),
    cycleCounts:  new Map(),
    kitDefs:    new Map(),   // kitSku → [{item_id, qty}, ...]
  };

  // ═══════════════════════════════════════════════════════════════
  //  Master data — warehouses, zones, aisles, racks, shelves, bins
  // ═══════════════════════════════════════════════════════════════

  function addWarehouse({ code, name_he, name_en, address } = {}) {
    requireArg(code, 'חובה להזין קוד מחסן', 'warehouse code is required');
    requireArg(name_he, 'חובה להזין שם בעברית', 'Hebrew name is required');
    const id = makeId('wh');
    const wh = {
      id,
      code: String(code).toUpperCase(),
      name_he: String(name_he),
      name_en: String(name_en || name_he),
      address: address || null,
      archived: false,
      created_at: clock(),
    };
    state.warehouses.set(id, wh);
    return wh;
  }

  function addZone({ warehouse_id, code, type, name_he, name_en } = {}) {
    requireArg(warehouse_id, 'חובה להזין מחסן', 'warehouse_id is required');
    requireArg(code, 'חובה להזין קוד אזור', 'zone code is required');
    if (!state.warehouses.has(warehouse_id)) {
      throw bilErr('מחסן לא נמצא', 'warehouse not found', 404);
    }
    const zoneType = String(type || ZONE_TYPE.BULK).toLowerCase();
    if (!Object.values(ZONE_TYPE).includes(zoneType)) {
      throw bilErr(
        `סוג אזור לא חוקי: ${zoneType}`,
        `invalid zone type: ${zoneType}`,
        400,
      );
    }
    const id = makeId('zn');
    const zone = {
      id,
      warehouse_id,
      code: String(code).toUpperCase(),
      type: zoneType,
      name_he: String(name_he || ZONE_TYPES_HE[zoneType]),
      name_en: String(name_en || zoneType),
      created_at: clock(),
    };
    state.zones.set(id, zone);
    return zone;
  }

  function addAisle({ zone_id, code } = {}) {
    requireArg(zone_id, 'חובה להזין אזור', 'zone_id is required');
    if (!state.zones.has(zone_id)) {
      throw bilErr('אזור לא נמצא', 'zone not found', 404);
    }
    requireArg(code, 'חובה להזין קוד מעבר', 'aisle code is required');
    const id = makeId('ai');
    const aisle = { id, zone_id, code: String(code).toUpperCase() };
    state.aisles.set(id, aisle);
    return aisle;
  }

  function addRack({ aisle_id, code } = {}) {
    requireArg(aisle_id, 'חובה להזין מעבר', 'aisle_id is required');
    if (!state.aisles.has(aisle_id)) {
      throw bilErr('מעבר לא נמצא', 'aisle not found', 404);
    }
    requireArg(code, 'חובה להזין קוד מתקן', 'rack code is required');
    const id = makeId('rk');
    const rack = { id, aisle_id, code: String(code).toUpperCase() };
    state.racks.set(id, rack);
    return rack;
  }

  function addShelf({ rack_id, code, level } = {}) {
    requireArg(rack_id, 'חובה להזין מתקן', 'rack_id is required');
    if (!state.racks.has(rack_id)) {
      throw bilErr('מתקן לא נמצא', 'rack not found', 404);
    }
    requireArg(code, 'חובה להזין קוד מדף', 'shelf code is required');
    const id = makeId('sh');
    const shelf = {
      id,
      rack_id,
      code: String(code).toUpperCase(),
      level: Number.isFinite(level) ? level : 0,
    };
    state.shelves.set(id, shelf);
    return shelf;
  }

  function addBin({ shelf_id, code, capacity, abc_class } = {}) {
    requireArg(shelf_id, 'חובה להזין מדף', 'shelf_id is required');
    if (!state.shelves.has(shelf_id)) {
      throw bilErr('מדף לא נמצא', 'shelf not found', 404);
    }
    requireArg(code, 'חובה להזין קוד תא', 'bin code is required');
    if (capacity !== undefined) {
      requireNonNegNumber(capacity, 'קיבולת חייבת להיות מספר חיובי', 'capacity must be a non-negative number');
    }
    const klass = abc_class && ABC_CLASS[abc_class] ? abc_class : ABC_CLASS.C;
    const id = makeId('bn');
    const bin = {
      id,
      shelf_id,
      code: String(code).toUpperCase(),
      capacity: capacity === undefined ? Infinity : Number(capacity),
      abc_class: klass,
      archived: false,
      created_at: clock(),
    };
    state.bins.set(id, bin);
    return bin;
  }

  /**
   * Soft-archive a bin. We never delete — the stock remains visible in
   * history, but the bin will not be picked for putaway suggestions and
   * will not appear in `listBins()` unless `includeArchived` is set.
   */
  function archiveBin(bin_id, reason) {
    const bin = state.bins.get(bin_id);
    if (!bin) {
      throw bilErr('תא לא נמצא', 'bin not found', 404);
    }
    if (binHasStock(bin_id)) {
      throw bilErr(
        'לא ניתן להעביר לארכיון תא עם מלאי — יש להעביר את המלאי תחילה',
        'cannot archive a bin with stock — transfer the stock first',
        409,
      );
    }
    bin.archived = true;
    bin.archive_reason = reason || null;
    bin.archived_at = clock();
    return bin;
  }

  function listBins(warehouse_id, includeArchived = false) {
    const out = [];
    for (const bin of state.bins.values()) {
      if (bin.archived && !includeArchived) continue;
      if (warehouse_id && getBinWarehouse(bin.id) !== warehouse_id) continue;
      out.push(bin);
    }
    return out;
  }

  /** Walk up from bin → shelf → rack → aisle → zone → warehouse. */
  function getBinWarehouse(binId) {
    const bin = state.bins.get(binId);
    if (!bin) return null;
    const shelf = state.shelves.get(bin.shelf_id);
    if (!shelf) return null;
    const rack = state.racks.get(shelf.rack_id);
    if (!rack) return null;
    const aisle = state.aisles.get(rack.aisle_id);
    if (!aisle) return null;
    const zone = state.zones.get(aisle.zone_id);
    if (!zone) return null;
    return zone.warehouse_id;
  }

  function getBinZone(binId) {
    const bin = state.bins.get(binId);
    if (!bin) return null;
    const shelf = state.shelves.get(bin.shelf_id);
    if (!shelf) return null;
    const rack = state.racks.get(shelf.rack_id);
    if (!rack) return null;
    const aisle = state.aisles.get(rack.aisle_id);
    if (!aisle) return null;
    return state.zones.get(aisle.zone_id) || null;
  }

  function binHasStock(binId) {
    for (const row of state.stock.values()) {
      if (row.bin_id === binId && row.qty > 0) return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  //  Movements (append-only audit trail)
  // ═══════════════════════════════════════════════════════════════

  function appendMovement(m) {
    const record = {
      id: makeId('mv'),
      when: clock(),
      kind: m.kind,
      item_id: m.item_id || null,
      qty: Number(m.qty) || 0,
      from_bin: m.from_bin || null,
      to_bin: m.to_bin || null,
      lot_no: m.lot_no || null,
      serial_no: m.serial_no || null,
      ref: m.ref || null,
      who: m.who || 'system',
      note_he: m.note_he || null,
      note_en: m.note_en || null,
    };
    state.movements.push(record);
    return record;
  }

  function getMovements(filter = {}) {
    return state.movements.filter((m) => {
      if (filter.kind && m.kind !== filter.kind) return false;
      if (filter.item_id && m.item_id !== filter.item_id) return false;
      if (filter.bin_id && m.from_bin !== filter.bin_id && m.to_bin !== filter.bin_id) return false;
      if (filter.ref && m.ref !== filter.ref) return false;
      return true;
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  Stock mutation primitives
  // ═══════════════════════════════════════════════════════════════

  function ensureBinExists(binId) {
    const bin = state.bins.get(binId);
    if (!bin) {
      throw bilErr(`תא לא נמצא: ${binId}`, `bin not found: ${binId}`, 404);
    }
    if (bin.archived) {
      throw bilErr(`תא בארכיון: ${bin.code}`, `bin is archived: ${bin.code}`, 409);
    }
    return bin;
  }

  /** Low-level stock add. Creates the row if missing. */
  function _stockAdd(binId, itemId, qty, meta = {}) {
    const lotNo = meta.lot_no || '';
    const serialNo = meta.serial_no || '';
    const key = stockKey(binId, itemId, lotNo, serialNo);
    const existing = state.stock.get(key);
    if (existing) {
      existing.qty += qty;
      if (meta.expiry && !existing.expiry) existing.expiry = meta.expiry;
      return existing;
    }
    const row = {
      bin_id: binId,
      item_id: itemId,
      lot_no: lotNo || null,
      serial_no: serialNo || null,
      qty,
      expiry: meta.expiry || null,
      received_at: meta.received_at || clock(),
    };
    state.stock.set(key, row);
    return row;
  }

  /** Low-level stock subtract. Throws on underflow. */
  function _stockSub(binId, itemId, qty, meta = {}) {
    const lotNo = meta.lot_no || '';
    const serialNo = meta.serial_no || '';
    const key = stockKey(binId, itemId, lotNo, serialNo);
    const existing = state.stock.get(key);
    if (!existing || existing.qty < qty) {
      throw bilErr(
        `אין מספיק מלאי בתא ${binId} (${existing ? existing.qty : 0} < ${qty})`,
        `insufficient stock in bin ${binId} (${existing ? existing.qty : 0} < ${qty})`,
        409,
      );
    }
    existing.qty -= qty;
    return existing;
  }

  // ═══════════════════════════════════════════════════════════════
  //  RECEIVE — from PO
  // ═══════════════════════════════════════════════════════════════

  /**
   * Receive a purchase order. Each item is posted to the target bin
   * in the same index. If `targetBins` is shorter than `items`, the
   * missing bins default to a putaway suggestion.
   *
   *   items       = [{ item_id, qty, lot_no?, expiry?, serial_no? }, …]
   *   targetBins  = [bin_id, bin_id, …]
   *
   * Returns an array of movement ids (one per line).
   */
  function receivePO(poId, items, targetBins = []) {
    requireArg(poId, 'חובה להזין מספר הזמנה', 'poId is required');
    if (!Array.isArray(items) || items.length === 0) {
      throw bilErr('רשימת פריטים ריקה', 'items list is empty', 400);
    }
    const movementIds = [];
    for (let i = 0; i < items.length; i += 1) {
      const line = items[i];
      requireArg(line.item_id, 'חובה להזין קוד פריט', 'item_id is required');
      requireNonNegNumber(line.qty, 'כמות חייבת להיות מספר חיובי', 'qty must be non-negative');
      if (line.qty <= 0) continue;

      let binId = targetBins[i];
      if (!binId) {
        const suggestion = suggestPutaway(line.item_id, line.qty);
        binId = suggestion ? suggestion.id : null;
      }
      if (!binId) {
        throw bilErr(
          `אין תא יעד לפריט ${line.item_id}`,
          `no target bin for item ${line.item_id}`,
          409,
        );
      }
      ensureBinExists(binId);

      _stockAdd(binId, line.item_id, line.qty, {
        lot_no: line.lot_no,
        serial_no: line.serial_no,
        expiry: line.expiry,
      });

      const mv = appendMovement({
        kind: MOVEMENT_KIND.RECEIVE,
        item_id: line.item_id,
        qty: line.qty,
        to_bin: binId,
        lot_no: line.lot_no,
        serial_no: line.serial_no,
        ref: poId,
        who: line.who || 'receiving',
        note_he: `קבלת סחורה מהזמנה ${poId}`,
        note_en: `receive from PO ${poId}`,
      });
      movementIds.push(mv.id);

      // Chain a putaway movement for the same quantity. This makes the
      // audit trail explicit: receive → putaway, both against the same
      // bin (target bin). Some WMS flows split receiving dock from
      // storage bin; we keep them collapsed here because we expose a
      // pure API with no dock state, but a consumer may call `transfer`
      // later to move to the final bin and the movement history will
      // show the full journey.
      const mvPut = appendMovement({
        kind: MOVEMENT_KIND.PUTAWAY,
        item_id: line.item_id,
        qty: line.qty,
        to_bin: binId,
        lot_no: line.lot_no,
        ref: poId,
        who: line.who || 'receiving',
        note_he: `העלאה למדף ${binId}`,
        note_en: `putaway to ${binId}`,
      });
      movementIds.push(mvPut.id);
    }
    return movementIds;
  }

  /**
   * Receive a single line from a barcode payload emitted by Agent 86
   * (see `src/scanners/barcode-scanner.js`). Accepts either the full
   * parsed descriptor or the GS1 fields dict.
   *
   *   payload = {
   *     clean: "01029012345678902110ABCD17260110",
   *     gs1:   { fields: { GTIN:"..", BatchLot:"..", ExpiryDate:".." } }
   *   }
   */
  function receiveFromBarcode(payload, binId, who) {
    requireArg(payload, 'מטען ברקוד חסר', 'barcode payload is required');
    requireArg(binId, 'חובה להזין תא יעד', 'binId is required');
    ensureBinExists(binId);

    let itemId = null;
    let lotNo = null;
    let expiry = null;
    let serialNo = null;
    let qty = 1;

    if (payload.gs1 && payload.gs1.fields) {
      const f = payload.gs1.fields;
      itemId = f.GTIN || null;
      lotNo = f.BatchLot || null;
      expiry = f.ExpiryDate || null;
      serialNo = f.Serial || null;
    } else if (typeof payload === 'object') {
      itemId = payload.item_id || payload.sku || payload.clean || null;
      lotNo = payload.lot_no || null;
      expiry = payload.expiry || null;
      serialNo = payload.serial_no || null;
      qty = Number(payload.qty) > 0 ? Number(payload.qty) : 1;
    }

    if (!itemId) {
      throw bilErr('לא זוהה פריט בברקוד', 'no item identified in barcode', 400);
    }

    _stockAdd(binId, itemId, qty, { lot_no: lotNo, serial_no: serialNo, expiry });
    const mv = appendMovement({
      kind: MOVEMENT_KIND.RECEIVE,
      item_id: itemId,
      qty,
      to_bin: binId,
      lot_no: lotNo,
      serial_no: serialNo,
      who: who || 'scanner',
      note_he: 'קבלה באמצעות סורק ברקוד',
      note_en: 'receive via barcode scanner',
    });
    return mv.id;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUTAWAY suggestion — ABC-aware
  // ═══════════════════════════════════════════════════════════════

  /**
   * Suggest a bin for putaway. Algorithm:
   *
   *   1. Prefer bins in the BULK or PICK zone (never RECEIVE / QA).
   *   2. Score candidates by matching ABC class (A items → A bins near
   *      the ship zone).
   *   3. Among equal-class candidates, prefer bins that already hold
   *      some of the same item (consolidation).
   *   4. Finally, pick the bin with the most free capacity.
   *
   * Returns `null` if nothing fits.
   */
  function suggestPutaway(itemId, qty) {
    requireArg(itemId, 'חובה להזין קוד פריט', 'itemId is required');
    requireNonNegNumber(qty, 'כמות חייבת להיות מספר חיובי', 'qty must be non-negative');

    const candidates = [];
    for (const bin of state.bins.values()) {
      if (bin.archived) continue;
      const zone = getBinZone(bin.id);
      if (!zone) continue;
      if (zone.type === ZONE_TYPE.RECEIVE || zone.type === ZONE_TYPE.QA) continue;
      if (zone.type === ZONE_TYPE.QUARANTINE) continue;

      const currentLoad = binCurrentLoad(bin.id);
      const free = bin.capacity === Infinity
        ? Number.POSITIVE_INFINITY
        : bin.capacity - currentLoad;
      if (free < qty) continue;

      let score = 0;
      // ABC preference — A items prefer A bins, C items prefer C bins.
      // We'll infer the "best class" for new items later, so for now
      // every match bumps the score.
      // Consolidation: same item already present?
      const sameItem = binHasItem(bin.id, itemId);
      if (sameItem) score += 50;

      // Bin-class weights — prefer higher class (A) when no consolidation
      // hit. This simulates "fast movers near the ship dock".
      if (bin.abc_class === 'A') score += 10;
      else if (bin.abc_class === 'B') score += 5;

      // Zone preference — PICK ahead of BULK
      if (zone.type === ZONE_TYPE.PICK) score += 20;

      candidates.push({ bin, score, free });
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Bigger free space wins among ties
      return b.free - a.free;
    });
    return candidates[0].bin;
  }

  function binCurrentLoad(binId) {
    let total = 0;
    for (const row of state.stock.values()) {
      if (row.bin_id === binId) total += row.qty;
    }
    return total;
  }

  function binHasItem(binId, itemId) {
    for (const row of state.stock.values()) {
      if (row.bin_id === binId && row.item_id === itemId && row.qty > 0) return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PICK LIST generation — FIFO/FEFO/LIFO
  // ═══════════════════════════════════════════════════════════════

  /**
   * Generate a pick list for an order. The `order` object is:
   *
   *   { id, lines: [{ item_id, qty }, ...] }
   *
   * Rules:
   *   - rule='FIFO' → oldest received row first
   *   - rule='FEFO' → nearest expiry first (rows with no expiry last)
   *   - rule='LIFO' → newest received first
   *   - If not enough stock, throws — never silently short-picks.
   *
   * The returned pick list also includes `path[]`: the bin order that
   * minimises walking (see `optimisePath()`).
   */
  function generatePickList(orderOrId, rules = {}) {
    let order;
    if (typeof orderOrId === 'object' && orderOrId && Array.isArray(orderOrId.lines)) {
      order = orderOrId;
    } else {
      throw bilErr(
        'יש להעביר הזמנה עם קווי ליקוט',
        'order with lines is required',
        400,
      );
    }
    const rule = String(rules.rule || PICK_RULES.FIFO).toUpperCase();
    if (!PICK_RULES[rule]) {
      throw bilErr(
        `כלל ליקוט לא חוקי: ${rule}`,
        `invalid pick rule: ${rule}`,
        400,
      );
    }

    const pickLines = [];
    for (const line of order.lines) {
      requireArg(line.item_id, 'חובה להזין קוד פריט', 'item_id is required');
      requireNonNegNumber(line.qty, 'כמות חייבת להיות מספר חיובי', 'qty must be non-negative');
      if (line.qty <= 0) continue;

      // Collect all stock rows for this item
      const sources = [];
      for (const row of state.stock.values()) {
        if (row.item_id !== line.item_id) continue;
        if (row.qty <= 0) continue;
        const bin = state.bins.get(row.bin_id);
        if (!bin || bin.archived) continue;
        sources.push(row);
      }

      if (sources.length === 0) {
        throw bilErr(
          `אין מלאי לפריט ${line.item_id}`,
          `no stock for item ${line.item_id}`,
          409,
        );
      }

      // Sort by rule
      sources.sort((a, b) => {
        if (rule === 'FIFO') {
          return String(a.received_at).localeCompare(String(b.received_at));
        }
        if (rule === 'LIFO') {
          return String(b.received_at).localeCompare(String(a.received_at));
        }
        // FEFO — rows without expiry sort last
        const ax = a.expiry || '9999-12-31';
        const bx = b.expiry || '9999-12-31';
        return String(ax).localeCompare(String(bx));
      });

      // Allocate
      let remaining = line.qty;
      for (const src of sources) {
        if (remaining <= 0) break;
        const take = Math.min(src.qty, remaining);
        pickLines.push({
          item_id: line.item_id,
          qty: take,
          bin_id: src.bin_id,
          lot_no: src.lot_no,
          serial_no: src.serial_no,
          expiry: src.expiry,
        });
        remaining -= take;
      }

      if (remaining > 0) {
        throw bilErr(
          `אין מספיק מלאי לפריט ${line.item_id} (חסרים ${remaining})`,
          `insufficient stock for ${line.item_id} (short ${remaining})`,
          409,
        );
      }
    }

    const path = optimisePath(pickLines);

    const id = makeId('pl');
    const pl = {
      id,
      order_id: order.id || id,
      status: PICK_STATUS.OPEN,
      rule,
      lines: pickLines,
      path,
      created_at: clock(),
      picked: [],        // filled in by confirmPick
    };
    state.pickLists.set(id, pl);
    return pl;
  }

  /**
   * Minimise walking: within each warehouse, sort bins by
   * (aisle_code, rack_code, shelf_level, shelf_code, bin_code). This
   * produces a deterministic S-shape traversal without serpentine
   * reversal — close enough for single-aisle shops and stable across
   * runs. The result is a unique ordered list of bin ids.
   */
  function optimisePath(pickLines) {
    const seen = new Set();
    const orderedBins = [];
    const bins = [];

    for (const line of pickLines) {
      if (seen.has(line.bin_id)) continue;
      seen.add(line.bin_id);
      const bin = state.bins.get(line.bin_id);
      if (!bin) continue;
      const shelf = state.shelves.get(bin.shelf_id) || {};
      const rack  = state.racks.get(shelf.rack_id)   || {};
      const aisle = state.aisles.get(rack.aisle_id)  || {};
      bins.push({
        id: line.bin_id,
        aisle: aisle.code || 'Z',
        rack:  rack.code  || 'Z',
        level: shelf.level || 0,
        shelf: shelf.code || 'Z',
        bin:   bin.code,
      });
    }

    bins.sort((a, b) => (
      a.aisle.localeCompare(b.aisle) ||
      a.rack.localeCompare(b.rack) ||
      (a.level - b.level) ||
      a.shelf.localeCompare(b.shelf) ||
      a.bin.localeCompare(b.bin)
    ));

    for (const b of bins) orderedBins.push(b.id);
    return orderedBins;
  }

  // ═══════════════════════════════════════════════════════════════
  //  PICK confirm / PACK / SHIP
  // ═══════════════════════════════════════════════════════════════

  /**
   * Confirm that `qty` of `itemId` has been physically picked from
   * `binId` for the given pick list. Decrements stock and appends a
   * `pick` movement. Mutates the pick list status.
   */
  function confirmPick(pickId, itemId, qty, binId, opts = {}) {
    const pl = state.pickLists.get(pickId);
    if (!pl) {
      throw bilErr('רשימת ליקוט לא נמצאה', 'pick list not found', 404);
    }
    if (pl.status === PICK_STATUS.SHIPPED) {
      throw bilErr('רשימת ליקוט כבר נשלחה', 'pick list already shipped', 409);
    }
    requireArg(itemId, 'חובה להזין קוד פריט', 'itemId is required');
    requireArg(binId,  'חובה להזין תא',     'binId is required');
    requireNonNegNumber(qty, 'כמות חייבת להיות מספר חיובי', 'qty must be non-negative');

    // Find the matching planned line
    const planned = pl.lines.find(
      (l) => l.item_id === itemId && l.bin_id === binId && !l.picked,
    );
    if (!planned) {
      throw bilErr(
        `אין קו ליקוט מתאים: ${itemId} @ ${binId}`,
        `no matching pick line for ${itemId} @ ${binId}`,
        409,
      );
    }
    if (qty > planned.qty) {
      throw bilErr(
        `כמות ליקוט (${qty}) גדולה מהמתוכנן (${planned.qty})`,
        `pick qty (${qty}) exceeds planned (${planned.qty})`,
        409,
      );
    }

    _stockSub(binId, itemId, qty, {
      lot_no: planned.lot_no,
      serial_no: planned.serial_no,
    });

    pl.status = PICK_STATUS.PICKING;
    pl.picked.push({
      item_id: itemId,
      qty,
      bin_id: binId,
      lot_no: planned.lot_no,
      serial_no: planned.serial_no,
      at: clock(),
    });
    planned.picked = true;
    planned.picked_qty = qty;

    appendMovement({
      kind: MOVEMENT_KIND.PICK,
      item_id: itemId,
      qty,
      from_bin: binId,
      lot_no: planned.lot_no,
      serial_no: planned.serial_no,
      ref: pl.order_id,
      who: opts.who || 'picker',
      note_he: `ליקוט עבור הזמנה ${pl.order_id}`,
      note_en: `pick for order ${pl.order_id}`,
    });

    // Auto-advance status when all lines are picked
    if (pl.lines.every((l) => l.picked)) {
      pl.status = PICK_STATUS.PICKED;
    }
    return pl;
  }

  /**
   * Build a pack list from picked items. Items are grouped into a
   * single carton by default; pass `opts.cartons` to split.
   *
   *   pickedItems = [{ item_id, qty, bin_id, lot_no?, serial_no? }, …]
   */
  function packOrder(orderId, pickedItems, opts = {}) {
    requireArg(orderId, 'חובה להזין מספר הזמנה', 'orderId is required');
    if (!Array.isArray(pickedItems) || pickedItems.length === 0) {
      throw bilErr('רשימת פריטים ריקה', 'picked items list is empty', 400);
    }

    const id = makeId('pk');
    const cartons = opts.cartons && Array.isArray(opts.cartons)
      ? opts.cartons
      : [{ code: 'C1', items: pickedItems.slice() }];

    const weight = Number(opts.weight) || 0;

    const pack = {
      id,
      order_id: orderId,
      pickList_id: opts.pickList_id || null,
      cartons,
      weight,
      status: 'packed',
      packed_at: clock(),
      packed_by: opts.who || 'packer',
    };
    state.packLists.set(id, pack);

    // If a pick list was passed and all its lines are picked, flip it.
    if (opts.pickList_id && state.pickLists.has(opts.pickList_id)) {
      const pl = state.pickLists.get(opts.pickList_id);
      pl.status = PICK_STATUS.PACKED;
    }

    appendMovement({
      kind: MOVEMENT_KIND.PACK,
      item_id: null,
      qty: pickedItems.reduce((s, it) => s + Number(it.qty || 0), 0),
      ref: orderId,
      who: opts.who || 'packer',
      note_he: `אריזת הזמנה ${orderId}`,
      note_en: `pack order ${orderId}`,
    });
    return pack.id;
  }

  /**
   * Confirm shipment — produces a delivery note id. Flips the pack
   * list status and (if linked) the pick list status.
   */
  function shipOrder(packId, carrier, opts = {}) {
    const pack = state.packLists.get(packId);
    if (!pack) {
      throw bilErr('רשימת אריזה לא נמצאה', 'pack list not found', 404);
    }
    if (pack.status === 'shipped') {
      throw bilErr('ההזמנה כבר נשלחה', 'order already shipped', 409);
    }
    pack.status = 'shipped';
    pack.shipped_at = clock();
    pack.carrier = carrier || null;

    const dn = {
      id: makeId('dn'),
      order_id: pack.order_id,
      pack_id: packId,
      carrier: carrier || 'self-collection',
      issued_at: pack.shipped_at,
      issued_by: opts.who || 'shipping',
    };
    state.deliveryNotes.set(dn.id, dn);

    if (pack.pickList_id && state.pickLists.has(pack.pickList_id)) {
      state.pickLists.get(pack.pickList_id).status = PICK_STATUS.SHIPPED;
    }

    appendMovement({
      kind: MOVEMENT_KIND.SHIP,
      item_id: null,
      qty: 0,
      ref: pack.order_id,
      who: opts.who || 'shipping',
      note_he: `משלוח הזמנה ${pack.order_id} באמצעות ${dn.carrier}`,
      note_en: `ship order ${pack.order_id} via ${dn.carrier}`,
    });
    return dn.id;
  }

  // ═══════════════════════════════════════════════════════════════
  //  CYCLE COUNT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Cycle count a bin. Compares `counted` against the system total and
   * posts an `adjust` movement for the variance. If an `itemId` is
   * passed, the count applies only to that item inside the bin —
   * otherwise the entire bin is counted as one blob.
   *
   *   returns { variance, adjustment, expected, counted }
   */
  function cycleCount(binId, counted, itemId, opts = {}) {
    ensureBinExists(binId);
    requireNonNegNumber(counted, 'כמות חייבת להיות מספר חיובי', 'counted must be non-negative');

    let expected = 0;
    const rows = [];
    for (const row of state.stock.values()) {
      if (row.bin_id !== binId) continue;
      if (itemId && row.item_id !== itemId) continue;
      expected += row.qty;
      rows.push(row);
    }

    const variance = counted - expected;
    const id = makeId('cc');
    const record = {
      id,
      bin_id: binId,
      item_id: itemId || null,
      expected,
      counted,
      variance,
      counted_at: clock(),
      counted_by: opts.who || 'counter',
      resolved: false,
    };

    if (variance !== 0) {
      // Adjust: add (positive) to the first matching row, or subtract
      // from the largest row when negative. For bin-level counts with
      // no itemId, we post a bookkeeping adjustment against a synthetic
      // "bin_balance" item — the caller can then reconcile per-item.
      if (itemId) {
        const row = rows[0] || _stockAdd(binId, itemId, 0);
        row.qty = Math.max(0, row.qty + variance);
      }
      appendMovement({
        kind: MOVEMENT_KIND.CYCLE_COUNT,
        item_id: itemId || null,
        qty: variance,
        to_bin: variance > 0 ? binId : null,
        from_bin: variance < 0 ? binId : null,
        ref: id,
        who: opts.who || 'counter',
        note_he: `ספירת מלאי — פער ${variance}`,
        note_en: `cycle count — variance ${variance}`,
      });
    }

    record.resolved = variance === 0;
    record.adjustment = variance;
    state.cycleCounts.set(id, record);
    return {
      id,
      expected,
      counted,
      variance,
      adjustment: variance,
      resolved: record.resolved,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  TRANSFERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Move stock from one bin to another. Bins may live in different
   * warehouses — when they do, we post `transfer_out` + `transfer_in`
   * instead of a single `move`, so the audit trail is explicit.
   */
  function transfer(fromBin, toBin, itemId, qty, opts = {}) {
    ensureBinExists(fromBin);
    ensureBinExists(toBin);
    requireArg(itemId, 'חובה להזין קוד פריט', 'itemId is required');
    requireNonNegNumber(qty, 'כמות חייבת להיות מספר חיובי', 'qty must be non-negative');
    if (qty <= 0) {
      throw bilErr('כמות חייבת להיות גדולה מאפס', 'qty must be greater than zero', 400);
    }

    const fromWh = getBinWarehouse(fromBin);
    const toWh   = getBinWarehouse(toBin);
    const sameWarehouse = fromWh && toWh && fromWh === toWh;

    _stockSub(fromBin, itemId, qty, { lot_no: opts.lot_no, serial_no: opts.serial_no });
    _stockAdd(toBin,   itemId, qty, {
      lot_no: opts.lot_no,
      serial_no: opts.serial_no,
      expiry: opts.expiry,
    });

    if (sameWarehouse) {
      const mv = appendMovement({
        kind: MOVEMENT_KIND.MOVE,
        item_id: itemId,
        qty,
        from_bin: fromBin,
        to_bin: toBin,
        lot_no: opts.lot_no,
        serial_no: opts.serial_no,
        ref: opts.ref || null,
        who: opts.who || 'operator',
        note_he: `העברה בתוך המחסן`,
        note_en: `intra-warehouse move`,
      });
      return mv.id;
    }

    appendMovement({
      kind: MOVEMENT_KIND.TRANSFER_OUT,
      item_id: itemId,
      qty,
      from_bin: fromBin,
      lot_no: opts.lot_no,
      ref: opts.ref || null,
      who: opts.who || 'operator',
      note_he: `העברה בין מחסנים — יציאה`,
      note_en: `inter-warehouse transfer — out`,
    });
    const mvIn = appendMovement({
      kind: MOVEMENT_KIND.TRANSFER_IN,
      item_id: itemId,
      qty,
      to_bin: toBin,
      lot_no: opts.lot_no,
      ref: opts.ref || null,
      who: opts.who || 'operator',
      note_he: `העברה בין מחסנים — כניסה`,
      note_en: `inter-warehouse transfer — in`,
    });
    return mvIn.id;
  }

  // ═══════════════════════════════════════════════════════════════
  //  KITTING / Assembly
  // ═══════════════════════════════════════════════════════════════

  /** Define a kit (BoM). `components = [{ item_id, qty }, …]`. */
  function defineKit(kitSku, components) {
    requireArg(kitSku, 'חובה להזין קוד מכלול', 'kitSku is required');
    if (!Array.isArray(components) || components.length === 0) {
      throw bilErr('רשימת רכיבים ריקה', 'components list is empty', 400);
    }
    state.kitDefs.set(kitSku, components.map((c) => ({
      item_id: c.item_id,
      qty: Number(c.qty) || 0,
    })));
    return state.kitDefs.get(kitSku);
  }

  /**
   * Assemble a kit. Consumes components from their bins and produces
   * one unit of `kitSku` into `toBin`. If `components` is omitted, the
   * previously defined BoM is used.
   */
  function kitAssemble(kitSku, componentsOrBin, maybeToBin, opts = {}) {
    requireArg(kitSku, 'חובה להזין קוד מכלול', 'kitSku is required');

    let components;
    let toBin;

    if (Array.isArray(componentsOrBin)) {
      components = componentsOrBin;
      toBin = maybeToBin;
    } else {
      // (kitSku, toBin) form — use defined BoM
      toBin = componentsOrBin;
      components = state.kitDefs.get(kitSku);
      if (!components) {
        throw bilErr(
          `מכלול לא הוגדר: ${kitSku}`,
          `kit not defined: ${kitSku}`,
          404,
        );
      }
    }

    requireArg(toBin, 'חובה להזין תא יעד', 'toBin is required');
    ensureBinExists(toBin);

    // Consume each component from its source bin
    for (const comp of components) {
      requireArg(comp.item_id, 'חובה להזין קוד פריט', 'component.item_id is required');
      requireArg(comp.from_bin || comp.bin_id, 'חובה להזין תא מקור', 'component.from_bin is required');
      const fromBin = comp.from_bin || comp.bin_id;
      _stockSub(fromBin, comp.item_id, Number(comp.qty) || 0);
      appendMovement({
        kind: MOVEMENT_KIND.KIT_DISASSEMBLE,
        item_id: comp.item_id,
        qty: Number(comp.qty) || 0,
        from_bin: fromBin,
        ref: kitSku,
        who: opts.who || 'assembler',
        note_he: `רכיב של ${kitSku}`,
        note_en: `component of ${kitSku}`,
      });
    }

    _stockAdd(toBin, kitSku, 1);
    const mv = appendMovement({
      kind: MOVEMENT_KIND.KIT_ASSEMBLE,
      item_id: kitSku,
      qty: 1,
      to_bin: toBin,
      ref: kitSku,
      who: opts.who || 'assembler',
      note_he: `הרכבת מכלול ${kitSku}`,
      note_en: `assemble kit ${kitSku}`,
    });
    return mv.id;
  }

  /** Reverse of kitAssemble — break one kit unit back into components. */
  function kitDisassemble(kitSku, fromBin, components, opts = {}) {
    requireArg(kitSku, 'חובה להזין קוד מכלול', 'kitSku is required');
    ensureBinExists(fromBin);
    const bom = Array.isArray(components) && components.length > 0
      ? components
      : state.kitDefs.get(kitSku);
    if (!bom) {
      throw bilErr(
        `מכלול לא הוגדר: ${kitSku}`,
        `kit not defined: ${kitSku}`,
        404,
      );
    }
    _stockSub(fromBin, kitSku, 1);
    for (const comp of bom) {
      const destBin = comp.to_bin || comp.bin_id || fromBin;
      _stockAdd(destBin, comp.item_id, Number(comp.qty) || 0);
      appendMovement({
        kind: MOVEMENT_KIND.KIT_ASSEMBLE,  // inverse posts on components
        item_id: comp.item_id,
        qty: Number(comp.qty) || 0,
        to_bin: destBin,
        ref: kitSku,
        who: opts.who || 'disassembler',
        note_he: `פירוק רכיב של ${kitSku}`,
        note_en: `disassembled component of ${kitSku}`,
      });
    }
    const mv = appendMovement({
      kind: MOVEMENT_KIND.KIT_DISASSEMBLE,
      item_id: kitSku,
      qty: 1,
      from_bin: fromBin,
      ref: kitSku,
      who: opts.who || 'disassembler',
      note_he: `פירוק מכלול ${kitSku}`,
      note_en: `disassemble kit ${kitSku}`,
    });
    return mv.id;
  }

  // ═══════════════════════════════════════════════════════════════
  //  QUERIES
  // ═══════════════════════════════════════════════════════════════

  /**
   * Total on-hand for an item, optionally filtered by warehouse.
   * Returns `{ total, byBin:[{bin_id, bin_code, qty, lot_no, …}, …] }`.
   */
  function getStock(itemId, warehouseId) {
    requireArg(itemId, 'חובה להזין קוד פריט', 'itemId is required');
    let total = 0;
    const byBin = [];
    for (const row of state.stock.values()) {
      if (row.item_id !== itemId) continue;
      if (row.qty <= 0) continue;
      if (warehouseId && getBinWarehouse(row.bin_id) !== warehouseId) continue;
      const bin = state.bins.get(row.bin_id);
      total += row.qty;
      byBin.push({
        bin_id: row.bin_id,
        bin_code: bin ? bin.code : '?',
        qty: row.qty,
        lot_no: row.lot_no,
        serial_no: row.serial_no,
        expiry: row.expiry,
        received_at: row.received_at,
      });
    }
    return { item_id: itemId, total, byBin };
  }

  /** Direct stock adjustment — reason is mandatory and logged. */
  function adjustStock(binId, itemId, delta, reason, opts = {}) {
    ensureBinExists(binId);
    requireArg(itemId, 'חובה להזין קוד פריט', 'itemId is required');
    if (typeof delta !== 'number' || !Number.isFinite(delta)) {
      throw bilErr('שינוי חייב להיות מספר', 'delta must be a finite number', 400);
    }
    requireArg(reason, 'חובה להזין סיבת התאמה', 'reason is required');

    if (delta > 0) {
      _stockAdd(binId, itemId, delta, { lot_no: opts.lot_no, serial_no: opts.serial_no });
    } else if (delta < 0) {
      _stockSub(binId, itemId, -delta, { lot_no: opts.lot_no, serial_no: opts.serial_no });
    }
    const mv = appendMovement({
      kind: MOVEMENT_KIND.ADJUST,
      item_id: itemId,
      qty: delta,
      to_bin: delta > 0 ? binId : null,
      from_bin: delta < 0 ? binId : null,
      ref: reason,
      who: opts.who || 'manager',
      note_he: `התאמה: ${reason}`,
      note_en: `adjust: ${reason}`,
    });
    return mv.id;
  }

  // ═══════════════════════════════════════════════════════════════
  //  SNAPSHOT / RESTORE
  // ═══════════════════════════════════════════════════════════════

  function snapshot() {
    return {
      version: 1,
      taken_at: clock(),
      warehouses:    Array.from(state.warehouses.values()),
      zones:         Array.from(state.zones.values()),
      aisles:        Array.from(state.aisles.values()),
      racks:         Array.from(state.racks.values()),
      shelves:       Array.from(state.shelves.values()),
      bins:          Array.from(state.bins.values()),
      stock:         Array.from(state.stock.values()),
      movements:     state.movements.slice(),
      pickLists:     Array.from(state.pickLists.values()),
      packLists:     Array.from(state.packLists.values()),
      deliveryNotes: Array.from(state.deliveryNotes.values()),
      cycleCounts:   Array.from(state.cycleCounts.values()),
      kitDefs:       Array.from(state.kitDefs.entries()),
    };
  }

  function restore(snap) {
    if (!snap || typeof snap !== 'object') {
      throw bilErr('תמונת מצב לא חוקית', 'invalid snapshot', 400);
    }
    state.warehouses.clear();
    state.zones.clear();
    state.aisles.clear();
    state.racks.clear();
    state.shelves.clear();
    state.bins.clear();
    state.stock.clear();
    state.pickLists.clear();
    state.packLists.clear();
    state.deliveryNotes.clear();
    state.cycleCounts.clear();
    state.kitDefs.clear();
    state.movements.length = 0;

    for (const w of snap.warehouses || []) state.warehouses.set(w.id, w);
    for (const z of snap.zones      || []) state.zones.set(z.id, z);
    for (const a of snap.aisles     || []) state.aisles.set(a.id, a);
    for (const r of snap.racks      || []) state.racks.set(r.id, r);
    for (const s of snap.shelves    || []) state.shelves.set(s.id, s);
    for (const b of snap.bins       || []) state.bins.set(b.id, b);
    for (const row of snap.stock    || []) {
      state.stock.set(
        stockKey(row.bin_id, row.item_id, row.lot_no, row.serial_no),
        row,
      );
    }
    for (const m of snap.movements  || []) state.movements.push(m);
    for (const pl of snap.pickLists || []) state.pickLists.set(pl.id, pl);
    for (const pk of snap.packLists || []) state.packLists.set(pk.id, pk);
    for (const dn of snap.deliveryNotes || []) state.deliveryNotes.set(dn.id, dn);
    for (const cc of snap.cycleCounts || []) state.cycleCounts.set(cc.id, cc);
    for (const [k, v] of snap.kitDefs || []) state.kitDefs.set(k, v);
  }

  // ═══════════════════════════════════════════════════════════════
  //  Public interface
  // ═══════════════════════════════════════════════════════════════

  return {
    // constants — safe to expose as part of the return value
    ZONE_TYPE,
    ABC_CLASS,
    PICK_RULES,
    MOVEMENT_KIND,
    PICK_STATUS,

    // master data
    addWarehouse,
    addZone,
    addAisle,
    addRack,
    addShelf,
    addBin,
    archiveBin,
    listBins,

    // operations
    receivePO,
    receiveFromBarcode,
    suggestPutaway,
    generatePickList,
    confirmPick,
    packOrder,
    shipOrder,
    cycleCount,
    transfer,
    defineKit,
    kitAssemble,
    kitDisassemble,
    adjustStock,

    // queries
    getStock,
    getMovements,

    // snapshot / restore
    snapshot,
    restore,

    // testing hooks — exposed for debugging and unit tests
    _state: state,
    _internals: {
      stockKey,
      binHasItem,
      binCurrentLoad,
      getBinWarehouse,
      getBinZone,
      optimisePath,
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  Module exports
// ═══════════════════════════════════════════════════════════════

module.exports = {
  createWMS,
  ZONE_TYPE,
  ZONE_TYPES_HE,
  ABC_CLASS,
  PICK_RULES,
  MOVEMENT_KIND,
  PICK_STATUS,
  stockKey,
};
