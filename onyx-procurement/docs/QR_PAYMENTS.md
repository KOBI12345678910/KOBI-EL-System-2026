# QR Payment Link Generator

> `src/payments/qr-payment.js` — Wave 2 / Agent-87 / 2026-04-11

Zero-dependency QR encoder + payment-link tracking engine. Produces
EMV-compliant QR codes, Bit deeplinks, EPC (SEPA) QR codes, and tracked
Pay-By-Link short URLs. No third-party QR library — the whole encoder
(bitstream, Reed-Solomon, matrix placement, mask selection) is written
from scratch so it works in air-gapped builds.

The module covers three layers, each usable in isolation:

| Layer | Purpose | Key functions |
| --- | --- | --- |
| 1. QR encoder | ISO/IEC 18004 encoder + SVG / PNG renderers | `generateQrMatrix`, `renderSvg`, `renderPngBuffer` |
| 2. Payment payloads | Build the text that goes into the QR | `buildEmvQrText`, `buildBitPayload`, `buildEpcQrText` |
| 3. Link tracking | Stored lifecycle (created → paid / expired) + Express routes | `generatePaymentLink`, `createPaymentLinkStore`, `mountRoutes` |

---

## 1. QR encoder

### Features

- **Modes**: Numeric, Alphanumeric, Byte (UTF-8). Kanji is wired up via
  the constants but byte mode covers Japanese text too, so it is not
  auto-selected.
- **Error correction**: L (7%), M (15%), Q (25%), H (30%).
- **Version**: automatic 1–40 based on payload size and ECL.
- **Mask**: all 8 mask patterns are scored by the four ISO penalty rules;
  the lowest-scoring mask is chosen.
- **Output**: SVG string (embed in PDF / HTML) or an uncompressed PNG
  `Buffer` (Node `node:zlib` only — no native bindings).

### Example

```js
const qr = require('./src/payments/qr-payment');

const m = qr.generateQrMatrix('https://onyx.local/pay/abc', { ecl: 'Q' });
console.log(m.version, m.size, m.maskId);

const svg = qr.renderSvg(m, { scale: 6, margin: 4, dark: '#111', light: '#fff' });
require('fs').writeFileSync('pay.svg', svg);

const png = qr.renderPngBuffer(m, { scale: 4, margin: 4 });
require('fs').writeFileSync('pay.png', png);
```

`generateQrMatrix(text, opts)` returns:

```js
{
  size: 29,            // modules per side (21 + 4*(version-1))
  version: 3,          // 1..40
  ecl: 'M',
  mode: 0b0100,        // numeric|alpha|byte
  maskId: 2,           // chosen mask (0..7)
  matrix: number[][]   // row-major 0/1 grid
}
```

---

## 2. Israeli / global payment standards

### 2.1 EMV QR Code (EMVCo MPM 1.1)

Israel's Isracard / Cal / Max / Leumi merchant stacks, and every global
wallet (Apple Pay / Google Pay / Alipay / WeChat Pay) parse EMV
Merchant-Presented Mode QR strings. The builder emits a valid TLV
container closed with a CRC16/CCITT (poly `0x1021`, init `0xFFFF`).

```js
const payload = qr.buildEmvQrText({
  merchantName: 'Techno Kol Uzi',
  merchantId:   'TKU001',
  merchantCity: 'Tel Aviv',
  currency:     '376',   // ILS
  country:      'IL',
  amount:       250.00,  // omit for "static" / payer-chooses-amount QR
  reference:    'INV-778',
  gui:          'onyx.pay',
});
// → 00020101021226220008onyx.pay0106TKU001520400005303376540625…630436AB
```

Tags emitted:

| Tag | Meaning | Value |
| --- | --- | --- |
| 00 | Payload Format Indicator | `01` |
| 01 | Point of Initiation | `11` static · `12` dynamic |
| 26 | Merchant Account Information | nested: GUI (00), merchant id (01) |
| 52 | Merchant Category Code | `0000` |
| 53 | Transaction Currency | ISO 4217 numeric (ILS = `376`) |
| 54 | Transaction Amount | fixed-point string (only when dynamic) |
| 58 | Country Code | ISO 3166-1 alpha-2 |
| 59 | Merchant Name | ≤ 25 chars |
| 60 | Merchant City | ≤ 15 chars |
| 62 | Additional Data (sub-tag 05 = reference label) | |
| 63 | CRC16/CCITT-FALSE (uppercase hex) | |

### 2.2 Bit Payment (ישראל)

`buildBitPayload(phone, amount, description)` emits both a deeplink and
a JSON object. `generateBitQR` wraps this into a QR that opens the Bit
app on Android / iOS:

```js
const { deeplink, json } = qr.buildBitPayload('050-123-4567', 45.50, 'Pizza');
// deeplink = bit://pay?phone=0501234567&amount=45.50&desc=Pizza
```

### 2.3 EPC QR / Giro-Code (SEPA)

Used by European banks; our EU suppliers expect this on invoices we send
them. `buildEpcQrText` emits the 10-line "BCD / 002 / 1 / SCT …" block
from the ERPB _Guidelines: Quick Response Code for Service Request_ v2.1.

```js
const text = qr.buildEpcQrText({
  iban:            'DE89370400440532013000',
  beneficiaryName: 'Franz Mustermann',
  amount:          100,
  reference:       'RF18539007547034',
  bic:             '',      // optional
  currency:        'EUR',
});
```

### 2.4 ONYX Pay-By-Link

A tracked short URL that takes the customer to a hosted payment page.
Used for WhatsApp / email receipts and kiosk payouts where the payer
cannot read an EMV QR directly.

