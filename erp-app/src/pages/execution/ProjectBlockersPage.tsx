import { Ban } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function ProjectBlockersPage() {
  return (
    <GenericListPage
      icon={<Ban className="h-7 w-7 text-red-500" />}
      title="חסמי פרויקטים"
      endpoint="/api/execution/project-blockers"
      searchPlaceholder="חיפוש לפי כותרת…"
      columns={[
        { key: "id", label: "#" },
        { key: "project_id", label: "פרויקט" },
        { key: "title", label: "כותרת" },
        { key: "severity", label: "חומרה" },
        { key: "due_date", label: "יעד", kind: "date" },
        { key: "state", label: "סטטוס", kind: "state" },
      ]}
      filters={[
        { key: "state", label: "סטטוס", options: [
          { value: "open", label: "פתוח" },
          { value: "in_progress", label: "בטיפול" },
          { value: "resolved", label: "נפתר" },
          { value: "escalated", label: "הוסלם" },
          { value: "cancelled", label: "בוטל" },
        ]},
        { key: "severity", label: "חומרה", options: [
          { value: "low", label: "נמוכה" },
          { value: "medium", label: "בינונית" },
          { value: "high", label: "גבוהה" },
          { value: "critical", label: "קריטית" },
        ]},
      ]}
    />
  );
}
