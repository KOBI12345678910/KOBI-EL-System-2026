import { GovernanceTable, StatusBadge } from "./_GovernanceTable";

interface Row { id: number; event_type: string; aggregate_type: string | null; aggregate_id: number | null; processing_status: string; occurred_at: string; processed_at: string | null; retry_count: number; }

export default function DomainEventsPage() {
  return (
    <GovernanceTable<Row>
      title="אירועי דומיין"
      apiPath="/api/governance/domain-events"
      columns={[
        { key: "id", label: "#" },
        { key: "occurred_at", label: "זמן", render: (r) => new Date(r.occurred_at).toLocaleString("he-IL") },
        { key: "event_type", label: "אירוע" },
        { key: "aggregate_type", label: "ישות" },
        { key: "aggregate_id", label: "מזהה" },
        { key: "processing_status", label: "סטטוס", render: (r) => <StatusBadge status={r.processing_status} /> },
        { key: "retry_count", label: "ניסיונות" },
      ]}
    />
  );
}
