/*
 * ═══════════════════════════════════════════════════════════════════════════
 * AG-Y171 — Service Mesh Configuration Generator
 * Mega-ERP Techno-Kol Uzi  ·  "לא מוחקים רק משדרגים ומגדלים"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Zero-dependency Istio / Envoy mesh manifest generator.
 *
 * Exports:
 *   - class ServiceMesh
 *       .generateVirtualService(routes)    => YAML string (VirtualService)
 *       .generateDestinationRule(subsets)  => YAML string (DestinationRule)
 *       .generateEnvoyFilter(filters)      => YAML string (EnvoyFilter)
 *       .generatePeerAuthentication(opts)  => YAML string (PeerAuthentication)
 *       .generateAll(config)               => { [filename]: yamlString }
 *   - getDefaultConfig()                    => canonical mesh descriptor
 *   - yamlEmit(obj)                         => minimal YAML emitter
 *
 * Features covered:
 *   - VirtualService  (HTTP routing)
 *   - DestinationRule (subsets + traffic policy + outlier detection)
 *   - Retry policy        (attempts, perTryTimeout, retryOn)
 *   - Circuit breaker     (consecutive5xxErrors, interval, ejection, maxConns)
 *   - Request timeout     (per route)
 *   - mTLS                (PeerAuthentication STRICT / PERMISSIVE / DISABLE)
 *   - Traffic splitting   (canary — weighted subsets, % summing to 100)
 *   - Header-based routing (match on headers, e.g. "x-release: canary")
 *   - Fault injection     (HTTP delay + abort for chaos testing)
 *   - Envoy filter        (workloadSelector + patch JSON)
 *
 * Design notes:
 *   - PURE module: no fs, no process.env, no Date.now() at load time.
 *   - Bilingual comments (EN + Hebrew) in the generated YAML.
 *   - Output: YAML strings only — callers decide what to do with them.
 *   - Test strategy: string compare of emitted YAML.
 *   - "Never delete" rule: the generator never mutates input configs and
 *     upgrades callers' descriptors by merging into defaults (augmenting,
 *     never removing existing fields).
 *
 * @module onyx-procurement/src/devops/service-mesh
 */

'use strict';

// ───────────────────────────────────────────────────────────────────────────
// Minimal YAML emitter / מחלץ YAML מינימלי
// ───────────────────────────────────────────────────────────────────────────

const YAML_RESERVED = new Set([
  'yes', 'no', 'true', 'false', 'null', '~', 'on', 'off',
  'Yes', 'No', 'True', 'False', 'Null', 'On', 'Off',
  'YES', 'NO', 'TRUE', 'FALSE', 'NULL', 'ON', 'OFF'
]);

