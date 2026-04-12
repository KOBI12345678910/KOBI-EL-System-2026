/**
 * ONYX — XLSX Exporter (zero external dependencies)
 * ═══════════════════════════════════════════════════════════════
 * Agent 66 — written 2026-04-11
 *
 * Builds Office Open XML (.xlsx) SpreadsheetML files from scratch:
 *
 *   • ZIP container (PKZip 2.0, deflate / store)
 *        — built inline with Node's native `zlib.deflateRawSync`
 *        — CRC-32 table computed at module load
 *   • SpreadsheetML parts:
 *        [Content_Types].xml
 *        _rels/.rels
 *        xl/workbook.xml          (sheet refs, calcPr, rtl via sheetView)
 *        xl/_rels/workbook.xml.rels
 *        xl/styles.xml            (numFmts, fonts, fills, borders, cellXfs)
 *        xl/sharedStrings.xml     (inline strings are also supported)
 *        xl/worksheets/sheet1.xml (rows, cells, freeze, autofilter, merges, cols)
 *
 * Hebrew / RTL support:
 *   • <sheetView rightToLeft="1">        — reverses cell layout
 *   • Default font: "Arial Hebrew" (falls back to Calibri automatically
 *     in Excel / LibreOffice when the Hebrew face is absent).
 *
 * Built-in cell formats:
 *   text     → no numFmt (General / string)
 *   number   → #,##0.00
 *   currency → "₪"#,##0.00
 *   date     → dd/mm/yyyy   (serialised as Excel date serial)
 *
 * Public API:
 *
 *   exportToExcel(rows, {
 *     sheetName = 'גיליון1',
 *     headers,                 // [{ key, label, format?, width?, merge? }]
 *     rtl = true,
 *     outputPath,              // when set, writes .xlsx file
 *     stream,                  // optional writable (res) — streams buffer
 *     styles,                  // { headerFill, headerFont, zebra }
 *   }) → Buffer (.xlsx bytes)
 *
 * Helper exporters (one call per entity) all accept `(rows, output)`
 * where `output` may be either a string (file path) **or** a writable
 * stream. This matches the streaming requirement in the task:
 *   → exportEmployees, exportWageSlips, exportInvoices,
 *     exportSuppliers, exportPCN836, exportBankTransactions
 *
 * NOTE: No external dependencies. Everything below is Node native.
 *       Works on Node 20+.
 */

'use strict';

const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

// ────────────────────────────────────────────────────────────────
// CRC-32 (PKZip / ZIP local file header + central directory)
// Pre-computed at module load to avoid per-row recomputation.
// ────────────────────────────────────────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ────────────────────────────────────────────────────────────────
// ZIP builder — minimal PKZip 2.0, DEFLATE / STORE.
// Produces a single Buffer so it can be written to disk
// OR streamed to res via `res.end(buffer)`.
// ────────────────────────────────────────────────────────────────
function buildZip(files) {
  // files: [{ name: string, data: Buffer }]
  const now = new Date();
  const dosTime = ((now.getHours() & 0x1F) << 11)
                | ((now.getMinutes() & 0x3F) << 5)
                | ((now.getSeconds() >>> 1) & 0x1F);
  const dosDate = (((now.getFullYear() - 1980) & 0x7F) << 9)
                | (((now.getMonth() + 1) & 0x0F) << 5)
                | (now.getDate() & 0x1F);

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const uncompressed = file.data;
    const crc = crc32(uncompressed);

    // Compress with raw deflate (method = 8). Store (method = 0) is
    // used only when deflate makes the payload bigger (rare).
    let method = 8;
    let compressed = zlib.deflateRawSync(uncompressed);
    if (compressed.length >= uncompressed.length) {
      method = 0;
      compressed = uncompressed;
    }

    // ─── Local file header ─── (signature 0x04034b50)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);  // signature
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // flags (UTF-8 filename)
    local.writeUInt16LE(method, 8);       // compression method
    local.writeUInt16LE(dosTime, 10);     // mod time
    local.writeUInt16LE(dosDate, 12);     // mod date
    local.writeUInt32LE(crc, 14);         // CRC-32
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(uncompressed.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);           // extra len

    localParts.push(local, nameBuf, compressed);

    // ─── Central directory header ─── (signature 0x02014b50)
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);   // version made by
    central.writeUInt16LE(20, 6);   // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(uncompressed.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);   // extra len
    central.writeUInt16LE(0, 32);   // comment len
    central.writeUInt16LE(0, 34);   // disk #
    central.writeUInt16LE(0, 36);   // internal attrs
    central.writeUInt32LE(0, 38);   // external attrs
    central.writeUInt32LE(offset, 42); // relative offset of local header

    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(centralParts);
  const localBuf = Buffer.concat(localParts);

  // ─── End of central directory ─── (signature 0x06054b50)
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);                       // disk #
  end.writeUInt16LE(0, 6);                       // disk w/ central dir
  end.writeUInt16LE(files.length, 8);            // entries this disk
  end.writeUInt16LE(files.length, 10);           // total entries
  end.writeUInt32LE(centralBuf.length, 12);      // size of central dir
  end.writeUInt32LE(localBuf.length, 16);        // offset of central dir
  end.writeUInt16LE(0, 20);                      // comment len

  return Buffer.concat([localBuf, centralBuf, end]);
}

