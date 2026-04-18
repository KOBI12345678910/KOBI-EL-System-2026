# ONYX Procurement — Disaster Recovery Runbook

Owner: Platform / SRE
Author: Agent-02 (backup swarm)
Last reviewed: 2026-04-11
Applies to: Supabase-hosted PostgreSQL backing `onyx-procurement`

---

## 1. Objectives

| Target | Value | Notes |
|--------|-------|-------|
| RPO (Recovery Point Objective) | **24 hours** | Daily logical backup via `scripts/backup.js`. Any data written between the last successful backup and an incident is considered at risk. |
| RTO (Recovery Time Objective) | **2 hours** | From "incident declared" to "application accepting writes against restored data" for the core `public` schema. |
| Scope | All tables in the `public` schema of the live Supabase project | Auth schema, storage buckets, and edge functions are handled separately by Supabase's own PITR and are out of scope for this runbook. |
| Retention | 30 day-folders and 30 archives on the backup host; long-term copies offsite | Tunable via `--keep-days`. |

---

## 2. What the backup captures

`scripts/backup.js` uses the Supabase service-role key to:

1. Enumerate every table in `public` (via the `list_public_tables()` RPC, falling back to `information_schema.tables` or an env-driven allowlist).
2. Stream every row of each table, page by page, into a `.jsonl` file under `backups/YYYY-MM-DD/<tablename>.jsonl`.
3. Compute a SHA-256 checksum and row/byte totals per table.
4. Write `backups/YYYY-MM-DD/manifest.json` containing the project URL, start/end timestamps, table counts, row counts, byte sizes, and per-file checksums.
5. Gzip the entire day's folder into `backups/YYYY-MM-DD.tar.gz` (pure Node — no native `tar` binary required, works on Windows and Linux).
6. Prune day-folders and archives older than `--keep-days` (default 30).

What it does NOT capture:

