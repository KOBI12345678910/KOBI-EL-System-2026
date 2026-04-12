/**
 * ONYX JOBS — Registry (job catalog + registration API)
 * ──────────────────────────────────────────────────────
 * Agent-77 / Scheduled Jobs Framework
 *
 * Purpose:
 *   A single source of truth for every scheduled job in ONYX. This module
 *   provides two things:
 *
 *     1. registerJob({ id, cron, handler, ... })  — imperative API so
 *        any module can push its own job into the global registry.
 *
 *     2. DEFAULT_JOBS — a curated list of the 12 jobs listed in the
 *        Agent-77 brief, each with a default handler that logs and
 *        performs the minimum real work (e.g. daily-backup spawns
 *        scripts/backup.js as a child, the reminders write a record to
 *        data/reminders/*.jsonl, etc.).  Handlers never delete data.
 *
 *   The registry is PURELY ADDITIVE — importing it does NOT start the
 *   scheduler. jobs-runner.js is the thing that wires everything together
 *   and calls scheduler.start().
 *
 *   Handlers are intentionally conservative: they are defensive about
 *   missing files and missing env, because this framework is expected to
 *   run in both dev and prod, and the author's rule is "never delete".
 *
 * Handlers receive an execution context:
 *   ctx = {
 *     id:          string
 *     scheduledAt: Date
 *     attempt:     number
 *     logger:      { info, warn, error, debug }
 *   }
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

// ─────────────────────────────────────────────────────────────────
// REGISTRY
// ─────────────────────────────────────────────────────────────────

/** @type {Array<import('./scheduler').JobDefinition>} */
const registry = [];

function registerJob(def) {
  if (!def || typeof def !== 'object') {
    throw new TypeError('registerJob: definition required');
  }
  if (!def.id) throw new Error('registerJob: id required');
  if (registry.some(j => j.id === def.id)) {
    throw new Error(`registerJob: duplicate job id "${def.id}"`);
  }
  registry.push({ ...def });
  return def;
}

function listJobs() {
  return registry.slice();
}

function getJob(id) {
  return registry.find(j => j.id === id) || null;
}

function clearRegistry() {
  registry.length = 0;
}

// ─────────────────────────────────────────────────────────────────
// DEFAULT HANDLERS
// ─────────────────────────────────────────────────────────────────
//
// Each handler is a small, independent async function. They log via
// ctx.logger so the caller can wire it to a real logger (pino in
// production, no-op in tests).
//

function dataDir() {
  return process.env.ONYX_DATA_DIR || path.join(process.cwd(), 'data');
}

function remindersDir() {
  const d = path.join(dataDir(), 'reminders');
  try { fs.mkdirSync(d, { recursive: true }); } catch (_) {}
  return d;
}

function writeReminder(kind, payload) {
  const file = path.join(remindersDir(), `${kind}.jsonl`);
  const line = JSON.stringify({ kind, createdAt: new Date().toISOString(), ...payload });
  fs.appendFileSync(file, line + '\n', 'utf8');
  return file;
}

/**
 * daily-backup — spawns scripts/backup.js as a child process. The script
 * is Agent-59's canonical backup runner; we NEVER implement "delete old
 * backups" here. We only call the script and propagate exit codes.
 */
async function runDailyBackup(ctx) {
  return await spawnScript('scripts/backup.js', [], ctx);
}

/**
 * monthly-vat-reminder — appends a reminder row; downstream systems can
 * pick it up via email/WhatsApp. Does not send notifications itself.
 */
async function runMonthlyVatReminder(ctx) {
  const file = writeReminder('vat-submission', {
    for: prevMonthLabel(ctx.scheduledAt),
    reason: 'monthly-vat-reminder',
    instructions: 'Submit the monthly VAT declaration for the previous month in MAS.IL.',
  });
  ctx.logger.info({ id: ctx.id, file }, 'reminder.vat.written');
}

async function runMonthlyWageSlip(ctx) {
  const file = writeReminder('wage-slip', {
    for: ctx.scheduledAt.toISOString().slice(0, 7),
    reason: 'monthly-wage-slip',
    instructions: 'Compute payroll and emit wage slips before month-end.',
  });
  ctx.logger.info({ id: ctx.id, file }, 'reminder.wage.written');
}

