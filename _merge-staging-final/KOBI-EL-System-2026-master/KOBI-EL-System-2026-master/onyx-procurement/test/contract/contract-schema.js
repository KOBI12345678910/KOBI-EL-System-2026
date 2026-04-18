/**
 * test/contract/contract-schema.js
 * ----------------------------------------------------------------
 * API Contract Schema Registry
 * ----------------------------------------------------------------
 *
 * Purpose:
 *   Central, machine-readable description of every HTTP endpoint
 *   exposed by onyx-procurement that the contract runner (see
 *   `contract-runner.js`) is allowed to validate against.
 *
 *   Each entry is keyed by "METHOD /path" (exactly as the runner will
 *   look it up). The value is a schema object describing:
 *
 *     • request  - how clients are expected to call the endpoint
 *         - params   : path params (e.g. :id) with type hints
 *         - query    : query-string fields with type hints
 *         - headers  : required request headers
 *         - body     : schema-lite object for JSON body (methods with body)
 *
 *     • responses - a map from HTTP status code -> schema-lite
 *         - status  : numeric HTTP status
 *         - headers : expected response headers (supports wildcard "X-*")
 *         - body    : schema-lite describing the JSON body shape
 *
 *     • examples  - request/response examples used by docs, fixtures,
 *                   snapshot diffing, and fallbacks for runner tests
 *
 *   The schema dialect ("schema-lite") is intentionally small and
 *   self-contained — see `contract-runner.js` for the full grammar:
 *
 *       'string' | 'number' | 'integer' | 'boolean' | 'array' |
 *       'object' | 'null' | 'uuid' | 'iso-date' | 'iso-datetime' |
 *       'email' | 'url' | 'any'
 *
 *     - Append '?' to mark a field as optional (e.g. 'string?').
 *     - Use nested objects / arrays for deeper shapes:
 *         { items: [ { id: 'uuid', name: 'string' } ], total: 'integer' }
 *     - Arrays with a single-element template enforce every item.
 *     - For headers, values are regex patterns (strings).
 *
 *   This file MUST be data-only — no I/O, no side-effects, no requires
 *   outside the standard library. It is imported by the runner, by
 *   `contract-runner.test.js`, and is snapshotted to
 *   `fixtures/expected-shapes.json`.
 *
 * Pre-populated endpoints (20):
 *   - Auth        : POST /api/auth/login, POST /api/auth/logout,
 *                   GET  /api/auth/me
 *   - Suppliers   : GET /api/suppliers, POST /api/suppliers,
 *                   GET /api/suppliers/:id, PATCH /api/suppliers/:id,
 *                   DELETE /api/suppliers/:id
 *   - Invoices    : GET /api/invoices, POST /api/invoices,
 *                   GET /api/invoices/:id
 *   - Payroll     : GET /api/payroll/runs, POST /api/payroll/runs,
 *                   GET /api/payroll/wage-slip/:employee_id
 *   - VAT         : GET /api/vat/periods, POST /api/vat/report
 *   - Bank        : POST /api/bank/statements/upload,
 *                   GET /api/bank/reconciliations
 *   - Annual Tax  : POST /api/annual-tax/reports, GET /api/annual-tax/:year
 *
 * Author: Agent 54 — API Contract Testing
 * ----------------------------------------------------------------
 */

'use strict';

// ---------- tiny shape helpers (kept inline to stay dependency-free) -------

