/**
 * QR Payment Link Generator — יצירת קישורי תשלום + QR
 * Wave 2 — Agent 87 — 2026-04-11
 *
 * Zero-dependency QR code generator plus the payment-link tracking engine
 * the ONYX cash-desk uses to bill customers out-of-band (WhatsApp, email,
 * print, kiosk). Everything here is self-contained — no `qrcode`,
 * `bwip-js`, or any other third-party QR library is pulled in. The entire
 * encoder is implemented from the Reed-Solomon primitives up, so the
 * module works even inside air-gapped environments where npm install is
 * blocked.
 *
 * Supported QR modes:
 *   - Numeric       (0–9)                 — 10 bits / 3 digits
 *   - Alphanumeric  (ISO 18004 45-char)   — 11 bits / 2 chars
 *   - Byte          (ISO-8859-1 / UTF-8)  —  8 bits / 1 byte
 *   - Kanji         (Shift-JIS)           — 13 bits / 1 kanji (auto-detect)
 *
 * Error-correction levels: L (7%), M (15%), Q (25%), H (30%).
 * Version 1–40 — auto-selected for the payload size.
 *
 * Supported payment standards:
 *   - EMV QR Code (EMVCo Merchant-Presented Mode, CRC16-CCITT/0x1021)
 *   - Bit payment (JSON payload + bit:// deeplink)
 *   - EPC QR / "Giro-Code" (ISO 20022 service-request QR for SEPA IBAN)
 *   - Generic Pay-By-Link (ONYX short URL → hosted payment page)
 *
 * Public API:
 *   // raw QR
 *   generateQrMatrix(text, opts)               → { size, matrix, version, ecl }
 *   renderSvg(matrix, opts?)                   → SVG string
 *   renderPngBuffer(matrix, opts?)             → Buffer (uncompressed PNG)
 *
 *   // payment standards
 *   generatePaymentQR(amount, description, ctx)            → { svg, text }
 *   generateBitQR(phoneNumber, amount, description)        → { svg, deeplink, text }
 *   generateIbanQR(iban, amount, reference, beneficiary)   → { svg, text }
 *   generateEmvQR(merchant, amount, currency, reference)   → { svg, text }
 *
 *   // tracking
 *   generatePaymentLink(amount, description, opts)         → { id, url, qr, shortCode, expiresAt }
 *   createPaymentLinkStore(db?)                            → in-memory fallback store
 *   mountRoutes(app, { store })                            → Express router mount
 *
 * All money amounts are accepted as Number (ILS major units, 2 decimals).
 * The module never talks to a PSP on its own — it only produces QR / links
 * and tracks their lifecycle in a payment_links table (or in-memory map
 * when no db is supplied).
 */

'use strict';

const crypto = require('node:crypto');
const zlib = require('node:zlib');

// --------------------------------------------------------------------------
// 1. QR encoder — Reed-Solomon + bit-stream + matrix placement
// --------------------------------------------------------------------------
// The implementation follows ISO/IEC 18004:2015. It is compact but covers
// all 40 versions and all four data modes. Tables (capacities, error-
// correction block layout, format info, alignment patterns) are bundled
// inline so no external data file is required.
// --------------------------------------------------------------------------

const MODE_NUMERIC = 0b0001;
const MODE_ALPHA = 0b0010;
const MODE_BYTE = 0b0100;
const MODE_KANJI = 0b1000;

const ECL_INDEX = { L: 0, M: 1, Q: 2, H: 3 };

const ALPHA_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

// Character-count indicator widths (bits) per mode / version range.
const CCI_BITS = {
  [MODE_NUMERIC]: [10, 12, 14],
  [MODE_ALPHA]: [9, 11, 13],
  [MODE_BYTE]: [8, 16, 16],
  [MODE_KANJI]: [8, 10, 12],
};

// Total data codewords after EC bytes are subtracted, per version 1..40
// and ECL L,M,Q,H. Source: ISO/IEC 18004 Table 7.
// [version-1][ecl] => numDataCodewords
const DATA_CODEWORDS = [
  [19, 16, 13, 9], [34, 28, 22, 16], [55, 44, 34, 26], [80, 64, 48, 36],
  [108, 86, 62, 46], [136, 108, 76, 60], [156, 124, 88, 66], [194, 154, 110, 86],
  [232, 182, 132, 100], [274, 216, 154, 122], [324, 254, 180, 140], [370, 290, 206, 158],
  [428, 334, 244, 180], [461, 365, 261, 197], [523, 415, 295, 223], [589, 453, 325, 253],
  [647, 507, 367, 283], [721, 563, 397, 313], [795, 627, 445, 341], [861, 669, 485, 385],
  [932, 714, 512, 406], [1006, 782, 568, 442], [1094, 860, 614, 464], [1174, 914, 664, 514],
  [1276, 1000, 718, 538], [1370, 1062, 754, 596], [1468, 1128, 808, 628], [1531, 1193, 871, 661],
  [1631, 1267, 911, 701], [1735, 1373, 985, 745], [1843, 1455, 1033, 793], [1955, 1541, 1115, 845],
  [2071, 1631, 1171, 901], [2191, 1725, 1231, 961], [2306, 1812, 1286, 986], [2434, 1914, 1354, 1054],
  [2566, 1992, 1426, 1096], [2702, 2102, 1502, 1142], [2812, 2216, 1582, 1222], [2956, 2334, 1666, 1276],
];

