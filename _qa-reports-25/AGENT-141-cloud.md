# AGENT-141 — Cloud Infrastructure Audit

Author: Agent-141 (cloud-infra swarm)
Date: 2026-04-29
Scope: GCP Cloud Run, Kubernetes manifests, Railway, Vercel, Supabase. IAM scope, Secret Manager, DB connections.

---

## Verdict

**Overall: AMBER.** The repo ships a coherent **GCP-Cloud-Run-first** deploy path (`scripts/gcp/deploy.sh` + 4 Cloud Build configs + Secret Manager wiring), parallel Kubernetes manifests under `k8s/` with hardened pod-security defaults, a minimal **Railway** stub (`railway.toml`), and a documented **Vercel + Railway + Supabase** runbook as the recommended low-friction path. AWS is **not** present (no CDK/Terraform/CFN). Critical gaps: over-broad project-level IAM grants on the Cloud Build SA, `--allow-unauthenticated` on every Cloud Run service, plaintext `CHANGE_ME` placeholders in committed K8s Secret manifest, no Cloud SQL (Supabase only — connection string lives in Secret Manager but no IAM/Auth Proxy), and Railway config has no service definitions.

---

## Inventory

| Target | Files | Status |
|---|---|---|
| **GCP Cloud Run** | `scripts/gcp/deploy.sh`, `cloudbuild-{onyx-procurement,onyx-ai,techno-kol-ops,payroll-autonomous}.yaml`, `secrets.template.env`, `GCP-DEPLOY-כך-עושים-את-זה.md` | Primary path; one-shot deploy works |
| **Kubernetes** | `k8s/00..19-*.yaml` (20 files: ns, cm, secret, netpol, postgres, redis, 4 services, nginx, prometheus, grafana, loki) | Self-hosted alternative; manifests hardened |
| **Railway** | `railway.toml` (10 lines, builder=Dockerfile, healthcheck `/healthz`) | Bare stub — no service map |
| **Vercel** | `DEPLOYMENT-RUNBOOK-VERCEL.md` (runbook only) | No `vercel.json` in repo |
| **AWS** | — | None. No CDK / Terraform / CloudFormation. |
| **DB** | Supabase (managed Postgres). K8s manifest has self-hosted Postgres + PVC for the on-prem option. | Two paths; no Cloud SQL. |

---

## GCP Cloud Run — `scripts/gcp/deploy.sh`

**Pipeline:** pre-flight → project create/select → enable 7 APIs (`run`, `cloudbuild`, `artifactregistry`, `secretmanager`, `cloudresourcemanager`, `iam`, `serviceusage`) → Artifact Registry → 9 secrets → repo clone → Cloud Build × 4 → wire URLs → smoke test `/healthz`.

Region drift: `deploy.sh` defaults `REGION=europe-west3`; **all 4 cloudbuild YAMLs use `me-west1` (Tel Aviv)**. The `gcloud run services describe` lookup in step 8 hits the wrong region, so cross-service URL wiring fails silently when the script is run with default REGION. **Fix:** align `deploy.sh` default to `me-west1`, or pass `--region` from the env into both the script and the build substitutions.

Build configs (`scripts/gcp/cloudbuild-*.yaml`) — common shape:

| Service | Port | Mem | CPU | Max instances | Auth | Secrets injected |
|---|---|---|---|---|---|---|
| onyx-procurement | 3100 | 512Mi | 1 | 10 | `--allow-unauthenticated` | SUPABASE_DB_URL, SUPABASE_URL, SUPABASE_ANON_KEY, API_KEYS, PAYROLL_ADMIN_KEYS, PAYROLL_EMPLOYEE_KEY_MAP |
| techno-kol-ops | 3200 | 512Mi | 1 | 5 | `--allow-unauthenticated` | SUPABASE_DB_URL, JWT_SECRET, API_KEYS, ONYX_AI_URL, PROCUREMENT_API_URL |
| onyx-ai | 3300 | 512Mi | 1 | 5 | `--allow-unauthenticated` | ANTHROPIC_API_KEY, PROCUREMENT_API_URL, API_KEYS |
| payroll-autonomous | 80 | 256Mi | 1 | 3 | `--allow-unauthenticated` | (none — static SPA) |

`min-instances=0` on all four → cold starts acceptable for internal ERP, but the onyx-procurement timeout of 300s plus cold start risks pushing past Cloud Run's request limit on first call.

