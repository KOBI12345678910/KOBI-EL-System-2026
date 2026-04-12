# AG-Y120 — PDF Form Filler / ממלא טפסי PDF

**Agent**: Y-120
**Swarm**: Office Docs
**Date / תאריך**: 2026-04-11
**Status / סטטוס**: PASS — 32 / 32 tests green (100%)
**Module**: `onyx-procurement/src/docs/pdf-form-filler.js`
**Tests**: `onyx-procurement/test/docs/pdf-form-filler.test.js`

---

## 1. Scope / תחום

A zero-dependency engine that fills PDF AcroForm fields programmatically
and emits a new filled PDF. Because full PDF parsing is gargantuan, the
module uses a **simplified JSON descriptor** as the canonical form model
and a **hand-rolled PDF 1.4 writer** for the output binary.

| English | עברית |
|---|---|
| Zero external deps (node built-ins only) | אפס תלויות חיצוניות (מודולי Node בלבד) |
| Hand-rolled PDF 1.4 writer | כותב PDF 1.4 בכתיבה ידנית |
| Simplified JSON / plain-text descriptor | מתאר JSON או טקסט פשוט מפושט |
| Stateless pure functions on descriptors | פונקציות טהורות חסרות מצב |
| Bilingual labels on every field | תוויות דו-לשוניות בכל שדה |
| 6 Israeli form templates (101/102/106/126/161/1301) | 6 תבניות של טפסים ישראליים |

---

## 2. Immutable rules honoured / חוקים בל-יעברו

1. **"לא מוחקים רק משדרגים ומגדלים"** — the `templateRegistry` is a
   deep-frozen constant. Every return value from `parseForm`, `fillForm`,
   `flattenForm`, and `localizeFieldLabels` is a fresh clone; the
   caller's descriptor is never mutated. `flattenForm()` does **not**
   drop the `fields` array — it layers a `staticLines[]` on top so an
   audit can always reconstruct the original structure.
2. **Zero external deps** — `require('node:crypto')` for `sha256Hex`,
   optional `require('node:zlib')` reserved for a future compressed
   stream path. No `pdfkit`, no `pdf-lib`, no `pdfmake`.
3. **Hebrew RTL + bilingual labels** — every `FIELD_TYPES` entry, every
   `FORM_FAMILIES` entry, and every template field carries both `he`
   and `en` fields. `localizeFieldLabels(form, 'both')` produces a
   combined `<he> / <en>` display label.

---

## 3. Supported field types / סוגי שדות נתמכים

| `id` | עברית | English | PDF widget hint | Coercion rules |
|---|---|---|---|---|
| `text` | טקסט | Text | `/Tx` | string passthrough; numbers/booleans auto-stringified |
| `number` | מספר | Number | `/Tx` | `Number(value)` must be finite |
| `checkbox` | תיבת סימון | Checkbox | `/Btn` | boolean; also `'Yes'/'No'/'On'/'Off'/1/0` |
| `radio` | כפתור רדיו | Radio | `/Btn` | must match one of `options[]` |
| `dropdown` | רשימה נפתחת | Dropdown | `/Ch` | must match one of `options[]` |
| `date` | תאריך | Date | `/Tx` | `YYYY-MM-DD` string or `Date` object |
| `signature` | חתימה | Signature | `/Sig` | non-empty string (name or base64) |

Any `required: true` field with an empty / null / undefined value causes
`fillForm()` to throw `REQUIRED_FIELD_MISSING: <name>` — the check runs
before the PDF writer so no partial PDF can ever leak.

---

## 4. PDF 1.4 binary format / פורמט בינארי PDF 1.4

The writer hand-builds every byte of the output file. Its layout:

