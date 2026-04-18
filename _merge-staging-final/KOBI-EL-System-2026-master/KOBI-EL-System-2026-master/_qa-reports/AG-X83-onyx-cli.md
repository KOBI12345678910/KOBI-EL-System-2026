# AG-X83 — onyx-cli (Admin CLI for Operators)

**Status:** Implemented
**Agent:** AG-X83
**Date:** 2026-04-11
**Scope:** `onyx-procurement/bin/onyx-cli.js`, `onyx-procurement/src/cli/**`, `onyx-procurement/test/cli/**`
**Rule honoured:** לא מוחקים רק משדרגים ומגדלים — destructive ops archive instead of deleting; the registry rejects overwrites.

---

## 1. Overview / סקירה כללית

`onyx-cli` is a zero-dependency Node.js admin CLI for the Techno-Kol Uzi Mega-ERP. It gives operators a single entry point for daily tasks (health checks, DB migrations, seeding), troubleshooting (log tail/search, queue inspection, webhook probing), and data ops (invoice reprint, VAT generation, payroll runs).

Key design points:

- **Zero external deps** — uses only `node:fs`, `node:path`, `node:child_process`, `node:readline`, and ANSI escape codes.
- **Modular**: every command group is its own file under `src/cli/commands/*.js` and is registered through `src/cli/registry.js`. New groups plug in without touching the CLI entry point.
- **Bilingual help** — every group and sub-command ships an `{ en, he }` description; `onyx-cli help` prints both in the same listing.
- **Colourised output** via `src/cli/ansi.js` — respects `NO_COLOR`, `ONYX_NO_COLOR`, `ONYX_FORCE_COLOR`, and auto-disables for non-TTY stdout.
- **Confirmation prompts** for destructive ops (readline-based, bilingual: y/yes/כן). Skippable with `--yes` or `ONYX_CLI_ASSUME_YES=1`.
- **Config loader** resolves `process.env.ONYX_CONFIG` then falls back to `./config/onyx-cli.json`; a sample file is shipped at that path.

---

## 2. File Layout / מבנה קבצים

```
onyx-procurement/
├── bin/
│   └── onyx-cli.js                  # entry point (shebang + thin bootstrap)
├── config/
│   └── onyx-cli.json                # default config (API base, log paths, cache dir…)
├── src/cli/
│   ├── dispatcher.js                # argv → handler orchestrator
│   ├── registry.js                  # plug-in registry (never overwrites)
│   ├── argparser.js                 # zero-dep flag parser
│   ├── config.js                    # config loader (ONYX_CONFIG → ./config/onyx-cli.json)
│   ├── ansi.js                      # colour helpers
│   ├── prompt.js                    # readline confirm() (bilingual)
│   ├── logger.js                    # level-aware console logger
│   ├── help.js                      # bilingual help formatter
│   └── commands/
│       ├── help.js
│       ├── status.js
│       ├── db.js                    # migrate | seed | backup | restore
│       ├── user.js                  # create | reset-password | role
│       ├── invoice.js               # reprint | export
│       ├── payroll.js               # run | slip
│       ├── vat.js                   # generate | pcn836
│       ├── logs.js                  # tail | search
│       ├── cache.js                 # flush | warm
│       ├── queue.js                 # list | retry | purge
│       └── webhook.js               # test
└── test/cli/
    └── onyx-cli.test.js             # 51 tests, node --test
```

---

## 3. Installation / התקנה

No npm install required. Run directly:

```bash
# from repo root
node onyx-procurement/bin/onyx-cli.js --version
```

To make it globally callable on a Unix-style shell:

```bash
chmod +x onyx-procurement/bin/onyx-cli.js
ln -s "$PWD/onyx-procurement/bin/onyx-cli.js" /usr/local/bin/onyx-cli
```

On Windows, from the repo root:

```powershell
node onyx-procurement\bin\onyx-cli.js help
```

Or wire it as a package.json bin (optional, non-destructive future PR):

```json
{ "bin": { "onyx-cli": "./bin/onyx-cli.js" } }
```

---

## 4. Command Reference / סימוכין פקודות

All commands follow the pattern `onyx-cli <group> [sub] [args] [flags]`.
Use `onyx-cli help [group] [sub]` for detailed bilingual help.

### 4.1 `onyx-cli status` — System health check / בדיקת תקינות מערכת

| Aspect | Value |
| --- | --- |
| Usage | `onyx-cli status` |
| Destructive | No |
| Checks | config file, node runtime, logs dir writable, queue worker script |
| Exit codes | 0 all-pass · 1 any fail |

