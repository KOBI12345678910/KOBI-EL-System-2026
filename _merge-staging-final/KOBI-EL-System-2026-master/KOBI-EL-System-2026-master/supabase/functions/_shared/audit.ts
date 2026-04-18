import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type AuditEntry = {
  entityType: string;
  entityId: number | string;
  actionName: string;
  oldValues: unknown;
  newValues: unknown;
  sourceService: string;
  sourceModule: string;
  sourcePage: string;
  performedByUserId: number;
  correlationId?: string;
};

export async function writeAudit(admin: SupabaseClient, entry: AuditEntry): Promise<void> {
  const { error } = await admin.schema("governance").from("audit_logs").insert({
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    action_name: entry.actionName,
    old_values: entry.oldValues,
    new_values: entry.newValues,
    source_service: entry.sourceService,
    source_module: entry.sourceModule,
    source_page: entry.sourcePage,
    performed_by_user_id: entry.performedByUserId,
    correlation_id: entry.correlationId,
    performed_at: new Date().toISOString(),
  });
  if (error) console.error("[audit] Failed to write audit log:", error.message);
}
