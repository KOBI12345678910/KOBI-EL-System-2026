/**
 * Edge Function: submit-attendance
 * Creates an attendance record in Submitted state (or Draft→Submitted).
 * TechnoKol Uzi ERP 2026
 */
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { resolveAuth } from "../_shared/auth.ts";
import { requirePermission } from "../_shared/permissions.ts";
import { resolveCorrelationId } from "../_shared/correlation.ts";
import { requireValid } from "../_shared/validators.ts";
import { supabaseAdmin } from "../_shared/supabase-admin.ts";
import { writeAudit } from "../_shared/audit.ts";
import { emitDomainEvent } from "../_shared/events.ts";
import { created, fail } from "../_shared/response.ts";
import { log } from "../_shared/logger.ts";
import { AppError } from "../_shared/errors.ts";

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-correlation-id, content-type" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail("METHOD_NOT_ALLOWED", "POST only", undefined, undefined, 405);
  const correlationId = resolveCorrelationId(req);
  try {
    const actor = await resolveAuth(req);
    await requirePermission(actor, "attendance.create");

    const body = await req.json();
    requireValid(body, [
      { field: "employee_id", required: true, type: "number" },
      { field: "work_date", required: true, type: "string" },
      { field: "regular_hours", required: true, type: "number", min: 0, max: 24 },
    ]);

    const { data: attendance, error } = await supabaseAdmin
      .from("workforce.attendance")
      .insert({
        employee_id: body.employee_id,
        work_date: body.work_date,
        regular_hours: body.regular_hours,
        overtime_hours: body.overtime_hours ?? 0,
        project_id: body.project_id ?? null,
        work_order_id: body.work_order_id ?? null,
        notes: body.notes ?? null,
        state: "Submitted",
        submitted_at: new Date().toISOString(),
        submitted_by_user_id: actor.profileId,
      })
      .select()
      .single();
    if (error) throw new AppError(`DB_ERROR: ${error.message}`, 500);

    await writeAudit({ entityType: "Attendance", entityId: attendance.id, actionName: "attendance.submit", sourceService: "WORKFORCE", sourceModule: "attendance", newValues: attendance, performedByUserId: actor.profileId ?? undefined, correlationId });
    await emitDomainEvent({
      eventName: "attendance.submitted", topicName: "workforce.attendance", sourceService: "WORKFORCE", sourceModule: "attendance",
      entityType: "Attendance", entityId: attendance.id,
      payload: { attendance_id: attendance.id, employee_id: body.employee_id, work_date: body.work_date, regular_hours: body.regular_hours, overtime_hours: body.overtime_hours ?? 0, state: "Submitted" },
      correlationId, actorType: "user", actorId: actor.profileId ?? undefined,
    });

    log("info", "attendance submitted", { attendanceId: attendance.id, employeeId: body.employee_id, correlationId });
    return created(attendance, correlationId);
  } catch (e) {
    const err = e as AppError;
    log("error", err.message, { correlationId });
    return fail(err.message.split(":")[0] || "INTERNAL_ERROR", err.message, correlationId, undefined, err.status || 500);
  }
});