**Example**:

```bash
$ onyx-cli status
onyx-cli status / בדיקת מערכת
  [PASS] config file    קובץ תצורה    .../config/onyx-cli.json
  [PASS] node runtime   סביבת Node    24.14.1
  [PASS] logs dir       תיקיית לוגים   ./logs
  [PASS] queue worker   תהליך תור      .../scripts/queue-worker.js
✓ All 4 checks passed / כל הבדיקות עברו
```

### 4.2 `onyx-cli db` — Database operations / פעולות מסד נתונים

| Sub | Usage | Flags | Destructive |
| --- | --- | --- | --- |
| `migrate` | `db migrate [--status]` | `--status` for dry-run | No |
| `seed` | `db seed` | — | No |
| `backup` | `db backup [--out <path>]` | `--out` | No |
| `restore` | `db restore <file> [--yes]` | `--yes` to skip confirm | **Yes** |

Each sub shells out to an existing `scripts/*.js` file if present:
`scripts/migrate.js`, `scripts/seed-data.js`, `scripts/backup.js`, `scripts/backup-restore.js`. Missing script → exit 2 with clear error.

**Examples**:

```bash
onyx-cli db migrate
onyx-cli db migrate --status
onyx-cli db backup --out ./backups/2026-04.sql
onyx-cli db restore ./backups/2026-04.sql --yes
```

### 4.3 `onyx-cli user` — User accounts / משתמשים

| Sub | Usage | Validation |
| --- | --- | --- |
| `create` | `user create <email>` | Email regex |
| `reset-password` | `user reset-password <email>` | Email regex |
| `role` | `user role <email> <role>` | Role ∈ {owner, admin, manager, operator, viewer, auditor, accountant} |

The `owner` and `admin` roles trigger a confirmation prompt to catch typos.

**Examples**:

```bash
onyx-cli user create yossi@tku.co.il
onyx-cli user reset-password yossi@tku.co.il
onyx-cli user role yossi@tku.co.il accountant
onyx-cli user role yossi@tku.co.il admin --yes
```

### 4.4 `onyx-cli invoice` — Invoice operations / חשבוניות

| Sub | Usage | Flags |
| --- | --- | --- |
| `reprint` | `invoice reprint <id> [--out <dir>]` | `--out` — output folder (default `public/invoices/`) |
| `export` | `invoice export <from> <to> [--format csv\|json\|xlsx]` | `--format` (default `csv`) |

Dates accept `YYYY-MM-DD` or `YYYY-MM`; the CLI enforces `from <= to`.

**Examples**:

```bash
onyx-cli invoice reprint INV-2026-00042
onyx-cli invoice export 2026-04-01 2026-04-30
onyx-cli invoice export 2026-01 2026-03 --format xlsx
```

### 4.5 `onyx-cli payroll` — Payroll / שכר

| Sub | Usage | Destructive |
| --- | --- | --- |
| `run` | `payroll run <period>` | **Yes** (creates financial artefacts) |
| `slip` | `payroll slip <employee> <period>` | No |

Period format: `YYYY-MM`. Employee id: `[A-Za-z0-9_-]{1,32}`.

**Examples**:

```bash
onyx-cli payroll run 2026-04
onyx-cli payroll run 2026-04 --yes
onyx-cli payroll slip EMP-0042 2026-04
```

### 4.6 `onyx-cli vat` — VAT reporting / דיווח מע"מ

| Sub | Usage | Flags |
| --- | --- | --- |
| `generate` | `vat generate <period>` | — |
| `pcn836` | `vat pcn836 <period> [--out <path>]` | `--out` |

**Examples**:

```bash
onyx-cli vat generate 2026-04
onyx-cli vat pcn836 2026-04 --out ./exports/pcn836-2026-04.txt
```

### 4.7 `onyx-cli logs` — Log tail / search / לוגים

| Sub | Usage | Flags |
| --- | --- | --- |
| `tail` | `logs tail [--lines N] [--file <path>]` | `--lines` (default 50), `--file` |
| `search` | `logs search <query> [--limit N] [--file <path>]` | `--limit` (default 200), `--file` |

Reads are streamed (no full-file slurp), so large logs are safe.
Default log file: `config.logFile` → `./logs/onyx-procurement.log`.

**Examples**:

```bash
onyx-cli logs tail
onyx-cli logs tail --lines 200
onyx-cli logs search "VAT error"
onyx-cli logs search 404 --limit 50
```

