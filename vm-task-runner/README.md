# vm-task-runner

**Role:** Scheduled job executor & workflow orchestrator for Techno-Kol Uzi ERP 2026.
**Port:** 3400
**Part of:** the unified monorepo (see root `package.json`).

## What it does

- **Cron jobs** — daily KPI snapshots, monthly payroll close, VAT reminders, RFQ follow-ups, nightly AI recommendations.
- **Redis queue worker** — picks up async tasks enqueued by other services and dispatches them.
- **HTTP admin API** — health, list jobs, trigger jobs manually.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/health`              | Liveness + version |
| GET  | `/jobs`                | List registered cron jobs |
| POST | `/jobs/:name/trigger`  | Manually fire a job |

## Running

From the **monorepo root**:

```bash
npm run dev:vm      # dev with nodemon
npm run build:vm    # no-op placeholder
```

Standalone:

```bash
cd vm-task-runner
npm start
```

Docker:

```bash
docker compose up vm-task-runner
```

## Environment

| Var | Default | Notes |
|-----|---------|-------|
| `VM_TASK_RUNNER_PORT` | `3400` | HTTP listen port |
| `REDIS_URL`           | `redis://localhost:6379` | Queue backend |
| `LOG_LEVEL`           | `info` | pino level |

## Adding a new job

Edit `src/jobs.js`, append to the `jobs` array:

```js
{
  name: 'your-job-name',
  cron: '0 * * * *',          // every hour
  description: 'What it does',
  handler: async ({ logger }) => { /* ... */ }
}
```
