/**
 * AG-X86 — Minimal E2E Test Harness
 * ============================================================
 * Techno-Kol Uzi mega-ERP — 2026-04-11
 *
 * A zero-dependency, Playwright-compatible page-object E2E harness
 * for Kobi's Hebrew-first procurement ERP. Two modes:
 *
 *  1) CDP MODE (when a Chromium is running with --remote-debugging-port=9222)
 *     Talks to the browser over Chrome DevTools Protocol using a hand-rolled
 *     RFC-6455 WebSocket client built on Node's built-in `http`/`net` sockets.
 *     No `ws` package, no `puppeteer`, no `playwright`.
 *
 *  2) HTTP MODE (default / CI fallback)
 *     Uses a pure-HTTP client that fetches HTML from a mock static server
 *     and runs assertions against the returned markup. Still useful for
 *     structural smoke tests, navigation flow, and content verification.
 *
 * Rule compliance (Techno-Kol Uzi ironclad rules):
 *   - לא מוחקים, רק משדרגים ומגדלים — this file is ADDITIVE. It coexists
 *     with `test/e2e/qa-04-*` which handle supertest-level E2E. Nothing
 *     is removed, renamed, or replaced.
 *   - Zero external deps — only `node:http`, `node:https`, `node:net`,
 *     `node:crypto`, `node:fs`, `node:path`, `node:url`, `node:events`.
 *   - Hebrew-aware — all public messages carry bilingual (he/en) variants
 *     so reporter output is readable by Hebrew-speaking devs.
 *
 * Public API (NOTE: this is the contract consumed by
 * `test/e2e/seed-flows.test.js` and any future E2E suites):
 *
 *    const { E2E, Runner, expect } = require('./e2e-harness.js');
 *
 *    // Launch a browser (or fall back to HTTP mode automatically)
 *    const browser = await E2E.launch({
 *      headless: true,
 *      viewport: { width: 1280, height: 800 },
 *      cdpUrl: 'ws://localhost:9222',     // optional
 *      fallbackMode: 'http',              // 'http' | 'none'
 *    });
 *
 *    const page = await browser.newPage();
 *    await page.goto('http://localhost:4173/login.html');
 *    await page.fill('#email', 'kobi@technokol.co.il');
 *    await page.fill('#password', 'SuperSecret!1');
 *    await page.click('#login-btn');
 *    await page.waitFor('#dashboard-root', { timeout: 5000 });
 *    expect(await page.content()).toContain('לוח מחוונים');
 *    await page.screenshot('/tmp/after-login.png');
 *    await page.close();
 *    await browser.close();
 *
 *    // Runner with retry, parallel, junit-xml output
 *    Runner.addTest('login flow / זרימת התחברות', async () => { ... });
 *    const report = await Runner.run({
 *      parallel: 2,
 *      retries: 1,
 *      reporter: 'junit',          // 'console' | 'junit' | 'json'
 *      junitOut: '_qa-reports/junit-e2e.xml',
 *    });
 *    // report.passed / report.failed / report.xml / report.json
 *
 *    // Minimal assertions
 *    expect(value).toBe(...);
 *    expect(value).toContain(...);
 *    expect(value).toMatch(/regex/);
 *    expect(value).toBeVisible();
 * ============================================================
 */

'use strict';

const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { EventEmitter } = require('node:events');

// ────────────────────────────────────────────────────────────
// 0. Utilities
// ────────────────────────────────────────────────────────────

