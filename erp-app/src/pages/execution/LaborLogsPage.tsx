import { Clock } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function LaborLogsPage() {
  return (
    <GenericListPage
      icon={<Clock className="h-7 w-7 text-primary" />}
      title="יומני עבודה"
      endpoint="/api/execution/labor-logs"
      searchPlaceholder="חיפוש לפי עובד…"
      columns={[
        { key: "id", label: "#" },
        { key: "employee_name", label: "עובד" },
        { key: "project_id", label: "פרויקט" },
        { key: "activity_type", label: "פעילות" },
        { key: "started_at", label: "התחיל", kind: "date" },
        { key: "duration_minutes", label: "משך (דק')" },
        { key: "state", label: "סטטוס", kind: "state" },
      ]}
      filters={[
        { key: "state", label: "סטטוס", options: [
          { value: "draft", label: "טיוטה" },
          { value: "submitted", label: "הוגש" },
          { value: "approved", label: "אושר" },
          { value: "rejected", label: "נדחה" },
          { value: "billed", label: "חויב" },
        ]},
      ]}
    />
  );
}
