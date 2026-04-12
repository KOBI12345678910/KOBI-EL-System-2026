/**
 * Unit tests for src/printing/thermal-printer.js (ESC/POS builder).
 * Agent-83 — 2026-04-11
 *
 * Run:
 *   node --test src/printing/thermal-printer.test.js
 *
 * Strategy:
 *   - Zero network / real I/O — exercise only the in-memory buffer via
 *     ThermalPrinter#getBuffer(). File transport is tested via a tmp file.
 *   - Assert EXACT byte sequences for every ESC/POS primitive so a
 *     regression in the wire format is caught immediately.
 */

'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('fs');
const path   = require('path');
const os     = require('os');

const {
  ThermalPrinter,
  ReceiptBuilder,
  Templates,
  generateReceipt,
  encodeCP862,
  rtlReverse,
  hasHebrew,
  resolveBarcodeType,
  CMD,
  BARCODE_TYPES,
  ESC, GS, LF,
} = require('./thermal-printer');

// ───────────────────────────────────────────────────────────────
// helpers
// ───────────────────────────────────────────────────────────────

/** Make a fresh printer with minimal setup and no init/codepage header. */
function rawPrinter() {
  // encoding='utf8' keeps text() untouched (no CP862 remap, no RTL reverse)
  return new ThermalPrinter({ transport: 'file', path: path.join(os.tmpdir(), 'raw.bin'), encoding: 'utf8' });
}

/** Hex helper. */
function hex(buf) { return Buffer.from(buf).toString('hex'); }

// ───────────────────────────────────────────────────────────────
// ESC/POS primitives
// ───────────────────────────────────────────────────────────────

test('init() emits ESC @', () => {
  const p = rawPrinter().init();
  const b = p.getBuffer();
  // First two bytes must be 1B 40 (ESC @)
  assert.equal(b[0], 0x1B);
  assert.equal(b[1], 0x40);
});

test('bold(on/off) emits ESC E 1 / ESC E 0', () => {
  const p = rawPrinter().bold(true).bold(false);
  assert.equal(hex(p.getBuffer()), '1b45011b4500');
});

test('underline(mode) emits ESC - n', () => {
  const p = rawPrinter().underline(1).underline(2).underline(0);
  assert.equal(hex(p.getBuffer()), '1b2d011b2d021b2d00');
});

test('align() emits ESC a n for left/center/right', () => {
  const p = rawPrinter().align('left').align('center').align('right');
  assert.equal(hex(p.getBuffer()), '1b61001b61011b6102');
});

test('align() rejects bad modes', () => {
  assert.throws(() => rawPrinter().align('diagonal'), /Bad align/);
});

test('size() emits GS ! n for normal/double/double_h/double_w', () => {
  const p = rawPrinter()
    .size('normal')
    .size('double')
    .size('double_height')
    .size('double_width');
  assert.equal(hex(p.getBuffer()), '1d21001d21111d21011d2110');
});

test('size() rejects bad modes', () => {
  assert.throws(() => rawPrinter().size('jumbo'), /Bad size/);
});

test('feed(n) emits ESC d n', () => {
  const p = rawPrinter().feed(5);
  assert.equal(hex(p.getBuffer()), '1b6405');
});

test('feed(n) clamps to [0,255]', () => {
  const p1 = rawPrinter().feed(-3);
  assert.equal(p1.getBuffer()[2], 0);
  const p2 = rawPrinter().feed(9999);
  assert.equal(p2.getBuffer()[2], 255);
});

test('cut(full) emits GS V 65 3 (full w/ feed)', () => {
  const p = rawPrinter().cut('full');
  assert.equal(hex(p.getBuffer()), '1d564103');
});

test('cut(partial) emits GS V 66 3', () => {
  const p = rawPrinter().cut('partial');
  assert.equal(hex(p.getBuffer()), '1d564203');
});

test('cashDrawer() emits ESC p with default pin 0', () => {
  const p = rawPrinter().cashDrawer();
  assert.equal(hex(p.getBuffer()), '1b700019fa');
});

test('cashDrawer(1) emits ESC p pin 1', () => {
  const p = rawPrinter().cashDrawer(1);
  assert.equal(hex(p.getBuffer()), '1b700119fa');
});

// ───────────────────────────────────────────────────────────────
// Barcode
// ───────────────────────────────────────────────────────────────

