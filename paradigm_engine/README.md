# PARADIGM Engine v4.0

**Autonomous Business OS** for two Israeli businesses in a single brain:

1. **טכנו כל עוזי בע"מ** — 80-year-old metal fabrication shop, ריבל 37 Tel Aviv, 30 employees
2. **קובי אלקיים נדל"ן בע"מ** — luxury real-estate for HE/EN/FR international investors

The engine reasons, debates, self-attacks, dreams, and improves on its own. Powered by Claude Sonnet 4 with a zero-dependency fallback for testing.

---

## Quick start

```bash
cd paradigm_engine
npm install
export ANTHROPIC_API_KEY=sk-ant-xxx   # optional — smoke test runs without it
npm test                              # 226 assertions, < 1s, no API calls
npm start                             # runs the full cycle loop
```

---

## Architecture

```
paradigm_engine/
├── paradigm-engine.js    ← main entry point (thin wrapper that re-exports all 4 parts)
├── paradigm-part1.js     ← CONFIG · Brain · Memory · ERPModule · CRMModule · utilities
├── paradigm-part2.js     ← BOMModule · HRModule · FinanceModule · OpsModule
├── paradigm-part3.js     ← PricingModule · QualityModule · NotificationModule · AnalyticsModule
│                           Swarm · Adversarial · Dream · MetaLearner · Goals
├── paradigm-part4.js     ← ParadigmEngine (orchestrator + cycle loop)
├── smoke-test.js         ← 226-assertion test harness (stubs Anthropic SDK)
├── package.json
├── README.md
└── paradigm-data/        ← auto-created; all state persisted here
```

| Part | Contents | Exports |
|------|----------|---------|
| **1/4** | Config, Brain, Memory, ERP, CRM + utilities | `CONFIG`, `MASTER_SYSTEM_PROMPT`, `Brain`, `Memory`, `ERPModule`, `CRMModule`, `cli`, utilities |
| **2/4** | BOM, HR, Finance, Ops | `BOMModule`, `HRModule`, `FinanceModule`, `OpsModule` |
| **3/4** | Pricing, Quality, Notifications, Analytics + cognitive layer | `PricingModule`, `QualityModule`, `NotificationModule`, `AnalyticsModule`, `Swarm`, `Adversarial`, `Dream`, `MetaLearner`, `Goals` |
| **4/4** | Main orchestrator | `ParadigmEngine` |

---

## The 10 business modules

