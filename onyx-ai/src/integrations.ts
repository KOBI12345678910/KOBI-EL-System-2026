// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
//
//  ONYX AI v2.0 — PART 2: COMPLETE INTEGRATION LAYER
//  WhatsApp • SMS • Gmail • Telegram • Slack • Calendar • Drive
//  AI/LLM • Database • Webhooks • CRM • Payments • Monitoring
//
//  Reconstructed from architecture — companion to src/index.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Request, Response, Router, NextFunction } from 'express';

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 0: SHARED INFRASTRUCTURE
// ═══════════════════════════════════════════════════════════════════════════

/** Result<T, E> — explicit error handling, matches Part 1 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** Lightweight logger (matches Part 1 logger interface) */
export interface ILogger {
  debug(msg: string, meta?: any): void;
  info(msg: string, meta?: any): void;
  warn(msg: string, meta?: any): void;
  error(msg: string, meta?: any): void;
}

export class ConsoleLogger implements ILogger {
  constructor(private prefix = '[ONYX-INT]') {}
  debug(m: string, meta?: any) { console.debug(`${this.prefix} ${m}`, meta ?? ''); }
  info(m: string, meta?: any)  { console.info(`${this.prefix} ${m}`, meta ?? ''); }
  warn(m: string, meta?: any)  { console.warn(`${this.prefix} ${m}`, meta ?? ''); }
  error(m: string, meta?: any) { console.error(`${this.prefix} ${m}`, meta ?? ''); }
}

/** ToolConfig — describes a tool that the AgentRuntime can execute */
export interface ToolConfig {
  name: string;
  description: string;
  category: string;
  inputSchema: Record<string, any>;
  execute: (input: any, ctx?: ToolContext) => Promise<Result<any, Error>>;
  requiresApproval?: boolean;
  rateLimit?: { requests: number; windowMs: number };
  costTier?: 'free' | 'cheap' | 'standard' | 'premium';
  tags?: string[];
}

export interface ToolContext {
  userId?: string;
  sessionId?: string;
  logger?: ILogger;
  vault?: CredentialVault;
  http?: HttpClient;
}

// ───────────────────────────────────────────────────────────────
// HttpClient — with retry, timeout, rate-limit awareness
// ───────────────────────────────────────────────────────────────

export interface HttpOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: any;
  query?: Record<string, string | number | boolean | undefined | null>;
  timeout?: number;
  retries?: number;
  retryDelayMs?: number;
  parseJson?: boolean;
}

export interface HttpResponse<T = any> {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  data: T;
  raw: string;
}

export class HttpClient {
  constructor(private logger: ILogger = new ConsoleLogger('[HTTP]')) {}

