/**
 * Scenario: payroll-run
 * =====================
 * POST /api/payroll/run — trigger a monthly payroll calculation.
 *
 * This is the heaviest known write path in the ERP: for each employee we
 * compute gross → tax bands → BIT → national insurance → health → pension
 * → net, then persist a slip and enqueue a bank transfer. In production
 * this runs once a month; under load we simulate the first-of-the-month
 * scramble when finance re-runs with corrections.
 *
 * Uses a disposable period tag so the endpoint dedupes gracefully instead
 * of mutating a committed payroll record.
 */

'use strict';

let _runSeq = 0;

module.exports = function payrollRunScenario(opts = {}) {
  _runSeq = (_runSeq + 1) % 1_000_000;
  const period = opts.period || `load-${new Date().toISOString().slice(0, 7)}-${_runSeq}`;
  return {
    name:    opts.name    || 'payroll-run',
    url:     opts.url     || '/api/payroll/run',
    method:  'POST',
    headers: Object.assign({
      'Accept':       'application/json',
      'Content-Type': 'application/json',
      'X-API-Key':    opts.apiKey || 'test-api-key',
    }, opts.headers || {}),
    body: {
      period,                           // e.g. "load-2026-04-17"
      company_id: opts.companyId || 1,
      dry_run: true,                    // NEVER writes unless caller opts in
      include_deductions: true,
      include_bit: true,                 // ביטוח לאומי
      include_health: true,              // מס בריאות
      include_pension: true,              // פנסיה
    },
    weight:  opts.weight ?? 1,           // rare event
    timeout: opts.timeout || 60000,      // payroll run may take long
    expect:  opts.expect || [200, 202],
  };
};
