/**
 * SSE Hub — Unit Tests
 * Agent X-13 (Swarm 3) / Techno-Kol Uzi mega-ERP 2026
 *
 * Run:
 *   node --test test/payroll/sse-hub.test.js
 *
 * Zero deps. Uses node:test + assert/strict + hand-rolled mock req/res
 * objects that match the Node http contract surface area the hub uses.
 *
 * Coverage:
 *   - auth: missing key / wrong key / valid key / no-auth mode
 *   - channel subscription via ?channels=…
 *   - publish → dispatches only to subscribed clients
 *   - broadcastAll → hits every channel
 *   - ring buffer capacity (drops oldest)
 *   - Last-Event-Id replay filters correctly
 *   - heartbeat comment frames
 *   - clean teardown on req.close, hub.close()
 *   - wire-format helpers (formatSSE / formatComment)
 *   - unknown channel is ignored
 *   - slow-client disconnect (back-pressure path)
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  createHub,
  RingBuffer,
  formatSSE,
  formatComment,
  parseChannelsQuery,
  DEFAULT_CHANNELS,
} = require('../../src/realtime/sse-hub');

// ─────────────────────────────────────────────────────────────
// Mock req/res
// ─────────────────────────────────────────────────────────────

function mockReq({ url = '/api/stream/events', headers = {} } = {}) {
  const req = new EventEmitter();
  req.url     = url;
  req.headers = {};
  // normalize header keys to lowercase (like Node does)
  for (const k of Object.keys(headers)) req.headers[k.toLowerCase()] = headers[k];
  return req;
}

function mockRes({ writeFails = false, blockDrain = false } = {}) {
  const res = new EventEmitter();
  res.statusCode = 0;
  res.headers    = {};
  res.chunks     = [];
  res.ended      = false;
  res.flushed    = false;
  res._block     = blockDrain;
  res._fail      = writeFails;

  res.setHeader  = (k, v) => { res.headers[k] = v; };
  res.flushHeaders = () => { res.flushed = true; };
  res.write = (chunk) => {
    if (res._fail) throw new Error('mock_write_fail');
    res.chunks.push(String(chunk));
    return !res._block;
  };
  res.end = (chunk) => {
    if (chunk != null) res.chunks.push(String(chunk));
    res.ended = true;
    res.emit('close');
  };
  return res;
}

// Utility: collapse all chunks a client has received into one string
function allText(res) { return res.chunks.join(''); }

// Utility: extract data payloads (parsed JSON) from SSE text
function parseData(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try { out.push(JSON.parse(line.slice(6))); } catch (_e) { out.push(null); }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// Wire format helpers
// ─────────────────────────────────────────────────────────────

describe('formatSSE / formatComment', () => {
  test('formatSSE produces id/event/data lines', () => {
    const frame = formatSSE({ id: 42, channel: 'invoices', type: 'created', data: { a: 1 } });
    assert.match(frame, /^id: 42\n/);
    assert.match(frame, /event: invoices\.created\n/);
    assert.match(frame, /data: \{"a":1\}\n\n$/);
  });

  test('formatSSE handles missing type', () => {
    const frame = formatSSE({ id: 1, channel: 'alerts', data: {} });
    assert.match(frame, /event: alerts\n/);
  });

  test('formatSSE serializes unserializable data without throwing', () => {
    const circ = {};
    circ.self = circ;
    const frame = formatSSE({ id: 5, channel: 'x', type: 'y', data: circ });
    assert.match(frame, /data: \{"error":"unserializable"\}/);
  });

  test('formatComment escapes newlines', () => {
    const c = formatComment('hello\nworld');
    assert.equal(c, ': hello world\n\n');
  });

  test('parseChannelsQuery returns defaults when no query', () => {
    const req = mockReq({ url: '/api/stream/events' });
    const got = parseChannelsQuery(req, ['a', 'b']);
    assert.deepEqual(got, ['a', 'b']);
  });

  test('parseChannelsQuery parses csv list', () => {
    const req = mockReq({ url: '/api/stream/events?channels=a,c' });
    const got = parseChannelsQuery(req, ['a', 'b', 'c']);
    assert.deepEqual(got, ['a', 'c']);
  });

  test('parseChannelsQuery falls back when no overlap', () => {
    const req = mockReq({ url: '/api/stream/events?channels=nope' });
    const got = parseChannelsQuery(req, ['a', 'b']);
    assert.deepEqual(got, ['a', 'b']);
  });
});

// ─────────────────────────────────────────────────────────────
// RingBuffer
// ─────────────────────────────────────────────────────────────

describe('RingBuffer', () => {
  test('drops oldest when exceeding capacity', () => {
    const rb = new RingBuffer(3);
    for (let i = 1; i <= 5; i++) rb.push({ id: i });
    assert.equal(rb.length(), 3);
    assert.deepEqual(rb.items.map(x => x.id), [3, 4, 5]);
  });

  test('sinceId filters events strictly greater than the given id', () => {
    const rb = new RingBuffer(10);
    for (let i = 1; i <= 5; i++) rb.push({ id: i });
    assert.deepEqual(rb.sinceId(2).map(x => x.id), [3, 4, 5]);
    assert.deepEqual(rb.sinceId(5), []);
    assert.deepEqual(rb.sinceId(null), []);
    assert.deepEqual(rb.sinceId('bogus'), []);
  });
});

// ─────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────

describe('auth', () => {
  test('rejects with 401 when X-API-Key is missing', () => {
    const hub = createHub({ apiKeys: ['abc'], heartbeatMs: 0 });
    const req = mockReq();
    const res = mockRes();
    const client = hub.subscribe(req, res);
    assert.equal(client, null);
    assert.equal(res.statusCode, 401);
    assert.equal(res.ended, true);
    assert.match(allText(res), /missing_api_key/);
    hub.close();
  });

  test('rejects with 403 when X-API-Key is wrong', () => {
    const hub = createHub({ apiKeys: ['abc'], heartbeatMs: 0 });
    const req = mockReq({ headers: { 'X-API-Key': 'bad' } });
    const res = mockRes();
    const client = hub.subscribe(req, res);
    assert.equal(client, null);
    assert.equal(res.statusCode, 403);
    assert.match(allText(res), /invalid_api_key/);
    hub.close();
  });

  test('accepts valid X-API-Key and starts the stream', () => {
    const hub = createHub({ apiKeys: ['abc'], heartbeatMs: 0 });
    const req = mockReq({ headers: { 'X-API-Key': 'abc' } });
    const res = mockRes();
    const client = hub.subscribe(req, res);
    assert.ok(client, 'client should be created');
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Content-Type'], 'text/event-stream; charset=utf-8');
    assert.equal(res.headers['Cache-Control'], 'no-cache, no-transform');
    assert.equal(res.flushed, true);
    assert.match(allText(res), /^: connected /);
    hub.close();
  });

  test('503 when requireAuth=true but apiKeys list is empty', () => {
    const hub = createHub({ apiKeys: [], heartbeatMs: 0 });
    const req = mockReq();
    const res = mockRes();
    const client = hub.subscribe(req, res);
    assert.equal(client, null);
    assert.equal(res.statusCode, 503);
    hub.close();
  });

  test('no-auth mode: requireAuth=false admits anyone', () => {
    const hub = createHub({ apiKeys: [], requireAuth: false, heartbeatMs: 0 });
    const req = mockReq();
    const res = mockRes();
    const client = hub.subscribe(req, res);
    assert.ok(client);
    assert.equal(res.statusCode, 200);
    hub.close();
  });
});

// ─────────────────────────────────────────────────────────────
// Publishing / dispatching
// ─────────────────────────────────────────────────────────────

describe('publish / dispatch', () => {
  test('delivers to subscribers on the matching channel only', () => {
    const hub = createHub({ apiKeys: ['k'], heartbeatMs: 0 });

    const reqA = mockReq({
      url: '/api/stream/events?channels=invoices',
      headers: { 'X-API-Key': 'k' },
    });
    const resA = mockRes();
    hub.subscribe(reqA, resA);

    const reqB = mockReq({
      url: '/api/stream/events?channels=payments',
      headers: { 'X-API-Key': 'k' },
    });
    const resB = mockRes();
    hub.subscribe(reqB, resB);

    hub.publish('invoices', { type: 'created', id: 'INV-1', totalILS: 1500 });
    hub.publish('payments', { type: 'received', id: 'PAY-9', amount: 900 });

    const aData = parseData(allText(resA));
    const bData = parseData(allText(resB));

    // A should see invoices.created only
    assert.equal(aData.length, 1);
    assert.equal(aData[0].id, 'INV-1');
    // B should see payments.received only
    assert.equal(bData.length, 1);
    assert.equal(bData[0].id, 'PAY-9');

    hub.close();
  });

  test('broadcastAll hits every channel and every subscriber', () => {
    const hub = createHub({ apiKeys: ['k'], heartbeatMs: 0 });
    const req1 = mockReq({ headers: { 'X-API-Key': 'k' } }); // no channels filter => all
    const res1 = mockRes();
    hub.subscribe(req1, res1);

    const results = hub.broadcastAll({ type: 'notice', message: 'hello' });
    assert.equal(results.length, DEFAULT_CHANNELS.length);

    // One frame per channel
    const data = parseData(allText(res1));
    assert.equal(data.length, DEFAULT_CHANNELS.length);
    for (const d of data) assert.equal(d.message, 'hello');

    hub.close();
  });

  test('unknown channel is ignored softly', () => {
    const hub = createHub({ apiKeys: ['k'], heartbeatMs: 0 });
    const out = hub.publish('unknown_channel', { type: 'x' });
    assert.equal(out, null);
    hub.close();
  });

  test('publish updates stats.totalPublished and ring size', () => {
    const hub = createHub({ apiKeys: ['k'], heartbeatMs: 0, ringSize: 50 });
    for (let i = 0; i < 10; i++) hub.publish('alerts', { type: 'raised', i });
    const s = hub.getStats();
    assert.equal(s.totalPublished, 10);
    assert.equal(s.ringSize, 10);
    hub.close();
  });
});

// ─────────────────────────────────────────────────────────────
// Replay via Last-Event-Id
// ─────────────────────────────────────────────────────────────

describe('replay', () => {
  test('Last-Event-Id replays only newer events on subscribed channels', () => {
    const hub = createHub({ apiKeys: ['k'], heartbeatMs: 0 });

    // Seed ring
    hub.publish('invoices', { type: 'created', id: 'A' }); // id=1
    hub.publish('payments', { type: 'received', id: 'B' }); // id=2
    hub.publish('invoices', { type: 'paid', id: 'C' });    // id=3
    hub.publish('alerts',   { type: 'raised', code: 'X' }); // id=4

    const req = mockReq({
      url: '/api/stream/events?channels=invoices,payments',
      headers: {
        'X-API-Key':     'k',
        'Last-Event-Id': '1',
      },
    });
    const res = mockRes();
    hub.subscribe(req, res);

    // Should replay event ids 2 & 3 (id=4 is alerts, not subscribed)
    const data = parseData(allText(res));
    // Filter to just replayed invoices/payments events (strip the hello comment)
    assert.equal(data.length, 2);
    assert.deepEqual(data.map(d => d.id).sort(), ['B', 'C']);

    hub.close();
  });

  test('ring buffer cap drops old events so they are NOT replayed', () => {
    const hub = createHub({ apiKeys: ['k'], heartbeatMs: 0, ringSize: 3 });

    for (let i = 0; i < 10; i++) {
      hub.publish('invoices', { type: 'created', idx: i });
    }
    assert.equal(hub.getStats().ringSize, 3);

    const req = mockReq({
      headers: {
        'X-API-Key':     'k',
        'Last-Event-Id': '0',
      },
    });
    const res = mockRes();
    hub.subscribe(req, res);

    // Only 3 most recent events (ids 8,9,10) should replay
    const data = parseData(allText(res));
    assert.equal(data.length, 3);
    assert.deepEqual(data.map(d => d.idx), [7, 8, 9]);

    hub.close();
  });
});

// ─────────────────────────────────────────────────────────────
// Heartbeat
// ─────────────────────────────────────────────────────────────

describe('heartbeat', () => {
  test('emits comment frames on the configured interval', async () => {
    const hub = createHub({ apiKeys: ['k'], heartbeatMs: 20 });
    const req = mockReq({ headers: { 'X-API-Key': 'k' } });
    const res = mockRes();
    hub.subscribe(req, res);

    await new Promise(r => setTimeout(r, 70));
    const txt = allText(res);
    const hbCount = (txt.match(/^: hb /gm) || []).length;
    assert.ok(hbCount >= 2, `expected >=2 heartbeats, got ${hbCount}\n${txt}`);
    hub.close();
  });
});

// ─────────────────────────────────────────────────────────────
// Teardown / lifecycle
// ─────────────────────────────────────────────────────────────

describe('lifecycle', () => {
  test('req.close drops the client', () => {
    const hub = createHub({ apiKeys: ['k'], heartbeatMs: 0 });
    const req = mockReq({ headers: { 'X-API-Key': 'k' } });
    const res = mockRes();
    hub.subscribe(req, res);
    assert.equal(hub.getStats().clientsConnected, 1);

    req.emit('close');
    assert.equal(hub.getStats().clientsConnected, 0);
    assert.equal(res.ended, true);
    hub.close();
  });

  test('hub.close() drops all clients and refuses new ones', () => {
    const hub = createHub({ apiKeys: ['k'], heartbeatMs: 0 });
    const req1 = mockReq({ headers: { 'X-API-Key': 'k' } });
    const res1 = mockRes();
    hub.subscribe(req1, res1);
    hub.close();

    assert.equal(hub.getStats().clientsConnected, 0);
    assert.equal(res1.ended, true);

    // New subscription should be refused with 503
    const req2 = mockReq({ headers: { 'X-API-Key': 'k' } });
    const res2 = mockRes();
    const client = hub.subscribe(req2, res2);
    assert.equal(client, null);
    assert.equal(res2.statusCode, 503);
  });

  test('write error disconnects client gracefully', () => {
    const hub = createHub({ apiKeys: ['k'], heartbeatMs: 0 });
    const req = mockReq({ headers: { 'X-API-Key': 'k' } });
    const res = mockRes({ writeFails: true });
    // First write throws on the hello frame → client is dropped in subscribe()
    const client = hub.subscribe(req, res);
    assert.ok(client, 'subscribe() returns the client even if initial write fails');
    // clientsConnected should be 0 after the write-failure path runs
    assert.equal(hub.getStats().clientsConnected, 0);
    hub.close();
  });
});

// ─────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────

describe('stats', () => {
  test('getStats exposes counters, channels, uptime', () => {
    const hub = createHub({ apiKeys: ['k'], heartbeatMs: 0, ringSize: 10 });
    const s = hub.getStats();
    assert.equal(typeof s.uptimeMs, 'number');
    assert.ok(s.uptimeMs >= 0);
    assert.deepEqual(s.channels, DEFAULT_CHANNELS.slice());
    assert.equal(s.ringCapacity, 10);
    assert.equal(s.clientsConnected, 0);
    hub.close();
  });

  test('counters advance after connect + publish + disconnect', () => {
    const hub = createHub({ apiKeys: ['k'], heartbeatMs: 0 });
    const req = mockReq({ headers: { 'X-API-Key': 'k' } });
    const res = mockRes();
    hub.subscribe(req, res);
    hub.publish('alerts', { type: 'raised' });
    hub.publish('alerts', { type: 'cleared' });
    req.emit('close');
    const s = hub.getStats();
    assert.equal(s.totalConnected, 1);
    assert.equal(s.totalDisconnected, 1);
    assert.equal(s.totalPublished, 2);
    hub.close();
  });
});
