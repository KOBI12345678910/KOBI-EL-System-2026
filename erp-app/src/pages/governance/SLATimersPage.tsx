import { GovernanceTable, StatusBadge } from "./_GovernanceTable";

interface Row { id: number; entity_type: string; entity_id: number; sla_name: string; status: string; scheduled_at: string; deadline_at: string; escalation_level: number; breached_at: string | null; }

export default function SLATimersPage() {
  return (
    <GovernanceTable<Row>
      title="SLA Timers"
      apiPath="/api/governance/sla-timers"
      columns={[
        { key: "id", label: "#" },
        { key: "sla_name", label: "שם SLA" },
        { key: "entity_type", label: "ישות" },
        { key: "entity_id", label: "מזהה" },
        { key: "status", label: "סטטוס", render: (r) => <StatusBadge status={r.status} /> },
        { key: "deadline_at", label: "דדליין", render: (r) => new Date(r.deadline_at).toLocaleString("he-IL") },
        { key: "escalation_level", label: "רמת הסלמה" },
        { key: "breached_at", label: "הפרה", render: (r) => r.breached_at ? new Date(r.breached_at).toLocaleString("he-IL") : "—" },
      ]}
    />
  );
}
