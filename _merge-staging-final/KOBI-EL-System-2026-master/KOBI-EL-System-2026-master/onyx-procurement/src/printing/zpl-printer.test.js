/**
 * Unit tests for src/printing/zpl-printer.js
 * Agent-84 — ZPL Label Printer Integration
 *
 * Run:
 *   node --test src/printing/zpl-printer.test.js
 *
 * Strategy:
 *   - Test the command builders by asserting substring presence / regex
 *     matches in the generated ZPL string.
 *   - Test the Label fluent API for ordering, chaining, and quantity.
 *   - Test the utility functions (encodeCP862, hasHebrew, reverseHebrewForRTL,
 *     parsePNGHeader, rasterToZplHex).
 *   - Test all 5 pre-made templates produce valid-looking ZPL.
 *   - Test the standalone template files in label-templates/.
 *   - Test saveToFile with a real tmp file.
 *   - Test sendToPrinter with a fake TCP server and with an unreachable
 *     host (fail-open).
 *   - Test sendViaUSB returns false (not implemented stub).
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const zpl = require('./zpl-printer');
const {
  label,
  Label,
  templates,
  sendToPrinter,
  saveToFile,
  sendViaUSB,
  commands,
  util,
  DEFAULT_DPI,
  DEFAULT_PORT,
  CP862_CODE,
  UTF8_CODE,
  BARCODE_TYPES,
} = zpl;

const standaloneTemplates = require('./label-templates');

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function mkTmpDir(prefix = 'zpl-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

/**
 * Start a fake TCP server that captures the first chunk written and
 * closes. Returns { port, received } where `received` resolves to the
 * captured buffer.
 */
