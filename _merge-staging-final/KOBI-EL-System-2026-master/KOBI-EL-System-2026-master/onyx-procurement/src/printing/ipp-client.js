'use strict';

/**
 * ipp-client.js
 * ------------------------------------------------------------
 * Zero-dependency IPP (Internet Printing Protocol) client.
 *
 * Implements a pragmatic subset of IPP/1.1 (RFC 8011) on top of
 * Node's built-in `http` module. The IPP binary format is produced
 * and parsed from scratch — no `ipp`, `printer`, `axios` or similar
 * external packages are used.
 *
 * Supported operations:
 *   - Print-Job (0x0002)
 *   - Validate-Job (0x0004)
 *   - Cancel-Job (0x0008)
 *   - Get-Job-Attributes (0x0009)
 *   - Get-Jobs (0x000A)
 *   - Get-Printer-Attributes (0x000B)
 *
 * Public API:
 *   discoverPrinters(opts)
 *   getPrinterInfo(ipAddress, opts)
 *   printPdf(ipAddress, pdfBuffer, opts)
 *   printRawText(ipAddress, text, opts)
 *   listJobs(ipAddress, opts)
 *   cancelJob(ipAddress, jobId, opts)
 *   validateJob(ipAddress, jobName, opts)
 *
 * Also exports:
 *   encodeRequest / decodeResponse — low-level IPP codec
 *   OPERATIONS / STATUS_CODES / TAGS — protocol constants
 *   IppError — typed error for printer conditions
 *
 * Author: Agent 85 — Onyx Procurement Printing stack
 * ------------------------------------------------------------
 */

const http = require('http');

// ---------------------------------------------------------------------------
// Protocol constants
// ---------------------------------------------------------------------------

const IPP_VERSION = Buffer.from([0x01, 0x01]); // IPP/1.1

const OPERATIONS = Object.freeze({
  PRINT_JOB: 0x0002,
  PRINT_URI: 0x0003,
  VALIDATE_JOB: 0x0004,
  CREATE_JOB: 0x0005,
  SEND_DOCUMENT: 0x0006,
  CANCEL_JOB: 0x0008,
  GET_JOB_ATTRIBUTES: 0x0009,
  GET_JOBS: 0x000A,
  GET_PRINTER_ATTRIBUTES: 0x000B,
  HOLD_JOB: 0x000C,
  RELEASE_JOB: 0x000D,
  RESTART_JOB: 0x000E,
  PAUSE_PRINTER: 0x0010,
  RESUME_PRINTER: 0x0011,
  PURGE_JOBS: 0x0012,
});

// Delimiter tags
const TAGS = Object.freeze({
  OPERATION_ATTRIBUTES: 0x01,
  JOB_ATTRIBUTES: 0x02,
  END_OF_ATTRIBUTES: 0x03,
  PRINTER_ATTRIBUTES: 0x04,
  UNSUPPORTED_ATTRIBUTES: 0x05,

  // Out-of-band values
  UNSUPPORTED_VALUE: 0x10,
  UNKNOWN_VALUE: 0x12,
  NO_VALUE: 0x13,

  // integer types
  INTEGER: 0x21,
  BOOLEAN: 0x22,
  ENUM: 0x23,

  // octetString types
  OCTET_STRING: 0x30,
  DATE_TIME: 0x31,
  RESOLUTION: 0x32,
  RANGE_OF_INTEGER: 0x33,
  BEG_COLLECTION: 0x34,
  TEXT_WITH_LANGUAGE: 0x35,
  NAME_WITH_LANGUAGE: 0x36,
  END_COLLECTION: 0x37,

  // character-string types
  TEXT_WITHOUT_LANGUAGE: 0x41,
  NAME_WITHOUT_LANGUAGE: 0x42,
  KEYWORD: 0x44,
  URI: 0x45,
  URI_SCHEME: 0x46,
  CHARSET: 0x47,
  NATURAL_LANGUAGE: 0x48,
  MIME_MEDIA_TYPE: 0x49,
  MEMBER_NAME: 0x4A,
});

