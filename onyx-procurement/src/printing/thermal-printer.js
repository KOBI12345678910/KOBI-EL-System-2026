/**
 * ESC/POS Thermal Printer Integration
 * ====================================
 * Agent-83 — KOBI EL 2026 — 2026-04-11
 *
 * Zero-dependency ESC/POS command builder, receipt/invoice/kitchen-order
 * templates, and multi-transport printing (USB stub, Network TCP:9100,
 * LPT spool, File). Hebrew-aware (Code Page 862 + RTL handling).
 *
 * ESC/POS protocol reference:
 *   - Epson ESC/POS Command Reference
 *   - Star Micronics ESC/POS Mode
 *   - Code Page 862 = Hebrew DOS (OEM Hebrew)
 *
 * Usage:
 *   const { ThermalPrinter, ReceiptBuilder, Templates } =
 *     require('./printing/thermal-printer');
 *
 *   const p = new ThermalPrinter({ transport: 'file', path: './out.bin' });
 *   p.init().align('center').bold(true).text('קבלה').bold(false)
 *    .feed(2).cut('full');
 *   await p.send();
 *
 * This module is 100% self-contained and has ZERO external dependencies
 * (only Node builtins: net, fs, child_process).
 */

'use strict';

const net = require('net');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ───────────────────────────────────────────────────────────────
// ESC/POS Opcodes — raw bytes
// ───────────────────────────────────────────────────────────────

const ESC = 0x1B;   //  27
const GS  = 0x1D;   //  29
const FS  = 0x1C;   //  28
const LF  = 0x0A;   //  10
const CR  = 0x0D;   //  13
const HT  = 0x09;   //   9
const NUL = 0x00;

// Common command sequences (as byte arrays).
const CMD = Object.freeze({
  INIT:             [ESC, 0x40],                  // ESC @
  LF:               [LF],
  CR:               [CR],
  HT:               [HT],

  BOLD_ON:          [ESC, 0x45, 0x01],             // ESC E 1
  BOLD_OFF:         [ESC, 0x45, 0x00],             // ESC E 0

  // ESC - n :  0=none, 1=1-dot, 2=2-dot
  UNDERLINE_OFF:    [ESC, 0x2D, 0x00],
  UNDERLINE_1:      [ESC, 0x2D, 0x01],
  UNDERLINE_2:      [ESC, 0x2D, 0x02],

  // ESC a n : 0=left 1=center 2=right
  ALIGN_LEFT:       [ESC, 0x61, 0x00],
  ALIGN_CENTER:     [ESC, 0x61, 0x01],
  ALIGN_RIGHT:      [ESC, 0x61, 0x02],

  // GS ! n  (size — see size() below)
  SIZE_NORMAL:          [GS, 0x21, 0x00],
  SIZE_DOUBLE:          [GS, 0x21, 0x11],    // both h+w doubled
  SIZE_DOUBLE_HEIGHT:   [GS, 0x21, 0x01],
  SIZE_DOUBLE_WIDTH:    [GS, 0x21, 0x10],

  // Cut: GS V m  — 0=full, 1=partial, 65=full-after-feed, 66=partial-after-feed
  CUT_FULL:         [GS, 0x56, 0x00],
  CUT_PARTIAL:      [GS, 0x56, 0x01],
  CUT_FULL_FEED:    [GS, 0x56, 0x41, 0x03],
  CUT_PARTIAL_FEED: [GS, 0x56, 0x42, 0x03],

  // Cash drawer: ESC p m t1 t2 — pulse pin m (0/1) t1=on t2=off (x2ms)
  KICK_DRAWER_1:    [ESC, 0x70, 0x00, 0x19, 0xFA],
  KICK_DRAWER_2:    [ESC, 0x70, 0x01, 0x19, 0xFA],

  // Code page selection: ESC t n
  CP_PC437:         [ESC, 0x74, 0x00],
  CP_KATAKANA:      [ESC, 0x74, 0x01],
  CP_PC850:         [ESC, 0x74, 0x02],
  CP_PC860:         [ESC, 0x74, 0x03],
  CP_PC863:         [ESC, 0x74, 0x04],
  CP_PC865:         [ESC, 0x74, 0x05],
  CP_PC862_HEBREW:  [ESC, 0x74, 0x0F],   // Hebrew DOS — 15
  CP_PC858:         [ESC, 0x74, 0x13],
  CP_UTF8:          [ESC, 0x74, 0xFF],   // Some printers accept this

  // International character set: ESC R n
  INTL_USA:         [ESC, 0x52, 0x00],
  INTL_ISRAEL:      [ESC, 0x52, 0x07],   // Hebrew

  // Line spacing
  DEFAULT_LINE_SPACING: [ESC, 0x32],
  SET_LINE_SPACING:     [ESC, 0x33],     // + n
});

