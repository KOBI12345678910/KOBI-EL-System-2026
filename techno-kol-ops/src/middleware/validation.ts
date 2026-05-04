import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>) {
 return (req: Request, res: Response, next: NextFunction) => {
 try { req.body = schema.parse(req.body); next(); }
 catch (err) {
 if (err instanceof ZodError) { const issues = err.issues.map(i => `${i.path.join('.')}: ${i.message}`); return res.status(400).json({ error: 'Validation failed', issues }); }
 return res.status(400).json({ error: 'Invalid request body' });
 }
 };
}
