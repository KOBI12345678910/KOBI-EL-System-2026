import { History } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function RevisionControlPage() {
  return (
    <GenericListPage
      icon={<History className="h-7 w-7 text-primary" />}
      title="בקרת גרסאות"
      endpoint="/api/execution/revision-control"
      searchPlaceholder="חיפוש לפי קוד גרסה / סיבה…"
      columns={[
        { key: "id", label: "#" },
        { key: "entity_type", label: "סוג ישות" },
        { key: "entity_id", label: "מזהה" },
        { key: "revision_code", label: "קוד גרסה" },
        { key: "revision_number", label: "מספר" },
        { key: "state", label: "סטטוס", kind: "state" },
      ]}
      filters={[
        { key: "entity_type", label: "סוג ישות", options: [
          { value: "drawing", label: "שרטוט" },
          { value: "bom_header", label: "BOM" },
          { value: "specification", label: "מפרט" },
          { value: "work_order", label: "הזמנת עבודה" },
          { value: "project", label: "פרויקט" },
        ]},
        { key: "state", label: "סטטוס", options: [
          { value: "draft", label: "טיוטה" },
          { value: "in_review", label: "בסקירה" },
          { value: "approved", label: "אושר" },
          { value: "rejected", label: "נדחה" },
          { value: "superseded", label: "הוחלף" },
        ]},
      ]}
    />
  );
}