// ───────────────────────────────────────────────────────────────
// CP862 (Hebrew DOS) encoder
// ───────────────────────────────────────────────────────────────
// Unicode Hebrew block U+05D0..U+05EA maps to CP862 0x80..0x9A.
// We also support some common Latin-1 chars for mixed content.
//

const HEBREW_CP862_TABLE = (() => {
  const t = new Map();
  // ASCII passes through untouched (0x00..0x7F).
  for (let i = 0; i < 0x80; i++) t.set(i, i);

  // Hebrew alphabet: U+05D0 (Alef) .. U+05EA (Tav)  →  0x80..0x9A
  const hebStart = 0x05D0;
  for (let i = 0; i <= 0x1A; i++) {
    t.set(hebStart + i, 0x80 + i);
  }

  // A few accented and box-drawing chars — keep as '?' fallback otherwise.
  // Niqqud & combining marks are dropped (CP862 doesn't have them).
  return t;
})();

/**
 * Encode a JS string to a Buffer in CP862 (Hebrew DOS).
 * Characters not in the table become '?' (0x3F).
 */
function encodeCP862(str) {
  if (typeof str !== 'string') str = String(str || '');
  const out = [];
  for (const ch of str) {
    const code = ch.codePointAt(0);
    // Skip combining niqqud & cantillation marks entirely
    if (code >= 0x0591 && code <= 0x05C7) continue;
    const mapped = HEBREW_CP862_TABLE.get(code);
    if (mapped !== undefined) {
      out.push(mapped);
    } else if (code < 0x80) {
      out.push(code);
    } else {
      out.push(0x3F);  // '?'
    }
  }
  return Buffer.from(out);
}

/**
 * Detect if a string contains Hebrew characters.
 */
function hasHebrew(str) {
  if (typeof str !== 'string') return false;
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c >= 0x0590 && c <= 0x05FF) return true;
  }
  return false;
}

/**
 * RTL visual reversal for a single line.
 *
 * ESC/POS printers don't understand BiDi. When printing mixed Hebrew+numbers
 * we have to pre-reverse the Hebrew runs while keeping numbers/punctuation
 * in their logical order within their own run. This is a simplified BiDi:
 *
 *   "חשבונית 1234"  →  logical order for left-to-right stream
 *                      becomes visually correct when reversed as a whole:
 *                   →  "4321 תינובשח"  (wrong, numbers reversed)
 *
 * Proper algorithm: reverse Hebrew runs only, keep numeric runs as-is,
 * then reverse the line order of runs.
 */
function rtlReverse(line) {
  if (typeof line !== 'string') return '';
  if (!hasHebrew(line)) return line;

  // Split into runs: Hebrew-run, Latin/digit-run, whitespace-run
  const runs = [];
  let buf = '';
  let kind = null;   // 'heb' | 'ltr' | 'ws'
  const kindOf = (c) => {
    const code = c.codePointAt(0);
    if (code >= 0x0590 && code <= 0x05FF) return 'heb';
    if (c === ' ' || c === '\t') return 'ws';
    return 'ltr';
  };
  for (const ch of line) {
    const k = kindOf(ch);
    if (k === kind) {
      buf += ch;
    } else {
      if (buf) runs.push([kind, buf]);
      buf = ch;
      kind = k;
    }
  }
  if (buf) runs.push([kind, buf]);

  // Reverse the order of runs; for Hebrew runs also reverse chars internally
  // (because we've already inverted line direction).
  const reversed = [];
  for (let i = runs.length - 1; i >= 0; i--) {
    const [k, s] = runs[i];
    if (k === 'heb') {
      reversed.push([...s].reverse().join(''));
    } else {
      reversed.push(s);
    }
  }
  return reversed.join('');
}

