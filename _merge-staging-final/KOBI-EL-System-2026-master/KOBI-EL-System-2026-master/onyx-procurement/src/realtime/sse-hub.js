/**
 * SSE Hub — Real-time Operations Event Bus
 * ─────────────────────────────────────────
 * Agent X-13 (Swarm 3) / Techno-Kol Uzi mega-ERP 2026
 *
 * A zero-dependency Server-Sent Events hub. Uses only Node built-ins and
 * plays nicely with Express (or any req/res pair that matches the Node
 * http contract). No external packages, no WebSockets.
 *
 * Channels (configurable, defaults listed):
 *   - invoices       — invoice created / updated / paid
 *   - payments       — payment received / reconciled / failed
 *   - inventory      — stock level changed, low stock alert
 *   - alerts         — operational alerts (cross-channel)
 *   - system_health  — heartbeat + health metrics
 *
 * Wire format (native SSE):
 *   id: <monotonic-event-id>
 *   event: <channel>.<type>   // e.g. "invoices.created"
 *   data: <json payload>
 *   \n
 *
 * Features:
 *   • createHub() factory returns { subscribe, publish, broadcastAll,
 *     getStats, close }
 *   • In-memory ring buffer (max 1000 events) for replay via Last-Event-Id
 *   • Channel subscription via ?channels=a,b,c query string
 *   • Auth via X-API-Key header (shared secret list)
 *   • Heartbeat every 30s as SSE comment (":hb <ts>\n\n") so proxies
 *     don't close the socket
 *   • Memory-safe: ring buffer drops oldest, per-client send queue is
 *     non-blocking
 *   • Clean disconnect handling (close, error, aborted)
 *
 * Usage (Express):
 *
 *   const express = require('express');
 *   const { createHub } = require('./realtime/sse-hub');
 *
 *   const app = express();
 *   const hub = createHub({
 *     apiKeys: [process.env.SSE_API_KEY],
 *     heartbeatMs: 30_000,
 *     ringSize: 1000,
 *   });
 *
 *   app.get('/api/stream/events', (req, res) => hub.subscribe(req, res));
 *
 *   // Emit events from anywhere in the app:
 *   hub.publish('invoices', { type: 'created', id: 'INV-1', totalILS: 2500 });
 *
 * Zero external deps. Hebrew RTL + bilingual payloads welcome.
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────

const DEFAULT_CHANNELS = Object.freeze([
  'invoices',
  'payments',
  'inventory',
  'alerts',
  'system_health',
]);

const DEFAULT_RING_SIZE   = 1000;
const DEFAULT_HEARTBEAT   = 30_000;
const MAX_CLIENT_QUEUE    = 500; // drop client when queue exceeds this

// ─── Small helpers ────────────────────────────────────────────────────

function safeJSON(obj) {
  try {
    return JSON.stringify(obj);
  } catch (_err) {
    return JSON.stringify({ error: 'unserializable' });
  }
}

function nowMs() {
  return Date.now();
}

function parseChannelsQuery(req, allowed) {
  // Extract ?channels=a,b,c from the raw URL (no dep on query-parser)
  const url = req && req.url ? String(req.url) : '/';
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return allowed.slice();

  const qs = url.slice(qIdx + 1);
  const pairs = qs.split('&');
  for (const p of pairs) {
    const [rawK, rawV] = p.split('=');
    if (!rawK) continue;
    const k = decodeURIComponent(rawK);
    if (k !== 'channels') continue;
    const v = decodeURIComponent(rawV || '');
    if (!v) return allowed.slice();
    const asked = v.split(',').map(s => s.trim()).filter(Boolean);
    const ok = asked.filter(c => allowed.includes(c));
    return ok.length ? ok : allowed.slice();
  }
  return allowed.slice();
}

function getHeader(req, name) {
  if (!req || !req.headers) return null;
  const v = req.headers[name.toLowerCase()];
  if (v == null) return null;
  return Array.isArray(v) ? v[0] : String(v);
}

// ─── Ring buffer for replay ───────────────────────────────────────────

class RingBuffer {
  constructor(size) {
    this.size = Math.max(1, size | 0);
    this.items = [];
  }
  push(item) {
    this.items.push(item);
    if (this.items.length > this.size) {
      // drop oldest — memory safety
      this.items.splice(0, this.items.length - this.size);
    }
  }
  sinceId(lastId) {
    if (lastId == null) return [];
    const lid = Number(lastId);
    if (!Number.isFinite(lid)) return [];
    const out = [];
    for (const ev of this.items) {
      if (ev.id > lid) out.push(ev);
    }
    return out;
  }
  length() { return this.items.length; }
}

// ─── Wire formatter ───────────────────────────────────────────────────

function formatSSE(event) {
  // event = { id, channel, type, data }
  const eventName = event.type
    ? `${event.channel}.${event.type}`
    : event.channel;
  const payload = safeJSON(event.data == null ? {} : event.data);
  return `id: ${event.id}\nevent: ${eventName}\ndata: ${payload}\n\n`;
}

function formatComment(text) {
  return `: ${String(text).replace(/\n/g, ' ')}\n\n`;
}

// ─── Hub factory ──────────────────────────────────────────────────────

function createHub(options = {}) {
  const opts = {
    channels:    Array.isArray(options.channels) && options.channels.length
                   ? options.channels.slice()
                   : DEFAULT_CHANNELS.slice(),
    apiKeys:     Array.isArray(options.apiKeys) ? options.apiKeys.slice() : [],
    ringSize:    Number.isInteger(options.ringSize) ? options.ringSize : DEFAULT_RING_SIZE,
    heartbeatMs: Number.isInteger(options.heartbeatMs) ? options.heartbeatMs : DEFAULT_HEARTBEAT,
    requireAuth: options.requireAuth !== false, // default true
    logger:      options.logger || null,
  };

  const ring = new RingBuffer(opts.ringSize);
  const clients = new Set();
  let nextEventId = 1;
  let totalPublished = 0;
  let totalDropped = 0;
  let totalConnected = 0;
  let totalDisconnected = 0;
  const startedAt = nowMs();

  let heartbeatTimer = null;
  let closed = false;

  // ── Auth gate ──────────────────────────────────────────────
  function checkAuth(req) {
    if (!opts.requireAuth) return { ok: true };
    if (!opts.apiKeys.length) {
      return { ok: false, status: 503, reason: 'no_api_keys_configured' };
    }
    const key = getHeader(req, 'X-API-Key');
    if (!key) return { ok: false, status: 401, reason: 'missing_api_key' };
    if (!opts.apiKeys.includes(key)) {
      return { ok: false, status: 403, reason: 'invalid_api_key' };
    }
    return { ok: true };
  }

  // ── Write helper (non-blocking; drops on back-pressure) ────
  function clientWrite(client, chunk) {
    if (client.dead) return false;
    try {
      // Node http writable: write returns false when back-pressured.
      // We keep a lightweight queued count to detect slow clients.
      const ok = client.res.write(chunk);
      if (!ok) {
        client.pendingWrites++;
        if (client.pendingWrites > MAX_CLIENT_QUEUE) {
          // Slow client — disconnect to protect hub memory.
          dropClient(client, 'slow_client');
          return false;
        }
        // Wait for drain before counting down.
        client.res.once('drain', () => {
          client.pendingWrites = Math.max(0, client.pendingWrites - 1);
        });
      }
      return true;
    } catch (_err) {
      dropClient(client, 'write_error');
      return false;
    }
  }

  function dropClient(client, reason) {
    if (client.dead) return;
    client.dead = true;
    clients.delete(client);
    totalDisconnected++;
    try { client.res.end(); } catch (_e) { /* already closed */ }
    if (opts.logger) {
      try { opts.logger.info && opts.logger.info('sse_client_drop', { id: client.id, reason }); } catch (_e) { /* ignore */ }
    }
  }

  function dispatchToClient(client, event) {
    if (client.dead) return;
    if (!client.channels.includes(event.channel)) return;
    clientWrite(client, formatSSE(event));
  }

  function dispatchAll(event) {
    for (const c of clients) dispatchToClient(c, event);
  }

  // ── Heartbeat loop ─────────────────────────────────────────
  function startHeartbeat() {
    if (heartbeatTimer || opts.heartbeatMs <= 0) return;
    heartbeatTimer = setInterval(() => {
      if (closed) return;
      const comment = formatComment(`hb ${nowMs()}`);
      for (const c of clients) clientWrite(c, comment);
    }, opts.heartbeatMs);
    // Allow Node process to exit cleanly
    if (heartbeatTimer.unref) heartbeatTimer.unref();
  }

  function stopHeartbeat() {
    if (!heartbeatTimer) return;
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  // ── Public: subscribe ──────────────────────────────────────
  function subscribe(req, res, explicitChannels) {
    if (closed) {
      res.statusCode = 503;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('hub_closed');
      return null;
    }

    const auth = checkAuth(req);
    if (!auth.ok) {
      res.statusCode = auth.status || 401;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(safeJSON({ error: auth.reason }));
      return null;
    }

    // Determine client's channel subset
    let channels;
    if (Array.isArray(explicitChannels) && explicitChannels.length) {
      channels = explicitChannels.filter(c => opts.channels.includes(c));
      if (!channels.length) channels = opts.channels.slice();
    } else {
      channels = parseChannelsQuery(req, opts.channels);
    }

    // SSE response headers
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // defeat nginx buffering
    // CORS: permissive by default — tighten at the edge
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', 'X-Event-Count');

    if (typeof res.flushHeaders === 'function') {
      try { res.flushHeaders(); } catch (_e) { /* ignore */ }
    }

    const client = {
      id:            ++totalConnected,
      res,
      channels,
      connectedAt:   nowMs(),
      pendingWrites: 0,
      dead:          false,
    };
    clients.add(client);

    // Hello frame — client sees connect ack before first event
    clientWrite(
      client,
      formatComment(`connected id=${client.id} channels=${channels.join(',')}`)
    );

    // Replay missed events (Last-Event-Id header from client)
    const lastId = getHeader(req, 'Last-Event-Id');
    if (lastId != null) {
      const missed = ring.sinceId(lastId).filter(ev => channels.includes(ev.channel));
      for (const ev of missed) clientWrite(client, formatSSE(ev));
      if (missed.length && opts.logger && opts.logger.info) {
        try { opts.logger.info('sse_replay', { clientId: client.id, count: missed.length }); } catch (_e) { /* ignore */ }
      }
    }

    // Teardown on socket events
    const cleanup = (reason) => dropClient(client, reason);
    if (req && typeof req.on === 'function') {
      req.on('close', () => cleanup('req_close'));
      req.on('aborted', () => cleanup('req_aborted'));
      req.on('error', () => cleanup('req_error'));
    }
    if (res && typeof res.on === 'function') {
      res.on('close', () => cleanup('res_close'));
      res.on('error', () => cleanup('res_error'));
    }

    if (clients.size === 1) startHeartbeat();
    return client;
  }

  // ── Public: publish to a single channel ────────────────────
  function publish(channel, eventOrData) {
    if (closed) return null;
    if (!opts.channels.includes(channel)) {
      // Unknown channel — ignore softly so callers aren't brittle.
      return null;
    }
    const body = (eventOrData && typeof eventOrData === 'object')
      ? eventOrData
      : { value: eventOrData };
    const event = {
      id:      nextEventId++,
      channel,
      type:    body.type || 'message',
      data:    body,
      ts:      nowMs(),
    };
    ring.push(event);
    totalPublished++;
    dispatchAll(event);
    return event;
  }

  // ── Public: broadcast across every channel ─────────────────
  function broadcastAll(eventOrData) {
    if (closed) return [];
    const out = [];
    for (const ch of opts.channels) out.push(publish(ch, eventOrData));
    return out;
  }

  // ── Public: stats ──────────────────────────────────────────
  function getStats() {
    return {
      clientsConnected:    clients.size,
      totalConnected,
      totalDisconnected,
      totalPublished,
      totalDropped,
      ringSize:            ring.length(),
      ringCapacity:        ring.size,
      channels:            opts.channels.slice(),
      heartbeatMs:         opts.heartbeatMs,
      startedAt,
      uptimeMs:            nowMs() - startedAt,
      closed,
    };
  }

  // ── Public: graceful shutdown ──────────────────────────────
  function close() {
    if (closed) return;
    closed = true;
    stopHeartbeat();
    for (const c of Array.from(clients)) dropClient(c, 'hub_close');
  }

  return {
    subscribe,
    publish,
    broadcastAll,
    getStats,
    close,
    // Exposed for tests / introspection:
    _ring:        ring,
    _clients:     clients,
    _options:     opts,
    _formatSSE:   formatSSE,
    _formatComment: formatComment,
  };
}

module.exports = {
  createHub,
  DEFAULT_CHANNELS,
  RingBuffer,
  formatSSE,
  formatComment,
  parseChannelsQuery,
};
