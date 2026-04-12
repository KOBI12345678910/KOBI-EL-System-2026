/* ============================================================================
 * Techno-Kol ERP — Offline Sync Queue
 * Agent X-19 / Swarm 3 / PWA Offline Support
 * ----------------------------------------------------------------------------
 * IndexedDB-backed FIFO queue for failed/offline mutating requests.
 *
 * Public API:
 *   queueRequest({url, method, headers, body, timestamp}) → Promise<id>
 *   processQueue(options?)                                → Promise<{ok, fail}>
 *   clearProcessed()                                      → Promise<number>
 *   getQueueSize()                                        → Promise<number>
 *   getPending()                                          → Promise<Array>
 *   installOnlineListeners(onOnline?, onOffline?)         → unsubscribe fn
 *   isOnline()                                            → boolean
 *
 * Features:
 *   - Exponential backoff: 500ms, 1s, 2s, 4s, 8s … capped 30s
 *   - Non-retriable 4xx handling (marks failed, stops)
 *   - Offline indicator helpers + "back online" toast trigger
 *   - Zero deps. Compatible with real IndexedDB + fake-indexeddb (for tests).
 *   - Dependency injection: pass `idbFactory` to swap in fake-indexeddb.
 *
 * Hebrew RTL. Do not delete — extend only.
 * ========================================================================== */

'use strict';

export const DB_NAME = 'tk-erp-offline';
export const DB_VERSION = 1;
export const STORE_NAME = 'sync-queue';
export const SYNC_TAG = 'tk-erp-sync-queue';

export const STATUS = Object.freeze({
  PENDING: 'pending',
  DONE: 'done',
  FAILED: 'failed'
});

export const MESSAGES_HE = Object.freeze({
  offline: 'אין חיבור לאינטרנט — פעולות יישמרו בתור',
  online: 'החיבור חזר — מסנכרן נתונים',
  synced: 'הסנכרון הושלם בהצלחה',
  syncFailed: 'סנכרון נכשל — ננסה שוב'
});

/* ----------------------------------------------------------------------------
 * IDB factory resolution
 *   In browser: globalThis.indexedDB
 *   In tests : pass { idbFactory } (fake-indexeddb shim)
 * -------------------------------------------------------------------------- */
function getIdb(opts) {
  if (opts && opts.idbFactory) return opts.idbFactory;
  if (typeof indexedDB !== 'undefined') return indexedDB;
  if (typeof globalThis !== 'undefined' && globalThis.indexedDB) return globalThis.indexedDB;
  throw new Error('IndexedDB is not available in this environment');
}

/* ----------------------------------------------------------------------------
 * openDb — upgrade-safe
 * -------------------------------------------------------------------------- */
export function openDb(opts) {
  const idb = getIdb(opts);
  return new Promise((resolve, reject) => {
    let req;
    try {
      req = idb.open(DB_NAME, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true
        });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IDB open blocked — close other tabs'));
  });
}

function tx(db, mode) {
  const t = db.transaction(STORE_NAME, mode);
  return t.objectStore(STORE_NAME);
}

function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ----------------------------------------------------------------------------
 * queueRequest — add a new pending entry
 * -------------------------------------------------------------------------- */
export async function queueRequest(payload, opts) {
  if (!payload || typeof payload !== 'object') {
    throw new TypeError('queueRequest: payload object required');
  }
  if (!payload.url || typeof payload.url !== 'string') {
    throw new TypeError('queueRequest: payload.url required');
  }
  if (!payload.method || typeof payload.method !== 'string') {
    throw new TypeError('queueRequest: payload.method required');
  }

  const method = payload.method.toUpperCase();
  const entry = {
    url: payload.url,
    method,
    headers: payload.headers || {},
    body: typeof payload.body === 'undefined' ? null : payload.body,
    timestamp: typeof payload.timestamp === 'number' ? payload.timestamp : Date.now(),
    attempts: 0,
    status: STATUS.PENDING,
    lastAttempt: null,
    lastError: null
  };

  const db = await openDb(opts);
  try {
    const id = await promisifyRequest(tx(db, 'readwrite').add(entry));
    return id;
  } finally {
    try { db.close(); } catch (_) { /* noop */ }
  }
}

/* ----------------------------------------------------------------------------
 * getPending — returns all pending entries, sorted by timestamp ascending
 * -------------------------------------------------------------------------- */
export async function getPending(opts) {
  const db = await openDb(opts);
  try {
    const all = (await promisifyRequest(tx(db, 'readonly').getAll())) || [];
    return all
      .filter((e) => e.status === STATUS.PENDING)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  } finally {
    try { db.close(); } catch (_) { /* noop */ }
  }
}

/* ----------------------------------------------------------------------------
 * getQueueSize — count pending only
 * -------------------------------------------------------------------------- */
export async function getQueueSize(opts) {
  const pending = await getPending(opts);
  return pending.length;
}

/* ----------------------------------------------------------------------------
 * updateEntry — internal helper
 * -------------------------------------------------------------------------- */
