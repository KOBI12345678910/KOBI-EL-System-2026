#!/usr/bin/env node
/**
 * ONYX PROCUREMENT — Backup Scheduler
 * Agent 59 / backup-and-restore drill
 *
 * PURPOSE
 * -------
 * A tiny, dependency-free scheduler that runs the ONYX backup scripts on:
 *
 *   - DAILY    02:00 UTC      backup-db + backup-files + retention
 *   - WEEKLY   Sunday 02:30   backup-verify --deep on latest day
 *   - MONTHLY  1st of month   drill.js --dry-run
 *
 * DESIGN
 * ------
 *   - No cron package. The scheduler sleeps between ticks and compares
 *     the current UTC clock against the three schedule definitions.
 *   - A state file (logs/scheduler-state.json) records the last successful
 *     run of each job so it is idempotent across restarts.
 *   - Each job runs backup scripts with --i-know-what-im-doing.
 *   - Intended to be run via `node scripts/backup/scheduler.js` under a
 *     process manager (pm2, Windows Service, systemd). It can also be used
 *     as a one-shot "what-would-run" planner with --plan.
 *
 * SAFETY CONTRACT
 * ---------------
 *   - The scheduler only invokes backup-db.js, backup-files.js,
 *     backup-retention.js, backup-verify.js and drill.js --dry-run.
 *   - None of those touch production data destructively.
 *
 * USAGE
 *   node scripts/backup/scheduler.js                       # start loop
 *   node scripts/backup/scheduler.js --plan                # print next runs
 *   node scripts/backup/scheduler.js --run-now=daily       # run daily job now
 *   node scripts/backup/scheduler.js --run-now=weekly
 *   node scripts/backup/scheduler.js --run-now=monthly
 *   node scripts/backup/scheduler.js --tick-ms=30000       # loop sleep
 *
 * EXIT CODES
 *   0 clean exit (--plan / --run-now)
 *   non-zero on fatal error
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

// ---------------------------------------------------------------------------
// Schedule definitions in UTC
// ---------------------------------------------------------------------------
const SCHEDULES = {
  daily: {
    description: 'DAILY 02:00 UTC — full backup + files + retention',
    // matches when current time is ON/after the threshold and the job has not
    // run yet for today (UTC).
    hourUTC: 2,
    minuteUTC: 0,
    frequency: 'daily',
  },
  weekly: {
    description: 'WEEKLY Sunday 02:30 UTC — verify latest backup',
    dayOfWeekUTC: 0, // Sunday
    hourUTC: 2,
    minuteUTC: 30,
    frequency: 'weekly',
  },
  monthly: {
    description: 'MONTHLY 1st 03:00 UTC — DR drill (dry-run)',
    dayOfMonthUTC: 1,
    hourUTC: 3,
    minuteUTC: 0,
    frequency: 'monthly',
  },
};

function parseArgs(argv) {
  const out = {
    plan: false,
    runNow: null,
    tickMs: 60 * 1000,
    help: false,
  };
  for (const raw of argv.slice(2)) {
    if (raw === '--help' || raw === '-h') { out.help = true; continue; }
    if (raw === '--plan') { out.plan = true; continue; }
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === 'run-now') out.runNow = v;
    else if (k === 'tick-ms') out.tickMs = Math.max(1000, parseInt(v, 10) || 60000);
  }
  return out;
}

function printHelp() {
  process.stdout.write([
    '',
    'ONYX scheduler.js — backup job scheduler',
    '',
    '  --plan                 print next scheduled runs and exit',
    '  --run-now=JOB          run JOB immediately (daily|weekly|monthly)',
    '  --tick-ms=N            scheduler tick interval (default 60000)',
    '',
  ].join('\n'));
}

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

function utcDateKey(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function loadState(stateFile) {
  if (!fs.existsSync(stateFile)) return { last: {} };
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch (_) { return { last: {} }; }
}

function saveState(stateFile, state) {
  ensureDir(path.dirname(stateFile));
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
}

function writeAuditLine(projectRoot, entry) {
  const logDir = path.join(projectRoot, 'logs');
  ensureDir(logDir);
  const logFile = path.join(logDir, 'scheduler.jsonl');
  const line = JSON.stringify({ ts: new Date().toISOString(), host: os.hostname(), ...entry }) + '\n';
  fs.appendFileSync(logFile, line, 'utf8');
}

function shouldRunDaily(schedule, now, lastRunKey) {
  const today = utcDateKey(now);
  if (lastRunKey === today) return false;
  return (now.getUTCHours() > schedule.hourUTC) ||
         (now.getUTCHours() === schedule.hourUTC && now.getUTCMinutes() >= schedule.minuteUTC);
}

function shouldRunWeekly(schedule, now, lastRunKey) {
  if (now.getUTCDay() !== schedule.dayOfWeekUTC) return false;
  const today = utcDateKey(now);
  if (lastRunKey === today) return false;
  return (now.getUTCHours() > schedule.hourUTC) ||
         (now.getUTCHours() === schedule.hourUTC && now.getUTCMinutes() >= schedule.minuteUTC);
}

function shouldRunMonthly(schedule, now, lastRunKey) {
  if (now.getUTCDate() !== schedule.dayOfMonthUTC) return false;
  const today = utcDateKey(now);
  if (lastRunKey === today) return false;
  return (now.getUTCHours() > schedule.hourUTC) ||
         (now.getUTCHours() === schedule.hourUTC && now.getUTCMinutes() >= schedule.minuteUTC);
}

function nextRunIso(schedule, now) {
  // Rough human-readable "next run" hint. Exact cron semantics are not the
  // point of this scheduler — idempotency is.
  const pad = n => String(n).padStart(2, '0');
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), schedule.hourUTC, schedule.minuteUTC, 0));
  let target = base;
  if (schedule.frequency === 'daily') {
    if (target <= now) target = new Date(target.getTime() + 24 * 3600 * 1000);
  } else if (schedule.frequency === 'weekly') {
    while (target.getUTCDay() !== schedule.dayOfWeekUTC || target <= now) {
      target = new Date(target.getTime() + 24 * 3600 * 1000);
    }
  } else if (schedule.frequency === 'monthly') {
    if (target <= now || target.getUTCDate() !== schedule.dayOfMonthUTC) {
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, schedule.dayOfMonthUTC, schedule.hourUTC, schedule.minuteUTC, 0));
      target = nextMonth;
    }
  }
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}T${pad(target.getUTCHours())}:${pad(target.getUTCMinutes())}:00Z`;
}

// ---------------------------------------------------------------------------
// Job runners
// ---------------------------------------------------------------------------
function spawnStep(scriptPath, args, logHandle) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    const start = Date.now();
    let stdoutTail = '';
    let stderrTail = '';
    child.stdout.on('data', chunk => { stdoutTail += chunk.toString(); if (logHandle) fs.writeSync(logHandle, chunk); });
    child.stderr.on('data', chunk => { stderrTail += chunk.toString(); if (logHandle) fs.writeSync(logHandle, chunk); });
    child.on('close', code => {
      resolve({
        script: path.basename(scriptPath),
        exit: code,
        duration_ms: Date.now() - start,
        stdout_tail: stdoutTail.split('\n').slice(-5).join('\n'),
        stderr_tail: stderrTail.split('\n').slice(-5).join('\n'),
      });
    });
  });
}

async function runDaily(projectRoot, scriptsDir) {
  const logDir = path.join(projectRoot, 'logs', 'scheduler');
  ensureDir(logDir);
  const logFile = path.join(logDir, `daily-${utcDateKey(new Date())}.log`);
  const fh = fs.openSync(logFile, 'a');
  try {
    const steps = [];
    steps.push(await spawnStep(path.join(scriptsDir, 'backup-db.js'), ['--i-know-what-im-doing'], fh));
    steps.push(await spawnStep(path.join(scriptsDir, 'backup-files.js'), ['--i-know-what-im-doing'], fh));
    steps.push(await spawnStep(path.join(scriptsDir, 'backup-retention.js'), ['--i-know-what-im-doing'], fh));
    return { job: 'daily', steps, log: logFile };
  } finally { try { fs.closeSync(fh); } catch (_) {} }
}

async function runWeekly(projectRoot, scriptsDir) {
  const logDir = path.join(projectRoot, 'logs', 'scheduler');
  ensureDir(logDir);
  const logFile = path.join(logDir, `weekly-${utcDateKey(new Date())}.log`);
  const fh = fs.openSync(logFile, 'a');
  try {
    // find latest day folder under backups
    const backupRoot = path.join(projectRoot, 'backups');
    let latest = null;
    if (fs.existsSync(backupRoot)) {
      const dirs = fs.readdirSync(backupRoot, { withFileTypes: true })
        .filter(e => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
        .map(e => e.name).sort();
      if (dirs.length) latest = path.join(backupRoot, dirs[dirs.length - 1]);
    }
    const steps = [];
    if (latest) {
      steps.push(await spawnStep(path.join(scriptsDir, 'backup-verify.js'), [`--from=${latest}`, '--deep'], fh));
    } else {
      const msg = '[scheduler:weekly] no backup directories found under backups/';
      fs.writeSync(fh, msg + '\n');
      steps.push({ script: 'backup-verify.js', exit: 127, duration_ms: 0, stdout_tail: '', stderr_tail: msg });
    }
    return { job: 'weekly', steps, log: logFile };
  } finally { try { fs.closeSync(fh); } catch (_) {} }
}

async function runMonthly(projectRoot, scriptsDir) {
  const logDir = path.join(projectRoot, 'logs', 'scheduler');
  ensureDir(logDir);
  const logFile = path.join(logDir, `monthly-${utcDateKey(new Date())}.log`);
  const fh = fs.openSync(logFile, 'a');
  try {
    const steps = [];
    steps.push(await spawnStep(path.join(scriptsDir, 'drill.js'), ['--dry-run'], fh));
    return { job: 'monthly', steps, log: logFile };
  } finally { try { fs.closeSync(fh); } catch (_) {} }
}

async function runJob(name, projectRoot, scriptsDir) {
  if (name === 'daily')   return runDaily(projectRoot, scriptsDir);
  if (name === 'weekly')  return runWeekly(projectRoot, scriptsDir);
  if (name === 'monthly') return runMonthly(projectRoot, scriptsDir);
  throw new Error(`unknown job ${name}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { printHelp(); process.exit(0); }

  const projectRoot = path.resolve(__dirname, '..', '..');
  const scriptsDir = __dirname;
  const stateFile = path.join(projectRoot, 'logs', 'scheduler-state.json');
  ensureDir(path.dirname(stateFile));

  if (args.plan) {
    const now = new Date();
    const plan = Object.entries(SCHEDULES).map(([name, sch]) => ({
      job: name,
      description: sch.description,
      next_run_utc: nextRunIso(sch, now),
    }));
    process.stdout.write(JSON.stringify({ now_utc: now.toISOString(), plan }, null, 2) + '\n');
    process.exit(0);
  }

  if (args.runNow) {
    if (!SCHEDULES[args.runNow]) {
      console.error(`[scheduler] unknown job: ${args.runNow}`);
      process.exit(2);
    }
    console.log(`[scheduler] run-now=${args.runNow}`);
    writeAuditLine(projectRoot, { action: 'scheduler', mode: 'run-now', job: args.runNow });
    const res = await runJob(args.runNow, projectRoot, scriptsDir);
    writeAuditLine(projectRoot, { action: 'scheduler', mode: 'run-now-done', job: args.runNow, res });
    const state = loadState(stateFile);
    state.last = state.last || {};
    state.last[args.runNow] = utcDateKey(new Date());
    saveState(stateFile, state);
    console.log('[scheduler] SUMMARY ' + JSON.stringify({ job: args.runNow, steps: res.steps.map(s => ({ script: s.script, exit: s.exit })) }));
    const bad = res.steps.some(s => s.exit !== 0);
    process.exit(bad ? 5 : 0);
  }

  console.log('[scheduler] entering scheduler loop.');
  console.log('[scheduler] schedules:');
  for (const [name, sch] of Object.entries(SCHEDULES)) {
    console.log(`  - ${name}: ${sch.description}`);
  }
  writeAuditLine(projectRoot, { action: 'scheduler', mode: 'loop-start', tick_ms: args.tickMs });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const now = new Date();
      const state = loadState(stateFile);
      state.last = state.last || {};

      // daily
      if (shouldRunDaily(SCHEDULES.daily, now, state.last.daily)) {
        console.log(`[scheduler] triggering daily at ${now.toISOString()}`);
        writeAuditLine(projectRoot, { action: 'scheduler', mode: 'trigger', job: 'daily' });
        const res = await runDaily(projectRoot, scriptsDir);
        writeAuditLine(projectRoot, { action: 'scheduler', mode: 'trigger-done', job: 'daily', res });
        state.last.daily = utcDateKey(now);
        saveState(stateFile, state);
      }

      // weekly
      if (shouldRunWeekly(SCHEDULES.weekly, now, state.last.weekly)) {
        console.log(`[scheduler] triggering weekly at ${now.toISOString()}`);
        writeAuditLine(projectRoot, { action: 'scheduler', mode: 'trigger', job: 'weekly' });
        const res = await runWeekly(projectRoot, scriptsDir);
        writeAuditLine(projectRoot, { action: 'scheduler', mode: 'trigger-done', job: 'weekly', res });
        state.last.weekly = utcDateKey(now);
        saveState(stateFile, state);
      }

      // monthly
      if (shouldRunMonthly(SCHEDULES.monthly, now, state.last.monthly)) {
        console.log(`[scheduler] triggering monthly at ${now.toISOString()}`);
        writeAuditLine(projectRoot, { action: 'scheduler', mode: 'trigger', job: 'monthly' });
        const res = await runMonthly(projectRoot, scriptsDir);
        writeAuditLine(projectRoot, { action: 'scheduler', mode: 'trigger-done', job: 'monthly', res });
        state.last.monthly = utcDateKey(now);
        saveState(stateFile, state);
      }
    } catch (err) {
      console.error('[scheduler] tick error:', err.message);
      writeAuditLine(projectRoot, { action: 'scheduler', mode: 'tick-error', error: err.message });
    }
    await new Promise(resolve => setTimeout(resolve, args.tickMs));
  }
}

main().catch(err => {
  console.error('[scheduler] fatal:', (err && err.stack) || err);
  process.exit(1);
});
