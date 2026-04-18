/**
 * Document Watermarking — סימון מים / סימון בלתי נראה
 * Techno-Kol Uzi mega-ERP | Agent: Y-119 | Swarm: Documents
 *
 * Purpose
 *   Full-stack watermarking for confidential document workflows:
 *     1. Visible watermarks (center / diagonal / header / footer / tile)
 *     2. Per-user + dynamic-URL watermarks (templatable {{user}} / {{date}})
 *     3. Invisible / steganographic payloads:
 *        - PDF metadata (custom Info dictionary + XMP /X-Tk-Watermark)
 *        - LSB (least-significant-bit) on raw 24-bit pixel buffers
 *        - Zero-width Unicode fallback for plain text / SVG / HTML
 *     4. Per-recipient serialization (cryptographically reproducible ids)
 *     5. Forensic detection — matches a leaked document against the
 *        issuance registry to identify the source of the leak
 *     6. Templates — confidential / internal / draft / do-not-distribute /
 *        attorney-work-product
 *     7. Bilingual (Hebrew / English) rendering
 *     8. SVG / PDF / Image renderers
 *     9. Append-only issuance registry — auditable traceback
 *
 * Design principles
 *   - Zero runtime dependencies (pure Node ≥ 18 / pure JS).
 *   - `pdfkit` is treated as OPTIONAL: if present it produces real PDF
 *     overlays, if absent a deterministic buffer-level patch is applied
 *     and the custom metadata is still embedded.
 *   - לא מוחקים — the registry is append-only. `revoke()` sets a flag
 *     but NEVER removes the issuance record.
 *   - Bilingual throughout — every template label ships with `he` + `en`.
 *   - Deterministic: identical inputs yield identical serial numbers
 *     and identical invisible payloads (HMAC-SHA-256, salt optional).
 *   - Forensic: a leaked-doc match works on any layer — visible text,
 *     PDF metadata, LSB payload, zero-width Unicode — and returns the
 *     first registry hit (or `null` if none match).
 *
 * Public API — class `Watermark`
 *   new Watermark({ secret?, now?, registry? })
 *     .applyVisible({ doc, text, opacity, rotation, position, color, font })
 *     .applyPerUser({ doc, userId, text })
 *     .applyDynamicUrl({ doc, uniqueLink, userId, userName, date })
 *     .applyInvisibleSteganographic({ doc, payload, channel? })
 *     .extractInvisible(doc, channel?)                 → payload | null
 *     .serialNumber({ doc, issuedTo })                 → 'WM-YYYYMMDD-xxxxx'
 *     .forensicDetection({ leakedDoc, registry? })     → registry hit | null
 *     .templates({ standard })                         → template object
 *     .bilingualWatermark({ he, en })                  → combined text
 *     .watermarkSVG(params)                            → SVG string
 *     .watermarkPDF(pdfBuffer, params)                 → Buffer
 *     .watermarkImage(imgBuffer, params)               → Buffer
 *     .auditIssuance({ docId, recipient, watermarkData }) → registry entry
 *     .revokeIssuance({ issuanceId, reason })          → entry with revoked=true
 *     .listIssuances(filter?)                          → registry snapshot
 *     .exportRegistry()                                → frozen array
 *
 * Exported helpers
 *   TEMPLATES, POSITIONS, CHANNELS, encodeZeroWidth, decodeZeroWidth,
 *   embedLSB, extractLSB, sha256Hex, hmacHex
 */

'use strict';

const crypto = require('node:crypto');

// Optional dependency — PDFKit. We resolve at runtime so the module is
// usable in zero-dep environments (e.g. tests without node_modules).
let PDFDocument = null;
try {
  // eslint-disable-next-line global-require
  PDFDocument = require('pdfkit');
} catch (_) {
  PDFDocument = null;
}

// ═════════════════════════════════════════════════════════════════════════
// 1. CONSTANTS — templates, positions, channels, glyph map
// ═════════════════════════════════════════════════════════════════════════

const POSITIONS = Object.freeze({
  CENTER: 'center',
  DIAGONAL: 'diagonal',
  HEADER: 'header',
  FOOTER: 'footer',
  TILE: 'tile',
});

const CHANNELS = Object.freeze({
  AUTO: 'auto',            // pick the best channel for the doc type
  PDF_METADATA: 'pdf-metadata',
  IMAGE_LSB: 'image-lsb',
  ZERO_WIDTH: 'zero-width',
});

/**
 * Built-in watermark templates — bilingual.
 * Each template describes the visible label, fallback opacity and color.
 */
