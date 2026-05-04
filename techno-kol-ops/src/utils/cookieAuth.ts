import { Response } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-change-me';
const COOKIE_NAME = 'tk_token';
const isProduction = process.env.NODE_ENV === 'production';

export function setAuthCookie(res: Response, userId: string, username: string, role: string) {
 const token = jwt.sign({ id: userId, username, role }, JWT_SECRET, { algorithm: 'HS256', expiresIn: '4h' });
 res.cookie(COOKIE_NAME, token, { httpOnly: true, secure: isProduction, sameSite: 'strict', maxAge: 4 * 60 * 60 * 1000, path: '/' });
 return token;
}

export function clearAuthCookie(res: Response) { res.clearCookie(COOKIE_NAME, { path: '/' }); }
export function setAuthCookieWithFallback(res: Response, userId: string, username: string, role: string) {
 const token = setAuthCookie(res, userId, username, role);
 return { token, method: 'cookie+header' };
}
