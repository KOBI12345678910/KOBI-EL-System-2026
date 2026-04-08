import { writeFile } from "./fileTool";

interface RateLimitConfig { windowMs: number; maxRequests: number; key: string }
interface RateLimitEntry { count: number; resetAt: number }

const limiters = new Map<string, RateLimitConfig>();
const entries = new Map<string, RateLimitEntry>();

export async function createRateLimiter(params: { name: string; windowMs?: number; maxRequests?: number; key?: string }): Promise<{ success: boolean; output: string }> {
  const config: RateLimitConfig = { windowMs: params.windowMs || 60000, maxRequests: params.maxRequests || 100, key: params.key || "ip" };
  limiters.set(params.name, config);
  return { success: true, output: `Rate limiter "${params.name}": ${config.maxRequests} requests per ${config.windowMs / 1000}s` };
}

export async function checkRateLimit(params: { limiter: string; identifier: string }): Promise<{ success: boolean; output: string }> {
  const config = limiters.get(params.limiter);
  if (!config) return { success: false, output: `Limiter "${params.limiter}" not found` };

  const key = `${params.limiter}:${params.identifier}`;
  const now = Date.now();
  let entry = entries.get(key);
  if (!entry || now > entry.resetAt) { entry = { count: 0, resetAt: now + config.windowMs }; entries.set(key, entry); }

  entry.count++;
  const remaining = Math.max(0, config.maxRequests - entry.count);
  const allowed = entry.count <= config.maxRequests;
  return { success: true, output: `${allowed ? "ALLOWED" : "BLOCKED"} | Remaining: ${remaining} | Resets: ${new Date(entry.resetAt).toISOString()}` };
}

export async function getRateLimitStatus(params: { limiter?: string }): Promise<{ success: boolean; output: string }> {
  if (params.limiter) {
    const config = limiters.get(params.limiter);
    if (!config) return { success: false, output: `Limiter "${params.limiter}" not found` };
    const active = Array.from(entries.entries()).filter(([k]) => k.startsWith(`${params.limiter}:`));
    return { success: true, output: `Limiter "${params.limiter}": ${config.maxRequests}/${config.windowMs / 1000}s\nActive entries: ${active.length}` };
  }
  return { success: true, output: Array.from(limiters.entries()).map(([n, c]) => `${n}: ${c.maxRequests}/${c.windowMs / 1000}s`).join("\n") || "No rate limiters" };
}

export async function resetRateLimit(params: { limiter: string; identifier?: string }): Promise<{ success: boolean; output: string }> {
  if (params.identifier) { entries.delete(`${params.limiter}:${params.identifier}`); return { success: true, output: `Reset limit for ${params.identifier}` }; }
  let count = 0;
  for (const key of entries.keys()) { if (key.startsWith(`${params.limiter}:`)) { entries.delete(key); count++; } }
  return { success: true, output: `Reset ${count} entries for "${params.limiter}"` };
}

export async function generateRateLimitMiddleware(): Promise<{ success: boolean; output: string }> {
  const code = `import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: { error: 'Too many requests', retryAfter: 60 }, standardHeaders: true, legacyHeaders: false });
export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Too many login attempts', retryAfter: 900 } });
export const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 10 });

export function customLimiter(windowMs: number, max: number) {
  return rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false });
}
`;
  await writeFile({ path: "src/middleware/rateLimit.ts", content: code });
  return { success: true, output: "Rate limit middleware generated → src/middleware/rateLimit.ts" };
}

export const RATE_LIMIT_TOOLS = [
  { name: "create_rate_limiter", description: "Create a rate limiter with window and max requests", input_schema: { type: "object" as const, properties: { name: { type: "string" }, windowMs: { type: "number", description: "Window in ms (default 60000)" }, maxRequests: { type: "number", description: "Max requests per window (default 100)" }, key: { type: "string", description: "Key field: ip, userId, apiKey" } }, required: ["name"] as string[] } },
  { name: "check_rate_limit", description: "Check if a request is allowed or rate-limited", input_schema: { type: "object" as const, properties: { limiter: { type: "string" }, identifier: { type: "string" } }, required: ["limiter", "identifier"] as string[] } },
  { name: "get_rate_limit_status", description: "Get rate limiter configuration and active entries", input_schema: { type: "object" as const, properties: { limiter: { type: "string" } }, required: [] as string[] } },
  { name: "reset_rate_limit", description: "Reset rate limit for a specific identifier or all entries", input_schema: { type: "object" as const, properties: { limiter: { type: "string" }, identifier: { type: "string" } }, required: ["limiter"] as string[] } },
  { name: "generate_rate_limit_middleware", description: "Generate Express rate-limiting middleware code", input_schema: { type: "object" as const, properties: {}, required: [] as string[] } },
];