// ───────────────────────────────────────────────────────────────
// Barcode helpers
// ───────────────────────────────────────────────────────────────

const BARCODE_TYPES = Object.freeze({
  UPC_A:    0x41,   // 65
  UPC_E:    0x42,   // 66
  EAN13:    0x43,   // 67
  EAN8:     0x44,   // 68
  CODE39:   0x45,   // 69
  ITF:      0x46,   // 70
  CODABAR:  0x47,   // 71
  CODE93:   0x48,   // 72
  CODE128:  0x49,   // 73
});

function resolveBarcodeType(t) {
  if (typeof t === 'number') return t;
  // Normalise "EAN-13" / "ean13" / "UPC_A" / "upc a" → "EAN13" / "UPCA" etc.
  // We accept either a hyphen or an underscore as a word separator, and we
  // ALSO accept the hyphen-less form ("EAN13").
  const raw = String(t || '').toUpperCase().trim();
  const candidates = [
    raw,
    raw.replace(/-/g, '_'),
    raw.replace(/-/g, ''),
    raw.replace(/[-_ ]/g, ''),
  ];
  for (const key of candidates) {
    if (key in BARCODE_TYPES) return BARCODE_TYPES[key];
  }
  throw new Error(`Unknown barcode type: ${t}`);
}

// ───────────────────────────────────────────────────────────────
// ThermalPrinter — command-builder / transport-driver
// ───────────────────────────────────────────────────────────────

class ThermalPrinter {
  /**
   * @param {Object} opts
   * @param {'usb'|'network'|'lpt'|'file'} [opts.transport='file']
   * @param {string} [opts.host]       for network
   * @param {number} [opts.port=9100]  for network
   * @param {string} [opts.path]       for file / lpt
   * @param {string} [opts.device]     for usb (e.g. "COM3" / "/dev/usb/lp0")
   * @param {string} [opts.encoding='cp862'|'utf8']
   * @param {number} [opts.width=48]   chars per line (48 for 80mm, 32 for 58mm)
   * @param {number} [opts.timeoutMs=5000]
   */
  constructor(opts = {}) {
    this.transport = opts.transport || 'file';
    this.host      = opts.host || '127.0.0.1';
    this.port      = opts.port || 9100;
    this.filePath  = opts.path || null;
    this.device    = opts.device || null;
    this.encoding  = opts.encoding || 'cp862';
    this.width     = Number.isInteger(opts.width) ? opts.width : 48;
    this.timeoutMs = opts.timeoutMs || 5000;

    /** @type {Buffer[]} */
    this._chunks = [];
  }

  // ── low-level chunk management ──
  _push(bytes) {
    if (Buffer.isBuffer(bytes)) this._chunks.push(bytes);
    else this._chunks.push(Buffer.from(bytes));
    return this;
  }

  clear() {
    this._chunks = [];
    return this;
  }

  /** Return the full byte stream collected so far. */
  getBuffer() {
    return Buffer.concat(this._chunks);
  }

  /** Hex dump for debugging. */
  getHex() {
    return this.getBuffer().toString('hex');
  }

  // ── ESC/POS primitives ──

  init() {
    this._push(CMD.INIT);
    // For Hebrew printers default to CP862 + Israel intl set.
    if (this.encoding === 'cp862') {
      this._push(CMD.CP_PC862_HEBREW);
      this._push(CMD.INTL_ISRAEL);
    }
    return this;
  }

