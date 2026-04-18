import { ListChecks } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function WorkOrderTasksPage() {
  return (
    <GenericListPage
      icon={<ListChecks className="h-7 w-7 text-primary" />}
      title="משימות הזמנת עבודה"
      endpoint="/api/execution/work-order-tasks"
      searchPlaceholder="חיפוש לפי שם משימה…"
      columns={[
        { key: "id", label: "#" },
        { key: "work_order_id", label: "הזמנה" },
        { key: "sequence_order", label: "סדר" },
        { key: "task_name", label: "משימה" },
        { key: "due_date", label: "יעד", kind: "date" },
        { key: "state", label: "סטטוס", kind: "state" },
      ]}
    />
  );
}
