/**
 * DRRunner — Disaster Recovery playbook runner for ONYX Procurement.
 *
 * Agent-X95 — automates DR drills and real failover procedures.
 *
 * Core rule of the system (Techno-Kol Uzi Mega-ERP):
 *   לא מוחקים, רק משדרגים ומגדלים.
 *   (We do not delete — we only upgrade and grow.)
 *
 * This module NEVER performs destructive failover actions unless an
 * explicit `confirmFailover` flag is provided. Shell commands require
 * an explicit `allowCommand` flag to be passed to `runDrill`. Every run
 * is recorded, timed (RTO/RPO), and can be rolled back via the
 * playbook's compensating actions.
 *
 * Zero external dependencies — uses only Node core modules.
 *
 * Public surface:
 *   new DRRunner(opts?)
 *     .loadPlaybook(path)                                 → Playbook
 *     .listPlaybooks()                                    → [{id, name_he, name_en}]
 *     .runDrill(playbookId, { dryRun, allowCommand })     → Run
 *     .runFailover(playbookId, { confirmFailover })       → Run
 *     .rollback(playbookId)                               → Run
 *     .status(playbookId)                                 → Status
 *     .postMortem(runId)                                  → { markdown, data }
 *
 * Step types:
 *   - command  : shell / bash (requires allowCommand:true on runDrill)
 *   - http     : HTTP request with expectedStatus + body regex
 *   - wait     : sleep N seconds
 *   - manual   : pause until operator types y / כן via TTY
 *   - verify   : runs a JS verification function from `verifiers`
 *
 * Playbook YAML shape:
 *   id: string
 *   name_he: string
 *   name_en: string
 *   rto_minutes: number
 *   rpo_minutes: number
 *   description_he: string (optional)
 *   description_en: string (optional)
 *   steps:
 *     - id: string
 *       description_he: string
 *       description_en: string
 *       type: command|http|wait|manual|verify
 *       timeout_seconds: number (optional, default 60)
 *       destructive: boolean (optional, default false)
 *       # type-specific fields (see parser)
 *       compensating:
 *         type: command|http|wait|manual|verify
 *         ...
 *
 * @module src/dr/dr-runner
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');

// Reuse CLI colouring helpers — they already respect NO_COLOR / non-TTY.
const { paint, strip } = require('../cli/ansi');

// ──────────────────────────────────────────────────────────────
//  Mini YAML parser (zero-dep)
// ──────────────────────────────────────────────────────────────

/**
 * Parse a small subset of YAML sufficient for DR playbooks:
 *   - key: value         (scalars: string, number, boolean, null)
 *   - key:               (nested mapping follows at higher indent)
 *   - - item             (sequence items; may be scalar or mapping)
 *   - indentation-based nesting (spaces only; tabs rejected)
 *   - # line comments    (stripped — full-line and inline)
 *   - quoted strings     (single or double; escapes: \\ \" \' \n \t)
 *   - multiline strings  (| literal or > folded, very basic)
 *   - flow sequences     ([a, b, c])
 *   - flow mappings      ({k: v, k2: v2})
 *
 * Deliberately NOT a full YAML implementation — we just need to load our
 * own playbooks without pulling in js-yaml. If the file uses anything
 * unsupported (anchors, tags, merge keys, etc.) we throw a clear error.
 *
 * @param {string} text
 * @returns {any}
 */
function parseYaml(text) {
  if (typeof text !== 'string') {
    throw new TypeError('parseYaml: expected string input');
  }
  if (text.includes('\t')) {
    // YAML 1.2 forbids tabs for indentation, and they break our indent math.
    const firstTab = text.split('\n').findIndex((l) => l.includes('\t'));
    throw new SyntaxError(
      `parseYaml: tab character on line ${firstTab + 1} — use spaces only`,
    );
  }

  const rawLines = text.split(/\r?\n/);
  /** @type {{indent: number, text: string, line: number}[]} */
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    const raw = rawLines[i];
    const stripped = stripLineComment(raw);
    if (stripped.trim() === '') continue;
    const indent = raw.length - raw.trimStart().length;
    lines.push({ indent, text: stripped.trimEnd(), line: i + 1 });
  }

  // Walk line index as a cursor.
  const ctx = { lines, i: 0 };
  const root = parseBlock(ctx, 0);
  if (ctx.i < lines.length) {
    throw new SyntaxError(
      `parseYaml: unexpected content at line ${lines[ctx.i].line}`,
    );
  }
  return root;
}

