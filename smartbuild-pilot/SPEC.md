# SmartBuild Pilot 2.0 — מפרט חוזים מחייב (Binding Interface Spec)

> מסמך זה הוא **החוזה המחייב** בין כל מודולי המערכת. כל קובץ חייב לממש בדיוק את הממשקים המוגדרים כאן — שמות שדות, חתימות פונקציות, וקודי סטטוס. אין לסטות.

## זהות המערכת
**SmartBuild Pilot 2.0** — מגדל בקרה פיננסי-תפעולי ליזמות נדל"ן (גרסה משופרת ומתקדמת של SmartBuildPilot/YzmCon).
שירות חמישי במונורפו Techno-Kol Uzi ERP 2026. פורט **3400**.

## עקרונות (ירושה מהמערכת המקורית + שיפורים)
1. **אין מספרים קשיחים** — כל חישוב נגזר מהישויות בזמן ריצה דרך מנועים.
2. **חוק המכר** — 20% ראשונים ללא הצמדה; יתרה צמודה למדד ב-50% מהשינוי בלבד.
3. **עברית RTL** בכל שכבת תצוגה.
4. **No Dead Pages** — כל ישות עונה על: איפה אני? מה זה? סטטוס? מה אפשר לעשות? מה הצעד הבא? רשומות קשורות?
5. **Event-Driven** — כל פעולה כספית → אירוע → מנועים → עדכון + התראות.
6. **אפס תלויות** — Node.js טהור (node:http, node:test). אין npm install. CommonJS, `'use strict';` בראש כל קובץ.

## מבנה תיקיות
```
smartbuild-pilot/
├── SPEC.md                    (מסמך זה)
├── package.json               (scripts בלבד: start, dev, test — אין dependencies)
├── README.md                  (עברית)
├── src/
│   ├── core/
│   │   ├── contracts.js       (ENTITY_TYPES, EVENT_TYPES, STAGE_IDS — כבר קיים, לא לשנות)
│   │   ├── entity-map.js
│   │   ├── state-machines.js
│   │   ├── workflow-flows.js
│   │   ├── pipeline-engine.js
│   │   ├── wiring-spec.js
│   │   └── orchestrator.js
│   ├── engines/
│   │   ├── event-bus.js
│   │   ├── budget-engine.js
│   │   ├── sales-engine.js
│   │   ├── cashflow-engine.js
│   │   ├── zero-report-engine.js
│   │   ├── finance-engine.js
│   │   ├── risk-engine.js
│   │   ├── montecarlo-engine.js
│   │   ├── alert-engine.js
│   │   ├── insights-engine.js
│   │   └── health-engine.js
│   ├── data/
│   │   ├── store.js
│   │   └── seed.js
│   └── server.js
├── public/
│   └── index.html             (מגדל בקרה RTL, self-contained)
└── test/
    ├── engines.test.js
    ├── state-machines.test.js
    ├── orchestrator.test.js
    └── server.test.js
```

## מוסכמות כלליות
- CommonJS: `module.exports = {...}`. אין ESM, אין TypeScript.
- כסף: מספרים בש"ח (float). אחוזים: 0-100 (לא 0-1) אלא אם צוין `ratio`.
- תאריכים: מחרוזת `YYYY-MM-DD`. חודשים: `YYYY-MM`.
- מזהים: מחרוזות, פורמט `<prefix>-<n>` (למשל `apt-12`, `sale-3`, `bl-7`).
- כל פונקציית מנוע מקבלת `store` כפרמטר ראשון ו-`projectId` כשני (אלא אם צוין אחרת) ומחזירה אובייקט תוצאה טהור. אסור למנועים לכתוב ל-store (חוץ מ-alert-engine דרך פרמטר מפורש). אין I/O במנועים.
- אין `Date.now()` בתוך מנועים — הזמן הנוכחי מגיע כפרמטר `asOf` (מחרוזת `YYYY-MM-DD`) עם ברירת מחדל `'2026-07-14'` (קבוע `TODAY` המיוצא מ-contracts.js).

---