  text(str) {
    if (str === undefined || str === null) return this;
    str = String(str);
    let buf;
    if (this.encoding === 'cp862') {
      // For any line that contains Hebrew, apply RTL reversal before encoding.
      const processed = str
        .split('\n')
        .map((l) => rtlReverse(l))
        .join('\n');
      buf = encodeCP862(processed);
    } else {
      buf = Buffer.from(str, 'utf8');
    }
    this._push(buf);
    return this;
  }

  /** Append text + LF. */
  line(str) {
    return this.text(str == null ? '' : str).lf();
  }

  /** Append linefeed. */
  lf() { return this._push(CMD.LF); }

  /** Append carriage return. */
  cr() { return this._push(CMD.CR); }

  bold(on) {
    return this._push(on ? CMD.BOLD_ON : CMD.BOLD_OFF);
  }

  underline(mode) {
    if (mode === 0 || mode === false || mode == null) return this._push(CMD.UNDERLINE_OFF);
    if (mode === 1 || mode === true)                  return this._push(CMD.UNDERLINE_1);
    if (mode === 2)                                   return this._push(CMD.UNDERLINE_2);
    throw new Error(`Bad underline mode: ${mode}`);
  }

  align(mode) {
    switch (String(mode || 'left').toLowerCase()) {
      case 'left':   return this._push(CMD.ALIGN_LEFT);
      case 'center': return this._push(CMD.ALIGN_CENTER);
      case 'right':  return this._push(CMD.ALIGN_RIGHT);
      default: throw new Error(`Bad align: ${mode}`);
    }
  }

  size(mode) {
    switch (String(mode || 'normal').toLowerCase()) {
      case 'normal':        return this._push(CMD.SIZE_NORMAL);
      case 'double':        return this._push(CMD.SIZE_DOUBLE);
      case 'double_height': return this._push(CMD.SIZE_DOUBLE_HEIGHT);
      case 'double_width':  return this._push(CMD.SIZE_DOUBLE_WIDTH);
      default: throw new Error(`Bad size: ${mode}`);
    }
  }

  /** Feed n lines — ESC J n  (n * 1/180 inch). We use LF replication for
   *  portability: ESC d n  → better, but some printers accept ESC J n. */
  feed(n) {
    const count = Math.max(0, Math.min(255, Number(n) || 1));
    // ESC d n  → feed n lines (more widely supported than ESC J)
    this._push([ESC, 0x64, count]);
    return this;
  }

  cut(mode) {
    const m = String(mode || 'full').toLowerCase();
    if (m === 'full')    return this._push(CMD.CUT_FULL_FEED);
    if (m === 'partial') return this._push(CMD.CUT_PARTIAL_FEED);
    throw new Error(`Bad cut mode: ${mode}`);
  }

  /**
   * GS k m d1..dk NUL   (legacy format)
   * GS k m n d1..dn     (new format for CODE128 etc.)
   */
  barcode(type, data, opts = {}) {
    const typeByte = resolveBarcodeType(type);
    const dataStr = String(data == null ? '' : data);

    // Optional: height + width + HRI position
    if (opts.height !== undefined) {
      const h = Math.max(1, Math.min(255, opts.height | 0));
      this._push([GS, 0x68, h]);             // GS h n
    }
    if (opts.width !== undefined) {
      const w = Math.max(2, Math.min(6, opts.width | 0));
      this._push([GS, 0x77, w]);             // GS w n
    }
    if (opts.hri !== undefined) {
      // 0=none 1=above 2=below 3=both
      this._push([GS, 0x48, opts.hri | 0]);  // GS H n
    }

    // For CODE128 use the "new" format:  GS k 73 n d1..dn
    if (typeByte >= 0x41) {
      const payload = Buffer.from(dataStr, 'ascii');
      this._push([GS, 0x6B, typeByte, payload.length]);
      this._push(payload);
    } else {
      const payload = Buffer.from(dataStr, 'ascii');
      this._push([GS, 0x6B, typeByte]);
      this._push(payload);
      this._push([NUL]);
    }
    return this;
  }

