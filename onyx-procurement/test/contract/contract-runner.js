/**
 * test/contract/contract-runner.js
 * ----------------------------------------------------------------
 * API Contract Test Runner
 * ----------------------------------------------------------------
 *
 * Purpose:
 *   Given a schema registry (see `contract-schema.js`), send HTTP
 *   requests against a target base URL and validate that the
 *   responses conform to the declared shape — status code, headers,
 *   and body — for whatever the server returns.
 *
 *   The runner is intentionally zero-dependency: no AJV, no JSON
 *   Schema dialect, no supertest. It uses Node's built-in http/https
 *   modules and a tiny "schema-lite" validator defined in this file.
 *
 * Schema-lite grammar
 * -------------------
 *   A field's expected type is either:
 *
 *     (a) a primitive tag (string):
 *           'string', 'number', 'integer', 'boolean', 'array',
 *           'object', 'null', 'uuid', 'iso-date', 'iso-datetime',
 *           'email', 'url', 'any'
 *         Append '?' to mark the field as optional.
 *
 *     (b) an array template [T]:
 *           [T] means "an array where every element matches T".
 *           [] means "any array".
 *
 *     (c) a nested object template { key: T, ... }:
 *           Every key in the template must exist on the value
 *           (unless marked with '?'). Extra keys are ignored by
 *           default (see `strict` option on the validator).
 *
 *     (d) a function (value) => true|string:
 *           A custom predicate. Return true for valid, or a string
 *           explaining the failure.
 *
 * Usage
 * -----
 *   const { ContractRunner, validate } = require('./contract-runner');
 *   const { schemas } = require('./contract-schema');
 *
 *   const runner = new ContractRunner({
 *     baseUrl: 'http://localhost:3000',
 *     defaultHeaders: { 'x-api-key': 'qa08-valid-key-123456' },
 *     schemas,
 *   });
 *
 *   const result = await runner.runEndpoint('GET /api/suppliers', {
 *     query: { page: 1 },
 *   });
 *   if (!result.ok) console.error(result.errors);
 *
 *   // Or run the entire registry against a live server:
 *   const report = await runner.runAll();
 *
 *   // Or just validate a shape without making an HTTP call:
 *   const errs = validate({ foo: 'bar' }, { foo: 'string' });
 *
 * Author: Agent 54 — API Contract Testing
 * ----------------------------------------------------------------
 */

'use strict';

const http = require('http');
const https = require('https');
const { URL } = require('url');

// ─────────────────────────────────────────────────────────────────────
// 1. Schema-lite validator
// ─────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Accepts both "...Z" and "...+hh:mm" and optional fractional seconds.
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;

const PRIMITIVE_CHECKERS = {
  string: (v) => (typeof v === 'string' ? true : `expected string, got ${typeofLabel(v)}`),
  number: (v) => (typeof v === 'number' && Number.isFinite(v) ? true : `expected number, got ${typeofLabel(v)}`),
  integer: (v) => (Number.isInteger(v) ? true : `expected integer, got ${typeofLabel(v)}`),
  boolean: (v) => (typeof v === 'boolean' ? true : `expected boolean, got ${typeofLabel(v)}`),
  array: (v) => (Array.isArray(v) ? true : `expected array, got ${typeofLabel(v)}`),
  object: (v) => (isPlainObject(v) ? true : `expected object, got ${typeofLabel(v)}`),
  null: (v) => (v === null ? true : `expected null, got ${typeofLabel(v)}`),
  any: () => true,
  uuid: (v) => (typeof v === 'string' && UUID_RE.test(v) ? true : `expected uuid, got ${typeofLabel(v)}`),
  'iso-date': (v) => (typeof v === 'string' && ISO_DATE_RE.test(v) ? true : `expected iso-date (YYYY-MM-DD), got ${JSON.stringify(v)}`),
  'iso-datetime': (v) => (typeof v === 'string' && ISO_DATETIME_RE.test(v) ? true : `expected iso-datetime (RFC3339), got ${JSON.stringify(v)}`),
  email: (v) => (typeof v === 'string' && EMAIL_RE.test(v) ? true : `expected email, got ${JSON.stringify(v)}`),
  url: (v) => (typeof v === 'string' && URL_RE.test(v) ? true : `expected url, got ${JSON.stringify(v)}`),
};

