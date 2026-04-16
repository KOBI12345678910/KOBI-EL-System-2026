import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard } from "./shared360";

export default function PO360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_po_360_fast", { p_po_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען הזמנת רכש..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const po = data.purchase_order ?? {};

  return (
    <Page360 title={`הזמנת רכש ${po.po_number ?? ""}`} subtitle={`${po.supplier_name ?? ""} · ${po.order_date ?? ""}`} state={po.state}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="סכום כולל" value={po.total_amount ? `₪${Number(po.total_amount).toLocaleString()}` : "—"} />
        <KPI label="שורות" value={data.line_items?.length ?? 0} />
        <KPI label="אספקה צפויה" value={po.expected_delivery_date ?? "—"} />
        <KPI label="קבלות" value={data.receipts?.length ?? 0} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="אשר" onClick={() => {}} />
        <ActionBtn label="שלח לספק" onClick={() => {}} variant="secondary" />
      </div>

      <RelatedTable title="שורות" rows={data.line_items ?? []}
        cols={[
          { key: "description", label: "תיאור" },
          { key: "quantity", label: "כמות" },
          { key: "unit_price", label: "מחיר" },
          { key: "line_total", label: "סה״כ" },
        ]} />

      <RelatedTable title="קבלות" rows={data.receipts ?? []}
        cols={[
          { key: "receipt_number", label: "מספר" },
          { key: "received_date", label: "תאריך" },
          { key: "state", label: "סטטוס" },
        ]} />

      <RelatedTable title="מסמכים" rows={data.documents ?? []}
        cols={[{ key: "filename", label: "קובץ" }, { key: "document_type", label: "סוג" }]} />

      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
