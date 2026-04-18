import { GovernanceTable, StatusBadge } from "./_GovernanceTable";

interface Row { id: number; connection_id: number; direction: string; entity_type: string | null; status: string; records_processed: number; records_succeeded: number; records_failed: number; started_at: string; finished_at: string | null; }

export default function IntegrationSyncLogsPage() {
  return (
    <GovernanceTable<Row>
      title="לוגים של סינכרון"
      apiPath="/api/governance/integration-sync-logs"
      columns={[
        { key: "id", label: "#" },
        { key: "started_at", label: "התחלה", render: (r) => new Date(r.started_at).toLocaleString("he-IL") },
        { key: "connection_id", label: "חיבור" },
        { key: "direction", label: "כיוון" },
        { key: "entity_type", label: "ישות" },
        { key: "status", label: "סטטוס", render: (r) => <StatusBadge status={r.status} /> },
        { key: "records_processed", label: "עובד" },
        { key: "records_succeeded", label: "הצליח" },
        { key: "records_failed", label: "נכשל" },
      ]}
    />
  );
}