/** Strip `# comment` but respect quoted strings. */
function stripLineComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && (inSingle || inDouble)) {
      i++;
      continue;
    }
    if (!inDouble && c === "'") inSingle = !inSingle;
    else if (!inSingle && c === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble && c === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Parse a block starting at ctx.i with indent >= baseIndent.
 * Returns either a mapping (plain object) or a sequence (array),
 * depending on the first non-blank line encountered.
 */
function parseBlock(ctx, baseIndent) {
  const { lines } = ctx;
  if (ctx.i >= lines.length) return null;
  const first = lines[ctx.i];
  if (first.indent < baseIndent) return null;

  if (first.text.trimStart().startsWith('- ') || first.text.trim() === '-') {
    return parseSequence(ctx, first.indent);
  }
  return parseMapping(ctx, first.indent);
}

function parseMapping(ctx, indent) {
  const { lines } = ctx;
  const result = {};
  while (ctx.i < lines.length) {
    const line = lines[ctx.i];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new SyntaxError(
        `parseYaml: unexpected indentation at line ${line.line}`,
      );
    }
    const text = line.text.slice(indent);
    const colonIdx = findMappingColon(text);
    if (colonIdx === -1) {
      throw new SyntaxError(
        `parseYaml: expected 'key: value' at line ${line.line} (got "${text}")`,
      );
    }
    const key = unquote(text.slice(0, colonIdx).trim());
    const rest = text.slice(colonIdx + 1).trim();
    ctx.i++;
    if (rest === '' || rest === '|' || rest === '>') {
      // Block scalar literal / folded
      if (rest === '|' || rest === '>') {
        result[key] = parseBlockScalar(ctx, indent, rest === '>');
      } else {
        // Nested block (mapping or sequence) at greater indent.
        const next = lines[ctx.i];
        if (next && next.indent > indent) {
          result[key] = parseBlock(ctx, next.indent);
        } else {
          result[key] = null;
        }
      }
    } else {
      result[key] = parseScalarOrFlow(rest, line.line);
    }
  }
  return result;
}

function parseSequence(ctx, indent) {
  const { lines } = ctx;
  const result = [];
  while (ctx.i < lines.length) {
    const line = lines[ctx.i];
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new SyntaxError(
        `parseYaml: unexpected indentation in sequence at line ${line.line}`,
      );
    }
    const text = line.text.slice(indent);
    if (!text.startsWith('-')) break;
    const after = text.slice(1);
    if (after === '' || after === ' ') {
      // Bare dash — value follows on nested lines (mapping or sequence).
      ctx.i++;
      const next = lines[ctx.i];
      if (next && next.indent > indent) {
        result.push(parseBlock(ctx, next.indent));
      } else {
        result.push(null);
      }
      continue;
    }
    if (!after.startsWith(' ')) {
      throw new SyntaxError(
        `parseYaml: expected space after '-' at line ${line.line}`,
      );
    }
    const rest = after.slice(1);
    // Heuristic: if rest contains a mapping colon, treat this item as an
    // inline mapping — the first key is on this line, subsequent keys on
    // following lines at a deeper indent. This is the common pattern for
    // playbook step lists.
    const colonIdx = findMappingColon(rest);
    if (colonIdx !== -1) {
      // Synthesize a virtual mapping line: first key on THIS line, and
      // additional lines at indent+2 (spaces after the dash).
      const innerIndent = indent + 2;
      // Replace current line in place as a mapping line at innerIndent.
      const firstKey = unquote(rest.slice(0, colonIdx).trim());
      const firstValRaw = rest.slice(colonIdx + 1).trim();
      const obj = {};
      ctx.i++;
      if (firstValRaw === '' || firstValRaw === '|' || firstValRaw === '>') {
        if (firstValRaw === '|' || firstValRaw === '>') {
          obj[firstKey] = parseBlockScalar(ctx, innerIndent, firstValRaw === '>');
        } else {
          const next = lines[ctx.i];
          if (next && next.indent > innerIndent) {
            obj[firstKey] = parseBlock(ctx, next.indent);
          } else {
            obj[firstKey] = null;
          }
        }
      } else {
        obj[firstKey] = parseScalarOrFlow(firstValRaw, line.line);
      }
      // Now continue parsing any mapping continuation at innerIndent.
      while (ctx.i < lines.length) {
        const nxt = lines[ctx.i];
        if (nxt.indent < innerIndent) break;
        if (nxt.indent > innerIndent) {
          // Shouldn't normally happen because nested blocks are handled
          // recursively; if it does, it's content for the previous key
          // which was already absorbed.
          break;
        }
        const txt = nxt.text.slice(innerIndent);
        if (txt.startsWith('- ') || txt === '-') break; // new list item at outer level — shouldn't happen
        const cIdx = findMappingColon(txt);
        if (cIdx === -1) {
          throw new SyntaxError(
            `parseYaml: expected 'key: value' at line ${nxt.line}`,
          );
        }
        const k = unquote(txt.slice(0, cIdx).trim());
        const v = txt.slice(cIdx + 1).trim();
        ctx.i++;
        if (v === '' || v === '|' || v === '>') {
          if (v === '|' || v === '>') {
            obj[k] = parseBlockScalar(ctx, innerIndent, v === '>');
          } else {
            const deep = lines[ctx.i];
            if (deep && deep.indent > innerIndent) {
              obj[k] = parseBlock(ctx, deep.indent);
            } else {
              obj[k] = null;
            }
          }
        } else {
          obj[k] = parseScalarOrFlow(v, nxt.line);
        }
      }
      result.push(obj);
    } else {
      // Inline scalar item.
      result.push(parseScalarOrFlow(rest, line.line));
      ctx.i++;
    }
  }
  return result;
}

/** Literal `|` / folded `>` block scalar (very basic). */
function parseBlockScalar(ctx, parentIndent, folded) {
  const { lines } = ctx;
  const chunks = [];
  let blockIndent = null;
  while (ctx.i < lines.length) {
    const line = lines[ctx.i];
    if (line.indent <= parentIndent) break;
    if (blockIndent === null) blockIndent = line.indent;
    const stripped = line.text.slice(blockIndent);
    chunks.push(stripped);
    ctx.i++;
  }
  return folded ? chunks.join(' ') : chunks.join('\n');
}

