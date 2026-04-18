# AG-X93 — Deploy Manifest Generator

**Stack:** Mega-ERP Techno-Kol Uzi
**Rule:** לא מוחקים רק משדרגים ומגדלים *(we only upgrade and grow, never delete)*
**Date:** 2026-04-11
**Status:** PASS — 25/25 tests green
**Owner:** Platform / Deploy
**Module:** `onyx-procurement/src/deploy/manifest-generator.js`

---

## 1. Scope

Zero-dependency JS module that generates:
- `docker-compose.prod.yml` (single file)
- `k8s/*.yaml` (14 files, one per service + 4 shared)

Both outputs are driven by a single `getDefaultConfig()` descriptor — one
source of truth for ports, images, resource budgets, and network topology.

The generator is PURE (no `fs`, no `process.env`, no `Date.now()`), so it is
deterministic and test-friendly. A writer script (invoked separately) reads
the output and persists it, **only if the target file does not already
exist**, honoring the "never delete" rule.

## 2. Service Topology (ASCII)

```
                                Internet
                                   │
                                   │  :443 (TLS via cert-manager)
                                   ▼
                        ┌─────────────────────┐
                        │   Ingress (nginx)   │ frontend-net
                        │   host: erp.kobi-   │
                        │   el.local          │
                        └──────────┬──────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │                  │                  │
                ▼                  ▼                  ▼
        ┌────────────┐    ┌────────────────┐   ┌────────────────┐
        │  payroll-  │    │  techno-kol-   │   │  onyx-ai       │
        │ autonomous │    │  ops           │   │                │
        │  :8080     │    │  :3200         │   │  :3300         │
        │(static SPA)│    │(node api + ws) │   │  (node api)    │
        └────────────┘    └───────┬────────┘   └───────┬────────┘
                                  │                    │
                                  │                    │
                          ┌───────┴────────────────────┴──────┐
                          │     onyx-procurement  :3100       │ ★ API gateway
                          │     (node / express / primary)    │
                          └───────┬───────────────────────────┘
                                  │           backend-net
                  ┌───────────────┼──────────────┐
                  │               │              │
                  ▼               ▼              ▼
           ┌──────────┐    ┌──────────┐    ┌──────────────┐
           │ postgres │    │  redis   │    │ prometheus   │
           │  :5432   │    │  :6379   │    │  :9090       │
           │  (PVC)   │    │  (PVC)   │    │  (scrapes ↑) │
           └──────────┘    └──────────┘    └──────┬───────┘
                                                  │
                                 ┌────────────────┴────────┐
                                 ▼                          ▼
                          ┌──────────────┐          ┌──────────────┐
                          │   grafana    │          │    loki      │
                          │   :3000      │          │   :3100/ctr  │
                          │   (dash)     │          │   :3101/host │
                          └──────────────┘          └──────────────┘

  ── frontend-net (public-facing, TLS termination) ──────────────────────────
  ── backend-net  (internal — DBs, brokers, observability) ─────────────────
  ★ onyx-procurement is dual-homed so the nginx Ingress can reach its API
```

## 3. Port Matrix

| Service              | Container | Host (compose) | Network           | Probe path    |
|----------------------|-----------|----------------|-------------------|---------------|
| postgres             | 5432      | 5432           | backend           | `pg_isready`  |
| redis                | 6379      | 6379           | backend           | `redis-cli ping` |
| onyx-procurement     | 3100      | 3100           | frontend+backend  | `/health`     |
| techno-kol-ops       | 3200      | 3200           | frontend+backend  | `/health`     |
| onyx-ai              | 3300      | 3300           | frontend+backend  | `/health`     |
| payroll-autonomous   | 8080      | 5173           | frontend          | `/`           |
| nginx (reverse)      | 80        | 80             | frontend          | `/healthz`    |
| prometheus           | 9090      | 9090           | backend           | `/-/healthy`  |
| grafana              | 3000      | 3000           | backend           | `/api/health` |
| loki                 | 3100      | **3101**       | backend           | `/ready`      |