// Status codes (subset — see RFC 8011 §4.1.5 / 4.3.1)
const STATUS_CODES = Object.freeze({
  0x0000: 'successful-ok',
  0x0001: 'successful-ok-ignored-or-substituted-attributes',
  0x0002: 'successful-ok-conflicting-attributes',
  0x0400: 'client-error-bad-request',
  0x0401: 'client-error-forbidden',
  0x0402: 'client-error-not-authenticated',
  0x0403: 'client-error-not-authorized',
  0x0404: 'client-error-not-possible',
  0x0405: 'client-error-timeout',
  0x0406: 'client-error-not-found',
  0x0407: 'client-error-gone',
  0x0408: 'client-error-request-entity-too-large',
  0x0409: 'client-error-request-value-too-long',
  0x040A: 'client-error-document-format-not-supported',
  0x040B: 'client-error-attributes-or-values-not-supported',
  0x040C: 'client-error-uri-scheme-not-supported',
  0x040D: 'client-error-charset-not-supported',
  0x040E: 'client-error-conflicting-attributes',
  0x040F: 'client-error-compression-not-supported',
  0x0410: 'client-error-compression-error',
  0x0411: 'client-error-document-format-error',
  0x0412: 'client-error-document-access-error',
  0x0500: 'server-error-internal-error',
  0x0501: 'server-error-operation-not-supported',
  0x0502: 'server-error-service-unavailable',
  0x0503: 'server-error-version-not-supported',
  0x0504: 'server-error-device-error',
  0x0505: 'server-error-temporary-error',
  0x0506: 'server-error-not-accepting-jobs',
  0x0507: 'server-error-busy',
  0x0508: 'server-error-job-canceled',
  0x0509: 'server-error-multiple-document-jobs-not-supported',
});

// Job state (RFC 8011 §5.3.7)
const JOB_STATE = Object.freeze({
  3: 'pending',
  4: 'pending-held',
  5: 'processing',
  6: 'processing-stopped',
  7: 'canceled',
  8: 'aborted',
  9: 'completed',
});

// Printer state (RFC 8011 §5.4.11)
const PRINTER_STATE = Object.freeze({
  3: 'idle',
  4: 'processing',
  5: 'stopped',
});

// Human-readable mapping of common printer-state-reasons to alert buckets
const PRINTER_STATE_REASONS_CRITICAL = new Set([
  'media-empty',
  'media-empty-error',
  'media-jam',
  'media-jam-error',
  'toner-empty',
  'toner-empty-error',
  'marker-supply-empty',
  'marker-supply-empty-error',
  'output-area-full',
  'output-tray-missing',
  'input-tray-missing',
  'cover-open',
  'cover-open-error',
  'door-open',
  'door-open-error',
  'fuser-over-temp',
  'fuser-under-temp',
  'shutdown',
]);

const PRINTER_STATE_REASONS_WARNING = new Set([
  'media-low',
  'media-low-warning',
  'toner-low',
  'toner-low-warning',
  'marker-supply-low',
  'marker-supply-low-warning',
  'cleaner-life-almost-over',
  'opc-near-eol',
]);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

class IppError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'IppError';
    this.code = details.code || 'IPP_ERROR';
    this.statusCode = details.statusCode;
    this.statusName = details.statusName;
    this.httpStatus = details.httpStatus;
    this.printerState = details.printerState;
    this.stateReasons = details.stateReasons || [];
    this.jobId = details.jobId;
    this.cause = details.cause;
  }
}

// ---------------------------------------------------------------------------
// Low-level encoder helpers
// ---------------------------------------------------------------------------

/**
 * Write an attribute (tag + name + value). Follows IPP binary framing:
 *
 *   1-byte value-tag
 *   2-byte name-length   | name bytes
 *   2-byte value-length  | value bytes
 *
 * For additional values in the same attribute (multi-value), name-length = 0.
 */
function writeAttribute(tag, name, value) {
  const nameBuf = Buffer.from(name, 'utf8');
  let valueBuf;

  switch (tag) {
    case TAGS.INTEGER:
    case TAGS.ENUM: {
      valueBuf = Buffer.alloc(4);
      valueBuf.writeInt32BE(value | 0, 0);
      break;
    }
    case TAGS.BOOLEAN: {
      valueBuf = Buffer.from([value ? 0x01 : 0x00]);
      break;
    }
    case TAGS.RANGE_OF_INTEGER: {
      valueBuf = Buffer.alloc(8);
      valueBuf.writeInt32BE(value[0] | 0, 0);
      valueBuf.writeInt32BE(value[1] | 0, 4);
      break;
    }
    case TAGS.RESOLUTION: {
      // value = [x, y, units] (units: 3=dpi, 4=dpcm)
      valueBuf = Buffer.alloc(9);
      valueBuf.writeInt32BE(value[0] | 0, 0);
      valueBuf.writeInt32BE(value[1] | 0, 4);
      valueBuf.writeInt8((value[2] || 3) | 0, 8);
      break;
    }
    default: {
      // Treat as text / keyword / uri / charset / naturalLanguage / mimeMediaType
      valueBuf = Buffer.from(value == null ? '' : String(value), 'utf8');
      break;
    }
  }

  const header = Buffer.alloc(1 + 2 + nameBuf.length + 2);
  let o = 0;
  header.writeUInt8(tag, o); o += 1;
  header.writeUInt16BE(nameBuf.length, o); o += 2;
  nameBuf.copy(header, o); o += nameBuf.length;
  header.writeUInt16BE(valueBuf.length, o);
  return Buffer.concat([header, valueBuf]);
}

