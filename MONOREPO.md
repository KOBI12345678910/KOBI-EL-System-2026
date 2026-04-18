# Techno-Kol Uzi ERP 2026 — Unified Monorepo

מדריך מהיר לעבודה עם המערכת המאוחדת.

## The 5 Services

| Service                | Port | Role                              | Location                |
|------------------------|------|-----------------------------------|-------------------------|
| **techno-kol-ops**     | 3200 | Operational Core (hub)            | `techno-kol-ops/`       |
| **onyx-procurement**   | 3100 | Finance & Procurement backbone    | `onyx-procurement/`     |
| **onyx-ai**            | 3300 | Intelligence & Automation layer   | `onyx-ai/`              |
| **payroll-autonomous** | 5173 | Workforce & Salary engine         | `payroll-autonomous/`   |
| **vm-task-runner**     | 3400 | Scheduled job executor (**new**)  | `vm-task-runner/`       |

## Quick Start

```bash
# 1. Install ALL services at once (npm workspaces handles it)
npm install

# 2. Start everything in parallel (5 services, one terminal)
npm run dev

# 3. Check status of all services
npm run status

# 4. See port map
npm run ports
```

## Commands

### Development
| Command                | What it does                                    |
|------------------------|-------------------------------------------------|
| `npm run dev`          | Run all 5 services in parallel (colored logs)   |
| `npm run dev:ops`      | Only techno-kol-ops                             |
| `npm run dev:proc`     | Only onyx-procurement                           |
| `npm run dev:ai`       | Only onyx-ai                                    |
| `npm run dev:payroll`  | Only payroll-autonomous                         |
| `npm run dev:vm`       | Only vm-task-runner                             |

### Build / Test / Lint
| Command                | What it does                                    |
|------------------------|-------------------------------------------------|
| `npm run build`        | Build every service that has a `build` script   |
| `npm test`             | Run tests across all workspaces                 |
| `npm run lint`         | Lint across all workspaces                      |

### Docker (full stack)
| Command                | What it does                                    |
|------------------------|-------------------------------------------------|
| `npm run docker:up`    | `docker compose up -d` — bring up full stack    |
| `npm run docker:down`  | Stop and remove containers                      |
| `npm run docker:logs`  | Tail logs from every service                    |
| `npm run docker:build` | Rebuild images                                  |

### Observability
| Command                | What it does                                    |
|------------------------|-------------------------------------------------|
| `npm run status`       | HTTP health-check each service, print table    |
| `npm run ports`        | Print the port map                              |

## What changed when we "unified"

Before:
- 4 separate services, each with its own `package.json`, its own `npm install`
- No single place to "start everything"
- No shared tooling at the root

After:
- One **root `package.json`** with npm workspaces
- One **`npm install`** installs every service + all shared packages (`packages/shared-*`)
- One **`npm run dev`** runs all 5 services together
- **vm-task-runner** added as the 5th service — covers scheduled jobs, which was missing
- Docker compose updated so `docker compose up` brings the whole thing

Nothing in the individual services was modified — the unification is additive.

## File Layout

```
techno-kol-uzi-2026/
├── package.json              ← NEW: monorepo root
├── .npmrc                    ← NEW: workspace settings
├── MONOREPO.md               ← this file
├── docker-compose.yml        ← includes all 5 services
├── scripts/
│   ├── status.js             ← NEW: health dashboard
│   └── ports.js              ← NEW: port map printer
│
├── techno-kol-ops/           ← workspace (existed)
├── onyx-procurement/         ← workspace (existed)
├── onyx-ai/                  ← workspace (existed)
├── payroll-autonomous/       ← workspace (existed)
├── vm-task-runner/           ← NEW workspace
│   ├── package.json
│   ├── Dockerfile
│   ├── README.md
│   └── src/
│       ├── index.js
│       ├── jobs.js
│       ├── queue.js
│       └── health.js
│
├── packages/                 ← shared libraries (workspaces)
│   ├── shared-audit/
│   ├── shared-events/
│   ├── shared-observability/
│   ├── shared-permissions/
│   ├── shared-types/
│   ├── shared-ui/
│   ├── shared-validation/
│   └── shared-workflows/
│
├── nexus_engine/             ← workspace (autonomous AI engine)
├── paradigm_engine/          ← workspace (business OS)
│
├── enterprise_palantir_core/ ← Python — not a workspace
├── palantir_realtime_core/   ← Python — not a workspace
├── mobile-app/               ← React Native workspace
├── AI-Task-Manager/          ← side project, workspace
└── GPS-Connect/              ← side project
```

## Next steps

1. Run `npm install` from the root. This may take a while the first time — it links every workspace.
2. Run `npm run dev` to start everything.
3. Check `http://localhost:3400/health` to confirm vm-task-runner is alive.
4. `npm run status` shows a dashboard of all services at once.

---
© 2026 Kobi Elkayam — Techno-Kol Uzi + Elkayam Real Estate