function now() { return Date.now(); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function bilingual(he, en) { return { he, en, toString() { return `${he} / ${en}`; } }; }

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch (_) { /* ignore */ }
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeRegex(s) {
  return String(s).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

// ────────────────────────────────────────────────────────────
// 1. Minimal WebSocket client (RFC-6455) — zero dep
// ────────────────────────────────────────────────────────────
//
// Used only by the CDP transport. Very narrow subset:
//   - text frames only (CDP payloads are JSON)
//   - masked client→server, unmasked server→client
//   - no fragmentation (CDP messages are small)
//   - no permessage-deflate
//
// Also supports a "skip" mode for when we simply cannot connect
// (Chromium not running) — in that case the WS instance will
// emit 'error' and the E2E harness falls through to HTTP mode.

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class MiniWebSocket extends EventEmitter {
  constructor(wsUrl) {
    super();
    const parsed = new url.URL(wsUrl);
    this._isSecure = parsed.protocol === 'wss:';
    this._host = parsed.hostname;
    this._port = Number(parsed.port) || (this._isSecure ? 443 : 80);
    this._path = parsed.pathname + (parsed.search || '');
    this._key = crypto.randomBytes(16).toString('base64');
    this._connected = false;
    this._buffer = Buffer.alloc(0);
    this._socket = null;
    this._connect();
  }

  _connect() {
    const lib = this._isSecure ? https : http;
    const req = lib.request({
      host: this._host,
      port: this._port,
      path: this._path,
      method: 'GET',
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': this._key,
      },
    });
    req.on('error', (err) => this.emit('error', err));
    req.on('upgrade', (res, socket, head) => {
      const expected = crypto
        .createHash('sha1')
        .update(this._key + WS_GUID)
        .digest('base64');
      const got = res.headers['sec-websocket-accept'];
      if (got !== expected) {
        this.emit('error', new Error('ws handshake mismatch'));
        socket.destroy();
        return;
      }
      this._socket = socket;
      this._connected = true;
      if (head && head.length) this._onData(head);
      socket.on('data', (chunk) => this._onData(chunk));
      socket.on('error', (err) => this.emit('error', err));
      socket.on('close', () => {
        this._connected = false;
        this.emit('close');
      });
      this.emit('open');
    });
    req.end();
  }

  _onData(chunk) {
    this._buffer = Buffer.concat([this._buffer, chunk]);
    while (this._buffer.length >= 2) {
      const b0 = this._buffer[0];
      const b1 = this._buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (this._buffer.length < offset + 2) return;
        len = this._buffer.readUInt16BE(offset);
        offset += 2;
      } else if (len === 127) {
        if (this._buffer.length < offset + 8) return;
        // CDP payloads always fit in 32 bits
        const hi = this._buffer.readUInt32BE(offset);
        const lo = this._buffer.readUInt32BE(offset + 4);
        len = hi * 2 ** 32 + lo;
        offset += 8;
      }
      let maskKey = null;
      if (masked) {
        if (this._buffer.length < offset + 4) return;
        maskKey = this._buffer.slice(offset, offset + 4);
        offset += 4;
      }
      if (this._buffer.length < offset + len) return;
      const payload = this._buffer.slice(offset, offset + len);
      if (maskKey) {
        for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
      }
      this._buffer = this._buffer.slice(offset + len);
      if (!fin) {
        // ignoring fragmentation for CDP
        this.emit('error', new Error('fragmented frames not supported'));
        return;
      }
      if (opcode === 0x1) {
        this.emit('message', payload.toString('utf8'));
      } else if (opcode === 0x8) {
        // close
        this.close();
      } else if (opcode === 0x9) {
        // ping → pong
        this._writeFrame(0xa, payload);
      }
    }
  }

  _writeFrame(opcode, payload) {
    if (!this._socket) return;
    if (!Buffer.isBuffer(payload)) payload = Buffer.from(payload, 'utf8');
    const mask = crypto.randomBytes(4);
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(2 + 4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | len;
      mask.copy(header, 2);
    } else if (len < 65536) {
      header = Buffer.alloc(4 + 4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
      mask.copy(header, 4);
    } else {
      header = Buffer.alloc(10 + 4);
      header[0] = 0x80 | opcode;
      header[1] = 0x80 | 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(len, 6);
      mask.copy(header, 10);
    }
    const masked = Buffer.alloc(len);
    for (let i = 0; i < len; i++) masked[i] = payload[i] ^ mask[i % 4];
    try {
      this._socket.write(Buffer.concat([header, masked]));
    } catch (err) {
      this.emit('error', err);
    }
  }

  send(data) { this._writeFrame(0x1, data); }

  close() {
    if (this._socket) {
      try { this._writeFrame(0x8, Buffer.alloc(0)); } catch (_) {}
      try { this._socket.end(); } catch (_) {}
      this._socket = null;
    }
  }
}

// ────────────────────────────────────────────────────────────
// 2. CDP transport — auto-detects ws://localhost:9222
// ────────────────────────────────────────────────────────────

class CdpClient extends EventEmitter {
  constructor(wsUrl) {
    super();
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.ready = false;
  }

  async connect(timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error('CDP connect timeout'));
        }
      }, timeoutMs);
      try {
        this.ws = new MiniWebSocket(this.wsUrl);
      } catch (err) {
        clearTimeout(timer);
        return reject(err);
      }
      this.ws.on('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.ready = true;
        resolve();
      });
      this.ws.on('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
      this.ws.on('message', (msg) => this._onMessage(msg));
      this.ws.on('close', () => {
        this.ready = false;
        this.emit('close');
      });
    });
  }

  _onMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
      else resolve(msg.result || {});
    } else if (msg.method) {
      this.emit('event', msg.method, msg.params || {});
      this.emit(msg.method, msg.params || {});
    }
  }

  call(method, params = {}) {
    if (!this.ready) return Promise.reject(new Error('CDP not ready'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    if (this.ws) {
      try { this.ws.close(); } catch (_) {}
    }
    this.ready = false;
  }
}

async function probeCdp(hostPort = 'localhost:9222') {
  // /json/version returns the browser websocket debugger URL
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: hostPort.split(':')[0],
      port: Number(hostPort.split(':')[1] || 9222),
      path: '/json/version',
      method: 'GET',
      timeout: 1500,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          const info = JSON.parse(body);
          resolve(info.webSocketDebuggerUrl);
        } catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error('cdp probe timeout')); });
    req.end();
  });
}

