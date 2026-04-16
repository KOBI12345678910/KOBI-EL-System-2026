'use strict';

/**
 * shared-workflows -- Barrel export for the workflows package.
 *
 * Provides:
 *   - StateMachine           : validates and executes state transitions
 *   - Guards                 : pre-condition checks for transitions
 *   - Pre-built machines     : 12 StateMachine instances for all core entities
 *   - Escalation primitives  : SLA timer and escalation level calculation
 */

const { StateMachine } = require('./transition-engine');

const {
  requireState,
  requireOwnership,
  requireNotSelf,
  requireFieldPresent,
  requirePositiveAmount,
  requireEntityExists,
  assertAllGuards,
} = require('./guards');

const {
  leadMachine,
  quoteMachine,
  rfqMachine,
  poMachine,
  projectMachine,
  workOrderMachine,
  invoiceMachine,
  paymentMachine,
  payrollMachine,
  attendanceMachine,
  taskMachine,
  alertMachine,
  MACHINES,
  getMachine,
} = require('./machines');

const { checkSLA, getEscalationLevel, checkSLABatch } = require('./escalation');

module.exports = {
  // Core engine
  StateMachine,

  // Guards
  requireState,
  requireOwnership,
  requireNotSelf,
  requireFieldPresent,
  requirePositiveAmount,
  requireEntityExists,
  assertAllGuards,

  // Pre-built machines
  leadMachine,
  quoteMachine,
  rfqMachine,
  poMachine,
  projectMachine,
  workOrderMachine,
  invoiceMachine,
  paymentMachine,
  payrollMachine,
  attendanceMachine,
  taskMachine,
  alertMachine,
  MACHINES,
  getMachine,

  // Escalation
  checkSLA,
  getEscalationLevel,
  checkSLABatch,
};
