import { GovernanceTable, StatusBadge } from "./_GovernanceTable";
import { Badge } from "@/components/ui/badge";

interface Row { id: number; table_name: string; record_id: number; action: string; user_id: number | null; user_name: string | null; ip_address: string | null; created_at: string; notes: string | null; }

export default function AuditLogsPage() {
  return (
    <GovernanceTable<Row>
      title="יומן ביקורת"
      apiPath="/api/governance/audit-logs"
      columns={[
        { key: "id", label: "#" },
        { key: "created_at", label: "זמן", render: (r) => new Date(r.created_at).toLocaleString("he-IL") },
        { key: "table_name", label: "טבלה" },
        { key: "record_id", label: "רשומה" },
        { key: "action", label: "פעולה", render: (r) => <Badge>{r.action}</Badge> },
        { key: "user_name", label: "משתמש" },
        { key: "ip_address", label: "IP" },
        { key: "notes", label: "הערות" },
      ]}
    />
  );
}
