/**
 * ONYX PROCUREMENT — Email Sender Module
 * ──────────────────────────────────────
 * Agent-73 contribution.  Law: DO NOT DELETE.
 *
 * Purpose:
 *   A zero-dependency email dispatcher that combines:
 *     - A raw SMTP client (Node `net` / `tls`, no `nodemailer`)
 *     - Pluggable stub transports for SendGrid / Mailgun / Amazon SES
 *     - A MIME composer capable of multipart/alternative + attachments (PDF)
 *     - An in-memory queue with retry + exponential back-off
 *     - An append-only audit log (JSONL) for every send attempt
 *
 *   Because the wider Onyx project forbids adding new npm dependencies, this
 *   module is written in pure stdlib JS.  It is safe to require — constructing
 *   the module does not open any sockets or read any files.
 *
 * Transport selection:
 *   Callers pass a `transport` descriptor to createSender():
 *     { type: 'smtp',     host, port, secure, auth: { user, pass }, from }
 *     { type: 'sendgrid', apiKey, from }
 *     { type: 'mailgun',  apiKey, domain, from }
 *     { type: 'ses',      region, accessKeyId, secretAccessKey, from }
 *     { type: 'noop',     from }   // used in tests — never touches the network
 *
 *   SMTP is the reference implementation; the other three are wired as stubs
 *   that build the same MIME payload and then hand off to a provider client
 *   when one is present.  When no client is configured they behave as noop
 *   (returning a deterministic "queued" response) so unit tests do not need
 *   any network mocks.
 *
 * Usage:
 *   const { createSender } = require('./send-email');
 *   const { renderTemplate } = require('./email-templates');
 *
 *   const sender = createSender({
 *     transport: { type: 'smtp', host: 'smtp.example.com', port: 587, from: 'noreply@onyx.local' },
 *     auditFile: '/var/log/onyx/email-audit.jsonl',
 *   });
 *
 *   const rendered = renderTemplate('wage_slip_issued', { employee_name: '...' });
 *   await sender.send({
 *     to: 'employee@example.com',
 *     subject: rendered.subject,
 *     html: rendered.html,
 *     text: rendered.text,
 *     attachments: [{ filename: 'slip.pdf', content: pdfBuffer, contentType: 'application/pdf' }],
 *   });
 *
 * Exports:
 *   createSender(options)            → sender instance
 *   composeMime(message, opts)       → raw RFC-822 bytes (for tests)
 *   Queue                            → class: in-memory retry queue
 *   AuditLog                         → class: append-only JSONL audit writer
 *   transports                       → the four transport factories
 */

'use strict';

const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

// ───────────────────────────────────────────────────────────────
// MIME composer — builds a full multipart/mixed → multipart/alternative
// tree that email clients reliably render.  No external deps.
// ───────────────────────────────────────────────────────────────

function randomBoundary(prefix) {
  return `${prefix || 'ONYX'}_${crypto.randomBytes(12).toString('hex')}`;
}

function formatAddress(addr) {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  if (addr.name && addr.email) {
    // RFC 5322 display-name with quoted form — keeps hebrew safe via encoded word
    const encoded = `=?UTF-8?B?${Buffer.from(addr.name, 'utf8').toString('base64')}?=`;
    return `${encoded} <${addr.email}>`;
  }
  return addr.email || '';
}