/** Write a multi-value continuation (name-length = 0). */
function writeAdditionalValue(tag, value) {
  return writeAttribute(tag, '', value);
}

function writeGroup(groupTag) {
  return Buffer.from([groupTag]);
}

// ---------------------------------------------------------------------------
// High-level request encoder
// ---------------------------------------------------------------------------

let __reqSeq = 1;
function nextRequestId() {
  __reqSeq = (__reqSeq + 1) & 0x7fffffff;
  if (__reqSeq === 0) __reqSeq = 1;
  return __reqSeq;
}

/**
 * Build an IPP binary request.
 *
 * @param {number} operation - OPERATIONS.*
 * @param {object} opts
 * @param {number} [opts.requestId]
 * @param {object} [opts.operationAttributes] - flat map of operation attrs
 * @param {object} [opts.jobAttributes]       - flat map of job attrs
 * @param {Buffer} [opts.data]                - document data (for Print-Job)
 * @returns {Buffer}
 */
function encodeRequest(operation, opts = {}) {
  const requestId = opts.requestId || nextRequestId();

  const head = Buffer.alloc(8);
  IPP_VERSION.copy(head, 0);               // version
  head.writeUInt16BE(operation, 2);        // operation-id
  head.writeUInt32BE(requestId, 4);        // request-id

  const chunks = [head];

  // --- operation attributes group (mandatory) ---
  chunks.push(writeGroup(TAGS.OPERATION_ATTRIBUTES));

  // attributes-charset and attributes-natural-language MUST come first
  const opAttrs = Object.assign(
    {
      'attributes-charset': { tag: TAGS.CHARSET, value: 'utf-8' },
      'attributes-natural-language': { tag: TAGS.NATURAL_LANGUAGE, value: 'en' },
    },
    opts.operationAttributes || {}
  );

  // Enforce ordering: charset, language, then everything else
  const order = ['attributes-charset', 'attributes-natural-language'];
  for (const k of Object.keys(opAttrs)) if (!order.includes(k)) order.push(k);

  for (const name of order) {
    const attr = opAttrs[name];
    if (attr === undefined || attr === null) continue;
    chunks.push(encodeAttr(name, attr));
  }

  // --- job attributes group (optional) ---
  if (opts.jobAttributes && Object.keys(opts.jobAttributes).length > 0) {
    chunks.push(writeGroup(TAGS.JOB_ATTRIBUTES));
    for (const [name, attr] of Object.entries(opts.jobAttributes)) {
      chunks.push(encodeAttr(name, attr));
    }
  }

  // end-of-attributes
  chunks.push(writeGroup(TAGS.END_OF_ATTRIBUTES));

  // document data (for Print-Job and friends)
  if (Buffer.isBuffer(opts.data) && opts.data.length > 0) {
    chunks.push(opts.data);
  }

  return Buffer.concat(chunks);
}

/**
 * Normalize an attribute entry into { tag, values } and emit binary bytes.
 */