function typeofLabel(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validate a value against a schema-lite schema.
 *
 * @param {*} value - The value to validate.
 * @param {*} schema - The expected schema.
 * @param {object} [opts]
 * @param {boolean} [opts.strict=false] - Reject extra keys in objects.
 * @param {string} [opts.path='$'] - Current JSON path (used for errors).
 * @returns {string[]} Array of error messages; empty array means valid.
 */
function validate(value, schema, opts = {}) {
  const path = opts.path || '$';
  const strict = !!opts.strict;
  const errors = [];

  // null schema means "no body expected"
  if (schema === null) {
    if (value !== null && value !== undefined && value !== '') {
      errors.push(`${path}: expected null/empty body, got ${typeofLabel(value)}`);
    }
    return errors;
  }

  // Function predicate
  if (typeof schema === 'function') {
    const result = schema(value);
    if (result !== true) {
      errors.push(`${path}: ${result || 'predicate failed'}`);
    }
    return errors;
  }

  // Primitive tag (string)
  if (typeof schema === 'string') {
    let tag = schema;
    const optional = tag.endsWith('?');
    if (optional) tag = tag.slice(0, -1);

    // Special case: the 'null' tag is the one primitive where a null
    // value is actually the expected value — don't short-circuit it
    // through the "missing required" branch.
    if (tag === 'null') {
      if (value === null) return errors;
      if ((value === undefined) && optional) return errors;
      errors.push(`${path}: expected null, got ${typeofLabel(value)}`);
      return errors;
    }

    if (value === undefined || value === null) {
      if (!optional) {
        errors.push(`${path}: required ${tag}, got ${typeofLabel(value)}`);
      }
      return errors;
    }

    const checker = PRIMITIVE_CHECKERS[tag];
    if (!checker) {
      errors.push(`${path}: unknown schema tag "${tag}"`);
      return errors;
    }
    const result = checker(value);
    if (result !== true) errors.push(`${path}: ${result}`);
    return errors;
  }

  // Array template
  if (Array.isArray(schema)) {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected array, got ${typeofLabel(value)}`);
      return errors;
    }
    if (schema.length === 0) return errors; // any array ok
    const itemSchema = schema[0];
    for (let i = 0; i < value.length; i++) {
      errors.push(...validate(value[i], itemSchema, { strict, path: `${path}[${i}]` }));
    }
    return errors;
  }

  // Object template
  if (isPlainObject(schema)) {
    if (!isPlainObject(value)) {
      errors.push(`${path}: expected object, got ${typeofLabel(value)}`);
      return errors;
    }

    for (const key of Object.keys(schema)) {
      const sub = schema[key];
      const optional = typeof sub === 'string' && sub.endsWith('?');
      const hasKey = Object.prototype.hasOwnProperty.call(value, key);
      if (!hasKey) {
        if (!optional) {
          errors.push(`${path}.${key}: missing required field`);
        }
        continue;
      }
      errors.push(...validate(value[key], sub, { strict, path: `${path}.${key}` }));
    }

    if (strict) {
      for (const key of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(schema, key)) {
          errors.push(`${path}.${key}: unexpected field (strict mode)`);
        }
      }
    }
    return errors;
  }

  errors.push(`${path}: unsupported schema of type ${typeofLabel(schema)}`);
  return errors;
}

// ─────────────────────────────────────────────────────────────────────
// 2. Header validator
// ─────────────────────────────────────────────────────────────────────

/**
 * Validate headers against an expected map.
 *
 * Expected format:
 *   {
 *     'content-type': '^application/json$',  // regex string (case-insensitive)
 *     'x-*':          '^.+$',                // wildcard: require at least one matching header
 *   }
 *
 * Supports:
 *   - Case-insensitive header name matching.
 *   - Wildcard keys: any key ending in '*' matches every actual header
 *     that starts with the prefix. At least one matching header must
 *     exist and every matching header must satisfy the regex.
 *
 * @returns {string[]} Array of error messages.
 */
function validateHeaders(actual, expected) {
  const errors = [];
  if (!expected || Object.keys(expected).length === 0) return errors;
  if (!actual || typeof actual !== 'object') {
    errors.push('headers: missing response headers');
    return errors;
  }

  const lowerActual = {};
  for (const [k, v] of Object.entries(actual)) {
    lowerActual[k.toLowerCase()] = v;
  }

  for (const [rawKey, pattern] of Object.entries(expected)) {
    const key = rawKey.toLowerCase();

    if (key.endsWith('*')) {
      const prefix = key.slice(0, -1);
      const matches = Object.keys(lowerActual).filter((k) => k.startsWith(prefix));
      if (matches.length === 0) {
        errors.push(`headers.${rawKey}: no header matching wildcard "${rawKey}"`);
        continue;
      }
      let re;
      try { re = new RegExp(pattern, 'i'); }
      catch (e) { errors.push(`headers.${rawKey}: invalid regex "${pattern}" (${e.message})`); continue; }
      for (const m of matches) {
        const val = String(lowerActual[m] ?? '');
        if (!re.test(val)) {
          errors.push(`headers.${m}: "${val}" does not match /${pattern}/i`);
        }
      }
      continue;
    }

    const actualVal = lowerActual[key];
    if (actualVal === undefined) {
      errors.push(`headers.${rawKey}: missing required header`);
      continue;
    }
    let re;
    try { re = new RegExp(pattern, 'i'); }
    catch (e) { errors.push(`headers.${rawKey}: invalid regex "${pattern}" (${e.message})`); continue; }
    const s = String(actualVal);
    if (!re.test(s)) {
      errors.push(`headers.${rawKey}: "${s}" does not match /${pattern}/i`);
    }
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────
// 3. HTTP client (promisified, zero-dep)
// ─────────────────────────────────────────────────────────────────────

/**
 * Send an HTTP request and return { status, headers, body, raw }.
 *
 * Body is parsed as JSON when the Content-Type header indicates so;
 * otherwise returned as a string. Network/parse errors are surfaced
 * by rejecting the promise.
 *
 * @param {object} opts
 * @param {string} opts.method
 * @param {string} opts.url - Absolute URL string.
 * @param {object} [opts.headers]
 * @param {*} [opts.body] - Object (JSON-stringified) or string.
 * @param {number} [opts.timeout=10000] - ms.
 */
function httpRequest({ method, url, headers = {}, body, timeout = 10000 }) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); }
    catch (e) { return reject(new Error(`Invalid URL "${url}": ${e.message}`)); }

    const lib = parsed.protocol === 'https:' ? https : http;

    const finalHeaders = { ...headers };
    let bodyBuf = null;
    if (body !== undefined && body !== null) {
      if (typeof body === 'string') {
        bodyBuf = Buffer.from(body, 'utf8');
      } else {
        bodyBuf = Buffer.from(JSON.stringify(body), 'utf8');
        if (!hasHeader(finalHeaders, 'content-type')) {
          finalHeaders['Content-Type'] = 'application/json';
        }
      }
      if (!hasHeader(finalHeaders, 'content-length')) {
        finalHeaders['Content-Length'] = String(bodyBuf.length);
      }
    }

    const req = lib.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: finalHeaders,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const ct = String(res.headers['content-type'] || '');
        let parsedBody = raw;
        if (/application\/json/i.test(ct) && raw.length > 0) {
          try { parsedBody = JSON.parse(raw); }
          catch (e) {
            return reject(new Error(`Failed to parse JSON response from ${method} ${url}: ${e.message}`));
          }
        } else if (raw.length === 0) {
          parsedBody = null;
        }
        resolve({
          status: res.statusCode || 0,
          headers: res.headers || {},
          body: parsedBody,
          raw,
        });
      });
    });

    req.on('error', reject);
    req.setTimeout(timeout, () => {
      req.destroy(new Error(`Request timeout after ${timeout}ms: ${method} ${url}`));
    });

    if (bodyBuf) req.write(bodyBuf);
    req.end();
  });
}

function hasHeader(headers, name) {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

// ─────────────────────────────────────────────────────────────────────
// 4. URL + method utilities
// ─────────────────────────────────────────────────────────────────────

/**
 * Parse "METHOD /path" into { method, path }.
 */
function parseEndpointKey(key) {
  const m = /^([A-Z]+)\s+(\/.*)$/.exec(String(key).trim());
  if (!m) throw new Error(`Invalid endpoint key "${key}", expected "METHOD /path"`);
  return { method: m[1], path: m[2] };
}

/**
 * Substitute :param placeholders in a path with values from `params`.
 * Missing params throw a helpful error.
 */
function fillPathParams(pathTemplate, params = {}) {
  return pathTemplate.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    if (!Object.prototype.hasOwnProperty.call(params, name)) {
      throw new Error(`Missing path param ":${name}" for path "${pathTemplate}"`);
    }
    return encodeURIComponent(String(params[name]));
  });
}

/**
 * Build a query string from a flat object.
 * Ignores undefined values; stringifies everything else with encodeURIComponent.
 */
function buildQueryString(query) {
  if (!query || typeof query !== 'object') return '';
  const parts = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`);
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

/**
 * Join base + path safely (trims trailing/leading slashes).
 */
function joinUrl(base, path) {
  const b = String(base || '').replace(/\/+$/, '');
  const p = String(path || '').replace(/^\/+/, '/');
  return b + (p.startsWith('/') ? p : '/' + p);
}

// ─────────────────────────────────────────────────────────────────────
// 5. Contract runner
// ─────────────────────────────────────────────────────────────────────

class ContractRunner {
  /**
   * @param {object} options
   * @param {string} options.baseUrl - Server base URL, e.g. "http://localhost:3000".
   * @param {object} [options.defaultHeaders] - Headers merged into every request.
   * @param {object} options.schemas - Schema registry (from contract-schema.js).
   * @param {function} [options.httpClient] - Override for testing: same shape as httpRequest.
   * @param {number} [options.timeout=10000]
   * @param {boolean} [options.strict=false] - Reject unknown object fields.
   */
  constructor(options = {}) {
    if (!options.schemas || typeof options.schemas !== 'object') {
      throw new Error('ContractRunner: `schemas` registry is required');
    }
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.defaultHeaders = options.defaultHeaders || {};
    this.schemas = options.schemas;
    this.httpClient = options.httpClient || httpRequest;
    this.timeout = options.timeout ?? 10000;
    this.strict = !!options.strict;
  }

  /**
   * Validate a single request/response pair against the registry
   * without performing any I/O. Useful when the server is mocked
   * upstream or when snapshots are being checked.
   */
  validateResponse(key, { status, headers, body }) {
    const schema = this.schemas[key];
    if (!schema) return { ok: false, errors: [`Unknown endpoint "${key}"`] };

    const responseSchema = schema.responses && schema.responses[status];
    if (!responseSchema) {
      return {
        ok: false,
        errors: [`No response schema defined for status ${status} on "${key}"`],
      };
    }

    const errors = [];
    errors.push(...validateHeaders(headers, responseSchema.headers));
    errors.push(...validate(body, responseSchema.body, { strict: this.strict, path: 'body' }));

    return { ok: errors.length === 0, errors, matched: { key, status } };
  }

  /**
   * Run one endpoint against the live base URL.
   *
   * @param {string} key - "METHOD /path"
   * @param {object} [opts]
   * @param {object} [opts.params] - Path params.
   * @param {object} [opts.query]  - Query string.
   * @param {object} [opts.body]   - Request body.
   * @param {object} [opts.headers]- Extra headers (merged into defaults).
   * @param {number} [opts.expectStatus] - If provided, runner fails when the
   *        response status is different. If omitted, the runner will validate
   *        against whatever status the server returned, as long as that status
   *        has a declared response schema.
   */
  async runEndpoint(key, opts = {}) {
    const schema = this.schemas[key];
    if (!schema) {
      return { ok: false, key, errors: [`Unknown endpoint "${key}"`] };
    }

    const { method, path } = parseEndpointKey(key);
    let filledPath;
    try { filledPath = fillPathParams(path, opts.params || {}); }
    catch (e) { return { ok: false, key, errors: [e.message] }; }

    const url = joinUrl(this.baseUrl, filledPath) + buildQueryString(opts.query);
    const headers = { ...this.defaultHeaders, ...(opts.headers || {}) };

    let response;
    try {
      response = await this.httpClient({
        method, url, headers,
        body: opts.body,
        timeout: this.timeout,
      });
    } catch (e) {
      return { ok: false, key, errors: [`Network/transport error: ${e.message}`] };
    }

    if (opts.expectStatus !== undefined && opts.expectStatus !== response.status) {
      return {
        ok: false,
        key,
        status: response.status,
        errors: [`Expected status ${opts.expectStatus}, got ${response.status}`],
        response,
      };
    }

    const result = this.validateResponse(key, response);
    return {
      ok: result.ok,
      key,
      status: response.status,
      errors: result.errors,
      response,
    };
  }

  /**
   * Run every endpoint in the registry and return an aggregated report.
   *
   * Behavior:
   *   - For each endpoint, picks the first declared "success" status
   *     (anything < 400) and calls it with the schema's example request.
   *   - Collects pass/fail stats plus per-endpoint error lists.
   *
   * @param {object} [opts]
   * @param {string[]} [opts.only] - Subset of endpoint keys to run.
   * @param {function} [opts.onResult] - Callback after each result.
   */
  async runAll(opts = {}) {
    const keys = opts.only && opts.only.length > 0
      ? opts.only
      : Object.keys(this.schemas);

    const results = [];
    let passed = 0, failed = 0;

    for (const key of keys) {
      const schema = this.schemas[key];
      if (!schema) {
        const r = { ok: false, key, errors: [`Unknown endpoint "${key}"`] };
        results.push(r); failed++;
        if (opts.onResult) opts.onResult(r);
        continue;
      }

      const successCode = pickSuccessStatus(schema);
      if (successCode === null) {
        const r = { ok: false, key, errors: ['No success response declared'] };
        results.push(r); failed++;
        if (opts.onResult) opts.onResult(r);
        continue;
      }

      const example = (schema.examples && schema.examples.success && schema.examples.success.request) || {};

      const r = await this.runEndpoint(key, {
        params: example.params,
        query: example.query,
        body: example.body,
        headers: example.headers,
        expectStatus: successCode,
      });

      results.push(r);
      if (r.ok) passed++; else failed++;
      if (opts.onResult) opts.onResult(r);
    }

    return {
      ok: failed === 0,
      total: results.length,
      passed,
      failed,
      results,
    };
  }
}

/**
 * Pick the lowest 2xx status code defined on the schema's `responses` map.
 * Returns null if no success code is declared.
 */
function pickSuccessStatus(schema) {
  if (!schema || !schema.responses) return null;
  const codes = Object.keys(schema.responses)
    .map((c) => parseInt(c, 10))
    .filter((c) => c >= 200 && c < 400)
    .sort((a, b) => a - b);
  return codes.length ? codes[0] : null;
}

// ─────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────

module.exports = {
  ContractRunner,
  validate,
  validateHeaders,
  httpRequest,
  parseEndpointKey,
  fillPathParams,
  buildQueryString,
  joinUrl,
  pickSuccessStatus,
  // Regex constants exposed for tests and downstream consumers.
  _regex: { UUID_RE, ISO_DATE_RE, ISO_DATETIME_RE, EMAIL_RE, URL_RE },
};