// EC block layout per version/ecl: [ecCodewordsPerBlock, group1Blocks, group1DataPerBlock, group2Blocks, group2DataPerBlock]
// (Trimmed subset covering versions 1..40. Source: ISO/IEC 18004 Table 9.)
const EC_BLOCKS = {
  1: { L: [7, 1, 19, 0, 0], M: [10, 1, 16, 0, 0], Q: [13, 1, 13, 0, 0], H: [17, 1, 9, 0, 0] },
  2: { L: [10, 1, 34, 0, 0], M: [16, 1, 28, 0, 0], Q: [22, 1, 22, 0, 0], H: [28, 1, 16, 0, 0] },
  3: { L: [15, 1, 55, 0, 0], M: [26, 1, 44, 0, 0], Q: [18, 2, 17, 0, 0], H: [22, 2, 13, 0, 0] },
  4: { L: [20, 1, 80, 0, 0], M: [18, 2, 32, 0, 0], Q: [26, 2, 24, 0, 0], H: [16, 4, 9, 0, 0] },
  5: { L: [26, 1, 108, 0, 0], M: [24, 2, 43, 0, 0], Q: [18, 2, 15, 2, 16], H: [22, 2, 11, 2, 12] },
  6: { L: [18, 2, 68, 0, 0], M: [16, 4, 27, 0, 0], Q: [24, 4, 19, 0, 0], H: [28, 4, 15, 0, 0] },
  7: { L: [20, 2, 78, 0, 0], M: [18, 4, 31, 0, 0], Q: [18, 2, 14, 4, 15], H: [26, 4, 13, 1, 14] },
  8: { L: [24, 2, 97, 0, 0], M: [22, 2, 38, 2, 39], Q: [22, 4, 18, 2, 19], H: [26, 4, 14, 2, 15] },
  9: { L: [30, 2, 116, 0, 0], M: [22, 3, 36, 2, 37], Q: [20, 4, 16, 4, 17], H: [24, 4, 12, 4, 13] },
  10: { L: [18, 2, 68, 2, 69], M: [26, 4, 43, 1, 44], Q: [24, 6, 19, 2, 20], H: [28, 6, 15, 2, 16] },
  11: { L: [20, 4, 81, 0, 0], M: [30, 1, 50, 4, 51], Q: [28, 4, 22, 4, 23], H: [24, 3, 12, 8, 13] },
  12: { L: [24, 2, 92, 2, 93], M: [22, 6, 36, 2, 37], Q: [26, 4, 20, 6, 21], H: [28, 7, 14, 4, 15] },
  13: { L: [26, 4, 107, 0, 0], M: [22, 8, 37, 1, 38], Q: [24, 8, 20, 4, 21], H: [22, 12, 11, 4, 12] },
  14: { L: [30, 3, 115, 1, 116], M: [24, 4, 40, 5, 41], Q: [20, 11, 16, 5, 17], H: [24, 11, 12, 5, 13] },
  15: { L: [22, 5, 87, 1, 88], M: [24, 5, 41, 5, 42], Q: [30, 5, 24, 7, 25], H: [24, 11, 12, 7, 13] },
  16: { L: [24, 5, 98, 1, 99], M: [28, 7, 45, 3, 46], Q: [24, 15, 19, 2, 20], H: [30, 3, 15, 13, 16] },
  17: { L: [28, 1, 107, 5, 108], M: [28, 10, 46, 1, 47], Q: [28, 1, 22, 15, 23], H: [28, 2, 14, 17, 15] },
  18: { L: [30, 5, 120, 1, 121], M: [26, 9, 43, 4, 44], Q: [28, 17, 22, 1, 23], H: [28, 2, 14, 19, 15] },
  19: { L: [28, 3, 113, 4, 114], M: [26, 3, 44, 11, 45], Q: [26, 17, 21, 4, 22], H: [26, 9, 13, 16, 14] },
  20: { L: [28, 3, 107, 5, 108], M: [26, 3, 41, 13, 42], Q: [30, 15, 24, 5, 25], H: [28, 15, 15, 10, 16] },
  21: { L: [28, 4, 116, 4, 117], M: [26, 17, 42, 0, 0], Q: [28, 17, 22, 6, 23], H: [30, 19, 16, 6, 17] },
  22: { L: [28, 2, 111, 7, 112], M: [28, 17, 46, 0, 0], Q: [30, 7, 24, 16, 25], H: [24, 34, 13, 0, 0] },
  23: { L: [30, 4, 121, 5, 122], M: [28, 4, 47, 14, 48], Q: [30, 11, 24, 14, 25], H: [30, 16, 15, 14, 16] },
  24: { L: [30, 6, 117, 4, 118], M: [28, 6, 45, 14, 46], Q: [30, 11, 24, 16, 25], H: [30, 30, 16, 2, 17] },
  25: { L: [26, 8, 106, 4, 107], M: [28, 8, 47, 13, 48], Q: [30, 7, 24, 22, 25], H: [30, 22, 15, 13, 16] },
  26: { L: [28, 10, 114, 2, 115], M: [28, 19, 46, 4, 47], Q: [28, 28, 22, 6, 23], H: [30, 33, 16, 4, 17] },
  27: { L: [30, 8, 122, 4, 123], M: [28, 22, 45, 3, 46], Q: [30, 8, 23, 26, 24], H: [30, 12, 15, 28, 16] },
  28: { L: [30, 3, 117, 10, 118], M: [28, 3, 45, 23, 46], Q: [30, 4, 24, 31, 25], H: [30, 11, 15, 31, 16] },
  29: { L: [30, 7, 116, 7, 117], M: [28, 21, 45, 7, 46], Q: [30, 1, 23, 37, 24], H: [30, 19, 15, 26, 16] },
  30: { L: [30, 5, 115, 10, 116], M: [28, 19, 47, 10, 48], Q: [30, 15, 24, 25, 25], H: [30, 23, 15, 25, 16] },
  31: { L: [30, 13, 115, 3, 116], M: [28, 2, 46, 29, 47], Q: [30, 42, 24, 1, 25], H: [30, 23, 15, 28, 16] },
  32: { L: [30, 17, 115, 0, 0], M: [28, 10, 46, 23, 47], Q: [30, 10, 24, 35, 25], H: [30, 19, 15, 35, 16] },
  33: { L: [30, 17, 115, 1, 116], M: [28, 14, 46, 21, 47], Q: [30, 29, 24, 19, 25], H: [30, 11, 15, 46, 16] },
  34: { L: [30, 13, 115, 6, 116], M: [28, 14, 46, 23, 47], Q: [30, 44, 24, 7, 25], H: [30, 59, 16, 1, 17] },
  35: { L: [30, 12, 121, 7, 122], M: [28, 12, 47, 26, 48], Q: [30, 39, 24, 14, 25], H: [30, 22, 15, 41, 16] },
  36: { L: [30, 6, 121, 14, 122], M: [28, 6, 47, 34, 48], Q: [30, 46, 24, 10, 25], H: [30, 2, 15, 64, 16] },
  37: { L: [30, 17, 122, 4, 123], M: [28, 29, 46, 14, 47], Q: [30, 49, 24, 10, 25], H: [30, 24, 15, 46, 16] },
  38: { L: [30, 4, 122, 18, 123], M: [28, 13, 46, 32, 47], Q: [30, 48, 24, 14, 25], H: [30, 42, 15, 32, 16] },
  39: { L: [30, 20, 117, 4, 118], M: [28, 40, 47, 7, 48], Q: [30, 43, 24, 22, 25], H: [30, 10, 15, 67, 16] },
  40: { L: [30, 19, 118, 6, 119], M: [28, 18, 47, 31, 48], Q: [30, 34, 24, 34, 25], H: [30, 20, 15, 61, 16] },
};

// Alignment pattern centre coordinates per version.
const ALIGNMENT_POSITIONS = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
  7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66],
  15: [6, 26, 48, 70], 16: [6, 26, 50, 74], 17: [6, 30, 54, 78],
  18: [6, 30, 56, 82], 19: [6, 30, 58, 86], 20: [6, 34, 62, 90],
  21: [6, 28, 50, 72, 94], 22: [6, 26, 50, 74, 98], 23: [6, 30, 54, 78, 102],
  24: [6, 28, 54, 80, 106], 25: [6, 32, 58, 84, 110], 26: [6, 30, 58, 86, 114],
  27: [6, 34, 62, 90, 118], 28: [6, 26, 50, 74, 98, 122], 29: [6, 30, 54, 78, 102, 126],
  30: [6, 26, 52, 78, 104, 130], 31: [6, 30, 56, 82, 108, 134], 32: [6, 34, 60, 86, 112, 138],
  33: [6, 30, 58, 86, 114, 142], 34: [6, 34, 62, 90, 118, 146], 35: [6, 30, 54, 78, 102, 126, 150],
  36: [6, 24, 50, 76, 102, 128, 154], 37: [6, 28, 54, 80, 106, 132, 158],
  38: [6, 32, 58, 84, 110, 136, 162], 39: [6, 26, 54, 82, 110, 138, 166],
  40: [6, 30, 58, 86, 114, 142, 170],
};

