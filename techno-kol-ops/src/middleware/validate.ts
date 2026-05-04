import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';

/**
 * Zod-based input validation middleware (Agent 4 fix)
 * Validates req.body, req.query, req.params against provided schema
 */
export const validate = (schema: AnyZodObject) =>
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
          try {
                  await schema.parseAsync({
                            body: req.body,
                            query: req.query,
                            params: req.params,
                  });
                  next();
          } catch (err) {
                  if (err instanceof ZodError) {
                            res.status(400).json({
                                        error: 'Validation failed',
                                        details: err.errors.map((e) => ({
                                                      field: e.path.join('.'),
                                                      message: e.message,
                                        })),
                            });
                            return;
                  }
                  next(err);
          }
    };

/**
 * Sanitize string — strip HTML/script tags to prevent XSS
 */
export const sanitizeString = (value: string): string =>
    value.replace(/<[^>]*>/g, '').trim();

/**
 * requireRole middleware — restrict route to specific roles
 * Usage: router.use(requireRole(['admin', 'manager']))
 */
export const requireRole = (allowedRoles: string[]) =>
    (req: any, res: Response, next: NextFunction): void => {
          const userRole = req.user?.role;
          if (!userRole || !allowedRoles.includes(userRole)) {
                  res.status(403).json({ error: 'Forbidden: insufficient permissions' });
                  return;
          }
          next();
    };
