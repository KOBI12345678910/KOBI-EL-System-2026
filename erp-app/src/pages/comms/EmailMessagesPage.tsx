import { CommsTable, CommsStatusBadge, fmtDate } from "./_CommsTable";

interface EmailMessage {
  id: number;
  subject: string | null;
  to_addresses: string | null;
  from_address: string | null;
  status: string;
  direction: string | null;
  sent_at: string | null;
  created_at: string;
}

export default function EmailMessagesPage() {
  return (
    <CommsTable<EmailMessage>
      title="הודעות אימייל"
      apiPath="/api/comms/email-messages"
      columns={[
        { key: "id", label: "#" },
        { key: "subject", label: "נושא", render: (r) => r.subject ?? "—" },
        { key: "to_addresses", label: "נמען", render: (r) => r.to_addresses ?? "—" },
        { key: "direction", label: "כיוון", render: (r) => r.direction === "inbound" ? "נכנס" : "יוצא" },
        { key: "status", label: "סטטוס", render: (r) => <CommsStatusBadge status={r.status} /> },
        { key: "sent_at", label: "נשלח", render: (r) => fmtDate(r.sent_at) },
        { key: "created_at", label: "נוצר", render: (r) => fmtDate(r.created_at) },
      ]}
    />
  );
}
