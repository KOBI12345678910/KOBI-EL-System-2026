# AGENT-167 — CI / GitHub Actions Workflows Audit

- Date: 2026-04-29
- Worktree: `objective-merkle-40ff93`
- Scope: `.github/workflows/*.yml` (4 files)
- Files audited: `ci.yml`, `deploy-preview.yml`, `deploy.yml`, `security.yml`

## 1. `ci.yml` — Continuous Integration

| Aspect | Detail |
|---|---|
| Triggers | `push` (main), `pull_request` (main) |
| Concurrency | `ci-${{ workflow }}-${{ ref }}`, cancel-in-progress |
| Runner | `ubuntu-latest` |
| Permissions | Default (not declared, inherits repo default) |
| Timeouts | None set on any job |
| Matrix | `node-version: [20]` x `project: [onyx-procurement, onyx-ai, techno-kol-ops, payroll-autonomous]`, `fail-fast: false` |
| Secrets | None used |
| Caching | `actions/cache@v4` keyed on lockfile+package.json hash, per project |

Jobs:
- `build-test` (matrix) — checkout, setup-node v4, cache, conditional `npm ci`/`npm install`, lint (`continue-on-error: true`, non-blocking), test, build. Uploads `dist` artifact only for `onyx-ai` (retention 7d).
- `build-techno-kol-ops-client` — `needs: build-test`, `if: always()` (runs even on upstream failure). Builds and tests `techno-kol-ops/client`, uploads dist (retention 7d).
- `unit-tests` — `needs: build-test`, `if: always()`. Re-runs `npm ci && npm test` for `payroll-autonomous`, `onyx-procurement`, `techno-kol-ops/client`.

