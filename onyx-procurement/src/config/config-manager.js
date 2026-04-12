/**
 * onyx-procurement/src/config/config-manager.js
 * ─────────────────────────────────────────────────────────────────────
 * ConfigManager — unified configuration loader for the Techno-Kol Uzi
 * mega-ERP. Handles env vars, YAML/JSON files, .env files, remote HTTP
 * config, encrypted secrets, hot-reload, schema validation, dot-notation
 * access, type coercion, redacted audit dumps, and config diff.
 *
 * Agent: X-97 | Swarm: 4 | Project: Techno-Kol Uzi mega-ERP
 * Date: 2026-04-11
 *
 * RULES
 *   - Zero external dependencies. `node:*` built-ins only.
 *   - "לא מוחקים רק משדרגים ומגדלים" — never silently drop keys;
 *     new sources OVERLAY onto prior ones (last wins, deep-merged).
 *   - Bilingual error messages (Hebrew + English).
 *   - Secrets never leak into dump() unless redactSecrets:false is set
 *     explicitly.
 *
 * Usage
 *   const { ConfigManager } = require('./config-manager');
 *   const cfg = new ConfigManager();
 *   await cfg.load({
 *     sources: [
 *       { type: 'env' },
 *       { type: 'file', path: './config/default.yaml' },
 *       { type: 'file', path: './config/prod.json' },
 *       { type: 'remote', url: 'https://config.example.com/app.json',
 *         pollMs: 30000 },
 *     ],
 *     schema: {
 *       'server.port':       { type: 'number', required: true, min: 1, max: 65535 },
 *       'server.host':       { type: 'string', default: '0.0.0.0' },
 *       'database.password': { type: 'string', required: true, secret: true },
 *     },
 *   });
 *   cfg.get('server.port'); // 3100
 * ─────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const { EventEmitter } = require('node:events');

// ───────────────────────────────────────────────────────────────────
//  Bilingual error messages
// ───────────────────────────────────────────────────────────────────

const ERR = {
  SOURCE_UNKNOWN: (t) => ({
    he: `סוג מקור לא מוכר: "${t}". ציפינו ל-env | file | remote | inline.`,
    en: `Unknown source type: "${t}". Expected env | file | remote | inline.`,
  }),
  FILE_NOT_FOUND: (p) => ({
    he: `קובץ תצורה לא נמצא: ${p}`,
    en: `Config file not found: ${p}`,
  }),
  FILE_UNREADABLE: (p, reason) => ({
    he: `שגיאה בקריאת קובץ תצורה ${p}: ${reason}`,
    en: `Failed to read config file ${p}: ${reason}`,
  }),
  FILE_FORMAT_UNKNOWN: (p) => ({
    he: `סיומת קובץ לא מוכרת: ${p} (נתמכים: .yaml, .yml, .json, .env)`,
    en: `Unknown config file extension: ${p} (supported: .yaml, .yml, .json, .env)`,
  }),
  YAML_PARSE: (msg, line) => ({
    he: `שגיאת פרסור YAML בשורה ${line}: ${msg}`,
    en: `YAML parse error at line ${line}: ${msg}`,
  }),
  JSON_PARSE: (msg) => ({
    he: `שגיאת פרסור JSON: ${msg}`,
    en: `JSON parse error: ${msg}`,
  }),
  REMOTE_FAIL: (url, status) => ({
    he: `נכשלה הורדת תצורה מרחוק מ-${url} (סטטוס ${status})`,
    en: `Failed to fetch remote config from ${url} (status ${status})`,
  }),
  REMOTE_TIMEOUT: (url) => ({
    he: `תם הזמן לטעינת תצורה מרחוק: ${url}`,
    en: `Timeout loading remote config: ${url}`,
  }),
  SCHEMA_REQUIRED: (key) => ({
    he: `שדה חובה חסר: "${key}"`,
    en: `Missing required field: "${key}"`,
  }),
  SCHEMA_TYPE: (key, expected, actual) => ({
    he: `סוג שגוי בשדה "${key}": צפוי ${expected}, התקבל ${actual}`,
    en: `Wrong type at "${key}": expected ${expected}, got ${actual}`,
  }),
  SCHEMA_MIN: (key, min, actual) => ({
    he: `הערך בשדה "${key}" קטן מהמינימום (${min}): ${actual}`,
    en: `Value at "${key}" below minimum (${min}): ${actual}`,
  }),
  SCHEMA_MAX: (key, max, actual) => ({
    he: `הערך בשדה "${key}" גדול מהמקסימום (${max}): ${actual}`,
    en: `Value at "${key}" above maximum (${max}): ${actual}`,
  }),
  SCHEMA_ENUM: (key, allowed, actual) => ({
    he: `ערך לא חוקי בשדה "${key}": "${actual}". מותרים: ${allowed.join(', ')}`,
    en: `Invalid value at "${key}": "${actual}". Allowed: ${allowed.join(', ')}`,
  }),
  SCHEMA_PATTERN: (key, pattern, actual) => ({
    he: `הערך בשדה "${key}" לא תואם לדפוס ${pattern}: "${actual}"`,
    en: `Value at "${key}" does not match pattern ${pattern}: "${actual}"`,
  }),
  SCHEMA_LEN_MIN: (key, min, actual) => ({
    he: `אורך הערך בשדה "${key}" קצר מ-${min}: בפועל ${actual}`,
    en: `Value length at "${key}" below ${min}: got ${actual}`,
  }),
  SCHEMA_LEN_MAX: (key, max, actual) => ({
    he: `אורך הערך בשדה "${key}" ארוך מ-${max}: בפועל ${actual}`,
    en: `Value length at "${key}" above ${max}: got ${actual}`,
  }),
  ENCRYPT_NO_KEY: () => ({
    he: `לא הוגדר מפתח הצפנה. יש להגדיר CONFIG_ENCRYPTION_KEY (32 בתים, hex/base64/utf8).`,
    en: `No encryption key configured. Set CONFIG_ENCRYPTION_KEY (32 bytes, hex/base64/utf8).`,
  }),
  ENCRYPT_BAD_KEY: (len) => ({
    he: `אורך מפתח הצפנה שגוי: התקבלו ${len} בתים, נדרשים 32.`,
    en: `Invalid encryption key length: got ${len} bytes, need 32.`,
  }),
  DECRYPT_BAD_INPUT: () => ({
    he: `מבנה הערך המוצפן פגום. פורמט נדרש: "enc:v1:<iv>:<tag>:<cipher>" (base64).`,
    en: `Malformed ciphertext. Required format: "enc:v1:<iv>:<tag>:<cipher>" (base64).`,
  }),
  DECRYPT_FAIL: (reason) => ({
    he: `שגיאת פענוח: ${reason}`,
    en: `Decryption failure: ${reason}`,
  }),
};

/**
 * Build a bilingual Error with a stable .code and both HE/EN messages.
 * @param {string} code
 * @param {{he:string, en:string}} bilingual
 * @returns {Error}
 */
