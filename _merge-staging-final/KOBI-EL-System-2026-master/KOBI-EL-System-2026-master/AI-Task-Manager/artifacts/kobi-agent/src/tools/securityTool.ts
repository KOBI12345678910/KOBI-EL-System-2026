import { writeFile } from "./fileTool";

export async function generateSecurityMiddleware(): Promise<{ success: boolean; output: string }> {
  const { runCommand } = await import("./terminalTool");
  await runCommand({ command: "npm install express-rate-limit helmet cors hpp", timeout: 30000 });

  const BT = "`";
  const code = [
    "import rateLimit from 'express-rate-limit';",
    "import helmet from 'helmet';",
    "import cors from 'cors';",
    "import hpp from 'hpp';",
    "import { Request, Response, NextFunction, Express } from 'express';",
    "",
    "export const globalLimiter = rateLimit({",
    "  windowMs: 15 * 60 * 1000,",
    "  max: 100,",
    "  message: { error: 'Too many requests, please try again later.' },",
    "  standardHeaders: true,",
    "  legacyHeaders: false,",
    "});",
    "",
    "export const authLimiter = rateLimit({",
    "  windowMs: 15 * 60 * 1000,",
    "  max: 10,",
    "  message: { error: 'Too many login attempts.' },",
    "  skipSuccessfulRequests: true,",
    "});",
    "",
    "export const apiLimiter = rateLimit({",
    "  windowMs: 60 * 1000,",
    "  max: 60,",
    "  message: { error: 'API rate limit exceeded.' },",
    "});",
    "",
    "export const uploadLimiter = rateLimit({",
    "  windowMs: 60 * 60 * 1000,",
    "  max: 50,",
    "  message: { error: 'Upload limit exceeded.' },",
    "});",
    "",
    "const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',');",
    "",
    "export const corsOptions: cors.CorsOptions = {",
    "  origin: (origin, callback) => {",
    "    if (!origin || allowedOrigins.includes(origin)) callback(null, true);",
    "    else callback(new Error('Not allowed by CORS'));",
    "  },",
    "  credentials: true,",
    "  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],",
    "  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],",
    "  maxAge: 86400,",
    "};",
    "",
    "export function csrfProtection(req: Request, res: Response, next: NextFunction) {",
    "  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();",
    "  const token = req.headers['x-csrf-token'] || req.body._csrf;",
    "  const sessionToken = (req as any).session?.csrfToken;",
    "  if (!token || token !== sessionToken) return res.status(403).json({ error: 'Invalid CSRF token' });",
    "  next();",
    "}",
    "",
    "export function sanitizeInput(req: Request, res: Response, next: NextFunction) {",
    "  const sanitize = (obj: any): any => {",
    "    if (typeof obj !== 'object' || obj === null) return obj;",
    "    const clean: any = Array.isArray(obj) ? [] : {};",
    "    for (const [key, value] of Object.entries(obj)) {",
    "      const cleanKey = key.replace(/[$.]/, '');",
    "      clean[cleanKey] = typeof value === 'object' ? sanitize(value) : value;",
    "    }",
    "    return clean;",
    "  };",
    "  if (req.body) req.body = sanitize(req.body);",
    "  if (req.query) req.query = sanitize(req.query) as any;",
    "  if (req.params) req.params = sanitize(req.params);",
    "  next();",
    "}",
    "",
    "export function requestLogger(req: Request, res: Response, next: NextFunction) {",
    "  const start = Date.now();",
    "  res.on('finish', () => {",
    "    const duration = Date.now() - start;",
    "    const log = {",
    "      method: req.method, url: req.originalUrl, status: res.statusCode,",
    "      duration: duration + 'ms', ip: req.ip,",
    "      userAgent: req.get('user-agent')?.slice(0, 50),",
    "    };",
    "    if (res.statusCode >= 400) console.error('[HTTP]', JSON.stringify(log));",
    "    else console.log('[HTTP]', JSON.stringify(log));",
    "  });",
    "  next();",
    "}",
    "",
    "export function applySecurityMiddleware(app: Express) {",
    "  app.use(helmet({",
    "    contentSecurityPolicy: {",
    "      directives: {",
    "        defaultSrc: [\"'self'\"],",
    "        styleSrc: [\"'self'\", \"'unsafe-inline'\"],",
    "        scriptSrc: [\"'self'\"],",
    "        imgSrc: [\"'self'\", 'data:', 'https:'],",
    "      },",
    "    },",
    "    crossOriginEmbedderPolicy: false,",
    "  }));",
    "  app.use(cors(corsOptions));",
    "  app.use(hpp());",
    "  app.use(sanitizeInput);",
    "  app.use(requestLogger);",
    "  app.use('/api/', globalLimiter);",
    "  app.use('/api/auth/', authLimiter);",
    "  app.use('/api/upload/', uploadLimiter);",
    "  app.set('trust proxy', 1);",
    "  console.log('Security middleware applied');",
    "}",
  ].join("\n");
  await writeFile({ path: "src/middleware/security.ts", content: code });
  return { success: true, output: "Security middleware generated → src/middleware/security.ts\nFeatures: rate limiting (global/auth/api/upload), helmet, CORS, HPP, CSRF protection, input sanitization, request logger\nPackages: express-rate-limit, helmet, cors, hpp" };
}

