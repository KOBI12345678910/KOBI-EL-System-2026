# AGENT-20 — Deploy / CI / CD Readiness Audit

Author: Agent-20 (deploy/CI swarm)
Date: 2026-04-29
Scope: Container builds, GitHub Actions, healthchecks, secrets, migrations, rollback, multi-region

---

## Status

**Overall: AMBER (production-capable but rough edges).**

The repo ships **multi-stage Dockerfiles for all 4 services**, a **production docker-compose**, **Kubernetes manifests** under `k8s/`, **Railway config**, **GCP Cloud Run deploy script**, **40+ Supabase migrations**, and **4 GitHub Actions workflows** (CI, build/push, security, preview). What's missing for a true "Palantir-grade" deploy: real release-grade rollback automation, structured PII-redacted logging enforcement at the platform level, no Vault/SOPS for secrets (raw env files only), and no multi-region story.

---

## CI/CD State

| Workflow | File | Triggers | Notes |
|---|---|---|---|
| CI build/test | `.github/workflows/ci.yml` | push/PR `main` | Matrix Node 20 x 4 services + techno-kol-ops/client + payroll. Lint is `continue-on-error`. Test/build conditional on script presence — **soft-pass** if missing. Caches `node_modules` per service. Artifact upload for `onyx-ai/dist` + `techno-kol-ops/client/dist`. |
| Build & Deploy | `.github/workflows/deploy.yml` | push `main`/`master`, manual | Builds 4 service images with `docker/build-push-action@v6`, multi-stage `target=runtime`, push to **ghcr.io**, GHA layer cache. `deploy` job is **summary-only** — actual deploy delegated to Railway via GitHub integration. |
| Security | `.github/workflows/security.yml` | weekly cron, PR, manual | `npm audit --audit-level=critical` per service; opens/updates a security issue on findings. **CodeQL** for `javascript-typescript`. Audit JSON uploaded as artifact (30-day retention). |
| Deploy Preview | `.github/workflows/deploy-preview.yml` | PR `main` | Builds frontend dists, uploads artifacts, posts/updates preview-link **placeholder** comment. **No actual preview hosting wired**. |

**What's missing:**
- No staging-promotion gate. `deploy.yml` produces images but the `deploy` job only echoes — no `kubectl apply`, no Cloud Run deploy, no smoke-test post-step.
- No SBOM generation (`syft`/`anchore-sbom-action`) and no image signing (`cosign`). Images go to GHCR unsigned.
- No image vulnerability scan (Trivy/Grype) in CI — only npm-level audit.
- No DB migration step in CI/CD. Migrations are run **manually** via `npm run migrate` per the runbook; no gate that prevents shipping a new image against a non-migrated DB.
- No e2e smoke job after image build/push.
- `unit-tests` job in `ci.yml` re-runs `npm ci && npm test` for projects already covered by the matrix → wasted minutes (~3x duplicate work).

---

## Dockerfile Issues

All four services use **3-stage builds (`deps -> build -> runtime`)** on `node:20-alpine`, run as **non-root UIDs (10001/10002/10003)**, use **tini** as PID 1, set `NODE_ENV=production`, and ship a **HEALTHCHECK** (CMD calls `/healthz`). That's solid baseline.

Concrete issues found:

1. **Root Dockerfile is for techno-kol-ops only** (`Dockerfile` at repo root, port 3200). Counter-intuitive — Railway/CI consumers can pick up the wrong file. Recommend renaming to `techno-kol-ops/Dockerfile` (already exists, content duplicated) and removing root copy, or add a clear comment.
2. **`docker/onyx-procurement.Dockerfile` runs `npm install --omit=dev`, not `npm ci`** in the deps stage even when a lockfile exists. The `if [ -f package-lock.json ]` branch is no-op (both branches run the same command). Lockfile drift is silently allowed.
3. **`docker/onyx-ai.Dockerfile` installs `python3 make g++`** in deps stage but never removes them — final image is bloated (~150 MB extra). They're only needed in deps; alpine multi-stage can drop them.
4. **No `.dockerignore` discipline confirmed** — large repos like this leak `node_modules`, `.git`, `_qa-reports/`, `_audit_tmp/`, `_delivery/` into build contexts unless dockerignore is well-tuned. This bloats builds (CI minutes) and, worse, can leak audit artifacts into images.
5. **`payroll-autonomous` Dockerfile uses inline `printf` for nginx config** — works, but no SSL/TLS termination, no security headers. A proxy (nginx in front, or cloud LB) is required.
6. **No image labels for OCI metadata** (`org.opencontainers.image.source`, `revision`, `created`). `deploy.yml` uses `docker/metadata-action@v5` so labels exist there, but per-Dockerfile `LABEL` blocks are absent.
7. **Build args for version/SHA not threaded** — no `ARG GIT_SHA` baked into the image, so runtime can't self-report build commit on `/healthz`.

---

## Health Check Coverage

| Service | Endpoint | Source | Container HEALTHCHECK | Compose HC |
|---|---|---|---|---|
| onyx-procurement | `/healthz` (and `/health`, `/api/health`) | `server.js` | yes (node http GET) | yes (wget) |
| techno-kol-ops | `/healthz` | `src/index.ts` | yes | yes |
| onyx-ai | `/healthz` | `src/index.ts`, `src/health.ts` | yes | yes |
| payroll-autonomous | `/healthz` | nginx inline route | yes (wget --spider) | yes |
| postgres / redis | n/a | image-native | n/a | yes |

**Inconsistencies:**
- `docker-compose.prod.yml` queries `/health` while Dockerfiles + Railway query `/healthz`. Both happen to work for onyx-procurement (which exposes both) but **`/health` is not guaranteed for techno-kol-ops, onyx-ai, payroll**. This is an active footgun — a typo in one image will silently fail the Compose HC but not Container HC, or vice versa.
- No `/ready` (readiness vs liveness split). Kubernetes manifests under `k8s/` should have separate `livenessProbe` / `readinessProbe`. Deep DB-connect readiness is missing.
- `onyx-procurement` lists `/api/health` for some checks, mixing API-prefixed and root-prefixed health routes.

---

## Logging — Structured & PII Redaction

- **Pino is the standard logger** across services (`onyx-procurement`, `techno-kol-ops`, `onyx-ai`). Output is JSON, level-controlled by `LOG_LEVEL`.
- **PII redaction** is partial. `src/utils/sanitize.js` exists. `error-tracker.js` advertises "User context with email hashing (PII safe)" + "headers sanitized, body sample" — at the tracker level only. There is **no global pino `redact` config** in any of the services' logger init files, meaning ad-hoc `req.body` logs still leak emails, IDs, JWTs.
- `_delivery/` and `_audit_tmp/` directories contain dumps; if these are baked into images via missing `.dockerignore`, they're a PII risk.
- No central log shipping in `docker-compose.yml` (only Loki in `docker-compose.prod.yml`). Loki is wired but no Promtail config seen — logs only flow if app writes to stdout (which they do) and Docker driver picks them up. Grafana datasource provisioning not in repo.

---

## Monitoring & Observability

- **Self-hosted error tracker**: `onyx-procurement/src/ops/error-tracker.js` — Sentry-shaped but not Sentry. Includes breadcrumbs, fingerprinting, regression detection, ring buffer + JSONL persistence.
- **Sentry SDK is NOT a dependency**. `SENTRY_DSN` is read from env in `server.js` (line 71) and passed to the local tracker as a placeholder, but `@sentry/node` is not in `package.json`. The exception: `erp-app/src/lib/sentry.ts` and `api-server/src/lib/sentry.ts` (from AI-Task-Manager) reference Sentry but those are subprojects and not wired into core 4 services.
- **Prometheus metrics**: `src/ops/prom-metrics.js` is a zero-dep RFC-compliant text exporter. `docker-compose.prod.yml` runs Prometheus + Grafana + Loki. Scrape config (`docker/prometheus.yml`) is referenced but not visible at root — assume present.
- **No DataDog, no New Relic, no OpenTelemetry**. Trace propagation between services is informal (no `traceparent` header standard).
- Alert rules exist at `onyx-procurement/ops/alerts/rules.yml` with a `notification-dispatcher.js`. Not wired to PagerDuty or Slack incoming-webhook in CI/CD.

