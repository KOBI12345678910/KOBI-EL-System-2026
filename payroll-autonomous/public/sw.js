/* ============================================================================
 * Techno-Kol ERP — Service Worker
 * Agent X-19 / Swarm 3 / PWA Offline Support
 * ----------------------------------------------------------------------------
 * Strategies:
 *   - Cache-first          : static assets (css, js, woff, ico, svg icons)
 *   - Network-first        : API calls (/api/*) with offline fallback JSON
 *   - Stale-while-revalidate: images (png/jpg/webp/gif)
 *   - Background sync      : queued POST/PUT/PATCH/DELETE writes
 *   - Update notification  : postMessage to clients on activation
 *
 * Zero dependencies. Vanilla Service Worker API only.
 * Hebrew RTL. Do not delete — extend only.
 * ========================================================================== */

'use strict';

/* ----------------------------------------------------------------------------
 * Cache versioning
 * -------------------------------------------------------------------------- */
const SW_VERSION = '1.0.0';
const BUILD_STAMP = '2026-04-11';
const CACHE_PREFIX = 'tk-erp';
const STATIC_CACHE = `${CACHE_PREFIX}-static-v${SW_VERSION}`;
const API_CACHE = `${CACHE_PREFIX}-api-v${SW_VERSION}`;
const IMG_CACHE = `${CACHE_PREFIX}-img-v${SW_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-v${SW_VERSION}`;

const ALL_CACHES = [STATIC_CACHE, API_CACHE, IMG_CACHE, RUNTIME_CACHE];

/* ----------------------------------------------------------------------------
 * Precache list — core shell
 * -------------------------------------------------------------------------- */
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html'
];

/* ----------------------------------------------------------------------------
 * Offline fallback JSON (API 503 substitute)
 * -------------------------------------------------------------------------- */
const OFFLINE_API_FALLBACK = {
  ok: false,
  offline: true,
  error: 'offline',
  message_he: 'אין חיבור לאינטרנט. הפעולה נשמרה ותישלח אוטומטית כשהחיבור יחזור.',
  timestamp: null
};

/* ----------------------------------------------------------------------------
 * URL classification helpers
 * -------------------------------------------------------------------------- */
function isStaticAsset(url) {
  return /\.(?:css|js|mjs|woff2?|ttf|eot|ico|svg|webmanifest)$/i.test(url.pathname);
}

function isImageAsset(url) {
  return /\.(?:png|jpe?g|gif|webp|avif|bmp)$/i.test(url.pathname);
}

function isApiCall(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/') || url.pathname.startsWith('/graphql');
}

function isNavigation(request) {
  return request.mode === 'navigate' || (request.method === 'GET' && request.headers.get('accept') && request.headers.get('accept').includes('text/html'));
}

function isMutation(request) {
  const m = request.method.toUpperCase();
  return m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE';
}

/* ----------------------------------------------------------------------------
 * INSTALL — precache core shell
 * -------------------------------------------------------------------------- */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    // best-effort precache; individual failures must not break install
    await Promise.all(PRECACHE_URLS.map(async (u) => {
      try {
        const req = new Request(u, { cache: 'reload' });
        const res = await fetch(req);
        if (res && res.ok) await cache.put(u, res.clone());
      } catch (_) {
        /* ignore precache miss */
      }
    }));
    // activate immediately on first install
    await self.skipWaiting();
  })());
});

/* ----------------------------------------------------------------------------
 * ACTIVATE — clean old caches + notify clients
 * -------------------------------------------------------------------------- */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // clean old caches
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k.startsWith(CACHE_PREFIX) && !ALL_CACHES.includes(k)) {
        return caches.delete(k);
      }
      return Promise.resolve();
    }));

    // enable navigation preload where supported
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch (_) { /* ignore */ }
    }

    await self.clients.claim();

    // broadcast version to all open clients so UI can show update toast
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({
        type: 'SW_UPDATED',
        version: SW_VERSION,
        build: BUILD_STAMP,
        message_he: 'גרסה חדשה זמינה — רענן את הדף'
      });
    }
  })());
});

