/**
 * Scenario: dashboard-home
 * ========================
 * GET /api/dashboard/home — aggregate KPI query for the main landing page.
 *
 * Returns the "first impression" data: AR total, AP total, 30-day cash flow,
 * top 5 suppliers, top 5 clients, month-over-month delta, and pending
 * approvals count. Every authenticated user hits this on login, so it's
 * the single most important latency to keep under 250ms P95.
 *
 * Weight is the highest of the built-in set.
 */

'use strict';

module.exports = function dashboardHomeScenario(opts = {}) {
  return {
    name:    opts.name    || 'dashboard-home',
    url:     opts.url     || '/api/dashboard/home',
    method:  'GET',
    headers: Object.assign({
      'Accept':    'application/json',
      'X-API-Key': opts.apiKey || 'test-api-key',
    }, opts.headers || {}),
    body:    null,
    weight:  opts.weight ?? 6,    // hottest read — every user, every login
    timeout: opts.timeout || 8000,
    expect:  opts.expect || [200, 304],
  };
};
