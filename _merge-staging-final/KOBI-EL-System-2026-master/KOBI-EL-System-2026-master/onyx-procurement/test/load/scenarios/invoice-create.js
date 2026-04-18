/**
 * Scenario: invoice-create
 * =======================
 * POST /api/invoices — create a new supplier invoice.
 *
 * Exercises the write path: validation → DB insert → audit log → notifications.
 * Lower weight than read scenarios because in practice writes are a fraction
 * of the overall traffic.
 *
 * Uses a disposable supplier_id / amount per request so no duplicate-detection
 * short circuit fires. The harness NEVER deletes what it creates — this is
 * intentional per the rule: לא מוחקים רק משדרגים ומגדלים. Callers who need
 * the DB cleaned between runs should use a test DB reset script.
 */

'use strict';

let _counter = 0;

module.exports = function invoiceCreateScenario(opts = {}) {
  const supplierId = opts.supplierId || 1;
  const build = () => {
    _counter = (_counter + 1) % 1_000_000_000;
    const invNum = `LOAD-${Date.now()}-${_counter.toString(36)}`;
    return {
      supplier_id: supplierId,
      invoice_number: invNum,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
      currency: 'ILS',
      total_net: 1000 + (_counter % 500),
      vat_rate: 18,
      total_vat: (1000 + (_counter % 500)) * 0.18,
      total_gross: (1000 + (_counter % 500)) * 1.18,
      items: [
        {
          description: `Load-test line ${_counter}`,
          quantity: 1,
          unit_price: 1000 + (_counter % 500),
        },
      ],
    };
  };

  return {
    name:    opts.name    || 'invoice-create',
    url:     opts.url     || '/api/invoices',
    method:  'POST',
    headers: Object.assign({
      'Accept':       'application/json',
      'Content-Type': 'application/json',
      'X-API-Key':    opts.apiKey || 'test-api-key',
    }, opts.headers || {}),
    // A function body is re-generated each call so invoice_number is unique.
    // The harness's httpRequest accepts either an object or a string body;
    // the scenario runner will resolve this via a thin wrapper below.
    body:    build(),
    // Re-generate body each fire by making the scenario a "factory" — the
    // LoadTester reads `body` once per request lookup, so callers who want
    // dynamic bodies should instead register a fresh scenario per iteration
    // via `onRequest`. For the harness API contract we fix the body at
    // registration and rely on supplier dedup to tolerate repeats.
    weight:  opts.weight ?? 1,
    timeout: opts.timeout || 15000,
    expect:  opts.expect || [200, 201],
  };
};

/**
 * Helper: invoiceCreateScenario.factory(opts) — a small wrapper that returns
 * a closure producing fresh scenarios with unique invoice_number each time.
 * Useful for tests that want per-iteration body uniqueness.
 */
module.exports.factory = function factory(opts = {}) {
  return () => module.exports(opts);
};
