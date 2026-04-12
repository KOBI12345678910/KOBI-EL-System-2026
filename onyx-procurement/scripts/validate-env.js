#!/usr/bin/env node
/**
 * ONYX PROCUREMENT — Environment Validator
 * Agent-47 / Rule: never delete, only upgrade.
 *
 * What it does:
 *   1. Walks src and server.js recursively and extracts every process.env.X usage.
 *   2. Classifies each var into required / optional / secret.
 *   3. Checks whether .env exists — if not, offers to create it from .env.example.
 *   4. If .env exists, loads it (without mutating process.env) and verifies that:
 *        - every required var is set,
 *        - and every set value looks sane for its type (URL / port / hex / base64 / path / enum).
 *   5. Prints a color-coded table: [OK] has / [MISS] missing / [WARN] default placeholder.
 *   6. Exits 1 if any required var is missing or has an obviously bad value, 0 otherwise.
 *
 * Usage:
 *   node scripts/validate-env.js                 # validate current project
 *   node scripts/validate-env.js --strict        # also fail on warnings (defaults / placeholders)
 *   node scripts/validate-env.js --fix           # auto-create .env from .env.example if missing
 *   node scripts/validate-env.js --json          # machine-readable report on stdout
 *   node scripts/validate-env.js --project=<dir> # validate a sibling project (used by validate-env-all.js)
 *   node scripts/validate-env.js --quiet         # only print failures + summary
 *
 * This script is intentionally dependency-free (pure Node core). It runs as
 * `prestart` so `npm start` cannot boot a broken process.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const FLAGS = {
  strict : argv.includes('--strict'),
  fix    : argv.includes('--fix'),
  json   : argv.includes('--json'),
  quiet  : argv.includes('--quiet'),
};
const projectArg = argv.find(a => a.startsWith('--project='));
const PROJECT_ROOT = projectArg
  ? path.resolve(projectArg.slice('--project='.length))
  : path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Colors (fall back to plain text on dumb terminals / --quiet)
// ─────────────────────────────────────────────────────────────────────────────
const isTTY = process.stdout.isTTY && !FLAGS.json;
const C = (code) => (s) => (isTTY ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = {
  green  : C('32'),
  red    : C('31'),
  yellow : C('33'),
  cyan   : C('36'),
  gray   : C('90'),
  bold   : C('1'),
};

function log(...args)  { if (!FLAGS.json && !FLAGS.quiet) console.log(...args); }
function warn(...args) { if (!FLAGS.json) console.warn(...args); }
function err(...args)  { if (!FLAGS.json) console.error(...args); }

// ─────────────────────────────────────────────────────────────────────────────
// 1. Walk the project and extract every process.env.X reference
// ─────────────────────────────────────────────────────────────────────────────
const SCAN_GLOBS = [
  'server.js',
  'src',
  'scripts',
];

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '_qa-reports']);

// Files that reference process.env only for documentation purposes should be
// excluded so the validator doesn't see itself in the mirror.
const SELF_FILES = new Set([
  path.resolve(__filename),
  path.resolve(__dirname, 'validate-env-all.js'),
]);

function walkJs(rootRel) {
  const abs = path.join(PROJECT_ROOT, rootRel);
  const out = [];
  let stat;
  try { stat = fs.statSync(abs); } catch { return out; }

  if (stat.isFile()) {
    if (abs.endsWith('.js') && !SELF_FILES.has(path.resolve(abs))) out.push(abs);
    return out;
  }
  if (!stat.isDirectory()) return out;

  const stack = [abs];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && full.endsWith('.js') && !SELF_FILES.has(path.resolve(full))) out.push(full);
    }
  }
  return out;
}

const ENV_RE = /process\.env\.([A-Z_][A-Z0-9_]*)/g;

function extractEnvVars(files) {
  const found = new Map(); // name -> Set<relative file path>
  for (const file of files) {
    let body;
    try { body = fs.readFileSync(file, 'utf8'); } catch { continue; }
    let m;
    ENV_RE.lastIndex = 0;
    while ((m = ENV_RE.exec(body)) !== null) {
      const name = m[1];
      if (!found.has(name)) found.set(name, new Set());
      found.get(name).add(path.relative(PROJECT_ROOT, file));
    }
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Classification rules
// ─────────────────────────────────────────────────────────────────────────────
// Each rule: { kind: 'required'|'optional'|'secret', type, placeholder?, enum?, min? }
// 'type' is used for value validation and hinting. 'secret' implies the value
// should not be an empty string in production and should not be the placeholder.

/** @type {Record<string, {kind:'required'|'optional'|'secret', type:string, defaultHint?:string, placeholder?:RegExp, enumValues?:string[], min?:number, max?:number, description:string}>} */
const RULES = {
  // ─── Runtime ────────────────────────────────────────────────────────────
  NODE_ENV: {
    kind: 'required', type: 'enum', enumValues: ['development', 'production', 'test', 'staging'],
    description: 'Node runtime mode. Controls logging, error exposure, and security headers.',
    defaultHint: 'development',
  },
  PORT: {
    kind: 'required', type: 'port', min: 1, max: 65535,
    description: 'TCP port the HTTP server listens on.',
    defaultHint: '3100',
  },
  LOG_LEVEL: {
    kind: 'optional', type: 'enum', enumValues: ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'],
    description: 'Pino log level threshold.',
    defaultHint: 'info',
  },
  LOG_FORMAT: {
    kind: 'optional', type: 'enum', enumValues: ['json', 'pretty'],
    description: 'Pino output format: json (prod) or pretty (dev).',
    defaultHint: 'json',
  },
  APP_URL: {
    kind: 'optional', type: 'url',
    description: 'Public base URL of this app (used in emails, QR links, OAuth callbacks).',
    defaultHint: 'http://localhost:3100',
  },
  ALLOWED_ORIGINS: {
    kind: 'optional', type: 'csv',
    description: 'Comma-separated CORS origins. Use * only in dev.',
    defaultHint: 'http://localhost:3100,http://localhost:5173',
  },

  // ─── Auth & secrets ────────────────────────────────────────────────────
  AUTH_MODE: {
    kind: 'optional', type: 'enum', enumValues: ['api_key', 'jwt', 'disabled'],
    description: 'Authentication strategy. NEVER use disabled in production.',
    defaultHint: 'api_key',
  },
  API_KEYS: {
    kind: 'secret', type: 'csv-hex',
    description: 'Comma-separated API keys (hex, generate with: openssl rand -hex 32).',
    placeholder: /YOUR_|CHANGE_ME|example/i,
  },
  API_KEY: {
    kind: 'secret', type: 'hex',
    description: 'Single API key for this service (hex, 32+ chars).',
    placeholder: /YOUR_|CHANGE_ME|example/i,
  },
  JWT_SECRET: {
    kind: 'secret', type: 'secret',
    description: 'JWT signing secret (32+ random bytes, base64 or hex).',
    placeholder: /YOUR_|CHANGE_ME|example|secret123/i,
    min: 32,
  },
  WEBHOOK_SECRET: {
    kind: 'secret', type: 'secret',
    description: 'HMAC shared secret for inbound webhook verification (32+ bytes).',
    placeholder: /YOUR_|CHANGE_ME|example/i,
    min: 16,
  },
  WHATSAPP_APP_SECRET: {
    kind: 'secret', type: 'secret',
    description: 'Meta App Secret used to HMAC-verify WhatsApp webhook signatures.',
    placeholder: /YOUR_/i,
  },
  WHATSAPP_VERIFY_TOKEN: {
    kind: 'secret', type: 'string',
    description: 'Static token Meta echoes back during webhook subscription handshake.',
    placeholder: /YOUR_/i,
  },
  WHATSAPP_TOKEN: {
    kind: 'secret', type: 'string',
    description: 'Meta Graph API bearer token for outbound WhatsApp messages.',
    placeholder: /YOUR_/i,
  },
  WHATSAPP_PHONE_ID: {
    kind: 'optional', type: 'string',
    description: 'WhatsApp Business phone-number ID used as sender.',
    placeholder: /YOUR_/i,
  },

  // ─── Supabase ───────────────────────────────────────────────────────────
  SUPABASE_URL: {
    kind: 'required', type: 'url',
    description: 'Supabase project REST URL (https://<ref>.supabase.co).',
    placeholder: /YOUR_PROJECT/,
  },
  SUPABASE_ANON_KEY: {
    kind: 'required', type: 'jwt',
    description: 'Public anon key (safe for browser, RLS enforced).',
    placeholder: /YOUR_/i,
  },
  SUPABASE_SERVICE_ROLE_KEY: {
    kind: 'secret', type: 'jwt',
    description: 'Service role key — BYPASSES RLS. Server-side only.',
    placeholder: /YOUR_/i,
  },
  SUPABASE_SERVICE_KEY: {
    // Alias some older scripts look for.
    kind: 'secret', type: 'jwt',
    description: 'Alias for SUPABASE_SERVICE_ROLE_KEY (legacy scripts/seed-data.js).',
    placeholder: /YOUR_/i,
  },
  SUPABASE_SERVICE_ROLE: {
    kind: 'secret', type: 'jwt',
    description: 'Alias for SUPABASE_SERVICE_ROLE_KEY (very old code).',
    placeholder: /YOUR_/i,
  },
  SUPABASE_DB_URL: {
    kind: 'optional', type: 'url',
    description: 'Direct Postgres connection string (used by migrate-verify via pg).',
  },
  SUPABASE_BACKUP_TABLES: {
    kind: 'optional', type: 'csv',
    description: 'Comma-separated list of tables backup.js should dump. Empty = all public tables.',
  },

  // ─── Twilio SMS ─────────────────────────────────────────────────────────
  TWILIO_SID: {
    kind: 'optional', type: 'string',
    description: 'Twilio Account SID (starts with AC...).',
  },
  TWILIO_AUTH_TOKEN: {
    kind: 'secret', type: 'secret',
    description: 'Twilio auth token — keep secret, rotate regularly.',
    placeholder: /YOUR_/i,
  },
  TWILIO_FROM: {
    kind: 'optional', type: 'string',
    description: 'Twilio sender number in E.164 format, e.g. +15551234567.',
  },

  // ─── Tax / VAT ─────────────────────────────────────────────────────────
  VAT_RATE: {
    kind: 'optional', type: 'float', min: 0, max: 1,
    description: 'Israel VAT rate as decimal. 2026 default: 0.17.',
    defaultHint: '0.17',
  },
  ISRAEL_TAX_VAT_FILE_NUMBER: {
    kind: 'optional', type: 'string',
    description: 'Company VAT file number assigned by the Israel Tax Authority.',
  },
  ISRAEL_TAX_COMPANY_ID: {
    kind: 'optional', type: 'string',
    description: '9-digit company / Osek Morshe ID.',
  },

  // ─── Paths / file system ───────────────────────────────────────────────
  PAYROLL_PDF_DIR: {
    kind: 'optional', type: 'path',
    description: 'Directory where generated payroll PDFs are written.',
    defaultHint: './data/payroll/pdf',
  },
  BACKUP_DIR: {
    kind: 'optional', type: 'path',
    description: 'Output directory for scripts/backup.js dumps.',
    defaultHint: './backups',
  },
  PCN836_ARCHIVE_DIR: {
    kind: 'optional', type: 'path',
    description: 'Archive directory for PCN836 VAT submission XML files.',
    defaultHint: './data/pcn836',
  },

  // ─── Rate limits ───────────────────────────────────────────────────────
  RATE_LIMIT_API_MAX: {
    kind: 'optional', type: 'int', min: 1,
    description: 'Max API requests per window (15min).',
    defaultHint: '300',
  },
  RATE_LIMIT_WEBHOOK_MAX: {
    kind: 'optional', type: 'int', min: 1,
    description: 'Max inbound webhook requests per window.',
    defaultHint: '120',
  },

  // ─── Observability ─────────────────────────────────────────────────────
  SENTRY_DSN: {
    kind: 'optional', type: 'url',
    description: 'Sentry DSN for error tracking (https://...@sentry.io/...).',
  },
  RELEASE: {
    kind: 'optional', type: 'string',
    description: 'Release tag used by Sentry / error-tracker (falls back to pkg version).',
  },

  // ─── Alerting (ops) ────────────────────────────────────────────────────
  NOTIFY_CHANNELS: {
    kind: 'optional', type: 'csv',
    description: 'Enabled alert channels. e.g. "file,email,whatsapp".',
  },
  NOTIFY_FILE_PATH: {
    kind: 'optional', type: 'path',
    description: 'Path to alerts log file.',
  },
  NOTIFY_EMAIL_TO: {
    kind: 'optional', type: 'email',
    description: 'Email recipient for ops alerts.',
  },
  NOTIFY_WHATSAPP_TO: {
    kind: 'optional', type: 'phone',
    description: 'WhatsApp recipient phone in E.164 format.',
  },
  NOTIFY_SMS_TO: {
    kind: 'optional', type: 'phone',
    description: 'SMS fallback recipient phone in E.164 format.',
  },

  // ─── Onyx AI bridge ────────────────────────────────────────────────────
  ONYX_AI_URL: {
    kind: 'optional', type: 'url',
    description: 'Base URL of the Onyx AI service.',
  },
  ONYX_AI_API_KEY: {
    kind: 'secret', type: 'hex',
    description: 'Shared secret sent as X-API-Key to Onyx AI.',
    placeholder: /YOUR_/i,
  },

  // ─── Load test harness (not prod) ──────────────────────────────────────
  LOAD_TEST_BASE_URL:  { kind: 'optional', type: 'url',    description: 'Base URL used by test/load/api-load.js.' },
  LOAD_TEST_API_KEY:   { kind: 'optional', type: 'string', description: 'API key used by load tests.' },
  LOAD_TEST_TIMEOUT_MS:{ kind: 'optional', type: 'int', min: 1, description: 'Per-request timeout in ms.' },
  LOAD_TEST_ONLY:      { kind: 'optional', type: 'csv',    description: 'Subset of load-test scenarios to run.' },
};

