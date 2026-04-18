import { Hammer } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function InstallationEventsPage() {
  return (
    <GenericListPage
      icon={<Hammer className="h-7 w-7 text-primary" />}
      title="אירועי התקנה"
      endpoint="/api/execution/installation-events"
      searchPlaceholder="חיפוש לפי הערות…"
      columns={[
        { key: "id", label: "#" },
        { key: "project_id", label: "פרויקט" },
        { key: "work_order_id", label: "הזמנה" },
        { key: "installed_at", label: "הותקן", kind: "date" },
        { key: "state", label: "סטטוס", kind: "state" },
      ]}
      filters={[
        { key: "state", label: "סטטוס", options: [
          { value: "scheduled", label: "מתוכנן" },
          { value: "en_route", label: "בדרך" },
          { value: "installed", label: "הותקן" },
          { value: "signed_off", label: "אושר לחתימה" },
          { value: "cancelled", label: "בוטל" },
        ]},
      ]}
    />
  );
}
