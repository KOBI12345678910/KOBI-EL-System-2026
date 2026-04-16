// ============================================================
// FILE: supabase/functions/_shared/idempotency.ts
// ============================================================

import { getAdminClient } from "./supabase-admin.ts";

const DEFAULT_TTL_HOURS = 24;

/**
 * Returns true if this key has NOT been seen before (proceed with action).
 * Returns false if the key was already consumed (skip the action, return cached result).
 */
export async function claimIdempotencyKey(
  key: string,
  ttlHours = DEFAULT_TTL_HOURS,
): Promise<{ claimed: boolean; existingResult?: unknown }> {
  if (!key) return { claimed: true };

  const admin = getAdminClient();

  const { data: existing } = await admin
    .schema("governance")
    .from("idempotency_keys")
    .select("result")
    .eq("key", key)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existing) {
    return { claimed: false, existingResult: existing.result };
  }

  const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();

  await admin
    .schema("governance")
    .from("idempotency_keys")
    .upsert({ key, expires_at: expiresAt, result: null });

  return { claimed: true };
}

/** Store the result so subsequent calls with the same key get the cached response. */
export async function setIdempotencyResult(key: string, result: unknown): Promise<void> {
  if (!key) return;

  const admin = getAdminClient();

  await admin
    .schema("governance")
    .from("idempotency_keys")
    .update({ result })
    .eq("key", key);
}