function bilingualError(code, bilingual) {
  const err = new Error(`[${code}] ${bilingual.en} | ${bilingual.he}`);
  err.code = code;
  err.message_en = bilingual.en;
  err.message_he = bilingual.he;
  return err;
}

// ───────────────────────────────────────────────────────────────────
//  Dot-notation helpers (get / set / has / delete / walk)
// ───────────────────────────────────────────────────────────────────

/**
 * Split a dot-notation key into segments. Supports escaped dots: "a\\.b.c".
 * @param {string} key
 * @returns {string[]}
 */
function splitKey(key) {
  if (typeof key !== 'string') return [];
  const out = [];
  let buf = '';
  for (let i = 0; i < key.length; i++) {
    const ch = key[i];
    if (ch === '\\' && key[i + 1] === '.') {
      buf += '.';
      i++;
    } else if (ch === '.') {
      out.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  out.push(buf);
  return out.filter((s) => s.length > 0);
}

function dotGet(obj, key, fallback) {
  if (obj == null) return fallback;
  const parts = splitKey(key);
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return fallback;
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return fallback;
    cur = cur[p];
  }
  return cur === undefined ? fallback : cur;
}

function dotSet(obj, key, value) {
  const parts = splitKey(key);
  if (parts.length === 0) return obj;
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object' || Array.isArray(cur[p])) {
      cur[p] = {};
    }
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

function dotHas(obj, key) {
  if (obj == null) return false;
  const parts = splitKey(key);
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return false;
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return false;
    cur = cur[p];
  }
  return true;
}

/** Flatten a nested object into { "a.b.c": value } pairs. */
function flatten(obj, prefix = '', out = {}) {
  if (obj == null || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) out[prefix] = obj;
    return out;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0 && prefix) {
    out[prefix] = obj;
    return out;
  }
  for (const k of keys) {
    const next = prefix ? `${prefix}.${k.replace(/\./g, '\\.')}` : k.replace(/\./g, '\\.');
    flatten(obj[k], next, out);
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────
//  Deep merge — "לא מוחקים רק משדרגים ומגדלים"
//  Later sources overlay earlier ones. Objects deep-merge; scalars
//  and arrays replace.
// ───────────────────────────────────────────────────────────────────

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v) &&
    (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
}

function deepMerge(target, source) {
  if (!isPlainObject(target)) return deepClone(source);
  if (!isPlainObject(source)) return deepClone(source);
  const out = { ...target };
  for (const k of Object.keys(source)) {
    const sv = source[k];
    const tv = out[k];
    if (isPlainObject(sv) && isPlainObject(tv)) {
      out[k] = deepMerge(tv, sv);
    } else {
      out[k] = deepClone(sv);
    }
  }
  return out;
}

function deepClone(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(deepClone);
  if (v instanceof Date) return new Date(v.getTime());
  const out = {};
  for (const k of Object.keys(v)) out[k] = deepClone(v[k]);
  return out;
}

// ───────────────────────────────────────────────────────────────────
//  Type coercion from strings (env vars, .env files, query strings)
// ───────────────────────────────────────────────────────────────────

/**
 * Coerce a string to a native JS type when it looks like one.
 *  - "true"/"false"   → boolean
 *  - "null"           → null
 *  - "123" / "-1.5"   → number
 *  - "[1,2]"/"{"a":1}"→ parsed JSON
 *  - "a,b,c"          → array<string> (opt-in; only when explicit arraySep is set)
 *  - otherwise        → original string
 *
 * @param {string} raw
 * @param {{arraySep?:string}} [opts]
 */
function coerce(raw, opts = {}) {
  if (typeof raw !== 'string') return raw;
  const s = raw.trim();
  if (s === '') return '';
  const lower = s.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  if (lower === 'null') return null;
  if (lower === 'undefined') return undefined;
  // number (integer or float, optional sign, no leading zeros except "0.x")
  if (/^-?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  // JSON object/array
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      return JSON.parse(s);
    } catch {
      /* fall through */
    }
  }
  if (opts.arraySep && s.includes(opts.arraySep)) {
    return s.split(opts.arraySep).map((x) => x.trim());
  }
  return s;
}

