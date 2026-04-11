import { Request, Response, NextFunction } from 'express';
import { query } from '../db/connection';

// AUDIT LOG — כל פעולה נרשמת
export async function auditLog(
  userId: string,
  action: string,
  resource: string,
  resourceId: string,
  before?: any,
  after?: any
) {
  try {
    await query(`
      INSERT INTO audit_logs (user_id, action, resource, resource_id, before_data, after_data, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `, [userId, action, resource, resourceId,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null]);
  } catch {}
}

// RATE LIMITER — מניעת spam
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimiter(maxRequests: number = 100, windowMs: number = 60000) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const entry = requestCounts.get(key);

    if (!entry || entry.resetAt < now) {
      requestCounts.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= maxRequests) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    entry.count++;
    next();
  };
}

// AUDIT LOG TABLE
export const AUDIT_LOG_SCHEMA = `
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID,
  action VARCHAR(50) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  resource_id VARCHAR(100),
  before_data JSONB,
  after_data JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs(resource, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
`;