function encodeAttr(name, attr) {
  let tag;
  let values;

  if (attr && typeof attr === 'object' && 'tag' in attr) {
    tag = attr.tag;
    values = Array.isArray(attr.value) ? attr.value : [attr.value];
  } else if (typeof attr === 'number' && Number.isInteger(attr)) {
    tag = TAGS.INTEGER;
    values = [attr];
  } else if (typeof attr === 'boolean') {
    tag = TAGS.BOOLEAN;
    values = [attr];
  } else {
    tag = TAGS.KEYWORD;
    values = Array.isArray(attr) ? attr : [attr];
  }

  const parts = [];
  for (let i = 0; i < values.length; i++) {
    parts.push(i === 0
      ? writeAttribute(tag, name, values[i])
      : writeAdditionalValue(tag, values[i]));
  }
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Low-level decoder
// ---------------------------------------------------------------------------

/**
 * Parse an IPP binary response into a JS object:
 *   {
 *     version: [1,1],
 *     statusCode: 0x0000,
 *     statusName: 'successful-ok',
 *     requestId: 42,
 *     groups: [{ tag, attributes: { name: [values...] } }, ...],
 *     data: Buffer
 *   }
 */
function decodeResponse(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8) {
    throw new IppError('IPP response too short', { code: 'IPP_DECODE_ERROR' });
  }
  let o = 0;
  const version = [buf.readUInt8(o), buf.readUInt8(o + 1)]; o += 2;
  const statusCode = buf.readUInt16BE(o); o += 2;
  const requestId = buf.readUInt32BE(o); o += 4;

  const groups = [];
  let current = null;

  while (o < buf.length) {
    const tag = buf.readUInt8(o);

    // Delimiter tags are 0x00..0x0F
    if (tag <= 0x0F) {
      o += 1;
      if (tag === TAGS.END_OF_ATTRIBUTES) {
        break;
      }
      current = { tag, attributes: {} };
      groups.push(current);
      continue;
    }

    // Value tag
    o += 1;
    const nameLen = buf.readUInt16BE(o); o += 2;
    const name = nameLen > 0 ? buf.slice(o, o + nameLen).toString('utf8') : '';
    o += nameLen;
    const valueLen = buf.readUInt16BE(o); o += 2;
    const valueBytes = buf.slice(o, o + valueLen);
    o += valueLen;

    const parsedValue = parseValue(tag, valueBytes);

    if (!current) {
      // Defensive: value before any delimiter — create a synthetic group.
      current = { tag: 0x00, attributes: {} };
      groups.push(current);
    }

    if (nameLen === 0) {
      // additional value for the most recently added attribute
      const lastName = current.__lastName;
      if (lastName && current.attributes[lastName]) {
        current.attributes[lastName].push(parsedValue);
      }
    } else {
      current.attributes[name] = [parsedValue];
      current.__lastName = name;
    }
  }

  // Any remaining bytes are document data.
  const data = o < buf.length ? buf.slice(o) : Buffer.alloc(0);

  // Strip internal markers
  for (const g of groups) delete g.__lastName;

  return {
    version,
    statusCode,
    statusName: STATUS_CODES[statusCode] || `unknown-${statusCode.toString(16)}`,
    requestId,
    groups,
    data,
  };
}

function parseValue(tag, bytes) {
  switch (tag) {
    case TAGS.INTEGER:
    case TAGS.ENUM:
      return bytes.length >= 4 ? bytes.readInt32BE(0) : 0;
    case TAGS.BOOLEAN:
      return bytes.length >= 1 ? bytes.readUInt8(0) === 0x01 : false;
    case TAGS.RANGE_OF_INTEGER:
      return bytes.length >= 8 ? [bytes.readInt32BE(0), bytes.readInt32BE(4)] : [0, 0];
    case TAGS.RESOLUTION:
      return bytes.length >= 9
        ? { xres: bytes.readInt32BE(0), yres: bytes.readInt32BE(4), units: bytes.readInt8(8) }
        : { xres: 0, yres: 0, units: 3 };
    case TAGS.DATE_TIME:
      return bytes; // leave raw
    case TAGS.OCTET_STRING:
      return bytes;
    case TAGS.NO_VALUE:
    case TAGS.UNKNOWN_VALUE:
    case TAGS.UNSUPPORTED_VALUE:
      return null;
    default:
      return bytes.toString('utf8');
  }
}

// Utility: flatten the first matching attribute group to a { name: value|values } map.
function flattenGroup(decoded, groupTag) {
  const g = decoded.groups.find((x) => x.tag === groupTag);
  if (!g) return {};
  const out = {};
  for (const [name, values] of Object.entries(g.attributes)) {
    out[name] = values.length === 1 ? values[0] : values;
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTTP transport
// ---------------------------------------------------------------------------

/**
 * Send a raw IPP body to a printer and return the decoded response.
 *
 * @param {string} ipAddress
 * @param {Buffer} body     - IPP request bytes
 * @param {object} [opts]
 * @param {number} [opts.port=631]
 * @param {string} [opts.path='/ipp/print']
 * @param {number} [opts.timeout=15000]
 * @param {http.Agent} [opts.agent]
 * @param {object} [opts.httpClient] - for tests; must expose `.request`
 */
function sendRequest(ipAddress, body, opts = {}) {
  const port = opts.port || 631;
  const path = opts.path || '/ipp/print';
  const timeout = opts.timeout || 15000;
  const client = opts.httpClient || http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        host: ipAddress,
        port,
        method: 'POST',
        path,
        headers: {
          'Content-Type': 'application/ipp',
          'Content-Length': body.length,
          'Accept': 'application/ipp',
          'User-Agent': 'onyx-procurement-ipp/1.0',
        },
        agent: opts.agent,
        timeout,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          if (res.statusCode >= 400) {
            return reject(new IppError(`HTTP ${res.statusCode} from printer`, {
              code: 'IPP_HTTP_ERROR',
              httpStatus: res.statusCode,
            }));
          }
          try {
            const decoded = decodeResponse(buf);
            resolve(decoded);
          } catch (err) {
            reject(new IppError('Failed to decode IPP response', {
              code: 'IPP_DECODE_ERROR',
              cause: err,
            }));
          }
        });
      }
    );

    req.on('error', (err) => {
      // Map common network errors to friendly IPP codes.
      let code = 'IPP_NETWORK_ERROR';
      if (err && typeof err.code === 'string') {
        if (err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH' ||
            err.code === 'ENETUNREACH' || err.code === 'ENOTFOUND') {
          code = 'IPP_PRINTER_OFFLINE';
        } else if (err.code === 'ETIMEDOUT') {
          code = 'IPP_TIMEOUT';
        }
      }
      reject(new IppError(`Printer ${ipAddress}:${port} unreachable: ${err.message}`, {
        code,
        cause: err,
      }));
    });

    req.on('timeout', () => {
      req.destroy(new Error('IPP request timed out'));
    });

    req.write(body);
    req.end();
  });
}

