import { CommsTable, CommsStatusBadge, fmtDate } from "./_CommsTable";

interface ChatbotSession {
  id: number;
  state: string;
  channel: string | null;
  user_id: number | null;
  portal_user_id: number | null;
  started_at: string;
  ended_at: string | null;
}

export default function ChatbotSessionsPage() {
  return (
    <CommsTable<ChatbotSession>
      title="שיחות צ׳אטבוט"
      apiPath="/api/comms/chatbot-sessions"
      columns={[
        { key: "id", label: "#" },
        { key: "channel", label: "ערוץ", render: (r) => r.channel ?? "—" },
        { key: "state", label: "מצב", render: (r) => <CommsStatusBadge status={r.state.toLowerCase()} /> },
        { key: "user_id", label: "משתמש פנימי", render: (r) => r.user_id ?? "—" },
        { key: "portal_user_id", label: "משתמש פורטל", render: (r) => r.portal_user_id ?? "—" },
        { key: "started_at", label: "התחיל", render: (r) => fmtDate(r.started_at) },
        { key: "ended_at", label: "הסתיים", render: (r) => fmtDate(r.ended_at) },
      ]}
    />
  );
}
