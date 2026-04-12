/**
 * ============================================================================
 * Agent Y-173 — HashiCorp Vault / OpenBao Client
 * Techno-Kol Uzi mega-ERP — onyx-procurement / devops
 * ============================================================================
 *
 * EN: Zero-dependency wrapper around Vault's HTTP API (KV v2, Transit, PKI).
 *     Uses only Node.js built-ins (node:https, node:http, node:url, node:crypto,
 *     node:events). Supports namespaces, token renewal, exponential-backoff
 *     retry, pluggable transport for tests, and a full audit log of every call.
 *
 * HE: עטיפה ללא תלויות חיצוניות לממשק ה-HTTP של Vault (KV גרסה 2, Transit, PKI).
 *     משתמשת אך ורק במודולי הליבה של Node.js (node:https, node:http, node:url,
 *     node:crypto, node:events). תומכת במרחבי שמות (namespaces), חידוש טוקן,
 *     ניסיון חוזר עם השהיה אקספוננציאלית, הזרקת transport לצורכי בדיקה,
 *     ויומן ביקורת מלא של כל קריאה.
 *
 * Compatible with: HashiCorp Vault >= 1.9, OpenBao >= 2.0
 * תואם לגרסאות: HashiCorp Vault 1.9 ומעלה, OpenBao 2.0 ומעלה
 *
 * Rules respected / חוקים נשמרים:
 *   - Never delete existing code / לעולם לא מוחקים קוד קיים
 *   - Node built-ins only / מודולי ליבה בלבד
 *   - Bilingual (EN + HE) / דו-לשוני
 * ============================================================================
 */

'use strict';