/**
 * Find the colon that separates a mapping key from its value. We need to
 * ignore colons inside quoted strings and URLs like `http://host`.
 */
function findMappingColon(text) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && (inSingle || inDouble)) { i++; continue; }
    if (!inDouble && c === "'") { inSingle = !inSingle; continue; }
    if (!inSingle && c === '"') { inDouble = !inDouble; continue; }
    if (inSingle || inDouble) continue;
    if (c === ':') {
      // Must be followed by space or end-of-line (otherwise it's `http://`).
      if (i + 1 >= text.length || text[i + 1] === ' ') return i;
    }
  }
  return -1;
}

/** Parse a scalar string, flow sequence, or flow mapping. */
function parseScalarOrFlow(text, lineNo) {
  const t = text.trim();
  if (t === '') return null;
  if (t.startsWith('[') && t.endsWith(']')) return parseFlowSeq(t, lineNo);
  if (t.startsWith('{') && t.endsWith('}')) return parseFlowMap(t, lineNo);
  return parseScalar(t);
}

function parseScalar(t) {
  if (t === '' || t === '~' || t.toLowerCase() === 'null') return null;
  if (t.toLowerCase() === 'true' || t.toLowerCase() === 'yes') return true;
  if (t.toLowerCase() === 'false' || t.toLowerCase() === 'no') return false;
  if (/^-?\d+$/.test(t)) return parseInt(t, 10);
  if (/^-?\d+\.\d+$/.test(t)) return parseFloat(t);
  return unquote(t);
}

function unquote(t) {
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    return t.slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

function parseFlowSeq(text, lineNo) {
  const inner = text.slice(1, -1).trim();
  if (inner === '') return [];
  return splitFlow(inner, lineNo).map((v) => parseScalarOrFlow(v, lineNo));
}

function parseFlowMap(text, lineNo) {
  const inner = text.slice(1, -1).trim();
  if (inner === '') return {};
  const out = {};
  for (const part of splitFlow(inner, lineNo)) {
    const colonIdx = findMappingColon(part);
    if (colonIdx === -1) {
      throw new SyntaxError(
        `parseYaml: expected 'key: value' in flow map at line ${lineNo}`,
      );
    }
    const k = unquote(part.slice(0, colonIdx).trim());
    const v = part.slice(colonIdx + 1).trim();
    out[k] = parseScalarOrFlow(v, lineNo);
  }
  return out;
}

/** Split a flow string on commas, respecting nesting and quotes. */
function splitFlow(text, lineNo) {
  const parts = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && (inSingle || inDouble)) { i++; continue; }
    if (!inDouble && c === "'") inSingle = !inSingle;
    else if (!inSingle && c === '"') inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') depth--;
      else if (c === ',' && depth === 0) {
        parts.push(text.slice(start, i).trim());
        start = i + 1;
      }
    }
  }
  if (depth !== 0 || inSingle || inDouble) {
    throw new SyntaxError(`parseYaml: unterminated flow at line ${lineNo}`);
  }
  parts.push(text.slice(start).trim());
  return parts;
}

// ──────────────────────────────────────────────────────────────
//  Playbook validation
// ──────────────────────────────────────────────────────────────

const VALID_STEP_TYPES = ['command', 'http', 'wait', 'manual', 'verify'];

function validatePlaybook(pb, sourcePath) {
  const where = sourcePath ? ` (from ${sourcePath})` : '';
  if (!pb || typeof pb !== 'object' || Array.isArray(pb)) {
    throw new Error(`DRRunner: playbook must be a mapping${where}`);
  }
  for (const field of ['id', 'name_he', 'name_en', 'rto_minutes', 'rpo_minutes']) {
    if (pb[field] === undefined || pb[field] === null) {
      throw new Error(`DRRunner: playbook missing '${field}'${where}`);
    }
  }
  if (typeof pb.id !== 'string' || !pb.id.trim()) {
    throw new Error(`DRRunner: playbook 'id' must be a non-empty string${where}`);
  }
  if (typeof pb.rto_minutes !== 'number' || pb.rto_minutes <= 0) {
    throw new Error(`DRRunner: 'rto_minutes' must be > 0${where}`);
  }
  if (typeof pb.rpo_minutes !== 'number' || pb.rpo_minutes < 0) {
    throw new Error(`DRRunner: 'rpo_minutes' must be >= 0${where}`);
  }
  if (!Array.isArray(pb.steps) || pb.steps.length === 0) {
    throw new Error(`DRRunner: playbook must contain at least one step${where}`);
  }
  const seen = new Set();
  for (const step of pb.steps) {
    validateStep(step, where);
    if (seen.has(step.id)) {
      throw new Error(`DRRunner: duplicate step id '${step.id}'${where}`);
    }
    seen.add(step.id);
    if (step.compensating) {
      // compensating can omit id/description and inherits from parent.
      validateStep({ id: `${step.id}.compensating`, ...step.compensating }, where, true);
    }
  }
}

