# Thermal Printer (ESC/POS) Integration

> **Module:** `src/printing/thermal-printer.js`
> **Tests:**  `src/printing/thermal-printer.test.js` (47 tests, zero deps)
> **Agent:** 83 — KOBI EL 2026 — 2026-04-11

This module is a **zero-dependency** ESC/POS command builder and driver for
thermal receipt printers. It speaks the Epson ESC/POS protocol natively
(no libraries), supports Hebrew via **Code Page 862**, and ships pre-made
templates for receipts, invoices, kitchen orders, and delivery notes.

---

## 1. Quick start

```js
const { ThermalPrinter, Templates } = require('./printing/thermal-printer');

const p = new ThermalPrinter({
  transport: 'network',
  host:      '192.168.1.50',
  port:      9100,
  encoding:  'cp862',
  width:     48,
});

Templates.receipt(p, {
  store:   { name: 'חנות הדגל', vatId: '514123456', phone: '03-1234567' },
  items: [
    { qty: 2, desc: 'קפה שחור',  price: 12 },
    { qty: 1, desc: 'קרואסון',   price:  9 },
  ],
  totals: { subtotal: 33, vat: 5.61, vatRate: 17, total: 38.61, method: 'מזומן' },
  qr:      'https://example.com/r/INV-001',
  barcode: 'INV0001',
});

await p.send();
```

That's the full flow — no other setup required.

---

## 2. Transports

Four transports are built in. You pick one via the `transport` constructor
option.

