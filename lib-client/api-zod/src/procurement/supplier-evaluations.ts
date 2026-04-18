// Zod schemas for procurement.supplier_evaluations
import { z } from "zod";
import { ListQueryBaseSchema, MetadataSchema } from "./_shared";

export const EVAL_STATES = ["draft", "submitted", "approved", "archived"] as const;
export const EvalStateSchema = z.enum(EVAL_STATES);

export const EVAL_GRADES = ["A+", "A", "B", "C", "D", "F"] as const;
export const EvalGradeSchema = z.enum(EVAL_GRADES);

export const RECOMMENDATIONS = ["preferred", "approved", "conditional", "probation", "blocked"] as const;
export const RecommendationSchema = z.enum(RECOMMENDATIONS);

const Score = z.number().min(0).max(100);

export const CreateSupplierEvaluationSchema = z.object({
  evaluation_number: z.string().min(1).max(64),
  supplier_id: z.number().int().positive(),
  evaluation_period_start: z.string(),
  evaluation_period_end: z.string(),
  evaluation_date: z.string().optional(),
  delivery_score: Score.optional().nullable(),
  quality_score: Score.optional().nullable(),
  price_score: Score.optional().nullable(),
  service_score: Score.optional().nullable(),
  communication_score: Score.optional().nullable(),
  compliance_score: Score.optional().nullable(),
  overall_score: Score.optional().nullable(),
  grade: EvalGradeSchema.optional().nullable(),
  recommendation: RecommendationSchema.optional().nullable(),
  on_time_delivery_pct: z.number().min(0).max(100).optional().nullable(),
  defect_rate_pct: z.number().min(0).max(100).optional().nullable(),
  pos_count: z.number().int().min(0).optional().default(0),
  total_spend: z.number().min(0).optional().default(0),
  strengths: z.string().optional().nullable(),
  weaknesses: z.string().optional().nullable(),
  action_items: z.string().optional().nullable(),
  internal_notes: z.string().optional().nullable(),
  state: EvalStateSchema.optional().default("draft"),
  metadata: MetadataSchema,
});
export type CreateSupplierEvaluationInput = z.infer<typeof CreateSupplierEvaluationSchema>;

export const UpdateSupplierEvaluationSchema = CreateSupplierEvaluationSchema.partial();
export type UpdateSupplierEvaluationInput = z.infer<typeof UpdateSupplierEvaluationSchema>;

export const ReadSupplierEvaluationSchema = CreateSupplierEvaluationSchema.extend({
  id: z.number().int(),
  public_id: z.string().uuid(),
  evaluated_by_user_id: z.number().int().nullable(),
  is_active: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReadSupplierEvaluation = z.infer<typeof ReadSupplierEvaluationSchema>;

export const ListSupplierEvaluationsQuerySchema = ListQueryBaseSchema.extend({
  supplier_id: z.coerce.number().int().optional(),
  state: EvalStateSchema.optional(),
  grade: EvalGradeSchema.optional(),
  min_overall_score: z.coerce.number().optional(),
});
export type ListSupplierEvaluationsQuery = z.infer<typeof ListSupplierEvaluationsQuerySchema>;