function startFakeServer() {
  return new Promise((resolve) => {
    let receivedResolver;
    const received = new Promise((r) => { receivedResolver = r; });
    const chunks = [];
    const server = net.createServer((socket) => {
      socket.on('data', (chunk) => chunks.push(chunk));
      socket.on('end', () => {
        receivedResolver(Buffer.concat(chunks));
        server.close();
      });
      socket.on('close', () => {
        if (chunks.length > 0) receivedResolver(Buffer.concat(chunks));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        received,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────
// Constants & exports
// ─────────────────────────────────────────────────────────────────────

test('exports all expected entry points', () => {
  assert.equal(typeof label, 'function');
  assert.equal(typeof Label, 'function');
  assert.equal(typeof templates, 'object');
  assert.equal(typeof sendToPrinter, 'function');
  assert.equal(typeof saveToFile, 'function');
  assert.equal(typeof sendViaUSB, 'function');
  assert.equal(typeof commands, 'object');
  assert.equal(typeof util, 'object');
  assert.equal(DEFAULT_DPI, 203);
  assert.equal(DEFAULT_PORT, 9100);
  assert.equal(CP862_CODE, 10);
  assert.equal(UTF8_CODE, 28);
  assert.ok(BARCODE_TYPES.code128);
  assert.ok(BARCODE_TYPES.qr);
});

// ─────────────────────────────────────────────────────────────────────
// Low-level command builders
// ─────────────────────────────────────────────────────────────────────

test('cmdStartLabel / cmdEndLabel produce ^XA / ^XZ', () => {
  assert.equal(commands.startLabel(), '^XA');
  assert.equal(commands.endLabel(), '^XZ');
});

test('cmdFieldOrigin rounds non-integer coordinates', () => {
  assert.equal(commands.fieldOrigin(10.7, 20.4), '^FO11,20');
  assert.equal(commands.fieldOrigin(0, 0), '^FO0,0');
});

test('cmdFont builds ^A0N,h,w', () => {
  assert.equal(commands.font(30, 30), '^A0N,30,30');
  assert.equal(commands.font(40, 35, 'R'), '^A0R,40,35');
  assert.equal(commands.font(40, 35, 'N', 'B'), '^ABN,40,35');
});

test('cmdFieldData wraps with ^FD ... ^FS and sanitizes carets', () => {
  assert.equal(commands.fieldData('hello'), '^FDhello^FS');
  assert.equal(commands.fieldData('a^b~c'), '^FDa_5Eb_7Ec^FS');
});

test('cmdCode128 emits ^BC with height', () => {
  const out = commands.code128(80);
  assert.ok(out.startsWith('^BCN,80'));
});

test('cmdCode39 emits ^B3', () => {
  const out = commands.code39(80);
  assert.ok(out.startsWith('^B3N,N,80'));
});

test('cmdEAN13 emits ^BE', () => {
  const out = commands.ean13(100);
  assert.ok(out.startsWith('^BEN,100'));
});

test('cmdQRCode emits ^BQ with magnification', () => {
  const out = commands.qrCode(5, 'M');
  assert.ok(out.includes('^BQN'));
  assert.ok(out.includes(',5,M'));
});

test('cmdQRFieldData prefixes with error correction', () => {
  const out = commands.qrFieldData('hello');
  assert.ok(out.startsWith('^FDMA,'));
  assert.ok(out.endsWith('^FS'));
});

test('cmdBox emits ^GB w,h,t,color', () => {
  assert.equal(commands.box(100, 50, 2), '^GB100,50,2,B,0');
});

test('cmdCircle emits ^GC d,t', () => {
  assert.equal(commands.circle(50, 3), '^GC50,3,B');
});

test('cmdLabelLength / cmdPrintWidth / cmdPrintQuantity', () => {
  assert.equal(commands.labelLength(300), '^LL300');
  assert.equal(commands.printWidth(400), '^PW400');
  assert.equal(commands.printQuantity(5), '^PQ5');
  assert.equal(commands.printQuantity(0), '^PQ1'); // min clamp
});

test('cmdCodePage emits ^CI with numeric index', () => {
  assert.equal(commands.codePage(28), '^CI28');
  assert.equal(commands.codePage(10), '^CI10');
});

test('cmdFieldBlock for multi-line wrapping', () => {
  assert.equal(commands.fieldBlock(300, 2, 0, 'L', 0), '^FB300,2,0,L,0');
});

test('cmdFieldReverse / cmdFieldHex', () => {
  assert.equal(commands.fieldReverse(), '^FR');
  assert.equal(commands.fieldHex(), '^FH');
});

test('cmdGraphicField emits ^GFA,totalBytes,totalBytes,bytesPerRow,hex', () => {
  const out = commands.graphicField('AABBCC', 3, 1);
  assert.equal(out, '^GFA,3,3,1,AABBCC');
});

// ─────────────────────────────────────────────────────────────────────
// Utility functions
// ─────────────────────────────────────────────────────────────────────

test('util.mmToDots / inchesToDots', () => {
  // 25.4mm = 1 inch = 203 dots @ default DPI
  assert.equal(util.mmToDots(25.4), 203);
  assert.equal(util.inchesToDots(1), 203);
  assert.equal(util.mmToDots(50.8), 406);
});

test('util.sanitizeText removes ZPL reserved chars', () => {
  assert.equal(util.sanitizeText('hello'), 'hello');
  assert.equal(util.sanitizeText('^start'), '_5Estart');
  assert.equal(util.sanitizeText('end~'), 'end_7E');
  assert.equal(util.sanitizeText(null), '');
  assert.equal(util.sanitizeText(undefined), '');
  assert.equal(util.sanitizeText(42), '42');
});

test('util.hasHebrew detects Hebrew characters', () => {
  assert.equal(util.hasHebrew('שלום'), true);
  assert.equal(util.hasHebrew('Hello'), false);
  assert.equal(util.hasHebrew('mixed שלום'), true);
  assert.equal(util.hasHebrew(''), false);
  assert.equal(util.hasHebrew(null), false);
});

test('util.reverseHebrewForRTL reverses Hebrew words', () => {
  // "שלום" reversed = "םולש"
  const out = util.reverseHebrewForRTL('שלום');
  assert.equal(out, 'םולש');
});

test('util.reverseHebrewForRTL preserves Latin text', () => {
  assert.equal(util.reverseHebrewForRTL('Hello'), 'Hello');
  assert.equal(util.reverseHebrewForRTL(''), '');
});

test('util.encodeCP862 encodes Hebrew letters to 0x80+', () => {
  const buf = util.encodeCP862('אב');
  assert.equal(buf.length, 2);
  assert.equal(buf[0], 0x80); // alef
  assert.equal(buf[1], 0x81); // bet
});

test('util.encodeCP862 handles ASCII passthrough', () => {
  const buf = util.encodeCP862('ABC');
  assert.equal(buf[0], 0x41);
  assert.equal(buf[1], 0x42);
  assert.equal(buf[2], 0x43);
});

test('util.encodeCP862 replaces unknown with question mark', () => {
  // Arabic character — not in CP862
  const buf = util.encodeCP862('م');
  assert.equal(buf[0], 0x3F);
});

test('util.parsePNGHeader reads IHDR width/height', () => {
  // Build a fake PNG: signature + IHDR chunk
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const chunkLen = Buffer.from([0, 0, 0, 13]);
  const chunkType = Buffer.from('IHDR', 'ascii');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(100, 0); // width
  ihdr.writeUInt32BE(50, 4);  // height
  const crc = Buffer.from([0, 0, 0, 0]);
  const png = Buffer.concat([sig, chunkLen, chunkType, ihdr, crc]);

  const hdr = util.parsePNGHeader(png);
  assert.ok(hdr);
  assert.equal(hdr.width, 100);
  assert.equal(hdr.height, 50);
});

test('util.parsePNGHeader rejects invalid buffer', () => {
  assert.equal(util.parsePNGHeader(null), null);
  assert.equal(util.parsePNGHeader(Buffer.alloc(5)), null);
  assert.equal(util.parsePNGHeader(Buffer.from('not a png....................')), null);
});

test('util.rasterToZplHex produces correct hex output', () => {
  // 16x2 raster = 4 bytes total
  const raster = Buffer.from([0xFF, 0x00, 0x0F, 0xF0]);
  const out = util.rasterToZplHex(raster, 16, 2);
  assert.equal(out.hex, 'FF000FF0');
  assert.equal(out.totalBytes, 4);
  assert.equal(out.bytesPerRow, 2);
});

test('util.rasterToZplHex pads short buffers', () => {
  const raster = Buffer.from([0xFF]);
  const out = util.rasterToZplHex(raster, 16, 2); // needs 4 bytes
  assert.equal(out.hex, 'FF000000');
});

test('util.imageToGraphicField accepts {raster, width, height}', () => {
  const out = util.imageToGraphicField({
    raster: Buffer.from([0xAB, 0xCD]),
    width: 16,
    height: 1,
  });
  assert.ok(out);
  assert.equal(out.hex, 'ABCD');
});

test('util.imageToGraphicField returns null on garbage', () => {
  assert.equal(util.imageToGraphicField('not a buffer'), null);
  assert.equal(util.imageToGraphicField({ nope: true }), null);
});

// ─────────────────────────────────────────────────────────────────────
// Label builder (fluent API)
// ─────────────────────────────────────────────────────────────────────

test('label() creates a Label instance', () => {
  const l = label(400, 300);
  assert.ok(l instanceof Label);
  assert.equal(l.width, 400);
  assert.equal(l.height, 300);
});

test('Label rejects non-positive dimensions', () => {
  assert.throws(() => label(0, 100), RangeError);
  assert.throws(() => label(100, -5), RangeError);
  assert.throws(() => label(NaN, 100), RangeError);
});

test('Label.build() wraps with ^XA ... ^XZ and sets width/length', () => {
  const out = label(400, 300).build();
  assert.ok(out.startsWith('^XA'));
  assert.ok(out.endsWith('^XZ'));
  assert.ok(out.includes('^PW400'));
  assert.ok(out.includes('^LL300'));
});

test('Label.unicode() emits ^CI28', () => {
  const out = label(400, 300).unicode().build();
  assert.ok(out.includes('^CI28'));
});

test('Label.hebrewLegacy() emits ^CI10', () => {
  const out = label(400, 300).hebrewLegacy().build();
  assert.ok(out.includes('^CI10'));
});

test('Label.text() adds ^FO + ^A + ^FD', () => {
  const out = label(400, 300).text(20, 20, 'Hello', { size: 30 }).build();
  assert.ok(out.includes('^FO20,20'));
  assert.ok(out.includes('^A0N,30,30'));
  assert.ok(out.includes('^FDHello^FS'));
});

test('Label.text() supports bold (wider font)', () => {
  const out = label(400, 300).text(0, 0, 'Bold', { size: 30, bold: true }).build();
  assert.ok(out.match(/\^A0N,30,36/)); // bold width = 30 * 1.2 = 36
});

test('Label.text() supports field block for multi-line', () => {
  const out = label(400, 300)
    .text(0, 0, 'Long text', { size: 20, blockWidth: 300, maxLines: 3 })
    .build();
  assert.ok(out.includes('^FB300,3,0,L,0'));
});

test('Label.text() supports reverse (^FR)', () => {
  const out = label(400, 300).text(0, 0, 'Reverse', { reverse: true }).build();
  assert.ok(out.includes('^FR'));
});

test('Label.text() supports rtlReverse for Hebrew', () => {
  const out = label(400, 300).text(0, 0, 'שלום', { rtlReverse: true }).build();
  // Reversed = "םולש"
  assert.ok(out.includes('םולש'));
});

test('Label.barcode() code128', () => {
  const out = label(400, 300).barcode(20, 50, '1234', {
    type: 'code128',
    height: 100,
  }).build();
  assert.ok(out.includes('^FO20,50'));
  assert.ok(out.includes('^BCN,100'));
  assert.ok(out.includes('^FD1234^FS'));
});

test('Label.barcode() code39', () => {
  const out = label(400, 300).barcode(0, 0, 'ABC', { type: 'code39' }).build();
  assert.ok(out.includes('^B3N,N,'));
});

test('Label.barcode() ean13', () => {
  const out = label(400, 300).barcode(0, 0, '7290001234567', { type: 'ean13' }).build();
  assert.ok(out.includes('^BEN,'));
});

test('Label.barcode() qr', () => {
  const out = label(400, 300).barcode(0, 0, 'https://example.com', { type: 'qr' }).build();
  assert.ok(out.includes('^BQN'));
  assert.ok(out.includes('^FDMA,'));
});

test('Label.barcode() unknown type falls back to code128', () => {
  const out = label(400, 300).barcode(0, 0, 'X', { type: 'nope' }).build();
  assert.ok(out.includes('^BCN,'));
});

test('Label.box() emits ^FO + ^GB + ^FS', () => {
  const out = label(400, 300).box(10, 10, 100, 50, 3).build();
  assert.ok(out.includes('^FO10,10'));
  assert.ok(out.includes('^GB100,50,3,B,0'));
  assert.ok(out.includes('^FS'));
});

test('Label.circle() emits ^GC', () => {
  const out = label(400, 300).circle(50, 50, 40, 2).build();
  assert.ok(out.includes('^GC40,2,B'));
});

test('Label.line() is a box with height=thickness', () => {
  const out = label(400, 300).line(10, 10, 200, 3).build();
  assert.ok(out.includes('^GB200,3,3,B,0'));
});

test('Label.image() with fake PNG buffer creates ^GFA placeholder', () => {
  // Build fake PNG header as in parsePNGHeader test
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const chunkLen = Buffer.from([0, 0, 0, 13]);
  const chunkType = Buffer.from('IHDR', 'ascii');
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(16, 0);
  ihdr.writeUInt32BE(8, 4);
  const crc = Buffer.from([0, 0, 0, 0]);
  const png = Buffer.concat([sig, chunkLen, chunkType, ihdr, crc]);

  const out = label(400, 300).image(10, 10, png).build();
  assert.ok(out.includes('^GFA,'));
});

test('Label.image() with {raster, width, height}', () => {
  const out = label(400, 300)
    .image(0, 0, { raster: Buffer.from([0xFF]), width: 8, height: 1 })
    .build();
  assert.ok(out.includes('^GFA,1,1,1,FF'));
});

test('Label.image() with invalid data logs warning and skips', () => {
  const out = label(400, 300).image(0, 0, 'bogus').build();
  // Label should still build, just without GF
  assert.ok(out.startsWith('^XA'));
  assert.ok(!out.includes('^GFA'));
});

test('Label.raw() passes fragments through', () => {
  const out = label(400, 300).raw('^CUSTOM').build();
  assert.ok(out.includes('^CUSTOM'));
});

test('Label.quantityOf() emits ^PQ when > 1', () => {
  const out = label(400, 300).quantityOf(5).build();
  assert.ok(out.includes('^PQ5'));
});

test('Label.quantityOf(1) does NOT emit ^PQ', () => {
  const out = label(400, 300).quantityOf(1).build();
  assert.ok(!out.includes('^PQ'));
});

test('Label chaining returns `this`', () => {
  const l = label(400, 300);
  const result = l.text(0, 0, 'A').box(0, 0, 10, 10).circle(5, 5, 3);
  assert.equal(result, l);
});

test('Label.toString() equals build()', () => {
  const l = label(400, 300).text(0, 0, 'X');
  assert.equal(l.toString(), l.build());
});

// ─────────────────────────────────────────────────────────────────────
// Hebrew text end-to-end
// ─────────────────────────────────────────────────────────────────────

test('Label with Hebrew text renders via UTF-8', () => {
  const out = label(400, 300)
    .unicode()
    .text(20, 20, 'שלום עולם')
    .build();
  assert.ok(out.includes('^CI28'));
  assert.ok(out.includes('שלום עולם'));
});

test('Label with Hebrew + CP862 encoding mode set', () => {
  const out = label(400, 300)
    .hebrewLegacy()
    .text(20, 20, 'hello') // text kept simple, encoding handled at transport
    .build();
  assert.ok(out.includes('^CI10'));
});

// ─────────────────────────────────────────────────────────────────────
// Pre-made templates (inline `templates` object)
// ─────────────────────────────────────────────────────────────────────

test('templates.productLabel produces valid ZPL with Hebrew', () => {
  const out = templates.productLabel({
    nameHebrew: 'מברג חשמלי',
    nameEnglish: 'Electric Screwdriver',
    price: 299.90,
    sku: 'TK-SCR-001',
    barcode: '7290001234567',
    barcodeType: 'ean13',
  });
  assert.ok(out.startsWith('^XA'));
  assert.ok(out.endsWith('^XZ'));
  assert.ok(out.includes('מברג חשמלי'));
  assert.ok(out.includes('Electric Screwdriver'));
  assert.ok(out.includes('TK-SCR-001'));
  assert.ok(out.includes('299.90'));
  assert.ok(out.includes('^CI28'));
});

test('templates.shippingLabel contains all required fields', () => {
  const out = templates.shippingLabel({
    from: { name: 'Techno Kol', address: '1 Main St', city: 'TLV', zip: '12345', phone: '03-1234567' },
    to:   { name: 'Kobi E.', address: '5 Other Rd', city: 'Haifa', zip: '67890', phone: '050-1111111' },
    trackingNumber: 'TRK-ABC-12345',
    service: 'Express',
    weight: 2.5,
  });
  assert.ok(out.includes('EXPRESS'));
  assert.ok(out.includes('Techno Kol'));
  assert.ok(out.includes('Kobi E.'));
  assert.ok(out.includes('TRK-ABC-12345'));
  assert.ok(out.includes('2.5 kg'));
  assert.ok(out.includes('^BCN')); // code128 barcode
  assert.ok(out.includes('^BQN')); // qr code
});

test('templates.inventoryLabel builds correctly', () => {
  const out = templates.inventoryLabel({
    itemCode: 'TK-BLT-M8',
    description: 'Bolt M8 x 50mm',
    location: 'A-12-03',
    qty: 250,
  });
  assert.ok(out.includes('TK-BLT-M8'));
  assert.ok(out.includes('Bolt M8 x 50mm'));
  assert.ok(out.includes('A-12-03'));
  assert.ok(out.includes('250'));
});

test('templates.assetTag includes asset ID + QR', () => {
  const out = templates.assetTag({
    assetId: 'TK-LAP-0042',
    department: 'Engineering',
    date: new Date('2026-04-11'),
    owner: 'Kobi E.',
  });
  assert.ok(out.includes('TK-LAP-0042'));
  assert.ok(out.includes('Engineering'));
  assert.ok(out.includes('2026-04-11'));
  assert.ok(out.includes('Kobi E.'));
  assert.ok(out.includes('^BQN'));
});

test('templates.employeeId builds with photo placeholder', () => {
  const out = templates.employeeId({
    name: 'Kobi Eliashar',
    employeeId: 'EMP-0042',
    department: 'R&D',
    jobTitle: 'Senior Engineer',
    issueDate: '2026-01-01',
    expires: '2027-01-01',
  });
  assert.ok(out.includes('Kobi Eliashar'));
  assert.ok(out.includes('EMP-0042'));
  assert.ok(out.includes('R&D'));
  assert.ok(out.includes('PHOTO')); // placeholder text
  assert.ok(out.includes('^BCN')); // employee id barcode
  assert.ok(out.includes('^BQN'));
});

test('templates.employeeId embeds raster photo when provided', () => {
  const out = templates.employeeId({
    name: 'Test',
    employeeId: 'E1',
    department: 'IT',
    photo: {
      raster: Buffer.from([0xAA, 0xBB]),
      width: 16,
      height: 1,
    },
  });
  assert.ok(out.includes('^GFA,'));
  assert.ok(!out.includes('PHOTO')); // placeholder text should NOT appear
});

test('all templates accept empty data without throwing', () => {
  assert.doesNotThrow(() => templates.productLabel({}));
  assert.doesNotThrow(() => templates.shippingLabel({}));
  assert.doesNotThrow(() => templates.inventoryLabel({}));
  assert.doesNotThrow(() => templates.assetTag({}));
  assert.doesNotThrow(() => templates.employeeId({}));
  assert.doesNotThrow(() => templates.productLabel(undefined));
});

// ─────────────────────────────────────────────────────────────────────
// Standalone label-templates/*.js files
// ─────────────────────────────────────────────────────────────────────

test('standalone buildProductLabel works', () => {
  const out = standaloneTemplates.buildProductLabel({
    nameHebrew: 'בדיקה',
    nameEnglish: 'Test',
    price: 10,
    sku: 'X-1',
    barcode: '1234567',
  });
  assert.ok(out.includes('בדיקה'));
  assert.ok(out.includes('Test'));
  assert.ok(out.includes('X-1'));
});

test('standalone buildShippingLabel works', () => {
  const out = standaloneTemplates.buildShippingLabel({
    from: { name: 'A' },
    to: { name: 'B' },
    trackingNumber: 'T1',
  });
  assert.ok(out.includes('A'));
  assert.ok(out.includes('B'));
  assert.ok(out.includes('T1'));
});

test('standalone buildInventoryLabel works', () => {
  const out = standaloneTemplates.buildInventoryLabel({
    itemCode: 'I1',
    description: 'Widget',
    location: 'L1',
    qty: 5,
  });
  assert.ok(out.includes('I1'));
  assert.ok(out.includes('Widget'));
  assert.ok(out.includes('L1'));
  assert.ok(out.includes('5'));
});

test('standalone buildAssetTag works', () => {
  const out = standaloneTemplates.buildAssetTag({
    assetId: 'A1',
    department: 'D1',
    owner: 'O1',
  });
  assert.ok(out.includes('A1'));
  assert.ok(out.includes('D1'));
  assert.ok(out.includes('O1'));
});

test('standalone buildEmployeeId works', () => {
  const out = standaloneTemplates.buildEmployeeId({
    name: 'Name',
    employeeId: 'E1',
    department: 'Dept',
  });
  assert.ok(out.includes('Name'));
  assert.ok(out.includes('E1'));
  assert.ok(out.includes('Dept'));
});

// ─────────────────────────────────────────────────────────────────────
// Transport — saveToFile
// ─────────────────────────────────────────────────────────────────────

test('saveToFile writes ZPL to disk', async () => {
  const dir = mkTmpDir();
  try {
    const filePath = path.join(dir, 'label.zpl');
    const ok = await saveToFile('^XA^XZ', filePath);
    assert.equal(ok, true);
    const contents = fs.readFileSync(filePath, 'utf8');
    assert.equal(contents, '^XA^XZ');
  } finally {
    cleanup(dir);
  }
});

test('saveToFile creates missing directories', async () => {
  const dir = mkTmpDir();
  try {
    const nestedPath = path.join(dir, 'a', 'b', 'c', 'label.zpl');
    const ok = await saveToFile('^XA^XZ', nestedPath);
    assert.equal(ok, true);
    assert.ok(fs.existsSync(nestedPath));
  } finally {
    cleanup(dir);
  }
});

test('saveToFile returns false on invalid input', async () => {
  const ok1 = await saveToFile(null, '/tmp/nope.zpl');
  assert.equal(ok1, false);
  const ok2 = await saveToFile('^XA', '');
  assert.equal(ok2, false);
});

// ─────────────────────────────────────────────────────────────────────
// Transport — sendToPrinter
// ─────────────────────────────────────────────────────────────────────

test('sendToPrinter returns false when host missing', async () => {
  const ok = await sendToPrinter('^XA^XZ', {});
  assert.equal(ok, false);
});

test('sendToPrinter returns false when zplData invalid', async () => {
  const ok = await sendToPrinter(null, { host: '127.0.0.1' });
  assert.equal(ok, false);
});

test('sendToPrinter fails fast on unreachable host (fail-open)', async () => {
  // Use a port we know is closed — port 1 is reserved/never open.
  const ok = await sendToPrinter('^XA^XZ', {
    host: '127.0.0.1',
    port: 1,
    timeout: 500,
  });
  assert.equal(ok, false);
});

test('sendToPrinter sends payload to fake TCP server', async () => {
  const server = await startFakeServer();
  try {
    const payload = '^XA^FO0,0^FDhello^FS^XZ';
    const ok = await sendToPrinter(payload, {
      host: '127.0.0.1',
      port: server.port,
      timeout: 2000,
    });
    assert.equal(ok, true);
    const received = await server.received;
    assert.equal(received.toString('utf8'), payload);
  } finally {
    await server.close();
  }
});

test('sendToPrinter supports Buffer payloads', async () => {
  const server = await startFakeServer();
  try {
    const buf = Buffer.from('^XA^XZ', 'utf8');
    const ok = await sendToPrinter(buf, {
      host: '127.0.0.1',
      port: server.port,
      timeout: 2000,
    });
    assert.equal(ok, true);
    const received = await server.received;
    assert.equal(received.toString('utf8'), '^XA^XZ');
  } finally {
    await server.close();
  }
});

test('sendToPrinter supports cp862 encoding for Hebrew legacy', async () => {
  const server = await startFakeServer();
  try {
    const payload = '^XA^FDאב^FS^XZ';
    const ok = await sendToPrinter(payload, {
      host: '127.0.0.1',
      port: server.port,
      timeout: 2000,
      encoding: 'cp862',
    });
    assert.equal(ok, true);
    const received = await server.received;
    // Hebrew alef+bet encoded as 0x80, 0x81
    assert.ok(received.includes(0x80));
    assert.ok(received.includes(0x81));
  } finally {
    await server.close();
  }
});

// ─────────────────────────────────────────────────────────────────────
// USB stub
// ─────────────────────────────────────────────────────────────────────

test('sendViaUSB returns false (stub)', async () => {
  const ok = await sendViaUSB('^XA^XZ', { port: 'COM1' });
  assert.equal(ok, false);
});

// ─────────────────────────────────────────────────────────────────────
// Integration — build template and save
// ─────────────────────────────────────────────────────────────────────

test('end-to-end: build product label and save to file', async () => {
  const dir = mkTmpDir();
  try {
    const z = templates.productLabel({
      nameHebrew: 'מוצר בדיקה',
      nameEnglish: 'Test Product',
      price: 99.99,
      sku: 'TEST-001',
      barcode: '1234567890',
    });
    const filePath = path.join(dir, 'product.zpl');
    const ok = await saveToFile(z, filePath);
    assert.equal(ok, true);
    const read = fs.readFileSync(filePath, 'utf8');
    assert.ok(read.includes('^XA'));
    assert.ok(read.includes('מוצר בדיקה'));
    assert.ok(read.includes('TEST-001'));
  } finally {
    cleanup(dir);
  }
});
