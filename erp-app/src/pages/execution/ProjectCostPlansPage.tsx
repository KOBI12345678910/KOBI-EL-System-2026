import { DollarSign } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function ProjectCostPlansPage() {
  return (
    <GenericListPage
      icon={<DollarSign className="h-7 w-7 text-emerald-500" />}
      title="תוכניות עלות פרויקט"
      endpoint="/api/execution/project-cost-plans"
      searchPlaceholder="חיפוש לפי תיאור…"
      columns={[
        { key: "id", label: "#" },
        { key: "project_id", label: "פרויקט" },
        { key: "cost_category", label: "קטגוריה" },
        { key: "planned_amount", label: "מתוכנן", kind: "currency" },
        { key: "committed_amount", label: "הוקצה", kind: "currency" },
        { key: "actual_amount", label: "בפועל", kind: "currency" },
        { key: "currency", label: "מטבע" },
      ]}
    />
  );
}
