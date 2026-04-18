// Zod schemas for execution.dependencies
import { z } from "zod";
import { AuditColumns, IdSchema, PaginationQuery } from "./_shared";

export const DEPENDENCY_TYPES = ["finish_to_start", "start_to_start", "finish_to_finish", "start_to_finish", "blocks", "requires"] as const;
export const DependencyTypeSchema = z.enum(DEPENDENCY_TYPES);

export const SOURCE_ENTITY_TYPES = ["project", "work_order", "task", "milestone", "phase"] as const;
export const TARGET_ENTITY_TYPES = ["project", "work_order", "task", "milestone", "phase", "material", "supplier_po", "drawing"] as const;

export const CreateDependencySchema = z.object({
  source_entity_type: z.enum(SOURCE_ENTITY_TYPES),
  source_entity_id: z.coerce.number().int().positive(),
  target_entity_type: z.enum(TARGET_ENTITY_TYPES),
  target_entity_id: z.coerce.number().int().positive(),
  dependency_type: DependencyTypeSchema.optional().default("finish_to_start"),
  lag_days: z.coerce.number().int().optional().default(0),
  is_critical: z.boolean().optional().default(false),
  state: z.enum(["active", "resolved", "cancelled"]).optional().default("active"),
  notes: z.string().max(4000).optional().nullable(),
  ...AuditColumns,
});
export type CreateDependencyInput = z.infer<typeof CreateDependencySchema>;

export const UpdateDependencySchema = CreateDependencySchema.partial();

export const ReadDependencySchema = z.object({
  id: IdSchema,
  source_entity_type: z.string(),
  source_entity_id: z.number().int(),
  target_entity_type: z.string(),
  target_entity_id: z.number().int(),
  dependency_type: z.string(),
  is_critical: z.boolean(),
  state: z.string(),
});
export type ReadDependency = z.infer<typeof ReadDependencySchema>;

export const ListDependenciesQuerySchema = z.object({
  source_entity_type: z.string().optional(),
  source_entity_id: z.coerce.number().int().optional(),
  target_entity_type: z.string().optional(),
  state: z.string().optional(),
  ...PaginationQuery,
});