async function updateEntry(db, id, patch) {
  const store = tx(db, 'readwrite');
  const current = await promisifyRequest(store.get(id));
  if (!current) return false;
  const merged = Object.assign({}, current, patch);
  await promisifyRequest(store.put(merged));
  return true;
}

/* ----------------------------------------------------------------------------
 * clearProcessed — delete all non-pending entries (done + failed optional)
 * -------------------------------------------------------------------------- */
export async function clearProcessed(opts) {
  const includeFailed = opts && opts.includeFailed === false ? false : true;
  const db = await openDb(opts);
  try {
    const all = (await promisifyRequest(tx(db, 'readonly').getAll())) || [];
    const toRemove = all.filter((e) => {
      if (e.status === STATUS.DONE) return true;
      if (includeFailed && e.status === STATUS.FAILED) return true;
      return false;
    });
    for (const entry of toRemove) {
      await promisifyRequest(tx(db, 'readwrite').delete(entry.id));
    }
    return toRemove.length;
  } finally {
    try { db.close(); } catch (_) { /* noop */ }
  }
}

/* ----------------------------------------------------------------------------
 * clearAll — wipe entire queue (dangerous — only for explicit reset)
 * -------------------------------------------------------------------------- */
export async function clearAll(opts) {
  const db = await openDb(opts);
  try {
    await promisifyRequest(tx(db, 'readwrite').clear());
    return true;
  } finally {
    try { db.close(); } catch (_) { /* noop */ }
  }
}

/* ----------------------------------------------------------------------------
 * backoffDelay — exponential: 500 * 2^n, cap 30s
 * -------------------------------------------------------------------------- */
export function backoffDelay(attempt, opts) {
  const base = (opts && opts.base) || 500;
  const cap = (opts && opts.cap) || 30000;
  const n = Math.max(0, attempt | 0);
  const delay = base * Math.pow(2, n);
  return Math.min(cap, delay);
}

/* ----------------------------------------------------------------------------
 * sleep — test-friendly (injectable)
 * -------------------------------------------------------------------------- */
function sleep(ms, opts) {
  if (opts && typeof opts.sleep === 'function') return opts.sleep(ms);
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

/* ----------------------------------------------------------------------------
 * fetchFn resolver — allows injection for tests
 * -------------------------------------------------------------------------- */
function resolveFetch(opts) {
  if (opts && typeof opts.fetchFn === 'function') return opts.fetchFn;
  if (typeof fetch === 'function') return fetch.bind(globalThis);
  throw new Error('fetch is not available — pass opts.fetchFn');
}

/* ----------------------------------------------------------------------------
 * processQueue — drain pending with retry/backoff
 *
 *   options:
 *     maxAttempts  : per-entry retry cap (default 5)
 *     fetchFn      : injectable fetch (default: global fetch)
 *     sleep        : injectable delay fn (default: setTimeout)
 *     idbFactory   : injectable IDB (default: global indexedDB)
 *     onProgress   : fn({ processed, remaining, entry, ok })
 * -------------------------------------------------------------------------- */
export async function processQueue(opts) {
  const options = opts || {};
  const maxAttempts = options.maxAttempts || 5;
  const fetchFn = resolveFetch(options);
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  const pending = await getPending(options);
  const summary = { total: pending.length, ok: 0, fail: 0, skipped: 0 };
  if (pending.length === 0) return summary;

  const db = await openDb(options);
  try {
    for (let idx = 0; idx < pending.length; idx++) {
      const entry = pending[idx];
      let success = false;
      let lastError = null;
      let nonRetriable = false;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        entry.attempts = (entry.attempts || 0) + 1;
        entry.lastAttempt = Date.now();

        try {
          const init = {
            method: entry.method,
            headers: entry.headers || {}
          };
          if (entry.method !== 'GET' && entry.method !== 'HEAD' && entry.body != null) {
            init.body = entry.body;
          }
          const res = await fetchFn(entry.url, init);
          if (res && res.ok) {
            success = true;
            break;
          }
          if (res && res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
            // 4xx → don't retry (except 408 Request Timeout, 429 Too Many Requests)
            nonRetriable = true;
            lastError = `HTTP ${res.status}`;
            break;
          }
          lastError = `HTTP ${res ? res.status : 'network'}`;
        } catch (err) {
          lastError = (err && err.message) || String(err);
        }

        // back off before next attempt (skip after final)
        if (attempt < maxAttempts - 1) {
          await sleep(backoffDelay(attempt), options);
        }
      }

      const newStatus = success ? STATUS.DONE : (nonRetriable ? STATUS.FAILED : STATUS.FAILED);
      await updateEntry(db, entry.id, {
        status: newStatus,
        attempts: entry.attempts,
        lastAttempt: entry.lastAttempt,
        lastError: success ? null : lastError
      });

      if (success) summary.ok++; else summary.fail++;

      if (onProgress) {
        try {
          onProgress({
            processed: idx + 1,
            remaining: pending.length - (idx + 1),
            entry,
            ok: success,
            error: lastError
          });
        } catch (_) { /* swallow listener errors */ }
      }
    }
    return summary;
  } finally {
    try { db.close(); } catch (_) { /* noop */ }
  }
}

