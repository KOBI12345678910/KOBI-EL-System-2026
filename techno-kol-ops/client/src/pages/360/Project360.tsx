import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard } from "./shared360";

export default function Project360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_project_360_fast", { p_project_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען פרויקט..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const p = data.project ?? {};

  const breadcrumbs = [
    { label: "בית", to: "/" },
    ...(p.customer_id ? [{ label: p.customer_name ?? "לקוח", to: `/customer/${p.customer_id}` }] : []),
    { label: p.project_name ?? `פרויקט #${id}` },
  ];

  return (
    <Page360
      title={p.project_name ?? `פרויקט #${id}`}
      subtitle={`${p.project_number ?? ""} · ${p.customer_name ?? ""}`}
      state={p.state}
      breadcrumbs={breadcrumbs}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="התקדמות" value={`${p.progress_percent ?? 0}%`} />
        <KPI label="תקציב" value={p.budget_amount ? `₪${Number(p.budget_amount).toLocaleString()}` : "—"} />
        <KPI label="עלות בפועל" value={p.actual_cost ? `₪${Number(p.actual_cost).toLocaleString()}` : "—"} />
        <KPI label="חסימות" value={p.blockers_count ?? 0} color={(p.blockers_count ?? 0) > 0 ? "red" : undefined} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="הזמנת עבודה" onClick={() => navigate(`/work-order/new?project=${id}`)} />
        <ActionBtn label="הזמנת רכש" onClick={() => navigate(`/po/new?project=${id}`)} />
      </div>

      <RelatedTable title="הזמנות עבודה" rows={data.work_orders ?? []}
        cols={[
          { key: "wo_number", label: "מספר" },
          { key: "wo_name", label: "שם" },
          { key: "state", label: "סטטוס" },
          { key: "progress_percent", label: "%" },
        ]}
        onRowClick={(r) => navigate(`/work-order/${r.id}`)} />

      <RelatedTable title="הזמנות רכש" rows={data.purchase_orders ?? []}
        cols={[
          { key: "po_number", label: "מספר" },
          { key: "supplier_name", label: "ספק" },
          { key: "total_amount", label: "סכום" },
          { key: "state", label: "סטטוס" },
        ]}
        onRowClick={(r) => navigate(`/po/${r.id}`)} />

      <RelatedTable title="מסמכים" rows={data.documents ?? []}
        cols={[{ key: "filename", label: "קובץ" }, { key: "document_type", label: "סוג" }]} />

      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