## src/core/contracts.js (קיים — זה התוכן המדויק)
```js
ENTITY_TYPES = ['project','apartment','buyer','sale','payment_schedule_item','buyer_payment',
 'budget_item','budget_transfer','change_order','contractor','contract','payment_request',
 'tender','bid','loan','loan_transaction','covenant','index_rate','milestone','permit',
 'risk','alert','delivery','warranty_claim','decision_gate','audit_event']

EVENT_TYPES = ['budget_revision','budget_transfer','commitment_created','invoice_received',
 'payment_executed','sale_signed','sale_cancelled','buyer_payment','loan_drawdown',
 'loan_repayment','interest_accrual','index_update','price_change','change_order_approved',
 'covenant_test','milestone_completed','permit_granted','tender_awarded','delivery_completed',
 'defect_reported','stage_advanced','period_lock','entity_created','entity_updated','action_executed']

STAGE_IDS = ['land','feasibility','planning','permits','financing','tendering','contracting',
 'sales','execution','payment_control','delivery','registration','warranty','closure']

TODAY = '2026-07-14'
```

---

## סכמות ישויות (שדות מחייבים — seed.js חייב לאכלס את כולם)

### project
`id, name, city, address, status(stage id מתוך STAGE_IDS), total_land_sqm, total_sellable_sqm, units_planned, start_date, expected_end_date, equity_committed, discount_rate_annual(0.09), required_presales_pct(30), current_stage(=status), description`

### apartment
`id, project_id, unit_number, building, floor, rooms, area_sqm, balcony_sqm, direction, list_price, current_price, status('available'|'reserved'|'sold'|'delivered'), apartment_type('standard'|'garden'|'penthouse'|'mini_penthouse')`

### buyer
`id, name, id_number, phone, email, status('lead'|'negotiation'|'signed'|'delivered')`

### sale
`id, project_id, apartment_id, buyer_id, contract_price, sign_date, base_index_value, status('reserved'|'signed'|'cancelled'|'delivered'), broker_fee_pct, notes`

### payment_schedule_item
`id, sale_id, seq, due_date, amount_base(סכום בסיס לפני הצמדה), pct_of_price, milestone_label, status('pending'|'paid'|'overdue')`

### buyer_payment
`id, sale_id, schedule_item_id, pay_date, amount_paid, index_value_at_payment, linkage_amount(תוספת הצמדה ששולמה), receipt_number`

### budget_item
`id, project_id, parent_id(null לשורש), budget_code, budget_name, category('land'|'soft_costs'|'hard_costs'|'financing'|'contingency'|'marketing'|'permits_tax'|'guarantees'), original_budget, approved_budget, transferred_in, transferred_out, approved_change_orders, contingency_used, committed_amount, invoiced_amount, paid_amount, estimated_remaining_cost, price_change_impact, spend_start_month(YYYY-MM), spend_months(פריסה חודשית שווה)`

### budget_transfer
`id, project_id, from_budget_item_id, to_budget_item_id, amount, reason, status('pending'|'approved'|'rejected'), requested_by, decided_at`

### change_order
`id, project_id, budget_item_id, contract_id, change_type('quantity'|'price'|'scope'|'addition'|'deletion'), old_value, new_value, difference, reason, approval_status('pending'|'approved'|'rejected'), approval_level('pm'|'pm_finance'|'cfo'|'ic'|'board')`

### contractor
`id, name, company_id, trade('shell'|'systems'|'finishes'|'development'|'general'), rating(1-5), status('active'|'suspended'|'blacklisted'), contact_name, phone`

### contract
`id, project_id, contractor_id, tender_id, title, contract_sum, signed_date, retention_pct(5), index_linked(bool), budget_item_id, status('draft'|'signed'|'active'|'completed'|'terminated')`

### payment_request (חשבון קבלן)
`id, project_id, contract_id, contractor_id, seq, period(YYYY-MM), amount_requested, amount_approved, retention_held, status('submitted'|'supervisor_review'|'approved'|'paid'|'rejected'), submitted_date, paid_date(null עד תשלום)`

