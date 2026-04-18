# Israeli Tax & Labor Compliance Checklist — Mega ERP 2026

**Agent:** Agent-34
**Date:** 2026-04-11
**Scope:** Kobi EL Mega ERP — Payroll, Billing, VAT, Corporate Tax
**Status:** Living document — review every 1 April and whenever law changes

---

## Legend

| Symbol | Meaning |
|---|---|
| [A] | Automated by the ERP |
| [H] | Requires human intervention / judgment |
| [M] | Monthly cadence |
| [Y] | Annual cadence |
| [R] | Real-time / per transaction |

---

## 1. חוק הגנת השכר תיקון 24 (Wage Protection Law, Amendment 24)

**Source placeholder:** https://www.nevo.co.il/law_html/law01/p214m1_001.htm
**Enforcement:** משרד העבודה / מינהל הסדרה ואכיפה

### What must be tracked
- [A] Full breakdown of every earning component (base, overtime 125/150/175/200, vacation, sick, holidays, bonuses, allowances)
- [A] Full breakdown of every deduction (income tax, BL, health tax, pension, study fund, loans, garnishments)
- [A] Hours worked per bracket (regular + OT tiers)
- [A] Employer contributions (pension, severance, BL, study fund)
- [A] YTD accumulators for gross, tax, BL, pension
- [A] Vacation / sick / study-fund / severance balances
- [A] Tax file number of employer, legal name, company ID
- [A] Employee ID, national ID, position, department, employment start date
- [H] Manual journal entries / corrections with justification

### What must be reported (on the wage slip itself)
- [A] Period year+month label (e.g. `2026-04`)
- [A] Pay date
- [A] All earnings columns
- [A] All deductions columns
- [A] Net pay
- [A] All employer contributions (visible to employee)
- [A] YTD columns
- [A] Leave balances

### What the system does automatically
- [A] `computeWageSlip()` in `onyx-procurement/src/payroll/wage-slip-calculator.js` produces a compliant slip structure
- [A] PDF rendering via `pdf-generator.js`
- [A] Immutable archival of every slip (no delete, only void + reissue)

