import { RevisionControl } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "revision_control",
  createSchema: RevisionControl.CreateRevisionSchema,
  updateSchema: RevisionControl.UpdateRevisionSchema,
  listQuerySchema: RevisionControl.ListRevisionsQuerySchema,
  jsonbColumns: ["changed_fields", "previous_snapshot", "new_snapshot", "metadata"],
  listFilters: [
    { key: "entity_type", kind: "eq" },
    { key: "entity_id", kind: "eq" },
    { key: "state", kind: "eq" },
  ],
  searchColumns: ["revision_code", "revision_reason", "change_summary"],
  orderByAllowed: ["created_at", "revision_number", "state"],
});

export default router;
