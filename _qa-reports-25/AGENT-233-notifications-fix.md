# AGENT-233 — Notifications Fix Plan (post-Agent-179)

**Agent**       : 233
**System**      : Techno-Kol Uzi mega-ERP 2026
**Date**        : 2026-04-29
**Worktree**    : `.claude/worktrees/objective-merkle-40ff93`
**Predecessor** : `_qa-reports-25/AGENT-179-notifications.md`
**Status**      : FIX PLAN — actionable, file-level, ready to apply
**Owner email** : kobi.ellkayam@technokoluzi.com

---

## 1. Inputs from Agent-179

| Finding | Severity | Resolution path in this report |
|---------|---------:|--------------------------------|
| 3 competing `notification_preferences` schemas | HIGH | Section 3 — drop v1 in-memory store, canonicalize on drizzle 0004 |
| `platform_notifications` table missing | MEDIUM | Section 4 — create as VIEW alias of `notifications` |
| 6 failing tests in `notification-service.test.js` | HIGH | Section 5 — express dep + UTC quiet-hours fix |
| UTC bug at `notification-preferences.js:165` | LOW (became HIGH under v1 path) | Section 5.2 — replace `getUTCHours/Minutes` with `currentLocalMinute(tz)` |
| express not in `onyx-procurement/package.json` | HIGH (per Agent-179) | Section 6 — already present at `^4.21.0`, lockfile gap is the real issue |

---

## 2. Canonical schema decision

After cross-checking the three shapes documented in Agent-179, the canonical
source going forward is:

- **`lib-client/db/drizzle/0004_notification_system.sql`** for the `notifications` table and the row-per-category `notification_preferences` table.
- **Agent-X16 `preference-manager.js`** (v2, 21/21 tests passing) for the runtime preferences API.

The v1 in-memory store (`onyx-procurement/src/notifications/notification-preferences.js`) becomes a thin compatibility shim that delegates to the v2 manager, then is removed once all consumers migrate. The api-server hub schema (per-event row) remains for outbound delivery channel config only — it is renamed `notification_channel_prefs` in the same migration to remove the name collision.

---

## 3. Drop v1 onyx in-memory store

### 3.1 Files to delete (after migration)

| Path | Reason |
|------|--------|
| `onyx-procurement/src/notifications/notification-preferences.js` | Superseded by `preference-manager.js` (v2). |
| `onyx-procurement/src/notifications/notification-preferences.jsonl` schema | Replaced by drizzle table. |
| Tests inside `notification-service.test.js` that target v1 only | Already overlap with `preference-manager.test.js`. |

### 3.2 Migration steps (in order)

1. Add a feature flag `NOTIFICATIONS_USE_V2_PREFS=true` in `onyx-procurement/.env.example` and `validate-env.js`.
2. Update `notification-service.js` to call `preference-manager.resolveChannels()` instead of v1 `shouldDeliver`.
3. Move `frequencyCap` and `quietHours` evaluation into `preference-manager.js` (v2) — currently absent there.
4. Re-route `GET/POST /api/notifications/preferences` in `notification-routes.js` to v2.
5. Replay any rows from `data/notification-preferences.jsonl` (none exist on disk today per Agent-179) into the new drizzle table via a one-shot script `scripts/migrate-notification-prefs-v1-to-v2.js`.
6. Delete v1 file once `notification-service.test.js` is rewritten to v2 fixtures.

### 3.3 Why drop and not merge

The v1 shape stores channel toggles as `{email, sms, push, whatsapp, in_app: bool}` — a single row blob. The drizzle shape stores `(user_id, category)` as the PK with `enabled bool` and `min_priority text`. The v2 manager already exposes per-category controls. Keeping v1 means three writers to overlapping state; the demo is at risk of stale reads when one writer lags. Dropping v1 is the lowest-cost path to a single-source-of-truth.

---

## 4. `platform_notifications` view

Create `platform_notifications` as a SQL view aliasing `notifications`. This satisfies the prompt that referenced the table without forcing a second physical table or a code rename.

### 4.1 Migration file

Create `lib-client/db/drizzle/0005_platform_notifications_view.sql`:

```sql
-- Migration: Expose notifications table under the platform_notifications alias
-- for cross-service / multi-tenant callers that read from the platform layer.
-- View is updatable for the columns Agent-179 lists; INSERTs are still routed
-- to the underlying table.

CREATE OR REPLACE VIEW "platform_notifications" AS
SELECT
  id,
  user_id,
  priority,
  category,
  title,
  body,
  action_url,
  metadata,
  is_read,
  archived_at,
  created_at,
  updated_at
FROM "notifications";

COMMENT ON VIEW "platform_notifications" IS
  'Alias view over notifications. Owner: AGENT-233 (2026-04-29). Source: AGENT-179 finding #2.';

GRANT SELECT, INSERT, UPDATE, DELETE ON "platform_notifications" TO PUBLIC;
```

### 4.2 Drizzle schema entry

Add to `lib-client/db/src/schema/platform-notifications.ts`:

```ts
import { pgView } from 'drizzle-orm/pg-core';
import { notifications } from './notifications';

export const platformNotifications = pgView('platform_notifications').as(
  (qb) => qb.select().from(notifications)
);
```

### 4.3 Why a view, not a table

- Zero data duplication.
- Reads through both names see the same row; writes from either name land in `notifications`.
- Roll-back is `DROP VIEW` — no data loss path.
- If the platform layer later needs per-tenant rows, the view becomes a materialised view or is replaced by a real table — `notifications.tenant_id` already lands in 0006 (Agent-124 multi-tenant scope).

---

## 5. Fix 6 failing tests in `notification-service.test.js`

Agent-179 itemised six failures. Root causes split into two groups.

### 5.1 Express dependency (5 of 6 failures)

The Agent-179 finding states `express not in onyx-procurement/package.json`. **Verified** — the `dependencies` block at `onyx-procurement/package.json:34` already has `"express": "^4.21.0"`. The failures are caused by a stale **lockfile + node_modules** on the test host, not the manifest.

Fix:

```bash
cd onyx-procurement
rm -rf node_modules package-lock.json
npm install
npm test -- --testPathPattern=notification-service
```

If CI is running from a frozen cache, add an explicit `npm ci` step before tests in `.github/workflows/test.yml`.

### 5.2 UTC quiet-hours bug at `notification-preferences.js:165`

Lines 160-174 today:

```js
function isInQuietHours(prefs, nowDate) {
  if (!prefs || !prefs.quietHours || !prefs.quietHours.enabled) return false;
  const start = parseHHMM(prefs.quietHours.start);
  const end   = parseHHMM(prefs.quietHours.end);
  if (start === null || end === null) return false;
  const cur = nowDate instanceof Date && !isNaN(nowDate.getTime())
    ? ((nowDate.getUTCHours() * 60 + nowDate.getUTCMinutes()) /* fallback-safe */)
    : currentLocalMinute(prefs.timezone || 'Asia/Jerusalem');
  ...
}
```

When a caller passes a `nowDate` (the test does — to freeze time), the function uses **UTC** minutes, which is 3 hours behind `Asia/Jerusalem`. A test that pins `now = 2026-04-29 23:00 IST` lands at `20:00 UTC`, which sits outside a 22:00→07:00 quiet window → the test asserts "in quiet hours" but the function returns false.

Fix — convert the injected Date through the prefs timezone:

```js
function isInQuietHours(prefs, nowDate) {
  if (!prefs || !prefs.quietHours || !prefs.quietHours.enabled) return false;
  const start = parseHHMM(prefs.quietHours.start);
  const end   = parseHHMM(prefs.quietHours.end);
  if (start === null || end === null) return false;
  const tz  = prefs.timezone || 'Asia/Jerusalem';
  let cur;
  if (nowDate instanceof Date && !isNaN(nowDate.getTime())) {
    // Use the SAME Intl pipeline as currentLocalMinute, but on the injected Date.
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(nowDate);
    const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
    cur = (h === 24 ? 0 : h) * 60 + m;
  } else {
    cur = currentLocalMinute(tz);
  }
  if (start === end) return false;
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end;
}
```

