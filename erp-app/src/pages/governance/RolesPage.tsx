import { GovernanceTable } from "./_GovernanceTable";
import { Badge } from "@/components/ui/badge";

interface Role { id: number; role_code: string; role_name: string; is_system: boolean; is_active: boolean; description: string | null; }

export default function RolesPage() {
  return (
    <GovernanceTable<Role>
      title="תפקידים"
      apiPath="/api/governance/roles"
      columns={[
        { key: "id", label: "#" },
        { key: "role_code", label: "קוד" },
        { key: "role_name", label: "שם" },
        { key: "description", label: "תיאור" },
        { key: "is_system", label: "סוג", render: (r) => r.is_system ? <Badge className="bg-purple-100 text-purple-800">מערכת</Badge> : <Badge>מותאם</Badge> },
      ]}
    />
  );
}
