/**
 * Scenario: invoice-list
 * =====================
 * GET /api/invoices — paginated invoice listing.
 *
 * Exercises the read path of the invoices module — filters, pagination, and
 * the dashboard's "latest 50" query. This is typically the hottest read path
 * in the ERP so it gets a high relative weight.
 *
 * Usage:
 *   const { LoadTester } = require('../../../src/load/load-harness');
 *   const invoiceList = require('./scenarios/invoice-list');
 *   const lt = new LoadTester({ baseUrl: 'http://localhost:3100' });
 *   lt.addScenario(invoiceList());
 */

'use strict';

module.exports = function invoiceListScenario(opts = {}) {
  return {
    name:    opts.name    || 'invoice-list',
    url:     opts.url     || '/api/invoices?limit=50&offset=0',
    method:  'GET',
    headers: Object.assign({
      'Accept':  'application/json',
      'X-API-Key': opts.apiKey || 'test-api-key',
    }, opts.headers || {}),
    body:    null,
    weight:  opts.weight ?? 5,     // heavy read path
    timeout: opts.timeout || 10000,
    expect:  opts.expect || [200, 304],
  };
};