async function runQuarterlyTaxReport(ctx) {
  const month = ctx.scheduledAt.getMonth() + 1;
  const quarter =
    month === 1 ? 'Q4-prior' :
    month === 4 ? 'Q1' :
    month === 7 ? 'Q2' :
    month === 10 ? 'Q3' : 'unknown';
  const file = writeReminder('quarterly-tax', {
    quarter,
    reason: 'quarterly-tax-report',
    instructions: 'Prepare and submit the quarterly tax report to the Tax Authority.',
  });
  ctx.logger.info({ id: ctx.id, file, quarter }, 'reminder.quarterlyTax.written');
}

async function runAnnualTaxReminder(ctx) {
  const yr = ctx.scheduledAt.getFullYear();
  const file = writeReminder('annual-tax', {
    year: yr - 1,
    reason: 'annual-tax-reminder',
    instructions: `Annual tax filing for year ${yr - 1} is due. Open the ONYX tax exporter and produce the year pack.`,
  });
  ctx.logger.info({ id: ctx.id, file, year: yr - 1 }, 'reminder.annualTax.written');
}

async function runOverdueInvoicesAlert(ctx) {
  const file = writeReminder('overdue-invoices', {
    at: ctx.scheduledAt.toISOString(),
    reason: 'overdue-invoices-alert',
    instructions: 'Scan invoices whose due_date < today and status != paid; notify finance.',
  });
  ctx.logger.info({ id: ctx.id, file }, 'reminder.overdueInvoices.written');
}

async function runLowCashAlert(ctx) {
  const file = writeReminder('low-cash', {
    at: ctx.scheduledAt.toISOString(),
    reason: 'low-cash-alert',
    instructions: 'Compare latest bank balances with rolling-30-day burn rate and alert if coverage < 45 days.',
  });
  ctx.logger.info({ id: ctx.id, file }, 'reminder.lowCash.written');
}

/**
 * health-check — writes a heartbeat row. Does not delete anything.
 * The weekly clean-old-logs job prunes the logs/ directory only.
 */
async function runHealthCheck(ctx) {
  const hbFile = path.join(dataDir(), 'health', 'heartbeat.jsonl');
  try { fs.mkdirSync(path.dirname(hbFile), { recursive: true }); } catch (_) {}
  const row = JSON.stringify({
    at: ctx.scheduledAt.toISOString(),
    ok: true,
    pid: process.pid,
    memRss: process.memoryUsage().rss,
    uptime: process.uptime(),
  });
  fs.appendFileSync(hbFile, row + '\n', 'utf8');
  ctx.logger.debug({ id: ctx.id }, 'health.heartbeat.written');
}

/**
 * metrics-aggregation — emits a rollup snapshot of process-level metrics.
 * Real metrics come from src/ops/metrics.js; we only persist an hourly
 * roll-up row.
 */
async function runMetricsAggregation(ctx) {
  const file = path.join(dataDir(), 'metrics', 'hourly.jsonl');
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch (_) {}
  const mem = process.memoryUsage();
  const row = JSON.stringify({
    at: ctx.scheduledAt.toISOString(),
    rss: mem.rss,
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    uptimeSec: process.uptime(),
  });
  fs.appendFileSync(file, row + '\n', 'utf8');
  ctx.logger.info({ id: ctx.id, file }, 'metrics.aggregation.written');
}

/**
 * clean-old-logs — ARCHIVES (never deletes) logs older than 90 days.
 * The author's rule is "never delete". So we rename .log / .jsonl files
 * whose mtime is older than RETENTION_DAYS by appending `.archived-<ts>`.
 * Downstream operators are free to move archived files off-disk manually.
 */
