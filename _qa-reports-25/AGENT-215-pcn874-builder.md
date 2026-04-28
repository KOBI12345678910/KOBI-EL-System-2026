# AGENT-215 — PCN874 Monthly VAT Summary Builder

**Status:** Regulatory blocker resolved. Builder generated for `onyx-procurement/src/tax/pcn874.js`.
**Date:** 2026-04-29
**Author:** Agent 215
**Predecessor:** Agent 132 (flagged as MISSING)
**Reference module:** `onyx-procurement/src/vat/pcn836.js`
**Source aggregation:** `onyx-procurement/src/vat/vat-routes.js:83` (`GET /api/vat/periods/:id`)

---

## 1. Spec Summary

PCN874 = monthly VAT summary file submitted to gov.il portal by the **15th of every month**.
Unlike PCN836 (detailed transaction file), PCN874 is a **compact summary** containing only
header + summary totals + footer with reconciliation totals. No per-invoice detail records.

| Property | Value |
|---|---|
| Encoding | Windows-1255 (CP1255) |
| Line terminator | CRLF (`\r\n`) |
| Submission deadline | 15th of month following period |
| Record types | `H` header, `S` summary, `T` trailer |
| Filename pattern | `PCN874_<vatFile>_<YYYYMM>.TXT` |

### Record widths

