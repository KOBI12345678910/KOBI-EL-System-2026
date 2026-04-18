import { Truck } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function DeliveryEventsPage() {
  return (
    <GenericListPage
      icon={<Truck className="h-7 w-7 text-primary" />}
      title="אירועי משלוח"
      endpoint="/api/execution/delivery-events"
      searchPlaceholder="חיפוש לפי נמען…"
      columns={[
        { key: "id", label: "#" },
        { key: "project_id", label: "פרויקט" },
        { key: "work_order_id", label: "הזמנה" },
        { key: "delivered_at", label: "נמסר", kind: "date" },
        { key: "received_by_name", label: "נמסר ל" },
        { key: "state", label: "סטטוס", kind: "state" },
      ]}
      filters={[
        { key: "state", label: "סטטוס", options: [
          { value: "scheduled", label: "מתוכנן" },
          { value: "in_transit", label: "בדרך" },
          { value: "delivered", label: "נמסר" },
          { value: "confirmed", label: "אושר" },
          { value: "cancelled", label: "בוטל" },
        ]},
      ]}
    />
  );
}
