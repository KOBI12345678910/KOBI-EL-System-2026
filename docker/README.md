# Docker — ERP 2026 (KOBI EL)

Full-stack local orchestration for the ERP platform:

| Service              | Stack                | Port (host) | Notes                          |
|----------------------|----------------------|-------------|--------------------------------|
| `postgres`           | Postgres 16 Alpine   | `5432`      | Persistent volume              |
| `redis`              | Redis 7 Alpine       | `6379`      | Cache + queue                  |
| `onyx-procurement`   | Node 20 + Express    | `3100`      | `server.js`                    |
| `techno-kol-ops`     | Node 20 + TypeScript | `3200`      | tsc build -> `dist/index.js`   |
| `onyx-ai`            | Node 20 + TypeScript | `3300`      | tsc build -> `dist/index.js`   |
| `payroll-autonomous` | Vite build + nginx   | `5173`      | Static SPA                     |
| `nginx` (optional)   | Reverse proxy        | `80`        | Enable with `--profile proxy`  |

All services share the `erp-net` bridge network and use restart `unless-stopped`.

---

## 1. First-time setup

From the repo root (the folder that contains `docker-compose.yml`):

```bash
# 1. Copy env template and edit values (secrets, API keys, etc.)
cp .env.example .env

# 2. (Optional) Activate dev-mode overrides for hot reload & source bind-mounts
cp docker-compose.override.yml.example docker-compose.override.yml

# 3. Build all images in parallel
docker compose build

# 4. Start the stack in the background
docker compose up -d
```

Watch logs:

```bash
docker compose logs -f
docker compose logs -f onyx-procurement techno-kol-ops onyx-ai
```

Check status:

```bash
docker compose ps
```

---

## 2. With the reverse proxy

The `nginx` service is behind a `proxy` profile and is only started when
explicitly requested:

```bash
docker compose --profile proxy up -d
```

Routes (when proxy is enabled):

| Path                    | Target                      |
|-------------------------|-----------------------------|
| `/`                     | `payroll-autonomous` (SPA)  |
| `/api/procurement/*`    | `onyx-procurement:3100`     |
| `/api/ops/*`            | `techno-kol-ops:3200`       |
| `/api/ai/*`             | `onyx-ai:3300`              |
| `/healthz`              | nginx liveness              |

---

## 3. Health endpoints

All backend services expose `/healthz` (liveness) and container healthchecks
wait for it before marking the service healthy. Compose `depends_on` uses
`condition: service_healthy` so slow services are started in the correct
order.

Quick manual checks:

```bash
curl http://localhost:3100/healthz    # onyx-procurement
curl http://localhost:3200/healthz    # techno-kol-ops
curl http://localhost:3300/healthz    # onyx-ai
curl http://localhost:5173/healthz    # payroll-autonomous (nginx)
```

---

## 4. Database bootstrap

On first boot of the `postgres` container, two SQL files run from
`/docker-entrypoint-initdb.d` in order:

1. `01-init-db.sql` (from `docker/init-db.sql`)
   * Enables extensions (`uuid-ossp`, `pgcrypto`, `pg_trgm`, …)
   * Creates per-service schemas (`procurement`, `ops`, `ai`, `payroll`, `audit`)
   * Creates per-service login roles and grants
   * Creates the cross-service `audit.event_log` table
2. `02-schema.sql` (from `techno-kol-ops/src/db/schema.sql`)
   * The canonical operational schema used by techno-kol-ops

To wipe and reinitialize the DB:

```bash
docker compose down -v         # CAUTION — removes the postgres_data volume
docker compose up -d postgres
```

---

## 5. Dev workflow (hot reload)

With `docker-compose.override.yml` active, each Node service bind-mounts its
source into the container and starts a watcher:

| Service              | Dev command                                |
|----------------------|--------------------------------------------|
| `onyx-procurement`   | `node --watch server.js`                   |
| `techno-kol-ops`     | `npx tsx watch src/index.ts`               |
| `onyx-ai`            | `npx ts-node src/index.ts`                 |
| `payroll-autonomous` | `npx vite --host 0.0.0.0 --port 5173`      |

Node inspector ports are exposed on `9229`/`9230`/`9231` for breakpoints.

---

## 6. Volumes

Named volumes (survive `docker compose down`; removed by `down -v`):

| Volume                         | Used by              | Purpose                    |
|--------------------------------|----------------------|----------------------------|
| `erp_postgres_data`            | postgres             | DB data directory          |
| `erp_redis_data`               | redis                | AOF persistence            |
| `erp_onyx_procurement_data`    | onyx-procurement     | runtime files / exports    |
| `erp_onyx_procurement_logs`    | onyx-procurement     | Pino logs                  |
| `erp_techno_kol_logs`          | techno-kol-ops       | app logs                   |
| `erp_onyx_ai_data`             | onyx-ai              | knowledge base / memory    |
| `erp_onyx_ai_logs`             | onyx-ai              | app logs                   |
| `erp_nginx_logs`               | nginx (proxy)        | access + error logs        |

---

## 7. Common operations

```bash
# Rebuild one service
docker compose build onyx-ai && docker compose up -d onyx-ai

# Restart a single service
docker compose restart techno-kol-ops

# Open a shell in a running service
docker compose exec onyx-procurement sh

# Run the postgres client as the app user
docker compose exec postgres psql -U erp -d erp_main

# Stop everything (keep volumes)
docker compose down

# Stop everything AND delete persistent volumes (DESTRUCTIVE)
docker compose down -v
```

---

## 8. Troubleshooting

* **onyx-procurement fails on boot** — it enforces `SUPABASE_URL` and
  `SUPABASE_ANON_KEY` at startup. The compose file provides dev fallbacks
  (`http://postgres:5432` + `local-dev-anon-key`) so boot succeeds locally.
  For real Supabase, set them in `.env`.
* **onyx-ai port clash** — the in-source default is `3200`. The compose file
  overrides with `PORT=3300`, so it runs on `3300` and no longer clashes with
  `techno-kol-ops`.
* **techno-kol-ops cannot see tables** — the schema init only runs on the
  first postgres boot. Reinitialize with `docker compose down -v && docker compose up -d`.
* **Hebrew/Unicode in logs looks garbled** — the init script sets
  `--encoding=UTF8`; make sure your terminal is also UTF-8.
* **Builds are slow** — the first build downloads base images & installs deps.
  Subsequent builds are incremental thanks to multi-stage layer caching.

---

## 9. File map

```
.
├── .env.example
├── docker-compose.yml
├── docker-compose.override.yml.example
├── docker/
│   ├── README.md                       (this file)
│   ├── init-db.sql
│   ├── nginx.conf
│   ├── onyx-procurement.Dockerfile
│   ├── techno-kol-ops.Dockerfile
│   ├── onyx-ai.Dockerfile
│   └── payroll-autonomous.Dockerfile
├── onyx-procurement/
│   └── .dockerignore
├── techno-kol-ops/
│   └── .dockerignore
├── onyx-ai/
│   └── .dockerignore
└── payroll-autonomous/
    └── .dockerignore
```

Rule: *לא מוחקים — רק משדרגים*. No existing source files were modified; every
file above is additive.