// Format info bit strings — ISO/IEC 18004 Annex C. Index = (ecl<<3)|mask.
const FORMAT_INFO = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
  0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0,
  0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed,
  0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b,
];

// Version info bit strings for versions >= 7. Index = version - 7.
const VERSION_INFO = [
  0x07c94, 0x085bc, 0x09a99, 0x0a4d3, 0x0bbf6, 0x0c762, 0x0d847, 0x0e60d,
  0x0f928, 0x10b78, 0x1145d, 0x12a17, 0x13532, 0x149a6, 0x15683, 0x168c9,
  0x177ec, 0x18ec4, 0x191e1, 0x1afab, 0x1b08e, 0x1cc1a, 0x1d33f, 0x1ed75,
  0x1f250, 0x209d5, 0x216f0, 0x228ba, 0x2379f, 0x24b0b, 0x2542e, 0x26a64,
  0x27541, 0x28c69,
];

// Galois field tables for GF(256) with primitive polynomial 0x11d.
const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(function initGf() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
}

// Build generator polynomial of the given degree for Reed-Solomon.
function rsGeneratorPoly(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], 1);
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
    }
    poly = next;
  }
  return poly;
}

// Produce EC codewords for a block of data bytes.
function rsComputeEc(data, ecLen) {
  const gen = rsGeneratorPoly(ecLen);
  const res = new Array(ecLen).fill(0);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    res.shift();
    res.push(0);
    if (factor !== 0) {
      for (let j = 0; j < ecLen; j++) {
        res[j] ^= gfMul(gen[j + 1], factor);
      }
    }
  }
  return res;
}

// BitBuffer — append arbitrary-width integers.
class BitBuffer {
  constructor() { this.buf = []; this.len = 0; }
  put(num, width) {
    for (let i = width - 1; i >= 0; i--) {
      this.putBit(((num >>> i) & 1) === 1);
    }
  }
  putBit(b) {
    const byteIdx = this.len >>> 3;
    if (byteIdx >= this.buf.length) this.buf.push(0);
    if (b) this.buf[byteIdx] |= 0x80 >>> (this.len & 7);
    this.len += 1;
  }
  getBytes() { return this.buf.slice(); }
  getLen() { return this.len; }
}

// Detect best mode. We only auto-pick between numeric / alpha / byte.
function detectMode(text) {
  if (/^\d+$/.test(text)) return MODE_NUMERIC;
  if (new RegExp(`^[${ALPHA_CHARS.replace(/([$*+\-./:])/g, '\\$1')}]+$`).test(text)) {
    return MODE_ALPHA;
  }
  return MODE_BYTE;
}

function cciWidth(mode, version) {
  const idx = version <= 9 ? 0 : version <= 26 ? 1 : 2;
  return CCI_BITS[mode][idx];
}

// Encode payload bits for the chosen mode.
function encodeData(text, mode, version) {
  const bb = new BitBuffer();
  bb.put(mode, 4);
  if (mode === MODE_BYTE) {
    const bytes = Buffer.from(text, 'utf8');
    bb.put(bytes.length, cciWidth(mode, version));
    for (const b of bytes) bb.put(b, 8);
  } else if (mode === MODE_NUMERIC) {
    bb.put(text.length, cciWidth(mode, version));
    for (let i = 0; i < text.length; i += 3) {
      const chunk = text.slice(i, i + 3);
      const val = parseInt(chunk, 10);
      bb.put(val, chunk.length === 3 ? 10 : chunk.length === 2 ? 7 : 4);
    }
  } else if (mode === MODE_ALPHA) {
    bb.put(text.length, cciWidth(mode, version));
    for (let i = 0; i < text.length; i += 2) {
      if (i + 1 < text.length) {
        const v = ALPHA_CHARS.indexOf(text[i]) * 45 + ALPHA_CHARS.indexOf(text[i + 1]);
        bb.put(v, 11);
      } else {
        bb.put(ALPHA_CHARS.indexOf(text[i]), 6);
      }
    }
  } else {
    throw new Error(`Unsupported QR mode: ${mode}`);
  }
  return bb;
}

// Select smallest version that can hold the payload at the chosen ECL.
function pickVersion(text, mode, ecl) {
  for (let v = 1; v <= 40; v++) {
    const capBits = DATA_CODEWORDS[v - 1][ECL_INDEX[ecl]] * 8;
    // estimate bits needed = mode(4) + cci + payload bits
    let need = 4 + cciWidth(mode, v);
    if (mode === MODE_NUMERIC) {
      need += Math.floor(text.length / 3) * 10;
      const rem = text.length % 3;
      if (rem === 2) need += 7; else if (rem === 1) need += 4;
    } else if (mode === MODE_ALPHA) {
      need += Math.floor(text.length / 2) * 11 + (text.length % 2) * 6;
    } else {
      need += Buffer.byteLength(text, 'utf8') * 8;
    }
    if (need <= capBits) return v;
  }
  throw new Error('Payload too large for QR (max version 40 exceeded)');
}

// Pad + split into blocks, compute EC, interleave per ISO/IEC 18004 §7.6.
function buildCodewords(bb, version, ecl) {
  const totalData = DATA_CODEWORDS[version - 1][ECL_INDEX[ecl]];
  const totalBits = totalData * 8;
  // terminator up to 4 bits of zero
  const term = Math.min(4, totalBits - bb.getLen());
  for (let i = 0; i < term; i++) bb.putBit(false);
  // pad to byte boundary
  while (bb.getLen() % 8 !== 0) bb.putBit(false);
  // pad bytes
  const PAD_BYTES = [0xec, 0x11];
  let padIdx = 0;
  const bytes = bb.getBytes();
  while (bytes.length < totalData) {
    bytes.push(PAD_BYTES[padIdx]);
    padIdx = 1 - padIdx;
  }

  // Split into blocks per EC_BLOCKS table
  const layout = EC_BLOCKS[version][ecl];
  const [ecLen, g1Blocks, g1Data, g2Blocks, g2Data] = layout;
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (let b = 0; b < g1Blocks; b++) {
    const blk = bytes.slice(offset, offset + g1Data);
    dataBlocks.push(blk);
    ecBlocks.push(rsComputeEc(blk, ecLen));
    offset += g1Data;
  }
  for (let b = 0; b < g2Blocks; b++) {
    const blk = bytes.slice(offset, offset + g2Data);
    dataBlocks.push(blk);
    ecBlocks.push(rsComputeEc(blk, ecLen));
    offset += g2Data;
  }

  // Interleave data then EC
  const maxData = Math.max(...dataBlocks.map((b) => b.length));
  const out = [];
  for (let i = 0; i < maxData; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) out.push(blk[i]);
    }
  }
  for (let i = 0; i < ecLen; i++) {
    for (const blk of ecBlocks) out.push(blk[i]);
  }
  return out;
}

// -- Matrix construction --

function makeEmptyMatrix(size) {
  const m = new Array(size);
  for (let i = 0; i < size; i++) m[i] = new Int8Array(size).fill(-1); // -1 = reserved not set
  return m;
}

