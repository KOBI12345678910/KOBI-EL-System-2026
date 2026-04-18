import { LogisticsOrders } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "logistics_orders",
  createSchema: LogisticsOrders.CreateLogisticsOrderSchema,
  updateSchema: LogisticsOrders.UpdateLogisticsOrderSchema,
  listQuerySchema: LogisticsOrders.ListLogisticsOrdersQuerySchema,
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "state", kind: "eq" },
  ],
  searchColumns: ["logistics_number", "destination_name", "destination_address"],
  orderByAllowed: ["scheduled_at", "delivered_at", "created_at", "state"],
  defaultOrderBy: "scheduled_at",
});

export default router;