### tender
`id, project_id, title, trade, scope_summary, budget_item_id, estimate_amount, published_date, closing_date, status('draft'|'published'|'bidding'|'evaluation'|'awarded'|'cancelled'), awarded_bid_id(null)`

### bid
`id, tender_id, contractor_id, amount, days_to_complete, score_quality(0-100), status('submitted'|'shortlisted'|'won'|'lost')`

### loan (מסגרת ליווי/הלוואה)
`id, project_id, lender, facility_type('construction_loan'|'land_loan'|'mezzanine'), facility_amount, drawn_amount, interest_rate_annual(0.062), status('approved'|'active'|'repaid'), start_date, maturity_date`

### loan_transaction
`id, loan_id, tx_type('drawdown'|'repayment'|'interest'), tx_date, amount`

### covenant
`id, loan_id, name, metric('ltv'|'ltc'|'presales_coverage'|'equity_injection'), operator('<='|'>='), threshold(מספר; ltv/ltc כ-ratio 0-1, presales_coverage באחוזים 0-100, equity_injection בש"ח), status('ok'|'warning'|'breach')`

### index_rate (מדד תשומות בנייה / מדד המחירים)
`id, index_type('cpi'|'construction_inputs'), month(YYYY-MM), value(בסיס 100)`

### milestone
`id, project_id, name, stage(מתוך STAGE_IDS), planned_date, actual_date(null אם טרם), weight_pct, status('planned'|'in_progress'|'completed'|'delayed')`

### permit
`id, project_id, permit_type('zoning'|'building_permit'|'form4'|'occupancy'), authority, submitted_date, granted_date(null), expiry_date(null), status('preparing'|'submitted'|'granted'|'expired'|'rejected')`

### risk
`id, project_id, title, category('market'|'execution'|'financing'|'regulatory'|'legal'|'counterparty'), probability(1-5), impact(1-5), score(=probability*impact — מחושב ב-seed), mitigation, owner, status('open'|'mitigating'|'closed')`

### alert
`id, project_id, rule_id, severity('info'|'warning'|'critical'), title, message, entity_type, entity_id, created_at, status('active'|'acknowledged'|'resolved')`

### delivery
`id, project_id, apartment_id, sale_id, scheduled_date, actual_date(null), protocol_signed(bool), defects_count, status('scheduled'|'completed'|'delayed')`

### warranty_claim
`id, project_id, apartment_id, description, reported_date, severity('minor'|'major'|'safety'), status('open'|'in_repair'|'closed')`

### decision_gate
`id, project_id, gate_name, stage, criteria(מערך מחרוזות), status('pending'|'approved'|'rejected'), decided_by, decided_at`

### audit_event
`id, ts, actor, action, entity_type, entity_id, details(אובייקט)`

---

## src/data/store.js — ממשק מחייב
```js
createStore()                          → store ריק
store.reset(seedFn)                    → מאפס ומריץ seedFn(store)
store.list(type)                       → מערך (עותק רדוד של המערך; אין לשנות)
store.get(type, id)                    → אובייקט או null
store.create(type, obj)                → הרשומה (יוצר id אוטומטי `<type>-<n>` אם חסר; מוסיף audit_event)
store.update(type, id, patch)          → הרשומה המעודכנת או null (מוסיף audit_event)
store.remove(type, id)                 → bool
store.find(type, predicateFn)          → מערך
store.counts()                         → { [type]: n }
module.exports = { createStore }
```
- זריקת שגיאה על type שאינו ב-ENTITY_TYPES.
- audit_event נכתב אוטומטית על create/update/remove (למעט על audit_event עצמו).