| Transport | Option          | Notes |
|-----------|-----------------|-------|
| `file`    | `path`          | Writes raw ESC/POS bytes to a file. Great for tests, previews, and archival. |
| `network` | `host`, `port`  | Opens a TCP socket to the printer (port 9100 is the industry standard). |
| `lpt`     | `device`, `path`| Writes to a temp file then spools via `copy /B file LPTx:` on Windows, or `cat > /dev/lpX` on Linux. |
| `usb`     | `device`, `path`| **STUB** — writes to a file and logs a warning. Wire in [`serialport`](https://www.npmjs.com/package/serialport) or [`node-escpos-usb`](https://www.npmjs.com/package/escpos-usb) externally (see section 6). |

### 2.1 Network (TCP 9100)

Most kitchen/receipt printers have a built-in Ethernet port that listens on
TCP port 9100 and speaks raw ESC/POS. This is the recommended mode.

```js
const p = new ThermalPrinter({
  transport: 'network',
  host:      '192.168.1.50',
  port:      9100,
  timeoutMs: 5000,
});
```

### 2.2 File (testing / archival)

```js
const p = new ThermalPrinter({ transport: 'file', path: './out/receipt.bin' });
p.init().text('Hello').feed(3).cut('full');
await p.send();
// The file now contains raw ESC/POS bytes that can be piped to any printer:
//   copy /B out\receipt.bin LPT1:
```

### 2.3 LPT (Windows / legacy UNIX)

```js
const p = new ThermalPrinter({ transport: 'lpt', device: 'LPT1' });
```

On Windows the module spawns `cmd /c copy /B <tmp> LPT1:`. On Linux/BSD it
spawns `sh -c 'cat <tmp> > /dev/lp0'`.

### 2.4 USB (stub)

USB ESC/POS printers on Windows usually expose themselves as a virtual COM
port (e.g. `COM3`) and can be driven by `serialport`. On Linux they appear
as `/dev/usb/lp0` or similar and can be written to directly.

The built-in `usb` transport writes the buffer to a file and logs a
warning. To go fully live, copy the buffer from `printer.getBuffer()` and
send it yourself:

```js
// Minimal example with node-serialport (not a dep of this module):
const { SerialPort } = require('serialport');
const port = new SerialPort({ path: 'COM3', baudRate: 9600 });

const p = new ThermalPrinter({ transport: 'file', path: './tmp.bin' });
Templates.receipt(p, { /* ... */ });
port.write(p.getBuffer());
```

---

## 3. Hebrew support

### 3.1 Code Page 862

Most ESC/POS receipt printers ship with a Hebrew code page built into ROM:
**CP862 (Hebrew DOS)**. In CP862, Unicode Alef (U+05D0) maps to byte `0x80`
and Tav (U+05EA) maps to `0x9A`. The module does this conversion for you
automatically when `encoding: 'cp862'` is set (the default).

`init()` automatically emits:

```
ESC @                  reset
ESC t 15               select code page 15 (CP862, Hebrew)
ESC R  7               select international set 7 (Israel)
```

If your printer supports UTF-8 directly, set `encoding: 'utf8'` and the
module will bypass CP862 translation.

### 3.2 RTL printing

ESC/POS printers are dumb about directionality — they print whatever bytes
they receive, left-to-right. To make Hebrew show up correctly, the module
applies a lightweight BiDi algorithm in `rtlReverse()`:

1. Split the line into runs of Hebrew / Latin+digits / whitespace.
2. Reverse the **order** of the runs.
3. Reverse the **characters** inside Hebrew runs (because the line itself
   is now flipped).
4. Latin/digit runs keep their internal order — so `"שלום 123"` prints as
   `"123 םולש"`, which reads correctly on the printed receipt.

This only kicks in when Hebrew characters are detected in a line. Pure
ASCII lines are left alone.

### 3.3 Niqqud / cantillation marks

CP862 has no niqqud. Any combining mark in the range U+0591..U+05C7 is
silently dropped. If you need full Unicode Hebrew, use a printer that
accepts UTF-8 and pass `encoding: 'utf8'`.

---

## 4. ESC/POS API

Every method returns `this`, so calls chain fluently.

| Method                     | ESC/POS sequence           | Notes |
|----------------------------|----------------------------|-------|
| `init()`                   | `ESC @`                    | Resets the printer, also selects CP862 + Israel. |
| `text(str)`                | raw bytes                  | Applies CP862 + RTL when `encoding='cp862'`. |
| `line(str)`                | text + `LF`                | |
| `bold(on)`                 | `ESC E n`                  | `true`/`false`. |
| `underline(mode)`          | `ESC - n`                  | `0`, `1`, `2`. |
| `align(mode)`              | `ESC a n`                  | `'left'`, `'center'`, `'right'`. |
| `size(mode)`               | `GS ! n`                   | `'normal'`, `'double'`, `'double_height'`, `'double_width'`. |
| `feed(n)`                  | `ESC d n`                  | `n` clamped to `[0, 255]`. |
| `cut(mode)`                | `GS V 65 3` / `GS V 66 3`  | `'full'` or `'partial'`. |
| `barcode(type, data, ...)` | `GS k m n d...`            | See 4.1. |
| `qrcode(data, opts)`       | `GS ( k ...`               | See 4.2. |
| `logo(image, opts)`        | `GS ( L ...`               | NV stored logo or raw buffer. |
| `cashDrawer(pin=0)`        | `ESC p m t1 t2`            | Open drawer on pin 0 or 1. |
| `row(left, right, w)`      | text layout                | Pads to `w` chars. Default `w = printer.width`. |
| `hr(ch, w)`                | text layout                | Draws a horizontal line of `ch`. |
| `clear()`                  | —                          | Empty the internal buffer. |
| `getBuffer()`              | —                          | Return the assembled bytes. |
| `getHex()`                 | —                          | Hex dump for debugging. |
| `send()`                   | —                          | Dispatch via the configured transport. |

### 4.1 Barcodes

Supported types (strings are case-insensitive, `-` and `_` interchangeable):

| Name       | Code byte | Format   |
|------------|-----------|----------|
| `UPC_A`    | `0x41`    | 12 digits |
| `UPC_E`    | `0x42`    | 7-12 digits |
| `EAN13`    | `0x43`    | 13 digits |
| `EAN8`     | `0x44`    | 8 digits |
| `CODE39`   | `0x45`    | alphanumeric |
| `ITF`      | `0x46`    | digits, even length |
| `CODABAR`  | `0x47`    | A-D start/stop |
| `CODE93`   | `0x48`    | ASCII |
| `CODE128`  | `0x49`    | any ASCII |

```js
p.barcode('CODE128', 'ONX-000123', {
  height: 80,   // GS h n       (in dots)
  width:  2,    // GS w n       (module width 2..6)
  hri:    2,    // GS H n       0=none 1=above 2=below 3=both
});
```

### 4.2 QR codes

```js
p.qrcode('https://example.com/invoice/42', {
  size: 6,     // 1..16  (module size in dots)
  ecl:  'M',   // 'L' | 'M' | 'Q' | 'H'
});
```

The module emits the standard Epson GS ( k sequence — Model 2 + module size
+ ECL + store data + print.

### 4.3 Logos

Two ways to print a logo:

1. **NV (non-volatile) key**: upload a PNG to the printer's NV memory once
   (use the vendor's utility), then reference it by key code:
   ```js
   p.logo({ keyCode1: 0x30, keyCode2: 0x31 }, { scaleX: 1, scaleY: 1 });
   ```
2. **Raw raster**: pre-compute a raster GS ( L block externally and pass it
   as a Buffer:
   ```js
   p.logo(myRasterBuffer);
   ```

### 4.4 Cash drawer

```js
p.cashDrawer();   // pulse pin 0 (most drawers)
p.cashDrawer(1);  // pulse pin 1
```

---

## 5. Templates

```js
const { Templates } = require('./printing/thermal-printer');
```

All templates accept a `ThermalPrinter` as the first argument and emit the
full sequence including `init()`, content, `feed()`, and `cut()`.

### 5.1 `Templates.receipt(printer, args)`

Full retail receipt (**קבלה**).

```js
Templates.receipt(printer, {
  store: {
    name:    'חנות הדגל',
    address: 'רחוב הרצל 10, תל אביב',
    phone:   '03-1234567',
    vatId:   '514123456',
    website: 'example.co.il',
  },
  items: [
    { qty: 2, desc: 'קפה שחור',  price: 12 },
    { qty: 1, desc: 'קרואסון',   price:  9 },
  ],
  totals: {
    subtotal: 33,
    vat:      5.61,
    vatRate:  17,
    total:    38.61,
    method:   'כרטיס אשראי',
    paid:     40,
    change:   1.39,
  },
  qr:      'https://example.co.il/r/INV-001',
  barcode: 'INV0001',
  footerNote: 'תודה ונתראה!',
});
```

### 5.2 `Templates.invoice(printer, args)`

Short 80 mm invoice (**חשבונית**). Same shape as receipt but adds
`invoiceNo`, `date`, and `customer: { name, vatId, address }`.

### 5.3 `Templates.kitchenOrder(printer, args)`

Restaurant kitchen ticket (**הזמנה למטבח**). No prices, double-height text,
partial cut at the end.

```js
Templates.kitchenOrder(printer, {
  orderNo: 42,
  table:   5,
  waiter:  'דנה',
  items: [
    { qty: 2, desc: 'פיצה מרגריטה', note: 'בלי זיתים' },
    { qty: 1, desc: 'סלט קיסר',     note: 'דרסינג בצד' },
  ],
  notes: 'לבישול מהיר — לקוח ממהר',
});
```

### 5.4 `Templates.deliveryNote(printer, args)`

Delivery note (**תעודת משלוח**). Items without prices + signature area.

```js
Templates.deliveryNote(printer, {
  store:  { name: 'מחסן ראשי', address: 'אזור תעשייה', phone: '08-1234567' },
  noteNo: 'DN-2026-0042',
  date:   '11/04/2026',
  recipient: { name: 'לקוח גדול בע"מ', address: 'הרצליה', phone: '09-999' },
  items: [
    { qty: 3,  desc: 'קופסת A', sku: 'SKU-A' },
    { qty: 12, desc: 'קופסת B', sku: 'SKU-B' },
  ],
  driver: 'יוסי',
});
```

---

## 6. Extending with real USB

If you need a real USB driver, install `serialport` separately and wire
it to the printer's output buffer:

```js
const { SerialPort } = require('serialport');
const { ThermalPrinter, Templates } = require('./printing/thermal-printer');

async function printViaUsb(receiptArgs) {
  const p = new ThermalPrinter({ transport: 'file', path: './.last-print.bin' });
  Templates.receipt(p, receiptArgs);

  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path: 'COM3', baudRate: 9600 }, (err) => {
      if (err) return reject(err);
      port.write(p.getBuffer(), (werr) => {
        port.close();
        if (werr) return reject(werr);
        resolve({ bytes: p.getBuffer().length });
      });
    });
  });
}
```

---

## 7. Testing

```bash
node --test src/printing/thermal-printer.test.js
```

The test file asserts **exact byte sequences** for every ESC/POS primitive
so any regression in the wire format is caught immediately. It covers:

- All 12 ESC/POS primitives (init / text / bold / underline / align / size /
  feed / cut / barcode / qrcode / logo / cashDrawer).
- CP862 encoding: ASCII pass-through, Hebrew letters, niqqud dropping,
  unmapped-char fallback.
- RTL reversal with mixed Hebrew + numbers.
- All four receipt templates (receipt, invoice, kitchen order, delivery
  note), verifying prices are omitted from kitchen orders and that the cut
  command is present.
- File transport (real write + byte-for-byte read-back).
- Error paths: unknown transport, missing file path, bad align/size mode.

As of 2026-04-11 all 47 tests pass in under 200 ms with no external deps.

---

## 8. FAQ

**Q: My Hebrew prints as gibberish.**
A: Your printer probably doesn't have CP862 in ROM. Check the test page:
most Epson/Star printers support it, but some Chinese clones ship with
only CP437. Try `encoding: 'utf8'` if the printer advertises UTF-8 mode.

**Q: I need bigger headers than `double`.**
A: ESC/POS `GS ! n` supports `(width-1) << 4 | (height-1)` for scales up
to 8×8. You can push a raw command directly:
```js
p._push([0x1D, 0x21, 0x77]);  // 8x wide 8x tall
```

**Q: How do I preview what a receipt looks like?**
A: Use the `file` transport and dump the hex:
```js
const p = new ThermalPrinter({ transport: 'file', path: './out.bin' });
Templates.receipt(p, { /* ... */ });
console.log(p.getHex());
```

**Q: Does this work in a browser?**
A: No — it's a Node module (uses `net`, `fs`, `child_process`). For the
browser, assemble the same commands with `Uint8Array` and ship them over
WebUSB or a WebSocket bridge.

---

## 9. Sequence reference (quick)

```
ESC @        1B 40                 reset
ESC E n      1B 45 n               bold on/off
ESC - n      1B 2D n                underline 0/1/2
ESC a n      1B 61 n               align L/C/R
ESC d n      1B 64 n               feed n lines
ESC p m t1t2 1B 70 m 19 FA         cash drawer kick
ESC R n      1B 52 n                intl char set
ESC t n      1B 74 n                code page (0x0F = CP862)
GS ! n       1D 21 n                char size
GS V m       1D 56 m                cut (0=full 1=partial 65=full-feed 66=partial-feed)
GS k m n d.. 1D 6B m n d1..dn       barcode (new format, m>=0x41)
GS ( k ...   1D 28 6B ...           QR code & NV image sub-commands
GS ( L ...   1D 28 4C ...           GS ( L graphics
GS h n       1D 68 n                barcode height
GS w n       1D 77 n                barcode width
GS H n       1D 48 n                barcode HRI position
```
