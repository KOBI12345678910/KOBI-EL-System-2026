import { GovernanceTable } from "./_GovernanceTable";

interface Perm { id: number; permission_code: string; permission_name: string; module_name: string | null; description: string | null; }

export default function PermissionsPage() {
  return (
    <GovernanceTable<Perm>
      title="הרשאות"
      apiPath="/api/governance/permissions"
      columns={[
        { key: "id", label: "#" },
        { key: "permission_code", label: "קוד" },
        { key: "permission_name", label: "שם" },
        { key: "module_name", label: "מודול" },
        { key: "description", label: "תיאור" },
      ]}
    />
  );
}
