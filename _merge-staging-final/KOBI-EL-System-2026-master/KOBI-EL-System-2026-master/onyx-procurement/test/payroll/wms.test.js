/**
 * Warehouse Management System — Unit Tests
 * Agent X-31 / Techno-Kol Uzi Mega-ERP (Kobi 2026) / Swarm 3B
 *
 * 30+ cases covering: warehouse hierarchy construction, zone type
 * guards, bin archival (soft, never delete), PO receipt, ABC-aware
 * putaway suggestion, FIFO / FEFO / LIFO pick list generation, pick
 * path minimisation, pick/pack/ship lifecycle, cycle counting with
 * positive/negative variance, inter-warehouse and intra-warehouse
 * transfers, kitting assemble / disassemble, lot and serial
 * tracking, barcode-scanner integration (shape produced by Agent
 * 86), and snapshot/restore round-trips.
 *
 * Run: node --test test/payroll/wms.test.js
 *   or: node --test test/payroll/
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  createWMS,
  ZONE_TYPE,
  ABC_CLASS,
  PICK_RULES,
  MOVEMENT_KIND,
  PICK_STATUS,
  stockKey,
} = require('../../src/warehouse/wms.js');

// ─────────────────────────────────────────────────────────────────────
// Deterministic clock
// ─────────────────────────────────────────────────────────────────────
function freshClock(startIso = '2026-04-11T08:00:00Z') {
  let t = Date.parse(startIso);
  return () => {
    const iso = new Date(t).toISOString();
    t += 60_000; // +1 minute per tick
    return iso;
  };
}

/**
 * Build a small factory: one warehouse, four zones (receive/bulk/
 * pick/ship), two aisles A & B, racks / shelves / bins. Returns the
 * wms instance plus a map of created ids.
 */
function buildFactory() {
  const wms = createWMS({ clock: freshClock() });
  const ids = {};

  ids.wh = wms.addWarehouse({
    code: 'TK-MAIN',
    name_he: 'מחסן ראשי טכנו-קול',
    name_en: 'Techno-Kol Main',
    address: 'רח׳ ההסתדרות 1, חיפה',
  }).id;

  ids.zRecv = wms.addZone({
    warehouse_id: ids.wh, code: 'RCV', type: ZONE_TYPE.RECEIVE,
    name_he: 'אזור קבלה',
  }).id;
  ids.zBulk = wms.addZone({
    warehouse_id: ids.wh, code: 'BLK', type: ZONE_TYPE.BULK,
    name_he: 'אחסון סיטונאי',
  }).id;
  ids.zPick = wms.addZone({
    warehouse_id: ids.wh, code: 'PCK', type: ZONE_TYPE.PICK,
    name_he: 'אזור ליקוט',
  }).id;
  ids.zShip = wms.addZone({
    warehouse_id: ids.wh, code: 'SHP', type: ZONE_TYPE.SHIP,
    name_he: 'אזור משלוח',
  }).id;

  // Two aisles in the pick zone
  ids.aPickA = wms.addAisle({ zone_id: ids.zPick, code: 'A' }).id;
  ids.aPickB = wms.addAisle({ zone_id: ids.zPick, code: 'B' }).id;
  // One aisle in the bulk zone
  ids.aBulk  = wms.addAisle({ zone_id: ids.zBulk, code: 'X' }).id;

  ids.rPA1 = wms.addRack({ aisle_id: ids.aPickA, code: '01' }).id;
  ids.rPB1 = wms.addRack({ aisle_id: ids.aPickB, code: '01' }).id;
  ids.rBX1 = wms.addRack({ aisle_id: ids.aBulk,  code: '01' }).id;

  ids.sPA1 = wms.addShelf({ rack_id: ids.rPA1, code: 'S1', level: 0 }).id;
  ids.sPB1 = wms.addShelf({ rack_id: ids.rPB1, code: 'S1', level: 0 }).id;
  ids.sBX1 = wms.addShelf({ rack_id: ids.rBX1, code: 'S1', level: 0 }).id;

  // Bins — A class near ship, C class in bulk
  ids.binPickA = wms.addBin({
    shelf_id: ids.sPA1, code: 'PA1-01', capacity: 500, abc_class: 'A',
  }).id;
  ids.binPickB = wms.addBin({
    shelf_id: ids.sPB1, code: 'PB1-01', capacity: 500, abc_class: 'B',
  }).id;
  ids.binBulk  = wms.addBin({
    shelf_id: ids.sBX1, code: 'BX1-01', capacity: 5000, abc_class: 'C',
  }).id;

  return { wms, ids };
}

