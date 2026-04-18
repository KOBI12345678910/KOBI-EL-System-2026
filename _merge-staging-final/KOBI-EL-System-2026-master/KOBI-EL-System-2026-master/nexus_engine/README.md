# NEXUS Autonomous Engine v1.0

מנוע AI אוטונומי שמנהל שני עסקים:
1. **טכנו כל עוזי** — עבודות מתכת (80 שנה, תל אביב)
2. **קובי אלקיים נדל"ן** — נדל"ן יוקרה למשקיעים בינלאומיים

המנוע מקבל החלטות לבד דרך Claude API, משתפר כל הזמן, לומד מטעויות והצלחות. רץ ב-Node.js, בלי תלויות חיצוניות מעבר ל-SDK של Anthropic.

---

## Quick start

```bash
cd nexus_engine
npm install
export ANTHROPIC_API_KEY=sk-ant-xxx   # optional — runs in stub mode without
npm start                              # starts the engine alone
npm run start:with-api                 # starts engine + HTTP dashboard on :3030
npm test                               # smoke test (no API key needed)
```

Dashboard: http://localhost:3030/dashboard.html

---

## Architecture

```
nexus_engine/
├── nexus-engine.js           ← core: StateManager, Brain, GoalManager, Modules, Engine
├── nexus-with-api.js         ← production entry: engine + HTTP + all modules + bridge
├── package.json
├── README.md
│
├── modules/                  ← 10 advanced pluggable modules
│   ├── google-ads-optimizer.js      — auto-optimize campaigns (pause/rebid/rewrite)
│   ├── competitor-intel.js          — scan competitors for threats + opportunities
│   ├── seo-content-generator.js     — generate multilingual SEO content
│   ├── lead-scorer.js               — score inbound leads 0-100 + route
│   ├── cashflow-forecaster.js       — 30/60/90-day forecasts + liquidity risk
│   ├── market-trend-analyzer.js     — macro → business impact
│   ├── multi-language-translator.js — HE/EN/FR with brand glossary
│   ├── calendar-orchestrator.js     — auto-schedule meetings for hot leads
│   ├── document-extractor.js        — structured field extraction from docs
│   └── crisis-response-planner.js   — playbook-based crisis response
│
├── api/
│   └── http-server.js        ← REST API + self-contained HTML dashboard (no external deps)
│
├── bridge/
│   └── python-platform-bridge.js  ← bridges to enterprise_palantir_core (Python/FastAPI)
│
├── examples/
│   ├── 01-basic-run.js             — start the engine
│   ├── 02-add-custom-module.js     — add your own module
│   └── 03-bridge-to-python.js      — sync with Python platform
│
├── test/
│   └── smoke-test.js         ← verifies the whole stack without API key
│
└── nexus-data/               ← persisted state (state.json, goals.json, engine.log)
```

---

## The 6 core classes

### 1. `StateManager`
Persistent state in `nexus-data/state.json`. Dot-notation API:
```js
state.update("modules.google_ads.last_run", "2025-01-15");
state.get("modules.google_ads.last_run");
state.addMemory("patterns", { pattern: "CTR drops on weekends" });
```

### 2. `AIBrain`
Claude API wrapper with:
- Retry + exponential backoff on transient errors
- Robust JSON extraction (handles markdown fences, leading prose, mixed content)
- Deterministic **stub mode** when no API key — the engine still runs
- Three primary methods: `think()`, `makeDecision()`, `analyze()`, `selfReflect()`

### 3. `GoalManager`
Tracks 4 default goals (leads/day, ROAS, CPA, international leads) with milestones, history, and AI-powered evaluation.

### 4. `AlertSystem`
4 levels: `info` / `warning` / `critical` / `success`. Persists to memory.

### 5. `ModuleManager`
Plugin system. Every module implements `async run(state, brain, alerts)`.

### 6. `NexusEngine`
Main orchestrator with a perceive → reason → decide → act → learn loop. Every 10 cycles runs self-improvement. Every 5 cycles re-evaluates goals.

---

## The 10 advanced modules

Each one is a self-contained file in `modules/`. Register them on boot or drop-in at runtime.

