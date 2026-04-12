/**
 * Scenario: vat-report
 * ====================
 * GET /api/vat/report?period=YYYY-MM — produce the monthly 874 VAT file.
 *
 * Exercises the VAT aggregator: scan invoices + credit notes + receipts
 * within a period, group by VAT rate, and emit the VAT file the Tax
 * Authority expects.
 *
 * Read-only; safe to hammer with high weight.
 */

'use strict';

function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

module.exports = function vatReportScenario(opts = {}) {
  const period = opts.period || currentPeriod();
  return {
    name:    opts.name    || 'vat-report',
    url:     opts.url     || `/api/vat/report?period=${encodeURIComponent(period)}`,
    method:  'GET',
    headers: Object.assign({
      'Accept':    'application/json',
      'X-API-Key': opts.apiKey || 'test-api-key',
    }, opts.headers || {}),
    body:    null,
    weight:  opts.weight ?? 2,
    timeout: opts.timeout || 20000,
    expect:  opts.expect || [200, 304],
  };
};