  /**
   * QR code — GS ( k (three sub-commands: size, ECL, store, print).
   */
  qrcode(data, opts = {}) {
    const str = String(data == null ? '' : data);
    const size = Math.max(1, Math.min(16, opts.size || 6));
    // ECL: 48=L 49=M 50=Q 51=H
    const ecl = opts.ecl === 'H' ? 51
              : opts.ecl === 'Q' ? 50
              : opts.ecl === 'M' ? 49
              : 48;

    // fn 165 — model
    this._push([GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]);
    // fn 167 — module size
    this._push([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, size]);
    // fn 169 — error correction level
    this._push([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, ecl]);
    // fn 180 — store data in symbol storage area
    const payload = Buffer.from(str, 'utf8');
    const pL = (payload.length + 3) & 0xFF;
    const pH = ((payload.length + 3) >> 8) & 0xFF;
    this._push([GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]);
    this._push(payload);
    // fn 181 — print the symbol
    this._push([GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]);
    return this;
  }

  /**
   * Print a pre-stored NV logo using GS ( L.
   * image arg can be:
   *   - { keyCode1, keyCode2 }  — NV logo key (recommended)
   *   - Buffer / raw bytes     — raster image (passed through)
   */
  logo(image, opts = {}) {
    if (image && typeof image === 'object' && 'keyCode1' in image) {
      const k1 = image.keyCode1 & 0xFF;
      const k2 = image.keyCode2 & 0xFF;
      const x  = (opts.scaleX || 1) & 0xFF;
      const y  = (opts.scaleY || 1) & 0xFF;
      // fn 69 — print NV graphics by key code
      this._push([GS, 0x28, 0x4C, 0x06, 0x00, 0x30, 0x45, k1, k2, x, y]);
      return this;
    }
    if (Buffer.isBuffer(image)) {
      this._push(image);
      return this;
    }
    // No-op if nothing recognizable.
    return this;
  }

  /** ESC p — open cash drawer on pin 0 or 1. */
  cashDrawer(pin = 0) {
    if (pin === 1) return this._push(CMD.KICK_DRAWER_2);
    return this._push(CMD.KICK_DRAWER_1);
  }

  // ── helpers for layout ──

  /**
   * Write a two-column row: left text + right text, padded to column width.
   */
  row(left, right, colWidth = this.width) {
    const l = String(left == null ? '' : left);
    const r = String(right == null ? '' : right);
    const padLen = Math.max(1, colWidth - l.length - r.length);
    return this.line(l + ' '.repeat(padLen) + r);
  }

  /** Draw a horizontal separator row. */
  hr(ch = '-', width = this.width) {
    return this.line(String(ch).repeat(width));
  }

  // ── Transport dispatch ──

  /**
   * Send the accumulated buffer to the configured transport.
   * Returns a Promise that resolves with { bytes, transport } on success.
   */
  async send() {
    const buf = this.getBuffer();
    switch (this.transport) {
      case 'file':    return this._sendFile(buf);
      case 'network': return this._sendNetwork(buf);
      case 'lpt':     return this._sendLpt(buf);
      case 'usb':     return this._sendUsb(buf);
      default:
        throw new Error(`Unknown transport: ${this.transport}`);
    }
  }