| Module | What it does | Demo data |
|--------|--------------|-----------|
| **google-ads-optimizer** | Scans campaigns for CPA > ₪25 or ROAS < 8x, asks Claude what to do (pause/rebid/rewrite/shift budget), records intent | 4 stub campaigns (2 TKU, 2 Elkayam EN/FR) |
| **competitor-intel** | Monitors 3 competitors, detects threats + opportunities, raises alerts | HE + EN competitors |
| **seo-content-generator** | Generates SEO-optimized content in HE/EN/FR with title/meta/sections/CTA | 8 topic pipeline |
| **lead-scorer** | Scores leads 0-100 on source/language/budget/urgency/product/location, routes hot→agent/warm→email/cold→nurture | 4 stub leads |
| **cashflow-forecaster** | Linear-trend + EMA forecast of daily revenue for 30/60/90 days, computes projected cash position, flags liquidity risks | 30-day history per business |
| **market-trend-analyzer** | Reads macro (rates, FX, aluminum/steel, construction permits, consumer confidence), translates to business impact via Claude | 12 real-world indicators |
| **multi-language-translator** | HE↔EN↔FR with brand glossary for consistent translations | Luxury RE terminology |
| **calendar-orchestrator** | Auto-schedules hot leads into agent calendars, handles timezones for international clients | Pulls from lead-scorer output |
| **document-extractor** | Extracts structured fields (name, amount, date, ID) from quote requests / intake forms / invoices | 3 stub documents |
| **crisis-response-planner** | When a critical alert fires, auto-classifies crisis (supply/financial/reputation/legal/operational) and activates the matching playbook | 5 playbooks |

---

## HTTP API

Starts on `http://localhost:3030` when you run `nexus-with-api.js`.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Health + stats |
| GET | `/dashboard.html` | Self-contained HTML dashboard (auto-refresh 10s) |
| GET | `/state` | Full state snapshot |
| GET | `/state/:key` | State at dot-notation key |
| GET | `/goals` | List goals |
| POST | `/goals/:id/update` | `{current: number}` |
| GET | `/memory/:type?limit=50` | short_term / long_term / patterns / mistakes / successes |
| GET | `/alerts` | List all alerts |
| GET | `/alerts/unacknowledged` | Only unacked |
| POST | `/cycle/run-now` | Force one cycle immediately |
| GET | `/modules` | Registered modules + health |
| POST | `/decisions/simulate` | `{situation, options, context}` → decision |

---

## Python platform bridge

`bridge/python-platform-bridge.js` lets NEXUS talk to the `enterprise_palantir_core` Python platform (started separately).

```js
const { PalantirBridge } = require("./bridge/python-platform-bridge.js");
const bridge = new PalantirBridge();

const snapshot = await bridge.getSnapshot();          // live company picture
const pl = await bridge.getCompanyPL();                // full P&L
const risks = await bridge.getRiskLeaderboard();       // composite risk scoring
const anomalies = await bridge.getAnomalies();         // detected outliers
const tick = await bridge.runPythonOperatorTick();     // run Python AI operator cycle
```

Plus the `PalantirSyncModule` is a full NEXUS module that sync's the Python state every cycle:

```js
engine.modules.register("palantir_sync", PalantirSyncModule);
```

This means the two brains (Node.js NEXUS + Python enterprise_palantir_core) can **collaborate**: Nexus drives the business-side decisions, Palantir handles the deep operational intelligence (causal inference, KG embeddings, Bayesian beliefs, bandit learning), and they share state via HTTP.

---

## Stub mode

If you don't set `ANTHROPIC_API_KEY`, NEXUS runs in **stub mode**:
- `AIBrain.think()` returns deterministic JSON based on the prompt pattern
- All modules still run their full logic
- State, goals, alerts, HTTP API — everything works

This is how the smoke test runs: `npm test` takes zero API calls and verifies 30+ assertions in under a second.

---

## Key bug fixes vs the baseline

1. **`StateManager.get()`** — the original returned `null` for falsy values (`0`, `false`, `""`). Fixed to use explicit `undefined` check.
2. **JSON parsing** — centralized `extractJSON()` handles markdown fences, leading prose, array format, and falls back gracefully.
3. **AI Brain retries** — exponential backoff on transient errors (429, 5xx, network).
4. **Stub mode** — engine boots + runs without an API key for testing / demos.
5. **SIGINT/SIGTERM** — signal handlers registered only once, not every `start()`.
6. **Non-fatal file I/O** — log/state writes don't crash the engine if the FS is read-only.

---

## Run the full stack

```bash
# Terminal 1 — Python platform
cd enterprise_palantir_core
FORCE_SEED=true uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 2 — NEXUS with everything
cd nexus_engine
export ANTHROPIC_API_KEY=sk-ant-xxx
node nexus-with-api.js
```

Then open:
- **Nexus dashboard**: http://localhost:3030/dashboard.html
- **Palantir command center**: http://localhost:8000/command-center/techno_kol_uzi/dashboard.html

Two AI brains, two dashboards, one unified business.
