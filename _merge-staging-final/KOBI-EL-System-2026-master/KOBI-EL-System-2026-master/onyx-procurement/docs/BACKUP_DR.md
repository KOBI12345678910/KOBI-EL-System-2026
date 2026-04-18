# ONYX Procurement — Backup & Disaster Recovery Policy

**Owner:** Operations / Agent 59 (automation)
**Scope:** `onyx-procurement` subsystem (payroll, procurement, VAT, bank recon)
**Last reviewed:** 2026-04-11

This document defines how the ONYX procurement and payroll system is backed
up, how a disaster is handled, and what the recovery expectations are for
the business. It is intentionally short and unambiguous; it is meant to be
read under stress.

## 1. Guiding principles

1. **We never delete production data.** All backup scripts are read-only
   against production. Restore scripts only upsert — they never truncate
   or drop.
2. **Recovery is rehearsed.** The `drill.js` script runs end-to-end against
   staging tables every month. Mismatches are treated as an incident.
3. **Backups are verifiable.** Every JSONL file has a SHA-256, every run
   produces a manifest with row counts, and `backup-verify.js` exits non-zero
   on any integrity failure.
4. **Everything is logged.** Backup, restore, retention and drill operations
   append JSON lines to append-only audit logs under `logs/`.

## 2. Recovery objectives

| Metric | Target | Rationale |
|--------|--------|-----------|
| **RPO** (Recovery Point Objective) | 24 hours | Daily backup at 02:00 UTC. In the worst case the organisation loses at most one business day of writes. |
| **RTO** (Recovery Time Objective) | 4 hours | Restoring one day's worth of whitelisted tables into a staging schema + smoke test fits comfortably in half a business day. |
| **MTTD** (Mean time to detect) | 15 minutes | Weekly verify job + Supabase alerting on the service role key usage. |
| **Data retention (hot)** | 90 days of JSONL backups | Enforced by `backup-retention.js`. |
| **Data retention (cold)** | 7 years for payroll + tax | Off-site copy policy below. |

## 3. What we back up

### 3.1 Database tables (`backup-db.js`)

All tables in the critical-path whitelist:

- **Payroll:** `employers`, `employees`, `timesheets`, `wage_slips`
- **Procurement:** `suppliers`, `invoices`, `purchase_orders`, `payments`
- **VAT:** `vat_transactions`, `vat_exports`
- **Income tax:** `annual_tax_reports`
- **Bank reconciliation:** `bank_transactions`, `bank_matches`
- **Audit trail:** `audit_log`

Each backup folder is a `backups/YYYY-MM-DD/` directory containing:

- `<table>.jsonl` — one JSON row per line
- `<table>.jsonl.sha256` — checksum sidecar
- `<table>.meta.json` — per-table metadata
- `manifest.json` — whole-run manifest
- `manifest.json.sha256` — checksum of manifest

### 3.2 File artifacts (`backup-files.js`)

Copies (never moves) file outputs that are not stored in Postgres:

- PDF wage slips
- PCN836 Bituach Leumi exports
- Generated reports (PDF, CSV, XLSX)
- VAT exports
- Annual tax report exports

Results land under `backups/YYYY-MM-DD/files/<category>/`. Each category has
a list of candidate source directories that different environments might
use; missing directories are logged but not fatal.

### 3.3 What we do NOT back up

- Application source code (lives in git, a separate durable store).
- Infrastructure config (lives in `ops/` and is version-controlled).
- Dependencies (`node_modules`, rebuildable from lockfile).
- The backup folder itself (obviously).

## 4. Retention

- **Hot:** Kept for 90 days on primary storage.
  Enforced by `backup-retention.js`, run daily after the backup job.
- **Warm (weekly snapshot):** Snapshot every Sunday copied off-host.
- **Cold (legal):** Monthly snapshot retained for 7 years in cold storage,
  required by Israeli tax and labour law for payroll and invoices.

Retention pruning only touches entries whose names match `YYYY-MM-DD` or
`YYYY-MM-DD.tar.gz` inside an allow-listed root basename. It can never wipe
a random directory.

## 5. Schedule

Managed by `scripts/backup/scheduler.js`, which is expected to run under a
process manager (systemd, pm2, Windows Service). Times are in UTC.

