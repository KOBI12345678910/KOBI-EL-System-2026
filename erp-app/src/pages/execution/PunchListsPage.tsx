import { ListChecks } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function PunchListsPage() {
  return (
    <GenericListPage
      icon={<ListChecks className="h-7 w-7 text-primary" />}
      title="רשימות תיקונים"
      endpoint="/api/execution/punch-lists"
      searchPlaceholder="חיפוש לפי מספר / כותרת…"
      columns={[
        { key: "list_number", label: "מספר" },
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
          { value: "verified", label: "אומת" },
          { value: "closed", label: "סגור" },
          { value: "cancelled", label: "בוטל" },
        ]},
        { key: "severity", label: "חומרה", options: [
          { value: "trivial", label: "זניחה" },
          { value: "minor", label: "קלה" },
          { value: "major", label: "חמורה" },
          { value: "blocker", label: "חוסמת" },
        ]},
      ]}
    />
  );
}