/* ----------------------------------------------------------------------------
 * FETCH — route by strategy
 * -------------------------------------------------------------------------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // never touch non-http(s) schemes (chrome-extension:, data:, blob:, etc.)
  if (!req.url.startsWith('http')) return;

  const url = new URL(req.url);
  // skip cross-origin unless explicitly whitelisted
  const sameOrigin = url.origin === self.location.origin;

  // mutating writes to API → queue for background sync if offline
  if (isApiCall(url) && isMutation(req)) {
    event.respondWith(handleApiMutation(req));
    return;
  }

  // API GET → network-first
  if (sameOrigin && isApiCall(url) && req.method === 'GET') {
    event.respondWith(networkFirst(req, API_CACHE));
    return;
  }

  // images → stale-while-revalidate
  if (sameOrigin && isImageAsset(url)) {
    event.respondWith(staleWhileRevalidate(req, IMG_CACHE));
    return;
  }

  // static assets → cache-first
  if (sameOrigin && isStaticAsset(url)) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
    return;
  }

  // navigation requests → network-first with offline shell
  if (isNavigation(req)) {
    event.respondWith(navigationHandler(event));
    return;
  }

  // fallthrough → runtime cache
  if (sameOrigin) {
    event.respondWith(networkFirst(req, RUNTIME_CACHE));
  }
});

/* ----------------------------------------------------------------------------
 * STRATEGY: cache-first
 * -------------------------------------------------------------------------- */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    // no cache, no network → return synthetic 504
    return new Response('', { status: 504, statusText: 'Gateway Timeout (offline)' });
  }
}

/* ----------------------------------------------------------------------------
 * STRATEGY: network-first
 * -------------------------------------------------------------------------- */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;

    // API JSON fallback
    if (isApiCall(new URL(request.url))) {
      const body = Object.assign({}, OFFLINE_API_FALLBACK, { timestamp: Date.now() });
      return new Response(JSON.stringify(body), {
        status: 503,
        statusText: 'Service Unavailable (offline)',
        headers: { 'content-type': 'application/json; charset=utf-8', 'x-offline': '1' }
      });
    }
    return new Response('', { status: 504, statusText: 'Gateway Timeout (offline)' });
  }
}

/* ----------------------------------------------------------------------------
 * STRATEGY: stale-while-revalidate
 * -------------------------------------------------------------------------- */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || network;
}

/* ----------------------------------------------------------------------------
 * Navigation handler — network-first + offline shell
 * -------------------------------------------------------------------------- */