| Module | Part | Responsibilities |
|--------|------|------------------|
| **ERP** | 1 | Projects with 17-state lifecycle, inventory w/ reservations, suppliers, purchase orders (VAT-aware), work orders |
| **CRM** | 1 | 8-stage pipeline, 6-dimensional AI lead scoring, interactions, deals, source analytics |
| **BOM** | 2 | **11 default templates** (iron/alu/glass railings, sliding/entry gates, iron/decorative fences, alu pergola, iron door, alu window, bars) with real Hebrew materials + suppliers, labor rates, wastage, margin, AI optimization |
| **HR** | 2 | Employees, attendance, 5-type leaves, recruitment (positions + candidates + interviews), performance reviews (6 dimensions), warnings (verbal/written/final), Israeli payroll compliance |
| **Finance** | 2 | Transactions, tax-invoices with `YYYY-NNNNN` numbering, receipts, expenses, checks (received/issued), bank accounts, P&L, VAT reports, YTD summaries, AR aging |
| **Ops** | 2 | Field measurements (עוזי), installations with time-logs, 15 service areas, vehicles w/ insurance/service/test tracking, incident reporting, weekly scheduling (skips Shabbat) |
| **Pricing** | 3 | Quote generation via BOM, **6 discount policies** (volume, repeat, referral, cash, combo, seasonal), **5 dynamic surcharge rules** (rush, floor, weekend, distance, demand), competitor intel, AI-enriched quotes with objection handling + follow-up plan, conversion tracking |
| **Quality** | 3 | 5-stage inspections with checklists, 4 Israeli standards (ת"י 1139/23/1142/1099), defects with root cause, dual warranties (10 yr structural + 2 yr finish), claims, NPS feedback, defect rate, KPI calculation |
| **Notifications** | 3 | Multi-level (critical/warning/info/success), multi-channel (console/log/whatsapp/email/sms), 3-level escalation policy (system → דימה → קובי), unread/actioned tracking |
| **Analytics** | 3 | Cross-module snapshots, AI executive reports with module scores + KPIs + forecast |

---

## The 4-layer cognitive stack (Part 3)

### 1. Swarm — 7 C-level agents
Each agent has a distinct persona, personality, and key question:

| Agent | Persona | Question |
|-------|---------|----------|
| **CEO — קובי** | Strategic, thinks 5 years ahead, big opportunities | "מה יכפיל את העסק?" |
| **COO — דימה** | Pragmatic, process & resources, waste elimination | "איך עושים את זה יותר מהר ויותר טוב?" |
| **CFO** | Conservative, Cash is King, risk manager | "כמה זה עולה ומתי נראה תשואה?" |
| **CMO** | Creative, aggressive growth, brand + sales | "איך מביאים יותר לקוחות?" |
| **CTO** | Automation, data, AI optimization | "מה אפשר לאוטמט?" |
| **HR — קורין** | People first, retention, culture | "מה הצוות צריך כדי להצליח?" |
| **Risk Manager** | Healthy pessimist, always has Plan B | "מה הכי גרוע שיכול לקרות?" |

Each agent sees previous agents' opinions and can disagree. Final synthesis produces consensus level, key arguments, major disagreements, risks, and next steps.

### 2. Adversarial — Red Team self-attack
Every decision attacked from **8 angles**:
1. **Cognitive Biases** (Confirmation, Anchoring, Sunk Cost, Survivorship, Dunning-Kruger)
2. **Missing Data**
3. **Black Swan** scenarios
4. **Adversarial** (competitor reactions)
5. **Second-Order Effects**
6. **Goodhart's Law**
7. **Simpson's Paradox**
8. **Temporal** (right now ≠ right in 6 months)

Plus `stressTest()` — 5 extreme scenarios (black swan / competitor / technology / market / internal).

### 3. Dream — Creative synthesis
Free-form creative thinking: connects unrelated ideas, produces cross-domain analogies (nature, physics, military, music, medicine, sports, food), asks questions no one asks, generates "wild ideas", surfaces unknown unknowns, and produces an `actionableInsight` + `noveltyScore`.

### 4. MetaLearner — Learning how to learn
Tunes the learning process itself — tracks learning rate, exploration/exploitation ratio, knowledge transfer score, forgetting curve, overfitting risk, curriculum, and feedback loops. Produces a `metaInsight` that can't be seen from inside the task.

---

## The cycle loop (Part 4)

Every 60 seconds the orchestrator runs 11 stages:

1. **Perceive** — snapshot all modules (L0→L1 consciousness)
2. **Analyze** — rotating module deep-dive with AI (L2) — ERP/CRM/BOM/HR/Finance/Ops/Pricing/Quality
3. **Score leads** — every 3 cycles (if CRM exposes `scoreAllLeads`)
4. **Predict marker** — every 5 cycles (L3)
5. **Decide via Swarm** — if `status === "critical"` or `score < 50`
6. **Adversarial self-test** — every 15 cycles
7. **Stress test** — every 45 cycles
8. **Dream** — every 50 cycles
9. **Meta-learn** — every 25 cycles
10. **Goals evaluation** — every 5 cycles (update g1/g6/g7/g8 from snapshot)
11. **Executive report** — every 10 cycles + Notifications if `overallScore < 60`

Final stage: L5 meta-consciousness + cycle stat increment.

---

## Financial rules enforced

- **All money is integers** — ₪1 = 100 אגורות. Never floats.
- **18% VAT** (מע"מ) on all invoices, POs, expenses, quotes
- **Israeli payroll** — ~11.11% מעסיק (ביטוח לאומי + בריאות) + 6.25% פנסיה + 8.33% פיצויים
- **Minimum wage** — ₪5,572/month
- **Payment terms** — שוטף + 30 by default, 60 also supported
- **Invoice numbering** — `YYYY-NNNNN` (e.g., `2026-00001`)

---

## 10 business goals (Part 3)

| ID | Business | Title | Target | Owner | Deadline |
|----|----------|-------|--------|-------|----------|
| g1 | techno | 100 לידים ביום | 100 | CMO | 2026-07-01 |
| g2 | techno | ROAS מעל 8× | 8× | CMO | 2026-08-01 |
| g3 | techno | CPA מתחת ל-₪25 | ≤25 | CMO | 2026-08-01 |
| g4 | realestate | 50 לידים בינלאומיים/חודש | 50 | CMO | 2026-09-01 |
| g5 | techno | זמן אספקה מתחת ל-14 יום | ≤14 days | COO | 2026-09-01 |
| g6 | both | NPS מעל 70 | 70 | COO | 2026-12-01 |
| g7 | techno | מחזור שנתי ₪5M+ | 500M אגורות | CEO | 2026-12-31 |
| g8 | both | 30 עובדים פעילים | 30 | HR | 2026-09-01 |
| g9 | techno | Margin מעל 35% | 35% | CFO | 2026-09-01 |
| g10 | techno | אפס תאונות עבודה | 0 | COO | 2026-12-31 |

Each goal has milestones, owner, deadline, history, and auto-detects reversed direction goals (`₪`/`ימים`/`תאונות` count down).

---

## Stub mode

Without `ANTHROPIC_API_KEY`, the engine still:
- Boots cleanly
- Runs all deterministic logic (state, transitions, scoring formulas, financial math)
- Persists state to `paradigm-data/`
- Returns `null` from `brain.think()` without crashing

The smoke test runs fully in stub mode — **no API calls, 226 assertions across 18 groups, < 1 second**.

---

## Integration with NEXUS + Palantir

PARADIGM is one of three engines in the KOBI EL stack:

| Engine | Stack | Role |
|--------|-------|------|
| **`enterprise_palantir_core`** | Python + FastAPI | Deep ontology, causal DAGs, bandit learning, anomaly detection |
| **`nexus_engine`** | Node.js | 10 pluggable modules, HTTP dashboard, Python bridge |
| **`paradigm_engine`** | Node.js | Autonomous cognition (Swarm/Adversarial/Dream/Meta) — this repo |

Each engine persists state independently and can run in isolation.