## src/data/seed.js — ממשק מחייב
```js
module.exports = { seed }   // seed(store) → void
```
פרויקט דמו: **"מגדלי אלמוגים" (proj-1)**, נתניה, שלב 'execution'.
היקפים מחייבים: 48 דירות (2 בניינים × 12 קומות חלקיות, תמהיל 3/4/5 חדרים + 2 פנטהאוזים + 4 דירות גן); **21 מכירות** (18 'signed', 2 'reserved', 1 'cancelled'); לוח תשלומים לכל מכירה חתומה (6-8 שורות: 7% חתימה, 13% תוך 45 יום, 4×15% אבני דרך, 20% מסירה — סה"כ 100%); buyer_payments לכל השורות שהגיע מועדן לפני 2026-07 (עם הצמדה לפי חוק המכר); עץ תקציב עם שורש-קטגוריות ו-**20+ סעיפי עלים** בסך ~185M ₪; 6 קבלנים, 4 חוזים פעילים, 14 חשבונות קבלן במצבים שונים; 3 מכרזים (1 awarded, 1 bidding, 1 draft) עם 7 הצעות; 2 הלוואות (ליווי 95M נמשך 41M + קרקע 30M נמשך מלא) עם loan_transactions ו-4 קובננטים (אחד במצב warning); סדרת index_rate חודשית cpi+construction_inputs מ-2024-01 עד 2026-07 (cpi מ-100 ל-106.8, תשומות מ-100 ל-109.4); 12 אבני דרך (5 הושלמו, 1 delayed); 4 היתרים (2 granted, 1 submitted, 1 preparing); 8 סיכונים פתוחים; 3 מסירות מתוכננות; 2 תביעות בדק; 3 שערי החלטה. מספרים ריאליים ועקביים פנימית (יוקרה קו-ראשון-לים: ~45K ₪/מ"ר, מחיר דירה ממוצע ~4.5M ₪ — כך שה-GDV ~228M מול עלות ~188M נותן מרווח יזמי ~17.7%).

---

## src/engines — חתימות מחייבות

### event-bus.js
```js
createEventBus(store) → bus
bus.publish(eventType, payload)   // בודק EVENT_TYPES, כותב audit_event, קורא ל-listeners
bus.subscribe(eventType, fn)      // fn(payload); '*' = הכל
bus.ledger()                      // מערך אירועים שפורסמו [{ts, event_type, payload}]
module.exports = { createEventBus }
```

### budget-engine.js
```js
computeBudgetLine(item, children=[]) → item מועשר בשדות מחושבים:
  revised_budget = approved_budget + transferred_in - transferred_out + approved_change_orders + contingency_used
  open_commitment_amount = committed_amount - invoiced_amount
  open_invoice_amount = invoiced_amount - paid_amount
  available_budget = revised_budget - committed_amount - open_invoice_amount
  forecast_at_completion = paid_amount + open_invoice_amount + estimated_remaining_cost + price_change_impact
  budget_variance = forecast_at_completion - revised_budget
  budget_variance_percent = revised_budget ? variance/revised*100 : 0
  risk_level: >15→'critical', >10→'high', >5→'medium', אחרת 'low'
  status: variance%>10→'over_budget'; אחרת paid>0 && available<=0→'executed'; אחרת committed>0→'committed'; אחרת 'planned'
computeBudget(store, projectId) → { projectId, lines(עלים מחושבים), byCategory:{[category]:{revised, fac, paid, variance}}, totals:{original, approved, revised, committed, invoiced, paid, fac, variance, variance_percent, available}, contingency:{allocated, used, remaining} }
module.exports = { computeBudgetLine, computeBudget }
```

### sales-engine.js — חוק המכר
```js
indexValueAt(store, indexType, month) → ערך המדד לחודש (או האחרון הידוע לפניו)
computeLinkage({contractPrice, baseIndex, currentIndex, cumulativePaidBase, paymentBase}) → { linkage, effectiveAmount }
  // חוק המכר: החלק מהתשלום שבתוך 20% הראשונים של מחיר החוזה — ללא הצמדה.
  // החלק שמעבר — צמוד: paymentPart * max(0,(currentIndex/baseIndex - 1)) * 0.5
computeSaleState(store, sale, asOf=TODAY) → { saleId, contractPrice, schedule:[{...item, amount_indexed, paid, overdue}], totalPaid, totalLinkagePaid, balanceDue, pctPaid, nextDue }
computeSales(store, projectId, asOf=TODAY) → { projectId, unitsTotal, unitsSold, unitsReserved, unitsAvailable, soldPct, signedRevenue, projectedRevenue(סה"כ: חתומות במחיר חוזה + זמינות/שמורות במחיר נוכחי), collected, outstanding, overdueAmount, salesPacePerMonth(ממוצע 6 חודשים אחרונים), monthsToSellOut(null אם קצב 0), sales:[computeSaleState בקיצור] }
module.exports = { indexValueAt, computeLinkage, computeSaleState, computeSales }
```

