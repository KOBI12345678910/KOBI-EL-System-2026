/*
 * ═══════════════════════════════════════════════════════════════════════════
 * AG-X93 — Deploy Manifest Generator
 * Mega-ERP Techno-Kol Uzi  ·  "לא מוחקים רק משדרגים ומגדלים"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Zero-dependency Docker Compose & Kubernetes manifest generator.
 * Exports:
 *   - generateCompose(config)  => YAML string for docker-compose.prod.yml
 *   - generateK8s(config)      => Map<filename, YAML string> for k8s/*.yaml
 *   - getDefaultConfig()       => canonical default stack descriptor
 *   - yamlEmit(obj)            => minimal YAML emitter (scalars/seq/map)
 *   - yamlParse(str)           => minimal YAML parser (round-trip support)
 *
 * Design notes:
 *   - Generator is PURE (no fs, no process.env access at module-load time).
 *   - Comments in generated output are bilingual (EN + Hebrew).
 *   - Port matrix is the single source of truth across compose + k8s.
 *   - Every service gets healthcheck, probes, resource limits, security ctx,
 *     topology spread constraints, and anti-affinity.
 *
 * @module onyx-procurement/src/deploy/manifest-generator
 */

'use strict';

// ───────────────────────────────────────────────────────────────────────────
// Minimal YAML emitter / מחלץ YAML מינימלי
// ───────────────────────────────────────────────────────────────────────────
// Supports: scalars (string/number/boolean/null), sequences, mappings.
// Quoting rules:
//   - strings containing any of: `:`, `#`, `{`, `}`, `[`, `]`, `,`, `&`,
//     `*`, `!`, `|`, `>`, `'`, `"`, `%`, `@`, `\``, leading/trailing spaces,
//     or matching a YAML reserved token (yes/no/true/false/null/~/number)
//     are wrapped in double quotes with `\` and `"` escaped.
//   - otherwise emitted as plain scalars.
// ───────────────────────────────────────────────────────────────────────────

const YAML_RESERVED = new Set([
  'yes', 'no', 'true', 'false', 'null', '~', 'on', 'off',
  'Yes', 'No', 'True', 'False', 'Null', 'On', 'Off',
  'YES', 'NO', 'TRUE', 'FALSE', 'NULL', 'ON', 'OFF'
]);

/**
 * Determine whether a string needs to be quoted in YAML.
 * @param {string} s
 * @returns {boolean}
 */
function needsQuoting(s) {
  if (s === '') return true;
  if (YAML_RESERVED.has(s)) return true;
  // Numeric-looking strings must be quoted to prevent coercion.
  if (/^-?\d+(\.\d+)?$/.test(s)) return true;
  // Leading/trailing whitespace.
  if (/^\s|\s$/.test(s)) return true;
  // Starts with indicator character.
  if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(s)) return true;
  // Contains `: ` or ` #` (flow indicators) or newline.
  if (/:\s|\s#|[\n\r\t]/.test(s)) return true;
  return false;
}

/**
 * Quote a string for YAML output (double-quoted form).
 * @param {string} s
 * @returns {string}
 */
function quoteString(s) {
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

/**
 * Emit a scalar value.
 * @param {unknown} v
 * @returns {string}
 */
function emitScalar(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return quoteString(String(v));
    return String(v);
  }
  const s = String(v);
  return needsQuoting(s) ? quoteString(s) : s;
}

/**
 * Emit a value (scalar / array / object) with indentation.
 * @param {unknown} val
 * @param {number} indent
 * @returns {string}
 */
function emitValue(val, indent) {
  const pad = '  '.repeat(indent);
  if (val === null || val === undefined) return 'null\n';
  if (typeof val !== 'object') return emitScalar(val) + '\n';

  if (Array.isArray(val)) {
    if (val.length === 0) return '[]\n';
    let out = '\n';
    for (const item of val) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
        // Sequence of maps.
        const keys = Object.keys(item);
        if (keys.length === 0) {
          out += `${pad}- {}\n`;
          continue;
        }
        let first = true;
        for (const k of keys) {
          const v = item[k];
          const prefix = first ? `${pad}- ` : `${pad}  `;
          first = false;
          if (v !== null && typeof v === 'object') {
            if (Array.isArray(v) && v.length === 0) {
              out += `${prefix}${emitKey(k)}: []\n`;
            } else if (!Array.isArray(v) && Object.keys(v).length === 0) {
              out += `${prefix}${emitKey(k)}: {}\n`;
            } else {
              out += `${prefix}${emitKey(k)}:${emitValue(v, indent + 2)}`;
            }
          } else {
            out += `${prefix}${emitKey(k)}: ${emitScalar(v)}\n`;
          }
        }
      } else if (Array.isArray(item)) {
        out += `${pad}-${emitValue(item, indent + 1)}`;
      } else {
        out += `${pad}- ${emitScalar(item)}\n`;
      }
    }
    return out;
  }

  // Mapping
  const keys = Object.keys(val);
  if (keys.length === 0) return '{}\n';
  let out = '\n';
  for (const k of keys) {
    const v = val[k];
    if (v !== null && typeof v === 'object') {
      if (Array.isArray(v) && v.length === 0) {
        out += `${pad}${emitKey(k)}: []\n`;
      } else if (!Array.isArray(v) && Object.keys(v).length === 0) {
        out += `${pad}${emitKey(k)}: {}\n`;
      } else {
        out += `${pad}${emitKey(k)}:${emitValue(v, indent + 1)}`;
      }
    } else {
      out += `${pad}${emitKey(k)}: ${emitScalar(v)}\n`;
    }
  }
  return out;
}

