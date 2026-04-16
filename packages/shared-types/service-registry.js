'use strict';

/**
 * @module service-registry
 * @description Canonical service registry for the Techno-Kol Uzi ERP 2026 system.
 *
 * Declares the four micro-services, their ports, base paths, and metadata.
 * All cross-service calls, health checks, and gateway routing MUST reference
 * this module instead of hard-coding host/port values.
 *
 * Architecture:
 * ```
 *  ┌─────────────────────┐  port 3200
 *  │  TECHNO_KOL_OPS     │  Operational Core (hub / gateway)
 *  └────────┬────────────┘
 *           │
 *  ┌────────┼──────────────────────────────────┐
 *  │        │                                  │
 *  │  ┌─────┴─────────────┐  ┌───────────────────────────┐
 *  │  │ ONYX_PROCUREMENT   │  │  ONYX_AI                  │
 *  │  │ port 3100          │  │  port 3300  (served /ai)   │
 *  │  └───────────────────┘  └───────────────────────────┘
 *  │
 *  │  ┌───────────────────────┐
 *  │  │ PAYROLL_AUTONOMOUS    │
 *  │  │ port 5173 (served /payroll) │
 *  │  └───────────────────────┘
 *  └───────────────────────────────────────────┘
 * ```
 *
 * @example
 *   const { SERVICES, getServiceUrl } = require('@techno-kol/shared-types/service-registry');
 *   const url = getServiceUrl(SERVICES.ONYX_PROCUREMENT, '/customers');
 *   // => 'http://localhost:3100/api/customers'
 */

/* ═══════════════════════════════════════════════════════════════
 *  SERVICE DEFINITIONS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} ServiceDefinition
 * @property {string} id       - Machine-readable service identifier (kebab-case).
 * @property {string} name     - Human-readable display name.
 * @property {string} role     - One-line description of the service's role.
 * @property {number} port     - Default listening port.
 * @property {string} base     - API base path (prefix for all routes).
 * @property {string} healthPath - Health-check endpoint relative to base.
 */

/**
 * Frozen registry of all four system services.
 *
 * @readonly
 * @type {Readonly<Record<string, ServiceDefinition>>}
 */
const SERVICES = Object.freeze({
  /**
   * Finance & Procurement backbone.
   * Owns: Customer, Supplier, Quote, RFQ, PO, Contract, Invoice, Payment,
   *       Inventory, Warehouse, Material, GL, VAT, Tax, Costing.
   */
  ONYX_PROCUREMENT: Object.freeze({
    id:         'onyx-procurement',
    name:       'Onyx Procurement',
    role:       'Finance & Procurement backbone',
    port:       3100,
    base:       '/api',
    healthPath: '/api/health',
  }),

  /**
   * Operational Core / Hub.
   * Owns: Project, WorkOrder, Task, Pipeline stages, Entity Map,
   *       State Machines, Orchestrator, Wiring Spec.
   */
  TECHNO_KOL_OPS: Object.freeze({
    id:         'techno-kol-ops',
    name:       'Techno-Kol Ops',
    role:       'Operational Core (hub)',
    port:       3200,
    base:       '/api',
    healthPath: '/api/health',
  }),

  /**
   * Workforce & Salary engine.
   * Owns: Employee, Attendance, PayrollRun, WageSlip, HR modules.
   * Served at /payroll sub-path behind the gateway.
   */
  PAYROLL_AUTONOMOUS: Object.freeze({
    id:         'payroll-autonomous',
    name:       'Payroll Autonomous',
    role:       'Workforce & Salary engine',
    port:       5173,
    base:       '/api',
    healthPath: '/api/health',
  }),

  /**
   * Intelligence & Automation layer.
   * Owns: AIInsight, AnomalyCase, ForecastModel, NLQ, ML pipelines.
   * Served at /ai sub-path behind the gateway.
   */
  ONYX_AI: Object.freeze({
    id:         'onyx-ai',
    name:       'Onyx AI',
    role:       'Intelligence & Automation layer',
    port:       3300,
    base:       '/api/ai',
    healthPath: '/api/ai/health',
  }),
});

/* ═══════════════════════════════════════════════════════════════
 *  HELPERS
 * ═══════════════════════════════════════════════════════════════ */

/**
 * Build a full URL for a service endpoint using localhost defaults.
 * In production, override with `SERVICE_HOST_<ID>` env vars.
 *
 * @param {ServiceDefinition} service - One of the SERVICES entries.
 * @param {string} [path='']         - Path segment to append after the base (e.g. '/customers/123').
 * @param {string} [host]            - Override host (defaults to env var or 'localhost').
 * @returns {string} Fully qualified URL.
 *
 * @example
 *   getServiceUrl(SERVICES.ONYX_PROCUREMENT, '/customers');
 *   // => 'http://localhost:3100/api/customers'
 */
function getServiceUrl(service, path, host) {
  const envKey = 'SERVICE_HOST_' + service.id.replace(/-/g, '_').toUpperCase();
  const resolvedHost = host || process.env[envKey] || 'localhost';
  const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
  const suffix = path || '';
  return protocol + '://' + resolvedHost + ':' + service.port + service.base + suffix;
}

/**
 * Look up a service definition by its `id` field.
 *
 * @param {string} serviceId - e.g. 'onyx-procurement'.
 * @returns {ServiceDefinition|undefined}
 */
function getServiceById(serviceId) {
  return Object.values(SERVICES).find(function (s) { return s.id === serviceId; });
}

/**
 * Array of all service definitions for iteration.
 * @readonly
 * @type {ServiceDefinition[]}
 */
const ALL_SERVICES = Object.freeze(Object.values(SERVICES));

module.exports = {
  SERVICES,
  ALL_SERVICES,
  getServiceUrl,
  getServiceById,
};