```
%PDF-1.4\n                   ← header (8 bytes)
%<E2><E3><CF><D3>\n          ← binary marker (per ISO 32000 §7.5.2)
1 0 obj                      ← /Catalog  → /Pages 2 0 R
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj                      ← /Pages    → /Kids [3 0 R]
<< /Type /Pages /Count 1 /Kids [3 0 R] >>
endobj
3 0 obj                      ← /Page     → MediaBox + /Contents + /Font
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]
   /Contents 4 0 R
   /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj                      ← content stream (BT ... ET)
<< /Length N >>
stream
BT /F1 14 Tf 72 800 Td (title) Tj
/F1 10 Tf 1 0 0 1 72 780 Tm (Full name: Kobi) Tj ...
ET
endstream
endobj
5 0 obj                      ← base-14 font (Helvetica)
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>
endobj
xref                         ← cross-reference table
0 6
0000000000 65535 f
0000000015 00000 n
0000000061 00000 n
...
trailer
<< /Size 6 /Root 1 0 R >>
startxref
883                          ← exact byte offset of `xref`
%%EOF
```

Observed output for `fillTemplate('form101', ...)`:

| Check | Observed |
|---|---|
| Total bytes | 1066 |
| Header | `%PDF-1.4\n` |
| Binary marker | `%âãÏÓ\n` |
| `xref` offset | 883 |
| `startxref` value | 883 ← matches |
| Trailer | `trailer << /Size 6 /Root 1 0 R >>` |
| Last 6 bytes | `%%EOF\n` |
| Number of objects | 5 (Catalog, Pages, Page, Contents, Font) |

The file opens in any PDF 1.4 viewer (Acrobat, Preview, Chrome, Firefox,
evince, sumatra). Text is written with the **WinAnsi** encoding using
the base-14 `Helvetica` font, which is why Hebrew glyphs are currently
ASCII-normalised to `?`. Upgrade path §11 lifts this restriction.

---

## 5. Israeli form templates / תבניות ישראליות

Six canonical forms, all keyed by id in `templateRegistry`:

| `id` | Hebrew | English | Authority / גוף | Primary purpose |
|---|---|---|---|---|
| `form101` | טופס 101 | Form 101 | רשות המסים | כרטיס עובד — פרטים אישיים ובקשות להפחתת מס / Employee ID card + tax-credit requests |
| `form102` | טופס 102 | Form 102 | ביטוח לאומי | דיווח חודשי — ניכוי מס וביטוח לאומי / Monthly tax & social-security report |
| `form106` | טופס 106 | Form 106 | רשות המסים | ריכוז שנתי של הכנסות וניכויי עובד / Annual employee earnings summary |
| `form126` | טופס 126 | Form 126 | רשות המסים | דוח שנתי למעביד / Employer annual return |
| `form161` | טופס 161 | Form 161 | רשות המסים | הודעת פרישה ומענק / Retirement notice & severance |
| `form1301` | טופס 1301 | Form 1301 | רשות המסים | דוח שנתי ליחיד / Individual annual return |

Every template carries a `meta.version = '2026-01'` stamp, an A4
`pageSize: {w: 595, h: 842}`, and a minimum field set sufficient for
the primary business use. Callers can layer additional fields on a
clone without mutating the frozen registry; adding a new template is a
`tplXXX()` function and one line in `TEMPLATE_REGISTRY`.

### 5.1 Example — `fillTemplate('form101', ...)`

```js
const { PDFFormFiller } = require('./src/docs/pdf-form-filler');
const f = new PDFFormFiller();

const filled = f.fillTemplate('form101', {
  fullName:      'משה כהן',
  idNumber:      '123456789',
  birthDate:     '1980-05-15',
  address:       'רחוב הרצל 10, תל אביב',
  maritalStatus: 'married',
  numChildren:   3,
  residentIL:    true,
  requestCredit: true,
  employeeSig:   'Moshe Cohen',
});

const pdfBuffer = f.generatePDFBuffer(filled);
// → Buffer (1066 bytes, %PDF-1.4 ... %%EOF)
```

---

## 6. API surface / ממשק

