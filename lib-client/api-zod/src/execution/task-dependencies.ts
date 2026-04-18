// Zod schemas for execution.task_dependencies
import { z } from "zod";
import { IdSchema, PaginationQuery } from "./_shared";

export const CreateTaskDependencySchema = z.object({
  predecessor_task_id: z.coerce.number().int().positive(),
  successor_task_id: z.coerce.number().int().positive(),
  dependency_type: z.enum(["finish_to_start", "start_to_start", "finish_to_finish", "start_to_finish"]).default("finish_to_start"),
}).refine((v) => v.predecessor_task_id !== v.successor_task_id, {
  message: "predecessor and successor must differ",
});
export type CreateTaskDependencyInput = z.infer<typeof CreateTaskDependencySchema>;

export const ReadTaskDependencySchema = z.object({
  id: IdSchema,
  predecessor_task_id: z.number().int(),
  successor_task_id: z.number().int(),
  dependency_type: z.string(),
});

export const ListTaskDependenciesQuerySchema = z.object({
  task_id: z.coerce.number().int().optional(),
  ...PaginationQuery,
});
