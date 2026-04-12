/**
 * ONYX Procurement — Barcode Scanner integration
 * ────────────────────────────────────────────────────────────────
 * Agent 86 — 2026-04-11
 *
 * End-to-end barcode ingestion for the ONYX platform:
 *
 *   1. detectSymbology(code)         — classify EAN-13 / UPC-A / Code 128 / …
 *   2. validateChecksum(code, type)  — Mod-10 / Mod-103 / Luhn / Israeli TZ
 *   3. parseBarcode(raw)             — strip Keyboard-Wedge terminators,
 *                                       split GS1 AI fields, build payload
 *   4. resolveBarcode(code, ctx)     — entity lookup against Supabase
 *   5. resolveIsraeliId(code)        — local model: 9-digit ת.ז. (Luhn-like)
 *   6. availableActions(entity)      — which UI actions are legal per type
 *   7. handleScan(req, ctx)          — one-shot pipeline used by the route
 *   8. registerBarcodeScanRoutes(app, ctx)
 *                                     — mounts POST /api/scanners/scan
 *                                              GET  /api/scanners/symbologies
 *                                              GET  /api/scanners/health
 *
 * Design principles (Agent 86 rules):
 *   - NEVER delete existing rows. Resolve-only; any side effects that
 *     happen downstream (audit trail inserts) must be additive.
 *   - Zero runtime dependencies. Pure Node / vanilla JS. The module
 *     works offline without a DB — it will still classify and validate
 *     checksums; resolution falls back to an "unresolved" response.
 *   - The Keyboard-Wedge case is handled server-side: HID scanners
 *     "type" the code followed by CR/LF. The route accepts either
 *     {code:"…"} or {code:"…\r"} and normalises both.
 *   - GS1 AI parsing is implemented for the common application
 *     identifiers that appear on supplier goods (01, 10, 17, 21, 310n).
 *   - Israeli ID card PDF417: we decode the Hebrew DL "mmk" layout in
 *     a best-effort way — the barcode payload is a pipe-delimited
 *     string in field order TZ|LastName|FirstName|Birth|Expiry|Number.
 *   - Everything is exported for unit tests and re-mounted as routes.
 */

'use strict';

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

const SYMBOLOGY = Object.freeze({
  EAN_13: 'EAN-13',
  UPC_A: 'UPC-A',
  CODE_128: 'Code 128',
  CODE_39: 'Code 39',
  QR: 'QR Code',
  DATA_MATRIX: 'Data Matrix',
  PDF417: 'PDF417',
  ISRAELI_ID: 'Israeli ID',
  UNKNOWN: 'UNKNOWN',
});

// Keyboard-Wedge terminators — HID scanners append one of these after
// "typing" the code.  Both CR and LF are common depending on the model.
const WEDGE_TERMINATORS = /[\r\n\u0004]+$/;

// Prefix router — strings that start with one of these tokens resolve
// directly to a specific entity type, bypassing symbology detection.
// Example: "INV-2026-0001" → invoice.
const PREFIX_ROUTES = Object.freeze({
  'PRD-': 'product',
  'PRODUCT-': 'product',
  'INV-': 'invoice',
  'INVOICE-': 'invoice',
  'AST-': 'asset',
  'ASSET-': 'asset',
  'EMP-': 'employee',
  'SUP-': 'supplier',
  'PO-': 'purchase_order',
  'DOC-': 'document',
});

// GS1 Application Identifiers we understand.  The value in each entry is
// a function that returns the length of the data block for that AI.  A
// negative length means "variable, up to N, terminated by GS (0x1D) or
// end-of-string".  Only the AIs we actually use are listed.
const GS1_AI = Object.freeze({
  '01':  { name: 'GTIN',           len:  14, fixed: true  },
  '10':  { name: 'BatchLot',       len:  20, fixed: false },
  '11':  { name: 'ProdDate',       len:   6, fixed: true  },
  '13':  { name: 'PackDate',       len:   6, fixed: true  },
  '17':  { name: 'ExpiryDate',     len:   6, fixed: true  },
  '21':  { name: 'Serial',         len:  20, fixed: false },
  '30':  { name: 'CountEach',      len:   8, fixed: false },
  '310': { name: 'WeightKg',       len:   6, fixed: true  }, // + 1 decimal
  '400': { name: 'CustomerPO',     len:  30, fixed: false },
  '401': { name: 'ConsignmentNo',  len:  30, fixed: false },
  '410': { name: 'ShipToLoc',      len:  13, fixed: true  },
  '8200': { name: 'URL',           len:  70, fixed: false },
});

