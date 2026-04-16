# GCP Deployment Toolkit

One-shot deployment to Google Cloud Run for all 4 Techno-Kol Uzi ERP services.

## Files

| File | Purpose |
|---|---|
| `deploy.sh` | Main deploy script. Designed for Google Cloud Shell. |
| `deploy.ps1` | Windows PowerShell wrapper that invokes `deploy.sh` via Git Bash. |
| `cloudbuild-onyx-procurement.yaml` | Cloud Build config — builds + deploys onyx-procurement. |
| `cloudbuild-onyx-ai.yaml` | Cloud Build config — onyx-ai (TypeScript). |
| `cloudbuild-techno-kol-ops.yaml` | Cloud Build config — techno-kol-ops (TypeScript). |
| `cloudbuild-payroll-autonomous.yaml` | Cloud Build config — payroll-autonomous (Vite SPA + nginx). |
| `secrets.template.env` | Reference for what each secret holds (NO real values). |

## Quick start (Cloud Shell)

```bash
# From Google Cloud Shell (https://shell.cloud.google.com):
bash <(curl -sSL https://raw.githubusercontent.com/KOBI12345678910/KOBI-EL-System-2026/master/scripts/gcp/deploy.sh)
```

## Quick start (local Windows)

```powershell
# Requires Google Cloud SDK + Git for Windows (bash.exe)
cd "C:\Users\kobi\OneDrive\kobi\המערכת 2026  KOBI EL"
.\scripts\gcp\deploy.ps1
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Google Cloud                              │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │  Cloud Run       │  │  Cloud Run       │                     │
│  │  onyx-procurement│  │  techno-kol-ops  │                     │
│  │  :3100           │  │  :3200           │                     │
│  └────────┬─────────┘  └────────┬─────────┘                     │
│           │                      │                               │
│           ↓                      ↓                               │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │  Cloud Run       │  │  Cloud Run       │                     │
│  │  onyx-ai         │  │  payroll-autonom.│                     │
│  │  :3300           │  │  :80 (nginx SPA) │                     │
│  └──────────────────┘  └──────────────────┘                     │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐                     │
│  │ Artifact Registry│  │ Secret Manager   │                     │
│  │ bash44/*         │  │ 9 secrets        │                     │
│  └──────────────────┘  └──────────────────┘                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ↓  (DB connection)
                ┌──────────────────┐
                │  Supabase        │
                │  (external)      │
                └──────────────────┘
```

## What's created

After a successful run, you'll have:

- **1 Artifact Registry** (`bash44`, europe-west3) — holds Docker images.
- **9 Secret Manager secrets:**
  - `api-keys` — 2 random admin API keys (hex-64)
  - `payroll-admin-keys` — same, for payroll admin tier
  - `payroll-employee-map` — placeholder, you fill per employee
  - `supabase-db-url` — placeholder, you fill from Supabase dashboard
  - `anthropic-api-key` — placeholder, you fill if using LLM features
  - `procurement-api-url`, `onyx-ai-url` — auto-populated after services deploy
- **4 Cloud Run services:**
  - `onyx-procurement` (Node + Express, port 3100, 512Mi)
  - `techno-kol-ops` (Node + TS, port 3200, 512Mi)
  - `onyx-ai` (Node + TS, port 3300, 512Mi)
  - `payroll-autonomous` (Vite SPA + nginx, port 80, 256Mi)

Each service has:
- HTTPS enabled (Google-managed cert)
- Scale-to-zero (0–10 instances, auto-scales with traffic)
- `/healthz` endpoint for Cloud Run health checks
- Non-root container user
- Secrets mounted via `--set-secrets` (not env vars — more secure)

## Cost estimate

| Item | Free tier | Paid (low traffic) |
|---|---|---|
| Cloud Run | 2M req/month free | ~$0.40 per 1M req |
| Artifact Registry | 0.5 GB free | $0.10/GB/month |
| Cloud Build | 120 build-min/day free | $0.003/build-min |
| Secret Manager | 6 versions free | $0.06/secret/month |
| Egress | 1 GB/month free | $0.12/GB |

**Typical monthly cost for 10 active users + ~10K requests/day:** $15–40 after the $300 trial credit.

## Troubleshooting

See `GCP-DEPLOY-כך-עושים-את-זה.md` at the repo root (Hebrew step-by-step with a troubleshooting section).

## Rule reminder

לא מוחקים, רק משדרגים ומגדלים.
