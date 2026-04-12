# ZPL Label Printing — Onyx Procurement

> Agent-84 — Zebra Programming Language (ZPL II) integration for Zebra-compatible thermal label printers.

## Overview

This module provides a zero-dependency JavaScript implementation of a **ZPL (Zebra Programming Language) command builder and transport layer** for the Onyx Procurement system. It lets the application generate and print product labels, shipping labels, inventory tags, asset identifiers, and employee ID badges on any Zebra-compatible printer (GK420, ZD420, ZT410, etc.), with **full Hebrew/RTL support**.

- **Module**: `src/printing/zpl-printer.js`
- **Tests**: `src/printing/zpl-printer.test.js` (82 tests — `node --test src/printing/zpl-printer.test.js`)
- **Templates**: `src/printing/label-templates/` (5 ready-to-use builders)
- **Zero dependencies**: uses Node 20+ `net`, `fs`, `path` only.

---

## Table of contents

1. [Quick start](#quick-start)
2. [Label builder API](#label-builder-api)
3. [ZPL commands reference](#zpl-commands-reference)
4. [Hebrew & RTL support](#hebrew--rtl-support)
5. [Image (PNG) support](#image-png-support)
6. [Pre-made templates](#pre-made-templates)
7. [Printer connection — Network, File, USB](#printer-connection)
8. [Unit conversions](#unit-conversions)
9. [Error handling / fail-open](#error-handling)
10. [Testing](#testing)
11. [Troubleshooting](#troubleshooting)

---

## Quick start

```js
const zpl = require('./src/printing/zpl-printer');

// 1. Build a label
const labelSource = zpl.label(400, 300)          // width x height (in dots)
  .unicode()                                     // enable UTF-8 for Hebrew
  .text(20, 20, 'שלום עולם', { size: 30, bold: true })
  .text(20, 60, 'Hello World', { size: 24 })
  .barcode(20, 110, '7290001234567', {
    type: 'ean13',
    height: 80,
  })
  .box(5, 5, 390, 290, 2)                        // border
  .build();

// 2. Save to file (testing)
await zpl.saveToFile(labelSource, './out/demo.zpl');

// 3. Send to printer (production)
await zpl.sendToPrinter(labelSource, {
  host: '192.168.1.50',
  port: 9100,
});
```

---

## Label builder API

### `label(width, height)` → `Label`

Creates a new label. `width` and `height` are in **dots** (not millimeters). The default Zebra DPI is **203 dpi = 8 dots/mm**.

```js
const lbl = zpl.label(400, 300);    // 400 dots wide, 300 dots tall
```

For human-friendly sizing:

```js
const { mmToDots } = zpl.util;
const lbl = zpl.label(mmToDots(50), mmToDots(37));  // 50mm x 37mm
```

### Chainable methods

| Method | Purpose |
|---|---|
| `.unicode()` | Enable UTF-8 (^CI28) — for Hebrew on modern firmware |
| `.hebrewLegacy()` | Enable CP862 (^CI10) — for old firmware |
| `.quantityOf(q)` | Print `q` copies (^PQ) |
| `.text(x, y, content, opts?)` | Print text |
| `.barcode(x, y, data, opts?)` | Print barcode (code128, code39, ean13, qr) |
| `.box(x, y, w, h, thickness?)` | Draw box outline or filled rectangle |
| `.circle(x, y, diameter, thickness?)` | Draw circle |
| `.line(x, y, length, thickness?)` | Horizontal rule |
| `.image(x, y, imageData)` | Embed raster image |
| `.raw(zplFragment)` | Passthrough raw ZPL |
| `.build()` → `string` | Render final ZPL source |

### `.text(x, y, content, opts)` options

| Option | Type | Default | Notes |
|---|---|---|---|
| `size` | number | 25 | Font height in dots |
| `width` | number | — | Defaults to `size` (or `size * 1.2` if bold) |
| `bold` | boolean | false | Emulated with wider glyphs |
| `font` | string | `'0'` | `'0'` is the scalable font; also `A`-`H` |
| `orientation` | string | `'N'` | `N` normal, `R` 90°, `I` 180°, `B` 270° |
| `rtlReverse` | boolean | false | Manually reverse Hebrew for non-Unicode firmware |
| `blockWidth` | number | — | Enable `^FB` wrapping at this width |
| `maxLines` | number | 1 | Max lines for `^FB` |
| `justify` | string | `'L'` | `L`, `C`, `R`, `J` (justified) |
| `reverse` | boolean | false | White-on-black (^FR) |

### `.barcode(x, y, data, opts)` options

| Option | Type | Default | Notes |
|---|---|---|---|
| `type` | string | `'code128'` | `code128`, `code39`, `ean13`, `qr` |
| `height` | number | 100 | Bar height in dots (ignored for QR) |
| `orientation` | string | `'N'` | N/R/I/B |
| `printLine` | string | `'Y'` | Print human-readable text below |
| `magnification` | number | 5 | QR only (1–10) |
| `errorCorrection` | string | `'M'` | QR only — `H`, `Q`, `M`, `L` |

**Barcode types:**

- **Code 128** — general-purpose, alphanumeric, very dense. Best for arbitrary data.
- **Code 39** — older, subset of ASCII, slightly larger. Used for inventory/asset tags.
- **EAN-13** — 12 digits + check (auto). Retail product barcodes (Israel: 729xxxxxxxxxx).
- **QR** — up to ~4KB. URLs, JSON payloads, vCards.

---

## ZPL commands reference

The module wraps these ZPL II commands. All are available through both the `Label` fluent API and the lower-level `zpl.commands.*` functions.

| ZPL | Purpose | Fluent method | Low-level |
|---|---|---|---|
| `^XA` | Start label | (auto) | `commands.startLabel()` |
| `^XZ` | End label | (auto) | `commands.endLabel()` |
| `^FO x,y` | Field origin | (all positioned methods) | `commands.fieldOrigin(x, y)` |
| `^A0N,h,w` | Scalable font | `.text()` | `commands.font(h, w)` |
| `^FD ... ^FS` | Field data | `.text()` | `commands.fieldData(text)` |
| `^BC` | Code 128 | `.barcode({ type: 'code128' })` | `commands.code128(h)` |
| `^B3` | Code 39 | `.barcode({ type: 'code39' })` | `commands.code39(h)` |
| `^BE` | EAN-13 | `.barcode({ type: 'ean13' })` | `commands.ean13(h)` |
| `^BQ` | QR code | `.barcode({ type: 'qr' })` | `commands.qrCode(mag, ec)` |
| `^GB` | Graphic box | `.box()`, `.line()` | `commands.box(w, h, t)` |
| `^GC` | Graphic circle | `.circle()` | `commands.circle(d, t)` |
| `^GFA` | Graphic field (image) | `.image()` | `commands.graphicField(hex, bytes, row)` |
| `^LL` | Label length | `label(w, H)` | `commands.labelLength(dots)` |
| `^PW` | Print width | `label(W, h)` | `commands.printWidth(dots)` |
| `^PQ` | Print quantity | `.quantityOf(q)` | `commands.printQuantity(q)` |
| `^CI28` | UTF-8 code page | `.unicode()` | `commands.codePage(28)` |
| `^CI10` | CP862 (Hebrew) | `.hebrewLegacy()` | `commands.codePage(10)` |
| `^FB` | Field block (wrap) | `.text({ blockWidth })` | `commands.fieldBlock(...)` |
| `^FR` | Field reverse | `.text({ reverse: true })` | `commands.fieldReverse()` |
| `^FH` | Field hex escape | — | `commands.fieldHex()` |

### Full example with low-level commands

```js
const { commands: c } = require('./src/printing/zpl-printer');

const raw = [
  c.startLabel(),
  c.codePage(28),
  c.printWidth(400),
  c.labelLength(300),
  c.fieldOrigin(20, 20) + c.font(30, 30) + c.fieldData('Hello'),
  c.fieldOrigin(20, 60) + c.code128(80) + c.fieldData('12345'),
  c.endLabel(),
].join('\n');
```

---

## Hebrew & RTL support

Zebra printers support Hebrew via **two different mechanisms** depending on firmware version:

### Option A — UTF-8 (recommended, modern firmware V60.x+)

```js
zpl.label(400, 300)
  .unicode()                                 // ^CI28
  .text(20, 20, 'שלום עולם', { size: 30 })
  .build();
```

The printer receives raw UTF-8 bytes and renders Hebrew directly with the built-in Hebrew font. **RTL direction is handled by the printer automatically** — no manual reversal needed.

Requires a Zebra printer with **Link-OS or V60.x/V61.x firmware** and Hebrew font installed (most post-2015 models ship with it).

### Option B — CP862 (legacy firmware)

```js
zpl.label(400, 300)
  .hebrewLegacy()                            // ^CI10
  .text(20, 20, 'hello')                     // ASCII only in ZPL source
  .build();

// Then send with cp862 encoding:
await zpl.sendToPrinter(zplSource, {
  host: '192.168.1.50',
  encoding: 'cp862',
});
```

The module's `encodeCP862()` helper maps Hebrew Unicode codepoints (U+05D0–U+05EA) to the legacy 0x80–0x9A range. Older Zebra printers with Hebrew ROM chips expect this.

### Option C — manual RTL reversal (fallback)

Some very old or non-Hebrew printers render text strictly left-to-right. Use `rtlReverse: true` to mirror Hebrew word order and character order in software:

```js
zpl.label(400, 300)
  .text(20, 20, 'שלום עולם', { rtlReverse: true })
  .build();
```

### Hebrew detection helper

```js
const { hasHebrew } = zpl.util;
if (hasHebrew(productName)) {
  lbl.unicode().text(20, 20, productName, { rtlReverse: false });
} else {
  lbl.text(20, 20, productName);
}
```

---

## Image (PNG) support

### Full PNG decoding — out of scope

This module is **zero-dependency**, which means it does **not include a PNG decoder**. Decoding PNG pixels to 1bpp raster requires either:

- A native library (`sharp`, `jimp`), or
- ~2,000 lines of JS for inflate + filter unwinding.

### Two supported paths

**Path 1 — Pre-decoded raster** (recommended). Decode your image elsewhere and pass the raw 1bpp buffer:

```js
lbl.image(x, y, {
  raster: Buffer.from([0xFF, 0x00, ...]),   // packed MSB-first
  width: 150,                                // pixels
  height: 150,
});
```

The module emits a valid `^GFA` block with your data.

**Path 2 — PNG buffer with placeholder**. If you pass a raw PNG buffer, the module parses the IHDR to get dimensions and emits a blank (all-zero) raster at the correct size. Useful for layout preview:

```js
const pngBytes = fs.readFileSync('./logo.png');
lbl.image(20, 20, pngBytes);   // prints a blank rectangle matching dimensions
```

### Integrating a real PNG decoder

If your team chooses to add a dependency, drop this shim into your code:

```js
const sharp = require('sharp');
const zpl = require('./src/printing/zpl-printer');

async function pngToRaster(pngPath, threshold = 128) {
  const { data, info } = await sharp(pngPath)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const bytesPerRow = Math.ceil(info.width / 8);
  const raster = Buffer.alloc(bytesPerRow * info.height);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] < threshold) {
        raster[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return { raster, width: info.width, height: info.height };
}

// Usage
const img = await pngToRaster('./logo.png');
zpl.label(400, 300).image(20, 20, img).build();
```

---

## Pre-made templates

Five production-ready label templates ship with the module. Each accepts a plain object and returns a ZPL string.

### 1. Product label (תווית מוצר)

400 x 300 dots (~50mm x 37mm). Features Hebrew + English name, SKU, price, barcode, and QR code with product metadata.

```js
const zpl = require('./src/printing/zpl-printer');

const source = zpl.templates.productLabel({
  nameHebrew:  'מברג חשמלי 12V',
  nameEnglish: 'Electric Screwdriver 12V',
  price:       299.90,
  sku:         'TK-SCR-001',
  barcode:     '7290001234567',
  barcodeType: 'ean13',
  currency:    'NIS',
  quantity:    1,
});
```

### 2. Shipping label (תווית משלוח)

812 x 1218 dots (4" x 6" standard thermal shipping label). From/To addresses, tracking number, service class, weight, Code-128 barcode + QR.

```js
const source = zpl.templates.shippingLabel({
  from: {
    name: 'Techno Kol Uzi Ltd',
    address: 'רחוב הברזל 1',
    city: 'Tel Aviv',
    zip: '6701101',
    phone: '03-1234567',
  },
  to: {
    name: 'Kobi Eliashar',
    address: 'רחוב הרצל 42',
    city: 'Haifa',
    zip: '3200101',
    phone: '050-1111111',
  },
  trackingNumber: 'TK-SHIP-2026041100001',
  service: 'Express',
  weight: 2.5,
});
```

### 3. Inventory label

400 x 250 dots. Warehouse bin label with item code, description, location, and quantity.

```js
const source = zpl.templates.inventoryLabel({
  itemCode:    'TK-BLT-M8',
  description: 'Bolt M8 x 50mm, Zinc plated',
  location:    'A-12-03',
  qty:         250,
  uom:         'pcs',
  warehouse:   'WH-01',
});
```

### 4. Asset tag

400 x 200 dots. Small property-of sticker with asset ID, department, date, and QR.

```js
const source = zpl.templates.assetTag({
  assetId:    'TK-LAP-0042',
  department: 'Engineering',
  date:       new Date(),
  owner:      'Kobi E.',
  category:   'Laptop',
  serialNumber: 'SN-123456',
});
```

### 5. Employee ID badge

400 x 600 dots (portrait CR80 style). Photo placeholder, name, ID, department, barcode + QR.

```js
const source = zpl.templates.employeeId({
  name:       'Kobi Eliashar',
  employeeId: 'EMP-0042',
  department: 'R&D',
  jobTitle:   'Senior Engineer',
  issueDate:  '2026-01-01',
  expires:    '2027-01-01',
  photo:      null,   // or { raster, width, height }
});
```

### Standalone template files

For more granular control, `src/printing/label-templates/*.js` exports each template as a standalone module:

```js
const {
  buildProductLabel,
  buildShippingLabel,
  buildInventoryLabel,
  buildAssetTag,
  buildEmployeeId,
} = require('./src/printing/label-templates');
```

These files are self-contained — copy/modify them for custom variants without touching the core module.

---

## Printer connection

### Network (TCP 9100) — recommended

All modern Zebra network printers accept raw ZPL over TCP port **9100**.

```js
const ok = await zpl.sendToPrinter(source, {
  host: '192.168.1.50',
  port: 9100,           // default
  timeout: 5000,        // ms
  encoding: 'utf8',     // or 'cp862' for legacy Hebrew
});

if (!ok) {
  console.warn('printer unreachable, saving to spool');
  await zpl.saveToFile(source, './spool/' + Date.now() + '.zpl');
}
```

`sendToPrinter()` is **fail-open**: on any socket/timeout/write error it logs a warning and returns `false` rather than throwing. The caller should check the return value and decide whether to spool, retry, or alert.

### File output (testing)

Save ZPL to disk and preview with:

- **Labelary** — online ZPL viewer: <http://labelary.com/viewer.html>
- **ZebraDesigner** — Windows app with preview
- **zpl-printer CLI** — any emulator that reads ZPL

```js
await zpl.saveToFile(source, './out/demo.zpl');
```

### USB connection (via SerialPort)

Direct USB printing requires the `serialport` package, which is **not included** in this module to preserve zero-dependency design. To enable USB:

1. Install: `npm install serialport`

2. Replace the stub in `zpl-printer.js`:

```js
function sendViaUSB(zplData, opts = {}) {
  const { SerialPort } = require('serialport');
  return new Promise((resolve) => {
    const port = new SerialPort(
      { path: opts.port || 'COM1', baudRate: 9600 },
      (err) => {
        if (err) return resolve(false);
        port.write(zplData, (writeErr) => {
          if (writeErr) return resolve(false);
          port.drain(() => port.close(() => resolve(true)));
        });
      },
    );
  });
}
```

3. Usage:

```js
await zpl.sendViaUSB(source, { port: 'COM3' });  // Windows
await zpl.sendViaUSB(source, { port: '/dev/ttyUSB0' });  // Linux
```

**Note**: On most Zebra printers, USB appears as a virtual COM port (9600 8N1). Check your printer manual for the correct device name.

### Transport matrix

| Transport | Module support | Dependencies | Best for |
|---|---|---|---|
| Network (TCP 9100) | built-in | none | Production |
| File | built-in | none | Testing, spooling |
| USB | documented stub | `serialport` | Desktop POS |
| Bluetooth | not supported | — | Use `serialport` over rfcomm |

---

## Unit conversions

Zebra printers use **dots** as the coordinate unit. The default density is 203 dpi (8 dots/mm).

```js
const { mmToDots, inchesToDots } = zpl.util;

mmToDots(50);         // 400 dots @ 203dpi
mmToDots(25.4);       // 203 dots
inchesToDots(4);      // 812 dots (4-inch shipping label width)
inchesToDots(6);      // 1218 dots (4x6 label height)
```

Common label sizes in dots at 203 dpi:

| Size (inches) | Size (mm) | Dots (W x H) |
|---|---|---|
| 1 x 2 | 25 x 50 | 203 x 406 |
| 2 x 1 | 50 x 25 | 406 x 203 |
| 2 x 4 | 50 x 100 | 406 x 812 |
| 3 x 2 | 75 x 50 | 609 x 406 |
| 4 x 6 | 100 x 150 | 812 x 1218 |

For 300 dpi (12 dots/mm) printers, pass `dpi: 300` to `mmToDots(mm, 300)`.

---

## Error handling

The module follows **onyx-procurement's fail-open pattern** (same as `ai-bridge.js`):

- **No throws** for normal errors — transport failures, invalid input, unreachable printers all return `false` or `null`.
- **Warnings logged** via the shared `logger.js` (falls back to `console.warn`).
- Only **programmer errors** (invalid label dimensions, wrong argument types in builders) throw `RangeError`/`TypeError`. These fail fast at dev time.

```js
// Safe — always returns boolean
const ok = await zpl.sendToPrinter(source, { host: '10.0.0.99' });
if (!ok) {
  // handle gracefully — spool, retry queue, alert ops
}

// Will throw — misuse detected at construction
try {
  zpl.label(0, 300);   // RangeError: width must be positive
} catch (err) {
  console.error(err);
}
```

---

## Testing

```bash
node --test src/printing/zpl-printer.test.js
```

The test suite (82 tests) covers:

- All low-level command builders (^XA, ^FD, ^BC, ^BQ, etc.)
- Utility functions (`mmToDots`, `encodeCP862`, `hasHebrew`, `reverseHebrewForRTL`, `parsePNGHeader`, `rasterToZplHex`)
- Fluent `Label` builder (text, barcode, box, circle, image, raw)
- Hebrew/UTF-8 and CP862 legacy mode
- All 5 pre-made templates with valid and empty data
- Standalone template files under `label-templates/`
- `saveToFile` with nested directory creation
- `sendToPrinter` with a fake TCP server capturing payloads
- `sendToPrinter` fail-open on unreachable hosts
- `sendViaUSB` stub returning `false`

All tests are hermetic — no external network dependencies, no real printer required.

---

## Troubleshooting

### "Nothing prints"

1. **Check connectivity**: `nc 192.168.1.50 9100` (should connect). If not, verify the printer IP and that port 9100 is open.
2. **Check label dimensions**: if `^PW`/`^LL` exceed physical media the printer may eject blank labels. Reduce width/height to match installed stock.
3. **Verify format with Labelary**: <http://labelary.com/viewer.html> — paste your ZPL to see a rendered preview.

### Hebrew prints as boxes/garbage

- **Modern firmware**: ensure `.unicode()` is set. The printer must have the Hebrew font installed — check with `^HH` command or use ZebraUtilities.
- **Old firmware**: use `.hebrewLegacy()` + `encoding: 'cp862'` in `sendToPrinter`.
- **Both fail**: upgrade firmware, or fall back to `rtlReverse: true` with Latin-rendered Hebrew text (poor man's workaround).

### Barcode won't scan

- **Bar height too short**: increase to ≥ 80 dots.
- **EAN-13 needs exactly 12 digits** — the 13th (check) is auto-calculated.
- **QR magnification too small**: bump `magnification` to 6 or 7 for fax-size rendering.
- **Printer darkness too low**: increase via `^MD` or from the printer's LCD menu.

### Label offset / shifted

- Most printers auto-calibrate with `^MNY` (sense mark) or by running the feed button.
- Add `^LH x,y` to shift the origin if media is misaligned.

### `sendToPrinter` always returns `false`

- Check `logger` output — the warning message includes the underlying socket error.
- Common causes: firewall, wrong port, printer offline, printer busy (no paper/cover open).
- Try increasing `timeout` to 10000ms if the network is slow.

---

## Related files

| File | Purpose |
|---|---|
| `src/printing/zpl-printer.js` | Main module — builders + transport |
| `src/printing/zpl-printer.test.js` | 82 unit tests |
| `src/printing/label-templates/index.js` | Template re-exports |
| `src/printing/label-templates/product-label.js` | Product label template |
| `src/printing/label-templates/shipping-label.js` | Shipping label template |
| `src/printing/label-templates/inventory-label.js` | Inventory tag template |
| `src/printing/label-templates/asset-tag.js` | Asset tag template |
| `src/printing/label-templates/employee-id.js` | Employee ID badge template |

---

## References

- Zebra **ZPL II Programming Guide** (official): <https://www.zebra.com/us/en/support-downloads/knowledge-articles/ait/zpl-command-information-and-details.html>
- **Labelary** online ZPL viewer: <http://labelary.com/viewer.html>
- Zebra **code page table**: <https://support.zebra.com/cpws/docs/zpl/CI_Command.pdf>
- Israel barcode prefix **729**: <https://www.gs1il.org>
