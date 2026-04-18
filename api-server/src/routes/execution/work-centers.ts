import { WorkCenters } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "work_centers",
  createSchema: WorkCenters.CreateWorkCenterSchema,
  updateSchema: WorkCenters.UpdateWorkCenterSchema,
  listQuerySchema: WorkCenters.ListWorkCentersQuerySchema,
  listFilters: [
    { key: "center_type", kind: "eq" },
    { key: "is_active", kind: "bool" },
  ],
  searchColumns: ["code", "name_he", "name_en", "location_name"],
  orderByAllowed: ["code", "name_he", "center_type", "created_at"],
  defaultOrderBy: "code",
});

export default router;