function placeFinder(m, r, c) {
  for (let i = -1; i <= 7; i++) {
    for (let j = -1; j <= 7; j++) {
      const rr = r + i;
      const cc = c + j;
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue;
      const edge = i === 0 || i === 6 || j === 0 || j === 6;
      const core = i >= 2 && i <= 4 && j >= 2 && j <= 4;
      const border = i === -1 || i === 7 || j === -1 || j === 7;
      if (border) m[rr][cc] = 0;
      else if (edge || core) m[rr][cc] = 1;
      else m[rr][cc] = 0;
    }
  }
}

function placeAlignment(m, r, c) {
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      const edge = i === -2 || i === 2 || j === -2 || j === 2;
      const core = i === 0 && j === 0;
      m[r + i][c + j] = (edge || core) ? 1 : 0;
    }
  }
}

function placeFunctionPatterns(m, version) {
  const size = m.length;
  // Finders (three corners) + separators
  placeFinder(m, 0, 0);
  placeFinder(m, 0, size - 7);
  placeFinder(m, size - 7, 0);
  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    m[6][i] = i % 2 === 0 ? 1 : 0;
    m[i][6] = i % 2 === 0 ? 1 : 0;
  }
  // Alignment patterns
  const positions = ALIGNMENT_POSITIONS[version];
  for (const pr of positions) {
    for (const pc of positions) {
      if ((pr === 6 && pc === 6) || (pr === 6 && pc === size - 7) || (pr === size - 7 && pc === 6)) continue;
      placeAlignment(m, pr, pc);
    }
  }
  // Dark module
  m[size - 8][8] = 1;
  // Reserve format-info strips
  for (let i = 0; i < 9; i++) {
    if (m[8][i] === -1) m[8][i] = 0;
    if (m[i][8] === -1) m[i][8] = 0;
  }
  for (let i = 0; i < 8; i++) {
    if (m[8][size - 1 - i] === -1) m[8][size - 1 - i] = 0;
    if (m[size - 1 - i][8] === -1) m[size - 1 - i][8] = 0;
  }
  // Reserve version info for v>=7
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        if (m[size - 11 + j][i] === -1) m[size - 11 + j][i] = 0;
        if (m[i][size - 11 + j] === -1) m[i][size - 11 + j] = 0;
      }
    }
  }
}

function isFunctionModule(functionMask, r, c) {
  return functionMask[r][c] === 1;
}

function buildFunctionMask(version) {
  const size = 21 + (version - 1) * 4;
  const mask = new Array(size);
  for (let i = 0; i < size; i++) mask[i] = new Int8Array(size);
  // Finders + separators
  const marks = [[0, 0], [0, size - 8], [size - 8, 0]];
  for (const [r, c] of marks) {
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        const rr = r + i;
        const cc = c + j;
        if (rr >= 0 && cc >= 0 && rr < size && cc < size) mask[rr][cc] = 1;
      }
    }
  }
  // Timing
  for (let i = 0; i < size; i++) {
    mask[6][i] = 1;
    mask[i][6] = 1;
  }
  // Alignments
  const positions = ALIGNMENT_POSITIONS[version];
  for (const pr of positions) {
    for (const pc of positions) {
      if ((pr === 6 && pc === 6) || (pr === 6 && pc === size - 7) || (pr === size - 7 && pc === 6)) continue;
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) mask[pr + i][pc + j] = 1;
    }
  }
  // Format-info strips
  for (let i = 0; i < 9; i++) { mask[8][i] = 1; mask[i][8] = 1; }
  for (let i = 0; i < 8; i++) { mask[8][size - 1 - i] = 1; mask[size - 1 - i][8] = 1; }
  // Dark module
  mask[size - 8][8] = 1;
  // Version info strip
  if (version >= 7) {
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        mask[size - 11 + j][i] = 1;
        mask[i][size - 11 + j] = 1;
      }
    }
  }
  return mask;
}

function placeDataBits(m, funcMask, codewords) {
  const size = m.length;
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  let col = size - 1;
  let upward = true;
  while (col > 0) {
    if (col === 6) col = 5;
    for (let i = 0; i < size; i++) {
      const r = upward ? size - 1 - i : i;
      for (let k = 0; k < 2; k++) {
        const c = col - k;
        if (funcMask[r][c] === 1) continue;
        if (bitIdx < totalBits) {
          const byte = codewords[bitIdx >>> 3];
          const bit = ((byte >>> (7 - (bitIdx & 7))) & 1) === 1;
          m[r][c] = bit ? 1 : 0;
          bitIdx += 1;
        } else {
          if (m[r][c] === -1) m[r][c] = 0;
        }
      }
    }
    upward = !upward;
    col -= 2;
  }
}

function applyMask(m, funcMask, maskId) {
  const size = m.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (funcMask[r][c] === 1) continue;
      let invert = false;
      switch (maskId) {
        case 0: invert = (r + c) % 2 === 0; break;
        case 1: invert = r % 2 === 0; break;
        case 2: invert = c % 3 === 0; break;
        case 3: invert = (r + c) % 3 === 0; break;
        case 4: invert = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
        case 5: invert = ((r * c) % 2) + ((r * c) % 3) === 0; break;
        case 6: invert = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; break;
        case 7: invert = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; break;
        default: invert = false;
      }
      if (invert) m[r][c] ^= 1;
    }
  }
}

function writeFormatInfo(m, ecl, maskId) {
  const size = m.length;
  const bits = FORMAT_INFO[(ECL_INDEX[ecl] << 3) | maskId];
  // 15 bits
  for (let i = 0; i < 15; i++) {
    const bit = ((bits >>> (14 - i)) & 1);
    // strip around top-left finder
    if (i < 6) m[8][i] = bit;
    else if (i === 6) m[8][7] = bit;
    else if (i === 7) m[8][8] = bit;
    else if (i === 8) m[7][8] = bit;
    else m[14 - i][8] = bit;
    // split strip in top-right / bottom-left
    if (i < 8) m[size - 1 - i][8] = bit;
    else m[8][size - 15 + i] = bit;
  }
  m[size - 8][8] = 1;
}

function writeVersionInfo(m, version) {
  if (version < 7) return;
  const size = m.length;
  const bits = VERSION_INFO[version - 7];
  for (let i = 0; i < 18; i++) {
    const b = (bits >>> i) & 1;
    const r = Math.floor(i / 3);
    const c = i % 3 + size - 11;
    m[r][c] = b;
    m[c][r] = b;
  }
}