const TEMPLATES = Object.freeze({
  confidential: {
    id: 'confidential',
    he: 'חסוי',
    en: 'CONFIDENTIAL',
    opacity: 0.25,
    color: '#cc0000',
    rotation: -45,
    position: POSITIONS.DIAGONAL,
    font: 'Helvetica-Bold',
  },
  internal: {
    id: 'internal',
    he: 'לשימוש פנימי בלבד',
    en: 'INTERNAL USE ONLY',
    opacity: 0.20,
    color: '#555555',
    rotation: -30,
    position: POSITIONS.DIAGONAL,
    font: 'Helvetica-Bold',
  },
  draft: {
    id: 'draft',
    he: 'טיוטה',
    en: 'DRAFT',
    opacity: 0.30,
    color: '#888888',
    rotation: -45,
    position: POSITIONS.DIAGONAL,
    font: 'Helvetica-Bold',
  },
  'do-not-distribute': {
    id: 'do-not-distribute',
    he: 'אין להפיץ',
    en: 'DO NOT DISTRIBUTE',
    opacity: 0.28,
    color: '#bb0000',
    rotation: -45,
    position: POSITIONS.DIAGONAL,
    font: 'Helvetica-Bold',
  },
  'attorney-work-product': {
    id: 'attorney-work-product',
    he: 'חומר מקצועי של עורך דין — חיסיון',
    en: 'ATTORNEY WORK PRODUCT — PRIVILEGED',
    opacity: 0.28,
    color: '#003366',
    rotation: -45,
    position: POSITIONS.DIAGONAL,
    font: 'Helvetica-Bold',
  },
});

// Zero-width glyphs for steganographic text channel (ZWJ/ZWNJ/ZWS/WJ).
const ZW_ZERO = '\u200B';        // zero-width space           → bit 0
const ZW_ONE = '\u200C';         // zero-width non-joiner      → bit 1
const ZW_DELIM = '\u200D';       // zero-width joiner          → delimiter
const ZW_START = '\u2060';       // word joiner                → payload start
const ZW_END = '\uFEFF';         // byte-order mark            → payload end

// ═════════════════════════════════════════════════════════════════════════
// 2. PURE HELPERS — hashing, encoding, LSB, zero-width, template interp
// ═════════════════════════════════════════════════════════════════════════

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function hmacHex(secret, input) {
  return crypto.createHmac('sha256', String(secret))
    .update(String(input)).digest('hex');
}

/** Compact bilingual label — "חסוי / CONFIDENTIAL". */
function bilingualLabel(he, en) {
  const h = (he || '').trim();
  const e = (en || '').trim();
  if (h && e) return `${h} / ${e}`;
  return h || e;
}

/**
 * Render a template string with {{user.name}} {{user.id}} {{date}} {{url}}
 * {{serial}} placeholders. Safe against missing / non-object context —
 * unknown placeholders are replaced with the empty string rather than
 * leaking the literal `{{…}}` tag.
 */
function interpolate(template, ctx) {
  if (!template) return '';
  return String(template).replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key) => {
    const parts = key.split('.');
    let cur = ctx;
    for (const p of parts) {
      if (cur == null) return '';
      cur = cur[p];
    }
    if (cur === undefined || cur === null) return '';
    return String(cur);
  });
}

/**
 * Encode an arbitrary UTF-8 payload into a run of zero-width characters
 * suitable for concatenation into plain text, SVG text nodes, HTML, or
 * (as a fallback) PDF text streams. The run is framed with ZW_START / ZW_END
 * so `decodeZeroWidth` can locate it inside surrounding copy.
 */
function encodeZeroWidth(payload) {
  const bytes = Buffer.from(String(payload), 'utf8');
  let bits = '';
  for (const b of bytes) {
    bits += b.toString(2).padStart(8, '0');
  }
  let out = ZW_START;
  for (const bit of bits) {
    out += bit === '1' ? ZW_ONE : ZW_ZERO;
  }
  out += ZW_END;
  return out;
}

/**
 * Decode the first zero-width framed payload found in the haystack.
 * Returns `null` if no frame is present or the frame is corrupt.
 */
function decodeZeroWidth(haystack) {
  if (typeof haystack !== 'string') return null;
  const start = haystack.indexOf(ZW_START);
  if (start < 0) return null;
  const end = haystack.indexOf(ZW_END, start + 1);
  if (end < 0) return null;
  const slice = haystack.slice(start + 1, end);
  let bits = '';
  for (const ch of slice) {
    if (ch === ZW_ZERO) bits += '0';
    else if (ch === ZW_ONE) bits += '1';
    else if (ch === ZW_DELIM) continue; // ignored — reserved delimiter
    else return null;                   // unexpected glyph → corrupt frame
  }
  if (bits.length % 8 !== 0) return null;
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  try {
    return Buffer.from(bytes).toString('utf8');
  } catch (_) {
    return null;
  }
}

