import { Ruler } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function DrawingsPage() {
  return (
    <GenericListPage
      icon={<Ruler className="h-7 w-7 text-primary" />}
      title="שרטוטים"
      endpoint="/api/execution/drawings"
      searchPlaceholder="חיפוש לפי מספר / כותרת…"
      columns={[
        { key: "drawing_number", label: "מספר" },
        { key: "title", label: "כותרת" },
        { key: "drawing_type", label: "סוג" },
        { key: "current_revision", label: "גרסה" },
        { key: "approval_state", label: "מצב אישור", kind: "state" },
      ]}
      filters={[
        { key: "drawing_type", label: "סוג", options: [
          { value: "mechanical", label: "מכאני" },
          { value: "electrical", label: "חשמלי" },
          { value: "structural", label: "מבני" },
          { value: "assembly", label: "הרכבה" },
          { value: "detail", label: "פרט" },
          { value: "isometric", label: "איזומטרי" },
          { value: "schematic", label: "סכמתי" },
          { value: "piping", label: "צנרת" },
          { value: "layout", label: "תנוחה" },
        ]},
        { key: "approval_state", label: "אישור", options: [
          { value: "draft", label: "טיוטה" },
          { value: "in_review", label: "בסקירה" },
          { value: "approved", label: "אושר" },
          { value: "rejected", label: "נדחה" },
          { value: "superseded", label: "הוחלף" },
          { value: "archived", label: "בארכיון" },
        ]},
      ]}
    />
  );
}
