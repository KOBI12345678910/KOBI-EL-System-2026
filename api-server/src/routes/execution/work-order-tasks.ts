import { WorkOrderTasks } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "work_order_tasks",
  createSchema: WorkOrderTasks.CreateWorkOrderTaskSchema,
  updateSchema: WorkOrderTasks.UpdateWorkOrderTaskSchema,
  listQuerySchema: WorkOrderTasks.ListWorkOrderTasksQuerySchema,
  listFilters: [
    { key: "work_order_id", kind: "eq" },
  ],
  searchColumns: ["task_name", "description"],
  orderByAllowed: ["sequence_order", "due_date", "state", "task_name"],
  defaultOrderBy: "sequence_order",
});

export default router;
