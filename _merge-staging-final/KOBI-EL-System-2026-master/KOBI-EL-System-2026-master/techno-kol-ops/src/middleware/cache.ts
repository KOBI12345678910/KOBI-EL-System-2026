import { Request, Response, NextFunction } from 'express';

// In-memory cache (בפרודקשן — Redis)
const cache = new Map<string, { data: any; expires: number }>();

export function cacheMiddleware(ttlSeconds: number = 30) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') return next();

    const key = `${req.originalUrl}`;
    const cached = cache.get(key);

    if (cached && cached.expires > Date.now()) {
      res.set('X-Cache', 'HIT');
      return res.json(cached.data);
    }

    const originalJson = res.json.bind(res);
    res.json = (data: any) => {
      cache.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
      res.set('X-Cache', 'MISS');
      return originalJson(data);
    };

    next();
  };
}

export function invalidateCache(pattern: string) {
  cache.forEach((_, key) => {
    if (key.includes(pattern)) cache.delete(key);
  });
}