| Job     | When              | What runs                                                  |
|---------|-------------------|-------------------------------------------------------------|
| daily   | Every day 02:00  | `backup-db.js`, `backup-files.js`, `backup-retention.js`   |
| weekly  | Sunday 02:30     | `backup-verify.js --deep` on the latest day folder         |
| monthly | 1st of month 03:00 | `drill.js --dry-run` (full backup + deep verify, no DB writes) |

The scheduler records idempotent state in `logs/scheduler-state.json`, so
bouncing the process mid-day will not re-run a job that already completed.

## 6. Operational procedures

### 6.1 Take an ad-hoc backup

```
node scripts/backup/backup-db.js    --i-know-what-im-doing
node scripts/backup/backup-files.js --i-know-what-im-doing
node scripts/backup/backup-verify.js --from=backups/YYYY-MM-DD --deep
```

Expected: all three scripts exit 0. A fresh day folder exists. Audit lines
are appended to `logs/backup-audit.jsonl`.

### 6.2 Restore into staging (no prod touched)

```
node scripts/backup/restore-db.js \
  --from=backups/YYYY-MM-DD \
  --target=staging \
  --confirm \
  --i-know-what-im-doing
```

Result: for each table `<t>` a new table `restore_<t>_YYYYMMDD_HHMMSS` is
created and populated. The DBA compares these with production or the
expected baseline before making any decision.

### 6.3 Restore into production (UPSERT only)

Only used as a last resort with an approved change record:

```
node scripts/backup/restore-db.js \
  --from=backups/YYYY-MM-DD \
  --target=prod \
  --confirm \
  --i-know-what-im-doing
```

- Restore is upsert-by-`id`. Rows that exist in prod are overwritten with
  the backup value. Rows not present in prod are inserted.
- **Nothing is deleted from prod.** If the incident requires a row to be
  removed, operations must create a follow-up patch explicitly, signed off
  separately, and record it in `audit_log`.

### 6.4 Run the DR drill

```
node scripts/backup/drill.js --confirm --i-know-what-im-doing
```

The drill performs:

1. `backup-db.js` — fresh backup
2. `backup-verify.js --deep` — integrity check
3. `restore-db.js --target=staging` — replays into staging
4. Re-reads each staging table and computes a canonical SHA-256, then
   compares it against the source JSONL

A JSON report is written to `logs/drill-reports/drill_<date>_<epoch>.json`
and a summary line to `logs/drill-audit.jsonl`.

### 6.5 Verify a backup

```
node scripts/backup/backup-verify.js --from=backups/YYYY-MM-DD --deep --json
```

Exits 3 on any integrity failure. `--json` emits machine-readable output
for alerting.

## 7. Incident response checklist

When a data-loss incident is declared:

1. **Declare the scope.** Which tables? Which time window? Is production
   still writable?
2. **Freeze production writes** if the incident is still in progress
   (maintenance flag, admin API rate-limit, etc.).
3. **Locate the most recent verified backup**. Run:
   ```
   node scripts/backup/backup-verify.js --from=backups/<day> --deep
   ```
4. **Restore into staging** using the procedure in 6.2.
5. **Diff staging against prod** on the impacted tables. Only rows that are
   missing or incorrect in prod should be patched.
6. **Apply the patch to prod** via `restore-db.js --target=prod` with
   `--only=<table>` scoped as tightly as possible.
7. **Append an `audit_log` entry** with the incident id and scope of the
   restore.
8. **Post-mortem** — file a report referencing the `logs/drill-reports/`
   output if a drill had recently run, and update this document if the
   procedure needs to change.

## 8. Security

- Backups contain PII (employee IDs, salaries, national insurance numbers).
  They must be stored on encrypted volumes and treated with the same access
  controls as production.
- The Supabase service-role key is only available on the backup host. It is
  never committed to git and never exposed to the web process.
- Off-site copies are AES-256 encrypted at rest.
- Access to `scripts/backup/` is gated on production servers by OS-level
  permissions. Local development runs against the staging project.

## 9. Contacts and ownership

| Role | Owner |
|------|-------|
| Backup policy | Operations Lead |
| Restore decisions | CTO + Operations Lead (dual sign-off) |
| Off-site storage | IT |
| Drill cadence | Automation (scheduler.js, monthly) |
| Incident commander | Rotational on-call |

## 10. Change log

- 2026-04-11 — Initial version. Defines daily/weekly/monthly schedule,
  RPO 24h / RTO 4h, staging-first restore policy, DR drill.
