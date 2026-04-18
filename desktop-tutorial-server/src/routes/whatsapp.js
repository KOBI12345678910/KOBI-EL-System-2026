const express = require('express');
const router = express.Router();
const db = require('../db/connection');
const { createNotification } = require('../services/notification.service');

// WhatsApp webhook verification (Meta Cloud API)
router.get('/webhook', (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// WhatsApp incoming message webhook
router.post('/webhook', (req, res) => {
  const body = req.body;

  if (body.object === 'whatsapp_business_account') {
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const messages = change.value?.messages || [];
        for (const message of messages) {
          // Handle document/image messages (invoices)
          if (message.type === 'document' || message.type === 'image') {
            const from = message.from;
            const mediaId = message.document?.id || message.image?.id;
            const filename = message.document?.filename || `whatsapp-${Date.now()}.jpg`;

            createNotification(
              'whatsapp_invoice',
              'invoice',
              null,
              `חשבונית התקבלה מ-WhatsApp (${from}): ${filename}`
            );

            // Store reference for manual processing
            db.prepare(`
              INSERT INTO settings (key, value) VALUES (?, ?)
            `).run(
              `whatsapp_pending_${Date.now()}`,
              JSON.stringify({ from, mediaId, filename, received_at: new Date().toISOString() })
            );
          }
        }
      }
    }
  }

  res.sendStatus(200);
});

// GET pending WhatsApp invoices
router.get('/pending', (req, res) => {
  const pending = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'whatsapp_pending_%' ORDER BY key DESC").all();
  res.json(pending.map(p => ({ key: p.key, ...JSON.parse(p.value) })));
});

module.exports = router;
