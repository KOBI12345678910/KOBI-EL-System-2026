# AGENT-274 — LOGIC #4: Centralized Auto-Numbering

**Agent**: 274 — LOGIC #4
**Date**: 2026-04-29
**Scope**: Per-tenant, per-fiscal-year auto-numbering for invoices, POs, quotes, payslips with gap detection (mandatory for tax authority audit).
**Owner Service**: ONYX_PROCUREMENT (3100) — exposed to all 4 services
**Status**: SPEC + IMPLEMENTATION

---

## 1. Why This Matters (Tax Authority Compliance)

Tax authorities (IL רשות המסים, EU, US IRS) require:
- **Sequential, gap-free** invoice numbering per legal entity per fiscal year
- **Immutable** allocation: once a number is issued, it CANNOT be reassigned
- **Auditable trail**: every allocation logged with timestamp, user, entity_id
- **Gap reporting**: any gap must be explained (voided invoice, system crash) — no silent gaps
- **Per-tenant isolation**: 3,000 businesses on platform = 3,000 independent sequences per doc type

Failure mode = tax fines, criminal exposure, loss of operating license.

---

## 2. Document Types Covered

| Doc Type | Code | Format | Reset | Legal Reference |
|----------|------|--------|-------|-----------------|
| Tax Invoice | INV | `INV-{YYYY}-{000001}` | Fiscal year | IL חוק מע"מ §47 |
| Credit Invoice | CRN | `CRN-{YYYY}-{000001}` | Fiscal year | IL §47 |
| Receipt | RCT | `RCT-{YYYY}-{000001}` | Fiscal year | IL §47a |
| Purchase Order | PO | `PO-{YYYY}-{00001}` | Fiscal year | Internal |
| Quote | QT | `QT-{YYYY}-{00001}` | Fiscal year | Internal |
| RFQ | RFQ | `RFQ-{YYYY}-{00001}` | Fiscal year | Internal |
| Sales Order | SO | `SO-{YYYY}-{00001}` | Fiscal year | Internal |
| Delivery Note | DN | `DN-{YYYY}-{00001}` | Fiscal year | IL §69b |
| Payslip | PSL | `PSL-{YYYYMM}-{0001}` | Monthly | Payroll law |
| Form 106 | F106 | `106-{YYYY}-{00001}` | Annual | Tax annual report |
| Journal Entry | JE | `JE-{YYYY}-{000001}` | Fiscal year | Accounting |

---

## 3. Database Schema

```sql
-- Per-tenant, per-doc-type, per-period sequence counter
CREATE TABLE numbering_sequences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  doc_type        VARCHAR(16) NOT NULL,        -- INV, CRN, PO, etc.
  fiscal_period   VARCHAR(8)  NOT NULL,        -- '2026' or '202604' for monthly
  prefix          VARCHAR(16) NOT NULL,        -- 'INV', 'PO'
  current_value   BIGINT      NOT NULL DEFAULT 0,
  padding         INT         NOT NULL DEFAULT 6,
  format_template VARCHAR(64) NOT NULL,        -- '{prefix}-{period}-{number}'
  last_issued_at  TIMESTAMPTZ,
  last_issued_by  UUID,
  is_locked       BOOLEAN     NOT NULL DEFAULT false,  -- emergency freeze
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, doc_type, fiscal_period)
);

CREATE INDEX idx_numseq_tenant ON numbering_sequences(tenant_id, doc_type);

-- Immutable allocation log — append-only
CREATE TABLE numbering_allocations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  doc_type        VARCHAR(16) NOT NULL,
  fiscal_period   VARCHAR(8)  NOT NULL,
  number_value    BIGINT      NOT NULL,
  formatted_number VARCHAR(64) NOT NULL,
  entity_id       UUID,                        -- linked invoice/PO/etc id (nullable until bound)
  status          VARCHAR(16) NOT NULL DEFAULT 'allocated',
                  -- 'allocated' | 'bound' | 'voided' | 'gap'
  allocated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  allocated_by    UUID NOT NULL,
  bound_at        TIMESTAMPTZ,
  voided_at       TIMESTAMPTZ,
  void_reason     TEXT,
  ip_address      INET,
  request_id      UUID,
  UNIQUE (tenant_id, doc_type, fiscal_period, number_value)
);

CREATE INDEX idx_alloc_lookup ON numbering_allocations(tenant_id, doc_type, fiscal_period, number_value);
CREATE INDEX idx_alloc_entity ON numbering_allocations(entity_id);
CREATE INDEX idx_alloc_status ON numbering_allocations(tenant_id, status);

-- Tenant fiscal year config (some businesses use Apr-Mar etc.)
CREATE TABLE tenant_fiscal_config (
  tenant_id       UUID PRIMARY KEY,
  fiscal_year_start_month  INT NOT NULL DEFAULT 1,  -- 1=Jan, 4=Apr
  timezone        VARCHAR(64) NOT NULL DEFAULT 'Asia/Jerusalem',
  legal_entity_id VARCHAR(32) NOT NULL,             -- Israeli ח.פ. / VAT ID
  country_code    VARCHAR(2)  NOT NULL DEFAULT 'IL'
);
```

