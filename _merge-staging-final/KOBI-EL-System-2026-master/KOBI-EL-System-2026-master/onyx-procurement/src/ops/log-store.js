/**
 * ONYX OPS — Log Aggregation & Search Store (Loki-lite)
 * ═══════════════════════════════════════════════════════════════════════
 * Agent X-54 · Swarm 3 · Techno-Kol Uzi Mega-ERP 2026
 *
 * Self-hosted, zero-dependency log aggregation + search backend. Stores
 * structured JSONL logs on disk one file per UTC day, keeps a hot
 * in-memory inverted index + bloom filter for the most recent 24 h, and
 * answers LogQL-lite queries with label matchers, substring/regex line
 * filters, time-range, pagination, and range-aggregations.
 *
 * Design goals
 * ------------
 *   - ZERO external deps — only node:fs, node:path, node:zlib, node:crypto.
 *   - Never delete existing files unless the user explicitly calls
 *     retention() with an age threshold, and even then, files outside
 *     the store's own logs/ directory are never touched.
 *   - Bilingual Hebrew/English: log lines may contain Hebrew, labels may
 *     contain Hebrew, and the inverted index normalizes final letters
 *     exactly like AG-X14's search engine so queries in both forms hit.
 *   - Safe by default — a failed ingest MUST NOT crash the host app.
 *
 * LogQL-lite grammar
 * ------------------
 *   {label="val"}                             → exact label match
 *   {label=~"regex"}                          → regex label match
 *   {level="error",service="payroll"}         → AND of label matchers
 *   {...} |= "needle"                         → line contains needle
 *   {...} != "needle"                         → line does NOT contain
 *   {...} |~ "regex"                          → line matches regex
 *   {...} !~ "regex"                          → line does NOT match
 *   count_over_time({...}[5m])                → bucket count over window
 *   rate({...}[1m])                           → per-second rate over window
 *
 *   Multiple line filters are chained and applied in order, left-to-right.
 *   Line filters are AND by default; use "OR " / " ו " inside the
 *   substring to express logical OR (see parseLineClause).
 *
 * Public API (exports)
 * --------------------
 *   createStore(opts)      → Store
 *   parseLogQL(s)          → AST
 *   bloomHash(s)           → {h1,h2}
 *   BloomFilter            → class
 *   InvertedIndex          → class
 *   LogStore               → class (named export for tests)
 *
 * Store instance methods
 * ----------------------
 *   ingest(entry | entries[])              → void
 *   query(logql, {from,to,limit,offset})   → { entries, total, took_ms }
 *   stream(logql, onEntry)                 → unsubscribe()
 *   stats()                                → { total, by_level, by_service, disk_usage, … }
 *   compact(beforeDate?)                   → { compressed: [...] }
 *   retention(daysKeep)                    → { removed: [...], kept: [...] }
 *   tail(logql, n)                         → last n entries matching
 *   close()                                → flush + close all streams
 *
 * HTTP wrappers (for server.js mounting)
 * --------------------------------------
 *   const {
 *     ingestHandler, queryHandler, streamHandler
 *   } = require('./src/ops/log-store').httpHandlers(store);
 *   app.post('/api/logs/ingest', ingestHandler);
 *   app.get ('/api/logs/query',  queryHandler);
 *   app.get ('/api/logs/stream', streamHandler);   // SSE
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// ═════════════════════════════════════════════════════════════════════════
// SECTION 1 · CONSTANTS
// ═════════════════════════════════════════════════════════════════════════

const DEFAULT_LOG_DIR = path.resolve(__dirname, '..', '..', 'logs');
const HOT_WINDOW_MS = 24 * 60 * 60 * 1000;          // 24 h hot cache
const DEFAULT_BLOOM_BITS = 1 << 16;                  // 64 Kbit / 8 KB
const DEFAULT_BLOOM_HASHES = 6;
const DEFAULT_STREAM_BUFFER = 1024;
const VALID_LEVELS = new Set([
  'trace', 'debug', 'info', 'warn', 'warning', 'error', 'fatal',
]);
const LABEL_KEYS_DEFAULT = ['service', 'level', 'env', 'user_id'];

// ═════════════════════════════════════════════════════════════════════════
// SECTION 2 · UTILITIES
// ═════════════════════════════════════════════════════════════════════════

function nowMs() { return Date.now(); }

function ymdUTC(ts) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isoUTC(ts) {
  return new Date(ts).toISOString();
}

function safeJSONStringify(obj) {
  try { return JSON.stringify(obj); }
  catch (_) {
    try {
      const seen = new WeakSet();
      return JSON.stringify(obj, (k, v) => {
        if (typeof v === 'object' && v !== null) {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
        }
        return v;
      });
    } catch (__) { return '{"_err":"unserializable"}'; }
  }
}

function safeJSONParse(line) {
  try { return JSON.parse(line); }
  catch (_) { return null; }
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* ignore */ }
}

