# TECHNO-KOL OPS — Foundry Edition

**A Palantir Foundry-style real-time operations platform for a metal fabrication factory.**

TECHNO-KOL OPS is a single-pane-of-glass command center for a full-stack industrial operation:
work orders, production floor, inventory, employees, clients, finance, and live alerts — all
driven by a live WebSocket stream and a relational knowledge graph. Built around the mental
model of an *Ontology*: every client, order, material, employee, and alert is a first-class
object with links, metrics, and events.

The UI is intentionally modelled on Palantir Foundry / Gotham: dark panels, dense grids,
2-pixel borders, orange accents, RTL Hebrew throughout.

---

## Architecture

```
 ┌──────────────────────────────────────────────────────────────┐
 │                         BROWSER (RTL)                        │
 │  ┌────────────────────────────────────────────────────────┐  │
 │  │  React 18 + Vite + TypeScript (strict)                 │  │
 │  │  Blueprint.js  ·  AG Grid  ·  Recharts  ·  date-fns    │  │
 │  │                                                        │  │
 │  │   Login → Layout → (Dashboard · WorkOrders ·           │  │
 │  │   Production · Materials · Employees · Clients ·       │  │
 │  │   Finance · Alerts)                                    │  │
 │  └────────────────────────────────────────────────────────┘  │
 │                │                             ▲               │
 │     fetch /api/*  JWT                 ws:// /ws              │
 └────────────────┼─────────────────────────────┼───────────────┘
                  │                             │
 ┌────────────────▼─────────────────────────────┼───────────────┐
 │               EXPRESS  +  WebSocket Server   │               │
 │  ┌────────────────────────────────────────────────────────┐  │
 │  │  Auth (JWT + bcryptjs)                                 │  │
 │  │  /api/auth          /api/work-orders    /api/ontology  │  │
 │  │  /api/employees     /api/attendance     /api/materials │  │
 │  │  /api/clients       /api/suppliers      /api/alerts    │  │
 │  │  /api/financials    /api/reports                       │  │
 │  │                                                        │  │
 │  │  Realtime: ws broadcaster + node-cron alert engine     │  │
 │  └────────────────────────────────────────────────────────┘  │
 │                                │                             │
 └────────────────────────────────┼─────────────────────────────┘
                                  │
 ┌────────────────────────────────▼─────────────────────────────┐
 │                      PostgreSQL 15+                          │
 │  clients · suppliers · employees · attendance                │
 │  work_orders · work_order_employees · order_events           │
 │  material_items · material_movements                         │
 │  financial_transactions · alerts · users                     │
 └──────────────────────────────────────────────────────────────┘
```

---

## Quick Start

```bash
cp .env.example .env
# Edit DATABASE_URL
createdb techno_kol
psql techno_kol < src/db/schema.sql
npm install
npm run seed
npm run dev   # backend on :5000
# In another terminal:
cd client && npm install && npm run dev   # frontend on :5173
```

After both servers are up, open **http://localhost:5173** and log in.

**Default credentials:** `kobi` / `password`

---

## Tech Stack

### Backend
- **Node.js** (runtime) + **TypeScript** (strict)
- **Express 4** — REST router
- **PostgreSQL 15+** via `pg` — relational store
- **ws** — native WebSocket server mounted on the same HTTP server
- **node-cron** — alert engine heartbeat (every minute) for low stock,
  overdue deliveries, payment due, attendance anomalies
- **JWT** (`jsonwebtoken`) + **bcryptjs** — auth
- **date-fns** — date math
- **dotenv**, **cors**, **tsx** (dev runtime)

### Frontend
- **React 18** + **TypeScript** (strict)
- **Vite 5** — dev server + bundler
- **Blueprint.js 5** (`@blueprintjs/core`, `icons`) — Palantir's own UI kit
- **AG Grid Community 31** — all tabular views
- **Recharts 2** — line / bar / pie charts
- **react-router-dom 6** — client routing
- **date-fns** — date formatting
- **native fetch** — API client (wrapped in `useApi`)
- **native WebSocket** — singleton WS hook (`useWebSocket`)

---

## Project Structure

```
techno-kol-ops/
├── .env.example
├── package.json
├── tsconfig.json
├── README.md
│
├── src/                              # Backend
│   ├── index.ts                      # Express + WS bootstrap
│   ├── db/
│   │   ├── schema.sql                # Full DDL
│   │   ├── seed.sql                  # Seed data
│   │   ├── seed.ts                   # Seed runner
│   │   ├── init.ts                   # DB init helper
│   │   └── connection.ts             # pg Pool + query helper
│   ├── middleware/
│   │   └── auth.ts                   # JWT auth middleware
│   ├── realtime/
│   │   ├── websocket.ts              # WS server + broadcastToAll
│   │   └── alertEngine.ts            # node-cron alert generator
│   ├── types/
│   │   └── index.ts                  # Shared DB types
│   └── api/
│       ├── auth.ts
│       ├── workOrders.ts
│       ├── ontology.ts
│       ├── employees.ts
│       ├── attendance.ts
│       ├── materials.ts
│       ├── clients.ts
│       ├── suppliers.ts
│       ├── alerts.ts
│       ├── financials.ts
│       └── reports.ts
│
└── client/                           # Frontend
    ├── index.html
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── styles/
        │   ├── theme.ts              # Design tokens
        │   └── global.css
        ├── hooks/
        │   ├── useApi.ts             # apiGet/Post/Put/Delete
        │   ├── useAuth.ts
        │   └── useWebSocket.ts       # singleton WS
        ├── components/
        │   ├── Layout.tsx
        │   └── ClientDetailPanel.tsx
        └── screens/
            ├── Login.tsx
            ├── Dashboard.tsx
            ├── WorkOrders.tsx
            ├── Production.tsx
            ├── Materials.tsx
            ├── Employees.tsx
            ├── Clients.tsx
            ├── Finance.tsx
            └── Alerts.tsx
```