async function runCleanOldLogs(ctx) {
  const RETENTION_DAYS = 90;
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    ctx.logger.info({ id: ctx.id, logsDir }, 'cleanOldLogs.noop_no_dir');
    return;
  }
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const entries = fs.readdirSync(logsDir);
  let archived = 0;
  for (const name of entries) {
    if (name.includes('.archived-')) continue; // already archived
    const full = path.join(logsDir, name);
    let stat;
    try { stat = fs.statSync(full); } catch (_) { continue; }
    if (!stat.isFile()) continue;
    if (stat.mtimeMs > cutoff) continue;
    const archivedName = `${name}.archived-${Date.now()}`;
    try {
      fs.renameSync(full, path.join(logsDir, archivedName));
      archived += 1;
    } catch (err) {
      ctx.logger.warn({ err: err && err.message, name }, 'cleanOldLogs.rename_failed');
    }
  }
  ctx.logger.info({ id: ctx.id, archived, retentionDays: RETENTION_DAYS }, 'cleanOldLogs.done');
}

/**
 * token-refresh — refreshes external API tokens (WhatsApp, bank, etc.).
 * Placeholder: writes an audit row. Real refresh logic belongs to the
 * individual adapter modules; registering them here lets the admin UI
 * see their schedule.
 */
async function runTokenRefresh(ctx) {
  const file = path.join(dataDir(), 'audit', 'token-refresh.jsonl');
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); } catch (_) {}
  const row = JSON.stringify({
    at: ctx.scheduledAt.toISOString(),
    targets: ['whatsapp', 'bank', 'mas-il'],
    note: 'token-refresh handler invoked — delegate to adapter modules when wired',
  });
  fs.appendFileSync(file, row + '\n', 'utf8');
  ctx.logger.info({ id: ctx.id }, 'tokenRefresh.audit.written');
}

/**
 * cache-warm — triggers pre-computation of heavy dashboards at 06:00.
 * Placeholder hits a small set of internal URLs; if the server isn't
 * running we log and return without throwing.
 */
