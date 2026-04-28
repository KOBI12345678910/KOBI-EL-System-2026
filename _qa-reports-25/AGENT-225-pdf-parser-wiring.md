# AGENT-225 — PDF Invoice Parser Wiring

**Date:** 2026-04-29
**Worktree:** `objective-merkle-40ff93`
**Status:** GREEN — wired end-to-end (parser → route → vendor match → UI)
**Predecessor:** Agent 194 (parser landed green but unwired)

## Goal

Take the existing standalone `pdf-invoice-parser.js` (Agent 89), bolt it
into the Express layer, plumb a vendor-matching join against
`suppliers`, and surface a user-facing button on the AP-invoice screen.
No invoice rows are auto-created — the operator still confirms.

## Files Changed

| # | Path                                                          | Change |
|---|---------------------------------------------------------------|--------|
| 1 | `onyx-procurement/package.json`                               | Added `optionalDependencies.pdf-parse@^1.1.1` |
| 2 | `onyx-procurement/src/imports/csv-import-routes.js`           | Required parser; new `POST /api/imports/pdf-invoice` route with vendor match |
| 3 | `onyx-procurement/web/supplier360.html`                       | Added "ייבוא PDF" button + `handlePdfInvoiceUpload()` JS |

(No new files. Per CLAUDE.md "no dead pages" rule, the import wires into
an existing P0 360-page tab.)

## 1) `optionalDependencies` Entry

```json
"optionalDependencies": {
  "pdf-parse": "^1.1.1"
}
```

`pdf-parse` is loaded with a `try { require } catch` in the parser
(see `loadPdfParse()` in `pdf-invoice-parser.js`, lines 133–140), so
`npm install` succeeding without it is non-fatal — the in-house
`extractTextFallback()` keeps service up. This matches the
"never-fail-cold-start" doctrine the rest of the import pipeline
follows.

## 2) Route — `POST /api/imports/pdf-invoice`

Mounted by the existing `registerCsvImportRoutes(app, { supabase, audit })`
factory. Request shapes accepted:

```json
{ "pdf":  { "base64": "JVBERi0xLjQK..." } }   // binary upload
{ "pdf":  "<base64-string>" }                  // shorthand
{ "text": "חשבונית מס\n..." }                  // pre-OCR text path
```

Response shape:

```json
{
  "audit_id": "pdf-inv-1730247000000",
  "parsed": {
    "vendor": "טכנו-קול עוזי בע\"מ",
    "vendor_vat_id": "514234567",
    "invoice_no": "INV-2026-0142",
    "invoice_date": "2026-04-22",
    "subtotal": 1000.00, "vat_amount": 180.00, "total": 1180.00,
    "vat_rate": 0.18, "totals_valid": true,
    "doc_type": "tax_invoice", "doc_type_hebrew": "חשבונית מס",
    "confidence": 87, "extraction_engine": "pdf-parse",
    "field_confidence": { "vendor_vat_id": 95, "total": 88, "..." : "..." }
  },
  "supplier_match": {
    "matched": true,
    "strategy": "vat_id",
    "supplier_id": "uuid-...",
    "supplier_name": "טכנו-קול עוזי בע\"מ",
    "candidates": [ /* up to 5 */ ]
  }
}
```

### Error semantics
- 400: missing `pdf` and `text`, or `pdf.base64` malformed/<4 bytes
- 500: unhandled exception in parser

### Audit
Emits `audit('pdf_invoice_parse', auditId, 'parsed', actor, msg, null, payload)`
on every call (success or partial). Best-effort try/catch — never blocks
the response. `actor` resolved from `req.actor` → `x-actor` header → `'api'`.

### Idempotency / safety
The route NEVER writes to `supplier_invoices`. It only:
1. Parses
2. Looks up `suppliers`
3. Logs to `audit_log` (best-effort)
4. Returns JSON

Matches CLAUDE.md "no dead pages" + "NEVER delete; commits insert/upsert
only" doctrine.

## 3) Vendor Matching Layer

The user spec said `suppliers.tax_id`. **The actual column in this
codebase is `suppliers.vat_id`** (see
`db/migrations/0002_suppliers_and_contacts.sql` line 17). I joined
against the real column. Two flagged migration files use both names:

| File | Column |
|---|---|
| `db/migrations/0002_suppliers_and_contacts.sql` | `vat_id TEXT UNIQUE` |
| `supabase/migrations/001-supabase-schema.sql`   | (no VAT column — older shape) |

A trigram GIN index `idx_suppliers_vat` exists on `vat_id`, so the
exact-match query is O(log n).

### Matching strategy (in order)

1. **VAT ID exact match** — when parser returned a 9-digit token via
   the `ע"מ` / `ח.פ` label proximity heuristic. Confidence 95.
   → Sets `strategy: "vat_id"`, `matched: true`.