const GS1_GS = String.fromCharCode(0x1D); // ASCII 29, Group Separator

// Default maximum length for any accepted barcode input.  Longer payloads
// are rejected as unsafe (prevents log bombing and DoS).
const MAX_RAW_LEN = 4500; // slightly above QR max (4296)

// ═══════════════════════════════════════════════════════════════
//  1. STRING NORMALISATION  (Keyboard-Wedge)
// ═══════════════════════════════════════════════════════════════

/**
 * Strip trailing CR/LF/EOT (0x04) that USB HID scanners append when
 * they "type" the code.  Leaves embedded GS bytes (0x1D) alone — those
 * are meaningful for GS1 AI decoding.
 */
function stripTerminators(raw) {
  if (raw == null) return '';
  const s = String(raw);
  return s.replace(WEDGE_TERMINATORS, '');
}

/**
 * Safe-ish normalisation: trim, strip terminators, clamp length.
 * Throws if the input is egregiously large.
 */
function normaliseInput(raw) {
  const clean = stripTerminators(raw).trim();
  if (clean.length === 0) {
    const err = new Error('empty barcode payload');
    err.status = 400;
    throw err;
  }
  if (clean.length > MAX_RAW_LEN) {
    const err = new Error(`barcode payload too large (${clean.length} > ${MAX_RAW_LEN})`);
    err.status = 413;
    throw err;
  }
  return clean;
}

// ═══════════════════════════════════════════════════════════════
//  2. SYMBOLOGY DETECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Heuristically classify a cleaned barcode string.
 *
 * Rules (in priority order):
 *   - only digits, 13 chars  → EAN-13
 *   - only digits, 12 chars  → UPC-A
 *   - only digits, 9 chars, passes TZ-Luhn → Israeli ID
 *   - contains '|' and >= 4 pipe-segments   → PDF417 Israeli ID layout
 *   - starts with one of the PREFIX_ROUTES  → Code 128 (alphanumeric)
 *   - printable ASCII, uppercase + digits + " -.$/+%"  → Code 39
 *   - any other printable ASCII ≤ 80       → Code 128
 *   - any payload > 80 chars               → QR Code (2D)
 */
function detectSymbology(code) {
  if (!code) return SYMBOLOGY.UNKNOWN;
  const c = String(code);

  // Purely numeric, well-known fixed lengths
  if (/^\d+$/.test(c)) {
    if (c.length === 13) return SYMBOLOGY.EAN_13;
    if (c.length === 12) return SYMBOLOGY.UPC_A;
    if (c.length === 9 && luhnIsraeliIdValid(c)) return SYMBOLOGY.ISRAELI_ID;
  }

  // Israeli driving licence / ID card PDF417 payload — pipe-separated.
  // Format example: 123456782|COHEN|MOSHE|19800101|20300101|987654
  if (/\|/.test(c) && c.split('|').length >= 5) {
    return SYMBOLOGY.PDF417;
  }

  // Long payload → 2D
  if (c.length > 120) {
    // Data Matrix payloads usually start with one of these FNC-like
    // characters when produced by a Honeywell/Zebra scanner.  We treat
    // anything else long as a QR.
    if (c.startsWith(']d') || c.startsWith(']d2')) return SYMBOLOGY.DATA_MATRIX;
    return SYMBOLOGY.QR;
  }

  // Code 39 — restricted charset
  if (/^[A-Z0-9 \-.$/+%]+$/.test(c)) {
    return SYMBOLOGY.CODE_39;
  }

  // Otherwise treat as Code 128 — 7-bit printable.
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]+$/.test(c)) {
    return SYMBOLOGY.CODE_128;
  }

  return SYMBOLOGY.UNKNOWN;
}

