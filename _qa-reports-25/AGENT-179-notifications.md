# AGENT-179 — In-App Notifications Audit

**Agent**   : 179
**System**  : Techno-Kol Uzi mega-ERP 2026
**Date**    : 2026-04-29
**Worktree**: `.claude/worktrees/objective-merkle-40ff93`
**Reference**: `_qa-reports/AG-X16-notification-center.md`

---

## Scope

Audit the in-app notification stack:

- `notification_preferences` table (1 row in default JSONL store)
- `platform_notifications` (status — table not yet split out)
- read receipts, channels (push/email/sms/whatsapp/in_app), per-user prefs,
  opt-out, throttling, quiet hours, digest mode, fallback chain.

---

## Inventory — implementation files

| Path | Role | Lines |
|------|------|------:|
| `onyx-procurement/src/notifications/notification-types.js` | 24-type registry, priority + channel defaults, `render()` interpolator | 403 |
| `onyx-procurement/src/notifications/notification-preferences.js` | v1 prefs class — channels, quiet hours, freq cap, type overrides, Supabase + JSONL | 424 |
| `onyx-procurement/src/notifications/preference-manager.js` | v2 prefs (X-16) — per-category DND, Shabbat, digest, fallback chain | 546 |
| `onyx-procurement/src/notifications/notification-history.js` | Inbox + audit log, `markRead`, JSONL + Supabase | 304 |
| `onyx-procurement/src/notifications/notification-queue.js` | FIFO retry queue, exponential backoff, DLQ | 100+ |
| `onyx-procurement/src/notifications/notification-service.js` | Orchestrator — resolveChannels, rate-limits, dispatch, drainQueue | 407 |
| `onyx-procurement/src/notifications/notification-routes.js` | Express router — 7 endpoints | 175 |
| `payroll-autonomous/src/components/NotificationCenter.jsx` | Bell + dropdown UI, RTL Hebrew, Palantir theme | ~1010 |
| `lib-client/db/drizzle/0004_notification_system.sql` | Drizzle migration, separate `notification_preferences` | 41 |
| `lib-client/db/src/schema/notification-preferences.ts` | Drizzle schema | 14 |
| `api-server/src/routes/intelligent-notifications.ts` | Hub layer with 4 SQL tables (channels, queue, digest, prefs) | 80+ |
| `supabase/migrations/00010_enterprise_expansion_30_tables.sql` | `governance.user_preferences.notification_preferences jsonb` (line 333) | — |

Tests:
- `onyx-procurement/test/payroll/preference-manager.test.js` — **21/21 PASS** (X-16 v2)
- `onyx-procurement/src/notifications/notification-service.test.js` — **25/31 PASS, 6 FAIL** (v1)

---

## Channels matrix

| Channel | Adapter | Default for INFO | Default for NORMAL | Default for HIGH | Default for CRITICAL |
|---------|---------|:---:|:---:|:---:|:---:|
| `email`    | `./emails` (Agent-73) | YES (only) | YES | YES | YES (if enabled) |
| `whatsapp` | `./whatsapp` (Agent-74) | no | per-type | per-type | optional |
| `sms`      | `./sms` (Agent-75) | no | per-type | per-type | FORCED |
| `push`     | internal stub → `data/notification-push.jsonl` | no | per-type | per-type | FORCED |
| `in_app`   | always — `notification-history` sink | YES | YES | YES | YES |

INFO priority is email + in_app only. CRITICAL forces sms+push+in_app and adds email when enabled — bypasses prefs.

---

## Database schema state

**v1 (onyx-procurement, runtime-managed)**
- `notification_preferences` — PK user_id, columns `channels jsonb`, `quiet_hours jsonb`, `timezone`, `frequency_cap int`, `type_overrides jsonb`, `updated_at`. SQL exposed via `migrationSql()` — must be applied manually.
- `notification_history` — PK id, indexes on `(user_id, created_at DESC)` and partial index `WHERE read_at IS NULL`. `read_at` timestamp drives read receipts.

**v2 (lib-client/drizzle 0004)**
- `notifications` — gets new columns: `user_id`, `priority`, `category`, `action_url`, `metadata`, `archived_at`. Three composite indexes on `(user_id, ...)`.
- `notification_preferences` — surrogate `id serial`, `(user_id, category)` UNIQUE, `enabled bool`, `min_priority text`. Different shape than v1 — **schema drift**.

**Hub (api-server/intelligent-notifications)**
- `notification_channels`, `notification_preferences` (third shape: per `module/event_type` with `frequency`, `muted_until`, `priority_threshold`, `quiet_hours_start/end`), `notification_queue`, `notification_digest`. **Same name, third schema.**

**Governance (supabase/00010)**
- `governance.user_preferences.notification_preferences jsonb` — flat blob on the user-profile row.

`platform_notifications` — **NOT IMPLEMENTED** as a discrete table anywhere in the worktree (grep returned zero matches). The platform-wide inbox role is filled today by `notification_history` (v1) and the new `notifications` table (v2).

---

## Per-user preferences — what is stored

### v1 (notification-preferences.js)
```
channels:        { email, whatsapp, sms, push, in_app: bool }
quietHours:      { enabled, start 'HH:MM', end 'HH:MM' }
timezone:        'Asia/Jerusalem'
frequencyCap:    30 non-critical/hour
typeOverrides:   { [typeId]: false }   // mute single type
```
JSONL fallback at `data/notification-preferences.jsonl` — last-write-wins replay.