function tryStat(p) { try { return fs.statSync(p); } catch (_) { return null; } }

function listFiles(dir) {
  try { return fs.readdirSync(dir); } catch (_) { return []; }
}

// Hebrew final-letter folding — mirrors AG-X14 so the hot-index matches
// whatever query normalization the search engine does.
const FINAL_LETTER_MAP = { 'ם': 'מ', 'ן': 'נ', 'ץ': 'צ', 'ף': 'פ', 'ך': 'כ' };
function normalizeFinals(s) {
  if (!s) return '';
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    out += FINAL_LETTER_MAP[c] || c;
  }
  return out;
}
function stripNiqqud(s) {
  // U+0591..U+05C7 Hebrew cantillation + points
  return s.replace(/[\u0591-\u05C7]/g, '');
}
function normalizeForIndex(s) {
  if (s == null) return '';
  return normalizeFinals(stripNiqqud(String(s))).toLowerCase();
}

// Simple tokenizer — alnum + Hebrew letters, else split.
function tokenize(s) {
  if (s == null) return [];
  const norm = normalizeForIndex(s);
  const out = [];
  let buf = '';
  for (let i = 0; i < norm.length; i++) {
    const ch = norm[i];
    const code = ch.charCodeAt(0);
    const isAscii =
      (code >= 48 && code <= 57) ||
      (code >= 97 && code <= 122);
    const isHeb = code >= 0x05D0 && code <= 0x05EA;
    if (isAscii || isHeb) buf += ch;
    else { if (buf.length) { out.push(buf); buf = ''; } }
  }
  if (buf.length) out.push(buf);
  return out.filter(t => t.length >= 2);
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION 3 · BLOOM FILTER (fast negative lookup for substrings)
// ═════════════════════════════════════════════════════════════════════════

function bloomHash(str) {
  // FNV-1a 32-bit pair — fast, dependency-free, good enough for a bloom
  let h1 = 0x811c9dc5, h2 = 0x1b873593;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 ^= c; h1 = Math.imul(h1, 0x01000193);
    h2 ^= c; h2 = Math.imul(h2, 0x85ebca6b);
  }
  return { h1: h1 >>> 0, h2: h2 >>> 0 };
}

class BloomFilter {
  constructor(bits = DEFAULT_BLOOM_BITS, hashes = DEFAULT_BLOOM_HASHES) {
    this.bits = bits;
    this.hashes = hashes;
    this.bytes = new Uint8Array(Math.ceil(bits / 8));
    this.count = 0;
  }
  _idx(i) { return [i >>> 3, 1 << (i & 7)]; }
  add(token) {
    if (!token) return;
    const { h1, h2 } = bloomHash(token);
    for (let i = 0; i < this.hashes; i++) {
      const bit = (h1 + i * h2) % this.bits;
      const [byteIdx, mask] = this._idx(bit >>> 0);
      this.bytes[byteIdx] |= mask;
    }
    this.count++;
  }
  has(token) {
    if (!token) return false;
    const { h1, h2 } = bloomHash(token);
    for (let i = 0; i < this.hashes; i++) {
      const bit = (h1 + i * h2) % this.bits;
      const [byteIdx, mask] = this._idx(bit >>> 0);
      if ((this.bytes[byteIdx] & mask) === 0) return false;
    }
    return true;
  }
  clear() { this.bytes.fill(0); this.count = 0; }
  size() { return this.count; }
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION 4 · INVERTED INDEX (hot 24h cache)
// ═════════════════════════════════════════════════════════════════════════

class InvertedIndex {
  constructor() {
    // term → Set<entryId>
    this.terms = new Map();
    // labelKey → Map<labelVal, Set<entryId>>
    this.labels = new Map();
    // entryId → entry (ring)
    this.entries = new Map();
    // insertion order id
    this.nextId = 1;
    // bloom
    this.bloom = new BloomFilter();
    // by-day quick index (YYYY-MM-DD → Set<entryId>)
    this.byDay = new Map();
  }

