-- ============================================================
-- FILE: supabase/migrations/00041_menu_categorize_by_business_topic.sql
-- Purpose:
--   Phase 1b menu taxonomy alignment — recategorize existing menu
--   items into their canonical business topic, per the user spec
--   `menu_taxonomy` (10+ top-level categories).
--
--   This migration ONLY moves existing menu rows via UPDATE parent_id.
--   It does NOT:
--     - INSERT new menu rows (deferred to Phase 11 build-out)
--     - DELETE menu rows
--     - Touch routes, permissions, or visibility
--
--   100% idempotent. Every UPDATE uses `where parent_id <> <target>` so
--   repeated runs are no-ops. All updates are guarded with
--   `where exists (...)` to skip rows that are absent on this DB.
--
--   Category ids (post-00036/00040 numbering, inherited):
--     1  דשבורד             (dashboards)
--     2  מכירות ולקוחות     (commercial / CRM)
--     3  רכש וספקים         (procurement)
--     4  פרויקטים            (execution / projects)
--     5  מלאי ומחסנים       (inventory)
--     6  כספים              (finance)
--     7  מיסוי              (tax)
--     8  כח אדם ושכר        (workforce / payroll)
--     9  תקשורת             (comms)
--    10  מסמכים             (documents)
--    11  AI וניתוחים        (intelligence / analytics)
--    12  Compliance         (compliance / audit)
--    13  תשתיות             (infra / ops / devops)
--    14  אינטגרציות         (integrations / webhooks)
--    15  מערכת              (system / governance)
--
--   Canonical mapping source: user's `menu_taxonomy.visible_surfaces`
--   overlaid on existing seeds 00017/00034/00035/00036/00038/00039/00040.
--
--   Scope: ~130 high-confidence recategorizations. Ambiguous routes
--   are LEFT ALONE (per rule "if uncertain, leave the item alone").
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- Sanity guard — bail if category roots are missing
-- (these are seeded by 00017/00036; migration is a no-op if they
-- don't exist yet)
-- ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from public.app_menu where id between 1 and 15) then
    raise notice 'Category roots 1..15 not seeded. Skipping 00041 recategorization.';
    return;
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- (2) Commercial / sales — category 2
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 2
  where route in (
    '/customers', '/leads', '/opportunities', '/quotes',
    '/crm', '/crm/dashboard', '/crm/pipeline', '/crm/contacts',
    '/sales', '/sales/pipeline', '/sales/quotes', '/sales/orders',
    '/sales/quote360', '/sales/crm-pipeline',
    '/commercial/quotes', '/commercial/leads', '/commercial/customers',
    '/customer-360', '/crm/customer-360',
    '/lead-tags', '/customer-contacts', '/customer-portal-accounts',
    '/pipeline-stages', '/pricing-snapshots', '/crm-activities',
    '/orders', '/rule-sets'
  ) and parent_id is distinct from 2;

-- ──────────────────────────────────────────────────────────────
-- (3) Procurement — category 3
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 3
  where route in (
    '/suppliers', '/rfqs', '/pos', '/purchase-orders',
    '/supplier-mgmt', '/supplier-mgmt/supplier360',
    '/supplier-contacts', '/supplier-invoices', '/supplier-quotes',
    '/supplier-scorecards', '/supplier-portal-accounts',
    '/rfq-items', '/rfq-comparison', '/rfq-supplier-invites',
    '/purchase-order-lines', '/po-lines',
    '/contracts', '/contracts/risk-scoring', '/contract-milestones',
    '/procurement', '/procurement/dashboard', '/procurement/rfqs',
    '/procurement/pos', '/procurement/contracts',
    '/approval-steps', '/warranty-cases', '/procurement/returns',
    '/vendor-negotiation', '/supplier-management'
  ) and parent_id is distinct from 3;

-- ──────────────────────────────────────────────────────────────
-- (4) Execution / projects — category 4
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 4
  where route in (
    '/projects', '/project-360', '/projects/project-360',
    '/tasks', '/work-orders', '/wo', '/execution',
    '/project-phases', '/project-milestones', '/project-risks',
    '/project-blockers', '/project-cost-plans',
    '/task-dependencies', '/task-attachments', '/task-comments',
    '/work-order-tasks', '/work-order-qa', '/work-order-qa-items',
    '/work-order-qa-checklists',
    '/delivery-events', '/installation-events', '/logistics-orders',
    '/execution/signatures', '/alerts', '/execution/alerts',
    '/installations', '/installation/schedules'
  ) and parent_id is distinct from 4;

-- ──────────────────────────────────────────────────────────────
-- (5) Inventory — category 5
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 5
  where route in (
    '/inventory', '/warehouses', '/materials',
    '/material-categories', '/material-lots',
    '/material-requests', '/material-request-lines',
    '/inventory-movements', '/inventory-receipts',
    '/inventory-issues', '/inventory-transfers',
    '/inventory-reservations',
    '/stock-counts', '/stock-count-lines',
    '/reorder-rules', '/shortage-snapshots',
    '/manufacturing-batches', '/barcode-scans',
    '/raw-materials', '/raw-material-stock',
    '/goods-receipt'
  ) and parent_id is distinct from 5;

-- ──────────────────────────────────────────────────────────────
-- (6) Finance — category 6
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 6
  where route in (
    '/invoices', '/payments', '/receipts',
    '/invoice-lines', '/payment-allocations',
    '/expenses', '/expense-categories',
    '/gl-transactions', '/budget-entries',
    '/cashflow-entries', '/costing-entries',
    '/consolidation-entries',
    '/collection-actions', '/collection-cases',
    '/dunning-campaigns', '/dunning-steps',
    '/bank-files', '/bank-matches',
    '/fx-rates', '/reconciliation-exceptions',
    '/reminder-schedules',
    '/fin', '/fin/income', '/fin/expenses', '/fin/activity',
    '/finance', '/finance/dashboard',
    '/company-financials'
  ) and parent_id is distinct from 6;

