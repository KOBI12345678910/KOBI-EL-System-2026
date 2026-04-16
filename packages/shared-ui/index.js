'use strict';

/**
 * @module shared-ui
 * @description Barrel export for the Techno-Kol Uzi ERP 2026 shared UI package.
 *
 * Provides design system primitives, page layout contracts, state badge logic,
 * next-best-action engine, and tab definitions for all 9 Master 360 Pages:
 *
 *   Customer360, Supplier360, Quote360, RFQ360, Project360,
 *   WorkOrder360, PO360, Finance360, Employee360
 *
 * Usage patterns:
 *   - React services (payroll-autonomous): Use component data + render helpers.
 *   - HTML services (onyx-procurement, techno-kol-ops): Use data contracts to drive templates.
 *
 * @example
 *   const {
 *     getStateBadgeVariant,
 *     computeNextBestAction,
 *     PAGE_TABS,
 *     PAGE_LAYOUT,
 *   } = require('@techno-kol/shared-ui');
 */

// ── Components ───────────────────────────────────────────────────────────
const {
  STATE_BADGE_VARIANTS,
  SUCCESS_STATES,
  WARNING_STATES,
  DANGER_STATES,
  INFO_STATES,
  getStateBadgeVariant,
  getStateBadgeColor,
  createSummaryCardData,
  createEmptyState,
  computeNextBestAction,
  computeAllActions,
  buildActionBar,
} = require('./components');

// ── Page Layout ──────────────────────────────────────────────────────────
const {
  PAGE_LAYOUT,
  SECTION_DEFS,
  PAGE_TABS,
  PAGE_ENTITY_MAP,
  getPageConfig,
  getAllPageNames,
} = require('./page-layout');

module.exports = {
  // Badge / state
  STATE_BADGE_VARIANTS,
  SUCCESS_STATES,
  WARNING_STATES,
  DANGER_STATES,
  INFO_STATES,
  getStateBadgeVariant,
  getStateBadgeColor,

  // Summary card
  createSummaryCardData,

  // Empty state
  createEmptyState,

  // Next best action
  computeNextBestAction,
  computeAllActions,
  buildActionBar,

  // Page layout
  PAGE_LAYOUT,
  SECTION_DEFS,
  PAGE_TABS,
  PAGE_ENTITY_MAP,
  getPageConfig,
  getAllPageNames,
};
