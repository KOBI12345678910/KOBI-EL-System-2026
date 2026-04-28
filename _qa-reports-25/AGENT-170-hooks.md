# AGENT-170 — Husky / Commit / Push Hooks Audit

**Scope:** `.husky/` + lint-staged, commit-message format, secrets scan, no-secrets gate.
**Date:** 2026-04-29 | **Branch:** `claude/objective-merkle-40ff93`

## 1. Inventory — `.husky/` (6 files)

| Hook              | Purpose                                  | Status |
|-------------------|------------------------------------------|--------|
| `pre-commit`      | Runs `npm test --if-present` per staged-touched workspace | Active |
| `commit-msg`      | Conventional Commits regex enforcement   | Active |
| `pre-push`        | `git lfs pre-push` passthrough           | LFS only |
| `post-commit`     | `git lfs post-commit`                    | LFS only |
| `post-merge`      | `git lfs post-merge`                     | LFS only |
| `post-checkout`   | `git lfs post-checkout`                  | LFS only |

All files are executable (`-rwxr-xr-x`) and shebang-correct.

## 2. lint-staged — NOT CONFIGURED

- No `lint-staged` config in root `package.json`, no `.lintstagedrc*`, no `lint-staged.config.*`.
- Root `package.json` `devDependencies` = only `concurrently` + `rimraf`. **No `husky`, no `lint-staged`, no `@commitlint/*`, no `gitleaks`** declared.
- `pre-commit` hook implements its own bespoke logic: walks staged files, finds nearest `package.json` ancestors, runs `npm test --if-present`. **It does NOT run lint, format, or staged-only checks** — it runs the full test suite of every workspace touched, which is slower and may format-skip.
- **GAP:** No formatter (Prettier) or linter (ESLint) gating on staged files. Root `lint` script just calls `npm run lint --workspaces --if-present`, never hooked.

## 3. Commit-message format — Conventional Commits (custom regex)

`commit-msg` hook enforces:
```
^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([^)]+\))?!?: .+$
```
- Allows merge / revert / fixup / squash / `chore(release)` to bypass.
- Rejects empty subject after `type(scope):`.
- Provides Hebrew-friendly English error message with examples.
- **No `@commitlint/cli` + `@commitlint/config-conventional`** — implementation is hand-rolled POSIX shell regex. Functional but non-extensible (no body/footer rules, no scope enum, no length cap, no breaking-change footer check).

Recent commits (`git log`) all conform: `feat(platform):`, `feat(delivery):`, `feat(audit):`. **PASS.**

## 4. Secrets scan / no-secrets gate — ABSENT

- No pre-commit secrets scanner (no `gitleaks`, `trufflehog`, `detect-secrets`, `git-secrets`).
- No `.gitleaks.toml`, no allowlist, no baseline.
- `pre-commit` does not block on detected secrets — anything passes if tests pass.
- `.github/workflows/security.yml` runs only `npm audit` (deps CVEs) + CodeQL. **No secret-scanning job.**
- `.gitignore` covers `.env`, `.env.local`, `.vscode/`, `.claude/` — but `.env.example` files are tracked (correct), and there is **no protection against accidentally committing a real `.env` named otherwise** (e.g., `secrets.json`, `*.pem`, `id_rsa`, AWS keys).

## 5. core.hookspath misconfiguration

```bash
$ git config core.hookspath
C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.husky\_
```
Repository-level `core.hookspath` is set to the **parent directory's** `.husky/_` — NOT this worktree's `.husky/`. The 6 hook files in this worktree are **effectively dormant unless that parent path resolves**. The parent `.husky/_` contains 39-byte stub scripts (Husky helper-shim layout). This worktree has no `.husky/_/husky.sh` helper, so each hook's `. "$(dirname -- "$0")/_/husky.sh" 2>/dev/null || true` line silently no-ops.
**Risk:** hooks may not fire at all from this worktree depending on Husky version.

## 6. CI parity check

`.github/workflows/ci.yml`:
- Lint = `continue-on-error: true` (non-blocking).
- Tests required only if `package.json` defines `test` script.
- No commitlint job, no lint-staged check, no gitleaks/trufflehog step.

## 7. Findings & severity

| # | Finding                                                                  | Severity | Recommendation |
|---|--------------------------------------------------------------------------|----------|----------------|
| 1 | No secrets scanner anywhere (hooks or CI)                                | HIGH     | Add `gitleaks protect --staged` to `pre-commit` + CI `gitleaks detect` job |
| 2 | `core.hookspath` points outside this worktree; helper `_/husky.sh` missing | HIGH    | Run `husky install` in worktree; unset stale repo-level `core.hookspath` |
| 3 | No `lint-staged` — pre-commit runs full test suite, no format/lint gate  | MED      | Install `lint-staged` + Prettier/ESLint; gate on staged files only |
| 4 | Husky/commitlint/lint-staged not in `devDependencies`                    | MED      | Pin versions to ensure reproducible install |
| 5 | `commit-msg` is hand-rolled regex; no scope/length/footer rules          | LOW      | Migrate to `@commitlint/config-conventional` |
| 6 | `pre-push` only calls Git LFS — no test/build/secret gate before remote  | MED      | Add `gitleaks protect` + targeted test on push |
| 7 | CI lint is `continue-on-error: true`                                     | LOW      | Make lint blocking on PRs once codebase is clean |
| 8 | `post-commit/merge/checkout` are LFS-only — abort on missing `git-lfs`   | LOW      | Acceptable; document `git-lfs` as required tool |

## 8. Quick remediation outline

1. `npm i -D --workspace-root husky lint-staged @commitlint/cli @commitlint/config-conventional`
2. Add `"prepare": "husky install"` to root `package.json`.
3. Create `.lintstagedrc.json` with `*.{js,ts,jsx,tsx,json,md}` -> `prettier --write` + `eslint --fix`.
4. Replace `pre-commit` body with: `npx lint-staged && npx gitleaks protect --staged --redact -v`.
5. Replace `commit-msg` with: `npx --no-install commitlint --edit "$1"`.
6. Add `.github/workflows/security.yml` job: `gitleaks/gitleaks-action@v2`.
7. Unset stale `git config --unset core.hookspath` if it points outside the repo.

## 9. Verdict

**FAIL — production-grade hook posture not met.** Hooks exist but (a) may not execute due to `core.hookspath` pointing to a parent directory, (b) provide no secrets gate, (c) no lint/format-staged enforcement, and (d) tooling not declared in lockfile. Conventional-commit enforcement is the only working safeguard.