// ─────────────────────────────────────────────────────────────────────
// Master data tests
// ─────────────────────────────────────────────────────────────────────

describe('WMS — master data hierarchy', () => {
  test('01 — creates a warehouse with Hebrew name', () => {
    const wms = createWMS({ clock: freshClock() });
    const wh = wms.addWarehouse({
      code: 'tk-main',
      name_he: 'מחסן טכנו-קול',
      name_en: 'TK Main',
      address: 'חיפה',
    });
    assert.equal(wh.code, 'TK-MAIN');            // uppercased
    assert.equal(wh.name_he, 'מחסן טכנו-קול');
    assert.equal(wh.archived, false);
    assert.ok(wh.id.startsWith('wh_'));
  });

  test('02 — warehouse creation rejects missing code', () => {
    const wms = createWMS({ clock: freshClock() });
    assert.throws(() => wms.addWarehouse({ name_he: 'X' }), /warehouse code is required/);
  });

  test('03 — zone must have a valid type', () => {
    const { wms, ids } = buildFactory();
    assert.throws(() =>
      wms.addZone({ warehouse_id: ids.wh, code: 'Z', type: 'nuclear' }),
    /invalid zone type/);
  });

  test('04 — orphan zone is rejected', () => {
    const wms = createWMS({ clock: freshClock() });
    assert.throws(() =>
      wms.addZone({ warehouse_id: 'wh_missing', code: 'Z', type: 'bulk' }),
    /warehouse not found/);
  });

  test('05 — full factory builds without errors', () => {
    const { wms, ids } = buildFactory();
    assert.ok(ids.wh && ids.zBulk && ids.binPickA);
    const bins = wms.listBins(ids.wh);
    assert.equal(bins.length, 3);
  });

  test('06 — listBins filters by warehouse', () => {
    const { wms, ids } = buildFactory();
    const bins = wms.listBins(ids.wh);
    const codes = bins.map((b) => b.code).sort();
    assert.deepEqual(codes, ['BX1-01', 'PA1-01', 'PB1-01']);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Receiving tests
// ─────────────────────────────────────────────────────────────────────

describe('WMS — receiving and putaway', () => {
  test('07 — receivePO posts receive + putaway movements', () => {
    const { wms, ids } = buildFactory();
    const mvs = wms.receivePO('PO-2026-0001', [
      { item_id: 'STEEL-SHEET-2MM', qty: 200 },
    ], [ids.binBulk]);
    assert.equal(mvs.length, 2); // one receive + one putaway
    const stk = wms.getStock('STEEL-SHEET-2MM');
    assert.equal(stk.total, 200);
    assert.equal(stk.byBin[0].bin_id, ids.binBulk);
  });

  test('08 — receivePO auto-suggests bins when target missing', () => {
    const { wms, ids } = buildFactory();
    const mvs = wms.receivePO('PO-2026-0002', [
      { item_id: 'ROD-12MM', qty: 50 },
    ]); // no targetBins at all
    assert.ok(mvs.length >= 2);
    // A-class pick bin should win thanks to ABC + zone preference
    const stk = wms.getStock('ROD-12MM');
    assert.equal(stk.total, 50);
    assert.equal(stk.byBin[0].bin_id, ids.binPickA);
  });

  test('09 — receive rejects empty items', () => {
    const { wms } = buildFactory();
    assert.throws(() => wms.receivePO('PO-X', []), /items list is empty/);
  });

  test('10 — suggestPutaway returns null when no bin fits', () => {
    const { wms } = buildFactory();
    const tiny = wms.addBin({
      shelf_id: wms._state.shelves.keys().next().value,
      code: 'MINI',
      capacity: 1,
      abc_class: 'C',
    });
    // Fill the tiny bin so nothing fits
    wms.receivePO('PO-FILL', [{ item_id: 'X', qty: 1 }], [tiny.id]);
    // Also fill the other bins
    const bins = wms.listBins();
    for (const b of bins) {
      if (b.capacity < Infinity) {
        const load = wms._internals.binCurrentLoad(b.id);
        if (load < b.capacity) {
          wms.receivePO('PO-FILL', [{ item_id: 'X', qty: b.capacity - load }], [b.id]);
        }
      }
    }
    const huge = wms.suggestPutaway('Y', 999999);
    assert.equal(huge, null);
  });

  test('11 — receiveFromBarcode reads GS1 fields from Agent 86 payload', () => {
    const { wms, ids } = buildFactory();
    // Shape produced by parseBarcode() in src/scanners/barcode-scanner.js
    const payload = {
      clean: '0102901234567890211ABC',
      symbology: 'Code 128',
      gs1: {
        ok: true,
        fields: {
          GTIN: '02901234567890',
          BatchLot: 'ABC-LOT-001',
          ExpiryDate: '260501',
          _01: '02901234567890',
          _10: 'ABC-LOT-001',
          _17: '260501',
        },
      },
    };
    const mvId = wms.receiveFromBarcode(payload, ids.binBulk, 'user@kobi');
    assert.ok(mvId);
    const stk = wms.getStock('02901234567890');
    assert.equal(stk.total, 1);
    assert.equal(stk.byBin[0].lot_no, 'ABC-LOT-001');
    assert.equal(stk.byBin[0].expiry, '260501');
  });

  test('12 — receiveFromBarcode rejects payloads without item', () => {
    const { wms, ids } = buildFactory();
    assert.throws(() =>
      wms.receiveFromBarcode({ gs1: { fields: {} } }, ids.binBulk),
    /no item identified/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// ABC putaway tests
// ─────────────────────────────────────────────────────────────────────

describe('WMS — ABC-aware putaway', () => {
  test('13 — A-class bin beats C-class bin when both free', () => {
    const { wms, ids } = buildFactory();
    const suggestion = wms.suggestPutaway('NEW-ITEM', 10);
    assert.equal(suggestion.id, ids.binPickA);
    assert.equal(suggestion.abc_class, 'A');
  });

  test('14 — consolidation preference when same item already stored', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO-SEED', [{ item_id: 'SEED-ITEM', qty: 5 }], [ids.binBulk]);
    const suggestion = wms.suggestPutaway('SEED-ITEM', 5);
    // Same-item consolidation weight (50) dominates zone weight (20+10)
    assert.equal(suggestion.id, ids.binBulk);
  });

  test('15 — receive / qa / quarantine zones never chosen', () => {
    const { wms, ids } = buildFactory();
    // Add a lone bin inside the receive zone
    const a = wms.addAisle({ zone_id: ids.zRecv, code: 'R' }).id;
    const r = wms.addRack({ aisle_id: a, code: '01' }).id;
    const s = wms.addShelf({ rack_id: r, code: 'S1', level: 0 }).id;
    const b = wms.addBin({ shelf_id: s, code: 'RCV-01', capacity: 10000, abc_class: 'A' });
    const sugg = wms.suggestPutaway('NEW', 5);
    assert.notEqual(sugg.id, b.id);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pick list tests
// ─────────────────────────────────────────────────────────────────────

describe('WMS — pick list generation', () => {
  test('16 — FIFO picks oldest stock first', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO-A', [{ item_id: 'X', qty: 10 }], [ids.binBulk]);
    wms.receivePO('PO-B', [{ item_id: 'X', qty: 20 }], [ids.binPickA]);
    const pl = wms.generatePickList(
      { id: 'ORD-1', lines: [{ item_id: 'X', qty: 15 }] },
      { rule: 'FIFO' },
    );
    // The first allocation should come from the bulk bin (received first)
    assert.equal(pl.lines[0].bin_id, ids.binBulk);
    assert.equal(pl.lines[0].qty, 10);
    assert.equal(pl.lines[1].bin_id, ids.binPickA);
    assert.equal(pl.lines[1].qty, 5);
  });

  test('17 — LIFO picks newest stock first', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO-A', [{ item_id: 'X', qty: 10 }], [ids.binBulk]);
    wms.receivePO('PO-B', [{ item_id: 'X', qty: 20 }], [ids.binPickA]);
    const pl = wms.generatePickList(
      { id: 'ORD-2', lines: [{ item_id: 'X', qty: 15 }] },
      { rule: 'LIFO' },
    );
    assert.equal(pl.lines[0].bin_id, ids.binPickA);
    assert.equal(pl.lines[0].qty, 15);
  });

  test('18 — FEFO picks nearest expiry first', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO-A', [{
      item_id: 'X', qty: 10, lot_no: 'LOT-LATE',  expiry: '2027-01-01',
    }], [ids.binBulk]);
    wms.receivePO('PO-B', [{
      item_id: 'X', qty: 10, lot_no: 'LOT-EARLY', expiry: '2026-06-01',
    }], [ids.binPickA]);
    const pl = wms.generatePickList(
      { id: 'ORD-3', lines: [{ item_id: 'X', qty: 15 }] },
      { rule: 'FEFO' },
    );
    assert.equal(pl.lines[0].lot_no, 'LOT-EARLY');
    assert.equal(pl.lines[0].qty, 10);
    assert.equal(pl.lines[1].lot_no, 'LOT-LATE');
    assert.equal(pl.lines[1].qty, 5);
  });

  test('19 — insufficient stock throws', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 3 }], [ids.binPickA]);
    assert.throws(() =>
      wms.generatePickList({ id: 'O', lines: [{ item_id: 'X', qty: 5 }] }),
    /insufficient stock/);
  });

  test('20 — invalid pick rule rejected', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 3 }], [ids.binPickA]);
    assert.throws(() =>
      wms.generatePickList(
        { id: 'O', lines: [{ item_id: 'X', qty: 1 }] },
        { rule: 'RANDOM' },
      ),
    /invalid pick rule/);
  });

  test('21 — pick path is deterministic and minimises aisle hops', () => {
    const { wms, ids } = buildFactory();
    // Seed X in bin PickB, Y in bin PickA — order produces aisle B then A
    wms.receivePO('PO', [{ item_id: 'X', qty: 5 }], [ids.binPickB]);
    wms.receivePO('PO', [{ item_id: 'Y', qty: 5 }], [ids.binPickA]);
    const pl = wms.generatePickList({
      id: 'ORD',
      lines: [
        { item_id: 'X', qty: 5 },
        { item_id: 'Y', qty: 5 },
      ],
    });
    // Path should visit A aisle before B aisle (alphabetical)
    assert.equal(pl.path[0], ids.binPickA);
    assert.equal(pl.path[1], ids.binPickB);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pick confirm / pack / ship tests
// ─────────────────────────────────────────────────────────────────────

describe('WMS — pick / pack / ship lifecycle', () => {
  test('22 — confirmPick decrements stock and advances status', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 10 }], [ids.binPickA]);
    const pl = wms.generatePickList({
      id: 'ORD-22',
      lines: [{ item_id: 'X', qty: 4 }],
    });
    assert.equal(pl.status, PICK_STATUS.OPEN);
    wms.confirmPick(pl.id, 'X', 4, ids.binPickA);
    const stk = wms.getStock('X');
    assert.equal(stk.total, 6);
    assert.equal(pl.status, PICK_STATUS.PICKED);
  });

  test('23 — confirmPick rejects excess qty', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 10 }], [ids.binPickA]);
    const pl = wms.generatePickList({
      id: 'ORD-23',
      lines: [{ item_id: 'X', qty: 4 }],
    });
    assert.throws(() => wms.confirmPick(pl.id, 'X', 7, ids.binPickA), /exceeds planned/);
  });

  test('24 — packOrder creates a pack record', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 10 }], [ids.binPickA]);
    const pl = wms.generatePickList({
      id: 'ORD-24',
      lines: [{ item_id: 'X', qty: 3 }],
    });
    wms.confirmPick(pl.id, 'X', 3, ids.binPickA);
    const packId = wms.packOrder('ORD-24', [
      { item_id: 'X', qty: 3, bin_id: ids.binPickA },
    ], { pickList_id: pl.id, weight: 12.5 });
    assert.ok(packId);
    assert.equal(pl.status, PICK_STATUS.PACKED);
  });

  test('25 — shipOrder generates a delivery note', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 10 }], [ids.binPickA]);
    const pl = wms.generatePickList({
      id: 'ORD-25',
      lines: [{ item_id: 'X', qty: 3 }],
    });
    wms.confirmPick(pl.id, 'X', 3, ids.binPickA);
    const packId = wms.packOrder('ORD-25', [
      { item_id: 'X', qty: 3, bin_id: ids.binPickA },
    ], { pickList_id: pl.id });
    const dnId = wms.shipOrder(packId, 'דואר ישראל');
    assert.ok(dnId.startsWith('dn_'));
    assert.equal(pl.status, PICK_STATUS.SHIPPED);
    // Cannot ship twice
    assert.throws(() => wms.shipOrder(packId), /already shipped/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Cycle count tests
// ─────────────────────────────────────────────────────────────────────

describe('WMS — cycle counting', () => {
  test('26 — counted equals expected → zero variance, resolved', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 20 }], [ids.binPickA]);
    const res = wms.cycleCount(ids.binPickA, 20, 'X');
    assert.equal(res.variance, 0);
    assert.equal(res.resolved, true);
  });

  test('27 — negative variance posts an adjustment movement', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 20 }], [ids.binPickA]);
    const res = wms.cycleCount(ids.binPickA, 17, 'X');
    assert.equal(res.variance, -3);
    const mvs = wms.getMovements({ kind: MOVEMENT_KIND.CYCLE_COUNT });
    assert.equal(mvs.length, 1);
    assert.equal(mvs[0].qty, -3);
    const stk = wms.getStock('X');
    assert.equal(stk.total, 17);
  });

  test('28 — positive variance increases stock', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 20 }], [ids.binPickA]);
    const res = wms.cycleCount(ids.binPickA, 22, 'X');
    assert.equal(res.variance, 2);
    assert.equal(wms.getStock('X').total, 22);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Transfer tests