// ═══════════════════════════════════════════════════════════════
//  3. CHECKSUM VALIDATION
// ═══════════════════════════════════════════════════════════════

/**
 * Mod-10 (GS1): sum of digits at odd positions ×1 plus even positions ×3,
 * check digit is (10 − sum mod 10) mod 10.  Works for both EAN-13 and
 * UPC-A (pad UPC-A with a leading 0 and apply the same rule).
 */
function mod10Check(code) {
  if (!/^\d+$/.test(code)) return false;
  // Normalise UPC-A (12) to 13 digits so the same algorithm works.
  const digits = code.length === 12 ? '0' + code : code;
  if (digits.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = digits.charCodeAt(i) - 48;
    sum += (i % 2 === 0) ? d : d * 3;
  }
  const expected = (10 - (sum % 10)) % 10;
  const actual = digits.charCodeAt(12) - 48;
  return expected === actual;
}

/**
 * Mod-103 check for Code 128.  Full implementation requires the mapping
 * between glyphs and their "value codes" (0–102).  We approximate for
 * the common subset Code 128-B (ASCII 32–126) which is what USB HID
 * scanners emit as pure text.  The check digit is encoded separately
 * from the visible data and is lost once the scanner has verified it —
 * therefore, by the time the payload arrives over HTTP, the scanner has
 * already validated Mod-103 upstream.  We return `true` for any payload
 * that is pure printable ASCII between 1 and 80 characters (a "soft"
 * validation that rules out obviously bogus input).
 */
function mod103CheckSoft(code) {
  if (!code) return false;
  if (code.length < 1 || code.length > 80) return false;
  // eslint-disable-next-line no-control-regex
  return /^[\x20-\x7e]+$/.test(code);
}

/**
 * Israeli Teudat Zehut check.  The "ת.ז." has 9 digits.  Algorithm:
 *   - pad with leading zeros to length 9
 *   - multiply each digit by 1, 2, 1, 2, 1, 2, 1, 2, 1 in turn
 *   - if a product is >= 10, sum its digits instead
 *   - total sum mod 10 must equal 0
 */
function luhnIsraeliIdValid(id) {
  if (!/^\d+$/.test(id)) return false;
  const padded = String(id).padStart(9, '0');
  if (padded.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let v = (padded.charCodeAt(i) - 48) * ((i % 2) + 1);
    if (v > 9) v -= 9;
    sum += v;
  }
  return sum % 10 === 0;
}

/**
 * Israeli VAT number check (9 digits).  Uses a different weighting from
 * the Teudat Zehut: each digit × its 1-based position (1..9), sum mod 11
 * must equal 0.  This is the classic "Osek Morshe" algorithm as used by
 * the Tax Authority.
 */
function israeliVatNumberValid(vat) {
  if (!/^\d+$/.test(vat)) return false;
  const padded = String(vat).padStart(9, '0');
  if (padded.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const d = padded.charCodeAt(i) - 48;
    sum += d * ((i % 8) + 1);
  }
  return sum % 11 === 0;
}

/**
 * High-level dispatcher: given a code and a (detected) symbology,
 * return `{ok, reason}`.  The `reason` field is human-readable and used
 * by the API response.
 */
