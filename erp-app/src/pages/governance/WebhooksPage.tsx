import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GovernanceTable, StatusBadge } from "./_GovernanceTable";
import { Button } from "@/components/ui/button";
import { authJson } from "@/lib/utils";
import { Send } from "lucide-react";

interface Row { id: number; endpoint_name: string; target_url: string; is_active: boolean; last_triggered_at: string | null; last_status: string | null; event_types: string[]; }

export default function WebhooksPage() {
  const qc = useQueryClient();
  const testMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/governance/webhooks/${id}/test-delivery`, {
      method: "POST", body: JSON.stringify({ event_type: "test.ping", payload: { test: true } }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/governance/webhooks"] }),
  });

  return (
    <GovernanceTable<Row>
      title="Webhooks"
      apiPath="/api/governance/webhooks"
      columns={[
        { key: "id", label: "#" },
        { key: "endpoint_name", label: "שם" },
        { key: "target_url", label: "URL" },
        { key: "event_types", label: "אירועים", render: (r) => (r.event_types ?? []).join(", ") || "—" },
        { key: "is_active", label: "פעיל", render: (r) => <StatusBadge status={r.is_active ? "active" : "cancelled"} /> },
        { key: "last_status", label: "סטטוס אחרון", render: (r) => r.last_status ? <StatusBadge status={r.last_status} /> : "—" },
      ]}
      rowActions={(r) => (
        <Button size="sm" variant="outline" disabled={!r.is_active || testMut.isPending} onClick={() => testMut.mutate(r.id)}>
          <Send className="h-4 w-4 mr-1" /> בדיקה
        </Button>
      )}
    />
  );
}
