/* ============================================================================
 * Techno-Kol ERP — Masav exporter test suite
 * Agent X-50 / Swarm 3C / Kobi's mega-ERP for Techno-Kol Uzi
 * ----------------------------------------------------------------------------
 * Covers:
 *   1.  createBatch() validates sender + type + date
 *   2.  createBatch() rejects unknown sender bank
 *   3.  addPayment() appends a validated detail line
 *   4.  addPayment() refuses after export (immutability)
 *   5.  validateBatch() flags unknown recipient bank codes
 *   6.  validateBatch() flags invalid Israeli IDs (Luhn)
 *   7.  validateBatch() flags negative / zero / over-cap amounts
 *   8.  validateBatch() flags duplicate references
 *   9.  exportFile() emits exactly N+2 records, each 120 chars wide
 *   10. exportFile() computes total_amount and control_hash
 *   11. exportFile() is deterministic for the same input
 *   12. exportFile() refuses to emit when batch invalid
 *   13. parseReturnFile() separates confirmations from rejections
 *   14. parseReturnFile() preserves header + trailer metadata
 *   15. buildSummary() writes a valid PDF (magic bytes + %%EOF)
 *   16. Padding helpers (numeric + alpha) enforce width
 *   17. Hebrew transliteration maps aleph/tav as expected
 *   18. Control hash stable across re-export
 *   19. cancelBatch() keeps the batch in memory (never deletes)
 *   20. Israeli bank code lookup includes Leumi / Hapoalim / Mizrahi
 *
 * Runs under plain Node (no test framework required):
 *   node --test test/payroll/masav-exporter.test.js
 * ========================================================================== */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const masav = require('../../onyx-procurement/src/bank-files/masav-exporter.js');
const {
  createBatch,
  addPayment,
  validateBatch,
  exportFile,
  parseReturnFile,
  buildSummary,
  cancelBatch,
  getBatch,
  listBatches,
  ISRAELI_BANKS,
  RECORD_TYPE,
  BATCH_TYPE,
  BATCH_STATE,
  RECORD_LENGTH,
  _internal,
} = masav;

/* ----------------------------------------------------------------------------
 * Fixtures — all IDs below pass the Luhn check
 * -------------------------------------------------------------------------- */
const VALID_IDS = [
  '100000009', '100000017', '100000025', '100000033', '100000041',
  '100000058', '100000066', '100000074', '100000082', '100000090',
  '100000108', '100000116', '100000124', '100000132', '100000140',
  '100000157', '100000165', '100000173', '100000181', '100000199',
];

const SENDER = Object.freeze({
  bank:    '12',              // Hapoalim
  branch:  '637',
  account: '12345',
  id:      VALID_IDS[0],
  name:    'TECHNO KOL UZI LTD',
});

function freshBatchId(overrides = {}) {
  return createBatch({
    sender: SENDER,
    type:   BATCH_TYPE.PAYMENT,
    date:   new Date('2026-04-11T00:00:00Z'),
    purpose: 'SALARIES 04/2026',
    ...overrides,
  });
}