function validateStep(step, where, isCompensating = false) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) {
    throw new Error(`DRRunner: step must be a mapping${where}`);
  }
  if (!step.id || typeof step.id !== 'string') {
    throw new Error(`DRRunner: step missing 'id'${where}`);
  }
  if (!VALID_STEP_TYPES.includes(step.type)) {
    throw new Error(
      `DRRunner: step '${step.id}' has invalid type '${step.type}' — must be one of ${VALID_STEP_TYPES.join(',')}${where}`,
    );
  }
  if (!isCompensating) {
    if (typeof step.description_he !== 'string' || !step.description_he.trim()) {
      throw new Error(`DRRunner: step '${step.id}' missing description_he${where}`);
    }
    if (typeof step.description_en !== 'string' || !step.description_en.trim()) {
      throw new Error(`DRRunner: step '${step.id}' missing description_en${where}`);
    }
  }
  if (step.timeout_seconds !== undefined
      && (typeof step.timeout_seconds !== 'number' || step.timeout_seconds <= 0)) {
    throw new Error(`DRRunner: step '${step.id}' timeout_seconds must be > 0${where}`);
  }
  switch (step.type) {
    case 'command':
      if (typeof step.command !== 'string' || !step.command.trim()) {
        throw new Error(`DRRunner: command step '${step.id}' missing 'command'${where}`);
      }
      break;
    case 'http':
      if (typeof step.url !== 'string' || !step.url.trim()) {
        throw new Error(`DRRunner: http step '${step.id}' missing 'url'${where}`);
      }
      break;
    case 'wait':
      if (typeof step.seconds !== 'number' || step.seconds < 0) {
        throw new Error(`DRRunner: wait step '${step.id}' needs numeric 'seconds'${where}`);
      }
      break;
    case 'manual':
      // no extra required fields
      break;
    case 'verify':
      if (typeof step.verifier !== 'string' || !step.verifier.trim()) {
        throw new Error(`DRRunner: verify step '${step.id}' missing 'verifier' name${where}`);
      }
      break;
    // no default — VALID_STEP_TYPES guards this switch
  }
}

// ──────────────────────────────────────────────────────────────
//  DRRunner class
// ──────────────────────────────────────────────────────────────

/**
 * @typedef {object} StepResult
 * @property {string} id
 * @property {string} type
 * @property {'success'|'failed'|'skipped'|'dry-run'|'compensated'} status
 * @property {number} durationMs
 * @property {string} [message]
 * @property {any} [detail]
 */

/**
 * @typedef {object} Run
 * @property {string} runId
 * @property {string} playbookId
 * @property {'drill'|'failover'|'rollback'} mode
 * @property {number} startedAt
 * @property {number} finishedAt
 * @property {number} durationMs
 * @property {boolean} dryRun
 * @property {'success'|'failed'|'compensated'|'refused'} outcome
 * @property {number} rtoMinutes
 * @property {number} rpoMinutes
 * @property {number} rtoActualMinutes
 * @property {boolean} rtoBreached
 * @property {StepResult[]} steps
 * @property {string} [reason]
 */

class DRRunner {
  /**
   * @param {object} [opts]
   * @param {object} [opts.logger]      — { info, warn, error } — defaults to console
   * @param {object} [opts.verifiers]   — { name: async ({playbook, step, run}) => { ok, message } }
   * @param {(ms:number)=>Promise<void>} [opts.sleeper] — override for tests
   * @param {()=>number} [opts.now]     — clock injection
   * @param {boolean}   [opts.colour]   — force colour on/off (default auto)
   * @param {NodeJS.ReadableStream} [opts.input]  — TTY input (for manual steps)
   * @param {NodeJS.WritableStream} [opts.output] — TTY output
   * @param {(cmd:string, opts:object)=>Promise<{stdout:string,stderr:string,code:number}>} [opts.commandRunner]
   * @param {(url:string, opts:object)=>Promise<{status:number,body:string}>} [opts.httpClient]
   */
  constructor(opts = {}) {
    this.logger = opts.logger || defaultLogger();
    this.verifiers = opts.verifiers || {};
    this.sleeper = opts.sleeper || ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now || Date.now;
    this.input = opts.input || process.stdin;
    this.output = opts.output || process.stdout;
    this.commandRunner = opts.commandRunner || defaultCommandRunner;
    this.httpClient = opts.httpClient || defaultHttpClient;
    this.forceColour = opts.colour;

    /** @type {Map<string, any>} */
    this.playbooks = new Map();
    /** @type {Map<string, Run>} */
    this.runs = new Map();
    /** @type {Map<string, string>} */
    this.lastRunByPlaybook = new Map();
  }

  // ─────────────────── Loading ─────────────────────────────

  /**
   * Load a YAML playbook from disk and register it.
   * Returns the parsed and validated playbook object.
   *
   * @param {string} filePath
   * @returns {object}
   */
  loadPlaybook(filePath) {
    const abs = path.resolve(filePath);
    const text = fs.readFileSync(abs, 'utf8');
    const parsed = parseYaml(text);
    validatePlaybook(parsed, abs);
    this.playbooks.set(parsed.id, { ...parsed, sourcePath: abs });
    this.logger.info(`[dr] loaded playbook '${parsed.id}' from ${abs}`);
    return parsed;
  }

