import { GovernanceTable, StatusBadge } from "./_GovernanceTable";
import { Badge } from "@/components/ui/badge";

interface Row { id: number; config_key: string; config_value: unknown; description: string | null; is_secret: boolean; is_active: boolean; updated_at: string; }

export default function ConfigEntriesPage() {
  return (
    <GovernanceTable<Row>
      title="הגדרות מערכת"
      apiPath="/api/governance/config"
      columns={[
        { key: "id", label: "#" },
        { key: "config_key", label: "מפתח" },
        { key: "config_value", label: "ערך", render: (r) => r.is_secret ? <Badge>•••</Badge> : <code className="text-xs">{JSON.stringify(r.config_value).slice(0, 120)}</code> },
        { key: "description", label: "תיאור" },
        { key: "is_active", label: "פעיל", render: (r) => <StatusBadge status={r.is_active ? "active" : "cancelled"} /> },
        { key: "updated_at", label: "עדכון", render: (r) => new Date(r.updated_at).toLocaleString("he-IL") },
      ]}
    />
  );
}
