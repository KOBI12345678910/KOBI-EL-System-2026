// Zod schemas for analytics.rm_* read-model summary tables
// Read-only list endpoints per rm_* table.
import { z } from "zod";
import { ListQueryBaseSchema } from "./_shared";

export const ListRmSummaryQuerySchema = ListQueryBaseSchema.extend({
  from_date: z.string().optional(),
  to_date: z.string().optional(),
});
export type ListRmSummaryQuery = z.infer<typeof ListRmSummaryQuerySchema>;

export const RM_SUMMARY_KINDS = [
  "executive",
  "operations",
  "procurement",
  "finance",
  "workforce",
  "ai",
] as const;
export const RmSummaryKindSchema = z.enum(RM_SUMMARY_KINDS);