/**
 * Coerce a value to match a schema-declared type. Unknown types pass through.
 */
function coerceToType(value, type) {
  if (value === null || value === undefined) return value;
  switch (type) {
    case 'string':
      return typeof value === 'string' ? value : String(value);
    case 'number':
    case 'integer': {
      if (typeof value === 'number') {
        return type === 'integer' ? Math.trunc(value) : value;
      }
      if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        if (Number.isFinite(n)) return type === 'integer' ? Math.trunc(n) : n;
      }
      return value;
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const l = value.toLowerCase().trim();
        if (l === 'true' || l === '1' || l === 'yes' || l === 'on') return true;
        if (l === 'false' || l === '0' || l === 'no' || l === 'off') return false;
      }
      if (typeof value === 'number') return value !== 0;
      return value;
    }
    case 'array':
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const p = JSON.parse(value);
          if (Array.isArray(p)) return p;
        } catch {
          /* noop */
        }
        return value.split(',').map((s) => s.trim());
      }
      return value;
    case 'object':
      if (isPlainObject(value)) return value;
      if (typeof value === 'string') {
        try {
          const p = JSON.parse(value);
          if (isPlainObject(p)) return p;
        } catch {
          /* noop */
        }
      }
      return value;
    default:
      return value;
  }
}

// ───────────────────────────────────────────────────────────────────
//  .env parser (minimal but tolerant)
// ───────────────────────────────────────────────────────────────────

/**
 * Parse dotenv syntax:
 *   KEY=value
 *   KEY="quoted value with # hash"
 *   KEY='single quoted'
 *   # comments
 *   export KEY=foo
 * Returns a flat {key:string → value:string} map (NO coercion yet).
 */
function parseEnvFile(text) {
  const out = {};
  const lines = text.split(/\r?\n/);
  for (let raw of lines) {
    if (!raw) continue;
    // strip BOM
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let l = line;
    if (l.startsWith('export ')) l = l.slice(7).trim();
    const eq = l.indexOf('=');
    if (eq <= 0) continue;
    const key = l.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(key)) continue;
    let val = l.slice(eq + 1).trim();
    // quoted values keep everything inside the quotes literally
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      // strip trailing inline comment (only when unquoted)
      const hashIdx = val.indexOf(' #');
      if (hashIdx >= 0) val = val.slice(0, hashIdx).trimEnd();
    }
    out[key] = val;
  }
  return out;
}

/**
 * Convert a flat env-style map into a nested object using dot-notation.
 * By convention: "SERVER__PORT" and "SERVER.PORT" both map to server.port
 * when lowercase normalization is enabled. We keep the original case by
 * default to avoid surprises for mixed-case projects.
 */
function envMapToNested(flat, { separator = '__', lowerCase = false } = {}) {
  const out = {};
  for (const [k, v] of Object.entries(flat)) {
    const normalizedKey = (lowerCase ? k.toLowerCase() : k).replace(
      new RegExp(separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      '.'
    );
    dotSet(out, normalizedKey, coerce(v));
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────
//  Minimal YAML parser
//  Supports:
//    - scalars: strings, numbers, booleans, null
//    - nested maps via indentation (2-space or 4-space, consistent)
//    - sequences of scalars or inline objects
//    - # comments, blank lines
//    - "key: value" and "key:" + indented child
//    - flow style: {a: 1, b: 2} and [1, 2, 3]
//    - quoted strings with # safely inside
//  NOT supported (document in report):
//    - anchors/aliases, tags, multi-line folded/literal blocks (> |),
//      explicit documents (---), complex keys.
// ───────────────────────────────────────────────────────────────────

function parseYaml(text) {
  if (typeof text !== 'string') {
    throw bilingualError('YAML_PARSE', ERR.YAML_PARSE('input is not a string', 0));
  }
  const rawLines = text.split(/\r?\n/);

  // Strip BOM & comments, preserve indentation
  const lines = [];
  for (let i = 0; i < rawLines.length; i++) {
    let ln = rawLines[i];
    if (i === 0 && ln.charCodeAt(0) === 0xfeff) ln = ln.slice(1);
    // Skip comment-only lines / blank
    const trimmed = ln.trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      lines.push({ indent: 0, body: null, lineNo: i + 1 });
      continue;
    }
    // Strip trailing comment only when outside quotes
    const body = stripYamlComment(ln.replace(/\t/g, '  '));
    const indent = body.length - body.replace(/^ +/, '').length;
    lines.push({ indent, body: body.slice(indent), lineNo: i + 1 });
  }

  // parse block starting at idx with given min indent
  function parseBlock(startIdx, parentIndent) {
    let i = startIdx;
    // determine first non-null line to know container type
    let firstLine = null;
    while (i < lines.length && lines[i].body === null) i++;
    if (i >= lines.length) return { value: null, next: i };
    firstLine = lines[i];
    const indent = firstLine.indent;
    if (indent < parentIndent) return { value: null, next: startIdx };

    // Sequence container
    if (firstLine.body.startsWith('- ') || firstLine.body === '-') {
      const arr = [];
      while (i < lines.length) {
        const ln = lines[i];
        if (ln.body === null) { i++; continue; }
        if (ln.indent < indent) break;
        if (ln.indent > indent) break;
        if (!(ln.body.startsWith('- ') || ln.body === '-')) break;
        const rest = ln.body === '-' ? '' : ln.body.slice(2).trim();
        if (rest === '') {
          // nested block under this dash
          const { value, next } = parseBlock(i + 1, indent + 1);
          arr.push(value);
          i = next;
        } else if (rest.includes(':') && !looksLikeFlow(rest)) {
          // inline map start: "- key: val"
          // Treat as a map whose first key/value is `rest`, then any
          // deeper-indented lines belong to that map.
          const mapLine = { indent: indent + 2, body: rest, lineNo: ln.lineNo };
          // temporarily inject it so block parser sees a map at indent+2
          lines.splice(i + 1, 0, mapLine);
          const { value, next } = parseBlock(i + 1, indent + 2);
          arr.push(value);
          i = next;
        } else {
          arr.push(parseScalar(rest));
          i++;
        }
      }
      return { value: arr, next: i };
    }

    // Mapping container
    const obj = {};
    while (i < lines.length) {
      const ln = lines[i];
      if (ln.body === null) { i++; continue; }
      if (ln.indent < indent) break;
      if (ln.indent > indent) break;
      if (ln.body.startsWith('- ')) break; // sequence sibling
      const colon = findUnquotedColon(ln.body);
      if (colon < 0) {
        throw bilingualError('YAML_PARSE', ERR.YAML_PARSE(`expected "key: value": ${ln.body}`, ln.lineNo));
      }
      const key = unquoteYamlKey(ln.body.slice(0, colon).trim());
      const rest = ln.body.slice(colon + 1).trim();
      if (rest === '') {
        // child block
        const { value, next } = parseBlock(i + 1, indent + 1);
        obj[key] = value === null ? {} : value;
        i = next;
      } else {
        obj[key] = parseScalar(rest);
        i++;
      }
    }
    return { value: obj, next: i };
  }

  try {
    const { value } = parseBlock(0, 0);
    return value === null ? {} : value;
  } catch (e) {
    if (e && e.code === 'YAML_PARSE') throw e;
    throw bilingualError('YAML_PARSE', ERR.YAML_PARSE(e.message, 0));
  }
}

function stripYamlComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && (inSingle || inDouble)) { i++; continue; }
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      // must be preceded by whitespace or be at start
      if (i === 0 || /\s/.test(line[i - 1])) return line.slice(0, i).trimEnd();
    }
  }
  return line;
}

