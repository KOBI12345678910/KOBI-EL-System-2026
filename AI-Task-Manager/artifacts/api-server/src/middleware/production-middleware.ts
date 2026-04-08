import { Router, Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";

// === סניטציה - מניעת SQL Injection ===
// פונקציה שמנקה כל input מ-SQL injection
export function sanitizeInput(value: any): any {
  if (typeof value === 'string') {
    // הסר תווים מסוכנים
    return value
      .replace(/'/g, "''")  // escape single quotes
      .replace(/;/g, '')    // remove semicolons
      .replace(/--/g, '')   // remove SQL comments
      .replace(/\/\*/g, '') // remove block comments
      .replace(/\*\//g, '')
      .replace(/xp_/gi, '') // remove extended procedures
      .replace(/UNION\s+SELECT/gi, '') // remove UNION attacks
      .replace(/DROP\s+TABLE/gi, '')
      .replace(/DELETE\s+FROM/gi, '')
      .replace(/INSERT\s+INTO/gi, '')
      .replace(/UPDATE\s+.*SET/gi, '')
      .trim();
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeInput);
  if (typeof value === 'object') {
    const clean: any = {};
    for (const [k, v] of Object.entries(value)) {
      clean[sanitizeInput(k)] = sanitizeInput(v);
    }
    return clean;
  }
  return value;
}

// Middleware שמנקה את כל הבקשות הנכנסות
export function sanitizationMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.body) req.body = sanitizeInput(req.body);
  if (req.query) req.query = sanitizeInput(req.query) as any;
  if (req.params) req.params = sanitizeInput(req.params) as any;
  next();
}

// === אימות ולידציה ===
export interface ValidationRule {
  field: string;
  type: 'string' | 'number' | 'email' | 'phone' | 'date' | 'boolean' | 'array' | 'object';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  customMessage?: string;
  customMessageHe?: string;
}

export interface ValidationError {
  field: string;
  message: string;
  message_he: string;
  code: string;
}

export function validate(rules: ValidationRule[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: ValidationError[] = [];
    const data = { ...req.body, ...req.params, ...req.query };

    for (const rule of rules) {
      const value = data[rule.field];

      // בדיקת שדות חובה
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: rule.field,
          message: rule.customMessage || `${rule.field} is required`,
          message_he: rule.customMessageHe || `השדה ${rule.field} הוא שדה חובה`,
          code: 'REQUIRED_FIELD'
        });
        continue;
      }

      if (value === undefined || value === null || value === '') continue;

      // בדיקת סוג
      switch (rule.type) {
        case 'string':
          if (typeof value !== 'string') {
            errors.push({ field: rule.field, message: `${rule.field} must be a string`, message_he: `השדה ${rule.field} חייב להיות טקסט`, code: 'INVALID_TYPE' });
          } else {
            if (rule.minLength && value.length < rule.minLength) {
              errors.push({ field: rule.field, message: `${rule.field} must be at least ${rule.minLength} characters`, message_he: `השדה ${rule.field} חייב להכיל לפחות ${rule.minLength} תווים`, code: 'MIN_LENGTH' });
            }
            if (rule.maxLength && value.length > rule.maxLength) {
              errors.push({ field: rule.field, message: `${rule.field} must be at most ${rule.maxLength} characters`, message_he: `השדה ${rule.field} חייב להכיל לכל היותר ${rule.maxLength} תווים`, code: 'MAX_LENGTH' });
            }
          }
          break;
        case 'number':
          const num = Number(value);
          if (isNaN(num)) {
            errors.push({ field: rule.field, message: `${rule.field} must be a number`, message_he: `השדה ${rule.field} חייב להיות מספר`, code: 'INVALID_NUMBER' });
          } else {
            if (rule.min !== undefined && num < rule.min) {
              errors.push({ field: rule.field, message: `${rule.field} must be at least ${rule.min}`, message_he: `השדה ${rule.field} חייב להיות לפחות ${rule.min}`, code: 'MIN_VALUE' });
            }
            if (rule.max !== undefined && num > rule.max) {
              errors.push({ field: rule.field, message: `${rule.field} must be at most ${rule.max}`, message_he: `השדה ${rule.field} חייב להיות לכל היותר ${rule.max}`, code: 'MAX_VALUE' });
            }
          }
          break;
        case 'email':
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
            errors.push({ field: rule.field, message: `${rule.field} must be a valid email`, message_he: `השדה ${rule.field} חייב להיות כתובת אימייל תקינה`, code: 'INVALID_EMAIL' });
          }
          break;
        case 'phone':
          if (!/^[\d\+\-\(\)\s]{7,20}$/.test(String(value))) {
            errors.push({ field: rule.field, message: `${rule.field} must be a valid phone number`, message_he: `השדה ${rule.field} חייב להיות מספר טלפון תקין`, code: 'INVALID_PHONE' });
          }
          break;
        case 'date':
          if (isNaN(Date.parse(String(value)))) {
            errors.push({ field: rule.field, message: `${rule.field} must be a valid date`, message_he: `השדה ${rule.field} חייב להיות תאריך תקין`, code: 'INVALID_DATE' });
          }
          break;
      }

      if (rule.pattern && !rule.pattern.test(String(value))) {
        errors.push({ field: rule.field, message: `${rule.field} format is invalid`, message_he: `הפורמט של השדה ${rule.field} אינו תקין`, code: 'INVALID_FORMAT' });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        error_he: 'שגיאת ולידציה',
        code: 'VALIDATION_ERROR',
        errors
      });
    }
    next();
  };
}

