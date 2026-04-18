# GITHUB TRACE — Techno-Kol Uzi ERP 2026

| Field | Value |
|---|---|
| Generated | 2026-04-18 |
| Status | **placeholder** — populated in Phase 12 |
| Scope | Per-layer / per-domain commit trace with SHAs, branch, PR, CI results |
| Methods | `git log`, `git rev-parse HEAD`, `gh pr list`, `gh pr view --json`, `gh run list --json`, optional `mcp__github__list_commits` |
| Layers tracked | L1 … L10 (10 layers — one commit group per layer, one per domain inside) |

## Layer-per-commit ledger (template)

| layer | files_touched_planned | sha_range | branch | pr_url | ci_status | merge_time | tagged_release |
|---|---|---|---|---|---|---|---|
| L1 vision | wiring-spec.js, pipeline-engine.js, CLAUDE.md updates | pending | pending | pending | pending | pending | pending |
| L2 domains | `_master-registry/domains/*.md`, `enterprise_domain_map.json` | pending | pending | pending | pending | pending | pending |
| L3 models | `models_registry.json` fixes per D003/D009 | pending | pending | pending | pending | pending | pending |
| L4 fields | per-table audit output | pending | pending | pending | pending | pending | pending |
| L5 relationships | FK fixes, registry relationships | pending | pending | pending | pending | pending | pending |
| L6 flows | `workflow-flows.js`, `state-machines.js`, `orchestrator.js` | pending | pending | pending | pending | pending | pending |
| L7 pages | `App.tsx`, pages/* | pending | pending | pending | pending | pending | pending |
| L8 analytics | dashboards, reports wiring | pending | pending | pending | pending | pending | pending |
| L9 permissions | `permissions_registry.json`, RLS migrations | pending | pending | pending | pending | pending | pending |
| L10 runtime | migrations, Dockerfile, CI, k8s | pending | pending | pending | pending | pending | pending |

## Domain-per-commit ledger (13 rows)

| domain | sha_range | layers_covered | pr_url | status |
|---|---|---|---|---|
| commercial | pending | L2,L3,L6,L7 | pending | pending |
| execution | pending | L2,L3,L6,L7 | pending | pending |
| procurement | pending | L2,L3,L6,L7 | pending | pending |
| inventory | pending | L2,L3,L7 | pending | pending |
| finance | pending | L2,L3,L7,L8,L9 | pending | pending |
| workforce | pending | L2,L3,L7,L9 | pending | pending |
| docs | pending | L2,L3,L7 | pending | pending |
| intelligence | pending | L2,L3,L6,L8 | pending | pending |
| governance | pending | L2,L3,L9,L10 | pending | pending |
| analytics | pending | L2,L3,L8 | pending | pending |
| orchestration | pending | L2,L3,L6 | pending | pending |
| comms | pending | L2,L3,L7 | pending | pending |
| public_shared_support | pending | L2,L3 | pending | pending |

## Release tags

| tag | meaning | phase |
|---|---|---|
| v2.0.0-rc1 | Phase 11 deployment gate pass | post-Phase-11 |
| v2.0.0-rc2 | Phase 13 integrity audit pass | post-Phase-13 |
| v2.0.0 | Phase 15 enterprise lock | post-Phase-15 |

## CI requirements per layer commit

- `pnpm run build` green
- `pnpm run test` green
- `pnpm run lint` clean
- Supabase migration-apply dry-run green
- No hook skipped (`--no-verify` forbidden per project rules)

## Exit criteria for Phase 12

- [ ] all 10 layers committed with green CI
- [ ] all 13 domains visible in commit trail
- [ ] 0 pending PRs on `master`
- [ ] `BUILD_FINAL_STATUS.json.github_counts.layers_committed == 10`
- [ ] `final_state_locked == true` only after Phase 15

## Traceability rule

Every B-task id in `BUILD_TASK_BOARD.md` MUST end with the SHA that closed it. Every B-D decision MUST record the SHA of the commit that enacted it.
