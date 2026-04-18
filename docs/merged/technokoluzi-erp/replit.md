# טכנו-כל עוזי (Techno-Kol Uzi) — Hebrew ERP System

## Overview
Comprehensive Hebrew ERP system for the Israeli industrial sector (metal/iron/aluminum/glass manufacturing). Full-stack pnpm monorepo with React/Vite frontend, Node.js/Express API backend, and PostgreSQL database.

## Architecture
- **Monorepo**: pnpm workspaces with catalog versioning
- **Frontend**: `artifacts/erp-app` — React 19 + Vite 6.4, Tailwind CSS 4, RTL Hebrew UI
- **Backend**: `artifacts/api-server` — Express API with authentication, migrations, workflow engine
- **Database**: PostgreSQL via Drizzle ORM (`lib/db`)
- **Shared libs**: `lib/api-zod` (Zod schemas), `lib/api-client-react` (TanStack Query client)
- **Server entry**: `server/index.ts` — unified server that mounts the API app and Vite dev middleware

## Key Files
| File | Purpose |
|------|---------|
| `server/index.ts` | Main entry — loads API + Vite middleware |
| `pnpm-workspace.yaml` | Workspace config with catalog versions |
| `lib/db/src/index.ts` | DB connection, `withRetry`, `withCircuitBreaker` |
| `lib/db/src/schema.ts` | Drizzle table definitions (190+ tables) |
| `lib/api-zod/src/index.ts` | Shared Zod validation schemas |
| `artifacts/erp-app/src/App.tsx` | Main React app with routing |
| `artifacts/api-server/src/app.ts` | Express app with all middleware and routes |

## Running
- **Workflow**: `PORT=5000 npx tsx server/index.ts`
- **Default credentials**: `admin` / `admin123` (super admin)

## Database
- PostgreSQL provisioned via Replit
- Tables created by SQL migrations in `artifacts/api-server/src/lib/migrations.ts` at runtime
- Drizzle schema in `lib/db/src/schema.ts` provides TypeScript type definitions
- The `users` and `user_sessions` tables have full column definitions; other tables have stub definitions

## Important Notes
- The API server routes are prefixed with `/api` internally — the main server mounts the API app at root level
- CSP allows WebSocket connections in development for Vite HMR
- Some seed operations produce non-fatal SQL errors due to stub schema definitions
- The `withRetry` function accepts both positional args and an options object
