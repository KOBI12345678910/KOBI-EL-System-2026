import { Request, Response, NextFunction } from "express";
import { pool } from "@workspace/db";
import { logger } from "./logger";

function ipToNumber(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    num = num * 256 + n;
  }
  return num;
}

function cidrMatch(ip: string, cidr: string): boolean {
  try {
    const [range, prefixStr] = cidr.split("/");
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) return false;
    const ipNum = ipToNumber(ip);
    const rangeNum = ipToNumber(range);
    if (ipNum === null || rangeNum === null) return false;
    const mask = prefix === 0 ? 0 : ~((1 << (32 - prefix)) - 1) >>> 0;
    return (ipNum & mask) === (rangeNum & mask);
  } catch {
    return false;
  }
}

function matchesRule(ip: string, rule: string): boolean {
  if (rule.includes("/")) return cidrMatch(ip, rule);
  return ip === rule;
}

/**
 * Derive the true client IP address.
 *
 * Security note on x-forwarded-for:
 *  This header can be spoofed unless we are behind a trusted reverse proxy.
 *  We trust x-forwarded-for ONLY when the direct socket peer is a trusted
 *  proxy (RFC 7239). The trusted proxy CIDRs are configured via
 *  TRUSTED_PROXY_CIDRS env var (comma-separated) or default to loopback +
 *  private RFC-1918 ranges that are common in cloud deployments.
 *
 *  In the case that we're NOT behind a trusted proxy, we use the socket
 *  remote address directly.
 *
 *  For country derivation we rely on CF-IPCountry (Cloudflare) or a custom
 *  header set by a trusted proxy, NOT user-supplied headers. We validate the
 *  source by checking whether the request is coming through a trusted proxy.
 */

const DEFAULT_TRUSTED_CIDRS = [
  "127.0.0.0/8",    // loopback
  "10.0.0.0/8",     // RFC-1918
  "172.16.0.0/12",  // RFC-1918
  "192.168.0.0/16", // RFC-1918
  "100.64.0.0/10",  // CGNAT (AWS, Cloudflare, etc.)
  "::1/128",        // IPv6 loopback (kept for display; we only do IPv4 parsing)
];

let trustedProxyCidrs: string[] | null = null;

function getTrustedProxyCidrs(): string[] {
  if (trustedProxyCidrs) return trustedProxyCidrs;
  const env = process.env.TRUSTED_PROXY_CIDRS;
  trustedProxyCidrs = env
    ? env.split(",").map(s => s.trim()).filter(Boolean)
    : DEFAULT_TRUSTED_CIDRS;
  return trustedProxyCidrs;
}

function isPrivateOrLoopback(ip: string): boolean {
  return getTrustedProxyCidrs().some(cidr => {
    if (!cidr.includes("/")) return ip === cidr;
    return cidrMatch(ip, cidr);
  });
}

/**
 * Returns the real client IP.
 * Only peels back x-forwarded-for when the immediate peer is trusted.
 */
export function getClientIp(req: Request): string {
  const socketPeer = req.socket?.remoteAddress || "";
  const cleanPeer = socketPeer.startsWith("::ffff:")
    ? socketPeer.slice(7)
    : socketPeer;

  const isTrustedPeer = isPrivateOrLoopback(cleanPeer);

  if (isTrustedPeer) {
    const xfwd = req.headers["x-forwarded-for"];
    if (xfwd) {
      const raw = typeof xfwd === "string" ? xfwd : xfwd[0];
      // The left-most entry that is NOT a trusted proxy is the real client.
      const ips = raw.split(",").map(s => s.trim()).filter(Boolean);
      for (let i = ips.length - 1; i >= 0; i--) {
        if (!isPrivateOrLoopback(ips[i])) return ips[i];
      }
    }
  }

  return cleanPeer || "unknown";
}

/**
 * Returns the country code ONLY if the request is arriving through a
 * trusted proxy (Cloudflare, AWS CloudFront, nginx, etc.).
 * Attackers cannot forge CF-IPCountry because Cloudflare strips any
 * existing value before adding its own — but only if we are actually
 * behind Cloudflare. This is enforced via the trusted-peer check above.
 */
export function getCountryCode(req: Request): string | null {
  const socketPeer = req.socket?.remoteAddress || "";
  const cleanPeer = socketPeer.startsWith("::ffff:")
    ? socketPeer.slice(7)
    : socketPeer;
  const isTrustedPeer = isPrivateOrLoopback(cleanPeer);

  if (!isTrustedPeer) return null;

  const cf = req.headers["cf-ipcountry"];
  if (cf && typeof cf === "string" && /^[A-Z]{2}$/.test(cf.trim())) {
    return cf.trim().toUpperCase();
  }

  const custom = req.headers["x-country-code"];
  if (custom && typeof custom === "string" && /^[A-Z]{2}$/.test(custom.trim())) {
    return custom.trim().toUpperCase();
  }

  return null;
}

