import { AlertTriangle } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function ProjectRisksPage() {
  return (
    <GenericListPage
      icon={<AlertTriangle className="h-7 w-7 text-amber-500" />}
      title="סיכוני פרויקטים"
      endpoint="/api/execution/project-risks"
      searchPlaceholder="חיפוש לפי כותרת…"
      columns={[
        { key: "id", label: "#" },
        { key: "project_id", label: "פרויקט" },
        { key: "risk_title", label: "סיכון" },
        { key: "likelihood", label: "סבירות" },
        { key: "impact", label: "השפעה" },
        { key: "state", label: "סטטוס", kind: "state" },
      ]}
      filters={[
        { key: "state", label: "סטטוס", options: [
          { value: "identified", label: "זוהה" },
          { value: "mitigating", label: "בטיפול" },
          { value: "accepted", label: "מתקבל" },
          { value: "closed", label: "סגור" },
        ]},
      ]}
    />
  );
}