function listAddresses(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function encodeSubject(subject) {
  if (!subject) return '';
  // Force UTF-8 encoded-word so Hebrew characters survive any SMTP relay.
  return `=?UTF-8?B?${Buffer.from(String(subject), 'utf8').toString('base64')}?=`;
}

function chunkBase64(b64, width = 76) {
  const lines = [];
  for (let i = 0; i < b64.length; i += width) {
    lines.push(b64.slice(i, i + width));
  }
  return lines.join('\r\n');
}

/**
 * Build the complete MIME message as a Buffer.  Accepts:
 *   { from, to, cc, bcc, replyTo, subject, text, html, attachments[], headers }
 * Attachments must be { filename, content: Buffer|string, contentType }.
 */
function composeMime(message, opts = {}) {
  if (!message || typeof message !== 'object') {
    throw new Error('[send-email] composeMime: message required');
  }
  const from = formatAddress(message.from || opts.from);
  if (!from) throw new Error('[send-email] composeMime: `from` required');
  const to = listAddresses(message.to).map(formatAddress).filter(Boolean);
  if (!to.length) throw new Error('[send-email] composeMime: `to` required');

  const cc = listAddresses(message.cc).map(formatAddress).filter(Boolean);
  const bcc = listAddresses(message.bcc).map(formatAddress).filter(Boolean);
  const replyTo = message.replyTo ? formatAddress(message.replyTo) : '';
  const messageId = `<${crypto.randomBytes(16).toString('hex')}@onyx.local>`;

  const mixedBoundary = randomBoundary('MIX');
  const altBoundary = randomBoundary('ALT');

  const headers = [];
  headers.push(`From: ${from}`);
  headers.push(`To: ${to.join(', ')}`);
  if (cc.length) headers.push(`Cc: ${cc.join(', ')}`);
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);
  headers.push(`Subject: ${encodeSubject(message.subject || '')}`);
  headers.push(`Message-ID: ${messageId}`);
  headers.push(`Date: ${new Date().toUTCString()}`);
  headers.push('MIME-Version: 1.0');
  headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);
  headers.push('X-Mailer: Onyx-Procurement/1.0 (agent-73)');

  if (message.headers && typeof message.headers === 'object') {
    for (const [k, v] of Object.entries(message.headers)) {
      headers.push(`${k}: ${v}`);
    }
  }

  const CRLF = '\r\n';
  const parts = [];
  parts.push(headers.join(CRLF));
  parts.push('');
  parts.push(`--${mixedBoundary}`);
  parts.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
  parts.push('');

  if (message.text) {
    parts.push(`--${altBoundary}`);
    parts.push('Content-Type: text/plain; charset="UTF-8"');
    parts.push('Content-Transfer-Encoding: base64');
    parts.push('');
    parts.push(chunkBase64(Buffer.from(message.text, 'utf8').toString('base64')));
  }

  if (message.html) {
    parts.push(`--${altBoundary}`);
    parts.push('Content-Type: text/html; charset="UTF-8"');
    parts.push('Content-Transfer-Encoding: base64');
    parts.push('');
    parts.push(chunkBase64(Buffer.from(message.html, 'utf8').toString('base64')));
  }

  parts.push(`--${altBoundary}--`);
  parts.push('');

  // Attachments
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  for (const att of attachments) {
    if (!att || !att.filename) continue;
    const ct = att.contentType || 'application/octet-stream';
    const content = Buffer.isBuffer(att.content)
      ? att.content
      : Buffer.from(String(att.content || ''), 'utf8');
    parts.push(`--${mixedBoundary}`);
    parts.push(`Content-Type: ${ct}; name="${att.filename}"`);
    parts.push('Content-Transfer-Encoding: base64');
    parts.push(`Content-Disposition: attachment; filename="${att.filename}"`);
    parts.push('');
    parts.push(chunkBase64(content.toString('base64')));
  }

  parts.push(`--${mixedBoundary}--`);
  parts.push('');

  return {
    raw: Buffer.from(parts.join(CRLF), 'utf8'),
    messageId,
    boundary: mixedBoundary,
    envelope: {
      from,
      to: to.concat(cc, bcc),
    },
  };
}

// ───────────────────────────────────────────────────────────────
// SMTP client — minimal but real RFC-5321 conversation.
// Supports plain + STARTTLS + implicit TLS on port 465, PLAIN auth.
// ───────────────────────────────────────────────────────────────

class SmtpClient {
  constructor(options) {
    this.host = options.host;
    this.port = options.port || 587;
    this.secure = !!options.secure;       // implicit TLS on connect
    this.auth = options.auth || null;      // { user, pass }
    this.timeoutMs = options.timeoutMs || 20000;
    this.ehloName = options.ehloName || 'onyx.local';
  }

  _openSocket() {
    return new Promise((resolve, reject) => {
      const opts = { host: this.host, port: this.port };
      const socket = this.secure
        ? tls.connect({ ...opts, rejectUnauthorized: false })
        : net.createConnection(opts);
      const onErr = (err) => { cleanup(); reject(err); };
      const onReady = () => { cleanup(); resolve(socket); };
      const cleanup = () => {
        socket.off('error', onErr);
        socket.off(this.secure ? 'secureConnect' : 'connect', onReady);
      };
      socket.once('error', onErr);
      socket.once(this.secure ? 'secureConnect' : 'connect', onReady);
      socket.setTimeout(this.timeoutMs, () => {
        socket.destroy(new Error('SMTP timeout'));
      });
    });
  }