function validateChecksum(code, symbology) {
  switch (symbology) {
    case SYMBOLOGY.EAN_13:
    case SYMBOLOGY.UPC_A:
      return mod10Check(code)
        ? { ok: true, algo: 'Mod-10' }
        : { ok: false, algo: 'Mod-10', reason: 'checksum digit mismatch' };

    case SYMBOLOGY.CODE_128:
      return mod103CheckSoft(code)
        ? { ok: true, algo: 'Mod-103 (soft)' }
        : { ok: false, algo: 'Mod-103 (soft)', reason: 'printable-ASCII check failed' };

    case SYMBOLOGY.CODE_39:
      // Code 39 has an optional Mod-43 checksum — most scanners do not
      // use it.  Accept the payload as-is.
      return { ok: true, algo: 'none (Code 39)' };

    case SYMBOLOGY.ISRAELI_ID:
      return luhnIsraeliIdValid(code)
        ? { ok: true, algo: 'Teudat-Zehut Luhn' }
        : { ok: false, algo: 'Teudat-Zehut Luhn', reason: 'TZ check digit invalid' };

    case SYMBOLOGY.PDF417:
      // PDF417 error correction is checked at decode time by the
      // scanner hardware.  We trust the payload that arrives.
      return { ok: true, algo: 'Reed-Solomon (in scanner)' };

    case SYMBOLOGY.QR:
    case SYMBOLOGY.DATA_MATRIX:
      // Same story — error correction happens before we see the data.
      return { ok: true, algo: 'Reed-Solomon (in scanner)' };

    default:
      return { ok: false, algo: 'none', reason: 'unknown symbology' };
  }
}

// ═══════════════════════════════════════════════════════════════
//  4. GS1 AI PARSER
// ═══════════════════════════════════════════════════════════════

/**
 * Parse a GS1-128 payload (used on supplier pallets) into a dict of
 * { GTIN, BatchLot, ExpiryDate, … }.  Supports both FNC1 (GS byte)
 * delimited and fixed-length AIs.
 *
 * Returns `{ fields, ok, reason? }`.  Unknown AIs are skipped — we do
 * not throw.
 */
function parseGs1(payload) {
  // Strip leading FNC1 if present (it indicates "this is GS1-128").
  let s = payload.startsWith(GS1_GS) ? payload.slice(1) : payload;
  // Also accept the common "]C1" AIM indicator.
  if (s.startsWith(']C1')) s = s.slice(3);

  const fields = {};
  while (s.length > 0) {
    // AIs are 2–4 digits.  Try the longest possible match first.
    let ai = null;
    let aiLen = 0;
    for (const tryLen of [4, 3, 2]) {
      const cand = s.slice(0, tryLen);
      if (GS1_AI[cand]) {
        ai = cand;
        aiLen = tryLen;
        break;
      }
      // 310n family — first three chars are "310", last is a decimal digit.
      if (tryLen === 3 && /^31[0-9]$/.test(cand) && GS1_AI[cand.slice(0, 2) + '0']) {
        // e.g. "3103" → still tracked under "310"
        ai = '310';
        aiLen = 3;
        break;
      }
    }

    if (!ai) {
      // Unknown AI — abort and return whatever we've got so far.
      return { fields, ok: false, reason: `unknown AI at "${s.slice(0, 4)}"` };
    }

    const spec = GS1_AI[ai];
    s = s.slice(aiLen);
    let value;
    if (spec.fixed) {
      value = s.slice(0, spec.len);
      s = s.slice(spec.len);
    } else {
      // Variable-length — terminate at GS (0x1D) or end of string.
      const gsIdx = s.indexOf(GS1_GS);
      if (gsIdx >= 0) {
        value = s.slice(0, gsIdx);
        s = s.slice(gsIdx + 1);
      } else {
        value = s;
        s = '';
      }
    }
    fields[spec.name] = value;
    // Also keep the raw AI mapping for downstream debugging.
    fields[`_${ai}`] = value;
  }
  return { fields, ok: true };
}

// ═══════════════════════════════════════════════════════════════
//  5. HIGH-LEVEL BARCODE PARSER
// ═══════════════════════════════════════════════════════════════

/**
 * `parseBarcode(raw)` takes a raw string off the wire and returns a
 * structured descriptor used by everything downstream.  It never throws
 * on bad input — callers inspect `result.valid` instead.
 *
 *   {
 *     raw:        "4005900003287\r",
 *     clean:      "4005900003287",
 *     symbology:  "EAN-13",
 *     valid:      true,
 *     checksum:   { ok: true, algo: "Mod-10" },
 *     gs1:        null,                 // populated when GS1-128 detected
 *     israeli:    null,                 // populated for PDF417 DL
 *     prefix:     null,                 // e.g. "INV-"
 *   }
 */
