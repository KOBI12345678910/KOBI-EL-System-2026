"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheMiddleware = cacheMiddleware;
exports.invalidateCache = invalidateCache;
// In-memory cache (בפרודקשן — Redis)
const cache = new Map();
function cacheMiddleware(ttlSeconds = 30) {
    return (req, res, next) => {
        if (req.method !== 'GET')
            return next();
        const key = `${req.originalUrl}`;
        const cached = cache.get(key);
        if (cached && cached.expires > Date.now()) {
            res.set('X-Cache', 'HIT');
            return res.json(cached.data);
        }
        const originalJson = res.json.bind(res);
        res.json = (data) => {
            cache.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
            res.set('X-Cache', 'MISS');
            return originalJson(data);
        };
        next();
    };
}
function invalidateCache(pattern) {
    cache.forEach((_, key) => {
        if (key.includes(pattern))
            cache.delete(key);
    });
}