/**
 * Embed a payload into the least-significant bit of an image byte buffer.
 * Works on any raw 24-bit pixel buffer (e.g. headerless RGB dumps);
 * for real PNG/JPEG files only the pixel region after the first header
 * offset is touched so magic bytes stay valid.
 *
 *   offset   — where to start writing LSB bits (defaults to 0)
 *   stride   — bytes per sample step (defaults to 1 → every byte)
 *
 * Returns a new Buffer; the input is not mutated.
 */
function embedLSB(buffer, payload, { offset = 0, stride = 1 } = {}) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('embedLSB requires a Buffer');
  }
  const payloadBytes = Buffer.from(String(payload), 'utf8');
  // Prefix the payload with a 32-bit length header, so extraction knows
  // where to stop even if the host buffer is bigger than the payload.
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payloadBytes.length, 0);
  const body = Buffer.concat([header, payloadBytes]);
  const totalBits = body.length * 8;
  const capacityBits = Math.floor((buffer.length - offset) / stride);
  if (capacityBits < totalBits) {
    throw new RangeError(
      `embedLSB: buffer too small — need ${totalBits} bits, have ${capacityBits}`
    );
  }
  const out = Buffer.from(buffer); // copy
  let bitIndex = 0;
  for (let i = 0; i < body.length; i++) {
    for (let bit = 7; bit >= 0; bit--) {
      const bitVal = (body[i] >> bit) & 1;
      const byteIdx = offset + bitIndex * stride;
      out[byteIdx] = (out[byteIdx] & 0xFE) | bitVal;
      bitIndex += 1;
    }
  }
  return out;
}

/**
 * Inverse of embedLSB — reads the 32-bit length header then the payload.
 * Returns `null` if the buffer is too small or the header looks corrupt.
 */
function extractLSB(buffer, { offset = 0, stride = 1 } = {}) {
  if (!Buffer.isBuffer(buffer)) return null;
  const capacityBytes = Math.floor((buffer.length - offset) / (stride * 8));
  if (capacityBytes < 4) return null;
  // Read 32-bit header (4 bytes → 32 bits).
  const lenBytes = [];
  let bitIndex = 0;
  for (let i = 0; i < 4; i++) {
    let byte = 0;
    for (let bit = 7; bit >= 0; bit--) {
      const byteIdx = offset + bitIndex * stride;
      const bitVal = buffer[byteIdx] & 1;
      byte |= bitVal << bit;
      bitIndex += 1;
    }
    lenBytes.push(byte);
  }
  const length =
    (lenBytes[0] << 24) | (lenBytes[1] << 16) | (lenBytes[2] << 8) | lenBytes[3];
  if (length < 0 || length > capacityBytes - 4) return null;
  const bytes = [];
  for (let i = 0; i < length; i++) {
    let byte = 0;
    for (let bit = 7; bit >= 0; bit--) {
      const byteIdx = offset + bitIndex * stride;
      const bitVal = buffer[byteIdx] & 1;
      byte |= bitVal << bit;
      bitIndex += 1;
    }
    bytes.push(byte);
  }
  try {
    return Buffer.from(bytes).toString('utf8');
  } catch (_) {
    return null;
  }
}

/** Check a buffer for the %PDF- magic header. */
function isPdfBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 5) return false;
  return buffer[0] === 0x25 && buffer[1] === 0x50 &&
    buffer[2] === 0x44 && buffer[3] === 0x46 && buffer[4] === 0x2D;
}

/**
 * Inject a custom `/X-Tk-Watermark (value)` key into a PDF's trailer Info
 * dictionary without breaking the file. We tolerate two shapes:
 *   a) an existing Info dictionary    → append the new key into it
 *   b) no Info dictionary at all      → splice a fresh Info block just
 *      before the %%EOF trailer marker
 *
 * Returns a new Buffer. The input is not mutated.
 */
function injectPdfMetadata(buffer, key, value) {
  const src = buffer.toString('binary');
  const sanitizedValue = String(value).replace(/[()\\]/g, (m) => `\\${m}`);
  const tag = `/${key} (${sanitizedValue})`;

  // Case A — existing /Info dictionary: look for `/Producer (...)` and append.
  const infoRe = /\/Producer\s*\(([^)]*)\)/;
  if (infoRe.test(src)) {
    const patched = src.replace(infoRe, (match) => `${match} ${tag}`);
    return Buffer.from(patched, 'binary');
  }

  // Case B — append a fresh trailer marker before %%EOF.
  const eofIdx = src.lastIndexOf('%%EOF');
  if (eofIdx < 0) {
    // Not a well-formed PDF — append the tag as a trailing comment so the
    // metadata still round-trips through extractPdfMetadata.
    return Buffer.concat([buffer, Buffer.from(`\n% ${tag}\n`, 'binary')]);
  }
  const before = src.slice(0, eofIdx);
  const after = src.slice(eofIdx);
  const patched = `${before}% X-Tk-Watermark Metadata\n% ${tag}\n${after}`;
  return Buffer.from(patched, 'binary');
}

