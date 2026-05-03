import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard, executeAction } from "./shared360";

export default function Lead360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_lead_360_fast", { p_lead_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען ליד..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const l = data.lead ?? {};
  const convertToQuote = async () => {
    const { error: e } = await supabase.rpc("orchestrator_execute",
      { p_action: "convert_lead_to_quote", p_entity_id: Number(id) });
    if (!e) navigate(`/quote/new?lead=${id}`);
  };

  const breadcrumbs = [
    { label: "בית", to: "/" },
    { label: "לידים", to: "/leads" },
    { label: `ליד ${l.lead_number ?? id ?? ""}` },
  ];

  return (
    <Page360
      title={`ליד ${l.lead_number ?? ""}`}
      subtitle={`${l.contact_name ?? ""} · ${l.company_name ?? ""} · ${l.source ?? ""}`}
      state={l.state}
      breadcrumbs={breadcrumbs}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="מקור" value={l.source ?? "—"} />
        <KPI label="ציון BANT" value={l.bant_score ?? "—"} />
        <KPI label="תקציב משוער" value={l.estimated_budget ? `₪${Number(l.estimated_budget).toLocaleString()}` : "—"} />
        <KPI label="ימים מאז יצירה" value={l.days_since_created ?? 0} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="המר להצעת מחיר" onClick={convertToQuote} />
        <ActionBtn label="קבע פגישה" onClick={() => navigate(`/calendar/new?lead=${id}`)} variant="secondary" />
        <ActionBtn label="שלח אימייל" onClick={() => navigate(`/comms/new?lead=${id}`)} variant="secondary" />
        <ActionBtn
          label="סגור כלא רלוונטי"
          onClick={async () => {
            if (!id) return;
            try {
              await executeAction("lead.close_irrelevant", "lead", id);
              window.location.reload();
            } catch (err) {
              alert(`סגירת ליד נכשלה: ${(err as Error)?.message ?? "שגיאה"}`);
            }
          }}
          variant="secondary"
        />
      </div>
      <RelatedTable title="פעילויות" rows={data.activities ?? []}
        cols={[
          { key: "activity_date", label: "תאריך" },
          { key: "activity_type", label: "סוג" },
          { key: "notes", label: "הערות" },
          { key: "owner_name", label: "אחראי" },
        ]} />
      <RelatedTable title="הצעות מחיר שנוצרו" rows={data.quotes ?? []}
        cols={[
          { key: "quote_number", label: "מספר" },
          { key: "grand_total", label: "סכום" },
          { key: "state", label: "סטטוס" },
        ]}
        onRowClick={(r) => navigate(`/quote/${r.id}`)} />
      <RelatedTable title="מסמכים" rows={data.documents ?? []}
        cols={[
          { key: "filename", label: "קובץ" },
          { key: "document_type", label: "סוג" },
        ]} />
      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
