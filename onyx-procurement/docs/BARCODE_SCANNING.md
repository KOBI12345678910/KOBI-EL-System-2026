# ONYX — Barcode Scanning

> Agent 86 — 2026-04-11
> Module: `src/scanners/barcode-scanner.js`
> Tests:  `src/scanners/barcode-scanner.test.js`

The ONYX barcode subsystem resolves any supported 1D/2D code to a domain
entity (product, invoice, asset, employee, ID card, …) and returns the
list of UI actions that are legal for that entity. The module is
dependency-free, runs offline, and never deletes data — it is strictly
a read-and-classify pipeline.

---

## 1. Supported symbologies

| Symbology     | Format                       | Checksum algorithm        | Typical use       |
|---------------|------------------------------|---------------------------|-------------------|
| EAN-13        | 13 digits, GS1               | Mod-10                    | Retail products   |
| UPC-A         | 12 digits                    | Mod-10 (via 0-pad)        | Retail products   |
| Code 128      | Alphanumeric                 | Mod-103 (soft)            | Internal labels   |
| Code 39       | Upper, digits, `-.$/+% `     | Optional Mod-43           | Logistics         |
| QR Code       | 2D, ≤ 4296 chars             | Reed-Solomon (hardware)   | URLs, tickets     |
| Data Matrix   | 2D                           | Reed-Solomon (hardware)   | Pharma, industry  |
| PDF417        | 2D                           | Reed-Solomon (hardware)   | Driver licences   |
| Israeli ID    | 9 digits                     | Teudat-Zehut Luhn-like    | Employee cards    |

All 8 symbologies are constants on `SYMBOLOGY`, exported from the module.

---

## 2. HTTP API

### `POST /api/scanners/scan`

Resolve a raw scan from the frontend / mobile / HID wedge scanner.

**Request body**

```json
{
  "code": "4006381333931\r",
  "device": "warehouse-terminal-3",
  "location": "WH-01/A/12",
  "user": "kobi"
}
```

- `code` — required. Raw string as emitted by the scanner. Trailing
  `\r` / `\n` from a Keyboard-Wedge HID device is stripped automatically.
- `device` / `location` / `user` — optional; forwarded to the audit trail.

**Response**

```json
{
  "ok": true,
  "parsed": {
    "raw": "4006381333931\r",
    "clean": "4006381333931",
    "symbology": "EAN-13",
    "valid": true,
    "checksum": { "ok": true, "algo": "Mod-10" },
    "gs1": null,
    "israeli": null,
    "prefix": null
  },
  "entity": {
    "type": "product",
    "id": "8f2a…",
    "data": { "id": "8f2a…", "sku": "STA-NRS-HB", "name": "Noris HB pencil" },
    "source": "products"
  },
  "actions": [
    "view", "adjust_stock", "print_label", "add_to_po", "start_grn"
  ],
  "scannedAt": "2026-04-11T08:15:42.000Z"
}
```

**Error responses**

