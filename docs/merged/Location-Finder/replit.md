# GPS Location Tracker

## Overview

A GPS Location Tracker web app built with React + Vite frontend and Express 5 backend in a pnpm workspace monorepo.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Maps**: Leaflet + react-leaflet with OpenStreetMap tiles
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Features

- **Dashboard** — overview of tracking stats, recent activity feed
- **Live Tracking** — real-time GPS tracking using browser Geolocation API with interactive Leaflet map
- **Sessions** — list, view, delete tracking sessions
- **Session Detail** — route visualization on map with start/end markers, location point table
- **Batch location upload** — efficiently sends GPS points in batches every 5 seconds during tracking

## Database Schema

- `sessions` — tracking sessions with name, status, distance, point count, timestamps
- `locations` — GPS location points with lat/lng, altitude, accuracy, speed, heading

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## API Endpoints

- `GET /api/healthz` — health check
- `GET/POST /api/sessions` — list/create tracking sessions
- `GET/PATCH/DELETE /api/sessions/:id` — get/update/delete a session
- `GET/POST /api/sessions/:sessionId/locations` — list/add location points
- `POST /api/sessions/:sessionId/locations/batch` — batch add location points
- `GET /api/dashboard/summary` — dashboard summary stats
- `GET /api/dashboard/recent-activity` — recent activity feed

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
