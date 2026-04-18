import { writeFile } from "./fileTool";

interface CacheEntry { value: any; expiresAt?: number; tags?: string[] }
const cache = new Map<string, CacheEntry>();
let hits = 0, misses = 0;

export async function cacheGet(params: { key: string }): Promise<{ success: boolean; output: string }> {
  const entry = cache.get(params.key);
  if (!entry) { misses++; return { success: true, output: `MISS: "${params.key}" not found` }; }
  if (entry.expiresAt && Date.now() > entry.expiresAt) { cache.delete(params.key); misses++; return { success: true, output: `MISS: "${params.key}" expired` }; }
  hits++;
  return { success: true, output: `HIT: ${JSON.stringify(entry.value)}` };
}

export async function cacheSet(params: { key: string; value: any; ttl?: number; tags?: string[] }): Promise<{ success: boolean; output: string }> {
  cache.set(params.key, { value: params.value, expiresAt: params.ttl ? Date.now() + params.ttl * 1000 : undefined, tags: params.tags });
  return { success: true, output: `SET: "${params.key}"${params.ttl ? ` (TTL: ${params.ttl}s)` : ""}` };
}

export async function cacheDelete(params: { key: string }): Promise<{ success: boolean; output: string }> {
  const deleted = cache.delete(params.key);
  return { success: true, output: deleted ? `Deleted "${params.key}"` : `"${params.key}" not found` };
}

export async function cacheInvalidateByTag(params: { tag: string }): Promise<{ success: boolean; output: string }> {
  let count = 0;
  for (const [key, entry] of cache) { if (entry.tags?.includes(params.tag)) { cache.delete(key); count++; } }
  return { success: true, output: `Invalidated ${count} entries with tag "${params.tag}"` };
}

export async function cacheStats(): Promise<{ success: boolean; output: string }> {
  const total = hits + misses;
  return { success: true, output: `Cache Stats:\n  Entries: ${cache.size}\n  Hits: ${hits}\n  Misses: ${misses}\n  Hit Rate: ${total ? Math.round(hits / total * 100) : 0}%` };
}

export async function cacheClear(): Promise<{ success: boolean; output: string }> {
  const count = cache.size; cache.clear(); hits = 0; misses = 0;
  return { success: true, output: `Cleared ${count} cache entries` };
}

export async function generateRedisCache(): Promise<{ success: boolean; output: string }> {
  const { runCommand } = await import("./terminalTool");
  await runCommand({ command: "npm install ioredis", timeout: 30000 });

  const code = `import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export class Cache {
  private prefix: string;
  private defaultTTL: number;

  constructor(prefix = 'app', defaultTTL = 3600) {
    this.prefix = prefix;
    this.defaultTTL = defaultTTL;
  }

  private key(k: string): string {
    return \`\${this.prefix}:\${k}\`;
  }

  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(this.key(key));
    if (!data) return null;
    try { return JSON.parse(data) as T; } catch { return data as any; }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttl || this.defaultTTL) {
      await redis.setex(this.key(key), ttl || this.defaultTTL, serialized);
    } else {
      await redis.set(this.key(key), serialized);
    }
  }

  async del(key: string): Promise<void> {
    await redis.del(this.key(key));
  }

  async exists(key: string): Promise<boolean> {
    return (await redis.exists(this.key(key))) === 1;
  }

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  async invalidatePattern(pattern: string): Promise<number> {
    const keys = await redis.keys(this.key(pattern));
    if (keys.length === 0) return 0;
    return redis.del(...keys);
  }

  async flush(): Promise<void> {
    const keys = await redis.keys(this.key('*'));
    if (keys.length > 0) await redis.del(...keys);
  }

  middleware(ttl?: number) {
    return async (req: any, res: any, next: any) => {
      if (req.method !== 'GET') return next();
      const key = \`route:\${req.originalUrl}\`;
      const cached = await this.get(key);
      if (cached) return res.json(cached);
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        this.set(key, body, ttl || this.defaultTTL).catch(() => {});
        return originalJson(body);
      };
      next();
    };
  }
}

export const cache = new Cache();
export { redis };
`;
  await writeFile({ path: "src/cache/index.ts", content: code });
  return { success: true, output: "Redis Cache class generated → src/cache/index.ts\nFeatures: get, set, del, exists, getOrSet, invalidatePattern, flush, Express middleware\nPackage installed: ioredis" };
}

export const CACHE_TOOLS = [
  { name: "cache_get", description: "Get a value from the in-memory cache", input_schema: { type: "object" as const, properties: { key: { type: "string" } }, required: ["key"] as string[] } },
  { name: "cache_set", description: "Set a value in cache with optional TTL and tags", input_schema: { type: "object" as const, properties: { key: { type: "string" }, value: {}, ttl: { type: "number", description: "TTL in seconds" }, tags: { type: "array", items: { type: "string" } } }, required: ["key", "value"] as string[] } },
  { name: "cache_delete", description: "Delete a cache entry by key", input_schema: { type: "object" as const, properties: { key: { type: "string" } }, required: ["key"] as string[] } },
  { name: "cache_invalidate_by_tag", description: "Invalidate all cache entries with a specific tag", input_schema: { type: "object" as const, properties: { tag: { type: "string" } }, required: ["tag"] as string[] } },
  { name: "cache_stats", description: "Get cache statistics: entries, hits, misses, hit rate", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "cache_clear", description: "Clear all cache entries", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
  { name: "generate_redis_cache", description: "Generate a Redis cache layer with middleware for Express", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];