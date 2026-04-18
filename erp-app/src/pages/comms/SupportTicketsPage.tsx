import { useState } from "react";
import { CommsTable, CommsStatusBadge, fmtDate } from "./_CommsTable";
import { Button } from "@/components/ui/button";
import { authJson } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface SupportTicket {
  id: number;
  ticket_number: string;
  title: string;
  status: string;
  priority: string | null;
  category: string | null;
  assigned_to_user_id: number | null;
  opened_at: string;
  resolved_at: string | null;
}

export default function SupportTicketsPage() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<number | null>(null);

  async function doAssign(id: number) {
    const raw = window.prompt("מזהה משתמש להקצאה:");
    const uid = Number(raw);
    if (!Number.isInteger(uid) || uid <= 0) return;
    setBusy(id);
    try {
      await authJson(`/api/comms/support-tickets/${id}/assign`, {
        method: "POST",
        body: JSON.stringify({ assigned_to_user_id: uid }),
      });
      qc.invalidateQueries({ queryKey: ["/api/comms/support-tickets"] });
    } finally {
      setBusy(null);
    }
  }

  async function doResolve(id: number) {
    const resolution = window.prompt("תיאור הפתרון:");
    if (!resolution) return;
    setBusy(id);
    try {
      await authJson(`/api/comms/support-tickets/${id}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution }),
      });
      qc.invalidateQueries({ queryKey: ["/api/comms/support-tickets"] });
    } finally {
      setBusy(null);
    }
  }

  return (
    <CommsTable<SupportTicket>
      title="קריאות שירות"
      apiPath="/api/comms/support-tickets"
      columns={[
        { key: "ticket_number", label: "מספר" },
        { key: "title", label: "נושא" },
        { key: "priority", label: "עדיפות", render: (r) => r.priority ?? "—" },
        { key: "status", label: "סטטוס", render: (r) => <CommsStatusBadge status={r.status} /> },
        { key: "assigned_to_user_id", label: "מוקצה", render: (r) => r.assigned_to_user_id ?? "—" },
        { key: "opened_at", label: "נפתח", render: (r) => fmtDate(r.opened_at) },
        { key: "resolved_at", label: "נפתר", render: (r) => fmtDate(r.resolved_at) },
      ]}
      rowActions={(row) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => doAssign(row.id)}>
            הקצה
          </Button>
          <Button size="sm" disabled={busy === row.id || row.status === "resolved" || row.status === "closed"} onClick={() => doResolve(row.id)}>
            סגור
          </Button>
        </div>
      )}
    />
  );
}
