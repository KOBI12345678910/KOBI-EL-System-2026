import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GovernanceTable, StatusBadge } from "./_GovernanceTable";
import { Button } from "@/components/ui/button";
import { authJson } from "@/lib/utils";
import { RotateCw } from "lucide-react";

interface Row { id: number; queue_name: string; job_type: string; status: string; attempts: number; max_attempts: number; scheduled_at: string; last_error: string | null; }

export default function QueueJobsPage() {
  const qc = useQueryClient();
  const retryMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/governance/queue-jobs/${id}/retry`, {
      method: "POST", body: JSON.stringify({ reset_attempts: false }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/governance/queue-jobs"] }),
  });

  return (
    <GovernanceTable<Row>
      title="Queue Jobs"
      apiPath="/api/governance/queue-jobs"
      columns={[
        { key: "id", label: "#" },
        { key: "queue_name", label: "תור" },
        { key: "job_type", label: "סוג" },
        { key: "status", label: "סטטוס", render: (r) => <StatusBadge status={r.status} /> },
        { key: "attempts", label: "ניסיונות", render: (r) => `${r.attempts}/${r.max_attempts}` },
        { key: "scheduled_at", label: "מתוזמן", render: (r) => new Date(r.scheduled_at).toLocaleString("he-IL") },
        { key: "last_error", label: "שגיאה אחרונה" },
      ]}
      rowActions={(r) => (
        r.status === "failed" ? (
          <Button size="sm" variant="outline" disabled={retryMut.isPending} onClick={() => retryMut.mutate(r.id)}>
            <RotateCw className="h-4 w-4 mr-1" /> נסה שוב
          </Button>
        ) : null
      )}
    />
  );
}
