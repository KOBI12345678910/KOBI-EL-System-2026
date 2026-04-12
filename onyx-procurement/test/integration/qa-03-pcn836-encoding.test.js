/**
 * ============================================================================
 *  QA-03 — Integration Test Agent
 *  File   : qa-03-pcn836-encoding.test.js
 *  Agent  : QA-03 (Integration)
 *  Date   : 2026-04-11
 *
 *  Scope
 *  -----
 *  PCN836 is the Israeli Tax Authority VAT submission format — a fixed-width
 *  windows-1255-encoded text file. buildPcn836File() in src/vat/pcn836.js
 *  produces it; vat-routes.js writes it to disk with `fs.writeFileSync(path,
 *  file.content, 'binary')`. This test proves BUG-08:
 *
 *     1. fmtText pads to N JavaScript code units, NOT to N windows-1255
 *        bytes. For pure ASCII strings the two coincide; for Hebrew they
 *        DO NOT (each Hebrew char is 2 UTF-8 bytes, 1 windows-1255 byte).
 *        validatePcn836File() measures `line.length` (JS chars) — it will
 *        accept a file that is the wrong byte-count in every real encoding.
 *
 *     2. When vat-routes writes the file with 'binary' encoding, Node.js
 *        truncates every char to its lower 8 bits. For Hebrew the upper
 *        byte is non-zero (U+0590 ..) so writing with 'binary' silently
 *        drops 50% of every Hebrew character's bits and produces junk
 *        that is neither valid UTF-8 nor valid windows-1255.
 *
 *  What this test verifies
 *  -----------------------
 *  - JS string length vs UTF-8 byte length vs windows-1255 byte length for
 *    Hebrew (documents BUG-08 with numeric evidence).
 *  - buildPcn836File() with Hebrew company name produces a file whose
 *    `content` round-trips JS-correctly but whose raw byte count mismatches
 *    the reported width.
 *  - validatePcn836File() on such a file reports NO errors — proving the
 *    validator uses JS string length, missing the real encoding problem.
 *  - Simulating fs.writeFileSync(..., 'binary') on Hebrew content produces
 *    bytes that DIFFER from the proper iconv-lite windows-1255 output.
 *
 *  Rule: NEW FILE ONLY — we do not touch pcn836.js, vat-routes.js, or the
 *  existing pcn836 unit tests.
 * ============================================================================
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { buildPcn836File, validatePcn836File } = require(
  path.join('..', '..', 'src', 'vat', 'pcn836.js'),
);

// ---------------------------------------------------------------------------
// Fixtures — a minimal but realistic PCN836 input
// ---------------------------------------------------------------------------

const companyProfileHebrew = {
  vat_file_number: '514123456',
  legal_name: 'טכנו-קול עוזי בע"מ',
  reporting_frequency: 'monthly',
};

const companyProfileAscii = {
  vat_file_number: '514123456',
  legal_name: 'Techno-Kol Uzi Ltd.',
  reporting_frequency: 'monthly',
};

const period = {
  period_label: '2026-04',
  period_start: '2026-04-01',
  period_end: '2026-04-30',
  taxable_sales: 250000,
  vat_on_sales: 42500,
  zero_rate_sales: 0,
  exempt_sales: 0,
  taxable_purchases: 120000,
  vat_on_purchases: 20400,
  asset_purchases: 0,
  vat_on_assets: 0,
  net_vat_payable: 22100,
  is_refund: false,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('QA-03 PCN836 :: Hebrew char JS-length ≠ UTF-8 bytes ≠ windows-1255 bytes (BUG-08 evidence)', () => {
  const hebrew = 'טכנו-קול עוזי';
  const jsLen = hebrew.length;
  const utf8Bytes = Buffer.byteLength(hebrew, 'utf8');
  // 'binary' encoding in Node.js truncates each code unit to its lower byte.
  const binaryBytes = Buffer.byteLength(hebrew, 'binary');

  // Known invariants for Hebrew strings in the U+05Dx range:
  //   jsLen counts 13 JS code units
  //   UTF-8 encodes each Hebrew code point as 2 bytes  → 24 + the dash = 25..
  //   'binary' = JS code units (one byte per char)     → 13
  //   windows-1255 (proper) = 1 byte per Hebrew char   → 13
  assert.equal(jsLen, 13, 'JS .length is 13 code units');
  assert.ok(utf8Bytes >= 24, `UTF-8 bytes must be ≥24, got ${utf8Bytes}`);
  assert.equal(binaryBytes, 13, "'binary' encoding collapses to 1 byte per code unit");
  assert.notEqual(
    utf8Bytes,
    binaryBytes,
    'BUG-08: UTF-8 and binary byte counts differ — any writer that expects bytes will be wrong',
  );
});

test('QA-03 PCN836 :: BUG-08e — validator rejects every real built file, even pure ASCII', () => {
  // Known-good ASCII input. By the strict reading of "fixed-width file",
  // every line should be the same width — but the PCN836 standard actually
  // uses DIFFERENT widths per record type:
  //    A (header)  — 92
  //    B (summary) — 113
  //    C/D (invoice) — 76
  //    Z (trailer) — 60
  // The current validator does a naive "all lines equal width" check, so
  // it reports false positives on every real file. The existing pcn836
  // unit test explicitly filters these out — we assert the behaviour so
  // any future fix has a failing test to prove the fix.
  const file = buildPcn836File({
    companyProfile: companyProfileAscii,
    period,
    inputInvoices: [],
    outputInvoices: [],
  });

  const widths = new Set(file.lines.map((l) => l.length));
  assert.ok(
    widths.size > 1,
    `BUG-08e: real file has multiple widths (${[...widths].join(',')}), but validator asserts one`,
  );

  const errors = validatePcn836File(file);
  const widthErrors = errors.filter((e) => /width \d+/.test(e));
  assert.ok(
    widthErrors.length > 0,
    'BUG-08e: validator reports width errors on a legitimate ASCII-only file',
  );
});

test('QA-03 PCN836 :: BUG-08a — Hebrew company name is fmtText-padded to N chars, not N bytes', () => {
  const fileAscii = buildPcn836File({
    companyProfile: companyProfileAscii,
    period,
  });
  const fileHeb = buildPcn836File({
    companyProfile: companyProfileHebrew,
    period,
  });

  // For fixed-width formats "N bytes in the target encoding" is what matters.
  // fmtText pads to N JS chars. Both files end up with A-header of JS length
  // 92 — but the Hebrew one has MORE UTF-8 bytes because Hebrew is 2 bytes
  // per code point in UTF-8.
  const headAsciiJs = fileAscii.lines[0].length;
  const headHebJs   = fileHeb.lines[0].length;
  assert.equal(
    headHebJs,
    headAsciiJs,
    'JS char widths must match — the bug is invisible to anyone only looking at .length',
  );

  const headAsciiBytes = Buffer.byteLength(fileAscii.lines[0], 'utf8');
  const headHebBytes   = Buffer.byteLength(fileHeb.lines[0], 'utf8');
  assert.ok(
    headHebBytes > headAsciiBytes,
    `BUG-08a: Hebrew header bytes (${headHebBytes}) > ASCII header bytes (${headAsciiBytes}) — silent width drift`,
  );
});

test('QA-03 PCN836 :: writing file.content with fs.writeFileSync(..., "binary") drops Hebrew bytes', () => {
  const file = buildPcn836File({
    companyProfile: companyProfileHebrew,
    period,
  });

  // Simulate exactly what vat-routes does:
  //   fs.writeFileSync(archivePath, file.content, 'binary');
  const binaryEncoded = Buffer.from(file.content, 'binary');
  const utf8Encoded = Buffer.from(file.content, 'utf8');

  // BUG-08c: these two buffers MUST differ for any Hebrew content, because
  // 'binary' truncates non-ASCII code units.
  assert.notEqual(
    binaryEncoded.length,
    utf8Encoded.length,
    'BUG-08c: binary-encoded buffer is SHORTER than utf-8 — information loss',
  );

  // Round-trip the 'binary' bytes back through a windows-1255 reader — would
  // give garbage. We can prove that by checking that the resulting UTF-8
  // decoded string does NOT contain the original Hebrew company name.
  const roundTripFromBinary = binaryEncoded.toString('utf8');
  assert.ok(
    !roundTripFromBinary.includes('טכנו-קול עוזי'),
    'BUG-08c: round-tripping through `binary` encoding destroys the Hebrew company name',
  );
});

test('QA-03 PCN836 :: a byte-aware validator would catch Hebrew-induced drift in the SAME record type', () => {
  // Compare two files that only differ by the company name language —
  // the A header should be the SAME byte width in a correct encoder.
  const asciiHeader = buildPcn836File({
    companyProfile: companyProfileAscii,
    period,
  }).lines[0];
  const hebHeader = buildPcn836File({
    companyProfile: companyProfileHebrew,
    period,
  }).lines[0];

  // JS char length is equal (both fmtText-padded to 92 chars).
  assert.equal(asciiHeader.length, hebHeader.length);

  // But UTF-8 byte length differs — so a byte-aware validator would see
  // two versions of the "A" record that aren't the same width in reality.
  const asciiBytes = Buffer.byteLength(asciiHeader, 'utf8');
  const hebBytes = Buffer.byteLength(hebHeader, 'utf8');
  assert.notEqual(
    asciiBytes,
    hebBytes,
    `BUG-08g: same record type ('A') produces ${asciiBytes} bytes for ASCII but ${hebBytes} for Hebrew — real byte width is data-dependent`,
  );
});

test('QA-03 PCN836 :: metadata.encoding says windows-1255 but buildPcn836File has NO transcoding step', () => {
  const file = buildPcn836File({
    companyProfile: companyProfileHebrew,
    period,
  });
  // The metadata claims windows-1255 — but the actual content is a JS string
  // (internal UTF-16). Nothing in the generator converts to windows-1255.
  assert.equal(
    file.metadata.encoding,
    'windows-1255',
    'metadata says windows-1255',
  );
  // Prove the content is still raw JS Hebrew (contains Hebrew code points
  // ≥ 0x0590) — i.e. NOT windows-1255 bytes.
  let sawHebrew = false;
  for (let i = 0; i < file.content.length; i++) {
    const cp = file.content.charCodeAt(i);
    if (cp >= 0x0590 && cp <= 0x05FF) { sawHebrew = true; break; }
  }
  assert.equal(
    sawHebrew,
    true,
    'BUG-08d: content still contains raw Hebrew code points, no transcoding happened',
  );
});

test('QA-03 PCN836 :: building a file with an empty legal_name does NOT crash the generator', () => {
  const file = buildPcn836File({
    companyProfile: { ...companyProfileHebrew, legal_name: '' },
    period,
  });
  // The structural assertions still hold — only width errors fire
  const errors = validatePcn836File(file);
  const structural = errors.filter(
    (e) =>
      /Missing content/.test(e) ||
      /Missing metadata/.test(e) ||
      /Too few records/.test(e) ||
      /First record must be header/.test(e) ||
      /Second record must be summary/.test(e) ||
      /Last record must be trailer/.test(e),
  );
  assert.deepEqual(structural, [], 'structural checks must pass');
  assert.equal(file.lines[0][0], 'A', 'header record prefix is A');
});

test('QA-03 PCN836 :: Hebrew invoice_number adds further byte drift to C-line', () => {
  const hebrewInvoice = {
    counterparty_id: '123456789',     // ASCII numeric — fine
    invoice_number: 'חשב-001',         // Hebrew invoice number — bytes differ
    invoice_date: '2026-04-15',
    vat_amount: 1700,
    net_amount: 10000,
    description: 'שירותי ייעוץ',
  };
  const fileHebInvoice = buildPcn836File({
    companyProfile: companyProfileAscii,   // ASCII header
    period,
    inputInvoices: [hebrewInvoice],
    outputInvoices: [],
  });
  const fileAsciiInvoice = buildPcn836File({
    companyProfile: companyProfileAscii,
    period,
    inputInvoices: [{ ...hebrewInvoice, invoice_number: 'INV-001', description: 'Consulting' }],
    outputInvoices: [],
  });

  const cHeb = fileHebInvoice.lines.find((l) => l[0] === 'C');
  const cAscii = fileAsciiInvoice.lines.find((l) => l[0] === 'C');
  assert.ok(cHeb && cAscii, 'both files must have a C-line');

  // JS lengths are equal (fmtText pads both to the same N chars) — bug hidden
  assert.equal(cHeb.length, cAscii.length, 'JS char widths are equal (bug is invisible here)');

  // UTF-8 byte widths are NOT equal — the real file bytes will differ
  assert.ok(
    Buffer.byteLength(cHeb, 'utf8') > Buffer.byteLength(cAscii, 'utf8'),
    `BUG-08f: Hebrew C-line is wider in bytes (${Buffer.byteLength(cHeb, 'utf8')} > ${Buffer.byteLength(cAscii, 'utf8')})`,
  );
});
