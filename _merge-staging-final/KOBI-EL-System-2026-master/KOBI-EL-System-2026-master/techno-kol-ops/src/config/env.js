// ═══════════════════════════════════════════════════════════════════
// TECHNO-KOL OPS — Environment Validation & Boot-Time Config Guard
// Wave 1.5 — 360° compliance hardening (Agent-23)
// ───────────────────────────────────────────────────────────────────
// Purpose:
//   - Load .env (via dotenv) at import time.
//   - Validate ALL required variables at once (no first-error-wins).
//   - Provide typed, defaulted, FROZEN accessors for the rest of the app.
//   - Log a redacted summary to the console so operators can see what was
//     loaded without leaking secrets.
//
// Usage:
//   const env = require('./config/env');
//   app.listen(env.PORT);
// ═══════════════════════════════════════════════════════════════════

'use strict';

// Load .env file into process.env (idempotent — safe to call multiple times).
try {
  require('dotenv').config();
} catch (err) {
  // dotenv is an optional convenience — if it's missing we still try to
  // validate whatever is already in process.env. We never want import of
  // this module to fail purely because dotenv wasn't installed.
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.warn('[env] dotenv not available — reading process.env directly');
  }
}

// ───────────────────────────────────────────────────────────────────
// Schema definition
// ───────────────────────────────────────────────────────────────────
// Each entry describes one environment variable:
//   required : boolean — if true, missing/empty value aborts boot
//   default  : any     — used when the var is not set (only for optional)
//   type     : 'string' | 'number' | 'csv' | 'boolean'
//   secret   : boolean — redacted in the boot summary
// ───────────────────────────────────────────────────────────────────
const SCHEMA = {
  // ─── Server ───
  PORT:               { required: true,  type: 'number',  default: 5000,                           secret: false },
  NODE_ENV:           { required: false, type: 'string',  default: 'development',                  secret: false },
  APP_URL:            { required: false, type: 'string',  default: 'http://localhost:5000',        secret: false },
  ALLOWED_ORIGINS:    { required: true,  type: 'csv',     default: undefined,                      secret: false },

  // ─── Database (Postgres / Supabase) ───
  DATABASE_URL:       { required: false, type: 'string',  default: '',                             secret: true  },
  SUPABASE_URL:       { required: true,  type: 'string',  default: undefined,                      secret: false },
  SUPABASE_ANON_KEY:  { required: true,  type: 'string',  default: undefined,                      secret: true  },

  // ─── Auth ───
  JWT_SECRET:         { required: false, type: 'string',  default: 'techno_kol_secret_2026_palantir', secret: true  },
  JWT_EXPIRES_IN:     { required: false, type: 'string',  default: '24h',                          secret: false },

  // ─── ONYX Integration ───
  ONYX_PROCUREMENT_URL:     { required: false, type: 'string', default: 'http://localhost:3100',   secret: false },
  ONYX_AI_URL:              { required: false, type: 'string', default: 'http://localhost:3200',   secret: false },
  ONYX_PROCUREMENT_API_KEY: { required: false, type: 'string', default: '',                        secret: true  },

  // ─── Logging ───
  LOG_LEVEL:          { required: false, type: 'string',  default: 'info',                         secret: false },
};

// ───────────────────────────────────────────────────────────────────
// Coercion helpers
// ───────────────────────────────────────────────────────────────────
function coerce(name, rawValue, type) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return undefined;
  }
  switch (type) {
    case 'number': {
      const n = Number(rawValue);
      if (Number.isNaN(n)) {
        throw new Error(`[env] ${name} must be a number, got "${rawValue}"`);
      }
      return n;
    }
    case 'boolean': {
      const v = String(rawValue).toLowerCase();
      return v === '1' || v === 'true' || v === 'yes' || v === 'on';
    }
    case 'csv': {
      return String(rawValue)
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
    case 'string':
    default:
      return String(rawValue);
  }
}

