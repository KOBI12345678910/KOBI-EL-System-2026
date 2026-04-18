import { useMutation, useQueryClient } from "@tanstack/react-query";
import { OrchestrationTable, OrchStatusBadge, formatHe } from "./_OrchestrationTable";
import { Button } from "@/components/ui/button";
import { authJson } from "@/lib/utils";
import { Hand, Check, X } from "lucide-react";

interface Row {
  id: number;
  inbox_number: string;
  item_type: string;
  title: string;
  priority: string | null;
  status: string;
  assigned_to_user_id: number | null;
  due_at: string | null;
  created_at: string;
  parent_entity_type: string | null;
  parent_entity_id: number | null;
}

export default function UniversalInboxPage() {
  const qc = useQueryClient();
  const claimMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/orchestration/universal-inbox/${id}/claim`, {
      method: "POST", body: JSON.stringify({}),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/orchestration/universal-inbox"] }),
  });
  const resolveMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/orchestration/universal-inbox/${id}/resolve`, {
      method: "POST", body: JSON.stringify({ resolution_note: "resolved from inbox" }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/orchestration/universal-inbox"] }),
  });
  const dismissMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/orchestration/universal-inbox/${id}/dismiss`, {
      method: "POST", body: JSON.stringify({ reason: "dismissed from inbox" }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/orchestration/universal-inbox"] }),
  });

  return (
    <OrchestrationTable<Row>
      title="תיבת עבודה אחודה"
      apiPath="/api/orchestration/universal-inbox"
      columns={[
        { key: "id", label: "#" },
        { key: "inbox_number", label: "מספר" },
        { key: "item_type", label: "סוג" },
        { key: "title", label: "נושא" },
        { key: "priority", label: "עדיפות", render: (r) => r.priority ? <OrchStatusBadge status={r.priority} /> : "—" },
        { key: "status", label: "סטטוס", render: (r) => <OrchStatusBadge status={r.status} /> },
        { key: "assigned_to", label: "משויך", render: (r) => r.assigned_to_user_id ? `#${r.assigned_to_user_id}` : "—" },
        { key: "parent_entity", label: "ישות", render: (r) => r.parent_entity_type ? `${r.parent_entity_type}#${r.parent_entity_id ?? ""}` : "—" },
        { key: "due_at", label: "יעד", render: (r) => formatHe(r.due_at) },
        { key: "created_at", label: "נוצר", render: (r) => formatHe(r.created_at) },
      ]}
      rowActions={(r) => (
        <div className="flex gap-1">
          {r.status === "open" && (
            <Button size="sm" variant="outline" disabled={claimMut.isPending} onClick={() => claimMut.mutate(r.id)}>
              <Hand className="h-4 w-4 mr-1" /> קח
            </Button>
          )}
          {(r.status === "open" || r.status === "claimed") && (
            <>
              <Button size="sm" variant="outline" disabled={resolveMut.isPending} onClick={() => resolveMut.mutate(r.id)}>
                <Check className="h-4 w-4 mr-1" /> סגור
              </Button>
              <Button size="sm" variant="outline" disabled={dismissMut.isPending} onClick={() => dismissMut.mutate(r.id)}>
                <X className="h-4 w-4 mr-1" /> דחה
              </Button>
            </>
          )}
        </div>
      )}
    />
  );
}
