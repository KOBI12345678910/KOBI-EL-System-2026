# OPS_RUNBOOK — Techno-Kol / Kobi Elkayam Mega ERP

Owner: Platform / SRE
Author: Agent-33 (operations swarm)
Last reviewed: 2026-04-11
Applies to: All services under the mega ERP root
Related docs: `onyx-procurement/DR_RUNBOOK.md` (Agent-02, disaster recovery & backups)

> This runbook is for **day-to-day operations**. For disaster recovery, restore-from-backup, and Supabase PITR flows see `DR_RUNBOOK.md`.

---

## 0. Conventions

| Term | Meaning |
|------|---------|
| Root | `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\` |
| Windows dev box | Primary author machine. PowerShell or `cmd.exe`. |
| Linux prod host | Future target. systemd or `pm2` expected. |
| "Service" | A project with a `package.json` and a long-running `start` script. |
| "Graceful shutdown" | SIGTERM on Linux, `CTRL_CLOSE_EVENT` / window-close on Windows. **Never** `kill -9` / `taskkill /F` unless explicitly required. |
| Green | Service responds on `/health` within 5s and has logged a `listening` line in the last restart. |
| Red | Service crashed, OOM, port collision, or exited with non-zero. |

All paths in this document are absolute, Windows-style, against the root above. Linux examples use the equivalent POSIX path.

---

## 1. Service Map

| # | Project | Kind | Port | Start script | Build script | Depends on | Env file |
|---|---------|------|------|--------------|--------------|------------|----------|
| 1 | `onyx-procurement` | Node/Express API | **3100** | `npm start` (`node server.js`) | (none — plain JS) | Supabase Postgres, WhatsApp Business API, PDF FS, `storage/wage-slips/` | `onyx-procurement\.env` |
| 2 | `onyx-ai` | Node/TS platform | **3200** | `npm start` (`node dist/index.js`, auto-builds via `prestart`) | `npm run build` | Supabase, Anthropic, OpenAI, Upstash Redis, event store on disk | `onyx-ai\.env` |
| 3 | `techno-kol-ops` | Node/TS WebSocket + API | **5000** | `npm start` (`node dist/index.js`) | `npm run build` (`tsc`) | Postgres (`DATABASE_URL`), `onyx-procurement` (3100), `onyx-ai` (3200) | `techno-kol-ops\.env` |
| 4 | `AI-Task-Manager` | pnpm monorepo (api-server + erp-app + libs) | **8080** (api-server) | `pnpm -r --if-present run start` | `pnpm run build` | Supabase, Gmail, WhatsApp, Slack | `AI-Task-Manager\.env` |
| 5 | `payroll-autonomous` | Vite React SPA | **5173** (Vite default) | `npm run dev` (`vite`) or `npm run preview` after build | `npm run build` | None at runtime — calls `onyx-procurement` for payroll compute | none (client-side) |

Additional long-running agents — run on demand only, not in the main start sequence:

| Project | Role | Start |
|---------|------|-------|
| `nexus_engine` | Claude-driven decision engine (CLI) | `node nexus-engine.js` |
| `paradigm_engine` | Autonomous business OS | `node paradigm-engine.js` |
| `techno-kol-ops` (Foundry) | Real-time factory platform (same repo as #3) | see #3 |
| `enterprise_palantir_core`, `palantir_realtime_core` | Experimental ontology cores | manual |
| `GPS-Connect` | Location service | `pnpm -r run start` |

**Dependency graph (start order):**

```
Supabase (hosted, assumed up)
    |
    v
onyx-procurement (3100) ──┐
    |                     │
onyx-ai (3200)            │
    |                     │
    v                     v
techno-kol-ops (5000) ← depends on both above
    |
    v
AI-Task-Manager api-server (8080)
    |
    v
