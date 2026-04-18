import { useMutation, useQueryClient } from "@tanstack/react-query";
import { OrchestrationTable, OrchStatusBadge, formatHe } from "./_OrchestrationTable";
import { Button } from "@/components/ui/button";
import { authJson } from "@/lib/utils";
import { Zap, ZapOff } from "lucide-react";

interface Row {
  id: number;
  workflow_def_id: number;
  trigger_name: string;
  trigger_type: string;
  is_enabled: boolean;
  last_fired_at: string | null;
  next_fire_at: string | null;
  fire_count: number;
  created_at: string;
}

export default function WorkflowTriggersPage() {
  const qc = useQueryClient();
  const toggleMut = useMutation({
    mutationFn: (r: { id: number; enable: boolean }) => authJson(`/api/orchestration/workflow-triggers/${r.id}/enable`, {
      method: "POST", body: JSON.stringify({ is_enabled: r.enable }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/orchestration/workflow-triggers"] }),
  });

  return (
    <OrchestrationTable<Row>
      title="טריגרים של Workflow"
      apiPath="/api/orchestration/workflow-triggers"
      columns={[
        { key: "id", label: "#" },
        { key: "workflow_def_id", label: "Workflow" },
        { key: "trigger_name", label: "שם טריגר" },
        { key: "trigger_type", label: "סוג" },
        { key: "is_enabled", label: "סטטוס", render: (r) => <OrchStatusBadge status={r.is_enabled ? "active" : "cancelled"} /> },
        { key: "fire_count", label: "ירה" },
        { key: "last_fired_at", label: "ירייה אחרונה", render: (r) => formatHe(r.last_fired_at) },
        { key: "next_fire_at", label: "ירייה הבאה", render: (r) => formatHe(r.next_fire_at) },
        { key: "created_at", label: "נוצר", render: (r) => formatHe(r.created_at) },
      ]}
      rowActions={(r) => (
        <Button
          size="sm"
          variant="outline"
          disabled={toggleMut.isPending}
          onClick={() => toggleMut.mutate({ id: r.id, enable: !r.is_enabled })}
        >
          {r.is_enabled ? <><ZapOff className="h-4 w-4 mr-1" /> כבה</> : <><Zap className="h-4 w-4 mr-1" /> הפעל</>}
        </Button>
      )}
    />
  );
}