### 4.8 `onyx-cli cache` — Cache maintenance / מטמון

| Sub | Usage | Destructive |
| --- | --- | --- |
| `flush` | `cache flush [--dir <path>] [--yes]` | **Yes** (archives + re-creates) |
| `warm` | `cache warm` | No |

`flush` renames the current cache folder to `*.flushed-<timestamp>` rather than deleting it — consistent with the project rule.

**Examples**:

```bash
onyx-cli cache flush
onyx-cli cache flush --yes
onyx-cli cache warm
```

### 4.9 `onyx-cli queue` — Background queue / תור עבודות

| Sub | Usage | Destructive |
| --- | --- | --- |
| `list` | `queue list` | No |
| `retry` | `queue retry <id>` | No |
| `purge` | `queue purge [--yes]` | **Yes** (archives snapshot) |

Queue state is a JSON file at `config.queueFile` (default `./data/queue.json`). `purge` archives to `queue.json.purged-<timestamp>` and writes a fresh empty snapshot.

**Examples**:

```bash
onyx-cli queue list
onyx-cli queue retry 42
onyx-cli queue purge --yes
```

### 4.10 `onyx-cli webhook` — Webhook utilities / webhook

| Sub | Usage |
| --- | --- |
| `test` | `webhook test <url>` |

Sends a POST with `{ event: "onyx.test", source: "onyx-cli", timestamp, message }`. Requires Node.js 18+ (global `fetch`).

**Examples**:

```bash
onyx-cli webhook test https://example.com/hook
onyx-cli webhook test http://localhost:3100/webhooks/test
```

### 4.11 `onyx-cli help [command] [sub]` — Help / עזרה

```bash
onyx-cli help                      # top-level index
onyx-cli help db                   # group help
onyx-cli help db migrate           # sub-command help
onyx-cli db backup --help          # equivalent
onyx-cli -h                        # same as onyx-cli help
```

---

## 5. Global Flags / דגלים גלובליים

| Flag | Effect |
| --- | --- |
| `-h`, `--help` | Show help. Works on top level, on a group, and on a sub-command. |
| `--yes` | Assume yes on all confirmation prompts (destructive ops). Also via `ONYX_CLI_ASSUME_YES=1`. |
| `--config <path>` | Override config file location (else `ONYX_CONFIG`, else `./config/onyx-cli.json`). |
| `--no-color` | Disable ANSI colouring. Also via `NO_COLOR` or `ONYX_NO_COLOR`. |
| `--version`, `-v` | Print `onyx-cli <version>` and exit 0. |

Environment variables:

| Var | Effect |
| --- | --- |
| `ONYX_CONFIG` | Path to the config JSON. |
| `ONYX_CLI_ASSUME_YES` | `1` = auto-confirm destructive prompts. |
| `ONYX_CLI_DEBUG` | `1` = print stack traces on unexpected exceptions. |
| `NO_COLOR` / `ONYX_NO_COLOR` | disable colour. |
| `ONYX_FORCE_COLOR` | force colour even when stdout is not a TTY. |

---

## 6. Exit Codes / קודי יציאה

Stable contract — handlers are expected to honour these.

| Code | Meaning / משמעות |
| --- | --- |
| `0` | Success / הצלחה |
| `1` | Runtime failure — cancelled confirmation, failed operation, webhook non-2xx / כישלון |
| `2` | Usage error — unknown command, bad argument, missing arg, validation failure / שגיאת שימוש |
| `3` | Unexpected exception — handler threw, config parse failed / שגיאה לא צפויה |

---

## 7. Configuration / תצורה

File: `onyx-procurement/config/onyx-cli.json` (sample shipped with this change).

```json
{
  "apiBase": "http://localhost:3100",
  "logFile": "./logs/onyx-procurement.log",
  "logsDir": "./logs",
  "cacheDir": "./.cache",
  "queueFile": "./data/queue.json",
  "cacheWarmupUrls": [
    "/api/health",
    "/api/suppliers",
    "/api/products",
    "/api/invoices/recent"
  ]
}
```

All fields are optional — missing file ⇒ handlers fall back to sensible defaults (`./logs/onyx-procurement.log`, `./.cache`, `./data/queue.json`). Resolution order:

1. `--config <path>`
2. `process.env.ONYX_CONFIG`
3. `./config/onyx-cli.json` (relative to current working directory)

Malformed JSON → exit code 3 with a descriptive error.

---