/* ----------------------------------------------------------------------------
 * isOnline — canonical navigator.onLine wrapper (safe in SW / node)
 * -------------------------------------------------------------------------- */
export function isOnline() {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true; // assume online if we can't tell
}

/* ----------------------------------------------------------------------------
 * installOnlineListeners — wires online/offline events with Hebrew toasts
 *
 *   onOnline  : fn() — called when back online
 *   onOffline : fn() — called when going offline
 *
 *   returns: unsubscribe fn
 * -------------------------------------------------------------------------- */
export function installOnlineListeners(onOnline, onOffline) {
  if (typeof window === 'undefined') return () => {};
  const handleOnline = () => {
    if (typeof onOnline === 'function') onOnline(MESSAGES_HE.online);
  };
  const handleOffline = () => {
    if (typeof onOffline === 'function') onOffline(MESSAGES_HE.offline);
  };
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/* ----------------------------------------------------------------------------
 * renderOfflineBadge — vanilla DOM offline indicator (RTL)
 *
 * Mounts a fixed top-banner badge. Idempotent: calling twice returns the
 * existing element. Returns the element (caller may style/attach).
 * -------------------------------------------------------------------------- */
export function renderOfflineBadge(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return null;
  const existing = d.getElementById('tk-erp-offline-badge');
  if (existing) return existing;
  const el = d.createElement('div');
  el.id = 'tk-erp-offline-badge';
  el.setAttribute('dir', 'rtl');
  el.setAttribute('lang', 'he-IL');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.style.cssText = [
    'position:fixed',
    'top:0',
    'right:0',
    'left:0',
    'z-index:99999',
    'padding:8px 16px',
    'background:#b8860b',
    'color:#fff',
    'font-family:system-ui,Segoe UI,Tahoma,Arial,sans-serif',
    'font-size:14px',
    'text-align:center',
    'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
    'transform:translateY(-100%)',
    'transition:transform 200ms ease-out',
    'pointer-events:none'
  ].join(';');
  el.textContent = MESSAGES_HE.offline;
  if (d.body) d.body.appendChild(el);
  return el;
}

export function showOfflineBadge(doc) {
  const el = renderOfflineBadge(doc);
  if (el) el.style.transform = 'translateY(0)';
  return el;
}

export function hideOfflineBadge(doc) {
  const d = doc || (typeof document !== 'undefined' ? document : null);
  if (!d) return;
  const el = d.getElementById('tk-erp-offline-badge');
  if (el) el.style.transform = 'translateY(-100%)';
}

/* ----------------------------------------------------------------------------
 * showToast — minimal RTL toast for "back online"
 * -------------------------------------------------------------------------- */
export function showToast(message, opts) {
  const d = (opts && opts.document) || (typeof document !== 'undefined' ? document : null);
  if (!d || !d.body) return null;
  const toast = d.createElement('div');
  toast.setAttribute('dir', 'rtl');
  toast.setAttribute('lang', 'he-IL');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.className = 'tk-erp-toast';
  toast.style.cssText = [
    'position:fixed',
    'bottom:24px',
    'right:24px',
    'padding:12px 20px',
    'background:#4a9eff',
    'color:#fff',
    'border-radius:8px',
    'font-family:system-ui,Segoe UI,Tahoma,Arial,sans-serif',
    'font-size:14px',
    'box-shadow:0 4px 12px rgba(0,0,0,0.3)',
    'z-index:99999',
    'opacity:0',
    'transition:opacity 180ms ease-out'
  ].join(';');
  toast.textContent = String(message == null ? '' : message);
  d.body.appendChild(toast);
  // fade in
  setTimeout(() => { toast.style.opacity = '1'; }, 10);
  const ttl = (opts && opts.ttl) || 3500;
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 220);
  }, ttl);
  return toast;
}

/* ----------------------------------------------------------------------------
 * autoProcessOnReconnect — glue: drain queue whenever browser goes online
 * -------------------------------------------------------------------------- */
export function autoProcessOnReconnect(options) {
  if (typeof window === 'undefined') return () => {};
  const handler = async () => {
    try {
      showToast(MESSAGES_HE.online, options);
      const result = await processQueue(options || {});
      if (result.ok > 0) showToast(MESSAGES_HE.synced, options);
      if (result.fail > 0) showToast(MESSAGES_HE.syncFailed, options);
    } catch (_) { /* swallow */ }
  };
  window.addEventListener('online', handler);
  return () => window.removeEventListener('online', handler);
}

/* ----------------------------------------------------------------------------
 * Default export — namespaced bundle for consumers preferring default import
 * -------------------------------------------------------------------------- */
const SyncQueue = {
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
  SYNC_TAG,
  STATUS,
  MESSAGES_HE,
  openDb,
  queueRequest,
  getPending,
  getQueueSize,
  processQueue,
  clearProcessed,
  clearAll,
  backoffDelay,
  isOnline,
  installOnlineListeners,
  renderOfflineBadge,
  showOfflineBadge,
  hideOfflineBadge,
  showToast,
  autoProcessOnReconnect
};

export default SyncQueue;
