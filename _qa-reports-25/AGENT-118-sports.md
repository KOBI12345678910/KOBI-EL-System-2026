# AGENT-118 — Sports Domain Audit

**Agent:** 118
**Worktree:** `objective-merkle-40ff93`
**Branch:** `claude/objective-merkle-40ff93`
**Date:** 2026-04-29
**Scope:** `sports_clubs`, `sports_athletes`, `sports_training`, `sports_matches`; membership management, league management, scoring.

---

## 1. Verdict — DOMAIN ABSENT (FAIL)

**Severity: P0 — vertical does not exist as code in this repository.**

Exhaustive searches across every service tree
(`onyx-procurement/`, `techno-kol-ops/`, `payroll-autonomous/`, `onyx-ai/`,
`erp-app/`, `api-server/`, `dev/`, `supabase/migrations/`, `_merge-incoming/`)
returned **zero implementation files** for the Sports domain.

| Artifact required | Found? | Evidence |
|---|---|---|
| `sports_clubs` table CREATE statement | NO | not present in any of the 72 SQL migrations |
| `sports_athletes` table CREATE | NO | not present |
| `sports_training` table CREATE | NO | not present |
| `sports_matches` table CREATE | NO | not present |
| `onyx-procurement/src/sports/` module | NO | directory does not exist |
| Membership lifecycle (join/renew/cancel) | NO | no `membership.js`, no state machine |
| League management (seasons, divisions, fixtures) | NO | no `league.js`, no fixture generator |
| Scoring engine (results, standings, points) | NO | no `scoring.js`, no leaderboard |
| State machine for match / season / membership | NO | not in `pipeline/state-machines.js` |
| 360 page, route, action, event | NO | not in `pipeline/wiring-spec.js`, `entity-map.js`, `orchestrator.js` |
| `sports_domain_complete.sql` migration | NO | only 12 `*_domain_complete.sql` files exist (commercial, execution, procurement, inventory, finance, workforce, docs, intelligence, governance, analytics, orchestration, comms) |

The string `sports` does not appear in any `.sql`, `.js`, or `.ts` file under
`onyx-procurement/src/`, `techno-kol-ops/src/`, `payroll-autonomous/src/`,
`erp-app/src/`, or `api-server/src/`. All `sport`-substring hits are
coincidental matches to `transport`, `passport`, etc.

---

## 2. Where the table names DO appear

The four sports tables are **only** referenced inside
`_qa-reports-25/AGENT-09-db-integrity.md` as items in the multi-tenant
schema-gap inventory:

```
AGENT-09 §Index-issues #1   sports_athletes/clubs/matches.tenant_id (no index)
AGENT-09 §Tenant-issues #1  sports_training (no tenant_id column at all)
AGENT-09 Status table       sports listed among public.* domain prefixes
                            with always-true (USING (true)) RLS policies
```

This means: the **production Supabase project** (`ponypxhushxeskxgrmha`,
audited remotely by AGENT-09) contains the tables — but the **DDL is not
in this repository**. Schema drift is severe: prod tables exist with no
versioned source of truth here.

---

## 3. Membership management — ABSENT

Needed: state machine `prospect → active → suspended → expired → renewed/cancelled`;
renewal + dunning cycle; family/corporate/junior tiers; event
`membership.expired` consumed by access + AR; integration with `ar_invoices`
for dues and `gl_journal_entries` for revenue recognition.

`pipeline/state-machines.js` defines 13 state machines / 91 transitions —
none for `membership`, `athlete`, `club`. No `register_member`,
`renew_membership`, `suspend_member`, `cancel_membership` actions in
`orchestrator.js`. No `sports_*` entity mapping or 360 page contract in
`wiring-spec.js`.

---

## 4. League management — ABSENT

Needed: `season`, `division`, `fixture`, `round`, `venue_booking`,
`referee_assignment`, plus a fixture generator
(round-robin / knockout / double-elimination).

Searches for `league`, `season`, `fixture`, `round_robin`, `bracket`,
`tournament`, `playoff`, `referee` returned no scheduler, no
fixture algorithm, no calendar integration, no venue-conflict checker.
`pipeline-engine.js` has no sports stages. All `scoring` hits are
CRM `lead-scoring.js` and supplier `performance_score` — unrelated.

---

## 5. Scoring — ABSENT

Needed: `match_result`, `standing`, `points_table`, tiebreakers, head-to-head,
event-driven standings recompute on every result update.

No code for any of the above. No `match.completed` event in
`webhook-events.js`. No `recompute_standings` job in `jobs/`.
No `score_card` entity in `entity-map.js`.

---

## 6. Data points found in AGENT-09 (production-only)