test('barcode(CODE128,...) emits GS k 73 n + payload', () => {
  const p = rawPrinter().barcode('CODE128', 'ABC');
  const b = p.getBuffer();
  // GS=1D k=6B type=49 len=3 then 'A' 'B' 'C'
  assert.equal(b[0], 0x1D);
  assert.equal(b[1], 0x6B);
  assert.equal(b[2], 0x49);
  assert.equal(b[3], 3);
  assert.equal(b.slice(4).toString('ascii'), 'ABC');
});

test('barcode() accepts numeric type codes', () => {
  const p = rawPrinter().barcode(BARCODE_TYPES.EAN13, '1234567890123');
  const b = p.getBuffer();
  assert.equal(b[2], 0x43);   // EAN13 = 0x43
});

test('resolveBarcodeType maps names → bytes', () => {
  assert.equal(resolveBarcodeType('CODE128'), 0x49);
  assert.equal(resolveBarcodeType('EAN-13'),  0x43);
  assert.equal(resolveBarcodeType('upc_a'),   0x41);
  assert.throws(() => resolveBarcodeType('FAKE'), /Unknown barcode/);
});

test('barcode() options emit GS h, GS w, GS H', () => {
  const p = rawPrinter().barcode('CODE128', 'X', { height: 80, width: 3, hri: 2 });
  const b = p.getBuffer();
  // leading bytes: 1d 68 50 | 1d 77 03 | 1d 48 02
  assert.equal(b[0], 0x1D); assert.equal(b[1], 0x68); assert.equal(b[2], 80);
  assert.equal(b[3], 0x1D); assert.equal(b[4], 0x77); assert.equal(b[5], 3);
  assert.equal(b[6], 0x1D); assert.equal(b[7], 0x48); assert.equal(b[8], 2);
});

// ───────────────────────────────────────────────────────────────
// QR code
// ───────────────────────────────────────────────────────────────

test('qrcode() emits 5 GS ( k sub-commands', () => {
  const p = rawPrinter().qrcode('hello');
  const h = hex(p.getBuffer());
  // Must contain the 4 setup commands + store block + print block.
  // Setup: GS ( k 04 00 31 41 32 00
  assert.ok(h.startsWith('1d286b040031413200'),
    'should start with model-select sub-command');
  // store sub-command function "50 30"
  assert.ok(h.includes('315030'), 'should include store function (0x31 0x50 0x30)');
  // print sub-command "51 30"
  assert.ok(h.endsWith('1d286b0300315130'), 'should end with print sub-command');
});

test('qrcode() embeds payload bytes', () => {
  const p = rawPrinter().qrcode('AB');
  const b = p.getBuffer();
  // 'AB' == 0x41 0x42
  const joined = b.toString('hex');
  assert.ok(joined.includes('4142'));
});

test('qrcode() honors ecl H', () => {
  const p = rawPrinter().qrcode('x', { ecl: 'H' });
  const h = hex(p.getBuffer());
  // fn 169 sub-command: 1d 28 6b 03 00 31 45 33  (51 = H)
  assert.ok(h.includes('1d286b030031453'), 'ecl sub-command present');
  assert.ok(h.includes('314533'), 'ecl value 0x33 (=H) present');
});

// ───────────────────────────────────────────────────────────────
// Logo
// ───────────────────────────────────────────────────────────────

test('logo({keyCode1,keyCode2}) emits GS ( L fn 69', () => {
  const p = rawPrinter().logo({ keyCode1: 0x30, keyCode2: 0x31 });
  const h = hex(p.getBuffer());
  assert.equal(h, '1d284c060030453031' + '0101');
});

test('logo(null) is a no-op', () => {
  const p = rawPrinter().logo(null);
  assert.equal(p.getBuffer().length, 0);
});

// ───────────────────────────────────────────────────────────────
// Hebrew + CP862
// ───────────────────────────────────────────────────────────────

test('encodeCP862: ASCII passes through', () => {
  assert.equal(encodeCP862('Hello').toString('hex'), '48656c6c6f');
});

test('encodeCP862: Hebrew Alef (U+05D0) → 0x80', () => {
  const b = encodeCP862('\u05D0');   // א
  assert.equal(b[0], 0x80);
});

test('encodeCP862: Hebrew Tav (U+05EA) → 0x9A', () => {
  const b = encodeCP862('\u05EA');   // ת
  assert.equal(b[0], 0x9A);
});