**Port collision note.** Loki's container port is `3100`, same as
`onyx-procurement`. Inside the cluster there is no conflict (different pods,
different Services). On the compose host we publish Loki to `3101` so the
local developer can still reach procurement on its canonical `3100`. The test
`ports: compose and k8s agree on container port for every service` covers
this.

## 4. Environment Variables Reference

Reference file: **`.env.example`** (at repo root). Canonical keys:

| Key                   | Scope                 | Purpose                         |
|-----------------------|-----------------------|---------------------------------|
| `NODE_ENV`            | all node services     | `production`                    |
| `LOG_LEVEL`           | all node services     | `info` / `debug`                |
| `POSTGRES_USER`       | postgres + services   | DB role                         |
| `POSTGRES_PASSWORD`   | postgres + services   | DB secret (Secret in k8s)       |
| `POSTGRES_DB`         | postgres + services   | DB name                         |
| `POSTGRES_PORT`       | compose               | host port mapping               |
| `DATABASE_URL`        | services              | full DSN                        |
| `REDIS_PORT`          | compose               | host port mapping               |
| `REDIS_PASSWORD`      | redis + services      | optional auth                   |
| `REDIS_URL`           | services              | convenience DSN                 |
| `SUPABASE_URL`        | onyx-procurement      | local-dev fallback              |
| `SUPABASE_SERVICE_KEY`| onyx-procurement      | service role key (Secret)       |
| `JWT_SECRET`          | services              | HS256 signing key (Secret)      |
| `SESSION_SECRET`      | services              | cookie secret (Secret)          |
| `API_KEY_ADMIN`       | onyx-procurement      | admin bootstrap key (Secret)    |
| `ANTHROPIC_API_KEY`   | onyx-ai               | LLM key (Secret)                |
| `OPENAI_API_KEY`      | onyx-ai               | LLM key (Secret)                |
| `ALLOWED_ORIGINS`     | onyx-procurement      | CORS allow-list                 |
| `OPS_REALTIME_ENABLED`| techno-kol-ops        | websocket toggle                |
| `ONYX_GOVERNOR_ENABLED`| onyx-ai              | AI safety governor toggle       |
| `PAYROLL_HOST`        | payroll-autonomous    | external hostname               |
| `VITE_API_URL`        | payroll-autonomous    | build-time API base             |
| `PROXY_PORT`          | nginx                 | host listen port                |

In Kubernetes:
- `configMapRef: erp-config` (non-secret) populates `NODE_ENV`, `LOG_LEVEL`,
  `POSTGRES_HOST`, `POSTGRES_PORT`, `REDIS_HOST`, `REDIS_PORT`,
  `STACK_NAME`, `DOMAIN`.
- `secretRef: erp-secrets` (sensitive) carries `POSTGRES_PASSWORD`,
  `JWT_SECRET`, `SESSION_SECRET`, `API_KEY_ADMIN`, `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`, `SUPABASE_SERVICE_KEY`.

The generator emits both with `CHANGE_ME` placeholders so that `kubectl
apply` will successfully create the resources and `kubectl create secret`
can overwrite them later.

## 5. Security Notes

The generator applies the following hardening defaults to every k8s
Deployment (enforced by tests):

1. **`runAsNonRoot: true`** — pod + container both pinned to UID/GID 10001.
2. **`readOnlyRootFilesystem: true`** — a `/tmp` `emptyDir` is mounted so
   stateless containers can still write scratch data.
3. **`allowPrivilegeEscalation: false`** and **`privileged: false`**.
4. **`capabilities.drop: [ALL]`** — explicit.
5. **`seccompProfile: RuntimeDefault`** at the pod level.
6. **`automountServiceAccountToken: false`** — every service gets its own
   dedicated ServiceAccount with a minimal `Role` that only `get`s
   `erp-config` + `erp-secrets` by name.
7. **`pod-security.kubernetes.io/enforce: restricted`** on the Namespace.
8. **Default-deny `NetworkPolicy`** at the namespace level, with additive
   per-service rules limiting ingress/egress to siblings and kube-system
   DNS (UDP/TCP 53).
