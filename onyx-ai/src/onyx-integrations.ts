// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
//
//  PART 2: COMPLETE INTEGRATION LAYER
//  WhatsApp • SMS • Gmail • Telegram • Slack • Calendar • Drive
//  AI/LLM • Database • Webhooks • CRM • Payments • Monitoring
//
// ═══════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                                                                            ║
 * ║   ONYX INTEGRATION LAYER v2.0.0                                            ║
 * ║   Complete Tool & Connector Library for ONYX AI Platform                   ║
 * ║                                                                            ║
 * ║   Every integration:                                                       ║
 * ║   • Has explicit schema (input/output)                                     ║
 * ║   • Goes through governance (Governor)                                     ║
 * ║   • Has circuit breaker protection                                         ║
 * ║   • Has rate limiting                                                      ║
 * ║   • Has health checks                                                      ║
 * ║   • Has cost tracking                                                      ║
 * ║   • Logs every invocation to EventStore                                    ║
 * ║                                                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 *
 * CONNECTOR MAP:
 *
 *  ┌──────────────────────────────────────────────────────────────────────────┐
 *  │                         ONYX INTEGRATION BUS                            │
 *  │                                                                          │
 *  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
 *  │  │  MESSAGING   │  │    EMAIL    │  │  CALENDAR   │  │  STORAGE    │    │
 *  │  │             │  │             │  │             │  │             │    │
 *  │  │  WhatsApp   │  │  Gmail      │  │  Google Cal │  │  Google     │    │
 *  │  │  Telegram   │  │  SMTP       │  │  Outlook    │  │   Drive     │    │
 *  │  │  SMS/Twilio │  │  SendGrid   │  │  Cal DAV    │  │  S3/R2      │    │
 *  │  │  Slack      │  │  Mailgun    │  │             │  │  Local FS   │    │
 *  │  │  Discord    │  │             │  │             │  │             │    │
 *  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
 *  │                                                                          │
 *  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
 *  │  │   AI/LLM    │  │  DATABASE   │  │  CRM/ERP    │  │  PAYMENTS   │    │
 *  │  │             │  │             │  │             │  │             │    │
 *  │  │  Claude     │  │  PostgreSQL │  │  HubSpot    │  │  Stripe     │    │
 *  │  │  OpenAI     │  │  MongoDB    │  │  Salesforce │  │  PayPal     │    │
 *  │  │  Gemini     │  │  Redis      │  │  Monday     │  │  Invoice    │    │
 *  │  │  Perplexity │  │  Supabase   │  │  Airtable   │  │             │    │
 *  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
 *  │                                                                          │
 *  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
 *  │  │  WEBHOOKS   │  │ SOCIAL/SEO  │  │ MONITORING  │  │  CUSTOM     │    │
 *  │  │             │  │             │  │             │  │             │    │
 *  │  │  Inbound    │  │  Facebook   │  │  Uptime     │  │  HTTP/REST  │    │
 *  │  │  Outbound   │  │  Instagram  │  │  Logs       │  │  GraphQL    │    │
 *  │  │  n8n        │  │  Google Ads │  │  Metrics    │  │  SOAP       │    │
 *  │  │  Make.com   │  │  Analytics  │  │  Alerts     │  │  gRPC       │    │
 *  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
 *  └──────────────────────────────────────────────────────────────────────────┘
 */


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 0: SHARED HTTP CLIENT & TYPES
// Every integration uses this — not raw https.request() calls scattered
// around. Centralized retry, timeout, logging, header management.
// ═══════════════════════════════════════════════════════════════════════════

interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
  durationMs: number;
}

interface HttpRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  followRedirects?: boolean;
}

class HttpClient {
  private defaultHeaders: Record<string, string> = {};

  constructor(
    private baseUrl: string = '',
    private defaultTimeout: number = 30000,
  ) {}

  setDefaultHeader(key: string, value: string): void {
    this.defaultHeaders[key] = value;
  }

  setAuth(type: 'bearer' | 'basic' | 'api_key', credential: string, headerName?: string): void {
    switch (type) {
      case 'bearer':
        this.defaultHeaders['Authorization'] = `Bearer ${credential}`;
        break;
      case 'basic':
        this.defaultHeaders['Authorization'] = `Basic ${Buffer.from(credential).toString('base64')}`;
        break;
      case 'api_key':
        this.defaultHeaders[headerName ?? 'X-API-Key'] = credential;
        break;
    }
  }

  async request(config: HttpRequestConfig): Promise<HttpResponse> {
    const startTime = Date.now();
    const fullUrl = config.url.startsWith('http') ? config.url : `${this.baseUrl}${config.url}`;
    const url = new URL(fullUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...config.headers,
    };

    if (config.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    const bodyStr = config.body
      ? (typeof config.body === 'string' ? config.body : JSON.stringify(config.body))
      : undefined;

    if (bodyStr) {
      headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    }

    return new Promise((resolve, reject) => {
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: config.method,
          headers,
          timeout: config.timeout ?? this.defaultTimeout,
        },
        (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            let parsed: unknown;
            try {
              parsed = JSON.parse(data);
            } catch {
              parsed = data;
            }

            resolve({
              status: res.statusCode ?? 0,
              headers: Object.fromEntries(
                Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v ?? ''])
              ),
              body: parsed,
              rawBody: data,
              durationMs: Date.now() - startTime,
            });
          });
        },
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`HTTP request timed out after ${config.timeout ?? this.defaultTimeout}ms`));
      });

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  async get(path: string, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ method: 'GET', url: path, headers });
  }

  async post(path: string, body: unknown, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ method: 'POST', url: path, body, headers });
  }

  async put(path: string, body: unknown, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ method: 'PUT', url: path, body, headers });
  }

  async patch(path: string, body: unknown, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ method: 'PATCH', url: path, body, headers });
  }

  async delete(path: string, headers?: Record<string, string>): Promise<HttpResponse> {
    return this.request({ method: 'DELETE', url: path, headers });
  }
}


/** Credential Vault — encrypted storage for API keys and tokens */
class CredentialVault {
  private credentials: Map<string, {
    value: string;
    encrypted: boolean;
    expiresAt?: number;
    refreshToken?: string;
    refreshUrl?: string;
  }> = new Map();

  private encryptionKey: Buffer;

  constructor(masterKey?: string) {
    // Derive encryption key from master key or generate one
    this.encryptionKey = crypto
      .createHash('sha256')
      .update(masterKey ?? crypto.randomBytes(32).toString('hex'))
      .digest();
  }

  store(id: string, value: string, options?: {
    expiresAt?: number;
    refreshToken?: string;
    refreshUrl?: string;
  }): void {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    this.credentials.set(id, {
      value: `${iv.toString('hex')}:${encrypted}`,
      encrypted: true,
      expiresAt: options?.expiresAt,
      refreshToken: options?.refreshToken,
      refreshUrl: options?.refreshUrl,
    });
  }

