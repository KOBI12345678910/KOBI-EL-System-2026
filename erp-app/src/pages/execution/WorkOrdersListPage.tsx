import { ClipboardList } from "lucide-react";
import { useLocation } from "wouter";
import GenericListPage from "./_GenericListPage";

export default function WorkOrdersListPage() {
  const [, navigate] = useLocation();
  return (
    <GenericListPage
      icon={<ClipboardList className="h-7 w-7 text-primary" />}
      title="הזמנות עבודה"
      endpoint="/api/execution/work-orders"
      searchPlaceholder="חיפוש לפי מספר / כותרת…"
      columns={[
        { key: "work_order_number", label: "מספר" },
        { key: "title", label: "כותרת" },
        { key: "project_id", label: "פרויקט" },
        { key: "required_start_date", label: "תחילה מתוכננת", kind: "date" },
        { key: "state", label: "סטטוס", kind: "state" },
        { key: "quality_status", label: "איכות" },
      ]}
      filters={[
        { key: "state", label: "סטטוס", options: [
          { value: "draft", label: "טיוטה" },
          { value: "approved", label: "אושר" },
          { value: "in_progress", label: "בביצוע" },
          { value: "qa", label: "בדיקת איכות" },
          { value: "done", label: "הושלם" },
          { value: "closed", label: "סגור" },
        ]},
      ]}
      onRowClick={(row) => navigate(`/work-orders/${row.id}`)}
    />
  );
}
