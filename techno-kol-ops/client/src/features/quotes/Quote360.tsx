import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard } from "../shared/shared360";

export default function Quote360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_quote_360_fast", { p_quote_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען הצעת מחיר..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const q = data.quote ?? {};

  return (
    <Page360 title={`הצעת מחיר ${q.quote_number ?? ""}`} subtitle={`${q.customer_name ?? ""} · ${q.quote_date ?? ""}`} state={q.state}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="סכום כולל" value={q.grand_total ? `₪${Number(q.grand_total).toLocaleString()}` : "—"} />
        <KPI label="שורות" value={data.line_items?.length ?? 0} />
        <KPI label="תוקף עד" value={q.valid_until ?? "—"} />
        <KPI label="אישור" value={q.approval_status ?? "—"} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="שלח ללקוח" onClick={() => {}} />
        <ActionBtn label="המר להזמנה" onClick={() => {}} variant="secondary" />
      </div>

      <RelatedTable title="שורות" rows={data.line_items ?? []}
        cols={[
          { key: "description", label: "תיאור" },
          { key: "quantity", label: "כמות" },
          { key: "unit_price", label: "מחיר" },
          { key: "line_total", label: "סה״כ" },
        ]} />

      <RelatedTable title="מסמכים" rows={data.documents ?? []}
        cols={[{ key: "filename", label: "קובץ" }, { key: "document_type", label: "סוג" }]} />

      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
