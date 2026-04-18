import { ProjectMilestones } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "project_milestones",
  createSchema: ProjectMilestones.CreateProjectMilestoneSchema,
  updateSchema: ProjectMilestones.UpdateProjectMilestoneSchema,
  listQuerySchema: ProjectMilestones.ListProjectMilestonesQuerySchema,
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "state", kind: "eq" },
  ],
  searchColumns: ["milestone_name"],
  orderByAllowed: ["due_date", "milestone_name", "state", "created_at"],
  defaultOrderBy: "due_date",
});

export default router;