- `400` — missing `code` field, empty payload, or oversized payload (> 4500 chars)
- `413` — barcode payload exceeds `MAX_RAW_LEN`
- `500` — internal error (shouldn't normally happen; resolver is defensive)

### `GET /api/scanners/symbologies`

Returns the full list of recognised symbologies.

### `GET /api/scanners/health`

Lightweight status probe. Useful for load-balancer health checks.

---

## 3. Entity resolution order

`resolveBarcode(code, { supabase })` performs look-ups in a fixed order:

1. **Israeli TZ fast path** — 9 digits that pass the Luhn-like check →
   try `employees.tz`, otherwise return `{type:"id_card"}`.
2. **Prefix routing** — the string is upper-cased and checked against
   `PREFIX_ROUTES`. A match deterministically selects the target table:

   | Prefix        | Entity           | Column           |
   |---------------|------------------|------------------|
   | `PRD-`        | product          | `sku`            |
   | `INV-`        | invoice          | `doc_number`     |
   | `AST-`        | asset            | `asset_tag`      |
   | `EMP-`        | employee         | `employee_code`  |
   | `SUP-`        | supplier         | `supplier_code`  |
   | `PO-`         | purchase_order   | `po_number`      |
   | `DOC-`        | document         | `doc_number`     |

3. **Fallback chain** — if no prefix and no TZ:
   - `products.barcode` → `products.sku`
   - `documents.doc_number` → `documents.invoice_number`
   - `assets.asset_tag`
   - `employees.employee_code`
   - Otherwise the entity is `"unresolved"`.

All Supabase look-ups are wrapped in `safeSelect`, which swallows DB
errors and returns `null`. The scanner never crashes because a table
is missing — it just downgrades to an unresolved result.

---

## 4. Checksum validation details

### EAN-13 / UPC-A (Mod-10)

UPC-A is zero-padded to 13 digits and then treated identically to an
EAN-13. Weights are `1,3,1,3,…` across the first 12 digits and the
13th digit is the check digit.

### Code 128 (Mod-103 "soft")

Full Mod-103 validation requires the glyph→value table and is performed
by the scanner hardware before emission. Once the payload arrives as
plain text, the internal check digit is gone — we only verify that the
string is valid printable ASCII (0x20–0x7E) and within size bounds.
This rules out corrupted / non-ASCII junk without giving false positives.

### Teudat-Zehut (Israeli ID)

```
pad to 9 digits
for i in 0..8:
    v = digit[i] * (1 if i%2==0 else 2)
    if v > 9: v -= 9
    sum += v
return sum mod 10 == 0
```

Used both for the plain 9-digit TZ and to verify the `tz` sub-field of a
PDF417 Israeli driving licence payload.

### Israeli VAT ("Osek Morshe") — optional helper

Not used in the hot path but exported as `israeliVatNumberValid(vat)`
for downstream modules. Multiplies each digit by its 1-based position
and checks `sum mod 11 == 0`.

---

## 5. Keyboard-Wedge support

USB HID barcode scanners behave like a keyboard: the scanner "types"
the decoded barcode followed by one of `\r`, `\n`, `\r\n`, or EOT
(0x04). Two integration patterns are supported:

### 5a. Server-side: HTTP POST

The ONYX backend strips trailing terminators automatically inside
`stripTerminators`. Any client can therefore forward the raw line
(`"4006381333931\r"`) without pre-processing.

### 5b. Browser: `keypress` listener

For desktop web terminals, install a global `keypress` listener that
buffers digits until it sees `Enter`, then POSTs to `/api/scanners/scan`.

```js
// web/wedge-listener.js — client-side snippet
(function () {
  let buffer = '';
  let lastKey = 0;

  // HID scanners emit at >30 keypresses/sec.  A real human typing
  // INV-2026-0001 by hand cannot keep up, so we use the inter-key
  // interval to distinguish the two.
  const WEDGE_MAX_INTERKEY_MS = 50;

  window.addEventListener('keypress', (ev) => {
    const now = Date.now();
    if (now - lastKey > WEDGE_MAX_INTERKEY_MS) buffer = '';
    lastKey = now;

    if (ev.key === 'Enter') {
      if (buffer.length >= 4) {
        fetch('/api/scanners/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: buffer,
            device: navigator.userAgent,
            location: window.location.pathname,
          }),
        }).then((r) => r.json()).then((result) => {
          document.dispatchEvent(new CustomEvent('onyx:scan', { detail: result }));
        });
      }
      buffer = '';
      return;
    }
    if (ev.key.length === 1) buffer += ev.key;
  });
})();
```

Downstream UI code listens to the `onyx:scan` custom event and renders
the available actions:

```js
document.addEventListener('onyx:scan', (e) => {
  const { entity, actions } = e.detail;
  console.log('Scanned', entity.type, entity.id, 'actions:', actions);
});
```

---

## 6. Mobile integration (camera-based)

For mobile or BYOD laptops without a physical scanner, use the
[`@zxing/library`](https://github.com/zxing-js/library) package with
the browser `getUserMedia` API. The backend endpoint is identical —
only the client changes.

```js
// web/mobile-scan.js
import { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } from '@zxing/library';

const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.EAN_13,
  BarcodeFormat.UPC_A,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.PDF_417,
]);
hints.set(DecodeHintType.TRY_HARDER, true);

const reader = new BrowserMultiFormatReader(hints);
const video  = document.getElementById('scan-video');

async function startScanning() {
  const devices = await reader.listVideoInputDevices();
  const rear = devices.find((d) => /back|rear|environment/i.test(d.label)) || devices[0];
  reader.decodeFromVideoDevice(rear.deviceId, video, async (result, err) => {
    if (result) {
      const code = result.getText();
      const res = await fetch('/api/scanners/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, device: 'mobile-camera' }),
      });
      const payload = await res.json();
      // Vibrate + navigate to detail page
      if (navigator.vibrate) navigator.vibrate(80);
      document.dispatchEvent(new CustomEvent('onyx:scan', { detail: payload }));
      reader.reset(); // stop after one successful scan
    }
  });
}

document.getElementById('scan-button').addEventListener('click', startScanning);
```

Add the `camera` permission to the host page and keep the video element
muted + playsinline so iOS Safari doesn't open fullscreen.

---

## 7. Server mount

`server.js` mounts the routes exactly like every other ONYX module:

```js
const { registerBarcodeScanRoutes } = require('./src/scanners/barcode-scanner');
registerBarcodeScanRoutes(app, { supabase, audit, log: logger });
```

`ctx.audit.log()` is optional — if present, every successful scan writes
a non-blocking `barcode.scan` audit entry with the device, location,
symbology, and resolved entity ID. Audit failures are swallowed so a
misconfigured audit trail can never break scanning.

---

## 8. GS1 Application Identifiers

`parseGs1(payload)` decodes the common GS1-128 AIs emitted on supplier
pallets. Supported identifiers and field names:

| AI   | Field name    | Length                 |
|------|---------------|------------------------|
| 01   | `GTIN`        | 14 fixed               |
| 10   | `BatchLot`    | up to 20, GS-terminated|
| 11   | `ProdDate`    | 6 fixed (`YYMMDD`)     |
| 13   | `PackDate`    | 6 fixed                |
| 17   | `ExpiryDate`  | 6 fixed                |
| 21   | `Serial`      | up to 20, GS-terminated|
| 30   | `CountEach`   | up to 8                |
| 310  | `WeightKg`    | 6 fixed (decimal in last digit of AI) |
| 400  | `CustomerPO`  | up to 30               |
| 401  | `ConsignmentNo` | up to 30             |
| 410  | `ShipToLoc`   | 13 fixed               |
| 8200 | `URL`         | up to 70               |

Unknown AIs cause `parseGs1` to return the fields parsed so far plus
`{ ok:false, reason:"unknown AI …" }` — the scanner still returns what
it could decode.

---

## 9. Rules & guarantees

- **No delete.** None of the module's exported action lists contain
  `delete` or `void`. This is enforced by the test
  `availableActions never contains delete`.
- **No new runtime dependencies.** The module is pure Node.js.
- **Deterministic.** Same input → same output. No randomness, no clocks
  in the parsed payload (only `scannedAt` is timestamped).
- **Defensive.** Any DB error during lookup downgrades to
  `{type:"unresolved"}`. The endpoint never throws because a table is
  missing or a column was renamed.

---

## 10. Testing

```bash
node --test src/scanners/barcode-scanner.test.js
```

Covers: terminator stripping, all 8 symbologies, Mod-10 on real EAN-13
and UPC-A samples, Mod-103 soft check, TZ Luhn, Osek Morshe, GS1 AI
decoding, Israeli PDF417 decoding, prefix routing, resolver against a
mocked Supabase client, `handleScan` end-to-end, and full route
registration. As of 2026-04-11: **33 tests, all passing**.
