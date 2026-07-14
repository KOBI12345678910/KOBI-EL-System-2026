/**
 * SmartBuild Pilot 2.0 — Wiring Spec
 *
 * The full system blueprint in one object: service identity, entity
 * relationships, route groups, 360 page contracts, action→API map and
 * cross-service contracts with the sibling monorepo services.
 */

'use strict';

const rel = (from, to, type, fk) => ({ from, to, type, fk });

const WIRING_SPEC = {
  service: {
    name: 'SMARTBUILD_PILOT',
    port: 3400,
    role: 'Real-Estate Development Control Tower',
    version: '2.0',
    principles: [
      'אין מספרים קשיחים — הכל מחושב מהישויות בזמן אמת',
      'חוק המכר: 20% ללא הצמדה, יתרה צמודה 50% משינוי המדד',
      'No Dead Pages — כל ישות עונה על 6 השאלות',
      'Event-Driven — כל פעולה כספית מייצרת אירוע שמזין את המנועים',
      'אפס תלויות חיצוניות — Node.js טהור, דטרמיניסטי ובדיק',
    ],
  },

  relationships: [
    rel('apartment', 'project', 'N:1', 'project_id'),
    rel('sale', 'project', 'N:1', 'project_id'),
    rel('sale', 'apartment', 'N:1', 'apartment_id'),
    rel('sale', 'buyer', 'N:1', 'buyer_id'),
    rel('payment_schedule_item', 'sale', 'N:1', 'sale_id'),
    rel('buyer_payment', 'sale', 'N:1', 'sale_id'),
    rel('buyer_payment', 'payment_schedule_item', 'N:1', 'schedule_item_id'),
    rel('budget_item', 'project', 'N:1', 'project_id'),
    rel('budget_item', 'budget_item', 'N:1', 'parent_id'),
    rel('budget_transfer', 'budget_item', 'N:1', 'from_budget_item_id'),
    rel('budget_transfer', 'budget_item', 'N:1', 'to_budget_item_id'),
    rel('change_order', 'budget_item', 'N:1', 'budget_item_id'),
    rel('change_order', 'contract', 'N:1', 'contract_id'),
    rel('contract', 'project', 'N:1', 'project_id'),
    rel('contract', 'contractor', 'N:1', 'contractor_id'),
    rel('contract', 'tender', 'N:1', 'tender_id'),
    rel('contract', 'budget_item', 'N:1', 'budget_item_id'),
    rel('payment_request', 'contract', 'N:1', 'contract_id'),
    rel('payment_request', 'contractor', 'N:1', 'contractor_id'),
    rel('tender', 'project', 'N:1', 'project_id'),
    rel('tender', 'budget_item', 'N:1', 'budget_item_id'),
    rel('bid', 'tender', 'N:1', 'tender_id'),
    rel('bid', 'contractor', 'N:1', 'contractor_id'),
    rel('loan', 'project', 'N:1', 'project_id'),
    rel('loan_transaction', 'loan', 'N:1', 'loan_id'),
    rel('covenant', 'loan', 'N:1', 'loan_id'),
    rel('milestone', 'project', 'N:1', 'project_id'),
    rel('permit', 'project', 'N:1', 'project_id'),
    rel('risk', 'project', 'N:1', 'project_id'),
    rel('alert', 'project', 'N:1', 'project_id'),
    rel('delivery', 'apartment', 'N:1', 'apartment_id'),
    rel('delivery', 'sale', 'N:1', 'sale_id'),
    rel('warranty_claim', 'apartment', 'N:1', 'apartment_id'),
    rel('decision_gate', 'project', 'N:1', 'project_id'),
  ],

  routeGroups: [
    { group: 'system', routes: ['GET /api/health', 'GET /api/wiring/spec', 'GET /api/events'] },
    { group: 'entity-map', routes: ['GET /api/entity-map', 'GET /api/entity-map/:type'] },
    { group: 'state-machines', routes: ['GET /api/state-machines/:type/transitions?current=X'] },
    { group: 'pipeline', routes: ['GET /api/pipeline/stages', 'GET /api/pipeline/status/:projectId'] },
    { group: 'workflows', routes: ['GET /api/workflows', 'GET /api/workflows/:id'] },
    { group: 'orchestrator', routes: ['GET /api/orchestrator/actions', 'POST /api/orchestrator/execute'] },
    { group: 'entities', routes: ['GET /api/entities/:type', 'GET /api/entities/:type/:id', 'POST /api/entities/:type', 'PATCH /api/entities/:type/:id'] },
    { group: '360', routes: ['GET /api/360/:type/:id'] },
    { group: 'engines', routes: ['GET /api/engines/budget/:projectId', 'GET /api/engines/sales/:projectId', 'GET /api/engines/cashflow/:projectId', 'GET /api/engines/zero-report/:projectId', 'GET /api/engines/finance/:projectId', 'GET /api/engines/risk/:projectId', 'GET /api/engines/montecarlo/:projectId'] },
    { group: 'intelligence', routes: ['GET /api/alerts/:projectId', 'GET /api/insights/:projectId', 'GET /api/health-score/:projectId', 'GET /api/summary/:projectId'] },
  ],

  pageContracts: [
    'Project360', 'Apartment360', 'Sale360', 'Contractor360', 'Contract360',
    'Tender360', 'Loan360', 'BudgetItem360', 'Risk360',
  ].map((page) => ({
    page,
    must: [
      'איפה אני? (breadcrumb + הקשר פרויקט)',
      'מה זה? (הגדרת הישות ותכליתה)',
      'מה הסטטוס? (מצב נוכחי במכונת המצבים)',
      'מה אפשר לעשות? (מעברים זמינים + פעולות)',
      'מה הצעד הבא? (המלצת מנוע התובנות)',
      'רשומות קשורות (לפי entity-map.links)',
    ],
  })),

  actionApiMap: [
    'reserve_apartment', 'sign_sale', 'cancel_sale', 'record_buyer_payment', 'reprice_apartment',
    'publish_tender', 'submit_bid', 'award_tender', 'submit_payment_request', 'approve_payment_request',
    'pay_payment_request', 'request_budget_transfer', 'approve_budget_transfer', 'approve_change_order',
    'drawdown_loan', 'repay_loan', 'run_covenant_test', 'complete_milestone', 'grant_permit',
    'schedule_delivery', 'complete_delivery',
  ].map((action) => ({ action, method: 'POST', path: '/api/orchestrator/execute' })),

  crossServiceContracts: [
    {
      service: 'ONYX_PROCUREMENT',
      contract: 'מכרזים וחוזי קבלנים מסונכרנים כספקים והזמנות רכש; חשבונות קבלן מאושרים נשלחים כ-invoices ל-AP',
    },
    {
      service: 'TECHNO_KOL_OPS',
      contract: 'רוכשים ולידים מסונכרנים ל-CRM; משימות גבייה ומסירה נפתחות כ-tasks במרכז התפעולי',
    },
    {
      service: 'PAYROLL_AUTONOMOUS',
      contract: 'שעות צוותי פיקוח וניהול פרויקט מדווחות לשכר; עלויות עבודה פנימיות נטענות לסעיף ניהול פרויקט',
    },
    {
      service: 'ONYX_AI',
      contract: 'תובנות, התראות ותוצאות מונטה-קרלו נחשפות לשכבת ה-AI לניסוח המלצות NLQ ותחזיות עמוקות',
    },
  ],
};

module.exports = { WIRING_SPEC };
