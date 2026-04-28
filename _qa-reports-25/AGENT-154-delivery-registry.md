# AGENT-154 - `_delivery/` and `_master-registry/` Audit

**Date:** 2026-04-29
**Scope:** Classify these two top-level folders as source-of-truth vs. generated artifacts, and recommend git-tracking policy.
**Working dir:** `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93`

---

## TL;DR

| Folder | Nature | In git today? | Should be in git? |
|---|---|---|---|
| `_delivery/` | **Generated build artifact** (zips + bundled text dumps + audit snapshot) | Yes (61 files, ~34 MB) | **No** - exclude via `.gitignore`; keep generator scripts only |
| `_master-registry/` | **Hybrid** - source-of-truth for governance policy + generated indices | Yes (131 files, ~4.9 MB) | **Partial** - keep curated `.md` policy docs + small JSON; gitignore the large generated `*_registry.json`/`*_matrix.json` |

Both are currently tracked. `_delivery/` is the worst offender: 32 MB of binary `.zip` files were committed in `9bd9109` / `d48c31f` / `a15be81`, bypassing the project's own `.gitignore` rule banning >100 MB zips.

---

## `_delivery/` - what it is

Pure delivery/distribution package. Recreated by two Python scripts that live alongside it.

### Contents (61 tracked files)
```
_delivery/
  bundle_all_source.py            <- generator (source: scripts that build the dumps)
  make_10_zips.py                 <- generator (builds the 10 zips)
  KOBI_EL_AUDIT_BUNDLE.zip        <- 305 KB binary
  KOBI_EL_AUDIT_BUNDLE/           <- snapshot copy of 5 SQL migrations + 36 modified
                                     source files + 3 audit MD docs
  all-source/                     <- target dir for bundle_all_source.py output
                                     (.txt dumps, currently only README)
  zips/                           <- 10 binary zips, total ~32 MB:
    01_api-server.zip ... 10_root-config_scripts_extras.zip
    download_all.sh, README.md
```

### Evidence it is generated
1. `_delivery/bundle_all_source.py` lines 1-50: hard-codes `ROOT = Path(...techno-kol-uzi-2026)`, scans the live tree, splits into 10 text dumps. Pure derivation from the working tree.
2. `_delivery/zips/README.md` line 1-25: dated `2026-04-20`, describes the contents as "for Replit upload" - a one-shot delivery output.
3. `_delivery/KOBI_EL_AUDIT_BUNDLE/` is a verbatim copy: each file in `migrations/` and `modified-files/` already exists at its canonical path elsewhere in the repo (e.g. `_delivery/KOBI_EL_AUDIT_BUNDLE/modified-files/api-server/src/lib/audit-middleware.ts` duplicates `api-server/src/lib/audit-middleware.ts`).
4. Recent commits (`d48c31f`, `3e007bf`, `9bd9109`, `a15be81`) explicitly describe it as "delivery/bundle/downloader".

### Recommendation - **NOT source of truth**
- **Remove from git** with `git rm -r --cached _delivery/` and add to `.gitignore`.
- **Keep** `_delivery/bundle_all_source.py` and `_delivery/make_10_zips.py` (or move them to `scripts/`) - those are the actual reproducible source.
- The 32 MB of zips violate the spirit of the existing `.gitignore` line `# Large ZIP files (exceed GitHub 100MB limit)`. Each zip individually is <10 MB so they slipped through, but they bloat clones unnecessarily.
- If a delivery snapshot must be preserved, attach it to a GitHub Release or external storage, not the repo.

---

## `_master-registry/` - what it is

Mixed: part hand-curated governance/policy SoT, part generator output.

### Contents (131 tracked files, ~4.9 MB)

**Curated policy / decision SoT** (keep in git):
- `SOURCE_OF_TRUTH_CANONICAL_MAP.md` - canonical schema-per-business-meaning table
- `source_of_truth_registry.json` (2.3 KB) - matching machine-readable policy
- `global_rules.json`, `navigation_governance.json`, `orphan_prevention_policy.json` - small policy files
- `domains/*.md` (15 domain spec docs + 15 permission matrices)
- `AR_AP_SYMMETRY_DECISION.md`, `AUTH_ALLOWLIST_RATIONALE.md`, `BUILD_DECISION_LOG.md`, `RECOVERY_DECISION_LOG.md`, `VAT_18_UPDATE.md` - decision logs
- `*_evidence_log.md` (commercial/execution/governance/procurement)

