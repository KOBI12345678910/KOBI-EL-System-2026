/**
 * SmartBuild Pilot 2.0 — Core Contracts
 *
 * Single source of truth for entity types, financial event types,
 * and Master Flow stage ids. Every module in the system imports
 * these constants — never redefine them locally.
 */

'use strict';

const ENTITY_TYPES = [
  'project', 'apartment', 'buyer', 'sale', 'payment_schedule_item', 'buyer_payment',
  'budget_item', 'budget_transfer', 'change_order', 'contractor', 'contract', 'payment_request',
  'tender', 'bid', 'loan', 'loan_transaction', 'covenant', 'index_rate', 'milestone', 'permit',
  'risk', 'alert', 'delivery', 'warranty_claim', 'decision_gate', 'audit_event',
];

const EVENT_TYPES = [
  'budget_revision', 'budget_transfer', 'commitment_created', 'invoice_received',
  'payment_executed', 'sale_signed', 'sale_cancelled', 'buyer_payment', 'loan_drawdown',
  'loan_repayment', 'interest_accrual', 'index_update', 'price_change', 'change_order_approved',
  'covenant_test', 'milestone_completed', 'permit_granted', 'tender_awarded', 'delivery_completed',
  'defect_reported', 'stage_advanced', 'period_lock', 'entity_created', 'entity_updated', 'action_executed',
];

const STAGE_IDS = [
  'land', 'feasibility', 'planning', 'permits', 'financing', 'tendering', 'contracting',
  'sales', 'execution', 'payment_control', 'delivery', 'registration', 'warranty', 'closure',
];

// Deterministic "now" for all engines — passed as default asOf so that
// computations are reproducible and testable (no Date.now() in engines).
const TODAY = '2026-07-14';

module.exports = { ENTITY_TYPES, EVENT_TYPES, STAGE_IDS, TODAY };