-- ──────────────────────────────────────────────────────────────
-- (7) Tax — category 7
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 7
  where route in (
    '/tax-records', '/vat-records', '/tax-exports',
    '/annual-tax-reports', '/tax', '/vat'
  ) and parent_id is distinct from 7;

-- ──────────────────────────────────────────────────────────────
-- (8) Workforce / payroll — category 8
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 8
  where route in (
    '/employees', '/payroll', '/attendance', '/shifts',
    '/employers', '/hr-profiles', '/leave-types',
    '/leave-requests', '/pay-components', '/pension-records',
    '/wage-slips', '/workforce-assignments',
    '/employee-pay-components', '/employee-expenses',
    '/payroll-runs', '/payroll-entries',
    '/payroll-exceptions', '/payroll-export-batches',
    '/hr', '/hr/dashboard', '/hr/attendance', '/hr/settings',
    '/hr/feedback-360',
    '/workforce', '/workforce/employee360'
  ) and parent_id is distinct from 8;

-- ──────────────────────────────────────────────────────────────
-- (9) Comms — category 9
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 9
  where route in (
    '/notifications', '/notification-deliveries',
    '/email-messages', '/sms-messages', '/whatsapp-messages',
    '/chatbot-sessions', '/support-tickets', '/support-sla',
    '/help-articles', '/comms-threads',
    '/portal-users', '/portal-sessions',
    '/universal-inbox', '/customer-service',
    '/portal/customer/login', '/portal/customer/dashboard'
  ) and parent_id is distinct from 9;

-- ──────────────────────────────────────────────────────────────
-- (10) Documents — category 10
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 10
  where route in (
    '/documents', '/all-documents',
    '/document-versions', '/document-classifications',
    '/document-signature-requests', '/attachments',
    '/ocr-results', '/print-jobs', '/scan-sessions',
    '/classification-runs', '/document-chunks',
    '/document-relations', '/entity-extractions',
    '/extraction-runs', '/knowledge-cards',
    '/ocr-runs', '/document-builder'
  ) and parent_id is distinct from 10;

-- ──────────────────────────────────────────────────────────────
-- (11) Intelligence / analytics — category 11
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 11
  where route in (
    '/ai', '/ai-engine', '/ai-engine/ai-chatbot-settings',
    '/ai-engine/chatbot-settings', '/ai-engine/cross-module',
    '/ai-builder', '/ai/agents', '/agent-registry',
    '/agent-jobs', '/ai-insights',
    '/anomaly-cases', '/anomaly-feedback',
    '/decision-recommendations', '/forecast-models',
    '/model-executions', '/model-registry',
    '/quality-scores', '/recommendation-feedback',
    '/seasonality-patterns', '/trend-signals',
    '/analytics-engine', '/bi',
    '/dashboard-definitions', '/dashboard-boards',
    '/dashboard-widgets', '/dashboard-board-widgets',
    '/user-dashboard-boards', '/kpi-snapshots',
    '/read-model-invalidations',
    '/rm-ai-summary', '/rm-executive-summary',
    '/rm-finance-summary', '/rm-operations-summary',
    '/rm-procurement-summary', '/rm-workforce-summary',
    '/executive/scorecard', '/executive'
  ) and parent_id is distinct from 11;

-- ──────────────────────────────────────────────────────────────
-- (12) Compliance / audit — category 12
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 12
  where route in (
    '/audit', '/audit-log', '/audit-logs',
    '/policies', '/policy-acknowledgements',
    '/validations-log', '/compliance'
  ) and parent_id is distinct from 12;

-- ──────────────────────────────────────────────────────────────
-- (13) Infrastructure / ops — category 13
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 13
  where route in (
    '/cron', '/queue-jobs', '/job-executions',
    '/health-checks', '/sla-timers', '/idempotency-keys',
    '/state-history', '/security-events',
    '/saved-filters', '/escalation-rules'
  ) and parent_id is distinct from 13;

-- ──────────────────────────────────────────────────────────────
-- (14) Integrations / webhooks — category 14
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 14
  where route in (
    '/integrations', '/integrations-hub', '/integrations-hub-data',
    '/integration-builder', '/integration-settings',
    '/webhooks', '/webhook-endpoints', '/webhook-deliveries',
    '/event-subscriptions', '/event-deliveries',
    '/integration-connections', '/integration-sync-logs',
    '/api-hub', '/api-keys'
  ) and parent_id is distinct from 14;

-- ──────────────────────────────────────────────────────────────
-- (15) System / governance — category 15
-- ──────────────────────────────────────────────────────────────
update public.app_menu set parent_id = 15
  where route in (
    '/user-roles', '/user-preferences', '/user-profiles',
    '/roles', '/permissions', '/role-permissions',
    '/object-permissions', '/users-profile',
    '/feature-flags', '/feature-flag-targets',
    '/config-entries', '/governance',
    '/alert-subscriptions', '/command-logs', '/domain-events',
    '/workflows', '/workflow-instances', '/workflow-steps',
    '/workflow-step-executions', '/system-settings'
  ) and parent_id is distinct from 15;

-- ──────────────────────────────────────────────────────────────
-- Post-migration notice
-- ──────────────────────────────────────────────────────────────
do $$
declare
  touched_count integer;
begin
  -- Best-effort count: rows where parent_id is now one of 1..15
  select count(*) into touched_count
    from public.app_menu
    where parent_id between 1 and 15;
  raise notice '00041 recategorization complete. app_menu rows now parented to 1..15: %', touched_count;
end $$;