### cashflow-engine.js
```js
computeCashflow(store, projectId, {months, asOf=TODAY}={}) → {
  // months ברירת מחדל: max(36, חודשים עד expected_end_date + 4) — כדי לכלול תקבולי מסירה
  projectId, startMonth(חודש תחילת פרויקט), months:[{month, inflows:{buyer_payments, loan_drawdowns, equity, projected_sales}, outflows:{contractors, land, soft_costs, financing_interest, marketing, other}, net, cumulative}],
  peakDeficit:{month, amount}, endBalance, equityRequired(=|min cumulative לפני מקורות הון|), fundingGap }
```
`projected_sales`: יחידות לא-מכורות נמכרות בקצב 6 החודשים האחרונים — 20% בחתימה החזויה, 80% במסירה.
עקרונות: עבר = בפועל (buyer_payments, loan_transactions, payment_request.paid, paid_amount פריסה); עתיד = תחזית (לוחות תשלומים צפויים כולל הצמדה צפויה בקצב הממוצע ההיסטורי של המדד, יתרת תקציב לפי spend_start_month/spend_months, ריבית חודשית על יתרת הלוואה). `module.exports = { computeCashflow }`

### zero-report-engine.js
```js
irr(monthlyCashflows, guessAnnual=0.1) → שנתי (ratio) או null אם אין התכנסות
npv(monthlyCashflows, annualRate) → ₪
computeZeroReport(store, projectId, asOf=TODAY) → { costs:{land, construction, soft, financing, tax, contingency, guarantees, marketing, total}(לפי FAC מ-budget-engine), revenue:{expected, contracted, forecast, gdv}, profit:{gross, margin_on_revenue, margin_on_cost}, breakeven:{revenue, price_per_sqm}, irr_annual, npv, equity:{committed, required, multiple(רווח/הון נדרש)} }
module.exports = { irr, npv, computeZeroReport }
```

### finance-engine.js
```js
computeFinance(store, projectId, asOf=TODAY) → { loans:[{...loan, balance, undrawn, accrued_interest_estimate, utilization_pct}], totals:{facilities, drawn, balance, undrawn}, covenants:[{...covenant, actual, headroom, status_computed('ok'|'warning'|'breach' — warning אם בטווח 10% מהסף)}], ltv, ltc, presalesCoveragePct }
  // ltv = totalBalance / gdv (מ-zero-report); ltc = totalBalance / totalCost; presales = signedRevenue / facilities *100
module.exports = { computeFinance }
```

### risk-engine.js
```js
computeRisks(store, projectId) → { register:[{...risk, score, level('low'<=6,'medium'<=12,'high'<=19,'critical'>=20)}], heatmap(5x5 מטריצת ספירות [impact][probability]), topRisks(5 הגבוהים), byCategory, openCount, avgScore }
module.exports = { computeRisks }
```

### montecarlo-engine.js
```js
mulberry32(seedInt) → rng()  // דטרמיניסטי
runMonteCarlo(store, projectId, {runs=2000, seed=42, costSigmaPct=8, priceSigmaPct=6, delayMaxMonths=9, asOf=TODAY}={}) → {
  runs, seed, profit:{p5,p25,p50,p75,p95,mean,min,max}, margin:{p5,p50,p95}, probLoss(0-100), probMarginBelow(אחוז ריצות עם מרווח<8%), var95(הפסד בגרוע מ-p5 ביחס ל-p50), histogram:[{bucketStart,bucketEnd,count}×20], drivers:{costImpact, priceImpact, delayImpact}(רגישות: תרומת כל גורם לשונות) }
```
מודל: עלות ~ Normal(FAC, σ%), הכנסה ~ Normal(forecast, σ%), עיכוב ~ Triangular(0, delayMax/3, delayMax) שמוסיף ריבית חודשית על יתרת ההלוואה. Box-Muller עם mulberry32. `module.exports = { mulberry32, runMonteCarlo }`