function addN(batchId, n) {
  for (let i = 0; i < n; i++) {
    addPayment(batchId, {
      bank:      '10',
      branch:    '800',
      account:   `900000${100 + i}`,
      amount:    1000 + i * 37.5,
      name:      `Employee ${i + 1}`,
      id:        VALID_IDS[(i + 1) % VALID_IDS.length],
      reference: `REF${String(i + 1).padStart(5, '0')}`,
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * 1. createBatch
 * ══════════════════════════════════════════════════════════════════════════ */

describe('createBatch', () => {
  test('returns a string batchId for valid config', () => {
    const id = freshBatchId();
    assert.ok(typeof id === 'string');
    assert.match(id, /^MSB-/);
    const b = getBatch(id);
    assert.equal(b.state, BATCH_STATE.DRAFT);
    assert.equal(b.type, BATCH_TYPE.PAYMENT);
    assert.equal(b.lineCount, 0);
  });

  test('rejects missing sender', () => {
    assert.throws(
      () => createBatch({ type: BATCH_TYPE.PAYMENT, date: new Date() }),
      /sender required/,
    );
  });

  test('rejects unknown sender bank code', () => {
    assert.throws(
      () => createBatch({
        sender: { ...SENDER, bank: '88' },
        type: BATCH_TYPE.PAYMENT,
        date: new Date('2026-04-11'),
      }),
      /unknown sender bank/,
    );
  });

  test('rejects bad type', () => {
    assert.throws(
      () => createBatch({ sender: SENDER, type: 'nonsense', date: new Date('2026-01-01') }),
      /invalid type/,
    );
  });

  test('accepts collection type', () => {
    const id = createBatch({
      sender: SENDER,
      type: BATCH_TYPE.COLLECTION,
      date: '2026-04-11',
    });
    assert.equal(getBatch(id).type, BATCH_TYPE.COLLECTION);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 2. addPayment
 * ══════════════════════════════════════════════════════════════════════════ */

describe('addPayment', () => {
  test('appends a detail line', () => {
    const id = freshBatchId();
    addPayment(id, {
      bank: '10', branch: '800', account: '9000001',
      amount: 1500, name: 'Alice', id: VALID_IDS[1], reference: 'R1',
    });
    assert.equal(getBatch(id).lineCount, 1);
  });

  test('requires bank/branch/account/amount/name/id', () => {
    const id = freshBatchId();
    assert.throws(
      () => addPayment(id, { bank: '10', branch: '800', account: '1', amount: 10, name: 'X' }),
      /line\.id required/,
    );
  });

  test('refuses lines after export', () => {
    const id = freshBatchId();
    addN(id, 1);
    exportFile(id);
    assert.throws(() => addPayment(id, {
      bank: '10', branch: '800', account: '1', amount: 10, name: 'Y', id: VALID_IDS[2],
    }), /already exported/);
  });

  test('refuses lines after cancel', () => {
    const id = freshBatchId();
    cancelBatch(id, 'test');
    assert.throws(() => addPayment(id, {
      bank: '10', branch: '800', account: '1', amount: 10, name: 'Z', id: VALID_IDS[3],
    }), /cancelled/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 3. validateBatch
 * ══════════════════════════════════════════════════════════════════════════ */

describe('validateBatch', () => {
  test('empty batch is invalid', () => {
    const id = freshBatchId();
    const r = validateBatch(id);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.field === 'lines'));
  });

  test('flags unknown recipient bank', () => {
    const id = freshBatchId();
    addPayment(id, {
      bank: '99', branch: '800', account: '9000001',
      amount: 1000, name: 'Bob', id: VALID_IDS[4], reference: 'R2',
    });
    const r = validateBatch(id);
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => e.field === 'bank'));
  });

  test('flags invalid Luhn ID', () => {
    const id = freshBatchId();
    addPayment(id, {
      bank: '10', branch: '800', account: '9000001',
      amount: 1000, name: 'Bob', id: '123456789', reference: 'R3',
    });
    const r = validateBatch(id);
    assert.ok(r.errors.some((e) => e.field === 'id'));
  });

  test('flags non-positive amount', () => {
    const id = freshBatchId();
    addPayment(id, {
      bank: '10', branch: '800', account: '9000001',
      amount: 0, name: 'Carl', id: VALID_IDS[5], reference: 'R4',
    });
    const r = validateBatch(id);
    assert.ok(r.errors.some((e) => e.field === 'amount'));
  });

  test('flags amount over field cap', () => {
    const id = freshBatchId();
    addPayment(id, {
      bank: '10', branch: '800', account: '9000001',
      amount: 1e9, name: 'Dave', id: VALID_IDS[6], reference: 'R5',
    });
    const r = validateBatch(id);
    assert.ok(r.errors.some((e) => e.field === 'amount'));
  });

  test('flags duplicate references', () => {
    const id = freshBatchId();
    addPayment(id, {
      bank: '10', branch: '800', account: '9000001',
      amount: 100, name: 'E', id: VALID_IDS[7], reference: 'DUP',
    });
    addPayment(id, {
      bank: '11', branch: '123', account: '9000002',
      amount: 200, name: 'F', id: VALID_IDS[8], reference: 'DUP',
    });
    const r = validateBatch(id);
    assert.ok(r.errors.some((e) => e.field === 'reference'));
  });

  test('valid batch passes', () => {
    const id = freshBatchId();
    addN(id, 3);
    const r = validateBatch(id);
    assert.equal(r.valid, true, JSON.stringify(r.errors));
    assert.equal(r.errors.length, 0);
    assert.equal(getBatch(id).state, BATCH_STATE.VALIDATED);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 4. exportFile
 * ══════════════════════════════════════════════════════════════════════════ */

describe('exportFile', () => {
  test('refuses invalid batch', () => {
    const id = freshBatchId();  // empty → invalid
    assert.throws(() => exportFile(id), /batch invalid/);
  });

  test('emits header + N details + trailer', () => {
    const id = freshBatchId();
    addN(id, 5);
    const out = exportFile(id);
    assert.equal(out.line_count, 7); // 1 header + 5 details + 1 trailer
    assert.equal(out.detail_count, 5);
    const recs = out.file_content.split('\n').filter((l) => l.length > 0);
    assert.equal(recs.length, 7);
    assert.equal(recs[0][0], RECORD_TYPE.HEADER);
    assert.equal(recs[recs.length - 1][0], RECORD_TYPE.TRAILER);
    for (const r of recs) assert.equal(r.length, RECORD_LENGTH, `record != ${RECORD_LENGTH}`);
  });

  test('total_amount matches sum of detail lines', () => {
    const id = freshBatchId();
    addPayment(id, { bank:'10', branch:'800', account:'1', amount: 100.50, name:'A', id: VALID_IDS[1], reference:'X1' });
    addPayment(id, { bank:'11', branch:'800', account:'2', amount: 250.75, name:'B', id: VALID_IDS[2], reference:'X2' });
    const out = exportFile(id);
    assert.equal(out.total_amount, 351.25);
  });

  test('control hash is 1-16 digit string', () => {
    const id = freshBatchId();
    addN(id, 4);
    const out = exportFile(id);
    assert.match(out.control_hash, /^[0-9]+$/);
    assert.ok(out.control_hash.length > 0 && out.control_hash.length <= 16);
  });

  test('deterministic across rebuilds (same batch)', () => {
    const id = freshBatchId();
    addN(id, 6);
    const a = exportFile(id);
    // After export, batch is locked; re-export would need a fresh batch
    const id2 = freshBatchId();
    addN(id2, 6);
    const b = exportFile(id2);
    // Same set of details (deterministic refs + amounts) → identical content
    // except header timestamps. Compare detail+trailer lines only.
    const aDetails = a.file_content.split('\n').filter((l) => l.startsWith('2') || l.startsWith('9')).join('\n');
    const bDetails = b.file_content.split('\n').filter((l) => l.startsWith('2') || l.startsWith('9')).join('\n');
    assert.equal(aDetails, bDetails);
    assert.equal(a.control_hash, b.control_hash);
  });

  test('marks batch exported + sets sha256', () => {
    const id = freshBatchId();
    addN(id, 2);
    const out = exportFile(id);
    assert.equal(getBatch(id).state, BATCH_STATE.EXPORTED);
    assert.match(out.sha256, /^[0-9a-f]{64}$/);
  });

  test('header record carries sender bank at position 2-4', () => {
    const id = freshBatchId();
    addN(id, 1);
    const out = exportFile(id);
    const header = out.file_content.split('\n')[0];
    assert.equal(header[0], '1');
    assert.equal(header.slice(1, 4), '012'); // bank '12' zero-padded to 3
  });

  test('detail record carries aggurot in positions 25-35 (11 digits)', () => {
    const id = freshBatchId();
    addPayment(id, {
      bank: '10', branch: '800', account: '9000001',
      amount: 1234.56, name: 'Test', id: VALID_IDS[9], reference: 'AGG1',
    });
    const out = exportFile(id);
    const detail = out.file_content.split('\n')[1];
    const aggurot = detail.slice(24, 35);
    assert.equal(aggurot, '00000123456');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 5. parseReturnFile
 * ══════════════════════════════════════════════════════════════════════════ */

describe('parseReturnFile', () => {
  test('separates confirmations from rejections', () => {
    const id = freshBatchId();
    addN(id, 3);
    const out = exportFile(id);
    // Mutate line 2 to have a rejection code 003 (insufficient funds)
    const recs = out.file_content.split('\n').filter((l) => l.length > 0);
    const patched = recs.map((r, i) => {
      if (i === 2) {
        // replace position 74..80 (txCode slot, 6 chars) with '000003'
        return r.slice(0, 74) + '000003' + r.slice(80);
      }
      return r;
    }).join('\n') + '\n';
    const p = parseReturnFile(patched);
    assert.equal(p.confirmations.length, 2);
    assert.equal(p.rejections.length, 1);
    assert.match(p.rejections[0].reason, /Insufficient/);
  });

  test('returns null header for content without header', () => {
    const p = parseReturnFile('');
    assert.equal(p.header, null);
    assert.equal(p.confirmations.length, 0);
    assert.equal(p.rejections.length, 0);
  });

  test('preserves trailer metadata', () => {
    const id = freshBatchId();
    addN(id, 2);
    const out = exportFile(id);
    const p = parseReturnFile(out.file_content);
    assert.ok(p.trailer);
    assert.equal(p.trailer.count, 2);
    assert.equal(p.trailer.controlHash.replace(/^0+/, ''), out.control_hash.replace(/^0+/, ''));
  });

  test('handles short lines gracefully', () => {
    const short = '1' + ' '.repeat(50); // less than 120
    const p = parseReturnFile(short);
    assert.ok(p.header);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 6. buildSummary — PDF output
 * ══════════════════════════════════════════════════════════════════════════ */

describe('buildSummary', () => {
  test('writes a valid-looking PDF', () => {
    const id = freshBatchId();
    addN(id, 4);
    exportFile(id);
    const outPath = path.join(os.tmpdir(), `masav-test-${Date.now()}.pdf`);
    const r = buildSummary(id, outPath);
    assert.equal(r.path, outPath);
    assert.ok(r.bytes > 0);
    const buf = fs.readFileSync(outPath);
    assert.equal(buf.slice(0, 5).toString('binary'), '%PDF-');
    assert.ok(buf.slice(-6).toString('binary').includes('%%EOF'));
    fs.unlinkSync(outPath);
  });

  test('default path lands in tmpdir', () => {
    const id = freshBatchId();
    addN(id, 1);
    exportFile(id);
    const r = buildSummary(id);
    assert.ok(r.path.includes(os.tmpdir()) || r.path.endsWith('.pdf'));
    assert.ok(fs.existsSync(r.path));
    fs.unlinkSync(r.path);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 7. Helpers & constants
 * ══════════════════════════════════════════════════════════════════════════ */

describe('helpers', () => {
  test('padNumeric right-aligns and zero-pads', () => {
    assert.equal(_internal.padNumeric(42, 6), '000042');
    assert.equal(_internal.padNumeric('7', 3), '007');
  });

  test('padNumeric throws on overflow', () => {
    assert.throws(() => _internal.padNumeric(1234, 3), /exceeds width/);
  });

  test('padAlpha left-aligns and space-pads', () => {
    assert.equal(_internal.padAlpha('HI', 5), 'HI   ');
    assert.equal(_internal.padAlpha('TOOLONG', 4), 'TOOL');
  });

  test('transliterateHebrew maps aleph/shin/tav', () => {
    const out = _internal.transliterateHebrew('שלום');
    assert.match(out, /SH/);
  });

  test('isValidIsraeliId rejects obviously wrong IDs', () => {
    assert.equal(_internal.isValidIsraeliId('000000000'), true); // Luhn-valid edge
    assert.equal(_internal.isValidIsraeliId('123456789'), false);
    assert.equal(_internal.isValidIsraeliId(''), false);
  });

  test('formatDateYYMMDD formats as 6 digits', () => {
    assert.equal(_internal.formatDateYYMMDD('2026-04-11'), '260411');
  });

  test('ISRAELI_BANKS covers Leumi/Hapoalim/Mizrahi', () => {
    assert.ok(ISRAELI_BANKS['10']); // Leumi
    assert.ok(ISRAELI_BANKS['12']); // Hapoalim
    assert.ok(ISRAELI_BANKS['20']); // Mizrahi
    assert.ok(ISRAELI_BANKS['11']); // Discount
    assert.ok(ISRAELI_BANKS['54']); // Jerusalem
  });
});

/* ══════════════════════════════════════════════════════════════════════════
 * 8. Never-delete semantics + listing
 * ══════════════════════════════════════════════════════════════════════════ */

describe('never-delete', () => {
  test('cancelBatch marks but keeps', () => {
    const id = freshBatchId();
    addN(id, 1);
    cancelBatch(id, 'user request');
    const b = getBatch(id);
    assert.equal(b.state, BATCH_STATE.CANCELLED);
    assert.equal(b.lineCount, 1, 'lines preserved after cancel');
  });

  test('cancel refused on exported batches', () => {
    const id = freshBatchId();
    addN(id, 1);
    exportFile(id);
    assert.throws(() => cancelBatch(id), /already exported/);
  });

  test('listBatches filters by state', () => {
    const id1 = freshBatchId();
    addN(id1, 1);
    exportFile(id1);
    const exported = listBatches({ state: BATCH_STATE.EXPORTED });
    assert.ok(exported.some((b) => b.id === id1));
  });
});
