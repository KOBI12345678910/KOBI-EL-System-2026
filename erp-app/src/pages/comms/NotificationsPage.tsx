import { CommsTable, CommsStatusBadge, fmtDate } from "./_CommsTable";
import { Button } from "@/components/ui/button";
import { authJson } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

interface Notification {
  id: number;
  notification_type: string;
  title: string;
  body: string | null;
  severity: string | null;
  status: string;
  read_at: string | null;
  created_at: string;
}

export default function NotificationsPage() {
  const qc = useQueryClient();

  async function markAllRead() {
    await authJson(`/api/comms/notifications/mark-all-read`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    qc.invalidateQueries({ queryKey: ["/api/comms/notifications"] });
  }

  return (
    <CommsTable<Notification>
      title="התראות"
      apiPath="/api/comms/notifications"
      actions={<Button size="sm" onClick={markAllRead}>סמן הכל כנקרא</Button>}
      columns={[
        { key: "id", label: "#" },
        { key: "title", label: "כותרת" },
        { key: "body", label: "תוכן", render: (r) => (r.body ?? "").slice(0, 80) + ((r.body ?? "").length > 80 ? "…" : "") },
        { key: "severity", label: "חומרה", render: (r) => r.severity ? <CommsStatusBadge status={r.severity} /> : "—" },
        { key: "status", label: "סטטוס", render: (r) => <CommsStatusBadge status={r.status} /> },
        { key: "created_at", label: "נוצרה", render: (r) => fmtDate(r.created_at) },
        { key: "read_at", label: "נקראה", render: (r) => fmtDate(r.read_at) },
      ]}
    />
  );
}