## 8. Confirmation Prompts / אישורים

Destructive commands (`db restore`, `payroll run`, `cache flush`, `queue purge`, `user role owner|admin`) use a bilingual readline prompt:

```
Restore database from "backup.sql"? ... (y/N) / להמשיך? (כן/לא)
```

Accepted "yes" values: `y`, `yes`, `כן`.
Anything else (including empty) is "no" — default is safe.

`--yes` or `ONYX_CLI_ASSUME_YES=1` bypass the prompt entirely (needed for CI / systemd timers).

---

## 9. Hebrew Help Samples / דוגמאות עזרה בעברית

```
$ onyx-cli help
onyx-cli — Techno-Kol Uzi Mega-ERP admin CLI / כלי ניהול
────────────────────────────────────────────────────────

USAGE / שימוש:
  onyx-cli <command> [sub-command] [args] [flags]
  onyx-cli help [command]         # detailed help / עזרה מפורטת

COMMANDS / פקודות:
  cache       Cache maintenance (flush, warm)  ·  תחזוקת מטמון (רענון, חימום)
  db          Database operations ...          ·  פעולות מסד נתונים ...
  help        Show help for a command          ·  הצג עזרה לפקודה
  invoice     Invoice operations (reprint, export)  ·  פעולות חשבוניות
  logs        Log tail / search                ·  צפייה וחיפוש בלוגים
  payroll     Payroll operations (run, wage slip)   ·  פעולות שכר
  queue       Background queue (list, retry, purge) ·  תור עבודות רקע
  status      System health check              ·  בדיקת תקינות מערכת
  user        User account operations          ·  פעולות משתמשים
  vat         VAT reporting ...                ·  דיווח מע"מ ...
  webhook     Webhook utilities                ·  כלי webhook

GLOBAL FLAGS / דגלים גלובליים:
  -h, --help        Show help / הצג עזרה
      --yes         Assume yes on confirmations / אשר אוטומטית
      --config <f>  Override config file path / נתיב קובץ תצורה
      --no-color    Disable ANSI colour / בטל צבעים

Rule: לא מוחקים רק משדרגים ומגדלים.
```

```
$ onyx-cli help db migrate
onyx-cli db migrate
────────────────────────────────────────────────────────
  Apply pending database migrations
  הרצת מיגרציות חסרות

USAGE / שימוש:
  onyx-cli db migrate [--status]

EXAMPLES / דוגמאות:
  $ onyx-cli db migrate
  $ onyx-cli db migrate --status
```

```
$ onyx-cli help queue purge
onyx-cli queue purge
────────────────────────────────────────────────────────
  Archive the queue snapshot and start fresh
  ארכוב המצב הנוכחי וניקוי התור

USAGE / שימוש:
  onyx-cli queue purge

EXAMPLES / דוגמאות:
  $ onyx-cli queue purge
  $ onyx-cli queue purge --yes

⚠ destructive / פעולה הרסנית — confirmation required
```

---

## 10. Test Coverage / כיסוי בדיקות

File: `onyx-procurement/test/cli/onyx-cli.test.js`
Runner: `node --test`
Current count: **51 tests, 51 pass, 0 fail** (~150ms).

Coverage areas:

| Area | Count | What it verifies |
| --- | --- | --- |
| Arg parser | 8 | bare command, group+sub+positional, `--flag value`, `--flag=value`, boolean flag, `-h`→help, `--` passthrough, multi-positional `help` |
| Registry | 5 | all 11 groups registered, db has all 4 subs, duplicate register throws, extend cannot overwrite, extend appends |
| Help formatter | 4 | top-level bilingual banner, group help, command help with examples, unknown group safe output |
| ANSI | 1 | strip() removes escape sequences |
| Dispatch (mock handlers) | 12 | exit 0/1/3, positional passing, async handlers awaited, unknown group→2, unknown sub→2, missing sub→2, status dispatches, `--help` on group/sub, top-level help on empty argv |
| Prompts | 6 | `y`, `yes`, `כן` true; `n` and empty false; `assumeYes` skips stdin |
| Destructive dispatch | 3 | cancelled→1, confirmed→0, `--yes` skips prompt |
| Real command validation | 10 | user create (missing/invalid/valid), invoice export (bad/good dates), vat generate (bad/good period), payroll slip, webhook bad URL, help paths |

Run locally:

```bash
cd onyx-procurement
node --test test/cli/onyx-cli.test.js
```

---

## 11. Extensibility / הרחבה

