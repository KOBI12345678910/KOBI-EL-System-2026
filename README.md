# KOBI-EL-System-2026 — Minimal Deploy (techno-kol-ops)

## Railway Deploy

1. Connect GitHub repo to Railway project
2. Set root directory: `techno-kol-ops`
3. Deploy from branch `main`

## Environment Variables

| Variable | Value | Source |
|----------|-------|--------|
| `SUPABASE_URL` | `https://ponypxhushxeskxgrmha.supabase.co` | Supabase Dashboard |
| `SUPABASE_ANON_KEY` | `sb_publishable_0fCmGXqKf70Ld4MuZASGgw_Pz3WTk9J` | Supabase Dashboard → API |
| `SUPABASE_SERVICE_ROLE_KEY` | `<insert from Supabase Dashboard>` | Supabase Dashboard → API → service_role |
| `JWT_SECRET` | `<generate strong secret>` | Generate manually |
| `PORT` | `3200` | Fixed |
| `NODE_ENV` | `production` | Fixed |

## Migrations

72 migrations located in `supabase/migrations/`. Run in order:

### Option A — Supabase CLI
```bash
supabase login
supabase db push
```

### Option B — SQL Editor (manual)
1. Open Supabase Dashboard → SQL Editor
2. Run each migration file in chronological order (001_, 002_, ...)
3. Verify tables created in Table Editor

## Docker Image

```
ghcr.io/KOBI12345678910/erp-2026/techno-kol-ops:minimal
```

## Status

- ✅ techno-kol-ops build passes
- ✅ Dockerfile + railway.toml ready
- ✅ PR #65 merged to main
- ⏳ Migrations pending (requires SERVICE_ROLE_KEY)
- ⏳ Railway deploy pending (manual)