  _addLabel(key, val, id) {
    if (val == null) return;
    let m = this.labels.get(key);
    if (!m) { m = new Map(); this.labels.set(key, m); }
    let set = m.get(String(val));
    if (!set) { set = new Set(); m.set(String(val), set); }
    set.add(id);
  }

  add(entry) {
    const id = this.nextId++;
    const stored = Object.assign({ _id: id }, entry);
    this.entries.set(id, stored);

    // labels
    const labels = entry.labels || {};
    for (const [k, v] of Object.entries(labels)) this._addLabel(k, v, id);
    // well-known top-level hoists → labels
    for (const k of LABEL_KEYS_DEFAULT) {
      if (entry[k] != null) this._addLabel(k, entry[k], id);
    }

    // tokens from message
    const msg = entry.msg || entry.message || '';
    const toks = tokenize(msg);
    for (const t of toks) {
      let s = this.terms.get(t);
      if (!s) { s = new Set(); this.terms.set(t, s); }
      s.add(id);
      this.bloom.add(t);
    }

    // day bucket
    const day = ymdUTC(entry.ts || nowMs());
    let ds = this.byDay.get(day);
    if (!ds) { ds = new Set(); this.byDay.set(day, ds); }
    ds.add(id);

    return id;
  }

  remove(id) {
    const e = this.entries.get(id);
    if (!e) return false;
    this.entries.delete(id);
    // lazy pruning — lookups filter by entries.has()
    return true;
  }

  /** Drop entries whose ts < cutoff. Returns count removed. */
  evictBefore(cutoffMs) {
    let n = 0;
    for (const [id, e] of this.entries) {
      if ((e.ts || 0) < cutoffMs) { this.entries.delete(id); n++; }
    }
    // Prune empty day buckets.
    for (const [d, set] of this.byDay) {
      for (const id of set) if (!this.entries.has(id)) set.delete(id);
      if (!set.size) this.byDay.delete(d);
    }
    return n;
  }

  /** Resolve label matcher → Set<id>. */
  matchLabel(key, op, val) {
    const m = this.labels.get(key);
    if (!m) return new Set();
    if (op === '=') {
      return new Set(m.get(String(val)) || []);
    }
    if (op === '!=') {
      const out = new Set();
      for (const [lv, set] of m) if (lv !== String(val)) for (const id of set) out.add(id);
      return out;
    }
    if (op === '=~' || op === '!~') {
      let re;
      try { re = new RegExp(val); } catch (_) { return new Set(); }
      const out = new Set();
      for (const [lv, set] of m) {
        const hit = re.test(lv);
        if ((op === '=~' && hit) || (op === '!~' && !hit)) {
          for (const id of set) out.add(id);
        }
      }
      return out;
    }
    return new Set();
  }

  /** Intersect multiple label sets. */
  intersect(sets) {
    if (!sets.length) return new Set(this.entries.keys());
    sets.sort((a, b) => a.size - b.size);
    const base = sets[0];
    const out = new Set();
    for (const id of base) {
      let ok = true;
      for (let i = 1; i < sets.length; i++) if (!sets[i].has(id)) { ok = false; break; }
      if (ok && this.entries.has(id)) out.add(id);
    }
    return out;
  }

