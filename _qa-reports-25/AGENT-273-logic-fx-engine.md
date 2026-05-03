# AGENT-273 — LOGIC #3: FX Rate Engine + BoI Daily Sync

**Agent**: 273 — LOGIC #3
**Date**: 2026-04-29
**Scope**: Persistent multi-currency FX engine wired to Bank of Israel (BoI) daily rate publication, with `gl_exchange_rates` storage, scheduled cron sync, conversion API, IAS 21 revaluation hook.
**Owner Service**: ONYX_PROCUREMENT (3100) — exposed to TECHNO_KOL_OPS, PAYROLL_AUTONOMOUS, ONYX_AI
**Status**: SPEC + IMPLEMENTATION (extends in-memory `onyx-procurement/src/fx/fx-engine.js` — 811 LOC, X-36)

---

## 1. Why This Matters (IL Tax + IFRS Compliance)

| Driver | Requirement | Failure Mode |
|--------|-------------|--------------|
| IL רשות המסים | All foreign-currency transactions converted at official BoI rate of transaction date | Rejected tax return |
| IAS 21 | Monetary items revalued at closing rate; differences to P&L | Audit qualification |
| §170 פקודה | Foreign salaries/dividends withhold at BoI publish-date rate | Withholding fine |
| Form 856 / PCN874 | Multi-currency invoices report ILS amount + rate + date | E-filing reject |
| Year-end consolidation | CTA reserve calculation needs end-of-period BoI rate | Restated FS |

The existing `fx-engine.js` (X-36) is **in-memory only** — every restart loses cache. AGENT-273 persists rates to `gl_exchange_rates`, adds the cron sync, and exposes the conversion API across all 4 services.

---

## 2. Existing Surface (X-36 baseline)