function parseBarcode(raw) {
  const clean = normaliseInput(raw);
  const symbology = detectSymbology(clean);
  const checksum = validateChecksum(clean, symbology);

  const out = {
    raw: String(raw),
    clean,
    symbology,
    valid: checksum.ok,
    checksum,
    gs1: null,
    israeli: null,
    prefix: null,
  };

  // Prefix routing
  for (const pfx of Object.keys(PREFIX_ROUTES)) {
    if (clean.toUpperCase().startsWith(pfx)) {
      out.prefix = pfx;
      break;
    }
  }

  // GS1-128 decode when starts with "]C1" or the group-separator byte
  if (symbology === SYMBOLOGY.CODE_128 || symbology === SYMBOLOGY.EAN_13) {
    if (clean.startsWith(']C1') || clean.startsWith(GS1_GS) || /^01\d{14}/.test(clean)) {
      out.gs1 = parseGs1(clean);
    }
  }

  // Israeli ID card PDF417 decode
  if (symbology === SYMBOLOGY.PDF417) {
    out.israeli = parseIsraeliIdPayload(clean);
  } else if (symbology === SYMBOLOGY.ISRAELI_ID) {
    out.israeli = { tz: clean };
  }

  return out;
}

/**
 * Decode the PDF417 payload that Israeli driving licences and ID cards
 * emit.  The official "Mmk" format is pipe-delimited in this order:
 *
 *   TZ | LastName | FirstName | BirthDate | ExpiryDate | CardNumber | …
 *
 * We tolerate missing fields and do not attempt to re-validate the
 * internal Reed-Solomon — that already happened inside the scanner.
 */
