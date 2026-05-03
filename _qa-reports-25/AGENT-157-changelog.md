# AGENT-157 — CHANGELOG Audit

**Date:** 2026-04-29
**Branch:** claude/objective-merkle-40ff93
**Scope:** `CHANGELOG.md` vs `git log --oneline -30`

---

## Verdict

**STALE.** The CHANGELOG is materially out of date. It documents work up through `[1.1.0] — 2026-04-17` only. Of the last 30 commits on the branch, **only the bottom 4–5 are reflected** in the CHANGELOG. The remaining ~25 commits — including 11 days of intensive Phase-1b/Phase-2/Phase-3/Phase-11/Phase-18/Phase-19 work, a full security hardening pass, and the delivery/bundling milestones — are **not documented**.

---

## CHANGELOG state

`CHANGELOG.md` (52 lines) contains exactly two entries:

1. **`[1.1.0] — 2026-04-17`** — Major Feature Release (mobile app, security hardening, reports dashboard, BOM calculator, exec dashboard, etc.)
2. **`[1.0.0] — 2026-04-17`** — Initial Production Release (4 services, 13-stage pipeline, 16 entities, 9×360 pages, AI assistants)

Both entries dated **2026-04-17** — 12 days before today (2026-04-29).
No entry exists for v1.2.x or any subsequent semver bump.

---

## Commits NOT documented in CHANGELOG (25 of 30)

| Commit  | Date       | Subject (truncated)                                              |
|---------|------------|------------------------------------------------------------------|
| 7a02049 | 2026-04-23 | feat(platform): Global Business Platform Dashboard (3000/3B)     |
| d48c31f | 2026-04-20 | feat(delivery): bundle 6,482 source files into 10 text parts     |
| 3e007bf | 2026-04-20 | feat(delivery): one-shot Replit downloader script                |
| 9bd9109 | 2026-04-20 | feat(delivery): 10 ZIPs of full project (~32MB)                  |
| a15be81 | 2026-04-20 | feat(audit): persist 4 SQL migrations + bundle delivery          |
| 216b016 | 2026-04-19 | docs(security): final comprehensive audit summary                |
| d09a6db | 2026-04-19 | fix(sec): RCE + command injection + SQLi hardening               |
| 06598a3 | 2026-04-18 | fix(perf+sec): DB perf hardening (migrations 00069-00071)        |
| 8efbf94 | 2026-04-18 | fix(sec+d031): harden 24 RLS policies + audit SQLi + VAT         |
| f8620fc | 2026-04-18 | feat(security): SQLi fixes + auth global mount + AR/AP canonical |
| 5521126 | 2026-04-18 | feat(phase-19): dead-menu-items migration 00067                  |
| 7562b5b | 2026-04-18 | feat(phase-18): +28 React routes auto-wired (1371->1425)         |
| ac76094 | 2026-04-18 | feat(audit): final 360 system audit + Hebrew presentation        |
| d9ac410 | 2026-04-18 | feat(phase-3): schema reconciliation + 9 migrations applied      |
| f6bf2c0 | 2026-04-18 | feat(phase-11): supabase apply helpers + partial migration       |
| 5551b78 | 2026-04-18 | feat(phase-2): workforce + inventory v2 — 13 domains complete    |
| 1098903 | 2026-04-18 | feat(phase-2): analytics + orchestration domains complete        |
| 2132811 | 2026-04-18 | feat(phase-2): comms domain (44 files, 3,300 LOC)                |
| 4065643 | 2026-04-18 | feat(phase-2): docs domain v2 (48 files, 3,527 LOC)              |
| af2838c | 2026-04-18 | feat(phase-2): governance mega batch (55+ files, 32 models)      |
| fc13c81 | 2026-04-18 | feat(phase-2): finance tight + docs + governance migrations     |
| 2f84e4e | 2026-04-18 | feat(phase-2): foundation safe fixes + procurement mega batch    |
| aaa90d5 | 2026-04-18 | feat(phase-2): execution mega batch + commercial                 |
| 1e0c902 | 2026-04-18 | feat(phase-2): commercial + execution + procurement (6 mig)      |
| 77734df | 2026-04-18 | feat(phase-1b): recovery package + 22 control files + VAT 18%    |

## Commits arguably reflected (5 of 30)

These map loosely to the existing v1.1.0 / v1.0.0 entries:

| Commit  | Subject                                                | CHANGELOG line |
|---------|--------------------------------------------------------|----------------|
| 689a22d | chore(release): v1.0.0 — update CHANGELOG, system stats| Whole file     |
| 63792fd | feat(kpi): executive dashboard, health score, KPI ticker| v1.1.0 lines 13–14 |
| 258e52d | feat(docs): document upload, contract generator        | v1.1.0 line 23 |
| 6d4b164 | Fix label formatting for operational expenses row      | not listed     |
| ca55893 | Update Dockerfile to use npm install instead of ci     | not listed     |

---

## Coverage gaps by theme

- **Security (HIGH):** 5 commits over 4 days (RLS policies, SQLi/RCE/command-injection hardening, auth global mount, audit SQLi). Zero CHANGELOG entries — significant for Palantir-grade ERP.
- **Phase-2 domain rollout:** 9 commits delivering finance, governance, docs, comms, analytics, orchestration, workforce, inventory, procurement, execution, commercial — all undocumented.
- **Phase-1b / Phase-3 / Phase-11 / Phase-18 / Phase-19:** 5 distinct phase commits including 9+ DB migrations applied, +28 React routes (1371 to 1425), recovery matrices, VAT 18% literal refactor.
- **Delivery/packaging:** 4 commits creating Replit-ready ZIPs and downloader script — not a feature but worth a note.
- **Platform Dashboard (most recent):** `7a02049` adds Global Business Platform Dashboard — top-of-tree feature, undocumented.

---

## Recommendations

1. **Add `[1.2.0] — 2026-04-29` entry** covering Phase-1b through Phase-19, security hardening, Platform Dashboard, and delivery bundles. Group under `### Added`, `### Security`, `### Fixed`, `### Migrations`.
2. **Bump version** in `package.json` files to match (the v1.0.0 release commit `689a22d` predates v1.1.0; verify `package.json` versions are aligned).
3. **Establish convention:** require CHANGELOG update in any commit touching `src/`, `migrations/`, or `pipeline/`. Could be enforced via a pre-commit hook listed in `.claude/settings.json`.
4. **Backfill the security entry now** — undocumented RCE/SQLi/RLS fixes are an audit/compliance liability for a Palantir-grade ERP.

---

**Files referenced:**
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\CHANGELOG.md`