function makePrinterUri(ipAddress, opts = {}) {
  const port = opts.port || 631;
  const path = opts.path || '/ipp/print';
  return `ipp://${ipAddress}:${port}${path}`;
}

// ---------------------------------------------------------------------------
// Error classification from printer responses
// ---------------------------------------------------------------------------

function classifyPrinterCondition(stateReasons = []) {
  const reasons = stateReasons
    .filter(Boolean)
    .map((r) => String(r).toLowerCase().replace(/-warning$|-error$/, ''));

  for (const r of reasons) {
    if (r.startsWith('media-empty') || r === 'media-empty') {
      return { code: 'IPP_OUT_OF_PAPER', message: 'Printer is out of paper' };
    }
    if (r.startsWith('media-jam')) {
      return { code: 'IPP_PAPER_JAM', message: 'Paper jam detected' };
    }
    if (r.startsWith('toner-empty') || r.startsWith('marker-supply-empty')) {
      return { code: 'IPP_OUT_OF_TONER', message: 'Printer is out of toner/ink' };
    }
    if (r.startsWith('cover-open') || r.startsWith('door-open')) {
      return { code: 'IPP_COVER_OPEN', message: 'Printer cover/door is open' };
    }
    if (r === 'output-area-full' || r === 'output-tray-missing') {
      return { code: 'IPP_OUTPUT_FULL', message: 'Printer output tray is full or missing' };
    }
    if (r === 'shutdown') {
      return { code: 'IPP_SHUTDOWN', message: 'Printer is shut down' };
    }
  }
  return null;
}

function assertSuccess(decoded) {
  const isOk = decoded.statusCode < 0x0100; // 0x0000..0x00FF = successful-*
  const printerGroup = flattenGroup(decoded, TAGS.PRINTER_ATTRIBUTES);
  const jobGroup = flattenGroup(decoded, TAGS.JOB_ATTRIBUTES);
  const stateReasons = []
    .concat(printerGroup['printer-state-reasons'] || [])
    .concat(jobGroup['job-state-reasons'] || []);

  if (!isOk) {
    const classified = classifyPrinterCondition(stateReasons);
    const message = classified
      ? classified.message
      : `IPP error: ${decoded.statusName} (0x${decoded.statusCode.toString(16)})`;
    throw new IppError(message, {
      code: classified ? classified.code : 'IPP_STATUS_ERROR',
      statusCode: decoded.statusCode,
      statusName: decoded.statusName,
      printerState: printerGroup['printer-state'],
      stateReasons,
    });
  }

  // Even on success, warn about critical reasons.
  const critical = stateReasons.find((r) => PRINTER_STATE_REASONS_CRITICAL.has(r));
  if (critical) {
    const classified = classifyPrinterCondition([critical]);
    if (classified) {
      throw new IppError(classified.message, {
        code: classified.code,
        statusCode: decoded.statusCode,
        statusName: decoded.statusName,
        printerState: printerGroup['printer-state'],
        stateReasons,
      });
    }
  }
  return decoded;
}

// ---------------------------------------------------------------------------
// Paper-size map (PWG 5101.1 "media" keywords)
// ---------------------------------------------------------------------------

const PAPER_SIZES = Object.freeze({
  A4: 'iso_a4_210x297mm',
  A3: 'iso_a3_297x420mm',
  A5: 'iso_a5_148x210mm',
  LETTER: 'na_letter_8.5x11in',
  LEGAL: 'na_legal_8.5x14in',
  TABLOID: 'na_ledger_11x17in',
});