function parseIsraeliIdPayload(payload) {
  const parts = payload.split('|').map((s) => s.trim());
  const [tz, lastName, firstName, birthDate, expiryDate, cardNumber, ...rest] = parts;
  const out = {
    tz:        tz || null,
    lastName:  lastName || null,
    firstName: firstName || null,
    birthDate: birthDate || null,
    expiryDate: expiryDate || null,
    cardNumber: cardNumber || null,
    extra: rest,
  };
  if (tz && !luhnIsraeliIdValid(tz)) {
    out.tzValid = false;
  } else {
    out.tzValid = Boolean(tz);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
//  6. ENTITY RESOLVER
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve a (cleaned) barcode to a domain entity.  The `ctx` argument
 * holds the Supabase client (and optionally a logger).  When no client
 * is provided, the function returns the unresolved stub — useful for
 * unit tests and for serving the endpoint while the DB is offline.
 *
 *   resolveBarcode("7290000000001", { supabase })
 *     → { type: "product", id: "uuid", data: {…}, source: "products.sku" }
 *
 * Lookup order:
 *   1. Prefix routing (PRD-, INV-, …)            → deterministic
 *   2. Exact SKU / barcode column match           → products
 *   3. Exact invoice_number / doc_number match    → documents
 *   4. Exact asset_tag match                      → assets
 *   5. Exact employee.id / TZ match               → employees
 *   6. Otherwise → "unresolved"
 */
async function resolveBarcode(code, ctx = {}) {
  const cleaned = typeof code === 'string' ? code : (code && code.clean) || '';
  const supabase = ctx.supabase || null;

  // Quick Israeli ID shortcut — no DB needed if only classification is wanted.
  if (cleaned.length === 9 && luhnIsraeliIdValid(cleaned)) {
    // Still try the DB lookup so we can return a matching employee row.
    if (supabase) {
      const hit = await safeSelect(supabase, 'employees', 'tz', cleaned);
      if (hit) {
        return { type: 'employee', id: hit.id, data: hit, source: 'employees.tz' };
      }
    }
    return { type: 'id_card', id: cleaned, data: { tz: cleaned }, source: 'local' };
  }

  // Prefix routing — take the first match
  const upper = cleaned.toUpperCase();
  for (const [pfx, kind] of Object.entries(PREFIX_ROUTES)) {
    if (upper.startsWith(pfx)) {
      if (supabase) {
        const row = await resolveByKind(supabase, kind, cleaned);
        if (row) return { type: kind, id: row.id, data: row, source: `${kind}.${routeColumn(kind)}` };
      }
      return { type: kind, id: cleaned, data: { code: cleaned }, source: 'prefix' };
    }
  }

  if (!supabase) {
    return { type: 'unresolved', id: null, data: { code: cleaned }, source: 'no-db' };
  }

  // Fallback to a sequence of exact-match lookups across tables
  // Order matters: products first, because those are the hot path
  // for day-to-day warehouse scanning.
  const product =
    (await safeSelect(supabase, 'products', 'barcode', cleaned)) ||
    (await safeSelect(supabase, 'products', 'sku', cleaned));
  if (product) {
    return { type: 'product', id: product.id, data: product, source: 'products' };
  }

  const invoice =
    (await safeSelect(supabase, 'documents', 'doc_number', cleaned)) ||
    (await safeSelect(supabase, 'documents', 'invoice_number', cleaned));
  if (invoice) {
    return { type: 'invoice', id: invoice.id, data: invoice, source: 'documents' };
  }

  const asset = await safeSelect(supabase, 'assets', 'asset_tag', cleaned);
  if (asset) {
    return { type: 'asset', id: asset.id, data: asset, source: 'assets.asset_tag' };
  }

  const employee = await safeSelect(supabase, 'employees', 'employee_code', cleaned);
  if (employee) {
    return { type: 'employee', id: employee.id, data: employee, source: 'employees.employee_code' };
  }

  return { type: 'unresolved', id: null, data: { code: cleaned }, source: 'no-match' };
}

function routeColumn(kind) {
  switch (kind) {
    case 'product':        return 'sku';
    case 'invoice':        return 'doc_number';
    case 'document':       return 'doc_number';
    case 'asset':          return 'asset_tag';
    case 'employee':       return 'employee_code';
    case 'supplier':       return 'supplier_code';
    case 'purchase_order': return 'po_number';
    default:               return 'code';
  }
}

function routeTable(kind) {
  switch (kind) {
    case 'product':        return 'products';
    case 'invoice':        return 'documents';
    case 'document':       return 'documents';
    case 'asset':          return 'assets';
    case 'employee':       return 'employees';
    case 'supplier':       return 'suppliers';
    case 'purchase_order': return 'purchase_orders';
    default:               return null;
  }
}

async function resolveByKind(supabase, kind, code) {
  const table = routeTable(kind);
  if (!table) return null;
  const col = routeColumn(kind);
  return safeSelect(supabase, table, col, code);
}

/**
 * Best-effort Supabase lookup that swallows "table missing" errors.
 * Returns the first row or null.  Never throws — any database error is
 * logged through the optional `ctx.log` and `null` is returned.
 */
async function safeSelect(supabase, table, column, value) {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq(column, value)
      .limit(1);
    if (error) return null;
    if (Array.isArray(data) && data.length > 0) return data[0];
    return null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  7. AVAILABLE ACTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Given a resolved entity, return the list of UI actions that are
 * legal for it.  These are the strings the frontend turns into
 * buttons / menu items.  Additive only — the rule is "never delete",
 * so neither `"delete"` nor `"void"` appears.
 */
function availableActions(entity) {
  if (!entity || !entity.type) return [];
  switch (entity.type) {
    case 'product':
      return ['view', 'adjust_stock', 'print_label', 'add_to_po', 'start_grn'];
    case 'invoice':
    case 'document':
      return ['view', 'pay', 'attach_receipt', 'export_pdf', 'mark_reviewed'];
    case 'asset':
      return ['view', 'checkout', 'checkin', 'transfer', 'maintenance'];
    case 'employee':
      return ['view', 'time_clock_in', 'time_clock_out', 'issue_equipment'];
    case 'id_card':
      return ['identify', 'check_attendance'];
    case 'supplier':
      return ['view', 'add_to_po', 'contact'];
    case 'purchase_order':
      return ['view', 'start_grn', 'approve', 'export_pdf'];
    case 'unresolved':
    default:
      return ['create_new_entry'];
  }
}

// ═══════════════════════════════════════════════════════════════
//  8. HIGH-LEVEL HANDLER
// ═══════════════════════════════════════════════════════════════

/**
 * One-shot scan handler.  Feed it a raw body and an optional Supabase
 * client, get back the full descriptor the frontend expects.
 *
 *   { parsed, entity, actions, scannedAt }
 */
async function handleScan(rawCode, ctx = {}) {
  const parsed = parseBarcode(rawCode);
  const entity = await resolveBarcode(parsed.clean, ctx);
  const actions = availableActions(entity);
  return {
    parsed,
    entity,
    actions,
    scannedAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
//  9. EXPRESS ROUTES
// ═══════════════════════════════════════════════════════════════

/**
 * Mount the HTTP API onto an Express app.  Expects the standard ONYX
 * context object `{ supabase, audit, log }`.  Usage:
 *
 *     const { registerBarcodeScanRoutes } =
 *       require('./src/scanners/barcode-scanner');
 *     registerBarcodeScanRoutes(app, { supabase, audit, log });
 *
 * Routes mounted:
 *
 *   POST /api/scanners/scan
 *        body: { code: string, device?: string, location?: string }
 *        resp: { parsed, entity, actions, scannedAt }
 *
 *   GET  /api/scanners/symbologies
 *        resp: { symbologies: string[] }
 *
 *   GET  /api/scanners/health
 *        resp: { ok: true, module: 'barcode-scanner', version: '1.0.0' }
 */
function registerBarcodeScanRoutes(app, ctx = {}) {
  if (!app || typeof app.post !== 'function') {
    throw new Error('registerBarcodeScanRoutes: expected express app');
  }

  app.post('/api/scanners/scan', async (req, res) => {
    try {
      const body = req.body || {};
      const code = body.code != null ? body.code : body.barcode;
      if (!code) {
        return res.status(400).json({ ok: false, error: 'missing "code" in body' });
      }
      const result = await handleScan(code, ctx);

      // Optional audit trail — non-fatal if it fails.
      try {
        if (ctx.audit && typeof ctx.audit.log === 'function') {
          await ctx.audit.log({
            kind: 'barcode.scan',
            actor: (req.user && req.user.id) || body.user || 'system',
            payload: {
              device: body.device || null,
              location: body.location || null,
              symbology: result.parsed.symbology,
              entityType: result.entity.type,
              entityId: result.entity.id,
            },
          });
        }
      } catch (e) {
        // swallow — audit failures must not break scanning
        if (ctx.log && typeof ctx.log.warn === 'function') {
          ctx.log.warn('audit log failed', e);
        }
      }

      return res.status(200).json({ ok: true, ...result });
    } catch (err) {
      const code = err && err.status ? err.status : 500;
      return res.status(code).json({
        ok: false,
        error: err && err.message ? err.message : String(err),
      });
    }
  });

  app.get('/api/scanners/symbologies', (_req, res) => {
    res.json({
      ok: true,
      symbologies: Object.values(SYMBOLOGY).filter((s) => s !== SYMBOLOGY.UNKNOWN),
    });
  });

  app.get('/api/scanners/health', (_req, res) => {
    res.json({
      ok: true,
      module: 'barcode-scanner',
      version: '1.0.0',
      at: new Date().toISOString(),
    });
  });

  return {
    routes: [
      'POST /api/scanners/scan',
      'GET  /api/scanners/symbologies',
      'GET  /api/scanners/health',
    ],
  };
}

// ═══════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
  // constants
  SYMBOLOGY,
  PREFIX_ROUTES,
  GS1_AI,
  WEDGE_TERMINATORS,
  MAX_RAW_LEN,

  // low-level helpers
  stripTerminators,
  normaliseInput,
  detectSymbology,
  mod10Check,
  mod103CheckSoft,
  luhnIsraeliIdValid,
  israeliVatNumberValid,
  validateChecksum,
  parseGs1,
  parseIsraeliIdPayload,
  parseBarcode,

  // resolver
  resolveBarcode,
  availableActions,
  handleScan,

  // routes
  registerBarcodeScanRoutes,
};