async function navigationHandler(event) {
  const request = event.request;
  try {
    const preload = event.preloadResponse ? await event.preloadResponse : null;
    if (preload) return preload;
    const res = await fetch(request);
    return res;
  } catch (err) {
    const cache = await caches.open(STATIC_CACHE);
    const shell = await cache.match('/index.html') || await cache.match('/offline.html') || await cache.match('/');
    if (shell) return shell;
    return new Response(
      '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>לא מחובר</title></head><body style="font-family:system-ui;background:#0b0d10;color:#e6e8eb;text-align:center;padding:40px"><h1>אין חיבור לאינטרנט</h1><p>המערכת תחזור לפעילות אוטומטית כשהחיבור יחזור.</p></body></html>',
      { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  }
}

/* ----------------------------------------------------------------------------
 * API mutation handler — try network, fall back to queueing
 * -------------------------------------------------------------------------- */
async function handleApiMutation(request) {
  try {
    const res = await fetch(request.clone());
    return res;
  } catch (err) {
    // queue for background sync
    await enqueueFailedRequest(request).catch(() => { /* queue failure is non-fatal */ });

    try {
      if ('sync' in self.registration) {
        await self.registration.sync.register('tk-erp-sync-queue');
      }
    } catch (_) { /* browsers w/o sync fall back to manual trigger from page */ }

    const body = Object.assign({}, OFFLINE_API_FALLBACK, {
      timestamp: Date.now(),
      queued: true,
      message_he: 'הפעולה נשמרה בתור. תישלח אוטומטית כשהחיבור יחזור.'
    });
    return new Response(JSON.stringify(body), {
      status: 202,
      statusText: 'Accepted (queued offline)',
      headers: { 'content-type': 'application/json; charset=utf-8', 'x-offline-queued': '1' }
    });
  }
}

/* ----------------------------------------------------------------------------
 * IndexedDB queue (SW side) — mirrors src/offline/sync-queue.js schema
 * -------------------------------------------------------------------------- */
const DB_NAME = 'tk-erp-offline';
const DB_VERSION = 1;
const STORE_NAME = 'sync-queue';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueueFailedRequest(request) {
  const db = await openDb();
  const body = await request.clone().text().catch(() => '');
  const headers = {};
  request.headers.forEach((v, k) => { headers[k] = v; });
  const entry = {
    url: request.url,
    method: request.method,
    headers,
    body,
    timestamp: Date.now(),
    attempts: 0,
    status: 'pending'
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function readAllPending() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []).filter((e) => e.status === 'pending'));
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function markProcessed(id, status) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const entry = getReq.result;
      if (!entry) return resolve(false);
      entry.status = status;
      entry.attempts = (entry.attempts || 0) + 1;
      entry.lastAttempt = Date.now();
      const put = store.put(entry);
      put.onsuccess = () => resolve(true);
      put.onerror = () => reject(put.error);
    };
    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete = () => db.close();
  });
}

/* ----------------------------------------------------------------------------
 * SYNC — drain queue with exponential backoff
 * -------------------------------------------------------------------------- */
self.addEventListener('sync', (event) => {
  if (event.tag === 'tk-erp-sync-queue') {
    event.waitUntil(drainQueue());
  }
});

async function drainQueue() {
  const pending = await readAllPending().catch(() => []);
  for (const entry of pending) {
    const ok = await replayWithBackoff(entry);
    await markProcessed(entry.id, ok ? 'done' : 'failed').catch(() => { /* ignore */ });

    // notify clients of each replay result
    const clients = await self.clients.matchAll({ includeUncontrolled: true });
    for (const client of clients) {
      client.postMessage({
        type: ok ? 'SYNC_REPLAYED' : 'SYNC_FAILED',
        id: entry.id,
        url: entry.url,
        method: entry.method
      });
    }
  }
}

async function replayWithBackoff(entry, maxAttempts = 5) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const init = {
        method: entry.method,
        headers: entry.headers || {},
        body: (entry.method === 'GET' || entry.method === 'HEAD') ? undefined : entry.body
      };
      const res = await fetch(entry.url, init);
      if (res && res.ok) return true;
      if (res && res.status >= 400 && res.status < 500) return false; // 4xx → don't retry
    } catch (_) { /* continue backoff */ }
    const delay = Math.min(30000, 500 * Math.pow(2, i)); // 0.5s, 1s, 2s, 4s, 8s (cap 30s)
    await new Promise((r) => setTimeout(r, delay));
  }
  return false;
}

/* ----------------------------------------------------------------------------
 * MESSAGE channel — manual control from page
 *   - SKIP_WAITING : force activate pending SW
 *   - DRAIN_QUEUE  : manual background drain (for browsers w/o sync)
 *   - GET_VERSION  : returns SW_VERSION
 * -------------------------------------------------------------------------- */
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'DRAIN_QUEUE') {
    event.waitUntil(drainQueue());
  } else if (data.type === 'GET_VERSION') {
    if (event.source && event.source.postMessage) {
      event.source.postMessage({ type: 'VERSION', version: SW_VERSION, build: BUILD_STAMP });
    }
  }
});