### v2 (preference-manager.js — Agent X-16)
```
timezone, digestMode ('none'|'hourly'|'daily'), digestCategories[],
channelFallback: [whatsapp, sms, email, in_app],
categories: { invoice|payment|alert|system|approval|default: {
  channels: [...], dnd: { enabled, start, end, days[], shabbat }
}}
```
JSONL at `data/notification-preferences-v2.jsonl`. Shabbat = Friday 18:00 → Saturday 20:00 local heuristic. Wrap-around DND windows handled.

The "1 row" referenced in the prompt corresponds to a single-user profile (default `kobi@technokoluzi…`) — currently no JSONL store exists on disk under either path; in-memory defaults are returned for unknown users, so production is running on defaults today.

---

## Read receipts

- v1: `markRead(id)` sets `read_at` timestamp on the in-memory record AND on the Supabase row when present, AND appends a `mark_read` event to JSONL. Replayed on boot. Endpoint: `POST /api/notifications/:id/read`.
- v2 (drizzle): `is_read` boolean + `archived_at` separation — better suited for soft-archive.
- UI: `NotificationCenter.jsx` auto-marks read on click + has explicit "Mark all read" header button. Unread blue dot (`unreadDot`).

---

## Opt-out paths

| Mechanism | Layer | Granularity |
|-----------|-------|-------------|
| `prefs.channels[ch] = false` | v1 channel boolean | global |
| `prefs.typeOverrides[typeId] = false` | v1 per-type | per type id |
| `prefs.categories[cat].channels = []` | v2 per-category | per category |
| `prefs.categories[cat].channels = ['disabled']` | v2 sentinel | per category |
| `prefs.digestMode != 'none' + digestCategories` | v2 | batches non-critical |
| `quietHours` / `dnd` window | v1+v2 | time-based suppression |
| `min_priority` (drizzle schema) | v2 schema | priority floor |

CRITICAL severity bypasses ALL opt-out paths in both v1 (`shouldDeliver` early-return) and v2 (`resolveChannels` short-circuit) — confirmed by test cases 07 (v2) and the v1 `critical_override` test.

---

## Throttling

| Limiter | Source | Default | Bypass |
|---------|--------|---------|--------|
| Per-type `throttleSec` | `notification-types.js` | 0–86400s by type | CRITICAL |
| `frequencyCap` | per-user prefs | 30/hour | HIGH + CRITICAL |
| Queue retry backoff | `notification-queue.js` | 1s, 5s, 30s, 2m, 10m, 1h | — |
| `notification_channels.rate_limit_per_minute` (hub) | DB column | 60/min | — |
| `notification_channels.daily_quota` (hub) | DB column | 1000/day | — |

`countRecent(userId, 60*60*1000)` walks the per-user index newest-first, breaks on cutoff, excludes critical.

---

## API surface

```
GET    /api/notifications                 unread inbox (limit≤500)
GET    /api/notifications/history         paged history (limit≤1000)
POST   /api/notifications/:id/read        mark read
GET    /api/notifications/preferences     read prefs (user resolved from actor/header/query)
POST   /api/notifications/preferences     upsert prefs (deep-merge)
POST   /api/notifications/send            internal emit
GET    /api/notifications/types           registry
GET    /api/notifications/stats           queue/history/adapter snapshot
```

User identity resolved via `req.actor.user > x-user-id header > query.userId > body.userId`.

---

## Issues found

1. **Three competing `notification_preferences` schemas** (v1 jsonb, v2 row-per-category, hub row-per-event) — same table name, drift. Pick one and document migration path. **Severity: HIGH**
2. **`platform_notifications` table absent** — referenced in prompt but only `notification_history` / `notifications` exist. Either rename one, or create a true platform-wide table. **Severity: MEDIUM**
3. **6 failing tests in `notification-service.test.js`**:
   - `preferences: shouldDeliver — info is email-only` — fails at runtime when current Asia/Jerusalem time is inside the default 22:00→07:00 window (INFO priority does NOT bypass quiet hours, but the test does not freeze time). **Real bug or flaky test — needs `useFakeTimers` or a `nowDate` injection.**
   - `service: adapter failure enqueues for retry`, `drainQueue processes retries in batches`, `queueOnly flag defers dispatch`, two `routes:` tests — all pull `notification-routes.js` which `require('express')`; Express is not in `onyx-procurement/package.json`. **Severity: HIGH** (CI green claim is misleading).
4. **No persisted JSONL stores on disk** under either `data/notification-preferences*.jsonl` path — production is running on baked-in defaults; no audit replay possible until a `set()` call is made.
5. **v1 quiet-hours `nowDate` branch** uses UTC instead of timezone-local minutes — a Date passed in skews the calculation by the local offset (3h for Jerusalem). Code path at `notification-preferences.js:165–167`. **Severity: LOW** (not exercised by REST callers; unit-test hazard only).
6. **Frequency cap window** counts on the in-memory `_recent` map only — restart loses the counter until JSONL replay populates it, allowing burst.
7. **Channel fallback** (v2) delivers on the FIRST available channel only — by design but worth surfacing in admin UI.

---

## Verdict

In-app notifications are wired end-to-end (registry → prefs → routing → dispatch → queue → history → UI bell). v2 (preference-manager.js) is the recommended path going forward — DND/Shabbat/digest/fallback cleanly modelled, 21/21 tests pass.

Blocking gaps before "Palantir-grade" status:
- consolidate the three `notification_preferences` schemas onto one canonical source;
- decide whether `platform_notifications` is a synonym for `notifications` or a new table;
- fix the 6 failing tests in `notification-service.test.js` (express dep + time-frozen INFO test);
- emit at least one real preference row to the JSONL/DB store so the system has a non-default baseline for the demo.