`onyx-procurement/src/fx/fx-engine.js` already implements:
- 12-currency basket (ILS base, USD, EUR, GBP, JPY, CHF, CAD, AUD, HKD, CNY, JOD, EGP)
- BoI XML parser (`<CURRENCY>` blocks, normalizes to "ILS per 1 foreign")
- Jerusalem 10:00 rollover (before 10:00 → yesterday's rate)
- Last-trading-day fallback (skips Fri/Sat — BoI publishes Sun–Thu)
- Triangulation via USD when direct pair missing
- Banker's rounding per currency `decimals` (JPY=0, JOD=3, others=2)
- LRU cache + override store + `revalue(positions, asOf)` for IAS 21
- `FxError` with bilingual codes: `UNKNOWN_CCY`, `BAD_DATE`, `BAD_XML`, `NO_FETCH`, `BOI_HTTP`, `STALE_RATE`, `IC_NO_FX`

**Gap** (closed by AGENT-273):
1. No persistent `gl_exchange_rates` table — restart wipes cache
2. No scheduled BoI fetch — manual `loadRates()` only
3. No HTTP conversion endpoint exposed cross-service
4. No staleness alarm wired to Onyx-AI anomaly detector

---

## 3. Database Schema — `gl_exchange_rates`

```sql
-- onyx-procurement/migrations/0273_fx_engine.sql

CREATE TABLE gl_exchange_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date       DATE         NOT NULL,
  base_ccy        CHAR(3)      NOT NULL DEFAULT 'ILS',
  quote_ccy       CHAR(3)      NOT NULL,
  rate            NUMERIC(18,8) NOT NULL CHECK (rate > 0),
  unit            INT          NOT NULL DEFAULT 1,
  change_pct      NUMERIC(10,4),
  source          VARCHAR(16)  NOT NULL DEFAULT 'BOI',
                  -- 'BOI' | 'OVERRIDE' | 'MANUAL' | 'TRIANGULATED'
  source_url      TEXT,
  fetched_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  fetched_by      UUID,
  is_official     BOOLEAN      NOT NULL DEFAULT true,
  is_stale        BOOLEAN      NOT NULL DEFAULT false,
  raw_payload     JSONB,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (rate_date, base_ccy, quote_ccy, source)
);

CREATE INDEX idx_fx_lookup     ON gl_exchange_rates(rate_date DESC, quote_ccy);
CREATE INDEX idx_fx_pair_date  ON gl_exchange_rates(base_ccy, quote_ccy, rate_date DESC);
CREATE INDEX idx_fx_source     ON gl_exchange_rates(source, is_stale);

-- Daily fetch log — one row per BoI poll
CREATE TABLE gl_exchange_fetch_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempted_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  source          VARCHAR(16)  NOT NULL DEFAULT 'BOI',
  http_status     INT,
  rates_count     INT,
  rate_date       DATE,
  duration_ms     INT,
  status          VARCHAR(16)  NOT NULL,
                  -- 'success' | 'http_error' | 'parse_error' | 'no_change' | 'weekend_skip'
  error_message   TEXT,
  raw_response    TEXT
);

CREATE INDEX idx_fx_fetch_recent ON gl_exchange_fetch_log(attempted_at DESC);

-- Manual override audit (FX desk, treasurer)
CREATE TABLE gl_exchange_overrides (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID,                 -- null = global
  rate_date       DATE         NOT NULL,
  base_ccy        CHAR(3)      NOT NULL,
  quote_ccy       CHAR(3)      NOT NULL,
  rate            NUMERIC(18,8) NOT NULL,
  reason          TEXT         NOT NULL,
  approved_by     UUID         NOT NULL,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

---

## 4. Cron Job — `boi-sync.js`

Schedule: **Sun–Thu, 10:15 Asia/Jerusalem** (BoI publishes ~10:00; 15-min buffer).

```javascript
// onyx-procurement/src/jobs/boi-sync.js
const cron = require('node-cron');
const { createFxEngine } = require('../fx/fx-engine');
const { Pool } = require('pg');

class BoiSyncJob {
  constructor(pool, opts = {}) {
    this.pool = pool;
    this.engine = createFxEngine({
      boiUrl: opts.boiUrl || 'https://www.boi.org.il/currency.xml',
      logger: opts.logger
    });
    this.timezone = 'Asia/Jerusalem';
  }

  start() {
    // 15 10 * * 0-4  → Sun..Thu at 10:15 Jerusalem
    this.task = cron.schedule('15 10 * * 0-4', () => this.run(), {
      timezone: this.timezone
    });
  }

  async run({ force = false } = {}) {
    const start = Date.now();
    const log = { attempted_at: new Date(), source: 'BOI', status: 'pending' };
    try {
      const xml = await this.engine.fetchBoi();        // built-in
      const parsed = this.engine.parseBoi(xml);        // { asOf, rates }
      log.http_status = 200;
      log.rate_date   = parsed.asOf;
      log.rates_count = Object.keys(parsed.rates).length;

      // Idempotent UPSERT — re-running same day is a no-op
      const inserted = await this.persist(parsed);
      log.status      = inserted > 0 ? 'success' : 'no_change';
      log.duration_ms = Date.now() - start;
    } catch (err) {
      log.status        = err.code === 'BOI_HTTP' ? 'http_error' : 'parse_error';
      log.error_message = err.message;
      log.duration_ms   = Date.now() - start;
      // Soft-fail: yesterday's rate is still cached & marked stale after 24h
    }
    await this.writeLog(log);
    if (log.status !== 'success') await this.markStale(log.rate_date);
    return log;
  }

  async persist({ asOf, rates }) {
    const client = await this.pool.connect();
    let n = 0;
    try {
      await client.query('BEGIN');
      for (const [ccy, info] of Object.entries(rates)) {
        const r = await client.query(`
          INSERT INTO gl_exchange_rates
            (rate_date, base_ccy, quote_ccy, rate, unit, change_pct, source, source_url, raw_payload)
          VALUES ($1, 'ILS', $2, $3, $4, $5, 'BOI',
                  'https://www.boi.org.il/currency.xml', $6)
          ON CONFLICT (rate_date, base_ccy, quote_ccy, source)
          DO UPDATE SET rate = EXCLUDED.rate, fetched_at = NOW()
          WHERE gl_exchange_rates.rate <> EXCLUDED.rate
        `, [asOf, ccy, info.rate, info.unit, info.change, JSON.stringify(info)]);
        n += r.rowCount;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return n;
  }

  async markStale(rateDate) {
    await this.pool.query(`
      UPDATE gl_exchange_rates SET is_stale = true
      WHERE rate_date = $1 AND fetched_at < NOW() - INTERVAL '24 hours'
    `, [rateDate]);
  }
}

module.exports = { BoiSyncJob };
```

---

## 5. Conversion API — REST Endpoints

```
GET  /api/fx/rate?from=USD&to=ILS&date=2026-04-29
GET  /api/fx/convert?amount=1000&from=USD&to=ILS&date=2026-04-29
GET  /api/fx/rates/latest                              # all pairs vs ILS
GET  /api/fx/rates/range?from=2026-04-01&to=2026-04-29 # historical band
POST /api/fx/override        { from, to, rate, date, reason }     [role: treasurer]
POST /api/fx/sync            { force: true }                       [role: admin]
GET  /api/fx/health                                                 # last fetch status
GET  /api/fx/revalue         { positions: [...], asOf }             # IAS 21
```

Response shape (`/rate`):
```json
{
  "from": "USD", "to": "ILS",
  "rate": 3.7245, "unit": 1,
  "asOf": "2026-04-29",
  "source": "BOI",
  "stale": false,
  "fetchedAt": "2026-04-29T10:15:33+03:00"
}
```

`stale: true` is returned when `fetched_at < NOW() - 24h` AND today is a trading day. UI badge turns yellow; downstream systems fall back to last-known but flag the document.

---

## 6. DB-backed Engine — Hydration on Boot

Existing `fx-engine.js` keeps its in-memory store but gains a `hydrate(pool)` method:

```javascript
// extension to fx-engine.js
engine.hydrate = async function (pool, { lookbackDays = 90 } = {}) {
  const r = await pool.query(`
    SELECT rate_date, quote_ccy, rate, unit, source, is_stale
    FROM gl_exchange_rates
    WHERE base_ccy = 'ILS'
      AND rate_date >= CURRENT_DATE - $1::int
    ORDER BY rate_date ASC
  `, [lookbackDays]);
  for (const row of r.rows) {
    engine.loadRates({
      asOf: row.rate_date.toISOString().slice(0, 10),
      rates: { [row.quote_ccy]: { rate: Number(row.rate), unit: row.unit } }
    });
  }
  return r.rowCount;
};
```

Boot sequence: `pool ready → engine.hydrate(pool) → BoiSyncJob.start()` (api-server `index.ts` startup hook).

---

## 7. Wiring to Master Flow

| Touch Point | Action | API Call |
|-------------|--------|----------|
| Quote in foreign currency | Show ILS-equivalent line | `GET /api/fx/convert?amount=...&from=USD&to=ILS` |
| Sales Order confirmed | Lock rate to order date | `POST /api/orders/:id/lock-fx` (writes `fx_rate_locked`) |
| AP Invoice (foreign) | Compute ILS at invoice date | `GET /api/fx/rate?date=invoice_date` |
| Payment in foreign ccy | Realize FX gain/loss vs invoice rate | orchestrator `payment.recorded` listener |
| Year-end | Revalue all open AR/AP | `GET /api/fx/revalue` (IAS 21 closing rate) |
| Form 856 export | Each line carries rate + date | join `gl_exchange_rates` on transaction date |
| Payroll foreign salary | Convert at payslip period rate | PAYROLL_AUTONOMOUS calls `/api/fx/rate` |

Cross-service contract published in `wiring-spec.js → crossServiceContracts.fxEngine`.

---

## 8. Onyx-AI Hooks

- **Anomaly:** rate change > 2% day-over-day → `fx.anomaly` event → procurement category re-cost trigger
- **Forecast:** 30-day rolling rate forecast feeds budget module (USD/ILS, EUR/ILS only)
- **Alert:** `boi-sync` failure 2 days running → notify treasurer (existing notifications service)

---

## 9. Files to Create / Modify

| Path | Action | Purpose |
|------|--------|---------|
| `onyx-procurement/migrations/0273_fx_engine.sql` | NEW | `gl_exchange_rates`, `gl_exchange_fetch_log`, `gl_exchange_overrides` |
| `onyx-procurement/src/jobs/boi-sync.js` | NEW | Cron job + persist + log |
| `onyx-procurement/src/fx/fx-engine.js` | MODIFY | Add `hydrate(pool)`, `fetchBoi()`, `parseBoi()` exports |
| `onyx-procurement/src/routes/fx.js` | NEW | 8 REST endpoints |
| `api-server/src/routes/fx.ts` | NEW | TS proxy + auth + role guard |
| `api-server/src/index.ts` | MODIFY | Mount `/api/fx`, start `BoiSyncJob` on boot |
| `onyx-procurement/tests/fx-engine.test.js` | EXTEND | Add hydrate + cron + DB tests |
| `onyx-procurement/tests/boi-sync.test.js` | NEW | Mock BoI, simulate weekend/holiday/HTTP-500 |
| `erp-app/src/pages/finance/fx-rates.tsx` | NEW | Rate matrix + history chart + override UI |
| `pipeline/wiring-spec.js` | MODIFY | Register `fxEngine` cross-service contract |

---

## 10. Acceptance Criteria

- [ ] BoI XML fetch on Sun 10:15 inserts ~12 rows into `gl_exchange_rates`
- [ ] Re-running same day produces 0 new rows (idempotent UPSERT)
- [ ] Weekend (Fri/Sat) cron skips with `status='weekend_skip'` in log
- [ ] HTTP 500 from BoI: row in `gl_exchange_fetch_log`, prior rate marked `is_stale=true` after 24h, no crash
- [ ] `GET /api/fx/rate?from=USD&to=ILS&date=2026-04-29` returns BoI rate, `source='BOI'`
- [ ] Missing pair (e.g. EUR→GBP): triangulation via ILS, `source='TRIANGULATED'`
- [ ] Override insert via `POST /api/fx/override` returns `source='OVERRIDE'`, audit row in `gl_exchange_overrides`
- [ ] `engine.hydrate()` after restart restores 90 days of rates without BoI hit
- [ ] Year-end revaluation: `revalue(positions, '2026-12-31')` returns IAS 21 closing-rate ILS deltas
- [ ] Form 856 export joins `gl_exchange_rates` on `tx_date` — every foreign line has rate + source
- [ ] Stale-rate badge appears in UI when `is_stale=true` and rate_date is a trading day
- [ ] Concurrent reads at 100 RPS hit cache, sub-millisecond P99
- [ ] Anomaly hook: artificial 5% USD swing fires `fx.anomaly` event, picked up by procurement re-cost listener

---

## 11. Risk & Compliance Notes

- **BoI URL stability:** `https://www.boi.org.il/currency.xml` is the public legacy endpoint. Treat as best-effort; secondary source (ECB) configurable via `opts.fallbackUrl` for non-ILS-pair sanity checks.
- **Holiday calendar:** Israeli holidays (Yom Kippur, Independence Day) — no BoI publish. Cron runs, `status='no_change'`, last trading day rate persists. Holiday list pulled from `AGENT-136-hebrew-calendar.md` registry.
- **Tenant isolation:** rates are global (BoI is the single source of truth). Overrides ARE per-tenant (treasurer scope). RLS policy: `gl_exchange_rates` is read-all, write-admin; `gl_exchange_overrides` is RLS by `tenant_id`.
- **Tax-relevance:** any rate used on a tax-filed document is **immutable** — once a transaction references `(rate_date, source='BOI')`, that row cannot be deleted. Enforced via FK from `gl_journal_lines.fx_rate_id`.
- **Audit export:** Form 856 / PCN874 / 856-לקוחות include the FX rate and BoI publish date per line. Tax authority re-verifies by reading the same XML on their side.

---

## 12. Test Plan Summary

| Suite | Cases | Target |
|-------|-------|--------|
| `fx-engine.test.js` (extend) | hydrate, override, triangulate, IAS 21 revalue | 100% on new branches |
| `boi-sync.test.js` (new) | success / weekend / HTTP-500 / parse-fail / no-change / staleness | 100% paths |
| `fx-routes.test.js` (new) | 8 endpoints + auth + role + invalid date | 100% endpoints |
| Concurrency | 1000 parallel `/api/fx/rate` cache hits | P99 < 5ms |
| Crash recovery | Kill mid-fetch → log row marked, no half-written rates | 0 partial rows |

---

**End AGENT-273 LOGIC #3.**