function findUnquotedColon(s) {
  let inSingle = false;
  let inDouble = false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && (inSingle || inDouble)) { i++; continue; }
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
      else if (ch === ':' && depth === 0) {
        // key: value requires space after colon OR end of line
        if (i + 1 >= s.length || /\s/.test(s[i + 1])) return i;
      }
    }
  }
  return -1;
}

function looksLikeFlow(s) {
  return (s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'));
}

function unquoteYamlKey(k) {
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    return k.slice(1, -1);
  }
  return k;
}

function parseScalar(raw) {
  const s = raw.trim();
  if (s === '' || s === '~' || s.toLowerCase() === 'null') return null;
  if (s.toLowerCase() === 'true') return true;
  if (s.toLowerCase() === 'false') return false;
  // flow map / array
  if (s.startsWith('{') && s.endsWith('}')) return parseFlowMap(s);
  if (s.startsWith('[') && s.endsWith(']')) return parseFlowSeq(s);
  // quoted
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  }
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  // number
  if (/^-?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return s;
}

function parseFlowMap(s) {
  const body = s.slice(1, -1).trim();
  if (!body) return {};
  const parts = splitTopLevelCommas(body);
  const out = {};
  for (const part of parts) {
    const colon = findUnquotedColon(part);
    if (colon < 0) continue;
    const k = unquoteYamlKey(part.slice(0, colon).trim());
    const v = parseScalar(part.slice(colon + 1).trim());
    out[k] = v;
  }
  return out;
}

function parseFlowSeq(s) {
  const body = s.slice(1, -1).trim();
  if (!body) return [];
  return splitTopLevelCommas(body).map(parseScalar);
}