---

## Database Migrations Pipeline

- **`onyx-procurement/scripts/migrate.js`** — custom v3 runner. Reads `migrations/*.sql` lexically, manages `public.schema_migrations` with **SHA-256 checksums + drift detection**, advisory lock (prevents concurrent runs), per-run log file, `--up`/`--down N`/`--status`/`--dry-run`/`--force`/`--json`. Supports `-- UP` / `-- DOWN` sections per file. **Solid; production-grade.**
- Two migration roots:
  - `supabase/migrations/00000_*.sql` ... `00076+` — **80+ files** for the master schema, RLS, RPCs, dashboards, enterprise expansion.
  - `onyx-procurement/supabase/migrations/000-*.sql` ... `007-*.sql` — service-specific (VAT, annual tax, bank rec, payroll wage slip).
  - `onyx-procurement/db/migrations/0001_*.sql` ... `0005_*.sql` (in `_merge-staging-final/`, source of truth) — raw SQL for procurement schema.
  - `AI-Task-Manager/artifacts/api-server/src/migrations/*.sql` — **separate runner**, separate `migrate.js` flow.
- **No migration step in any GHA workflow.** Migrations are documented as manual in `DEPLOY.md` and `OPS_RUNBOOK.md`. No "migration must be applied before image deploy" gate.
- **No expand/contract pattern documented**. `migrate.js --down 1` exists, but the docs don't enforce that DOWN sections must be present, and no CI lint validates this.

---

## Rollback Strategy

| Layer | Mechanism | Maturity |
|---|---|---|
| Code/image | GHCR tag history; `IMAGE_TAG=<sha>` redeploy | Manual — no `kubectl rollout undo`, no Railway one-click revert documented |
| DB schema | `npm run migrate:rollback` (down N) | Implementation present; runbook usage absent |
| Data | `DR_RUNBOOK.md` references Supabase PITR + manual backup-all script | Tested per `OPS_RUNBOOK.md` quarterly drill |
| Traffic | None | No blue/green, no canary, no traffic shifting in `k8s/` or Cloud Run config |

**Gaps**: no automated rollback decision tree, no error-rate-triggered abort, no shadow/dark deploy. `OPS_RUNBOOK.md` mentions `traffic-shadow.test.js` but it's a test, not a deployment knob.

---

## Secrets Handling

- **Source of truth**: `.env` files (per service + root). `.env.example` is committed; real `.env` is gitignored (presumed).
- **Compose**: all services use `env_file: .env`. Database credentials, JWT secret, Anthropic key, OpenAI key, WhatsApp app secret all flow through one env file → easy to leak via `docker inspect`.
- **K8s**: `k8s/02-secret.yaml` is a `stringData: CHANGE_ME` template. Comment instructs `kubectl create secret` instead of committing — good. **No External Secrets Operator, no Sealed Secrets, no Vault**.
- **Cloud platforms**: GCP deploy script (`scripts/gcp/deploy.sh`) creates Secret Manager entries for "API keys, passwords" — that's the right pattern but only for Cloud Run; Railway and self-hosted compose are unprotected.
- **Sentry DSN, JWT secret, Postgres password** all sit in plain env. No rotation automation. Runbook mentions "rotate one non-critical key per week on a rolling schedule" — manual.
- `AUTH_MODE=api_key` defaults to a hardcoded `dev-admin-api-key` in `.env.example` — common dev-leaking-into-prod hazard if `.env.example` is copied verbatim.