  _sendFile(buf) {
    if (!this.filePath) throw new Error('file transport requires opts.path');
    const dir = path.dirname(this.filePath);
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.filePath, buf);
    return Promise.resolve({ bytes: buf.length, transport: 'file', path: this.filePath });
  }

  _sendNetwork(buf) {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;
      const finish = (err, val) => {
        if (settled) return;
        settled = true;
        try { socket.destroy(); } catch (_) { /* noop */ }
        if (err) reject(err); else resolve(val);
      };
      const timer = setTimeout(
        () => finish(new Error(`Network printer timeout (${this.timeoutMs}ms)`)),
        this.timeoutMs
      );
      socket.on('error', (e) => { clearTimeout(timer); finish(e); });
      socket.connect(this.port, this.host, () => {
        socket.write(buf, (err) => {
          clearTimeout(timer);
          if (err) return finish(err);
          finish(null, { bytes: buf.length, transport: 'network',
                         host: this.host, port: this.port });
        });
      });
    });
  }

  _sendLpt(buf) {
    // Windows: COPY /B file LPT1:  (via child_process)
    if (!this.filePath) {
      // write to temp file then spool
      this.filePath = path.join(
        require('os').tmpdir(),
        `onyx-esc-${Date.now()}.bin`
      );
    }
    fs.writeFileSync(this.filePath, buf);
    return new Promise((resolve, reject) => {
      const device = this.device || 'LPT1';
      const isWin = process.platform === 'win32';
      const cmd = isWin
        ? ['cmd', ['/c', `copy /B "${this.filePath}" ${device}:`]]
        : ['sh',  ['-c', `cat "${this.filePath}" > /dev/${device.toLowerCase()}`]];
      const proc = spawn(cmd[0], cmd[1], { stdio: 'ignore' });
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) {
          resolve({ bytes: buf.length, transport: 'lpt', device });
        } else {
          reject(new Error(`LPT spool exited with code ${code}`));
        }
      });
    });
  }

  /**
   * USB transport — STUB only. Real USB ESC/POS requires either:
   *   - node-escpos-usb (native, needs libusb)
   *   - serialport package for COM/VCP-backed printers
   * This stub writes to a file and logs, so callers can wire in their own
   * USB driver without changing the rest of the system.
   */
  _sendUsb(buf) {
    const target = this.filePath || `./usb-stub-${Date.now()}.bin`;
    fs.writeFileSync(target, buf);
    // eslint-disable-next-line no-console
    console.warn(
      '[thermal-printer] USB transport is a stub. Wrote %d bytes to %s. ' +
      'Integrate node-serialport or node-escpos-usb to actually print.',
      buf.length, target
    );
    return Promise.resolve({ bytes: buf.length, transport: 'usb-stub', path: target });
  }
}

// ───────────────────────────────────────────────────────────────
// ReceiptBuilder — high-level API on top of ThermalPrinter
// ───────────────────────────────────────────────────────────────

/**
 * Convenience builder for a typical retail receipt.
 *
 *   new ReceiptBuilder(printer, { store, ... })
 *     .header()
 *     .items(items)
 *     .totals(totals)
 *     .footer()
 *     .cut();
 */
class ReceiptBuilder {
  constructor(printer, store = {}) {
    this.p = printer;
    this.store = Object.assign({
      name:    'חנות',
      address: '',
      phone:   '',
      vatId:   '',
      website: '',
    }, store);
  }

  header(title = 'קבלה') {
    const p = this.p;
    p.init().align('center').size('double').bold(true);
    p.line(this.store.name);
    p.size('normal').bold(false);
    if (this.store.address) p.line(this.store.address);
    if (this.store.phone)   p.line(`טל: ${this.store.phone}`);
    if (this.store.vatId)   p.line(`ח.פ: ${this.store.vatId}`);
    p.hr('=');
    p.bold(true).line(title).bold(false);
    p.hr('-');
    p.align('left');
    return this;
  }

  /**
   * items: [{ qty, desc, price, total? }]
   * Line format:   qty x desc                              price
   */
  items(items = []) {
    const p = this.p;
    for (const it of items) {
      const qty   = Number(it.qty || 1);
      const price = Number(it.price || 0);
      const total = Number(it.total != null ? it.total : qty * price);
      const left  = `${qty} x ${it.desc || ''}`;
      const right = total.toFixed(2);
      p.row(left, right);
      if (it.note) {
        p.line('  ' + it.note);
      }
    }
    return this;
  }