function isEmpty(value, type) {
  if (value === undefined || value === null) return true;
  if (type === 'csv') return !Array.isArray(value) || value.length === 0;
  if (typeof value === 'string') return value.length === 0;
  return false;
}

// ───────────────────────────────────────────────────────────────────
// Validation — collects ALL missing required vars before throwing
// ───────────────────────────────────────────────────────────────────
function validate(source) {
  const resolved = {};
  const missing = [];
  const typeErrors = [];

  for (const [name, spec] of Object.entries(SCHEMA)) {
    let value;
    try {
      value = coerce(name, source[name], spec.type);
    } catch (err) {
      typeErrors.push(err.message);
      continue;
    }

    if (isEmpty(value, spec.type)) {
      if (spec.required) {
        missing.push(name);
        continue;
      }
      value = spec.default;
    }
    resolved[name] = value;
  }

  if (missing.length > 0 || typeErrors.length > 0) {
    const lines = [];
    if (missing.length > 0) {
      lines.push(
        `Missing required environment variables (${missing.length}):`
      );
      for (const m of missing) lines.push(`  - ${m}`);
    }
    if (typeErrors.length > 0) {
      lines.push(`Type errors (${typeErrors.length}):`);
      for (const t of typeErrors) lines.push(`  - ${t}`);
    }
    lines.push('');
    lines.push('See CONFIG.md for the full environment specification.');
    const err = new Error(lines.join('\n'));
    err.name = 'EnvValidationError';
    err.missing = missing;
    err.typeErrors = typeErrors;
    throw err;
  }

  return resolved;
}

// ───────────────────────────────────────────────────────────────────
// Redaction + summary logger
// ───────────────────────────────────────────────────────────────────
function redact(value) {
  if (value === undefined || value === null || value === '') return '(empty)';
  return '****';
}

function buildSummary(config) {
  const summary = {};
  for (const [name, spec] of Object.entries(SCHEMA)) {
    const value = config[name];
    if (spec.secret) {
      summary[name] = redact(value);
    } else if (Array.isArray(value)) {
      summary[name] = `[${value.join(', ')}]`;
    } else {
      summary[name] = value === undefined || value === '' ? '(empty)' : String(value);
    }
  }
  return summary;
}

function logSummary(config, logger) {
  const log = logger || console;
  const summary = buildSummary(config);
  log.log('═══════════════════════════════════════════════════════════');
  log.log('[env] Techno-Kol OPS — environment loaded');
  log.log('───────────────────────────────────────────────────────────');
  for (const [k, v] of Object.entries(summary)) {
    log.log(`  ${k.padEnd(26)} = ${v}`);
  }
  log.log('═══════════════════════════════════════════════════════════');
}

// ───────────────────────────────────────────────────────────────────
// Build, freeze, export
// ───────────────────────────────────────────────────────────────────
function buildConfig(source) {
  const resolved = validate(source || process.env);
  return Object.freeze({ ...resolved });
}

// Expose helpers + schema on `module.exports` BEFORE freezing, so tests
// and introspection tooling can reach them. The validated config itself
// is copied onto `module.exports` and then the whole exports object is
// frozen — meaning downstream code cannot mutate either the values or
// the helpers at runtime.
module.exports.__schema = SCHEMA;
module.exports.__validate = validate;
module.exports.__buildConfig = buildConfig;
module.exports.__buildSummary = buildSummary;
module.exports.__logSummary = logSummary;
module.exports.__redact = redact;

try {
  const resolved = validate(process.env);
  Object.assign(module.exports, resolved);
  // Skip noisy summary during unit tests unless explicitly enabled.
  if (process.env.NODE_ENV !== 'test' || process.env.ENV_LOG_IN_TEST === '1') {
    logSummary(module.exports);
  }
  Object.freeze(module.exports);
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('\n[env] Boot aborted — environment is invalid:\n');
  // eslint-disable-next-line no-console
  console.error(err.message);
  throw err;
}