export async function generateHelmetConfig(params?: { csp?: boolean; hsts?: boolean }): Promise<{ success: boolean; output: string }> {
  const csp = params?.csp !== false;
  const hsts = params?.hsts !== false;
  const code = [
    "import helmet from 'helmet';",
    "",
    "export const helmetConfig = helmet({",
    ...(csp ? [
      "  contentSecurityPolicy: {",
      "    directives: {",
      "      defaultSrc: [\"'self'\"],",
      "      styleSrc: [\"'self'\", \"'unsafe-inline'\"],",
      "      scriptSrc: [\"'self'\"],",
      "      imgSrc: [\"'self'\", 'data:', 'https:'],",
      "      connectSrc: [\"'self'\", 'wss:', 'https:'],",
      "      fontSrc: [\"'self'\", 'https:', 'data:'],",
      "      objectSrc: [\"'none'\"],",
      "      mediaSrc: [\"'self'\"],",
      "      frameSrc: [\"'none'\"],",
      "    },",
      "  },",
    ] : ["  contentSecurityPolicy: false,"]),
    ...(hsts ? [
      "  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },",
    ] : []),
    "  crossOriginEmbedderPolicy: false,",
    "  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },",
    "});",
  ].join("\n");
  await writeFile({ path: "src/middleware/helmet.ts", content: code });
  return { success: true, output: "Helmet config generated → src/middleware/helmet.ts\nCSP: " + (csp ? "enabled" : "disabled") + ", HSTS: " + (hsts ? "enabled" : "disabled") };
}

export async function generateCorsConfig(params?: { origins?: string }): Promise<{ success: boolean; output: string }> {
  const origins = params?.origins || "http://localhost:3000";
  const code = [
    "import cors from 'cors';",
    "",
    "const allowedOrigins = (process.env.CORS_ORIGINS || '" + origins + "').split(',');",
    "",
    "export const corsConfig = cors({",
    "  origin: (origin, callback) => {",
    "    if (!origin || allowedOrigins.includes(origin)) callback(null, true);",
    "    else callback(new Error('Not allowed by CORS'));",
    "  },",
    "  credentials: true,",
    "  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],",
    "  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],",
    "  exposedHeaders: ['X-Total-Count', 'X-Page-Count'],",
    "  maxAge: 86400,",
    "});",
  ].join("\n");
  await writeFile({ path: "src/middleware/cors.ts", content: code });
  return { success: true, output: "CORS config generated → src/middleware/cors.ts\nOrigins: " + origins };
}