test('encodeCP862: niqqud dropped', () => {
  // Alef + Patah (U+05B7) → only Alef
  const b = encodeCP862('\u05D0\u05B7');
  assert.equal(b.length, 1);
  assert.equal(b[0], 0x80);
});

test('encodeCP862: unmapped char becomes ?', () => {
  const b = encodeCP862('\u2603');  // snowman
  assert.equal(b[0], 0x3F);
});

test('hasHebrew() detects Hebrew range', () => {
  assert.equal(hasHebrew('abc'), false);
  assert.equal(hasHebrew('שלום'), true);
  assert.equal(hasHebrew('hi שלום'), true);
});

test('rtlReverse: pure Hebrew is reversed', () => {
  // Logical order: ש ל ו ם  → visual (RTL): ם ו ל ש
  assert.equal(rtlReverse('שלום'), 'םולש');
});

test('rtlReverse: numbers stay in order within Hebrew line', () => {
  const out = rtlReverse('שלום 123');
  // Expected: "123 םולש"
  assert.equal(out, '123 םולש');
});

test('rtlReverse: non-Hebrew unchanged', () => {
  assert.equal(rtlReverse('Hello 42'), 'Hello 42');
});

test('text() in cp862 mode reverses Hebrew + encodes', () => {
  const p = new ThermalPrinter({ transport: 'file', path: path.join(os.tmpdir(), 'a.bin'), encoding: 'cp862' });
  p.text('\u05D0');   // single Alef
  const b = p.getBuffer();
  assert.equal(b[b.length - 1], 0x80);
});

test('text() in utf8 mode leaves bytes alone', () => {
  const p = new ThermalPrinter({ transport: 'file', path: path.join(os.tmpdir(), 'u.bin'), encoding: 'utf8' });
  p.text('שלום');
  const b = p.getBuffer();
  // Should contain 4 Hebrew code points as UTF-8 (2 bytes each = 8 bytes)
  assert.equal(b.length, 8);
});

test('init() in cp862 mode pushes CP_PC862 + INTL_ISRAEL', () => {
  const p = new ThermalPrinter({ transport: 'file', path: path.join(os.tmpdir(), 'cp.bin'), encoding: 'cp862' });
  p.init();
  const h = hex(p.getBuffer());
  // ESC @  then  ESC t 0x0F  then  ESC R 0x07
  assert.ok(h.startsWith('1b40'));
  assert.ok(h.includes('1b740f'));
  assert.ok(h.includes('1b5207'));
});

// ───────────────────────────────────────────────────────────────
// Layout helpers
// ───────────────────────────────────────────────────────────────

test('row() pads left/right to full width', () => {
  const p = rawPrinter();
  p.row('A', 'B', 10);
  const txt = p.getBuffer().toString('utf8');
  // "A" + 8 spaces + "B" + LF
  assert.equal(txt, 'A' + ' '.repeat(8) + 'B' + '\n');
});

test('hr() draws N chars + LF', () => {
  const p = rawPrinter();
  p.hr('-', 5);
  assert.equal(p.getBuffer().toString('utf8'), '-----\n');
});

test('line() appends LF', () => {
  const p = rawPrinter();
  p.line('hi');
  assert.equal(p.getBuffer().toString('utf8'), 'hi\n');
});

test('clear() resets buffer', () => {
  const p = rawPrinter().text('x').clear();
  assert.equal(p.getBuffer().length, 0);
});

// ───────────────────────────────────────────────────────────────
// Receipt / Invoice / Kitchen / Delivery templates
// ───────────────────────────────────────────────────────────────

test('generateReceipt() returns a non-empty Buffer', () => {
  const buf = generateReceipt(
    [
      { qty: 2, desc: 'Coffee', price: 12 },
      { qty: 1, desc: 'Bagel',  price: 8 },
    ],
    { subtotal: 32, vat: 5.44, vatRate: 17, total: 37.44, method: 'Cash' },
    { store: { name: 'Demo', vatId: '123' } }
  );
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 50, 'buffer should have real content');
  // Should contain ESC @ at the start and a cut command somewhere.
  assert.equal(buf[0], 0x1B);
  assert.equal(buf[1], 0x40);
  const h = buf.toString('hex');
  assert.ok(h.includes('1d5641'), 'should contain full cut (GS V 65)');
});