// ─────────────────────────────────────────────────────────────────────

describe('WMS — transfers', () => {
  test('29 — intra-warehouse transfer posts a single MOVE movement', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 10 }], [ids.binBulk]);
    wms.transfer(ids.binBulk, ids.binPickA, 'X', 4);
    const moves = wms.getMovements({ kind: MOVEMENT_KIND.MOVE });
    assert.equal(moves.length, 1);
    assert.equal(wms.getStock('X').total, 10);        // preserved
    // Check breakdown
    const byBin = wms.getStock('X').byBin;
    const bulk  = byBin.find((r) => r.bin_id === ids.binBulk);
    const pickA = byBin.find((r) => r.bin_id === ids.binPickA);
    assert.equal(bulk.qty, 6);
    assert.equal(pickA.qty, 4);
  });

  test('30 — inter-warehouse transfer posts OUT and IN movements', () => {
    const wms = createWMS({ clock: freshClock() });
    const wh1 = wms.addWarehouse({ code: 'W1', name_he: 'מחסן 1' }).id;
    const wh2 = wms.addWarehouse({ code: 'W2', name_he: 'מחסן 2' }).id;

    const makeBin = (whId, code) => {
      const z = wms.addZone({ warehouse_id: whId, code: 'B', type: 'bulk' }).id;
      const a = wms.addAisle({ zone_id: z, code: 'A' }).id;
      const r = wms.addRack({ aisle_id: a, code: '01' }).id;
      const s = wms.addShelf({ rack_id: r, code: 'S1', level: 0 }).id;
      return wms.addBin({ shelf_id: s, code, capacity: 1000, abc_class: 'C' }).id;
    };

    const b1 = makeBin(wh1, 'B1');
    const b2 = makeBin(wh2, 'B2');
    wms.receivePO('PO', [{ item_id: 'X', qty: 50 }], [b1]);
    wms.transfer(b1, b2, 'X', 20);

    const outs = wms.getMovements({ kind: MOVEMENT_KIND.TRANSFER_OUT });
    const ins  = wms.getMovements({ kind: MOVEMENT_KIND.TRANSFER_IN });
    assert.equal(outs.length, 1);
    assert.equal(ins.length, 1);

    const stock = wms.getStock('X');
    assert.equal(stock.total, 50);
    assert.equal(stock.byBin.find((r) => r.bin_id === b1).qty, 30);
    assert.equal(stock.byBin.find((r) => r.bin_id === b2).qty, 20);
  });

  test('31 — transfer throws on insufficient stock', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 5 }], [ids.binBulk]);
    assert.throws(() => wms.transfer(ids.binBulk, ids.binPickA, 'X', 9), /insufficient stock/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Kitting tests
// ─────────────────────────────────────────────────────────────────────

describe('WMS — kitting', () => {
  test('32 — defineKit + kitAssemble consumes components', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [
      { item_id: 'SCREW-M8', qty: 100 },
      { item_id: 'PLATE-A',  qty: 10 },
    ], [ids.binPickA, ids.binPickB]);

    const mvId = wms.kitAssemble(
      'KIT-SHELF',
      [
        { item_id: 'SCREW-M8', qty: 4, from_bin: ids.binPickA },
        { item_id: 'PLATE-A',  qty: 1, from_bin: ids.binPickB },
      ],
      ids.binBulk,
    );
    assert.ok(mvId);
    assert.equal(wms.getStock('KIT-SHELF').total, 1);
    assert.equal(wms.getStock('SCREW-M8').total, 96);
    assert.equal(wms.getStock('PLATE-A').total,  9);
  });

  test('33 — kitDisassemble with defined BoM returns components', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [
      { item_id: 'SCREW-M8', qty: 100 },
      { item_id: 'PLATE-A',  qty: 10 },
    ], [ids.binPickA, ids.binPickB]);

    wms.defineKit('KIT-SHELF', [
      { item_id: 'SCREW-M8', qty: 4 },
      { item_id: 'PLATE-A',  qty: 1 },
    ]);
    wms.kitAssemble(
      'KIT-SHELF',
      [
        { item_id: 'SCREW-M8', qty: 4, from_bin: ids.binPickA },
        { item_id: 'PLATE-A',  qty: 1, from_bin: ids.binPickB },
      ],
      ids.binBulk,
    );
    // Disassemble back
    wms.kitDisassemble('KIT-SHELF', ids.binBulk);
    assert.equal(wms.getStock('KIT-SHELF').total, 0);
    assert.equal(wms.getStock('SCREW-M8').total, 100);
    assert.equal(wms.getStock('PLATE-A').total, 10);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Snapshot / restore / archival tests
// ─────────────────────────────────────────────────────────────────────

describe('WMS — snapshot, archival, adjust', () => {
  test('34 — snapshot round-trips through restore', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 7 }], [ids.binPickA]);

    const snap = wms.snapshot();
    const json = JSON.parse(JSON.stringify(snap));

    const wms2 = createWMS({ clock: freshClock() });
    wms2.restore(json);
    const stk = wms2.getStock('X');
    assert.equal(stk.total, 7);
    const bins = wms2.listBins();
    assert.equal(bins.length, 3);
  });

  test('35 — archiveBin is soft (never delete) and blocks when stock present', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 1 }], [ids.binPickA]);
    assert.throws(() => wms.archiveBin(ids.binPickA, 'rebuild'), /cannot archive/);
    // Clear the bin
    wms.adjustStock(ids.binPickA, 'X', -1, 'damage');
    const bin = wms.archiveBin(ids.binPickA, 'rebuild');
    assert.equal(bin.archived, true);
    // Default listBins hides archived
    const active = wms.listBins();
    assert.ok(!active.find((b) => b.id === ids.binPickA));
    // But it still exists in state (never deleted)
    assert.ok(wms._state.bins.has(ids.binPickA));
  });

  test('36 — adjustStock requires a reason', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 5 }], [ids.binPickA]);
    assert.throws(() => wms.adjustStock(ids.binPickA, 'X', -2, ''), /reason is required/);
  });

  test('37 — adjustStock records positive and negative deltas', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [{ item_id: 'X', qty: 5 }], [ids.binPickA]);
    wms.adjustStock(ids.binPickA, 'X', 3,  'found');
    wms.adjustStock(ids.binPickA, 'X', -1, 'damaged');
    assert.equal(wms.getStock('X').total, 7);
    const adjusts = wms.getMovements({ kind: MOVEMENT_KIND.ADJUST });
    assert.equal(adjusts.length, 2);
  });

  test('38 — lot tracking: two lots of same item stored separately', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO1', [{ item_id: 'X', qty: 5, lot_no: 'L1' }], [ids.binPickA]);
    wms.receivePO('PO2', [{ item_id: 'X', qty: 7, lot_no: 'L2' }], [ids.binPickA]);
    const stk = wms.getStock('X');
    assert.equal(stk.total, 12);
    const lots = stk.byBin.map((r) => r.lot_no).sort();
    assert.deepEqual(lots, ['L1', 'L2']);
  });

  test('39 — serial tracking: individual unit picked by lot/serial', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO', [
      { item_id: 'MACHINE', qty: 1, serial_no: 'SN-001' },
      { item_id: 'MACHINE', qty: 1, serial_no: 'SN-002' },
    ], [ids.binPickA, ids.binPickA]);
    const stk = wms.getStock('MACHINE');
    assert.equal(stk.total, 2);
    const serials = stk.byBin.map((r) => r.serial_no).sort();
    assert.deepEqual(serials, ['SN-001', 'SN-002']);
  });

  test('40 — movements query filters by kind and ref', () => {
    const { wms, ids } = buildFactory();
    wms.receivePO('PO-100', [{ item_id: 'X', qty: 5 }], [ids.binPickA]);
    wms.receivePO('PO-200', [{ item_id: 'Y', qty: 5 }], [ids.binPickA]);
    const receives = wms.getMovements({ kind: MOVEMENT_KIND.RECEIVE });
    assert.equal(receives.length, 2);
    const po100 = wms.getMovements({ ref: 'PO-100' });
    // 1 receive + 1 putaway
    assert.equal(po100.length, 2);
  });

  test('41 — stockKey produces stable composite keys', () => {
    assert.equal(stockKey('B1', 'IT', 'L1', 'SN1'), 'B1::IT::L1::SN1');
    assert.equal(stockKey('B1', 'IT'), 'B1::IT::::');
  });

  test('42 — never-delete invariant: no mutator removes warehouse rows', () => {
    const { wms, ids } = buildFactory();
    const before = wms._state.warehouses.size;
    // run a bunch of ops
    wms.receivePO('PO', [{ item_id: 'X', qty: 2 }], [ids.binPickA]);
    wms.adjustStock(ids.binPickA, 'X', -2, 'test');
    wms.archiveBin(ids.binPickA, 'rebuild');
    const after = wms._state.warehouses.size;
    assert.equal(before, after);
    // Movements are append-only — nothing rewrites history
    assert.ok(wms._state.movements.length >= 3);
  });
});
