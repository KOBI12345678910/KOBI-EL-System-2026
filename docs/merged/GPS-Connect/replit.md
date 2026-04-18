# GPS Tracker App

## Overview

A GPS tracking and navigation web app built with React + Vite, Leaflet/OpenStreetMap, Express 5, and PostgreSQL. Features include interactive map, location tracking, location sharing via codes, saved places management, and tracking history.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + Tailwind CSS + shadcn/ui
- **Maps**: Leaflet + react-leaflet + OpenStreetMap
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/gps-app run dev` — run GPS frontend locally

## Features

- **Map View**: Full-screen interactive map with dark theme tiles, GPS location tracking, search bar, saved places markers
- **Dashboard**: Overview stats (distance, places, sessions, tracked points), recent sessions list
- **Location Sharing**: Create share sessions with unique codes, look up shared locations with mini-map
- **Saved Places**: Manage favorite locations with categories (home, work, food, outdoors), add via current location or coordinates
- **History**: Browse tracking sessions, view session paths on map with start/end markers

## Database Tables

- `locations` — GPS location tracking points with session grouping
- `share_sessions` — Location sharing sessions with unique codes and expiry
- `saved_places` — Favorite/saved places with categories

## API Routes

All routes under `/api`:
- `POST /locations` — Save location update
- `GET /locations` — Get location history (filterable by sessionId)
- `GET /locations/stats` — Get location tracking statistics
- `GET /locations/recent-sessions` — Get recent tracking sessions
- `POST /locations/share` — Create share session
- `GET /locations/share/:shareCode` — Get shared location
- `POST /locations/share/:shareCode/update` — Update shared location
- `GET /saved-places` — List saved places
- `POST /saved-places` — Create saved place
- `DELETE /saved-places/:id` — Delete saved place

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
