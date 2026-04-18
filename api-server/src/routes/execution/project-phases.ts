// API routes for execution.project_phases
import { ProjectPhases } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "project_phases",
  createSchema: ProjectPhases.CreateProjectPhaseSchema,
  updateSchema: ProjectPhases.UpdateProjectPhaseSchema,
  listQuerySchema: ProjectPhases.ListProjectPhasesQuerySchema,
  listFilters: [
    { key: "project_id", kind: "eq" },
  ],
  searchColumns: ["phase_name", "phase_code"],
  orderByAllowed: ["phase_order", "phase_name", "created_at", "updated_at"],
  defaultOrderBy: "phase_order",
});

export default router;