function splitTopLevelCommas(s) {
  const out = [];
  let buf = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\' && (inSingle || inDouble)) { buf += ch + (s[++i] || ''); continue; }
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    if (!inSingle && !inDouble) {
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth--;
      else if (ch === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

// ───────────────────────────────────────────────────────────────────
//  Schema-lite validator
//
//  Schema shape (flat, dot-notation keys):
//    {
//      'server.port':    { type:'number',  required:true,  min:1, max:65535, default:3100 },
//      'server.host':    { type:'string',  required:false, default:'0.0.0.0',
//                          minLength:1, maxLength:255, pattern:'^[a-z0-9.-]+$' },
//      'logging.level':  { type:'string',  enum:['debug','info','warn','error'] },
//      'features':       { type:'array' },
//      'database':       { type:'object' },
//      'database.password': { type:'string', required:true, secret:true },
//    }
//
//  Validation result:
//    { valid:true/false, errors:[{path, rule, message_en, message_he}...],
//      warnings:[...] }
//
//  This validator:
//    - fills defaults (non-destructive, "לא מוחקים רק משדרגים")
//    - coerces types from strings
//    - reports ALL errors (not fail-fast)
// ───────────────────────────────────────────────────────────────────

function validateSchema(data, schema) {
  const errors = [];
  const warnings = [];
  // Work on a shallow clone we can mutate.
  const out = deepClone(data) || {};

  for (const [key, rule] of Object.entries(schema || {})) {
    const hasVal = dotHas(out, key);
    let val = dotGet(out, key);

    if (!hasVal || val === undefined || val === null) {
      if (rule.default !== undefined) {
        dotSet(out, key, deepClone(rule.default));
        val = rule.default;
      } else if (rule.required) {
        errors.push({
          path: key,
          rule: 'required',
          ...ERR.SCHEMA_REQUIRED(key),
        });
        continue;
      } else {
        continue;
      }
    }

    // Coerce type
    if (rule.type) {
      const coerced = coerceToType(val, rule.type);
      if (coerced !== val) {
        dotSet(out, key, coerced);
        val = coerced;
      }
      const actualType = detectType(val);
      if (!typeMatches(val, rule.type)) {
        errors.push({
          path: key,
          rule: 'type',
          ...ERR.SCHEMA_TYPE(key, rule.type, actualType),
        });
        continue;
      }
    }

    if ((rule.type === 'number' || rule.type === 'integer') && typeof val === 'number') {
      if (rule.min !== undefined && val < rule.min) {
        errors.push({ path: key, rule: 'min', ...ERR.SCHEMA_MIN(key, rule.min, val) });
      }
      if (rule.max !== undefined && val > rule.max) {
        errors.push({ path: key, rule: 'max', ...ERR.SCHEMA_MAX(key, rule.max, val) });
      }
    }

    if (rule.type === 'string' && typeof val === 'string') {
      if (rule.minLength !== undefined && val.length < rule.minLength) {
        errors.push({
          path: key, rule: 'minLength', ...ERR.SCHEMA_LEN_MIN(key, rule.minLength, val.length),
        });
      }
      if (rule.maxLength !== undefined && val.length > rule.maxLength) {
        errors.push({
          path: key, rule: 'maxLength', ...ERR.SCHEMA_LEN_MAX(key, rule.maxLength, val.length),
        });
      }
      if (rule.pattern) {
        const re = rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern);
        if (!re.test(val)) {
          errors.push({
            path: key, rule: 'pattern', ...ERR.SCHEMA_PATTERN(key, String(re), val),
          });
        }
      }
    }

    if (Array.isArray(rule.enum) && rule.enum.length > 0) {
      if (!rule.enum.includes(val)) {
        errors.push({ path: key, rule: 'enum', ...ERR.SCHEMA_ENUM(key, rule.enum, val) });
      }
    }

    if (typeof rule.validator === 'function') {
      try {
        const res = rule.validator(val, key, out);
        if (res === false) {
          errors.push({
            path: key, rule: 'validator',
            en: `Custom validator rejected value at "${key}"`,
            he: `ולידציה מותאמת דחתה ערך בשדה "${key}"`,
          });
        } else if (res && typeof res === 'object' && res.ok === false) {
          errors.push({
            path: key, rule: 'validator',
            en: res.en || `Custom validator rejected value at "${key}"`,
            he: res.he || `ולידציה מותאמת דחתה ערך בשדה "${key}"`,
          });
        }
      } catch (e) {
        errors.push({
          path: key, rule: 'validator',
          en: `Validator threw for "${key}": ${e.message}`,
          he: `ולידציה מותאמת נכשלה בשדה "${key}": ${e.message}`,
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings, data: out };
}

function detectType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function typeMatches(v, expected) {
  const actual = detectType(v);
  if (expected === 'number' && (actual === 'number' || actual === 'integer')) return true;
  if (expected === 'integer' && actual === 'integer') return true;
  if (expected === 'object' && isPlainObject(v)) return true;
  return actual === expected;
}

// ───────────────────────────────────────────────────────────────────
//  Encryption — AES-256-GCM via node:crypto
//
//  Wire format (printable):
//      enc:v1:<iv-b64>:<tag-b64>:<cipher-b64>
//  Key source: CONFIG_ENCRYPTION_KEY environment variable.
//    - 64-char hex → 32 bytes
//    - 44-char base64 → 32 bytes
//    - otherwise hashed to 32 bytes with SHA-256 (warn-only)
// ───────────────────────────────────────────────────────────────────

const ENC_PREFIX = 'enc:v1:';

function resolveEncryptionKey(raw) {
  if (!raw || typeof raw !== 'string') {
    throw bilingualError('ENCRYPT_NO_KEY', ERR.ENCRYPT_NO_KEY());
  }
  // hex
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  // base64 (strict: 44 chars ending =)
  if (/^[A-Za-z0-9+/=]{43,44}$/.test(raw)) {
    try {
      const buf = Buffer.from(raw, 'base64');
      if (buf.length === 32) return buf;
    } catch {
      /* fall through */
    }
  }
  // passphrase → SHA-256 hash (warn but accept so devs can get started)
  const buf = crypto.createHash('sha256').update(raw, 'utf8').digest();
  return buf;
}

function encryptValue(plaintext, keyRaw) {
  const key = resolveEncryptionKey(keyRaw);
  if (key.length !== 32) {
    throw bilingualError('ENCRYPT_BAD_KEY', ERR.ENCRYPT_BAD_KEY(key.length));
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const s = typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext);
  const ct = Buffer.concat([cipher.update(s, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + iv.toString('base64') + ':' + tag.toString('base64') + ':' + ct.toString('base64');
}

function decryptValue(ciphertext, keyRaw) {
  if (typeof ciphertext !== 'string' || !ciphertext.startsWith(ENC_PREFIX)) {
    throw bilingualError('DECRYPT_BAD_INPUT', ERR.DECRYPT_BAD_INPUT());
  }
  const rest = ciphertext.slice(ENC_PREFIX.length);
  const parts = rest.split(':');
  if (parts.length !== 3) {
    throw bilingualError('DECRYPT_BAD_INPUT', ERR.DECRYPT_BAD_INPUT());
  }
  const key = resolveEncryptionKey(keyRaw);
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const ct = Buffer.from(parts[2], 'base64');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  } catch (e) {
    throw bilingualError('DECRYPT_FAIL', ERR.DECRYPT_FAIL(e.message));
  }
}

function isEncrypted(v) {
  return typeof v === 'string' && v.startsWith(ENC_PREFIX);
}

// ───────────────────────────────────────────────────────────────────
//  Secret / PII redaction heuristics for dump()
// ───────────────────────────────────────────────────────────────────

const SECRET_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /client[_-]?secret/i,
  /authorization/i,
  /cookie/i,
  /session[_-]?id/i,
  /access[_-]?key/i,
  /credit[_-]?card/i,
  /^cc[_-]?num/i,
  /cvv/i,
  /iban/i,
];

function looksLikeSecretKey(key) {
  const leaf = String(key).split('.').pop();
  return SECRET_KEY_PATTERNS.some((re) => re.test(leaf));
}

function redactValue(v) {
  if (v === null || v === undefined) return v;
  if (typeof v === 'string') {
    if (v.length === 0) return v;
    if (v.length <= 4) return '***';
    return v.slice(0, 2) + '***' + v.slice(-2);
  }
  return '***';
}

function redactTree(obj, schema, path = '') {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((v, i) => redactTree(v, schema, `${path}[${i}]`));
  const out = {};
  for (const k of Object.keys(obj)) {
    const p = path ? `${path}.${k}` : k;
    const rule = schema && schema[p];
    const isSecret = (rule && rule.secret === true) ||
      looksLikeSecretKey(k) || isEncrypted(obj[k]);
    if (isSecret) {
      out[k] = redactValue(obj[k]);
    } else {
      out[k] = redactTree(obj[k], schema, p);
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────
//  Remote HTTP fetch (node built-ins only, no axios)
// ───────────────────────────────────────────────────────────────────

function fetchRemote(url, { timeoutMs = 10_000, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url);
      const client = u.protocol === 'https:' ? https : http;
      const req = client.request(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + (u.search || ''),
          method: 'GET',
          headers: { 'User-Agent': 'onyx-config-manager/1.0', ...headers },
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ body, headers: res.headers, statusCode: res.statusCode });
            } else {
              reject(bilingualError('REMOTE_FAIL', ERR.REMOTE_FAIL(url, res.statusCode)));
            }
          });
        }
      );
      req.on('error', (e) =>
        reject(bilingualError('REMOTE_FAIL', ERR.REMOTE_FAIL(url, e.message)))
      );
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(bilingualError('REMOTE_TIMEOUT', ERR.REMOTE_TIMEOUT(url)));
      });
      req.end();
    } catch (e) {
      reject(bilingualError('REMOTE_FAIL', ERR.REMOTE_FAIL(url, e.message)));
    }
  });
}

