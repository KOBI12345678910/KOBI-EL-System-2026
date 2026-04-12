# AG-X95 — DR Playbook Runner

**Agent:** X95 (Disaster Recovery automation)
**System:** Mega-ERP Techno-Kol Uzi / ONYX Procurement
**Date:** 2026-04-11
**Rule:** לא מוחקים, רק משדרגים ומגדלים. (We do not delete — we only upgrade and grow.)

---

## 1. What was built

A zero-dependency disaster recovery playbook runner that automates both DR drills and real failover procedures, with hard safety guards against destructive actions.

| File | Purpose |
|---|---|
| `src/dr/dr-runner.js` | `DRRunner` class, mini-YAML parser, step engine, postmortem generator |
| `dr/playbooks/db-primary-failover.yaml` | Seed playbook #1 — Postgres primary → replica promotion |
| `dr/playbooks/app-rollback.yaml` | Seed playbook #2 — roll back last application release |
| `dr/playbooks/data-restore.yaml` | Seed playbook #3 — restore tables from backup archive (integrates with Agent-X94) |
| `test/dr/dr-runner.test.js` | 34 unit tests — `node --test test/dr/dr-runner.test.js` |

All 34 tests pass, 0 failing.

```
ℹ tests 34
ℹ pass 34
ℹ fail 0
```

---

## 2. Public API

```js
const { DRRunner } = require('./src/dr/dr-runner');

const runner = new DRRunner({
  logger,          // { info, warn, error }
  verifiers: {},   // { name: async ({playbook, step, run}) => ({ok, message}) }
  sleeper,         // override for tests
  now,             // clock injection
  commandRunner,   // override shell execution
  httpClient,      // override HTTP client
  input, output,   // streams for manual-step TTY prompts
});

runner.loadPlaybook('dr/playbooks/db-primary-failover.yaml');
runner.loadPlaybookDir('dr/playbooks');
runner.listPlaybooks();

// DRILL — safe by default. dryRun:true is the default.
await runner.runDrill('db-primary-failover', {
  dryRun: true,           // DEFAULT — only prints what would happen
  allowCommand: false,    // shell commands skipped unless explicitly allowed
  allowDestructive: false // destructive steps skipped unless explicitly allowed
});

// FAILOVER — REFUSES without explicit confirmFailover flag
await runner.runFailover('db-primary-failover', {
  confirmFailover: true,  // REQUIRED — must be the boolean `true`, not 'yes'
  allowCommand: true      // default true in failover mode
});

// ROLLBACK — runs compensating actions in reverse order
await runner.rollback('db-primary-failover', {
  allowCommand: true
});

// STATUS — last run summary with RTO breach flag
runner.status('db-primary-failover');
// → { outcome, rtoMinutes, rtoActualMinutes, rtoBreached, message_he, message_en, ... }

// POSTMORTEM — bilingual Hebrew/English markdown template
const { markdown } = runner.postMortem(run.runId);
```

---

## 3. Playbook format spec

Playbooks are YAML files parsed by a vendored zero-dep mini-parser (reused from the Agent-X93 pattern). No `js-yaml` dependency added.

### 3.1 Top-level fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | unique identifier used in all runner calls |
| `name_he` | string | yes | Hebrew display name |
| `name_en` | string | yes | English display name |
| `description_he` | string | no | longer description |
| `description_en` | string | no | longer description |
| `rto_minutes` | number > 0 | yes | Recovery Time Objective target, in minutes |
| `rpo_minutes` | number >= 0 | yes | Recovery Point Objective window, in minutes |
| `steps` | list | yes | must contain at least one step |

### 3.2 Step fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | unique within the playbook |
| `description_he` | string | yes | shown in console |
| `description_en` | string | yes | shown in console |
| `type` | enum | yes | `command` / `http` / `wait` / `manual` / `verify` |
| `timeout_seconds` | number | no | defaults to 60 |
| `destructive` | boolean | no | step will be SKIPPED unless the run allows destructive actions |
| `compensating` | step-ish | no | step spec for undoing this step on failure or on `rollback()` |

### 3.3 Per-type fields

**command**
```yaml
type: command
command: "psql -c 'SELECT pg_promote()'"
shell: "/bin/sh"                          # optional override
```

**http**
```yaml
type: http
url: "http://localhost:3100/api/health"
method: GET                               # default GET
headers: { Authorization: "Bearer ..." }  # optional
body: "..."                               # optional
expectedStatus: 200                       # optional
expectedBodyRegex: "ok|healthy"           # optional
```

**wait**
```yaml
type: wait
seconds: 30
```

**manual**
```yaml
type: manual
# pauses run until operator types y / yes / כן on stdin
```