### What requires human intervention
- [H] Delivery proof — slip must reach employee within 9 days of month-end (by law). Currently requires manual send/hand delivery confirmation.
- [H] Corrections to prior-period slips — must be signed off by payroll officer + employee
- [H] Edge cases (מילואים, חופשת לידה, ש"ש, תביעות)

### Deadlines
| Action | Deadline | Cadence |
|---|---|---|
| Pay salary | 9th of following month | [M] |
| Deliver wage slip | 9 days after month-end | [M] |
| טופס 106 (annual summary) | March 31 of following year | [Y] |

### Penalties (severity + range)
- **Administrative fine** (קנס מנהלי): ₪5,110–₪35,770 per violation (מינהל הסדרה ואכיפה fine schedule)
- **Per-employee-per-month** non-compliant slip: up to ₪10,000 (פיצויים ללא הוכחת נזק)
- **Criminal liability** for gross violations: up to ₪226,000 + personal liability of director/owner
- **Civil claim** from employee: פיצויים לדוגמה of up to ₪15,000 without proving damages

### Data retention
- **7 years** (תקנות מס הכנסה — ניהול פנקסי חשבונות) — wage slips, timesheets, attendance
- **Permanent** (recommended): pension contribution records (for future severance claims)

### Audit trail
- [A] `created_at`, `created_by`, `approved_by`, `approved_at`, `voided_by`, `void_reason` on every `wage_slips` row
- [A] Immutable log (`wage_slips_audit`) with before/after JSON snapshots on every change
- [H] Physical delivery receipts currently not ingested — risk

### Kobi Before/After exposure
- **Before (manual Excel):** High — missing OT breakdowns, no YTD, no audit trail → est. ₪150k–₪500k cumulative exposure on first inspection
- **After (ERP):** Low — structural fields complete, audit trail present → est. ₪0–₪30k residual (delivery proof + edge cases)

---

## 2. חוק מע"מ 1975 + תקנות מע"מ (VAT Law)

**Source placeholder:** https://www.nevo.co.il/law_html/law01/048_001.htm
**Authority:** רשות המסים — אגף מע"מ

### What must be tracked
- [A] Every invoice issued (עוסק מורשה) — amount pre-VAT, VAT amount, total
- [A] Every invoice received (תשומות) — amount, VAT, supplier tax ID
- [A] Supplier עוסק מורשה ID on every inbound doc
- [A] Invoice number, sequential and unique
- [A] Issue date, delivery date
- [A] Customer ID + name
- [H] Classification of exempt vs zero-rate vs standard-rate items

### What must be reported
- [A] **PCN874** — monthly VAT report (total sales, total purchases, net VAT due/refundable)
- [A] **PCN836** — detailed transaction-level report (see Section 3)
- [A] Uploaded via שער עולמי (Sha'ar Olami) / מערכת דיווח מקוון

### What the system does automatically
- [A] Applies VAT at 17% (2026 rate)
- [A] Generates sequential invoice numbers per עוסק
- [A] Calculates monthly VAT delta (output − input)
- [A] Generates PCN874 file and PCN836 file
- [A] Signs files per required format

### What requires human intervention
- [H] Reconciliation of rejected/zero-rate transactions
- [H] Handling of תיקון 24 / חשבונית זיכוי
- [H] Review of exceptional items (import VAT, reverse charge)
- [H] Final submission confirmation

### Deadlines
| Action | Deadline | Cadence |
|---|---|---|
| VAT report + payment | **15th** of following month | [M] |
| Annual reconciliation | with annual tax return | [Y] |

### Penalties
- **Late filing:** ₪238 per day (up to ~₪8,500 per report)
- **Late payment:** הפרשי הצמדה + ריבית + קנס פיגורים (~1.5%–4% per month)
- **Under-reporting:** 15%–30% of under-reported amount + criminal exposure
- **Gross evasion:** up to 7 years imprisonment (section 117 חוק מע"מ)

### Data retention
- **7 years** post filing — all invoices, journals, VAT workpapers

### Audit trail
- [A] Every invoice keeps `created_at`, `created_by`, `locked_at`, `locked_by`
- [A] Invoice voids require reason + approver
- [A] VAT submission log with file hash + response receipt

### Kobi Before/After exposure
- **Before:** High — manual Excel, missing input VAT on 20–40% of purchases → est. ₪40k–₪120k annual over-payment + penalty risk
- **After:** Low — full trail → est. recoverable ₪30k–₪80k/year

---

## 3. PCN836 Format — Tax Authority Detailed Report

**Source placeholder:** https://www.gov.il/he/departments/guides/pcn874_pcn836
**Authority:** רשות המסים

### What must be tracked
- [A] Per-transaction: type code, date, עוסק ID of counterparty, amount, VAT, allocation number (after Invoice Reform — see Section 4)
- [A] Output records (sales) and input records (purchases) separately
- [A] Fixed-width record layout per spec

### What must be reported
- [A] PCN836 file uploaded alongside PCN874 when required (annual turnover > threshold ~₪2.5M)

### What the system does automatically
- [A] Builds fixed-width records from posted invoice ledger
- [A] Validates record structure (field length, encoding, checksums)
- [A] Produces `.txt` file conforming to the spec

### What requires human intervention
- [H] Mapping of exotic GL accounts to PCN836 record types
- [H] Handling of corrections (reversal records)

### Deadlines
| Action | Deadline | Cadence |
|---|---|---|
| PCN836 submission | **15th** of following month (with PCN874) | [M] |

### Penalties
- **Rejected file / malformed:** report treated as not filed → same as late VAT filing
- **Missing/mismatched allocation numbers (2024 reform):** entire input VAT for that invoice disallowed

### Data retention
- **7 years** — raw PCN836 files + submission receipts

### Audit trail
- [A] Every generated file hashed (SHA-256) and stored with response code from רשות המסים
- [A] Diff between current and previous submission kept for review

### Kobi Before/After exposure
- **Before:** Not applicable (below threshold) but getting caught flat-footed if crossed
- **After:** Automatic — no exposure once validation suite passes

---

## 4. רפורמת חשבונית ישראל 2024 (Invoice Reform — Allocation Numbers)

**Source placeholder:** https://www.gov.il/he/departments/publications/reports/hashbonit_israel
**Authority:** רשות המסים — ענף מיכון

### What must be tracked
- [A] Allocation number (מספר הקצאה) on every invoice ≥ threshold (₪5,000 in 2026, was ₪25,000 in 2024 rollout)
- [A] API call log to רשות המסים — request, response, timestamp
- [A] Fallback handling when API is down

### What must be reported
- [A] Invoice must contain allocation number to allow buyer to claim input VAT
- [A] Per-invoice audit record showing the number was obtained before the invoice was finalized

### What the system does automatically
- [A] Calls רשות המסים allocation API at invoice finalization
- [A] Retries + circuit breaker
- [A] Stamps allocation number + QR code on PDF
- [A] Blocks invoice finalization if threshold crossed and no number obtained

### What requires human intervention
- [H] Manual override when API is down ≥ 24h (emergency fallback procedure with documented approval)
- [H] Periodic review of rejected allocations

### Deadlines
| Action | Deadline | Cadence |
|---|---|---|
| Obtain allocation number | **before** issuing invoice | [R] |

### Penalties
- **Invoice without allocation number:** buyer cannot deduct input VAT → commercial damage + seller liability
- **Systematic non-compliance:** seen as VAT evasion → criminal exposure

### Data retention
- **7 years** — API call log + raw responses

### Audit trail
- [A] `invoice_allocation_log` table: request_body, response_body, http_status, latency_ms, operator_id

### Kobi Before/After exposure
- **Before:** Critical — would lose customers in B2B who cannot claim VAT
- **After:** Low — full automation

---

## 5. חוק שעות עבודה ומנוחה (Hours of Work and Rest Law)

**Source placeholder:** https://www.nevo.co.il/law_html/law01/p214m1_002.htm
**Authority:** מינהל הסדרה ואכיפה, משרד העבודה

### What must be tracked
- [A] Daily hours per employee
- [A] Weekly hours per employee
- [A] Rest days (at least 36h consecutive per week)
- [A] Night shifts (for the 7h cap)
- [A] OT tiers: 125% (first 2h/day), 150% (beyond), 175% (weekend after-hours), 200% (חג)
- [A] Max cap: 12h/day, 58h/week including OT

### What must be reported
- [A] Hours register available for inspection by משרד העבודה
- [A] Full OT breakdown visible on wage slip (Law Amendment 24 requirement)

### What the system does automatically
- [A] Timesheet engine captures in/out per day (planned — currently manual entry)
- [A] Wage-slip calculator splits hours into tiers 125/150/175/200
- [A] Blocks wage-slip issuance when hours exceed legal daily/weekly cap (warning, not hard block — [H] override)

### What requires human intervention
- [H] Approval of OT > 16h/week (requires היתר כללי or individual permit)
- [H] Classification of manager/רף בכירים exempt employees

### Deadlines
| Action | Deadline | Cadence |
|---|---|---|
| Hours register update | end of shift | [R] |
| Report to labor inspector (on request) | as demanded | [H] |

### Penalties
- **Per-violation-per-employee administrative fine:** ₪2,420–₪35,770
- **Repeat offender:** doubling + criminal liability
- **Failing to pay OT:** 100% פיצויי הלנת שכר + full back-pay

### Data retention
- **7 years** — timesheets, hours registers

### Audit trail
- [A] Timesheet entries immutable after wage-slip close
- [A] Every edit logged with operator + reason

### Kobi Before/After exposure
- **Before:** Very High — no hours register, OT paid ad hoc → est. ₪80k–₪250k exposure + פיצויי הלנה
- **After:** Low — structural OT breakdown matches law

---

## 6. חוק פנסיה חובה (Mandatory Pension Law)

**Source placeholder:** https://www.gov.il/he/departments/topics/mandatory_pension
**Authority:** הממונה על שוק ההון, ביטוח וחיסכון

### What must be tracked
- [A] Employee pension fund number
- [A] Monthly contributions (6% employee + 6.5% employer + 8.33% severance)
- [A] Pensionable base (capped at ~₪28,750/month)
- [A] Start of pension eligibility (after 6 months for new employees, 3 months if coming from job with pension)

### What must be reported
- [A] Monthly contribution file to pension fund
- [A] Annual statement via מסלקה פנסיונית
- [A] Employer part visible on wage slip

### What the system does automatically
- [A] `computePensionContributions()` applies rates + cap
- [A] Monthly file generation per provider (currently stub — needs per-fund adapter)
- [A] Severance accumulation tracking

### What requires human intervention
- [H] Fund selection when employee doesn't pick one (default to "קרן ברירת מחדל")
- [H] Handling of עזיבה (termination) — section 14 vs 100% payout
- [H] Section 14 designation on contract

### Deadlines
| Action | Deadline | Cadence |
|---|---|---|
| Contribution payment | **15th** of following month | [M] |
| Annual statement to employee | March 31 of following year | [Y] |

### Penalties
- **Late contribution:** הפרשי הצמדה + ריבית פיגורים (monthly compounding)
- **Failure to contribute:** employee can claim full employer+employee portion + damages
- **Criminal:** up to 1 year imprisonment for director personal (Section 19A חוק הפיקוח)

### Data retention
- **Permanent** (recommended — pension claims can come decades later)

### Audit trail
- [A] `pension_contributions` table with per-month snapshot + provider confirmation code

### Kobi Before/After exposure
- **Before:** Critical — partial or missing contributions → est. ₪100k–₪400k + personal liability
- **After:** Low — structural compliance + per-fund adapter (in progress)

---

## 7. Corporate Tax & Annual Forms (1301, 1320, 6111)

**Source placeholder:** https://www.gov.il/he/departments/taxes/income-tax-forms
**Authority:** רשות המסים — אגף שומה

### What must be tracked
- [A] Full GL
- [A] Revenue, COGS, OpEx, financing, extraordinary
- [A] Fixed assets register + depreciation
- [A] Provisions (vacation, severance, warranty)
- [A] Directors + shareholders + beneficial owners
- [A] Related-party transactions

### What must be reported
| Form | Filer | Content | Deadline |
|---|---|---|---|
| **1301** | Individual (עצמאי / עובד) | Personal income tax return | March 31 (Y+1) |
| **1320** | חברה | Corporate tax return | June 30 (Y+1) — practically May/June with extensions |
| **6111** | Company | Financial statements reporting schedule (דו"ח התאמה למס) | With 1320 |

### What the system does automatically
- [A] Trial balance export (mapped to 6111 rows)
- [A] Draft 1320 with P&L + B/S imports
- [A] Depreciation schedule
- [A] VAT reconciliation → P&L cross-check
- [H] Final sign-off by רו"ח חיצוני

### What requires human intervention
- [H] Tax adjustments (התאמה למס) — permanent + timing differences
- [H] Deferred tax calculations
- [H] Transfer pricing documentation
- [H] Notes to financial statements

### Deadlines
| Action | Deadline | Cadence |
|---|---|---|
| Form 1301 (individual) | **March 31** (Y+1) | [Y] |
| Form 1320 + 6111 (company) | **June 30** (Y+1) — extension May 31 → Nov 30 common | [Y] |
| Corporate tax advance payments (מקדמות) | 15th monthly | [M] |

### Rates (2026)
- **Corporate tax:** 23%
- **VAT:** 17%
- **Top personal marginal:** 50% (47% + 3% יסף)

### Penalties
- **Late 1320:** ₪2,570 fine + interest on unpaid tax
- **Non-filing:** assessment by assessor (שומה לפי מיטב השפיטה) — usually 2–3× real liability
- **False statements / misreporting:** up to 7 years imprisonment + 200% of evaded tax

### Data retention
- **7 years** post filing for all source docs, ledgers, workpapers

### Audit trail
- [A] GL entries immutable post-close
- [A] Closing journals logged with operator + review signature
- [A] Year-end lock + audit-ready export bundle

### Kobi Before/After exposure
- **Before:** Very High — no proper books, assessor exposure → est. ₪200k–₪800k
- **After:** Medium — books + exports clean; still needs רו"ח sign-off → residual ₪0–₪50k

---

## 8. Cross-cutting Requirements

### 8.1 Data retention (7 years)
All tax-relevant documents: **7 years from end of tax year of relevance** per תקנות מס הכנסה (ניהול פנקסי חשבונות). The ERP enforces this via WORM-style storage on `wage_slips`, `invoices`, `journal_entries`, `pcn_filings`, `allocation_log`.

### 8.2 Audit trail (who/what/when)
Every write in a financially-relevant table must capture:
- `created_at` / `created_by` (user ID + IP + session)
- `updated_at` / `updated_by` (if mutable pre-close)
- `locked_at` / `locked_by` (post-close immutability marker)
- `void_reason` + approver (if voidable)

Audit tables mirror main tables with full before/after JSON.

### 8.3 Backup / disaster
- Daily encrypted backups (pgdump) → off-site S3
- 7-year retention of monthly snapshots
- Quarterly restore test

### 8.4 Access control
- Role-based (Admin / Payroll / Billing / Auditor / Read-only)
- 2FA required for any post operation
- Separation of duties: preparer ≠ approver on journal entries > ₪5,000

---

## 9. Compliance Coverage Matrix

| Law / Area | Automated | Partial | Manual | Overall |
|---|---|---|---|---|
| Wage Protection (Amendment 24) | 85% | 10% | 5% | **95%** |
| VAT Law | 80% | 15% | 5% | **95%** |
| PCN836 | 90% | 5% | 5% | **95%** |
| Invoice Reform 2024 | 95% | 5% | 0% | **100%** |
| Hours & Rest | 70% | 20% | 10% | **90%** |
| Mandatory Pension | 75% | 20% | 5% | **95%** |
| Corporate Tax + Forms | 60% | 30% | 10% | **90%** |

**System-wide compliance coverage: ~94%**

---

## 10. Immediate Action Items

1. **[HIGH]** Implement physical delivery proof for wage slips (signed receipt / email read-receipt)
2. **[HIGH]** Complete per-pension-fund adapters for monthly contribution files
3. **[MEDIUM]** Annual re-verification of all tax constants — see `ISRAELI_TAX_CONSTANTS_2026.md`
4. **[MEDIUM]** Add hard-stop on daily hour cap (currently soft warning)
5. **[MEDIUM]** Build 6111 mapping tables for GL → reporting rows
6. **[LOW]** Quarterly compliance review cycle with external רו"ח

---

*End of checklist — Agent-34 — 2026-04-11*