// ───────────────────────────────────────────────────────────────────
//  ConfigManager
// ───────────────────────────────────────────────────────────────────

class ConfigManager extends EventEmitter {
  constructor(opts = {}) {
    super();
    /** @type {object} merged config tree */
    this._data = {};
    /** @type {Array<SourceSpec>} */
    this._sources = [];
    /** @type {object|null} */
    this._schema = null;
    /** @type {Array<fs.FSWatcher>} */
    this._fsWatchers = [];
    /** @type {Array<NodeJS.Timeout>} */
    this._pollers = [];
    /** @type {Set<Function>} */
    this._watchCallbacks = new Set();
    this._env = opts.env || process.env;
    this._encryptionKey = opts.encryptionKey || null; // falls back to env CONFIG_ENCRYPTION_KEY
    this._debounceMs = opts.debounceMs ?? 150;
    this._reloadTimer = null;
    this._loaded = false;
  }

  // ─────────────────────────────────────────────────────────────
  //  Load sources
  // ─────────────────────────────────────────────────────────────

  /**
   * Load all configured sources (last wins, deep-merge).
   * Sources: { type:'env', prefix?, separator?, lowerCase? }
   *          { type:'file', path, optional?, format? }
   *          { type:'remote', url, pollMs?, headers?, format? }
   *          { type:'inline', data }
   *
   * @param {{sources?:Array, schema?:object}} options
   * @returns {Promise<ConfigManager>}
   */
  async load(options = {}) {
    const { sources = [], schema } = options;
    this._sources = sources.slice();
    if (schema) this._schema = schema;

    let merged = this._data && Object.keys(this._data).length > 0 ? deepClone(this._data) : {};
    for (const src of sources) {
      const data = await this._loadSource(src);
      if (data == null) continue;
      merged = deepMerge(merged, data);
    }

    this._data = merged;

    if (this._schema) {
      const res = validateSchema(this._data, this._schema);
      this._data = res.data;
      if (!res.valid) {
        const e = new Error(
          '[CONFIG_VALIDATION] Config validation failed | ולידציית תצורה נכשלה\n' +
            res.errors.map((er) => `  - ${er.path}: ${er.en} | ${er.he}`).join('\n')
        );
        e.code = 'CONFIG_VALIDATION';
        e.errors = res.errors;
        throw e;
      }
    }

    this._loaded = true;
    this.emit('loaded', this._data);
    return this;
  }

