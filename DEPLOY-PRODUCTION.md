# Production Deployment Guide — KOBI-EL-System-2026

## Quick Start (Docker Compose)
```bash
cp docker-compose.prod.yml docker-compose.yml
cp .env.production.example .env.production
# Edit .env.production with real values
docker-compose up -d
```

## Services & Ports
| Service | Port | URL |
|---------|------|-----|
| techno-kol-ops | 3200 | https://ops.techno-kol.com |
| onyx-procurement | 3100 | https://api.techno-kol.com |
| payroll-autonomous | 5173 | https://payroll.techno-kol.com |
| onyx-ai | 3300 | https://ai.techno-kol.com |

All services are fronted by nginx on port 80 (see `docker/nginx.conf`).

## Environment Variables (Production)

| Variable | Service | Description |
|----------|---------|-------------|
| `SUPABASE_URL` | all | Supabase project URL |
| `SUPABASE_ANON_KEY` | all | Supabase public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | Supabase service role key (server-side only) |
| `JWT_SECRET` | auth | Minimum 32-char random secret for JWT signing |
| `AUTH_MODE` | all | Set to `production` (never `disabled` in prod) |
| `ANTHROPIC_API_KEY` | onyx-ai | Anthropic API key for AI features |
| `WHATSAPP_TOKEN` | techno-kol-ops | WhatsApp Business API token |
| `WHATSAPP_PHONE_ID` | techno-kol-ops | WhatsApp Business phone number ID |
| `SMTP_HOST` | all | SMTP server hostname |
| `SMTP_PORT` | all | SMTP port (587 for TLS) |
| `SMTP_USER` | all | SMTP username |
| `SMTP_PASS` | all | SMTP app password |
| `FROM_EMAIL` | all | Sender email address |
| `VITE_API_URL` | payroll-autonomous | Public API base URL |
| `ALLOWED_ORIGINS` | backend | CORS allowed origins (comma-separated) |
| `IMAGE_PREFIX` | docker | Docker image registry prefix |
| `IMAGE_TAG` | docker | Docker image tag (default: latest) |

## Supabase Setup
1. Create project at supabase.com
2. Run migrations: `supabase db push`
3. Run seed: `supabase db reset --linked`
4. Copy `SUPABASE_URL` and `SUPABASE_ANON_KEY` to `.env.production`

## Railway Deployment
1. Connect GitHub repo to Railway
2. Set environment variables in Railway dashboard
3. Deploy with: `railway up`

See `railway.toml` for service configuration.

## Health Checks
```bash
bash scripts/health-check.sh
```
Expected: all 4 services return healthy status.

Manual check:
```bash
curl http://localhost/healthz              # nginx
curl http://localhost:3100/health          # onyx-procurement
curl http://localhost:3200/health          # techno-kol-ops
curl http://localhost:3300/health          # onyx-ai
curl http://localhost:8080/                # payroll-autonomous (internal port)
```

## Rollback Procedure
```bash
git revert HEAD --no-edit
git push origin master
```

Or roll back to a specific image tag:
```bash
IMAGE_TAG=previous-stable docker-compose up -d
```

## Database Backup
```bash
bash scripts/backup-db.sh
```
Backups are stored in `./backups/` as gzipped SQL files. The script retains the last 30 backups automatically.

## Monitoring
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000 (default user: admin)
- Loki (logs): http://localhost:3101

## Network Architecture
- `frontend` network: nginx, payroll-autonomous, onyx-procurement, techno-kol-ops, onyx-ai
- `backend` network: postgres, redis, prometheus, grafana, loki (internal services)
- Service-to-service communication uses Docker DNS (container names)

## Security Notes
- Never expose postgres (5432) or redis (6379) ports publicly
- Set `AUTH_MODE=production` — dev bypass is disabled in production
- Rotate `JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` periodically
- Use Docker secrets or a vault for sensitive values in production