Findings:
- No `timeout-minutes` on any job — runaway tests can burn 6h default.
- `unit-tests` job is fully redundant with `build-test` (already runs `npm test` per project) and re-installs from scratch (no cache). Wastes CI minutes.
- `build-techno-kol-ops-client` step `Test techno-kol-ops client` runs `npm ci && npm test` after a separate install step — double install.
- Lint step is `continue-on-error: true` so lint regressions are invisible.
- Action versions are pinned to major (`@v4`, `@v7`) but not SHA — supply-chain risk.
- `master` branch (this repo's main branch per git status) is not in trigger filters; only `main` is. CI will not run on master pushes.

## 2. `deploy-preview.yml` — PR Preview Builds

| Aspect | Detail |
|---|---|
| Triggers | `pull_request` (main) |
| Concurrency | `deploy-preview-${{ ref }}`, cancel-in-progress |
| Permissions | `contents: read`, `pull-requests: write` |
| Timeouts | None |
| Matrix | 3 frontends: `onyx-procurement-web`, `payroll-autonomous`, `techno-kol-ops-client`, `fail-fast: false` |
| Secrets | None (uses `GITHUB_TOKEN` implicitly via `actions/github-script`) |
| Caching | `actions/cache@v4` per frontend, lockfile+package.json hash |

Jobs:
- `build-frontends` (matrix) — checks path exists, conditional install/build, uploads preview artifact (retention 7d, `if-no-files-found: ignore`).
- `comment-pr` — `needs: build-frontends`, `if: always()`. Uses `actions/github-script@v7` to post or update a sticky PR comment with marker `<!-- deploy-preview-comment -->`. Lists 3 frontends with placeholder URLs.

Findings:
- "Preview URL" column is hardcoded `_TBD — preview link placeholder_` — there is no actual preview deploy. The job's name `Deploy Preview` is misleading; it only builds and posts a placeholder.
- `onyx-procurement-web` path is `onyx-procurement/web` — verify this directory exists; ci.yml builds the parent `onyx-procurement`.
- No timeout; npm install can stall indefinitely.
- `pull-requests: write` is correct least privilege for the comment job.
- Branch filter only includes `main`, not `master`.

## 3. `deploy.yml` — Build & Deploy

| Aspect | Detail |
|---|---|
| Triggers | `push` (main, master), `workflow_dispatch` |
| Concurrency | `deploy-${{ ref }}`, cancel-in-progress |
| Permissions | `contents: read`, `packages: write` |
| Env | `REGISTRY=ghcr.io`, `IMAGE_PREFIX=ghcr.io/<owner>/erp-2026` |
| Timeouts | None |
| Matrix | 4 services with per-service context/dockerfile/port |
| Secrets | `secrets.GITHUB_TOKEN` (registry login) |
| Caching | GHA build cache: `cache-from/to: type=gha, scope=${{ matrix.service }}` |
| Environment | `production` on `deploy` job |

Jobs:
- `build-push` (matrix) — checkout, `docker/setup-buildx-action@v3`, `docker/login-action@v3`, `docker/metadata-action@v5` (tags: sha, latest on default branch, date stamp), `docker/build-push-action@v6` with `target: runtime`, push to GHCR.
- `deploy` — `needs: build-push`, gated to `main`/`master`, runs in `production` environment. Pure echo job — actual deploy is delegated to Railway via GitHub integration.

Findings:
- `deploy` job is informational only. No deploy verification, no rollback gate, no smoke test. Approval gate via `environment: production` is the only safety net.
- Same Docker image prefix `erp-2026` regardless of branch. No env-scoped tagging (e.g., staging vs prod).
- `target: runtime` requires multistage Dockerfiles to expose a `runtime` stage — verify all 4 dockerfiles do.
- `latest` tag is pushed on default-branch builds, which conflicts when both `main` and `master` push (race condition on tag).
- No timeout — Docker builds can hang.
- No image-signing (cosign) or SBOM generation.
- No vulnerability scan (Trivy/Grype) of built images before push.

## 4. `security.yml` — Security Scanning

| Aspect | Detail |
|---|---|
| Triggers | `schedule` (Mon 04:17 UTC), `pull_request` (main), `workflow_dispatch` |
| Concurrency | `security-${{ workflow }}-${{ ref }}`, cancel-in-progress |
| Permissions | `contents: read`, `security-events: write`, `issues: write`, `pull-requests: read`. CodeQL job overrides with `actions: read` |
| Timeouts | None |
| Matrix | npm-audit: 4 projects; codeql: `[javascript-typescript]` |
| Secrets | `GITHUB_TOKEN` implicit (issue creation) |
| Caching | None — uses `npm ci --no-audit --no-fund` |

Jobs:
- `npm-audit` (matrix) — installs deps, runs `npm audit --audit-level=critical --json`, uploads `audit-report.json` (retention 30d). On non-PR failure, opens or comments on a labeled GitHub issue (labels: `security`, `automated`, project). Final step fails the job if audit non-zero.
- `codeql` — `github/codeql-action/init@v3` (queries: `security-and-quality`), autobuild, analyze. Single language: `javascript-typescript`.

Findings:
- Step `Run npm audit (high)` is named for "high" but uses `--audit-level=critical` — only critical CVEs fail. Misleading name; weakens posture vs the comment.
- `continue-on-error: true` on audit step plus a later "Fail job if audit failed" step duplicates control flow but works correctly (status captured).
- No caching — every matrix run re-installs all deps. Slow.
- CodeQL has no path filters and no custom config — fine for `security-and-quality` defaults but slow.
- Issue auto-creation will spam if 4 projects each have findings; deduplication only matches exact title (per project, so OK).
- No Dependabot or `actions/dependency-review-action@v4` on PRs.
- No secret-scanning workflow (relies on GitHub-native push protection if enabled).
- No Trivy/container scan.

## Cross-cutting issues

| Issue | Severity | Affects |
|---|---|---|
| No `timeout-minutes` anywhere | High | All 4 workflows |
| Triggers reference only `main`, repo's main branch is `master` | High | `ci.yml`, `deploy-preview.yml`, `security.yml` |
| Actions pinned by tag, not SHA | Medium | All 4 workflows |
| No Dependabot config for actions/npm | Medium | Repo-wide |
| `deploy.yml` lacks SBOM, signing, image scan, smoke test | Medium | Production deploy chain |
| `unit-tests` job in ci.yml is redundant with `build-test` | Low | `ci.yml` |
| Preview deploys are placeholders only | Low | `deploy-preview.yml` |
| audit-level mismatch (named "high", set to "critical") | Low | `security.yml` |
| Lint is non-blocking | Low | `ci.yml` |

## Secrets summary

| Secret | Workflows | Use |
|---|---|---|
| `GITHUB_TOKEN` (auto) | `deploy.yml` | GHCR login |
| `GITHUB_TOKEN` (auto) | `deploy-preview.yml`, `security.yml` | PR comment / issue creation |
| Custom secrets | None | — no third-party tokens, deploy keys, or registry creds |

No app-level secrets (DB URLs, API keys, Sentry DSN, etc.) are wired into any workflow — Railway handles runtime env injection.

## Recommendations (priority order)

1. Add `timeout-minutes: 20` (build/deploy) and `30` (security/codeql) to every job.
2. Add `master` to branch filters for `ci.yml`, `deploy-preview.yml`, `security.yml` — or rename default branch and update.
3. Pin actions to commit SHAs, add Dependabot for `github-actions` ecosystem.
4. Drop the redundant `unit-tests` job in `ci.yml`; rely on matrix `build-test`.
5. Make lint blocking, or move it to a separate non-required check that surfaces in PR review.
6. Wire image scanning (Trivy) and SBOM (`anchore/sbom-action`) into `deploy.yml`; add cosign signing.
7. Add `actions/dependency-review-action@v4` to PR runs in `security.yml`.
8. Fix `npm audit` step name vs `--audit-level=critical` (pick one).
9. Replace placeholder preview comment with real preview hosting (Cloudflare Pages / Netlify) or remove the misleading "Deploy Preview" label.
10. Add a smoke-test job after `build-push` that pulls each image and runs `--health` check before tagging `latest`.

## File references (absolute)

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\.github\workflows\ci.yml`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\.github\workflows\deploy-preview.yml`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\.github\workflows\deploy.yml`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\.github\workflows\security.yml`