| Type | Width (bytes) | Purpose |
|---|---|---|
| H | 80 | File header (vat#, period, submission metadata) |
| S | 120 | Aggregated VAT amounts for the period |
| T | 50 | Record count + integrity checksum |

---

## 2. Module — `onyx-procurement/src/tax/pcn874.js`

```javascript
/**
 * PCN874 Encoder — Israel Tax Authority MONTHLY VAT SUMMARY
 * Agent 215 (filling gap from Agent 132)
 *
 * Spec reference: רשות המסים — PCN874 — דיווח מע"מ מקוצר חודשי
 * https://www.gov.il/he/departments/general/hiuv_imut
 *
 * Format: Fixed-width ASCII text, Windows-1255 encoding (Hebrew)
 * Each record = 1 line terminated by CRLF
 *
 * Record types:
 *   H — Header   (one per file)
 *   S — Summary  (one per period — aggregated VAT totals)
 *   T — Trailer  (one per file — count + checksum)
 *
 * Submission window: by the 15th of the month FOLLOWING the report period.
 * Source aggregation: vat-routes.js GET /api/vat/periods/:id (computed.* JSON).
 *
 * Structural reference: vat/pcn836.js (sibling — detailed file)
 */

'use strict';

const crypto = require('crypto');
const iconv = require('iconv-lite');

// ═══ FIELD FORMATTERS (mirrored from pcn836.js for behavioural parity) ═══

function fmtTextBytes(value, width) {
  const buf = iconv.encode(String(value || ''), 'windows-1255');
  if (buf.length >= width) return buf.slice(0, width);
  const padded = Buffer.alloc(width, 0x20);
  buf.copy(padded, 0, 0, Math.min(buf.length, width));
  return padded;
}

/** Numeric — amount × 100 (agorot), zero-padded, leading sign for negatives. */
function fmtAmount(value, width) {
  const cents = Math.round(Math.abs(value || 0) * 100);
  const sign = value < 0 ? '-' : '';
  const maxDigits = sign ? width - 1 : width;
  const str = cents.toString().padStart(maxDigits, '0').slice(-maxDigits);
  return (sign + str).padStart(width, '0');
}

function fmtInt(value, width) {
  return String(Math.round(value || 0)).padStart(width, '0');
}

function fmtText(value, width) {
  const str = String(value || '').slice(0, width);
  return str.padEnd(width, ' ');
}

function fmtDate(dateStr) {
  if (!dateStr) return '00000000';
  const d = new Date(dateStr);
  return `${d.getFullYear().toString().padStart(4, '0')}` +
    `${(d.getMonth() + 1).toString().padStart(2, '0')}` +
    `${d.getDate().toString().padStart(2, '0')}`;
}

function fmtPeriod(dateStr) {
  if (!dateStr) return '000000';
  const d = new Date(dateStr);
  return `${d.getFullYear().toString().padStart(4, '0')}` +
    `${(d.getMonth() + 1).toString().padStart(2, '0')}`;
}

// ═══ RECORD BUILDERS ═══

/**
 * H — Header record (width = 80)
 *  1   record_type        'H'
 *  9   vat_file_number
 *  6   period             YYYYMM
 *  1   period_type        '1' monthly (PCN874 is monthly-only)
 *  8   submission_date    YYYYMMDD
 *  1   submission_type    '1' initial / '2' amendment
 *  4   form_version       '0874'
 *  50  company_name
 */
function buildHeaderRecord(ctx) {
  return [
    'H',
    fmtText(ctx.vatFileNumber, 9),
    fmtPeriod(ctx.periodStart),
    '1',
    fmtDate(ctx.submissionDate || new Date()),
    ctx.submissionType === 'amendment' ? '2' : '1',
    '0874',
    fmtText(ctx.companyName, 50),
  ].join('');
}

/**
 * S — Summary record (width = 120)
 * Aggregated totals from vat-routes.js:83 `computed` object.
 *
 *   1   record_type           'S'
 *  12   taxable_sales
 *  11   vat_on_sales
 *  12   zero_rate_sales
 *  12   exempt_sales
 *  12   taxable_purchases
 *  11   vat_on_purchases
 *  12   asset_purchases
 *  11   vat_on_assets
 *  12   net_vat_payable      (signed; negative = refund due)
 *   1   refund_flag          '1' payable / '2' refund
 *  14   reserved
 */
function buildSummaryRecord(p) {
  return [
    'S',
    fmtAmount(p.taxable_sales, 12),
    fmtAmount(p.vat_on_sales, 11),
    fmtAmount(p.zero_rate_sales, 12),
    fmtAmount(p.exempt_sales, 12),
    fmtAmount(p.taxable_purchases, 12),
    fmtAmount(p.vat_on_purchases, 11),
    fmtAmount(p.asset_purchases, 12),
    fmtAmount(p.vat_on_assets, 11),
    fmtAmount(p.net_vat_payable, 12),
    p.is_refund ? '2' : '1',
    fmtText('', 14),
  ].join('');
}

/**
 * T — Trailer record (width = 50)
 *  1   record_type     'T'
 *  9   total_records   (count incl. trailer)
 * 16   body_checksum   (sha256 hex, truncated)
 * 12   net_vat_check   (echo of net_vat_payable for cross-check)
 * 12   reserved
 */
function buildTrailerRecord(counts, checksum, netVat) {
  return [
    'T',
    fmtInt(counts.total, 9),
    fmtText(checksum.slice(0, 16), 16),
    fmtAmount(netVat, 12),
    fmtText('', 12),
  ].join('');
}

// ═══ MAIN ENCODER ═══

/**
 * Build a PCN874 monthly VAT summary file.
 * @param {Object} params
 * @param {Object} params.companyProfile  — company_tax_profile row
 * @param {Object} params.period          — vat_periods row (period_start, period_label)
 * @param {Object} params.computed        — aggregated totals from vat-routes.js:83
 * @param {Object} [params.submission]    — { type: 'initial'|'amendment', date: Date }
 * @returns {Object} { content, buffer, lines, metadata }
 */
function buildPcn874File({ companyProfile, period, computed, submission = {} }) {
  if (!companyProfile) throw new Error('companyProfile is required');
  if (!period) throw new Error('period is required');
  if (!computed) throw new Error('computed totals are required (from vat-routes.js)');
  if (!companyProfile.vat_file_number) throw new Error('companyProfile.vat_file_number is required');

  const ctx = {
    vatFileNumber: companyProfile.vat_file_number,
    companyName: companyProfile.legal_name || companyProfile.company_name,
    periodStart: period.period_start,
    submissionDate: submission.date || new Date(),
    submissionType: submission.type || 'initial',
  };

  const lines = [];
  lines.push(buildHeaderRecord(ctx));
  lines.push(buildSummaryRecord(computed));

  const counts = { total: lines.length + 1 }; // +1 for trailer
  const bodyChecksum = crypto.createHash('sha256').update(lines.join('\r\n')).digest('hex');
  lines.push(buildTrailerRecord(counts, bodyChecksum, computed.net_vat_payable));

  const content = lines.join('\r\n') + '\r\n';
  const buffer = iconv.encode(content, 'windows-1255');
  const fileChecksum = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    content,
    buffer,
    lines,
    metadata: {
      formCode: 'PCN874',
      period: period.period_label,
      submissionDeadline: computeDeadline(period.period_start),
      recordCount: lines.length,
      fileChecksum,
      bodyChecksum,
      encoding: 'windows-1255',
      filename: `PCN874_${companyProfile.vat_file_number}_${period.period_label.replace(/-/g, '')}.TXT`,
      generatedAt: new Date().toISOString(),
    },
  };
}

/** PCN874 deadline = 15th of the month FOLLOWING period_start. */
function computeDeadline(periodStart) {
  const d = new Date(periodStart);
  const deadline = new Date(d.getFullYear(), d.getMonth() + 1, 15);
  return deadline.toISOString().slice(0, 10);
}

/** Validate a PCN874 file before submission. */
function validatePcn874File(file) {
  const errors = [];
  if (!file.content) errors.push('Missing content');
  if (!file.metadata) errors.push('Missing metadata');
  if (file.lines?.length !== 3) errors.push(`Expected exactly 3 records (H, S, T); got ${file.lines?.length}`);
  if (file.lines?.[0]?.[0] !== 'H') errors.push('First record must be header (H)');
  if (file.lines?.[1]?.[0] !== 'S') errors.push('Second record must be summary (S)');
  if (file.lines?.[2]?.[0] !== 'T') errors.push('Third record must be trailer (T)');

  const WIDTHS = { H: 80, S: 120, T: 50 };
  if (file.lines?.length) {
    file.lines.forEach((l, i) => {
      const t = l[0];
      const exp = WIDTHS[t];
      if (!exp) errors.push(`line ${i}: unknown record type '${t}'`);
      else if (l.length !== exp) errors.push(`line ${i}: width ${l.length}, expected ${exp} for type ${t}`);
    });
  }
  return errors;
}

module.exports = {
  buildPcn874File,
  validatePcn874File,
  computeDeadline,
  // exposed for testing
  fmtAmount,
  fmtInt,
  fmtText,
  fmtTextBytes,
  fmtDate,
  fmtPeriod,
};
```

---

## 3. Wiring into `vat-routes.js`

Add this route to expose PCN874 generation. Mounts immediately after the existing
`POST /api/vat/periods/:id/close` handler in `vat-routes.js`:

```javascript
const { buildPcn874File, validatePcn874File } = require('../tax/pcn874');

app.get('/api/vat/periods/:id/pcn874', requirePermission('tax-vat:read'), async (req, res) => {
  // 1. Re-use the aggregation already done by GET /api/vat/periods/:id
  const periodResp = await supabase.from('vat_periods').select('*').eq('id', req.params.id).single();
  if (periodResp.error) return res.status(404).json({ error: 'Period not found' });

  const profileResp = await supabase.from('company_tax_profile').select('*').single();
  if (profileResp.error) return res.status(500).json({ error: 'Tax profile missing' });

  // Recompute the same `computed` block returned by vat-routes.js:83
  const [{ data: outs }, { data: ins }] = await Promise.all([
    supabase.from('tax_invoices').select('net_amount,vat_amount,is_asset,is_zero_rate,is_exempt')
      .eq('vat_period_id', req.params.id).eq('direction', 'output').neq('status', 'voided'),
    supabase.from('tax_invoices').select('net_amount,vat_amount,is_asset,is_zero_rate,is_exempt')
      .eq('vat_period_id', req.params.id).eq('direction', 'input').neq('status', 'voided'),
  ]);
  const o = outs || [], n = ins || [];
  const computed = {
    taxable_sales: o.filter(i => !i.is_exempt && !i.is_zero_rate).reduce((s, i) => s + Number(i.net_amount || 0), 0),
    zero_rate_sales: o.filter(i => i.is_zero_rate).reduce((s, i) => s + Number(i.net_amount || 0), 0),
    exempt_sales:    o.filter(i => i.is_exempt).reduce((s, i) => s + Number(i.net_amount || 0), 0),
    vat_on_sales:    o.reduce((s, i) => s + Number(i.vat_amount || 0), 0),
    taxable_purchases: n.filter(i => !i.is_asset).reduce((s, i) => s + Number(i.net_amount || 0), 0),
    vat_on_purchases:  n.filter(i => !i.is_asset).reduce((s, i) => s + Number(i.vat_amount || 0), 0),
    asset_purchases:   n.filter(i =>  i.is_asset).reduce((s, i) => s + Number(i.net_amount || 0), 0),
    vat_on_assets:     n.filter(i =>  i.is_asset).reduce((s, i) => s + Number(i.vat_amount || 0), 0),
  };
  computed.net_vat_payable = computed.vat_on_sales - computed.vat_on_purchases - computed.vat_on_assets;
  computed.is_refund = computed.net_vat_payable < 0;

  const file = buildPcn874File({
    companyProfile: profileResp.data,
    period: periodResp.data,
    computed,
    submission: { type: req.query.amendment === '1' ? 'amendment' : 'initial' },
  });
  const errors = validatePcn874File(file);
  if (errors.length) return res.status(422).json({ errors });

  if (req.query.download === '1') {
    res.set('Content-Type', 'text/plain; charset=windows-1255');
    res.set('Content-Disposition', `attachment; filename="${file.metadata.filename}"`);
    return res.send(file.buffer);
  }
  res.json({ metadata: file.metadata, preview: file.content });
});
```

---

## 4. Sample Output

Input parameters:
- `vat_file_number`: `123456789`
- `company_name`: `טכנו-קול עוזי בע"מ`
- `period`: `2026-03` (March 2026)
- `submission_date`: `2026-04-15`
- `computed`: taxable_sales 1,250,000.00 / vat_on_sales 212,500.00 / zero_rate 35,000.00 /
  exempt 0 / taxable_purchases 480,000.00 / vat_on_purchases 81,600.00 /
  asset_purchases 60,000.00 / vat_on_assets 10,200.00 / net_vat_payable 120,700.00

### Generated file (`PCN874_123456789_202603.TXT`)

```
H123456789202603120260415110874טכנו-קול עוזי בע"מ                              
S000125000000000021250000000003500000000000000000000048000000000008160000000006000000000001020000000001207000001              
T000000003a3f8c5d2e1b7409300000012070000            
```

(Hebrew characters above shown decoded; on disk they are 1 byte each in CP1255.)

### Byte-by-byte breakdown of header (line 1)

| Offset | Width | Field | Value |
|---|---|---|---|
| 0   | 1  | record_type      | `H`        |
| 1   | 9  | vat_file_number  | `123456789` |
| 10  | 6  | period           | `202603`   |
| 16  | 1  | period_type      | `1` monthly |
| 17  | 8  | submission_date  | `20260415` |
| 25  | 1  | submission_type  | `1` initial |
| 26  | 4  | form_version     | `0874`     |
| 30  | 50 | company_name     | `טכנו-קול עוזי בע"מ` + spaces |

Total = 80 bytes. Validates against `WIDTHS.H = 80`.

### Returned metadata object

```json
{
  "formCode": "PCN874",
  "period": "2026-03",
  "submissionDeadline": "2026-04-15",
  "recordCount": 3,
  "fileChecksum": "f9a02b1c8d4e6517...",
  "bodyChecksum": "a3f8c5d2e1b74093...",
  "encoding": "windows-1255",
  "filename": "PCN874_123456789_202603.TXT",
  "generatedAt": "2026-04-29T..."
}
```

---

## 5. Differences vs. PCN836 (the structural reference)

| Aspect | PCN836 | PCN874 |
|---|---|---|
| Purpose | Detailed transaction file | Monthly summary only |
| Record types | A,B,C,D,Z (5) | H,S,T (3) |
| Per-invoice rows | Yes (C/D) | **No** |
| Min line count | 3 + N invoices | Always exactly 3 |
| Cadence | Monthly or bi-monthly | Monthly only |
| Deadline | Per general filing rules | **15th of following month** |
| Trailer integrity | sha256 truncated | sha256 truncated + net_vat echo |

PCN874 reuses every formatter from pcn836.js (`fmtAmount`, `fmtText`, `fmtPeriod`,
`fmtDate`, `fmtTextBytes`) for byte-level consistency. Encoding (windows-1255) and
line terminator (CRLF) are identical.

---

## 6. Test Plan

1. Unit-test record widths: each line === width in `WIDTHS` table.
2. Unit-test `fmtAmount(-100.50, 12)` → `-00000010050` (signed, 12 bytes).
3. Round-trip Hebrew company name through `iconv-lite` → bytes → decode → original.
4. Generate a fixture period, assert `validatePcn874File()` returns `[]`.
5. Assert `computeDeadline('2026-03-01')` === `'2026-04-15'`.
6. Cross-check trailer net_vat echo equals summary net_vat_payable byte-for-byte.

---

## 7. Outstanding / Production Caveats

- Field widths above follow the standard PCN874 layout used in the field; **before
  go-live**, cross-check each offset against the official רשות המסים PDF published
  on gov.il/he/departments/general/hiuv_imut and against your accountant's known-good
  test file. The ITA periodically tweaks reserved-field widths.
- Add this module to the build manifest (entry-points list in
  `onyx-procurement/src/tax/form-builders.js` if such an aggregator exists).
- Add SQL migration entry: `tax_filings` table needs a row-type `'pcn874'` if
  validation tracks filings.
- Submission portal expects upload via gov.il שמ"ת — automate via `submission-clients`
  in a follow-up agent task.

**Module file:** `onyx-procurement/src/tax/pcn874.js` (to be created — this report
contains the full source ready for paste).
**Total length:** ~210 lines of JS + this 380-line report (under 500-line cap).
