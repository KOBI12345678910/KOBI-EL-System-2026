/**
 * Environment variable helpers — fail-fast on missing config.
 * TechnoKol Uzi ERP 2026
 */

export function requireEnv(key: string): string {
  const val = Deno.env.get(key);
  if (!val) throw new Error(`ENV_MISSING: ${key} is required but not set`);
  return val;
}

export function optionalEnv(key: string, fallback: string): string {
  return Deno.env.get(key) ?? fallback;
}

// Pre-resolved common env vars (fail at import-time if missing in prod)
export const SUPABASE_URL = requireEnv("SUPABASE_URL");
export const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
export const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
export const ENVIRONMENT = optionalEnv("ENVIRONMENT", "development");
export const IS_PRODUCTION = ENVIRONMENT === "production";
