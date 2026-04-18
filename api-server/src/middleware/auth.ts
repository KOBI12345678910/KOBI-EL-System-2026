// I-01 & I-02: JWT Authentication Middleware
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

if (!process.env.JWT_SECRET) {
  console.error("[FATAL] JWT_SECRET environment variable is not set. Server cannot start without it.");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;
const TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      username?: string;
      isSuperAdmin?: boolean;
    }
  }
}

// Generate JWT token
export function generateToken(userId: number, username: string, isSuperAdmin: boolean = false): string {
  return jwt.sign(
    { userId, username, isSuperAdmin },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

// Generate refresh token (longer expiry)
export function generateRefreshToken(userId: number, username: string): string {
  return jwt.sign(
    { userId, username, type: "refresh" },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

// JWT Verification Middleware (I-01: All routes protected)
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const token = extractToken(req);
    
    if (!token) {
      res.status(401).json({ error: "אין טוקן הרשאה" });
      return;
    }
    
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.userId = decoded.userId;
    req.username = decoded.username;
    req.isSuperAdmin = decoded.isSuperAdmin || false;
    
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      res.status(401).json({ error: "טוקן פג תוקף" });
    } else {
      res.status(403).json({ error: "טוקן לא תקין" });
    }
  }
}

// Extract token from request (I-02: httpOnly cookies priority)
function extractToken(req: Request): string | null {
  // Priority 1: httpOnly cookie (secure)
  if (req.cookies?.accessToken) {
    return req.cookies.accessToken;
  }
  
  // Priority 2: Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  
  // Priority 3: Query param token (for SSE EventSource which cannot send headers)
  if (req.query?.token && typeof req.query.token === "string") {
    return req.query.token;
  }
  
  return null;
}

// Refresh token endpoint
export async function refreshTokenHandler(req: Request, res: Response): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
    
    if (!refreshToken) {
      res.status(401).json({ error: "אין טוקן רענון" });
      return;
    }
    
    const decoded = jwt.verify(refreshToken, JWT_SECRET) as any;
    
    if (decoded.type !== "refresh") {
      res.status(403).json({ error: "טוקן רענון לא תקין" });
      return;
    }
    
    const newAccessToken = generateToken(decoded.userId, decoded.username, false);
    
    // Set as httpOnly cookie (I-02: secure)
    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
    
    res.json({ success: true, accessToken: newAccessToken });
  } catch (err) {
    res.status(403).json({ error: "רענון טוקן נכשל" });
  }
}

// Admin-only middleware
export function adminMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.isSuperAdmin) {
    res.status(403).json({ error: "אין הרשאה - דרוש גישה מנהל" });
    return;
  }
  next();
}