function normalizeMedia(paperSize) {
  if (!paperSize) return PAPER_SIZES.A4;
  const k = String(paperSize).toUpperCase().replace(/[\s_-]/g, '');
  return PAPER_SIZES[k] || paperSize;
}

// ---------------------------------------------------------------------------
// High-level operations
// ---------------------------------------------------------------------------

/**
 * mDNS printer discovery.
 *
 * Full mDNS/Bonjour discovery requires a UDP multicast stack (typically via
 * the `mdns` or `bonjour` packages). This project is zero-deps, so we ship
 * the discovery *logic* (coordination, deduplication, filtering) and leave
 * the transport pluggable: callers that already have mDNS can pass in a
 * `browser` object and we'll drive it.
 *
 * Without a browser we return a stub result that explains the limitation.
 */
async function discoverPrinters(opts = {}) {
  const timeout = opts.timeout || 3000;
  const browser = opts.browser;

  if (!browser) {
    return {
      transport: 'stub',
      reason:
        'mDNS discovery requires a UDP multicast backend; inject `opts.browser` ' +
        'or fall back to a static printer list. Known service types: ' +
        '_ipp._tcp, _ipps._tcp, _printer._tcp, _pdl-datastream._tcp.',
      printers: Array.isArray(opts.staticList) ? opts.staticList.slice() : [],
    };
  }

  // Drive the injected browser (expected API: { start(), stop(), on('up', cb) })
  const seen = new Map();
  return await new Promise((resolve) => {
    const onUp = (svc) => {
      if (!svc || !svc.addresses) return;
      const ip = svc.addresses.find((a) => a.indexOf(':') === -1) || svc.addresses[0];
      if (!ip) return;
      const key = `${ip}:${svc.port || 631}`;
      if (seen.has(key)) return;
      seen.set(key, {
        ip,
        port: svc.port || 631,
        name: svc.name || svc.fqdn || ip,
        host: svc.host,
        txt: svc.txt || {},
        type: svc.type || '_ipp._tcp',
      });
    };
    try {
      browser.on && browser.on('up', onUp);
      browser.start && browser.start();
    } catch (_) { /* ignore */ }

    setTimeout(() => {
      try { browser.stop && browser.stop(); } catch (_) { /* ignore */ }
      resolve({
        transport: 'mdns',
        printers: Array.from(seen.values()),
      });
    }, timeout);
  });
}

/**
 * Get printer info via Get-Printer-Attributes.
 */
async function getPrinterInfo(ipAddress, opts = {}) {
  const uri = makePrinterUri(ipAddress, opts);
  const body = encodeRequest(OPERATIONS.GET_PRINTER_ATTRIBUTES, {
    operationAttributes: {
      'printer-uri': { tag: TAGS.URI, value: uri },
      'requested-attributes': {
        tag: TAGS.KEYWORD,
        value: [
          'printer-name',
          'printer-make-and-model',
          'printer-info',
          'printer-location',
          'printer-state',
          'printer-state-reasons',
          'printer-state-message',
          'printer-is-accepting-jobs',
          'document-format-supported',
          'media-supported',
          'media-default',
          'sides-supported',
          'print-color-mode-supported',
          'queued-job-count',
        ],
      },
    },
  });

  const decoded = await sendRequest(ipAddress, body, opts);
  assertSuccess(decoded);

  const p = flattenGroup(decoded, TAGS.PRINTER_ATTRIBUTES);
  const state = typeof p['printer-state'] === 'number'
    ? (PRINTER_STATE[p['printer-state']] || `state-${p['printer-state']}`)
    : (p['printer-state'] || 'unknown');

  return {
    name: p['printer-name'],
    make: splitMakeAndModel(p['printer-make-and-model']).make,
    model: splitMakeAndModel(p['printer-make-and-model']).model,
    makeAndModel: p['printer-make-and-model'],
    info: p['printer-info'],
    location: p['printer-location'],
    state,
    stateMessage: p['printer-state-message'],
    stateReasons: [].concat(p['printer-state-reasons'] || []),
    isAcceptingJobs: !!p['printer-is-accepting-jobs'],
    supportedFormats: [].concat(p['document-format-supported'] || []),
    mediaSupported: [].concat(p['media-supported'] || []),
    mediaDefault: p['media-default'],
    sidesSupported: [].concat(p['sides-supported'] || []),
    colorModeSupported: [].concat(p['print-color-mode-supported'] || []),
    queuedJobCount: p['queued-job-count'] || 0,
    raw: p,
  };
}

