import { CommsTable, CommsStatusBadge, fmtDate } from "./_CommsTable";

interface FeedItem {
  id: number;
  channel: string;
  msg_id: number;
  thread_id: number | null;
  title: string | null;
  body: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
}

export default function CommunicationsInboxPage() {
  return (
    <CommsTable<FeedItem & { id: number }>
      title="תיבת תקשורת מאוחדת"
      apiPath="/api/comms/threads/inbox/feed"
      columns={[
        { key: "channel", label: "ערוץ", render: (r) => <CommsStatusBadge status={r.channel} /> },
        { key: "title", label: "נושא", render: (r) => r.title ?? "—" },
        { key: "body", label: "תוכן", render: (r) => (r.body ?? "").slice(0, 100) + ((r.body ?? "").length > 100 ? "…" : "") },
        { key: "status", label: "סטטוס", render: (r) => <CommsStatusBadge status={r.status} /> },
        { key: "sent_at", label: "נשלח", render: (r) => fmtDate(r.sent_at ?? r.created_at) },
      ]}
    />
  );
}