/** Reusable envelope shapes that appear in many endpoints. */
const SHAPES = Object.freeze({
  pagination: {
    page: 'integer',
    per_page: 'integer',
    total: 'integer',
    total_pages: 'integer',
  },

  errorBody: {
    error: 'string',
    code: 'string?',
    details: 'object?',
    request_id: 'string?',
  },

  validationErrorBody: {
    error: 'string',
    code: 'string?',
    fields: 'array?',
    request_id: 'string?',
  },

  supplier: {
    id: 'uuid',
    name: 'string',
    tax_id: 'string',
    country: 'string',
    currency: 'string',
    email: 'email?',
    phone: 'string?',
    address: 'object?',
    is_active: 'boolean',
    created_at: 'iso-datetime',
    updated_at: 'iso-datetime',
  },

  invoice: {
    id: 'uuid',
    supplier_id: 'uuid',
    invoice_number: 'string',
    issue_date: 'iso-date',
    due_date: 'iso-date',
    currency: 'string',
    subtotal: 'number',
    vat_amount: 'number',
    total: 'number',
    status: 'string',
    created_at: 'iso-datetime',
  },

  payrollRun: {
    id: 'uuid',
    period: 'string',
    employees_count: 'integer',
    gross_total: 'number',
    net_total: 'number',
    status: 'string',
    created_at: 'iso-datetime',
  },

  wageSlip: {
    employee_id: 'uuid',
    period: 'string',
    gross: 'number',
    net: 'number',
    deductions: 'array',
    additions: 'array',
    issued_at: 'iso-datetime',
  },

  vatPeriod: {
    id: 'uuid',
    period: 'string',
    opened_at: 'iso-datetime',
    closed_at: 'iso-datetime?',
    status: 'string',
  },

  bankReconciliation: {
    id: 'uuid',
    statement_id: 'uuid',
    matched_count: 'integer',
    unmatched_count: 'integer',
    status: 'string',
    created_at: 'iso-datetime',
  },

  annualTaxReport: {
    id: 'uuid',
    year: 'integer',
    total_income: 'number',
    total_expenses: 'number',
    taxable_income: 'number',
    tax_due: 'number',
    status: 'string',
    generated_at: 'iso-datetime',
  },
});

/** Common header expectations. */
const HEADERS = Object.freeze({
  jsonResponse: {
    'content-type': '^application/json(; charset=utf-8)?$',
  },
  jsonResponseWithRateLimit: {
    'content-type': '^application/json(; charset=utf-8)?$',
    'x-ratelimit-limit': '^\\d+$',
    'x-ratelimit-remaining': '^\\d+$',
    'x-ratelimit-reset': '^\\d+$',
  },
});

/** Standard set of error responses reused across endpoints. */
function standardErrors({ include = [400, 401, 403, 404, 422, 500], validationCode = 422 } = {}) {
  const all = {
    400: {
      status: 400,
      headers: HEADERS.jsonResponse,
      body: SHAPES.errorBody,
    },
    401: {
      status: 401,
      headers: HEADERS.jsonResponse,
      body: SHAPES.errorBody,
    },
    403: {
      status: 403,
      headers: HEADERS.jsonResponse,
      body: SHAPES.errorBody,
    },
    404: {
      status: 404,
      headers: HEADERS.jsonResponse,
      body: SHAPES.errorBody,
    },
    422: {
      status: 422,
      headers: HEADERS.jsonResponse,
      body: SHAPES.validationErrorBody,
    },
    500: {
      status: 500,
      headers: HEADERS.jsonResponse,
      body: SHAPES.errorBody,
    },
  };

  // Optional alias — a few endpoints prefer 400 to represent validation.
  if (validationCode === 400 && include.includes(400)) {
    all[400] = { ...all[400], body: SHAPES.validationErrorBody };
  }

  const out = {};
  for (const code of include) out[code] = all[code];
  return out;
}

// ---------- schema registry -------------------------------------------------