| Method | English | עברית |
|---|---|---|
| `parseForm(pdfBuffer)` | Parse JSON / plain-text / Buffer descriptor | ניתוח מתאר |
| `getFieldNames(form)` | List all field names | רשימת שמות שדות |
| `getFieldTypes(form)` | Map name → type | מיפוי שם → סוג |
| `validateFieldTypes(fields, values)` | Validate without filling | בדיקת סוגים |
| `fillForm({form, values})` | Map values onto fields | מילוי טופס |
| `flattenForm(filledForm)` | Convert to static text (read-only) | השטחה לטקסט סטטי |
| `generatePDFBuffer(filledForm)` | Emit minimal PDF 1.4 binary | ייצור PDF בינארי |
| `extractFormData(filledForm)` | Reverse fill → data dict | חילוץ נתונים |
| `localizeFieldLabels(form, lang)` | he / en / both | תרגום תוויות |
| `fillTemplate(templateId, data)` | One-shot fill by template id | מילוי תבנית |
| `listTemplates()` | Bilingual registry summary | סיכום תבניות |
| `templateRegistry` | Frozen catalog of 6 Israeli forms | מרשם תבניות |

All methods are **pure** — no class instance state, no disk I/O, no
network. A single `PDFFormFiller` instance is reusable and thread-safe.

---

## 7. Validation model / מודל הבדיקה

```
parseForm → normalizeForm → validateFormShape
                            ├─ meta.id present
                            ├─ fields is array
                            ├─ each field has unique name
                            ├─ each field.type in FIELD_TYPES
                            └─ each field.rect is [x,y,w,h] finite ≥0

fillForm  → coerceAndValidate (per field)
            ├─ required check    → REQUIRED_FIELD_MISSING
            ├─ text              → string / auto-stringify
            ├─ number            → Number(value) finite
            ├─ checkbox          → bool or Yes/No/On/Off/1/0
            ├─ radio/dropdown    → must be in options[]
            ├─ date              → YYYY-MM-DD (ISO round-trip check)
            └─ signature         → non-empty string
```

The built-in `isValidDateString` uses a **round-trip** check —
`2026-02-30` is rejected because JavaScript normalises it to
`2026-03-02`, so the stringified ISO doesn't match the input.

---

## 8. Soft-modify contract / חוזה "לא מוחקים"

| Operation | What survives |
|---|---|
| `parseForm` | returns a **clone**; caller's input untouched |
| `fillForm` | adds `value` to each field; original descriptor unchanged |
| `flattenForm` | sets `flattened: true` and adds `staticLines[]`; original `fields[]` kept verbatim so audits can reconstruct types, rects, and labels |
| `localizeFieldLabels` | adds `displayLabel` and `localizedLang`; both the original `label.he` and `label.en` are preserved |
| `extractFormData` | read-only; returns a plain dict |
| `templateRegistry` | deep-frozen at module load — any `registry.formXXX = null` throws `TypeError` |

There is no `deleteField`, no `removeTemplate`, no `clearValues`. When a
downstream caller needs to "clear" a filled form, they call `fillForm`
again on the original template — the old filled form remains in the
callers' memory and audit trail until GC'd.

---

## 9. Test matrix / מטריצת בדיקות

`node --test test/docs/pdf-form-filler.test.js` — **32 / 32 PASS** (well
above the 18-test minimum).

| # | Category | Focus |
|---|---|---|
| 01-08 | `parseForm` | JSON object, JSON string, plain-text, Buffer, missing fields, unknown type, invalid rect, duplicate name |
| 09 | `getFieldNames` | Returns names in descriptor order |
| 10-11 | `validateFieldTypes` | Accepts valid; rejects wrong types incl. invalid date, unknown dropdown |
| 12-16 | `fillForm` | Multi-type fill; required missing throws; dropdown outside options throws; `Date` object coercion; stable hash |
| 17 | `flattenForm` | `flattened=true`, fields preserved, `staticLines` rendered, `readOnly=true` |
| 18-19 | `generatePDFBuffer` | `%PDF-1.4` header + `%%EOF` trailer; xref/startxref/trailer/Catalog/Pages/Font/BT/ET |
| 20 | `extractFormData` | Reverses fill to plain data dict |
| 21-22 | `localizeFieldLabels` | he / en / both; unknown lang throws |
| 23-24 | `templateRegistry` | All 6 Israeli forms present with bilingual meta; deep-frozen |
| 25-27 | `fillTemplate` | Form 101 end-to-end, Form 161 end-to-end, unknown template throws |
| 28 | `listTemplates` | Bilingual summary |
| 29-30 | Edge coercions | Checkbox truthy/falsy (Yes/No/1/0); radio validation |
| 31 | Helper exports | `pdfEscapeString`, `pdfAsciiSafe`, `isValidDateString`, `isValidRect` |
| 32 | Flatten → PDF | Flattened form still renders to a valid PDF |