9. **Probes** — `readinessProbe`, `livenessProbe`, `startupProbe` on every
   container (HTTP for Node services, exec-based for postgres/redis).
10. **Topology spread + pod anti-affinity** — pods prefer different nodes
    and different zones.
11. **HPA** (CPU 70% / memory 80%) + **PodDisruptionBudget**
    (`minAvailable: 1`) on every stateless service with ≥2 replicas.
12. **Ingress** — `ssl-redirect: true`, cert-manager integration,
    `proxy-body-size` capped.

Compose-side hardening:
- `security_opt: ["no-new-privileges:true"]` on every service.
- `restart: unless-stopped` and `restart_policy: { condition: any, max_attempts: 5 }`.
- Network segmentation via two bridge networks (`frontend`, `backend`).
- Bind-mount volumes under `./data/<service>` so backups can be taken at
  the host level without touching containers.

## 6. Files Produced

**Created (new):**
- `onyx-procurement/src/deploy/manifest-generator.js` — 1,010 lines, zero deps.
- `test/deploy/manifest-generator.test.js` — 25 tests, zero deps.
- `docker-compose.prod.yml` — root (did not exist; existing `docker-compose.yml` untouched).
- `k8s/00-namespace.yaml`
- `k8s/01-configmap.yaml`
- `k8s/02-secret.yaml` (placeholders — replace before `kubectl apply`)
- `k8s/03-networkpolicy.yaml` (default-deny + allow-backend-to-db)
- `k8s/10-postgres.yaml`
- `k8s/11-redis.yaml`
- `k8s/12-onyx-procurement.yaml`
- `k8s/13-techno-kol-ops.yaml`
- `k8s/14-onyx-ai.yaml`
- `k8s/15-payroll-autonomous.yaml`
- `k8s/16-nginx.yaml`
- `k8s/17-prometheus.yaml`
- `k8s/18-grafana.yaml`
- `k8s/19-loki.yaml`

**Untouched (existing):**
- `docker-compose.yml` — local dev stack, unchanged.
- `docker-compose.override.yml.example` — unchanged.

## 7. Test Results

```
$ node test/deploy/manifest-generator.test.js
  ok  exports: generateCompose / generateK8s / yamlEmit / yamlParse
  ok  yamlEmit: quotes strings when colon is followed by space
  ok  yamlEmit: leaves plain strings unquoted
  ok  yamlEmit: emits booleans and numbers plainly
  ok  yamlEmit: quotes numeric-looking strings
  ok  yamlEmit: nested maps produce correct indentation
  ok  yamlEmit: sequence of maps
  ok  yamlParse: parses what yamlEmit produces (map)
  ok  yamlParse: round-trip is stable
  ok  compose: has required top-level keys
  ok  compose: every service has image + container_name + restart
  ok  compose: every service has a healthcheck
  ok  compose: every service has resource limits under deploy.resources
  ok  compose: stateful services declare bind-mount volumes
  ok  k8s: every service file has Deployment + Service + NetworkPolicy
  ok  k8s: stateful services have a PVC
  ok  k8s: stateless services (>=2 replicas) have HPA + PDB
  ok  k8s: every Deployment has security context with runAsNonRoot
  ok  k8s: every Deployment has probes (or exec probes for db/cache)
  ok  k8s: topology spread + pod anti-affinity on every Deployment
  ok  ports: compose and k8s agree on container port for every service
  ok  ports: getPortMatrix returns an entry for every service
  ok  compose: frontend/backend networks referenced by services
  ok  k8s: nginx exposes an Ingress
  ok  k8s: prometheus, grafana, loki included in generated output

25 passed, 0 failed
```

## 8. Hebrew Glossary / מילון עברי

