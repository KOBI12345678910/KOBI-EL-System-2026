/**
 * Unified Notification Service — Express Routes
 * ────────────────────────────────────────────────
 * Agent-76 — Notifications
 *
 * Mounted from server.js via:
 *   app.use(require('./src/notifications/notification-routes').router(svc));
 *
 * Routes:
 *   GET    /api/notifications                    — unread notifications for the current user
 *   GET    /api/notifications/history            — full history (paged)
 *   POST   /api/notifications/:id/read           — mark a notification as read
 *   GET    /api/notifications/preferences        — read preferences
 *   POST   /api/notifications/preferences        — update preferences
 *   POST   /api/notifications/send               — internal/test endpoint to emit a notification
 *   GET    /api/notifications/types              — list all registered types
 *   GET    /api/notifications/stats              — queue / history / adapter stats
 *
 * User identity resolution (in order of precedence):
 *   1. req.actor.user         (set by auth middleware)
 *   2. req.headers['x-user-id']
 *   3. req.query.userId / req.body.userId
 *
 * Zero external deps — only Express router API.
 */

'use strict';

const express = require('express');

const types = require('./notification-types');

/**
 * resolveUserId — returns the user id for the incoming request, or null.
 * The service is intentionally lenient so internal tools (scripts, cron)
 * can POST with a raw body.
 */
function resolveUserId(req) {
  if (req.actor && typeof req.actor === 'object' && req.actor.user) return String(req.actor.user);
  if (req.headers && req.headers['x-user-id']) return String(req.headers['x-user-id']);
  if (req.query && req.query.userId) return String(req.query.userId);
  if (req.body && req.body.userId) return String(req.body.userId);
  return null;
}

/**
 * router — factory that returns an express.Router wired to the given
 * NotificationService instance.
 *
 * @param {NotificationService} svc
 * @returns {express.Router}
 */
function router(svc) {
  if (!svc) throw new Error('notification-routes: service instance required');
  const r = express.Router();

  // ──────── GET /api/notifications — unread ────────
  r.get('/api/notifications', (req, res) => {
    try {
      const userId = resolveUserId(req);
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 500);
      const items = svc.history.getUnread(userId, { limit });
      return res.json({ userId, unread: items.length, items });
    } catch (err) {
      return res.status(500).json({ error: 'internal', detail: err && err.message });
    }
  });

  // ──────── GET /api/notifications/history — paged ────────
  r.get('/api/notifications/history', (req, res) => {
    try {
      const userId = resolveUserId(req);
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const limit  = Math.min(parseInt(req.query.limit,  10) || 100, 1000);
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
      const items = svc.history.getHistory(userId, { limit, offset });
      return res.json({ userId, count: items.length, limit, offset, items });
    } catch (err) {
      return res.status(500).json({ error: 'internal', detail: err && err.message });
    }
  });

  // ──────── POST /api/notifications/:id/read ────────
  r.post('/api/notifications/:id/read', async (req, res) => {
    try {
      const id = req.params.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      const ok = await svc.history.markRead(id);
      if (!ok) return res.status(404).json({ error: 'not_found' });
      return res.json({ id, read: true });
    } catch (err) {
      return res.status(500).json({ error: 'internal', detail: err && err.message });
    }
  });

  // ──────── GET /api/notifications/preferences ────────
  r.get('/api/notifications/preferences', async (req, res) => {
    try {
      const userId = resolveUserId(req);
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const prefs = await svc.preferences.get(userId);
      return res.json({ userId, prefs });
    } catch (err) {
      return res.status(500).json({ error: 'internal', detail: err && err.message });
    }
  });

  // ──────── POST /api/notifications/preferences ────────
  r.post('/api/notifications/preferences', async (req, res) => {
    try {
      const userId = resolveUserId(req);
      if (!userId) return res.status(400).json({ error: 'userId required' });
      const body = req.body || {};
      // accept either { prefs: {...} } or a flat body
      const patch = body.prefs && typeof body.prefs === 'object' ? body.prefs : body;
      const merged = await svc.preferences.set(userId, patch);
      return res.json({ userId, prefs: merged });
    } catch (err) {
      return res.status(500).json({ error: 'internal', detail: err && err.message });
    }
  });

  // ──────── POST /api/notifications/send — emit a notification ────────
  r.post('/api/notifications/send', async (req, res) => {
    try {
      const body = req.body || {};
      const userId = body.userId || resolveUserId(req);
      const type   = body.type;
      const data   = body.data || {};
      const queueOnly = Boolean(body.queueOnly);
      if (!userId) return res.status(400).json({ error: 'userId required' });
      if (!type)   return res.status(400).json({ error: 'type required' });
      if (!types.has(type)) return res.status(400).json({ error: 'unknown_type', type });
      const result = await svc.notify(userId, type, data, { queueOnly, recipient: body.recipient });
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: 'internal', detail: err && err.message });
    }
  });

  // ──────── GET /api/notifications/types ────────
  r.get('/api/notifications/types', (req, res) => {
    try {
      const ids = types.listIds();
      const out = ids.map(id => {
        const t = types.get(id);
        return {
          id:           t.id,
          category:     t.category,
          priority:     t.priority,
          titleHe:      t.titleHe,
          defaultChans: t.defaultChans,
          throttleSec:  t.throttleSec,
        };
      });
      return res.json({ count: out.length, types: out });
    } catch (err) {
      return res.status(500).json({ error: 'internal', detail: err && err.message });
    }
  });

  // ──────── GET /api/notifications/stats ────────
  r.get('/api/notifications/stats', (req, res) => {
    try {
      return res.json(svc.stats());
    } catch (err) {
      return res.status(500).json({ error: 'internal', detail: err && err.message });
    }
  });

  return r;
}

module.exports = { router, resolveUserId };