```js
const link = await qr.generatePaymentLink(250, 'Service fee', {
  recipient:   'Acme Ltd',
  reference:   'INV-0123',
  callbackUrl: 'https://api.onyx.local/webhooks/paid',
  expiryMs:    48 * 60 * 60 * 1000,   // default
  baseUrl:     'https://pay.onyx.co.il',
});
// → { id, shortCode, url, expiresAt, qr: { text, svg, ... } }
```

---

## 3. Tracking store

A `payment_links` row captures the full lifecycle:

```sql
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
CREATE INDEX idx_payment_links_short   ON payment_links (short_code);
CREATE INDEX idx_payment_links_status  ON payment_links (status);
CREATE INDEX idx_payment_links_expires ON payment_links (expires_at);
```

(This exact SQL is exported as `PAYMENT_LINKS_SQL` so the migrator can
pick it up.)

### Status state machine

```
 created ──► sent ──► viewed ──► paid       (terminal)
     │          │          │
     └──────────┴──────────┴───► expired    (terminal, sweep or lazy)
```

- `markSent(store, id)` fires when we push the link over WhatsApp / email.
- `markViewed(store, id)` fires when the payer opens `/pay/:code`. Already-paid
  links are **not** regressed; expired links are flipped on read (lazy sweep).
- `markPaid(store, id, { paidAmount, paidTxnRef })` called by the PSP webhook.
- `sweepExpired(store)` — cron-safe background pass that flips stale
  non-paid links to `expired`.

### Stores

```js
// Development / tests: in-memory
const store = qr.createPaymentLinkStore();

// Production: pass your Postgres pool (must expose .query(sql, params))
const store = qr.createPaymentLinkStore(pgPool);
```

---

## 4. HTTP routes

```js
const express = require('express');
const app = express();
app.use(express.json());

const qr = require('./src/payments/qr-payment');
const store = qr.createPaymentLinkStore(db);
qr.mountRoutes(app, { store, baseUrl: 'https://pay.onyx.co.il' });
```

Mounted routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `POST`   | `/api/payments/links`                      | Create a tracked link + QR |
| `GET`    | `/api/payments/links`                      | List (filter by `?status=`) |
| `GET`    | `/api/payments/links/:shortCode`           | Read + mark viewed |
| `GET`    | `/api/payments/links/:id/qr.svg`           | Raw SVG download (server-side PDF use, print, kiosk) |
| `POST`   | `/api/payments/links/:id/mark-sent`        | Mark as "sent" (outbound channel emitted) |
| `POST`   | `/api/payments/links/:id/mark-paid`        | Webhook hook from PSP — triggers callback_url fanout |
| `GET`    | `/pay/:code`                               | Hosted payment page (RTL HTML + embedded SVG QR) |

### Create request

```json
POST /api/payments/links
{
  "amount": 250,
  "description": "Service fee - March",
  "recipient": "Acme Ltd",
  "reference": "INV-0123",
  "callbackUrl": "https://api.onyx.local/webhooks/paid",
  "expiryMs": 86400000,
  "qrPayload": "emv",
  "metadata": { "invoiceId": "inv_0123" }
}
```

Response (201):

```json
{
  "id": "5d8b0a7b-…",
  "shortCode": "QewIjYG0Xk",
  "url": "https://pay.onyx.co.il/pay/QewIjYG0Xk",
  "expiresAt": "2026-04-13T08:51:15.822Z",
  "status": "created",
  "qr": {
    "text": "https://pay.onyx.co.il/pay/QewIjYG0Xk",
    "svg":  "<?xml version=\"1.0\" … </svg>",
    "version": 3,
    "ecl": "M"
  }
}
```

### Callback contract

When `mark-paid` is invoked and a `callback_url` was stored, the module
fires a fire-and-forget POST (via `globalThis.fetch`) with:

```json
{
  "event": "payment_link.paid",
  "link": { "id": "…", "short_code": "…", "amount": 250, "paid_at": "…" }
}
```

Failures are swallowed on purpose; the PSP remains the source of truth.

---

## 5. Tests

```bash
node --test src/payments/qr-payment.test.js
```

46 tests covering:

- QR encoder: mode detection, version auto-select, finder patterns,
  every ECL level, empty / invalid input.
- Renderers: SVG viewBox, dark-module count vs `<rect>` count, custom
  colour support, PNG signature + IEND chunk.
- EMV / EPC / Bit builders: tag layout, CRC round-trip, ISO CRC test
  vector (`"123456789"` → `0x29B1`).
- Store lifecycle: create / sent / viewed / paid, expiry sweep, paid-link
  idempotency.
- Express routes: every handler against a fake app with in-memory req/res.

All tests are hermetic (in-memory store, no network, no fs writes).

---

## 6. Security / compliance notes

- **Money precision**: all stored amounts are `NUMERIC(14,2)` and all
  JS arithmetic goes through `Number(amount).toFixed(2)`. Do **not** pass
  amounts in minor units (agorot) — use major ILS.
- **Expiry**: default 48h. The `/pay/:code` handler expires links lazily
  on read so the store doesn't need a hot sweep.
- **Callback URL**: the webhook is fire-and-forget. The PSP is the single
  source of truth; re-ship webhooks must be idempotent on the PSP side
  (`paid_txn_ref`).
- **CRC16/CCITT**: the implementation is byte-for-byte verified against
  the ISO test vector in the test suite.
- **Zero deps**: the module pulls only `node:crypto` and `node:zlib`, so
  it ships clean in an air-gapped build (`npm audit` surface = 0).

---

## 7. Roadmap (non-blocking)

- Full Kanji auto-detection (currently falls through to UTF-8 byte mode —
  scanners read it correctly, it just yields a slightly larger QR).
- ECI segment support for explicit charset switches.
- Structured-append (multi-QR payloads for large invoices).
- Optional logo inset (opens a centre hole and re-scores mask penalty).