/**
 * Emit a mapping key — usually plain, quoted only if unsafe.
 * @param {string} k
 * @returns {string}
 */
function emitKey(k) {
  const s = String(k);
  if (s === '') return '""';
  if (/[:#&*!|>'"%@`{}\[\],\s]/.test(s) || /^-/.test(s)) return quoteString(s);
  return s;
}

/**
 * Public YAML emitter — strips leading newline for a tidy doc.
 * @param {object} obj
 * @returns {string}
 */
function yamlEmit(obj) {
  const body = emitValue(obj, 0);
  return body.startsWith('\n') ? body.slice(1) : body;
}

// ───────────────────────────────────────────────────────────────────────────
// Minimal YAML parser / מפענח YAML מינימלי
// ───────────────────────────────────────────────────────────────────────────
// Supports the subset we emit: comments (#), mappings, sequences, scalars,
// quoted strings (single + double), nested indentation blocks, flow [] / {}.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Parse a YAML scalar literal (handles quoted forms and coercion).
 * @param {string} raw
 * @returns {unknown}
 */
function parseScalar(raw) {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;
  if (s === 'true' || s === 'True' || s === 'TRUE') return true;
  if (s === 'false' || s === 'False' || s === 'FALSE') return false;
  if (s[0] === '"' && s[s.length - 1] === '"') {
    return s.slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  if (s[0] === "'" && s[s.length - 1] === "'") {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  // Flow sequence
  if (s[0] === '[' && s[s.length - 1] === ']') {
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    return splitFlow(inner).map(parseScalar);
  }
  // Flow mapping
  if (s[0] === '{' && s[s.length - 1] === '}') {
    const inner = s.slice(1, -1).trim();
    if (inner === '') return {};
    const out = {};
    for (const pair of splitFlow(inner)) {
      const idx = pair.indexOf(':');
      if (idx < 0) continue;
      const k = pair.slice(0, idx).trim().replace(/^["']|["']$/g, '');
      const v = pair.slice(idx + 1).trim();
      out[k] = parseScalar(v);
    }
    return out;
  }
  return s;
}

/**
 * Split a flow-style inner string by commas, respecting brackets/quotes.
 * @param {string} s
 * @returns {string[]}
 */
function splitFlow(s) {
  const out = [];
  let depth = 0, cur = '', q = null;
  for (const ch of s) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") {
      cur += ch;
      q = ch;
    } else if (ch === '[' || ch === '{') {
      depth++;
      cur += ch;
    } else if (ch === ']' || ch === '}') {
      depth--;
      cur += ch;
    } else if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

/**
 * Strip a trailing comment from a line, respecting quotes.
 * @param {string} line
 * @returns {string}
 */
function stripComment(line) {
  let q = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === q && line[i - 1] !== '\\') q = null;
    } else if (c === '"' || c === "'") {
      q = c;
    } else if (c === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Public YAML parser for the subset we emit.
 * @param {string} text
 * @returns {unknown}
 */
function yamlParse(text) {
  const rawLines = text.split(/\r?\n/);
  const lines = [];
  for (const raw of rawLines) {
    const trimmedFull = raw.replace(/\s+$/, '');
    const noComment = stripComment(trimmedFull).replace(/\s+$/, '');
    if (noComment.trim() === '') continue;
    const indent = noComment.match(/^ */)[0].length;
    lines.push({ indent, content: noComment.slice(indent) });
  }

  function parseBlock(startIdx, baseIndent) {
    let i = startIdx;
    // Determine mode from first non-empty line at baseIndent
    if (i >= lines.length) return [null, i];
    const first = lines[i];
    if (first.indent < baseIndent) return [null, i];
    const isSeq = first.content.startsWith('- ') || first.content === '-';

    if (isSeq) {
      const arr = [];
      while (i < lines.length && lines[i].indent === baseIndent &&
             (lines[i].content.startsWith('- ') || lines[i].content === '-')) {
        const line = lines[i];
        const rest = line.content === '-' ? '' : line.content.slice(2);
        if (rest === '') {
          // Block follows at deeper indent
          i++;
          const [child, next] = parseBlock(i, baseIndent + 2);
          arr.push(child === null ? null : child);
          i = next;
        } else if (rest.includes(': ') || rest.endsWith(':')) {
          // Sequence of maps — parse starting at this line as if it were a map
          // with hanging indent.
          const mapStart = i;
          // Build a virtual map block: the dash line and subsequent lines at
          // indent + 2 belong to this element.
          const elem = {};
          // First key/value from `rest`
          consumeMapLine(rest, elem, baseIndent + 2, i, (obj, key, val) => {
            obj[key] = val;
          }, mapStart);
          // The function above is replaced by an inline parser below.
          // Simpler approach: re-tokenize starting from the current line
          // treating the dash as extra indent.
          arr.length = arr.length; // no-op
          arr.pop(); // discard placeholder in case it was added
          // Replace with inline parse:
          const [obj, next] = parseMapFromDashLine(i, baseIndent);
          arr.push(obj);
          i = next;
        } else {
          arr.push(parseScalar(rest));
          i++;
        }
      }
      return [arr, i];
    }

    // Mapping
    const map = {};
    while (i < lines.length && lines[i].indent === baseIndent) {
      const line = lines[i];
      if (line.content.startsWith('- ')) break;
      const colonIdx = findKeyColon(line.content);
      if (colonIdx < 0) { i++; continue; }
      const key = unquoteKey(line.content.slice(0, colonIdx));
      const rest = line.content.slice(colonIdx + 1).trim();
      i++;
      if (rest === '') {
        // Nested block
        if (i < lines.length && lines[i].indent > baseIndent) {
          const [child, next] = parseBlock(i, lines[i].indent);
          map[key] = child;
          i = next;
        } else {
          map[key] = null;
        }
      } else {
        map[key] = parseScalar(rest);
      }
    }
    return [map, i];
  }

  /**
   * Dummy closure variable used above (kept for compatibility, replaced by
   * parseMapFromDashLine which inlines the logic).
   */
  function consumeMapLine() { /* no-op placeholder */ }

  /**
   * Parse a mapping that begins on a "- key: value" line, where the dash
   * sits at `dashIndent` and the mapping body lives at `dashIndent + 2`.
   */
  function parseMapFromDashLine(startIdx, dashIndent) {
    const map = {};
    const bodyIndent = dashIndent + 2;
    // First line: "- key: value"
    const firstLine = lines[startIdx];
    const rest = firstLine.content.slice(2);
    const colonIdx = findKeyColon(rest);
    const firstKey = unquoteKey(rest.slice(0, colonIdx));
    const firstVal = rest.slice(colonIdx + 1).trim();
    let i = startIdx + 1;
    if (firstVal === '') {
      if (i < lines.length && lines[i].indent > bodyIndent) {
        const [child, next] = parseBlock(i, lines[i].indent);
        map[firstKey] = child;
        i = next;
      } else {
        map[firstKey] = null;
      }
    } else {
      map[firstKey] = parseScalar(firstVal);
    }
    // Subsequent map lines at bodyIndent
    while (i < lines.length && lines[i].indent === bodyIndent &&
           !lines[i].content.startsWith('- ')) {
      const ln = lines[i];
      const cIdx = findKeyColon(ln.content);
      if (cIdx < 0) { i++; continue; }
      const k = unquoteKey(ln.content.slice(0, cIdx));
      const v = ln.content.slice(cIdx + 1).trim();
      i++;
      if (v === '') {
        if (i < lines.length && lines[i].indent > bodyIndent) {
          const [child, next] = parseBlock(i, lines[i].indent);
          map[k] = child;
          i = next;
        } else {
          map[k] = null;
        }
      } else {
        map[k] = parseScalar(v);
      }
    }
    return [map, i];
  }

  /**
   * Find the colon that separates a mapping key, respecting quotes.
   */
  function findKeyColon(s) {
    let q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) {
        if (c === q) q = null;
      } else if (c === '"' || c === "'") {
        q = c;
      } else if (c === ':') {
        // Must be followed by space or end of line.
        if (i === s.length - 1 || s[i + 1] === ' ' || s[i + 1] === '\t') {
          return i;
        }
      }
    }
    return -1;
  }

  function unquoteKey(k) {
    const t = k.trim();
    if ((t[0] === '"' && t[t.length - 1] === '"') ||
        (t[0] === "'" && t[t.length - 1] === "'")) {
      return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    return t;
  }

  if (lines.length === 0) return null;
  const [root] = parseBlock(0, lines[0].indent);
  return root;
}

// ───────────────────────────────────────────────────────────────────────────
// Default configuration / תצורת ברירת מחדל
// ───────────────────────────────────────────────────────────────────────────
// Single source of truth for service ports, images, resource budgets.
// ───────────────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} ServiceDescriptor
 * @property {string} name            kebab-case service identifier
 * @property {string} image           container image reference
 * @property {number} [port]          primary TCP port (container side)
 * @property {number} [hostPort]      host-side port for compose
 * @property {string} [network]       "frontend" | "backend" | "both"
 * @property {boolean} [stateful]     requires persistent volume
 * @property {string} [healthPath]    HTTP path for probes
 * @property {Object} [resources]     {cpu, memory} requests & limits
 * @property {string[]} [volumes]     bind-mount specs "src:dst"
 * @property {Object} [env]           inline environment map
 * @property {boolean} [publishesEnv] emit envFrom for k8s
 */

/**
 * Return the canonical default configuration.
 * @returns {Object}
 */
function getDefaultConfig() {
  return {
    stackName: 'erp-2026-kobi-el',
    domain: 'erp.kobi-el.local',
    envFile: '.env',
    envExampleRef: '.env.example',
    namespace: 'erp-prod',
    registry: 'erp',
    imageTag: 'prod',
    replicas: {
      'onyx-procurement': 2,
      'techno-kol-ops': 2,
      'onyx-ai': 2,
      'payroll-autonomous': 2,
      'nginx': 2
    },
    services: [
      {
        name: 'postgres',
        image: 'postgres:16-alpine',
        port: 5432,
        hostPort: 5432,
        network: 'backend',
        stateful: true,
        volumes: ['./data/postgres:/var/lib/postgresql/data'],
        healthcheck: {
          test: 'pg_isready -U $$POSTGRES_USER -d $$POSTGRES_DB',
          interval: '10s',
          timeout: '5s',
          retries: 5,
          startPeriod: '20s'
        },
        resources: {
          requests: { cpu: '250m', memory: '512Mi' },
          limits: { cpu: '2000m', memory: '2Gi' }
        },
        envFrom: ['erp-secrets'],
        env: { PGDATA: '/var/lib/postgresql/data/pgdata' }
      },
      {
        name: 'redis',
        image: 'redis:7-alpine',
        port: 6379,
        hostPort: 6379,
        network: 'backend',
        stateful: true,
        volumes: ['./data/redis:/data'],
        command: ['redis-server', '--appendonly', 'yes', '--maxmemory', '512mb', '--maxmemory-policy', 'allkeys-lru'],
        healthcheck: {
          test: 'redis-cli ping',
          interval: '10s',
          timeout: '3s',
          retries: 5,
          startPeriod: '10s'
        },
        resources: {
          requests: { cpu: '100m', memory: '256Mi' },
          limits: { cpu: '500m', memory: '768Mi' }
        },
        envFrom: ['erp-secrets']
      },
      {
        name: 'onyx-procurement',
        image: 'erp/onyx-procurement:prod',
        port: 3100,
        hostPort: 3100,
        network: 'both',
        stateful: false,
        healthPath: '/health',
        dependsOn: ['postgres', 'redis'],
        resources: {
          requests: { cpu: '200m', memory: '384Mi' },
          limits: { cpu: '1500m', memory: '1.5Gi' }
        },
        envFrom: ['erp-config', 'erp-secrets'],
        volumes: ['./data/onyx-procurement:/app/data']
      },
      {
        name: 'techno-kol-ops',
        image: 'erp/techno-kol-ops:prod',
        port: 3200,
        hostPort: 3200,
        network: 'both',
        stateful: false,
        healthPath: '/health',
        dependsOn: ['postgres', 'redis'],
        resources: {
          requests: { cpu: '150m', memory: '256Mi' },
          limits: { cpu: '1000m', memory: '1Gi' }
        },
        envFrom: ['erp-config', 'erp-secrets'],
        volumes: ['./data/techno-kol-ops:/app/data']
      },
      {
        name: 'onyx-ai',
        image: 'erp/onyx-ai:prod',
        port: 3300,
        hostPort: 3300,
        network: 'both',
        stateful: false,
        healthPath: '/health',
        dependsOn: ['postgres', 'redis'],
        resources: {
          requests: { cpu: '200m', memory: '512Mi' },
          limits: { cpu: '2000m', memory: '2Gi' }
        },
        envFrom: ['erp-config', 'erp-secrets']
      },
      {
        name: 'payroll-autonomous',
        image: 'erp/payroll-autonomous:prod',
        port: 8080,
        hostPort: 5173,
        network: 'frontend',
        stateful: false,
        healthPath: '/',
        resources: {
          requests: { cpu: '50m', memory: '64Mi' },
          limits: { cpu: '250m', memory: '256Mi' }
        },
        envFrom: ['erp-config']
      },
      {
        name: 'nginx',
        image: 'nginx:1.27-alpine',
        port: 80,
        hostPort: 80,
        network: 'frontend',
        stateful: false,
        healthPath: '/healthz',
        dependsOn: ['onyx-procurement', 'techno-kol-ops', 'onyx-ai', 'payroll-autonomous'],
        volumes: ['./docker/nginx.conf:/etc/nginx/nginx.conf:ro'],
        resources: {
          requests: { cpu: '50m', memory: '64Mi' },
          limits: { cpu: '500m', memory: '256Mi' }
        }
      },
      {
        name: 'prometheus',
        image: 'prom/prometheus:v2.54.0',
        port: 9090,
        hostPort: 9090,
        network: 'backend',
        stateful: true,
        volumes: [
          './docker/prometheus.yml:/etc/prometheus/prometheus.yml:ro',
          './data/prometheus:/prometheus'
        ],
        healthPath: '/-/healthy',
        resources: {
          requests: { cpu: '100m', memory: '256Mi' },
          limits: { cpu: '500m', memory: '1Gi' }
        }
      },
      {
        name: 'grafana',
        image: 'grafana/grafana:11.2.0',
        port: 3000,
        hostPort: 3000,
        network: 'backend',
        stateful: true,
        volumes: ['./data/grafana:/var/lib/grafana'],
        healthPath: '/api/health',
        resources: {
          requests: { cpu: '100m', memory: '128Mi' },
          limits: { cpu: '500m', memory: '512Mi' }
        },
        env: { GF_SECURITY_ADMIN_USER: 'admin' }
      },
      {
        name: 'loki',
        image: 'grafana/loki:3.1.1',
        port: 3100,
        // Loki conflicts with onyx-procurement on 3100; expose on 3101 for host.
        hostPort: 3101,
        network: 'backend',
        stateful: true,
        volumes: [
          './docker/loki-config.yml:/etc/loki/local-config.yaml:ro',
          './data/loki:/loki'
        ],
        command: ['-config.file=/etc/loki/local-config.yaml'],
        healthPath: '/ready',
        resources: {
          requests: { cpu: '100m', memory: '256Mi' },
          limits: { cpu: '500m', memory: '768Mi' }
        }
      }
    ]
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Compose generator / מחולל Docker Compose
// ───────────────────────────────────────────────────────────────────────────

/**
 * Generate a docker-compose.prod.yml document.
 * @param {Object} config
 * @returns {string}
 */
function generateCompose(config) {
  const cfg = config || getDefaultConfig();
  const header =
    '# ═══════════════════════════════════════════════════════════════════════════\n' +
    '# ' + cfg.stackName + ' — Production Docker Compose\n' +
    '# Mega-ERP Techno-Kol Uzi  ·  "לא מוחקים רק משדרגים ומגדלים"\n' +
    '# Generated by onyx-procurement/src/deploy/manifest-generator.js (AG-X93)\n' +
    '# ═══════════════════════════════════════════════════════════════════════════\n' +
    '# EN: Full production stack with network segmentation, healthchecks,\n' +
    '#     resource limits, and bind-mount volumes.\n' +
    '# HE: מחסנית פרודקשן מלאה עם הפרדת רשתות, בדיקות תקינות,\n' +
    '#     מגבלות משאבים ונפחי קישור (bind-mounts).\n' +
    '# Env file reference / קובץ סביבה: ' + cfg.envExampleRef + '\n' +
    '# ═══════════════════════════════════════════════════════════════════════════\n\n';

  const doc = {
    name: cfg.stackName,
    services: {},
    networks: {
      frontend: {
        driver: 'bridge',
        name: cfg.stackName + '-frontend'
      },
      backend: {
        driver: 'bridge',
        internal: false,
        name: cfg.stackName + '-backend'
      }
    },
    volumes: {}
  };

  for (const svc of cfg.services) {
    const entry = {
      image: svc.image,
      container_name: cfg.stackName + '-' + svc.name,
      restart: 'unless-stopped',
      env_file: cfg.envFile
    };
    if (svc.command) entry.command = svc.command;
    if (svc.env) entry.environment = svc.env;
    if (svc.port) {
      entry.ports = [(svc.hostPort || svc.port) + ':' + svc.port];
    }
    if (svc.dependsOn && svc.dependsOn.length) {
      entry.depends_on = {};
      for (const dep of svc.dependsOn) {
        entry.depends_on[dep] = { condition: 'service_healthy' };
      }
    }
    if (svc.volumes && svc.volumes.length) {
      entry.volumes = svc.volumes;
      // Register named volumes if any are not bind-mounts (start with .)
      for (const v of svc.volumes) {
        const src = v.split(':')[0];
        if (!src.startsWith('.') && !src.startsWith('/')) {
          doc.volumes[src] = { driver: 'local' };
        }
      }
    }
    // Healthcheck
    if (svc.healthcheck) {
      entry.healthcheck = {
        test: Array.isArray(svc.healthcheck.test)
          ? svc.healthcheck.test
          : ['CMD-SHELL', svc.healthcheck.test],
        interval: svc.healthcheck.interval || '30s',
        timeout: svc.healthcheck.timeout || '10s',
        retries: svc.healthcheck.retries || 3,
        start_period: svc.healthcheck.startPeriod || '20s'
      };
    } else if (svc.healthPath) {
      entry.healthcheck = {
        test: ['CMD-SHELL', 'wget -q -O /dev/null http://localhost:' + svc.port + svc.healthPath + ' || exit 1'],
        interval: '30s',
        timeout: '10s',
        retries: 3,
        start_period: '20s'
      };
    }
    // Resources via deploy.resources (compose spec)
    if (svc.resources) {
      entry.deploy = {
        resources: {
          limits: {
            cpus: svc.resources.limits.cpu.endsWith('m')
              ? (parseInt(svc.resources.limits.cpu, 10) / 1000).toFixed(2)
              : svc.resources.limits.cpu,
            memory: svc.resources.limits.memory.replace('Mi', 'M').replace('Gi', 'G')
          },
          reservations: {
            cpus: svc.resources.requests.cpu.endsWith('m')
              ? (parseInt(svc.resources.requests.cpu, 10) / 1000).toFixed(2)
              : svc.resources.requests.cpu,
            memory: svc.resources.requests.memory.replace('Mi', 'M').replace('Gi', 'G')
          }
        },
        restart_policy: { condition: 'any', max_attempts: 5 }
      };
    }
    // Network segmentation
    const nets = [];
    if (svc.network === 'frontend' || svc.network === 'both') nets.push('frontend');
    if (svc.network === 'backend' || svc.network === 'both') nets.push('backend');
    if (nets.length) entry.networks = nets;
    // Security: drop privileges where possible
    entry.security_opt = ['no-new-privileges:true'];
    entry.read_only = svc.stateful ? false : false; // bind-mounts require writable layer
    doc.services[svc.name] = entry;
  }

  return header + yamlEmit(doc);
}

// ───────────────────────────────────────────────────────────────────────────
// Kubernetes generator / מחולל Kubernetes
// ───────────────────────────────────────────────────────────────────────────

/**
 * Generate full Kubernetes manifests, one YAML document per service.
 * @param {Object} config
 * @returns {Object<string, string>} map of filename => YAML document
 */
function generateK8s(config) {
  const cfg = config || getDefaultConfig();
  /** @type {Object<string, string>} */
  const out = {};

  // Namespace + shared ConfigMap + shared Secret placeholder.
  out['00-namespace.yaml'] = k8sHeader('namespace', cfg) +
    yamlEmit({
      apiVersion: 'v1',
      kind: 'Namespace',
      metadata: {
        name: cfg.namespace,
        labels: {
          'app.kubernetes.io/part-of': cfg.stackName,
          'pod-security.kubernetes.io/enforce': 'restricted'
        }
      }
    });

  out['01-configmap.yaml'] = k8sHeader('configmap', cfg) +
    yamlEmit({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'erp-config',
        namespace: cfg.namespace,
        labels: { 'app.kubernetes.io/part-of': cfg.stackName }
      },
      data: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        POSTGRES_HOST: 'postgres',
        POSTGRES_PORT: '5432',
        REDIS_HOST: 'redis',
        REDIS_PORT: '6379',
        STACK_NAME: cfg.stackName,
        DOMAIN: cfg.domain
      }
    });

  out['02-secret.yaml'] = k8sHeader('secret', cfg) +
    '# EN: Populate with `kubectl create secret ...` — do NOT commit real values.\n' +
    '# HE: למלא באמצעות kubectl create secret — אין לדחוף ערכים אמיתיים.\n' +
    '# Reference: ' + cfg.envExampleRef + '\n' +
    yamlEmit({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: 'erp-secrets',
        namespace: cfg.namespace,
        labels: { 'app.kubernetes.io/part-of': cfg.stackName }
      },
      type: 'Opaque',
      stringData: {
        POSTGRES_USER: 'erp',
        POSTGRES_PASSWORD: 'CHANGE_ME',
        POSTGRES_DB: 'erp_main',
        JWT_SECRET: 'CHANGE_ME',
        SESSION_SECRET: 'CHANGE_ME',
        API_KEY_ADMIN: 'CHANGE_ME',
        ANTHROPIC_API_KEY: 'CHANGE_ME',
        OPENAI_API_KEY: 'CHANGE_ME',
        SUPABASE_SERVICE_KEY: 'CHANGE_ME'
      }
    });

  // NetworkPolicy — default-deny + frontend/backend split
  out['03-networkpolicy.yaml'] = k8sHeader('networkpolicy', cfg) +
    yamlEmit({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'default-deny-all',
        namespace: cfg.namespace
      },
      spec: {
        podSelector: {},
        policyTypes: ['Ingress', 'Egress']
      }
    }) + '\n---\n' +
    yamlEmit({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'NetworkPolicy',
      metadata: {
        name: 'allow-backend-to-db',
        namespace: cfg.namespace
      },
      spec: {
        podSelector: {
          matchLabels: { tier: 'backend' }
        },
        policyTypes: ['Ingress', 'Egress'],
        ingress: [
          {
            from: [
              { podSelector: { matchLabels: { tier: 'backend' } } },
              { podSelector: { matchLabels: { tier: 'frontend' } } }
            ]
          }
        ],
        egress: [
          { to: [{ podSelector: { matchLabels: { tier: 'backend' } } }] },
          { to: [{ namespaceSelector: { matchLabels: { name: 'kube-system' } } }] }
        ]
      }
    });

  // Per-service manifests
  let seq = 10;
  for (const svc of cfg.services) {
    const filename = pad2(seq) + '-' + svc.name + '.yaml';
    out[filename] = buildServiceManifests(svc, cfg);
    seq++;
  }

  return out;
}

/**
 * Pad a number to 2 digits for sortable filenames.
 * @param {number} n
 */
function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

/**
 * Bilingual YAML header comment block.
 */
function k8sHeader(kind, cfg) {
  return '# ═══════════════════════════════════════════════════════════════════════════\n' +
    '# ' + cfg.stackName + ' — Kubernetes ' + kind + '\n' +
    '# Mega-ERP Techno-Kol Uzi  ·  "לא מוחקים רק משדרגים ומגדלים"\n' +
    '# Generated by onyx-procurement/src/deploy/manifest-generator.js (AG-X93)\n' +
    '# EN: Hardened defaults — runAsNonRoot, readOnlyRootFilesystem, drop ALL.\n' +
    '# HE: ברירות מחדל מוקשחות — משתמש לא-root, שורש לקריאה בלבד.\n' +
    '# Env reference / קובץ סביבה: ' + cfg.envExampleRef + '\n' +
    '# ═══════════════════════════════════════════════════════════════════════════\n';
}

/**
 * Emit the full set of per-service manifests concatenated with "---".
 * Includes: Deployment, Service, PVC (if stateful), HPA, PDB, ServiceAccount,
 * RoleBinding, topology/anti-affinity, probes, security context.
 */
function buildServiceManifests(svc, cfg) {
  const header = k8sHeader(svc.name, cfg);
  const docs = [];

  const labels = {
    'app.kubernetes.io/name': svc.name,
    'app.kubernetes.io/part-of': cfg.stackName,
    'app.kubernetes.io/managed-by': 'manifest-generator',
    tier: svc.network === 'frontend' ? 'frontend' : 'backend'
  };

  const replicas = (cfg.replicas && cfg.replicas[svc.name]) || (svc.stateful ? 1 : 2);

  // ServiceAccount
  docs.push(yamlEmit({
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
      name: svc.name + '-sa',
      namespace: cfg.namespace,
      labels: labels
    },
    automountServiceAccountToken: false
  }));

  // Role + RoleBinding (minimal — read own configs)
  docs.push(yamlEmit({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'Role',
    metadata: {
      name: svc.name + '-role',
      namespace: cfg.namespace,
      labels: labels
    },
    rules: [
      {
        apiGroups: [''],
        resources: ['configmaps', 'secrets'],
        resourceNames: ['erp-config', 'erp-secrets'],
        verbs: ['get']
      }
    ]
  }));

  docs.push(yamlEmit({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'RoleBinding',
    metadata: {
      name: svc.name + '-rb',
      namespace: cfg.namespace,
      labels: labels
    },
    subjects: [
      { kind: 'ServiceAccount', name: svc.name + '-sa', namespace: cfg.namespace }
    ],
    roleRef: {
      kind: 'Role',
      name: svc.name + '-role',
      apiGroup: 'rbac.authorization.k8s.io'
    }
  }));

  // PersistentVolumeClaim (stateful services)
  if (svc.stateful) {
    docs.push(yamlEmit({
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: svc.name + '-pvc',
        namespace: cfg.namespace,
        labels: labels
      },
      spec: {
        accessModes: ['ReadWriteOnce'],
        resources: {
          requests: { storage: svc.name === 'postgres' ? '20Gi' : '5Gi' }
        },
        storageClassName: 'standard'
      }
    }));
  }

  // Deployment
  const containerEnvFrom = (svc.envFrom || []).map(ref => {
    if (ref === 'erp-secrets') return { secretRef: { name: 'erp-secrets' } };
    return { configMapRef: { name: ref } };
  });

  const containerEnv = [];
  if (svc.env) {
    for (const [k, v] of Object.entries(svc.env)) {
      containerEnv.push({ name: k, value: String(v) });
    }
  }

  const ports = svc.port ? [{ containerPort: svc.port, name: 'http', protocol: 'TCP' }] : [];

  const probes = svc.healthPath ? {
    readinessProbe: {
      httpGet: { path: svc.healthPath, port: svc.port },
      initialDelaySeconds: 5,
      periodSeconds: 10,
      timeoutSeconds: 3,
      successThreshold: 1,
      failureThreshold: 3
    },
    livenessProbe: {
      httpGet: { path: svc.healthPath, port: svc.port },
      initialDelaySeconds: 30,
      periodSeconds: 20,
      timeoutSeconds: 5,
      failureThreshold: 3
    },
    startupProbe: {
      httpGet: { path: svc.healthPath, port: svc.port },
      initialDelaySeconds: 0,
      periodSeconds: 5,
      timeoutSeconds: 3,
      failureThreshold: 30
    }
  } : (svc.name === 'postgres' ? {
    readinessProbe: {
      exec: { command: ['pg_isready', '-U', 'erp', '-d', 'erp_main'] },
      initialDelaySeconds: 5,
      periodSeconds: 10,
      timeoutSeconds: 3,
      failureThreshold: 3
    },
    livenessProbe: {
      exec: { command: ['pg_isready', '-U', 'erp', '-d', 'erp_main'] },
      initialDelaySeconds: 30,
      periodSeconds: 20,
      timeoutSeconds: 5,
      failureThreshold: 3
    },
    startupProbe: {
      exec: { command: ['pg_isready', '-U', 'erp', '-d', 'erp_main'] },
      periodSeconds: 10,
      failureThreshold: 30
    }
  } : (svc.name === 'redis' ? {
    readinessProbe: {
      exec: { command: ['redis-cli', 'ping'] },
      initialDelaySeconds: 5,
      periodSeconds: 10
    },
    livenessProbe: {
      exec: { command: ['redis-cli', 'ping'] },
      initialDelaySeconds: 30,
      periodSeconds: 20
    },
    startupProbe: {
      exec: { command: ['redis-cli', 'ping'] },
      periodSeconds: 5,
      failureThreshold: 30
    }
  } : {}));

  const securityContext = {
    runAsNonRoot: true,
    runAsUser: 10001,
    runAsGroup: 10001,
    fsGroup: 10001,
    seccompProfile: { type: 'RuntimeDefault' }
  };

  const containerSecurityContext = {
    allowPrivilegeEscalation: false,
    privileged: false,
    readOnlyRootFilesystem: true,
    runAsNonRoot: true,
    runAsUser: 10001,
    capabilities: { drop: ['ALL'] }
  };

  const volumes = [];
  const volumeMounts = [];
  if (svc.stateful) {
    volumes.push({
      name: svc.name + '-data',
      persistentVolumeClaim: { claimName: svc.name + '-pvc' }
    });
    volumeMounts.push({
      name: svc.name + '-data',
      mountPath: svc.name === 'postgres' ? '/var/lib/postgresql/data' :
                 svc.name === 'redis' ? '/data' :
                 svc.name === 'prometheus' ? '/prometheus' :
                 svc.name === 'grafana' ? '/var/lib/grafana' :
                 svc.name === 'loki' ? '/loki' : '/data'
    });
  }
  // Scratch tmpfs for readOnlyRootFilesystem compatibility
  volumes.push({ name: 'tmp', emptyDir: {} });
  volumeMounts.push({ name: 'tmp', mountPath: '/tmp' });

  const container = {
    name: svc.name,
    image: svc.image,
    imagePullPolicy: 'IfNotPresent',
    ports: ports,
    resources: svc.resources || {
      requests: { cpu: '100m', memory: '128Mi' },
      limits: { cpu: '500m', memory: '512Mi' }
    },
    securityContext: containerSecurityContext,
    volumeMounts: volumeMounts
  };
  if (containerEnvFrom.length) container.envFrom = containerEnvFrom;
  if (containerEnv.length) container.env = containerEnv;
  if (svc.command) container.command = svc.command;
  Object.assign(container, probes);

  const deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: svc.name,
      namespace: cfg.namespace,
      labels: labels
    },
    spec: {
      replicas: replicas,
      strategy: svc.stateful ? { type: 'Recreate' } : {
        type: 'RollingUpdate',
        rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
      },
      selector: { matchLabels: { 'app.kubernetes.io/name': svc.name } },
      template: {
        metadata: {
          labels: labels,
          annotations: {
            'prometheus.io/scrape': 'true',
            'prometheus.io/port': String(svc.port || 9100)
          }
        },
        spec: {
          serviceAccountName: svc.name + '-sa',
          automountServiceAccountToken: false,
          securityContext: securityContext,
          terminationGracePeriodSeconds: 30,
          topologySpreadConstraints: [
            {
              maxSkew: 1,
              topologyKey: 'topology.kubernetes.io/zone',
              whenUnsatisfiable: 'ScheduleAnyway',
              labelSelector: { matchLabels: { 'app.kubernetes.io/name': svc.name } }
            },
            {
              maxSkew: 1,
              topologyKey: 'kubernetes.io/hostname',
              whenUnsatisfiable: 'ScheduleAnyway',
              labelSelector: { matchLabels: { 'app.kubernetes.io/name': svc.name } }
            }
          ],
          affinity: {
            podAntiAffinity: {
              preferredDuringSchedulingIgnoredDuringExecution: [
                {
                  weight: 100,
                  podAffinityTerm: {
                    topologyKey: 'kubernetes.io/hostname',
                    labelSelector: { matchLabels: { 'app.kubernetes.io/name': svc.name } }
                  }
                }
              ]
            }
          },
          containers: [container],
          volumes: volumes
        }
      }
    }
  };
  docs.push(yamlEmit(deployment));

  // Service
  if (svc.port) {
    docs.push(yamlEmit({
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: svc.name,
        namespace: cfg.namespace,
        labels: labels
      },
      spec: {
        type: 'ClusterIP',
        selector: { 'app.kubernetes.io/name': svc.name },
        ports: [
          {
            name: 'http',
            port: svc.port,
            targetPort: svc.port,
            protocol: 'TCP'
          }
        ]
      }
    }));
  }

  // HorizontalPodAutoscaler (stateless, replica > 1)
  if (!svc.stateful && replicas >= 2) {
    docs.push(yamlEmit({
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: svc.name + '-hpa',
        namespace: cfg.namespace,
        labels: labels
      },
      spec: {
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: svc.name
        },
        minReplicas: replicas,
        maxReplicas: replicas * 4,
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: { type: 'Utilization', averageUtilization: 70 }
            }
          },
          {
            type: 'Resource',
            resource: {
              name: 'memory',
              target: { type: 'Utilization', averageUtilization: 80 }
            }
          }
        ],
        behavior: {
          scaleDown: {
            stabilizationWindowSeconds: 300,
            policies: [{ type: 'Percent', value: 25, periodSeconds: 60 }]
          },
          scaleUp: {
            stabilizationWindowSeconds: 30,
            policies: [{ type: 'Percent', value: 100, periodSeconds: 30 }]
          }
        }
      }
    }));
  }

  // PodDisruptionBudget
  if (replicas >= 2) {
    docs.push(yamlEmit({
      apiVersion: 'policy/v1',
      kind: 'PodDisruptionBudget',
      metadata: {
        name: svc.name + '-pdb',
        namespace: cfg.namespace,
        labels: labels
      },
      spec: {
        minAvailable: 1,
        selector: { matchLabels: { 'app.kubernetes.io/name': svc.name } }
      }
    }));
  }

  // NetworkPolicy — per-service ingress rules
  docs.push(yamlEmit({
    apiVersion: 'networking.k8s.io/v1',
    kind: 'NetworkPolicy',
    metadata: {
      name: svc.name + '-netpol',
      namespace: cfg.namespace,
      labels: labels
    },
    spec: {
      podSelector: { matchLabels: { 'app.kubernetes.io/name': svc.name } },
      policyTypes: ['Ingress', 'Egress'],
      ingress: [
        {
          from: [
            { podSelector: { matchLabels: { 'app.kubernetes.io/part-of': cfg.stackName } } }
          ],
          ports: svc.port ? [{ protocol: 'TCP', port: svc.port }] : []
        }
      ],
      egress: [
        {
          to: [
            { podSelector: { matchLabels: { 'app.kubernetes.io/part-of': cfg.stackName } } }
          ]
        },
        // DNS
        {
          to: [{ namespaceSelector: {} }],
          ports: [
            { protocol: 'UDP', port: 53 },
            { protocol: 'TCP', port: 53 }
          ]
        }
      ]
    }
  }));

  // Ingress (frontend / edge services)
  if (svc.name === 'nginx' || svc.network === 'frontend') {
    docs.push(yamlEmit({
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: svc.name + '-ingress',
        namespace: cfg.namespace,
        labels: labels,
        annotations: {
          'nginx.ingress.kubernetes.io/ssl-redirect': 'true',
          'nginx.ingress.kubernetes.io/proxy-body-size': '50m',
          'cert-manager.io/cluster-issuer': 'letsencrypt-prod'
        }
      },
      spec: {
        ingressClassName: 'nginx',
        tls: [
          {
            hosts: [cfg.domain],
            secretName: svc.name + '-tls'
          }
        ],
        rules: [
          {
            host: cfg.domain,
            http: {
              paths: [
                {
                  path: '/',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: svc.name,
                      port: { number: svc.port || 80 }
                    }
                  }
                }
              ]
            }
          }
        ]
      }
    }));
  }

  return header + docs.map(d => d.replace(/\n$/, '')).join('\n---\n') + '\n';
}

// ───────────────────────────────────────────────────────────────────────────
// Port matrix helpers / עזרי מטריצת פורטים
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build a port-matrix table { service: { container, host } } for docs/tests.
 * @param {Object} [config]
 */
function getPortMatrix(config) {
  const cfg = config || getDefaultConfig();
  const matrix = {};
  for (const svc of cfg.services) {
    matrix[svc.name] = {
      container: svc.port || null,
      host: svc.hostPort || svc.port || null,
      network: svc.network || 'backend'
    };
  }
  return matrix;
}

// ───────────────────────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────────────────────

module.exports = {
  generateCompose,
  generateK8s,
  getDefaultConfig,
  getPortMatrix,
  yamlEmit,
  yamlParse
};
