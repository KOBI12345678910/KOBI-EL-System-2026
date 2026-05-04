import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';

export interface AuthenticatedRequest extends Request {
 user?: { id: string; username: string; role: string };
}

export type AuthRequest = AuthenticatedRequest;

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
 const token = req.cookies?.tk_token || req.headers.authorization?.replace('Bearer ', '');
 if (!token) return res.status(401).json({ error: 'Unauthorized — no token provided' });
 try {
 const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;
 req.user = { id: decoded.id, username: decoded.username, role: decoded.role };
 next();
 } catch (err) {
 return res.status(401).json({ error: 'Unauthorized — invalid token' });
 }
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
 if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Forbidden — admin only' });
 next();
}

export function authorizeRole(allowedRoles: string[]) {
 return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
 if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
 if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden — insufficient permissions', required: allowedRoles, current: req.user.role });
 next();
 };
}

export function authorizePermission(resource: string, action: string) {
 return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
 if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
 if (req.user.role === 'admin') return next();
 try {
 const { query } = await import('../db/connection');
 const result = await query('SELECT 1 FROM governance.role_permission_mapping WHERE role_name = $1 AND resource = $2 AND action = $3', [req.user.role, resource, action]);
 if (result.rows.length === 0) return res.status(403).json({ error: 'Forbidden — permission denied', resource, action, role: req.user.role });
 next();
 } catch (err) { console.error('Permission check failed:', err); return res.status(500).json({ error: 'Permission check failed' }); }
 };
}