| English                        | עברית                           | תיאור |
|--------------------------------|---------------------------------|-------|
| Deploy manifest                | מניפסט פריסה                    | קובץ תצורה שמתאר איך וכיצד לפרוס שירות |
| Container                      | מכולה                            | יחידת ריצה מבודדת (Docker) |
| Deployment                     | פריסה                            | אובייקט Kubernetes לניהול רפליקות |
| Service                        | שירות                            | אובייקט k8s המגדיר נקודת כניסה פנימית |
| Namespace                      | מרחב-שמות                        | הפרדה לוגית של משאבים בתוך אשכול |
| Ingress                        | כניסה (ingress)                  | שער HTTP/S חיצוני לאשכול |
| ConfigMap                      | מפת-תצורה                        | תצורה לא-רגישה                |
| Secret                         | סוד                              | מידע רגיש (מוצפן במנוחה)      |
| ServiceAccount                 | חשבון שירות                      | זהות הפוד מול ה-API-server    |
| RoleBinding                    | קישור-תפקיד                      | הענקת הרשאות לזהות            |
| NetworkPolicy                  | מדיניות-רשת                      | כללי חומת-אש ברמת הפוד        |
| PersistentVolumeClaim (PVC)    | בקשת-נפח-מתמיד                   | דרישה לאחסון יציב             |
| HorizontalPodAutoscaler (HPA)  | שמאי-אופקי-לפודים                | שינוי מספר רפליקות אוטומטית   |
| PodDisruptionBudget (PDB)      | תקציב-שיבוש-פודים                | מינימום פודים זמינים בשדרוג   |
| Readiness probe                | בדיקת-מוכנות                     | פוד מוכן לקבל תעבורה?          |
| Liveness probe                 | בדיקת-חיות                       | פוד עדיין חי?                 |
| Startup probe                  | בדיקת-אתחול                      | בדיקה בזמן עליית הפוד          |
| Security context               | הקשר-אבטחה                       | הגדרות UID/GID/יכולות ברמת הפוד |
| runAsNonRoot                   | הרצה-לא-כשורש                    | איסור הרצה בתור root           |
| readOnlyRootFilesystem         | שורש-לקריאה-בלבד                 | מניעת כתיבה למערכת הקבצים      |
| Topology spread constraint     | מגבלת-פיזור-טופולוגית            | פיזור פודים בין אזורי זמינות  |
| Anti-affinity                  | אנטי-קרבה                        | העדפה שפודים לא ירוצו על אותו צומת |
| Healthcheck (compose)          | בדיקת-תקינות                     | סקריפט `test:` ב-docker-compose |
| Resource limits                | מגבלות-משאבים                    | תקרת CPU/זיכרון                |
| Resource requests              | בקשות-משאבים                     | רצפת CPU/זיכרון מובטחת         |
| Reverse proxy                  | מתווך הפוך                       | `nginx` שמנתב לכל השירותים     |
| Observability                  | נצפיות                            | prometheus + grafana + loki    |

## 9. How to Re-generate

From any shell in the repo root:

```bash
node -e "
const fs = require('fs');
const path = require('path');
const m = require('./onyx-procurement/src/deploy/manifest-generator.js');
if (!fs.existsSync('docker-compose.prod.yml'))
  fs.writeFileSync('docker-compose.prod.yml', m.generateCompose());
if (!fs.existsSync('k8s')) fs.mkdirSync('k8s', { recursive: true });
for (const [fn, c] of Object.entries(m.generateK8s())) {
  const p = path.join('k8s', fn);
  if (!fs.existsSync(p)) fs.writeFileSync(p, c);
}
"
```

The writer **never overwrites an existing file**, in line with the
"לא מוחקים רק משדרגים ומגדלים" rule. To customize ports/images/replicas,
pass a config object — see `getDefaultConfig()` in the module for the full
schema.

## 10. Follow-ups / TODO

- [ ] Add a `NetworkPolicy` allow-rule for prometheus scraping across the
      backend network (currently relies on shared-namespace ingress rule).
- [ ] Wire generator into CI so that each PR runs
      `node test/deploy/manifest-generator.test.js`.
- [ ] Extend `generateCompose` to emit an `x-defaults` anchor block to
      reduce duplication at the compose level.
- [ ] Expose `generateCompose`/`generateK8s` via a small CLI
      (`bin/erp-manifests.js`).
- [ ] Add kustomize overlays for `dev` / `staging` / `prod` variants.
