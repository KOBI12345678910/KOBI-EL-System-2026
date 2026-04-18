/* =============================================================================
 * Onyx Procurement — Alert Notification Dispatcher
 * =============================================================================
 * File:        ops/alerts/notification-dispatcher.js
 * Purpose:     Receive Alertmanager webhook payloads, route them by severity,
 *              and fan out to pluggable delivery channels.
 *
 * Usage modes:
 *   1) STDIN / pipe
 *      cat payload.json | node notification-dispatcher.js
 *      alertmanager-webhook-forwarder | node notification-dispatcher.js
 *
 *   2) HTTP server (Alertmanager webhook receiver)
 *      node notification-dispatcher.js --server --port 9099
 *      then in alertmanager.yml:
 *        receivers:
 *          - name: onyx-dispatcher
 *            webhook_configs:
 *              - url: http://127.0.0.1:9099/alerts
 *                send_resolved: true
 *
 * Environment variables:
 *   NOTIFY_CHANNELS     Comma-separated channels, e.g. "console,file,whatsapp"
 *                       (default: "console")
 *   NOTIFY_FILE_PATH    Path used by the "file" channel
 *                       (default: "./ops/alerts/alerts.log")
 *   NOTIFY_EMAIL_TO     Address used by the "email" channel (stub)
 *   NOTIFY_WHATSAPP_TO  E.164 phone used by the "whatsapp" channel (stub)
 *   NOTIFY_SMS_TO       E.164 phone used by the "sms" channel (stub)
 *
 * Routing matrix (by severity):
 *   critical -> console + file + whatsapp + sms + email
 *   warning  -> console + file + email
 *   info     -> console + file
 *
 * The per-severity matrix is overridden when NOTIFY_CHANNELS is set.
 *
 * Exit codes:
 *   0  All alerts dispatched successfully.
 *   1  Parse / transport error.
 * =============================================================================
 */

'use strict';

const fs   = require('fs');
const http = require('http');
const path = require('path');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONFIG = {
  channelsOverride: (process.env.NOTIFY_CHANNELS || '').trim(),
  filePath:   process.env.NOTIFY_FILE_PATH   || path.join(process.cwd(), 'ops', 'alerts', 'alerts.log'),
  emailTo:    process.env.NOTIFY_EMAIL_TO    || 'oncall@onyx-procurement.local',
  whatsappTo: process.env.NOTIFY_WHATSAPP_TO || '+972500000000',
  smsTo:      process.env.NOTIFY_SMS_TO      || '+972500000000',
};

const SEVERITY_ROUTES = {
  critical: ['console', 'file', 'whatsapp', 'sms', 'email'],
  warning:  ['console', 'file', 'email'],
  info:     ['console', 'file'],
};

const DEFAULT_SEVERITY = 'warning';

// ---------------------------------------------------------------------------
// Channel implementations — pluggable; each returns a Promise<void>
// ---------------------------------------------------------------------------

