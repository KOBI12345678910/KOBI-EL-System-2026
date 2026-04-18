// ============================================================
// FILE: supabase/functions/approve-attendance/index.ts
// ============================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { requireInternalUser } from "../_shared/auth.ts";
import { requirePermission } from "../_shared/permissions.ts";
import { getCorrelationId } from "../_shared/correlation.ts";
import { optionsResponse, ok, failFromAppError } from "../_shared/response.ts";
import { writeAudit } from "../_shared/audit.ts";
import { writeStateHistory } from "../_shared/state-history.ts";
import { writeDomainEvent } from "../_shared/events.ts";
import { normalizeError, ConflictError, NotFoundError } from "../_shared/errors.ts";

serve(async (req: Request) => {
  const correlationId = getCorrelationId(req);
  const admin = getAdminClient();

  if (req.method === "OPTIONS") return optionsResponse();

  try {
    if (req.method !== "POST") throw new Error("METHOD_NOT_ALLOWED");

    const actor = await requireInternalUser(req, admin);
    await requirePermission(actor, "attendance.approve", admin);

    const url = new URL(req.url);
    const attendanceId = Number(url.searchParams.get("attendance_id"));

    const { data: attendance, error: attendanceError } = await admin
      .schema("workforce")
      .from("attendance")
      .select("*")
      .eq("id", attendanceId)
      .single();

    if (attendanceError || !attendance) throw new NotFoundError("Attendance not found");

    if (!["Submitted", "pending"].includes(attendance.state) && attendance.approval_status !== "pending") {
      throw new ConflictError("Attendance is not approvable", {
        state: attendance.state,
        approval_status: attendance.approval_status,
      });
    }

    const { data: updatedAttendance, error: updateError } = await admin
      .schema("workforce")
      .from("attendance")
      .update({
        approval_status: "approved",
        state: "Approved",
        approved_by_user_id: actor.userProfileId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", attendanceId)
      .select("*")
      .single();

    if (updateError || !updatedAttendance) throw updateError ?? new Error("ATTENDANCE_APPROVE_FAILED");

    await writeStateHistory(admin, {
      entityType: "Attendance",
      entityId: attendanceId,
      fromState: attendance.state,
      toState: "Approved",
      changedByUserId: actor.userProfileId,
      reason: "Attendance approved",
      correlationId,
    });

    await writeAudit(admin, {
      entityType: "Attendance",
      entityId: attendanceId,
      actionName: "attendance.approve",
      oldValues: attendance,
      newValues: updatedAttendance,
      sourceService: "PAYROLL_AUTONOMOUS",
      sourceModule: "attendance",
      sourcePage: "Employee360",
      performedByUserId: actor.userProfileId,
      correlationId,
    });

    await writeDomainEvent(admin, {
      eventName: "attendance.approved",
      topicName: "workforce.attendance",
      sourceService: "PAYROLL_AUTONOMOUS",
      sourceModule: "attendance",
      entityType: "Attendance",
      entityId: attendanceId,
      partitionKey: `Attendance:${attendanceId}`,
      correlationId,
      causationId: null,
      actorType: "user",
      actorId: actor.userProfileId,
      payload: {
        attendance_id: updatedAttendance.id,
        employee_id: updatedAttendance.employee_id,
        project_id: updatedAttendance.project_id,
        work_order_id: updatedAttendance.work_order_id,
        regular_hours: updatedAttendance.regular_hours,
        overtime_hours: updatedAttendance.overtime_hours,
        state: updatedAttendance.state,
      },
      metadata: null,
    });

    return ok(updatedAttendance, correlationId);
  } catch (error) {
    return failFromAppError(normalizeError(error), correlationId);
  }
});
