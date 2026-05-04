# DEPLOY CHECKLIST — KOBI-EL System 2026 (techno-kol-ops)

## Required Environment Variables

### CRITICAL — Must be set before deploy

| Variable | Value | Source |
|----------|-------|--------|
| `DATABASE_URL` | `postgresql://postgres:[DB_PASSWORD]@db.ponypxhushxeskxgrmha.supabase.co:5432/postgres` | Supabase Dashboard → Settings → Database → Show Password |
| `SUPABASE_SERVICE_ROLE_KEY` | `(secret)` | Supabase Dashboard → Project Settings → API → service_role |
| `JWT_SECRET` | `KbSgFqIZDm1IZIMHm4QcmuJ9r9EsScOS` | Generated 32-char random string |

### Pre-configured (already known)

| Variable | Value | Status |
|----------|-------|--------|
| `SUPABASE_URL` | `https://ponypxhushxeskxgrmha.supabase.co` | ✅ Known |
| `SUPABASE_ANON_KEY` | `sb_publishable_0fCmGXqKf70Ld4MuZASGgw_Pz3WTk9J` | ✅ Known |
| `PORT` | `3200` | ✅ Set |
| `NODE_ENV` | `production` | ✅ Set |

## GitHub Secrets Required (for CI/CD)

| Secret | Purpose |
|--------|---------|
| `FLY_API_TOKEN` | Fly.io deployment — get from fly.io/dashboard → Tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | For running migrations in CI |

## Fly.io Dashboard ENV vars to set

Go to: https://fly.io/apps/techno-kol-ops-kobi/secrets

Set these:
```
DATABASE_URL=postgresql://postgres:[DB_PASSWORD]@db.ponypxhushxeskxgrmha.supabase.co:5432/postgres
SUPABASE_URL=https://ponypxhushxeskxgrmha.supabase.co
SUPABASE_ANON_KEY=sb_publishable_0fCmGXqKf70Ld4MuZASGgw_Pz3WTk9J
SUPABASE_SERVICE_ROLE_KEY=[from Supabase dashboard]
JWT_SECRET=KbSgFqIZDm1IZIMHm4QcmuJ9r9EsScOS
PORT=3200
NODE_ENV=production
```

## Database Migrations

73 SQL migration files in `supabase/migrations/` must be run in order.

To run: Go to Supabase Dashboard → SQL Editor → run each file in order from 00001 to 00071.

OR use Supabase CLI:
```bash
supabase db push --db-url postgresql://postgres:[DB_PASSWORD]@db.ponypxhushxeskxgrmha.supabase.co:5432/postgres
```

## API Routes (31 endpoints)

### Auth
- POST /api/auth/login

- ### Core Business Routes (19)
- - /api/employees, /api/clients, /api/suppliers
  - - /api/attendance, /api/tasks, /api/messages
    - - /api/leads, /api/reports, /api/pipeline
      - - /api/intelligence, /api/supply-chain
        - - /api/brain (Brain Engine v2.0)
          - - /api/ontology, /api/aip
            - - /api/signatures, /api/notifications
              - - /api/materials, /api/work-orders
                - - /api/financials, /api/gps
                 
                  - ### Admin
                  - - /api/admin (requires admin role)
                   
                    - ### Health Probes
                    - - GET / (root health)
                      - - GET /api/health (DB ping)
                        - - GET /healthz (Kubernetes)
                          - - GET /livez (alive)
                            - - GET /readyz (ready + DB check)
                             
                              - ### Bridge/Cross-Service
                              - - GET /api/bridges/health
                                - - GET /api/bridges/procurement/purchase-orders
                                  - - GET /api/bridges/ai/insights
                                   
                                    - ## Security
                                    - - JWT auth required on all /api/ routes (except /api/auth/login)
                                      - - /healthz and /livez are public
                                        - - /api/bridges/* are public (proxy)
                                          - - CORS configured
                                            - - Helmet.js configured
                                              - - Rate limiting configured
                                               
                                                - ## WebSocket
                                                - - WS server on same port 3200
                                                  - - Real-time updates
                                                    - - Alert engine
                                                      - - Autonomous engine
                                                        - - Snapshot broadcast every 30s
                                                         
                                                          - ## Deploy Status
                                                         
                                                          - - [x] Dockerfile ✅
                                                            - [ ] - [x] fly.toml ✅
                                                            - [ ] - [x] railway.toml ✅
                                                            - [ ] - [x] TypeScript build passing ✅
                                                            - [ ] - [x] Docker image pushed to GHCR ✅
                                                            - [ ] - [ ] DATABASE_URL configured ⏳ needs DB_PASSWORD
                                                            - [ ] - [ ] SERVICE_ROLE_KEY configured ⏳ needs from Supabase
                                                            - [ ] - [ ] Migrations run ⏳ needs SERVICE_ROLE_KEY
                                                            - [ ] - [ ] FLY_API_TOKEN in GitHub Secrets ⏳
                                                            - [ ] - [ ] Live deployment ⏳
                                                            - [ ] 
