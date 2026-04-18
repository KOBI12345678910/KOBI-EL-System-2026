import { GovernanceTable, StatusBadge } from "./_GovernanceTable";
import { Badge } from "@/components/ui/badge";

interface Row { id: number; flag_key: string; flag_name: string; is_enabled: boolean; rollout_percent: number; description: string | null; }

export default function FeatureFlagsPage() {
  return (
    <GovernanceTable<Row>
      title="Feature Flags"
      apiPath="/api/governance/feature-flags"
      columns={[
        { key: "id", label: "#" },
        { key: "flag_key", label: "מפתח" },
        { key: "flag_name", label: "שם" },
        { key: "is_enabled", label: "מופעל", render: (r) => <StatusBadge status={r.is_enabled ? "active" : "cancelled"} /> },
        { key: "rollout_percent", label: "אחוז", render: (r) => <Badge>{Number(r.rollout_percent ?? 0)}%</Badge> },
        { key: "description", label: "תיאור" },
      ]}
    />
  );
}