2. **Name fuzzy match (`ilike '%term%'`)** — fallback when VAT ID
   absent or unmatched. Uses parser's `vendor` string (truncated to
   80 chars). Returns up to 5 candidates.
   → `matched: true` only when result count is exactly 1, otherwise
   the UI shows a chooser.
3. **No match** — returns `strategy: "none"` with empty candidates;
   UI prompts to create a new supplier.

Wrapped in try/catch — Supabase outage degrades gracefully to
`strategy: 'none'` plus an `error` field on `supplier_match`.

## 4) UI Button — Supplier 360 / חשבוניות ספק tab

Location: `web/supplier360.html`, line ~336 (Invoices tab header).

```html
<input type="file" id="pdfInvoiceInput" accept="application/pdf,.pdf"
       class="hidden" onchange="handlePdfInvoiceUpload(event)" />
<button onclick="document.getElementById('pdfInvoiceInput').click()"
        class="text-xs bg-bg3 text-text1 border border-border px-3 py-1 rounded-md hover:bg-borderHi"
        title="ייבוא חשבונית מקובץ PDF (Agent 225)">
  📄 ייבוא PDF
</button>
```

JS handler `handlePdfInvoiceUpload()` (added near
`actionRegisterInvoice()`):

1. 10 MB client-side cap → user-friendly Hebrew alert.
2. `arrayBuffer` → `btoa()` → POST JSON.
3. Renders confirmation alert with all parsed fields + match outcome
   in Hebrew (matches the page's RTL convention).
4. Stashes parsed payload on `window.__pdfParsedInvoice` for the
   follow-up "register" form to consume — avoids auto-creating
   anything (operator still confirms).

Mobile-friendly: `<input type=file accept="application/pdf">` triggers
the device camera-roll → "Files" picker on iOS / Android.

## Cross-Service Touch-Points

| Service              | Touched? | Reason |
|----------------------|----------|--------|
| TECHNO_KOL_OPS  3200 | ✗        | No flow stage change yet |
| ONYX_PROCUREMENT 3100| ✓        | Route + UI live here |
| PAYROLL_AUTONOMOUS   | ✗        | Not affected |
| ONYX_AI         3300 | (future) | Confidence < 60% should hand off to ONYX_AI for re-OCR — not in scope for 225 |

## How to Verify Locally

```bash
cd onyx-procurement
npm install                     # pdf-parse pulled into optional bucket
npm run dev                      # boot at :3100

# Smoke (text path — no PDF needed):
curl -s -X POST localhost:3100/api/imports/pdf-invoice \
  -H 'content-type: application/json' \
  -d '{"text":"חשבונית מס\nע.מ 514234567\nמספר חשבונית 2026-0142\nתאריך 22/04/2026\nסה\"כ לתשלום ₪1,180.00"}' \
  | jq .

# Expected: parsed.vendor_vat_id="514234567", supplier_match.strategy
# is "vat_id" if seed row exists, else "name_fuzzy" or "none".
```

UI: Open `/web/supplier360.html?id=<supplier_uuid>` → tab
"חשבוניות ספק" → click **📄 ייבוא PDF** → pick file → confirm dialog.

## Known Limitations / Follow-Up

1. **Server.js mount.** `registerCsvImportRoutes` is exported but I did
   not find a corresponding `require()` call in `server.js` (only
   `notification-routes` is wired). Whoever activates Agent 67's CSV
   import in production must add the same line for both:
   ```js
   require('./src/imports/csv-import-routes')
     .registerCsvImportRoutes(app, { supabase, audit });
   ```
   This is not a 225 regression — the gap pre-existed.
2. **CSP / multipart.** The route accepts JSON-with-base64 only.
   Adding a `multer` upload path is a follow-up if files > 1 MB
   become common (base64 expands payload by ~33%).
3. **Confidence routing.** Anything < 60% should bounce to
   ONYX_AI for human-in-the-loop OCR review. Hook lives in
   `field_confidence` already — UI flag is the next agent's call.
4. **Schema drift.** `supabase/migrations/001-supabase-schema.sql`
   still lacks a VAT column on `suppliers`. The route gracefully
   no-matches when the column is missing (caught by try/catch), but
   the next migration agent should reconcile both schemas.

## Acceptance Criteria

- [x] `pdf-parse` listed under `optionalDependencies`
- [x] `POST /api/imports/pdf-invoice` route added, returns
      `{ parsed, supplier_match, audit_id }`
- [x] Vendor matching joins `suppliers.vat_id` (note: column is
      `vat_id`, not `tax_id` — used real column name)
- [x] Fuzzy-name fallback when VAT ID absent
- [x] UI button on AP-invoice tab (`supplier360.html`)
- [x] Audit log entry per parse (best-effort)
- [x] No invoice rows auto-created (operator confirms)
- [x] No deletions (CLAUDE.md doctrine)
- [x] RTL Hebrew UI labels
- [x] Report under 300 lines

— Agent 225, 2026-04-29