### alert-engine.js
```js
ALERT_RULES — מערך של {id, severity, entity_type, title, check(ctx)→מערך {message, entity_type, entity_id}}
evaluateAlerts(store, projectId, asOf=TODAY) → מערך התראות (לא כותב ל-store)
refreshAlerts(store, projectId, asOf=TODAY) → מסנכרן ל-store.alert (מוסיף חדשות active, פותר ישנות) ומחזיר את הפעילות
```
חוקים מינימליים (12+): חריגת תקציב סעיף>10%; בצ"מ מנוצל>60%; קובננט warning/breach; תשלום רוכש באיחור; חשבון קבלן ממתין>45 יום; presales מתחת לנדרש בשלב ביצוע; peakDeficit>הון עצמי; אבן דרך delayed; היתר שפג/עומד לפוג<60 יום; דירות זמינות ומחיר מתחת למחיר איזון למ"ר; מכרז ללא הצעות לקראת סגירה; ריכוז קבלן>40% מהתקציב הקשיח. `module.exports = { ALERT_RULES, evaluateAlerts, refreshAlerts }`

### insights-engine.js — שכבת ה"חכם"
```js
computeInsights(store, projectId, asOf=TODAY) → { insights:[{id, kind('opportunity'|'risk'|'action'|'anomaly'), priority(1-10), title, detail, recommendation, impact_estimate(₪ או null), entity_type, entity_id}...], nextBestActions:[{action_id(מה-orchestrator), label, reason, entity_type, entity_id}×5] }
entityNextStep(store, entityType, entityId) → {label, action_id, reason} או null   // לשימוש ב-360
```
היוריסטיקות (10+): קצב מכירות מול יעד → המלצת תמחור/קמפיין (כולל אומדן ₪); סעיפים בסיכון → העברת בצ"מ; ניצול מסגרת נמוך מול ריבית → אופטימיזציית משיכות; פער הצמדה (מדד תשומות מול מחירי מכר); הצעת מכרז זולה חשודה (נמוכה >15% מהאומדן); דירות מפריטים איטיים (ימי מדף); רוכש עם 2+ איחורים → סיכון גבייה; אנומליה: חשבון קבלן חורג>20% מהמצטבר החזוי לפי התקדמות אבני דרך. `module.exports = { computeInsights, entityNextStep }`

### health-engine.js
```js
computeHealth(store, projectId, asOf=TODAY) → { dataCompleteness:{pct, missing:[{entity_type, field, count}]}, healthScore(0-100), grade('A'|'B'|'C'|'D'), dimensions:{budget, schedule, sales, finance, risk}(כ"א 0-100 + weight), summary(משפט בעברית) }
```
ניקוד: budget=f(variance%), schedule=f(אבני דרך באיחור), sales=f(soldPct מול required_presales), finance=f(קובננטים+headroom), risk=f(avgScore). `module.exports = { computeHealth }`

---

## src/core — ממשקים מחייבים

### entity-map.js
`ENTITY_MAP` — לכל אחד מ-26 סוגי הישויות: `{ label(עברית), labelEn, icon(אימוג'י), service:'smartbuild', purpose, links:[], statuses:[], nextSteps:[{id,label,icon,targetStatus?/creates?}], actions:[{id,label,icon}], topFields:[], relatedSections:[] }`. הסטטוסים חייבים להתאים לסכמות למעלה. `module.exports = { ENTITY_MAP, getEntityDef(type) }`