// === Rate Limiting פשוט ===
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(options: { windowMs?: number; max?: number } = {}) {
  const windowMs = options.windowMs || 60000; // 1 minute default
  const max = options.max || 100; // 100 requests per window

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (!record || now > record.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= max) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests',
        error_he: 'יותר מדי בקשות - נסה שוב בעוד דקה',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((record.resetAt - now) / 1000)
      });
    }

    record.count++;
    next();
  };
}

// === Audit Log ===
export async function auditLog(options: {
  userId?: number | string;
  userName?: string;
  action: string;
  entity: string;
  entityId?: number | string;
  details?: any;
  ipAddress?: string;
}) {
  try {
    await pool.query(
      `INSERT INTO audit_log_master (user_id, user_name, action, entity, entity_id, details, ip_address, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [options.userId || 0, options.userName || 'system', options.action, options.entity, options.entityId || null, JSON.stringify(options.details || {}), options.ipAddress || '']
    );
  } catch (err) {
    console.error('[AUDIT LOG ERROR]', err);
  }
}

// Middleware אוטומטי שרושם כל פעולת כתיבה
export function auditMiddleware(entity: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const originalJson = res.json.bind(res);
      res.json = function(data: any) {
        auditLog({
          action: req.method,
          entity,
          entityId: req.params.id,
          details: { path: req.path, body: req.body },
          ipAddress: req.ip
        });
        return originalJson(data);
      };
    }
    next();
  };
}

// === RBAC - Role Based Access Control ===
export interface Permission {
  module: string;
  action: 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export' | 'admin';
}

const rolePermissions: Record<string, Permission[]> = {
  super_admin: [{ module: '*', action: 'admin' }],
  admin: [
    { module: '*', action: 'view' },
    { module: '*', action: 'create' },
    { module: '*', action: 'edit' },
    { module: '*', action: 'approve' },
    { module: '*', action: 'export' },
  ],
  manager: [
    { module: '*', action: 'view' },
    { module: '*', action: 'create' },
    { module: '*', action: 'edit' },
    { module: '*', action: 'export' },
  ],
  sales_agent: [
    { module: 'crm', action: 'view' },
    { module: 'crm', action: 'create' },
    { module: 'crm', action: 'edit' },
    { module: 'leads', action: 'view' },
    { module: 'leads', action: 'create' },
    { module: 'leads', action: 'edit' },
    { module: 'quotes', action: 'view' },
    { module: 'quotes', action: 'create' },
    { module: 'calendar', action: 'view' },
    { module: 'calendar', action: 'create' },
  ],
  production_worker: [
    { module: 'production', action: 'view' },
    { module: 'production', action: 'edit' },
    { module: 'inventory', action: 'view' },
  ],
  accountant: [
    { module: 'finance', action: 'view' },
    { module: 'finance', action: 'create' },
    { module: 'finance', action: 'edit' },
    { module: 'finance', action: 'export' },
    { module: 'reports', action: 'view' },
    { module: 'reports', action: 'export' },
  ],
  installer: [
    { module: 'installations', action: 'view' },
    { module: 'installations', action: 'edit' },
    { module: 'projects', action: 'view' },
  ],
  viewer: [
    { module: '*', action: 'view' },
  ],
};

const ACTION_TO_MODULE_FLAG: Record<Permission['action'], (p: { view: boolean; manage: boolean; create?: boolean; edit?: boolean; delete?: boolean; approve?: boolean; export?: boolean; admin?: boolean }) => boolean> = {
  view:    (p) => !!(p.manage || p.view),
  create:  (p) => !!(p.manage || p.create),
  edit:    (p) => !!(p.manage || p.edit),
  delete:  (p) => !!(p.manage || p.delete),
  approve: (p) => !!(p.manage),
  export:  (p) => !!(p.manage || (p as any).export),
  admin:   (p) => !!(p.manage),
};

export function requirePermission(module: string, action: Permission['action']) {
  return (req: Request, res: Response, next: NextFunction) => {
    const permissions = (req as any).permissions;

    if (!permissions) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        error_he: 'אין לך הרשאה לבצע פעולה זו',
        code: 'ACCESS_DENIED',
        required: { module, action }
      });
    }

    if (permissions.isSuperAdmin) {
      return next();
    }

    const modulePerm = permissions.modules[module];
    if (!modulePerm) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        error_he: 'אין לך הרשאה לבצע פעולה זו',
        code: 'ACCESS_DENIED',
        required: { module, action }
      });
    }

    const checker = ACTION_TO_MODULE_FLAG[action];
    const hasPermission = checker ? checker(modulePerm as any) : false;

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        error_he: 'אין לך הרשאה לבצע פעולה זו',
        code: 'ACCESS_DENIED',
        required: { module, action }
      });
    }

    next();
  };
}

// === Error Handler מרכזי ===
export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  code_he?: string;
}

export function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction) {
  console.error('[ERROR]', {
    message: err.message,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  const statusCode = err.statusCode || 500;
  const errorCodes: Record<number, { en: string; he: string }> = {
    400: { en: 'Bad Request', he: 'בקשה לא תקינה' },
    401: { en: 'Unauthorized', he: 'לא מורשה - נדרשת התחברות' },
    403: { en: 'Forbidden', he: 'אין הרשאה לבצע פעולה זו' },
    404: { en: 'Not Found', he: 'הפריט לא נמצא' },
    409: { en: 'Conflict', he: 'התנגשות נתונים - הפריט כבר קיים' },
    422: { en: 'Unprocessable Entity', he: 'הנתונים לא תקינים' },
    429: { en: 'Too Many Requests', he: 'יותר מדי בקשות - נסה שוב מאוחר יותר' },
    500: { en: 'Internal Server Error', he: 'שגיאת שרת פנימית' },
    502: { en: 'Bad Gateway', he: 'שגיאת תקשורת' },
    503: { en: 'Service Unavailable', he: 'השירות אינו זמין כרגע' },
  };

  const errorInfo = errorCodes[statusCode] || errorCodes[500];

  res.status(statusCode).json({
    success: false,
    error: err.message || errorInfo.en,
    error_he: err.code_he || errorInfo.he,
    code: err.code || 'INTERNAL_ERROR',
    statusCode,
    timestamp: new Date().toISOString(),
    path: req.path,
    ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {})
  });
}

// === Health Check ===
export async function healthCheck(req: Request, res: Response) {
  try {
    const dbResult = await pool.query('SELECT NOW() as time, current_database() as db');
    const memUsage = process.memoryUsage();

    res.json({
      status: 'healthy',
      status_he: 'תקין',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: true,
        name: dbResult.rows[0]?.db,
        time: dbResult.rows[0]?.time
      },
      memory: {
        rss_mb: Math.round(memUsage.rss / 1024 / 1024),
        heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024)
      },
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      status_he: 'לא תקין',
      error: 'Database connection failed',
      error_he: 'חיבור למסד נתונים נכשל'
    });
  }
}

// === Async Handler Wrapper ===
// עוטף route handlers ב-try/catch אוטומטי
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// === Response Helpers ===
export function successResponse(res: Response, data: any, message?: string, messageHe?: string) {
  return res.json({
    success: true,
    message: message || 'Operation completed successfully',
    message_he: messageHe || 'הפעולה הושלמה בהצלחה',
    data,
    timestamp: new Date().toISOString()
  });
}

export function paginatedResponse(res: Response, data: any[], total: number, page: number, limit: number) {
  return res.json({
    success: true,
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    },
    timestamp: new Date().toISOString()
  });
}

export default {
  sanitizeInput,
  sanitizationMiddleware,
  validate,
  rateLimit,
  auditLog,
  auditMiddleware,
  requirePermission,
  errorHandler,
  healthCheck,
  asyncHandler,
  successResponse,
  paginatedResponse
};
