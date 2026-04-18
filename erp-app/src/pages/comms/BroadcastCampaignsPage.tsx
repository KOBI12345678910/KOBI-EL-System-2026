import { useState } from "react";
import { CommsTable, CommsStatusBadge, fmtDate } from "./_CommsTable";
import { Button } from "@/components/ui/button";
import { authJson } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface Campaign {
  id: number;
  campaign_code: string;
  name: string;
  channel: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export default function BroadcastCampaignsPage() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<number | null>(null);

  async function doExecute(id: number) {
    const ok = window.confirm("להפעיל את הקמפיין? פעולה זו תתחיל בשליחה.");
    if (!ok) return;
    setBusy(id);
    try {
      await authJson(`/api/comms/broadcast-campaigns/${id}/execute`, {
        method: "POST",
        body: JSON.stringify({ dry_run: false }),
      });
      qc.invalidateQueries({ queryKey: ["/api/comms/broadcast-campaigns"] });
    } finally {
      setBusy(null);
    }
  }

  return (
    <CommsTable<Campaign>
      title="קמפיינים ושידור"
      apiPath="/api/comms/broadcast-campaigns"
      columns={[
        { key: "campaign_code", label: "קוד" },
        { key: "name", label: "שם" },
        { key: "channel", label: "ערוץ", render: (r) => <CommsStatusBadge status={r.channel} /> },
        { key: "status", label: "סטטוס", render: (r) => <CommsStatusBadge status={r.status} /> },
        { key: "recipient_count", label: "נמענים" },
        { key: "sent_count", label: "נשלחו" },
        { key: "failed_count", label: "כשלו" },
        { key: "scheduled_at", label: "מתוזמן", render: (r) => fmtDate(r.scheduled_at) },
        { key: "started_at", label: "התחיל", render: (r) => fmtDate(r.started_at) },
        { key: "completed_at", label: "הסתיים", render: (r) => fmtDate(r.completed_at) },
      ]}
      rowActions={(row) => (
        <Button
          size="sm"
          disabled={busy === row.id || row.status === "sending" || row.status === "completed" || row.status === "cancelled"}
          onClick={() => doExecute(row.id)}
        >
          הפעל
        </Button>
      )}
    />
  );
}