  async request<T = any>(url: string, opts: HttpOptions = {}): Promise<Result<HttpResponse<T>, Error>> {
    const {
      method = 'GET',
      headers = {},
      body,
      query,
      timeout = 30_000,
      retries = 2,
      retryDelayMs = 500,
      parseJson = true,
    } = opts;

    // Build URL with query params
    let finalUrl = url;
    if (query && Object.keys(query).length > 0) {
      const qs = Object.entries(query)
        .filter(([_, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      finalUrl += (url.includes('?') ? '&' : '?') + qs;
    }

    const finalHeaders: Record<string, string> = {
      'User-Agent': 'ONYX-AI/2.0',
      ...headers,
    };

    let reqBody: any = undefined;
    if (body !== undefined) {
      if (typeof body === 'string' || body instanceof Buffer) {
        reqBody = body;
      } else {
        reqBody = JSON.stringify(body);
        if (!finalHeaders['Content-Type']) {
          finalHeaders['Content-Type'] = 'application/json';
        }
      }
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), timeout);

        this.logger.debug(`${method} ${finalUrl} (attempt ${attempt + 1}/${retries + 1})`);

        const res = await fetch(finalUrl, {
          method,
          headers: finalHeaders,
          body: reqBody,
          signal: controller.signal,
        });
        clearTimeout(tid);

        const raw = await res.text();
        let data: any = raw;
        if (parseJson && raw.length > 0) {
          try { data = JSON.parse(raw); } catch { /* keep as text */ }
        }

        const headersObj: Record<string, string> = {};
        res.headers.forEach((v, k) => { headersObj[k] = v; });

        const response: HttpResponse<T> = {
          status: res.status,
          ok: res.ok,
          headers: headersObj,
          data,
          raw,
        };

        // Retry on 429 / 5xx (except on last attempt)
        if (!res.ok && (res.status === 429 || res.status >= 500) && attempt < retries) {
          const delay = retryDelayMs * Math.pow(2, attempt);
          this.logger.warn(`${method} ${finalUrl} → ${res.status}, retrying in ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        if (!res.ok) {
          return err(new Error(`HTTP ${res.status}: ${raw.slice(0, 500)}`));
        }

        return ok(response);
      } catch (e: any) {
        lastError = e instanceof Error ? e : new Error(String(e));
        this.logger.warn(`${method} ${finalUrl} failed: ${lastError.message}`);
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, retryDelayMs * Math.pow(2, attempt)));
        }
      }
    }
    return err(lastError ?? new Error('Unknown HTTP error'));
  }

  async get<T = any>(url: string, opts: Omit<HttpOptions, 'method'> = {}) {
    return this.request<T>(url, { ...opts, method: 'GET' });
  }
  async post<T = any>(url: string, body?: any, opts: Omit<HttpOptions, 'method' | 'body'> = {}) {
    return this.request<T>(url, { ...opts, method: 'POST', body });
  }
  async put<T = any>(url: string, body?: any, opts: Omit<HttpOptions, 'method' | 'body'> = {}) {
    return this.request<T>(url, { ...opts, method: 'PUT', body });
  }
  async patch<T = any>(url: string, body?: any, opts: Omit<HttpOptions, 'method' | 'body'> = {}) {
    return this.request<T>(url, { ...opts, method: 'PATCH', body });
  }
  async delete<T = any>(url: string, opts: Omit<HttpOptions, 'method'> = {}) {
    return this.request<T>(url, { ...opts, method: 'DELETE' });
  }
}

// ───────────────────────────────────────────────────────────────
// CredentialVault — AES-256-CBC encrypted credential store
// ───────────────────────────────────────────────────────────────

export interface VaultEntry {
  name: string;
  category: string;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
}

export class CredentialVault {
  private static readonly ALGO = 'aes-256-cbc';
  private static readonly IV_LEN = 16;

  private store: Map<string, { iv: string; ciphertext: string; entry: VaultEntry }> = new Map();
  private key: Buffer;
  private filePath?: string;

  constructor(masterKey: string, filePath?: string) {
    if (!masterKey || masterKey.length < 16) {
      throw new Error('CredentialVault: master key must be at least 16 characters');
    }
    // Derive a stable 32-byte key from the master key via SHA-256
    this.key = crypto.createHash('sha256').update(masterKey).digest();
    this.filePath = filePath;
    if (filePath && fs.existsSync(filePath)) {
      this.load();
    }
  }

  /** Store a secret under a name */
  set(name: string, value: string, category = 'generic', metadata?: Record<string, any>): void {
    const iv = crypto.randomBytes(CredentialVault.IV_LEN);
    const cipher = crypto.createCipheriv(CredentialVault.ALGO, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const now = Date.now();
    const existing = this.store.get(name);
    this.store.set(name, {
      iv: iv.toString('hex'),
      ciphertext: encrypted.toString('hex'),
      entry: {
        name,
        category,
        createdAt: existing?.entry.createdAt ?? now,
        updatedAt: now,
        metadata,
      },
    });
    this.persist();
  }

  /** Retrieve and decrypt a secret */
  get(name: string): string | null {
    const item = this.store.get(name);
    if (!item) return null;
    try {
      const iv = Buffer.from(item.iv, 'hex');
      const decipher = crypto.createDecipheriv(CredentialVault.ALGO, this.key, iv);
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(item.ciphertext, 'hex')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch (e) {
      return null;
    }
  }

  /** List entries without exposing secret values */
  list(): VaultEntry[] {
    return Array.from(this.store.values()).map(x => x.entry);
  }

  /** Remove a credential */
  delete(name: string): boolean {
    const existed = this.store.delete(name);
    if (existed) this.persist();
    return existed;
  }

  /** Bulk load secrets from an environment object */
  loadFromEnv(env: NodeJS.ProcessEnv, mappings: Record<string, { category: string; required?: boolean }>): string[] {
    const missing: string[] = [];
    for (const [envKey, cfg] of Object.entries(mappings)) {
      const val = env[envKey];
      if (val && val.trim().length > 0) {
        this.set(envKey, val, cfg.category);
      } else if (cfg.required) {
        missing.push(envKey);
      }
    }
    return missing;
  }

  private persist(): void {
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const payload: Record<string, any> = {};
      this.store.forEach((v, k) => {
        payload[k] = { iv: v.iv, ciphertext: v.ciphertext, entry: v.entry };
      });
      fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
    } catch (e) {
      console.error('[CredentialVault] persist failed:', e);
    }
  }

  private load(): void {
    if (!this.filePath || !fs.existsSync(this.filePath)) return;
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries<any>(parsed)) {
        this.store.set(k, v);
      }
    } catch (e) {
      console.error('[CredentialVault] load failed:', e);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: WHATSAPP BUSINESS CLOUD API (Meta graph.facebook.com/v21.0)
// ═══════════════════════════════════════════════════════════════════════════

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
}

export function createWhatsAppTools(cfg: WhatsAppConfig, http: HttpClient): ToolConfig[] {
  const version = cfg.apiVersion ?? 'v21.0';
  const baseUrl = `https://graph.facebook.com/${version}/${cfg.phoneNumberId}`;
  const authHeaders = { Authorization: `Bearer ${cfg.accessToken}` };

  return [
    {
      name: 'whatsapp_send_text',
      description: 'Send a plain text WhatsApp message to a phone number',
      category: 'messaging',
      inputSchema: {
        to: { type: 'string', required: true, description: 'E.164 phone number (e.g., 972501234567)' },
        text: { type: 'string', required: true, description: 'Message body (max 4096 chars)' },
        previewUrl: { type: 'boolean', required: false, default: false },
      },
      costTier: 'cheap',
      rateLimit: { requests: 80, windowMs: 1000 },
      async execute(input) {
        if (!input.to || !input.text) return err(new Error('to and text are required'));
        const res = await http.post(`${baseUrl}/messages`, {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: input.to,
          type: 'text',
          text: { body: input.text, preview_url: input.previewUrl ?? false },
        }, { headers: authHeaders });
        if (!res.ok) return res;
        return ok({ messageId: res.value.data.messages?.[0]?.id, raw: res.value.data });
      },
    },

    {
      name: 'whatsapp_send_template',
      description: 'Send a pre-approved WhatsApp template message (required for outside 24h window)',
      category: 'messaging',
      inputSchema: {
        to: { type: 'string', required: true },
        templateName: { type: 'string', required: true },
        languageCode: { type: 'string', required: false, default: 'he' },
        variables: { type: 'array', required: false, description: 'String values to fill {{1}}, {{2}}, ...' },
      },
      costTier: 'cheap',
      async execute(input) {
        if (!input.to || !input.templateName) return err(new Error('to and templateName required'));
        const components: any[] = [];
        if (Array.isArray(input.variables) && input.variables.length > 0) {
          components.push({
            type: 'body',
            parameters: input.variables.map((v: any) => ({ type: 'text', text: String(v) })),
          });
        }
        const res = await http.post(`${baseUrl}/messages`, {
          messaging_product: 'whatsapp',
          to: input.to,
          type: 'template',
          template: {
            name: input.templateName,
            language: { code: input.languageCode ?? 'he' },
            components,
          },
        }, { headers: authHeaders });
        if (!res.ok) return res;
        return ok({ messageId: res.value.data.messages?.[0]?.id, raw: res.value.data });
      },
    },

    {
      name: 'whatsapp_send_media',
      description: 'Send an image, document, video, or audio message',
      category: 'messaging',
      inputSchema: {
        to: { type: 'string', required: true },
        mediaType: { type: 'string', enum: ['image', 'document', 'video', 'audio'], required: true },
        mediaUrl: { type: 'string', required: true },
        caption: { type: 'string', required: false },
        filename: { type: 'string', required: false, description: 'Document filename' },
      },
      costTier: 'standard',
      async execute(input) {
        if (!input.to || !input.mediaType || !input.mediaUrl) {
          return err(new Error('to, mediaType, and mediaUrl are required'));
        }
        const mediaPayload: any = { link: input.mediaUrl };
        if (input.caption && input.mediaType !== 'audio') mediaPayload.caption = input.caption;
        if (input.filename && input.mediaType === 'document') mediaPayload.filename = input.filename;

        const res = await http.post(`${baseUrl}/messages`, {
          messaging_product: 'whatsapp',
          to: input.to,
          type: input.mediaType,
          [input.mediaType]: mediaPayload,
        }, { headers: authHeaders });
        if (!res.ok) return res;
        return ok({ messageId: res.value.data.messages?.[0]?.id });
      },
    },

    {
      name: 'whatsapp_send_interactive',
      description: 'Send an interactive message with buttons or list',
      category: 'messaging',
      inputSchema: {
        to: { type: 'string', required: true },
        bodyText: { type: 'string', required: true },
        headerText: { type: 'string', required: false },
        footerText: { type: 'string', required: false },
        interactiveType: { type: 'string', enum: ['button', 'list'], required: true },
        buttons: { type: 'array', required: false, description: 'For button type: [{id, title}]' },
        sections: { type: 'array', required: false, description: 'For list type: [{title, rows:[{id,title,description}]}]' },
        listButtonText: { type: 'string', required: false, default: 'בחר אפשרות' },
      },
      costTier: 'standard',
      async execute(input) {
        if (!input.to || !input.bodyText || !input.interactiveType) {
          return err(new Error('to, bodyText, and interactiveType are required'));
        }
        const action: any = {};
        if (input.interactiveType === 'button') {
          action.buttons = (input.buttons || []).map((b: any) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title },
          }));
        } else {
          action.button = input.listButtonText ?? 'בחר אפשרות';
          action.sections = input.sections ?? [];
        }
        const interactive: any = {
          type: input.interactiveType,
          body: { text: input.bodyText },
          action,
        };
        if (input.headerText) interactive.header = { type: 'text', text: input.headerText };
        if (input.footerText) interactive.footer = { text: input.footerText };

        const res = await http.post(`${baseUrl}/messages`, {
          messaging_product: 'whatsapp',
          to: input.to,
          type: 'interactive',
          interactive,
        }, { headers: authHeaders });
        if (!res.ok) return res;
        return ok({ messageId: res.value.data.messages?.[0]?.id });
      },
    },

    {
      name: 'whatsapp_mark_read',
      description: 'Mark a received WhatsApp message as read',
      category: 'messaging',
      inputSchema: {
        messageId: { type: 'string', required: true, description: 'WhatsApp message ID from webhook' },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.messageId) return err(new Error('messageId required'));
        const res = await http.post(`${baseUrl}/messages`, {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: input.messageId,
        }, { headers: authHeaders });
        if (!res.ok) return res;
        return ok({ marked: true });
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: SMS / TWILIO
// ═══════════════════════════════════════════════════════════════════════════

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export function createSMSTools(cfg: TwilioConfig, http: HttpClient): ToolConfig[] {
  const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}`;
  const authHeader = `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')}`;

  return [
    {
      name: 'twilio_send_sms',
      description: 'Send an SMS message via Twilio',
      category: 'messaging',
      inputSchema: {
        to: { type: 'string', required: true, description: 'E.164 phone number' },
        body: { type: 'string', required: true, description: 'SMS body (max 1600 chars)' },
        mediaUrl: { type: 'string', required: false, description: 'Optional MMS media URL' },
      },
      costTier: 'cheap',
      rateLimit: { requests: 100, windowMs: 1000 },
      async execute(input) {
        if (!input.to || !input.body) return err(new Error('to and body required'));
        const form = new URLSearchParams();
        form.append('To', input.to);
        form.append('From', cfg.fromNumber);
        form.append('Body', input.body);
        if (input.mediaUrl) form.append('MediaUrl', input.mediaUrl);

        const res = await http.post(`${baseUrl}/Messages.json`, form.toString(), {
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
        if (!res.ok) return res;
        return ok({ sid: res.value.data.sid, status: res.value.data.status });
      },
    },

    {
      name: 'twilio_get_message_status',
      description: 'Get the status of a previously sent Twilio message',
      category: 'messaging',
      inputSchema: { messageSid: { type: 'string', required: true } },
      costTier: 'free',
      async execute(input) {
        if (!input.messageSid) return err(new Error('messageSid required'));
        const res = await http.get(`${baseUrl}/Messages/${input.messageSid}.json`, {
          headers: { Authorization: authHeader },
        });
        if (!res.ok) return res;
        return ok({
          sid: res.value.data.sid,
          status: res.value.data.status,
          errorCode: res.value.data.error_code,
          errorMessage: res.value.data.error_message,
        });
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: EMAIL — GMAIL API + SENDGRID
// ═══════════════════════════════════════════════════════════════════════════

export interface GmailConfig {
  accessToken: string; // OAuth2 access token
  userEmail?: string;  // 'me' by default
}

export interface SendGridConfig {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
}

function buildRfc822Message(opts: {
  to: string;
  from: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
  cc?: string;
  bcc?: string;
}): string {
  const headers: string[] = [
    `From: ${opts.from}`,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject, 'utf8').toString('base64')}?=`,
    'MIME-Version: 1.0',
  ];
  if (opts.cc) headers.push(`Cc: ${opts.cc}`);
  if (opts.bcc) headers.push(`Bcc: ${opts.bcc}`);

  if (opts.bodyHtml) {
    headers.push('Content-Type: text/html; charset=UTF-8');
    headers.push('Content-Transfer-Encoding: base64');
    return headers.join('\r\n') + '\r\n\r\n' + Buffer.from(opts.bodyHtml, 'utf8').toString('base64');
  } else {
    headers.push('Content-Type: text/plain; charset=UTF-8');
    headers.push('Content-Transfer-Encoding: base64');
    return headers.join('\r\n') + '\r\n\r\n' + Buffer.from(opts.bodyText ?? '', 'utf8').toString('base64');
  }
}

export function createEmailTools(
  gmail: GmailConfig | null,
  sendgrid: SendGridConfig | null,
  http: HttpClient
): ToolConfig[] {
  const tools: ToolConfig[] = [];

  if (gmail) {
    const user = gmail.userEmail ?? 'me';
    const baseUrl = `https://gmail.googleapis.com/gmail/v1/users/${user}`;
    const authHeaders = { Authorization: `Bearer ${gmail.accessToken}` };

    tools.push({
      name: 'gmail_send',
      description: 'Send an email via Gmail API',
      category: 'email',
      inputSchema: {
        to: { type: 'string', required: true },
        subject: { type: 'string', required: true },
        bodyText: { type: 'string', required: false },
        bodyHtml: { type: 'string', required: false },
        cc: { type: 'string', required: false },
        bcc: { type: 'string', required: false },
        from: { type: 'string', required: false },
      },
      costTier: 'free',
      requiresApproval: false,
      async execute(input) {
        if (!input.to || !input.subject) return err(new Error('to and subject required'));
        if (!input.bodyText && !input.bodyHtml) return err(new Error('bodyText or bodyHtml required'));
        const rawMime = buildRfc822Message({
          to: input.to,
          from: input.from ?? user,
          subject: input.subject,
          bodyText: input.bodyText,
          bodyHtml: input.bodyHtml,
          cc: input.cc,
          bcc: input.bcc,
        });
        const rawBase64 = Buffer.from(rawMime, 'utf8')
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const res = await http.post(`${baseUrl}/messages/send`, { raw: rawBase64 }, {
          headers: authHeaders,
        });
        if (!res.ok) return res;
        return ok({ id: res.value.data.id, threadId: res.value.data.threadId });
      },
    });

    tools.push({
      name: 'gmail_search',
      description: 'Search Gmail messages using Gmail query syntax (from:, subject:, is:unread, etc.)',
      category: 'email',
      inputSchema: {
        query: { type: 'string', required: true },
        maxResults: { type: 'number', required: false, default: 10 },
      },
      costTier: 'free',
      async execute(input) {
        const res = await http.get(`${baseUrl}/messages`, {
          headers: authHeaders,
          query: { q: input.query, maxResults: input.maxResults ?? 10 },
        });
        if (!res.ok) return res;
        return ok({ messages: res.value.data.messages ?? [], total: res.value.data.resultSizeEstimate });
      },
    });

    tools.push({
      name: 'gmail_read',
      description: 'Read the full content of a specific Gmail message by ID',
      category: 'email',
      inputSchema: { messageId: { type: 'string', required: true } },
      costTier: 'free',
      async execute(input) {
        if (!input.messageId) return err(new Error('messageId required'));
        const res = await http.get(`${baseUrl}/messages/${input.messageId}`, {
          headers: authHeaders,
          query: { format: 'full' },
        });
        if (!res.ok) return res;
        return ok(res.value.data);
      },
    });
  }

  if (sendgrid) {
    tools.push({
      name: 'sendgrid_send',
      description: 'Send an email via SendGrid API',
      category: 'email',
      inputSchema: {
        to: { type: 'string', required: true },
        subject: { type: 'string', required: true },
        bodyText: { type: 'string', required: false },
        bodyHtml: { type: 'string', required: false },
        templateId: { type: 'string', required: false },
        templateData: { type: 'object', required: false },
      },
      costTier: 'cheap',
      rateLimit: { requests: 100, windowMs: 1000 },
      async execute(input) {
        if (!input.to || !input.subject) return err(new Error('to and subject required'));
        const payload: any = {
          personalizations: [{ to: [{ email: input.to }] }],
          from: { email: sendgrid.fromEmail, name: sendgrid.fromName ?? sendgrid.fromEmail },
          subject: input.subject,
        };
        if (input.templateId) {
          payload.template_id = input.templateId;
          if (input.templateData) {
            payload.personalizations[0].dynamic_template_data = input.templateData;
          }
        } else {
          const content: any[] = [];
          if (input.bodyText) content.push({ type: 'text/plain', value: input.bodyText });
          if (input.bodyHtml) content.push({ type: 'text/html', value: input.bodyHtml });
          payload.content = content;
        }

        const res = await http.post('https://api.sendgrid.com/v3/mail/send', payload, {
          headers: { Authorization: `Bearer ${sendgrid.apiKey}` },
        });
        if (!res.ok) return res;
        return ok({ sent: true, statusCode: res.value.status });
      },
    });
  }

  return tools;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: TELEGRAM BOT API
// ═══════════════════════════════════════════════════════════════════════════

export interface TelegramConfig {
  botToken: string;
}

export function createTelegramTools(cfg: TelegramConfig, http: HttpClient): ToolConfig[] {
  const baseUrl = `https://api.telegram.org/bot${cfg.botToken}`;

  return [
    {
      name: 'telegram_send_message',
      description: 'Send a text message via Telegram bot',
      category: 'messaging',
      inputSchema: {
        chatId: { type: 'string', required: true, description: 'Chat ID or @channel username' },
        text: { type: 'string', required: true },
        parseMode: { type: 'string', enum: ['Markdown', 'MarkdownV2', 'HTML'], required: false },
        disableWebPagePreview: { type: 'boolean', required: false },
        replyToMessageId: { type: 'number', required: false },
      },
      costTier: 'free',
      rateLimit: { requests: 30, windowMs: 1000 },
      async execute(input) {
        if (!input.chatId || !input.text) return err(new Error('chatId and text required'));
        const res = await http.post(`${baseUrl}/sendMessage`, {
          chat_id: input.chatId,
          text: input.text,
          parse_mode: input.parseMode,
          disable_web_page_preview: input.disableWebPagePreview,
          reply_to_message_id: input.replyToMessageId,
        });
        if (!res.ok) return res;
        return ok({ messageId: res.value.data.result?.message_id, raw: res.value.data.result });
      },
    },

    {
      name: 'telegram_send_photo',
      description: 'Send a photo via Telegram bot',
      category: 'messaging',
      inputSchema: {
        chatId: { type: 'string', required: true },
        photo: { type: 'string', required: true, description: 'Photo URL or file_id' },
        caption: { type: 'string', required: false },
        parseMode: { type: 'string', required: false },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.chatId || !input.photo) return err(new Error('chatId and photo required'));
        const res = await http.post(`${baseUrl}/sendPhoto`, {
          chat_id: input.chatId,
          photo: input.photo,
          caption: input.caption,
          parse_mode: input.parseMode,
        });
        if (!res.ok) return res;
        return ok({ messageId: res.value.data.result?.message_id });
      },
    },

    {
      name: 'telegram_send_document',
      description: 'Send a document/file via Telegram bot',
      category: 'messaging',
      inputSchema: {
        chatId: { type: 'string', required: true },
        document: { type: 'string', required: true, description: 'Document URL or file_id' },
        caption: { type: 'string', required: false },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.chatId || !input.document) return err(new Error('chatId and document required'));
        const res = await http.post(`${baseUrl}/sendDocument`, {
          chat_id: input.chatId,
          document: input.document,
          caption: input.caption,
        });
        if (!res.ok) return res;
        return ok({ messageId: res.value.data.result?.message_id });
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: SLACK
// ═══════════════════════════════════════════════════════════════════════════

export interface SlackConfig {
  botToken: string;
  signingSecret?: string;
}

export function createSlackTools(cfg: SlackConfig, http: HttpClient): ToolConfig[] {
  const authHeaders = {
    Authorization: `Bearer ${cfg.botToken}`,
    'Content-Type': 'application/json; charset=utf-8',
  };

  return [
    {
      name: 'slack_post_message',
      description: 'Post a message to a Slack channel',
      category: 'messaging',
      inputSchema: {
        channel: { type: 'string', required: true, description: 'Channel ID or name (#general)' },
        text: { type: 'string', required: true },
        blocks: { type: 'array', required: false, description: 'Block Kit layout' },
        threadTs: { type: 'string', required: false, description: 'Reply in thread' },
      },
      costTier: 'free',
      rateLimit: { requests: 60, windowMs: 60_000 },
      async execute(input) {
        if (!input.channel || !input.text) return err(new Error('channel and text required'));
        const res = await http.post('https://slack.com/api/chat.postMessage', {
          channel: input.channel,
          text: input.text,
          blocks: input.blocks,
          thread_ts: input.threadTs,
        }, { headers: authHeaders });
        if (!res.ok) return res;
        if (!res.value.data.ok) return err(new Error(`Slack error: ${res.value.data.error}`));
        return ok({ ts: res.value.data.ts, channel: res.value.data.channel });
      },
    },

    {
      name: 'slack_update_message',
      description: 'Update an existing Slack message',
      category: 'messaging',
      inputSchema: {
        channel: { type: 'string', required: true },
        ts: { type: 'string', required: true, description: 'Message timestamp (returned from post_message)' },
        text: { type: 'string', required: true },
        blocks: { type: 'array', required: false },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.channel || !input.ts || !input.text) {
          return err(new Error('channel, ts, and text required'));
        }
        const res = await http.post('https://slack.com/api/chat.update', {
          channel: input.channel,
          ts: input.ts,
          text: input.text,
          blocks: input.blocks,
        }, { headers: authHeaders });
        if (!res.ok) return res;
        if (!res.value.data.ok) return err(new Error(`Slack error: ${res.value.data.error}`));
        return ok({ updated: true, ts: res.value.data.ts });
      },
    },

    {
      name: 'slack_upload_file',
      description: 'Upload a file to a Slack channel via external URL',
      category: 'messaging',
      inputSchema: {
        channels: { type: 'string', required: true, description: 'Comma-separated channel IDs' },
        content: { type: 'string', required: false, description: 'Text content of file' },
        filename: { type: 'string', required: false },
        title: { type: 'string', required: false },
        initialComment: { type: 'string', required: false },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.channels) return err(new Error('channels required'));
        const form = new URLSearchParams();
        form.append('channels', input.channels);
        if (input.content) form.append('content', input.content);
        if (input.filename) form.append('filename', input.filename);
        if (input.title) form.append('title', input.title);
        if (input.initialComment) form.append('initial_comment', input.initialComment);

        const res = await http.post('https://slack.com/api/files.upload', form.toString(), {
          headers: {
            Authorization: `Bearer ${cfg.botToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });
        if (!res.ok) return res;
        if (!res.value.data.ok) return err(new Error(`Slack error: ${res.value.data.error}`));
        return ok({ fileId: res.value.data.file?.id });
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: GOOGLE CALENDAR
// ═══════════════════════════════════════════════════════════════════════════

export interface GoogleCalendarConfig {
  accessToken: string;
  defaultCalendarId?: string;
}

export function createCalendarTools(cfg: GoogleCalendarConfig, http: HttpClient): ToolConfig[] {
  const baseUrl = 'https://www.googleapis.com/calendar/v3';
  const authHeaders = { Authorization: `Bearer ${cfg.accessToken}` };
  const defaultCal = cfg.defaultCalendarId ?? 'primary';

  return [
    {
      name: 'calendar_create_event',
      description: 'Create a Google Calendar event',
      category: 'calendar',
      inputSchema: {
        calendarId: { type: 'string', required: false, default: 'primary' },
        summary: { type: 'string', required: true },
        description: { type: 'string', required: false },
        location: { type: 'string', required: false },
        startDateTime: { type: 'string', required: true, description: 'ISO 8601 datetime' },
        endDateTime: { type: 'string', required: true },
        timeZone: { type: 'string', required: false, default: 'Asia/Jerusalem' },
        attendees: { type: 'array', required: false, description: '[{email:string}]' },
        reminders: { type: 'array', required: false },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.summary || !input.startDateTime || !input.endDateTime) {
          return err(new Error('summary, startDateTime, and endDateTime required'));
        }
        const cal = input.calendarId ?? defaultCal;
        const event: any = {
          summary: input.summary,
          description: input.description,
          location: input.location,
          start: { dateTime: input.startDateTime, timeZone: input.timeZone ?? 'Asia/Jerusalem' },
          end: { dateTime: input.endDateTime, timeZone: input.timeZone ?? 'Asia/Jerusalem' },
        };
        if (input.attendees) event.attendees = input.attendees;
        if (input.reminders) event.reminders = { useDefault: false, overrides: input.reminders };

        const res = await http.post(`${baseUrl}/calendars/${encodeURIComponent(cal)}/events`, event, {
          headers: authHeaders,
        });
        if (!res.ok) return res;
        return ok({ eventId: res.value.data.id, htmlLink: res.value.data.htmlLink });
      },
    },

    {
      name: 'calendar_list_events',
      description: 'List events from a Google Calendar within a time range',
      category: 'calendar',
      inputSchema: {
        calendarId: { type: 'string', required: false, default: 'primary' },
        timeMin: { type: 'string', required: false, description: 'ISO 8601' },
        timeMax: { type: 'string', required: false },
        maxResults: { type: 'number', required: false, default: 20 },
        query: { type: 'string', required: false },
      },
      costTier: 'free',
      async execute(input) {
        const cal = input.calendarId ?? defaultCal;
        const res = await http.get(`${baseUrl}/calendars/${encodeURIComponent(cal)}/events`, {
          headers: authHeaders,
          query: {
            timeMin: input.timeMin ?? new Date().toISOString(),
            timeMax: input.timeMax,
            maxResults: input.maxResults ?? 20,
            singleEvents: true,
            orderBy: 'startTime',
            q: input.query,
          },
        });
        if (!res.ok) return res;
        return ok({ events: res.value.data.items ?? [] });
      },
    },

    {
      name: 'calendar_update_event',
      description: 'Update an existing Google Calendar event (partial update)',
      category: 'calendar',
      inputSchema: {
        calendarId: { type: 'string', required: false },
        eventId: { type: 'string', required: true },
        updates: { type: 'object', required: true, description: 'Fields to patch' },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.eventId || !input.updates) return err(new Error('eventId and updates required'));
        const cal = input.calendarId ?? defaultCal;
        const res = await http.patch(
          `${baseUrl}/calendars/${encodeURIComponent(cal)}/events/${input.eventId}`,
          input.updates,
          { headers: authHeaders }
        );
        if (!res.ok) return res;
        return ok({ eventId: res.value.data.id });
      },
    },

    {
      name: 'calendar_delete_event',
      description: 'Delete a Google Calendar event',
      category: 'calendar',
      inputSchema: {
        calendarId: { type: 'string', required: false },
        eventId: { type: 'string', required: true },
      },
      requiresApproval: true,
      costTier: 'free',
      async execute(input) {
        if (!input.eventId) return err(new Error('eventId required'));
        const cal = input.calendarId ?? defaultCal;
        const res = await http.delete(
          `${baseUrl}/calendars/${encodeURIComponent(cal)}/events/${input.eventId}`,
          { headers: authHeaders }
        );
        if (!res.ok) return res;
        return ok({ deleted: true });
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: GOOGLE DRIVE
// ═══════════════════════════════════════════════════════════════════════════

export interface GoogleDriveConfig {
  accessToken: string;
}

export function createDriveTools(cfg: GoogleDriveConfig, http: HttpClient): ToolConfig[] {
  const baseUrl = 'https://www.googleapis.com/drive/v3';
  const uploadUrl = 'https://www.googleapis.com/upload/drive/v3';
  const authHeaders = { Authorization: `Bearer ${cfg.accessToken}` };

  return [
    {
      name: 'drive_list_files',
      description: 'List files in Google Drive with optional query',
      category: 'storage',
      inputSchema: {
        query: { type: 'string', required: false, description: "Drive query (e.g., \"name contains 'report'\")" },
        pageSize: { type: 'number', required: false, default: 20 },
        orderBy: { type: 'string', required: false, default: 'modifiedTime desc' },
        folderId: { type: 'string', required: false },
      },
      costTier: 'free',
      async execute(input) {
        let q = input.query ?? '';
        if (input.folderId) {
          q = q ? `${q} and '${input.folderId}' in parents` : `'${input.folderId}' in parents`;
        }
        const res = await http.get(`${baseUrl}/files`, {
          headers: authHeaders,
          query: {
            q: q || undefined,
            pageSize: input.pageSize ?? 20,
            orderBy: input.orderBy ?? 'modifiedTime desc',
            fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents)',
          },
        });
        if (!res.ok) return res;
        return ok({ files: res.value.data.files ?? [] });
      },
    },

    {
      name: 'drive_upload_file',
      description: 'Upload a text file or JSON object to Google Drive (simple upload)',
      category: 'storage',
      inputSchema: {
        name: { type: 'string', required: true },
        content: { type: 'string', required: true },
        mimeType: { type: 'string', required: false, default: 'text/plain' },
        folderId: { type: 'string', required: false },
      },
      costTier: 'cheap',
      async execute(input) {
        if (!input.name || input.content === undefined) return err(new Error('name and content required'));
        const boundary = `-------${crypto.randomBytes(8).toString('hex')}`;
        const metadata: any = { name: input.name, mimeType: input.mimeType ?? 'text/plain' };
        if (input.folderId) metadata.parents = [input.folderId];

        const multipartBody =
          `--${boundary}\r\n` +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) + '\r\n' +
          `--${boundary}\r\n` +
          `Content-Type: ${metadata.mimeType}\r\n\r\n` +
          input.content + '\r\n' +
          `--${boundary}--`;

        const res = await http.post(`${uploadUrl}/files?uploadType=multipart`, multipartBody, {
          headers: {
            ...authHeaders,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
        });
        if (!res.ok) return res;
        return ok({ fileId: res.value.data.id, name: res.value.data.name });
      },
    },

    {
      name: 'drive_download_file',
      description: 'Download file content from Google Drive',
      category: 'storage',
      inputSchema: { fileId: { type: 'string', required: true } },
      costTier: 'free',
      async execute(input) {
        if (!input.fileId) return err(new Error('fileId required'));
        const res = await http.get(`${baseUrl}/files/${input.fileId}`, {
          headers: authHeaders,
          query: { alt: 'media' },
          parseJson: false,
        });
        if (!res.ok) return res;
        return ok({ content: res.value.raw });
      },
    },

    {
      name: 'drive_create_folder',
      description: 'Create a folder in Google Drive',
      category: 'storage',
      inputSchema: {
        name: { type: 'string', required: true },
        parentId: { type: 'string', required: false },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.name) return err(new Error('name required'));
        const metadata: any = {
          name: input.name,
          mimeType: 'application/vnd.google-apps.folder',
        };
        if (input.parentId) metadata.parents = [input.parentId];
        const res = await http.post(`${baseUrl}/files`, metadata, { headers: authHeaders });
        if (!res.ok) return res;
        return ok({ folderId: res.value.data.id });
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: AI / LLM — CLAUDE, OPENAI, PERPLEXITY
// ═══════════════════════════════════════════════════════════════════════════

export interface AnthropicConfig {
  apiKey: string;
  defaultModel?: string;
}

export interface OpenAIConfig {
  apiKey: string;
  defaultModel?: string;
  baseUrl?: string;
}

export interface PerplexityConfig {
  apiKey: string;
  defaultModel?: string;
}

export function createAITools(
  anthropic: AnthropicConfig | null,
  openai: OpenAIConfig | null,
  perplexity: PerplexityConfig | null,
  http: HttpClient
): ToolConfig[] {
  const tools: ToolConfig[] = [];

  if (anthropic) {
    tools.push({
      name: 'claude_complete',
      description: 'Generate a completion using Anthropic Claude API',
      category: 'ai',
      inputSchema: {
        prompt: { type: 'string', required: true },
        system: { type: 'string', required: false },
        model: { type: 'string', required: false, default: 'claude-sonnet-4-5' },
        maxTokens: { type: 'number', required: false, default: 1024 },
        temperature: { type: 'number', required: false, default: 0.7 },
      },
      costTier: 'premium',
      async execute(input) {
        if (!input.prompt) return err(new Error('prompt required'));
        const res = await http.post('https://api.anthropic.com/v1/messages', {
          model: input.model ?? anthropic.defaultModel ?? 'claude-sonnet-4-5',
          max_tokens: input.maxTokens ?? 1024,
          temperature: input.temperature ?? 0.7,
          system: input.system,
          messages: [{ role: 'user', content: input.prompt }],
        }, {
          headers: {
            'x-api-key': anthropic.apiKey,
            'anthropic-version': '2023-06-01',
          },
          timeout: 120_000,
        });
        if (!res.ok) return res;
        const text = res.value.data.content?.[0]?.text ?? '';
        return ok({ text, usage: res.value.data.usage, model: res.value.data.model });
      },
    });
  }

  if (openai) {
    const baseUrl = openai.baseUrl ?? 'https://api.openai.com/v1';
    tools.push({
      name: 'openai_complete',
      description: 'Generate a completion using OpenAI Chat Completions API',
      category: 'ai',
      inputSchema: {
        prompt: { type: 'string', required: true },
        system: { type: 'string', required: false },
        model: { type: 'string', required: false, default: 'gpt-4o-mini' },
        maxTokens: { type: 'number', required: false, default: 1024 },
        temperature: { type: 'number', required: false, default: 0.7 },
      },
      costTier: 'standard',
      async execute(input) {
        if (!input.prompt) return err(new Error('prompt required'));
        const messages: any[] = [];
        if (input.system) messages.push({ role: 'system', content: input.system });
        messages.push({ role: 'user', content: input.prompt });

        const res = await http.post(`${baseUrl}/chat/completions`, {
          model: input.model ?? openai.defaultModel ?? 'gpt-4o-mini',
          messages,
          max_tokens: input.maxTokens ?? 1024,
          temperature: input.temperature ?? 0.7,
        }, {
          headers: { Authorization: `Bearer ${openai.apiKey}` },
          timeout: 120_000,
        });
        if (!res.ok) return res;
        const text = res.value.data.choices?.[0]?.message?.content ?? '';
        return ok({ text, usage: res.value.data.usage, model: res.value.data.model });
      },
    });

    tools.push({
      name: 'openai_embedding',
      description: 'Generate vector embeddings using OpenAI',
      category: 'ai',
      inputSchema: {
        input: { type: 'string', required: true },
        model: { type: 'string', required: false, default: 'text-embedding-3-small' },
      },
      costTier: 'cheap',
      async execute(input) {
        if (!input.input) return err(new Error('input required'));
        const res = await http.post(`${baseUrl}/embeddings`, {
          input: input.input,
          model: input.model ?? 'text-embedding-3-small',
        }, { headers: { Authorization: `Bearer ${openai.apiKey}` } });
        if (!res.ok) return res;
        return ok({
          embedding: res.value.data.data?.[0]?.embedding,
          usage: res.value.data.usage,
        });
      },
    });
  }

  if (perplexity) {
    tools.push({
      name: 'perplexity_search',
      description: 'Search the web and synthesize an answer using Perplexity',
      category: 'ai',
      inputSchema: {
        query: { type: 'string', required: true },
        model: { type: 'string', required: false, default: 'sonar-pro' },
      },
      costTier: 'standard',
      async execute(input) {
        if (!input.query) return err(new Error('query required'));
        const res = await http.post('https://api.perplexity.ai/chat/completions', {
          model: input.model ?? perplexity.defaultModel ?? 'sonar-pro',
          messages: [{ role: 'user', content: input.query }],
        }, {
          headers: { Authorization: `Bearer ${perplexity.apiKey}` },
          timeout: 60_000,
        });
        if (!res.ok) return res;
        return ok({
          text: res.value.data.choices?.[0]?.message?.content ?? '',
          citations: res.value.data.citations ?? [],
        });
      },
    });
  }

  return tools;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: DATABASES — SUPABASE (PostgREST) + UPSTASH REDIS
// ═══════════════════════════════════════════════════════════════════════════

export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
}

export interface UpstashRedisConfig {
  url: string;
  token: string;
}

export function createDatabaseTools(
  supabase: SupabaseConfig | null,
  redis: UpstashRedisConfig | null,
  http: HttpClient
): ToolConfig[] {
  const tools: ToolConfig[] = [];

  if (supabase) {
    const base = supabase.url.replace(/\/$/, '') + '/rest/v1';
    const authHeaders = {
      apikey: supabase.serviceRoleKey,
      Authorization: `Bearer ${supabase.serviceRoleKey}`,
    };

    tools.push({
      name: 'supabase_select',
      description: 'Query rows from a Supabase table with filters',
      category: 'database',
      inputSchema: {
        table: { type: 'string', required: true },
        select: { type: 'string', required: false, default: '*' },
        filters: { type: 'object', required: false, description: 'column=value equality filters' },
        order: { type: 'string', required: false },
        limit: { type: 'number', required: false },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.table) return err(new Error('table required'));
        const query: Record<string, any> = { select: input.select ?? '*' };
        if (input.filters) {
          for (const [k, v] of Object.entries(input.filters)) {
            query[k] = `eq.${v}`;
          }
        }
        if (input.order) query.order = input.order;
        if (input.limit) query.limit = input.limit;
        const res = await http.get(`${base}/${input.table}`, {
          headers: authHeaders,
          query,
        });
        if (!res.ok) return res;
        return ok({ rows: res.value.data });
      },
    });

    tools.push({
      name: 'supabase_insert',
      description: 'Insert one or more rows into a Supabase table',
      category: 'database',
      inputSchema: {
        table: { type: 'string', required: true },
        rows: { type: 'array', required: true, description: 'Array of row objects' },
        upsert: { type: 'boolean', required: false, default: false },
      },
      costTier: 'cheap',
      async execute(input) {
        if (!input.table || !input.rows) return err(new Error('table and rows required'));
        const headers: any = { ...authHeaders, Prefer: 'return=representation' };
        if (input.upsert) headers.Prefer = 'return=representation,resolution=merge-duplicates';
        const res = await http.post(`${base}/${input.table}`, input.rows, { headers });
        if (!res.ok) return res;
        return ok({ inserted: res.value.data });
      },
    });

    tools.push({
      name: 'supabase_update',
      description: 'Update rows in a Supabase table matching filters',
      category: 'database',
      inputSchema: {
        table: { type: 'string', required: true },
        filters: { type: 'object', required: true },
        updates: { type: 'object', required: true },
      },
      requiresApproval: false,
      costTier: 'free',
      async execute(input) {
        if (!input.table || !input.filters || !input.updates) {
          return err(new Error('table, filters, and updates required'));
        }
        const query: Record<string, any> = {};
        for (const [k, v] of Object.entries(input.filters)) {
          query[k] = `eq.${v}`;
        }
        const res = await http.patch(`${base}/${input.table}`, input.updates, {
          headers: { ...authHeaders, Prefer: 'return=representation' },
          query,
        });
        if (!res.ok) return res;
        return ok({ updated: res.value.data });
      },
    });

    tools.push({
      name: 'supabase_delete',
      description: 'Delete rows from a Supabase table matching filters',
      category: 'database',
      inputSchema: {
        table: { type: 'string', required: true },
        filters: { type: 'object', required: true },
      },
      requiresApproval: true,
      costTier: 'free',
      async execute(input) {
        if (!input.table || !input.filters) return err(new Error('table and filters required'));
        const query: Record<string, any> = {};
        for (const [k, v] of Object.entries(input.filters)) {
          query[k] = `eq.${v}`;
        }
        const res = await http.delete(`${base}/${input.table}`, {
          headers: { ...authHeaders, Prefer: 'return=representation' },
          query,
        });
        if (!res.ok) return res;
        return ok({ deleted: res.value.data });
      },
    });

    tools.push({
      name: 'supabase_rpc',
      description: 'Call a Supabase Postgres function (RPC)',
      category: 'database',
      inputSchema: {
        functionName: { type: 'string', required: true },
        args: { type: 'object', required: false },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.functionName) return err(new Error('functionName required'));
        const res = await http.post(`${base}/rpc/${input.functionName}`, input.args ?? {}, {
          headers: authHeaders,
        });
        if (!res.ok) return res;
        return ok({ result: res.value.data });
      },
    });
  }

  if (redis) {
    const base = redis.url.replace(/\/$/, '');
    const authHeaders = { Authorization: `Bearer ${redis.token}` };

    tools.push({
      name: 'redis_get',
      description: 'Get a value from Upstash Redis',
      category: 'cache',
      inputSchema: { key: { type: 'string', required: true } },
      costTier: 'free',
      async execute(input) {
        if (!input.key) return err(new Error('key required'));
        const res = await http.get(`${base}/get/${encodeURIComponent(input.key)}`, {
          headers: authHeaders,
        });
        if (!res.ok) return res;
        return ok({ value: res.value.data.result });
      },
    });

    tools.push({
      name: 'redis_set',
      description: 'Set a value in Upstash Redis (optionally with TTL in seconds)',
      category: 'cache',
      inputSchema: {
        key: { type: 'string', required: true },
        value: { type: 'string', required: true },
        ttlSeconds: { type: 'number', required: false },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.key || input.value === undefined) return err(new Error('key and value required'));
        let url = `${base}/set/${encodeURIComponent(input.key)}/${encodeURIComponent(input.value)}`;
        if (input.ttlSeconds) url += `?EX=${input.ttlSeconds}`;
        const res = await http.get(url, { headers: authHeaders });
        if (!res.ok) return res;
        return ok({ set: true });
      },
    });

    tools.push({
      name: 'redis_delete',
      description: 'Delete a key from Upstash Redis',
      category: 'cache',
      inputSchema: { key: { type: 'string', required: true } },
      costTier: 'free',
      async execute(input) {
        if (!input.key) return err(new Error('key required'));
        const res = await http.get(`${base}/del/${encodeURIComponent(input.key)}`, {
          headers: authHeaders,
        });
        if (!res.ok) return res;
        return ok({ deleted: res.value.data.result });
      },
    });

    tools.push({
      name: 'redis_incr',
      description: 'Atomically increment a numeric key in Upstash Redis',
      category: 'cache',
      inputSchema: { key: { type: 'string', required: true } },
      costTier: 'free',
      async execute(input) {
        if (!input.key) return err(new Error('key required'));
        const res = await http.get(`${base}/incr/${encodeURIComponent(input.key)}`, {
          headers: authHeaders,
        });
        if (!res.ok) return res;
        return ok({ value: res.value.data.result });
      },
    });
  }

  return tools;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: WEBHOOKS — GENERIC + N8N + MAKE.COM
// ═══════════════════════════════════════════════════════════════════════════

export interface WebhookConfig {
  n8nUrl?: string;
  makeUrl?: string;
}

export function createWebhookTools(cfg: WebhookConfig, http: HttpClient): ToolConfig[] {
  const tools: ToolConfig[] = [];

  tools.push({
    name: 'webhook_send',
    description: 'Send a generic JSON webhook to any URL',
    category: 'automation',
    inputSchema: {
      url: { type: 'string', required: true },
      payload: { type: 'object', required: true },
      headers: { type: 'object', required: false },
      method: { type: 'string', required: false, default: 'POST' },
    },
    costTier: 'free',
    async execute(input) {
      if (!input.url || !input.payload) return err(new Error('url and payload required'));
      const res = await http.request(input.url, {
        method: (input.method ?? 'POST') as any,
        body: input.payload,
        headers: input.headers ?? {},
      });
      if (!res.ok) return res;
      return ok({ status: res.value.status, data: res.value.data });
    },
  });

  if (cfg.n8nUrl) {
    tools.push({
      name: 'n8n_trigger_workflow',
      description: 'Trigger an n8n workflow via webhook',
      category: 'automation',
      inputSchema: {
        workflowPath: { type: 'string', required: false, description: 'Path appended to base n8n URL' },
        payload: { type: 'object', required: true },
      },
      costTier: 'free',
      async execute(input) {
        const url = input.workflowPath ? `${cfg.n8nUrl}${input.workflowPath}` : cfg.n8nUrl!;
        const res = await http.post(url, input.payload ?? {});
        if (!res.ok) return res;
        return ok({ triggered: true, response: res.value.data });
      },
    });
  }

  if (cfg.makeUrl) {
    tools.push({
      name: 'make_trigger_scenario',
      description: 'Trigger a Make.com scenario via webhook',
      category: 'automation',
      inputSchema: {
        scenarioPath: { type: 'string', required: false },
        payload: { type: 'object', required: true },
      },
      costTier: 'free',
      async execute(input) {
        const url = input.scenarioPath ? `${cfg.makeUrl}${input.scenarioPath}` : cfg.makeUrl!;
        const res = await http.post(url, input.payload ?? {});
        if (!res.ok) return res;
        return ok({ triggered: true, response: res.value.data });
      },
    });
  }

  return tools;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 11: GENERIC HTTP & GRAPHQL
// ═══════════════════════════════════════════════════════════════════════════

export function createHTTPTools(http: HttpClient): ToolConfig[] {
  return [
    {
      name: 'http_get',
      description: 'Make a generic HTTP GET request',
      category: 'http',
      inputSchema: {
        url: { type: 'string', required: true },
        headers: { type: 'object', required: false },
        query: { type: 'object', required: false },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.url) return err(new Error('url required'));
        const res = await http.get(input.url, { headers: input.headers, query: input.query });
        if (!res.ok) return res;
        return ok({ status: res.value.status, data: res.value.data });
      },
    },

    {
      name: 'http_post',
      description: 'Make a generic HTTP POST request',
      category: 'http',
      inputSchema: {
        url: { type: 'string', required: true },
        body: { type: 'object', required: false },
        headers: { type: 'object', required: false },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.url) return err(new Error('url required'));
        const res = await http.post(input.url, input.body, { headers: input.headers });
        if (!res.ok) return res;
        return ok({ status: res.value.status, data: res.value.data });
      },
    },

    {
      name: 'graphql_query',
      description: 'Execute a GraphQL query against any endpoint',
      category: 'http',
      inputSchema: {
        endpoint: { type: 'string', required: true },
        query: { type: 'string', required: true },
        variables: { type: 'object', required: false },
        headers: { type: 'object', required: false },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.endpoint || !input.query) return err(new Error('endpoint and query required'));
        const res = await http.post(input.endpoint, {
          query: input.query,
          variables: input.variables ?? {},
        }, { headers: input.headers });
        if (!res.ok) return res;
        if (res.value.data.errors) {
          return err(new Error(`GraphQL errors: ${JSON.stringify(res.value.data.errors)}`));
        }
        return ok({ data: res.value.data.data });
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 12: MONITORING — HEALTH CHECK + DISCORD ALERTS
// ═══════════════════════════════════════════════════════════════════════════

export interface MonitoringConfig {
  discordWebhookUrl?: string;
}

export function createMonitoringTools(cfg: MonitoringConfig, http: HttpClient): ToolConfig[] {
  const tools: ToolConfig[] = [];

  tools.push({
    name: 'health_check',
    description: 'Perform an HTTP health check against a URL and measure latency',
    category: 'monitoring',
    inputSchema: {
      url: { type: 'string', required: true },
      expectedStatus: { type: 'number', required: false, default: 200 },
      timeoutMs: { type: 'number', required: false, default: 10_000 },
    },
    costTier: 'free',
    async execute(input) {
      if (!input.url) return err(new Error('url required'));
      const start = Date.now();
      const res = await http.get(input.url, {
        timeout: input.timeoutMs ?? 10_000,
        retries: 0,
        parseJson: false,
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return ok({ healthy: false, error: res.error.message, latencyMs });
      }
      const expected = input.expectedStatus ?? 200;
      const healthy = res.value.status === expected;
      return ok({
        healthy,
        status: res.value.status,
        latencyMs,
        expected,
      });
    },
  });

  if (cfg.discordWebhookUrl) {
    tools.push({
      name: 'discord_alert',
      description: 'Send an alert message to Discord via webhook',
      category: 'monitoring',
      inputSchema: {
        content: { type: 'string', required: true },
        username: { type: 'string', required: false, default: 'ONYX AI' },
        title: { type: 'string', required: false },
        color: { type: 'number', required: false, description: 'Embed color as integer' },
        severity: { type: 'string', enum: ['info', 'warning', 'error', 'critical'], required: false },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.content) return err(new Error('content required'));
        const severityColors: Record<string, number> = {
          info: 0x3b82f6,
          warning: 0xf59e0b,
          error: 0xef4444,
          critical: 0x991b1b,
        };
        const embed: any = {
          description: input.content,
          color: input.color ?? severityColors[input.severity ?? 'info'] ?? 0x3b82f6,
          timestamp: new Date().toISOString(),
        };
        if (input.title) embed.title = input.title;
        if (input.severity) embed.footer = { text: `severity: ${input.severity}` };

        const res = await http.post(cfg.discordWebhookUrl!, {
          username: input.username ?? 'ONYX AI',
          embeds: [embed],
        });
        if (!res.ok) return res;
        return ok({ sent: true });
      },
    });
  }

  return tools;
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 13: CRM — HUBSPOT
// ═══════════════════════════════════════════════════════════════════════════

export interface HubSpotConfig {
  apiKey: string; // Private App token
}

export function createCRMTools(cfg: HubSpotConfig, http: HttpClient): ToolConfig[] {
  const base = 'https://api.hubapi.com/crm/v3';
  const authHeaders = {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
  };

  return [
    {
      name: 'hubspot_create_contact',
      description: 'Create a new contact in HubSpot',
      category: 'crm',
      inputSchema: {
        email: { type: 'string', required: true },
        firstName: { type: 'string', required: false },
        lastName: { type: 'string', required: false },
        phone: { type: 'string', required: false },
        company: { type: 'string', required: false },
        properties: { type: 'object', required: false, description: 'Extra custom properties' },
      },
      costTier: 'cheap',
      async execute(input) {
        if (!input.email) return err(new Error('email required'));
        const properties: any = { email: input.email };
        if (input.firstName) properties.firstname = input.firstName;
        if (input.lastName) properties.lastname = input.lastName;
        if (input.phone) properties.phone = input.phone;
        if (input.company) properties.company = input.company;
        Object.assign(properties, input.properties ?? {});

        const res = await http.post(`${base}/objects/contacts`, { properties }, {
          headers: authHeaders,
        });
        if (!res.ok) return res;
        return ok({ contactId: res.value.data.id, properties: res.value.data.properties });
      },
    },

    {
      name: 'hubspot_update_contact',
      description: 'Update an existing HubSpot contact',
      category: 'crm',
      inputSchema: {
        contactId: { type: 'string', required: true },
        properties: { type: 'object', required: true },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.contactId || !input.properties) return err(new Error('contactId and properties required'));
        const res = await http.patch(`${base}/objects/contacts/${input.contactId}`, {
          properties: input.properties,
        }, { headers: authHeaders });
        if (!res.ok) return res;
        return ok({ updated: true, id: res.value.data.id });
      },
    },

    {
      name: 'hubspot_search_contacts',
      description: 'Search HubSpot contacts by email, name, or phone',
      category: 'crm',
      inputSchema: {
        query: { type: 'string', required: true },
        limit: { type: 'number', required: false, default: 10 },
      },
      costTier: 'free',
      async execute(input) {
        if (!input.query) return err(new Error('query required'));
        const res = await http.post(`${base}/objects/contacts/search`, {
          query: input.query,
          limit: input.limit ?? 10,
        }, { headers: authHeaders });
        if (!res.ok) return res;
        return ok({ results: res.value.data.results ?? [], total: res.value.data.total });
      },
    },

    {
      name: 'hubspot_create_deal',
      description: 'Create a new deal in HubSpot pipeline',
      category: 'crm',
      inputSchema: {
        dealName: { type: 'string', required: true },
        amount: { type: 'number', required: false },
        stage: { type: 'string', required: false },
        pipeline: { type: 'string', required: false },
        closeDate: { type: 'string', required: false, description: 'YYYY-MM-DD' },
        contactId: { type: 'string', required: false, description: 'Associate to contact' },
      },
      costTier: 'cheap',
      async execute(input) {
        if (!input.dealName) return err(new Error('dealName required'));
        const properties: any = { dealname: input.dealName };
        if (input.amount !== undefined) properties.amount = String(input.amount);
        if (input.stage) properties.dealstage = input.stage;
        if (input.pipeline) properties.pipeline = input.pipeline;
        if (input.closeDate) properties.closedate = input.closeDate;

        const body: any = { properties };
        if (input.contactId) {
          body.associations = [{
            to: { id: input.contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 3 }],
          }];
        }
        const res = await http.post(`${base}/objects/deals`, body, { headers: authHeaders });
        if (!res.ok) return res;
        return ok({ dealId: res.value.data.id });
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 14: PAYMENTS — STRIPE
// ═══════════════════════════════════════════════════════════════════════════
//
// NOTE: All write operations here are defined with requiresApproval=true.
// The Governor layer (Part 1) enforces human confirmation before any
// financial action is executed. These tools DEFINE capability; they do not
// auto-execute transactions without explicit policy approval.
//
// ═══════════════════════════════════════════════════════════════════════════

export interface StripeConfig {
  secretKey: string;
}

export function createPaymentTools(cfg: StripeConfig, http: HttpClient): ToolConfig[] {
  const base = 'https://api.stripe.com/v1';
  const authHeaders = {
    Authorization: `Bearer ${cfg.secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };

  function toFormEncoded(obj: Record<string, any>, prefix?: string): string {
    const form = new URLSearchParams();
    const append = (key: string, value: any) => {
      if (value === null || value === undefined) return;
      if (typeof value === 'object' && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value)) {
          append(`${key}[${k}]`, v);
        }
      } else {
        form.append(key, String(value));
      }
    };
    for (const [k, v] of Object.entries(obj)) {
      append(prefix ? `${prefix}[${k}]` : k, v);
    }
    return form.toString();
  }

  return [
    {
      name: 'stripe_create_customer',
      description: 'Create a Stripe customer record',
      category: 'payments',
      inputSchema: {
        email: { type: 'string', required: true },
        name: { type: 'string', required: false },
        phone: { type: 'string', required: false },
        description: { type: 'string', required: false },
        metadata: { type: 'object', required: false },
      },
      costTier: 'free',
      requiresApproval: false,
      async execute(input) {
        if (!input.email) return err(new Error('email required'));
        const body = toFormEncoded({
          email: input.email,
          name: input.name,
          phone: input.phone,
          description: input.description,
          metadata: input.metadata,
        });
        const res = await http.post(`${base}/customers`, body, { headers: authHeaders });
        if (!res.ok) return res;
        return ok({ customerId: res.value.data.id, email: res.value.data.email });
      },
    },

    {
      name: 'stripe_create_payment_intent',
      description: 'Create a Stripe Payment Intent (requires human approval)',
      category: 'payments',
      inputSchema: {
        amount: { type: 'number', required: true, description: 'Amount in smallest currency unit (agorot, cents)' },
        currency: { type: 'string', required: true, description: 'ISO 4217 currency code (ils, usd, eur)' },
        customerId: { type: 'string', required: false },
        description: { type: 'string', required: false },
        metadata: { type: 'object', required: false },
      },
      costTier: 'cheap',
      requiresApproval: true,
      async execute(input) {
        if (!input.amount || !input.currency) return err(new Error('amount and currency required'));
        const body = toFormEncoded({
          amount: input.amount,
          currency: input.currency,
          customer: input.customerId,
          description: input.description,
          metadata: input.metadata,
        });
        const res = await http.post(`${base}/payment_intents`, body, { headers: authHeaders });
        if (!res.ok) return res;
        return ok({
          paymentIntentId: res.value.data.id,
          clientSecret: res.value.data.client_secret,
          status: res.value.data.status,
        });
      },
    },

    {
      name: 'stripe_create_invoice',
      description: 'Create a Stripe invoice for a customer (requires human approval)',
      category: 'payments',
      inputSchema: {
        customerId: { type: 'string', required: true },
        description: { type: 'string', required: false },
        daysUntilDue: { type: 'number', required: false, default: 30 },
        autoAdvance: { type: 'boolean', required: false, default: true },
      },
      costTier: 'cheap',
      requiresApproval: true,
      async execute(input) {
        if (!input.customerId) return err(new Error('customerId required'));
        const body = toFormEncoded({
          customer: input.customerId,
          description: input.description,
          days_until_due: input.daysUntilDue ?? 30,
          auto_advance: input.autoAdvance ?? true,
          collection_method: 'send_invoice',
        });
        const res = await http.post(`${base}/invoices`, body, { headers: authHeaders });
        if (!res.ok) return res;
        return ok({ invoiceId: res.value.data.id, status: res.value.data.status });
      },
    },

    {
      name: 'stripe_retrieve_customer',
      description: 'Retrieve a Stripe customer by ID',
      category: 'payments',
      inputSchema: { customerId: { type: 'string', required: true } },
      costTier: 'free',
      async execute(input) {
        if (!input.customerId) return err(new Error('customerId required'));
        const res = await http.get(`${base}/customers/${input.customerId}`, {
          headers: { Authorization: `Bearer ${cfg.secretKey}` },
        });
        if (!res.ok) return res;
        return ok(res.value.data);
      },
    },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 15: WEBHOOK RECEIVER — INBOUND HANDLING WITH SIGNATURE VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

export type WebhookHandler = (payload: any, req: Request) => Promise<void> | void;

export interface WebhookReceiverOptions {
  whatsappVerifyToken?: string;
  whatsappAppSecret?: string;
  stripeWebhookSecret?: string;
  twilioAuthToken?: string;
  slackSigningSecret?: string;
  logger?: ILogger;
}

export class WebhookReceiver {
  private handlers: Map<string, WebhookHandler[]> = new Map();
  private logger: ILogger;

  constructor(private opts: WebhookReceiverOptions = {}) {
    this.logger = opts.logger ?? new ConsoleLogger('[WEBHOOK]');
  }

  /** Register a handler for a named source (e.g., 'whatsapp', 'stripe') */
  on(source: string, handler: WebhookHandler): this {
    const existing = this.handlers.get(source) ?? [];
    existing.push(handler);
    this.handlers.set(source, existing);
    return this;
  }

  /** Build an Express Router exposing all webhook endpoints */
  buildRouter(): Router {
    const router = Router();

    // WhatsApp verification (GET) + receiver (POST)
    router.get('/whatsapp', (req: Request, res: Response) => {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === this.opts.whatsappVerifyToken) {
        this.logger.info('WhatsApp webhook verified');
        return res.status(200).send(String(challenge));
      }
      return res.status(403).send('forbidden');
    });

    router.post('/whatsapp', async (req: Request, res: Response) => {
      if (this.opts.whatsappAppSecret) {
        const sig = req.header('x-hub-signature-256');
        const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
        if (!this.verifyHubSignature(rawBody, sig, this.opts.whatsappAppSecret)) {
          this.logger.warn('WhatsApp signature verification failed');
          return res.status(401).send('unauthorized');
        }
      }
      await this.dispatch('whatsapp', req.body, req);
      res.status(200).send('ok');
    });

    // Stripe webhook with HMAC verification
    router.post('/stripe', async (req: Request, res: Response) => {
      if (this.opts.stripeWebhookSecret) {
        const sig = req.header('stripe-signature');
        const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
        if (!this.verifyStripeSignature(rawBody, sig, this.opts.stripeWebhookSecret)) {
          this.logger.warn('Stripe signature verification failed');
          return res.status(401).send('unauthorized');
        }
      }
      await this.dispatch('stripe', req.body, req);
      res.status(200).send('ok');
    });

    // Twilio webhook
    router.post('/twilio', async (req: Request, res: Response) => {
      if (this.opts.twilioAuthToken) {
        const sig = req.header('x-twilio-signature');
        const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
        if (!this.verifyTwilioSignature(fullUrl, req.body, sig, this.opts.twilioAuthToken)) {
          this.logger.warn('Twilio signature verification failed');
          return res.status(401).send('unauthorized');
        }
      }
      await this.dispatch('twilio', req.body, req);
      res.status(200).send('ok');
    });

    // Slack webhook
    router.post('/slack', async (req: Request, res: Response) => {
      if (this.opts.slackSigningSecret) {
        const sig = req.header('x-slack-signature');
        const ts = req.header('x-slack-request-timestamp');
        const rawBody = (req as any).rawBody ?? JSON.stringify(req.body);
        if (!this.verifySlackSignature(rawBody, ts, sig, this.opts.slackSigningSecret)) {
          this.logger.warn('Slack signature verification failed');
          return res.status(401).send('unauthorized');
        }
      }
      // Slack challenge
      if (req.body?.type === 'url_verification' && req.body.challenge) {
        return res.status(200).send(req.body.challenge);
      }
      await this.dispatch('slack', req.body, req);
      res.status(200).send('ok');
    });

    // Generic webhook (no verification, use with caution)
    router.post('/generic/:source', async (req: Request, res: Response) => {
      await this.dispatch(req.params.source, req.body, req);
      res.status(200).send('ok');
    });

    return router;
  }

  private async dispatch(source: string, payload: any, req: Request): Promise<void> {
    const handlers = this.handlers.get(source) ?? [];
    if (handlers.length === 0) {
      this.logger.warn(`No handlers registered for webhook source: ${source}`);
      return;
    }
    for (const h of handlers) {
      try {
        await h(payload, req);
      } catch (e: any) {
        this.logger.error(`Handler for ${source} threw:`, e?.message);
      }
    }
  }

  // ─── Signature Verification ───

  private verifyHubSignature(rawBody: string, signature: string | undefined, secret: string): boolean {
    if (!signature) return false;
    const expected = 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    return this.timingSafeEqualStr(signature, expected);
  }

  private verifyStripeSignature(rawBody: string, signature: string | undefined, secret: string): boolean {
    if (!signature) return false;
    const parts = signature.split(',').reduce<Record<string, string>>((acc, p) => {
      const [k, v] = p.split('=');
      if (k && v) acc[k] = v;
      return acc;
    }, {});
    const timestamp = parts.t;
    const v1 = parts.v1;
    if (!timestamp || !v1) return false;
    const signedPayload = `${timestamp}.${rawBody}`;
    const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
    return this.timingSafeEqualStr(v1, expected);
  }

  private verifyTwilioSignature(url: string, params: Record<string, any>, signature: string | undefined, authToken: string): boolean {
    if (!signature) return false;
    const sortedKeys = Object.keys(params).sort();
    let data = url;
    for (const k of sortedKeys) {
      data += k + params[k];
    }
    const expected = crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
    return this.timingSafeEqualStr(signature, expected);
  }

  private verifySlackSignature(rawBody: string, timestamp: string | undefined, signature: string | undefined, secret: string): boolean {
    if (!timestamp || !signature) return false;
    // Reject if timestamp is older than 5 minutes (replay protection)
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) return false;
    const base = `v0:${timestamp}:${rawBody}`;
    const expected = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
    return this.timingSafeEqualStr(signature, expected);
  }

  private timingSafeEqualStr(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 16: INTEGRATION REGISTRY — MASTER ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════
//
// Central hub that:
//   1. Reads credentials from the vault / env
//   2. Instantiates the selected integrations
//   3. Produces a unified list of ToolConfigs for registration with the
//      ToolRegistry from Part 1 (src/index.ts)
//   4. Provides a WebhookReceiver ready to mount on the Express app
//
// ═══════════════════════════════════════════════════════════════════════════

export interface IntegrationConfig {
  whatsapp?: WhatsAppConfig;
  twilio?: TwilioConfig;
  gmail?: GmailConfig;
  sendgrid?: SendGridConfig;
  telegram?: TelegramConfig;
  slack?: SlackConfig;
  googleCalendar?: GoogleCalendarConfig;
  googleDrive?: GoogleDriveConfig;
  anthropic?: AnthropicConfig;
  openai?: OpenAIConfig;
  perplexity?: PerplexityConfig;
  supabase?: SupabaseConfig;
  upstashRedis?: UpstashRedisConfig;
  webhook?: WebhookConfig;
  monitoring?: MonitoringConfig;
  hubspot?: HubSpotConfig;
  stripe?: StripeConfig;
}

export interface IntegrationRegistryOptions {
  config: IntegrationConfig;
  vault?: CredentialVault;
  logger?: ILogger;
  httpClient?: HttpClient;
  webhookReceiverOptions?: WebhookReceiverOptions;
}

export class IntegrationRegistry {
  private tools: Map<string, ToolConfig> = new Map();
  private http: HttpClient;
  private logger: ILogger;
  public readonly vault?: CredentialVault;
  public readonly webhookReceiver: WebhookReceiver;
  private enabled: Set<string> = new Set();

  constructor(private opts: IntegrationRegistryOptions) {
    this.logger = opts.logger ?? new ConsoleLogger('[INTEGRATIONS]');
    this.http = opts.httpClient ?? new HttpClient(this.logger);
    this.vault = opts.vault;
    this.webhookReceiver = new WebhookReceiver({
      ...opts.webhookReceiverOptions,
      whatsappVerifyToken: opts.config.whatsapp ? opts.webhookReceiverOptions?.whatsappVerifyToken : undefined,
      logger: this.logger,
    });
  }

  /** Build all tools from the provided config */
  init(): { total: number; byCategory: Record<string, number>; enabled: string[] } {
    this.tools.clear();
    this.enabled.clear();
    const cfg = this.opts.config;

    const register = (source: string, toolList: ToolConfig[]) => {
      if (toolList.length === 0) return;
      for (const t of toolList) {
        if (this.tools.has(t.name)) {
          this.logger.warn(`Duplicate tool name: ${t.name}, overwriting`);
        }
        this.tools.set(t.name, t);
      }
      this.enabled.add(source);
      this.logger.info(`Registered ${toolList.length} tools from ${source}`);
    };

    if (cfg.whatsapp) register('whatsapp', createWhatsAppTools(cfg.whatsapp, this.http));
    if (cfg.twilio) register('twilio', createSMSTools(cfg.twilio, this.http));
    if (cfg.gmail || cfg.sendgrid) {
      register('email', createEmailTools(cfg.gmail ?? null, cfg.sendgrid ?? null, this.http));
    }
    if (cfg.telegram) register('telegram', createTelegramTools(cfg.telegram, this.http));
    if (cfg.slack) register('slack', createSlackTools(cfg.slack, this.http));
    if (cfg.googleCalendar) register('calendar', createCalendarTools(cfg.googleCalendar, this.http));
    if (cfg.googleDrive) register('drive', createDriveTools(cfg.googleDrive, this.http));
    if (cfg.anthropic || cfg.openai || cfg.perplexity) {
      register('ai', createAITools(
        cfg.anthropic ?? null,
        cfg.openai ?? null,
        cfg.perplexity ?? null,
        this.http
      ));
    }
    if (cfg.supabase || cfg.upstashRedis) {
      register('database', createDatabaseTools(
        cfg.supabase ?? null,
        cfg.upstashRedis ?? null,
        this.http
      ));
    }
    if (cfg.webhook) register('webhooks', createWebhookTools(cfg.webhook, this.http));
    register('http', createHTTPTools(this.http));
    if (cfg.monitoring) register('monitoring', createMonitoringTools(cfg.monitoring, this.http));
    if (cfg.hubspot) register('hubspot', createCRMTools(cfg.hubspot, this.http));
    if (cfg.stripe) register('stripe', createPaymentTools(cfg.stripe, this.http));

    const byCategory: Record<string, number> = {};
    for (const t of this.tools.values()) {
      byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
    }
    return {
      total: this.tools.size,
      byCategory,
      enabled: Array.from(this.enabled),
    };
  }

  /** Get all tools ready to be registered with the AgentRuntime ToolRegistry */
  getAllTools(): ToolConfig[] {
    return Array.from(this.tools.values());
  }

  /** Get a single tool by name */
  getTool(name: string): ToolConfig | undefined {
    return this.tools.get(name);
  }

  /** Get tools in a specific category */
  getToolsByCategory(category: string): ToolConfig[] {
    return this.getAllTools().filter(t => t.category === category);
  }

  /** Get tools from a specific integration source (e.g., 'whatsapp') */
  getEnabledSources(): string[] {
    return Array.from(this.enabled);
  }

  /** Execute a tool directly by name (bypasses ToolRegistry — for testing) */
  async executeTool(name: string, input: any, ctx?: ToolContext): Promise<Result<any, Error>> {
    const tool = this.tools.get(name);
    if (!tool) return err(new Error(`Tool not found: ${name}`));
    try {
      return await tool.execute(input, ctx);
    } catch (e: any) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  /** Build config from environment variables — convenience loader */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): IntegrationConfig {
    const cfg: IntegrationConfig = {};

    if (env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN) {
      cfg.whatsapp = {
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        accessToken: env.WHATSAPP_ACCESS_TOKEN,
      };
    }
    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM_NUMBER) {
      cfg.twilio = {
        accountSid: env.TWILIO_ACCOUNT_SID,
        authToken: env.TWILIO_AUTH_TOKEN,
        fromNumber: env.TWILIO_FROM_NUMBER,
      };
    }
    if (env.GOOGLE_REFRESH_TOKEN) {
      // Note: In production you'd refresh the access token first.
      // Here we assume GOOGLE_ACCESS_TOKEN is populated by a refresh loop.
      const accessToken = env.GOOGLE_ACCESS_TOKEN ?? '';
      if (accessToken) {
        cfg.gmail = { accessToken };
        cfg.googleCalendar = { accessToken };
        cfg.googleDrive = { accessToken };
      }
    }
    if (env.SENDGRID_API_KEY && env.SENDGRID_FROM_EMAIL) {
      cfg.sendgrid = {
        apiKey: env.SENDGRID_API_KEY,
        fromEmail: env.SENDGRID_FROM_EMAIL,
      };
    }
    if (env.TELEGRAM_BOT_TOKEN) {
      cfg.telegram = { botToken: env.TELEGRAM_BOT_TOKEN };
    }
    if (env.SLACK_BOT_TOKEN) {
      cfg.slack = {
        botToken: env.SLACK_BOT_TOKEN,
        signingSecret: env.SLACK_SIGNING_SECRET,
      };
    }
    if (env.ANTHROPIC_API_KEY) {
      cfg.anthropic = { apiKey: env.ANTHROPIC_API_KEY };
    }
    if (env.OPENAI_API_KEY) {
      cfg.openai = { apiKey: env.OPENAI_API_KEY };
    }
    if (env.PERPLEXITY_API_KEY) {
      cfg.perplexity = { apiKey: env.PERPLEXITY_API_KEY };
    }
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      cfg.supabase = {
        url: env.SUPABASE_URL,
        serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
      };
    }
    if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
      cfg.upstashRedis = {
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      };
    }
    if (env.N8N_WEBHOOK_URL || env.MAKE_WEBHOOK_URL) {
      cfg.webhook = {
        n8nUrl: env.N8N_WEBHOOK_URL,
        makeUrl: env.MAKE_WEBHOOK_URL,
      };
    }
    if (env.DISCORD_WEBHOOK_URL) {
      cfg.monitoring = { discordWebhookUrl: env.DISCORD_WEBHOOK_URL };
    }
    if (env.HUBSPOT_API_KEY) {
      cfg.hubspot = { apiKey: env.HUBSPOT_API_KEY };
    }
    if (env.STRIPE_SECRET_KEY) {
      cfg.stripe = { secretKey: env.STRIPE_SECRET_KEY };
    }
    return cfg;
  }

  /** Convenience: full bootstrap from env */
  static bootstrap(env: NodeJS.ProcessEnv = process.env): IntegrationRegistry {
    const vaultKey = env.ONYX_VAULT_KEY;
    const vault = vaultKey ? new CredentialVault(vaultKey, './data/vault.json') : undefined;
    const registry = new IntegrationRegistry({
      config: IntegrationRegistry.fromEnv(env),
      vault,
      webhookReceiverOptions: {
        whatsappVerifyToken: env.WHATSAPP_VERIFY_TOKEN,
        whatsappAppSecret: env.WHATSAPP_APP_SECRET,
        stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
        twilioAuthToken: env.TWILIO_AUTH_TOKEN,
        slackSigningSecret: env.SLACK_SIGNING_SECRET,
      },
    });
    registry.init();
    return registry;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS — DEFAULT
// ═══════════════════════════════════════════════════════════════════════════

export default IntegrationRegistry;

// ═══════════════════════════════════════════════════════════════════════════
// USAGE (wired with Part 1 — src/index.ts):
//
//   import express from 'express';
//   import { OnyxPlatform } from './index';
//   import { IntegrationRegistry } from './integrations';
//
//   const app = express();
//   app.use(express.json({
//     verify: (req: any, _res, buf) => { req.rawBody = buf.toString('utf8'); },
//   }));
//
//   const integrations = IntegrationRegistry.bootstrap(process.env);
//   const onyx = new OnyxPlatform();
//   integrations.getAllTools().forEach(t => onyx.toolRegistry.register(t));
//
//   // Inbound webhooks
//   integrations.webhookReceiver.on('whatsapp', async (payload) => {
//     console.log('Inbound WhatsApp:', payload);
//     // route to AgentRuntime...
//   });
//   integrations.webhookReceiver.on('stripe', async (payload) => {
//     console.log('Stripe event:', payload.type);
//   });
//   app.use('/webhooks', integrations.webhookReceiver.buildRouter());
//
//   app.listen(3100, () => console.log('ONYX AI running on :3100'));
//
// ═══════════════════════════════════════════════════════════════════════════
