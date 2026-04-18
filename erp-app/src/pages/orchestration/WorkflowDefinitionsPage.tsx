import { Link } from "wouter";
import { OrchestrationTable, OrchStatusBadge } from "./_OrchestrationTable";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface Row {
  id: number;
  workflow_code: string;
  workflow_name: string;
  category: string | null;
  version: number;
  active: boolean;
  description: string | null;
  created_at: string;
}

export default function WorkflowDefinitionsPage() {
  return (
    <OrchestrationTable<Row>
      title="הגדרות Workflow"
      apiPath="/api/orchestration/workflows"
      columns={[
        { key: "id", label: "#" },
        { key: "workflow_code", label: "קוד" },
        { key: "workflow_name", label: "שם" },
        { key: "category", label: "קטגוריה" },
        { key: "version", label: "גרסה" },
        { key: "active", label: "פעיל", render: (r) => <OrchStatusBadge status={r.active ? "active" : "cancelled"} /> },
        { key: "description", label: "תיאור" },
      ]}
      rowActions={(r) => (
        <Link href={`/workflows/${r.id}`}>
          <Button size="sm" variant="outline">
            <ExternalLink className="h-4 w-4 mr-1" /> פתח
          </Button>
        </Link>
      )}
    />
  );
}
