import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard } from "./shared360";

export default function RFQ360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_rfq_360_fast", { p_rfq_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען בקשת הצעת מחיר..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const r = data.rfq ?? {};

  return (
    <Page360 title={`RFQ ${r.rfq_number ?? ""}`} subtitle={`${r.title ?? ""} · מועד אחרון: ${r.response_deadline ?? "—"}`} state={r.state}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="ספקים שהוזמנו" value={data.invited_suppliers?.length ?? 0} />
        <KPI label="הצעות שהתקבלו" value={data.responses?.length ?? 0} />
        <KPI label="תקציב מוערך" value={r.estimated_budget ? `₪${Number(r.estimated_budget).toLocaleString()}` : "—"} />
        <KPI label="מסמכים" value={data.documents?.length ?? 0} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="שלח לספקים" onClick={() => {}} />
        <ActionBtn label="החלטה" onClick={() => {}} variant="secondary" />
      </div>

      <RelatedTable title="ספקים" rows={data.invited_suppliers ?? []}
        cols={[
          { key: "supplier_name", label: "ספק" },
          { key: "response_status", label: "סטטוס" },
          { key: "quoted_total", label: "הצעה" },
        ]}
        onRowClick={(row) => navigate(`/supplier/${row.supplier_id}`)} />

      <RelatedTable title="מסמכים" rows={data.documents ?? []}
        cols={[{ key: "filename", label: "קובץ" }, { key: "document_type", label: "סוג" }]} />

      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