payroll-autonomous SPA (5173)  [dev only; prod is static-hosted]
```

If you start in any other order, `techno-kol-ops` will emit `ECONNREFUSED` warnings against `ONYX_PROCUREMENT_URL` / `ONYX_AI_URL` until the upstream services come up — this is tolerated (it retries) but noisy.

---

## 2. Starting all services

### 2.1 Windows (one-shot)

Use `scripts\start-all.bat`. It opens each service in its own `cmd` window so you can see live logs:

```cmd
cd "C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL"
scripts\start-all.bat
```

What it does:

1. Checks that each `.env` exists — refuses to start if any are missing.
2. Opens a new titled window per service (`ONYX-PROCUREMENT :3100`, `ONYX-AI :3200`, `TECHNO-KOL-OPS :5000`, `AI-TASK-MANAGER :8080`).
3. Writes a PID file per service into `scripts\pids\<service>.pid` so the stop script can find them.
4. Launches in dependency order with a 3-second delay between each.

To start a **single** service for debugging, `cd` into that project and run `npm start` directly.

### 2.2 Linux / macOS (one-shot)

```bash
cd "/path/to/מערכת 2026  KOBI EL"
./scripts/start-all.sh
```

The shell script:

- Starts each service in the background with `nohup` + process-group isolation.
- Writes PIDs to `scripts/pids/<service>.pid`.
- Redirects stdout/stderr to `scripts/logs/<service>.out` and `<service>.err`.
- Installs a `trap "./scripts/stop-all.sh" INT TERM` so **Ctrl-C in the launching shell** fires graceful shutdown of every child.
- Uses `wait -n` to watch for premature crashes.

### 2.3 Production-ready alternative (recommended for Linux)

Prefer a supervisor. Example `pm2` ecosystem file (not shipped in repo — copy into prod host):

```js
module.exports = {
  apps: [
    { name: 'onyx-procurement', cwd: './onyx-procurement', script: 'server.js', env: { NODE_ENV: 'production', PORT: 3100 } },
    { name: 'onyx-ai',          cwd: './onyx-ai',          script: 'dist/index.js', env: { NODE_ENV: 'production', PORT: 3200 } },
    { name: 'techno-kol-ops',   cwd: './techno-kol-ops',   script: 'dist/index.js', env: { NODE_ENV: 'production', PORT: 5000 } },
    { name: 'ai-task-manager',  cwd: './AI-Task-Manager/artifacts/api-server', script: 'dist/index.js', env: { NODE_ENV: 'production', PORT: 8080 } },
  ],
};
```

Then `pm2 start ecosystem.config.js && pm2 save && pm2 startup`.

Or use `systemd` — one unit file per service, `After=network-online.target`, `Restart=on-failure`, `ExecStop=/bin/kill -SIGTERM $MAINPID`.

---

## 3. Stopping services gracefully

**Rule: always SIGTERM first. Never SIGKILL (`kill -9`) unless a service has ignored SIGTERM for more than 30 seconds.**

### 3.1 Windows

```cmd
scripts\stop-all.bat
```

This sends `CTRL_BREAK_EVENT` (via `taskkill /PID <pid>` **without** `/F`) to each PID recorded in `scripts\pids\*.pid`. Node processes receive this as `SIGINT` and run their shutdown hooks. If a service is still alive after 30s, the script prints its PID and exits non-zero — you then inspect and decide whether to force it.

Manual fallback for one service:

```cmd
taskkill /PID 12345
:: wait 10s, check still running, then as last resort:
taskkill /PID 12345 /F
```

### 3.2 Linux / macOS

```bash
./scripts/stop-all.sh
```

Which runs, per service:

```bash
kill -TERM "$pid"           # graceful
for i in 1..30; do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
kill -KILL "$pid" 2>/dev/null || true   # only if still alive
```

**Do not** use `killall node` — it will nuke unrelated Node processes on a shared host.

### 3.3 What "graceful" actually does inside each service

- `onyx-procurement` — drains the Express server (`server.close()`), flushes Pino logs, releases Supabase client.
- `onyx-ai` — flushes event store (`data/events.jsonl`) and closes the API server. **Critical**: a hard-kill can truncate the append-only event log; recovery then needs the last good line to be found and trimmed manually.
- `techno-kol-ops` — closes WebSocket clients with close code `1001` ("going away"), stops cron jobs, closes `pg` pool.
- `AI-Task-Manager api-server` — closes HTTP + any worker threads.

---

## 4. Log locations

| Service | Dev (Windows) | Prod (Linux) | Format |
|---------|---------------|--------------|--------|
| `onyx-procurement` | stdout of the cmd window; optional file if `LOG_FORMAT=json` is piped to `scripts\logs\onyx-procurement.out` | `/var/log/onyx-procurement/*.log` (or `pm2 logs onyx-procurement`) | Pino JSON |
| `onyx-ai` | stdout; event store at `onyx-ai\data\events.jsonl` | `/var/log/onyx-ai/*.log`; events at `onyx-ai/data/events.jsonl` | JSON + JSONL event log |
| `techno-kol-ops` | stdout; `logs/` in-project if present | `/var/log/techno-kol-ops/*.log` | console + JSON |
| `AI-Task-Manager` | `AI-Task-Manager\logs\` (written by api-server) | same | JSON, one file per day |
| `payroll-autonomous` | Vite in-terminal only | static; no server logs | — |
| `start-all.sh` wrapper | `scripts/logs/<service>.out` and `.err` | same | raw stdout/stderr |

Always grep JSON logs with a tool that understands JSON lines — `jq`, `pino-pretty`, or VS Code's "Log File Highlighter" — not plain `grep` alone.

---

## 5. Common incidents and resolutions

### 5.1 Server won't start

**Symptoms**: `npm start` exits immediately, or the service window closes instantly on Windows.

**Resolution checklist** (do in order, stop at first hit):

1. **Check `.env`** — `dir onyx-procurement\.env` (or equivalent). If missing, copy from `.env.example` and fill in secrets. Missing `SUPABASE_URL` or `PORT` is the #1 cause.
2. **Check the port isn't already bound**:
   - Windows: `netstat -ano | findstr :3100`
   - Linux: `ss -ltnp | grep :3100`
   - If held by a stale Node, stop it gracefully (section 3).
3. **Check Node version**: `node --version` must be >= 20 for `onyx-procurement` / `onyx-ai`. Use `nvm` to switch.
4. **Run the pre-start check**: `cd <project> && node --check server.js` (or `npm run check` where available).
5. **Inspect logs**: look for `EADDRINUSE`, `ECONNREFUSED`, `Error: Cannot find module`, or `Missing env: XXX`.
6. **Re-install deps** if `Cannot find module`: `npm ci` (or `pnpm install --frozen-lockfile` for the workspaces).

### 5.2 Supabase connection errors

**Symptoms**: `fetch failed`, `ENOTFOUND *.supabase.co`, `invalid jwt`, or 401s from the Supabase client.

1. Verify `SUPABASE_URL` begins with `https://` and has no trailing slash.
2. Verify the **service-role** key (not the anon key) is used for server-to-server code paths.
3. Check project status at `https://status.supabase.com/` and on the Supabase dashboard (project not paused, not hit storage limit).
4. From the dev box: `curl -sS $SUPABASE_URL/rest/v1/ -H "apikey: $SUPABASE_ANON_KEY"` — should return JSON, not HTML.
5. If all of the above are green and we still get 401: **rotate the service-role key** in Supabase dashboard, update `.env`, restart the service.
6. If the issue is intermittent, check Supabase project metrics for rate-limit / connection-pool exhaustion — `onyx-procurement` and `techno-kol-ops` together can exhaust the default pool. Fix: set `supabase.pool.max` or front with PgBouncer.

### 5.3 Rate limit exceeded

**Symptoms**: Client gets HTTP 429 from `onyx-procurement` or `techno-kol-ops`.

- Check `onyx-procurement\.env` — `RATE_LIMIT_API_MAX=300`, `RATE_LIMIT_WEBHOOK_MAX=120` (per window, default 15m).
- Grep logs for `rate-limit` to see which IP/key is hot.
- Legitimate burst (e.g. month-end payroll) — temporarily raise the limit, restart, and document the incident.
- Suspected abuse — rotate the caller's API key (section 5.4) and add the IP to a blocklist.
- **Never** disable rate limiting in production to "fix" 429s; that's how you get DDoSed.

### 5.4 API key rejected

**Symptoms**: `401 Unauthorized — invalid api key` in `onyx-procurement`.

1. `onyx-procurement\.env` — `AUTH_MODE=api_key` and `API_KEYS=` must contain the caller's key, comma-separated.
2. The key must be present at process start — the service caches keys at boot. **You must restart the service after editing `API_KEYS`.**
3. Generate a new key: `openssl rand -hex 32`, add it to `API_KEYS`, restart, hand the key to the client via a secure channel.
4. If the caller is `techno-kol-ops`, update `techno-kol-ops\.env` -> `ONYX_PROCUREMENT_API_KEY=...` and restart both services.

### 5.5 PDF generation fails

**Symptoms**: `POST /api/payroll/wage-slips/:id/issue` returns 500; error log mentions `pdfkit` or `ENOENT`.

1. **Disk space** — if `storage/wage-slips/` is full, pdfkit throws on flush. See 5.8.
2. **Font file missing** — pdfkit expects built-in fonts; if a custom Hebrew font was added and removed, the call fails. Check `server.js` for `.font('...')` paths.
3. **Permissions** — on Windows the OneDrive folder can lock files mid-sync. Move the service to a non-OneDrive path or disable sync for `storage/`.
4. **Long-running pdfkit stream leaked** — restart the service to free file handles.
5. If the failing slip is one specific record, export the raw slip JSON (`GET /api/payroll/wage-slips/:id`) and try `compute` mode; if compute works but `issue` fails, the issue is rendering, not data.

### 5.6 PCN836 encoding issues

**Symptoms**: Exported PCN836 file is rejected by Israel Tax Authority, or opens in Hebrew as gibberish.

- PCN836 must be **Windows-1255** (Hebrew) fixed-width, **not** UTF-8.
- Check `src/tax/form-builders.js` — the encoder must use `iconv-lite` with `windows-1255` and never touch Buffer.toString() without explicit encoding.
- Line endings: CRLF (`\r\n`) — some validators reject LF.
- If numbers look off by 100x, the fractional-agorot rounding flipped — double-check all amounts are integers in agorot, not floats in shekels.
- Validate by round-tripping: `iconv -f WINDOWS-1255 -t UTF-8 pcn836.txt | head`.
- Keep a reference fixture of a previously-accepted file in `test/fixtures/pcn836/` and diff against it before submitting.

### 5.7 Webhook HMAC mismatch

**Symptoms**: WhatsApp / Meta webhook returns 401, Meta stops sending messages, log says `invalid x-hub-signature-256`.

1. `WHATSAPP_APP_SECRET` in `.env` must match the **App Secret** (not the Access Token) from Meta Developer console.
2. HMAC is computed over the **raw request body** — if any middleware (e.g. `express.json()`) ran before the verifier, the body was already parsed and the HMAC will never match. Make sure `/webhooks/*` routes use `express.raw()` and verify **before** JSON parsing.
3. Secret rotated recently? The old secret is cached in process memory — restart.
4. Wrong algorithm: must be SHA-256, prefix `sha256=`, hex-encoded, compared in constant-time (`crypto.timingSafeEqual`).
5. Clock skew doesn't cause HMAC mismatch, but it does cause replay-protection failures if you added a timestamp window. Check server time with `w32tm /query /status` (Win) or `timedatectl` (Linux).

### 5.8 Disk full (`storage/wage-slips/`)

**Symptoms**: PDF generation 500s; backup job fails with `ENOSPC`; log writes silently drop.

1. `dir onyx-procurement\storage\wage-slips /s` or `du -sh onyx-procurement/storage/wage-slips` — confirm size.
2. Wage slips from prior fiscal years should be archived: move to cold storage (`backups/wage-slips-archive/YYYY/`) and keep only current year + last year hot.
3. **Do not** delete slips — they are legally required to be retained for 7 years under Israeli labor law. Archive, don't destroy.
4. Rotate old PDF logs and old backup archives first if they live on the same volume.
5. Long-term: mount `storage/` on its own partition so a runaway log can't kill the tax data.

---

## 6. Daily operational tasks

Run each morning (or via a scheduled task). Target completion: 10 minutes.

- [ ] **Backup verify** — confirm `onyx-procurement/backups/YYYY-MM-DD/manifest.json` exists for yesterday and `manifest.json.tables[].row_count` is non-zero on the core tables (`suppliers`, `purchase_orders`, `wage_slips`, `line_items`). See `DR_RUNBOOK.md` section 4 for the full verify flow.
- [ ] **Disk check** — `scripts/check-disk.sh` (or manual `df -h` / `dir`) — alert if any volume > 80%.
- [ ] **Log rotation** — keep 14 days of hot logs, archive older. Windows: a Scheduled Task running `forfiles /p logs /s /m *.log /d -14 /c "cmd /c move @path archive\"`. Linux: `logrotate` with `daily`, `rotate 14`, `compress`.
- [ ] **Service health** — hit `/health` on 3100, 3200, 5000, 8080. Any non-200 is an incident.
- [ ] **Error log scan** — `grep -E '(ERROR|FATAL|uncaught|unhandledRejection)' scripts/logs/*.out` (or equivalent) — zero tolerance for unhandled rejections.

---

## 7. Weekly tasks

Target: Friday afternoon, ~45 minutes.

- [ ] **Dependency audit** — per service: `npm audit --audit-level=high` (or `pnpm audit`). Triage new CVEs; open upgrade PRs for high/critical.
- [ ] **Security review** — scan `.env` files for keys that should have been rotated; review last week's auth failures in `onyx-procurement` logs.
- [ ] **DB slow-query review** — check Supabase dashboard "Query Performance" — flag any query > 500ms median.
- [ ] **Backup restore drill (lite)** — pick one small table, restore to a scratch DB using `DR_RUNBOOK.md` section 5 — verify row count matches. Do this weekly even if full DR is only tested quarterly.
- [ ] **Key rotation check** — rotate one non-critical key per week on a rolling schedule so a full key bucket is always fresh.

---

## 8. Monthly tasks

Target: 1st business day of the month, ~2 hours.

- [ ] **Close VAT period** — run the VAT closing flow in `onyx-procurement` (`POST /api/tax/vat/close` — see `QA-AGENT-140-VAT-REPORT.md`). Verify the period is locked and no more invoices can be back-dated into it.
- [ ] **Generate PCN836** — export the previous month's PCN836 file, validate the encoding (section 5.6), upload to Israel Tax Authority portal. Keep the confirmation number in `DOCUMENTS/tax-filings/YYYY-MM/`.
- [ ] **Review YTD** — pull YTD P&L and cashflow from `AI-Task-Manager`; compare to target.
- [ ] **Dependency upgrades** — bump patch/minor versions for non-critical deps; run full test suite.
- [ ] **Full DR restore drill** — one month of the year, do a full end-to-end restore per `DR_RUNBOOK.md`.
- [ ] **Certificate check** — TLS certs on any public endpoint; renew if < 30 days to expiry.

---

## 9. Quarterly tasks

Target: first week after quarter close, ~half a day.

- [ ] **Close fiscal quarter** — reconcile GL in `AI-Task-Manager`; run `techno-kol-ops` quarterly close job; archive the closing balance sheet.
- [ ] **Capacity review** — DB size, storage size, log volume vs. last quarter; forecast next quarter.
- [ ] **Pen-test refresh** — review `QA-AGENT-30-PENTEST-PLAN.md`; run the scripted checks; file any new findings.
- [ ] **Access audit** — who has Supabase service-role key, who has WhatsApp Business admin, who has onyx-procurement API keys. Rotate anything owned by someone who left.

---

## 10. Annual tasks

Target: late January for the previous calendar year.

- [ ] **Close fiscal year** — full year-end close in `AI-Task-Manager` + `onyx-procurement` + `techno-kol-ops`.
- [ ] **Generate Form 1320** (annual employer withholding reconciliation).
- [ ] **Generate Form 1301** (individual employee annual summary per employee).
- [ ] **Generate Form 6111** (annual corporate tax return data).
- [ ] **Archive** — move all closed-year data to cold storage (`DOCUMENTS/archives/YYYY/`), keep a read-only export.
- [ ] **Retention sweep** — delete data past its legal retention window (note: payroll = 7 years, tax = 7 years, audit logs = 7 years under Israeli law — be careful).
- [ ] **Update this runbook** — port/version numbers, new services, retired services, last-year lessons learned.

---

## 11. Performance tuning tips

- **Node**: run with `NODE_OPTIONS="--max-old-space-size=2048"` on a 4GB host. Above that, profile first — raising it without profiling just delays the OOM.
- **Express**: enable `app.set('trust proxy', 1)` when behind a reverse proxy so `req.ip` reflects the real client (rate limiting depends on this).
- **Supabase**: use `.select('col1,col2')` always — do not `select('*')` on wide tables (wage_slips, events). Page with `.range(offset, offset+999)` — 1000 rows per page is the sweet spot.
- **Pino**: set `LOG_LEVEL=info` in prod, `debug` only when actively troubleshooting. `trace` is for local only — it will flood the disk.
- **PDFKit**: stream pipes, never buffer the whole PDF in memory; close the stream in a `finally` block.
- **WebSockets in `techno-kol-ops`**: cap clients per backend with `maxPayload`, implement heartbeat (`ping`/`pong` every 30s) to catch half-open connections.
- **Cold DB indexes**: if a query plan shows `Seq Scan` on a >10k-row table, add the index — `explain analyze` is your friend.
- **File IO**: OneDrive-synced folders are **slow** for hot write paths. Prod must not run out of OneDrive.

---

## 12. Scaling checklist — when to worry

| Metric | Green | Yellow | Red — act now |
|--------|-------|--------|---------------|
| Supabase DB size | < 2 GB | 2–6 GB | > 6 GB (free tier is 8 GB) |
| Monthly active DB connections peak | < 40 | 40–80 | > 80 (pool default 100) |
| `storage/wage-slips/` size | < 5 GB | 5–15 GB | > 15 GB on local disk |
| `onyx-ai/data/events.jsonl` | < 500 MB | 500 MB – 2 GB | > 2 GB — compact/snapshot |
| Backups folder | < 30 GB | 30–80 GB | > 80 GB — adjust `--keep-days` |
| p95 `/api/*` latency | < 300 ms | 300 ms – 1 s | > 1 s sustained |
| Node RSS per service | < 400 MB | 400 MB – 1 GB | > 1 GB — profile for leaks |
| 4xx rate | < 2% | 2–5% | > 5% |
| 5xx rate | 0 | > 0 briefly | > 0 sustained — incident |

Hitting **Red** on any row means start the corresponding remediation:

- **DB size red** → upgrade Supabase plan or archive old partitions.
- **Storage red** → follow section 5.8 (archive, do not delete).
- **Events.jsonl red** → snapshot + compact (see `onyx-ai` docs).
- **Latency red** → look for a regression in the last deploy, then for a slow DB query.
- **5xx red** → declare incident, follow `QA-AGENT-22-INCIDENT-RESPONSE.md`.

---

## 13. When to escalate

| Situation | Escalate to | How |
|-----------|-------------|-----|
| Supabase down / degraded | Supabase support + Platform owner | Dashboard → Support, plus Slack #ops |
| Data loss suspected | Platform owner + Legal | Immediate phone call; freeze writes first |
| Security incident (key leak, pentest finding) | Security owner + CEO | Follow `QA-AGENT-22` severity matrix |
| Israel Tax Authority rejection of PCN836 / Form 126 | Accountant + Platform owner | Within 24h (regulatory clock) |
| PII breach | DPO + Legal + Platform owner | Israeli Privacy Protection Law — 72h notification window |

---

## 14. See also

- `DR_RUNBOOK.md` (disaster recovery, Supabase PITR, restore procedures)
- `QA-AGENT-20-LOGGING.md` (logging standards)
- `QA-AGENT-21-MONITORING.md` (monitoring / alerting)
- `QA-AGENT-22-INCIDENT-RESPONSE.md` (incident severity matrix and paging)
- `QA-AGENT-23-SLA-SLO.md` (availability targets)
- `SYSTEM_ARCHITECTURE.md` (high-level service diagrams)
