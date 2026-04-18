'use strict';

/**
 * @module @techno-kol/shared-types
 * @description Main barrel export for the Techno-Kol Uzi ERP 2026 shared type
 * system. Re-exports every constant, enum, helper, and validation function
 * from the sub-modules so consumers can import from a single entry point.
 *
 * Usage:
 * ```js
 * // Import everything
 * const types = require('@techno-kol/shared-types');
 * console.log(types.ENTITY_TYPES.LEAD);
 *
 * // Or destructure what you need
 * const { ENTITY_TYPES, LEAD_STATES, COMMERCIAL_EVENTS, ROLES } = require('@techno-kol/shared-types');
 * ```
 *
 * Sub-modules can also be required directly for tree-shaking or clarity:
 * ```js
 * const { ENTITY_TYPES } = require('@techno-kol/shared-types/entity-types');
 * const { success, error } = require('@techno-kol/shared-types/api-response');
 * ```
 *
 * Module inventory:
 *   entity-types.js      — 29 canonical entity type constants
 *   state-enums.js       — 16 state machine / status enumerations
 *   event-types.js       — 70+ domain event names across 8 topics
 *   permission-enums.js  — 16 permission groups, 7 roles
 *   api-response.js      — Standard API response envelope builders
 *   service-registry.js  — 4 service definitions with URLs and helpers
 */

const entityTypes     = require('./entity-types');
const stateEnums      = require('./state-enums');
const eventTypes      = require('./event-types');
const permissionEnums = require('./permission-enums');
const apiResponse     = require('./api-response');
const serviceRegistry = require('./service-registry');

module.exports = Object.freeze(Object.assign(
  {},
  entityTypes,
  stateEnums,
  eventTypes,
  permissionEnums,
  apiResponse,
  serviceRegistry,
));