**Generated indices and reports** (gitignore candidates):
- `models_registry.json` (1.08 MB), `pages_registry.json` (500 KB), `fields_registry.json` (531 KB), `permissions_registry.json` (212 KB), `relationships_registry.json` (60 KB), `connection_matrix.json` (150 KB) - all emitted by `scripts/build-master-registry-v2.js`
- `MERGE_DELTA_VERIFY.json` (278 KB), `final_merge_actions.jsonl` (365 KB), `truly_new_files.json` (45 KB) - merge-tool output
- Numerous `*_REPORT.md`, `*_MATRIX.md`, `*_SCAN.md`, `BUILD_*.md`, `RECOVERY_*.md`, `MERGE_*.md` - generator outputs from `scripts/generate-matrices.js`, `scripts/generate-recovery-docs.js`, `scripts/reconcile-registries.js`, etc.

### Evidence
1. `scripts/build-master-registry-v2.js` (line 19-20) explicitly writes to `_master-registry/`. The builder is checked in; outputs are checked in too -> redundant.
2. `_master-registry/SUMMARY.txt` reads like a build-tool log ("Models: 342 ... Integrity: PASS") - generator artifact.
3. 14 scripts under `scripts/` reference `_master-registry/` (verify-merge-delta, run-ab-validation, run-integrity-checks, reconcile-registries, merge-truly-new, generate-matrices, generate-recovery-docs, build-master-registry, build-master-registry-v2, etc.).
4. The 17 commits touching `_master-registry/` are dominated by `feat(phase-N)` runs of those scripts.

### Recommendation - **Split**
Keep tracked (true SoT, hand-edited, small):
```
_master-registry/SOURCE_OF_TRUTH_CANONICAL_MAP.md
_master-registry/source_of_truth_registry.json
_master-registry/global_rules.json
_master-registry/navigation_governance.json
_master-registry/orphan_prevention_policy.json
_master-registry/domains/**            (curated domain specs + permission matrices)
_master-registry/*_DECISION_*.md       (decision logs)
_master-registry/*_evidence_log.md     (manual evidence)
_master-registry/AR_AP_SYMMETRY_DECISION.md, AUTH_ALLOWLIST_RATIONALE.md,
                  VAT_18_UPDATE.md, FINAL_SECURITY_AUDIT_SUMMARY.md
```

Move out of git (regeneratable, large, churn on every build):
```
_master-registry/models_registry.json     (1.08 MB)
_master-registry/pages_registry.json      (500 KB)
_master-registry/fields_registry.json     (531 KB)
_master-registry/permissions_registry.json (212 KB)
_master-registry/connection_matrix.json   (150 KB)
_master-registry/relationships_registry.json (60 KB)
_master-registry/MERGE_DELTA_VERIFY.json  (278 KB)
_master-registry/final_merge_actions.jsonl (365 KB)
_master-registry/truly_new_files.json     (45 KB)
_master-registry/BUILD_*, RECOVERY_*, MERGE_*, *_REPORT.md, *_MATRIX.md, *_SCAN.md
```

Optional middle path: keep them tracked but mark them clearly as build artifacts (e.g., a `_master-registry/generated/` subdir + README) so future readers know not to hand-edit.

---

## Action items (suggested, in order)

1. Add to `.gitignore`:
   ```
   _delivery/zips/*.zip
   _delivery/KOBI_EL_AUDIT_BUNDLE.zip
   _delivery/KOBI_EL_AUDIT_BUNDLE/
   _delivery/all-source/*.txt
   ```
2. `git rm -r --cached _delivery/zips/*.zip _delivery/KOBI_EL_AUDIT_BUNDLE.zip _delivery/KOBI_EL_AUDIT_BUNDLE/`. Saves ~32 MB.
3. Decide policy on `_master-registry/` generated artifacts. Recommended: gitignore the large `_registry.json`/`_matrix.json`/JSONL files, keep curated `.md` docs and `domains/`.
4. Consider relocating generator scripts (`bundle_all_source.py`, `make_10_zips.py`) into `scripts/` so the convention "scripts in `scripts/`, outputs ignored" is uniform.

---

## Source files referenced

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\.gitignore`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_delivery\bundle_all_source.py`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_delivery\make_10_zips.py`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_delivery\zips\README.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_delivery\KOBI_EL_AUDIT_BUNDLE\README.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_master-registry\SOURCE_OF_TRUTH_CANONICAL_MAP.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_master-registry\source_of_truth_registry.json`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\_master-registry\SUMMARY.txt`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\scripts\build-master-registry-v2.js`
