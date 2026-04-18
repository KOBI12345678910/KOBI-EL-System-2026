import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GovernanceTable, StatusBadge } from "./_GovernanceTable";
import { Button } from "@/components/ui/button";
import { authJson } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

interface Row { id: number; connection_name: string; provider: string; connection_type: string; is_active: boolean; last_sync_at: string | null; last_sync_status: string | null; }

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const syncMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/governance/integrations/${id}/sync-now`, {
      method: "POST", body: JSON.stringify({ direction: "inbound" }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/governance/integrations"] }),
  });

  return (
    <GovernanceTable<Row>
      title="אינטגרציות"
      apiPath="/api/governance/integrations"
      columns={[
        { key: "id", label: "#" },
        { key: "connection_name", label: "שם" },
        { key: "provider", label: "ספק" },
        { key: "connection_type", label: "סוג" },
        { key: "is_active", label: "פעיל", render: (r) => <StatusBadge status={r.is_active ? "active" : "cancelled"} /> },
        { key: "last_sync_at", label: "סנכרון אחרון", render: (r) => r.last_sync_at ? new Date(r.last_sync_at).toLocaleString("he-IL") : "—" },
        { key: "last_sync_status", label: "סטטוס", render: (r) => r.last_sync_status ? <StatusBadge status={r.last_sync_status} /> : "—" },
      ]}
      rowActions={(r) => (
        <Button size="sm" variant="outline" disabled={!r.is_active || syncMut.isPending} onClick={() => syncMut.mutate(r.id)}>
          <RefreshCw className="h-4 w-4 mr-1" /> סנכרן
        </Button>
      )}
    />
  );
}
