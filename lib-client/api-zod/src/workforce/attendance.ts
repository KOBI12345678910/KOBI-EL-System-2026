import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, AttendanceExceptionStatusSchema } from "./_shared";

// attendance_logs is an alias for workforce.attendance
export const CreateAttendanceLogSchema = z.object({
  attendance_number: z.string().max(100).optional(),
  employee_id: z.number().int().positive({ message: "מזהה עובד חובה" }),
  project_id: z.number().int().positive().optional().nullable(),
  work_order_id: z.number().int().positive().optional().nullable(),
  work_date: z.string({ required_error: "תאריך עבודה חובה" }),
  start_time: z.string().optional().nullable(),
  end_time: z.string().optional().nullable(),
  regular_hours: z.coerce.number().nonnegative().optional().default(0),
  overtime_hours: z.coerce.number().nonnegative().optional().default(0),
  source: z.string().max(50).optional().nullable(),
  approval_status: z.string().max(50).optional().default("pending"),
  state: z.string().max(50).optional().default("Submitted"),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateAttendanceLogInput = z.infer<typeof CreateAttendanceLogSchema>;

export const UpdateAttendanceLogSchema = CreateAttendanceLogSchema.partial();
export type UpdateAttendanceLogInput = z.infer<typeof UpdateAttendanceLogSchema>;

export const ListAttendanceLogsQuerySchema = ListQueryBaseSchema.extend({
  employee_id: z.coerce.number().int().positive().optional(),
  project_id: z.coerce.number().int().positive().optional(),
  work_date_from: z.string().optional(),
  work_date_to: z.string().optional(),
  approval_status: z.string().optional(),
});
export type ListAttendanceLogsQuery = z.infer<typeof ListAttendanceLogsQuerySchema>;

// attendance_exceptions
export const CreateAttendanceExceptionSchema = z.object({
  exception_code: z.string().max(100).optional(),
  employee_id: z.number().int().positive(),
  attendance_id: z.number().int().positive().optional().nullable(),
  exception_type: z.string().min(1).max(50),
  exception_date: z.string(),
  description: z.string().max(2000).optional().nullable(),
  status: AttendanceExceptionStatusSchema.optional().default("pending"),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateAttendanceExceptionInput = z.infer<typeof CreateAttendanceExceptionSchema>;

export const UpdateAttendanceExceptionSchema = CreateAttendanceExceptionSchema.partial();
export type UpdateAttendanceExceptionInput = z.infer<typeof UpdateAttendanceExceptionSchema>;

export const ListAttendanceExceptionsQuerySchema = ListQueryBaseSchema.extend({
  employee_id: z.coerce.number().int().positive().optional(),
  status: AttendanceExceptionStatusSchema.optional(),
  exception_type: z.string().optional(),
});
export type ListAttendanceExceptionsQuery = z.infer<typeof ListAttendanceExceptionsQuerySchema>;

export const ApproveAttendanceExceptionSchema = z.object({
  resolution: z.string().max(2000).optional().nullable(),
});
export const RejectAttendanceExceptionSchema = z.object({
  resolution: z.string().min(1, { message: "חובה לציין סיבה לדחייה" }).max(2000),
});