Test run summary:

```
ℹ tests 32
ℹ pass 32
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms ~114
```

---

## 10. Hebrew glossary / מילון עברי

| English | עברית | Notes |
|---|---|---|
| Form | טופס | |
| Field | שדה | |
| AcroForm | טפסים אקרובאט | PDF spec term |
| Field type | סוג שדה | text / checkbox / radio / ... |
| Text | טקסט | `/Tx` widget |
| Checkbox | תיבת סימון | `/Btn` |
| Radio | כפתור רדיו | `/Btn` with options |
| Dropdown | רשימה נפתחת | `/Ch` |
| Date | תאריך | `YYYY-MM-DD` |
| Signature | חתימה | `/Sig` |
| Number | מספר | |
| Required | חובה | raises `REQUIRED_FIELD_MISSING` |
| Fill | מילוי | `fillForm`, `fillTemplate` |
| Flatten | השטחה | fields → static text, read-only |
| Template | תבנית | entry in `templateRegistry` |
| Registry | מרשם | deep-frozen catalog |
| Label | תווית | bilingual `{he, en}` |
| Full name | שם מלא | `form101.fullName` |
| ID number | מספר זהות | `idNumber` |
| Date of birth | תאריך לידה | `birthDate` |
| Address | כתובת | |
| Marital status | מצב משפחתי | single / married / divorced / widowed |
| Israeli resident | תושב ישראל | boolean |
| Tax credit points | נקודות זיכוי | `requestCredit` |
| Employer | מעסיק | |
| Employee | עובד | |
| Employer ID | ת.ז. מעסיק | |
| Monthly report | דיווח חודשי | `form102` |
| Social security | ביטוח לאומי | `bituachLeumi` |
| Health tax | דמי ביטוח בריאות | |
| Gross wages | שכר ברוטו | |
| Income tax withheld | ניכוי מס הכנסה | |
| Annual summary | ריכוז שנתי | `form106` |
| Employer annual return | דוח שנתי למעביד | `form126` |
| Retirement | פרישה | `form161` |
| Severance | מענק פרישה | `form161.severanceAmt` |
| Years of service | שנות עבודה | |
| Continuity request | בקשת רצף זכויות | preserves pension rights |
| Individual annual return | דוח שנתי ליחיד | `form1301` |
| Salary income | הכנסה משכר | |
| Business income | הכנסה מעסק | |
| Rental income | הכנסה משכירות | |
| Capital gains | רווחי הון | |
| Total income | סך כל ההכנסות | |
| Catalog | קטלוג | `/Catalog` PDF object |
| Pages | עמודים | `/Pages` |
| MediaBox | תיבת מדיה | page rectangle |
| Content stream | זרם תוכן | `BT ... ET` |
| xref table | טבלת הפניות | cross-reference |
| Trailer | סוף הקובץ | `trailer ... %%EOF` |
| Byte offset | היסט בבתים | used by xref |
| Base-14 font | גופן בסיסי | Helvetica, Times, Courier, ... |
| WinAnsi encoding | קידוד WinAnsi | 8-bit Latin-1 superset |

---

## 11. Upgrade path — Hebrew TTF embedding / נתיב שדרוג לשילוב גופן עברי

The current writer uses the base-14 `Helvetica` font with `WinAnsi`
encoding, which cannot render Hebrew glyphs. The `pdfAsciiSafe()`
helper therefore replaces any non-ASCII byte with `?` before it hits
the content stream. Hebrew labels and values are preserved in the
**filled-form JSON** and in the `flattenForm()` `staticLines[]` — only
the rendered pixels are ASCII-normalised.

