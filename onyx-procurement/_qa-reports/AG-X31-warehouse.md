# AG-X31 — Warehouse Management System (WMS)

**Agent:** X-31 (Swarm 3B)
**Domain:** Techno-Kol Uzi mega-ERP / `onyx-procurement`
**Date:** 2026-04-11
**Branch:** `master`
**Status:** GREEN — 42/42 tests passing

---

## 1. Scope

Agent X-31 delivers a zero-dependency Warehouse Management System for
the Techno-Kol Uzi metal-fab operation. Everything runs in pure
vanilla Node: the module imports only `node:crypto` (optional fallback
if unavailable) and exposes a single `createWMS()` factory plus a set
of named constants.

The layer covers the full physical flow:

    receive → putaway → move → pick → pack → ship
                    ↑
            cycle-count / adjust / transfer / kit

It is deliberately detached from the persistence layer. Callers hold
the `wms` instance, mutate through the API, and persist via the
`snapshot()` / `restore()` pair (JSON-serialisable, Supabase-friendly).

### Deliverables

| # | Path | Lines | Notes |
|---|------|-------|-------|
| 1 | `src/warehouse/wms.js` | 1,027 | Core module, bilingual, zero deps |
| 2 | `test/payroll/wms.test.js` | 547 | 42 unit tests, all green |
| 3 | `_qa-reports/AG-X31-warehouse.md` | this file | QA report |

---

## 2. Data model

```
Warehouse
  └─ Zone  (receive | bulk | pick | ship | qa | quarantine)
       └─ Aisle
            └─ Rack
                 └─ Shelf   (level 0 = floor)
                      └─ Bin   (capacity, abc_class: A/B/C)

Stock row   = (bin_id × item_id × lot_no × serial_no) → { qty, expiry, received_at }

Movement    = append-only audit record
              { id, kind, when, who, item_id, qty,
                from_bin, to_bin, lot_no, serial_no, ref,
                note_he, note_en }
              kind ∈ {
                receive, putaway, move, pick, pack, ship,
                adjust, cycle_count, transfer_out, transfer_in,
                kit_assemble, kit_disassemble
              }
```

### Key tables

| Entity         | Keyed by             | Notes |
|----------------|----------------------|-------|
| Warehouse      | `id`                 | Never deleted. `archived` flag only. |
| Zone           | `id`                 | `type` is an enum (bulk/pick/ship/…). |
| Bin            | `id` + `shelf_id`    | Soft `archived` flag; blocked if stock > 0. |
| Stock          | composite string key | See `stockKey()` — bin+item+lot+serial. |
| Movement       | `id` (append-only)   | The only source of truth for auditing. |

---

## 3. Public API (`createWMS(opts?)`)

### Master data

| Method | Signature |
|--------|-----------|
| `addWarehouse` | `({code,name_he,name_en,address}) → warehouse` |
| `addZone`      | `({warehouse_id,code,type,name_he,name_en}) → zone` |
| `addAisle`     | `({zone_id,code}) → aisle` |
| `addRack`      | `({aisle_id,code}) → rack` |
| `addShelf`     | `({rack_id,code,level}) → shelf` |
| `addBin`       | `({shelf_id,code,capacity,abc_class}) → bin` |
| `archiveBin`   | `(bin_id, reason) → bin` *(soft, throws if stock > 0)* |
| `listBins`     | `(warehouse_id?, includeArchived?) → bin[]` |

### Operations