// ────────────────────────────────────────────────────────────
// 3. HTTP fetch helper (mode 2)
// ────────────────────────────────────────────────────────────

function httpGet(urlStr) {
  return new Promise((resolve, reject) => {
    const parsed = new url.URL(urlStr);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.request({
      host: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method: 'GET',
      headers: {
        'User-Agent': 'E2EHarness/1.0 (+technokol)',
        'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
      },
      timeout: 5000,
    }, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('http get timeout')));
    req.end();
  });
}

// ────────────────────────────────────────────────────────────
// 4. Page object — two backends share the same API
// ────────────────────────────────────────────────────────────

class Page {
  constructor(browser) {
    this._browser = browser;
    this._mode = browser._mode;
    this._cdp = browser._cdp;
    this._currentUrl = null;
    this._html = '';
    this._fills = new Map(); // synthetic fills in HTTP mode
    this._closed = false;
    this._sessionId = null;
  }

  async _attachTarget() {
    if (this._mode !== 'cdp') return;
    const target = await this._cdp.call('Target.createTarget', { url: 'about:blank' });
    const attach = await this._cdp.call('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: true,
    });
    this._targetId = target.targetId;
    this._sessionId = attach.sessionId;
  }

  _assertOpen() {
    if (this._closed) {
      throw new Error('Page is closed / הדף נסגר');
    }
  }

  async goto(targetUrl) {
    this._assertOpen();
    this._currentUrl = targetUrl;
    if (this._mode === 'cdp') {
      await this._cdp.call('Page.enable');
      await this._cdp.call('Page.navigate', { url: targetUrl });
      await sleep(120);
      const { root } = await this._cdp.call('DOM.getDocument', { depth: -1 });
      this._rootNodeId = root.nodeId;
      const { outerHTML } = await this._cdp.call('DOM.getOuterHTML', { nodeId: root.nodeId });
      this._html = outerHTML;
    } else {
      try {
        const resp = await httpGet(targetUrl);
        this._html = resp.body || '';
        this._lastStatus = resp.status;
      } catch (err) {
        this._html = '';
        this._lastStatus = 0;
        this._lastError = err;
      }
    }
    return this;
  }

  async click(selector) {
    this._assertOpen();
    if (this._mode === 'cdp') {
      const nodeId = await this._queryCdp(selector);
      if (!nodeId) throw new Error(`click: selector not found: ${selector}`);
      const { model } = await this._cdp.call('DOM.getBoxModel', { nodeId });
      const [x1, y1, x2, , , y3] = model.content;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y3) / 2;
      await this._cdp.call('Input.dispatchMouseEvent', {
        type: 'mousePressed', x: cx, y: cy, button: 'left', clickCount: 1,
      });
      await this._cdp.call('Input.dispatchMouseEvent', {
        type: 'mouseReleased', x: cx, y: cy, button: 'left', clickCount: 1,
      });
    } else {
      // In HTTP mode, clicks are symbolic: we simulate anchor / form-action navigation
      // by extracting an href or form action from the selector's matched tag.
      const tagMatch = this._matchSelector(selector);
      if (tagMatch) {
        const hrefMatch = /href=["']([^"']+)["']/.exec(tagMatch);
        if (hrefMatch && this._currentUrl) {
          const next = new url.URL(hrefMatch[1], this._currentUrl).toString();
          await this.goto(next);
          return;
        }
      }
      // no-op: record the click for the log
      this._browser._log.push({ kind: 'click', selector, ts: now() });
    }
  }

  async fill(selector, value) {
    this._assertOpen();
    if (this._mode === 'cdp') {
      const nodeId = await this._queryCdp(selector);
      if (!nodeId) throw new Error(`fill: selector not found: ${selector}`);
      await this._cdp.call('DOM.focus', { nodeId });
      // clear existing
      await this._cdp.call('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'Control',
      });
      await this._cdp.call('Input.insertText', { text: value });
    } else {
      this._fills.set(selector, value);
      this._browser._log.push({ kind: 'fill', selector, value, ts: now() });
    }
  }

  async waitFor(selector, { timeout = 2000 } = {}) {
    this._assertOpen();
    const deadline = now() + timeout;
    while (now() < deadline) {
      if (this._mode === 'cdp') {
        const nodeId = await this._queryCdp(selector);
        if (nodeId) return true;
      } else {
        // Re-read HTML and look for selector
        if (this._currentUrl && !this._html) {
          await this.goto(this._currentUrl);
        }
        if (this._matchSelector(selector)) return true;
      }
      await sleep(50);
    }
    throw new Error(
      `waitFor timed out after ${timeout}ms: ${selector} / פג זמן המתנה ל-${selector}`,
    );
  }

  async screenshot(outPath) {
    this._assertOpen();
    ensureDir(path.dirname(outPath));
    if (this._mode === 'cdp') {
      try {
        const { data } = await this._cdp.call('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
        return { path: outPath, bytes: Buffer.from(data, 'base64').length };
      } catch (err) {
        // fall-through to stub
      }
    }
    // HTTP-mode / CDP-failure fallback: write a text stub
    const stub = `E2E screenshot stub @ ${new Date().toISOString()}\nurl=${this._currentUrl}\nhtml-bytes=${this._html.length}\n`;
    fs.writeFileSync(outPath, stub);
    return { path: outPath, bytes: stub.length, stub: true };
  }

  async content() {
    this._assertOpen();
    if (this._mode === 'cdp') {
      const { root } = await this._cdp.call('DOM.getDocument', { depth: -1 });
      const { outerHTML } = await this._cdp.call('DOM.getOuterHTML', { nodeId: root.nodeId });
      return outerHTML;
    }
    return this._html;
  }

  async evaluate(fnOrExpr, arg) {
    this._assertOpen();
    if (this._mode === 'cdp') {
      const expr = typeof fnOrExpr === 'function'
        ? `(${fnOrExpr.toString()})(${JSON.stringify(arg)})`
        : String(fnOrExpr);
      const { result } = await this._cdp.call('Runtime.evaluate', {
        expression: expr,
        returnByValue: true,
      });
      return result.value;
    }
    // HTTP mode: give the function a tiny DOM-ish shim
    if (typeof fnOrExpr === 'function') {
      const shim = {
        url: this._currentUrl,
        html: this._html,
        fills: Object.fromEntries(this._fills),
        querySelector: (sel) => this._matchSelector(sel),
        querySelectorAll: (sel) => this._matchAllSelectors(sel),
        contains: (needle) => this._html.includes(needle),
      };
      return fnOrExpr(shim, arg);
    }
    return null;
  }

  url() { return this._currentUrl; }

  async close() {
    if (this._closed) return;
    this._closed = true;
    if (this._mode === 'cdp' && this._targetId) {
      try { await this._cdp.call('Target.closeTarget', { targetId: this._targetId }); }
      catch (_) {}
    }
  }

  // ── internals ──

  async _queryCdp(selector) {
    try {
      const { nodeId } = await this._cdp.call('DOM.querySelector', {
        nodeId: this._rootNodeId,
        selector,
      });
      return nodeId || null;
    } catch (_) { return null; }
  }

  _matchSelector(selector) {
    // Very tiny selector engine for HTTP mode. Supports:
    //   #id            → [id="id"]
    //   .class         → class="... class ..."
    //   tag            → <tag ...>
    //   tag#id         → tag with id
    //   tag.class      → tag with class
    //   [attr="value"] → literal attr
    //   text:contains  → searches innerText
    if (!this._html) return null;
    const s = selector.trim();

    const textCont = /:contains\(["'](.+?)["']\)/.exec(s);
    if (textCont) {
      return this._html.includes(textCont[1]) ? `<text>${textCont[1]}</text>` : null;
    }

    if (s.startsWith('#')) {
      const id = s.slice(1);
      const re = new RegExp(`<[^>]*id=["']${escapeRegex(id)}["'][^>]*>`, 'i');
      const m = re.exec(this._html);
      return m ? m[0] : null;
    }
    if (s.startsWith('.')) {
      const cls = s.slice(1);
      const re = new RegExp(`<[^>]*class=["'][^"']*\\b${escapeRegex(cls)}\\b[^"']*["'][^>]*>`, 'i');
      const m = re.exec(this._html);
      return m ? m[0] : null;
    }
    const attrMatch = /^\[([a-zA-Z_:-]+)=["'](.+?)["']\]$/.exec(s);
    if (attrMatch) {
      const re = new RegExp(`<[^>]*${attrMatch[1]}=["']${escapeRegex(attrMatch[2])}["'][^>]*>`, 'i');
      const m = re.exec(this._html);
      return m ? m[0] : null;
    }
    // tag#id / tag.class / tag[attr=x] / plain tag
    const compound = /^([a-zA-Z][a-zA-Z0-9]*)?([#.][\w-]+)?(\[[^\]]+\])?$/.exec(s);
    if (compound) {
      const [, tag = '[a-zA-Z][a-zA-Z0-9]*', mod = '', attr = ''] = compound;
      let pat = `<${tag}`;
      if (mod.startsWith('#')) pat += `[^>]*id=["']${escapeRegex(mod.slice(1))}["']`;
      else if (mod.startsWith('.')) pat += `[^>]*class=["'][^"']*\\b${escapeRegex(mod.slice(1))}\\b[^"']*["']`;
      if (attr) {
        const am = /\[([a-zA-Z_:-]+)=["'](.+?)["']\]/.exec(attr);
        if (am) pat += `[^>]*${am[1]}=["']${escapeRegex(am[2])}["']`;
      }
      pat += `[^>]*>`;
      const re = new RegExp(pat, 'i');
      const m = re.exec(this._html);
      return m ? m[0] : null;
    }
    return null;
  }

  _matchAllSelectors(selector) {
    const out = [];
    let working = this._html;
    let m = null;
    // Simple repeat on _matchSelector by slicing. Good enough for the seed suite.
    while ((m = (new Page(this._browser)._withHtml(working))._matchSelector(selector))) {
      out.push(m);
      const idx = working.indexOf(m);
      if (idx < 0) break;
      working = working.slice(idx + m.length);
    }
    return out;
  }

  _withHtml(h) { this._html = h; return this; }
}

// ────────────────────────────────────────────────────────────
// 5. Browser façade
// ────────────────────────────────────────────────────────────

class Browser {
  constructor() {
    this._mode = 'http';    // 'cdp' | 'http'
    this._cdp = null;
    this._log = [];
    this._viewport = { width: 1280, height: 800 };
    this._closed = false;
  }

  async _init(opts = {}) {
    this._viewport = opts.viewport || this._viewport;
    const cdpUrl = opts.cdpUrl || 'ws://localhost:9222';
    let resolvedWs = null;
    // Try /json/version probe unless given an explicit ws://host:port/devtools/browser/ID
    if (/\/devtools\//.test(cdpUrl)) {
      resolvedWs = cdpUrl;
    } else {
      try {
        const hostPort = new url.URL(cdpUrl.replace(/^ws/, 'http')).host;
        resolvedWs = await probeCdp(hostPort);
      } catch (_) { resolvedWs = null; }
    }

    if (resolvedWs && opts.fallbackMode !== 'force-http') {
      try {
        this._cdp = new CdpClient(resolvedWs);
        await this._cdp.connect(2000);
        this._mode = 'cdp';
        this._log.push({ kind: 'launch', mode: 'cdp', ws: resolvedWs, ts: now() });
        return this;
      } catch (_) {
        this._cdp = null;
      }
    }
    this._mode = 'http';
    this._log.push({ kind: 'launch', mode: 'http', ts: now() });
    return this;
  }

  async newPage() {
    if (this._closed) throw new Error('browser closed / הדפדפן סגור');
    const p = new Page(this);
    await p._attachTarget();
    return p;
  }

  get mode() { return this._mode; }
  get log() { return this._log.slice(); }

  async close() {
    if (this._closed) return;
    this._closed = true;
    if (this._cdp) { try { await this._cdp.close(); } catch (_) {} }
  }
}

const E2E = {
  async launch(opts = {}) {
    const b = new Browser();
    await b._init(opts);
    return b;
  },
  Browser,
  Page,
};

// ────────────────────────────────────────────────────────────
// 6. Assertion library
// ────────────────────────────────────────────────────────────

class AssertionError extends Error {
  constructor(message, expected, actual) {
    super(message);
    this.name = 'E2EAssertionError';
    this.expected = expected;
    this.actual = actual;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new AssertionError(
          `expected ${JSON.stringify(actual)} toBe ${JSON.stringify(expected)}`,
          expected, actual,
        );
      }
      return true;
    },
    toContain(substr) {
      if (actual == null || !String(actual).includes(String(substr))) {
        throw new AssertionError(
          `expected value to contain ${JSON.stringify(substr)}`,
          substr, actual,
        );
      }
      return true;
    },
    toMatch(re) {
      if (!(re instanceof RegExp)) re = new RegExp(String(re));
      if (actual == null || !re.test(String(actual))) {
        throw new AssertionError(
          `expected value to match ${re}`,
          re.toString(), actual,
        );
      }
      return true;
    },
    toBeVisible() {
      // `actual` may be:
      //  - a selector match string (HTML snippet)
      //  - a CDP nodeId (number)
      //  - a boolean from `page.waitFor`
      //  - a Page instance (check current HTML / currentUrl)
      if (actual == null || actual === false || actual === '') {
        throw new AssertionError('expected element to be visible', 'visible', actual);
      }
      if (typeof actual === 'object' && actual !== null && actual instanceof Page) {
        if (!actual._html && !actual._currentUrl) {
          throw new AssertionError('expected Page to be visible', 'visible', 'empty');
        }
      }
      return true;
    },
    not: {
      toBe(expected) {
        if (actual === expected) {
          throw new AssertionError(`expected ${JSON.stringify(actual)} not toBe ${JSON.stringify(expected)}`, expected, actual);
        }
        return true;
      },
      toContain(substr) {
        if (actual != null && String(actual).includes(String(substr))) {
          throw new AssertionError(`expected value NOT to contain ${JSON.stringify(substr)}`, substr, actual);
        }
        return true;
      },
    },
  };
}

// ────────────────────────────────────────────────────────────
// 7. Runner — retry, parallel, junit-xml
// ────────────────────────────────────────────────────────────

class E2ERunner {
  constructor() {
    this._tests = [];
  }

  addTest(name, fn) {
    if (typeof name !== 'string') throw new Error('test name must be string');
    if (typeof fn !== 'function') throw new Error('test fn must be function');
    this._tests.push({ name, fn });
    return this;
  }

  clear() { this._tests = []; }

  async run({ parallel = 1, retries = 0, reporter = 'console', junitOut = null } = {}) {
    const queue = this._tests.slice();
    const results = [];
    const startAll = now();
    const workers = Math.max(1, Math.min(parallel, queue.length || 1));

    const runOne = async (test) => {
      const startedAt = now();
      let attempt = 0;
      let lastErr = null;
      while (attempt <= retries) {
        try {
          await test.fn();
          return {
            name: test.name,
            status: 'passed',
            attempts: attempt + 1,
            durationMs: now() - startedAt,
          };
        } catch (err) {
          lastErr = err;
          attempt++;
          if (attempt > retries) break;
        }
      }
      return {
        name: test.name,
        status: 'failed',
        attempts: attempt,
        durationMs: now() - startedAt,
        error: lastErr && (lastErr.stack || lastErr.message || String(lastErr)),
        message: lastErr && lastErr.message,
      };
    };

    async function worker() {
      while (queue.length) {
        const next = queue.shift();
        if (!next) return;
        const r = await runOne(next);
        results.push(r);
        if (reporter === 'console') {
          const icon = r.status === 'passed' ? 'PASS' : 'FAIL';
          // eslint-disable-next-line no-console
          console.log(`  [${icon}] ${r.name} (${r.durationMs}ms, attempts=${r.attempts})`);
          if (r.status === 'failed' && r.message) {
            // eslint-disable-next-line no-console
            console.log(`        → ${r.message}`);
          }
        }
      }
    }

    await Promise.all(Array.from({ length: workers }, () => worker()));

    const passed = results.filter((r) => r.status === 'passed').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    const totalMs = now() - startAll;

    const report = {
      total: results.length,
      passed,
      failed,
      durationMs: totalMs,
      results,
      xml: null,
      json: null,
    };

    if (reporter === 'junit' || junitOut) {
      report.xml = this._toJUnit(results, totalMs);
      if (junitOut) {
        ensureDir(path.dirname(junitOut));
        fs.writeFileSync(junitOut, report.xml, 'utf8');
      }
    }
    if (reporter === 'json') {
      report.json = JSON.stringify({ total: report.total, passed, failed, durationMs: totalMs, results }, null, 2);
    }

    return report;
  }

  _toJUnit(results, totalMs) {
    const failures = results.filter((r) => r.status === 'failed').length;
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(`<testsuite name="techno-kol-e2e" tests="${results.length}" failures="${failures}" time="${(totalMs / 1000).toFixed(3)}">`);
    for (const r of results) {
      lines.push(`  <testcase name="${escapeXml(r.name)}" time="${(r.durationMs / 1000).toFixed(3)}">`);
      if (r.status === 'failed') {
        lines.push(`    <failure message="${escapeXml(r.message || 'failed')}">${escapeXml(r.error || '')}</failure>`);
      }
      lines.push('  </testcase>');
    }
    lines.push('</testsuite>');
    return lines.join('\n');
  }
}

const Runner = new E2ERunner();

// ────────────────────────────────────────────────────────────
// 8. Tiny mock static server — a CI helper exposed for tests
// ────────────────────────────────────────────────────────────
//
// The seed-flows test uses this to serve HTML without needing the full
// onyx-procurement express app. Keep routes in ONE place so tests stay
// readable.

function createMockServer({ port = 0, pages = {} } = {}) {
  const server = http.createServer((req, res) => {
    const pathname = req.url.split('?')[0];
    const body = pages[pathname] != null ? pages[pathname] : pages['/*404'] || '<h1>404</h1>';
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Language': 'he',
    });
    res.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: realPort } = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${realPort}`,
        close() { return new Promise((r) => server.close(() => r())); },
      });
    });
  });
}

// ────────────────────────────────────────────────────────────
// 9. Exports
// ────────────────────────────────────────────────────────────

module.exports = {
  E2E,
  Runner,
  E2ERunner,          // for tests that want their own instance
  expect,
  AssertionError,
  createMockServer,
  _internals: {
    MiniWebSocket,
    CdpClient,
    probeCdp,
    httpGet,
    bilingual,
  },
};