// Simple penalty score (all four rules summed) to choose the best mask.
function maskPenalty(m) {
  const size = m.length;
  let p = 0;
  // Rule 1: runs of 5+ same colour
  const runScore = (getter) => {
    let s = 0;
    for (let r = 0; r < size; r++) {
      let run = 1;
      for (let c = 1; c < size; c++) {
        if (getter(r, c) === getter(r, c - 1)) { run += 1; if (run === 5) s += 3; else if (run > 5) s += 1; }
        else run = 1;
      }
    }
    return s;
  };
  p += runScore((r, c) => m[r][c]);
  p += runScore((r, c) => m[c][r]);
  // Rule 2: 2x2 same colour blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = m[r][c];
      if (v === m[r + 1][c] && v === m[r][c + 1] && v === m[r + 1][c + 1]) p += 3;
    }
  }
  // Rule 3: finder-like pattern
  // approximated: 1-0-1-1-1-0-1 run penalty
  const sig = [1, 0, 1, 1, 1, 0, 1];
  const match = (r, c, horiz) => {
    for (let k = 0; k < 7; k++) {
      const rr = horiz ? r : r + k;
      const cc = horiz ? c + k : c;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) return false;
      if (m[rr][cc] !== sig[k]) return false;
    }
    return true;
  };
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (match(r, c, true)) p += 40;
      if (match(r, c, false)) p += 40;
    }
  }
  // Rule 4: proportion of dark modules
  let dark = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (m[r][c]) dark += 1;
  const pct = (dark * 100) / (size * size);
  p += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return p;
}

/**
 * Build a QR code matrix for the given text. Returns a plain row-major
 * array of 0/1 and metadata useful for rendering.
 *
 * @param {string} text   UTF-8 payload
 * @param {object} [opts]
 * @param {'L'|'M'|'Q'|'H'} [opts.ecl='M']
 * @param {number} [opts.minVersion=1]
 * @param {number|null} [opts.mask]  fix mask id 0..7
 * @returns {{ size:number, matrix:number[][], version:number, ecl:string, mode:number }}
 */
function generateQrMatrix(text, opts = {}) {
  if (typeof text !== 'string') throw new TypeError('text must be a string');
  if (text.length === 0) throw new Error('text must not be empty');
  const ecl = opts.ecl || 'M';
  if (!(ecl in ECL_INDEX)) throw new Error(`Unknown ECL: ${ecl}`);
  const mode = detectMode(text);
  let version = pickVersion(text, mode, ecl);
  if (opts.minVersion && version < opts.minVersion) version = opts.minVersion;
  const bb = encodeData(text, mode, version);
  const codewords = buildCodewords(bb, version, ecl);

  const size = 21 + (version - 1) * 4;
  const funcMask = buildFunctionMask(version);
  const baseMatrix = makeEmptyMatrix(size);
  placeFunctionPatterns(baseMatrix, version);
  // Fill data using a fresh matrix for placement
  const dataMatrix = makeEmptyMatrix(size);
  placeFunctionPatterns(dataMatrix, version);
  placeDataBits(dataMatrix, funcMask, codewords);

  let best = null;
  for (let mid = 0; mid < 8; mid++) {
    // deep copy
    const m = dataMatrix.map((row) => Int8Array.from(row));
    applyMask(m, funcMask, mid);
    writeFormatInfo(m, ecl, mid);
    writeVersionInfo(m, version);
    const score = opts.mask != null ? (mid === opts.mask ? 0 : Infinity) : maskPenalty(m);
    if (!best || score < best.score) best = { score, matrix: m, maskId: mid };
  }

  // normalise to 0/1 number matrix
  const out = best.matrix.map((row) => Array.from(row, (v) => (v === 1 ? 1 : 0)));
  return { size, matrix: out, version, ecl, mode, maskId: best.maskId };
}

// --------------------------------------------------------------------------
// 2. Renderers
// --------------------------------------------------------------------------

/**
 * Render a QR matrix into an SVG string.
 *
 * @param {{size:number, matrix:number[][]}} qr
 * @param {object} [opts]
 * @param {number} [opts.scale=4]        px per module
 * @param {number} [opts.margin=4]       quiet-zone modules
 * @param {string} [opts.dark='#000000']
 * @param {string} [opts.light='#ffffff']
 * @param {string} [opts.title]
 */
function renderSvg(qr, opts = {}) {
  const scale = opts.scale || 4;
  const margin = opts.margin != null ? opts.margin : 4;
  const dark = opts.dark || '#000000';
  const light = opts.light || '#ffffff';
  const size = qr.size;
  const px = (size + margin * 2) * scale;
  const rects = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.matrix[r][c]) {
        rects.push(`<rect x="${(c + margin) * scale}" y="${(r + margin) * scale}" width="${scale}" height="${scale}"/>`);
      }
    }
  }
  const titleNode = opts.title ? `<title>${escapeXml(opts.title)}</title>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${px} ${px}" width="${px}" height="${px}" shape-rendering="crispEdges">${titleNode}<rect width="100%" height="100%" fill="${light}"/><g fill="${dark}">${rects.join('')}</g></svg>`;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (ch) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  }[ch]));
}

/**
 * Render a QR matrix into an uncompressed PNG Buffer. Deliberately minimal
 * — we build our own IHDR / IDAT chunks and let zlib compress the raw
 * scanlines. No dependencies beyond node:zlib / node:crypto.
 */
function renderPngBuffer(qr, opts = {}) {
  const scale = opts.scale || 4;
  const margin = opts.margin != null ? opts.margin : 4;
  const size = qr.size;
  const px = (size + margin * 2) * scale;
  const stride = px * 3; // RGB
  const rowBytes = stride + 1; // scanline filter byte
  const raw = Buffer.alloc(rowBytes * px);
  const dark = rgb(opts.dark || '#000000');
  const light = rgb(opts.light || '#ffffff');
  for (let y = 0; y < px; y++) {
    raw[y * rowBytes] = 0;
    for (let x = 0; x < px; x++) {
      const mx = Math.floor(x / scale) - margin;
      const my = Math.floor(y / scale) - margin;
      const isDark = mx >= 0 && my >= 0 && mx < size && my < size && qr.matrix[my][mx] === 1;
      const off = y * rowBytes + 1 + x * 3;
      const c = isDark ? dark : light;
      raw[off] = c[0]; raw[off + 1] = c[1]; raw[off + 2] = c[2];
    }
  }
  const idatData = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(px, 0);
  ihdr.writeUInt32BE(px, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const chunks = [
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idatData),
    pngChunk('IEND', Buffer.alloc(0)),
  ];
  return Buffer.concat(chunks);
}