interface IpRule {
  id: number;
  ip_address: string;
  rule_type: "whitelist" | "blacklist";
  description: string | null;
  is_active: boolean;
  created_at: string;
}

interface GeoRule {
  id: number;
  country_code: string;
  country_name: string;
  rule_type: "allow" | "deny";
  is_active: boolean;
}

let rulesCache: { rules: IpRule[]; geoRules: GeoRule[]; loadedAt: number } | null = null;
const RULES_CACHE_TTL_MS = 30_000;

async function loadRules(): Promise<{ rules: IpRule[]; geoRules: GeoRule[] }> {
  const now = Date.now();
  if (rulesCache && now - rulesCache.loadedAt < RULES_CACHE_TTL_MS) {
    return { rules: rulesCache.rules, geoRules: rulesCache.geoRules };
  }
  try {
    const [ipResult, geoResult] = await Promise.all([
      pool.query<IpRule>(`SELECT * FROM security_ip_rules WHERE is_active = true ORDER BY id`),
      pool.query<GeoRule>(`SELECT * FROM security_geo_rules WHERE is_active = true ORDER BY id`),
    ]);
    rulesCache = { rules: ipResult.rows, geoRules: geoResult.rows, loadedAt: now };
    return { rules: ipResult.rows, geoRules: geoResult.rows };
  } catch (err) {
    logger.warn("[ip-filter] Could not load rules from DB:", { error: err instanceof Error ? err.message : String(err) });
    return { rules: [], geoRules: [] };
  }
}

export function invalidateIpFilterCache() {
  rulesCache = null;
}

async function logBlockedAttempt(ip: string, reason: string, req: Request) {
  try {
    await pool.query(
      `INSERT INTO security_blocked_attempts (ip_address, reason, request_path, request_method, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [ip, reason, req.path, req.method, req.headers["user-agent"] || null]
    );
  } catch (err) {
    logger.warn("[ip-filter] Could not log blocked attempt:", { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function ipFilterMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path === "/healthz" || req.path === "/api/healthz") return next();

  const bypassToken = req.headers["x-emergency-bypass"] as string;
  const BYPASS_TOKEN = process.env.EMERGENCY_BYPASS_TOKEN;
  if (BYPASS_TOKEN && bypassToken === BYPASS_TOKEN) {
    logger.warn("[ip-filter] Emergency bypass used", { path: req.path });
    return next();
  }

  let rules: IpRule[];
  let geoRules: GeoRule[];
  try {
    ({ rules, geoRules } = await loadRules());
  } catch {
    return next();
  }

  const clientIp = getClientIp(req);

  const blacklistRules = rules.filter(r => r.rule_type === "blacklist");
  for (const rule of blacklistRules) {
    if (matchesRule(clientIp, rule.ip_address)) {
      logger.warn("[ip-filter] Blocked by blacklist", { ip: clientIp, rule: rule.ip_address });
      await logBlockedAttempt(clientIp, `Blacklisted: ${rule.ip_address}`, req);
      return res.status(403).json({ error: "Access denied" });
    }
  }

  const whitelistRules = rules.filter(r => r.rule_type === "whitelist");
  if (whitelistRules.length > 0) {
    const allowed = whitelistRules.some(r => matchesRule(clientIp, r.ip_address));
    if (!allowed) {
      logger.warn("[ip-filter] Blocked: not in whitelist", { ip: clientIp });
      await logBlockedAttempt(clientIp, "Not in whitelist", req);
      return res.status(403).json({ error: "Access denied" });
    }
  }

  if (geoRules.length > 0) {
    const countryCode = getCountryCode(req);
    if (countryCode) {
      const denyRules = geoRules.filter(r => r.rule_type === "deny");
      for (const rule of denyRules) {
        if (rule.country_code.toUpperCase() === countryCode) {
          logger.warn("[ip-filter] Blocked by geo-block", { ip: clientIp, country: countryCode });
          await logBlockedAttempt(clientIp, `Geo-blocked country: ${countryCode}`, req);
          return res.status(403).json({ error: "Access denied from your region" });
        }
      }

      const allowRules = geoRules.filter(r => r.rule_type === "allow");
      if (allowRules.length > 0) {
        const allowed = allowRules.some(r => r.country_code.toUpperCase() === countryCode);
        if (!allowed) {
          logger.warn("[ip-filter] Blocked by geo-allowlist", { ip: clientIp, country: countryCode });
          await logBlockedAttempt(clientIp, `Country not in geo-allowlist: ${countryCode}`, req);
          return res.status(403).json({ error: "Access denied from your region" });
        }
      }
    }
  }

  next();
}
