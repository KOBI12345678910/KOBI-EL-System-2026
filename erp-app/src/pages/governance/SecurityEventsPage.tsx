import { GovernanceTable, StatusBadge } from "./_GovernanceTable";

interface Row { id: number; event_type: string; severity: string; user_id: number | null; ip_address: string | null; description: string | null; occurred_at: string; acknowledged_at: string | null; }

export default function SecurityEventsPage() {
  return (
    <GovernanceTable<Row>
      title="אירועי אבטחה"
      apiPath="/api/governance/security-events"
      columns={[
        { key: "id", label: "#" },
        { key: "occurred_at", label: "זמן", render: (r) => new Date(r.occurred_at).toLocaleString("he-IL") },
        { key: "event_type", label: "אירוע" },
        { key: "severity", label: "חומרה", render: (r) => <StatusBadge status={r.severity} /> },
        { key: "user_id", label: "משתמש" },
        { key: "ip_address", label: "IP" },
        { key: "description", label: "תיאור" },
        { key: "acknowledged_at", label: "אושר", render: (r) => r.acknowledged_at ? new Date(r.acknowledged_at).toLocaleString("he-IL") : "—" },
      ]}
    />
  );
}
