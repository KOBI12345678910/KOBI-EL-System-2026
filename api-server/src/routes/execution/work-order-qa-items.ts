import { WorkOrderQaItems } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "work_order_qa_items",
  createSchema: WorkOrderQaItems.CreateQaItemSchema,
  updateSchema: WorkOrderQaItems.UpdateQaItemSchema,
  listQuerySchema: WorkOrderQaItems.ListQaItemsQuerySchema,
  listFilters: [
    { key: "checklist_id", kind: "eq" },
  ],
  searchColumns: ["item_description", "item_code"],
  orderByAllowed: ["sequence_order", "result"],
  defaultOrderBy: "sequence_order",
});

export default router;