const schemas = {

  // ══════════════════════════════════════════════════════════════════
  // AUTH — 3 endpoints
  // ══════════════════════════════════════════════════════════════════

  'POST /api/auth/login': {
    description: 'Exchange credentials for a session token + API key.',
    request: {
      params: {},
      query: {},
      headers: { 'content-type': '^application/json' },
      body: {
        email: 'email',
        password: 'string',
        remember_me: 'boolean?',
      },
    },
    responses: {
      200: {
        status: 200,
        headers: HEADERS.jsonResponse,
        body: {
          token: 'string',
          expires_at: 'iso-datetime',
          user: {
            id: 'uuid',
            email: 'email',
            name: 'string',
            role: 'string',
          },
        },
      },
      ...standardErrors({ include: [400, 401, 422, 500] }),
    },
    examples: {
      success: {
        request: { body: { email: 'owner@example.com', password: 'hunter2' } },
        response: {
          status: 200,
          body: {
            token: 'tok_abc123',
            expires_at: '2026-04-12T09:00:00Z',
            user: {
              id: '00000000-0000-0000-0000-000000000001',
              email: 'owner@example.com',
              name: 'Kobi El',
              role: 'admin',
            },
          },
        },
      },
      error: {
        request: { body: { email: 'owner@example.com', password: 'wrong' } },
        response: {
          status: 401,
          body: { error: 'Invalid credentials', code: 'auth.invalid_credentials' },
        },
      },
    },
  },

  'POST /api/auth/logout': {
    description: 'Invalidate the current session token.',
    request: {
      params: {},
      query: {},
      headers: { 'x-api-key': '^[A-Za-z0-9_-]+$' },
      body: {},
    },
    responses: {
      204: { status: 204, headers: {}, body: null },
      ...standardErrors({ include: [401, 500] }),
    },
    examples: {
      success: {
        request: { headers: { 'x-api-key': 'qa08-valid-key-123456' } },
        response: { status: 204, body: null },
      },
      error: {
        request: { headers: {} },
        response: { status: 401, body: { error: 'Unauthorized' } },
      },
    },
  },

  'GET /api/auth/me': {
    description: 'Return the currently authenticated user profile.',
    request: {
      params: {},
      query: {},
      headers: { 'x-api-key': '^[A-Za-z0-9_-]+$' },
      body: null,
    },
    responses: {
      200: {
        status: 200,
        headers: HEADERS.jsonResponse,
        body: {
          id: 'uuid',
          email: 'email',
          name: 'string',
          role: 'string',
          created_at: 'iso-datetime',
          last_login_at: 'iso-datetime?',
        },
      },
      ...standardErrors({ include: [401, 500] }),
    },
    examples: {
      success: {
        request: { headers: { 'x-api-key': 'qa08-valid-key-123456' } },
        response: {
          status: 200,
          body: {
            id: '00000000-0000-0000-0000-000000000001',
            email: 'owner@example.com',
            name: 'Kobi El',
            role: 'admin',
            created_at: '2026-01-01T10:00:00Z',
          },
        },
      },
      error: {
        request: { headers: {} },
        response: { status: 401, body: { error: 'Unauthorized' } },
      },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // SUPPLIERS — 5 endpoints
  // ══════════════════════════════════════════════════════════════════

  'GET /api/suppliers': {
    description: 'List suppliers with pagination and optional search.',
    request: {
      params: {},
      query: {
        page: 'integer?',
        per_page: 'integer?',
        q: 'string?',
        is_active: 'boolean?',
      },
      headers: { 'x-api-key': '^[A-Za-z0-9_-]+$' },
      body: null,
    },
    responses: {
      200: {
        status: 200,
        headers: HEADERS.jsonResponseWithRateLimit,
        body: {
          data: [SHAPES.supplier],
          pagination: SHAPES.pagination,
        },
      },
      ...standardErrors({ include: [400, 401, 403, 500] }),
    },
    examples: {
      success: {
        request: { query: { page: 1, per_page: 25 } },
        response: {
          status: 200,
          body: {
            data: [
              {
                id: '11111111-1111-1111-1111-111111111111',
                name: 'Acme Ltd',
                tax_id: '514000000',
                country: 'IL',
                currency: 'ILS',
                email: 'ops@acme.example',
                is_active: true,
                created_at: '2026-01-01T10:00:00Z',
                updated_at: '2026-01-01T10:00:00Z',
              },
            ],
            pagination: { page: 1, per_page: 25, total: 1, total_pages: 1 },
          },
        },
      },
      error: {
        request: { query: { page: -1 } },
        response: { status: 400, body: { error: 'Invalid page parameter', code: 'validation.page' } },
      },
    },
  },

  'POST /api/suppliers': {
    description: 'Create a new supplier.',
    request: {
      params: {},
      query: {},
      headers: {
        'x-api-key': '^[A-Za-z0-9_-]+$',
        'content-type': '^application/json',
      },
      body: {
        name: 'string',
        tax_id: 'string',
        country: 'string',
        currency: 'string',
        email: 'email?',
        phone: 'string?',
        address: 'object?',
      },
    },
    responses: {
      201: {
        status: 201,
        headers: HEADERS.jsonResponse,
        body: SHAPES.supplier,
      },
      ...standardErrors({ include: [400, 401, 403, 422, 500] }),
    },
    examples: {
      success: {
        request: {
          body: {
            name: 'Acme Ltd',
            tax_id: '514000000',
            country: 'IL',
            currency: 'ILS',
            email: 'ops@acme.example',
          },
        },
        response: {
          status: 201,
          body: {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Acme Ltd',
            tax_id: '514000000',
            country: 'IL',
            currency: 'ILS',
            email: 'ops@acme.example',
            is_active: true,
            created_at: '2026-04-11T10:00:00Z',
            updated_at: '2026-04-11T10:00:00Z',
          },
        },
      },
      error: {
        request: { body: { name: '' } },
        response: {
          status: 422,
          body: {
            error: 'Validation failed',
            code: 'validation.failed',
            fields: [{ field: 'name', message: 'required' }],
          },
        },
      },
    },
  },

  'GET /api/suppliers/:id': {
    description: 'Fetch a single supplier by id.',
    request: {
      params: { id: 'uuid' },
      query: {},
      headers: { 'x-api-key': '^[A-Za-z0-9_-]+$' },
      body: null,
    },
    responses: {
      200: {
        status: 200,
        headers: HEADERS.jsonResponse,
        body: SHAPES.supplier,
      },
      ...standardErrors({ include: [400, 401, 403, 404, 500] }),
    },
    examples: {
      success: {
        request: { params: { id: '11111111-1111-1111-1111-111111111111' } },
        response: {
          status: 200,
          body: {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Acme Ltd',
            tax_id: '514000000',
            country: 'IL',
            currency: 'ILS',
            is_active: true,
            created_at: '2026-01-01T10:00:00Z',
            updated_at: '2026-01-01T10:00:00Z',
          },
        },
      },
      error: {
        request: { params: { id: '00000000-0000-0000-0000-000000000000' } },
        response: { status: 404, body: { error: 'Supplier not found', code: 'suppliers.not_found' } },
      },
    },
  },

  'PATCH /api/suppliers/:id': {
    description: 'Partially update a supplier.',
    request: {
      params: { id: 'uuid' },
      query: {},
      headers: {
        'x-api-key': '^[A-Za-z0-9_-]+$',
        'content-type': '^application/json',
      },
      body: {
        name: 'string?',
        email: 'email?',
        phone: 'string?',
        address: 'object?',
        is_active: 'boolean?',
      },
    },
    responses: {
      200: {
        status: 200,
        headers: HEADERS.jsonResponse,
        body: SHAPES.supplier,
      },
      ...standardErrors({ include: [400, 401, 403, 404, 422, 500] }),
    },
    examples: {
      success: {
        request: {
          params: { id: '11111111-1111-1111-1111-111111111111' },
          body: { is_active: false },
        },
        response: {
          status: 200,
          body: {
            id: '11111111-1111-1111-1111-111111111111',
            name: 'Acme Ltd',
            tax_id: '514000000',
            country: 'IL',
            currency: 'ILS',
            is_active: false,
            created_at: '2026-01-01T10:00:00Z',
            updated_at: '2026-04-11T10:05:00Z',
          },
        },
      },
      error: {
        request: { params: { id: 'not-a-uuid' }, body: {} },
        response: { status: 400, body: { error: 'Invalid id', code: 'validation.id' } },
      },
    },
  },

  'DELETE /api/suppliers/:id': {
    description: 'Soft-delete a supplier.',
    request: {
      params: { id: 'uuid' },
      query: {},
      headers: { 'x-api-key': '^[A-Za-z0-9_-]+$' },
      body: null,
    },
    responses: {
      204: { status: 204, headers: {}, body: null },
      ...standardErrors({ include: [400, 401, 403, 404, 500] }),
    },
    examples: {
      success: {
        request: { params: { id: '11111111-1111-1111-1111-111111111111' } },
        response: { status: 204, body: null },
      },
      error: {
        request: { params: { id: '00000000-0000-0000-0000-000000000000' } },
        response: { status: 404, body: { error: 'Supplier not found' } },
      },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // INVOICES — 3 endpoints
  // ══════════════════════════════════════════════════════════════════

  'GET /api/invoices': {
    description: 'List invoices with filters (supplier, status, date range).',
    request: {
      params: {},
      query: {
        page: 'integer?',
        per_page: 'integer?',
        supplier_id: 'uuid?',
        status: 'string?',
        from: 'iso-date?',
        to: 'iso-date?',
      },
      headers: { 'x-api-key': '^[A-Za-z0-9_-]+$' },
      body: null,
    },
    responses: {
      200: {
        status: 200,
        headers: HEADERS.jsonResponseWithRateLimit,
        body: {
          data: [SHAPES.invoice],
          pagination: SHAPES.pagination,
        },
      },
      ...standardErrors({ include: [400, 401, 403, 500] }),
    },
    examples: {
      success: {
        request: { query: { supplier_id: '11111111-1111-1111-1111-111111111111' } },
        response: {
          status: 200,
          body: {
            data: [
              {
                id: '22222222-2222-2222-2222-222222222222',
                supplier_id: '11111111-1111-1111-1111-111111111111',
                invoice_number: 'INV-001',
                issue_date: '2026-04-01',
                due_date: '2026-04-30',
                currency: 'ILS',
                subtotal: 1000,
                vat_amount: 170,
                total: 1170,
                status: 'open',
                created_at: '2026-04-01T10:00:00Z',
              },
            ],
            pagination: { page: 1, per_page: 25, total: 1, total_pages: 1 },
          },
        },
      },
      error: {
        request: { query: { from: 'not-a-date' } },
        response: { status: 400, body: { error: 'Invalid from parameter', code: 'validation.from' } },
      },
    },
  },

  'POST /api/invoices': {
    description: 'Create a new invoice for an existing supplier.',
    request: {
      params: {},
      query: {},
      headers: {
        'x-api-key': '^[A-Za-z0-9_-]+$',
        'content-type': '^application/json',
      },
      body: {
        supplier_id: 'uuid',
        invoice_number: 'string',
        issue_date: 'iso-date',
        due_date: 'iso-date',
        currency: 'string',
        subtotal: 'number',
        vat_amount: 'number',
        total: 'number',
        lines: 'array?',
      },
    },
    responses: {
      201: {
        status: 201,
        headers: HEADERS.jsonResponse,
        body: SHAPES.invoice,
      },
      ...standardErrors({ include: [400, 401, 403, 422, 500] }),
    },
    examples: {
      success: {
        request: {
          body: {
            supplier_id: '11111111-1111-1111-1111-111111111111',
            invoice_number: 'INV-001',
            issue_date: '2026-04-01',
            due_date: '2026-04-30',
            currency: 'ILS',
            subtotal: 1000,
            vat_amount: 170,
            total: 1170,
          },
        },
        response: {
          status: 201,
          body: {
            id: '22222222-2222-2222-2222-222222222222',
            supplier_id: '11111111-1111-1111-1111-111111111111',
            invoice_number: 'INV-001',
            issue_date: '2026-04-01',
            due_date: '2026-04-30',
            currency: 'ILS',
            subtotal: 1000,
            vat_amount: 170,
            total: 1170,
            status: 'open',
            created_at: '2026-04-11T10:00:00Z',
          },
        },
      },
      error: {
        request: { body: { invoice_number: 'INV-001' } },
        response: {
          status: 422,
          body: {
            error: 'Validation failed',
            code: 'validation.failed',
            fields: [{ field: 'supplier_id', message: 'required' }],
          },
        },
      },
    },
  },

  'GET /api/invoices/:id': {
    description: 'Fetch a single invoice by id, including line items.',
    request: {
      params: { id: 'uuid' },
      query: { include_lines: 'boolean?' },
      headers: { 'x-api-key': '^[A-Za-z0-9_-]+$' },
      body: null,
    },
    responses: {
      200: {
        status: 200,
        headers: HEADERS.jsonResponse,
        body: {
          ...SHAPES.invoice,
          lines: 'array?',
        },
      },
      ...standardErrors({ include: [400, 401, 403, 404, 500] }),
    },
    examples: {
      success: {
        request: { params: { id: '22222222-2222-2222-2222-222222222222' } },
        response: {
          status: 200,
          body: {
            id: '22222222-2222-2222-2222-222222222222',
            supplier_id: '11111111-1111-1111-1111-111111111111',
            invoice_number: 'INV-001',
            issue_date: '2026-04-01',
            due_date: '2026-04-30',
            currency: 'ILS',
            subtotal: 1000,
            vat_amount: 170,
            total: 1170,
            status: 'open',
            created_at: '2026-04-01T10:00:00Z',
          },
        },
      },
      error: {
        request: { params: { id: '00000000-0000-0000-0000-000000000000' } },
        response: { status: 404, body: { error: 'Invoice not found' } },
      },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // PAYROLL — 3 endpoints
  // ══════════════════════════════════════════════════════════════════

  'GET /api/payroll/runs': {
    description: 'List payroll runs.',
    request: {
      params: {},
      query: { page: 'integer?', per_page: 'integer?', period: 'string?' },
      headers: { 'x-api-key': '^[A-Za-z0-9_-]+$' },
      body: null,
    },
    responses: {
      200: {
        status: 200,
        headers: HEADERS.jsonResponseWithRateLimit,
        body: {
          data: [SHAPES.payrollRun],
          pagination: SHAPES.pagination,
        },
      },
      ...standardErrors({ include: [400, 401, 403, 500] }),
    },
    examples: {
      success: {
        request: { query: { period: '2026-03' } },
        response: {
          status: 200,
          body: {
            data: [
              {
                id: '33333333-3333-3333-3333-333333333333',
                period: '2026-03',
                employees_count: 12,
                gross_total: 120000,
                net_total: 96000,
                status: 'finalized',
                created_at: '2026-03-31T23:00:00Z',
              },
            ],
            pagination: { page: 1, per_page: 25, total: 1, total_pages: 1 },
          },
        },
      },
      error: {
        request: {},
        response: { status: 401, body: { error: 'Unauthorized' } },
      },
    },
  },

  'POST /api/payroll/runs': {
    description: 'Create a new payroll run for a period.',
    request: {
      params: {},
      query: {},
      headers: {
        'x-api-key': '^[A-Za-z0-9_-]+$',
        'content-type': '^application/json',
      },
      body: {
        period: 'string',
        include_employees: 'array?',
        dry_run: 'boolean?',
      },
    },
    responses: {
      201: {
        status: 201,
        headers: HEADERS.jsonResponse,
        body: SHAPES.payrollRun,
      },
      ...standardErrors({ include: [400, 401, 403, 422, 500] }),
    },
    examples: {
      success: {
        request: { body: { period: '2026-04' } },
        response: {
          status: 201,
          body: {
            id: '33333333-3333-3333-3333-333333333334',
            period: '2026-04',
            employees_count: 12,
            gross_total: 120000,
            net_total: 96000,
            status: 'draft',
            created_at: '2026-04-11T10:00:00Z',
          },
        },
      },
      error: {
        request: { body: {} },
        response: {
          status: 422,
          body: {
            error: 'Validation failed',
            code: 'validation.failed',
            fields: [{ field: 'period', message: 'required' }],
          },
        },
      },
    },
  },

  'GET /api/payroll/wage-slip/:employee_id': {
    description: 'Fetch the most recent wage slip for an employee.',
    request: {
      params: { employee_id: 'uuid' },
      query: { period: 'string?' },
      headers: { 'x-api-key': '^[A-Za-z0-9_-]+$' },
      body: null,
    },
    responses: {
      200: {
        status: 200,
        headers: HEADERS.jsonResponse,
        body: SHAPES.wageSlip,
      },
      ...standardErrors({ include: [400, 401, 403, 404, 500] }),
    },
    examples: {
      success: {
        request: { params: { employee_id: '44444444-4444-4444-4444-444444444444' } },
        response: {
          status: 200,
          body: {
            employee_id: '44444444-4444-4444-4444-444444444444',
            period: '2026-03',
            gross: 10000,
            net: 8000,
            deductions: [
              { code: 'income_tax', amount: 1500 },
              { code: 'social_security', amount: 500 },
            ],
            additions: [],
            issued_at: '2026-03-31T23:00:00Z',
          },
        },
      },
      error: {
        request: { params: { employee_id: '00000000-0000-0000-0000-000000000000' } },
        response: { status: 404, body: { error: 'Employee not found' } },
      },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // VAT — 2 endpoints
  // ══════════════════════════════════════════════════════════════════

  'GET /api/vat/periods': {
    description: 'List VAT reporting periods.',
    request: {
      params: {},
      query: { page: 'integer?', per_page: 'integer?', year: 'integer?' },
      headers: { 'x-api-key': '^[A-Za-z0-9_-]+$' },
      body: null,
    },
    responses: {
      200: {
        status: 200,
        headers: HEADERS.jsonResponseWithRateLimit,
        body: {
          data: [SHAPES.vatPeriod],
          pagination: SHAPES.pagination,
        },
      },
      ...standardErrors({ include: [400, 401, 403, 500] }),
    },
    examples: {
      success: {
        request: { query: { year: 2026 } },
        response: {
          status: 200,
          body: {
            data: [
              {
                id: '55555555-5555-5555-5555-555555555555',
                period: '2026-Q1',
                opened_at: '2026-01-01T00:00:00Z',
                closed_at: '2026-04-01T00:00:00Z',
                status: 'filed',
              },
            ],
            pagination: { page: 1, per_page: 25, total: 1, total_pages: 1 },
          },
        },
      },
      error: {
        request: { query: { year: 'abc' } },
        response: { status: 400, body: { error: 'Invalid year', code: 'validation.year' } },
      },
    },
  },

  'POST /api/vat/report': {
    description: 'Generate a VAT 874/PCN836 report for a given period.',
    request: {
      params: {},
      query: {},
      headers: {
        'x-api-key': '^[A-Za-z0-9_-]+$',
        'content-type': '^application/json',
      },
      body: {
        period: 'string',
        format: 'string?',
        recompute: 'boolean?',
      },
    },
    responses: {
      201: {
        status: 201,
        headers: HEADERS.jsonResponse,
        body: {
          id: 'uuid',
          period: 'string',
          format: 'string',
          total_output_vat: 'number',
          total_input_vat: 'number',
          balance: 'number',
          generated_at: 'iso-datetime',
          file_url: 'url?',
        },
      },
      ...standardErrors({ include: [400, 401, 403, 422, 500] }),
    },
    examples: {
      success: {
        request: { body: { period: '2026-Q1', format: 'pcn836' } },
        response: {
          status: 201,
          body: {
            id: '55555555-5555-5555-5555-555555555556',
            period: '2026-Q1',
            format: 'pcn836',
            total_output_vat: 17000,
            total_input_vat: 5000,
            balance: 12000,
            generated_at: '2026-04-11T10:00:00Z',
          },
        },
      },
      error: {
        request: { body: {} },
        response: {
          status: 422,
          body: {
            error: 'Validation failed',
            code: 'validation.failed',
            fields: [{ field: 'period', message: 'required' }],
          },
        },
      },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // BANK — 2 endpoints
  // ══════════════════════════════════════════════════════════════════

  'POST /api/bank/statements/upload': {
    description: 'Upload a bank statement file for ingestion and matching.',
    request: {
      params: {},
      query: {},
      headers: {
        'x-api-key': '^[A-Za-z0-9_-]+$',
        'content-type': '^(multipart/form-data|application/json)',
      },
      body: {
        account_id: 'uuid',
        filename: 'string',
        content_base64: 'string?',
        format: 'string?',
      },
    },
    responses: {
      202: {
        status: 202,
        headers: HEADERS.jsonResponse,
        body: {
          statement_id: 'uuid',
          account_id: 'uuid',
          rows_imported: 'integer',
          status: 'string',
          started_at: 'iso-datetime',
        },
      },
      ...standardErrors({ include: [400, 401, 403, 413, 422, 500] }),
    },
    examples: {
      success: {
        request: {
          body: {
            account_id: '66666666-6666-6666-6666-666666666666',
            filename: 'march-2026.csv',
            format: 'csv',
          },
        },
        response: {
          status: 202,
          body: {
            statement_id: '66666666-6666-6666-6666-666666666667',
            account_id: '66666666-6666-6666-6666-666666666666',
            rows_imported: 128,
            status: 'processing',
            started_at: '2026-04-11T10:00:00Z',
          },
        },
      },
      error: {
        request: { body: {} },
        response: {
          status: 422,
          body: {
            error: 'Validation failed',
            code: 'validation.failed',
            fields: [{ field: 'account_id', message: 'required' }],
          },
        },
      },
    },
  },

  'GET /api/bank/reconciliations': {
    description: 'List bank reconciliation runs.',
    request: {
      params: {},
      query: {
        page: 'integer?',
        per_page: 'integer?',
        account_id: 'uuid?',
        status: 'string?',
      },
      headers: { 'x-api-key': '^[A-Za-z0-9_-]+$' },
      body: null,
    },
    responses: {
      200: {
        status: 200,
        headers: HEADERS.jsonResponseWithRateLimit,
        body: {
          data: [SHAPES.bankReconciliation],
          pagination: SHAPES.pagination,
        },
      },
      ...standardErrors({ include: [400, 401, 403, 500] }),
    },
    examples: {
      success: {
        request: { query: { account_id: '66666666-6666-6666-6666-666666666666' } },
        response: {
          status: 200,
          body: {
            data: [
              {
                id: '77777777-7777-7777-7777-777777777777',
                statement_id: '66666666-6666-6666-6666-666666666667',
                matched_count: 120,
                unmatched_count: 8,
                status: 'ready',
                created_at: '2026-04-11T10:05:00Z',
              },
            ],
            pagination: { page: 1, per_page: 25, total: 1, total_pages: 1 },
          },
        },
      },
      error: {
        request: {},
        response: { status: 401, body: { error: 'Unauthorized' } },
      },
    },
  },

  // ══════════════════════════════════════════════════════════════════
  // ANNUAL TAX — 2 endpoints
  // ══════════════════════════════════════════════════════════════════

  'POST /api/annual-tax/reports': {
    description: 'Generate an annual tax report (Form 1301 / 1214).',
    request: {
      params: {},
      query: {},
      headers: {
        'x-api-key': '^[A-Za-z0-9_-]+$',
        'content-type': '^application/json',
      },
      body: {
        year: 'integer',
        form: 'string?',
        include_attachments: 'boolean?',
      },
    },
    responses: {
      201: {
        status: 201,
        headers: HEADERS.jsonResponse,
        body: SHAPES.annualTaxReport,
      },
      ...standardErrors({ include: [400, 401, 403, 422, 500] }),
    },
    examples: {
      success: {
        request: { body: { year: 2025, form: '1301' } },
        response: {
          status: 201,
          body: {
            id: '88888888-8888-8888-8888-888888888888',
            year: 2025,
            total_income: 500000,
            total_expenses: 300000,
            taxable_income: 200000,
            tax_due: 60000,
            status: 'draft',
            generated_at: '2026-04-11T10:00:00Z',
          },
        },
      },
      error: {
        request: { body: {} },
        response: {
          status: 422,
          body: {
            error: 'Validation failed',
            code: 'validation.failed',
            fields: [{ field: 'year', message: 'required' }],
          },
        },
      },
    },
  },

  'GET /api/annual-tax/:year': {
    description: 'Fetch the latest annual tax report for a given year.',
    request: {
      params: { year: 'integer' },
      query: { form: 'string?' },
      headers: { 'x-api-key': '^[A-Za-z0-9_-]+$' },
      body: null,
    },
    responses: {
      200: {
        status: 200,
        headers: HEADERS.jsonResponse,
        body: SHAPES.annualTaxReport,
      },
      ...standardErrors({ include: [400, 401, 403, 404, 500] }),
    },
    examples: {
      success: {
        request: { params: { year: 2025 } },
        response: {
          status: 200,
          body: {
            id: '88888888-8888-8888-8888-888888888888',
            year: 2025,
            total_income: 500000,
            total_expenses: 300000,
            taxable_income: 200000,
            tax_due: 60000,
            status: 'filed',
            generated_at: '2026-03-31T22:00:00Z',
          },
        },
      },
      error: {
        request: { params: { year: 1800 } },
        response: { status: 404, body: { error: 'No report for year', code: 'annual_tax.not_found' } },
      },
    },
  },

};

// Freeze the registry so tests and consumers can't mutate it by accident.
// We do NOT freeze the inner SHAPES objects — schemas share references to
// them and the runner relies on being able to walk them as-is.
Object.freeze(schemas);

module.exports = {
  schemas,
  SHAPES,
  HEADERS,
  standardErrors,
  /**
   * Return the list of all endpoint keys in the registry.
   */
  listEndpoints() {
    return Object.keys(schemas);
  },
  /**
   * Retrieve one endpoint by "METHOD /path" (throws if missing).
   */
  getEndpoint(key) {
    const schema = schemas[key];
    if (!schema) {
      throw new Error(`[contract-schema] Unknown endpoint: ${key}`);
    }
    return schema;
  },
};