function needsQuoting(s) {
  if (s === '') return true;
  if (YAML_RESERVED.has(s)) return true;
  if (/^-?\d+(\.\d+)?$/.test(s)) return true;
  if (/^\s|\s$/.test(s)) return true;
  if (/^[-?:,\[\]{}#&*!|>'"%@`]/.test(s)) return true;
  if (/:\s|\s#|[\n\r\t]/.test(s)) return true;
  return false;
}

function quoteString(s) {
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

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

function emitKey(k) {
  const s = String(k);
  if (s === '') return '""';
  if (/[:#&*!|>'"%@`{}\[\],\s]/.test(s) || /^-/.test(s)) return quoteString(s);
  return s;
}

function emitValue(val, indent) {
  const pad = '  '.repeat(indent);
  if (val === null || val === undefined) return 'null\n';
  if (typeof val !== 'object') return emitScalar(val) + '\n';

  if (Array.isArray(val)) {
    if (val.length === 0) return '[]\n';
    let out = '\n';
    for (const item of val) {
      if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
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
 * Public YAML emitter — trims the leading newline.
 * @param {object} obj
 * @returns {string}
 */
function yamlEmit(obj) {
  const body = emitValue(obj, 0);
  return body.startsWith('\n') ? body.slice(1) : body;
}

// ───────────────────────────────────────────────────────────────────────────
// Default mesh descriptor / תצורת ברירת מחדל
// ───────────────────────────────────────────────────────────────────────────

const DEFAULT_NAMESPACE = 'technokol';
const DEFAULT_API_VERSION_NETWORKING = 'networking.istio.io/v1beta1';
const DEFAULT_API_VERSION_SECURITY = 'security.istio.io/v1beta1';

function getDefaultConfig() {
  return {
    namespace: DEFAULT_NAMESPACE,
    service: 'onyx-procurement',
    host: 'onyx-procurement.technokol.svc.cluster.local',
    subsets: [
      { name: 'stable', labels: { version: 'stable' } },
      { name: 'canary', labels: { version: 'canary' } }
    ],
    routes: [
      {
        name: 'primary',
        match: [{ uri: { prefix: '/' } }],
        split: [
          { subset: 'stable', weight: 90 },
          { subset: 'canary', weight: 10 }
        ],
        timeoutMs: 5000,
        retries: { attempts: 3, perTryTimeoutMs: 2000, retryOn: 'gateway-error,connect-failure,refused-stream' }
      }
    ],
    circuitBreaker: {
      consecutive5xxErrors: 5,
      intervalMs: 30000,
      baseEjectionTimeMs: 30000,
      maxEjectionPercent: 50,
      maxConnections: 1024,
      maxPendingRequests: 1024,
      maxRequestsPerConnection: 0,
      maxRetries: 3
    },
    mtls: {
      mode: 'STRICT'
    }
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers / עזרים
// ───────────────────────────────────────────────────────────────────────────

/**
 * Convert a millisecond integer to an Istio-compatible duration string.
 * @param {number} ms
 * @returns {string}
 */
function msToDuration(ms) {
  if (ms === null || ms === undefined) return null;
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    throw new TypeError(`msToDuration: expected non-negative number, got ${ms}`);
  }
  if (ms === 0) return '0s';
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  // Istio accepts ms-precision as a fractional number of seconds.
  return `${(ms / 1000).toFixed(3)}s`;
}

/**
 * Deep-merge defaults into a user object without losing existing keys.
 * "לא מוחקים רק משדרגים ומגדלים"
 * @template T
 * @param {T} base
 * @param {Partial<T>} overlay
 * @returns {T}
 */
function mergeDefaults(base, overlay) {
  if (overlay === null || overlay === undefined) return base;
  if (typeof overlay !== 'object' || Array.isArray(overlay)) return overlay;
  if (base === null || base === undefined || typeof base !== 'object' || Array.isArray(base)) {
    return overlay;
  }
  const out = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(overlay)]);
  for (const k of keys) {
    if (k in overlay) {
      out[k] = mergeDefaults(base[k], overlay[k]);
    } else {
      out[k] = base[k];
    }
  }
  return out;
}

/**
 * Ensure a canary/stable weighted split sums to exactly 100.
 * Throws if violated — we want explicit, not silent, failures.
 * @param {Array<{subset:string,weight:number}>} split
 */
function assertWeightsSumTo100(split) {
  if (!Array.isArray(split) || split.length === 0) {
    throw new Error('assertWeightsSumTo100: split must be a non-empty array');
  }
  let total = 0;
  for (const s of split) {
    if (typeof s.weight !== 'number' || !Number.isFinite(s.weight) || s.weight < 0) {
      throw new Error(`assertWeightsSumTo100: invalid weight on subset "${s.subset}"`);
    }
    total += s.weight;
  }
  if (total !== 100) {
    throw new Error(`assertWeightsSumTo100: weights must sum to 100, got ${total}`);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// ServiceMesh class / מחלקה ראשית
// ───────────────────────────────────────────────────────────────────────────

class ServiceMesh {
  /**
   * @param {object} [options]
   * @param {string} [options.namespace]
   * @param {string} [options.service]
   * @param {string} [options.host]
   */
  constructor(options = {}) {
    const cfg = mergeDefaults(getDefaultConfig(), options);
    this.namespace = cfg.namespace;
    this.service = cfg.service;
    this.host = cfg.host;
    this.defaultRoutes = cfg.routes;
    this.defaultSubsets = cfg.subsets;
    this.circuitBreaker = cfg.circuitBreaker;
    this.mtls = cfg.mtls;
  }

  // ─────────────────────────────────────────────────────────────────────
  // VirtualService — HTTP routing / ניתוב HTTP
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Build an Istio VirtualService YAML manifest.
   * Supports traffic splitting (canary %), header-based routing, fault
   * injection (delay/abort), retries, and per-route timeout.
   *
   * @param {Array<object>} routes - list of route descriptors
   *   Each route:
   *     {
   *       name: string,
   *       match?: Array<{ uri?: {exact|prefix|regex: string},
   *                       headers?: {[key: string]: {exact|prefix|regex: string}},
   *                       method?: {exact: string},
   *                       queryParams?: {[key: string]: {exact|prefix: string}} }>,
   *       split: Array<{ subset: string, weight: number }>,  // must sum to 100
   *       timeoutMs?: number,
   *       retries?: { attempts: number, perTryTimeoutMs: number, retryOn: string },
   *       fault?: { delay?: { percentage: number, fixedDelayMs: number },
   *                 abort?: { percentage: number, httpStatus: number } },
   *       rewrite?: { uri?: string, authority?: string },
   *       corsPolicy?: object
   *     }
   * @returns {string} YAML manifest
   */
  generateVirtualService(routes) {
    const list = Array.isArray(routes) && routes.length > 0 ? routes : this.defaultRoutes;

    const httpRoutes = list.map((r) => {
      if (!r || typeof r !== 'object') {
        throw new TypeError('generateVirtualService: route must be an object');
      }
      if (!r.name || typeof r.name !== 'string') {
        throw new TypeError('generateVirtualService: route.name is required');
      }
      assertWeightsSumTo100(r.split);

      const httpEntry = { name: r.name };

      if (Array.isArray(r.match) && r.match.length > 0) {
        httpEntry.match = r.match.map((m) => this._buildMatch(m));
      }

      httpEntry.route = r.split.map((s) => ({
        destination: {
          host: this.host,
          subset: s.subset
        },
        weight: s.weight
      }));

      if (r.rewrite && typeof r.rewrite === 'object') {
        httpEntry.rewrite = { ...r.rewrite };
      }

      if (r.fault && typeof r.fault === 'object') {
        httpEntry.fault = this._buildFault(r.fault);
      }

      if (r.retries && typeof r.retries === 'object') {
        const { attempts, perTryTimeoutMs, retryOn } = r.retries;
        if (typeof attempts !== 'number' || attempts < 0) {
          throw new TypeError('retries.attempts must be a non-negative number');
        }
        httpEntry.retries = {
          attempts,
          perTryTimeout: msToDuration(perTryTimeoutMs || 2000),
          retryOn: retryOn || 'gateway-error,connect-failure,refused-stream'
        };
      }

      if (typeof r.timeoutMs === 'number') {
        httpEntry.timeout = msToDuration(r.timeoutMs);
      }

      if (r.corsPolicy && typeof r.corsPolicy === 'object') {
        httpEntry.corsPolicy = { ...r.corsPolicy };
      }

      return httpEntry;
    });

    const manifest = {
      apiVersion: DEFAULT_API_VERSION_NETWORKING,
      kind: 'VirtualService',
      metadata: {
        name: `${this.service}-vs`,
        namespace: this.namespace,
        labels: {
          app: this.service,
          'managed-by': 'technokol-mesh-generator'
        }
      },
      spec: {
        hosts: [this.host],
        http: httpRoutes
      }
    };

    const header = this._banner('VirtualService', 'HTTP routing / ניתוב HTTP');
    return header + yamlEmit(manifest);
  }

  _buildMatch(m) {
    const out = {};
    if (m.uri && typeof m.uri === 'object') out.uri = { ...m.uri };
    if (m.headers && typeof m.headers === 'object') {
      out.headers = {};
      for (const [k, v] of Object.entries(m.headers)) {
        out.headers[k] = { ...v };
      }
    }
    if (m.method && typeof m.method === 'object') out.method = { ...m.method };
    if (m.queryParams && typeof m.queryParams === 'object') {
      out.queryParams = {};
      for (const [k, v] of Object.entries(m.queryParams)) {
        out.queryParams[k] = { ...v };
      }
    }
    if (m.authority && typeof m.authority === 'object') out.authority = { ...m.authority };
    return out;
  }

  _buildFault(fault) {
    const out = {};
    if (fault.delay && typeof fault.delay === 'object') {
      const pct = Number(fault.delay.percentage);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new RangeError('fault.delay.percentage must be 0..100');
      }
      out.delay = {
        percentage: { value: pct },
        fixedDelay: msToDuration(fault.delay.fixedDelayMs || 0)
      };
    }
    if (fault.abort && typeof fault.abort === 'object') {
      const pct = Number(fault.abort.percentage);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new RangeError('fault.abort.percentage must be 0..100');
      }
      const status = Number(fault.abort.httpStatus);
      if (!Number.isInteger(status) || status < 100 || status > 599) {
        throw new RangeError('fault.abort.httpStatus must be an HTTP status code');
      }
      out.abort = {
        percentage: { value: pct },
        httpStatus: status
      };
    }
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────
  // DestinationRule — subsets + circuit breaker + outlier detection
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Build an Istio DestinationRule YAML manifest with circuit breaker,
   * connection pool limits, outlier detection, and mTLS setting.
   *
   * @param {Array<{name: string, labels: object, trafficPolicy?: object}>} subsets
   * @returns {string} YAML manifest
   */
  generateDestinationRule(subsets) {
    const list = Array.isArray(subsets) && subsets.length > 0 ? subsets : this.defaultSubsets;
    const cb = this.circuitBreaker;

    const subsetEntries = list.map((s) => {
      if (!s || typeof s !== 'object' || !s.name) {
        throw new TypeError('generateDestinationRule: subset.name is required');
      }
      const entry = {
        name: s.name,
        labels: s.labels || {}
      };
      if (s.trafficPolicy && typeof s.trafficPolicy === 'object') {
        entry.trafficPolicy = { ...s.trafficPolicy };
      }
      return entry;
    });

    const manifest = {
      apiVersion: DEFAULT_API_VERSION_NETWORKING,
      kind: 'DestinationRule',
      metadata: {
        name: `${this.service}-dr`,
        namespace: this.namespace,
        labels: {
          app: this.service,
          'managed-by': 'technokol-mesh-generator'
        }
      },
      spec: {
        host: this.host,
        trafficPolicy: {
          connectionPool: {
            tcp: {
              maxConnections: cb.maxConnections
            },
            http: {
              http1MaxPendingRequests: cb.maxPendingRequests,
              http2MaxRequests: cb.maxConnections,
              maxRequestsPerConnection: cb.maxRequestsPerConnection,
              maxRetries: cb.maxRetries
            }
          },
          outlierDetection: {
            consecutive5xxErrors: cb.consecutive5xxErrors,
            interval: msToDuration(cb.intervalMs),
            baseEjectionTime: msToDuration(cb.baseEjectionTimeMs),
            maxEjectionPercent: cb.maxEjectionPercent
          },
          tls: {
            mode: this._mapMtlsToTlsMode(this.mtls.mode)
          }
        },
        subsets: subsetEntries
      }
    };

    const header = this._banner(
      'DestinationRule',
      'Circuit breaker + subsets / מאגר חיבורים ותתי־קבוצות'
    );
    return header + yamlEmit(manifest);
  }

  _mapMtlsToTlsMode(mode) {
    switch (mode) {
      case 'STRICT': return 'ISTIO_MUTUAL';
      case 'PERMISSIVE': return 'ISTIO_MUTUAL';
      case 'DISABLE': return 'DISABLE';
      default: return 'ISTIO_MUTUAL';
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // PeerAuthentication — mTLS / אימות הדדי
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Build a PeerAuthentication manifest for mTLS at the service level.
   * @param {object} [opts]
   * @param {'STRICT'|'PERMISSIVE'|'DISABLE'} [opts.mode]
   * @returns {string} YAML manifest
   */
  generatePeerAuthentication(opts = {}) {
    const mode = opts.mode || this.mtls.mode || 'STRICT';
    if (!['STRICT', 'PERMISSIVE', 'DISABLE'].includes(mode)) {
      throw new RangeError(`generatePeerAuthentication: invalid mode "${mode}"`);
    }
    const manifest = {
      apiVersion: DEFAULT_API_VERSION_SECURITY,
      kind: 'PeerAuthentication',
      metadata: {
        name: `${this.service}-mtls`,
        namespace: this.namespace,
        labels: {
          app: this.service,
          'managed-by': 'technokol-mesh-generator'
        }
      },
      spec: {
        selector: {
          matchLabels: { app: this.service }
        },
        mtls: { mode }
      }
    };
    const header = this._banner('PeerAuthentication', 'Mutual TLS / אימות הדדי');
    return header + yamlEmit(manifest);
  }

  // ─────────────────────────────────────────────────────────────────────
  // EnvoyFilter — low-level proxy patches / טלאי Envoy
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Build an Istio EnvoyFilter manifest.
   * @param {Array<object>} filters - list of patches
   *   Each filter: { name, context, applyTo, match, patch: { operation, value } }
   * @returns {string} YAML manifest
   */
  generateEnvoyFilter(filters) {
    if (!Array.isArray(filters) || filters.length === 0) {
      throw new TypeError('generateEnvoyFilter: at least one filter is required');
    }
    const configPatches = filters.map((f) => {
      if (!f || typeof f !== 'object') {
        throw new TypeError('generateEnvoyFilter: filter must be an object');
      }
      const patch = {
        applyTo: f.applyTo || 'HTTP_FILTER',
        match: f.match || { context: f.context || 'SIDECAR_INBOUND' },
        patch: {
          operation: (f.patch && f.patch.operation) || 'INSERT_BEFORE',
          value: (f.patch && f.patch.value) || {}
        }
      };
      return patch;
    });
    const manifest = {
      apiVersion: DEFAULT_API_VERSION_NETWORKING,
      kind: 'EnvoyFilter',
      metadata: {
        name: `${this.service}-ef`,
        namespace: this.namespace,
        labels: {
          app: this.service,
          'managed-by': 'technokol-mesh-generator'
        }
      },
      spec: {
        workloadSelector: {
          labels: { app: this.service }
        },
        configPatches
      }
    };
    const header = this._banner('EnvoyFilter', 'Envoy sidecar patches / טלאי Envoy');
    return header + yamlEmit(manifest);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Bulk generator / יצרן מרוכז
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Generate every manifest the mesh needs for this service, keyed by a
   * suggested filename. Returns a plain object — caller decides what to
   * persist (or not — rule: "we never delete, we only upgrade").
   *
   * @param {object} [overrides]
   * @returns {{[filename:string]: string}}
   */
  generateAll(overrides = {}) {
    const routes = overrides.routes || this.defaultRoutes;
    const subsets = overrides.subsets || this.defaultSubsets;
    const out = {};
    out[`${this.service}-virtualservice.yaml`] = this.generateVirtualService(routes);
    out[`${this.service}-destinationrule.yaml`] = this.generateDestinationRule(subsets);
    out[`${this.service}-peerauthentication.yaml`] = this.generatePeerAuthentication({ mode: this.mtls.mode });
    return out;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Internal — bilingual YAML banner
  // ─────────────────────────────────────────────────────────────────────

  _banner(kind, subtitle) {
    const bar = '# ═══════════════════════════════════════════════════════════════════\n';
    return (
      bar +
      `# ${kind} — ${subtitle}\n` +
      `# service: ${this.service}  ·  namespace: ${this.namespace}\n` +
      '# Techno-Kol Uzi · לא מוחקים רק משדרגים ומגדלים\n' +
      bar
    );
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Exports
// ───────────────────────────────────────────────────────────────────────────

module.exports = {
  ServiceMesh,
  getDefaultConfig,
  yamlEmit,
  msToDuration,
  mergeDefaults,
  assertWeightsSumTo100
};