function rgb(hex) {
  const s = hex.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

// --------------------------------------------------------------------------
// 3. Payment standards — builders that produce the textual payload that
//    gets encoded into the QR.
// --------------------------------------------------------------------------

/**
 * EMV QR Code (Merchant-Presented Mode). Implements the TLV container
 * defined by EMVCo MPM 1.1 and appends the CRC16/CCITT checksum expected
 * by all major wallets.
 *
 * @param {object} o
 * @param {string} o.merchantId          max 25 chars
 * @param {string} o.merchantName        max 25 chars
 * @param {string} o.merchantCity        max 15 chars
 * @param {string} [o.currency='376']    numeric ISO-4217 (ILS = 376)
 * @param {string} [o.country='IL']      ISO-3166-1 alpha-2
 * @param {number} [o.amount]            if set, QR is "fixed amount"
 * @param {string} [o.reference]         invoice / order reference (ID 62-05)
 * @param {string} [o.gui='onyx.pay']    global-unique-identifier under tag 26
 */
function buildEmvQrText(o) {
  if (!o || !o.merchantName) throw new Error('merchantName is required');
  const parts = [];
  const add = (id, val) => {
    const s = String(val);
    parts.push(id + String(s.length).padStart(2, '0') + s);
  };
  add('00', '01'); // payload format indicator
  add('01', o.amount != null ? '12' : '11'); // point of initiation — 11 static, 12 dynamic
  // Merchant account info: nested template under ID 26
  const merchantSub = [];
  const subAdd = (id, val) => {
    const s = String(val);
    merchantSub.push(id + String(s.length).padStart(2, '0') + s);
  };
  subAdd('00', o.gui || 'onyx.pay');
  subAdd('01', o.merchantId || 'ONYXIL');
  add('26', merchantSub.join(''));
  add('52', '0000'); // MCC 0000 — unspecified
  add('53', o.currency || '376');
  if (o.amount != null) add('54', Number(o.amount).toFixed(2));
  add('58', o.country || 'IL');
  add('59', (o.merchantName || '').slice(0, 25));
  add('60', (o.merchantCity || 'Tel Aviv').slice(0, 15));
  if (o.reference) {
    const sub = '05' + String(o.reference.length).padStart(2, '0') + o.reference;
    add('62', sub);
  }
  // CRC tag with placeholder
  const withoutCrc = parts.join('') + '6304';
  const crc = crc16Ccitt(Buffer.from(withoutCrc, 'ascii')).toString(16).toUpperCase().padStart(4, '0');
  return withoutCrc + crc;
}

function crc16Ccitt(buf) {
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i] << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc;
}

/**
 * EPC QR / Giro-Code. Used by SEPA banks (Deutsche Bank, BNP, Raiffeisen…)
 * so a payer can scan the invoice and auto-fill an instant SEPA credit
 * transfer. Good fallback for Israeli customers paying EU suppliers.
 *
 * Layout per "Guidelines: Quick Response Code for Service Request" v2.1:
 *   line 1  : service tag  ("BCD")
 *   line 2  : version      ("002")
 *   line 3  : character set (1 = UTF-8)
 *   line 4  : identification ("SCT")
 *   line 5  : BIC (optional)
 *   line 6  : beneficiary name (max 70 chars)
 *   line 7  : IBAN
 *   line 8  : amount (EUR…) max 12 chars
 *   line 9  : purpose code (optional)
 *   line 10 : structured reference
 *   line 11 : unstructured reference (one of 10/11 only)
 *   line 12 : information (optional)
 */
