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
npm test                              # 215 assertions, < 1s, no API calls
npm start                             # runs the full cycle loop
```

---

## Architecture

```
paradigm_engine/
├── paradigm-engine.js    ← main entry point (thin wrapper that re-exports all 4 parts)
├── paradigm-part1.js     ← CONFIG · Brain · Memory · ERPModule · CRMModule · utilities (~1,270 lines)
├── paradigm-part2.js     ← BOMModule · HRModule · FinanceModule · OpsModule (~1,540 lines)
├── paradigm-part3.js     ← PricingModule · MarketingModule · QualityModule · NotificationModule · AnalyticsModule (~800 lines)
├── paradigm-part4.js     ← SwarmCouncil · AdversarialEngine · DreamEngine · MetaLearner · GoalManager · ParadigmEngine (~660 lines)
├── smoke-test.js         ← 215-assertion test harness (stubs Anthropic SDK)
├── package.json
├── README.md
└── paradigm-data/        ← auto-created; all state persisted here
```

Each part is a standalone Node module:

| Part | Contents | Exports |
|------|----------|---------|
| **1/4** | Config, Brain, Memory, ERP, CRM + utilities | `CONFIG`, `Brain`, `Memory`, `ERPModule`, `CRMModule`, `MASTER_SYSTEM_PROMPT`, `cli`, utilities |
| **2/4** | BOM, HR, Finance, Ops | `BOMModule`, `HRModule`, `FinanceModule`, `OpsModule` |
| **3/4** | Pricing, Marketing, Quality, Notifications, Analytics | `PricingModule`, `MarketingModule`, `QualityModule`, `NotificationModule`, `AnalyticsModule` |
| **4/4** | Swarm, Adversarial, Dream, Meta, Goals, orchestrator | `AGENT_ROLES`, `SwarmCouncil`, `AdversarialEngine`, `DreamEngine`, `MetaLearner`, `GoalManager`, `ParadigmEngine` |

---

## The 11 business modules

| Module | Part | Responsibilities |
|--------|------|------------------|
| **ERP** | 1 | Projects with 17-state lifecycle, inventory w/ reservations, suppliers, purchase orders (VAT-aware), work orders |
| **CRM** | 1 | 8-stage pipeline, 6-dimensional AI lead scoring, interactions, deals, source analytics |
| **BOM** | 2 | **11 default templates** (iron/alu/glass railings, sliding/entry gates, iron/decorative fences, alu pergola, iron door, alu window, bars) with real Hebrew materials + hebrew suppliers, labor rates, wastage, 35% target margin, AI optimization |
| **HR** | 2 | Employees, attendance, vacation/sick/personal leaves, recruitment (positions + candidates + interviews), performance reviews (6 dimensions), warnings (verbal/written/final), Israeli payroll compliance |
| **Finance** | 2 | Transactions, invoices with `YYYY-NNNNN` numbering, receipts, expenses, checks (received/issued), bank accounts, P&L, VAT reports, YTD summaries, AR aging |
| **Ops** | 2 | Field measurements (עוזי), installations with time-logs, 15 service areas, vehicles w/ insurance/service/test tracking, incident reporting with severity, weekly scheduling (skips Shabbat), AI-assisted daily planning |
| **Pricing** | 3 | Quotes with AI reasoning, 4-tier volume discounts, repeat customer + referral + cash bonuses, competitor intel, win/loss history, win probability |
| **Marketing** | 3 | 7 ad channels (Google/Facebook/Instagram/TikTok/SEO/WhatsApp/Email), campaigns with CPL/ROAS tracking, AI-generated SEO content |
| **Quality** | 3 | Inspections at 5 stages, defects with root cause + corrective/preventive actions, 10-year warranties, claims, complaints, 5 live KPIs |
| **Notifications** | 3 | 9 Hebrew templates, multi-channel queue (WhatsApp/SMS/Email/Push) with daily limits + retry logic |
| **Analytics** | 3 | Cross-module snapshots, AI executive reports, trend analysis |

---

## The 4-layer cognitive stack

### 1. Swarm Council — 7 C-level agents (Part 4)
CEO · COO · CFO · CMO · CTO · HR Director · Risk Manager — each with a distinct system prompt, perspective, and priorities. For critical situations, a 3-round debate runs:
1. Independent opening statements (each agent speaks from their role)
2. Cross-examination with other agents' positions (agree/disagree/compromise)
3. Synthesis by a meta-arbiter → consensus, dissent, final decision

### 2. Adversarial Engine — Red Team (Part 4)
Every decision is attacked for:
- **7 cognitive biases** (confirmation, anchoring, overconfidence, sunk cost, availability, Dunning-Kruger, groupthink)
- **Black swans** with probability/impact estimates (regulation, competition, war, inflation, etc.)
- **Second- and third-order effects**
- **Goodhart's Law**, unintended consequences, moral hazard
- **Reversibility & kill criteria**
- **Counter-party reactions** (customers, suppliers, employees, competitors)

If the Red Team's verdict is `reject`, the decision is killed.

### 3. Dream Engine — Creative synthesis (Part 4)
Every 50 cycles, enters "dream mode":
- Cross-domain analogies (nature, physics, music, military, medicine, biology)
- Unknown unknowns
- Hidden patterns
- Emergent strategy
- "Insight of the night"

### 4. Meta Learner — Learning how to learn (Part 4)
Every 25 cycles:
- Tunes learning rate (0.05–0.5) and exploration ratio (0.1–0.5)
- Derives new rules from experience (stored only if confidence > 0.7)
- Detects overfitting risk
- Identifies blind spots
- Proposes next experiment

---

## The cycle loop

Every 60 seconds the orchestrator runs 11 stages:

1. **Perceive** — snapshot all modules (L0→L1 consciousness)
2. **Analyze** — one rotating module deep-dives with AI (L2) — ERP/CRM/BOM/HR/Finance/Ops/Pricing/Marketing/Quality
3. **Score leads** — every 3 cycles
4. **Process notifications**
5. **Predict** — every 5 cycles (L3)
6. **Decide via Swarm** — if `status === "critical"` or `score < 50` (L4)
7. **Adversarial test** — every 15 cycles
8. **Dream** — every 50 cycles
9. **Meta-learn** — every 25 cycles
10. **Executive report** — every 10 cycles
11. **Update goals** + L5 meta-consciousness

---

## Financial rules enforced

- **All money is integers** — ₪1 = 100 agorot. Never floats.
- **18% VAT** (מע"מ) on all invoices, POs, expenses, quotes
- **Israeli payroll** — ~11.11% מעסיק (ביטוח לאומי + בריאות) + 6.25% פנסיה + 8.33% פיצויים
- **Minimum wage** — ₪5,572/month
- **Standard month** — 186 hours, 125% overtime (first 2h), 150% Shabbat
- **Payment terms** — שוטף + 30 by default, 60 also supported
- **Invoice numbering** — `YYYY-NNNNN` (e.g., `2026-00001`)

---

## 10 tracked goals

| ID | Metric | Target | Horizon |
|----|--------|--------|---------|
| G1 | leads/day | 8 | monthly |
| G2 | monthly revenue | ₪150,000 (15M agorot) | monthly |
| G3 | gross margin | 35% | quarterly |
| G4 | customer satisfaction | 95% | quarterly |
| G5 | on-time delivery | 90% | monthly |
| G6 | quote win rate | 45% | monthly |
| G7 | inventory turnover | 12×/yr | quarterly |
| G8 | international leads | 30/mo | monthly |
| G9 | avg cycle time | 14 days | monthly |
| G10 | defect rate | ≤2% | quarterly |

---

## Stub mode

Without `ANTHROPIC_API_KEY`, the engine still:
- Boots cleanly
- Runs all deterministic logic (state, transitions, scoring formulas, financial math)
- Persists state to `paradigm-data/`
- Returns `null` from `brain.think()` without crashing

The smoke test runs fully in stub mode — **no API calls, 215 assertions across 18 groups, < 1 second**.

---

## Integration with NEXUS + Palantir

PARADIGM is one of three engines in the KOBI EL stack:

| Engine | Stack | Role |
|--------|-------|------|
| **`enterprise_palantir_core`** | Python + FastAPI | Deep ontology, causal DAGs, bandit learning, anomaly detection |
| **`nexus_engine`** | Node.js | 10 pluggable modules, HTTP dashboard, Python bridge |
| **`paradigm_engine`** | Node.js | Autonomous cognition (Swarm/Adversarial/Dream/Meta) — this repo |

Each engine persists state independently and can run in isolation.
