/**
 * Dynamic DB-driven rate limiter.
 *
 * Loads per-endpoint rules from `security_rate_limit_config` (TTL-cached),
 * then applies an in-memory sliding-window counter.
 *
 * This middleware must be placed AFTER auth middleware (apiKeyAuthMiddleware,
 * attachPermissions) so that req.userId and req.apiKeyId are available for
 * per_user and per_api_key scoping.
 *
 * Scopes:
 *  - per_ip:      keyed by client IP
 *  - per_user:    keyed by authenticated user ID (falls back to IP if unauthenticated)
 *  - per_api_key: keyed by API key ID (falls back to IP if not present)
 *  - global:      single shared counter for the pattern
 *
 * Pattern matching: exact path or glob (* and **).
 *  /api/reports/*   matches /api/reports/123
 *  /api/**          matches /api/a/b/c
 * More-specific (longer) patterns take precedence.
 */

import { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { logger } from "./logger";
import { getClientIp } from "./ip-filter";

interface RateLimitRule {
  id: number;
  endpoint_pattern: string;
  max_requests: number;
  window_seconds: number;
  scope: "per_ip" | "per_user" | "per_api_key" | "global";
}

let rulesCache: { rules: RateLimitRule[]; loadedAt: number } | null = null;
const RULES_TTL_MS = 30_000;

async function loadRules(): Promise<RateLimitRule[]> {
  const now = Date.now();
  if (rulesCache && now - rulesCache.loadedAt < RULES_TTL_MS) {
    return rulesCache.rules;
  }
  try {
    const { rows } = await pool.query<RateLimitRule>(
      `SELECT id, endpoint_pattern, max_requests, window_seconds, scope
       FROM security_rate_limit_config
       WHERE is_active = true
       ORDER BY LENGTH(endpoint_pattern) DESC`
    );
    rulesCache = { rules: rows, loadedAt: now };
    return rows;
  } catch {
    return [];
  }
}

export function invalidateDynamicRateLimitCache() {
  rulesCache = null;
}

function globMatch(pattern: string, path: string): boolean {
  if (pattern === path) return true;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    "^" +
    escaped.replace(/\*\*/g, "\x00").replace(/\*/g, "[^/]*").replace(/\x00/g, ".*") +
    "$"
  );
  return regex.test(path);
}

const store = new Map<string, { count: number; resetAt: number }>();

function checkLimit(
  key: string,
  max: number,
  windowSecs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now >= entry.resetAt) {
    const resetAt = now + windowSecs * 1000;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: max - 1, resetAt };
  }

  entry.count++;
  if (entry.count > max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt };
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000).unref();

export async function dynamicRateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/healthz") return next();

  let rules: RateLimitRule[];
  try {
    rules = await loadRules();
  } catch {
    return next();
  }

  if (rules.length === 0) return next();

  const matchedRule = rules.find(r => globMatch(r.endpoint_pattern, req.path));
  if (!matchedRule) return next();

  let scopeKey: string;
  switch (matchedRule.scope) {
    case "per_user":
      scopeKey = req.userId != null ? `user:${req.userId}` : `ip:${getClientIp(req)}`;
      break;
    case "per_api_key":
      scopeKey = req.apiKeyId != null ? `apikey:${req.apiKeyId}` : `ip:${getClientIp(req)}`;
      break;
    case "per_ip":
      scopeKey = `ip:${getClientIp(req)}`;
      break;
    case "global":
    default:
      scopeKey = "global";
  }

  const key = `drl:${matchedRule.id}:${scopeKey}`;
  const { allowed, remaining, resetAt } = checkLimit(key, matchedRule.max_requests, matchedRule.window_seconds);

  res.setHeader("X-RateLimit-Limit", String(matchedRule.max_requests));
  res.setHeader("X-RateLimit-Remaining", String(remaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

  if (!allowed) {
    logger.warn("[dynamic-rate-limit] Request throttled", {
      path: req.path,
      pattern: matchedRule.endpoint_pattern,
      scope: matchedRule.scope,
    });
    res.setHeader("Retry-After", String(matchedRule.window_seconds));
    return res.status(429).json({ error: "Too many requests", retryAfter: matchedRule.window_seconds });
  }

  next();
}
