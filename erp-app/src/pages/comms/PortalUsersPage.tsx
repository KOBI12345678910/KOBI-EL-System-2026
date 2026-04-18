import { CommsTable, CommsStatusBadge, fmtDate } from "./_CommsTable";

interface PortalUser {
  id: number;
  portal_type: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  status: string;
  last_login_at: string | null;
  created_at: string;
}

export default function PortalUsersPage() {
  return (
    <CommsTable<PortalUser>
      title="משתמשי פורטל"
      apiPath="/api/comms/portal-users"
      columns={[
        { key: "id", label: "#" },
        { key: "portal_type", label: "סוג" },
        { key: "display_name", label: "שם להצגה" },
        { key: "email", label: "אימייל", render: (r) => r.email ?? "—" },
        { key: "phone", label: "טלפון", render: (r) => r.phone ?? "—" },
        { key: "status", label: "סטטוס", render: (r) => <CommsStatusBadge status={r.status} /> },
        { key: "last_login_at", label: "כניסה אחרונה", render: (r) => fmtDate(r.last_login_at) },
        { key: "created_at", label: "נוצר", render: (r) => fmtDate(r.created_at) },
      ]}
    />
  );
}