  /**
   * totals: { subtotal, vat, vatRate, total, tip?, paid?, change?, method? }
   */
  totals(t = {}) {
    const p = this.p;
    p.hr('-');
    if (t.subtotal != null) p.row('סה"כ ביניים', Number(t.subtotal).toFixed(2));
    if (t.vat != null) {
      const label = t.vatRate != null ? `מע"מ ${t.vatRate}%` : 'מע"מ';
      p.row(label, Number(t.vat).toFixed(2));
    }
    if (t.tip != null)   p.row('טיפ', Number(t.tip).toFixed(2));
    p.hr('=');
    if (t.total != null) {
      p.bold(true).size('double_height');
      p.row('סה"כ לתשלום', Number(t.total).toFixed(2));
      p.size('normal').bold(false);
    }
    if (t.method) p.line(`אמצעי תשלום: ${t.method}`);
    if (t.paid   != null) p.row('שולם',  Number(t.paid).toFixed(2));
    if (t.change != null) p.row('עודף', Number(t.change).toFixed(2));
    return this;
  }

  /**
   * Add a QR payment link (e.g. refund portal) and EAN barcode of receipt #.
   */
  codes({ qr, barcode, barcodeType = 'CODE128' } = {}) {
    const p = this.p;
    p.feed(1).align('center');
    if (qr) {
      p.qrcode(qr, { size: 6, ecl: 'M' });
      p.feed(1);
    }
    if (barcode) {
      p.barcode(barcodeType, barcode, { height: 80, width: 2, hri: 2 });
      p.feed(1);
    }
    p.align('left');
    return this;
  }

  footer(note = 'תודה רבה!  נא לשמור את הקבלה.') {
    const p = this.p;
    p.hr('-').align('center').line(note);
    if (this.store.website) p.line(this.store.website);
    p.line(new Date().toLocaleString('he-IL'));
    p.feed(3);
    return this;
  }

  cut(mode = 'full') {
    this.p.cut(mode);
    return this;
  }
}

// ───────────────────────────────────────────────────────────────
// Pre-made Templates
// ───────────────────────────────────────────────────────────────

