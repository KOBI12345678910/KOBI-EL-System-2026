// Agent 74 — WhatsApp Cloud API webhook handler
// ---------------------------------------------------------------
// Meta sends callbacks to this endpoint for:
//   * verification (GET request on first setup)
//   * inbound messages (status=sent/delivered/read/failed)
//   * user opt-out events ("STOP" keyword)
//
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
//
// This module exports an Express-style request handler plus raw
// dispatch helpers so it can be unit-tested without a server.

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { recordOptOut } = require('./send-whatsapp');

const CONFIG = {
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
  appSecret: process.env.WHATSAPP_APP_SECRET || '',
  webhookLogPath:
    process.env.WHATSAPP_WEBHOOK_LOG ||
    path.join(__dirname, '..', '..', 'logs', 'whatsapp-webhook.log'),
};

function _ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function _log(event) {
  try {
    _ensureDir(CONFIG.webhookLogPath);
    const line =
      JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(CONFIG.webhookLogPath, line, 'utf8');
  } catch (_e) {
    /* never throw from logger */
  }
}

// ---------------------------------------------------------------
// In-memory status store so callers can look up message state.
// Keyed by the `wa_message_id` Meta returned on send.
// Never deletes — older entries age out only by restart.
// ---------------------------------------------------------------
const _statusStore = new Map();

function getStatus(waMessageId) {
  return _statusStore.get(waMessageId) || null;
}

function _remember(waMessageId, patch) {
  const prior = _statusStore.get(waMessageId) || { id: waMessageId, history: [] };
  const merged = {
    ...prior,
    ...patch,
    history: [
      ...(prior.history || []),
      { at: new Date().toISOString(), ...patch },
    ],
  };
  _statusStore.set(waMessageId, merged);
  return merged;
}

// ---------------------------------------------------------------
// Signature verification (X-Hub-Signature-256)
// ---------------------------------------------------------------
function verifySignature(rawBody, headerValue) {
  if (!CONFIG.appSecret) return false;
  if (!headerValue || typeof headerValue !== 'string') return false;
  const expected =
    'sha256=' +
    crypto
      .createHmac('sha256', CONFIG.appSecret)
      .update(rawBody)
      .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(headerValue)
    );
  } catch (_e) {
    return false;
  }
}

// ---------------------------------------------------------------
// Core dispatcher — takes a parsed JSON payload from Meta and
// updates internal state. Pure-ish (writes to logs + _statusStore
// + opt-out store). No HTTP response.
// ---------------------------------------------------------------
function handleWebhookPayload(payload) {
  if (!payload || payload.object !== 'whatsapp_business_account') {
    _log({ level: 'warn', event: 'webhook.ignored', reason: 'not_waba', payload });
    return { processed: 0 };
  }
  let processed = 0;
  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change.value || {};

      // 1. Status updates (sent/delivered/read/failed)
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const s of statuses) {
        const patch = {
          status: s.status, // "sent" | "delivered" | "read" | "failed"
          recipient: s.recipient_id,
          timestamp: s.timestamp,
          conversation: s.conversation || null,
          errors: s.errors || null,
        };
        _remember(s.id, patch);
        _log({
          level: s.status === 'failed' ? 'error' : 'info',
          event: 'webhook.status',
          id: s.id,
          ...patch,
        });
        processed += 1;
      }

      // 2. Inbound messages (from users). If the user sent
      //    "STOP" / "ביטול" we flip their opt-in.
      const messages = Array.isArray(value.messages) ? value.messages : [];
      for (const m of messages) {
        _log({
          level: 'info',
          event: 'webhook.inbound',
          from: m.from,
          type: m.type,
          id: m.id,
        });
        const text =
          (m.text && m.text.body && String(m.text.body).trim().toLowerCase()) || '';
        if (text === 'stop' || text === 'ביטול' || text === 'הסר') {
          try {
            recordOptOut(m.from, 'user_stop_message');
            _log({
              level: 'info',
              event: 'webhook.opt_out',
              from: m.from,
              keyword: text,
            });
          } catch (err) {
            _log({
              level: 'error',
              event: 'webhook.opt_out_failed',
              from: m.from,
              reason: err.message,
            });
          }
        }
        processed += 1;
      }
    }
  }
  return { processed };
}

// ---------------------------------------------------------------
// Express-compatible handler
// ---------------------------------------------------------------
function expressHandler(req, res) {
  if (req.method === 'GET') {
    // Verification handshake.
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === CONFIG.verifyToken) {
      _log({ level: 'info', event: 'webhook.verify.ok' });
      res.status(200).send(challenge || '');
      return;
    }
    _log({ level: 'warn', event: 'webhook.verify.failed', mode });
    res.status(403).send('forbidden');
    return;
  }

  if (req.method === 'POST') {
    const signature = req.headers['x-hub-signature-256'];
    const raw =
      (req.rawBody && req.rawBody.toString('utf8')) ||
      (typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    if (CONFIG.appSecret && !verifySignature(raw, signature)) {
      _log({ level: 'error', event: 'webhook.bad_signature' });
      res.status(401).send('bad signature');
      return;
    }
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (_e) {
        body = null;
      }
    }
    try {
      const result = handleWebhookPayload(body || {});
      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      _log({ level: 'error', event: 'webhook.error', reason: err.message });
      res.status(500).json({ ok: false, error: err.message });
    }
    return;
  }

  res.status(405).send('method not allowed');
}

module.exports = {
  expressHandler,
  handleWebhookPayload,
  verifySignature,
  getStatus,
  CONFIG,
};