test('Templates.invoice() prints an invoice with number', () => {
  const p = rawPrinter();
  Templates.invoice(p, {
    store:     { name: 'ACME', vatId: '516' },
    invoiceNo: 'INV-001',
    items:     [{ qty: 1, desc: 'Thing', price: 100 }],
    totals:    { subtotal: 100, vat: 17, vatRate: 17, total: 117 },
  });
  const txt = p.getBuffer().toString('utf8');
  assert.ok(txt.includes('INV-001'), 'invoice number must appear');
  assert.ok(txt.includes('100.00') || txt.includes('100'));
});

test('Templates.kitchenOrder() omits prices and uses double-height', () => {
  const p = rawPrinter();
  Templates.kitchenOrder(p, {
    table: 5, waiter: 'Dana', orderNo: 42,
    items: [{ qty: 2, desc: 'Pizza', note: 'no olives' }],
  });
  const b = p.getBuffer();
  const h = b.toString('hex');
  const txt = b.toString('utf8');
  assert.ok(txt.includes('Pizza'));
  assert.ok(txt.includes('no olives'));
  // Should NOT contain a currency-formatted price
  assert.ok(!/\d+\.\d{2}/.test(txt), 'kitchen order must not print prices');
  // Should include a double-height size command at some point (1d 21 01)
  assert.ok(h.includes('1d2101'));
});

test('Templates.deliveryNote() prints signature placeholder', () => {
  const p = rawPrinter();
  Templates.deliveryNote(p, {
    store: { name: 'Store' },
    noteNo: 'DN-77',
    items: [{ qty: 3, desc: 'Widget', sku: 'W-1' }],
  });
  const txt = p.getBuffer().toString('utf8');
  assert.ok(txt.includes('DN-77'));
  assert.ok(txt.includes('____'), 'signature underscores present');
});

// ───────────────────────────────────────────────────────────────
// File transport
// ───────────────────────────────────────────────────────────────

test('send() file transport writes raw bytes to disk', async () => {
  const tmp = path.join(os.tmpdir(), `onyx-thermal-${Date.now()}.bin`);
  const p = new ThermalPrinter({ transport: 'file', path: tmp, encoding: 'utf8' });
  p.init().text('x').feed(1).cut('full');
  const res = await p.send();
  assert.equal(res.transport, 'file');
  assert.equal(res.path, tmp);
  assert.ok(fs.existsSync(tmp));
  const onDisk = fs.readFileSync(tmp);
  assert.deepEqual(onDisk, p.getBuffer());
  fs.unlinkSync(tmp);
});

test('send() file transport requires path', async () => {
  const p = new ThermalPrinter({ transport: 'file' });
  p.init();
  await assert.rejects(() => p.send(), /requires opts\.path/);
});

test('send() rejects unknown transport', async () => {
  const p = new ThermalPrinter({ transport: 'smoke-signal' });
  p.init();
  await assert.rejects(() => p.send(), /Unknown transport/);
});

// ───────────────────────────────────────────────────────────────
// Fluent chainability
// ───────────────────────────────────────────────────────────────

test('every command returns the printer (chainable)', () => {
  const p = rawPrinter();
  const same = p
    .init()
    .align('center')
    .bold(true)
    .underline(1)
    .size('double')
    .text('X')
    .bold(false)
    .underline(0)
    .size('normal')
    .feed(1)
    .hr('-', 10)
    .row('A', 'B', 10)
    .line('done')
    .cut('full');
  assert.equal(same, p);
});

// ───────────────────────────────────────────────────────────────
// ReceiptBuilder fluent API
// ───────────────────────────────────────────────────────────────

test('ReceiptBuilder.header + items + totals + footer composes', () => {
  const p = rawPrinter();
  new ReceiptBuilder(p, { name: 'Test', vatId: '999' })
    .header('TEST')
    .items([{ qty: 1, desc: 'Item', price: 10 }])
    .totals({ subtotal: 10, vat: 1.7, total: 11.7, method: 'Cash' })
    .footer('bye')
    .cut('full');
  const buf = p.getBuffer();
  assert.ok(buf.length > 0);
  assert.equal(buf[0], 0x1B);      // starts with ESC @
  assert.ok(buf.toString('hex').includes('1d5641')); // has a cut
});
