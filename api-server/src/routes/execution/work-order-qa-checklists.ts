import { WorkOrderQaChecklists } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "work_order_qa_checklists",
  createSchema: WorkOrderQaChecklists.CreateQaChecklistSchema,
  updateSchema: WorkOrderQaChecklists.UpdateQaChecklistSchema,
  listQuerySchema: WorkOrderQaChecklists.ListQaChecklistsQuerySchema,
  listFilters: [
    { key: "work_order_id", kind: "eq" },
  ],
  searchColumns: ["checklist_name", "template_code"],
  orderByAllowed: ["created_at", "completed_at", "overall_result"],
});

export default router;