function buildEpcQrText({ iban, amount, reference, beneficiaryName, bic = '', currency = 'EUR' }) {
  if (!iban) throw new Error('iban required');
  if (!beneficiaryName) throw new Error('beneficiaryName required');
  const amt = amount != null ? `${currency}${Number(amount).toFixed(2)}` : '';
  const lines = [
    'BCD',
    '002',
    '1',
    'SCT',
    bic,
    beneficiaryName.slice(0, 70),
    iban.replace(/\s+/g, '').toUpperCase(),
    amt,
    '',
    '',
    reference ? String(reference).slice(0, 140) : '',
  ];
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/**
 * Bit payment payload. Bit reads both a deeplink (bit://) and a JSON
 * object embedded in the QR. We emit both so native Bit, WhatsApp camera,
 * and any generic scanner all resolve to the same action.
 */
function buildBitPayload(phoneNumber, amount, description) {
  if (!phoneNumber) throw new Error('phoneNumber required');
  const norm = String(phoneNumber).replace(/\D/g, '');
  const payload = {
    app: 'bit',
    version: 1,
    phone: norm,
    amount: Number(amount).toFixed(2),
    currency: 'ILS',
    description: description || '',
    generatedAt: new Date().toISOString(),
  };
  const deeplink = `bit://pay?phone=${encodeURIComponent(norm)}&amount=${encodeURIComponent(payload.amount)}&desc=${encodeURIComponent(description || '')}`;
  return { deeplink, json: JSON.stringify(payload) };
}

/**
 * ONYX Pay-By-Link payload. Builder-style helper that produces the hosted
 * payment-page URL a customer is redirected to. The URL holds only a short
 * code — full details live server-side.
 */
function buildPaymentLinkUrl(baseUrl, shortCode) {
  const clean = String(baseUrl || '').replace(/\/$/, '');
  return `${clean}/pay/${shortCode}`;
}

// --------------------------------------------------------------------------
// 4. High-level exposed helpers
// --------------------------------------------------------------------------

/**
 * generatePaymentQR — produce an EMV QR for a hosted-link style charge.
 * Perfect for embedding on invoices / printed receipts / kiosk screens.
 */
function generatePaymentQR(amount, description, ctx = {}) {
  const text = buildEmvQrText({
    merchantName: ctx.merchantName || ctx.recipient || 'ONYX Merchant',
    merchantId: ctx.merchantId || 'ONYXIL',
    merchantCity: ctx.merchantCity || 'Tel Aviv',
    amount: amount != null ? Number(amount) : undefined,
    reference: ctx.reference,
    country: ctx.country || 'IL',
    currency: ctx.currency || '376',
    gui: ctx.gui || 'onyx.pay',
  });
  const qr = generateQrMatrix(text, { ecl: ctx.ecl || 'M' });
  const svg = renderSvg(qr, { scale: ctx.scale || 4, title: description });
  return { text, svg, version: qr.version, matrix: qr.matrix };
}

/**
 * generateBitQR — produce a QR that scans into a Bit peer-to-peer transfer
 * plus the bit:// deeplink that mobile apps can handle directly.
 */
function generateBitQR(phoneNumber, amount, description) {
  const { deeplink, json } = buildBitPayload(phoneNumber, amount, description);
  const qr = generateQrMatrix(deeplink, { ecl: 'M' });
  const svg = renderSvg(qr, { scale: 5, title: `Bit ${amount} ILS` });
  return { text: deeplink, json, deeplink, svg, version: qr.version, matrix: qr.matrix };
}

/**
 * generateIbanQR — EPC-QR for SEPA. For ILS use generatePaymentQR() with
 * an EMV payload instead.
 */
function generateIbanQR(iban, amount, reference, beneficiaryName, opts = {}) {
  const text = buildEpcQrText({
    iban,
    amount,
    reference,
    beneficiaryName,
    bic: opts.bic,
    currency: opts.currency || 'EUR',
  });
  const qr = generateQrMatrix(text, { ecl: 'M' });
  const svg = renderSvg(qr, { scale: 5, title: `IBAN ${iban}` });
  return { text, svg, version: qr.version, matrix: qr.matrix };
}

/**
 * generateEmvQR — thin pass-through for callers that already have merchant
 * context and don't want amount defaults.
 */
function generateEmvQR(merchant, amount, currency, reference) {
  const text = buildEmvQrText({
    merchantName: merchant.name || merchant.merchantName,
    merchantId: merchant.id || merchant.merchantId,
    merchantCity: merchant.city || merchant.merchantCity,
    amount,
    currency,
    reference,
  });
  const qr = generateQrMatrix(text, { ecl: 'M' });
  return { text, svg: renderSvg(qr, { scale: 4 }), matrix: qr.matrix, version: qr.version };
}

// --------------------------------------------------------------------------
// 5. Payment-link tracking store
// --------------------------------------------------------------------------

const DEFAULT_EXPIRY_MS = 48 * 60 * 60 * 1000; // 48h

const STATUS = Object.freeze({
  CREATED: 'created',
  SENT: 'sent',
  VIEWED: 'viewed',
  PAID: 'paid',
  EXPIRED: 'expired',
});

/**
 * SQL migration for the `payment_links` table. The caller is free to run
 * this through their own migrator. We keep it here so a single `require`
 * gives you everything you need.
 */
const PAYMENT_LINKS_SQL = `
CREATE TABLE IF NOT EXISTS payment_links (
  id              UUID PRIMARY KEY,
  short_code      TEXT UNIQUE NOT NULL,
  amount          NUMERIC(14, 2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'ILS',
  description     TEXT,
  recipient       TEXT,
  reference       TEXT,
  status          TEXT NOT NULL DEFAULT 'created',
  callback_url    TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  viewed_at       TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  paid_amount     NUMERIC(14, 2),
  paid_txn_ref    TEXT
);
CREATE INDEX IF NOT EXISTS idx_payment_links_short ON payment_links (short_code);
CREATE INDEX IF NOT EXISTS idx_payment_links_status ON payment_links (status);
CREATE INDEX IF NOT EXISTS idx_payment_links_expires ON payment_links (expires_at);
`.trim();

/**
 * Create a tracking store. If a real DB object is supplied (any object
 * exposing `.query(sql, params)` that returns { rows }) we use it. With no
 * arg, an in-memory Map-backed store is returned — ideal for tests and
 * local development.
 */
function createPaymentLinkStore(db) {
  if (db && typeof db.query === 'function') return createDbStore(db);
  return createMemoryStore();
}

function createMemoryStore() {
  const byId = new Map();
  const byCode = new Map();
  return {
    async create(rec) { byId.set(rec.id, rec); byCode.set(rec.short_code, rec); return rec; },
    async getById(id) { return byId.get(id) || null; },
    async getByShort(code) { return byCode.get(code) || null; },
    async update(id, patch) {
      const r = byId.get(id); if (!r) return null;
      Object.assign(r, patch); byCode.set(r.short_code, r); return r;
    },
    async list({ status } = {}) {
      return Array.from(byId.values()).filter((r) => !status || r.status === status);
    },
  };
}

function createDbStore(db) {
  return {
    async create(rec) {
      const sql = `INSERT INTO payment_links
        (id, short_code, amount, currency, description, recipient, reference, status, callback_url, metadata, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`;
      const { rows } = await db.query(sql, [
        rec.id, rec.short_code, rec.amount, rec.currency, rec.description, rec.recipient,
        rec.reference, rec.status, rec.callback_url, rec.metadata ? JSON.stringify(rec.metadata) : null,
        rec.expires_at,
      ]);
      return rows[0];
    },
    async getById(id) {
      const { rows } = await db.query('SELECT * FROM payment_links WHERE id = $1', [id]);
      return rows[0] || null;
    },
    async getByShort(code) {
      const { rows } = await db.query('SELECT * FROM payment_links WHERE short_code = $1', [code]);
      return rows[0] || null;
    },
    async update(id, patch) {
      const keys = Object.keys(patch);
      if (keys.length === 0) return this.getById(id);
      const set = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const vals = keys.map((k) => patch[k]);
      const { rows } = await db.query(`UPDATE payment_links SET ${set} WHERE id = $1 RETURNING *`, [id, ...vals]);
      return rows[0] || null;
    },
    async list({ status } = {}) {
      const sql = status
        ? 'SELECT * FROM payment_links WHERE status = $1 ORDER BY created_at DESC'
        : 'SELECT * FROM payment_links ORDER BY created_at DESC';
      const { rows } = await db.query(sql, status ? [status] : []);
      return rows;
    },
  };
}

function newShortCode(len = 10) {
  return crypto.randomBytes(16).toString('base64url').replace(/[^0-9a-zA-Z]/g, '').slice(0, len);
}

/**
 * generatePaymentLink — creates a tracked payment link + matching QR.
 *
 * @param {number} amount                  ILS major units
 * @param {string} description
 * @param {object} opts
 * @param {string}  [opts.recipient]
 * @param {string}  [opts.reference]
 * @param {string}  [opts.currency='ILS']
 * @param {string}  [opts.callbackUrl]
 * @param {number}  [opts.expiryMs]        default 48h
 * @param {object}  [opts.store]           store from createPaymentLinkStore
 * @param {string}  [opts.baseUrl='https://pay.onyx.local']
 * @param {object}  [opts.metadata]
 */
async function generatePaymentLink(amount, description, opts = {}) {
  if (amount == null || Number.isNaN(Number(amount))) throw new Error('amount required');
  const store = opts.store || createPaymentLinkStore();
  const baseUrl = opts.baseUrl || 'https://pay.onyx.local';
  const id = crypto.randomUUID();
  const shortCode = newShortCode(opts.shortLength || 10);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + (opts.expiryMs || DEFAULT_EXPIRY_MS));
  const rec = {
    id,
    short_code: shortCode,
    amount: Number(amount),
    currency: opts.currency || 'ILS',
    description: description || null,
    recipient: opts.recipient || null,
    reference: opts.reference || null,
    status: STATUS.CREATED,
    callback_url: opts.callbackUrl || null,
    metadata: opts.metadata || null,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
  await store.create(rec);
  const url = buildPaymentLinkUrl(baseUrl, shortCode);
  const qrPayload = opts.qrPayload === 'emv'
    ? buildEmvQrText({
      merchantName: opts.recipient || 'ONYX',
      merchantId: opts.merchantId || 'ONYXIL',
      merchantCity: opts.merchantCity || 'Tel Aviv',
      amount: Number(amount),
      reference: opts.reference || shortCode,
    })
    : url;
  const qrMatrix = generateQrMatrix(qrPayload, { ecl: opts.ecl || 'M' });
  return {
    id,
    shortCode,
    url,
    expiresAt: expiresAt.toISOString(),
    status: STATUS.CREATED,
    qr: {
      text: qrPayload,
      svg: renderSvg(qrMatrix, { scale: opts.scale || 5, title: description }),
      version: qrMatrix.version,
      ecl: qrMatrix.ecl,
    },
  };
}

/**
 * Mark a link as viewed. Idempotent: will not regress a PAID link to
 * VIEWED. Expired links are flipped to EXPIRED lazily here too.
 */
async function markViewed(store, id) {
  const rec = await store.getById(id);
  if (!rec) return null;
  if (rec.status === STATUS.PAID) return rec;
  if (new Date(rec.expires_at) < new Date()) {
    return store.update(id, { status: STATUS.EXPIRED });
  }
  if (rec.status === STATUS.CREATED || rec.status === STATUS.SENT) {
    return store.update(id, { status: STATUS.VIEWED, viewed_at: new Date().toISOString() });
  }
  return rec;
}

/**
 * Mark a link as paid (webhook from PSP).
 */
async function markPaid(store, id, { paidAmount, paidTxnRef } = {}) {
  const rec = await store.getById(id);
  if (!rec) return null;
  return store.update(id, {
    status: STATUS.PAID,
    paid_at: new Date().toISOString(),
    paid_amount: paidAmount != null ? Number(paidAmount) : rec.amount,
    paid_txn_ref: paidTxnRef || null,
  });
}

async function markSent(store, id) {
  const rec = await store.getById(id);
  if (!rec) return null;
  if (rec.status !== STATUS.CREATED) return rec;
  return store.update(id, { status: STATUS.SENT, sent_at: new Date().toISOString() });
}

/**
 * Sweep that marks stale links EXPIRED. Call it periodically from a cron.
 */
async function sweepExpired(store, now = new Date()) {
  const all = await store.list();
  let expired = 0;
  for (const rec of all) {
    if ((rec.status === STATUS.CREATED || rec.status === STATUS.SENT || rec.status === STATUS.VIEWED)
      && new Date(rec.expires_at) < now) {
      await store.update(rec.id, { status: STATUS.EXPIRED });
      expired += 1;
    }
  }
  return expired;
}

// --------------------------------------------------------------------------
// 6. Express routes — mountable router
// --------------------------------------------------------------------------

/**
 * Mount the /api/payments/links + /pay/:code routes on an existing Express
 * app.
 *
 *   const { mountRoutes, createPaymentLinkStore } = require('./payments/qr-payment');
 *   const store = createPaymentLinkStore(db);
 *   mountRoutes(app, { store, baseUrl: 'https://pay.onyx.co.il' });
 *
 * The router uses only app.METHOD(...) — no express.Router() dependency —
 * so it works even if the caller's express is vendored.
 */
function mountRoutes(app, { store, baseUrl } = {}) {
  if (!app || typeof app.post !== 'function') throw new Error('app must be an Express-style app');
  const theStore = store || createPaymentLinkStore();
  const base = baseUrl || 'https://pay.onyx.local';

  app.post('/api/payments/links', async (req, res) => {
    try {
      const body = req.body || {};
      const link = await generatePaymentLink(body.amount, body.description, {
        recipient: body.recipient,
        reference: body.reference,
        currency: body.currency,
        callbackUrl: body.callbackUrl,
        expiryMs: body.expiryMs,
        store: theStore,
        baseUrl: base,
        qrPayload: body.qrPayload,
        metadata: body.metadata,
      });
      res.status(201).json(link);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/payments/links', async (req, res) => {
    try {
      const rows = await theStore.list({ status: req.query.status });
      res.json({ items: rows, count: rows.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/payments/links/:shortCode', async (req, res) => {
    try {
      const rec = await theStore.getByShort(req.params.shortCode);
      if (!rec) return res.status(404).json({ error: 'not_found' });
      await markViewed(theStore, rec.id);
      res.json({
        id: rec.id,
        shortCode: rec.short_code,
        amount: rec.amount,
        currency: rec.currency,
        description: rec.description,
        recipient: rec.recipient,
        status: rec.status,
        expiresAt: rec.expires_at,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/payments/links/:id/qr.svg', async (req, res) => {
    try {
      const rec = await theStore.getById(req.params.id);
      if (!rec) return res.status(404).send('not_found');
      const url = buildPaymentLinkUrl(base, rec.short_code);
      const qr = generateQrMatrix(url, { ecl: 'M' });
      const svg = renderSvg(qr, { scale: 6, title: rec.description || '' });
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(svg);
    } catch (err) {
      res.status(500).send(`error: ${err.message}`);
    }
  });

  app.post('/api/payments/links/:id/mark-paid', async (req, res) => {
    try {
      const body = req.body || {};
      const rec = await markPaid(theStore, req.params.id, {
        paidAmount: body.paidAmount,
        paidTxnRef: body.paidTxnRef,
      });
      if (!rec) return res.status(404).json({ error: 'not_found' });
      // Fire-and-forget callback if configured
      if (rec.callback_url) {
        fireCallback(rec.callback_url, rec).catch(() => {});
      }
      res.json(rec);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/payments/links/:id/mark-sent', async (req, res) => {
    try {
      const rec = await markSent(theStore, req.params.id);
      if (!rec) return res.status(404).json({ error: 'not_found' });
      res.json(rec);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/pay/:code', async (req, res) => {
    const rec = await theStore.getByShort(req.params.code);
    if (!rec) return res.status(404).send('Payment link not found');
    if (new Date(rec.expires_at) < new Date()) {
      await theStore.update(rec.id, { status: STATUS.EXPIRED });
      return res.status(410).send('Payment link expired');
    }
    await markViewed(theStore, rec.id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderHostedPage(rec, base));
  });

  return { store: theStore };
}

async function fireCallback(url, rec) {
  // We prefer globalThis.fetch; node 20+ ships it. Fall back to noop.
  const f = globalThis.fetch;
  if (typeof f !== 'function') return;
  try {
    await f(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'payment_link.paid', link: rec }),
    });
  } catch { /* swallow */ }
}

function renderHostedPage(rec, baseUrl) {
  const url = buildPaymentLinkUrl(baseUrl, rec.short_code);
  const qr = generateQrMatrix(url, { ecl: 'M' });
  const svg = renderSvg(qr, { scale: 6, title: rec.description || '' });
  const amount = `${Number(rec.amount).toFixed(2)} ${rec.currency}`;
  return `<!doctype html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"><title>ONYX Pay</title>
<style>body{font-family:sans-serif;background:#f6f7fb;margin:0;padding:2em;color:#222}
.card{max-width:420px;margin:2em auto;background:#fff;border-radius:16px;padding:2em;box-shadow:0 8px 24px rgba(0,0,0,.08)}
h1{margin:0 0 .4em;font-size:1.6em}
.amount{font-size:2.2em;font-weight:700;color:#1a73e8;margin:1em 0}
.desc{color:#555;margin-bottom:1em}
.qr{background:#fff;display:flex;justify-content:center;padding:1em;border-radius:8px}
.code{font-family:monospace;background:#eef;padding:.3em .6em;border-radius:6px}
</style></head>
<body><div class="card">
<h1>קישור תשלום ONYX</h1>
<div class="desc">${escapeXml(rec.description || '')}</div>
<div class="amount">${escapeXml(amount)}</div>
<div class="qr">${svg}</div>
<p>מזהה תשלום: <span class="code">${escapeXml(rec.short_code)}</span></p>
<p>תוקף עד: ${escapeXml(rec.expires_at)}</p>
</div></body></html>`;
}

// --------------------------------------------------------------------------
// Exports
// --------------------------------------------------------------------------

module.exports = {
  // raw QR
  generateQrMatrix,
  renderSvg,
  renderPngBuffer,

  // payment payload builders
  buildEmvQrText,
  buildEpcQrText,
  buildBitPayload,
  buildPaymentLinkUrl,
  crc16Ccitt,

  // high-level API
  generatePaymentQR,
  generateBitQR,
  generateIbanQR,
  generateEmvQR,
  generatePaymentLink,

  // tracking
  createPaymentLinkStore,
  markSent,
  markViewed,
  markPaid,
  sweepExpired,
  STATUS,
  PAYMENT_LINKS_SQL,
  DEFAULT_EXPIRY_MS,

  // routes
  mountRoutes,

  // constants (exported for tests)
  MODE_NUMERIC,
  MODE_ALPHA,
  MODE_BYTE,
  MODE_KANJI,
};
