import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema, LeaveRequestStatusSchema } from "./_shared";

export const CreateLeaveRequestSchema = z.object({
  request_number: z.string().max(100).optional(),
  employee_id: z.number().int().positive({ message: "מזהה עובד חובה" }),
  leave_type_id: z.number().int().positive({ message: "סוג חופשה חובה" }),
  start_date: z.string({ required_error: "תאריך התחלה חובה" }),
  end_date: z.string({ required_error: "תאריך סיום חובה" }),
  total_days: z.coerce.number().positive({ message: "יש לציין מספר ימים חיובי" }),
  status: LeaveRequestStatusSchema.optional().default("submitted"),
  notes: z.string().max(2000).optional().nullable(),
  metadata: MetadataSchema,
});
export type CreateLeaveRequestInput = z.infer<typeof CreateLeaveRequestSchema>;

export const UpdateLeaveRequestSchema = CreateLeaveRequestSchema.partial();
export type UpdateLeaveRequestInput = z.infer<typeof UpdateLeaveRequestSchema>;

export const ListLeaveRequestsQuerySchema = ListQueryBaseSchema.extend({
  employee_id: z.coerce.number().int().positive().optional(),
  status: LeaveRequestStatusSchema.optional(),
  leave_type_id: z.coerce.number().int().positive().optional(),
  start_date_from: z.string().optional(),
  start_date_to: z.string().optional(),
});
export type ListLeaveRequestsQuery = z.infer<typeof ListLeaveRequestsQuerySchema>;

export const ApproveLeaveRequestSchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
});

export const RejectLeaveRequestSchema = z.object({
  reason: z.string().min(1, { message: "חובה לציין סיבה לדחייה" }).max(2000),
});
