import { ListTodo } from "lucide-react";
import { useLocation } from "wouter";
import GenericListPage from "./_GenericListPage";

export default function TasksListPage() {
  const [, navigate] = useLocation();
  return (
    <GenericListPage
      icon={<ListTodo className="h-7 w-7 text-primary" />}
      title="משימות"
      endpoint="/api/execution/tasks"
      searchPlaceholder="חיפוש לפי מספר / כותרת…"
      columns={[
        { key: "task_number", label: "מספר" },
        { key: "title", label: "כותרת" },
        { key: "priority", label: "עדיפות" },
        { key: "due_date", label: "יעד", kind: "date" },
        { key: "state", label: "סטטוס", kind: "state" },
      ]}
      filters={[
        { key: "state", label: "סטטוס", options: [
          { value: "backlog", label: "ממתין" },
          { value: "in_progress", label: "בביצוע" },
          { value: "review", label: "בבדיקה" },
          { value: "done", label: "הושלם" },
          { value: "blocked", label: "חסום" },
          { value: "cancelled", label: "בוטל" },
        ]},
        { key: "priority", label: "עדיפות", options: [
          { value: "low", label: "נמוכה" },
          { value: "normal", label: "רגילה" },
          { value: "high", label: "גבוהה" },
          { value: "critical", label: "קריטית" },
        ]},
      ]}
      onRowClick={(row) => navigate(`/tasks/${row.id}`)}
    />
  );
}