---

## 4. Core Service — `numbering-service.js`

```javascript
// onyx-procurement/src/services/numbering-service.js
const { Pool } = require('pg');

class NumberingService {
  constructor(pool) { this.pool = pool; }

  /**
   * Atomically allocate next number. SERIALIZABLE isolation prevents gaps.
   * Returns { number_value, formatted_number, allocation_id }.
   */
  async allocateNumber({ tenantId, docType, userId, ipAddress, requestId }) {
    const period = await this.getCurrentFiscalPeriod(tenantId, docType);
    const prefix = this.getPrefix(docType);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

      // Lock-and-increment via UPSERT with FOR UPDATE
      const seqRes = await client.query(`
        INSERT INTO numbering_sequences
          (tenant_id, doc_type, fiscal_period, prefix, current_value, padding, format_template)
        VALUES ($1, $2, $3, $4, 1, 6, '{prefix}-{period}-{number}')
        ON CONFLICT (tenant_id, doc_type, fiscal_period)
        DO UPDATE SET
          current_value = numbering_sequences.current_value + 1,
          last_issued_at = NOW(),
          last_issued_by = $5,
          updated_at = NOW()
        WHERE numbering_sequences.is_locked = false
        RETURNING current_value, padding, format_template, prefix
      `, [tenantId, docType, period, prefix, userId]);

      if (seqRes.rowCount === 0) throw new Error('SEQUENCE_LOCKED');

      const { current_value, padding, format_template } = seqRes.rows[0];
      const formatted = this.format(format_template, prefix, period, current_value, padding);

      // Log allocation (immutable)
      const allocRes = await client.query(`
        INSERT INTO numbering_allocations
          (tenant_id, doc_type, fiscal_period, number_value, formatted_number,
           status, allocated_by, ip_address, request_id)
        VALUES ($1, $2, $3, $4, $5, 'allocated', $6, $7, $8)
        RETURNING id
      `, [tenantId, docType, period, current_value, formatted, userId, ipAddress, requestId]);

      await client.query('COMMIT');
      return {
        allocation_id: allocRes.rows[0].id,
        number_value: current_value,
        formatted_number: formatted,
        fiscal_period: period
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Bind allocated number to actual entity (invoice/PO id). */
  async bindToEntity(allocationId, entityId) {
    return this.pool.query(`
      UPDATE numbering_allocations
      SET entity_id = $2, status = 'bound', bound_at = NOW()
      WHERE id = $1 AND status = 'allocated'
      RETURNING formatted_number
    `, [allocationId, entityId]);
  }

  /** Void a number (e.g. user cancels invoice). Number is BURNED, never reused. */
  async voidNumber(allocationId, reason, userId) {
    return this.pool.query(`
      UPDATE numbering_allocations
      SET status = 'voided', voided_at = NOW(), void_reason = $2
      WHERE id = $1
    `, [allocationId, reason]);
  }

  /** Detect gaps in sequence — for tax authority reports. */
  async detectGaps({ tenantId, docType, fiscalPeriod }) {
    const res = await this.pool.query(`
      WITH expected AS (
        SELECT generate_series(1, MAX(number_value)) AS n
        FROM numbering_allocations
        WHERE tenant_id=$1 AND doc_type=$2 AND fiscal_period=$3
      ),
      issued AS (
        SELECT number_value, status, voided_at, void_reason
        FROM numbering_allocations
        WHERE tenant_id=$1 AND doc_type=$2 AND fiscal_period=$3
      )
      SELECT e.n AS missing_number
      FROM expected e
      LEFT JOIN issued i ON e.n = i.number_value
      WHERE i.number_value IS NULL
      ORDER BY e.n
    `, [tenantId, docType, fiscalPeriod]);
    return res.rows.map(r => r.missing_number);
  }

  /** Tax authority audit export — every allocation with status. */
  async auditExport({ tenantId, docType, fiscalPeriod }) {
    const res = await this.pool.query(`
      SELECT number_value, formatted_number, status, allocated_at, bound_at,
             voided_at, void_reason, entity_id, allocated_by
      FROM numbering_allocations
      WHERE tenant_id=$1 AND doc_type=$2 AND fiscal_period=$3
      ORDER BY number_value
    `, [tenantId, docType, fiscalPeriod]);
    const gaps = await this.detectGaps({ tenantId, docType, fiscalPeriod });
    return { allocations: res.rows, gaps, gap_count: gaps.length };
  }

  format(template, prefix, period, value, padding) {
    return template
      .replace('{prefix}', prefix)
      .replace('{period}', period)
      .replace('{number}', String(value).padStart(padding, '0'));
  }

  getPrefix(docType) {
    const map = { invoice:'INV', credit:'CRN', receipt:'RCT', po:'PO',
      quote:'QT', rfq:'RFQ', so:'SO', delivery:'DN', payslip:'PSL',
      form106:'106', journal:'JE' };
    return map[docType] || docType.toUpperCase();
  }

  async getCurrentFiscalPeriod(tenantId, docType) {
    const cfg = await this.pool.query(
      'SELECT fiscal_year_start_month FROM tenant_fiscal_config WHERE tenant_id=$1', [tenantId]);
    const startMonth = cfg.rows[0]?.fiscal_year_start_month || 1;
    const now = new Date();
    let fy = now.getFullYear();
    if (now.getMonth() + 1 < startMonth) fy -= 1;
    if (docType === 'payslip') {
      const m = String(now.getMonth() + 1).padStart(2, '0');
      return `${now.getFullYear()}${m}`;
    }
    return String(fy);
  }
}

module.exports = NumberingService;
```

