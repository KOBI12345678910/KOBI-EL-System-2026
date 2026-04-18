import { Boxes } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function ProductionOrdersPage() {
  return (
    <GenericListPage
      icon={<Boxes className="h-7 w-7 text-primary" />}
      title="הזמנות ייצור"
      endpoint="/api/execution/production-orders"
      searchPlaceholder="חיפוש לפי מספר / מוצר…"
      columns={[
        { key: "order_number", label: "מספר" },
        { key: "product_code", label: "קוד מוצר" },
        { key: "quantity_ordered", label: "כמות" },
        { key: "quantity_produced", label: "יוצר" },
        { key: "planned_start", label: "תחילה מתוכננת", kind: "date" },
        { key: "state", label: "סטטוס", kind: "state" },
        { key: "priority", label: "עדיפות" },
      ]}
      filters={[
        { key: "state", label: "סטטוס", options: [
          { value: "draft", label: "טיוטה" },
          { value: "scheduled", label: "מתוכנן" },
          { value: "released", label: "שוחרר" },
          { value: "in_progress", label: "בביצוע" },
          { value: "paused", label: "מושהה" },
          { value: "completed", label: "הושלם" },
          { value: "closed", label: "סגור" },
          { value: "cancelled", label: "בוטל" },
        ]},
        { key: "priority", label: "עדיפות", options: [
          { value: "low", label: "נמוכה" },
          { value: "normal", label: "רגילה" },
          { value: "high", label: "גבוהה" },
          { value: "critical", label: "קריטית" },
        ]},
      ]}
    />
  );
}
