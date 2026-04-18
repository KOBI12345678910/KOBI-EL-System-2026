import { Dependencies } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "dependencies",
  createSchema: Dependencies.CreateDependencySchema,
  updateSchema: Dependencies.UpdateDependencySchema,
  listQuerySchema: Dependencies.ListDependenciesQuerySchema,
  softDelete: false,
  listFilters: [
    { key: "source_entity_type", kind: "eq" },
    { key: "source_entity_id", kind: "eq" },
    { key: "target_entity_type", kind: "eq" },
    { key: "state", kind: "eq" },
  ],
  searchColumns: ["notes"],
  orderByAllowed: ["created_at", "is_critical", "state"],
});

export default router;