const Templates = {
  /**
   * Full retail receipt (קבלה).
   *   args: { store, items, totals, qr, barcode, footerNote }
   */
  receipt(printer, args = {}) {
    const rb = new ReceiptBuilder(printer, args.store || {});
    rb.header('קבלה')
      .items(args.items || [])
      .totals(args.totals || {})
      .codes({ qr: args.qr, barcode: args.barcode })
      .footer(args.footerNote)
      .cut('full');
    return printer;
  },

  /**
   * Short 80mm invoice (חשבונית) — more compact, with invoice number.
   */
  invoice(printer, args = {}) {
    const p = printer;
    const store = args.store || {};
    const { invoiceNo, date, customer, items = [], totals = {} } = args;

    p.init().align('center').bold(true).size('double');
    p.line(store.name || 'חשבונית');
    p.size('normal').bold(false);
    if (store.vatId) p.line(`ח.פ ${store.vatId}`);
    p.hr('=');

    p.align('right').bold(true).line(`חשבונית מס: ${invoiceNo || '-'}`);
    p.bold(false);
    p.line(`תאריך: ${date || new Date().toLocaleDateString('he-IL')}`);
    if (customer) {
      p.hr('-');
      p.line(`לקוח: ${customer.name || ''}`);
      if (customer.vatId)   p.line(`ח.פ: ${customer.vatId}`);
      if (customer.address) p.line(customer.address);
    }
    p.align('left').hr('-');
    // items
    for (const it of items) {
      const qty   = Number(it.qty || 1);
      const price = Number(it.price || 0);
      const total = Number(it.total != null ? it.total : qty * price);
      p.row(`${qty} x ${it.desc || ''}`, total.toFixed(2));
    }
    p.hr('-');
    if (totals.subtotal != null) p.row('סה"כ ביניים', Number(totals.subtotal).toFixed(2));
    if (totals.vat != null) {
      const lbl = totals.vatRate != null ? `מע"מ ${totals.vatRate}%` : 'מע"מ';
      p.row(lbl, Number(totals.vat).toFixed(2));
    }
    p.hr('=');
    if (totals.total != null) {
      p.bold(true).size('double_height');
      p.row('סה"כ', Number(totals.total).toFixed(2));
      p.size('normal').bold(false);
    }
    if (args.qr) {
      p.feed(1).align('center').qrcode(args.qr, { size: 6, ecl: 'M' });
    }
    p.feed(2).align('center').line('חתימה דיגיטלית — מסמך מקור');
    p.feed(3).cut('full');
    return p;
  },

  /**
   * Kitchen order (הזמנה למטבח) — big, no prices.
   */
  kitchenOrder(printer, args = {}) {
    const p = printer;
    const { table, waiter, orderNo, items = [], notes } = args;

    p.init().align('center').size('double').bold(true);
    p.line('הזמנה למטבח');
    p.size('normal');
    p.hr('=');
    p.align('right');
    if (orderNo != null) p.line(`הזמנה # ${orderNo}`);
    if (table   != null) p.line(`שולחן: ${table}`);
    if (waiter)          p.line(`מלצר: ${waiter}`);
    p.line(new Date().toLocaleTimeString('he-IL'));
    p.bold(false).hr('-');

    p.align('left').size('double_height').bold(true);
    for (const it of items) {
      p.line(`${it.qty || 1} x ${it.desc || ''}`);
      if (it.note) {
        p.size('normal').line('  -> ' + it.note).size('double_height');
      }
    }
    p.size('normal').bold(false);
    if (notes) {
      p.hr('-').line('הערות כלליות:').line(notes);
    }
    p.feed(3).cut('partial');
    return p;
  },

  /**
   * Delivery note (תעודת משלוח) — items without prices; signature area.
   */
  deliveryNote(printer, args = {}) {
    const p = printer;
    const store = args.store || {};
    const { noteNo, date, recipient, items = [], driver } = args;

    p.init().align('center').bold(true).size('double');
    p.line(store.name || 'תעודת משלוח');
    p.size('normal').bold(false);
    if (store.address) p.line(store.address);
    if (store.phone)   p.line(`טל: ${store.phone}`);
    p.hr('=');
    p.align('right');
    p.bold(true).line(`תעודת משלוח: ${noteNo || '-'}`).bold(false);
    p.line(`תאריך: ${date || new Date().toLocaleDateString('he-IL')}`);
    if (recipient) {
      p.hr('-').line(`נמען: ${recipient.name || ''}`);
      if (recipient.address) p.line(recipient.address);
      if (recipient.phone)   p.line(`טל: ${recipient.phone}`);
    }
    p.align('left').hr('-');
    for (const it of items) {
      p.row(`${it.qty || 1} x ${it.desc || ''}`, it.sku ? String(it.sku) : '');
    }
    p.hr('-');
    if (driver) p.line(`נהג: ${driver}`);
    p.feed(2).line('חתימת מקבל: ____________________');
    p.feed(1).line('תאריך ושעה:  ____________________');
    p.feed(3).cut('full');
    return p;
  },
};

// ───────────────────────────────────────────────────────────────
// Convenience top-level helper for the most common flow.
// ───────────────────────────────────────────────────────────────

/**
 * Build a receipt buffer (without sending) — handy for tests and previews.
 *
 * @param {Object} items      receipt items
 * @param {Object} totals     totals block
 * @param {Object} [opts]     { store, width, encoding, qr, barcode, footerNote }
 * @returns {Buffer}
 */
function generateReceipt(items, totals, opts = {}) {
  const p = new ThermalPrinter({
    transport: 'file',
    path:      opts.path || path.join(require('os').tmpdir(), `onyx-receipt-${Date.now()}.bin`),
    width:     opts.width || 48,
    encoding:  opts.encoding || 'cp862',
  });
  Templates.receipt(p, {
    store:      opts.store,
    items,
    totals,
    qr:         opts.qr,
    barcode:    opts.barcode,
    footerNote: opts.footerNote,
  });
  return p.getBuffer();
}

// ───────────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────────

module.exports = {
  // classes
  ThermalPrinter,
  ReceiptBuilder,

  // templates
  Templates,

  // helpers
  generateReceipt,
  encodeCP862,
  rtlReverse,
  hasHebrew,
  resolveBarcodeType,

  // constants (exported for testing + advanced callers)
  CMD,
  BARCODE_TYPES,
  ESC, GS, FS, LF, CR, HT, NUL,
};
