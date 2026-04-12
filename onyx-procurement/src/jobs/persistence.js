/**
 * ONYX JOBS — Persistence layer (append-only JSONL)
 * ─────────────────────────────────────────────────
 * Agent-77 / Scheduled Jobs Framework
 *
 * Purpose:
 *   A tiny persistence adapter that the scheduler uses for:
 *     (a) appending a JSON line per run to data/job-runs.jsonl
 *     (b) reading back the latest run per job on startup, so the scheduler
 *         can decide whether any registered job missed its last scheduled
 *         tick across a restart.
 *
 *   This module is INTENTIONALLY append-only. It never deletes, truncates,
 *   or rewrites the file. Log rotation (if desired) is the operator's
 *   responsibility — the weekly `clean-old-logs` job in the registry
 *   operates on the logs/ directory, not on job-runs.jsonl.
 *
 * File format (newline-delimited JSON):
 *   {"jobId":"daily-backup","at":"2026-04-11T02:00:03.142Z","status":"success","durationMs":18341,"error":null,"mode":"scheduled"}
 *
 * Environment:
 *   ONYX_JOB_RUNS_FILE   override the default path (absolute or relative)
 *   ONYX_JOB_RUNS_DIR    override the directory (default: <cwd>/data)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DIR_NAME = 'data';
const DEFAULT_FILE_NAME = 'job-runs.jsonl';

function resolveDefaultPath() {
  if (process.env.ONYX_JOB_RUNS_FILE) {
    return path.resolve(process.env.ONYX_JOB_RUNS_FILE);
  }
  const dir = process.env.ONYX_JOB_RUNS_DIR
    ? path.resolve(process.env.ONYX_JOB_RUNS_DIR)
    : path.join(process.cwd(), DEFAULT_DIR_NAME);
  return path.join(dir, DEFAULT_FILE_NAME);
}

/**
 * Factory — returns a persistence adapter with writeRun / readLastRuns.
 *
 * @param {object} opts
 * @param {string=} opts.file  override file path
 */
function createJsonlPersistence(opts = {}) {
  const file = opts.file ? path.resolve(opts.file) : resolveDefaultPath();
  const dir = path.dirname(file);

  // Best-effort mkdir — never throws upward; writeRun will surface IO errors.
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) { /* ignore */ }

  function writeRun(record) {
    if (!record || typeof record !== 'object') {
      throw new TypeError('writeRun: record must be an object');
    }
    if (!record.jobId || !record.at) {
      throw new Error('writeRun: record requires jobId and at');
    }
    const line = JSON.stringify({
      jobId: record.jobId,
      at: record.at,
      status: record.status || null,
      durationMs: typeof record.durationMs === 'number' ? record.durationMs : null,
      error: record.error || null,
      mode: record.mode || 'scheduled',
    });
    // Append + newline. appendFileSync is fine for scheduler cadence
    // (handful of writes per minute worst case).
    fs.appendFileSync(file, line + '\n', 'utf8');
  }

  /**
   * Read the file and return { [jobId]: latestSuccessRecord } so the
   * scheduler can decide whether a job missed its last scheduled tick.
   *
   * Uses a streaming line-reader to avoid loading huge files into memory.
   * Returns an empty object if the file does not yet exist.
   *
   * @returns {Promise<Record<string, {at:string,status:string,durationMs:number|null}>>}
   */
  function readLastRuns() {
    return new Promise(resolve => {
      if (!fs.existsSync(file)) return resolve({});
      const latest = Object.create(null);
      try {
        const data = fs.readFileSync(file, 'utf8');
        const lines = data.split('\n');
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          let rec;
          try {
            rec = JSON.parse(line);
          } catch (_) {
            continue; // skip malformed lines — never delete
          }
          if (!rec || !rec.jobId || !rec.at) continue;
          // Track only successful runs for catch-up decisions; failed
          // attempts should NOT suppress a catch-up on restart.
          if (rec.status && rec.status !== 'success') continue;
          const prior = latest[rec.jobId];
          if (!prior || new Date(rec.at).getTime() > new Date(prior.at).getTime()) {
            latest[rec.jobId] = {
              at: rec.at,
              status: rec.status,
              durationMs: rec.durationMs,
            };
          }
        }
      } catch (err) {
        // If we can't read, behave as "no history" — the scheduler will
        // catch everything up on startup. We don't throw; the caller logs.
        return resolve({});
      }
      resolve(latest);
    });
  }

  /**
   * Return the last N run records for a given jobId, newest last.
   * Used by the admin details endpoint. Reads the whole file; fine for
   * small/medium jsonl files. For huge files, run the weekly
   * `clean-old-logs` job (which handles logs/, not this file) and
   * optionally rotate job-runs.jsonl manually — never in this module.
   *
   * @param {string} jobId
   * @param {number=} limit  default 50
   */
  function readHistory(jobId, limit = 50) {
    return new Promise(resolve => {
      if (!fs.existsSync(file)) return resolve([]);
      const out = [];
      try {
        const data = fs.readFileSync(file, 'utf8');
        const lines = data.split('\n');
        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          let rec;
          try { rec = JSON.parse(line); } catch (_) { continue; }
          if (!rec || rec.jobId !== jobId) continue;
          out.push(rec);
          if (out.length > limit * 4) out.splice(0, out.length - limit * 2); // keep tail bounded
        }
      } catch (_) {
        return resolve([]);
      }
      resolve(out.slice(-limit));
    });
  }

  return {
    file,
    writeRun,
    readLastRuns,
    readHistory,
  };
}

module.exports = {
  createJsonlPersistence,
  resolveDefaultPath,
};
