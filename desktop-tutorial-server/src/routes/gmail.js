const express = require('express');
const router = express.Router();
const db = require('../db/connection');

// Gmail OAuth flow
router.get('/auth', (req, res) => {
  const clientId = process.env.GMAIL_CLIENT_ID;
  if (!clientId) {
    return res.status(400).json({ error: 'Gmail API לא מוגדר. הגדר GMAIL_CLIENT_ID ב-.env' });
  }

  const redirectUri = process.env.GMAIL_REDIRECT_URI || 'http://localhost:3001/api/gmail/callback';
  const scope = 'https://www.googleapis.com/auth/gmail.readonly';
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;

  res.json({ auth_url: url });
});

// Gmail OAuth callback
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'קוד אימות חסר' });

  try {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );

    const { tokens } = await oauth2Client.getToken(code);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('gmail_tokens', ?)").run(JSON.stringify(tokens));

    res.send('<html><body style="direction:rtl;font-family:Heebo"><h2>Gmail חובר בהצלחה!</h2><p>ניתן לסגור חלון זה.</p></body></html>');
  } catch (err) {
    res.status(500).json({ error: 'שגיאה בחיבור Gmail', details: err.message });
  }
});

// GET gmail connection status
router.get('/status', (req, res) => {
  const tokens = db.prepare("SELECT value FROM settings WHERE key = 'gmail_tokens'").get();
  res.json({ connected: !!tokens });
});

// POST manually trigger gmail fetch
router.post('/fetch', async (req, res) => {
  try {
    const tokensRow = db.prepare("SELECT value FROM settings WHERE key = 'gmail_tokens'").get();
    if (!tokensRow) return res.status(400).json({ error: 'Gmail לא מחובר' });

    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      process.env.GMAIL_REDIRECT_URI
    );
    oauth2Client.setCredentials(JSON.parse(tokensRow.value));

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'has:attachment filename:pdf subject:(חשבונית OR invoice)',
      maxResults: 20,
    });

    res.json({ messages: response.data.messages || [], count: (response.data.messages || []).length });
  } catch (err) {
    res.status(500).json({ error: 'שגיאה בשליפת מיילים', details: err.message });
  }
});

module.exports = router;