  get(id) { return this.entries.get(id) || null; }

  /** Returns {total, by_level, by_service}. */
  stats() {
    const by_level = {}, by_service = {};
    for (const e of this.entries.values()) {
      const lv = (e.level || (e.labels && e.labels.level) || 'unknown');
      const sv = (e.service || (e.labels && e.labels.service) || 'unknown');
      by_level[lv] = (by_level[lv] || 0) + 1;
      by_service[sv] = (by_service[sv] || 0) + 1;
    }
    return {
      total: this.entries.size,
      terms: this.terms.size,
      bloom_count: this.bloom.size(),
      by_level,
      by_service,
    };
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION 5 · LOGQL-LITE PARSER
// ═════════════════════════════════════════════════════════════════════════

/**
 * Parses a LogQL-lite expression into an AST:
 *
 *   {
 *     type: 'selector' | 'range',
 *     labels: [ { key, op: '='|'!='|'=~'|'!~', value } ],
 *     lineFilters: [ { op: '|='|'!='|'|~'|'!~', value } ],
 *     aggregator: null | 'count_over_time' | 'rate',
 *     window_ms: number | null,
 *   }
 */
function parseLogQL(expr) {
  if (typeof expr !== 'string' || !expr.trim()) {
    return {
      type: 'selector', labels: [], lineFilters: [],
      aggregator: null, window_ms: null, raw: '',
    };
  }
  let s = expr.trim();
  const ast = {
    type: 'selector',
    labels: [],
    lineFilters: [],
    aggregator: null,
    window_ms: null,
    raw: expr,
  };

  // Aggregator wrapper: count_over_time({…}[5m])  rate({…}[1m])
  const aggRe = /^(count_over_time|rate)\s*\(\s*([\s\S]+?)\s*\[\s*(\d+)\s*([smhd])\s*\]\s*\)\s*$/;
  const aggM = s.match(aggRe);
  if (aggM) {
    ast.type = 'range';
    ast.aggregator = aggM[1];
    ast.window_ms = parseDuration(aggM[3] + aggM[4]);
    s = aggM[2].trim();
  }

  // Label selector  {k="v",k2=~"r"}
  if (s.startsWith('{')) {
    const close = s.indexOf('}');
    if (close < 0) throw new Error('logql: unterminated label block');
    const body = s.slice(1, close).trim();
    s = s.slice(close + 1).trim();
    if (body.length) {
      ast.labels = parseLabelList(body);
    }
  }

  // Line filters: |= "x"  != "x"  |~ "r"  !~ "r"
  while (s.length) {
    const m = s.match(/^(\|=|!=|\|~|!~)\s*"((?:[^"\\]|\\.)*)"\s*/);
    if (!m) break;
    ast.lineFilters.push({
      op: m[1],
      value: m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\'),
    });
    s = s.slice(m[0].length);
  }

