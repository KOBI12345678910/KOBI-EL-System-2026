import { GovernanceTable, StatusBadge } from "./_GovernanceTable";
import { Badge } from "@/components/ui/badge";

interface User { id: number; username: string; email: string | null; full_name: string | null; is_active: boolean; last_login_at: string | null; created_at: string; }

export default function UsersPage() {
  return (
    <GovernanceTable<User>
      title="משתמשים"
      apiPath="/api/governance/users"
      columns={[
        { key: "id", label: "#" },
        { key: "username", label: "שם משתמש" },
        { key: "full_name", label: "שם מלא" },
        { key: "email", label: "אימייל" },
        { key: "is_active", label: "פעיל", render: (r) => <StatusBadge status={r.is_active ? "active" : "cancelled"} /> },
        { key: "last_login_at", label: "כניסה אחרונה", render: (r) => r.last_login_at ? new Date(r.last_login_at).toLocaleString("he-IL") : "—" },
      ]}
    />
  );
}
