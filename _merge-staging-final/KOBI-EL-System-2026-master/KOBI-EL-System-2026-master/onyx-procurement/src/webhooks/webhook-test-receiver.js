/**
 * ONYX — Webhook Test Receiver (development only)
 * ═══════════════════════════════════════════════════════════════
 * Agent-80 — Webhook Delivery System
 *
 * Exposes `POST /api/webhooks/test-echo` which echoes back the
 * request body, headers and signature verification result. Used
 * during subscriber onboarding and local end-to-end tests so
 * developers can point their `webhook_subscriptions.url` at our
 * own server and see exactly what the sender would deliver.
 *
 * Safety:
 *   - Disabled by default in production. Set WEBHOOKS_ENABLE_TEST_ECHO=true
 *     to enable. Even then, the route:
 *       * rejects payloads larger than 64KB
 *       * stores at most the last 100 echoes in memory (ring buffer)
 *       * exposes `GET /api/webhooks/test-echo` to read the ring
 *       * exposes `DELETE /api/webhooks/test-echo` to clear it
 *
 * Signature verification is opportunistic: if the request carries an
 * `X-Signature` header AND the caller supplies `?secret=<hex>` the
 * receiver will validate it using the same helper subscribers use
 * (`verifySignature` from webhook-sender.js). This lets you round-
 * trip-test your HMAC config without setting up a real subscriber.
 */

'use strict';

const { verifySignature } = require('./webhook-sender');

const MAX_BODY_BYTES = 64 * 1024;
const MAX_RING       = 100;

// Module-local ring buffer (process-local, not clustered). If we
// ever run the test receiver in a multi-instance deployment we
// should move this to Redis — but that's explicitly out of scope
// for a dev-only tool.
const ring = [];

function pushRing(entry) {
  ring.push(entry);
  while (ring.length > MAX_RING) ring.shift();
}

function isEnabled() {
  if (process.env.NODE_ENV === 'production') {
    return process.env.WEBHOOKS_ENABLE_TEST_ECHO === 'true';
  }
  // Dev / test: enabled unless explicitly disabled.
  return process.env.WEBHOOKS_ENABLE_TEST_ECHO !== 'false';
}

/**
 * registerWebhookTestReceiver — mount the echo endpoint.
 *
 * @param {object} app  Express app
 * @param {object} [deps]
 * @param {object} [deps.logger]
 */
function registerWebhookTestReceiver(app, deps = {}) {
  const log = deps.logger || console;

  // ─── Middleware that captures the raw body so we can verify HMAC.
  // If the rest of the app uses express.json() globally, req.body is
  // already parsed — that's fine, we still have the raw bytes via
  // req.rawBody if the parser was configured with `verify:`. Fall
  // back to re-stringifying (which will give a mismatched signature
  // if the sender used a different key order, but that's acceptable
  // for a dev receiver — real subscribers MUST capture raw bytes).
  //
  // For robustness we also accept a `verify` hook injected via deps.
  const captureRaw = deps.captureRaw || ((req) => {
    if (req.rawBody) return typeof req.rawBody === 'string'
      ? req.rawBody
      : req.rawBody.toString('utf8');
    if (req.body && typeof req.body === 'object') {
      try { return JSON.stringify(req.body); } catch { return ''; }
    }
    return typeof req.body === 'string' ? req.body : '';
  });

  // ─── POST /api/webhooks/test-echo ──────────────────────────
  app.post('/api/webhooks/test-echo', (req, res) => {
    if (!isEnabled()) {
      return res.status(404).json({ error: 'test receiver disabled' });
    }

    const raw = captureRaw(req) || '';
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'payload too large for test receiver' });
    }

    const signature = req.headers['x-signature'];
    const eventId   = req.headers['x-event-id']   || null;
    const eventType = req.headers['x-event-type'] || null;
    const attempt   = req.headers['x-delivery-attempt'] || null;

    // If caller supplied ?secret= we also verify.
    let signatureOk = null;
    const querySecret = req.query && req.query.secret;
    if (signature && querySecret) {
      signatureOk = verifySignature(raw, String(signature), String(querySecret));
    }

    const record = {
      received_at: new Date().toISOString(),
      method:      req.method,
      path:        req.path,
      headers: {
        'user-agent':        req.headers['user-agent'] || null,
        'content-type':      req.headers['content-type'] || null,
        'x-signature':       signature || null,
        'x-signature-alg':   req.headers['x-signature-alg'] || null,
        'x-event-id':        eventId,
        'x-event-type':      eventType,
        'x-delivery-attempt': attempt,
        'x-replay-of':       req.headers['x-replay-of'] || null,
      },
      query:            req.query || {},
      body:             req.body || null,
      raw_body_preview: raw.slice(0, 2048),
      raw_body_bytes:   Buffer.byteLength(raw, 'utf8'),
      signature_valid:  signatureOk,
    };

    pushRing(record);
    log.info && log.info({ msg: 'webhook.test_echo.received', event_type: eventType, bytes: record.raw_body_bytes });

    res.status(200).json({
      ok:              true,
      echoed:          true,
      received_at:     record.received_at,
      event_id:        eventId,
      event_type:      eventType,
      signature_valid: signatureOk,
      body:            record.body,
    });
  });

  // ─── GET /api/webhooks/test-echo  (read ring) ──────────────
  app.get('/api/webhooks/test-echo', (req, res) => {
    if (!isEnabled()) return res.status(404).json({ error: 'test receiver disabled' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 25, MAX_RING);
    res.json({ count: ring.length, echoes: ring.slice(-limit).reverse() });
  });

  // ─── DELETE /api/webhooks/test-echo  (clear ring) ──────────
  app.delete('/api/webhooks/test-echo', (req, res) => {
    if (!isEnabled()) return res.status(404).json({ error: 'test receiver disabled' });
    const cleared = ring.length;
    ring.length = 0;
    res.json({ cleared });
  });
}

module.exports = {
  registerWebhookTestReceiver,
  // Exposed for tests that want to inspect the ring directly.
  _ringForTests: ring,
  _isEnabled: isEnabled,
  MAX_BODY_BYTES,
  MAX_RING,
};