To add a new command group in a future PR **without touching the dispatcher**:

1. Create `src/cli/commands/<name>.js` exporting `{ name, description, subcommands }`.
2. Add one line to `loadBuiltIns()` in `src/cli/dispatcher.js`:
   `require('./commands/<name>.js')`
3. Run `node --test test/cli/onyx-cli.test.js` — the "all required groups registered" test is the canary.

To extend an existing group from a plugin:

```js
const registry = require('onyx-procurement/src/cli/registry');
registry.extend('db', {
  verify: {
    description: { en: 'Verify schema', he: 'אימות סכמה' },
    usage: 'db verify',
    handler: async (ctx) => { /* ... */ return 0; },
  },
});
```

`registry.extend()` throws if the sub already exists — upgrade-not-delete is enforced at the API level.

---

## 12. Non-Destructive Guarantees / הבטחות אי-הרסנות

- `cache flush` renames `.cache` → `.cache.flushed-<timestamp>`, then re-creates an empty folder. Nothing is unlinked.
- `queue purge` renames `data/queue.json` → `data/queue.json.purged-<timestamp>`, then writes `{ "jobs": [] }`. The old file is preserved for audit.
- `db restore` shells out to the existing `scripts/backup-restore.js` (unchanged by this PR) — behaviour there is outside the CLI's scope but the CLI gates it behind a confirmation.
- `user` operations only add rows / tokens; no row is deleted.
- The registry actively refuses duplicate registration and overwriting of existing sub-commands, making accidental deletion through code changes impossible without explicit removal from the source file (which itself is caught by code review).

---

## 13. Known Follow-ups / משימות המשך

1. Wire `db migrate` and friends to use `spawnSync` return codes for nicer summary output (currently inherits stdio straight through).
2. Replace the synthetic `webhook test` payload with a signed HMAC header once `src/webhooks/signing.js` lands.
3. Add a `onyx-cli completion <bash|zsh|fish>` generator once the command set stabilises.
4. Wire the `bin` field in `package.json` so `npm link` / `npm install -g` exposes `onyx-cli` on PATH (non-destructive, can land in a later PR without editing this file).
5. Add integration tests that actually spawn the bin in a temp cwd — useful for validating the shebang line on Linux runners.

---

## 14. Bilingual Help Quick Card / כרטיס עזרה מהיר

| Need | Command |
| --- | --- |
| I want to see everything / רוצה לראות הכל | `onyx-cli help` |
| System health / בריאות המערכת | `onyx-cli status` |
| Apply migrations / הרצת מיגרציות | `onyx-cli db migrate` |
| Seed demo data / טעינת נתוני דמו | `onyx-cli db seed` |
| Backup DB / גיבוי מסד נתונים | `onyx-cli db backup --out ./backups/2026-04.sql` |
| Restore DB / שחזור | `onyx-cli db restore ./backups/2026-04.sql --yes` |
| Create user / יצירת משתמש | `onyx-cli user create yossi@tku.co.il` |
| Reset password / איפוס סיסמה | `onyx-cli user reset-password yossi@tku.co.il` |
| Change role / שינוי תפקיד | `onyx-cli user role yossi@tku.co.il accountant` |
| Reprint invoice / הדפסה חוזרת | `onyx-cli invoice reprint INV-2026-00042` |
| Export invoices / יצוא | `onyx-cli invoice export 2026-04-01 2026-04-30` |
| Run payroll / הרצת שכר | `onyx-cli payroll run 2026-04 --yes` |
| Wage slip / תלוש | `onyx-cli payroll slip EMP-0042 2026-04` |
| Monthly VAT / מע"מ חודשי | `onyx-cli vat generate 2026-04` |
| PCN836 file / קובץ PCN836 | `onyx-cli vat pcn836 2026-04` |
| Tail log / צפייה בלוג | `onyx-cli logs tail --lines 200` |
| Search log / חיפוש בלוג | `onyx-cli logs search "VAT error"` |
| Flush cache / רענון מטמון | `onyx-cli cache flush --yes` |
| Warm cache / חימום מטמון | `onyx-cli cache warm` |
| List queue / הצגת תור | `onyx-cli queue list` |
| Retry job / החזרה לתור | `onyx-cli queue retry 42` |
| Purge queue / ניקוי תור | `onyx-cli queue purge --yes` |
| Test webhook / בדיקת webhook | `onyx-cli webhook test https://example.com/hook` |

---

**Rule honoured throughout:** לא מוחקים רק משדרגים ומגדלים.
