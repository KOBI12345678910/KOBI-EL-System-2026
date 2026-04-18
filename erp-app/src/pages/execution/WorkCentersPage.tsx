import { Cog } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function WorkCentersPage() {
  return (
    <GenericListPage
      icon={<Cog className="h-7 w-7 text-primary" />}
      title="מרכזי עבודה"
      endpoint="/api/execution/work-centers"
      searchPlaceholder="חיפוש לפי קוד / שם…"
      columns={[
        { key: "code", label: "קוד" },
        { key: "name_he", label: "שם" },
        { key: "center_type", label: "סוג" },
        { key: "capacity_hours_day", label: "קיבולת יומית (ש')" },
        { key: "efficiency_pct", label: "יעילות %" },
        { key: "hourly_cost", label: "עלות/ש'", kind: "currency" },
        { key: "is_active", label: "פעיל" },
      ]}
      filters={[
        { key: "center_type", label: "סוג", options: [
          { value: "machining", label: "מכונות" },
          { value: "welding", label: "ריתוך" },
          { value: "assembly", label: "הרכבה" },
          { value: "painting", label: "צבע" },
          { value: "packaging", label: "אריזה" },
          { value: "cutting", label: "חיתוך" },
          { value: "finishing", label: "גימור" },
          { value: "inspection", label: "בדיקה" },
        ]},
      ]}
    />
  );
}
