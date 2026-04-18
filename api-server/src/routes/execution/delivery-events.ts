import { DeliveryEvents } from "@workspace/api-zod/execution";
import { makeCrudRouter } from "./_crud-factory";

const router = makeCrudRouter({
  schema: "execution",
  table: "delivery_events",
  createSchema: DeliveryEvents.CreateDeliveryEventSchema,
  updateSchema: DeliveryEvents.UpdateDeliveryEventSchema,
  listQuerySchema: DeliveryEvents.ListDeliveryEventsQuerySchema,
  listFilters: [
    { key: "project_id", kind: "eq" },
    { key: "work_order_id", kind: "eq" },
    { key: "state", kind: "eq" },
  ],
  searchColumns: ["received_by_name", "notes"],
  orderByAllowed: ["delivered_at", "created_at", "state"],
  defaultOrderBy: "delivered_at",
});

export default router;