const https = require('node:https');
const http = require('node:http');
const { URL } = require('node:url');
const { randomUUID, createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');

// ---------------------------------------------------------------------------
// Custom error class / מחלקת שגיאה ייעודית
// ---------------------------------------------------------------------------

/**
 * EN: Specialized error thrown by VaultClient, carrying HTTP status, Vault's
 *     error list, the path, and the request id for forensics.
 * HE: שגיאה ייעודית שנזרקת על-ידי VaultClient, נושאת קוד HTTP, רשימת שגיאות
 *     של Vault, הנתיב ומזהה הבקשה לצורכי תחקור.
 */
class VaultError extends Error {
  constructor(message, { status = 0, errors = [], path = '', requestId = '' } = {}) {
    super(message);
    this.name = 'VaultError';
    this.status = status;
    this.errors = Array.isArray(errors) ? errors : [];
    this.path = path;
    this.requestId = requestId;
  }
}

// ---------------------------------------------------------------------------
// Utility helpers / פונקציות עזר
// ---------------------------------------------------------------------------

/**
 * EN: Safely parse a JSON body; returns `{}` when body is empty/invalid.
 * HE: מנתח JSON בצורה בטוחה; מחזיר אובייקט ריק כאשר הגוף ריק או לא חוקי.
 */
function safeJsonParse(body) {
  if (body === undefined || body === null || body === '') return {};
  if (typeof body === 'object') return body;
  try {
    return JSON.parse(body);
  } catch (_e) {
    return { _raw: String(body) };
  }
}

/**
 * EN: Sleep for `ms` milliseconds (Promise-based).
 * HE: השהיה למספר מילישניות (מחזיר Promise).
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * EN: Encode a URI segment preserving the forward slashes as path separators.
 *     Needed because KV v2 keys may contain slashes that must stay intact,
 *     while each individual segment must be percent-encoded.
 * HE: קידוד מקטע URI תוך שמירה על סלאשים כמפרידי נתיב. נדרש כאשר מפתחות
 *     ב-KV v2 עשויים להכיל סלאשים אמיתיים שצריכים להישאר, בעוד כל מקטע
 *     חייב להיות מקודד ב-percent-encoding.
 */
function encodePath(segment) {
  if (segment === undefined || segment === null) return '';
  return String(segment)
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

/**
 * EN: Redact secret material from an arbitrary payload so we never log it.
 *     Recursively walks objects, masking common sensitive keys.
 * HE: מסתיר חומר סודי מתוך payload כדי שלא יירשם ביומן. עובר רקורסיבית על
 *     אובייקטים ומחליף ערכים של מפתחות רגישים נפוצים.
 */
const SENSITIVE_KEYS = new Set([
  'token',
  'client_token',
  'password',
  'secret',
  'private_key',
  'plaintext',
  'ciphertext',
  'signature',
  'hmac',
  'data',
  'certificate',
  'issuing_ca',
  'ca_chain',
  'serial_number',
]);

function redact(value, depth = 0) {
  if (depth > 6) return '[REDACTED:depth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > 0 ? `[REDACTED:${value.length}]` : '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  return '[REDACTED:type]';
}

/**
 * EN: Deep-clone via JSON for audit entries (prevents downstream mutation).
 * HE: שכפול עמוק דרך JSON עבור רשומות ביקורת (מונע שינוי במקור).
 */
function clone(v) {
  if (v === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (_e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Default HTTPS/HTTP transport / transport ברירת מחדל
// ---------------------------------------------------------------------------

/**
 * EN: Default transport — issues a real HTTP(S) request using node:https or
 *     node:http depending on the URL scheme. Returns a Promise that resolves
 *     with `{ status, headers, body }`. The body is always returned as a
 *     string (caller parses JSON if needed).
 * HE: transport ברירת מחדל — שולח בקשת HTTP(S) אמיתית באמצעות node:https או
 *     node:http לפי סכמת ה-URL. מחזיר Promise שמתרס עם `{ status, headers, body }`.
 *     הגוף מוחזר כמחרוזת (הקורא מפרק JSON בעצמו אם צריך).
 */
function defaultTransport(request) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(request.url);
    } catch (e) {
      reject(new VaultError(`Invalid URL: ${request.url}`, { path: request.url }));
      return;
    }
    const mod = url.protocol === 'https:' ? https : http;
    const options = {
      method: request.method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: request.headers || {},
      timeout: request.timeout || 30000,
    };

    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers || {},
          body: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });

    req.on('error', (err) => {
      reject(new VaultError(`Transport error: ${err.message}`, { path: request.url }));
    });
    req.on('timeout', () => {
      req.destroy(new Error('Request timeout'));
    });

    if (request.body !== undefined && request.body !== null && request.body !== '') {
      req.write(request.body);
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// VaultClient — main class / המחלקה הראשית
// ---------------------------------------------------------------------------

/**
 * EN: Configurable, test-friendly client for HashiCorp Vault and OpenBao.
 *     Emits events: 'request', 'response', 'error', 'audit', 'token-renewed'.
 * HE: לקוח גמיש וידידותי-לבדיקות ל-HashiCorp Vault ול-OpenBao.
 *     מפיק אירועים: 'request', 'response', 'error', 'audit', 'token-renewed'.
 */
class VaultClient extends EventEmitter {
  /**
   * EN: Construct a new client.
   * HE: יוצר לקוח חדש.
   *
   * @param {Object}   opts
   * @param {string}   opts.endpoint      - Base URL, e.g. "https://vault.local:8200"
   * @param {string}   [opts.token]       - Vault token (can be set later via setToken)
   * @param {string}   [opts.namespace]   - X-Vault-Namespace header value
   * @param {string}   [opts.kvMount="secret"] - Mount path of the KV v2 engine
   * @param {string}   [opts.transitMount="transit"] - Mount path of the Transit engine
   * @param {string}   [opts.pkiMount="pki"] - Mount path of the PKI engine
   * @param {number}   [opts.timeout=30000] - Per-request timeout (ms)
   * @param {number}   [opts.maxRetries=3] - Max retry attempts on retryable errors
   * @param {number}   [opts.retryBaseMs=100] - Base backoff delay (ms)
   * @param {number}   [opts.retryMaxMs=5000] - Maximum backoff delay (ms)
   * @param {number}   [opts.auditMax=500] - Maximum in-memory audit entries
   * @param {Function} [opts.now=Date.now] - Injectable clock (for tests)
   * @param {Function} [opts.sleep=sleep] - Injectable sleep (for tests)
   * @param {Function} [opts.random=Math.random] - Injectable RNG (for jitter)
   */
  constructor(opts = {}) {
    super();
    if (!opts || typeof opts !== 'object') {
      throw new VaultError('VaultClient: options object is required');
    }
    if (!opts.endpoint || typeof opts.endpoint !== 'string') {
      throw new VaultError('VaultClient: "endpoint" is required');
    }

    this.endpoint = opts.endpoint.replace(/\/+$/, '');
    this.token = opts.token || '';
    this.namespace = opts.namespace || '';
    this.kvMount = opts.kvMount || 'secret';
    this.transitMount = opts.transitMount || 'transit';
    this.pkiMount = opts.pkiMount || 'pki';
    this.timeout = Number.isFinite(opts.timeout) ? opts.timeout : 30000;
    this.maxRetries = Number.isFinite(opts.maxRetries) ? opts.maxRetries : 3;
    this.retryBaseMs = Number.isFinite(opts.retryBaseMs) ? opts.retryBaseMs : 100;
    this.retryMaxMs = Number.isFinite(opts.retryMaxMs) ? opts.retryMaxMs : 5000;
    this.auditMax = Number.isFinite(opts.auditMax) ? opts.auditMax : 500;
    this._now = typeof opts.now === 'function' ? opts.now : () => Date.now();
    this._sleep = typeof opts.sleep === 'function' ? opts.sleep : sleep;
    this._random = typeof opts.random === 'function' ? opts.random : Math.random;

    this._transport = defaultTransport;
    this._auditLog = [];
    this._tokenInfo = null; // last known lookup-self result
  }

  // -------------------------------------------------------------------------
  // Transport injection / הזרקת transport
  // -------------------------------------------------------------------------

  /**
   * EN: Replace the transport with a user-supplied function. The function
   *     must accept `{ url, method, headers, body, timeout }` and return
   *     a Promise resolving to `{ status, headers, body }`. This is how
   *     tests plug in mocks without touching the network.
   * HE: מחליף את ה-transport בפונקציה שסיפק המשתמש. הפונקציה מקבלת
   *     `{ url, method, headers, body, timeout }` ומחזירה Promise שמתרס
   *     ל-`{ status, headers, body }`. כך בדיקות משתילות mocks בלי רשת.
   */
  injectTransport(fn) {
    if (typeof fn !== 'function') {
      throw new VaultError('injectTransport requires a function');
    }
    this._transport = fn;
    return this;
  }

  /**
   * EN: Restore the default transport (real HTTPS).
   * HE: משחזר את ה-transport המקורי (HTTPS אמיתי).
   */
  resetTransport() {
    this._transport = defaultTransport;
    return this;
  }

  // -------------------------------------------------------------------------
  // Token management / ניהול טוקן
  // -------------------------------------------------------------------------

  /**
   * EN: Set or rotate the Vault token used for subsequent requests.
   * HE: קובע או מחליף את הטוקן של Vault שישמש בקריאות הבאות.
   */
  setToken(token) {
    this.token = token || '';
    return this;
  }

  /**
   * EN: Set or clear the X-Vault-Namespace header used for Enterprise
   *     namespaces / OpenBao namespaces.
   * HE: קובע או מנקה את הכותרת X-Vault-Namespace עבור namespaces
   *     של Vault Enterprise / OpenBao.
   */
  setNamespace(namespace) {
    this.namespace = namespace || '';
    return this;
  }

  /**
   * EN: Return a shallow snapshot of current configuration (no secrets).
   * HE: מחזיר תמונת מצב רדודה של התצורה (ללא סודות).
   */
  getConfig() {
    return {
      endpoint: this.endpoint,
      namespace: this.namespace,
      kvMount: this.kvMount,
      transitMount: this.transitMount,
      pkiMount: this.pkiMount,
      timeout: this.timeout,
      maxRetries: this.maxRetries,
      hasToken: Boolean(this.token),
    };
  }

  // -------------------------------------------------------------------------
  // Audit log / יומן ביקורת
  // -------------------------------------------------------------------------

  /**
   * EN: Push a new entry to the in-memory audit ring-buffer. Every API call
   *     produces at least one audit row (request attempt) plus one on
   *     success/failure. Secret payload is automatically redacted.
   * HE: דוחף רשומה חדשה לחיץ הביקורת בזיכרון. כל קריאת API מייצרת לפחות
   *     רשומה אחת (ניסיון שליחה) ועוד אחת על הצלחה/כישלון. Payload סודי
   *     מצונזר אוטומטית.
   */
  _audit(entry) {
    const row = {
      id: entry.id || randomUUID(),
      ts: this._now(),
      ...entry,
    };
    this._auditLog.push(row);
    while (this._auditLog.length > this.auditMax) {
      this._auditLog.shift();
    }
    this.emit('audit', row);
    return row;
  }

  /**
   * EN: Return a defensive copy of the audit log (optionally filtered).
   * HE: מחזיר עותק מגן של יומן הביקורת (עם אפשרות סינון).
   *
   * @param {Object} [filter]
   * @param {string} [filter.type]   - "request" | "response" | "error"
   * @param {string} [filter.engine] - "kv" | "transit" | "pki" | "token" | "sys"
   * @param {number} [filter.since]  - Timestamp (ms)
   */
  getAuditLog(filter = {}) {
    return this._auditLog
      .filter((row) => {
        if (filter.type && row.type !== filter.type) return false;
        if (filter.engine && row.engine !== filter.engine) return false;
        if (filter.since && row.ts < filter.since) return false;
        return true;
      })
      .map((row) => clone(row));
  }

  /**
   * EN: Clear all audit entries (useful between test cases).
   * HE: מנקה את כל רשומות הביקורת (שימושי בין בדיקות).
   */
  clearAuditLog() {
    this._auditLog.length = 0;
    return this;
  }

  // -------------------------------------------------------------------------
  // Low-level request with retry/backoff / בקשה נמוכה-רמה עם retry
  // -------------------------------------------------------------------------

  /**
   * EN: Build the request headers, automatically including the token and
   *     namespace when they are set.
   * HE: בונה את כותרות הבקשה, ומצרף אוטומטית טוקן ו-namespace כשהם קיימים.
   */
  _buildHeaders(extra = {}) {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extra,
    };
    if (this.token) headers['X-Vault-Token'] = this.token;
    if (this.namespace) headers['X-Vault-Namespace'] = this.namespace;
    return headers;
  }

  /**
   * EN: Determine whether a response status should trigger a retry. 429 and
   *     5xx (except 501) are retried, as are transport errors.
   * HE: קובע האם סטטוס התגובה מצריך retry. 429 ו-5xx (למעט 501) יופעלו מחדש,
   *     וכן שגיאות transport.
   */
  _isRetryable(status) {
    if (status === 0) return true; // transport error
    if (status === 429) return true;
    if (status === 501) return false;
    if (status >= 500 && status < 600) return true;
    return false;
  }

  /**
   * EN: Compute exponential backoff with full jitter: base * 2^attempt +
   *     random(0, base). Capped at retryMaxMs.
   * HE: מחשב השהיה אקספוננציאלית עם jitter מלא: base * 2^attempt + תוספת
   *     אקראית עד base. מוגבל ל-retryMaxMs.
   */
  _backoffDelay(attempt) {
    const exp = this.retryBaseMs * Math.pow(2, attempt);
    const jitter = this._random() * this.retryBaseMs;
    return Math.min(this.retryMaxMs, exp + jitter);
  }

  /**
   * EN: Execute a raw Vault API request with retry, audit and error mapping.
   * HE: מבצע קריאת API גולמית ל-Vault עם retry, audit ומיפוי שגיאות.
   *
   * @param {Object} req
   * @param {string} req.method   - HTTP method
   * @param {string} req.path     - Path after "/v1/", e.g. "sys/health"
   * @param {Object} [req.body]   - JSON body (will be stringified)
   * @param {Object} [req.query]  - Query-string parameters
   * @param {string} [req.engine] - Logical engine label for audit
   * @param {string} [req.op]     - Operation label for audit
   */
  async request(req) {
    if (!req || !req.method || !req.path) {
      throw new VaultError('request: method and path are required');
    }

    const requestId = randomUUID();
    const query = req.query ? this._buildQuery(req.query) : '';
    const url = `${this.endpoint}/v1/${req.path}${query}`;
    const bodyStr =
      req.body === undefined || req.body === null
        ? ''
        : typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body);

    const engine = req.engine || 'sys';
    const op = req.op || `${req.method} ${req.path}`;

    this._audit({
      id: requestId,
      type: 'request',
      engine,
      op,
      method: req.method,
      path: req.path,
      namespace: this.namespace || null,
      redactedBody: redact(safeJsonParse(bodyStr)),
    });
    this.emit('request', { requestId, method: req.method, path: req.path, engine, op });

    let lastError = null;
    const maxAttempts = Math.max(1, this.maxRetries + 1);

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await this._transport({
          url,
          method: req.method,
          headers: this._buildHeaders(req.headers || {}),
          body: bodyStr,
          timeout: this.timeout,
        });

        const parsed = safeJsonParse(response.body);
        const status = response.status;

        this.emit('response', {
          requestId,
          status,
          path: req.path,
          attempt,
        });

        if (status >= 200 && status < 300) {
          this._audit({
            id: requestId,
            type: 'response',
            engine,
            op,
            status,
            attempt,
            ok: true,
          });
          return { status, headers: response.headers || {}, data: parsed };
        }

        // Non-2xx: decide retry vs. fail
        const errMsg =
          (parsed && parsed.errors && parsed.errors.join('; ')) ||
          `Vault returned status ${status}`;
        lastError = new VaultError(errMsg, {
          status,
          errors: parsed && parsed.errors,
          path: req.path,
          requestId,
        });

        if (this._isRetryable(status) && attempt < maxAttempts - 1) {
          this._audit({
            id: requestId,
            type: 'retry',
            engine,
            op,
            status,
            attempt,
            reason: 'retryable-status',
          });
          await this._sleep(this._backoffDelay(attempt));
          continue;
        }

        this._audit({
          id: requestId,
          type: 'error',
          engine,
          op,
          status,
          attempt,
          error: errMsg,
        });
        this.emit('error', lastError);
        throw lastError;
      } catch (err) {
        if (err instanceof VaultError && err.status && !this._isRetryable(err.status)) {
          throw err;
        }
        lastError =
          err instanceof VaultError
            ? err
            : new VaultError(err && err.message ? err.message : 'Unknown transport error', {
                path: req.path,
                requestId,
              });

        if (attempt < maxAttempts - 1) {
          this._audit({
            id: requestId,
            type: 'retry',
            engine,
            op,
            attempt,
            reason: 'transport-error',
            error: lastError.message,
          });
          await this._sleep(this._backoffDelay(attempt));
          continue;
        }

        this._audit({
          id: requestId,
          type: 'error',
          engine,
          op,
          attempt,
          error: lastError.message,
        });
        this.emit('error', lastError);
        throw lastError;
      }
    }

    // Safety net (should not reach here) / רשת ביטחון (לא אמור להגיע לכאן)
    throw lastError || new VaultError('Unknown error in request loop');
  }

  /**
   * EN: Build a stable, sorted query string (deterministic for tests).
   * HE: בונה query-string ממויין ויציב (דטרמיניסטי לבדיקות).
   */
  _buildQuery(obj) {
    const keys = Object.keys(obj).sort();
    const parts = [];
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined || v === null) continue;
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }

  // -------------------------------------------------------------------------
  // sys/health & sys/seal-status / מצב שרת ומצב חותם
  // -------------------------------------------------------------------------

  /**
   * EN: Hit /v1/sys/health. Does not require a token. Useful for readiness
   *     probes in Kubernetes/OpenBao deployments.
   * HE: קורא ל-/v1/sys/health. לא מצריך טוקן. שימושי ל-readiness probe
   *     בפריסות Kubernetes/OpenBao.
   */
  async health() {
    const res = await this.request({
      method: 'GET',
      path: 'sys/health',
      engine: 'sys',
      op: 'health',
    });
    return res.data;
  }

  /**
   * EN: Retrieve the seal status of the Vault/OpenBao server.
   * HE: מחזיר את מצב החותם של שרת ה-Vault/OpenBao.
   */
  async sealStatus() {
    const res = await this.request({
      method: 'GET',
      path: 'sys/seal-status',
      engine: 'sys',
      op: 'seal-status',
    });
    return res.data;
  }

  // -------------------------------------------------------------------------
  // Token lifecycle / מחזור חיי טוקן
  // -------------------------------------------------------------------------

  /**
   * EN: Look up the current token's metadata via /auth/token/lookup-self.
   *     The result is cached in `_tokenInfo` and returned verbatim.
   * HE: מאחזר מטא-נתונים של הטוקן הנוכחי דרך /auth/token/lookup-self.
   *     התוצאה נשמרת ב-`_tokenInfo` ומוחזרת כפי שהיא.
   */
  async lookupSelf() {
    if (!this.token) throw new VaultError('lookupSelf: no token set');
    const res = await this.request({
      method: 'GET',
      path: 'auth/token/lookup-self',
      engine: 'token',
      op: 'lookup-self',
    });
    this._tokenInfo = res.data && res.data.data ? res.data.data : null;
    return this._tokenInfo;
  }

  /**
   * EN: Renew the current token. Optionally pass an `increment` (seconds).
   *     Emits 'token-renewed' on success.
   * HE: מחדש את הטוקן הנוכחי. ניתן להעביר `increment` בשניות.
   *     מפיק אירוע 'token-renewed' בהצלחה.
   */
  async renewSelf(increment) {
    if (!this.token) throw new VaultError('renewSelf: no token set');
    const body = {};
    if (Number.isFinite(increment) && increment > 0) body.increment = `${increment}s`;
    const res = await this.request({
      method: 'POST',
      path: 'auth/token/renew-self',
      body,
      engine: 'token',
      op: 'renew-self',
    });
    const auth = res.data && res.data.auth ? res.data.auth : null;
    if (auth && auth.client_token) {
      this.token = auth.client_token;
    }
    this.emit('token-renewed', {
      lease_duration: auth ? auth.lease_duration : null,
      renewable: auth ? auth.renewable : null,
    });
    return auth;
  }

  /**
   * EN: Revoke the current token (logout). After this call, the client has
   *     no valid token and must be re-authenticated.
   * HE: מבטל את הטוקן הנוכחי (logout). לאחר קריאה זו הלקוח נותר ללא טוקן
   *     תקף וחייב להיאות מחדש.
   */
  async revokeSelf() {
    if (!this.token) throw new VaultError('revokeSelf: no token set');
    await this.request({
      method: 'POST',
      path: 'auth/token/revoke-self',
      engine: 'token',
      op: 'revoke-self',
    });
    this.token = '';
    this._tokenInfo = null;
    return true;
  }

  // -------------------------------------------------------------------------
  // KV v2 engine / מנוע KV גרסה 2
  // -------------------------------------------------------------------------

  /**
   * EN: Write (create-or-update) a secret at `path` inside the KV v2 mount.
   *     The `data` argument is the user payload (object). Optional `cas`
   *     enables check-and-set concurrency semantics.
   * HE: כותב (יוצר או מעדכן) סוד בנתיב `path` בתוך נקודת העיגון של KV v2.
   *     הארגומנט `data` הוא ה-payload של המשתמש. `cas` אופציונלי מאפשר
   *     סמנטיקת check-and-set.
   */
  async kvWrite(path, data, options = {}) {
    if (!path) throw new VaultError('kvWrite: path is required');
    if (!data || typeof data !== 'object') {
      throw new VaultError('kvWrite: data must be an object');
    }
    const body = { data };
    if (options.cas !== undefined && Number.isFinite(options.cas)) {
      body.options = { cas: options.cas };
    }
    const res = await this.request({
      method: 'POST',
      path: `${this.kvMount}/data/${encodePath(path)}`,
      body,
      engine: 'kv',
      op: 'kv-write',
    });
    return res.data && res.data.data ? res.data.data : {};
  }

  /**
   * EN: Read the latest version (or a specific version) of a KV v2 secret.
   * HE: קורא את הגרסה האחרונה (או גרסה מסוימת) של סוד ב-KV גרסה 2.
   */
  async kvRead(path, options = {}) {
    if (!path) throw new VaultError('kvRead: path is required');
    const query = {};
    if (options.version !== undefined && Number.isFinite(options.version)) {
      query.version = options.version;
    }
    const res = await this.request({
      method: 'GET',
      path: `${this.kvMount}/data/${encodePath(path)}`,
      query,
      engine: 'kv',
      op: 'kv-read',
    });
    if (!res.data || !res.data.data) return null;
    return {
      data: res.data.data.data || {},
      metadata: res.data.data.metadata || {},
    };
  }

  /**
   * EN: List the keys under a KV v2 directory path.
   * HE: מציג את המפתחות תחת נתיב תיקייה ב-KV גרסה 2.
   */
  async kvList(path) {
    if (!path) throw new VaultError('kvList: path is required');
    const res = await this.request({
      method: 'GET',
      path: `${this.kvMount}/metadata/${encodePath(path)}?list=true`,
      engine: 'kv',
      op: 'kv-list',
    });
    if (!res.data || !res.data.data || !Array.isArray(res.data.data.keys)) return [];
    return res.data.data.keys.slice();
  }

  /**
   * EN: Soft-delete a specific version (or the latest) of a KV v2 secret.
   *     Note: this is Vault's "delete" — it marks versions for removal but
   *     does not destroy the underlying data. Per project rules we still
   *     never remove or overwrite anything.
   * HE: מחיקה רכה של גרסה מסוימת (או האחרונה) של סוד ב-KV גרסה 2.
   *     הערה: זו פעולת "delete" של Vault — מסמנת גרסאות להסרה בלבד ולא
   *     מוחקת את הנתונים בפועל. בהתאם לכללי הפרויקט איננו מוחקים שום דבר.
   */
  async kvSoftDeleteVersion(path, versions) {
    if (!path) throw new VaultError('kvSoftDeleteVersion: path is required');
    if (!Array.isArray(versions) || versions.length === 0) {
      throw new VaultError('kvSoftDeleteVersion: versions array is required');
    }
    const res = await this.request({
      method: 'POST',
      path: `${this.kvMount}/delete/${encodePath(path)}`,
      body: { versions },
      engine: 'kv',
      op: 'kv-soft-delete',
    });
    return res.status === 204 || (res.data && res.data.warnings === undefined);
  }

  /**
   * EN: Undelete (restore) previously soft-deleted versions of a KV v2 secret.
   * HE: שחזור גרסאות שנמחקו רכות בסוד של KV גרסה 2.
   */
  async kvUndeleteVersion(path, versions) {
    if (!path) throw new VaultError('kvUndeleteVersion: path is required');
    if (!Array.isArray(versions) || versions.length === 0) {
      throw new VaultError('kvUndeleteVersion: versions array is required');
    }
    await this.request({
      method: 'POST',
      path: `${this.kvMount}/undelete/${encodePath(path)}`,
      body: { versions },
      engine: 'kv',
      op: 'kv-undelete',
    });
    return true;
  }

  /**
   * EN: Patch (partial update) a KV v2 secret — merges new keys into the
   *     existing data. Requires Vault 1.9+ and OpenBao 2.0+.
   * HE: עדכון חלקי (patch) של סוד ב-KV גרסה 2 — ממזג מפתחות חדשים לתוך
   *     הנתונים הקיימים. דורש Vault 1.9 ומעלה / OpenBao 2.0 ומעלה.
   */
  async kvPatch(path, data) {
    if (!path) throw new VaultError('kvPatch: path is required');
    if (!data || typeof data !== 'object') {
      throw new VaultError('kvPatch: data must be an object');
    }
    const res = await this.request({
      method: 'PATCH',
      path: `${this.kvMount}/data/${encodePath(path)}`,
      body: { data },
      headers: { 'Content-Type': 'application/merge-patch+json' },
      engine: 'kv',
      op: 'kv-patch',
    });
    return res.data && res.data.data ? res.data.data : {};
  }

  /**
   * EN: Retrieve metadata for a KV v2 secret (versions, created_time, etc.).
   * HE: מאחזר מטא-נתונים של סוד ב-KV גרסה 2 (גרסאות, זמן יצירה וכו').
   */
  async kvMetadata(path) {
    if (!path) throw new VaultError('kvMetadata: path is required');
    const res = await this.request({
      method: 'GET',
      path: `${this.kvMount}/metadata/${encodePath(path)}`,
      engine: 'kv',
      op: 'kv-metadata',
    });
    return res.data && res.data.data ? res.data.data : null;
  }

  // -------------------------------------------------------------------------
  // Transit engine / מנוע Transit
  // -------------------------------------------------------------------------

  /**
   * EN: Create a named Transit key (idempotent on the server). Supported
   *     types include aes256-gcm96, chacha20-poly1305, ed25519, rsa-2048...
   * HE: יוצר מפתח Transit בשם נתון (אידמפוטנטי בצד השרת). סוגים נתמכים:
   *     aes256-gcm96, chacha20-poly1305, ed25519, rsa-2048 ועוד.
   */
  async transitCreateKey(name, options = {}) {
    if (!name) throw new VaultError('transitCreateKey: name is required');
    const body = {
      type: options.type || 'aes256-gcm96',
      exportable: Boolean(options.exportable),
      allow_plaintext_backup: Boolean(options.allow_plaintext_backup),
      derived: Boolean(options.derived),
    };
    if (options.convergent_encryption !== undefined) {
      body.convergent_encryption = Boolean(options.convergent_encryption);
    }
    const res = await this.request({
      method: 'POST',
      path: `${this.transitMount}/keys/${encodePath(name)}`,
      body,
      engine: 'transit',
      op: 'create-key',
    });
    return res.data || {};
  }

  /**
   * EN: Encrypt plaintext with a Transit key. `plaintext` can be a string or
   *     a Buffer; it will be base64-encoded before transmission. Returns the
   *     `{ ciphertext, key_version }` object that Vault generates.
   * HE: מצפין plaintext באמצעות מפתח Transit. `plaintext` יכול להיות מחרוזת
   *     או Buffer ויומר ל-base64 לפני השליחה. מחזיר את `{ ciphertext, key_version }`
   *     ש-Vault מייצר.
   */
  async transitEncrypt(keyName, plaintext, options = {}) {
    if (!keyName) throw new VaultError('transitEncrypt: keyName is required');
    if (plaintext === undefined || plaintext === null) {
      throw new VaultError('transitEncrypt: plaintext is required');
    }
    const buf = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(String(plaintext), 'utf8');
    const body = { plaintext: buf.toString('base64') };
    if (options.context) {
      body.context = Buffer.from(String(options.context), 'utf8').toString('base64');
    }
    if (Number.isFinite(options.key_version)) body.key_version = options.key_version;
    if (options.associated_data) {
      body.associated_data = Buffer.from(String(options.associated_data), 'utf8').toString('base64');
    }

    const res = await this.request({
      method: 'POST',
      path: `${this.transitMount}/encrypt/${encodePath(keyName)}`,
      body,
      engine: 'transit',
      op: 'encrypt',
    });
    const data = (res.data && res.data.data) || {};
    return {
      ciphertext: data.ciphertext || '',
      key_version: data.key_version || 0,
    };
  }

  /**
   * EN: Decrypt a Transit ciphertext and return the plaintext as a Buffer.
   *     Pass `asString: true` in `options` to get a UTF-8 string.
   * HE: מפענח ciphertext של Transit ומחזיר את הטקסט המקורי כ-Buffer.
   *     ניתן להעביר `asString: true` כדי לקבל מחרוזת UTF-8.
   */
  async transitDecrypt(keyName, ciphertext, options = {}) {
    if (!keyName) throw new VaultError('transitDecrypt: keyName is required');
    if (!ciphertext) throw new VaultError('transitDecrypt: ciphertext is required');
    const body = { ciphertext };
    if (options.context) {
      body.context = Buffer.from(String(options.context), 'utf8').toString('base64');
    }
    if (options.associated_data) {
      body.associated_data = Buffer.from(String(options.associated_data), 'utf8').toString('base64');
    }

    const res = await this.request({
      method: 'POST',
      path: `${this.transitMount}/decrypt/${encodePath(keyName)}`,
      body,
      engine: 'transit',
      op: 'decrypt',
    });
    const data = (res.data && res.data.data) || {};
    const buf = Buffer.from(data.plaintext || '', 'base64');
    return options.asString ? buf.toString('utf8') : buf;
  }

  /**
   * EN: Rewrap a ciphertext with the latest (or a specified) version of a
   *     Transit key, without exposing the plaintext. Useful for key rotation.
   * HE: עוטף מחדש ciphertext עם הגרסה האחרונה (או גרסה מסוימת) של מפתח
   *     Transit, בלי לחשוף את ה-plaintext. שימושי לסבב מפתחות.
   */
  async transitRewrap(keyName, ciphertext, options = {}) {
    if (!keyName) throw new VaultError('transitRewrap: keyName is required');
    if (!ciphertext) throw new VaultError('transitRewrap: ciphertext is required');
    const body = { ciphertext };
    if (Number.isFinite(options.key_version)) body.key_version = options.key_version;
    const res = await this.request({
      method: 'POST',
      path: `${this.transitMount}/rewrap/${encodePath(keyName)}`,
      body,
      engine: 'transit',
      op: 'rewrap',
    });
    const data = (res.data && res.data.data) || {};
    return {
      ciphertext: data.ciphertext || '',
      key_version: data.key_version || 0,
    };
  }

  /**
   * EN: Rotate a Transit key — creates a new version on the server.
   * HE: מבצע סבב (rotate) למפתח Transit — יוצר גרסה חדשה בשרת.
   */
  async transitRotateKey(keyName) {
    if (!keyName) throw new VaultError('transitRotateKey: keyName is required');
    await this.request({
      method: 'POST',
      path: `${this.transitMount}/keys/${encodePath(keyName)}/rotate`,
      body: {},
      engine: 'transit',
      op: 'rotate-key',
    });
    return true;
  }

  /**
   * EN: Compute an HMAC using a Transit key. Input may be string or Buffer.
   * HE: מחשב HMAC באמצעות מפתח Transit. הקלט יכול להיות מחרוזת או Buffer.
   */
  async transitHmac(keyName, input, options = {}) {
    if (!keyName) throw new VaultError('transitHmac: keyName is required');
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
    const body = {
      input: buf.toString('base64'),
      algorithm: options.algorithm || 'sha2-256',
    };
    const res = await this.request({
      method: 'POST',
      path: `${this.transitMount}/hmac/${encodePath(keyName)}`,
      body,
      engine: 'transit',
      op: 'hmac',
    });
    const data = (res.data && res.data.data) || {};
    return data.hmac || '';
  }

  /**
   * EN: Generate a cryptographically-strong random byte string via Transit.
   *     Returns raw bytes as a Buffer.
   * HE: מייצר מחרוזת בתים אקראית חזקה-קריפטוגרפית דרך Transit. מחזיר
   *     את הבתים הגולמיים כ-Buffer.
   */
  async transitRandom(bytes = 32) {
    const n = Math.max(1, Math.min(1024, Number(bytes) || 32));
    const res = await this.request({
      method: 'POST',
      path: `${this.transitMount}/random/${n}`,
      body: { format: 'base64' },
      engine: 'transit',
      op: 'random',
    });
    const data = (res.data && res.data.data) || {};
    return Buffer.from(data.random_bytes || '', 'base64');
  }

  // -------------------------------------------------------------------------
  // PKI engine / מנוע PKI
  // -------------------------------------------------------------------------

  /**
   * EN: Issue a new certificate from a PKI role. Returns the full Vault
   *     response data: certificate, issuing_ca, ca_chain, private_key,
   *     serial_number.
   * HE: מנפיק תעודה חדשה מתפקיד (role) במנוע PKI. מחזיר את כל נתוני
   *     התגובה של Vault: certificate, issuing_ca, ca_chain, private_key,
   *     serial_number.
   */
  async pkiIssueCert(role, params = {}) {
    if (!role) throw new VaultError('pkiIssueCert: role is required');
    if (!params || typeof params !== 'object') {
      throw new VaultError('pkiIssueCert: params must be an object');
    }
    const body = { ...params };
    if (body.common_name === undefined) {
      throw new VaultError('pkiIssueCert: common_name is required');
    }
    const res = await this.request({
      method: 'POST',
      path: `${this.pkiMount}/issue/${encodePath(role)}`,
      body,
      engine: 'pki',
      op: 'issue-cert',
    });
    return (res.data && res.data.data) || {};
  }

  /**
   * EN: Sign an externally-generated CSR using a PKI role. The private key
   *     never leaves the caller's process.
   * HE: חותם על CSR שנוצר חיצונית באמצעות תפקיד במנוע PKI. המפתח הפרטי
   *     לעולם לא עוזב את תהליך הקורא.
   */
  async pkiSignCsr(role, csrPem, params = {}) {
    if (!role) throw new VaultError('pkiSignCsr: role is required');
    if (!csrPem) throw new VaultError('pkiSignCsr: csr is required');
    const body = { ...params, csr: csrPem };
    if (body.common_name === undefined) {
      throw new VaultError('pkiSignCsr: common_name is required');
    }
    const res = await this.request({
      method: 'POST',
      path: `${this.pkiMount}/sign/${encodePath(role)}`,
      body,
      engine: 'pki',
      op: 'sign-csr',
    });
    return (res.data && res.data.data) || {};
  }

  /**
   * EN: Read a PKI role definition.
   * HE: קורא הגדרת תפקיד במנוע PKI.
   */
  async pkiReadRole(role) {
    if (!role) throw new VaultError('pkiReadRole: role is required');
    const res = await this.request({
      method: 'GET',
      path: `${this.pkiMount}/roles/${encodePath(role)}`,
      engine: 'pki',
      op: 'read-role',
    });
    return (res.data && res.data.data) || null;
  }

  /**
   * EN: List all defined PKI roles.
   * HE: מציג את כל התפקידים המוגדרים במנוע PKI.
   */
  async pkiListRoles() {
    const res = await this.request({
      method: 'GET',
      path: `${this.pkiMount}/roles?list=true`,
      engine: 'pki',
      op: 'list-roles',
    });
    const data = (res.data && res.data.data) || {};
    return Array.isArray(data.keys) ? data.keys.slice() : [];
  }

  /**
   * EN: Read the PKI CA certificate in PEM format.
   * HE: קורא את תעודת ה-CA של מנוע PKI בפורמט PEM.
   */
  async pkiReadCa() {
    const res = await this.request({
      method: 'GET',
      path: `${this.pkiMount}/ca/pem`,
      engine: 'pki',
      op: 'read-ca',
    });
    if (typeof res.data === 'string') return res.data;
    if (res.data && res.data._raw) return res.data._raw;
    return '';
  }

  /**
   * EN: Revoke a previously-issued certificate by serial number. This is a
   *     first-class Vault operation and does NOT violate the no-delete rule:
   *     the certificate record stays in the CRL, Vault merely stops honoring it.
   * HE: מבטל תעודה שהונפקה בעבר לפי מספר סידורי. פעולה מובנית של Vault
   *     שאינה סותרת את כלל "לעולם לא למחוק": רשומת התעודה נשארת ב-CRL,
   *     אך Vault מפסיק להכיר בה.
   */
  async pkiRevokeCert(serialNumber) {
    if (!serialNumber) throw new VaultError('pkiRevokeCert: serial_number is required');
    const res = await this.request({
      method: 'POST',
      path: `${this.pkiMount}/revoke`,
      body: { serial_number: serialNumber },
      engine: 'pki',
      op: 'revoke-cert',
    });
    return (res.data && res.data.data) || {};
  }

  /**
   * EN: Deterministic fingerprint helper for issued certs — useful for tests
   *     and audit correlation. Computes SHA-256 of the PEM body.
   * HE: עוזר לטביעת אצבע דטרמיניסטית של תעודה — שימושי לבדיקות ולמתאם
   *     ביקורת. מחשב SHA-256 על גוף ה-PEM.
   */
  static fingerprint(pem) {
    if (!pem) return '';
    return createHash('sha256').update(String(pem)).digest('hex');
  }
}

// ---------------------------------------------------------------------------
// Module exports / ייצוא
// ---------------------------------------------------------------------------

module.exports = {
  VaultClient,
  VaultError,
  // internals exposed for unit tests / פנימיים חשופים לבדיקות יחידה
  _internals: {
    safeJsonParse,
    encodePath,
    redact,
    defaultTransport,
    SENSITIVE_KEYS,
  },
};
