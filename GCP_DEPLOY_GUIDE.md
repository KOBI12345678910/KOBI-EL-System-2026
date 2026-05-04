# GCP Cloud Run Deploy Guide — KOBI-EL-System

## חובה — הגדר משתנים לפני deploy

| Variable | Description |
|----------|-------------|
| `GCP_PROJECT_ID` | Google Cloud Project ID |
| `SUPABASE_URL` | Supabase project URL |
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Secret for JWT signing |
| `REGION` | Default: `europe-west1` |
| `SERVICE_NAME` | Default: `techno-kol-ops` |

## שלבי deploy

1. **הרשאות:**
   ```bash
   gcloud auth login
   gcloud config set project $GCP_PROJECT_ID
   ```

2. **Deploy:**
   ```bash
   ./gcp-deploy.sh
   ```

## קבצים

- `gcp-Dockerfile` — מבנה container (multi-stage build)
- `cloudbuild.yaml` — CI/CD pipeline ב-Google Cloud Build
- `gcp-deploy.sh` — סקריפט deploy אינטראקטיבי

## תלויות נוספות

אם build נכשל ב-Docker:
1. ודא ש-`zod`, `cookie-parser`, `dompurify` ב-package.json
2. ודא ש-`pnpm-lock.yaml` או `package-lock.json` מעודכן (`pnpm install`)
3. בדוק `NODE_ENV` ו-`PORT` ב-.env