  async _loadSource(src) {
    if (!src || typeof src !== 'object') return null;
    switch (src.type) {
      case 'env': {
        const prefix = src.prefix || '';
        const separator = src.separator || '__';
        const lowerCase = src.lowerCase !== false; // default true for env
        const flat = {};
        for (const [k, v] of Object.entries(this._env)) {
          if (prefix && !k.startsWith(prefix)) continue;
          const stripped = prefix ? k.slice(prefix.length) : k;
          flat[stripped] = v;
        }
        return envMapToNested(flat, { separator, lowerCase });
      }
      case 'file': {
        const p = path.resolve(src.path);
        if (!fs.existsSync(p)) {
          if (src.optional) return null;
          throw bilingualError('FILE_NOT_FOUND', ERR.FILE_NOT_FOUND(p));
        }
        let text;
        try {
          text = fs.readFileSync(p, 'utf8');
        } catch (e) {
          throw bilingualError('FILE_UNREADABLE', ERR.FILE_UNREADABLE(p, e.message));
        }
        const fmt = src.format || detectFormat(p);
        return parseText(text, fmt, p);
      }
      case 'remote': {
        const res = await fetchRemote(src.url, {
          headers: src.headers,
          timeoutMs: src.timeoutMs,
        });
        const fmt = src.format || detectFormatFromContentType(res.headers['content-type']) ||
          detectFormat(src.url);
        return parseText(res.body, fmt, src.url);
      }
      case 'inline':
        return deepClone(src.data || {});
      default:
        throw bilingualError('SOURCE_UNKNOWN', ERR.SOURCE_UNKNOWN(src.type));
    }
  }

  // ─────────────────────────────────────────────────────────────
  //  Accessors
  // ─────────────────────────────────────────────────────────────

  get(key, defaultValue) {
    if (key === undefined || key === '') return deepClone(this._data);
    const v = dotGet(this._data, key, undefined);
    if (v === undefined) return defaultValue;
    // Auto-decrypt transparently IF caller has an encryption key configured
    // and the value is a ciphertext.
    if (isEncrypted(v) && this._getEncryptionKey(true)) {
      try {
        return decryptValue(v, this._getEncryptionKey());
      } catch {
        return v;
      }
    }
    return v;
  }

  /** Raw get — never auto-decrypts. */
  getRaw(key, defaultValue) {
    if (key === undefined || key === '') return deepClone(this._data);
    const v = dotGet(this._data, key, undefined);
    return v === undefined ? defaultValue : v;
  }

  set(key, value) {
    dotSet(this._data, key, value);
    this.emit('set', key, value);
    return this;
  }

  has(key) {
    return dotHas(this._data, key);
  }

  keys() {
    return Object.keys(flatten(this._data));
  }

  toJSON() {
    return deepClone(this._data);
  }

  // ─────────────────────────────────────────────────────────────
  //  Schema validation
  // ─────────────────────────────────────────────────────────────

  validate(schema) {
    const s = schema || this._schema;
    if (!s) return { valid: true, errors: [], warnings: [], data: this._data };
    const res = validateSchema(this._data, s);
    // Even on failure, keep coerced defaults — "לא מוחקים רק משדרגים"
    this._data = res.data;
    return res;
  }

  // ─────────────────────────────────────────────────────────────
  //  Hot-reload
  // ─────────────────────────────────────────────────────────────

