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
npm test                              # 131 assertions, < 1s, no API calls
npm start                             # runs the full cycle loop
```

---

## Architecture

```
paradigm_engine/
├── paradigm-engine.js    ← single-file engine (~3,860 lines, 10 modules + 4 cognitive layers)
├── smoke-test.js         ← 131-assertion test harness (stubs Anthropic SDK)
├── package.json
└── paradigm-data/        ← auto-created; all state persisted here
```

All 4 parts of the engine are merged into one file:

| Part | Contents |
|------|----------|
| **1/4** | CONFIG · Brain · Memory · ERPModule · CRMModule |
| **2/4** | BOMModule · HRModule · FinanceModule |
| **3/4** | OpsModule · PricingModule · QualityModule · NotificationModule · AnalyticsModule |
| **4/4** | SwarmCouncil (7 agents) · AdversarialEngine · DreamEngine · MetaLearner · GoalManager · ParadigmEngine |

---

## The 10 business modules

| Module | Responsibilities |
|--------|------------------|
| **ERP** | Projects with 17-state lifecycle, inventory w/ reservations, suppliers, purchase orders (VAT-aware), work orders |
| **CRM** | 8-stage pipeline, 6-dimensional AI lead scoring, interactions, deals, source analytics |
| **BOM** | 5 default templates (iron/alu/glass railings, electric gate, pergola), integer-agorot cost math, 35% target margin, overhead automation |
| **HR** | Employees, attendance, vacation/sick days, recruitment, performance reviews, Israeli-compliant payroll (ביטוח לאומי + מס הכנסה + פנסיה) |
| **Finance** | Invoices with `YYYY-NNNNN` numbering, payments, expenses, VAT reports, P&L, AR aging, bank accounts |
| **Ops** | Field measurements (עוזי), installations, 3 vehicles, incident reporting, AI-assisted daily planning |
| **Pricing** | Price book, tiered volume discounts, BOM integration, AI-generated quotes with win probability |
| **Quality** | Inspections, defect tracking, 10-year warranties, complaints, 4 live KPIs |
| **Notifications** | 8 Hebrew templates, multi-channel queue (WhatsApp/SMS/Email), retry logic |
| **Analytics** | Snapshots, AI executive reports, trend analysis |

---

## The 4-layer cognitive stack

### 1. Swarm Council — 7 C-level agents
CEO · COO · CFO · CMO · CTO · HR Director · Risk Manager — each with a distinct perspective and priorities. For critical situations, a 3-round debate runs:
1. Independent opening statements
2. Cross-examination with other agents' positions
3. Synthesis by a meta-arbiter → final decision

### 2. Adversarial Engine — Red Team
Every decision is attacked for:
- **6 cognitive biases** (confirmation, anchoring, overconfidence, sunk cost, availability, Dunning-Kruger)
- **Black swans** with probability/impact estimates
- **Second- and third-order effects**
- **Goodhart's Law**, unintended consequences, moral hazard
- **Reversibility & kill criteria**

If the Red Team's verdict is `reject`, the decision is killed.

### 3. Dream Engine — Creative synthesis
Every 50 cycles, enters "dream mode":
- Cross-domain analogies (nature, physics, music, military, medicine)
- Unknown unknowns
- Hidden patterns
- Emergent strategy

### 4. Meta Learner — Learning how to learn
Every 25 cycles:
- Tunes learning rate and exploration ratio
- Derives new rules from experience
- Detects overfitting risk
- Identifies blind spots

---

## The cycle loop

Every 60 seconds:

1. **Perceive** — snapshot all modules (L0→L1 consciousness)
2. **Analyze** — one rotating module deep-dives with AI (L2)
3. **Score leads** — every 3 cycles
4. **Process notifications**
5. **Predict** — every 5 cycles (L3)
6. **Decide via Swarm** — if critical (L4)
7. **Adversarial test** — every 15 cycles
8. **Dream** — every 50 cycles
9. **Meta-learn** — every 25 cycles
10. **Executive report** — every 10 cycles
11. **Update goals** — always
12. **Finalize** — L5 meta-consciousness

---

## Financial rules enforced

- **All money is integers** — ₪1 = 100 agorot. Never floats.
- **18% VAT** (מע"מ) on all invoices, POs, expenses, quotes
- **Israeli payroll** — 12% ביטוח לאומי employer + 10% מס הכנסה + 12% ביטוח לאומי employee + 3.1% בריאות + 6% פנסיה
- **Minimum wage** — ₪5,572/month (557,200 agorot)
- **Standard month** — 186 hours, 125% overtime (first 2h), 150% beyond
- **Payment terms** — Net 30, 2% late penalty
- **Invoice numbering** — `YYYY-NNNNN` (e.g., `2026-00001`)

---

## 10 tracked goals

| ID | Metric | Target | Horizon |
|----|--------|--------|---------|
| G1 | leads/day | 8 | monthly |
| G2 | monthly revenue | ₪150,000 | monthly |
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

The smoke test runs fully in stub mode — **no API calls, 131 assertions, < 1 second**.

---

## Integration with NEXUS + Palantir

PARADIGM is one of three engines in the KOBI EL stack:

| Engine | Stack | Role |
|--------|-------|------|
| **`enterprise_palantir_core`** | Python + FastAPI | Deep ontology, causal DAGs, bandit learning, anomaly detection |
| **`nexus_engine`** | Node.js | 10 pluggable modules, HTTP dashboard, Python bridge |
| **`paradigm_engine`** | Node.js | Autonomous cognition (Swarm/Adversarial/Dream/Meta) — this repo |

Each engine persists state independently and can run in isolation.
