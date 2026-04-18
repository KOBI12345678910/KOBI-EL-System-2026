import { GovernanceTable, StatusBadge } from "./_GovernanceTable";

interface Row { id: number; rule_name: string; entity_type: string; escalation_level: number; target_role: string | null; notification_channels: string[]; is_active: boolean; }

export default function EscalationRulesPage() {
  return (
    <GovernanceTable<Row>
      title="כללי הסלמה"
      apiPath="/api/governance/escalation-rules"
      columns={[
        { key: "id", label: "#" },
        { key: "rule_name", label: "שם" },
        { key: "entity_type", label: "ישות" },
        { key: "escalation_level", label: "רמה" },
        { key: "target_role", label: "תפקיד יעד" },
        { key: "notification_channels", label: "ערוצים", render: (r) => (r.notification_channels ?? []).join(", ") },
        { key: "is_active", label: "פעיל", render: (r) => <StatusBadge status={r.is_active ? "active" : "cancelled"} /> },
      ]}
    />
  );
}
