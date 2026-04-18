/**
 * test/contract/contract-runner.test.js
 * ----------------------------------------------------------------
 * Tests for the contract runner itself.
 *
 * These are pure unit tests — no real HTTP is performed. Every
 * runner test uses an injectable `httpClient` so the runner's
 * control flow, URL building, validation, and reporting can be
 * exercised in isolation.
 *
 * Run:
 *   node --test test/contract/contract-runner.test.js
 *
 * Author: Agent 54 — API Contract Testing
 * ----------------------------------------------------------------
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ContractRunner,
  validate,
  validateHeaders,
  parseEndpointKey,
  fillPathParams,
  buildQueryString,
  joinUrl,
  pickSuccessStatus,
} = require('./contract-runner');

const { schemas, SHAPES, standardErrors, listEndpoints } = require('./contract-schema');

// ─────────────────────────────────────────────────────────────────────
// schema-lite: primitive types
// ─────────────────────────────────────────────────────────────────────

test('validate(): primitive string passes', () => {
  assert.deepEqual(validate('hello', 'string'), []);
});

test('validate(): primitive string fails for number', () => {
  const errs = validate(42, 'string');
  assert.equal(errs.length, 1);
  assert.match(errs[0], /expected string/);
});

test('validate(): integer rejects floats', () => {
  assert.deepEqual(validate(1, 'integer'), []);
  const errs = validate(1.5, 'integer');
  assert.equal(errs.length, 1);
  assert.match(errs[0], /expected integer/);
});

test('validate(): number accepts floats but rejects NaN/Infinity', () => {
  assert.deepEqual(validate(1.5, 'number'), []);
  assert.equal(validate(NaN, 'number').length, 1);
  assert.equal(validate(Infinity, 'number').length, 1);
});

test('validate(): boolean, null, any', () => {
  assert.deepEqual(validate(true, 'boolean'), []);
  assert.deepEqual(validate(null, 'null'), []);
  assert.deepEqual(validate({ foo: 1 }, 'any'), []);
  assert.equal(validate('true', 'boolean').length, 1);
});

test('validate(): uuid, iso-date, iso-datetime, email, url', () => {
  assert.deepEqual(validate('11111111-1111-1111-1111-111111111111', 'uuid'), []);
  assert.equal(validate('not-a-uuid', 'uuid').length, 1);

  assert.deepEqual(validate('2026-04-11', 'iso-date'), []);
  assert.equal(validate('2026/04/11', 'iso-date').length, 1);

  assert.deepEqual(validate('2026-04-11T10:00:00Z', 'iso-datetime'), []);
  assert.deepEqual(validate('2026-04-11T10:00:00.500+03:00', 'iso-datetime'), []);
  assert.equal(validate('2026-04-11 10:00:00', 'iso-datetime').length, 1);

  assert.deepEqual(validate('a@b.co', 'email'), []);
  assert.equal(validate('not-email', 'email').length, 1);

  assert.deepEqual(validate('https://example.com/x', 'url'), []);
  assert.equal(validate('ftp://x.com', 'url').length, 1);
});

test('validate(): optional tag with "?" allows missing fields', () => {
  // Optional primitive at top-level — null is accepted
  assert.deepEqual(validate(null, 'string?'), []);
  assert.deepEqual(validate(undefined, 'string?'), []);
  // But wrong type still fails
  assert.equal(validate(42, 'string?').length, 1);
});

test('validate(): unknown tag surfaces as an error', () => {
  const errs = validate('x', 'not-a-type');
  assert.equal(errs.length, 1);
  assert.match(errs[0], /unknown schema tag/);
});

// ─────────────────────────────────────────────────────────────────────
// schema-lite: object & array templates
// ─────────────────────────────────────────────────────────────────────

test('validate(): nested object with required + optional fields', () => {
  const schema = {
    id: 'uuid',
    name: 'string',
    email: 'email?',
  };
  assert.deepEqual(
    validate({ id: '11111111-1111-1111-1111-111111111111', name: 'A' }, schema),
    [],
  );
  const errs = validate({ id: '11111111-1111-1111-1111-111111111111' }, schema);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /name.*missing/);
});

test('validate(): object with wrong nested type', () => {
  const schema = { count: 'integer', meta: { total: 'integer' } };
  const errs = validate({ count: 1, meta: { total: 'not-a-number' } }, schema);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /\$\.meta\.total/);
});

test('validate(): array template enforces every item', () => {
  const schema = [{ id: 'uuid' }];
  assert.deepEqual(
    validate([{ id: '11111111-1111-1111-1111-111111111111' }], schema),
    [],
  );
  const errs = validate([{ id: 'bad' }], schema);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /\$\[0\]\.id/);
});

test('validate(): empty array template allows any array', () => {
  assert.deepEqual(validate([1, 'two', true], []), []);
  assert.equal(validate('not-array', []).length, 1);
});

test('validate(): strict mode rejects unknown keys', () => {
  const schema = { a: 'integer' };
  assert.deepEqual(validate({ a: 1 }, schema), []);
  assert.deepEqual(validate({ a: 1, b: 2 }, schema), []); // non-strict
  const errs = validate({ a: 1, b: 2 }, schema, { strict: true });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /unexpected field/);
});

test('validate(): null schema accepts null/empty only', () => {
  assert.deepEqual(validate(null, null), []);
  assert.deepEqual(validate(undefined, null), []);
  assert.deepEqual(validate('', null), []);
  assert.equal(validate({ foo: 1 }, null).length, 1);
});

test('validate(): function predicate', () => {
  const isPositive = (v) => v > 0 || 'must be positive';
  assert.deepEqual(validate(5, isPositive), []);
  const errs = validate(-1, isPositive);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /must be positive/);
});

// ─────────────────────────────────────────────────────────────────────
// header validator
// ─────────────────────────────────────────────────────────────────────

test('validateHeaders(): exact header passes regex', () => {
  const errs = validateHeaders(
    { 'Content-Type': 'application/json; charset=utf-8' },
    { 'content-type': '^application/json' },
  );
  assert.deepEqual(errs, []);
});

test('validateHeaders(): missing required header fails', () => {
  const errs = validateHeaders({}, { 'content-type': '^application/json' });
  assert.equal(errs.length, 1);
  assert.match(errs[0], /missing required header/);
});

test('validateHeaders(): wildcard X-* requires at least one match', () => {
  const ok = validateHeaders(
    { 'X-RateLimit-Limit': '1000', 'X-RateLimit-Remaining': '999' },
    { 'x-ratelimit-*': '^\\d+$' },
  );
  assert.deepEqual(ok, []);

  const missing = validateHeaders({}, { 'x-ratelimit-*': '^\\d+$' });
  assert.equal(missing.length, 1);
  assert.match(missing[0], /wildcard/);

  const badValue = validateHeaders(
    { 'X-RateLimit-Limit': 'not-a-number' },
    { 'x-ratelimit-*': '^\\d+$' },
  );
  assert.equal(badValue.length, 1);
  assert.match(badValue[0], /does not match/);
});

test('validateHeaders(): case-insensitive header matching', () => {
  const errs = validateHeaders(
    { 'CONTENT-TYPE': 'application/json' },
    { 'Content-Type': '^application/json$' },
  );
  assert.deepEqual(errs, []);
});

test('validateHeaders(): empty expected is a no-op', () => {
  assert.deepEqual(validateHeaders({}, {}), []);
  assert.deepEqual(validateHeaders({}, undefined), []);
});

// ─────────────────────────────────────────────────────────────────────
// URL / endpoint key utilities
// ─────────────────────────────────────────────────────────────────────

test('parseEndpointKey(): happy path', () => {
  assert.deepEqual(parseEndpointKey('GET /api/suppliers'), { method: 'GET', path: '/api/suppliers' });
  assert.deepEqual(parseEndpointKey('POST /api/suppliers/:id'), { method: 'POST', path: '/api/suppliers/:id' });
});

test('parseEndpointKey(): invalid input throws', () => {
  assert.throws(() => parseEndpointKey('suppliers'), /Invalid endpoint key/);
  assert.throws(() => parseEndpointKey('GET suppliers'), /Invalid endpoint key/);
});

test('fillPathParams(): substitutes params', () => {
  assert.equal(fillPathParams('/api/x/:id', { id: 'abc' }), '/api/x/abc');
  assert.equal(fillPathParams('/api/x/:a/y/:b', { a: '1', b: '2' }), '/api/x/1/y/2');
});

test('fillPathParams(): missing param throws', () => {
  assert.throws(() => fillPathParams('/api/x/:id', {}), /Missing path param/);
});

test('fillPathParams(): url-encodes values', () => {
  assert.equal(fillPathParams('/api/x/:id', { id: 'a b/c' }), '/api/x/a%20b%2Fc');
});

test('buildQueryString(): flat object', () => {
  assert.equal(buildQueryString({ a: 1, b: 'two' }), '?a=1&b=two');
  assert.equal(buildQueryString({}), '');
  assert.equal(buildQueryString(null), '');
  assert.equal(buildQueryString({ a: undefined, b: 'ok' }), '?b=ok');
});

test('buildQueryString(): arrays repeat the key', () => {
  assert.equal(buildQueryString({ tag: ['a', 'b'] }), '?tag=a&tag=b');
});

test('joinUrl(): handles trailing/leading slashes', () => {
  assert.equal(joinUrl('http://localhost:3000', '/api/x'), 'http://localhost:3000/api/x');
  assert.equal(joinUrl('http://localhost:3000/', '/api/x'), 'http://localhost:3000/api/x');
  assert.equal(joinUrl('http://localhost:3000/', 'api/x'), 'http://localhost:3000/api/x');
});

// ─────────────────────────────────────────────────────────────────────
// pickSuccessStatus
// ─────────────────────────────────────────────────────────────────────

test('pickSuccessStatus(): returns lowest 2xx', () => {
  assert.equal(pickSuccessStatus({ responses: { 200: {}, 201: {}, 500: {} } }), 200);
  assert.equal(pickSuccessStatus({ responses: { 204: {}, 400: {} } }), 204);
  assert.equal(pickSuccessStatus({ responses: {} }), null);
  assert.equal(pickSuccessStatus({}), null);
});

// ─────────────────────────────────────────────────────────────────────
// ContractRunner with a stub httpClient
// ─────────────────────────────────────────────────────────────────────

function makeStubClient(responses) {
  // responses can be a function(reqOpts) => response or a single object.
  return async (reqOpts) => {
    if (typeof responses === 'function') return responses(reqOpts);
    return responses;
  };
}

test('ContractRunner: requires schemas', () => {
  assert.throws(() => new ContractRunner({}), /schemas.*required/);
});

test('ContractRunner.validateResponse(): valid 200 list', () => {
  const runner = new ContractRunner({ schemas, baseUrl: 'http://x' });
  const result = runner.validateResponse('GET /api/suppliers', {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-ratelimit-limit': '1000',
      'x-ratelimit-remaining': '999',
      'x-ratelimit-reset': '60',
    },
    body: {
      data: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          name: 'Acme',
          tax_id: '514000000',
          country: 'IL',
          currency: 'ILS',
          is_active: true,
          created_at: '2026-01-01T10:00:00Z',
          updated_at: '2026-01-01T10:00:00Z',
        },
      ],
      pagination: { page: 1, per_page: 25, total: 1, total_pages: 1 },
    },
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('ContractRunner.validateResponse(): rejects missing required header', () => {
  const runner = new ContractRunner({ schemas, baseUrl: 'http://x' });
  const result = runner.validateResponse('GET /api/suppliers', {
    status: 200,
    headers: { 'content-type': 'application/json' }, // no x-ratelimit-*
    body: { data: [], pagination: { page: 1, per_page: 25, total: 0, total_pages: 0 } },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /x-ratelimit/i.test(e)));
});

test('ContractRunner.validateResponse(): rejects malformed body', () => {
  const runner = new ContractRunner({ schemas, baseUrl: 'http://x' });
  const result = runner.validateResponse('GET /api/suppliers', {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'x-ratelimit-limit': '1000',
      'x-ratelimit-remaining': '999',
      'x-ratelimit-reset': '60',
    },
    body: { data: 'not-an-array', pagination: { page: 1, per_page: 25, total: 0, total_pages: 0 } },
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => /data/.test(e)));
});

test('ContractRunner.validateResponse(): unknown endpoint', () => {
  const runner = new ContractRunner({ schemas, baseUrl: 'http://x' });
  const result = runner.validateResponse('GET /nope', { status: 200, headers: {}, body: {} });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /Unknown endpoint/);
});

test('ContractRunner.validateResponse(): unknown status on known endpoint', () => {
  const runner = new ContractRunner({ schemas, baseUrl: 'http://x' });
  const result = runner.validateResponse('GET /api/suppliers', { status: 418, headers: {}, body: {} });
  assert.equal(result.ok, false);
  assert.match(result.errors[0], /No response schema.*418/);
});

test('ContractRunner.validateResponse(): validates 401 error body', () => {
  const runner = new ContractRunner({ schemas, baseUrl: 'http://x' });
  const result = runner.validateResponse('GET /api/suppliers', {
    status: 401,
    headers: { 'content-type': 'application/json' },
    body: { error: 'Unauthorized' },
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('ContractRunner.runEndpoint(): uses stub and passes validation', async () => {
  const runner = new ContractRunner({
    schemas,
    baseUrl: 'http://x',
    httpClient: makeStubClient({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'x-ratelimit-limit': '1000',
        'x-ratelimit-remaining': '999',
        'x-ratelimit-reset': '60',
      },
      body: {
        data: [],
        pagination: { page: 1, per_page: 25, total: 0, total_pages: 0 },
      },
    }),
  });

  const r = await runner.runEndpoint('GET /api/suppliers', { query: { page: 1 } });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.status, 200);
});

test('ContractRunner.runEndpoint(): builds correct URL + query', async () => {
  let captured;
  const runner = new ContractRunner({
    schemas,
    baseUrl: 'http://localhost:3000/',
    httpClient: async (opts) => {
      captured = opts;
      return { status: 204, headers: {}, body: null };
    },
  });
  await runner.runEndpoint('GET /api/suppliers/:id', {
    params: { id: '11111111-1111-1111-1111-111111111111' },
    query: { include: 'contacts' },
  });
  assert.equal(
    captured.url,
    'http://localhost:3000/api/suppliers/11111111-1111-1111-1111-111111111111?include=contacts',
  );
  assert.equal(captured.method, 'GET');
});

test('ContractRunner.runEndpoint(): merges defaultHeaders with overrides', async () => {
  let captured;
  const runner = new ContractRunner({
    schemas,
    baseUrl: 'http://x',
    defaultHeaders: { 'x-api-key': 'default' },
    httpClient: async (opts) => { captured = opts; return { status: 204, headers: {}, body: null }; },
  });
  await runner.runEndpoint('DELETE /api/suppliers/:id', {
    params: { id: '11111111-1111-1111-1111-111111111111' },
    headers: { 'x-request-id': 'abc' },
  });
  assert.equal(captured.headers['x-api-key'], 'default');
  assert.equal(captured.headers['x-request-id'], 'abc');
});

test('ContractRunner.runEndpoint(): expectStatus mismatch surfaces error', async () => {
  const runner = new ContractRunner({
    schemas,
    baseUrl: 'http://x',
    httpClient: makeStubClient({ status: 500, headers: { 'content-type': 'application/json' }, body: { error: 'boom' } }),
  });
  const r = await runner.runEndpoint('GET /api/suppliers', { expectStatus: 200 });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Expected status 200, got 500/);
});

test('ContractRunner.runEndpoint(): network error becomes transport error', async () => {
  const runner = new ContractRunner({
    schemas,
    baseUrl: 'http://x',
    httpClient: async () => { throw new Error('ECONNREFUSED'); },
  });
  const r = await runner.runEndpoint('GET /api/suppliers');
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Network\/transport error.*ECONNREFUSED/);
});

test('ContractRunner.runEndpoint(): unknown endpoint', async () => {
  const runner = new ContractRunner({ schemas, baseUrl: 'http://x' });
  const r = await runner.runEndpoint('GET /api/nope');
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Unknown endpoint/);
});

test('ContractRunner.runEndpoint(): missing path param', async () => {
  const runner = new ContractRunner({
    schemas,
    baseUrl: 'http://x',
    httpClient: async () => ({ status: 200, headers: {}, body: {} }),
  });
  const r = await runner.runEndpoint('GET /api/suppliers/:id');
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /Missing path param/);
});

test('ContractRunner.runAll(): aggregates pass/fail from example requests', async () => {
  // Stub replies for each endpoint with the example success response.
  const runner = new ContractRunner({
    schemas,
    baseUrl: 'http://x',
    httpClient: async (opts) => {
      const url = new URL(opts.url);
      // Reverse lookup by matching path template — good enough for stub use.
      const match = Object.entries(schemas).find(([key]) => {
        const { path } = parseEndpointKey(key);
        const regex = new RegExp('^' + path.replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/]+') + '$');
        const { method } = parseEndpointKey(key);
        return method === opts.method && regex.test(url.pathname);
      });
      if (!match) return { status: 404, headers: {}, body: {} };
      const [key, schema] = match;
      const success = schema.examples && schema.examples.success;
      const status = success && success.response && success.response.status;
      const body = success && success.response && success.response.body;
      const headers = {
        'content-type': 'application/json',
        'x-ratelimit-limit': '1000',
        'x-ratelimit-remaining': '999',
        'x-ratelimit-reset': '60',
      };
      return { status, headers, body };
    },
  });

  // Only run a small slice to keep the test fast and deterministic.
  const subset = [
    'GET /api/suppliers',
    'GET /api/suppliers/:id',
    'GET /api/invoices',
    'GET /api/payroll/runs',
    'GET /api/vat/periods',
  ];
  const report = await runner.runAll({ only: subset });
  assert.equal(report.total, subset.length);
  // Expect all to pass against the stub.
  if (report.failed !== 0) {
    const failing = report.results.filter((r) => !r.ok).map((r) => ({ key: r.key, errors: r.errors }));
    assert.fail('runAll had failures: ' + JSON.stringify(failing, null, 2));
  }
  assert.equal(report.passed, subset.length);
});

test('ContractRunner.runAll(): onResult callback fires per endpoint', async () => {
  const seen = [];
  const runner = new ContractRunner({
    schemas,
    baseUrl: 'http://x',
    httpClient: makeStubClient({ status: 500, headers: { 'content-type': 'application/json' }, body: { error: 'boom' } }),
  });
  await runner.runAll({
    only: ['GET /api/suppliers', 'GET /api/invoices'],
    onResult: (r) => seen.push(r.key),
  });
  assert.deepEqual(seen, ['GET /api/suppliers', 'GET /api/invoices']);
});

// ─────────────────────────────────────────────────────────────────────
// Schema registry sanity
// ─────────────────────────────────────────────────────────────────────

test('schemas: registry has the expected 20 endpoints', () => {
  const keys = listEndpoints();
  assert.equal(keys.length, 20, `expected 20 endpoints, got ${keys.length}`);
});

test('schemas: each endpoint has request + responses + examples', () => {
  for (const [key, schema] of Object.entries(schemas)) {
    assert.ok(schema.request, `${key}: missing request`);
    assert.ok(schema.responses && Object.keys(schema.responses).length > 0, `${key}: missing responses`);
    assert.ok(schema.examples, `${key}: missing examples`);
    assert.ok(schema.examples.success, `${key}: missing examples.success`);
    assert.ok(schema.examples.error, `${key}: missing examples.error`);
  }
});

test('schemas: every endpoint declares at least one 2xx and at least one 4xx', () => {
  for (const [key, schema] of Object.entries(schemas)) {
    const codes = Object.keys(schema.responses).map((c) => parseInt(c, 10));
    assert.ok(
      codes.some((c) => c >= 200 && c < 400),
      `${key}: no 2xx/3xx response`,
    );
    assert.ok(
      codes.some((c) => c >= 400 && c < 500),
      `${key}: no 4xx response`,
    );
  }
});

test('schemas: standardErrors() helper covers 400/401/403/404/422/500', () => {
  const errs = standardErrors();
  assert.deepEqual(
    Object.keys(errs).map((c) => parseInt(c, 10)).sort((a, b) => a - b),
    [400, 401, 403, 404, 422, 500],
  );
  for (const code of [400, 401, 403, 404, 422, 500]) {
    assert.equal(errs[code].status, code);
    assert.ok(errs[code].body, `status ${code}: missing body schema`);
  }
});

test('schemas: SHAPES.supplier is a full shape', () => {
  assert.deepEqual(validate(
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Acme',
      tax_id: '514000000',
      country: 'IL',
      currency: 'ILS',
      is_active: true,
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-01-01T10:00:00Z',
    },
    SHAPES.supplier,
  ), []);
});

test('schemas: example success payloads validate against their own response schemas', () => {
  const runner = new ContractRunner({ schemas, baseUrl: 'http://x' });
  for (const [key, schema] of Object.entries(schemas)) {
    const ex = schema.examples && schema.examples.success;
    if (!ex || !ex.response) continue;
    // Build a minimal header set that will satisfy the declared header
    // regexes for the response — we don't want this test to drift every
    // time the registry gets a new wildcard expectation.
    const headers = {
      'content-type': 'application/json; charset=utf-8',
      'x-ratelimit-limit': '1000',
      'x-ratelimit-remaining': '999',
      'x-ratelimit-reset': '60',
    };
    const result = runner.validateResponse(key, {
      status: ex.response.status,
      headers,
      body: ex.response.body,
    });
    assert.equal(
      result.ok,
      true,
      `${key} success example failed: ${JSON.stringify(result.errors)}`,
    );
  }
});

test('schemas: example error payloads validate against the declared error schemas', () => {
  const runner = new ContractRunner({ schemas, baseUrl: 'http://x' });
  for (const [key, schema] of Object.entries(schemas)) {
    const ex = schema.examples && schema.examples.error;
    if (!ex || !ex.response) continue;
    const result = runner.validateResponse(key, {
      status: ex.response.status,
      headers: { 'content-type': 'application/json' },
      body: ex.response.body,
    });
    assert.equal(
      result.ok,
      true,
      `${key} error example failed: ${JSON.stringify(result.errors)}`,
    );
  }
});