---

## Multi-Region Readiness

**Not ready.** Single-region everywhere:
- Railway, Cloud Run scripts target one region (`europe-west1` per the script output).
- Postgres is single-instance (compose) or single Supabase project (cloud) — no read-replicas, no failover doc.
- Redis is a single node, no Sentinel/cluster.
- WebSocket layer in `techno-kol-ops` has no sticky-session or cross-region pub/sub (Redis pub/sub assumed but single node).
- No CDN config in repo for static assets.
- Hebrew/Israel-only fiscal/legal logic (PCN836, Form 126, RTL) — moot for non-IL regions, but the runtime topology should still be redundant within IL.

---

## Recommendations (priority-ordered)

**P0 — Block before next prod cut:**
1. Standardize health-check path: pick `/healthz` everywhere, deprecate `/health` from compose.
2. Fix `docker/onyx-procurement.Dockerfile` deps stage to actually use `npm ci` when lockfile present.
3. Add `.dockerignore` audit; ensure `_qa-reports*/`, `_delivery/`, `_audit_tmp/`, `_merge-staging*/`, `node_modules`, `.git`, `*.env` are excluded from all build contexts.
4. Wire migrations into `deploy.yml` as a separate `migrate` job that runs **before** image rollout, with `--dry-run` on PR and real apply on merge.
5. Add `pino.redact` config (paths: `req.headers.authorization`, `req.body.password`, `*.email`, `*.idNumber`, `*.bankAccount`) to all 3 Node services' logger init.

**P1 — Within 2 sprints:**
6. Add Trivy/Grype scan in `deploy.yml` between build and push; fail on high CVE.
7. Sign images with `cosign` and add SBOM (`syft`) generation.
8. Replace summary-only `deploy` job with a real Cloud Run / Railway / kubectl deploy step + post-deploy smoke test hitting `/healthz` on the new revision.
9. Wire actual `@sentry/node` SDK alongside the self-hosted tracker, or commit fully to the self-hosted path and remove the `SENTRY_DSN` env to avoid confusion.
10. Document and enforce a DOWN section per migration; add CI lint that rejects migrations missing DOWN.

**P2 — Strategic:**
11. Add External Secrets Operator + GCP Secret Manager / Vault integration for `k8s/` manifests.
12. Add canary deploy lane via Cloud Run revision tags or k8s Argo Rollouts.
13. Multi-region story: at minimum, a documented warm-standby in a second IL availability zone with Supabase PITR + Redis Sentinel.
14. OpenTelemetry traces with `traceparent` propagation across service-to-service calls (already 7 cross-service contracts in `wiring-spec.js`).
15. De-duplicate `unit-tests` job in `ci.yml` — it overlaps the matrix.

---

## Files Audited

- `Dockerfile` (root, techno-kol-ops port 3200)
- `docker/{onyx-procurement,techno-kol-ops,onyx-ai,payroll-autonomous}.Dockerfile`
- `docker-compose.yml`, `docker-compose.prod.yml`
- `railway.toml`
- `.github/workflows/{ci,deploy,deploy-preview,security}.yml`
- `k8s/{00-namespace,01-configmap,02-secret,03-networkpolicy,10-postgres..19-loki}.yaml`
- `.env.example` (root, 4 services)
- `OPS_RUNBOOK.md`, `DEPLOY.md`, `DEPLOY-PRODUCTION.md`, `DEPLOYMENT-RUNBOOK.md`, `DEPLOYMENT-RUNBOOK-VERCEL.md`, `GCP-DEPLOY-כך-עושים-את-זה.md`
- `onyx-procurement/scripts/migrate.js`
- `onyx-procurement/src/ops/{error-tracker,prom-metrics,apm,metrics}.js`
- `supabase/migrations/00000-00076+_*.sql` (40+ files counted)
