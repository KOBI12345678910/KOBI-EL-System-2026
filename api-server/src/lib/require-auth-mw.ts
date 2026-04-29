// SEC-AUTH: shared session-validating middleware (P1 fix). Mirrors the inline
// requireAuth pattern used across api-server routes (e.g. ap-enterprise,
// ar-enterprise, agent-orchestration) but exported so additional route files
// can adopt auth without duplicating the helper. Returns 401 on missing/invalid
// session, attaches the validated user to req.user, then calls next().
import { Request, Response, NextFunction } from "express";
import { validateSession } from "./auth";

export async function requireAuthMw(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.substring(7) : (req.query.token as string) || null;
  if (!token) { res.status(401).json({ error: "נדרשת התחברות" }); return; }
  const result = await validateSession(token);
  if (result.error || !result.user) { res.status(401).json({ error: "הסשן פג תוקף" }); return; }
  (req as any).user = result.user;
  next();
}
