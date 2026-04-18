import { MapPin } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function SiteVisitsPage() {
  return (
    <GenericListPage
      icon={<MapPin className="h-7 w-7 text-primary" />}
      title="ביקורי שטח"
      endpoint="/api/execution/site-visits"
      searchPlaceholder="חיפוש לפי מספר / אתר…"
      columns={[
        { key: "visit_number", label: "מספר" },
        { key: "visit_type", label: "סוג" },
        { key: "site_name", label: "אתר" },
        { key: "scheduled_at", label: "מתוזמן", kind: "date" },
        { key: "completed_at", label: "הושלם", kind: "date" },
        { key: "state", label: "סטטוס", kind: "state" },
      ]}
      filters={[
        { key: "state", label: "סטטוס", options: [
          { value: "scheduled", label: "מתוזמן" },
          { value: "en_route", label: "בדרך" },
          { value: "on_site", label: "באתר" },
          { value: "completed", label: "הושלם" },
          { value: "cancelled", label: "בוטל" },
          { value: "no_show", label: "לא הגיע" },
        ]},
        { key: "visit_type", label: "סוג ביקור", options: [
          { value: "survey", label: "סקר" },
          { value: "measurement", label: "מדידה" },
          { value: "delivery", label: "משלוח" },
          { value: "installation", label: "התקנה" },
          { value: "inspection", label: "בדיקה" },
          { value: "service", label: "שירות" },
          { value: "handover", label: "מסירה" },
        ]},
      ]}
    />
  );
}
