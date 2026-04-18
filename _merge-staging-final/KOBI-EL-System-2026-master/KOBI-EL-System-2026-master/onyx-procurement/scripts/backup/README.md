# ONYX Procurement — Backup & Restore Drill

Agent 59 / scripts/backup/

This directory is the operational toolbox for disaster recovery on the ONYX
procurement + payroll stack. Every script here is **read-only against
production by default** and every write action requires an explicit
`--i-know-what-im-doing` flag (plus `--confirm` for restores).

The rule is simple: **we never delete production data. Ever.**

## Scripts

| Script                 | Purpose                                                           | Writes to DB? |
|------------------------|-------------------------------------------------------------------|---------------|
| `backup-db.js`         | Export whitelisted tables to JSONL + checksums + manifest         | No            |
| `backup-files.js`      | Copy wage-slip PDFs, PCN836 exports, generated reports            | No            |
| `backup-retention.js`  | Prune backup folders older than retention window (default 90d)   | No            |
| `restore-db.js`        | Restore JSONL back into **staging** tables (default) or prod UPSERT | Yes (opt-in) |
| `backup-verify.js`     | SHA-256 + row-count integrity check on a backup day folder        | No            |
| `drill.js`             | End-to-end DR drill: backup -> verify -> staged restore -> compare | Staging only |
| `scheduler.js`         | Tiny internal scheduler (daily, weekly, monthly)                  | No            |

All scripts live under `scripts/backup/` so the entire DR toolkit ships as
one folder and can be cron'd, containerised or zipped together.

## Whitelisted tables

All scripts share the same critical-path list. Extending it is a deliberate
code change:

```
employers, employees, timesheets, wage_slips,
suppliers, invoices, purchase_orders, payments,
vat_transactions, vat_exports,
annual_tax_reports,
bank_transactions, bank_matches,
audit_log
```

Anything outside this list is ignored by `backup-db.js` and rejected by
`restore-db.js`.

## Safety flags

Every script that can write accepts these guards:

- `--i-know-what-im-doing` — must be passed explicitly on every run
- `--confirm` — restore/drill require this in addition to the guard
- `--dry-run` — safe default for planning a run

`restore-db.js` will only write to production when all of
`--confirm`, `--i-know-what-im-doing` **and** `--target=prod` are passed,
and even then it only does `UPSERT` by primary key. It never runs
`TRUNCATE`, `DROP TABLE`, or `DELETE`.

`backup-retention.js` is additionally guarded so it can only remove files
inside a root directory whose basename is in an allow-list (`backups`,
`backup`, `onyx-backups`, `onyx-backup`, `dr-backups`).

## Environment

Both backup and restore need Supabase credentials:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The service-role key is required because the `audit_log` table is read-only
for normal roles.

## Daily use

Take a backup:

```
node scripts/backup/backup-db.js    --i-know-what-im-doing
node scripts/backup/backup-files.js --i-know-what-im-doing
```

Verify it:

```
node scripts/backup/backup-verify.js --from=backups/2026-04-11 --deep
```

Prune old backups (90 day retention by default):

```
node scripts/backup/backup-retention.js --i-know-what-im-doing
```

Schedule everything:

```
node scripts/backup/scheduler.js
```

## DR drill

Full rehearsal — backs up, verifies, re-restores into timestamped staging
tables and SHA-compares them against the JSONL backup:

```
node scripts/backup/drill.js --confirm --i-know-what-im-doing
```

Dry-run variant (runs only the backup + verify steps, no DB writes):

```
node scripts/backup/drill.js --dry-run
```

Reports are written to `logs/drill-reports/drill_<date>_<epoch>.json`.

## Audit trail

Every backup, restore, retention run and drill appends a JSON line to:

- `logs/backup-audit.jsonl`
- `logs/restore-audit.jsonl`
- `logs/drill-audit.jsonl`
- `logs/scheduler.jsonl`

Each line records host name, timestamp, action, mode, table list and any
error message. These files are themselves backed up by `backup-files.js`
when the `logs/` directory is in one of the candidate source paths — which,
by default, it is not (audit trail is kept immutable on the primary host).

## What is NOT here (on purpose)

- **No SQL `TRUNCATE` or `DROP` is generated anywhere in this directory.**
- **No destructive cascade operations.**
- **No silent overrides of the whitelist.**

If you need to extend the whitelist or the list of artifact categories,
edit the source of the relevant script — it is intentionally a code change,
not a config flag.

## Related documents

- `docs/BACKUP_DR.md` — policy, RTO/RPO, procedures, contacts
- `DR_RUNBOOK.md` (project root, if present) — operational runbook