  _readResponse(socket) {
    return new Promise((resolve, reject) => {
      let buf = '';
      const onData = (chunk) => {
        buf += chunk.toString('utf8');
        // SMTP multi-line response: final line is "NNN SP ..."
        const lines = buf.split(/\r?\n/);
        for (const line of lines) {
          if (/^\d{3} /.test(line)) {
            cleanup();
            const code = parseInt(line.slice(0, 3), 10);
            resolve({ code, text: buf });
            return;
          }
        }
      };
      const onErr = (err) => { cleanup(); reject(err); };
      const cleanup = () => {
        socket.off('data', onData);
        socket.off('error', onErr);
      };
      socket.on('data', onData);
      socket.on('error', onErr);
    });
  }

  async _write(socket, line) {
    return new Promise((resolve, reject) => {
      socket.write(line + '\r\n', (err) => (err ? reject(err) : resolve()));
    });
  }

  async send({ envelope, raw }) {
    const socket = await this._openSocket();
    try {
      let res = await this._readResponse(socket); // 220 greeting
      if (res.code !== 220) throw new Error(`SMTP greeting failed: ${res.text}`);
      await this._write(socket, `EHLO ${this.ehloName}`);
      res = await this._readResponse(socket);
      if (res.code !== 250) throw new Error(`EHLO failed: ${res.text}`);

      // Upgrade to STARTTLS if not already secure
      if (!this.secure && /STARTTLS/i.test(res.text)) {
        await this._write(socket, 'STARTTLS');
        res = await this._readResponse(socket);
        if (res.code !== 220) throw new Error(`STARTTLS refused: ${res.text}`);
        const upgraded = await new Promise((resolve, reject) => {
          const s = tls.connect({ socket, servername: this.host, rejectUnauthorized: false },
            () => resolve(s));
          s.once('error', reject);
        });
        // Re-EHLO after upgrade
        await this._write(upgraded, `EHLO ${this.ehloName}`);
        res = await this._readResponse(upgraded);
        return await this._finishSend(upgraded, envelope, raw);
      }

      return await this._finishSend(socket, envelope, raw);
    } finally {
      try { socket.end(); } catch (_) { /* swallow */ }
    }
  }

  async _finishSend(socket, envelope, raw) {
    let res;
    if (this.auth && this.auth.user && this.auth.pass) {
      const token = Buffer.from(`\0${this.auth.user}\0${this.auth.pass}`, 'utf8')
        .toString('base64');
      await this._write(socket, `AUTH PLAIN ${token}`);
      res = await this._readResponse(socket);
      if (res.code !== 235) throw new Error(`AUTH failed: ${res.text}`);
    }

    const fromAddr = envelope.from.match(/<([^>]+)>/) || [null, envelope.from];
    await this._write(socket, `MAIL FROM:<${fromAddr[1]}>`);
    res = await this._readResponse(socket);
    if (res.code !== 250) throw new Error(`MAIL FROM failed: ${res.text}`);

    for (const rcpt of envelope.to) {
      const m = rcpt.match(/<([^>]+)>/) || [null, rcpt];
      await this._write(socket, `RCPT TO:<${m[1]}>`);
      res = await this._readResponse(socket);
      if (res.code !== 250 && res.code !== 251) {
        throw new Error(`RCPT TO failed: ${res.text}`);
      }
    }

    await this._write(socket, 'DATA');
    res = await this._readResponse(socket);
    if (res.code !== 354) throw new Error(`DATA refused: ${res.text}`);

    // Dot-stuff: lines that start with '.' must be doubled
    const safeRaw = Buffer.from(
      raw.toString('utf8').replace(/^\./gm, '..'),
      'utf8'
    );
    socket.write(safeRaw);
    await this._write(socket, '\r\n.');
    res = await this._readResponse(socket);
    if (res.code !== 250) throw new Error(`End-of-DATA failed: ${res.text}`);

    await this._write(socket, 'QUIT');
    try { await this._readResponse(socket); } catch (_) { /* ignored */ }

    return { accepted: true, response: res.text };
  }
}