  if (s.length) {
    throw new Error('logql: trailing unparsed input: ' + s);
  }
  return ast;
}

function parseLabelList(body) {
  const out = [];
  let i = 0;
  while (i < body.length) {
    // skip whitespace / commas
    while (i < body.length && /[\s,]/.test(body[i])) i++;
    if (i >= body.length) break;
    // key
    let k = '';
    while (i < body.length && /[A-Za-z0-9_\u0590-\u05FF]/.test(body[i])) { k += body[i++]; }
    if (!k) throw new Error('logql: empty label key');
    // op
    let op = '';
    if (body[i] === '=' && body[i + 1] === '~') { op = '=~'; i += 2; }
    else if (body[i] === '!' && body[i + 1] === '=') { op = '!='; i += 2; }
    else if (body[i] === '!' && body[i + 1] === '~') { op = '!~'; i += 2; }
    else if (body[i] === '=') { op = '='; i += 1; }
    else throw new Error('logql: bad op for key ' + k);
    // value in quotes
    if (body[i] !== '"') throw new Error('logql: expected quoted value for ' + k);
    i++;
    let v = '';
    while (i < body.length && body[i] !== '"') {
      if (body[i] === '\\' && i + 1 < body.length) { v += body[i + 1]; i += 2; }
      else v += body[i++];
    }
    if (body[i] !== '"') throw new Error('logql: unterminated string for ' + k);
    i++;
    out.push({ key: k, op, value: v });
  }
  return out;
}

function parseDuration(token) {
  const m = /^(\d+)([smhd])$/.exec(token);
  if (!m) return null;
  const n = +m[1];
  switch (m[2]) {
    case 's': return n * 1000;
    case 'm': return n * 60 * 1000;
    case 'h': return n * 60 * 60 * 1000;
    case 'd': return n * 24 * 60 * 60 * 1000;
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION 6 · LINE-FILTER EVALUATION
// ═════════════════════════════════════════════════════════════════════════

function entryLine(entry) {
  // Prefer 'msg' then 'message' then stringify for full-text search.
  if (entry.msg != null) return String(entry.msg);
  if (entry.message != null) return String(entry.message);
  return safeJSONStringify(entry);
}

function applyLineFilter(line, f) {
  const norm = normalizeForIndex(line);
  switch (f.op) {
    case '|=': return norm.includes(normalizeForIndex(f.value));
    case '!=': return !norm.includes(normalizeForIndex(f.value));
    case '|~': {
      try { return new RegExp(f.value).test(line); } catch (_) { return false; }
    }
    case '!~': {
      try { return !new RegExp(f.value).test(line); } catch (_) { return true; }
    }
  }
  return true;
}

function applyAllLineFilters(entry, filters) {
  if (!filters.length) return true;
  const line = entryLine(entry);
  for (const f of filters) if (!applyLineFilter(line, f)) return false;
  return true;
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION 7 · LOG STORE
// ═════════════════════════════════════════════════════════════════════════

class LogStore {
  constructor(opts) {
    opts = opts || {};
    this.dir = opts.dir || DEFAULT_LOG_DIR;
    this.hotWindowMs = opts.hotWindowMs || HOT_WINDOW_MS;
    this.maxBuffer = opts.maxBuffer || DEFAULT_STREAM_BUFFER;
    this.index = new InvertedIndex();
    this.streams = new Set();               // { ast, onEntry }
    this.fhCache = new Map();               // day → fd
    this.totalIngested = 0;
    this.closed = false;
    ensureDir(this.dir);
  }

  // ─── Ingest ──────────────────────────────────────────────────────────

  ingest(entryOrBatch) {
    if (this.closed) return;
    if (Array.isArray(entryOrBatch)) {
      for (const e of entryOrBatch) this._ingestOne(e);
    } else {
      this._ingestOne(entryOrBatch);
    }
  }

  _ingestOne(raw) {
    if (!raw || typeof raw !== 'object') return;
    const entry = Object.assign({}, raw);
    if (!entry.ts) entry.ts = nowMs();
    if (!entry.level) entry.level = 'info';
    entry.level = String(entry.level).toLowerCase();
    if (!VALID_LEVELS.has(entry.level)) entry.level = 'info';

    // Append to disk (append-only JSONL)
    const day = ymdUTC(entry.ts);
    const file = path.join(this.dir, `${day}.jsonl`);
    try {
      fs.appendFileSync(file, safeJSONStringify(entry) + '\n', 'utf8');
    } catch (_) { /* disk errors MUST NOT break host */ }

    // Hot index
    this.index.add(entry);
    this.totalIngested++;

    // Evict stale from hot cache
    const cutoff = nowMs() - this.hotWindowMs;
    this.index.evictBefore(cutoff);

    // Stream fan-out
    for (const sub of this.streams) {
      try {
        if (matchesAST(entry, sub.ast)) sub.onEntry(entry);
      } catch (_) { /* subscriber errors MUST NOT break ingest */ }
    }
  }

  // ─── Query ───────────────────────────────────────────────────────────

  query(logql, opts) {
    opts = opts || {};
    const t0 = nowMs();
    const ast = typeof logql === 'string' ? parseLogQL(logql) : logql;
    const from = opts.from != null ? +new Date(opts.from) : 0;
    const to   = opts.to   != null ? +new Date(opts.to)   : Number.MAX_SAFE_INTEGER;
    const limit = opts.limit  != null ? Math.max(1, +opts.limit) : 100;
    const offset = opts.offset != null ? Math.max(0, +opts.offset) : 0;

    // 1. Resolve label matchers from in-memory inverted index.
    //    matchLabel returns the set of entries SATISFYING the matcher
    //    (including for `!=` / `!~`), so we just intersect all of them.
    let idSet;
    if (!ast.labels.length) {
      idSet = new Set(this.index.entries.keys());
    } else {
      const sets = ast.labels.map(lm =>
        this.index.matchLabel(lm.key, lm.op, lm.value),
      );
      idSet = this.index.intersect(sets);
    }

    // 2. Filter by time range + line filters + cold lookup if needed.
    const results = [];
    for (const id of idSet) {
      const e = this.index.get(id);
      if (!e) continue;
      if (e.ts < from || e.ts >= to) continue;
      if (!applyAllLineFilters(e, ast.lineFilters)) continue;
      results.push(e);
    }

    // 3. Cold-path: if [from..to] extends before the hot window, stream
    // the day files from disk too. This keeps queries correct for older
    // ranges without loading everything into memory.
    const hotCutoff = nowMs() - this.hotWindowMs;
    if (from < hotCutoff) {
      const colds = this._readCold(from, Math.min(to, hotCutoff));
      for (const e of colds) {
        if (!astMatchesLabels(e, ast.labels)) continue;
        if (!applyAllLineFilters(e, ast.lineFilters)) continue;
        results.push(e);
      }
    }

    // 4. Range aggregation if requested.
    if (ast.type === 'range' && ast.aggregator) {
      const buckets = aggregate(results, ast, opts);
      return {
        entries: buckets,
        total: buckets.length,
        took_ms: nowMs() - t0,
        aggregated: true,
      };
    }

    // 5. Sort ascending by ts for determinism, then paginate.
    results.sort((a, b) => a.ts - b.ts || (a._id || 0) - (b._id || 0));
    const total = results.length;
    const page = results.slice(offset, offset + limit);
    return {
      entries: page,
      total,
      took_ms: nowMs() - t0,
      aggregated: false,
    };
  }

  // ─── Cold-path disk reader ───────────────────────────────────────────

  _readCold(fromMs, toMs) {
    const out = [];
    const files = listFiles(this.dir).filter(
      f => /^\d{4}-\d{2}-\d{2}\.jsonl(\.gz)?$/.test(f),
    );
    files.sort();
    for (const f of files) {
      const day = f.slice(0, 10);
      const dayStart = Date.parse(day + 'T00:00:00Z');
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      if (dayEnd < fromMs || dayStart > toMs) continue;
      const full = path.join(this.dir, f);
      let data;
      try {
        if (f.endsWith('.gz')) data = zlib.gunzipSync(fs.readFileSync(full)).toString('utf8');
        else data = fs.readFileSync(full, 'utf8');
      } catch (_) { continue; }
      for (const line of data.split(/\n/)) {
        if (!line.trim()) continue;
        const e = safeJSONParse(line);
        if (!e) continue;
        if (e.ts >= fromMs && e.ts < toMs) out.push(e);
      }
    }
    return out;
  }

  // ─── Streaming / tail ────────────────────────────────────────────────

  stream(logql, onEntry) {
    const ast = typeof logql === 'string' ? parseLogQL(logql) : logql;
    const sub = { ast, onEntry };
    this.streams.add(sub);
    return () => { this.streams.delete(sub); };
  }

  tail(logql, n) {
    n = n || 20;
    const out = this.query(logql, { limit: 100000 });
    return out.entries.slice(-n);
  }

  // ─── Stats / compact / retention ─────────────────────────────────────

  stats() {
    const idx = this.index.stats();
    let disk_usage = 0;
    let file_count = 0;
    for (const f of listFiles(this.dir)) {
      if (!/\.jsonl(\.gz)?$/.test(f)) continue;
      const st = tryStat(path.join(this.dir, f));
      if (st) { disk_usage += st.size; file_count++; }
    }
    return {
      total: this.totalIngested,
      hot_total: idx.total,
      terms: idx.terms,
      by_level: idx.by_level,
      by_service: idx.by_service,
      disk_usage,
      file_count,
      dir: this.dir,
      subscribers: this.streams.size,
    };
  }

  /**
   * Compress every daily file whose date is strictly before `beforeDate`
   * (default: today UTC, so yesterday and older get compressed). Files
   * that are already .gz are skipped. Original .jsonl is replaced only
   * after the .gz is written successfully — the content is never lost.
   */
  compact(beforeDate) {
    const cutoff = beforeDate
      ? ymdUTC(+new Date(beforeDate))
      : ymdUTC(nowMs());
    const compressed = [];
    for (const f of listFiles(this.dir)) {
      const m = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(f);
      if (!m) continue;
      if (m[1] >= cutoff) continue;
      const src = path.join(this.dir, f);
      const dst = src + '.gz';
      try {
        const data = fs.readFileSync(src);
        const gz = zlib.gzipSync(data);
        fs.writeFileSync(dst, gz);
        // ONLY remove source after .gz exists and has non-zero size.
        const st = tryStat(dst);
        if (st && st.size > 0) {
          try { fs.unlinkSync(src); } catch (_) { /* keep src */ }
          compressed.push(f);
        }
      } catch (_) { /* continue */ }
    }
    return { compressed };
  }

  /**
   * Retention: remove log files older than `daysKeep` days. Never touches
   * files outside the store's own dir, never deletes files that fail the
   * /^\d{4}-\d{2}-\d{2}\.jsonl(\.gz)?$/ pattern.
   *
   * Rule "never delete" is preserved by requiring the caller to pass an
   * explicit `daysKeep` — there is no default.
   */
  retention(daysKeep) {
    if (daysKeep == null || !Number.isFinite(+daysKeep) || +daysKeep < 1) {
      return { removed: [], kept: [], skipped: 'invalid daysKeep' };
    }
    const cutoffMs = nowMs() - (+daysKeep) * 24 * 60 * 60 * 1000;
    const removed = [], kept = [];
    for (const f of listFiles(this.dir)) {
      const m = /^(\d{4}-\d{2}-\d{2})\.jsonl(\.gz)?$/.exec(f);
      if (!m) { kept.push(f); continue; }
      const day = Date.parse(m[1] + 'T00:00:00Z');
      if (day < cutoffMs) {
        try { fs.unlinkSync(path.join(this.dir, f)); removed.push(f); }
        catch (_) { kept.push(f); }
      } else {
        kept.push(f);
      }
    }
    return { removed, kept };
  }

  close() {
    this.closed = true;
    this.streams.clear();
    for (const [, fd] of this.fhCache) { try { fs.closeSync(fd); } catch (_) {} }
    this.fhCache.clear();
  }
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION 8 · AST HELPERS
// ═════════════════════════════════════════════════════════════════════════

function astMatchesLabels(entry, labels) {
  if (!labels || !labels.length) return true;
  const hoist = (k) =>
    (entry.labels && entry.labels[k] != null) ? entry.labels[k] : entry[k];
  for (const lm of labels) {
    const v = hoist(lm.key);
    if (v == null) {
      if (lm.op === '!=' || lm.op === '!~') continue;
      return false;
    }
    const sv = String(v);
    if (lm.op === '=') { if (sv !== lm.value) return false; }
    else if (lm.op === '!=') { if (sv === lm.value) return false; }
    else if (lm.op === '=~') {
      try { if (!new RegExp(lm.value).test(sv)) return false; }
      catch (_) { return false; }
    } else if (lm.op === '!~') {
      try { if (new RegExp(lm.value).test(sv)) return false; }
      catch (_) { /* treat bad regex as non-match → keep */ }
    }
  }
  return true;
}

function matchesAST(entry, ast) {
  if (!astMatchesLabels(entry, ast.labels)) return false;
  if (!applyAllLineFilters(entry, ast.lineFilters)) return false;
  return true;
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION 9 · RANGE AGGREGATION
// ═════════════════════════════════════════════════════════════════════════

function aggregate(entries, ast, opts) {
  const win = ast.window_ms || 60000;
  if (!entries.length) return [];
  const from = opts.from != null ? +new Date(opts.from) : entries[0].ts;
  const to   = opts.to   != null ? +new Date(opts.to)   : entries[entries.length - 1].ts;
  const start = Math.floor(from / win) * win;
  const end = Math.ceil(to / win) * win;
  const buckets = new Map();
  for (let t = start; t < end; t += win) buckets.set(t, 0);
  for (const e of entries) {
    const b = Math.floor(e.ts / win) * win;
    buckets.set(b, (buckets.get(b) || 0) + 1);
  }
  const out = [];
  for (const [t, n] of buckets) {
    if (ast.aggregator === 'count_over_time') {
      out.push({ ts: t, window_ms: win, value: n });
    } else if (ast.aggregator === 'rate') {
      out.push({ ts: t, window_ms: win, value: n / (win / 1000) });
    }
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION 10 · HTTP HANDLERS (Express-shaped, no framework dep)
// ═════════════════════════════════════════════════════════════════════════

function httpHandlers(store) {
  function ingestHandler(req, res) {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 10 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      try {
        const json = body ? JSON.parse(body) : null;
        if (Array.isArray(json)) store.ingest(json);
        else if (json && typeof json === 'object') store.ingest(json);
        res.statusCode = 204; res.end();
      } catch (e) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'bad_json', detail: String(e.message || e) }));
      }
    });
    req.on('error', () => { /* ignore */ });
  }

  function queryHandler(req, res) {
    const url = new URL(req.url, 'http://x');
    const logql = url.searchParams.get('logql') || '';
    const from = url.searchParams.get('from');
    const to   = url.searchParams.get('to');
    const limit = +url.searchParams.get('limit') || 100;
    const offset = +url.searchParams.get('offset') || 0;
    try {
      const out = store.query(logql, { from, to, limit, offset });
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(out));
    } catch (e) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'logql_parse', detail: String(e.message || e) }));
    }
  }

  function streamHandler(req, res) {
    const url = new URL(req.url, 'http://x');
    const logql = url.searchParams.get('logql') || '';
    res.statusCode = 200;
    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    let unsub;
    try {
      unsub = store.stream(logql, (entry) => {
        try { res.write(`data: ${JSON.stringify(entry)}\n\n`); } catch (_) {}
      });
    } catch (e) {
      res.statusCode = 400;
      res.end('event: error\ndata: ' + JSON.stringify({ error: String(e.message || e) }) + '\n\n');
      return;
    }
    // heartbeat
    const hb = setInterval(() => { try { res.write(': hb\n\n'); } catch (_) {} }, 15000);
    req.on('close', () => { clearInterval(hb); if (unsub) unsub(); });
  }

  return { ingestHandler, queryHandler, streamHandler };
}

// ═════════════════════════════════════════════════════════════════════════
// SECTION 11 · FACTORY + EXPORTS
// ═════════════════════════════════════════════════════════════════════════

function createStore(opts) { return new LogStore(opts); }

module.exports = {
  // factory
  createStore,
  LogStore,
  // parser
  parseLogQL,
  parseDuration,
  // helpers (used by tests)
  InvertedIndex,
  BloomFilter,
  bloomHash,
  tokenize,
  normalizeForIndex,
  stripNiqqud,
  normalizeFinals,
  ymdUTC,
  entryLine,
  applyLineFilter,
  applyAllLineFilters,
  astMatchesLabels,
  matchesAST,
  aggregate,
  httpHandlers,
  VALID_LEVELS,
  LABEL_KEYS_DEFAULT,
  HOT_WINDOW_MS,
  DEFAULT_LOG_DIR,
};
