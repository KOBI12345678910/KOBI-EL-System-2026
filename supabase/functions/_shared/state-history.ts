// ============================================================
// FILE: supabase/functions/_shared/state-history.ts
// ============================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type StateHistoryPayload = {
  entityType: string;
  entityId: number;
  fromState: string | null;
  toState: string;
  changedByUserId: number | null;
  reason: string | null;
  correlationId: string | null;
};

export async function writeStateHistory(
  admin: SupabaseClient,
  payload: StateHistoryPayload,
): Promise<void> {
  const { error } = await admin.schema("governance").from("state_history").insert({
    entity_type: payload.entityType,
    entity_id: payload.entityId,
    from_state: payload.fromState,
    to_state: payload.toState,
    changed_by_user_id: payload.changedByUserId,
    reason: payload.reason,
    correlation_id: payload.correlationId,
    changed_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`STATE_HISTORY_WRITE_FAILED: ${error.message}`);
  }
}
