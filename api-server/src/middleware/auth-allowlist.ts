// ============================================================
// Auth Allowlist — public endpoints that skip authMiddleware
// Decision: B-D030 implemented via SAFE approach (allowlist + conditional mount)
// Generated: 2026-04-18
// ============================================================
//
// The app.ts conditional mount runs authMiddleware on every request
// UNLESS the path matches a prefix in PUBLIC_ENDPOINT_PREFIXES below.
// This is the safer alternative to a blanket global mount — it preserves
// legitimate public endpoints (health checks, auth endpoints, signed webhooks)
// while fail-closing every other endpoint that currently lacks per-router
// auth middleware.
//
// SECURITY REVIEW REQUIRED before adding any new prefix here. Each entry
// must be justified in _master-registry/AUTH_ALLOWLIST_RATIONALE.md.
//
// How the matching works:
//   - Exact match: pathname === prefix
//   - Prefix match: pathname.startsWith(prefix + '/') OR pathname === prefix
//   - No regex, no wildcards — keep it deterministic and audit-friendly
//
// KNOWN PUBLIC ENDPOINTS (by category):
//   - Health/metrics: infrastructure liveness/readiness probes
//   - Auth: login/register/password-flows need to work without auth
//   - Webhooks: externally-signed (signature verified per-route)
//   - Portal: customer/supplier login surfaces
// ============================================================

export const PUBLIC_ENDPOINT_PREFIXES: readonly string[] = Object.freeze([
  // ─── Infrastructure health ───
  "/health",
  "/healthz",
  "/readiness",
  "/liveness",
  "/metrics",
  "/ping",

  // ─── Auth endpoints (required public for login to work) ───
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/refresh-token",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
  "/api/auth/oauth",
  "/api/auth/sso",
  "/api/auth/logout",            // logout should succeed even if token expired
  "/api/login",
  "/api/register",
  "/api/logout",

  // ─── Portal (customer/supplier-facing login flows) ───
  "/portal/login",
  "/portal/register",
  "/portal/forgot-password",
  "/portal/reset-password",
  "/portal/customer/login",
  "/portal/supplier/login",

  // ─── Signed webhooks (signature verified per-route) ───
  "/api/webhooks/",
  "/api/whatsapp/webhook",
  "/whatsapp/webhook",
  "/api/stripe/webhook",
  "/api/sendgrid/webhook",
  "/api/twilio/webhook",
  "/api/supabase/webhook",
  "/webhooks/",

  // ─── Explicitly-public catalog endpoints ───
  "/api/public/",

  // ─── OpenAPI/docs (safe to expose; no data) ───
  "/api/openapi.json",
  "/api/docs",
  "/api/swagger",
  "/openapi.json",
  "/docs",
  "/swagger",

  // ─── Static assets served from api-server (if any) ───
  "/favicon.ico",
  "/robots.txt",

  // ─── Root + status pages ───
  "/",
  "/status",
]);

/**
 * Check whether a given request pathname is a public endpoint
 * (i.e. should SKIP the authMiddleware check).
 *
 * @param pathname request.path (no query-string, no host)
 * @returns true if path is public and auth should be skipped
 */
export function isPublicEndpoint(pathname: string): boolean {
  if (!pathname) return false;

  // Normalize — strip trailing slash except for root
  const normalized = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;

  for (const prefix of PUBLIC_ENDPOINT_PREFIXES) {
    // Exact match
    if (normalized === prefix) return true;
    // Prefix directory match — prefix ends with '/' means any path below it
    if (prefix.endsWith("/") && pathname.startsWith(prefix)) return true;
    // Prefix non-directory match with path boundary
    if (!prefix.endsWith("/") && pathname === prefix) return true;
    // Prefix non-directory but pathname has a subpath starting with prefix/
    if (!prefix.endsWith("/") && pathname.startsWith(prefix + "/")) return true;
  }
  return false;
}

/**
 * Get the full list of public endpoint prefixes as a read-only array.
 * For observability / audit endpoints.
 */
export function getPublicEndpoints(): readonly string[] {
  return PUBLIC_ENDPOINT_PREFIXES;
}

/**
 * Defensive check — return true if a pathname is DEFINITELY private
 * (does not match any public prefix and does not contain auth/webhook/health keywords).
 * Used for extra-paranoid monitoring — logs a warning if a path that looks
 * suspicious tries to bypass auth.
 */
export function isDefinitelyPrivate(pathname: string): boolean {
  if (isPublicEndpoint(pathname)) return false;
  return true;
}

export default {
  PUBLIC_ENDPOINT_PREFIXES,
  isPublicEndpoint,
  getPublicEndpoints,
  isDefinitelyPrivate,
};