### state-machines.js
`STATE_MACHINES` — מכונות מצבים לפחות עבור: apartment, sale, payment_schedule_item, budget_transfer, change_order, contract, payment_request, tender, loan, covenant, milestone, permit, risk, delivery, warranty_claim, decision_gate, alert (17). מבנה: `{ entity: type, initial, states:[...], transitions:[{from, to, action(מזהה), label(עברית), guard?(תיאור טקסטואלי), sideEffects:[{type:'publish_event', event}|{type:'update_field',...}|{type:'create_alert',...}]}] }`
```js
module.exports = { STATE_MACHINES, getMachine(type), availableTransitions(type, currentState), canTransition(type, from, to) }
```

### workflow-flows.js
`FLOWS` — 6 זרימות: `flow_land_to_delivery` (מאסטר), `flow_sale_to_cash` (מכירה→גבייה עם חוק המכר), `flow_tender_to_contract`, `flow_payment_request` (חשבון קבלן→תשלום), `flow_budget_change` (שינוי/העברה→אישור לפי סף), `flow_delivery_warranty`. מבנה: `{id, label, description, steps:[{seq, entity, action, description, triggers_event?}], kpis:[]}`. `module.exports = { FLOWS, getFlow(id) }`

### pipeline-engine.js
14 שלבי Master Flow לפי STAGE_IDS עם `{id, seq, label(עברית), icon, description, entryCriteria:[], exitCriteria:[], gates:[], ownedEntities:[]}`.
```js
module.exports = { STAGES, getStage(id), computePipelineStatus(store, projectId) }
// computePipelineStatus → { currentStage, stages:[{...stage, state:'completed'|'current'|'upcoming', progress_pct(היוריסטיקה מהישויות: היתרים, מכירות, אבני דרך, מסירות)}] }
```

### wiring-spec.js
`WIRING_SPEC = { service:{name:'SMARTBUILD_PILOT', port:3400, role:'Real-Estate Development Control Tower'}, relationships:[{from,to,type,fk}×24+], routeGroups:[...], pageContracts:[{page:'<Type>360', must:[6 העקרונות]}×9(Project360, Apartment360, Sale360, Contractor360, Contract360, Tender360, Loan360, BudgetItem360, Risk360)], actionApiMap:[{action, method, path}...כל פעולות ה-orchestrator], crossServiceContracts:[{service:'ONYX_PROCUREMENT'|'PAYROLL_AUTONOMOUS'|'ONYX_AI'|'TECHNO_KOL_OPS', contract}×4] }`
`module.exports = { WIRING_SPEC }`