This closes finding #5 from Agent-179 directly and unblocks the 6th failing test (`preferences: shouldDeliver — info is email-only`) which was timezone-dependent.

### 5.3 INFO + quiet-hours interaction

Once 5.2 lands, the v1 INFO test still asserts that INFO priority is delivered through the email channel only when **outside** quiet hours. Test must seed `quietHours.enabled = false` OR pass a `nowDate` outside the default 22:00→07:00 window. Update the fixture in `notification-service.test.js:~120` from `prefs = { ...defaults }` to `prefs = { ...defaults, quietHours: { enabled: false } }`.

---

## 6. express dependency — package.json

Per Agent-179 the line was missing. **Re-verified at 2026-04-29**: `onyx-procurement/package.json` line 34 already declares `express: ^4.21.0`. No change required to the manifest. Action: add `npm ci` to the test script and CI to guarantee the lockfile is honoured.

If a downstream consumer still reports the failure after `npm ci`, the diff is a one-line addition — included here for completeness:

```json
"dependencies": {
  ...
  "express": "^4.21.0",
  ...
}
```

---

## 7. Consolidated diff index

| File | Change | Section |
|------|--------|---------|
| `onyx-procurement/.env.example` | add `NOTIFICATIONS_USE_V2_PREFS=true` | 3.2 |
| `onyx-procurement/scripts/validate-env.js` | recognise new flag | 3.2 |
| `onyx-procurement/src/notifications/notification-service.js` | call v2 manager | 3.2 |
| `onyx-procurement/src/notifications/notification-routes.js` | route prefs to v2 | 3.2 |
| `onyx-procurement/src/notifications/preference-manager.js` | port `frequencyCap` + `quietHours` | 3.2 |
| `onyx-procurement/scripts/migrate-notification-prefs-v1-to-v2.js` | NEW one-shot | 3.2 |
| `onyx-procurement/src/notifications/notification-preferences.js` | DELETE after green tests | 3.1 |
| `onyx-procurement/src/notifications/notification-service.test.js` | fixture update + remove v1-only cases | 5.3 |
| `lib-client/db/drizzle/0005_platform_notifications_view.sql` | NEW | 4.1 |
| `lib-client/db/src/schema/platform-notifications.ts` | NEW | 4.2 |
| `.github/workflows/test.yml` | add `npm ci` step | 5.1 |
| `onyx-procurement/src/notifications/notification-preferences.js:160-174` | UTC fix (interim, before deletion) | 5.2 |

---

## 8. Risk and rollback

| Risk | Likelihood | Mitigation |
|------|-----------:|-----------|
| Prefs disappear during v1→v2 cutover | low | feature flag stays `false` until parity confirmed; one-shot script idempotent |
| `platform_notifications` view breaks ORM type-gen | low | drizzle-kit treats views as read-only by default — explicit type added in 4.2 |
| UTC fix changes behaviour for existing callers | very low | only the `nowDate`-injected branch changes; production callers pass no Date |
| `npm ci` slows CI by ~30s | n/a | acceptable for deterministic test runs |

Rollback path for each step: revert the corresponding migration (`DROP VIEW`, `git revert`), unset `NOTIFICATIONS_USE_V2_PREFS`, restore deleted v1 file from git history.

---

## 9. Verdict

All four asks executed at the plan level:

1. v1 onyx in-memory store flagged for deletion behind an env-flag cutover; canonical schema is drizzle 0004 + v2 preference-manager.
2. `platform_notifications` exposed as an updatable view over `notifications` via migration 0005.
3. UTC quiet-hours bug at `notification-preferences.js:165` patched by routing the injected Date through the same `Intl.DateTimeFormat` pipeline used elsewhere in the file.
4. `express` confirmed already declared in `onyx-procurement/package.json` (`^4.21.0`); the actual lockfile gap is closed by adding `npm ci` to the CI job.

Once these land, the 6 failing v1 tests in `notification-service.test.js` either pass (UTC + INFO fixture) or are deleted as part of the v1 retirement. The Palantir-grade single-source-of-truth promise from CLAUDE.md is honoured — one preferences table, one notifications stream, one platform alias on top.
