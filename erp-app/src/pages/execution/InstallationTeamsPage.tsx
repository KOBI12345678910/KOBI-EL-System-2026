import { Users } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function InstallationTeamsPage() {
  return (
    <GenericListPage
      icon={<Users className="h-7 w-7 text-primary" />}
      title="צוותי התקנה"
      endpoint="/api/execution/installation-teams"
      searchPlaceholder="חיפוש לפי קוד / שם צוות…"
      columns={[
        { key: "code", label: "קוד" },
        { key: "team_name", label: "שם צוות" },
        { key: "team_size", label: "גודל" },
        { key: "specialization", label: "התמחות" },
        { key: "home_base", label: "בסיס" },
        { key: "availability_state", label: "זמינות", kind: "state" },
        { key: "is_active", label: "פעיל" },
      ]}
      filters={[
        { key: "availability_state", label: "זמינות", options: [
          { value: "available", label: "זמין" },
          { value: "assigned", label: "משובץ" },
          { value: "on_leave", label: "בחופשה" },
          { value: "unavailable", label: "לא זמין" },
        ]},
      ]}
    />
  );
}
