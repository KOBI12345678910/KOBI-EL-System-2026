import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard, executeAction } from "./shared360";

export default function Closure360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_closure_360_fast", { p_project_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען סגירת פרויקט..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const c = data.closure ?? {};
  const profitColor = (c.profit_margin_pct ?? 0) >= 15 ? "green" : (c.profit_margin_pct ?? 0) >= 5 ? "yellow" : "red";
  const closeProject = async () => {
    const { error: e } = await supabase.rpc("orchestrator_execute",
      { p_action: "close_project", p_entity_id: Number(id) });
    if (!e) navigate(`/project/${id}`);
  };

  const breadcrumbs = [
    { label: "בית", to: "/" },
    { label: `פרויקט ${c.project_number ?? id ?? ""}`, to: `/project/${id}` },
    { label: "סגירה" },
  ];

  return (
    <Page360
      title={`סגירת פרויקט ${c.project_number ?? ""}`}
      subtitle={`${c.project_name ?? ""} · ${c.customer_name ?? ""}`}
      state={c.state}
      breadcrumbs={breadcrumbs}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="הכנסות" value={c.total_revenue ? `₪${Number(c.total_revenue).toLocaleString()}` : "—"} color="green" />
        <KPI label="עלויות" value={c.total_cost ? `₪${Number(c.total_cost).toLocaleString()}` : "—"} color="red" />
        <KPI label="רווח גולמי" value={c.gross_profit ? `₪${Number(c.gross_profit).toLocaleString()}` : "—"} />
        <KPI label="שולי רווח %" value={c.profit_margin_pct ? `${c.profit_margin_pct}%` : "—"} color={profitColor} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="סיום בפועל" value={c.actual_end_date ?? "—"} />
        <KPI label="ימי איחור" value={c.days_late ?? 0} color={(c.days_late ?? 0) > 0 ? "red" : "green"} />
        <KPI label="שביעות רצון" value={c.customer_satisfaction ? `${c.customer_satisfaction}/10` : "—"} />
        <KPI label="חוב פתוח" value={c.outstanding_balance ? `₪${Number(c.outstanding_balance).toLocaleString()}` : "₪0"} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="סגור פרויקט סופית" onClick={closeProject} />
        <ActionBtn label="הפק תעודת סיום" onClick={() => window.open(`/api/projects/${id}/completion-cert`, "_blank")} variant="secondary" />
        <ActionBtn
          label="שלח שאלון לקוח"
          onClick={async () => {
            if (!id) return;
            try {
              await executeAction("project.send_satisfaction_survey", "project", id);
              window.location.reload();
            } catch (err) {
              alert(`שליחת שאלון נכשלה: ${(err as Error)?.message ?? "שגיאה"}`);
            }
          }}
          variant="secondary"
        />
        <ActionBtn
          label="פתח מחדש"
          onClick={async () => {
            if (!id) return;
            if (!window.confirm("האם לפתוח את הפרויקט מחדש?")) return;
            try {
              await executeAction("project.reopen", "project", id);
              navigate(`/project/${id}`);
            } catch (err) {
              alert(`פתיחה מחדש נכשלה: ${(err as Error)?.message ?? "שגיאה"}`);
            }
          }}
          variant="secondary"
        />
      </div>
      <RelatedTable title="צ'קליסט סגירה" rows={data.checklist ?? []}
        cols={[
          { key: "task_name", label: "משימה" },
          { key: "is_complete", label: "הושלם", render: (v: any) => v ? "כן" : "לא" },
          { key: "completed_by", label: "ע״י" },
          { key: "completed_at", label: "תאריך" },
        ]} />
      <RelatedTable title="כל החשבוניות" rows={data.invoices ?? []}
        cols={[
          { key: "invoice_number", label: "מספר" },
          { key: "grand_total", label: "סכום" },
          { key: "balance_due", label: "יתרה" },
          { key: "state", label: "סטטוס" },
        ]}
        onRowClick={(r) => navigate(`/finance/${r.id}`)} />
      <RelatedTable title="כל התשלומים" rows={data.payments ?? []}
        cols={[
          { key: "payment_number", label: "מספר" },
          { key: "payment_date", label: "תאריך" },
          { key: "amount", label: "סכום" },
        ]}
        onRowClick={(r) => navigate(`/payment/${r.id}`)} />
      <RelatedTable title="לקחים נלמדים" rows={data.lessons_learned ?? []}
        cols={[
          { key: "category", label: "קטגוריה" },
          { key: "description", label: "תיאור" },
          { key: "owner_name", label: "אחראי" },
        ]} />
      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