// ───────────────────────────────────────────────────────────────
// Transport factories
// ───────────────────────────────────────────────────────────────

const transports = {
  smtp(config) {
    const client = new SmtpClient({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      timeoutMs: config.timeoutMs,
      ehloName: config.ehloName,
    });
    return {
      type: 'smtp',
      from: config.from,
      async send(message) {
        const mime = composeMime(message, { from: config.from });
        const result = await client.send(mime);
        return {
          transport: 'smtp',
          messageId: mime.messageId,
          accepted: result.accepted,
          providerResponse: result.response,
        };
      },
    };
  },

  sendgrid(config) {
    return {
      type: 'sendgrid',
      from: config.from,
      async send(message) {
        // Stub — real implementation would POST to
        // https://api.sendgrid.com/v3/mail/send with the configured api key.
        // We still build the MIME so the audit log has a real message-id.
        const mime = composeMime(message, { from: config.from });
        if (!config.apiKey || config.dryRun) {
          return {
            transport: 'sendgrid',
            messageId: mime.messageId,
            accepted: true,
            providerResponse: 'stub: dryRun or missing apiKey',
          };
        }
        throw new Error('[send-email] SendGrid transport requires an HTTP client; stub only.');
      },
    };
  },

  mailgun(config) {
    return {
      type: 'mailgun',
      from: config.from,
      async send(message) {
        const mime = composeMime(message, { from: config.from });
        if (!config.apiKey || !config.domain || config.dryRun) {
          return {
            transport: 'mailgun',
            messageId: mime.messageId,
            accepted: true,
            providerResponse: 'stub: dryRun or missing apiKey/domain',
          };
        }
        throw new Error('[send-email] Mailgun transport requires an HTTP client; stub only.');
      },
    };
  },

  ses(config) {
    return {
      type: 'ses',
      from: config.from,
      async send(message) {
        const mime = composeMime(message, { from: config.from });
        if (!config.accessKeyId || !config.secretAccessKey || config.dryRun) {
          return {
            transport: 'ses',
            messageId: mime.messageId,
            accepted: true,
            providerResponse: 'stub: dryRun or missing AWS credentials',
          };
        }
        throw new Error('[send-email] SES transport requires aws-sdk; stub only.');
      },
    };
  },

  noop(config) {
    return {
      type: 'noop',
      from: config.from || 'noreply@onyx.local',
      async send(message) {
        const mime = composeMime(message, { from: config.from || 'noreply@onyx.local' });
        return {
          transport: 'noop',
          messageId: mime.messageId,
          accepted: true,
          providerResponse: 'noop transport — message not delivered',
        };
      },
    };
  },
};

// ───────────────────────────────────────────────────────────────
// Audit log — append-only JSONL.  If no file is configured, records
// are kept in memory (capped) so tests can inspect them directly.
// ───────────────────────────────────────────────────────────────

class AuditLog {
  constructor({ file = null, memoryCap = 1000 } = {}) {
    this.file = file;
    this.memoryCap = memoryCap;
    this.memory = [];
    if (this.file) {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
      } catch (_) { /* best effort */ }
    }
  }

  write(entry) {
    const record = Object.assign({ timestamp: new Date().toISOString() }, entry);
    const line = JSON.stringify(record) + '\n';
    if (this.file) {
      try {
        fs.appendFileSync(this.file, line, 'utf8');
      } catch (err) {
        // Fall back to memory on fs failure
        this.memory.push({ ...record, _auditWriteError: err.message });
      }
    } else {
      this.memory.push(record);
      if (this.memory.length > this.memoryCap) this.memory.shift();
    }
    return record;
  }

  all() { return this.memory.slice(); }
  clear() { this.memory.length = 0; }
}

// ───────────────────────────────────────────────────────────────
// Queue with retry + exponential back-off
// ───────────────────────────────────────────────────────────────

class Queue extends EventEmitter {
  constructor({ maxRetries = 3, baseDelayMs = 500, maxDelayMs = 30000 } = {}) {
    super();
    this.maxRetries = maxRetries;
    this.baseDelayMs = baseDelayMs;
    this.maxDelayMs = maxDelayMs;
    this.items = [];
    this.processing = false;
    this.handler = null;
  }

  setHandler(fn) { this.handler = fn; }