export async function generateInputSanitizer(): Promise<{ success: boolean; output: string }> {
  const code = [
    "import { Request, Response, NextFunction } from 'express';",
    "",
    "export function sanitizeInput(req: Request, _res: Response, next: NextFunction) {",
    "  const sanitize = (obj: any): any => {",
    "    if (typeof obj !== 'object' || obj === null) return obj;",
    "    const clean: any = Array.isArray(obj) ? [] : {};",
    "    for (const [key, value] of Object.entries(obj)) {",
    "      const cleanKey = key.replace(/[$.]/g, '');",
    "      if (typeof value === 'string') {",
    "        clean[cleanKey] = value.replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, '').replace(/on\\w+\\s*=/gi, '');",
    "      } else if (typeof value === 'object') {",
    "        clean[cleanKey] = sanitize(value);",
    "      } else {",
    "        clean[cleanKey] = value;",
    "      }",
    "    }",
    "    return clean;",
    "  };",
    "  if (req.body) req.body = sanitize(req.body);",
    "  if (req.query) req.query = sanitize(req.query) as any;",
    "  next();",
    "}",
    "",
    "export function validateContentType(req: Request, res: Response, next: NextFunction) {",
    "  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json') && !req.is('multipart/form-data')) {",
    "    return res.status(415).json({ error: 'Unsupported content type' });",
    "  }",
    "  next();",
    "}",
  ].join("\n");
  await writeFile({ path: "src/middleware/sanitizer.ts", content: code });
  return { success: true, output: "Input sanitizer generated → src/middleware/sanitizer.ts\nFeatures: NoSQL injection prevention, XSS sanitization, content-type validation" };
}

export async function generateRequestLogger(): Promise<{ success: boolean; output: string }> {
  const BT = "`";
  const code = [
    "import { Request, Response, NextFunction } from 'express';",
    "",
    "export function requestLogger(req: Request, res: Response, next: NextFunction) {",
    "  const start = Date.now();",
    "  res.on('finish', () => {",
    "    const duration = Date.now() - start;",
    "    const log = {",
    "      timestamp: new Date().toISOString(),",
    "      method: req.method,",
    "      url: req.originalUrl,",
    "      status: res.statusCode,",
    "      duration: duration + 'ms',",
    "      ip: req.ip,",
    "      userAgent: req.get('user-agent')?.slice(0, 80),",
    "      contentLength: res.get('content-length'),",
    "    };",
    "    if (res.statusCode >= 500) console.error('[HTTP 5xx]', JSON.stringify(log));",
    "    else if (res.statusCode >= 400) console.warn('[HTTP 4xx]', JSON.stringify(log));",
    "    else console.log('[HTTP]', JSON.stringify(log));",
    "  });",
    "  next();",
    "}",
  ].join("\n");
  await writeFile({ path: "src/middleware/logger.ts", content: code });
  return { success: true, output: "Request logger generated → src/middleware/logger.ts\nFeatures: method, URL, status, duration, IP, user-agent, content-length, color-coded by status" };
}

export const SECURITY_TOOLS = [
  { name: "generate_security_middleware", description: "Generate full security middleware: rate limiting (global/auth/api/upload), helmet, CORS, HPP, CSRF, input sanitization, request logger", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_helmet_config", description: "Generate Helmet security headers config with CSP and HSTS", input_schema: { type: "object" as const, properties: { csp: { type: "boolean", description: "Enable Content Security Policy (default true)" }, hsts: { type: "boolean", description: "Enable HSTS (default true)" } }, required: [] as string[] } },
  { name: "generate_cors_config", description: "Generate CORS configuration with allowed origins", input_schema: { type: "object" as const, properties: { origins: { type: "string", description: "Comma-separated allowed origins" } }, required: [] as string[] } },
  { name: "generate_input_sanitizer", description: "Generate input sanitization middleware: NoSQL injection prevention, XSS, content-type validation", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_request_logger", description: "Generate HTTP request logger middleware with duration, status codes, IP tracking", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];