---

## 5. REST API

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/numbering/allocate` | Get next number `{tenantId, docType}` |
| POST | `/api/numbering/bind` | Bind allocation to entity `{allocationId, entityId}` |
| POST | `/api/numbering/void` | Void an allocation `{allocationId, reason}` |
| GET | `/api/numbering/gaps?tenant=&docType=&period=` | Gap report |
| GET | `/api/numbering/audit?tenant=&docType=&period=` | Full audit export (CSV/JSON) |
| GET | `/api/numbering/peek?tenant=&docType=` | Preview next number (no allocation) |
| POST | `/api/numbering/lock` | Emergency freeze sequence |

---

## 6. Concurrency & Gap-Prevention Guarantees

- **SERIALIZABLE isolation** on `BEGIN` — Postgres rejects conflicting concurrent writes; client retries.
- **UPSERT with `current_value + 1`** — atomic increment in single statement.
- **Allocation row inserted in same transaction** — if commit fails, no number consumed.
- **Voided numbers stay in log with `status='voided'`** — gap detector classifies them as "explained gap", not "missing gap".
- **Crash mid-transaction** = WAL rollback, sequence un-incremented. Retry safe.

---

## 7. Integration Hooks (workflow-flows.js)

| Master Flow Stage | Doc Type Allocated | Trigger |
|-------------------|--------------------|---------|
| Lead -> Quote | QT | `quote.created` |
| Quote -> Order | SO | `order.confirmed` |
| Order -> Procurement | PO, RFQ | `po.draft.created`, `rfq.sent` |
| Execution -> Delivery | DN | `delivery_note.printed` |
| Delivery -> Invoice | INV | `invoice.issued` |
| Invoice -> Payment | RCT | `receipt.created` |
| Payroll cycle | PSL | `payslip.generated` |

Wired via `orchestrator.js` action listeners — every action that produces a tax-relevant doc calls `numbering.allocate()` BEFORE writing the entity, then `bindToEntity()` after persistence.

---

## 8. Tax Authority Audit Output

CSV columns:
`number, formatted, status, allocated_at, bound_at, entity_ref, voided_at, void_reason, user`

Plus separate `gaps_report.csv` listing every missing number with status (`unexplained_gap` is a hard fail).

---

## 9. Files to Create

| Path | Purpose |
|------|---------|
| `onyx-procurement/migrations/0274_numbering.sql` | Schema |
| `onyx-procurement/src/services/numbering-service.js` | Core service |
| `onyx-procurement/src/routes/numbering.js` | REST endpoints |
| `onyx-procurement/src/jobs/gap-monitor.js` | Nightly gap scan |
| `onyx-procurement/tests/numbering.test.js` | Concurrency + gap tests |

---

## 10. Acceptance Criteria

- [ ] 1000 concurrent `allocate` calls produce 1000 unique sequential numbers, zero gaps
- [ ] Voiding number 5 leaves gap report empty (status='voided' is explained)
- [ ] Fiscal year rollover (Dec 31 -> Jan 1) starts new sequence at 1
- [ ] Per-tenant isolation: tenant A's INV-2026-000001 and tenant B's INV-2026-000001 coexist
- [ ] Audit export passes IL tax authority format spec
- [ ] Crash during allocation does not consume number (verified via kill -9 test)
- [ ] Gap detector flags any missing number not marked voided as `unexplained_gap`

---

**End AGENT-274 LOGIC #4.**