function splitMakeAndModel(s) {
  if (!s || typeof s !== 'string') return { make: '', model: '' };
  const parts = s.trim().split(/\s+/);
  if (parts.length <= 1) return { make: parts[0] || '', model: '' };
  return { make: parts[0], model: parts.slice(1).join(' ') };
}

/**
 * Validate-Job: ask the printer whether a job with these attrs would be
 * accepted, without actually submitting the data.
 */
async function validateJob(ipAddress, jobName, opts = {}) {
  const uri = makePrinterUri(ipAddress, opts);
  const jobAttrs = buildJobAttributes(opts);
  const body = encodeRequest(OPERATIONS.VALIDATE_JOB, {
    operationAttributes: {
      'printer-uri': { tag: TAGS.URI, value: uri },
      'requesting-user-name': { tag: TAGS.NAME_WITHOUT_LANGUAGE, value: opts.user || 'onyx' },
      'job-name': { tag: TAGS.NAME_WITHOUT_LANGUAGE, value: jobName || 'onyx-job' },
      'document-format': { tag: TAGS.MIME_MEDIA_TYPE, value: opts.format || 'application/pdf' },
    },
    jobAttributes: jobAttrs,
  });
  const decoded = await sendRequest(ipAddress, body, opts);
  assertSuccess(decoded);
  return { ok: true, statusName: decoded.statusName };
}

function buildJobAttributes(opts = {}) {
  const j = {};
  if (opts.copies && opts.copies > 1) {
    j['copies'] = { tag: TAGS.INTEGER, value: opts.copies | 0 };
  }
  if (opts.duplex) {
    const sides = opts.duplex === 'tumble' ? 'two-sided-short-edge' : 'two-sided-long-edge';
    j['sides'] = { tag: TAGS.KEYWORD, value: sides };
  } else if (opts.duplex === false) {
    j['sides'] = { tag: TAGS.KEYWORD, value: 'one-sided' };
  }
  if (typeof opts.color === 'boolean') {
    j['print-color-mode'] = { tag: TAGS.KEYWORD, value: opts.color ? 'color' : 'monochrome' };
  }
  if (opts.paperSize) {
    j['media'] = { tag: TAGS.KEYWORD, value: normalizeMedia(opts.paperSize) };
  }
  if (opts.quality) {
    const q = { draft: 3, normal: 4, high: 5 }[String(opts.quality).toLowerCase()] || 4;
    j['print-quality'] = { tag: TAGS.ENUM, value: q };
  }
  if (opts.orientation) {
    const map = { portrait: 3, landscape: 4, 'reverse-landscape': 5, 'reverse-portrait': 6 };
    const v = map[String(opts.orientation).toLowerCase()] || 3;
    j['orientation-requested'] = { tag: TAGS.ENUM, value: v };
  }
  return j;
}

/**
 * Print a PDF via Print-Job. Returns { jobId, jobState, jobUri }.
 */
async function printPdf(ipAddress, pdfBuffer, opts = {}) {
  if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
    throw new IppError('printPdf requires a non-empty Buffer', { code: 'IPP_BAD_INPUT' });
  }
  return await submitJob(ipAddress, pdfBuffer, Object.assign({
    format: 'application/pdf',
    jobName: opts.jobName || 'onyx-pdf',
  }, opts));
}

/**
 * Print plain text via Print-Job using text/plain.
 */
async function printRawText(ipAddress, text, opts = {}) {
  const buf = Buffer.from(text == null ? '' : String(text), 'utf8');
  return await submitJob(ipAddress, buf, Object.assign({
    format: 'text/plain; charset=utf-8',
    jobName: opts.jobName || 'onyx-text',
  }, opts));
}

async function submitJob(ipAddress, data, opts = {}) {
  const uri = makePrinterUri(ipAddress, opts);
  const jobAttrs = buildJobAttributes(opts);
  const body = encodeRequest(OPERATIONS.PRINT_JOB, {
    operationAttributes: {
      'printer-uri': { tag: TAGS.URI, value: uri },
      'requesting-user-name': { tag: TAGS.NAME_WITHOUT_LANGUAGE, value: opts.user || 'onyx' },
      'job-name': { tag: TAGS.NAME_WITHOUT_LANGUAGE, value: opts.jobName || 'onyx-job' },
      'document-format': { tag: TAGS.MIME_MEDIA_TYPE, value: opts.format || 'application/octet-stream' },
    },
    jobAttributes: jobAttrs,
    data,
  });
  const decoded = await sendRequest(ipAddress, body, opts);
  assertSuccess(decoded);
  const j = flattenGroup(decoded, TAGS.JOB_ATTRIBUTES);
  return {
    jobId: j['job-id'],
    jobUri: j['job-uri'],
    jobState: JOB_STATE[j['job-state']] || j['job-state'],
    jobStateReasons: [].concat(j['job-state-reasons'] || []),
    statusName: decoded.statusName,
  };
}