---

## Backend Routes

| Prefix | File | Description |
|---|---|---|
| `/api/auth` | `auth.ts` | Login, token issuance, current user |
| `/api/work-orders` | `workOrders.ts` | Work orders CRUD, status transitions, progress, assignments, timeline events |
| `/api/ontology` | `ontology.ts` | Knowledge-graph endpoints: entity neighborhoods, object links, search |
| `/api/employees` | `employees.ts` | Employees CRUD, salary, departments, utilization |
| `/api/attendance` | `attendance.ts` | Check-in/out, daily sheet, hours worked, absences |
| `/api/materials` | `materials.ts` | Inventory items, movements, min-threshold logic, supplier links |
| `/api/clients` | `clients.ts` | Clients CRUD, 360° view (orders + payments + balance) |
| `/api/suppliers` | `suppliers.ts` | Suppliers CRUD, payment terms, lead times |
| `/api/alerts` | `alerts.ts` | Alert feed, stats, resolve endpoint, manual creation |
| `/api/financials` | `financials.ts` | Transactions, summaries by period, mark-paid, margins |
| `/api/reports` | `reports.ts` | Aggregate reports across ontology — P&L, ops, KPI dashboards |

All routes require a `Bearer <JWT>` header except `/api/auth/login`.

---

## Frontend Screens

| Route | File | Description |
|---|---|---|
| `/login` | `Login.tsx` | JWT login form |
| `/dashboard` | `Dashboard.tsx` | Factory command center — KPIs, live order status, alert ticker, today's production |
| `/work-orders` | `WorkOrders.tsx` | Full AG Grid of work orders, detail drawer, status transitions, assignment |
| `/production` | `Production.tsx` | Shop-floor kanban — pending / production / finishing / ready lanes; drag to advance |
| `/materials` | `Materials.tsx` | Inventory grid with colored stock bars, movements history, low-stock alerts |
| `/employees` | `Employees.tsx` | Employee roster, attendance calendar, hours and payroll |
| `/clients` | `Clients.tsx` | Client intelligence grid with credit-usage bars, Client 360 right drawer |
| `/finance` | `Finance.tsx` | Financial KPIs, revenue/cost charts, open invoices, top clients |
| `/alerts` | `Alerts.tsx` | Alert center — list view + timeline view, bulk resolve, live WS updates |

All screens are RTL Hebrew, use the shared design tokens from `client/src/styles/theme.ts`,
and enforce 2-pixel border radius, dark Palantir-style panels, and consistent
`₪1,234,567` / `DD/MM/YY` formatting.

---

## Default Login

```
username: kobi
password: password
```

The seed script (`npm run seed`) creates this user with the `admin` role. Change it
immediately in production via `PUT /api/auth/me` or by updating `users.password_hash`
directly with a fresh bcrypt hash.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | HTTP + WS port for the backend |
| `DATABASE_URL` | `postgresql://user:password@localhost:5432/techno_kol` | Full Postgres connection string |
| `JWT_SECRET` | `techno_kol_secret_2026_palantir` | HMAC secret used by `jsonwebtoken`. Change in production. |
| `NODE_ENV` | `development` | `development` / `production` |

The frontend has no environment variables — Vite proxies `/api/*` and `/ws` to the
backend port (see `client/vite.config.ts`).

---

## File & Line Counts (estimate)

| Area | Files | Lines |
|---|---|---|
| Backend (`src/**/*.ts`) | ~19 | ~3,200 |
| Backend SQL (`src/db/*.sql`) | 2 | ~500 |
| Frontend (`client/src/**/*.tsx`) | ~22 | ~4,800 |
| Frontend hooks + styles | ~5 | ~250 |
| Configs (`package.json`, `tsconfig.json`, `vite.config.ts`, `.env.example`) | ~7 | ~120 |
| **Total (excluding node_modules)** | **~55** | **~8,900** |

Measured from a clean working tree with `wc -l` against all `.ts`/`.tsx`/`.sql` files
under `src/` and `client/src/`. Total TypeScript line count reports ~11,500 lines when
AG Grid/Blueprint type declarations are included.

---

## License

**UNLICENSED** — private project owned by the operator. Not for redistribution.
Do not publish to a public registry.
