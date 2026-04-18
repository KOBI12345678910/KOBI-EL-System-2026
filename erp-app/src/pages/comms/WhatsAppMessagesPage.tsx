import { CommsTable, CommsStatusBadge, fmtDate } from "./_CommsTable";

interface WhatsAppMessage {
  id: number;
  phone_number: string;
  message_body: string;
  status: string;
  direction: string | null;
  sent_at: string | null;
  created_at: string;
}

export default function WhatsAppMessagesPage() {
  return (
    <CommsTable<WhatsAppMessage>
      title="הודעות WhatsApp"
      apiPath="/api/comms/whatsapp-messages"
      columns={[
        { key: "id", label: "#" },
        { key: "phone_number", label: "טלפון" },
        { key: "message_body", label: "הודעה", render: (r) => (r.message_body ?? "").slice(0, 80) + ((r.message_body ?? "").length > 80 ? "…" : "") },
        { key: "direction", label: "כיוון", render: (r) => r.direction === "inbound" ? "נכנס" : "יוצא" },
        { key: "status", label: "סטטוס", render: (r) => <CommsStatusBadge status={r.status} /> },
        { key: "sent_at", label: "נשלח", render: (r) => fmtDate(r.sent_at) },
        { key: "created_at", label: "נוצר", render: (r) => fmtDate(r.created_at) },
      ]}
    />
  );
}
