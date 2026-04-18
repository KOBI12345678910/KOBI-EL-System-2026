import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GovernanceTable, StatusBadge } from "./_GovernanceTable";
import { Button } from "@/components/ui/button";
import { authJson } from "@/lib/utils";
import { Check } from "lucide-react";

interface Row { id: number; rule_key: string; entity_type: string | null; entity_id: number | null; severity: string; message: string | null; is_resolved: boolean; detected_at: string; }

export default function ValidationsLogPage() {
  const qc = useQueryClient();
  const resolveMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/governance/validations-log/${id}/resolve`, {
      method: "POST", body: JSON.stringify({ resolution_note: "resolved manually" }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/governance/validations-log"] }),
  });

  return (
    <GovernanceTable<Row>
      title="יומן ולידציות"
      apiPath="/api/governance/validations-log"
      columns={[
        { key: "id", label: "#" },
        { key: "detected_at", label: "זמן", render: (r) => new Date(r.detected_at).toLocaleString("he-IL") },
        { key: "rule_key", label: "כלל" },
        { key: "entity_type", label: "ישות" },
        { key: "entity_id", label: "מזהה" },
        { key: "severity", label: "חומרה", render: (r) => <StatusBadge status={r.severity} /> },
        { key: "message", label: "הודעה" },
        { key: "is_resolved", label: "סטטוס", render: (r) => <StatusBadge status={r.is_resolved ? "resolved" : "active"} /> },
      ]}
      rowActions={(r) => (
        !r.is_resolved ? (
          <Button size="sm" variant="outline" disabled={resolveMut.isPending} onClick={() => resolveMut.mutate(r.id)}>
            <Check className="h-4 w-4 mr-1" /> סגור
          </Button>
        ) : null
      )}
    />
  );
}