- `auth.*`, `storage.*`, `realtime.*` schemas (use Supabase's built-in PITR).
- Uploaded files in Supabase Storage buckets (must be backed up separately via `supabase storage` or rclone against the public URL).
- Roles, policies, extensions, and DDL. Recreate these with `scripts/migrate.js` from `supabase/migrations/*.sql`.

---

## 3. Running the backup manually

```bash
# full backup (all tables)
node scripts/backup.js

# subset
node scripts/backup.js --tables=purchase_orders,suppliers,line_items

# override output root (e.g. an external drive)
node scripts/backup.js --output=/mnt/backup-onyx

# faster: skip tables over 100k rows
node scripts/backup.js --fast

# tighten retention to 14 days
node scripts/backup.js --keep-days=14
```

Required environment:

```
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

The script exits non-zero on any failure and prints a one-line `SUMMARY {...}` JSON blob on success that can be piped into a monitoring pipeline.

---

## 4. Scheduling — production cron

### 4.1 Linux / macOS (crontab)

Add to the backup host's user crontab (`crontab -e`):

```cron
# ONYX Supabase backup — every day at 02:15 UTC
15 2 * * * cd /opt/onyx-procurement && \
  /usr/bin/node scripts/backup.js --keep-days=30 \
  >> /var/log/onyx/backup.log 2>&1

# Weekly integrity check — dry-run restore of Monday's archive into staging
30 3 * * 1 cd /opt/onyx-procurement && \
  /usr/bin/node scripts/backup-restore.js \
  --from=backups/$(date -u -d 'yesterday' +\%Y-\%m-\%d).tar.gz \
  >> /var/log/onyx/backup-verify.log 2>&1
```

Make sure the cron environment loads the Supabase keys — either via an `EnvironmentFile` on a systemd timer or by sourcing `/etc/onyx/backup.env` before running `node`.

### 4.2 Linux — systemd timer (preferred over cron)

`/etc/systemd/system/onyx-backup.service`:

```ini
[Unit]
Description=ONYX Supabase logical backup
After=network-online.target

[Service]
Type=oneshot
User=onyx
WorkingDirectory=/opt/onyx-procurement
EnvironmentFile=/etc/onyx/backup.env
ExecStart=/usr/bin/node scripts/backup.js --keep-days=30
StandardOutput=append:/var/log/onyx/backup.log
StandardError=append:/var/log/onyx/backup.log
```

`/etc/systemd/system/onyx-backup.timer`:

```ini
[Unit]
Description=Daily ONYX Supabase backup

[Timer]
OnCalendar=*-*-* 02:15:00 UTC
Persistent=true

[Install]
WantedBy=timers.target
```

Enable with `systemctl enable --now onyx-backup.timer`.

### 4.3 Windows — Task Scheduler (XML)

Save as `onyx-backup.xml` and import with `schtasks /Create /TN "ONYX Backup" /XML onyx-backup.xml`:

```xml
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Daily ONYX Supabase backup</Description>
    <Author>Platform</Author>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2026-01-01T02:15:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>S-1-5-18</UserId>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>true</RunOnlyIfNetworkAvailable>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT2H</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>C:\Program Files\nodejs\node.exe</Command>
      <Arguments>scripts\backup.js --keep-days=30</Arguments>
      <WorkingDirectory>C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\onyx-procurement</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
```

For Windows, make sure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set as machine-level environment variables (System Properties -> Environment Variables) or written into a `.env` file next to `server.js` that the script will auto-load via `dotenv`.

---

## 5. Restoring from a backup

### 5.1 Dry run (ALWAYS do this first)

```bash
# against a day folder
node scripts/backup-restore.js --from=backups/2026-04-10

# against an archive
node scripts/backup-restore.js --from=backups/2026-04-10.tar.gz

# limit to a few tables
node scripts/backup-restore.js --from=backups/2026-04-10 --tables=purchase_orders,line_items
```

The dry run verifies every JSONL file's checksum against the manifest, prints a plan, and exits without touching Supabase.

### 5.2 Actually apply

```bash
# upsert all rows, prompt for YES confirmation
node scripts/backup-restore.js --from=backups/2026-04-10 --apply

# no prompts (use in runbook automation only)
node scripts/backup-restore.js --from=backups/2026-04-10 --apply --yes

# delete existing rows first then insert — DANGEROUS
node scripts/backup-restore.js --from=backups/2026-04-10 --apply --yes --truncate

# targeting a URL that contains "prod"
node scripts/backup-restore.js --from=backups/2026-04-10 --apply --yes --i-know-its-prod
```

Guardrails baked into the script:

- DRY RUN IS THE DEFAULT. `--apply` is required for any network write.
- Interactive `YES` prompt unless `--yes` is also passed.
- Refuses to write to a URL matching `/prod/i` without `--i-know-its-prod`.
- Upserts by primary key `id` (override with `--pk=column`).
- Warns if the manifest's `project_url` does not match the current `SUPABASE_URL`.
- Verifies SHA-256 of every JSONL file before touching the network.

### 5.3 Post-restore verification

1. Compare row counts: `SELECT count(*) FROM <table>` versus the manifest's `rows` field.
2. Spot-check recent rows the application created just before the incident.
3. Run the smoke-test suite: `npm run test` (or the app-level health endpoint).
4. Check audit-trail continuity — the restore will create gaps in `audit_log`, document them in the incident ticket.

---

## 6. If Supabase is entirely unavailable

Scenario: Supabase as a platform is down (not just our project) or our project is unreachable for an extended outage.

### 6.1 Confirm scope

1. Check https://status.supabase.com/ for platform-level incidents.
2. `curl -I $SUPABASE_URL/rest/v1/` — 5xx or timeout confirms unavailability.
3. Post in the team incident channel, tag on-call, start a war room.

### 6.2 Stand up an emergency Postgres

You have the full data set as JSONL in `backups/YYYY-MM-DD/`. You can bring up a replacement Postgres anywhere (local Docker, AWS RDS, Hetzner, DigitalOcean, bare-metal) and get the app back online against it:

1. Provision a Postgres 15+ instance. For same-day recovery, `docker run --name onyx-emergency -e POSTGRES_PASSWORD=... -p 5432:5432 -d postgres:15` is sufficient.
2. `createdb onyx` and apply DDL: `node scripts/migrate.js` (point `SUPABASE_URL`/service key at the new instance, or adapt the script to use a raw `postgres://` URL if the migration runner supports it).
3. Restore data: copy `scripts/backup-restore.js` and your latest `backups/YYYY-MM-DD.tar.gz` to the emergency host, then run
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
   node scripts/backup-restore.js --from=2026-04-10.tar.gz --apply --yes --i-know-its-prod
   ```
4. Repoint the `onyx-procurement` API (`server.js`) to the new database URL via environment variables, deploy, and smoke-test.
5. When Supabase recovers, compare row-by-row diffs between the emergency DB and the restored Supabase project, replay any delta, and cut traffic back.

### 6.3 Partial outages

- Read-only outage: put the app into read-only mode (serve from cache, disable write endpoints), wait.
- Single-table corruption: restore just that table with `--tables=<name>` and `--truncate` against the live project (after confirming with the on-call engineer).

### 6.4 Ransomware / malicious write incident

- Isolate: rotate the service-role key immediately in the Supabase dashboard.
- Freeze: disable the app's ingress (cloudflared / nginx kill switch).
- Roll back: restore the most recent clean backup into a staging project, validate, then swap URLs.

---

## 7. Monitoring & alerting

- The backup script prints a final `SUMMARY {...}` JSON line. Pipe stdout into your log aggregator (Loki, CloudWatch, Pino). Alert on:
  - No `SUMMARY` line in the last 26 hours.
  - `tables_backed_up` < previous day's value.
  - `total_rows` drops > 25% vs 7-day average.
  - Non-zero exit code from the cron/systemd unit.
- Weekly drill: restore yesterday's archive into a staging project and run `npm run test`.
- Quarterly drill: full DR rehearsal against a throwaway Supabase project — measure actual RTO and update this runbook.

---

## 8. Contacts

Replace placeholders with real values before going live.

| Role | Name | Primary | Backup |
|------|------|---------|--------|
| Incident commander | _<TBD>_ | _<phone>_ | _<phone>_ |
| Platform on-call | _<TBD>_ | _<phone>_ | _<phone>_ |
| Database lead | _<TBD>_ | _<phone>_ | _<phone>_ |
| Supabase support | support@supabase.io | dashboard ticket | - |
| Business owner | _Kobi El_ | _<phone>_ | _<phone>_ |

Escalation path: Platform on-call -> Database lead -> Incident commander -> Business owner. Declare an incident in the team chat with severity (SEV-1 for full outage, SEV-2 for partial, SEV-3 for degraded).

---

## 9. Change log

| Date | Author | Change |
|------|--------|--------|
| 2026-04-11 | Agent-02 | Initial runbook + `scripts/backup.js` + `scripts/backup-restore.js` |
