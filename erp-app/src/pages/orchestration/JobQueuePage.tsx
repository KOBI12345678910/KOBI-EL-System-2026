import { useMutation, useQueryClient } from "@tanstack/react-query";
import { OrchestrationTable, OrchStatusBadge, formatHe } from "./_OrchestrationTable";
import { Button } from "@/components/ui/button";
import { authJson } from "@/lib/utils";
import { RotateCw, XCircle } from "lucide-react";

interface Row {
  id: number;
  queue_name: string;
  job_type: string;
  status: string;
  attempts_count: number;
  max_attempts: number;
  priority: number;
  scheduled_at: string;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
}

export default function JobQueuePage() {
  const qc = useQueryClient();
  const retryMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/orchestration/job-queue/${id}/retry`, {
      method: "POST", body: JSON.stringify({ reset_attempts: false }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/orchestration/job-queue"] }),
  });
  const cancelMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/orchestration/job-queue/${id}/cancel`, {
      method: "POST", body: JSON.stringify({ reason: "cancelled by user" }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/orchestration/job-queue"] }),
  });

  return (
    <OrchestrationTable<Row>
      title="תור משימות"
      apiPath="/api/orchestration/job-queue"
      columns={[
        { key: "id", label: "#" },
        { key: "queue_name", label: "תור" },
        { key: "job_type", label: "סוג" },
        { key: "status", label: "סטטוס", render: (r) => <OrchStatusBadge status={r.status} /> },
        { key: "priority", label: "עדיפות" },
        { key: "attempts", label: "ניסיונות", render: (r) => `${r.attempts_count}/${r.max_attempts}` },
        { key: "scheduled_at", label: "מתוזמן", render: (r) => formatHe(r.scheduled_at) },
        { key: "finished_at", label: "סיום", render: (r) => formatHe(r.finished_at) },
        { key: "last_error", label: "שגיאה" },
      ]}
      rowActions={(r) => (
        <div className="flex gap-1">
          {r.status === "failed" && (
            <Button size="sm" variant="outline" disabled={retryMut.isPending} onClick={() => retryMut.mutate(r.id)}>
              <RotateCw className="h-4 w-4 mr-1" /> נסה שוב
            </Button>
          )}
          {(r.status === "pending" || r.status === "running") && (
            <Button size="sm" variant="outline" disabled={cancelMut.isPending} onClick={() => cancelMut.mutate(r.id)}>
              <XCircle className="h-4 w-4 mr-1" /> בטל
            </Button>
          )}
        </div>
      )}
    />
  );
}