// Defaults that are considered "too weak for production" (trigger WARN, and FAIL in --strict).
const WEAK_DEFAULTS = new Set([
  'onyx_verify_2026',
  'dev-key',
  'change-me',
  'changeme',
  'secret',
  'password',
  '12345',
]);

function classify(name) {
  if (RULES[name]) return RULES[name];
  // Unknown var — treat as optional/string (we still show it so the human sees it).
  const isSecretish = /SECRET|TOKEN|KEY|PASSWORD|PRIVATE/.test(name);
  return {
    kind: isSecretish ? 'secret' : 'optional',
    type: 'string',
    description: '(no rule) auto-classified by name heuristic',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Load .env without polluting process.env
// ─────────────────────────────────────────────────────────────────────────────
function parseEnv(text) {
  /** @type {Record<string,string>} */
  const out = {};
  const lines = text.split(/\r?\n/);
  for (let raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Value validators
// ─────────────────────────────────────────────────────────────────────────────
const VALIDATORS = {
  url(v)   { try { const u = new URL(v); return !!u.protocol && !!u.host; } catch { return false; } },
  port(v)  { const n = Number(v); return Number.isInteger(n) && n > 0 && n <= 65535; },
  int(v, rule)   { const n = Number(v); if (!Number.isInteger(n)) return false; if (rule.min != null && n < rule.min) return false; if (rule.max != null && n > rule.max) return false; return true; },
  float(v, rule) { const n = Number(v); if (!Number.isFinite(n)) return false; if (rule.min != null && n < rule.min) return false; if (rule.max != null && n > rule.max) return false; return true; },
  hex(v)   { return /^[0-9a-fA-F]{16,}$/.test(v); },
  'csv-hex'(v) { return v.split(',').map(s => s.trim()).filter(Boolean).every(k => /^[0-9a-fA-F]{16,}$/.test(k)); },
  base64(v){ return /^[A-Za-z0-9+/=_-]{16,}$/.test(v); },
  jwt(v)   { return /^ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/.test(v); },
  enum(v, rule) { return rule.enumValues.includes(v); },
  csv(v)   { return typeof v === 'string' && v.length > 0; },
  path(v)  { return typeof v === 'string' && v.length > 0; },
  email(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); },
  phone(v) { return /^\+?[0-9]{7,15}$/.test(v.replace(/[\s-]/g, '')); },
  secret(v, rule) { return v.length >= (rule.min || 8); },
  string(v){ return typeof v === 'string' && v.length > 0; },
};

function validateValue(name, value, rule) {
  if (value === undefined) return { ok: false, reason: 'unset' };
  if (value === '') return { ok: false, reason: 'empty' };

  if (rule.placeholder && rule.placeholder.test(value)) {
    return { ok: false, reason: 'placeholder', soft: true };
  }
  if (WEAK_DEFAULTS.has(value.toLowerCase())) {
    return { ok: false, reason: 'weak-default', soft: true };
  }

  const fn = VALIDATORS[rule.type] || VALIDATORS.string;
  const ok = fn(value, rule);
  if (!ok) return { ok: false, reason: `bad-${rule.type}` };
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Main
// ─────────────────────────────────────────────────────────────────────────────
function main() {
  const projectName = path.basename(PROJECT_ROOT);
  log(c.bold(c.cyan(`\n═══ env-validator :: ${projectName} ═══`)));
  log(c.gray(`   root: ${PROJECT_ROOT}`));

  // 5.1 Scan the codebase
  const files = [];
  for (const g of SCAN_GLOBS) files.push(...walkJs(g));
  log(c.gray(`   scanned ${files.length} .js files`));

  const referenced = extractEnvVars(files);
  // Always include the "important" vars the user explicitly asked for, even
  // if they aren't yet referenced in code — they still show up in .env.example.
  const ALWAYS = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'JWT_SECRET', 'WEBHOOK_SECRET',
                  'API_KEY', 'PORT', 'NODE_ENV', 'LOG_LEVEL', 'PAYROLL_PDF_DIR', 'BACKUP_DIR'];
  for (const n of ALWAYS) if (!referenced.has(n)) referenced.set(n, new Set(['(declared by validator)']));

  const varNames = Array.from(referenced.keys()).sort();

  // 5.2 Locate .env
  const envPath = path.join(PROJECT_ROOT, '.env');
  const examplePath = path.join(PROJECT_ROOT, '.env.example');
  let envExists = fs.existsSync(envPath);

  if (!envExists) {
    warn(c.yellow(`   ! .env not found at ${envPath}`));
    if (FLAGS.fix && fs.existsSync(examplePath)) {
      fs.copyFileSync(examplePath, envPath);
      log(c.green(`   + created .env from .env.example`));
      envExists = true;
    } else if (fs.existsSync(examplePath)) {
      warn(c.yellow(`   -> run: cp .env.example .env   (or: node scripts/validate-env.js --fix)`));
    } else {
      warn(c.yellow(`   -> .env.example also missing; cannot scaffold`));
    }
  }

  /** @type {Record<string,string>} */
  const envFile = envExists ? parseEnv(fs.readFileSync(envPath, 'utf8')) : {};

  // 5.3 Evaluate each var
  /** @type {Array<{name:string, kind:string, status:string, reason?:string, files:string[], description:string}>} */
  const rows = [];
  let missingRequired = 0;
  let placeholderCount = 0;
  let badValueCount = 0;

  for (const name of varNames) {
    const rule = classify(name);
    const value = envFile[name] !== undefined ? envFile[name] : process.env[name];
    const filesUsing = Array.from(referenced.get(name));

    let status = 'OK';
    let reason;

    if (rule.kind === 'required') {
      const r = validateValue(name, value, rule);
      if (!r.ok) {
        if (r.reason === 'unset' || r.reason === 'empty') {
          status = 'MISS'; reason = 'required but not set'; missingRequired++;
        } else if (r.soft) {
          status = 'WARN'; reason = `required uses ${r.reason}`; placeholderCount++;
        } else {
          status = 'MISS'; reason = `invalid (${r.reason})`; badValueCount++;
        }
      }
    } else if (rule.kind === 'secret') {
      if (value === undefined || value === '') {
        // Secrets default to optional in dev; only hard-fail in production.
        if ((envFile.NODE_ENV || process.env.NODE_ENV) === 'production') {
          status = 'MISS'; reason = 'secret required in production'; missingRequired++;
        } else {
          status = 'WARN'; reason = 'secret not set (ok in dev)'; placeholderCount++;
        }
      } else {
        const r = validateValue(name, value, rule);
        if (!r.ok) {
          status = 'WARN';
          reason = r.reason;
          if (r.soft) placeholderCount++; else badValueCount++;
        }
      }
    } else {
      // optional
      if (value !== undefined && value !== '') {
        const r = validateValue(name, value, rule);
        if (!r.ok) {
          status = 'WARN';
          reason = r.reason;
          if (r.soft) placeholderCount++; else badValueCount++;
        }
      } else {
        status = 'OK'; reason = `using default${rule.defaultHint ? ' (' + rule.defaultHint + ')' : ''}`;
      }
    }

    rows.push({
      name,
      kind: rule.kind,
      type: rule.type,
      status,
      reason,
      files: filesUsing,
      description: rule.description,
    });
  }

  // 5.4 Print report
  if (FLAGS.json) {
    const report = {
      project: projectName,
      root: PROJECT_ROOT,
      envFileFound: envExists,
      summary: {
        total: rows.length,
        ok: rows.filter(r => r.status === 'OK').length,
        miss: rows.filter(r => r.status === 'MISS').length,
        warn: rows.filter(r => r.status === 'WARN').length,
        missingRequired,
        placeholderCount,
        badValueCount,
      },
      vars: rows,
    };
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    const byKind = { required: [], secret: [], optional: [] };
    for (const r of rows) byKind[r.kind].push(r);

    const symbol = {
      OK:   c.green('[OK]'),
      MISS: c.red('[MISS]'),
      WARN: c.yellow('[WARN]'),
    };

    for (const kind of ['required', 'secret', 'optional']) {
      if (!byKind[kind].length) continue;
      log('\n' + c.bold(c.cyan(`── ${kind.toUpperCase()} (${byKind[kind].length}) ──`)));
      for (const r of byKind[kind]) {
        if (FLAGS.quiet && r.status === 'OK') continue;
        const tag = symbol[r.status] || r.status;
        const why = r.reason ? c.gray(` — ${r.reason}`) : '';
        log(`  ${tag} ${r.name.padEnd(26)} ${c.gray(r.type.padEnd(10))}${why}`);
      }
    }

    log('\n' + c.bold('── summary ──'));
    log(`  total vars     : ${rows.length}`);
    log(`  ${c.green('OK   ')}          : ${rows.filter(r => r.status === 'OK').length}`);
    log(`  ${c.yellow('WARN ')}          : ${rows.filter(r => r.status === 'WARN').length}`);
    log(`  ${c.red('MISS ')}          : ${rows.filter(r => r.status === 'MISS').length}`);
    log(`  missing required: ${missingRequired}`);
    log(`  placeholders    : ${placeholderCount}`);
    log(`  bad values      : ${badValueCount}`);
    log('');
  }

  // 5.5 Exit code
  const hardFail = missingRequired > 0 || badValueCount > 0;
  const softFail = placeholderCount > 0;
  if (hardFail) {
    if (!FLAGS.json) err(c.red(c.bold(`FAIL: ${missingRequired} missing required var(s), ${badValueCount} bad value(s).`)));
    process.exit(1);
  }
  if (FLAGS.strict && softFail) {
    if (!FLAGS.json) err(c.yellow(c.bold(`FAIL (--strict): ${placeholderCount} placeholder/default(s).`)));
    process.exit(1);
  }
  if (!FLAGS.json && !FLAGS.quiet) log(c.green(c.bold('PASS')));
  process.exit(0);
}

if (require.main === module) {
  try { main(); }
  catch (e) { err(c.red('validate-env crashed:'), e && e.stack || e); process.exit(2); }
}

module.exports = { parseEnv, classify, validateValue, RULES };
