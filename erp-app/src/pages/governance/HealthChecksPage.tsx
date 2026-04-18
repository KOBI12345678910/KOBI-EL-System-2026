import { GovernanceTable, StatusBadge } from "./_GovernanceTable";

interface Row { id: number; check_type: string; check_name: string; status: string; last_run_at: string | null; details: Record<string, unknown> | null; }

export default function HealthChecksPage() {
  return (
    <GovernanceTable<Row>
      title="בדיקות תקינות"
      apiPath="/api/governance/health-checks"
      columns={[
        { key: "id", label: "#" },
        { key: "check_type", label: "סוג" },
        { key: "check_name", label: "שם" },
        { key: "status", label: "סטטוס", render: (r) => <StatusBadge status={r.status} /> },
        { key: "last_run_at", label: "ריצה אחרונה", render: (r) => r.last_run_at ? new Date(r.last_run_at).toLocaleString("he-IL") : "—" },
      ]}
    />
  );
}