  /**
   * Register a callback and start watching all file/remote sources.
   * Callback signature: (newConfig, {changed, added, removed, source})
   * @param {Function} callback
   * @returns {Function} unwatch handle
   */
  watch(callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('watch() requires a function callback');
    }
    this._watchCallbacks.add(callback);
    // lazy-start watchers the first time
    if (this._fsWatchers.length === 0 && this._pollers.length === 0) {
      this._startWatchers();
    }
    return () => this.unwatch(callback);
  }

  unwatch(callback) {
    if (callback) {
      this._watchCallbacks.delete(callback);
    } else {
      this._watchCallbacks.clear();
    }
    if (this._watchCallbacks.size === 0) {
      this._stopWatchers();
    }
  }

  _startWatchers() {
    for (const src of this._sources) {
      if (src.type === 'file') {
        try {
          const p = path.resolve(src.path);
          if (!fs.existsSync(p)) continue;
          const w = fs.watch(p, { persistent: false }, () => this._scheduleReload(src));
          w.on('error', () => { /* swallow — file may be recreated */ });
          this._fsWatchers.push(w);
        } catch {
          /* ignore */
        }
      } else if (src.type === 'remote' && src.pollMs && src.pollMs > 0) {
        const t = setInterval(() => this._scheduleReload(src), src.pollMs);
        if (typeof t.unref === 'function') t.unref();
        this._pollers.push(t);
      }
    }
  }

  _stopWatchers() {
    for (const w of this._fsWatchers) {
      try { w.close(); } catch { /* noop */ }
    }
    this._fsWatchers = [];
    for (const t of this._pollers) clearInterval(t);
    this._pollers = [];
    if (this._reloadTimer) {
      clearTimeout(this._reloadTimer);
      this._reloadTimer = null;
    }
  }

  _scheduleReload(source) {
    if (this._reloadTimer) clearTimeout(this._reloadTimer);
    this._reloadTimer = setTimeout(() => {
      this._reloadTimer = null;
      this._reload(source).catch((e) => this.emit('error', e));
    }, this._debounceMs);
    if (typeof this._reloadTimer.unref === 'function') this._reloadTimer.unref();
  }

  async _reload(triggerSource) {
    const before = deepClone(this._data);
    // Re-run the full load pipeline so precedence is preserved.
    let merged = {};
    for (const src of this._sources) {
      try {
        const data = await this._loadSource(src);
        if (data != null) merged = deepMerge(merged, data);
      } catch (e) {
        this.emit('error', e);
      }
    }
    if (this._schema) {
      const res = validateSchema(merged, this._schema);
      merged = res.data;
      if (!res.valid) this.emit('validation-error', res.errors);
    }
    this._data = merged;
    const delta = this.diff(before);
    for (const cb of this._watchCallbacks) {
      try {
        cb(this._data, { ...delta, source: triggerSource });
      } catch (e) {
        this.emit('error', e);
      }
    }
    this.emit('reload', this._data, delta);
  }

  // ─────────────────────────────────────────────────────────────
  //  Encryption helpers
  // ─────────────────────────────────────────────────────────────

  _getEncryptionKey(silent = false) {
    if (this._encryptionKey) return this._encryptionKey;
    const k = this._env.CONFIG_ENCRYPTION_KEY;
    if (!k && !silent) {
      throw bilingualError('ENCRYPT_NO_KEY', ERR.ENCRYPT_NO_KEY());
    }
    return k || null;
  }

  encrypt(value) {
    return encryptValue(value, this._getEncryptionKey());
  }

  decrypt(value) {
    return decryptValue(value, this._getEncryptionKey());
  }

  /**
   * Walk the tree, replacing any "enc:v1:..." values in place with their
   * plaintext. Non-mutating — returns a new tree.
   */
  decryptTree(obj = this._data) {
    const walk = (v) => {
      if (v === null || v === undefined) return v;
      if (Array.isArray(v)) return v.map(walk);
      if (isPlainObject(v)) {
        const out = {};
        for (const k of Object.keys(v)) out[k] = walk(v[k]);
        return out;
      }
      if (isEncrypted(v)) {
        try {
          return decryptValue(v, this._getEncryptionKey());
        } catch {
          return v;
        }
      }
      return v;
    };
    return walk(deepClone(obj));
  }

  // ─────────────────────────────────────────────────────────────
  //  Audit dump — redacted by default
  // ─────────────────────────────────────────────────────────────

  /**
   * Produce an audit-safe dump of the config tree.
   *  - redactSecrets:true (default) → mask password/secret/token/… + secret:true rules + any "enc:" values
   *  - redactSecrets:false           → returns a deep clone of the raw tree (CAUTION)
   *  - format:'object'|'json'|'flat' → output shape
   */
  dump({ redactSecrets = true, format = 'object' } = {}) {
    const tree = redactSecrets
      ? redactTree(this._data, this._schema || {}, '')
      : deepClone(this._data);
    if (format === 'flat') return flatten(tree);
    if (format === 'json') return JSON.stringify(tree, null, 2);
    return tree;
  }

  // ─────────────────────────────────────────────────────────────
  //  Diff
  // ─────────────────────────────────────────────────────────────

  /**
   * Report a delta between current config and `other` (plain object or
   * another ConfigManager).
   * @returns {{added:Array, removed:Array, changed:Array}}
   */
  diff(other) {
    const a = flatten(deepClone(this._data));
    const otherTree = other instanceof ConfigManager ? other.toJSON() :
      (isPlainObject(other) ? other : {});
    const b = flatten(deepClone(otherTree));
    const added = [];
    const removed = [];
    const changed = [];
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const inA = Object.prototype.hasOwnProperty.call(a, k);
      const inB = Object.prototype.hasOwnProperty.call(b, k);
      if (inA && !inB) {
        added.push({ key: k, value: a[k] });
      } else if (!inA && inB) {
        removed.push({ key: k, value: b[k] });
      } else if (inA && inB && !deepEqual(a[k], b[k])) {
        changed.push({ key: k, before: b[k], after: a[k] });
      }
    }
    return { added, removed, changed };
  }

  // ─────────────────────────────────────────────────────────────
  //  Lifecycle
  // ─────────────────────────────────────────────────────────────

  close() {
    this._stopWatchers();
    this.removeAllListeners();
    this._watchCallbacks.clear();
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!deepEqual(a[k], b[k])) return false;
  }
  return true;
}

// ───────────────────────────────────────────────────────────────────
//  File-format dispatch
// ───────────────────────────────────────────────────────────────────

function detectFormat(p) {
  const ext = path.extname(String(p)).toLowerCase();
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  if (ext === '.json') return 'json';
  if (ext === '.env' || path.basename(String(p)) === '.env') return 'env';
  return null;
}

function detectFormatFromContentType(ct) {
  if (!ct) return null;
  const c = String(ct).toLowerCase();
  if (c.includes('application/json')) return 'json';
  if (c.includes('yaml') || c.includes('x-yaml')) return 'yaml';
  return null;
}

function parseText(text, fmt, origin) {
  if (!fmt) {
    throw bilingualError('FILE_FORMAT_UNKNOWN', ERR.FILE_FORMAT_UNKNOWN(origin));
  }
  switch (fmt) {
    case 'json':
      try {
        return JSON.parse(text);
      } catch (e) {
        throw bilingualError('JSON_PARSE', ERR.JSON_PARSE(e.message));
      }
    case 'yaml':
      return parseYaml(text);
    case 'env':
      return envMapToNested(parseEnvFile(text), { separator: '__', lowerCase: true });
    default:
      throw bilingualError('FILE_FORMAT_UNKNOWN', ERR.FILE_FORMAT_UNKNOWN(origin));
  }
}

// ───────────────────────────────────────────────────────────────────
//  Exports
// ───────────────────────────────────────────────────────────────────

module.exports = {
  ConfigManager,
  // Internals exposed for tests / advanced use:
  _internal: {
    splitKey,
    dotGet,
    dotSet,
    dotHas,
    flatten,
    deepMerge,
    deepClone,
    deepEqual,
    coerce,
    coerceToType,
    parseEnvFile,
    envMapToNested,
    parseYaml,
    validateSchema,
    encryptValue,
    decryptValue,
    isEncrypted,
    redactTree,
    looksLikeSecretKey,
    detectFormat,
    parseText,
  },
};