Per AGENT-09 the following is true in **production only** (no repo source):

- `sports_athletes`, `sports_clubs`, `sports_matches`: have `tenant_id`
  columns but **no index** on `tenant_id` — every RLS evaluation will
  table-scan once tenant isolation is enforced.
- `sports_training`: has **no `tenant_id` column at all** — multi-tenant
  isolation is broken on this table.
- All four tables carry permissive `USING (true)` RLS policies — readable
  by every authenticated principal regardless of tenant.

---

## 7. Risk Assessment

| Risk | Severity | Note |
|---|---|---|
| Sports tables exist in prod DB but no DDL in repo | **CRITICAL** | Schema drift — environment cannot be recreated from source |
| `sports_training` missing `tenant_id` | HIGH | Per AGENT-09 — multi-tenant isolation broken on training records |
| `sports_athletes/clubs/matches.tenant_id` not indexed | HIGH | Per AGENT-09 — table-scan on every RLS evaluation once tenant guards land |
| Always-true RLS on all four tables | **CRITICAL** | Per AGENT-09 — any authenticated user reads every tenant's roster, fixtures, results |
| No membership lifecycle code | **CRITICAL** | Members cannot be billed, suspended, renewed, or aged |
| No league management code | **CRITICAL** | Seasons, fixtures, standings cannot be administered |
| No scoring engine | HIGH | Results cannot be recorded; no standings; no leaderboards |
| No 360 pages, routes, actions, events | **CRITICAL** | Violates "No Dead Pages Rule" in CLAUDE.md |
| No state machines | HIGH | Violates pipeline contract (entities must transition deterministically) |

---

## 8. Required Remediation (P0 — full vertical build)

Mirror the pattern of every completed vertical (`00043` through `00065`).

### Migrations

- `00076_sports_domain_complete.sql` — create `sports_clubs`,
  `sports_athletes`, `sports_training`, `sports_matches`, plus
  `sports_memberships`, `sports_seasons`, `sports_divisions`,
  `sports_fixtures`, `sports_match_events`, `sports_standings`.
  Every table: `tenant_id uuid NOT NULL` + FK + index.
- `00077_sports_menu_wiring.sql` — register Club360, Athlete360,
  Season360, Match360, Membership360 in `app_menu`.
- `00078_sports_rls_policies.sql` — tenant-scoped RLS, never
  `USING (true)`.
- `00079_sports_tenant_backfill.sql` — backfill `tenant_id` on
  existing prod rows (especially `sports_training`).

### Code (under `onyx-procurement/src/sports/`)

- `membership-engine.js` — join, renew, suspend, cancel + AR invoicing
- `league-engine.js` — season + division + round-robin / bracket fixture generator
- `scoring-engine.js` — result entry, standings recompute, tiebreakers
- `roster.js` — athlete eligibility (age, license, suspension) check
- `referee-scheduler.js` — referee assignment + conflict detection
- `venue-booking.js` — venue conflict resolution against fixtures

### Pipeline wiring

- 4 entities in `entity-map.js`: `sports_club`, `sports_athlete`,
  `sports_match`, `sports_membership`.
- 4 state machines in `state-machines.js`:
  `membership` (`prospect → active → suspended → expired`),
  `match` (`scheduled → live → final → ratified`),
  `season` (`planned → open → in_play → closed`),
  `athlete` (`registered → active → suspended → retired`).
- 1 workflow in `workflow-flows.js`:
  `Registration → Membership → Roster → Fixture → Match → Result → Standings → Renewal`.
- 8 actions in `orchestrator.js`: `register_athlete`,
  `enroll_member`, `generate_fixtures`, `record_result`,
  `recompute_standings`, `suspend_athlete`, `renew_membership`,
  `close_season`.

### 360 pages

`Club360`, `Athlete360`, `Match360`, `Season360`, `Membership360` —
each with header+status, primary actions, related records, audit log,
next recommended action.

---

## 9. Conclusion

The Sports domain is a **named-but-empty vertical**, identical in failure
mode to the Hotel domain (per AGENT-113). Production tables exist remotely
but the entire schema, RLS, business logic, membership lifecycle, league
management, scoring engine, state machines, and UI are missing from this
repository. Per `CLAUDE.md`'s "No Dead Pages Rule" and Master Flow contract,
this fails the audit on every dimension; AGENT-09 multi-tenant + RLS gaps
for the four sports tables are exploitable in production.

**Recommendation:** Build the vertical end-to-end, OR drop the four prod
tables and remove the prefix from the system inventory. The current
half-state (prod tables, no source) is the worst of both worlds.

**End of report — AGENT-118**
