import { CommsTable, CommsStatusBadge, fmtDate } from "./_CommsTable";

interface MessageTemplate {
  id: number;
  template_code: string;
  name: string;
  channel: string;
  subject: string | null;
  locale: string;
  is_active: boolean;
  updated_at: string;
}

export default function MessageTemplatesPage() {
  return (
    <CommsTable<MessageTemplate>
      title="תבניות הודעה"
      apiPath="/api/comms/message-templates"
      columns={[
        { key: "template_code", label: "קוד" },
        { key: "name", label: "שם" },
        { key: "channel", label: "ערוץ", render: (r) => <CommsStatusBadge status={r.channel} /> },
        { key: "subject", label: "נושא", render: (r) => r.subject ?? "—" },
        { key: "locale", label: "שפה" },
        { key: "is_active", label: "פעיל", render: (r) => <CommsStatusBadge status={r.is_active ? "active" : "cancelled"} /> },
        { key: "updated_at", label: "עודכן", render: (r) => fmtDate(r.updated_at) },
      ]}
    />
  );
}