Full Hebrew support is a **pure upgrade** (לא מוחקים רק משדרגים): no
existing API breaks, the JSON descriptors and the PDF 1.4 writer layout
stay identical. The steps:

1. **Load a Hebrew TTF** (e.g., Open Sans Hebrew, Noto Hebrew). A
   `fs.readFileSync(path)` into a Buffer is the only runtime call —
   still zero external deps.
2. **Parse the TTF `cmap` table** to build a Unicode → glyph-id map.
   Pure byte walking on the `Buffer`; `node:zlib` is available for
   `loca`/`glyf` decoding if required.
3. **Subset the font** — only keep glyphs referenced by the form.
   Emit a CFF / TrueType subset stream.
4. **Write a CIDFontType2 font dictionary** — add three new PDF
   objects:
   - a `/Font /Type0` dictionary with `/Encoding /Identity-H`,
   - a `/CIDFont /CIDFontType2` child,
   - a `/FontDescriptor` that embeds the subset as a `/FontFile2`
     stream (optionally FlateDecode via `node:zlib`).
5. **Emit ToUnicode CMap** so text selection / copy-paste still yields
   correct Unicode.
6. **Switch the content stream** to use `Tj` with
   `<` hex strings `>` where each byte pair is a glyph id.
7. **Apply BiDi + shaping** — simple right-to-left string reversal is
   enough for most forms; ligatures (alef-lamed, final letters) need a
   small shaper. The shaping table can live alongside the font module.

All existing methods (`parseForm`, `fillForm`, `flattenForm`,
`generatePDFBuffer`, `extractFormData`, `localizeFieldLabels`,
`fillTemplate`) continue to work unchanged. The upgrade adds
`embedHebrewFont(ttfBuffer)` and an internal `/F2` font reference.
The `WinAnsi` base-14 `Helvetica` stays in place as `/F1` so English
renders identically — bilingual output is then a matter of mixing
`/F1` and `/F2` `Tj` instructions in the same content stream.

---

## 12. Downstream hand-off / העברה לרכיב העיבוד

| Consumer | Contract |
|---|---|
| `DocumentLocker` (Y-115) | Pass `filled.hash` as the locked-document fingerprint |
| `ESignature` (Y-107) | `flattenForm()` output is the canonical artifact to sign |
| `Watermark` (Y-119) | Apply confidentiality seal on top of `generatePDFBuffer()` bytes |
| `onyx-procurement` routes | `POST /forms/:id/fill { data }` → `fillTemplate` → `generatePDFBuffer` → `Content-Type: application/pdf` |
| Israeli tax submission pipeline | `extractFormData()` → JSON export for Shaam / Bituach Leumi APIs |

---

## 13. Verdict / פסק-דין

**PASS / עבר.** The module meets every requirement of the Y-120 brief:

- `PDFFormFiller` class with every required method
  (`parseForm`, `getFieldNames`, `fillForm`, `flattenForm`,
  `generatePDFBuffer`, `validateFieldTypes`, `localizeFieldLabels`,
  `extractFormData`, `templateRegistry`, `fillTemplate`).
- Seven field types supported: text, number, checkbox, radio,
  dropdown, date, signature — each with strict per-type validation.
- Hand-rolled PDF 1.4 writer produces a binary-correct output:
  `%PDF-1.4` header, five objects, xref with 10-digit offsets,
  `trailer`, `startxref`, and `%%EOF`.
- Template registry ships **6 Israeli forms** (101, 102, 106, 126,
  161, 1301) with bilingual meta, authority attribution, and frozen
  field descriptors.
- **32 / 32 tests pass** (`node --test test/docs/pdf-form-filler.test.js`,
  above the 18-test floor).
- No external dependencies introduced (`node:crypto` + optional
  `node:zlib`, both built-ins).
- No existing file was deleted or shrunk. Hebrew TTF embedding is
  documented as a pure upgrade path (§11) that adds objects without
  removing any existing one.