**verify**
```yaml
type: verify
verifier: replica-healthy
# looked up in runner.verifiers[name]
# must return { ok: true/false, message, detail }
```

### 3.4 Compensating actions

Every step can declare a `compensating:` block containing another step spec. On failure, executed steps are compensated in **reverse order**. The failing step is ALSO compensated (safer for partial side-effects such as "fence set but promote timed out").

`rollback(playbookId)` runs compensating actions for every step that has one, in reverse order, independent of any run.

---

## 4. Safety flags (hard guards)

| Flag | Default | Effect |
|---|---|---|
| `dryRun` on `runDrill` | `true` | nothing is executed — console prints what WOULD happen |
| `allowCommand` on `runDrill` | `false` | `command` steps are skipped (not failed) unless explicitly allowed |
| `allowDestructive` on `runDrill` | `false` | steps with `destructive: true` are skipped unless explicitly allowed |
| `confirmFailover` on `runFailover` | **required** | must be strictly `=== true` (no coercion) or the run is REFUSED with outcome `refused` |

### 4.1 Refusal semantics

`runFailover` without `confirmFailover:true` returns immediately with:
```
{ outcome: 'refused', reason: 'missing confirmFailover flag', steps: [] }
```

No shell command runs, no HTTP calls are made, no manual prompts appear. The refusal is also logged at `warn` level so operations teams see it in logs.

### 4.2 Dry-run annotations

In dry-run mode, destructive steps are STILL displayed — they get an inline `[DESTRUCTIVE — would require confirmFailover]` annotation so drills surface exactly what a real failover would touch.

### 4.3 Never-delete guarantee

The runner never mutates playbook files. A regression test (`never-delete rule: running a playbook must not modify its source file`) byte-compares the playbook before and after a drill + refused failover.

---

## 5. RTO / RPO tracking

Every run records:

| Field | Meaning |
|---|---|
| `rtoMinutes` | playbook's RTO target |
| `rpoMinutes` | playbook's RPO window |
| `rtoActualMinutes` | actual wall-clock duration of the run, in minutes |
| `rtoBreached` | `true` if `rtoActualMinutes > rtoMinutes` |
| `durationMs` | per-step duration in milliseconds |

`status(playbookId)` returns these fields along with a bilingual message so dashboards can show "RTO OK / RTO BREACHED" in either Hebrew or English. The `now` clock is injectable — tests drive RTO breaches deterministically via a fake clock (see `status: reports RTO breach when duration > target`).

Drill invocations also print a final coloured banner:
```
[dr] SUCCESS — duration 0.28 min (target 30) RTO OK
```

Colours use `src/cli/ansi.js` which respects `NO_COLOR` / `ONYX_NO_COLOR` and auto-disables on non-TTY stdout so logs stay clean.

---

## 6. Seed playbooks

### 6.1 `db-primary-failover.yaml` — 8 steps, RTO 30 min, RPO 5 min

Promotes the standby PostgreSQL replica to primary when the Supabase-hosted primary is unreachable.

| # | Step | Type | Destructive |
|---|---|---|---|
| 1 | preflight-replica-health | verify | no |
| 2 | capture-lag | http | no |
| 3 | fence-primary | manual | **yes** |
| 4 | promote-replica | command | **yes** |
| 5 | reconfigure-app | manual | **yes** |
| 6 | smoke-test-reads | http | no |
| 7 | smoke-test-writes | verify | no |
| 8 | notify-stakeholders | manual | no |

### 6.2 `app-rollback.yaml` — 10 steps, RTO 15 min, RPO 0

Reverts the latest deploy when a critical regression is detected. Every revertible step has a compensating action that can re-apply the new release.

### 6.3 `data-restore.yaml` — 10 steps, RTO 120 min, RPO 1440 min

Restores tables from the most recent backup archive produced by Agent-X94 (`scripts/backup.js` + `scripts/backup-restore.js`). The `restore-production` step is marked destructive and requires explicit failover confirmation. All writes use the upsert-by-PK path — no `TRUNCATE`.

---

## 7. Test coverage

`test/dr/dr-runner.test.js` — 34 tests, 0 failing, runs in ~1.2s.

Coverage matrix:

| Area | Tests |
|---|---|
| YAML parser | scalars, nested sequences-of-mappings, comment stripping, URL colons, tab rejection, compensating nesting (6 tests) |
| Playbook validation | missing id, invalid rto, unknown step type, duplicate ids, step-type enum (5) |
| Seed-playbook load | `loadPlaybookDir` parses all 3 seed playbooks + `listPlaybooks` summary (2) |
| Dry-run safety | never calls `commandRunner`/`httpClient`, destructive steps annotated (2) |
| Failover refusal | no flag refuses, non-`true` truthy values refuse, `confirmFailover:true` executes destructive command (3) |
| Step timeout | unresolved command times out and fails (1) |
| Compensating actions | reverse-order compensation of executed steps including the failing one (1) |
| `rollback()` | runs compensations in reverse order, warns when no compensations exist (2) |
| `postMortem()` | bilingual markdown, prefilled, throws on unknown runId (2) |
| `status()` | never-run state, RTO breach detection via fake clock (2) |
| Manual step | operator `y` continues, operator `n` fails and compensates (2) |
| HTTP step | bad status fails, body regex mismatch fails (2) |
| Verify step | known verifier succeeds, unknown verifier fails (2) |
| Command guard | `command` step skipped without `allowCommand:true` (1) |
| Never-delete rule | playbook file byte-identical after drill + refused failover (1) |

---

## 8. Hebrew glossary — מילון מונחים

| Hebrew | English | Technical meaning |
|---|---|---|
| תרגיל שחזור מאסון | DR drill | rehearsed execution of a recovery playbook without touching production |
| מעבר (פיילאובר) | failover | actual execution of a recovery playbook against live production |
| שחזור | recovery / restore | returning the system to a known good state |
| יעד זמן התאוששות | RTO (Recovery Time Objective) | maximum acceptable downtime per incident |
| יעד נקודת התאוששות | RPO (Recovery Point Objective) | maximum acceptable data loss measured in time |
| רפליקה | replica | standby Postgres that follows the primary |
| קידום | promotion | changing a replica to primary |
| גידור | fencing | blocking writes to an old primary so it cannot compete |
| ריצה יבשה | dry run | execute in describe-only mode, no side effects |
| פעולה מפצה | compensating action | undo step that reverts the effect of a previous step |
| גלגול אחורה | rollback | sequence of compensating actions |
| ניתוח post-mortem | postmortem | structured analysis after an incident |
| צעד הרסני | destructive step | step that is irreversible without compensation |
| אישור מפורש | explicit confirmation | the `confirmFailover:true` flag required for real failover |
| חריגה מיעד | RTO breach | run duration exceeded `rto_minutes` target |
| פער שכפול | replication lag | delay between primary and replica in seconds |

---

## 9. How to run

```bash
# Load all 3 seed playbooks and list them
node -e "const {DRRunner}=require('./src/dr/dr-runner'); const r=new DRRunner(); r.loadPlaybookDir('dr/playbooks'); console.log(r.listPlaybooks());"

# Dry-run a drill (safe — no side effects)
node -e "(async()=>{const {DRRunner}=require('./src/dr/dr-runner'); const r=new DRRunner(); r.loadPlaybookDir('dr/playbooks'); await r.runDrill('db-primary-failover',{dryRun:true});})();"

# Run the test suite
node --test test/dr/dr-runner.test.js
```

A real failover must be driven from an operator script that intentionally passes `confirmFailover:true` — there is no CLI flag that can leak that accidentally.

---

## 10. Integration notes

- **Agent-X94 (backups)** — `data-restore.yaml` wires `scripts/backup.js` + `scripts/backup-restore.js` as command steps. Checksum verification happens inside those scripts, not inside the runner.
- **Agent-02 / DR_RUNBOOK.md** — the existing runbook text is preserved. This runner AUTOMATES the procedures the runbook describes; it does not replace the runbook as documentation.
- **ops/health-check.js** — `http` verification steps in `db-primary-failover.yaml` and `app-rollback.yaml` target existing health endpoints so drills exercise real probes.
- **cli/ansi.js** — colour output reuses the existing CLI helpers instead of introducing chalk or similar.
- **cli/prompt.js** — manual-step confirmation uses the same TTY pattern (readline + bilingual y/כן) as the CLI prompt module.

---

## 11. Destructive-action guarantees — summary

1. `runDrill` defaults to `dryRun:true`. Nothing runs unless the caller explicitly opts out.
2. `runFailover` requires `confirmFailover:true`. Any other value — including `'true'`, `1`, `'yes'` — returns a `refused` run with zero side effects.
3. `command` steps require `allowCommand:true` when actually executing.
4. `destructive:true` steps require `allowDestructive:true` OR a confirmed `runFailover`.
5. Failing steps trigger reverse-order compensation of ALL executed steps, not just the ones before the failure.
6. Playbook files are read-only from the runner's perspective — a regression test verifies byte-identity.
7. `DR_RUNBOOK.md`, `scripts/backup-restore.js`, and existing seed files are **not modified** by this change.

_לא מוחקים, רק משדרגים ומגדלים._