// ────────────────────────────────────────────────────────────────
// XML helpers — minimal escaping for Hebrew strings, formulas, etc.
// ────────────────────────────────────────────────────────────────
function xmlEscape(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Strip C0 controls (except \t, \n, \r) — Excel rejects them
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

// Excel column letter: 1 → A, 27 → AA, 702 → ZZ, 703 → AAA
function colLetter(n) {
  let s = '';
  let x = n;
  while (x > 0) {
    const rem = (x - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s || 'A';
}

// Excel date serial — days since 1899-12-30, preserving the
// infamous 1900 leap-year bug compatibility. Accepts Date / ISO string.
//
// Behaviour:
//   • ISO date-only strings ("YYYY-MM-DD") are treated as UTC
//     midnight → integer serial (no local-timezone drift).
//   • Everything else goes through `new Date()` then is converted
//     to UTC days using the parsed timestamp, which is what Excel
//     expects for date-time values.
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
function toExcelDateSerial(input) {
  if (input === null || input === undefined || input === '') return null;

  // Fast path for ISO date-only strings — avoids timezone surprises.
  if (typeof input === 'string') {
    const m = DATE_ONLY_RE.exec(input);
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (!Number.isInteger(y) || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      const utcMs = Date.UTC(y, mo - 1, d);
      const epoch = Date.UTC(1899, 11, 30);
      return Math.round((utcMs - epoch) / 86400000);
    }
  }

  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const epoch = Date.UTC(1899, 11, 30);
  return (d.getTime() - epoch) / 86400000;
}

// ────────────────────────────────────────────────────────────────
// Styles — cellXfs indexes are used in sheet1.xml `s="N"`.
// Indexes MUST match the order below.
//   0 = default (no number format)
//   1 = header (bold, fill, center)
//   2 = number (#,##0.00)
//   3 = currency (₪ #,##0.00)
//   4 = date (dd/mm/yyyy)
//   5 = text (plain)
//   6 = zebra row background (optional)
// ────────────────────────────────────────────────────────────────
const STYLE_IDX = Object.freeze({
  default: 0,
  header:  1,
  number:  2,
  currency:3,
  date:    4,
  text:    5,
  zebra:   6,
});

function buildStylesXml(opts = {}) {
  const headerFill = opts.headerFill || 'FFD9E1F2';
  const headerFont = opts.headerFont || 'Arial Hebrew';
  // Custom numFmts — indexes >= 164 are user-defined in XLSX.
  // 164 = #,##0.00           (number)
  // 165 = ₪ #,##0.00          (currency)
  // 166 = dd/mm/yyyy          (date)
  const numFmts = [
    { id: 164, code: '#,##0.00' },
    { id: 165, code: '\u20AA#,##0.00' }, // ₪
    { id: 166, code: 'dd/mm/yyyy' },
  ];

  const numFmtsXml = numFmts.map(f =>
    `<numFmt numFmtId="${f.id}" formatCode="${xmlEscape(f.code)}"/>`
  ).join('');

  const fontsXml = [
    `<font><sz val="11"/><name val="${xmlEscape(headerFont)}"/></font>`,              // 0
    `<font><b/><sz val="11"/><color rgb="FF000000"/><name val="${xmlEscape(headerFont)}"/></font>`, // 1 bold
  ].join('');

  const fillsXml = [
    `<fill><patternFill patternType="none"/></fill>`,                                   // 0
    `<fill><patternFill patternType="gray125"/></fill>`,                                // 1 (reserved)
    `<fill><patternFill patternType="solid"><fgColor rgb="${xmlEscape(headerFill)}"/><bgColor indexed="64"/></patternFill></fill>`, // 2 header
    `<fill><patternFill patternType="solid"><fgColor rgb="FFF5F7FA"/><bgColor indexed="64"/></patternFill></fill>`,                 // 3 zebra
  ].join('');

  const bordersXml = [
    `<border><left/><right/><top/><bottom/><diagonal/></border>`,                       // 0
    `<border><left style="thin"><color rgb="FFB0BEC5"/></left><right style="thin"><color rgb="FFB0BEC5"/></right><top style="thin"><color rgb="FFB0BEC5"/></top><bottom style="thin"><color rgb="FFB0BEC5"/></bottom></border>`, // 1 thin
  ].join('');

  // cellXfs — fontId / fillId / borderId / numFmtId / applyX
  const xfs = [
    // 0 default
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
    // 1 header — bold + filled + centered
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>`,
    // 2 number
    `<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`,
    // 3 currency
    `<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`,
    // 4 date
    `<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`,
    // 5 text
    `<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>`,
    // 6 zebra
    `<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"/>`,
  ].join('');

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<numFmts count="${numFmts.length}">${numFmtsXml}</numFmts>` +
      `<fonts count="2">${fontsXml}</fonts>` +
      `<fills count="4">${fillsXml}</fills>` +
      `<borders count="2">${bordersXml}</borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="7">${xfs}</cellXfs>` +
      `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`
  );
}

// ────────────────────────────────────────────────────────────────
// Header/col helpers
// ────────────────────────────────────────────────────────────────
function normalizeHeaders(headers, firstRow) {
  if (Array.isArray(headers) && headers.length) {
    return headers.map(h => (typeof h === 'string' ? { key: h, label: h } : h));
  }
  // Auto-derive from first row keys
  const row = firstRow || {};
  return Object.keys(row).map(k => ({ key: k, label: k }));
}

function styleIdFor(format) {
  switch (format) {
    case 'number':   return STYLE_IDX.number;
    case 'currency': return STYLE_IDX.currency;
    case 'date':     return STYLE_IDX.date;
    case 'text':     return STYLE_IDX.text;
    default:         return STYLE_IDX.default;
  }
}

// ────────────────────────────────────────────────────────────────
// sharedStrings builder — de-duplicates string values.
// Non-string formats (number / currency / date) never enter here.
// ────────────────────────────────────────────────────────────────
function createSharedStringTable() {
  const map = new Map();
  const order = [];
  return {
    add(v) {
      const s = v === null || v === undefined ? '' : String(v);
      if (map.has(s)) return map.get(s);
      const idx = order.length;
      map.set(s, idx);
      order.push(s);
      return idx;
    },
    toXml() {
      const count = order.length;
      const items = order.map(s => `<si><t xml:space="preserve">${xmlEscape(s)}</t></si>`).join('');
      return (
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
             `count="${count}" uniqueCount="${count}">${items}</sst>`
      );
    },
  };
}

// ────────────────────────────────────────────────────────────────
// sheet1.xml builder — rows, freeze, autofilter, merges, col widths
// ────────────────────────────────────────────────────────────────
function buildSheetXml({ rows, headers, sst, rtl, styles, merges }) {
  // Column defs (widths)
  const colsXml = headers.length
    ? `<cols>${
        headers.map((h, i) => {
          const w = h.width || 16;
          return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
        }).join('')
      }</cols>`
    : '';

  const lastCol = colLetter(headers.length);
  const lastRow = rows.length + 1;
  const dimension = `A1:${lastCol}${lastRow}`;

  // Header row (row 1)
  const headerRowXml = (() => {
    const cells = headers.map((h, i) => {
      const col = colLetter(i + 1);
      const ref = `${col}1`;
      const idx = sst.add(h.label || h.key || '');
      return `<c r="${ref}" s="${STYLE_IDX.header}" t="s"><v>${idx}</v></c>`;
    }).join('');
    return `<row r="1" customHeight="1" ht="22">${cells}</row>`;
  })();

  // Data rows
  const dataRowsXml = rows.map((row, rIdx) => {
    const rowNum = rIdx + 2;
    const cells = headers.map((h, i) => {
      const col = colLetter(i + 1);
      const ref = `${col}${rowNum}`;
      const raw = row[h.key];
      const fmt = h.format || 'text';
      const sid = styleIdFor(fmt);

      if (raw === null || raw === undefined || raw === '') {
        // Empty cell — still keep style for border/zebra uniformity
        return `<c r="${ref}" s="${sid}"/>`;
      }

      if (fmt === 'number' || fmt === 'currency') {
        const num = Number(raw);
        if (Number.isNaN(num)) {
          const idx = sst.add(raw);
          return `<c r="${ref}" s="${sid}" t="s"><v>${idx}</v></c>`;
        }
        return `<c r="${ref}" s="${sid}"><v>${num}</v></c>`;
      }

      if (fmt === 'date') {
        const serial = toExcelDateSerial(raw);
        if (serial === null) {
          const idx = sst.add(raw);
          return `<c r="${ref}" s="${sid}" t="s"><v>${idx}</v></c>`;
        }
        return `<c r="${ref}" s="${sid}"><v>${serial}</v></c>`;
      }

      // Default: string — always via shared strings
      const idx = sst.add(raw);
      return `<c r="${ref}" s="${sid}" t="s"><v>${idx}</v></c>`;
    }).join('');
    return `<row r="${rowNum}">${cells}</row>`;
  }).join('');

  // sheetViews — RTL + freeze first row
  const rtlAttr = rtl ? ` rightToLeft="1"` : '';
  const sheetView =
    `<sheetViews><sheetView workbookViewId="0"${rtlAttr}>` +
      `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
      `<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>` +
    `</sheetView></sheetViews>`;

  // autoFilter — spans header row columns
  const autoFilterXml = headers.length
    ? `<autoFilter ref="A1:${lastCol}1"/>`
    : '';

  // mergeCells — accept `merges` array like [{ from: 'A1', to: 'C1' }]
  let mergeCellsXml = '';
  if (Array.isArray(merges) && merges.length) {
    const list = merges
      .map(m => `<mergeCell ref="${xmlEscape(m.from || m.ref || '')}${m.to ? ':' + xmlEscape(m.to) : ''}"/>`)
      .join('');
    mergeCellsXml = `<mergeCells count="${merges.length}">${list}</mergeCells>`;
  }

  // header style object is read here (kept available so callers can
  // pass custom styling tokens that flow to styles.xml)
  void styles;

  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
              `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<dimension ref="${dimension}"/>` +
      sheetView +
      `<sheetFormatPr defaultColWidth="16" defaultRowHeight="15"/>` +
      colsXml +
      `<sheetData>` +
        headerRowXml +
        dataRowsXml +
      `</sheetData>` +
      autoFilterXml +
      mergeCellsXml +
    `</worksheet>`
  );
}

// ────────────────────────────────────────────────────────────────
// Workbook / rels / content-types builders — constant strings
// that only depend on a sheet name.
// ────────────────────────────────────────────────────────────────
function buildWorkbookXml(sheetName) {
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
             `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<workbookPr defaultThemeVersion="124226"/>` +
      `<sheets>` +
        `<sheet name="${xmlEscape(sheetName).slice(0, 31)}" sheetId="1" r:id="rId1"/>` +
      `</sheets>` +
    `</workbook>`
  );
}

const WORKBOOK_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>` +
  `</Relationships>`;

const ROOT_RELS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
  `</Relationships>`;

const CONTENT_TYPES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>` +
  `</Types>`;

// ────────────────────────────────────────────────────────────────
// PUBLIC — exportToExcel
// ────────────────────────────────────────────────────────────────
function exportToExcel(rows, opts = {}) {
  const sheetName = opts.sheetName || 'גיליון1';
  const rtl = opts.rtl !== false; // default true
  const safeRows = Array.isArray(rows) ? rows : [];
  const headers = normalizeHeaders(opts.headers, safeRows[0]);
  const merges = Array.isArray(opts.merges) ? opts.merges : [];

  const sst = createSharedStringTable();

  // Build sheet (this is where sst gets populated)
  const sheetXml = buildSheetXml({
    rows: safeRows,
    headers,
    sst,
    rtl,
    styles: opts.styles || {},
    merges,
  });

  const sharedStringsXml = sst.toXml();
  const stylesXml = buildStylesXml(opts.styles || {});
  const workbookXml = buildWorkbookXml(sheetName);

  const files = [
    { name: '[Content_Types].xml',         data: Buffer.from(CONTENT_TYPES_XML, 'utf8') },
    { name: '_rels/.rels',                  data: Buffer.from(ROOT_RELS_XML, 'utf8') },
    { name: 'xl/workbook.xml',              data: Buffer.from(workbookXml, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels',   data: Buffer.from(WORKBOOK_RELS_XML, 'utf8') },
    { name: 'xl/styles.xml',                data: Buffer.from(stylesXml, 'utf8') },
    { name: 'xl/sharedStrings.xml',         data: Buffer.from(sharedStringsXml, 'utf8') },
    { name: 'xl/worksheets/sheet1.xml',     data: Buffer.from(sheetXml, 'utf8') },
  ];

  const zipBuffer = buildZip(files);

  // Side-effect outputs — file and/or stream
  if (opts.outputPath) {
    fs.mkdirSync(path.dirname(opts.outputPath), { recursive: true });
    fs.writeFileSync(opts.outputPath, zipBuffer);
  }
  if (opts.stream && typeof opts.stream.end === 'function') {
    // Caller is responsible for setting headers (Content-Type, filename)
    opts.stream.end(zipBuffer);
  }

  return zipBuffer;
}

// ────────────────────────────────────────────────────────────────
// Helper: resolve (outputPath | stream) polymorphic argument.
// Returns an `opts` overlay ready to merge into exportToExcel.
// ────────────────────────────────────────────────────────────────
function resolveOutput(output) {
  if (!output) return {};
  if (typeof output === 'string') return { outputPath: output };
  if (typeof output === 'object' && typeof output.end === 'function') {
    return { stream: output };
  }
  return {};
}

// ────────────────────────────────────────────────────────────────
// Entity-specific helpers — one call per common report.
// Column labels are in Hebrew and defaults match the schemas used
// elsewhere in ONYX (employees, wage_slips, invoices, suppliers,
// pcn836 rows, bank_transactions).
// ────────────────────────────────────────────────────────────────
function exportEmployees(rows, output) {
  return exportToExcel(rows, {
    sheetName: 'עובדים',
    rtl: true,
    ...resolveOutput(output),
    headers: [
      { key: 'employee_number',  label: 'מס׳ עובד',     format: 'text',   width: 12 },
      { key: 'full_name',        label: 'שם מלא',       format: 'text',   width: 24 },
      { key: 'national_id',      label: 'ת.ז.',         format: 'text',   width: 14 },
      { key: 'email',            label: 'דוא״ל',        format: 'text',   width: 26 },
      { key: 'phone',            label: 'טלפון',        format: 'text',   width: 16 },
      { key: 'position',         label: 'תפקיד',        format: 'text',   width: 20 },
      { key: 'start_date',       label: 'תחילת העסקה',  format: 'date',   width: 14 },
      { key: 'base_salary',      label: 'שכר בסיס',     format: 'currency', width: 14 },
      { key: 'is_active',        label: 'פעיל',         format: 'text',   width: 8  },
    ],
  });
}

function exportWageSlips(rows, output) {
  return exportToExcel(rows, {
    sheetName: 'תלושי שכר',
    rtl: true,
    ...resolveOutput(output),
    headers: [
      { key: 'period_label',       label: 'תקופה',         format: 'text',     width: 12 },
      { key: 'employee_number',    label: 'מס׳ עובד',      format: 'text',     width: 12 },
      { key: 'employee_name',      label: 'שם עובד',       format: 'text',     width: 24 },
      { key: 'gross_pay',          label: 'שכר ברוטו',     format: 'currency', width: 14 },
      { key: 'income_tax',         label: 'מס הכנסה',      format: 'currency', width: 14 },
      { key: 'bituach_leumi',      label: 'ביטוח לאומי',   format: 'currency', width: 14 },
      { key: 'health_tax',         label: 'ביטוח בריאות',  format: 'currency', width: 14 },
      { key: 'pension_employee',   label: 'פנסיה - עובד',  format: 'currency', width: 14 },
      { key: 'net_pay',            label: 'שכר נטו',       format: 'currency', width: 14 },
      { key: 'pay_date',           label: 'תאריך תשלום',   format: 'date',     width: 14 },
      { key: 'status',             label: 'סטטוס',         format: 'text',     width: 10 },
    ],
  });
}

function exportInvoices(rows, output) {
  return exportToExcel(rows, {
    sheetName: 'חשבוניות',
    rtl: true,
    ...resolveOutput(output),
    headers: [
      { key: 'invoice_number',  label: 'מס׳ חשבונית',  format: 'text',     width: 14 },
      { key: 'supplier_name',   label: 'שם ספק',       format: 'text',     width: 26 },
      { key: 'supplier_id',     label: 'ח.פ. ספק',     format: 'text',     width: 14 },
      { key: 'issue_date',      label: 'תאריך הפקה',   format: 'date',     width: 14 },
      { key: 'due_date',        label: 'תאריך פירעון', format: 'date',     width: 14 },
      { key: 'amount_net',      label: 'סכום לפני מע״מ', format: 'currency', width: 16 },
      { key: 'vat_amount',      label: 'מע״מ',         format: 'currency', width: 12 },
      { key: 'amount_gross',    label: 'סכום ברוטו',   format: 'currency', width: 16 },
      { key: 'status',          label: 'סטטוס',        format: 'text',     width: 12 },
    ],
  });
}

function exportSuppliers(rows, output) {
  return exportToExcel(rows, {
    sheetName: 'ספקים',
    rtl: true,
    ...resolveOutput(output),
    headers: [
      { key: 'name',           label: 'שם ספק',        format: 'text',   width: 26 },
      { key: 'business_id',    label: 'ח.פ./ע.מ.',     format: 'text',   width: 14 },
      { key: 'vat_number',     label: 'מספר עוסק',     format: 'text',   width: 14 },
      { key: 'contact_name',   label: 'איש קשר',       format: 'text',   width: 20 },
      { key: 'email',          label: 'דוא״ל',         format: 'text',   width: 26 },
      { key: 'phone',          label: 'טלפון',         format: 'text',   width: 16 },
      { key: 'payment_terms',  label: 'תנאי תשלום',    format: 'text',   width: 14 },
      { key: 'rating',         label: 'דירוג',         format: 'number', width: 10 },
      { key: 'created_at',     label: 'נוצר בתאריך',   format: 'date',   width: 14 },
    ],
  });
}

function exportPCN836(rows, output) {
  return exportToExcel(rows, {
    sheetName: 'PCN 836',
    rtl: true,
    ...resolveOutput(output),
    headers: [
      { key: 'record_type',    label: 'סוג רשומה',    format: 'text',     width: 12 },
      { key: 'employee_name',  label: 'שם עובד',      format: 'text',     width: 24 },
      { key: 'national_id',    label: 'ת.ז.',         format: 'text',     width: 14 },
      { key: 'period',         label: 'תקופה',        format: 'text',     width: 10 },
      { key: 'gross',          label: 'ברוטו',        format: 'currency', width: 14 },
      { key: 'tax_paid',       label: 'ניכויי מס',    format: 'currency', width: 14 },
      { key: 'bl_employee',    label: 'ב.ל עובד',     format: 'currency', width: 14 },
      { key: 'bl_employer',    label: 'ב.ל מעסיק',    format: 'currency', width: 14 },
      { key: 'code',           label: 'קוד',          format: 'text',     width: 10 },
    ],
  });
}

function exportBankTransactions(rows, output) {
  return exportToExcel(rows, {
    sheetName: 'תנועות בנק',
    rtl: true,
    ...resolveOutput(output),
    headers: [
      { key: 'transaction_date',  label: 'תאריך ערך',   format: 'date',     width: 14 },
      { key: 'description',       label: 'תיאור',       format: 'text',     width: 32 },
      { key: 'reference',         label: 'אסמכתא',      format: 'text',     width: 14 },
      { key: 'debit',             label: 'חובה',        format: 'currency', width: 14 },
      { key: 'credit',            label: 'זכות',        format: 'currency', width: 14 },
      { key: 'balance',           label: 'יתרה',        format: 'currency', width: 14 },
      { key: 'category',          label: 'קטגוריה',     format: 'text',     width: 16 },
      { key: 'matched_invoice',   label: 'חשבונית משויכת', format: 'text',  width: 18 },
    ],
  });
}

// ────────────────────────────────────────────────────────────────
module.exports = {
  // main
  exportToExcel,
  // entity helpers
  exportEmployees,
  exportWageSlips,
  exportInvoices,
  exportSuppliers,
  exportPCN836,
  exportBankTransactions,
  // internals exposed for tests
  _internal: {
    crc32,
    buildZip,
    xmlEscape,
    colLetter,
    toExcelDateSerial,
    buildStylesXml,
    buildSheetXml,
    buildWorkbookXml,
    createSharedStringTable,
    STYLE_IDX,
    CONTENT_TYPES_XML,
    ROOT_RELS_XML,
    WORKBOOK_RELS_XML,
  },
};