  enqueue(job) {
    const item = {
      id: crypto.randomBytes(8).toString('hex'),
      attempts: 0,
      enqueuedAt: Date.now(),
      ...job,
    };
    this.items.push(item);
    this.emit('enqueued', item);
    return item;
  }

  size() { return this.items.length; }

  backoff(attempt) {
    const delay = Math.min(this.baseDelayMs * Math.pow(2, attempt - 1), this.maxDelayMs);
    return delay;
  }

  async drain() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.items.length) {
        const item = this.items.shift();
        let lastErr = null;
        while (item.attempts <= this.maxRetries) {
          item.attempts += 1;
          try {
            const result = await this.handler(item);
            this.emit('success', { item, result });
            break;
          } catch (err) {
            lastErr = err;
            if (item.attempts > this.maxRetries) {
              this.emit('failure', { item, error: err });
              break;
            }
            const delay = this.backoff(item.attempts);
            this.emit('retry', { item, error: err, delay });
            await new Promise((r) => setTimeout(r, delay));
          }
        }
        if (lastErr && item.attempts > this.maxRetries) {
          // terminal — already emitted failure
        }
      }
    } finally {
      this.processing = false;
      this.emit('drained');
    }
  }
}

// ───────────────────────────────────────────────────────────────
// createSender — wires transport + queue + audit log together
// ───────────────────────────────────────────────────────────────

function createSender(options = {}) {
  const transportCfg = options.transport || { type: 'noop' };
  const factory = transports[transportCfg.type];
  if (!factory) {
    throw new Error(`[send-email] unknown transport type: ${transportCfg.type}`);
  }
  const transport = factory(transportCfg);
  const audit = new AuditLog({ file: options.auditFile || null });
  const queue = new Queue({
    maxRetries: options.maxRetries,
    baseDelayMs: options.retryBaseDelayMs,
    maxDelayMs: options.retryMaxDelayMs,
  });

  queue.setHandler(async (item) => {
    try {
      const result = await transport.send(item.message);
      audit.write({
        event: 'email.sent',
        transport: transport.type,
        to: item.message.to,
        subject: item.message.subject,
        messageId: result.messageId,
        attempts: item.attempts,
        queueId: item.id,
        meta: item.meta || null,
      });
      return result;
    } catch (err) {
      audit.write({
        event: 'email.attempt_failed',
        transport: transport.type,
        to: item.message.to,
        subject: item.message.subject,
        error: err.message,
        attempts: item.attempts,
        queueId: item.id,
      });
      throw err;
    }
  });

  queue.on('failure', ({ item, error }) => {
    audit.write({
      event: 'email.dead_letter',
      transport: transport.type,
      to: item.message.to,
      subject: item.message.subject,
      error: error && error.message,
      attempts: item.attempts,
      queueId: item.id,
    });
  });

  return {
    transport,
    audit,
    queue,

    /**
     * Fire-and-wait send.  Returns provider response or throws on failure.
     */
    async send(message, meta) {
      const item = queue.enqueue({ message, meta });
      let settled = null;
      const onSuccess = (ev) => { if (ev.item.id === item.id) settled = { ok: true, ev }; };
      const onFailure = (ev) => { if (ev.item.id === item.id) settled = { ok: false, ev }; };
      queue.on('success', onSuccess);
      queue.on('failure', onFailure);
      try {
        await queue.drain();
      } finally {
        queue.off('success', onSuccess);
        queue.off('failure', onFailure);
      }
      if (!settled) {
        throw new Error('[send-email] queue drained without resolving item');
      }
      if (!settled.ok) throw settled.ev.error;
      return settled.ev.result;
    },

    /**
     * Enqueue a message without awaiting delivery.  Caller may call
     * sender.queue.drain() later (or rely on a scheduler).
     */
    enqueue(message, meta) {
      return queue.enqueue({ message, meta });
    },

    async drain() {
      return queue.drain();
    },
  };
}

// ───────────────────────────────────────────────────────────────
// Public surface
// ───────────────────────────────────────────────────────────────
module.exports = {
  createSender,
  composeMime,
  Queue,
  AuditLog,
  SmtpClient,
  transports,
  _internal: {
    encodeSubject,
    formatAddress,
    chunkBase64,
    randomBoundary,
  },
};
