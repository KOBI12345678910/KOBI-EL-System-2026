// ============================================================
// Shared primitives for workforce zod schemas.
// Workforce is the most PII-sensitive domain — strict validation
// is enforced with Hebrew error messages on all identity fields.
// ============================================================
import { z } from "zod";

export const IdSchema = z.union([z.number().int().positive(), z.string()]);
export const NullableString = z.string().optional().nullable();
export const NullableNumber = z.number().optional().nullable();
export const NullableDate = z.string().optional().nullable();
export const MetadataSchema = z.record(z.unknown()).optional().default({});

export const ListQueryBaseSchema = z.object({
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0),
  order_by: z.string().max(64).optional().default("id"),
  order_dir: z.enum(["asc", "desc"]).optional().default("desc"),
});
export type ListQueryBase = z.infer<typeof ListQueryBaseSchema>;

// Hebrew-validated PII fields
export const HebrewNationalIdSchema = z.string()
  .min(5, { message: "מספר זהות חייב להיות לפחות 5 ספרות" })
  .max(20, { message: "מספר זהות ארוך מדי" })
  .regex(/^[0-9A-Za-z-]+$/, { message: "מספר זהות מכיל תווים לא חוקיים" });

export const HebrewBankAccountSchema = z.string()
  .max(100, { message: "חשבון בנק ארוך מדי" })
  .regex(/^[0-9A-Za-z\- ]*$/, { message: "חשבון בנק מכיל תווים לא חוקיים" });

export const HebrewPhoneSchema = z.string()
  .max(50, { message: "טלפון ארוך מדי" })
  .regex(/^[0-9+\-() ]*$/, { message: "טלפון מכיל תווים לא חוקיים" });

export const HebrewEmailSchema = z.string()
  .email({ message: "כתובת דוא\"ל לא תקינה" })
  .max(200, { message: "כתובת דוא\"ל ארוכה מדי" });

// Workforce status lifecycles
export const PAYROLL_RUN_STATUSES = ["draft","in_progress","approved","paid","closed"] as const;
export const PayrollRunStatusSchema = z.enum(PAYROLL_RUN_STATUSES);

export const LEAVE_REQUEST_STATUSES = ["submitted","approved","rejected","cancelled"] as const;
export const LeaveRequestStatusSchema = z.enum(LEAVE_REQUEST_STATUSES);

export const WAGE_SLIP_STATUSES = ["draft","published","superseded"] as const;
export const WageSlipStatusSchema = z.enum(WAGE_SLIP_STATUSES);

export const ATTENDANCE_EXCEPTION_STATUSES = ["pending","approved","rejected"] as const;
export const AttendanceExceptionStatusSchema = z.enum(ATTENDANCE_EXCEPTION_STATUSES);