`JWT_SECRET=jwt-secret:latest` is referenced by techno-kol-ops, but `deploy.sh` **never creates** a `jwt-secret` in Secret Manager. First deploy of techno-kol-ops will fail to start. **Fix:** add `create_or_update_secret "jwt-secret" "$(gen_secret)"` alongside `api-keys` in step 5 of `deploy.sh`.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` secrets are referenced by onyx-procurement but also not pre-created by `deploy.sh` — only `supabase-db-url` is. Same first-deploy failure pattern.

---

## IAM — Cloud Build service account

`deploy.sh` lines 138–155 grant **project-level**:
- `roles/artifactregistry.writer`
- `roles/run.admin`
- `roles/iam.serviceAccountUser`
- `roles/secretmanager.secretAccessor`

`run.admin` at the project scope lets the Cloud Build SA deploy/delete **any** Cloud Run service in the project, not just the four ERP services. `secretmanager.secretAccessor` at project scope reads **every** secret. **Recommendation:** scope these via `--condition` on resource name prefix (`bash44/*`) or use a dedicated deployer SA per service. No conditions are set today (`--condition=None`).

**Cloud Run service identity:** none of the cloudbuild YAMLs set `--service-account=...`. Cloud Run defaults to the **Compute Engine default SA** (`PROJECT_NUM-compute@…`) which has `roles/editor` project-wide on most projects. Each service should run as a least-privilege per-service SA with only `secretmanager.secretAccessor` on its own secrets. This is the single highest-impact hardening item.

---

## Secret Manager — coverage

Created by `deploy.sh`: `api-keys`, `payroll-admin-keys`, `payroll-employee-map`, `supabase-db-url` (placeholder), `anthropic-api-key` (placeholder), `procurement-api-url` (placeholder), `onyx-ai-url` (placeholder).

Referenced by builds but **not created**: `jwt-secret`, `supabase-url`, `supabase-anon-key`. → cold-start crash on first deploy until manually created.

Replication policy: `automatic` for all. Acceptable for `me-west1` pinning since Secret Manager replication is multi-region anyway.

Rotation: documented in `secrets.template.env` (manual `gcloud secrets versions add`). No scheduled rotation, no Pub/Sub trigger to redeploy services on new version. Services pin `:latest`, so a new version requires a manual `gcloud run services update --set-secrets=...` to pick it up — current behavior in the runbook.

---

## Kubernetes manifests — `k8s/`

20 files, hardened by default (banner: "runAsNonRoot, readOnlyRootFilesystem, drop ALL"). Verified on `12-onyx-procurement.yaml`:

- `Namespace erp-prod` with `pod-security.kubernetes.io/enforce: restricted`.
- Per-service `ServiceAccount` + `Role` + `RoleBinding` scoped to specific configmap/secret names with `verbs: [get]` only. `automountServiceAccountToken: false` everywhere.
- Pod `securityContext`: `runAsNonRoot: true`, `runAsUser: 10001`, `seccompProfile: RuntimeDefault`.
- Container `securityContext`: `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: [ALL]`.
- HPA (`autoscaling/v2`): 2–8 replicas, CPU 70% / mem 80%, scale-down 25%/60s, scale-up 100%/30s.
- PDB `minAvailable: 1`.
- Per-service `NetworkPolicy` (ingress: same-app-of pods only; egress: same-app + DNS to kube-system). `03-networkpolicy.yaml` adds a `default-deny-all` baseline.

**Critical issue — `k8s/02-secret.yaml`:** committed file contains `stringData` with literal `CHANGE_ME` for `POSTGRES_PASSWORD`, `JWT_SECRET`, `SESSION_SECRET`, `API_KEY_ADMIN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `SUPABASE_SERVICE_KEY`. The file's banner says "do NOT commit real values" — but the file itself is committed and `kubectl apply -f k8s/` will create a Secret with placeholder values that pods will then mount. Fine as a template, dangerous if applied verbatim. **Fix:** move to `02-secret.yaml.example`, add `02-secret.yaml` to `.gitignore`, and require `kubectl create secret` from out-of-band material per the deploy runbook.

**Postgres in-cluster (`10-postgres.yaml`)** — single replica, `Recreate` strategy, 20Gi PVC `storageClassName: standard`. Acceptable for dev/preview, **not** production-grade (no replica, no PITR, no off-cluster backup). The runbook correctly steers toward Supabase for production.

**ConfigMap leak (`01-configmap.yaml`)** — contains `POSTGRES_HOST: postgres`, port 5432, `REDIS_HOST: redis` plain. No sensitive data. OK.

---

## Railway — `railway.toml`

```
[build]  builder = "DOCKERFILE"
[deploy] startCommand = "" / healthcheckPath = "/healthz" / restart on_failure x10
```

Single `[deploy]` block — **no per-service config**. Railway treats one repo as one service by default; with 4 services in this monorepo, this `railway.toml` only describes one of them (whichever service Railway is pointed at via the dashboard). The deploy runbook (`DEPLOYMENT-RUNBOOK-VERCEL.md`) treats Railway as the backend host but the toml does not encode the 4-service split. **Fix:** either move to Railway's `[[services]]` array form with explicit `dockerfilePath` per service, or drop Railway in favor of the GCP path.

`healthcheckPath = "/healthz"` matches Cloud Run smoke tests but **does not match** the K8s probes which use `/health`. Two health endpoints in the wild → confirm both exist in each service or unify.

---

## Vercel + AWS

**Vercel:** no `vercel.json` in repo. The Vercel runbook describes a manual dashboard-driven setup for the frontend (`techno-kol-ops/client`). Recommended improvement: add `vercel.json` with explicit `buildCommand`, `outputDirectory`, and `headers` (CSP, HSTS) so config is reviewable in PRs.

**AWS:** absent. No IaC, no ECR/ECS/EKS configs. If AWS is on the roadmap, start with a `cdk/` or `terraform/` module that mirrors the Cloud Run topology (4 Fargate services + Secrets Manager + RDS Proxy + ALB).

---

## Supabase / Cloud SQL

The system uses **Supabase** as the managed Postgres. Connection string lives in Secret Manager as `supabase-db-url` and is mounted as `SUPABASE_DB_URL` env var into onyx-procurement and techno-kol-ops. **No Cloud SQL Auth Proxy, no IAM database authentication, no private IP / VPC connector.** Cloud Run reaches Supabase over the public internet using the password embedded in the URI.

For Cloud Run → Supabase this is acceptable (Supabase only supports public TLS connections) but means:
- Password rotation requires a new Secret Manager version + service redeploy.
- No client-cert / IAM auth path.
- Egress traffic counts toward Cloud Run network billing; over a Serverless VPC Connector with a private peering (not currently supported by Supabase) it could be private — flag as a future option only if migrating off Supabase to Cloud SQL.

**RLS is documented and enforced at the Supabase layer** (see `DEPLOYMENT-RUNBOOK-VERCEL.md` §2.3) — this is the right primary defense given the public connection model.

---

## Top fixes (priority order)

1. **Add `jwt-secret`, `supabase-url`, `supabase-anon-key` creation to `deploy.sh`** — first-deploy currently fails for techno-kol-ops + onyx-procurement.
2. **Reconcile region** — `deploy.sh` says `europe-west3`, all cloudbuild YAMLs say `me-west1`. Pick one.
3. **Per-service Cloud Run runtime SAs** with narrow `secretAccessor` bindings, replacing the default Compute SA.
4. **Move `k8s/02-secret.yaml` → `.example`** and gitignore the real file. Add a `kubectl create secret generic erp-secrets --from-env-file=...` step to the runbook.
5. **Auth on Cloud Run** — currently every service is `--allow-unauthenticated`. For internal ERP, gate with IAP or require `Authorization: Bearer <id_token>` for service-to-service and only expose the UI service publicly.
6. **Fix Railway config** — either spell out the 4 services with `[[services]]` blocks or remove `railway.toml` and document Railway as deprecated in favor of GCP.
7. **Unify health endpoints** — `/healthz` (Cloud Run / Railway) vs `/health` (K8s probes) — pick one and update probes.
8. **CI gate that runs `gcloud secrets versions list` against required secrets** before triggering a deploy build, so a missing secret aborts before the image ships.

---

## Files referenced

- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\scripts\gcp\deploy.sh`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\scripts\gcp\cloudbuild-onyx-procurement.yaml`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\scripts\gcp\cloudbuild-techno-kol-ops.yaml`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\scripts\gcp\cloudbuild-onyx-ai.yaml`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\scripts\gcp\cloudbuild-payroll-autonomous.yaml`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\scripts\gcp\secrets.template.env`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\GCP-DEPLOY-כך-עושים-את-זה.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\railway.toml`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\DEPLOYMENT-RUNBOOK-VERCEL.md`
- `C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL\.claude\worktrees\objective-merkle-40ff93\k8s\` (20 files: 00-namespace through 19-loki)