### orchestrator.js
```js
createOrchestrator(store, bus) → orch
orch.listActions() → [{id, label, entity, description, preconditions:[], effects:[], emits:[]}]
orch.execute(actionId, params) → { ok:true, result, events:[...] } או { ok:false, error }
module.exports = { createOrchestrator, ACTIONS }
```
פעולות (20, כולן מממשות preconditions→מוטציה ב-store→publish):
`reserve_apartment, sign_sale{apartment_id,buyer_id,price} (יוצר sale+לוח תשלומים לפי חוק המכר), cancel_sale, record_buyer_payment{schedule_item_id,pay_date} (מחשב הצמדה בפועל), reprice_apartment, publish_tender, submit_bid, award_tender (יוצר contract+committed), submit_payment_request, approve_payment_request, pay_payment_request (מעדכן budget paid + תזרים), request_budget_transfer, approve_budget_transfer (מעדכן transferred_in/out; guard: זמינות בסעיף המקור), approve_change_order (approval_level לפי גודל: <2% pm_finance, <10% cfo, <20% ic, אחרת board), drawdown_loan (guard: לא לעבור מסגרת), repay_loan, run_covenant_test (מעדכן סטטוסים+alert על breach), complete_milestone, grant_permit, schedule_delivery, complete_delivery (דירה→delivered)`.
(sign_sale נחשב פעולה אחת — סה"כ 21 מזהים.)

---

## src/server.js — REST API מחייב (node:http בלבד)
`createServer({port})` + הפעלה ישירה כשמורץ כ-main. CORS פתוח, JSON. סטטי מ-public/.
```
GET  /api/health                         → {ok, service:'SMARTBUILD_PILOT', version:'2.0', counts}
GET  /api/wiring/spec
GET  /api/entity-map            /api/entity-map/:type
GET  /api/state-machines/:type/transitions?current=X
GET  /api/pipeline/stages                → STAGES
GET  /api/pipeline/status/:projectId     → computePipelineStatus
GET  /api/workflows              /api/workflows/:id
GET  /api/orchestrator/actions
POST /api/orchestrator/execute           {action, params} → orch.execute
GET  /api/entities/:type?projectId=      → store.list (מסונן אם projectId)
GET  /api/entities/:type/:id
POST /api/entities/:type                 → store.create
PATCH /api/entities/:type/:id            → store.update
GET  /api/360/:type/:id                  → {entity, def(entity-map), transitions(מצב נוכחי), nextStep(insights.entityNextStep), related:{[linkType]:[...רשומות]}, audit(10 אחרונים), answers(6 שאלות No-Dead-Pages)}
GET  /api/engines/budget/:projectId
GET  /api/engines/sales/:projectId
GET  /api/engines/cashflow/:projectId?months=36
GET  /api/engines/zero-report/:projectId
GET  /api/engines/finance/:projectId
GET  /api/engines/risk/:projectId
GET  /api/engines/montecarlo/:projectId?runs=&seed=
GET  /api/alerts/:projectId              → refreshAlerts
GET  /api/insights/:projectId
GET  /api/health-score/:projectId
GET  /api/events                         → bus.ledger()
GET  /api/summary/:projectId             → אגרגט: {project, pipeline, budget:totals, sales(תמצית), cashflow:{peakDeficit,endBalance}, zero:{profit,irr_annual,npv}, finance:{ltv,ltc,presalesCoveragePct,covenants תמצית}, alerts:{active,critical}, health, topInsights(3)}
```
404 JSON על נתיב לא מוכר; 400 על body לא תקין. `module.exports = { createServer }`.

## public/index.html — מגדל בקרה
קובץ יחיד, ללא CDN, עברית RTL, עיצוב כהה מקצועי. טאבים: **מגדל בקרה** (KPI + התראות + תובנות + Next Best Actions + ציון בריאות), **צנרת** (14 שלבים ויזואלית), **תקציב** (טבלת סעיפים+סטיות), **מכירות** (סטאק דירות + חוק המכר), **תזרים** (גרף SVG חודשי + מצטבר), **מימון** (הלוואות+קובננטים), **סיכונים** (מפת חום + מונטה-קרלו עם היסטוגרמה), **ישויות 360** (בחירת ישות → תצוגת 360 מלאה + הפעלת פעולות orchestrator). הכל fetch מה-API. פוליש: מספרים בפורמט ₪ עברי, צבעי סטטוס עקביים.

## test/ — node:test (`node --test test/`)
- engines.test.js: נוסחאות תקציב; חוק המכר (מקרה 20%/50% מדויק: מחיר 1,000,000, מדד 100→110, תשלום ראשון 200k ללא הצמדה, תשלום 300k → הצמדה 15,000); irr/npv על תזרים ידוע; מונטה-קרלו דטרמיניסטי (אותו seed → אותו p50) ו-probLoss בטווח; cashflow: sum(net)==endBalance.
- state-machines.test.js: כל מכונה — initial תקין, אין מעבר ל-state לא מוכרז, availableTransitions.
- orchestrator.test.js: sign_sale יוצר לוח תשלומים שסכומו 100% מהמחיר; record_buyer_payment מחשב הצמדה; approve_budget_transfer שומר guard; drawdown מעבר למסגרת נכשל; award_tender יוצר chain מלא.
- server.test.js: מרים שרת על פורט אקראי, בודק 12+ נתיבים מחזירים 200 ומבנה נכון, POST orchestrator, 404.

## package.json
```json
{ "name":"smartbuild-pilot", "version":"2.0.0", "private":true, "type":"commonjs",
  "scripts":{ "start":"node src/server.js", "dev":"node --watch src/server.js", "test":"node --test test/*.test.js" } }
```
