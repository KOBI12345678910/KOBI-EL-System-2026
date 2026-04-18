import { GovernanceTable } from "./_GovernanceTable";

interface Row { id: number; entity_type: string; entity_id: number; from_state: string | null; to_state: string; transition: string | null; reason: string | null; occurred_at: string; user_id: number | null; }

export default function StateHistoryPage() {
  return (
    <GovernanceTable<Row>
      title="היסטוריית סטטוסים"
      apiPath="/api/governance/state-history"
      columns={[
        { key: "id", label: "#" },
        { key: "occurred_at", label: "זמן", render: (r) => new Date(r.occurred_at).toLocaleString("he-IL") },
        { key: "entity_type", label: "ישות" },
        { key: "entity_id", label: "מזהה" },
        { key: "from_state", label: "מ" },
        { key: "to_state", label: "אל" },
        { key: "transition", label: "מעבר" },
        { key: "reason", label: "סיבה" },
      ]}
    />
  );
}
