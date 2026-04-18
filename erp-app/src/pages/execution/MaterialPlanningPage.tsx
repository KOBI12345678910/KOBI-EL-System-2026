// MaterialPlanningPage — combined view of project_resources with type=material
import { Package } from "lucide-react";
import GenericListPage from "./_GenericListPage";

export default function MaterialPlanningPage() {
  return (
    <GenericListPage
      icon={<Package className="h-7 w-7 text-primary" />}
      title="תכנון חומרים"
      endpoint="/api/execution/project-resources?resource_type=material"
      searchPlaceholder="חיפוש לפי שם חומר…"
      columns={[
        { key: "id", label: "#" },
        { key: "project_id", label: "פרויקט" },
        { key: "resource_name", label: "חומר" },
        { key: "allocated_hours", label: "כמות מוקצית" },
        { key: "actual_hours", label: "נצרך" },
        { key: "cost_per_hour", label: "עלות ליחידה", kind: "currency" },
        { key: "state", label: "סטטוס", kind: "state" },
      ]}
    />
  );
}
