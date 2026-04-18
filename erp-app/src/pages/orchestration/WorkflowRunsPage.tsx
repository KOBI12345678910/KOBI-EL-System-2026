import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { OrchestrationTable, OrchStatusBadge, formatHe } from "./_OrchestrationTable";
import { Button } from "@/components/ui/button";
import { authJson } from "@/lib/utils";
import { Pause, Play, XCircle, ExternalLink } from "lucide-react";

interface Row {
  id: number;
  workflow_definition_id: number;
  workflow_code: string;
  workflow_name: string;
  status: string;
  priority: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  parent_entity_type: string | null;
  parent_entity_id: number | null;
}

export default function WorkflowRunsPage() {
  const qc = useQueryClient();
  const pauseMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/orchestration/workflow-runs/${id}/pause`, {
      method: "POST", body: JSON.stringify({}),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/orchestration/workflow-runs"] }),
  });
  const resumeMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/orchestration/workflow-runs/${id}/resume`, {
      method: "POST", body: JSON.stringify({}),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/orchestration/workflow-runs"] }),
  });
  const cancelMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/orchestration/workflow-runs/${id}/cancel`, {
      method: "POST", body: JSON.stringify({ reason: "cancelled by user" }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/orchestration/workflow-runs"] }),
  });

  return (
    <OrchestrationTable<Row>
      title="ריצות Workflow"
      apiPath="/api/orchestration/workflow-runs"
      columns={[
        { key: "id", label: "#" },
        { key: "workflow_code", label: "קוד" },
        { key: "workflow_name", label: "שם" },
        { key: "status", label: "סטטוס", render: (r) => <OrchStatusBadge status={r.status} /> },
        { key: "priority", label: "עדיפות" },
        { key: "parent_entity", label: "ישות", render: (r) => r.parent_entity_type ? `${r.parent_entity_type}#${r.parent_entity_id ?? ""}` : "—" },
        { key: "started_at", label: "התחלה", render: (r) => formatHe(r.started_at) },
        { key: "finished_at", label: "סיום", render: (r) => formatHe(r.finished_at) },
        { key: "created_at", label: "נוצר", render: (r) => formatHe(r.created_at) },
      ]}
      rowActions={(r) => (
        <div className="flex gap-1">
          <Link href={`/workflow-runs/${r.id}`}>
            <Button size="sm" variant="outline">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </Link>
          {r.status === "running" || r.status === "pending" ? (
            <Button size="sm" variant="outline" disabled={pauseMut.isPending} onClick={() => pauseMut.mutate(r.id)}>
              <Pause className="h-4 w-4" />
            </Button>
          ) : null}
          {r.status === "paused" ? (
            <Button size="sm" variant="outline" disabled={resumeMut.isPending} onClick={() => resumeMut.mutate(r.id)}>
              <Play className="h-4 w-4" />
            </Button>
          ) : null}
          {["pending", "running", "paused"].includes(r.status) ? (
            <Button size="sm" variant="outline" disabled={cancelMut.isPending} onClick={() => cancelMut.mutate(r.id)}>
              <XCircle className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      )}
    />
  );
}
