import { GovernanceTable, StatusBadge } from "./_GovernanceTable";

interface Row { id: number; endpoint_id: number; event_type: string; status: string; attempt: number; response_code: number | null; delivered_at: string | null; created_at: string; }

export default function WebhookDeliveriesPage() {
  return (
    <GovernanceTable<Row>
      title="Webhook Deliveries"
      apiPath="/api/governance/webhook-deliveries"
      columns={[
        { key: "id", label: "#" },
        { key: "created_at", label: "זמן", render: (r) => new Date(r.created_at).toLocaleString("he-IL") },
        { key: "endpoint_id", label: "Endpoint" },
        { key: "event_type", label: "אירוע" },
        { key: "status", label: "סטטוס", render: (r) => <StatusBadge status={r.status} /> },
        { key: "attempt", label: "ניסיון" },
        { key: "response_code", label: "קוד תגובה" },
        { key: "delivered_at", label: "נמסר", render: (r) => r.delivered_at ? new Date(r.delivered_at).toLocaleString("he-IL") : "—" },
      ]}
    />
  );
}