  /**
   * Load every `*.yaml` / `*.yml` file under `dir`.
   * @param {string} dir
   * @returns {object[]}
   */
  loadPlaybookDir(dir) {
    const loaded = [];
    if (!fs.existsSync(dir)) return loaded;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (!/\.ya?ml$/i.test(entry)) continue;
      loaded.push(this.loadPlaybook(path.join(dir, entry)));
    }
    return loaded;
  }

  listPlaybooks() {
    return [...this.playbooks.values()].map((pb) => ({
      id: pb.id,
      name_he: pb.name_he,
      name_en: pb.name_en,
      rto_minutes: pb.rto_minutes,
      rpo_minutes: pb.rpo_minutes,
      stepCount: pb.steps.length,
    }));
  }

  getPlaybook(playbookId) {
    const pb = this.playbooks.get(playbookId);
    if (!pb) throw new Error(`DRRunner: unknown playbook '${playbookId}'`);
    return pb;
  }

  // ─────────────────── Running ─────────────────────────────

  /**
   * Run a drill — executes every non-destructive step. Destructive steps
   * are always skipped in drill mode unless `{ allowDestructive:true }`
   * AND `dryRun:false` are BOTH provided.
   *
   * @param {string} playbookId
   * @param {object} [opts]
   * @param {boolean} [opts.dryRun=true]       — only print what would happen
   * @param {boolean} [opts.allowCommand=false] — permit 'command' steps to actually run
   * @param {boolean} [opts.allowDestructive=false] — permit steps with destructive:true
   * @returns {Promise<Run>}
   */
  async runDrill(playbookId, opts = {}) {
    const {
      dryRun = true,
      allowCommand = false,
      allowDestructive = false,
    } = opts;
    const pb = this.getPlaybook(playbookId);
    return this._execute(pb, {
      mode: 'drill',
      dryRun,
      allowCommand,
      allowDestructive: allowDestructive && !dryRun,
    });
  }

  /**
   * Run a real failover. REFUSES without `{ confirmFailover:true }`.
   * Destructive steps are allowed only when confirmFailover:true.
   * Shell commands are allowed only when allowCommand:true (default true
   * in failover mode since a real failover is meaningless without them,
   * but callers may still explicitly set false to dry-rehearse).
   *
   * @param {string} playbookId
   * @param {object} [opts]
   * @param {boolean} [opts.confirmFailover] — MUST be true
   * @param {boolean} [opts.allowCommand=true]
   * @returns {Promise<Run>}
   */
  async runFailover(playbookId, opts = {}) {
    const pb = this.getPlaybook(playbookId);
    if (opts.confirmFailover !== true) {
      const run = this._makeRefusedRun(pb, 'failover');
      this.runs.set(run.runId, run);
      this.lastRunByPlaybook.set(pb.id, run.runId);
      this.logger.warn(
        `[dr] REFUSED failover of '${pb.id}': confirmFailover flag not set. ` +
        'Pass {confirmFailover:true} to proceed with a real failover.',
      );
      return run;
    }
    return this._execute(pb, {
      mode: 'failover',
      dryRun: false,
      allowCommand: opts.allowCommand !== false,
      allowDestructive: true,
    });
  }

  /**
   * Run compensating actions for every step of a playbook in reverse order.
   * Used to undo a failed run or to clean up after a drill.
   *
   * @param {string} playbookId
   * @param {object} [opts]
   * @param {boolean} [opts.dryRun=false]
   * @param {boolean} [opts.allowCommand=true]
   * @returns {Promise<Run>}
   */
  async rollback(playbookId, opts = {}) {
    const pb = this.getPlaybook(playbookId);
    const compSteps = [];
    for (let i = pb.steps.length - 1; i >= 0; i--) {
      const s = pb.steps[i];
      if (!s.compensating) continue;
      compSteps.push({
        ...s.compensating,
        id: `${s.id}.compensating`,
        description_he: s.compensating.description_he || `ביטול: ${s.description_he}`,
        description_en: s.compensating.description_en || `Undo: ${s.description_en}`,
        timeout_seconds: s.compensating.timeout_seconds || s.timeout_seconds || 60,
      });
    }
    if (compSteps.length === 0) {
      this.logger.warn(`[dr] rollback: playbook '${pb.id}' has no compensating actions`);
    }
    const pseudoPb = { ...pb, steps: compSteps };
    return this._execute(pseudoPb, {
      mode: 'rollback',
      dryRun: opts.dryRun === true,
      allowCommand: opts.allowCommand !== false,
      allowDestructive: true, // compensating actions may need to undo destructive work
    });
  }

  /**
   * Return a status summary for a playbook based on its last run.
   * @param {string} playbookId
   */
  status(playbookId) {
    const pb = this.getPlaybook(playbookId);
    const runId = this.lastRunByPlaybook.get(playbookId);
    if (!runId) {
      return {
        playbookId,
        name_he: pb.name_he,
        name_en: pb.name_en,
        lastRun: null,
        outcome: null,
        message_he: 'לא בוצע עדיין',
        message_en: 'Never run',
      };
    }
    const run = this.runs.get(runId);
    return {
      playbookId,
      name_he: pb.name_he,
      name_en: pb.name_en,
      lastRun: run,
      outcome: run.outcome,
      rtoMinutes: run.rtoMinutes,
      rtoActualMinutes: run.rtoActualMinutes,
      rtoBreached: run.rtoBreached,
      rpoMinutes: run.rpoMinutes,
      stepDurations: run.steps.map((s) => ({
        id: s.id,
        type: s.type,
        status: s.status,
        durationMs: s.durationMs,
      })),
      message_he:
        run.outcome === 'success'
          ? `הרצה הושלמה בהצלחה — ${run.rtoActualMinutes.toFixed(1)} דקות`
          : run.outcome === 'refused'
          ? 'סירוב — חסר אישור מפורש'
          : `נכשל: ${run.reason || ''}`,
      message_en:
        run.outcome === 'success'
          ? `Run completed successfully — ${run.rtoActualMinutes.toFixed(1)} min`
          : run.outcome === 'refused'
          ? 'Refused — explicit confirmation missing'
          : `Failed: ${run.reason || ''}`,
    };
  }

  // ─────────────────── Post-mortem ─────────────────────────

  /**
   * Generate a bilingual postmortem markdown template pre-filled with
   * the data from a run.
   *
   * @param {string} runId
   * @returns {{ markdown: string, data: object }}
   */
  postMortem(runId) {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`DRRunner: unknown runId '${runId}'`);
    const pb = this.playbooks.get(run.playbookId);
    const pbName = pb ? pb.name_en : run.playbookId;
    const pbNameHe = pb ? pb.name_he : run.playbookId;
    const startedIso = new Date(run.startedAt).toISOString();
    const finishedIso = new Date(run.finishedAt).toISOString();
    const stepTable = run.steps
      .map(
        (s) =>
          `| ${s.id} | ${s.type} | ${s.status} | ${Math.round(s.durationMs)} ms | ${
            s.message ? s.message.replace(/\|/g, '\\|') : ''
          } |`,
      )
      .join('\n');

    const md = `# DR Post-Mortem — ${pbName}

**Run ID:** ${run.runId}
**Playbook:** ${pbName} / ${pbNameHe}
**Mode:** ${run.mode}${run.dryRun ? ' (dry-run)' : ''}
**Outcome:** ${run.outcome}
**Started (UTC):** ${startedIso}
**Finished (UTC):** ${finishedIso}
**Duration:** ${run.rtoActualMinutes.toFixed(2)} minutes
**RTO target:** ${run.rtoMinutes} minutes
**RPO target:** ${run.rpoMinutes} minutes
**RTO breached:** ${run.rtoBreached ? 'YES' : 'no'}

---

## 1. Summary (English)

<!-- Describe the incident / drill in 2-3 sentences. What triggered it? -->

## 1. סיכום (עברית)

<!-- תאר את האירוע או התרגיל בשתיים-שלוש משפטים. מה היה הטריגר? -->

---

## 2. Timeline / ציר זמן

| Step | Type | Status | Duration | Notes |
|------|------|--------|----------|-------|
${stepTable}

---

## 3. Impact / השפעה

**English:**
- Users affected:
- Data at risk (RPO window):
- Services degraded:

**עברית:**
- משתמשים שהושפעו:
- נתונים בסיכון (חלון RPO):
- שירותים שנפגעו:

---

## 4. Root cause / סיבת שורש

**English:**
<!-- What actually caused the incident? -->

**עברית:**
<!-- מה גרם בפועל לאירוע? -->

---

## 5. What went well / מה עבד טוב

- ${run.steps.filter((s) => s.status === 'success').length} steps succeeded
-
-

## 6. What went wrong / מה לא עבד

- ${run.steps.filter((s) => s.status === 'failed').length} steps failed
-
-

---

## 7. Action items / פעולות המשך

| # | Owner | Due | Description (EN) | תיאור (עברית) |
|---|-------|-----|-------------------|------------------|
| 1 |       |     |                   |                  |

---

## 8. Follow-up runs / הרצות המשך

- [ ] Re-run drill after fix: \`node src/dr/cli.js drill --playbook=${run.playbookId} --dry-run\`
- [ ] Update playbook at \`${pb ? pb.sourcePath : ''}\`
- [ ] Update \`DR_RUNBOOK.md\` if runbook text needs changes

---

_Generated by DRRunner — Agent-X95. Rule: לא מוחקים, רק משדרגים ומגדלים._
`;

    return { markdown: md, data: { run, playbookName: pbName, playbookNameHe: pbNameHe } };
  }

  // ─────────────────── Internal execution ─────────────────

  _makeRefusedRun(pb, mode) {
    const now = this.now();
    return {
      runId: `run_${randomUUID()}`,
      playbookId: pb.id,
      mode,
      startedAt: now,
      finishedAt: now,
      durationMs: 0,
      dryRun: false,
      outcome: 'refused',
      rtoMinutes: pb.rto_minutes,
      rpoMinutes: pb.rpo_minutes,
      rtoActualMinutes: 0,
      rtoBreached: false,
      steps: [],
      reason: 'missing confirmFailover flag',
    };
  }

  async _execute(pb, execOpts) {
    const runId = `run_${randomUUID()}`;
    const startedAt = this.now();
    /** @type {Run} */
    const run = {
      runId,
      playbookId: pb.id,
      mode: execOpts.mode,
      startedAt,
      finishedAt: 0,
      durationMs: 0,
      dryRun: execOpts.dryRun,
      outcome: 'success',
      rtoMinutes: pb.rto_minutes,
      rpoMinutes: pb.rpo_minutes,
      rtoActualMinutes: 0,
      rtoBreached: false,
      steps: [],
    };
    this.runs.set(runId, run);
    this.lastRunByPlaybook.set(pb.id, runId);

    const header = execOpts.dryRun ? '[DRY-RUN] ' : '';
    this.logger.info(
      `${header}[dr] ${pb.name_en} / ${pb.name_he} — mode=${execOpts.mode}, steps=${pb.steps.length}`,
    );
    this.logger.info(`[dr] RTO target: ${pb.rto_minutes} min | RPO target: ${pb.rpo_minutes} min`);

    let failed = false;
    const executedSteps = [];
    for (const step of pb.steps) {
      const stepStart = this.now();

      // Dry-run short-circuits everything — never touches anything,
      // so destructive / command guards don't need to fire. We still
      // annotate destructive steps so operators see them clearly.
      if (execOpts.dryRun) {
        const msg = this._describeStep(step) +
          (step.destructive ? ' [DESTRUCTIVE — would require confirmFailover]' : '');
        const result = {
          id: step.id,
          type: step.type,
          status: 'dry-run',
          durationMs: 0,
          message: msg,
        };
        run.steps.push(result);
        this._printStepResult(step, result, execOpts);
        continue;
      }

      // Destructive guard (only when actually running)
      if (step.destructive === true && !execOpts.allowDestructive) {
        const result = {
          id: step.id,
          type: step.type,
          status: 'skipped',
          durationMs: 0,
          message: 'skipped destructive step (not a real failover)',
        };
        run.steps.push(result);
        this._printStepResult(step, result, execOpts);
        continue;
      }

      // Command-type requires allowCommand except in pure dry-run
      if (step.type === 'command' && !execOpts.allowCommand) {
        const result = {
          id: step.id,
          type: step.type,
          status: 'skipped',
          durationMs: 0,
          message: 'command steps require allowCommand:true',
        };
        run.steps.push(result);
        this._printStepResult(step, result, execOpts);
        continue;
      }

      // Real execution
      let result;
      try {
        result = await this._runStep(pb, run, step);
      } catch (err) {
        result = {
          id: step.id,
          type: step.type,
          status: 'failed',
          durationMs: this.now() - stepStart,
          message: err && err.message ? err.message : String(err),
        };
      }
      run.steps.push(result);
      this._printStepResult(step, result, execOpts);
      executedSteps.push({ step, result });

      if (result.status === 'failed') {
        failed = true;
        run.outcome = 'failed';
        run.reason = `step ${step.id}: ${result.message}`;
        // Run compensating actions on the steps we already executed, in reverse order.
        await this._compensate(pb, run, executedSteps, execOpts);
        run.outcome = 'compensated';
        break;
      }
    }

    if (!failed) run.outcome = 'success';
    run.finishedAt = this.now();
    run.durationMs = run.finishedAt - run.startedAt;
    run.rtoActualMinutes = run.durationMs / 60000;
    run.rtoBreached = run.rtoActualMinutes > pb.rto_minutes;

    const outcomeColour =
      run.outcome === 'success'
        ? paint.green
        : run.outcome === 'compensated'
        ? paint.yellow
        : paint.red;
    this.logger.info(
      `[dr] ${outcomeColour(run.outcome.toUpperCase())} — ` +
      `duration ${run.rtoActualMinutes.toFixed(2)} min ` +
      `(target ${pb.rto_minutes}) ` +
      `${run.rtoBreached ? paint.red('RTO BREACHED') : paint.green('RTO OK')}`,
    );
    return run;
  }

  async _compensate(pb, run, executedSteps, execOpts) {
    this.logger.warn(`[dr] running compensating actions for ${executedSteps.length} step(s)`);
    for (let i = executedSteps.length - 1; i >= 0; i--) {
      const { step } = executedSteps[i];
      if (!step.compensating) continue;
      const compStep = {
        ...step.compensating,
        id: `${step.id}.compensating`,
        description_he: step.compensating.description_he || `ביטול: ${step.description_he}`,
        description_en: step.compensating.description_en || `Undo: ${step.description_en}`,
        timeout_seconds: step.compensating.timeout_seconds || step.timeout_seconds || 60,
      };
      try {
        const r = await this._runStep(pb, run, compStep);
        r.status = r.status === 'success' ? 'compensated' : r.status;
        run.steps.push(r);
        this._printStepResult(compStep, r, execOpts);
      } catch (err) {
        const r = {
          id: compStep.id,
          type: compStep.type,
          status: 'failed',
          durationMs: 0,
          message: err && err.message ? err.message : String(err),
        };
        run.steps.push(r);
        this._printStepResult(compStep, r, execOpts);
      }
    }
  }

  async _runStep(pb, run, step) {
    const start = this.now();
    const timeoutMs = (step.timeout_seconds || 60) * 1000;
    let result;
    switch (step.type) {
      case 'wait': {
        await withTimeout(this.sleeper(step.seconds * 1000), timeoutMs, step.id);
        result = { message: `slept ${step.seconds}s` };
        break;
      }
      case 'http': {
        const res = await withTimeout(
          this.httpClient(step.url, { method: step.method || 'GET', headers: step.headers, body: step.body }),
          timeoutMs,
          step.id,
        );
        if (step.expectedStatus !== undefined && res.status !== step.expectedStatus) {
          throw new Error(`http ${step.url}: expected status ${step.expectedStatus}, got ${res.status}`);
        }
        if (step.expectedBodyRegex) {
          const re = new RegExp(step.expectedBodyRegex);
          if (!re.test(res.body || '')) {
            throw new Error(`http ${step.url}: body did not match /${step.expectedBodyRegex}/`);
          }
        }
        result = { message: `${step.method || 'GET'} ${step.url} → ${res.status}`, detail: { status: res.status } };
        break;
      }
      case 'command': {
        const res = await withTimeout(
          this.commandRunner(step.command, { shell: step.shell }),
          timeoutMs,
          step.id,
        );
        if (res.code !== 0) {
          throw new Error(`command exit ${res.code}: ${(res.stderr || '').trim() || (res.stdout || '').trim()}`);
        }
        result = {
          message: `exit 0 (${(res.stdout || '').trim().slice(0, 120)})`,
          detail: { code: res.code },
        };
        break;
      }
      case 'manual': {
        const prompt =
          `\n  ${paint.yellow('[manual]')} ${step.description_en} / ${step.description_he}\n` +
          `  Type 'y' / 'כן' to continue: `;
        const ok = await withTimeout(
          this._askConfirm(prompt),
          timeoutMs,
          step.id,
        );
        if (!ok) throw new Error('operator declined manual step');
        result = { message: 'operator confirmed' };
        break;
      }
      case 'verify': {
        const fn = this.verifiers[step.verifier];
        if (!fn) throw new Error(`unknown verifier '${step.verifier}'`);
        const v = await withTimeout(
          Promise.resolve().then(() => fn({ playbook: pb, step, run })),
          timeoutMs,
          step.id,
        );
        if (!v || v.ok !== true) {
          throw new Error(`verify failed: ${v && v.message ? v.message : 'no message'}`);
        }
        result = { message: v.message || 'verified', detail: v.detail };
        break;
      }
      default:
        throw new Error(`unknown step type '${step.type}'`);
    }
    return {
      id: step.id,
      type: step.type,
      status: 'success',
      durationMs: this.now() - start,
      ...result,
    };
  }

  _describeStep(step) {
    switch (step.type) {
      case 'wait':
        return `would sleep ${step.seconds}s`;
      case 'http':
        return `would ${step.method || 'GET'} ${step.url} (expect ${step.expectedStatus || 'any'})`;
      case 'command':
        return `would run: ${step.command}`;
      case 'manual':
        return 'would prompt operator';
      case 'verify':
        return `would run verifier '${step.verifier}'`;
      default:
        return 'unknown';
    }
  }

  _printStepResult(step, result, execOpts) {
    const icon =
      result.status === 'success' || result.status === 'compensated'
        ? paint.green('OK')
        : result.status === 'failed'
        ? paint.red('FAIL')
        : result.status === 'skipped'
        ? paint.yellow('SKIP')
        : paint.cyan('DRY');
    const prefix = execOpts.dryRun ? '[dry-run] ' : '';
    const he = step.description_he || '';
    const en = step.description_en || '';
    const dur = result.durationMs ? ` (${result.durationMs} ms)` : '';
    this.logger.info(
      `  ${icon} ${prefix}${step.id} — ${en} / ${he}${dur}` +
      (result.message ? `\n      ${paint.dim(result.message)}` : ''),
    );
  }

  _askConfirm(prompt) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: this.input,
        output: this.output,
        terminal: false,
      });
      rl.question(prompt, (answer) => {
        rl.close();
        const norm = String(answer || '').trim().toLowerCase();
        resolve(norm === 'y' || norm === 'yes' || norm === 'כן');
      });
    });
  }
}

