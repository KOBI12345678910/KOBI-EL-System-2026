# Deploy to Railway - Step by Step

## Option A: Railway Dashboard (2 minutes)

1. Go to https://railway.com/new
2. Click **"Deploy from GitHub Repo"**
3. Select **KOBI12345678910/KOBI-EL-System-2026**
4. Railway will detect the docker-compose.yml automatically

### Add Services Manually (if auto-detect doesn't work):

#### 1. PostgreSQL
- Click **"+ New"** > **"Database"** > **"PostgreSQL"**
- It auto-provisions. Copy the `DATABASE_URL` from the service variables.

#### 2. Redis
- Click **"+ New"** > **"Database"** > **"Redis"**
- Copy `REDIS_URL` from variables.

#### 3. Onyx Procurement (main API)
- Click **"+ New"** > **"GitHub Repo"** > select the repo
- Set **Root Directory**: `onyx-procurement`
- Set **Dockerfile Path**: `../docker/onyx-procurement.Dockerfile`
- Add variables:
  ```
  PORT=3100
  NODE_ENV=production
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  REDIS_URL=${{Redis.REDIS_URL}}
  JWT_SECRET=<generate: openssl rand -hex 64>
  API_KEY_ADMIN=<generate: openssl rand -hex 32>
  AUTH_MODE=api_key
  ALLOWED_ORIGINS=https://your-payroll-domain.up.railway.app
  ```
- Click **"Generate Domain"** to get a public URL

#### 4. Techno-Kol Ops
- Same flow, Root Directory: `techno-kol-ops`
- Dockerfile: `../docker/techno-kol-ops.Dockerfile`
- Variables:
  ```
  PORT=3200
  NODE_ENV=production
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  REDIS_URL=${{Redis.REDIS_URL}}
  JWT_SECRET=${{onyx-procurement.JWT_SECRET}}
  ```

#### 5. Onyx AI
- Root Directory: `onyx-ai`
- Dockerfile: `../docker/onyx-ai.Dockerfile`
- Variables:
  ```
  PORT=3300
  NODE_ENV=production
  DATABASE_URL=${{Postgres.DATABASE_URL}}
  REDIS_URL=${{Redis.REDIS_URL}}
  ONYX_PROCUREMENT_URL=${{onyx-procurement.RAILWAY_PUBLIC_DOMAIN}}
  ANTHROPIC_API_KEY=<your key>
  ```

#### 6. Payroll Autonomous (frontend)
- Root Directory: `payroll-autonomous`
- Dockerfile: `../docker/payroll-autonomous.Dockerfile`
- Variables:
  ```
  VITE_API_URL=https://<onyx-procurement-domain>.up.railway.app
  ```

### Generate Domains
For each service, click **Settings** > **Networking** > **Generate Domain**

---

## Option B: Railway CLI (if you have interactive terminal)

```bash
# Login
railway login

# Create project
railway init -n erp-2026-kobi-el

# Add PostgreSQL
railway add -d postgres

# Add Redis
railway add -d redis

# Deploy each service
cd onyx-procurement && railway up
cd ../techno-kol-ops && railway up
cd ../onyx-ai && railway up
cd ../payroll-autonomous && railway up
```

---

## After Deploy Checklist

- [ ] All 4 services show "Active" in Railway dashboard
- [ ] Health checks pass: `curl https://<domain>/healthz`
- [ ] Database initialized (check PostgreSQL logs for init-db.sql)
- [ ] Frontend loads: open payroll-autonomous URL in browser
- [ ] API responds: `curl https://<procurement-domain>/api/health`