  retrieve(id: string): string | null {
    const cred = this.credentials.get(id);
    if (!cred) return null;

    // Check expiration
    if (cred.expiresAt && Date.now() > cred.expiresAt) {
      // TODO: Auto-refresh using refreshToken
      return null;
    }

    if (cred.encrypted) {
      const [ivHex, encrypted] = cred.value.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    return cred.value;
  }

  has(id: string): boolean {
    return this.credentials.has(id);
  }

  remove(id: string): void {
    this.credentials.delete(id);
  }

  list(): string[] {
    return Array.from(this.credentials.keys());
  }
}


/** Standard Tool Definition builder — reduces boilerplate */
interface ToolConfig {
  id: string;
  name: string;
  description: string;
  category: 'http' | 'database' | 'filesystem' | 'ai' | 'queue' | 'notification' | 'custom';
  version: string;
  costPerInvocation: number;
  riskScore: number;
  timeout: number;
  retryable: boolean;
  maxPerMinute?: number;
  failureThreshold?: number;
  recoveryTimeMs?: number;
  inputSchema: Record<string, { type: string; required: boolean; description: string }>;
  outputSchema: Record<string, { type: string; description: string }>;
  handler: (input: Record<string, unknown>, context: any) => Promise<Record<string, unknown>>;
  healthCheck?: () => Promise<boolean>;
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: WHATSAPP BUSINESS API INTEGRATION
// Uses Meta's Cloud API (graph.facebook.com)
// Supports: Send text, media, templates, interactive messages, read receipts
// ═══════════════════════════════════════════════════════════════════════════

function createWhatsAppTools(vault: CredentialVault): ToolConfig[] {
  const client = new HttpClient('https://graph.facebook.com/v21.0');
  const getToken = () => vault.retrieve('whatsapp_token') ?? '';
  const getPhoneId = () => vault.retrieve('whatsapp_phone_id') ?? '';

  return [
    {
      id: 'whatsapp.send_text',
      name: 'WhatsApp: Send Text Message',
      description: 'Send a text message via WhatsApp Business API',
      category: 'notification',
      version: '1.0',
      costPerInvocation: 0.005,
      riskScore: 0.1,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 80,
      inputSchema: {
        to: { type: 'string', required: true, description: 'Phone number with country code (e.g., +972501234567)' },
        message: { type: 'string', required: true, description: 'Text message content' },
        previewUrl: { type: 'boolean', required: false, description: 'Show link preview' },
      },
      outputSchema: {
        messageId: { type: 'string', description: 'WhatsApp message ID' },
        status: { type: 'string', description: 'Send status' },
      },
      handler: async (input) => {
        const res = await client.post(
          `/${getPhoneId()}/messages`,
          {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: input.to,
            type: 'text',
            text: { preview_url: input.previewUrl ?? false, body: input.message },
          },
          { Authorization: `Bearer ${getToken()}` },
        );
        const body = res.body as any;
        return {
          messageId: body?.messages?.[0]?.id ?? 'unknown',
          status: res.status === 200 ? 'sent' : 'failed',
          whatsappResponse: body,
        };
      },
      healthCheck: async () => {
        const res = await client.get(`/${getPhoneId()}`, { Authorization: `Bearer ${getToken()}` });
        return res.status === 200;
      },
    },

    {
      id: 'whatsapp.send_template',
      name: 'WhatsApp: Send Template Message',
      description: 'Send a pre-approved template message (for initiating conversations)',
      category: 'notification',
      version: '1.0',
      costPerInvocation: 0.03,
      riskScore: 0.1,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 80,
      inputSchema: {
        to: { type: 'string', required: true, description: 'Phone number with country code' },
        templateName: { type: 'string', required: true, description: 'Approved template name' },
        languageCode: { type: 'string', required: true, description: 'Template language code (e.g., he, en)' },
        parameters: { type: 'array', required: false, description: 'Template parameter values' },
      },
      outputSchema: {
        messageId: { type: 'string', description: 'WhatsApp message ID' },
      },
      handler: async (input) => {
        const components: any[] = [];
        if (input.parameters && Array.isArray(input.parameters) && (input.parameters as any[]).length > 0) {
          components.push({
            type: 'body',
            parameters: (input.parameters as any[]).map(p => ({ type: 'text', text: String(p) })),
          });
        }

        const res = await client.post(
          `/${getPhoneId()}/messages`,
          {
            messaging_product: 'whatsapp',
            to: input.to,
            type: 'template',
            template: {
              name: input.templateName,
              language: { code: input.languageCode },
              components,
            },
          },
          { Authorization: `Bearer ${getToken()}` },
        );
        const body = res.body as any;
        return { messageId: body?.messages?.[0]?.id ?? 'unknown' };
      },
    },

    {
      id: 'whatsapp.send_media',
      name: 'WhatsApp: Send Media',
      description: 'Send image, document, video, or audio via WhatsApp',
      category: 'notification',
      version: '1.0',
      costPerInvocation: 0.01,
      riskScore: 0.1,
      timeout: 30000,
      retryable: true,
      maxPerMinute: 40,
      inputSchema: {
        to: { type: 'string', required: true, description: 'Phone number' },
        mediaType: { type: 'string', required: true, description: 'image | document | video | audio' },
        mediaUrl: { type: 'string', required: true, description: 'Public URL of the media file' },
        caption: { type: 'string', required: false, description: 'Media caption' },
        filename: { type: 'string', required: false, description: 'Filename for documents' },
      },
      outputSchema: {
        messageId: { type: 'string', description: 'WhatsApp message ID' },
      },
      handler: async (input) => {
        const mediaPayload: any = { link: input.mediaUrl };
        if (input.caption) mediaPayload.caption = input.caption;
        if (input.filename) mediaPayload.filename = input.filename;

        const res = await client.post(
          `/${getPhoneId()}/messages`,
          {
            messaging_product: 'whatsapp',
            to: input.to,
            type: input.mediaType,
            [input.mediaType as string]: mediaPayload,
          },
          { Authorization: `Bearer ${getToken()}` },
        );
        const body = res.body as any;
        return { messageId: body?.messages?.[0]?.id ?? 'unknown' };
      },
    },

    {
      id: 'whatsapp.send_interactive',
      name: 'WhatsApp: Send Interactive Message',
      description: 'Send interactive buttons or list messages',
      category: 'notification',
      version: '1.0',
      costPerInvocation: 0.01,
      riskScore: 0.1,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 60,
      inputSchema: {
        to: { type: 'string', required: true, description: 'Phone number' },
        interactiveType: { type: 'string', required: true, description: 'button | list' },
        headerText: { type: 'string', required: false, description: 'Header text' },
        bodyText: { type: 'string', required: true, description: 'Body text' },
        footerText: { type: 'string', required: false, description: 'Footer text' },
        buttons: { type: 'array', required: false, description: 'Array of {id, title} for buttons' },
        sections: { type: 'array', required: false, description: 'Array of sections for list type' },
      },
      outputSchema: {
        messageId: { type: 'string', description: 'WhatsApp message ID' },
      },
      handler: async (input) => {
        const interactive: any = {
          type: input.interactiveType,
          body: { text: input.bodyText },
        };
        if (input.headerText) interactive.header = { type: 'text', text: input.headerText };
        if (input.footerText) interactive.footer = { text: input.footerText };

        if (input.interactiveType === 'button' && input.buttons) {
          interactive.action = {
            buttons: (input.buttons as any[]).map(b => ({
              type: 'reply',
              reply: { id: b.id, title: b.title },
            })),
          };
        }
        if (input.interactiveType === 'list' && input.sections) {
          interactive.action = {
            button: 'בחר אפשרות',
            sections: input.sections,
          };
        }

        const res = await client.post(
          `/${getPhoneId()}/messages`,
          {
            messaging_product: 'whatsapp',
            to: input.to,
            type: 'interactive',
            interactive,
          },
          { Authorization: `Bearer ${getToken()}` },
        );
        const body = res.body as any;
        return { messageId: body?.messages?.[0]?.id ?? 'unknown' };
      },
    },

    {
      id: 'whatsapp.mark_read',
      name: 'WhatsApp: Mark Message as Read',
      description: 'Mark a received message as read (blue checkmarks)',
      category: 'notification',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0,
      timeout: 5000,
      retryable: false,
      maxPerMinute: 200,
      inputSchema: {
        messageId: { type: 'string', required: true, description: 'Message ID to mark as read' },
      },
      outputSchema: {
        success: { type: 'boolean', description: 'Whether marking was successful' },
      },
      handler: async (input) => {
        const res = await client.post(
          `/${getPhoneId()}/messages`,
          {
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: input.messageId,
          },
          { Authorization: `Bearer ${getToken()}` },
        );
        return { success: res.status === 200 };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: SMS / TWILIO INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

function createSMSTools(vault: CredentialVault): ToolConfig[] {
  const getAccountSid = () => vault.retrieve('twilio_account_sid') ?? '';
  const getAuthToken = () => vault.retrieve('twilio_auth_token') ?? '';
  const getFromNumber = () => vault.retrieve('twilio_from_number') ?? '';

  return [
    {
      id: 'sms.send',
      name: 'SMS: Send Text Message',
      description: 'Send SMS via Twilio',
      category: 'notification',
      version: '1.0',
      costPerInvocation: 0.0079,
      riskScore: 0.1,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 60,
      inputSchema: {
        to: { type: 'string', required: true, description: 'Phone number with country code' },
        message: { type: 'string', required: true, description: 'SMS text (max 1600 chars)' },
        from: { type: 'string', required: false, description: 'Override sender number' },
      },
      outputSchema: {
        sid: { type: 'string', description: 'Twilio message SID' },
        status: { type: 'string', description: 'Message status' },
      },
      handler: async (input) => {
        const sid = getAccountSid();
        const client = new HttpClient(`https://api.twilio.com/2010-04-01/Accounts/${sid}`);
        const auth = Buffer.from(`${sid}:${getAuthToken()}`).toString('base64');

        const formData = new URLSearchParams({
          To: input.to as string,
          From: (input.from as string) ?? getFromNumber(),
          Body: input.message as string,
        });

        const res = await client.request({
          method: 'POST',
          url: `/Messages.json`,
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });

        const body = res.body as any;
        return { sid: body?.sid ?? 'unknown', status: body?.status ?? 'failed' };
      },
      healthCheck: async () => {
        const sid = getAccountSid();
        const client = new HttpClient(`https://api.twilio.com/2010-04-01/Accounts/${sid}`);
        const auth = Buffer.from(`${sid}:${getAuthToken()}`).toString('base64');
        const res = await client.get('.json', { Authorization: `Basic ${auth}` });
        return res.status === 200;
      },
    },

    {
      id: 'sms.send_whatsapp_via_twilio',
      name: 'SMS: Send WhatsApp via Twilio',
      description: 'Send WhatsApp message through Twilio (alternative to Meta direct)',
      category: 'notification',
      version: '1.0',
      costPerInvocation: 0.005,
      riskScore: 0.1,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 60,
      inputSchema: {
        to: { type: 'string', required: true, description: 'Phone number (will be prefixed with whatsapp:)' },
        message: { type: 'string', required: true, description: 'Message text' },
      },
      outputSchema: {
        sid: { type: 'string', description: 'Twilio message SID' },
      },
      handler: async (input) => {
        const sid = getAccountSid();
        const client = new HttpClient(`https://api.twilio.com/2010-04-01/Accounts/${sid}`);
        const auth = Buffer.from(`${sid}:${getAuthToken()}`).toString('base64');

        const to = (input.to as string).startsWith('whatsapp:') ? input.to : `whatsapp:${input.to}`;
        const from = `whatsapp:${getFromNumber()}`;

        const formData = new URLSearchParams({
          To: to as string,
          From: from,
          Body: input.message as string,
        });

        const res = await client.request({
          method: 'POST',
          url: `/Messages.json`,
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });

        const body = res.body as any;
        return { sid: body?.sid ?? 'unknown' };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: GMAIL / EMAIL INTEGRATION
// Uses Google Gmail API (OAuth2) and generic SMTP/SendGrid
// ═══════════════════════════════════════════════════════════════════════════

function createEmailTools(vault: CredentialVault): ToolConfig[] {
  const gmailClient = new HttpClient('https://gmail.googleapis.com/gmail/v1');
  const getGmailToken = () => vault.retrieve('gmail_access_token') ?? '';

  return [
    {
      id: 'gmail.send',
      name: 'Gmail: Send Email',
      description: 'Send an email via Gmail API',
      category: 'notification',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.2,
      timeout: 20000,
      retryable: true,
      maxPerMinute: 30,
      inputSchema: {
        to: { type: 'string', required: true, description: 'Recipient email' },
        subject: { type: 'string', required: true, description: 'Email subject' },
        body: { type: 'string', required: true, description: 'Email body (HTML supported)' },
        cc: { type: 'string', required: false, description: 'CC recipients (comma-separated)' },
        bcc: { type: 'string', required: false, description: 'BCC recipients (comma-separated)' },
        replyTo: { type: 'string', required: false, description: 'Reply-to address' },
      },
      outputSchema: {
        messageId: { type: 'string', description: 'Gmail message ID' },
        threadId: { type: 'string', description: 'Gmail thread ID' },
      },
      handler: async (input) => {
        const mimeLines = [
          `To: ${input.to}`,
          `Subject: ${input.subject}`,
          `Content-Type: text/html; charset=utf-8`,
          `MIME-Version: 1.0`,
        ];
        if (input.cc) mimeLines.push(`Cc: ${input.cc}`);
        if (input.bcc) mimeLines.push(`Bcc: ${input.bcc}`);
        if (input.replyTo) mimeLines.push(`Reply-To: ${input.replyTo}`);
        mimeLines.push('', input.body as string);

        const rawMessage = Buffer.from(mimeLines.join('\r\n'))
          .toString('base64')
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');

        const res = await gmailClient.post(
          '/users/me/messages/send',
          { raw: rawMessage },
          { Authorization: `Bearer ${getGmailToken()}` },
        );

        const body = res.body as any;
        return {
          messageId: body?.id ?? 'unknown',
          threadId: body?.threadId ?? 'unknown',
        };
      },
      healthCheck: async () => {
        const res = await gmailClient.get('/users/me/profile', {
          Authorization: `Bearer ${getGmailToken()}`,
        });
        return res.status === 200;
      },
    },

    {
      id: 'gmail.search',
      name: 'Gmail: Search Messages',
      description: 'Search Gmail inbox with query',
      category: 'custom',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.1,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 60,
      inputSchema: {
        query: { type: 'string', required: true, description: 'Gmail search query (same as Gmail search bar)' },
        maxResults: { type: 'number', required: false, description: 'Max results (default 10)' },
      },
      outputSchema: {
        messages: { type: 'array', description: 'Array of message summaries' },
        totalResults: { type: 'number', description: 'Total matching messages' },
      },
      handler: async (input) => {
        const maxResults = (input.maxResults as number) ?? 10;
        const res = await gmailClient.get(
          `/users/me/messages?q=${encodeURIComponent(input.query as string)}&maxResults=${maxResults}`,
          { Authorization: `Bearer ${getGmailToken()}` },
        );

        const body = res.body as any;
        const messageIds = body?.messages ?? [];

        // Fetch message details
        const messages = [];
        for (const msg of messageIds.slice(0, maxResults)) {
          const detail = await gmailClient.get(
            `/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
            { Authorization: `Bearer ${getGmailToken()}` },
          );
          const d = detail.body as any;
          const headers = d?.payload?.headers ?? [];
          messages.push({
            id: msg.id,
            threadId: msg.threadId,
            subject: headers.find((h: any) => h.name === 'Subject')?.value ?? '',
            from: headers.find((h: any) => h.name === 'From')?.value ?? '',
            date: headers.find((h: any) => h.name === 'Date')?.value ?? '',
            snippet: d?.snippet ?? '',
          });
        }

        return { messages, totalResults: body?.resultSizeEstimate ?? 0 };
      },
    },

    {
      id: 'gmail.read',
      name: 'Gmail: Read Message',
      description: 'Read the full content of a Gmail message',
      category: 'custom',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.1,
      timeout: 10000,
      retryable: true,
      maxPerMinute: 60,
      inputSchema: {
        messageId: { type: 'string', required: true, description: 'Gmail message ID' },
      },
      outputSchema: {
        subject: { type: 'string', description: 'Subject' },
        from: { type: 'string', description: 'Sender' },
        body: { type: 'string', description: 'Message body' },
      },
      handler: async (input) => {
        const res = await gmailClient.get(
          `/users/me/messages/${input.messageId}?format=full`,
          { Authorization: `Bearer ${getGmailToken()}` },
        );

        const msg = res.body as any;
        const headers = msg?.payload?.headers ?? [];
        let body = '';

        // Extract body from parts
        const extractBody = (payload: any): string => {
          if (payload.body?.data) {
            return Buffer.from(payload.body.data, 'base64').toString('utf-8');
          }
          if (payload.parts) {
            for (const part of payload.parts) {
              if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
                if (part.body?.data) {
                  return Buffer.from(part.body.data, 'base64').toString('utf-8');
                }
              }
              const nested = extractBody(part);
              if (nested) return nested;
            }
          }
          return '';
        };

        body = extractBody(msg?.payload ?? {});

        return {
          subject: headers.find((h: any) => h.name === 'Subject')?.value ?? '',
          from: headers.find((h: any) => h.name === 'From')?.value ?? '',
          to: headers.find((h: any) => h.name === 'To')?.value ?? '',
          date: headers.find((h: any) => h.name === 'Date')?.value ?? '',
          body,
          labels: msg?.labelIds ?? [],
        };
      },
    },

    {
      id: 'sendgrid.send',
      name: 'SendGrid: Send Email',
      description: 'Send email via SendGrid API (transactional)',
      category: 'notification',
      version: '1.0',
      costPerInvocation: 0.001,
      riskScore: 0.15,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 100,
      inputSchema: {
        to: { type: 'string', required: true, description: 'Recipient email' },
        from: { type: 'string', required: true, description: 'Sender email' },
        subject: { type: 'string', required: true, description: 'Email subject' },
        htmlContent: { type: 'string', required: true, description: 'HTML content' },
        textContent: { type: 'string', required: false, description: 'Plain text fallback' },
      },
      outputSchema: {
        statusCode: { type: 'number', description: 'HTTP status code' },
        messageId: { type: 'string', description: 'SendGrid message ID' },
      },
      handler: async (input) => {
        const sgClient = new HttpClient('https://api.sendgrid.com/v3');
        const res = await sgClient.post(
          '/mail/send',
          {
            personalizations: [{ to: [{ email: input.to }] }],
            from: { email: input.from },
            subject: input.subject,
            content: [
              ...(input.textContent ? [{ type: 'text/plain', value: input.textContent }] : []),
              { type: 'text/html', value: input.htmlContent },
            ],
          },
          { Authorization: `Bearer ${vault.retrieve('sendgrid_api_key') ?? ''}` },
        );
        return {
          statusCode: res.status,
          messageId: res.headers['x-message-id'] ?? 'unknown',
        };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: TELEGRAM BOT INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

function createTelegramTools(vault: CredentialVault): ToolConfig[] {
  const getToken = () => vault.retrieve('telegram_bot_token') ?? '';
  const baseUrl = () => `https://api.telegram.org/bot${getToken()}`;

  return [
    {
      id: 'telegram.send_message',
      name: 'Telegram: Send Message',
      description: 'Send text message via Telegram Bot API',
      category: 'notification',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.05,
      timeout: 10000,
      retryable: true,
      maxPerMinute: 30,
      inputSchema: {
        chatId: { type: 'string', required: true, description: 'Telegram chat ID or @channel' },
        text: { type: 'string', required: true, description: 'Message text (Markdown supported)' },
        parseMode: { type: 'string', required: false, description: 'MarkdownV2 | HTML (default: MarkdownV2)' },
        disableNotification: { type: 'boolean', required: false, description: 'Silent message' },
      },
      outputSchema: {
        messageId: { type: 'number', description: 'Telegram message ID' },
        ok: { type: 'boolean', description: 'Success status' },
      },
      handler: async (input) => {
        const client = new HttpClient();
        const res = await client.post(`${baseUrl()}/sendMessage`, {
          chat_id: input.chatId,
          text: input.text,
          parse_mode: input.parseMode ?? 'MarkdownV2',
          disable_notification: input.disableNotification ?? false,
        });
        const body = res.body as any;
        return { messageId: body?.result?.message_id ?? 0, ok: body?.ok ?? false };
      },
    },

    {
      id: 'telegram.send_document',
      name: 'Telegram: Send Document',
      description: 'Send a file/document via Telegram',
      category: 'notification',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.05,
      timeout: 30000,
      retryable: true,
      maxPerMinute: 20,
      inputSchema: {
        chatId: { type: 'string', required: true, description: 'Telegram chat ID' },
        documentUrl: { type: 'string', required: true, description: 'URL of document to send' },
        caption: { type: 'string', required: false, description: 'Document caption' },
      },
      outputSchema: {
        messageId: { type: 'number', description: 'Telegram message ID' },
      },
      handler: async (input) => {
        const client = new HttpClient();
        const res = await client.post(`${baseUrl()}/sendDocument`, {
          chat_id: input.chatId,
          document: input.documentUrl,
          caption: input.caption ?? '',
        });
        const body = res.body as any;
        return { messageId: body?.result?.message_id ?? 0 };
      },
    },

    {
      id: 'telegram.get_updates',
      name: 'Telegram: Get Updates',
      description: 'Poll for new messages (long polling)',
      category: 'custom',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0,
      timeout: 35000,
      retryable: true,
      maxPerMinute: 30,
      inputSchema: {
        offset: { type: 'number', required: false, description: 'Update offset for pagination' },
        limit: { type: 'number', required: false, description: 'Max updates to receive (1-100)' },
      },
      outputSchema: {
        updates: { type: 'array', description: 'Array of update objects' },
      },
      handler: async (input) => {
        const client = new HttpClient();
        const params = new URLSearchParams();
        if (input.offset) params.set('offset', String(input.offset));
        params.set('limit', String(input.limit ?? 10));
        params.set('timeout', '30');

        const res = await client.get(`${baseUrl()}/getUpdates?${params.toString()}`);
        const body = res.body as any;
        return { updates: body?.result ?? [] };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: SLACK INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

function createSlackTools(vault: CredentialVault): ToolConfig[] {
  const client = new HttpClient('https://slack.com/api');
  const getToken = () => vault.retrieve('slack_bot_token') ?? '';

  return [
    {
      id: 'slack.post_message',
      name: 'Slack: Post Message',
      description: 'Post a message to a Slack channel',
      category: 'notification',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.05,
      timeout: 10000,
      retryable: true,
      maxPerMinute: 50,
      inputSchema: {
        channel: { type: 'string', required: true, description: 'Channel ID or name' },
        text: { type: 'string', required: true, description: 'Message text' },
        blocks: { type: 'array', required: false, description: 'Rich layout blocks (Block Kit JSON)' },
        threadTs: { type: 'string', required: false, description: 'Thread timestamp for replies' },
      },
      outputSchema: {
        ts: { type: 'string', description: 'Message timestamp (ID)' },
        channel: { type: 'string', description: 'Channel ID' },
      },
      handler: async (input) => {
        const payload: any = {
          channel: input.channel,
          text: input.text,
        };
        if (input.blocks) payload.blocks = input.blocks;
        if (input.threadTs) payload.thread_ts = input.threadTs;

        const res = await client.post('/chat.postMessage', payload, {
          Authorization: `Bearer ${getToken()}`,
        });
        const body = res.body as any;
        return { ts: body?.ts ?? '', channel: body?.channel ?? '', ok: body?.ok ?? false };
      },
    },

    {
      id: 'slack.list_channels',
      name: 'Slack: List Channels',
      description: 'List all accessible Slack channels',
      category: 'custom',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0,
      timeout: 10000,
      retryable: true,
      maxPerMinute: 20,
      inputSchema: {
        limit: { type: 'number', required: false, description: 'Max channels (default 100)' },
        types: { type: 'string', required: false, description: 'Channel types: public_channel,private_channel' },
      },
      outputSchema: {
        channels: { type: 'array', description: 'Array of channel objects' },
      },
      handler: async (input) => {
        const res = await client.get(
          `/conversations.list?limit=${input.limit ?? 100}&types=${input.types ?? 'public_channel'}`,
          { Authorization: `Bearer ${getToken()}` },
        );
        const body = res.body as any;
        return {
          channels: (body?.channels ?? []).map((c: any) => ({
            id: c.id, name: c.name, topic: c.topic?.value, memberCount: c.num_members,
          })),
        };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: GOOGLE CALENDAR INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

function createCalendarTools(vault: CredentialVault): ToolConfig[] {
  const client = new HttpClient('https://www.googleapis.com/calendar/v3');
  const getToken = () => vault.retrieve('google_access_token') ?? '';

  return [
    {
      id: 'gcal.list_events',
      name: 'Google Calendar: List Events',
      description: 'List upcoming calendar events',
      category: 'custom',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.05,
      timeout: 10000,
      retryable: true,
      maxPerMinute: 60,
      inputSchema: {
        calendarId: { type: 'string', required: false, description: 'Calendar ID (default: primary)' },
        timeMin: { type: 'string', required: false, description: 'Start time (ISO 8601)' },
        timeMax: { type: 'string', required: false, description: 'End time (ISO 8601)' },
        maxResults: { type: 'number', required: false, description: 'Max events (default 10)' },
      },
      outputSchema: {
        events: { type: 'array', description: 'Array of calendar events' },
      },
      handler: async (input) => {
        const calId = (input.calendarId as string) ?? 'primary';
        const params = new URLSearchParams();
        params.set('maxResults', String(input.maxResults ?? 10));
        params.set('singleEvents', 'true');
        params.set('orderBy', 'startTime');
        if (input.timeMin) params.set('timeMin', input.timeMin as string);
        else params.set('timeMin', new Date().toISOString());
        if (input.timeMax) params.set('timeMax', input.timeMax as string);

        const res = await client.get(
          `/calendars/${encodeURIComponent(calId)}/events?${params.toString()}`,
          { Authorization: `Bearer ${getToken()}` },
        );
        const body = res.body as any;
        return {
          events: (body?.items ?? []).map((e: any) => ({
            id: e.id,
            summary: e.summary,
            start: e.start?.dateTime ?? e.start?.date,
            end: e.end?.dateTime ?? e.end?.date,
            location: e.location,
            description: e.description,
            attendees: e.attendees?.map((a: any) => a.email) ?? [],
            status: e.status,
          })),
        };
      },
    },

    {
      id: 'gcal.create_event',
      name: 'Google Calendar: Create Event',
      description: 'Create a new calendar event',
      category: 'custom',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.2,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 30,
      inputSchema: {
        summary: { type: 'string', required: true, description: 'Event title' },
        start: { type: 'string', required: true, description: 'Start time (ISO 8601)' },
        end: { type: 'string', required: true, description: 'End time (ISO 8601)' },
        description: { type: 'string', required: false, description: 'Event description' },
        location: { type: 'string', required: false, description: 'Event location' },
        attendees: { type: 'array', required: false, description: 'Array of email addresses' },
        calendarId: { type: 'string', required: false, description: 'Calendar ID (default: primary)' },
      },
      outputSchema: {
        eventId: { type: 'string', description: 'Created event ID' },
        htmlLink: { type: 'string', description: 'Link to event' },
      },
      handler: async (input) => {
        const calId = (input.calendarId as string) ?? 'primary';
        const event: any = {
          summary: input.summary,
          start: { dateTime: input.start, timeZone: 'Asia/Jerusalem' },
          end: { dateTime: input.end, timeZone: 'Asia/Jerusalem' },
        };
        if (input.description) event.description = input.description;
        if (input.location) event.location = input.location;
        if (input.attendees) {
          event.attendees = (input.attendees as string[]).map(e => ({ email: e }));
        }

        const res = await client.post(
          `/calendars/${encodeURIComponent(calId)}/events`,
          event,
          { Authorization: `Bearer ${getToken()}` },
        );
        const body = res.body as any;
        return { eventId: body?.id ?? '', htmlLink: body?.htmlLink ?? '' };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: GOOGLE DRIVE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

function createDriveTools(vault: CredentialVault): ToolConfig[] {
  const client = new HttpClient('https://www.googleapis.com/drive/v3');
  const getToken = () => vault.retrieve('google_access_token') ?? '';

  return [
    {
      id: 'gdrive.list_files',
      name: 'Google Drive: List Files',
      description: 'List files and folders in Google Drive',
      category: 'filesystem',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.05,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 60,
      inputSchema: {
        query: { type: 'string', required: false, description: 'Search query (Drive API syntax)' },
        folderId: { type: 'string', required: false, description: 'Parent folder ID' },
        maxResults: { type: 'number', required: false, description: 'Max files (default 20)' },
        mimeType: { type: 'string', required: false, description: 'Filter by MIME type' },
      },
      outputSchema: {
        files: { type: 'array', description: 'Array of file metadata' },
      },
      handler: async (input) => {
        const params = new URLSearchParams();
        params.set('pageSize', String(input.maxResults ?? 20));
        params.set('fields', 'files(id,name,mimeType,size,modifiedTime,webViewLink,parents)');

        const queryParts: string[] = [];
        if (input.query) queryParts.push(input.query as string);
        if (input.folderId) queryParts.push(`'${input.folderId}' in parents`);
        if (input.mimeType) queryParts.push(`mimeType='${input.mimeType}'`);
        queryParts.push('trashed=false');
        params.set('q', queryParts.join(' and '));

        const res = await client.get(`/files?${params.toString()}`, {
          Authorization: `Bearer ${getToken()}`,
        });
        const body = res.body as any;
        return { files: body?.files ?? [] };
      },
    },

    {
      id: 'gdrive.create_doc',
      name: 'Google Drive: Create Document',
      description: 'Create a new Google Doc in Drive',
      category: 'filesystem',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.15,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 20,
      inputSchema: {
        name: { type: 'string', required: true, description: 'Document name' },
        folderId: { type: 'string', required: false, description: 'Parent folder ID' },
        mimeType: { type: 'string', required: false, description: 'MIME type (default: Google Doc)' },
      },
      outputSchema: {
        fileId: { type: 'string', description: 'Created file ID' },
        webViewLink: { type: 'string', description: 'Link to the file' },
      },
      handler: async (input) => {
        const metadata: any = {
          name: input.name,
          mimeType: (input.mimeType as string) ?? 'application/vnd.google-apps.document',
        };
        if (input.folderId) metadata.parents = [input.folderId];

        const res = await client.post('/files', metadata, {
          Authorization: `Bearer ${getToken()}`,
        });
        const body = res.body as any;
        return { fileId: body?.id ?? '', webViewLink: body?.webViewLink ?? '' };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8: AI / LLM INTEGRATION
// Claude, OpenAI-compatible, Gemini, Perplexity
// ═══════════════════════════════════════════════════════════════════════════

function createAITools(vault: CredentialVault): ToolConfig[] {
  return [
    {
      id: 'ai.claude',
      name: 'AI: Claude (Anthropic)',
      description: 'Send a prompt to Claude API',
      category: 'ai',
      version: '1.0',
      costPerInvocation: 0.05,
      riskScore: 0.1,
      timeout: 120000,
      retryable: true,
      maxPerMinute: 20,
      failureThreshold: 3,
      inputSchema: {
        prompt: { type: 'string', required: true, description: 'User message / prompt' },
        systemPrompt: { type: 'string', required: false, description: 'System prompt' },
        model: { type: 'string', required: false, description: 'Model name (default: claude-sonnet-4-20250514)' },
        maxTokens: { type: 'number', required: false, description: 'Max output tokens (default: 4096)' },
        temperature: { type: 'number', required: false, description: 'Temperature (0-1, default: 0.7)' },
      },
      outputSchema: {
        response: { type: 'string', description: 'Model response text' },
        model: { type: 'string', description: 'Model used' },
        usage: { type: 'object', description: 'Token usage stats' },
      },
      handler: async (input) => {
        const client = new HttpClient('https://api.anthropic.com');
        const messages = [{ role: 'user', content: input.prompt }];

        const body: any = {
          model: (input.model as string) ?? 'claude-sonnet-4-20250514',
          max_tokens: (input.maxTokens as number) ?? 4096,
          temperature: (input.temperature as number) ?? 0.7,
          messages,
        };
        if (input.systemPrompt) body.system = input.systemPrompt;

        const res = await client.post('/v1/messages', body, {
          'x-api-key': vault.retrieve('anthropic_api_key') ?? '',
          'anthropic-version': '2023-06-01',
        });

        const resBody = res.body as any;
        return {
          response: resBody?.content?.[0]?.text ?? '',
          model: resBody?.model ?? '',
          usage: resBody?.usage ?? {},
          stopReason: resBody?.stop_reason ?? '',
        };
      },
      healthCheck: async () => {
        return (vault.retrieve('anthropic_api_key') ?? '').length > 0;
      },
    },

    {
      id: 'ai.openai_compatible',
      name: 'AI: OpenAI-Compatible API',
      description: 'Send prompt to any OpenAI-compatible API (GPT, Mistral, Groq, local)',
      category: 'ai',
      version: '1.0',
      costPerInvocation: 0.03,
      riskScore: 0.1,
      timeout: 120000,
      retryable: true,
      maxPerMinute: 30,
      inputSchema: {
        prompt: { type: 'string', required: true, description: 'User message' },
        systemPrompt: { type: 'string', required: false, description: 'System prompt' },
        model: { type: 'string', required: false, description: 'Model name' },
        baseUrl: { type: 'string', required: false, description: 'API base URL (default: OpenAI)' },
        maxTokens: { type: 'number', required: false, description: 'Max tokens' },
        temperature: { type: 'number', required: false, description: 'Temperature' },
      },
      outputSchema: {
        response: { type: 'string', description: 'Model response' },
        usage: { type: 'object', description: 'Token usage' },
      },
      handler: async (input) => {
        const baseUrl = (input.baseUrl as string) ?? 'https://api.openai.com/v1';
        const client = new HttpClient(baseUrl);

        const messages: any[] = [];
        if (input.systemPrompt) messages.push({ role: 'system', content: input.systemPrompt });
        messages.push({ role: 'user', content: input.prompt });

        const res = await client.post('/chat/completions', {
          model: (input.model as string) ?? 'gpt-4o',
          messages,
          max_tokens: (input.maxTokens as number) ?? 4096,
          temperature: (input.temperature as number) ?? 0.7,
        }, {
          Authorization: `Bearer ${vault.retrieve('openai_api_key') ?? ''}`,
        });

        const body = res.body as any;
        return {
          response: body?.choices?.[0]?.message?.content ?? '',
          usage: body?.usage ?? {},
          model: body?.model ?? '',
        };
      },
    },

    {
      id: 'ai.perplexity',
      name: 'AI: Perplexity Search',
      description: 'Search-augmented AI response via Perplexity API',
      category: 'ai',
      version: '1.0',
      costPerInvocation: 0.02,
      riskScore: 0.05,
      timeout: 60000,
      retryable: true,
      maxPerMinute: 20,
      inputSchema: {
        query: { type: 'string', required: true, description: 'Search query / question' },
        model: { type: 'string', required: false, description: 'Model (default: sonar)' },
      },
      outputSchema: {
        response: { type: 'string', description: 'AI-generated answer with citations' },
        citations: { type: 'array', description: 'Source URLs' },
      },
      handler: async (input) => {
        const client = new HttpClient('https://api.perplexity.ai');
        const res = await client.post('/chat/completions', {
          model: (input.model as string) ?? 'sonar',
          messages: [{ role: 'user', content: input.query }],
        }, {
          Authorization: `Bearer ${vault.retrieve('perplexity_api_key') ?? ''}`,
        });
        const body = res.body as any;
        return {
          response: body?.choices?.[0]?.message?.content ?? '',
          citations: body?.citations ?? [],
        };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9: DATABASE INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════════════

function createDatabaseTools(vault: CredentialVault): ToolConfig[] {
  return [
    {
      id: 'db.supabase_query',
      name: 'Database: Supabase Query',
      description: 'Execute a query against Supabase (PostgREST)',
      category: 'database',
      version: '1.0',
      costPerInvocation: 0.001,
      riskScore: 0.3,
      timeout: 30000,
      retryable: true,
      maxPerMinute: 120,
      inputSchema: {
        table: { type: 'string', required: true, description: 'Table name' },
        operation: { type: 'string', required: true, description: 'select | insert | update | delete' },
        filters: { type: 'string', required: false, description: 'PostgREST filter string' },
        data: { type: 'object', required: false, description: 'Data for insert/update' },
        select: { type: 'string', required: false, description: 'Columns to select' },
        limit: { type: 'number', required: false, description: 'Result limit' },
        order: { type: 'string', required: false, description: 'Order by column' },
      },
      outputSchema: {
        data: { type: 'array', description: 'Query results' },
        count: { type: 'number', description: 'Result count' },
      },
      handler: async (input) => {
        const supabaseUrl = vault.retrieve('supabase_url') ?? '';
        const supabaseKey = vault.retrieve('supabase_anon_key') ?? '';
        const client = new HttpClient(`${supabaseUrl}/rest/v1`);

        const headers: Record<string, string> = {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        };

        let path = `/${input.table}`;
        const params = new URLSearchParams();
        if (input.select) params.set('select', input.select as string);
        if (input.filters) path += `?${input.filters}`;
        if (input.limit) params.set('limit', String(input.limit));
        if (input.order) params.set('order', input.order as string);
        if (params.toString()) path += (path.includes('?') ? '&' : '?') + params.toString();

        let res: HttpResponse;
        switch (input.operation) {
          case 'select':
            res = await client.get(path, headers);
            break;
          case 'insert':
            res = await client.post(path, input.data, headers);
            break;
          case 'update':
            res = await client.patch(path, input.data, headers);
            break;
          case 'delete':
            res = await client.delete(path, headers);
            break;
          default:
            throw new Error(`Unknown operation: ${input.operation}`);
        }

        const data = Array.isArray(res.body) ? res.body : [res.body];
        return { data, count: data.length, status: res.status };
      },
    },

    {
      id: 'db.redis',
      name: 'Database: Redis (Upstash)',
      description: 'Execute Redis commands via Upstash REST API',
      category: 'database',
      version: '1.0',
      costPerInvocation: 0.0001,
      riskScore: 0.15,
      timeout: 5000,
      retryable: true,
      maxPerMinute: 500,
      inputSchema: {
        command: { type: 'string', required: true, description: 'Redis command (GET, SET, HGET, LPUSH, etc.)' },
        args: { type: 'array', required: true, description: 'Command arguments' },
      },
      outputSchema: {
        result: { type: 'string', description: 'Redis response' },
      },
      handler: async (input) => {
        const redisUrl = vault.retrieve('upstash_redis_url') ?? '';
        const redisToken = vault.retrieve('upstash_redis_token') ?? '';
        const client = new HttpClient(redisUrl);

        const res = await client.post('/', [input.command, ...(input.args as any[])], {
          Authorization: `Bearer ${redisToken}`,
        });

        const body = res.body as any;
        return { result: body?.result };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10: WEBHOOK SYSTEM (INBOUND + OUTBOUND)
// ═══════════════════════════════════════════════════════════════════════════

function createWebhookTools(vault: CredentialVault): ToolConfig[] {
  return [
    {
      id: 'webhook.send',
      name: 'Webhook: Send (Outbound)',
      description: 'Send data to any webhook URL',
      category: 'http',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.2,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 100,
      inputSchema: {
        url: { type: 'string', required: true, description: 'Webhook URL' },
        method: { type: 'string', required: false, description: 'HTTP method (default: POST)' },
        payload: { type: 'object', required: true, description: 'JSON payload' },
        headers: { type: 'object', required: false, description: 'Custom headers' },
        secret: { type: 'string', required: false, description: 'HMAC secret for signature' },
      },
      outputSchema: {
        statusCode: { type: 'number', description: 'Response status code' },
        responseBody: { type: 'string', description: 'Response body' },
      },
      handler: async (input) => {
        const client = new HttpClient();
        const customHeaders = (input.headers as Record<string, string>) ?? {};

        // Sign payload if secret provided
        if (input.secret) {
          const signature = crypto
            .createHmac('sha256', input.secret as string)
            .update(JSON.stringify(input.payload))
            .digest('hex');
          customHeaders['X-Signature-256'] = `sha256=${signature}`;
        }

        customHeaders['X-Onyx-Timestamp'] = Date.now().toString();
        customHeaders['User-Agent'] = 'ONYX-AI-Platform/2.0';

        const res = await client.request({
          method: ((input.method as string) ?? 'POST') as any,
          url: input.url as string,
          body: input.payload,
          headers: customHeaders,
        });

        return { statusCode: res.status, responseBody: res.rawBody };
      },
    },

    {
      id: 'webhook.n8n_trigger',
      name: 'Webhook: Trigger n8n Workflow',
      description: 'Trigger an n8n workflow via webhook',
      category: 'http',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.15,
      timeout: 30000,
      retryable: true,
      maxPerMinute: 30,
      inputSchema: {
        webhookUrl: { type: 'string', required: true, description: 'n8n webhook URL' },
        data: { type: 'object', required: true, description: 'Data to pass to workflow' },
      },
      outputSchema: {
        response: { type: 'object', description: 'n8n workflow response' },
      },
      handler: async (input) => {
        const client = new HttpClient();
        const res = await client.post(input.webhookUrl as string, input.data);
        return { response: res.body, status: res.status };
      },
    },

    {
      id: 'webhook.make_trigger',
      name: 'Webhook: Trigger Make.com Scenario',
      description: 'Trigger a Make.com (Integromat) scenario via webhook',
      category: 'http',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.15,
      timeout: 30000,
      retryable: true,
      maxPerMinute: 30,
      inputSchema: {
        webhookUrl: { type: 'string', required: true, description: 'Make.com webhook URL' },
        data: { type: 'object', required: true, description: 'Data to pass to scenario' },
      },
      outputSchema: {
        accepted: { type: 'boolean', description: 'Whether Make accepted the trigger' },
      },
      handler: async (input) => {
        const client = new HttpClient();
        const res = await client.post(input.webhookUrl as string, input.data);
        return { accepted: res.status === 200, response: res.body };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 11: GENERIC HTTP / REST / GRAPHQL
// ═══════════════════════════════════════════════════════════════════════════

function createHTTPTools(vault: CredentialVault): ToolConfig[] {
  return [
    {
      id: 'http.request',
      name: 'HTTP: Generic Request',
      description: 'Make any HTTP request to any URL',
      category: 'http',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.3,
      timeout: 30000,
      retryable: true,
      maxPerMinute: 120,
      inputSchema: {
        url: { type: 'string', required: true, description: 'Full URL' },
        method: { type: 'string', required: true, description: 'GET | POST | PUT | PATCH | DELETE' },
        headers: { type: 'object', required: false, description: 'Request headers' },
        body: { type: 'object', required: false, description: 'Request body (JSON)' },
        timeout: { type: 'number', required: false, description: 'Timeout in ms' },
      },
      outputSchema: {
        status: { type: 'number', description: 'HTTP status code' },
        headers: { type: 'object', description: 'Response headers' },
        body: { type: 'object', description: 'Response body' },
        durationMs: { type: 'number', description: 'Request duration' },
      },
      handler: async (input) => {
        const client = new HttpClient();
        const res = await client.request({
          method: input.method as any,
          url: input.url as string,
          headers: input.headers as Record<string, string>,
          body: input.body,
          timeout: (input.timeout as number) ?? 30000,
        });
        return {
          status: res.status,
          headers: res.headers,
          body: res.body,
          durationMs: res.durationMs,
        };
      },
    },

    {
      id: 'http.graphql',
      name: 'HTTP: GraphQL Query',
      description: 'Execute a GraphQL query against any endpoint',
      category: 'http',
      version: '1.0',
      costPerInvocation: 0.001,
      riskScore: 0.2,
      timeout: 30000,
      retryable: true,
      maxPerMinute: 60,
      inputSchema: {
        endpoint: { type: 'string', required: true, description: 'GraphQL endpoint URL' },
        query: { type: 'string', required: true, description: 'GraphQL query string' },
        variables: { type: 'object', required: false, description: 'Query variables' },
        authHeader: { type: 'string', required: false, description: 'Authorization header value' },
      },
      outputSchema: {
        data: { type: 'object', description: 'Query result data' },
        errors: { type: 'array', description: 'GraphQL errors (if any)' },
      },
      handler: async (input) => {
        const client = new HttpClient();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (input.authHeader) headers['Authorization'] = input.authHeader as string;

        const res = await client.post(input.endpoint as string, {
          query: input.query,
          variables: input.variables ?? {},
        }, headers);

        const body = res.body as any;
        return { data: body?.data ?? null, errors: body?.errors ?? [] };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 12: MONITORING & NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════

function createMonitoringTools(vault: CredentialVault): ToolConfig[] {
  return [
    {
      id: 'monitor.health_check',
      name: 'Monitor: HTTP Health Check',
      description: 'Check if a URL is responding correctly',
      category: 'custom',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0,
      timeout: 10000,
      retryable: false,
      maxPerMinute: 120,
      inputSchema: {
        url: { type: 'string', required: true, description: 'URL to check' },
        expectedStatus: { type: 'number', required: false, description: 'Expected HTTP status (default 200)' },
        timeout: { type: 'number', required: false, description: 'Timeout in ms (default 5000)' },
        contains: { type: 'string', required: false, description: 'Expected text in response body' },
      },
      outputSchema: {
        healthy: { type: 'boolean', description: 'Whether the check passed' },
        statusCode: { type: 'number', description: 'Actual HTTP status' },
        responseTimeMs: { type: 'number', description: 'Response time' },
        error: { type: 'string', description: 'Error message if unhealthy' },
      },
      handler: async (input) => {
        const client = new HttpClient();
        try {
          const res = await client.request({
            method: 'GET',
            url: input.url as string,
            timeout: (input.timeout as number) ?? 5000,
          });

          const expectedStatus = (input.expectedStatus as number) ?? 200;
          const statusOk = res.status === expectedStatus;
          const bodyOk = input.contains
            ? res.rawBody.includes(input.contains as string)
            : true;

          return {
            healthy: statusOk && bodyOk,
            statusCode: res.status,
            responseTimeMs: res.durationMs,
            error: !statusOk ? `Expected ${expectedStatus}, got ${res.status}`
              : !bodyOk ? `Response body does not contain "${input.contains}"`
              : null,
          };
        } catch (error: any) {
          return {
            healthy: false,
            statusCode: 0,
            responseTimeMs: 0,
            error: error.message,
          };
        }
      },
    },

    {
      id: 'monitor.discord_alert',
      name: 'Monitor: Discord Alert',
      description: 'Send an alert to a Discord webhook',
      category: 'notification',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.05,
      timeout: 10000,
      retryable: true,
      maxPerMinute: 30,
      inputSchema: {
        webhookUrl: { type: 'string', required: true, description: 'Discord webhook URL' },
        title: { type: 'string', required: true, description: 'Alert title' },
        message: { type: 'string', required: true, description: 'Alert message' },
        color: { type: 'number', required: false, description: 'Embed color (default: red = 16711680)' },
        severity: { type: 'string', required: false, description: 'info | warning | error | critical' },
      },
      outputSchema: {
        sent: { type: 'boolean', description: 'Whether the alert was sent' },
      },
      handler: async (input) => {
        const client = new HttpClient();
        const colorMap: Record<string, number> = {
          info: 3447003,      // Blue
          warning: 16776960,  // Yellow
          error: 16711680,    // Red
          critical: 10038562, // Dark Red
        };

        const res = await client.post(input.webhookUrl as string, {
          embeds: [{
            title: `${input.severity === 'critical' ? '🚨' : input.severity === 'error' ? '❌' : input.severity === 'warning' ? '⚠️' : 'ℹ️'} ${input.title}`,
            description: input.message,
            color: (input.color as number) ?? colorMap[(input.severity as string) ?? 'error'] ?? 16711680,
            timestamp: new Date().toISOString(),
            footer: { text: 'ONYX AI Platform v2.0' },
          }],
        });

        return { sent: res.status === 204 || res.status === 200 };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 13: CRM INTEGRATIONS
// ═══════════════════════════════════════════════════════════════════════════

function createCRMTools(vault: CredentialVault): ToolConfig[] {
  return [
    {
      id: 'crm.hubspot_create_contact',
      name: 'CRM: HubSpot Create Contact',
      description: 'Create a new contact in HubSpot CRM',
      category: 'custom',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.2,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 100,
      inputSchema: {
        email: { type: 'string', required: true, description: 'Contact email' },
        firstName: { type: 'string', required: false, description: 'First name' },
        lastName: { type: 'string', required: false, description: 'Last name' },
        phone: { type: 'string', required: false, description: 'Phone number' },
        company: { type: 'string', required: false, description: 'Company name' },
        properties: { type: 'object', required: false, description: 'Additional properties' },
      },
      outputSchema: {
        contactId: { type: 'string', description: 'HubSpot contact ID' },
      },
      handler: async (input) => {
        const client = new HttpClient('https://api.hubapi.com/crm/v3');
        const properties: Record<string, unknown> = {
          email: input.email,
          ...(input.firstName && { firstname: input.firstName }),
          ...(input.lastName && { lastname: input.lastName }),
          ...(input.phone && { phone: input.phone }),
          ...(input.company && { company: input.company }),
          ...((input.properties as Record<string, unknown>) ?? {}),
        };

        const res = await client.post('/objects/contacts', { properties }, {
          Authorization: `Bearer ${vault.retrieve('hubspot_api_key') ?? ''}`,
        });
        const body = res.body as any;
        return { contactId: body?.id ?? '' };
      },
    },

    {
      id: 'crm.hubspot_search',
      name: 'CRM: HubSpot Search',
      description: 'Search contacts/deals/companies in HubSpot',
      category: 'custom',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.1,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 60,
      inputSchema: {
        objectType: { type: 'string', required: true, description: 'contacts | deals | companies' },
        query: { type: 'string', required: true, description: 'Search query' },
        limit: { type: 'number', required: false, description: 'Max results' },
      },
      outputSchema: {
        results: { type: 'array', description: 'Search results' },
        total: { type: 'number', description: 'Total matching results' },
      },
      handler: async (input) => {
        const client = new HttpClient('https://api.hubapi.com/crm/v3');
        const res = await client.post(`/objects/${input.objectType}/search`, {
          query: input.query,
          limit: (input.limit as number) ?? 10,
        }, {
          Authorization: `Bearer ${vault.retrieve('hubspot_api_key') ?? ''}`,
        });
        const body = res.body as any;
        return { results: body?.results ?? [], total: body?.total ?? 0 };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 14: PAYMENT / STRIPE INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

function createPaymentTools(vault: CredentialVault): ToolConfig[] {
  return [
    {
      id: 'payment.stripe_create_invoice',
      name: 'Payment: Stripe Create Invoice',
      description: 'Create a draft invoice in Stripe',
      category: 'custom',
      version: '1.0',
      costPerInvocation: 0,
      riskScore: 0.5,
      timeout: 15000,
      retryable: true,
      maxPerMinute: 30,
      inputSchema: {
        customerId: { type: 'string', required: true, description: 'Stripe customer ID' },
        items: { type: 'array', required: true, description: 'Array of {description, amount, currency}' },
        autoAdvance: { type: 'boolean', required: false, description: 'Auto-finalize (default: false)' },
        dueDate: { type: 'number', required: false, description: 'Due date (unix timestamp)' },
      },
      outputSchema: {
        invoiceId: { type: 'string', description: 'Stripe invoice ID' },
        invoiceUrl: { type: 'string', description: 'Hosted invoice URL' },
      },
      handler: async (input) => {
        const client = new HttpClient('https://api.stripe.com/v1');
        const auth = Buffer.from(`${vault.retrieve('stripe_secret_key') ?? ''}:`).toString('base64');

        // Create invoice
        const invoiceParams = new URLSearchParams();
        invoiceParams.set('customer', input.customerId as string);
        invoiceParams.set('auto_advance', String(input.autoAdvance ?? false));
        if (input.dueDate) invoiceParams.set('due_date', String(input.dueDate));

        const invoiceRes = await client.request({
          method: 'POST',
          url: '/invoices',
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: invoiceParams.toString(),
        });

        const invoice = invoiceRes.body as any;
        const invoiceId = invoice?.id;

        // Add line items
        for (const item of (input.items as any[])) {
          const itemParams = new URLSearchParams();
          itemParams.set('invoice', invoiceId);
          itemParams.set('description', item.description);
          itemParams.set('amount', String(item.amount));
          itemParams.set('currency', item.currency ?? 'ils');

          await client.request({
            method: 'POST',
            url: '/invoiceitems',
            headers: {
              Authorization: `Basic ${auth}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: itemParams.toString(),
          });
        }

        return {
          invoiceId: invoiceId ?? '',
          invoiceUrl: invoice?.hosted_invoice_url ?? '',
          status: invoice?.status ?? '',
        };
      },
    },
  ];
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 15: WEBHOOK RECEIVER (INBOUND)
// Listens for incoming webhooks from WhatsApp, Stripe, etc.
// ═══════════════════════════════════════════════════════════════════════════

interface WebhookHandler {
  id: string;
  path: string;
  secret?: string;
  handler: (body: unknown, headers: Record<string, string>) => Promise<unknown>;
}

class WebhookReceiver {
  private handlers: Map<string, WebhookHandler> = new Map();
  private server: http.Server | null = null;

  registerHandler(handler: WebhookHandler): void {
    this.handlers.set(handler.path, handler);
  }

  start(port: number = 3200): void {
    this.server = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

      // WhatsApp verification challenge
      if (req.method === 'GET' && url.pathname.startsWith('/webhook/')) {
        const mode = url.searchParams.get('hub.mode');
        const token = url.searchParams.get('hub.verify_token');
        const challenge = url.searchParams.get('hub.challenge');

        if (mode === 'subscribe' && token) {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(challenge);
          return;
        }
      }

      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('Method not allowed');
        return;
      }

      const handler = this.handlers.get(url.pathname);
      if (!handler) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      // Read body
      let rawBody = '';
      for await (const chunk of req) rawBody += chunk;

      // Verify signature if secret is configured
      if (handler.secret) {
        const signature = req.headers['x-hub-signature-256'] as string
          ?? req.headers['x-signature-256'] as string
          ?? req.headers['stripe-signature'] as string;

        if (signature) {
          const expected = `sha256=${crypto
            .createHmac('sha256', handler.secret)
            .update(rawBody)
            .digest('hex')}`;

          if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
            res.writeHead(401);
            res.end('Invalid signature');
            return;
          }
        }
      }

      try {
        const body = rawBody ? JSON.parse(rawBody) : {};
        const headers = Object.fromEntries(
          Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v ?? ''])
        );
        const result = await handler.handler(body, headers);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result ?? { ok: true }));
      } catch (error: any) {
        console.error(`[WebhookReceiver] Error on ${url.pathname}:`, error);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
    });

    this.server.listen(port, () => {
      console.log(`\n📡 Webhook Receiver listening on port ${port}`);
      console.log(`   Registered handlers:`);
      for (const [path, handler] of this.handlers) {
        console.log(`   • ${path} (${handler.id})`);
      }
    });
  }

  stop(): void {
    this.server?.close();
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 16: INTEGRATION REGISTRY — Master Installer
// One function to register ALL integrations into the ONYX Platform.
// ═══════════════════════════════════════════════════════════════════════════

export interface IntegrationConfig {
  // WhatsApp
  whatsapp_token?: string;
  whatsapp_phone_id?: string;
  whatsapp_verify_token?: string;
  whatsapp_app_secret?: string;

  // SMS / Twilio
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_from_number?: string;

  // Gmail / Google
  gmail_access_token?: string;
  google_access_token?: string;
  google_refresh_token?: string;
  google_client_id?: string;
  google_client_secret?: string;

  // Email
  sendgrid_api_key?: string;

  // Telegram
  telegram_bot_token?: string;

  // Slack
  slack_bot_token?: string;

  // AI
  anthropic_api_key?: string;
  openai_api_key?: string;
  perplexity_api_key?: string;

  // Database
  supabase_url?: string;
  supabase_anon_key?: string;
  upstash_redis_url?: string;
  upstash_redis_token?: string;

  // CRM
  hubspot_api_key?: string;

  // Payments
  stripe_secret_key?: string;

  // Webhooks
  n8n_webhook_base?: string;
  make_webhook_base?: string;

  // Master encryption key
  master_key?: string;
}

export class IntegrationRegistry {
  readonly vault: CredentialVault;
  readonly webhookReceiver: WebhookReceiver;
  private allTools: ToolConfig[] = [];

  constructor(config: IntegrationConfig) {
    this.vault = new CredentialVault(config.master_key);
    this.webhookReceiver = new WebhookReceiver();

    // Store all credentials in the vault
    for (const [key, value] of Object.entries(config)) {
      if (value && key !== 'master_key') {
        this.vault.store(key, value);
      }
    }

    // Build all tools
    this.allTools = [
      ...createWhatsAppTools(this.vault),
      ...createSMSTools(this.vault),
      ...createEmailTools(this.vault),
      ...createTelegramTools(this.vault),
      ...createSlackTools(this.vault),
      ...createCalendarTools(this.vault),
      ...createDriveTools(this.vault),
      ...createAITools(this.vault),
      ...createDatabaseTools(this.vault),
      ...createWebhookTools(this.vault),
      ...createHTTPTools(this.vault),
      ...createMonitoringTools(this.vault),
      ...createCRMTools(this.vault),
      ...createPaymentTools(this.vault),
    ];
  }

  /** Register all tools into an ONYX ToolRegistry */
  registerAll(registryAddTool: (tool: ToolConfig) => void): void {
    for (const tool of this.allTools) {
      registryAddTool(tool);
    }
    console.log(`\n✅ Registered ${this.allTools.length} integration tools`);
    this.printToolSummary();
  }

  /** Get tools by category */
  getByCategory(category: string): ToolConfig[] {
    return this.allTools.filter(t => t.category === category || t.id.startsWith(category));
  }

  /** Get a specific tool */
  getTool(id: string): ToolConfig | undefined {
    return this.allTools.find(t => t.id === id);
  }

  /** List all available tools */
  listAll(): Array<{ id: string; name: string; category: string; cost: number; risk: number }> {
    return this.allTools.map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
      cost: t.costPerInvocation,
      risk: t.riskScore,
    }));
  }

  /** Start webhook receiver */
  startWebhookReceiver(port: number = 3200): void {
    // Register WhatsApp webhook handler
    if (this.vault.has('whatsapp_app_secret')) {
      this.webhookReceiver.registerHandler({
        id: 'whatsapp_inbound',
        path: '/webhook/whatsapp',
        secret: this.vault.retrieve('whatsapp_app_secret') ?? undefined,
        handler: async (body, headers) => {
          // Process incoming WhatsApp messages
          const data = body as any;
          const messages = data?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
          return { received: messages.length, processed: true };
        },
      });
    }

    // Register Stripe webhook handler
    if (this.vault.has('stripe_webhook_secret')) {
      this.webhookReceiver.registerHandler({
        id: 'stripe_inbound',
        path: '/webhook/stripe',
        secret: this.vault.retrieve('stripe_webhook_secret') ?? undefined,
        handler: async (body) => {
          const event = body as any;
          return { received: event?.type, id: event?.id };
        },
      });
    }

    // Generic webhook handler (no auth)
    this.webhookReceiver.registerHandler({
      id: 'generic_inbound',
      path: '/webhook/inbound',
      handler: async (body) => {
        return { received: true, timestamp: Date.now() };
      },
    });

    this.webhookReceiver.start(port);
  }

  private printToolSummary(): void {
    const categories: Record<string, number> = {};
    for (const tool of this.allTools) {
      const cat = tool.id.split('.')[0];
      categories[cat] = (categories[cat] ?? 0) + 1;
    }
    console.log('\n📦 Integration Summary:');
    for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
      const icon = {
        whatsapp: '💬', sms: '📱', gmail: '📧', sendgrid: '✉️',
        telegram: '📨', slack: '💼', gcal: '📅', gdrive: '📁',
        ai: '🤖', db: '🗄️', webhook: '🔗', http: '🌐',
        monitor: '📡', crm: '👥', payment: '💳',
      }[cat] ?? '🔧';
      console.log(`   ${icon} ${cat}: ${count} tools`);
    }
    console.log(`\n   Total: ${this.allTools.length} tools ready\n`);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export {
  HttpClient,
  CredentialVault,
  WebhookReceiver,
  createWhatsAppTools,
  createSMSTools,
  createEmailTools,
  createTelegramTools,
  createSlackTools,
  createCalendarTools,
  createDriveTools,
  createAITools,
  createDatabaseTools,
  createWebhookTools,
  createHTTPTools,
  createMonitoringTools,
  createCRMTools,
  createPaymentTools,
};

export type {
  HttpResponse,
  HttpRequestConfig,
  ToolConfig,
  WebhookHandler,
};


/**
 * ═══════════════════════════════════════════════════════════════════════
 * USAGE WITH ONYX PLATFORM:
 * ═══════════════════════════════════════════════════════════════════════
 *
 * import { OnyxPlatform } from './onyx-platform';
 * import { IntegrationRegistry } from './onyx-integrations';
 *
 * const onyx = new OnyxPlatform();
 *
 * const integrations = new IntegrationRegistry({
 *   // WhatsApp
 *   whatsapp_token: process.env.WHATSAPP_TOKEN,
 *   whatsapp_phone_id: process.env.WHATSAPP_PHONE_ID,
 *   whatsapp_app_secret: process.env.WHATSAPP_APP_SECRET,
 *
 *   // SMS
 *   twilio_account_sid: process.env.TWILIO_SID,
 *   twilio_auth_token: process.env.TWILIO_TOKEN,
 *   twilio_from_number: process.env.TWILIO_FROM,
 *
 *   // Gmail
 *   gmail_access_token: process.env.GMAIL_TOKEN,
 *
 *   // Google
 *   google_access_token: process.env.GOOGLE_TOKEN,
 *
 *   // Telegram
 *   telegram_bot_token: process.env.TELEGRAM_BOT_TOKEN,
 *
 *   // Slack
 *   slack_bot_token: process.env.SLACK_BOT_TOKEN,
 *
 *   // AI
 *   anthropic_api_key: process.env.ANTHROPIC_API_KEY,
 *
 *   // Database
 *   supabase_url: process.env.SUPABASE_URL,
 *   supabase_anon_key: process.env.SUPABASE_KEY,
 *
 *   // CRM
 *   hubspot_api_key: process.env.HUBSPOT_KEY,
 *
 *   // Payments
 *   stripe_secret_key: process.env.STRIPE_SECRET,
 *
 *   // Encryption
 *   master_key: process.env.ONYX_MASTER_KEY,
 * });
 *
 * // Register all tools into ONYX
 * integrations.registerAll((tool) => onyx.addTool(tool));
 *
 * // Start webhook receiver (port 3200)
 * integrations.startWebhookReceiver(3200);
 *
 * // Start ONYX (API on port 3100)
 * onyx.start({ apiPort: 3100 });
 *
 * // Now agents can use any tool:
 * // Agent → governor check → rate limit → circuit breaker → tool execution
 *
 * // Example: Agent sends WhatsApp message
 * // onyx.toolRegistry.invoke('whatsapp.send_text', {
 * //   to: '+972501234567',
 * //   message: 'שלום מ-ONYX AI 🤖',
 * // }, { correlationId: 'x', agentId: 'agent_1', taskId: 't1', deadline: Date.now() + 30000 });
 */