// ──────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────

function defaultLogger() {
  return {
    info: (msg) => process.stdout.write(`${msg}\n`),
    warn: (msg) => process.stderr.write(`${msg}\n`),
    error: (msg) => process.stderr.write(`${msg}\n`),
  };
}

/** Default shell command runner — uses spawn, captures output. */
function defaultCommandRunner(command, opts = {}) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const shellBin = opts.shell || (isWin ? 'cmd.exe' : '/bin/sh');
    const shellArgs = isWin ? ['/d', '/s', '/c', command] : ['-c', command];
    const child = spawn(shellBin, shellArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
  });
}

/** Default HTTP client using Node's global fetch (Node >= 20). */
async function defaultHttpClient(url, opts = {}) {
  if (typeof fetch !== 'function') {
    throw new Error('DRRunner: global fetch is not available — pass opts.httpClient');
  }
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.headers || {},
    body: opts.body,
  });
  const body = await res.text();
  return { status: res.status, body };
}

/** Wrap a promise with a timeout. */
function withTimeout(promise, ms, label) {
  if (!ms || ms <= 0) return promise;
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`step '${label}' timed out after ${ms} ms`));
    }, ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

module.exports = {
  DRRunner,
  parseYaml,
  validatePlaybook,
  strip,
  VALID_STEP_TYPES,
};