/**
 * Get-Jobs operation. Returns an array of job summaries.
 */
async function listJobs(ipAddress, opts = {}) {
  const uri = makePrinterUri(ipAddress, opts);
  const body = encodeRequest(OPERATIONS.GET_JOBS, {
    operationAttributes: {
      'printer-uri': { tag: TAGS.URI, value: uri },
      'requesting-user-name': { tag: TAGS.NAME_WITHOUT_LANGUAGE, value: opts.user || 'onyx' },
      'limit': { tag: TAGS.INTEGER, value: opts.limit || 50 },
      'which-jobs': { tag: TAGS.KEYWORD, value: opts.which || 'not-completed' },
      'requested-attributes': {
        tag: TAGS.KEYWORD,
        value: ['job-id', 'job-name', 'job-state', 'job-state-reasons',
                'job-printer-uri', 'job-originating-user-name'],
      },
    },
  });
  const decoded = await sendRequest(ipAddress, body, opts);
  assertSuccess(decoded);

  // Each job is its own JOB_ATTRIBUTES group.
  const jobs = [];
  for (const g of decoded.groups) {
    if (g.tag !== TAGS.JOB_ATTRIBUTES) continue;
    const flat = {};
    for (const [n, v] of Object.entries(g.attributes)) {
      flat[n] = v.length === 1 ? v[0] : v;
    }
    jobs.push({
      jobId: flat['job-id'],
      jobName: flat['job-name'],
      jobState: JOB_STATE[flat['job-state']] || flat['job-state'],
      jobStateReasons: [].concat(flat['job-state-reasons'] || []),
      jobUri: flat['job-printer-uri'],
      user: flat['job-originating-user-name'],
    });
  }
  return jobs;
}

/**
 * Cancel-Job operation.
 */
async function cancelJob(ipAddress, jobId, opts = {}) {
  const uri = makePrinterUri(ipAddress, opts);
  const body = encodeRequest(OPERATIONS.CANCEL_JOB, {
    operationAttributes: {
      'printer-uri': { tag: TAGS.URI, value: uri },
      'requesting-user-name': { tag: TAGS.NAME_WITHOUT_LANGUAGE, value: opts.user || 'onyx' },
      'job-id': { tag: TAGS.INTEGER, value: jobId | 0 },
    },
  });
  const decoded = await sendRequest(ipAddress, body, opts);
  // successful-ok or client-error-not-possible if already done.
  if (decoded.statusCode >= 0x0100 && decoded.statusCode !== 0x0404) {
    assertSuccess(decoded);
  }
  return { ok: true, jobId, statusName: decoded.statusName };
}

/**
 * Get-Job-Attributes.
 */
async function getJobAttributes(ipAddress, jobId, opts = {}) {
  const uri = makePrinterUri(ipAddress, opts);
  const body = encodeRequest(OPERATIONS.GET_JOB_ATTRIBUTES, {
    operationAttributes: {
      'printer-uri': { tag: TAGS.URI, value: uri },
      'job-id': { tag: TAGS.INTEGER, value: jobId | 0 },
      'requesting-user-name': { tag: TAGS.NAME_WITHOUT_LANGUAGE, value: opts.user || 'onyx' },
    },
  });
  const decoded = await sendRequest(ipAddress, body, opts);
  assertSuccess(decoded);
  const j = flattenGroup(decoded, TAGS.JOB_ATTRIBUTES);
  return {
    jobId,
    jobState: JOB_STATE[j['job-state']] || j['job-state'],
    jobStateReasons: [].concat(j['job-state-reasons'] || []),
    jobName: j['job-name'],
    raw: j,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // high-level
  discoverPrinters,
  getPrinterInfo,
  printPdf,
  printRawText,
  listJobs,
  cancelJob,
  validateJob,
  getJobAttributes,

  // low-level (useful for tests and advanced callers)
  encodeRequest,
  decodeResponse,
  sendRequest,
  makePrinterUri,
  flattenGroup,
  classifyPrinterCondition,
  buildJobAttributes,
  writeAttribute,

  // constants
  OPERATIONS,
  TAGS,
  STATUS_CODES,
  JOB_STATE,
  PRINTER_STATE,
  PAPER_SIZES,

  // errors
  IppError,
};