async function runCacheWarm(ctx) {
  const urls = (process.env.ONYX_CACHE_WARM_URLS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (urls.length === 0) {
    ctx.logger.info({ id: ctx.id }, 'cacheWarm.skipped_no_urls');
    return;
  }
  const http = require('node:http');
  const https = require('node:https');
  for (const u of urls) {
    await new Promise(resolve => {
      const client = u.startsWith('https:') ? https : http;
      const req = client.get(u, res => {
        res.on('data', () => {});
        res.on('end', () => {
          ctx.logger.debug({ url: u, status: res.statusCode }, 'cacheWarm.ok');
          resolve();
        });
      });
      req.on('error', err => {
        ctx.logger.warn({ url: u, err: err && err.message }, 'cacheWarm.error');
        resolve();
      });
      req.setTimeout(30_000, () => {
        req.destroy();
        resolve();
      });
    });
  }
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function prevMonthLabel(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7); // YYYY-MM
}

function spawnScript(relPath, args, ctx) {
  return new Promise((resolve, reject) => {
    const cwd = process.cwd();
    const script = path.join(cwd, relPath);
    if (!fs.existsSync(script)) {
      // Don't throw — a missing backup script shouldn't crash the scheduler.
      ctx.logger.warn({ script }, 'spawnScript.missing_script_noop');
      return resolve({ skipped: true });
    }
    const child = spawn(process.execPath, [script, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', err => reject(err));
    child.on('exit', code => {
      if (code === 0) {
        ctx.logger.info({ id: ctx.id, script: relPath }, 'spawnScript.ok');
        resolve({ code, stdout: stdout.slice(-2000), stderr: stderr.slice(-2000) });
      } else {
        const msg = `${relPath} exited with code ${code}`;
        ctx.logger.error({ id: ctx.id, code, stderr: stderr.slice(-2000) }, 'spawnScript.failed');
        reject(new Error(msg));
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────
// DEFAULT JOBS CATALOG
// ─────────────────────────────────────────────────────────────────

const DEFAULT_JOBS = [
  {
    id: 'daily-backup',
    description: 'Full Supabase backup via scripts/backup.js (Agent-59)',
    category: 'backup',
    cron: '0 2 * * *',
    handler: runDailyBackup,
    timeout: 30 * 60 * 1000,
    retries: 2,
    retryDelayMs: 60_000,
    onFailure: 'notify-admin',
  },
  {
    id: 'monthly-vat-reminder',
    description: 'Reminder to submit monthly VAT declaration',
    category: 'tax',
    cron: '0 9 10 * *', // 09:00 on day 10 of each month
    handler: runMonthlyVatReminder,
    timeout: 60_000,
    retries: 1,
    onFailure: 'notify-admin',
  },
  {
    id: 'monthly-wage-slip',
    description: 'Reminder to compute payroll and produce wage slips',
    category: 'payroll',
    cron: '0 9 25 * *', // 09:00 on day 25 of each month
    handler: runMonthlyWageSlip,
    timeout: 60_000,
    retries: 1,
    onFailure: 'notify-admin',
  },
  {
    id: 'quarterly-tax-report',
    description: 'Quarterly tax reporting reminder',
    category: 'tax',
    cron: '0 8 1 1,4,7,10 *', // 08:00 on Jan 1 / Apr 1 / Jul 1 / Oct 1
    handler: runQuarterlyTaxReport,
    timeout: 60_000,
    retries: 1,
    onFailure: 'notify-admin',
  },
  {
    id: 'annual-tax-reminder',
    description: 'Annual tax filing reminder (Jan 1 for previous year)',
    category: 'tax',
    cron: '0 8 1 1 *',
    handler: runAnnualTaxReminder,
    timeout: 60_000,
    retries: 1,
    onFailure: 'notify-admin',
  },
  {
    id: 'overdue-invoices-alert',
    description: 'Daily alert for invoices past their due date',
    category: 'finance',
    cron: '0 9 * * *',
    handler: runOverdueInvoicesAlert,
    timeout: 5 * 60 * 1000,
    retries: 1,
    onFailure: 'notify-admin',
  },
  {
    id: 'low-cash-alert',
    description: 'Daily alert when cash runway drops below threshold',
    category: 'finance',
    cron: '0 8 * * *',
    handler: runLowCashAlert,
    timeout: 5 * 60 * 1000,
    retries: 1,
    onFailure: 'notify-admin',
  },
  {
    id: 'health-check',
    description: 'Write a heartbeat row every 5 minutes',
    category: 'ops',
    cron: '*/5 * * * *',
    handler: runHealthCheck,
    timeout: 30_000,
    retries: 0,
    jitterMs: 5_000,
  },
  {
    id: 'metrics-aggregation',
    description: 'Hourly process-level metrics rollup',
    category: 'ops',
    cron: '0 * * * *',
    handler: runMetricsAggregation,
    timeout: 2 * 60 * 1000,
    retries: 1,
    jitterMs: 30_000,
  },
  {
    id: 'clean-old-logs',
    description: 'Archive logs older than 90 days (never deletes — rename only)',
    category: 'ops',
    cron: '0 3 * * 0', // 03:00 every Sunday
    handler: runCleanOldLogs,
    timeout: 10 * 60 * 1000,
    retries: 0,
    onFailure: 'notify-admin',
  },
  {
    id: 'token-refresh',
    description: 'Refresh external API tokens every 12 hours',
    category: 'ops',
    cron: '0 */12 * * *',
    handler: runTokenRefresh,
    timeout: 2 * 60 * 1000,
    retries: 2,
    retryDelayMs: 30_000,
    onFailure: 'notify-admin',
  },
  {
    id: 'cache-warm',
    description: 'Pre-compute heavy dashboards every morning at 06:00',
    category: 'ops',
    cron: '0 6 * * *',
    handler: runCacheWarm,
    timeout: 15 * 60 * 1000,
    retries: 1,
    jitterMs: 60_000,
  },
];

/**
 * Push every DEFAULT_JOBS entry into the module registry. Safe to call
 * multiple times — entries that already exist are skipped.
 */
function registerDefaults() {
  for (const job of DEFAULT_JOBS) {
    if (!registry.some(j => j.id === job.id)) {
      registry.push({ ...job });
    }
  }
  return registry.slice();
}

module.exports = {
  registerJob,
  registerDefaults,
  listJobs,
  getJob,
  clearRegistry,
  DEFAULT_JOBS,
  // exported for test & re-use
  handlers: {
    runDailyBackup,
    runMonthlyVatReminder,
    runMonthlyWageSlip,
    runQuarterlyTaxReport,
    runAnnualTaxReminder,
    runOverdueInvoicesAlert,
    runLowCashAlert,
    runHealthCheck,
    runMetricsAggregation,
    runCleanOldLogs,
    runTokenRefresh,
    runCacheWarm,
  },
};