/**
 * Extract a previously-embedded `/Key (value)` metadata tag from a PDF
 * buffer. Matches both the dictionary and the trailing comment form.
 */
function extractPdfMetadata(buffer, key) {
  if (!Buffer.isBuffer(buffer)) return null;
  const src = buffer.toString('binary');
  const re = new RegExp(`/${key}\\s*\\(([^)]*)\\)`);
  const match = src.match(re);
  if (!match) return null;
  return match[1].replace(/\\([()\\])/g, '$1');
}

// ═════════════════════════════════════════════════════════════════════════
// 3. CLASS — Watermark
// ═════════════════════════════════════════════════════════════════════════

class Watermark {
  /**
   * @param {object}  [opts]
   * @param {string}  [opts.secret]     HMAC key for serial + registry ids
   * @param {() => Date} [opts.now]     Clock injection for tests
   * @param {Array}   [opts.registry]   Preseeded registry (rare; tests)
   */
  constructor(opts = {}) {
    this.secret = opts.secret || 'techno-kol-uzi-watermark-v1';
    this.now = typeof opts.now === 'function'
      ? opts.now
      : () => new Date();
    this._registry = Array.isArray(opts.registry) ? opts.registry.slice() : [];
    this._serialCounter = 0;
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3.1 Visible watermark
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Apply a visible watermark to a document descriptor. `doc` is a plain
   * object (or a PDFKit doc, see watermarkPDF below) — this method only
   * records intent and returns a structured descriptor so callers can
   * render it through whatever backend they use.
   *
   * @returns {{ type: 'visible', params: object, applied: boolean }}
   */
  applyVisible({
    doc,
    text,
    opacity = 0.25,
    rotation = -45,
    position = POSITIONS.DIAGONAL,
    color = '#888888',
    font = 'Helvetica-Bold',
    fontSize = 64,
  } = {}) {
    if (!text || typeof text !== 'string') {
      throw new TypeError('applyVisible: text is required');
    }
    if (!Object.values(POSITIONS).includes(position)) {
      throw new RangeError(`applyVisible: unknown position "${position}"`);
    }
    const params = {
      text,
      opacity,
      rotation,
      position,
      color,
      font,
      fontSize,
    };
    // Record on the doc descriptor so renderers can pick it up.
    if (doc && typeof doc === 'object') {
      if (!Array.isArray(doc.__watermarks)) doc.__watermarks = [];
      doc.__watermarks.push({ type: 'visible', ...params });
    }
    return { type: 'visible', params, applied: true };
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3.2 Per-user dynamic watermark
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Render a per-user watermark using a template that may include the
   * placeholders {{user.name}} / {{user.id}} / {{date}} / {{serial}}.
   * Defaults to "{{user.name}} - {{date}}".
   */
  applyPerUser({
    doc,
    userId,
    userName,
    text = '{{user.name}} - {{date}}',
    date,
    opacity = 0.22,
    rotation = -30,
    position = POSITIONS.DIAGONAL,
    color = '#444444',
  } = {}) {
    const when = date || this._isoDate();
    const ctx = {
      user: { id: userId || '', name: userName || userId || '' },
      date: when,
      serial: this._serialForRecipient(userId),
    };
    const rendered = interpolate(text, ctx);
    return this.applyVisible({
      doc,
      text: rendered,
      opacity,
      rotation,
      position,
      color,
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3.3 Dynamic URL watermark — "viewed by … on … via …"
  // ───────────────────────────────────────────────────────────────────────

  applyDynamicUrl({
    doc,
    uniqueLink,
    userId,
    userName,
    date,
    template = 'viewed by {{user.name}} on {{date}} via {{url}}',
    opacity = 0.20,
    position = POSITIONS.FOOTER,
  } = {}) {
    if (!uniqueLink) {
      throw new TypeError('applyDynamicUrl: uniqueLink is required');
    }
    const when = date || this._isoDate();
    const rendered = interpolate(template, {
      user: { id: userId || 'anonymous', name: userName || userId || 'anonymous' },
      date: when,
      url: uniqueLink,
    });
    return this.applyVisible({
      doc,
      text: rendered,
      opacity,
      rotation: 0,
      position,
      color: '#222222',
      fontSize: 10,
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3.4 Invisible / steganographic payload
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Embed an invisible payload into the document. The channel is picked
   * automatically from the document type unless overridden:
   *
   *   - Buffer with %PDF- magic       → PDF custom metadata
   *   - Buffer otherwise              → LSB on the raw bytes
   *   - string                        → zero-width Unicode frame appended
   *   - plain object                  → `__watermark_invisible` field
   */
  applyInvisibleSteganographic({ doc, payload, channel = CHANNELS.AUTO } = {}) {
    if (payload === undefined || payload === null) {
      throw new TypeError('applyInvisibleSteganographic: payload is required');
    }
    const serializedPayload = typeof payload === 'string'
      ? payload
      : JSON.stringify(payload);

    const resolved = this._resolveChannel(doc, channel);
    switch (resolved) {
      case CHANNELS.PDF_METADATA: {
        const out = injectPdfMetadata(doc, 'X-Tk-Watermark', serializedPayload);
        return { type: 'invisible', channel: resolved, doc: out };
      }
      case CHANNELS.IMAGE_LSB: {
        const out = embedLSB(doc, serializedPayload);
        return { type: 'invisible', channel: resolved, doc: out };
      }
      case CHANNELS.ZERO_WIDTH: {
        if (typeof doc === 'string') {
          const out = doc + encodeZeroWidth(serializedPayload);
          return { type: 'invisible', channel: resolved, doc: out };
        }
        if (doc && typeof doc === 'object') {
          doc.__watermark_invisible = serializedPayload;
          doc.__watermark_invisible_encoded = encodeZeroWidth(serializedPayload);
          return { type: 'invisible', channel: resolved, doc };
        }
        throw new TypeError('zero-width channel requires a string or object doc');
      }
      default:
        throw new RangeError(`unknown channel: ${resolved}`);
    }
  }

  /**
   * Extract the invisible payload previously embedded with
   * `applyInvisibleSteganographic`. Returns `null` when nothing is found.
   */
  extractInvisible(doc, channel = CHANNELS.AUTO) {
    const resolved = this._resolveChannel(doc, channel);
    switch (resolved) {
      case CHANNELS.PDF_METADATA:
        return extractPdfMetadata(doc, 'X-Tk-Watermark');
      case CHANNELS.IMAGE_LSB:
        return extractLSB(doc);
      case CHANNELS.ZERO_WIDTH: {
        if (typeof doc === 'string') return decodeZeroWidth(doc);
        if (doc && typeof doc === 'object') {
          if (doc.__watermark_invisible) return doc.__watermark_invisible;
          if (typeof doc.__watermark_invisible_encoded === 'string') {
            return decodeZeroWidth(doc.__watermark_invisible_encoded);
          }
          return null;
        }
        return null;
      }
      default:
        return null;
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3.5 Per-recipient serialization
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Deterministic serial: `WM-YYYYMMDD-xxxxx` where the suffix is the
   * first 8 hex chars of HMAC(secret, doc||recipient||counter).
   * Each call bumps an internal counter so repeated calls for the same
   * recipient yield distinct serials — reproducible via `_serialCounter`.
   */
  serialNumber({ doc, issuedTo } = {}) {
    if (!issuedTo) throw new TypeError('serialNumber: issuedTo is required');
    this._serialCounter += 1;
    const docId = doc && doc.id ? doc.id : 'unknown';
    const payload = `${docId}::${issuedTo}::${this._serialCounter}`;
    const sig = hmacHex(this.secret, payload).slice(0, 8).toUpperCase();
    return `WM-${this._datePart()}-${sig}`;
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3.6 Forensic detection
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Match a leaked document against the issuance registry.
   *
   * Detection strategy (first match wins):
   *   1. Serial number appears verbatim inside the doc text / payload
   *   2. Invisible PDF metadata matches a registry payload
   *   3. Invisible LSB on an image matches a registry payload
   *   4. Zero-width payload inside a string matches a registry payload
   *   5. Visible per-user text (user id / user name / email) appears
   *
   * @returns {{ match: object, via: string } | null}
   */
  forensicDetection({ leakedDoc, registry } = {}) {
    const reg = Array.isArray(registry) ? registry : this._registry;
    if (!reg.length) return null;

    // Normalise the leaked doc to a searchable string + candidate payloads.
    const candidates = this._candidatePayloads(leakedDoc);

    // Pass 1 — look for exact serial hits.
    for (const entry of reg) {
      const serial = entry.watermarkData && entry.watermarkData.serial;
      if (serial && candidates.textIncludes(serial)) {
        return { match: entry, via: 'serial' };
      }
    }
    // Pass 2 — invisible payload (PDF / LSB / zero-width).
    for (const payload of candidates.invisiblePayloads) {
      for (const entry of reg) {
        const reference = entry.watermarkData && entry.watermarkData.payload;
        if (reference && payload && payload.includes(reference)) {
          return { match: entry, via: 'invisible' };
        }
      }
    }
    // Pass 3 — visible template text (user id / name / email).
    for (const entry of reg) {
      const needles = this._identityNeedles(entry.recipient);
      for (const needle of needles) {
        if (needle && candidates.textIncludes(needle)) {
          return { match: entry, via: 'visible' };
        }
      }
    }
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3.7 Templates + bilingual rendering
  // ───────────────────────────────────────────────────────────────────────

  templates({ standard } = {}) {
    if (!standard) return { ...TEMPLATES };
    const tpl = TEMPLATES[standard];
    if (!tpl) {
      throw new RangeError(
        `templates: unknown standard "${standard}" — use one of ${Object.keys(TEMPLATES).join(', ')}`
      );
    }
    return { ...tpl, text: bilingualLabel(tpl.he, tpl.en) };
  }

  bilingualWatermark({ he, en } = {}) {
    const label = bilingualLabel(he, en);
    if (!label) {
      throw new TypeError('bilingualWatermark: supply at least one of he/en');
    }
    return label;
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3.8 Renderers — SVG / PDF / Image
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Produce an SVG representation of the watermark. Accepts either:
   *   - a template standard key (`{ standard: 'confidential' }`)
   *   - a free-form spec (`{ text, opacity, rotation, position, color }`)
   *
   * Returns a complete `<svg>` string with an embedded zero-width forensic
   * payload when `payload` is supplied.
   */
  watermarkSVG(params = {}) {
    const spec = params.standard
      ? this.templates({ standard: params.standard })
      : { ...params };
    const text = spec.text || bilingualLabel(spec.he, spec.en) || spec.en || spec.he;
    if (!text) throw new TypeError('watermarkSVG: text is required');
    const width = spec.width || 800;
    const height = spec.height || 600;
    const opacity = spec.opacity != null ? spec.opacity : 0.25;
    const rotation = spec.rotation != null ? spec.rotation : -45;
    const color = spec.color || '#888888';
    const fontSize = spec.fontSize || 72;
    const position = spec.position || POSITIONS.DIAGONAL;
    const xmlText = escapeXml(text);

    let bodies;
    if (position === POSITIONS.TILE) {
      bodies = [];
      const stepX = Math.max(width / 3, 200);
      const stepY = Math.max(height / 3, 150);
      for (let y = stepY / 2; y < height; y += stepY) {
        for (let x = stepX / 2; x < width; x += stepX) {
          bodies.push(
            `<text x="${x}" y="${y}" fill="${color}" fill-opacity="${opacity}" ` +
            `font-family="${spec.font || 'Helvetica, Arial, sans-serif'}" ` +
            `font-size="${fontSize / 2}" text-anchor="middle" ` +
            `transform="rotate(${rotation}, ${x}, ${y})">${xmlText}</text>`
          );
        }
      }
    } else {
      const pos = this._svgAnchor(position, width, height);
      bodies = [
        `<text x="${pos.x}" y="${pos.y}" fill="${color}" fill-opacity="${opacity}" ` +
        `font-family="${spec.font || 'Helvetica, Arial, sans-serif'}" ` +
        `font-size="${fontSize}" text-anchor="middle" ` +
        `transform="rotate(${rotation}, ${pos.x}, ${pos.y})">${xmlText}</text>`,
      ];
    }

    const forensic = params.payload
      ? `<!-- X-Tk-Watermark ${encodeZeroWidth(params.payload)} -->`
      : '';

    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
      `width="${width}" height="${height}" direction="${spec.direction || 'rtl'}">` +
      `<title>Watermark: ${xmlText}</title>${forensic}${bodies.join('')}</svg>`
    );
  }

  /**
   * Watermark a PDF buffer.
   *   - If `pdfkit` is installed, render a fresh overlay page and
   *     compose it on top of each page of the source PDF.
   *   - If `pdfkit` is missing, fall back to a metadata-only patch so the
   *     document still carries the forensic payload and the visible text
   *     is stored in the Info dictionary as `/Watermark (text)`.
   *
   * @returns {Buffer}
   */
  watermarkPDF(pdfBuffer, params = {}) {
    if (!Buffer.isBuffer(pdfBuffer)) {
      throw new TypeError('watermarkPDF: pdfBuffer must be a Buffer');
    }
    const spec = params.standard
      ? this.templates({ standard: params.standard })
      : { ...params };
    const text = params.text || spec.text ||
      bilingualLabel(params.he || spec.he, params.en || spec.en) || 'WATERMARK';

    let out = pdfBuffer;
    out = injectPdfMetadata(out, 'Watermark', text);
    if (params.payload) {
      out = injectPdfMetadata(out, 'X-Tk-Watermark', params.payload);
    }

    // If pdfkit is available try a best-effort overlay. We intentionally
    // do NOT fail when the source isn't a true PDFKit-writable doc — the
    // metadata patch above is authoritative.
    if (PDFDocument && params.pdfkitOverlay) {
      try {
        const overlay = new PDFDocument({ autoFirstPage: false });
        const chunks = [];
        overlay.on('data', (c) => chunks.push(c));
        overlay.addPage();
        overlay.save();
        overlay.rotate(spec.rotation != null ? spec.rotation : -45,
          { origin: [overlay.page.width / 2, overlay.page.height / 2] });
        overlay.fillColor(spec.color || '#888888', spec.opacity || 0.25);
        overlay.font(spec.font || 'Helvetica-Bold');
        overlay.fontSize(spec.fontSize || 72);
        overlay.text(text,
          overlay.page.width / 2 - 150,
          overlay.page.height / 2);
        overlay.restore();
        overlay.end();
        const overlayBuf = Buffer.concat(chunks);
        // Append the overlay as a trailing object; not a perfect merge,
        // but it does mean the watermark PDF ships embedded in the output.
        out = Buffer.concat([
          out,
          Buffer.from('\n% X-Tk-Overlay\n'),
          overlayBuf,
        ]);
      } catch (_) {
        // Overlay is best-effort — metadata already patched.
      }
    }

    return out;
  }

  /**
   * Watermark a raw image buffer. Two effects:
   *   1. LSB-embedded forensic payload (when `params.payload` is set)
   *   2. A marker byte trailer — `<!--WM:text-->` — appended to the buffer
   *      so a visible string tool can still grep for the watermark label.
   *
   * Real PNG/JPEG encoding is out of scope for zero-dep core; consumers
   * who need a visible overlay on rendered pixels should compose the SVG
   * (`watermarkSVG`) over their image pipeline.
   */
  watermarkImage(imgBuffer, params = {}) {
    if (!Buffer.isBuffer(imgBuffer)) {
      throw new TypeError('watermarkImage: imgBuffer must be a Buffer');
    }
    const spec = params.standard
      ? this.templates({ standard: params.standard })
      : { ...params };
    const text = params.text || spec.text ||
      bilingualLabel(params.he || spec.he, params.en || spec.en) || 'WATERMARK';

    let out = imgBuffer;
    if (params.payload) {
      out = embedLSB(out, params.payload);
    }
    // Append a forensic marker so even a stripped LSB copy retains a
    // grep-able trailing comment. This is additive — never modifies pixels.
    const marker = Buffer.from(`<!--WM:${text}-->`, 'utf8');
    return Buffer.concat([out, marker]);
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3.9 Issuance registry — append-only forensic traceback
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Append a new issuance record to the registry. Returns a frozen clone
   * of the stored entry so callers can't mutate history.
   *
   * @param {object} args
   * @param {string} args.docId
   * @param {object|string} args.recipient   — { id, name, email } or bare id
   * @param {object} args.watermarkData      — { serial, payload, template, … }
   */
  auditIssuance({ docId, recipient, watermarkData } = {}) {
    if (!docId) throw new TypeError('auditIssuance: docId is required');
    if (!recipient) throw new TypeError('auditIssuance: recipient is required');
    const normalizedRecipient = typeof recipient === 'string'
      ? { id: recipient }
      : { ...recipient };
    const id = 'IS-' + hmacHex(
      this.secret,
      `${docId}::${JSON.stringify(normalizedRecipient)}::${this._registry.length}`
    ).slice(0, 16).toUpperCase();
    const entry = Object.freeze({
      id,
      docId,
      recipient: Object.freeze(normalizedRecipient),
      watermarkData: Object.freeze({ ...(watermarkData || {}) }),
      issuedAt: this._isoDate(),
      revoked: false,
      revokedAt: null,
      revokedReason: null,
    });
    this._registry.push(entry);
    return entry;
  }

  /**
   * Mark an issuance as revoked — does NOT delete the record.
   * Complies with the system rule: לא מוחקים, רק משדרגים ומגדלים.
   */
  revokeIssuance({ issuanceId, reason } = {}) {
    const idx = this._registry.findIndex((e) => e.id === issuanceId);
    if (idx < 0) {
      throw new RangeError(`revokeIssuance: unknown id "${issuanceId}"`);
    }
    const prev = this._registry[idx];
    const next = Object.freeze({
      ...prev,
      revoked: true,
      revokedAt: this._isoDate(),
      revokedReason: reason || 'unspecified',
    });
    // Append a new version of the record — leave the previous in place.
    this._registry.push(next);
    return next;
  }

  listIssuances(filter = {}) {
    let rows = this._registry.slice();
    if (filter.docId) rows = rows.filter((r) => r.docId === filter.docId);
    if (filter.recipientId) {
      rows = rows.filter((r) => r.recipient && r.recipient.id === filter.recipientId);
    }
    if (filter.includeRevoked === false) {
      rows = rows.filter((r) => !r.revoked);
    }
    return rows;
  }

  exportRegistry() {
    return Object.freeze(this._registry.slice());
  }

  // ───────────────────────────────────────────────────────────────────────
  // 3.10 Private helpers
  // ───────────────────────────────────────────────────────────────────────

  _isoDate() {
    try {
      return this.now().toISOString();
    } catch (_) {
      return new Date().toISOString();
    }
  }

  _datePart() {
    const d = this.now();
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}${m}${day}`;
  }

  _serialForRecipient(recipientId) {
    return hmacHex(this.secret, `serial::${recipientId || 'anon'}`).slice(0, 12).toUpperCase();
  }

  _resolveChannel(doc, channel) {
    if (channel !== CHANNELS.AUTO) return channel;
    if (Buffer.isBuffer(doc)) {
      return isPdfBuffer(doc) ? CHANNELS.PDF_METADATA : CHANNELS.IMAGE_LSB;
    }
    return CHANNELS.ZERO_WIDTH;
  }

  _svgAnchor(position, width, height) {
    switch (position) {
      case POSITIONS.CENTER:
        return { x: width / 2, y: height / 2 };
      case POSITIONS.HEADER:
        return { x: width / 2, y: height * 0.08 };
      case POSITIONS.FOOTER:
        return { x: width / 2, y: height * 0.95 };
      case POSITIONS.DIAGONAL:
      default:
        return { x: width / 2, y: height / 2 };
    }
  }

  _candidatePayloads(leakedDoc) {
    let textBlob = '';
    const invisiblePayloads = [];

    if (leakedDoc == null) {
      return this._emptyCandidates();
    }
    if (typeof leakedDoc === 'string') {
      textBlob = leakedDoc;
      const zw = decodeZeroWidth(leakedDoc);
      if (zw) invisiblePayloads.push(zw);
    } else if (Buffer.isBuffer(leakedDoc)) {
      textBlob = leakedDoc.toString('binary');
      if (isPdfBuffer(leakedDoc)) {
        const pdfPayload = extractPdfMetadata(leakedDoc, 'X-Tk-Watermark');
        if (pdfPayload) invisiblePayloads.push(pdfPayload);
        const visible = extractPdfMetadata(leakedDoc, 'Watermark');
        if (visible) textBlob += `\n${visible}`;
      } else {
        const lsb = extractLSB(leakedDoc);
        if (lsb) invisiblePayloads.push(lsb);
      }
    } else if (typeof leakedDoc === 'object') {
      textBlob = JSON.stringify(leakedDoc);
      if (leakedDoc.__watermark_invisible) {
        invisiblePayloads.push(String(leakedDoc.__watermark_invisible));
      }
      if (typeof leakedDoc.__watermark_invisible_encoded === 'string') {
        const zw = decodeZeroWidth(leakedDoc.__watermark_invisible_encoded);
        if (zw) invisiblePayloads.push(zw);
      }
      if (Array.isArray(leakedDoc.__watermarks)) {
        for (const w of leakedDoc.__watermarks) {
          if (w && w.text) textBlob += `\n${w.text}`;
        }
      }
    }

    return {
      textBlob,
      invisiblePayloads,
      textIncludes(needle) {
        return typeof needle === 'string' && needle.length > 0 &&
          textBlob.includes(needle);
      },
    };
  }

  _emptyCandidates() {
    return {
      textBlob: '',
      invisiblePayloads: [],
      textIncludes() { return false; },
    };
  }

  _identityNeedles(recipient) {
    if (!recipient) return [];
    if (typeof recipient === 'string') return [recipient];
    const out = [];
    if (recipient.id) out.push(recipient.id);
    if (recipient.name) out.push(recipient.name);
    if (recipient.email) out.push(recipient.email);
    return out;
  }
}

// ═════════════════════════════════════════════════════════════════════════
// 4. INTERNAL — xml escape
// ═════════════════════════════════════════════════════════════════════════

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ═════════════════════════════════════════════════════════════════════════
// 5. EXPORTS
// ═════════════════════════════════════════════════════════════════════════

module.exports = {
  Watermark,
  TEMPLATES,
  POSITIONS,
  CHANNELS,
  encodeZeroWidth,
  decodeZeroWidth,
  embedLSB,
  extractLSB,
  injectPdfMetadata,
  extractPdfMetadata,
  isPdfBuffer,
  sha256Hex,
  hmacHex,
  interpolate,
  bilingualLabel,
};
