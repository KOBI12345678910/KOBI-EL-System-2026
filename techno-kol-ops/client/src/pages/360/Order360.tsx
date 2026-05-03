import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard, executeAction } from "./shared360";

export default function Order360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_order_360_fast", { p_order_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען הזמנה..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const o = data.order ?? {};
  const createProject = async () => {
    const { data: r, error: e } = await supabase.rpc("orchestrator_execute",
      { p_action: "order_to_project", p_entity_id: Number(id) });
    if (!e && r?.project_id) navigate(`/project/${r.project_id}`);
  };

  const breadcrumbs = [
    { label: "בית", to: "/" },
    ...(o.customer_id ? [{ label: o.customer_name ?? "לקוח", to: `/customer/${o.customer_id}` }] : []),
    { label: `הזמנה ${o.order_number ?? id ?? ""}` },
  ];

  return (
    <Page360
      title={`הזמנה ${o.order_number ?? ""}`}
      subtitle={`${o.customer_name ?? ""} · ${o.order_date ?? ""}`}
      state={o.state}
      breadcrumbs={breadcrumbs}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="סכום כולל" value={o.grand_total ? `₪${Number(o.grand_total).toLocaleString()}` : "—"} />
        <KPI label="שורות" value={data.line_items?.length ?? 0} />
        <KPI label="תאריך אספקה" value={o.delivery_date ?? "—"} />
        <KPI label="תנאי תשלום" value={o.payment_terms ?? "—"} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="פתח פרויקט" onClick={createProject} />
        <ActionBtn label="צור הזמנת רכש" onClick={() => navigate(`/po/new?order=${id}`)} variant="secondary" />
        <ActionBtn label="הדפס הזמנה" onClick={() => window.open(`/api/orders/${id}/print`, "_blank")} variant="secondary" />
        <ActionBtn
          label="בטל הזמנה"
          onClick={async () => {
            if (!id) return;
            if (!window.confirm("האם לבטל את ההזמנה?")) return;
            try {
              await executeAction("order.cancel", "order", id);
              window.location.reload();
            } catch (err) {
              alert(`ביטול הזמנה נכשל: ${(err as Error)?.message ?? "שגיאה"}`);
            }
          }}
          variant="secondary"
        />
      </div>
      <RelatedTable title="שורות הזמנה" rows={data.line_items ?? []}
        cols={[
          { key: "line_number", label: "#" },
          { key: "description", label: "תיאור" },
          { key: "quantity", label: "כמות" },
          { key: "unit_price", label: "מחיר יחידה" },
          { key: "line_total", label: "סה״כ" },
        ]} />
      <RelatedTable title="פרויקט מקושר" rows={data.projects ?? []}
        cols={[
          { key: "project_number", label: "מספר" },
          { key: "project_name", label: "שם" },
          { key: "progress_percent", label: "%" },
          { key: "state", label: "סטטוס" },
        ]}
        onRowClick={(r) => navigate(`/project/${r.id}`)} />
      <RelatedTable title="הצעת מחיר מקור" rows={data.source_quote ? [data.source_quote] : []}
        cols={[
          { key: "quote_number", label: "מספר" },
          { key: "grand_total", label: "סכום" },
          { key: "state", label: "סטטוס" },
        ]}
        onRowClick={(r) => navigate(`/quote/${r.id}`)} />
      <RelatedTable title="חשבוניות" rows={data.invoices ?? []}
        cols={[
          { key: "invoice_number", label: "מספר" },
          { key: "issue_date", label: "תאריך" },
          { key: "grand_total", label: "סכום" },
          { key: "balance_due", label: "יתרה" },
        ]}
        onRowClick={(r) => navigate(`/finance/${r.id}`)} />
      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
