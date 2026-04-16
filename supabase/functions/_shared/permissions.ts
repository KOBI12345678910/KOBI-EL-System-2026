// ============================================================
// FILE: supabase/functions/_shared/permissions.ts
// ============================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PermissionError } from "./errors.ts";
import type { InternalActor } from "./auth.ts";

export async function requirePermission(
  actor: InternalActor,
  permissionCode: string,
  admin: SupabaseClient,
): Promise<void> {
  const { data, error } = await admin.rpc("current_user_has_permission", {
    p_permission_code: permissionCode,
  });

  if (error) {
    throw new PermissionError("Failed permission check", error);
  }

  if (!data) {
    throw new PermissionError(`Missing permission: ${permissionCode}`, {
      permission_code: permissionCode,
      actor_user_profile_id: actor.userProfileId,
    });
  }
}

export async function requireEntityReadScope(
  entityType: string,
  entityId: number,
  admin: SupabaseClient,
): Promise<void> {
  const { data, error } = await admin.rpc("can_read_parent_entity", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });

  if (error) {
    throw new PermissionError("Failed entity read scope check", error);
  }

  if (!data) {
    throw new PermissionError("Entity read scope denied", {
      entity_type: entityType,
      entity_id: entityId,
    });
  }
}

export async function requireEntityWriteScope(
  entityType: string,
  entityId: number,
  admin: SupabaseClient,
): Promise<void> {
  const { data, error } = await admin.rpc("can_write_parent_entity", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });

  if (error) {
    throw new PermissionError("Failed entity write scope check", error);
  }

  if (!data) {
    throw new PermissionError("Entity write scope denied", {
      entity_type: entityType,
      entity_id: entityId,
    });
  }
}