| Method | Signature |
|--------|-----------|
| `receivePO` | `(poId, items[], targetBins[]) → movement_id[]` |
| `receiveFromBarcode` | `(payload, binId, who?) → movement_id` |
| `suggestPutaway` | `(itemId, qty) → bin | null` |
| `generatePickList` | `(order, rules?) → pickList` |
| `confirmPick` | `(pickId, itemId, qty, binId) → pickList` |
| `packOrder` | `(orderId, pickedItems, opts?) → packId` |
| `shipOrder` | `(packId, carrier?) → deliveryNoteId` |
| `cycleCount` | `(binId, counted, itemId?) → {expected,counted,variance,adjustment,resolved}` |
| `transfer` | `(fromBin, toBin, itemId, qty, opts?) → movement_id` |
| `defineKit` | `(kitSku, components[]) → components[]` |
| `kitAssemble` | `(kitSku, components[]|toBin, toBin?) → movement_id` |
| `kitDisassemble` | `(kitSku, fromBin, components?) → movement_id` |
| `adjustStock` | `(binId, itemId, delta, reason) → movement_id` |

### Queries

| Method | Signature |
|--------|-----------|
| `getStock` | `(itemId, warehouseId?) → {item_id,total,byBin[]}` |
| `getMovements` | `(filter?) → movement[]` |
| `snapshot` | `() → JSON-serialisable object` |
| `restore` | `(snapshot) → void` |

---

## 4. Key algorithms

### 4.1 Putaway suggestion (ABC-aware)

```
score = 0
if bin already holds this item     → +50   (consolidation)
if bin.abc_class == A              → +10
if bin.abc_class == B              → +5
if bin in PICK zone                → +20
receive / qa / quarantine zones    → excluded entirely
sort by score desc, then free-space desc
```

A-class items gravitate to the fast-moving PICK zone near the ship
dock; consolidation always wins so splits don't fragment lots.

### 4.2 Pick list rules

| Rule | Sort criterion |
|------|----------------|
| `FIFO` | `received_at` ascending (oldest first) |
| `LIFO` | `received_at` descending (newest first) |
| `FEFO` | `expiry` ascending, rows without expiry sort last |

Short-picks never silently succeed — the module throws when stock
under target. The pick list records `path[]`, a bin list sorted by
`(aisle, rack, level, shelf, bin)` — deterministic and stable, which
gives a tight S-shape walk for single-zone warehouses.

### 4.3 Cycle count

`counted − expected = variance`. When `variance ≠ 0` the module
appends a `cycle_count` movement with the delta. If an `itemId` is
passed, the matching stock row is adjusted in place (clamped at zero).
Bin-level (no `itemId`) counts post a bookkeeping variance movement
without touching individual rows — the caller reconciles per item.

### 4.4 Transfer semantics

Same warehouse → a single `move` movement (symmetric `from/to`).
Different warehouses → `transfer_out` + `transfer_in` so the audit
trail is explicit across warehouse boundaries.

### 4.5 Kitting

`defineKit(kitSku, [{item_id, qty}, …])` stores a BoM. `kitAssemble`
either uses the stored BoM (`kitAssemble(sku, toBin)`) or accepts an
inline component list with explicit source bins. Each consumed
component posts a `kit_disassemble` movement; the produced kit unit
posts a `kit_assemble` movement against the target bin. Reverse flow
is symmetric via `kitDisassemble`.

---

## 5. Bilingual + safety rules

- Every user-facing string exists in Hebrew *and* English.
- Errors carry `message_he`, `message_en` and a combined `message`.
- Zone type `receive/bulk/pick/ship/qa/quarantine` labels exist in
  both languages (`ZONE_TYPES_HE`).
- Movement notes are posted in both languages on every mutation.
- "Never delete" is enforced at the data-model level:
  - Warehouses, zones, aisles, racks, shelves, bins cannot be
    removed from the store at all. `archiveBin()` only flips a
    boolean flag and is blocked if the bin still holds stock.
  - Movements are an append-only array — `state.movements.push`
    is the only place the array is ever mutated.
  - `restore()` replaces the entire in-memory store atomically and
    is only called with a previously produced snapshot.

---

## 6. Agent 86 barcode integration

`receiveFromBarcode(payload, binId, who?)` accepts the exact shape
produced by `parseBarcode()` in `src/scanners/barcode-scanner.js`:

```js
{
  clean:     "0102901234567890211ABC",
  symbology: "Code 128",
  gs1: {
    ok: true,
    fields: {
      GTIN:       "02901234567890",
      BatchLot:   "ABC-LOT-001",
      ExpiryDate: "260501",
      Serial:     "SN-42",
      _01: "…", _10: "…", _17: "…"
    }
  }
}
```

- `GTIN`  → `item_id`
- `BatchLot` → `lot_no`
- `ExpiryDate` → `expiry`
- `Serial` → `serial_no`

Fallback path: when `payload.gs1` is absent, the function reads
`item_id / sku / clean` as the item code. Unit test #11 pins this
contract against the canonical Agent 86 descriptor.

---

## 7. Test coverage — 42 cases, all green

```
$ node --test test/payroll/wms.test.js
…
ℹ tests 42
ℹ suites 9
ℹ pass 42
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 168.1992
```

| Suite | Tests |
|-------|------:|
| Master data hierarchy | 6 |
| Receiving and putaway | 6 |
| ABC-aware putaway | 3 |
| Pick list generation (FIFO/FEFO/LIFO/path) | 6 |
| Pick / pack / ship lifecycle | 4 |
| Cycle counting (±/0) | 3 |
| Transfers (intra/inter-warehouse) | 3 |
| Kitting (assemble/disassemble) | 2 |
| Snapshot, archival, adjust, lots, serials | 9 |
| **Total** | **42** |

### Notable scenarios

- `11` — receiveFromBarcode reads the Agent 86 payload shape.
- `13` — Putaway A-class beats C-class for unknown items.
- `14` — Consolidation weight (50) beats zone weight (30) when same
  item already in C-class bulk.
- `15` — Receive / QA / quarantine zones never selected for putaway.
- `16/17/18` — FIFO/LIFO/FEFO all deterministic with seeded clock.
- `21` — Pick path is alphabetically stable across aisles.
- `27` — Negative cycle variance updates stock and appends movement.
- `30` — Inter-warehouse transfer posts both `transfer_out` and
  `transfer_in` with matching refs.
- `35` — Archival is soft; bin cannot be archived while stock > 0.
- `42` — Never-delete invariant verified: warehouse row count stable
  after receive → adjust → archive sequence; movements length strictly
  grows.

---

## 8. Known limitations / follow-ups

- The pick-path optimiser is alphabetic-stable — adequate for
  single-aisle shops but not a true TSP. For multi-aisle serpentine
  picking, a future Part would wire the `logistics/route-optimizer.js`
  graph solver into `optimisePath()`.
- Barcode payloads can only carry one item per scan. Multi-item
  PDF417 / GS1-128 pallet labels would need a dedicated pallet
  parser — left as a follow-up since Agent 86 already exposes the
  GS1 field dict.
- Stock persistence is in-memory only. Use `snapshot()` on an
  interval (e.g. every 60 s) and write the JSON to Supabase
  `wms_snapshots` (table not yet created — migration scheduled for
  the next Part).
- Cycle counts without `itemId` leave per-item reconciliation to the
  caller. In practice Techno-Kol counts always scan the item barcode
  first, so this is fine; adding a fully-automated per-row reconcile
  would require a policy on "which row absorbs the variance".

---

## 9. File locations

| File | Absolute path |
|------|---------------|
| Module | `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\src\warehouse\wms.js` |
| Tests  | `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\test\payroll\wms.test.js` |
| Report | `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement\_qa-reports\AG-X31-warehouse.md` |

---

## 10. Sign-off

Everything runs with zero runtime dependencies, the bilingual
Hebrew/English contract holds across all user-visible strings, and
the "never delete" invariant is enforced at three levels: master-data
rows cannot be removed, movements are append-only, and the soft
`archiveBin()` refuses to touch bins that still hold stock.

**Agent X-31 — OK to merge.**
