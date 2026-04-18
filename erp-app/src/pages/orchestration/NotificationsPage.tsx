import { useMutation, useQueryClient } from "@tanstack/react-query";
import { OrchestrationTable, OrchStatusBadge, formatHe } from "./_OrchestrationTable";
import { Button } from "@/components/ui/button";
import { authJson } from "@/lib/utils";
import { Check, X, CheckCheck } from "lucide-react";

interface Row {
  id: number;
  notification_number: string;
  recipient_type: string;
  recipient_id: number | null;
  title: string;
  severity: string | null;
  channel: string | null;
  status: string;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
  message_text: string | null;
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/orchestration/notifications"] });

  const readMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/orchestration/notifications/${id}/mark-read`, {
      method: "POST", body: JSON.stringify({ read: true }),
    }),
    onSuccess: invalidate,
  });
  const dismissMut = useMutation({
    mutationFn: (id: number) => authJson(`/api/orchestration/notifications/${id}/dismiss`, {
      method: "POST", body: JSON.stringify({ reason: "dismissed" }),
    }),
    onSuccess: invalidate,
  });
  const markAllMut = useMutation({
    mutationFn: () => authJson(`/api/orchestration/notifications/mark-all-read`, {
      method: "POST", body: JSON.stringify({}),
    }),
    onSuccess: invalidate,
  });

  return (
    <OrchestrationTable<Row>
      title="התראות"
      apiPath="/api/orchestration/notifications"
      actions={
        <Button size="sm" variant="outline" disabled={markAllMut.isPending} onClick={() => markAllMut.mutate()}>
          <CheckCheck className="h-4 w-4 mr-1" /> סמן הכל כנקרא
        </Button>
      }
      columns={[
        { key: "id", label: "#" },
        { key: "notification_number", label: "מספר" },
        { key: "title", label: "כותרת" },
        { key: "severity", label: "חומרה", render: (r) => r.severity ? <OrchStatusBadge status={r.severity} /> : "—" },
        { key: "channel", label: "ערוץ" },
        { key: "status", label: "סטטוס", render: (r) => <OrchStatusBadge status={r.status} /> },
        { key: "recipient", label: "נמען", render: (r) => `${r.recipient_type}${r.recipient_id ? `#${r.recipient_id}` : ""}` },
        { key: "sent_at", label: "נשלחה", render: (r) => formatHe(r.sent_at) },
        { key: "read_at", label: "נקראה", render: (r) => formatHe(r.read_at) },
        { key: "created_at", label: "נוצרה", render: (r) => formatHe(r.created_at) },
      ]}
      rowActions={(r) => (
        <div className="flex gap-1">
          {(r.status === "pending" || r.status === "sent") && (
            <Button size="sm" variant="outline" disabled={readMut.isPending} onClick={() => readMut.mutate(r.id)}>
              <Check className="h-4 w-4 mr-1" /> נקרא
            </Button>
          )}
          {r.status !== "dismissed" && (
            <Button size="sm" variant="outline" disabled={dismissMut.isPending} onClick={() => dismissMut.mutate(r.id)}>
              <X className="h-4 w-4 mr-1" /> דחה
            </Button>
          )}
        </div>
      )}
    />
  );
}
