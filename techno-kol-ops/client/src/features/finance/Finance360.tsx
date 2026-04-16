import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, Loader, ErrCard } from "../shared/shared360";

export default function Finance360() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_finance_360_fast", { p_invoice_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען מסמך פיננסי..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const inv = data.invoice ?? {};

  return (
    <Page360 title={`חשבונית ${inv.invoice_number ?? ""}`} subtitle={`${inv.customer_name ?? ""} · ${inv.issue_date ?? ""}`} state={inv.state}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="סכום כולל" value={inv.grand_total ? `₪${Number(inv.grand_total).toLocaleString()}` : "—"} />
        <KPI label="יתרה לתשלום" value={inv.balance_due ? `₪${Number(inv.balance_due).toLocaleString()}` : "₪0"} color={Number(inv.balance_due ?? 0) > 0 ? "red" : "green"} />
        <KPI label="תאריך פירעון" value={inv.due_date ?? "—"} />
        <KPI label="תשלומים" value={data.payments?.length ?? 0} />
      </div>

      <RelatedTable title="שורות חשבונית" rows={data.line_items ?? []}
        cols={[
          { key: "description", label: "תיאור" },
          { key: "quantity", label: "כמות" },
          { key: "unit_price", label: "מחיר" },
          { key: "line_total", label: "סה״כ" },
        ]} />

      <RelatedTable title="תשלומים" rows={data.payments ?? []}
        cols={[
          { key: "payment_number", label: "מספר" },
          { key: "payment_date", label: "תאריך" },
          { key: "amount", label: "סכום" },
          { key: "method", label: "אמצעי" },
        ]} />

      <RelatedTable title="מסמכים" rows={data.documents ?? []}
        cols={[{ key: "filename", label: "קובץ" }, { key: "document_type", label: "סוג" }]} />

      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