const channels = {
  /**
   * console — always-on default sink.
   */
  console: async (alert) => {
    const line = formatLine(alert);
    // eslint-disable-next-line no-console
    console.log(line);
  },

  /**
   * file — append-only JSONL log. Safe for tailing / shipping to ELK.
   */
  file: async (alert) => {
    const dir = path.dirname(CONFIG.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const record = JSON.stringify({
      ts:       new Date().toISOString(),
      severity: alert.severity,
      name:     alert.name,
      summary:  alert.summary,
      status:   alert.status,
      labels:   alert.labels,
      annotations: alert.annotations,
    }) + '\n';
    await fs.promises.appendFile(CONFIG.filePath, record, 'utf8');
  },

  /**
   * email — stub. In production replace with nodemailer / SES.
   */
  email: async (alert) => {
    // eslint-disable-next-line no-console
    console.log(`[email-stub] to=${CONFIG.emailTo} subject="[${alert.severity.toUpperCase()}] ${alert.name}" summary="${alert.summary}"`);
  },

  /**
   * whatsapp — stub. In production replace with WhatsApp Business API or Twilio.
   */
  whatsapp: async (alert) => {
    // eslint-disable-next-line no-console
    console.log(`[whatsapp-stub] to=${CONFIG.whatsappTo} body="[${alert.severity}] ${alert.name} — ${alert.summary}"`);
  },

  /**
   * sms — stub. In production replace with Twilio / 019 / Inforu.
   */
  sms: async (alert) => {
    // eslint-disable-next-line no-console
    console.log(`[sms-stub] to=${CONFIG.smsTo} body="[${alert.severity}] ${alert.name}"`);
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLine(alert) {
  const tag = `[${alert.status}][${alert.severity}]`;
  return `${new Date().toISOString()} ${tag} ${alert.name} — ${alert.summary}`;
}

/**
 * Normalise a raw Alertmanager alert object into the internal shape we pass
 * to channels.
 */
function normaliseAlert(raw) {
  const labels       = raw.labels      || {};
  const annotations  = raw.annotations || {};
  const severity     = (labels.severity || DEFAULT_SEVERITY).toLowerCase();
  const name         = labels.alertname || annotations.alertname || 'UnnamedAlert';
  const summary      = annotations.summary || labels.summary || name;

  return {
    name,
    severity,
    status:      raw.status || 'firing',
    summary,
    labels,
    annotations,
    startsAt:    raw.startsAt,
    endsAt:      raw.endsAt,
    generatorURL: raw.generatorURL,
  };
}

/**
 * Given a severity, return the list of channel keys to dispatch to.
 * Respects NOTIFY_CHANNELS override when present.
 */
function channelsForSeverity(severity) {
  if (CONFIG.channelsOverride) {
    return CONFIG.channelsOverride
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return SEVERITY_ROUTES[severity] || SEVERITY_ROUTES[DEFAULT_SEVERITY];
}

/**
 * Dispatch a single normalised alert to all routed channels.
 */
async function dispatchAlert(alert) {
  const targets = channelsForSeverity(alert.severity);
  const results = [];
  for (const key of targets) {
    const channel = channels[key];
    if (!channel) {
      // eslint-disable-next-line no-console
      console.warn(`[dispatcher] unknown channel "${key}" — skipping`);
      continue;
    }
    try {
      await channel(alert);
      results.push({ channel: key, ok: true });
    } catch (err) {
      results.push({ channel: key, ok: false, error: err.message });
      // eslint-disable-next-line no-console
      console.error(`[dispatcher] channel ${key} failed for ${alert.name}: ${err.message}`);
    }
  }
  return results;
}

/**
 * Handle a full Alertmanager webhook payload (version=4 schema).
 * https://prometheus.io/docs/alerting/latest/configuration/#webhook_config
 */
async function handlePayload(payload) {
  if (!payload || !Array.isArray(payload.alerts)) {
    throw new Error('payload does not contain an "alerts" array');
  }
  const report = [];
  for (const raw of payload.alerts) {
    const alert = normaliseAlert(raw);
    const results = await dispatchAlert(alert);
    report.push({ alert: alert.name, severity: alert.severity, channels: results });
  }
  return report;
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

async function runStdin() {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { buf += chunk; });
  process.stdin.on('end', async () => {
    try {
      const payload = JSON.parse(buf || '{}');
      const report = await handlePayload(payload);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ ok: true, dispatched: report }, null, 2));
      process.exit(0);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[dispatcher] stdin error: ${err.message}`);
      process.exit(1);
    }
  });
}

function runServer(port) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'POST only' }));
      return;
    }
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const report = await handlePayload(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, dispatched: report }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
  });
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[dispatcher] listening on http://0.0.0.0:${port}/alerts`);
  });
}

function main() {
  const argv = process.argv.slice(2);
  const serverFlag = argv.includes('--server');
  const portIdx = argv.indexOf('--port');
  const port = portIdx >= 0 ? Number(argv[portIdx + 1]) : 9099;

  if (serverFlag) {
    runServer(port);
  } else {
    runStdin();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  channels,
  dispatchAlert,
  handlePayload,
  normaliseAlert,
  channelsForSeverity,
  SEVERITY_ROUTES,
};
