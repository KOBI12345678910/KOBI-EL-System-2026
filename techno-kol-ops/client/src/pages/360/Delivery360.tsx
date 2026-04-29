import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard } from "./shared360";

export default function Delivery360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_delivery_360_fast", { p_delivery_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען תעודת משלוח..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const d = data.delivery ?? {};
  const confirmDelivered = async () => {
    const { error: e } = await supabase.rpc("orchestrator_execute",
      { p_action: "confirm_delivery", p_entity_id: Number(id) });
    if (!e) window.location.reload();
  };
  const generateInvoice = async () => {
    const { data: r, error: e } = await supabase.rpc("orchestrator_execute",
      { p_action: "delivery_to_invoice", p_entity_id: Number(id) });
    if (!e && r?.invoice_id) navigate(`/finance/${r.invoice_id}`);
  };

  const breadcrumbs = [
    { label: "בית", to: "/" },
    ...(d.customer_id ? [{ label: d.customer_name ?? "לקוח", to: `/customer/${d.customer_id}` }] : []),
    { label: `תעודת משלוח ${d.delivery_number ?? id ?? ""}` },
  ];

  return (
    <Page360
      title={`תעודת משלוח ${d.delivery_number ?? ""}`}
      subtitle={`${d.customer_name ?? ""} · ${d.delivery_date ?? ""}`}
      state={d.state}
      breadcrumbs={breadcrumbs}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="כתובת" value={d.delivery_address ?? "—"} />
        <KPI label="נהג" value={d.driver_name ?? "—"} />
        <KPI label="רכב" value={d.vehicle_plate ?? "—"} />
        <KPI label="חתום" value={d.signed_at ? "כן" : "לא"} color={d.signed_at ? "green" : "yellow"} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="אישור משלוח" onClick={confirmDelivered} />
        <ActionBtn label="הפק חשבונית" onClick={generateInvoice} variant="secondary" />
        <ActionBtn label="הדפס תעודה" onClick={() => window.open(`/api/deliveries/${id}/print`, "_blank")} variant="secondary" />
        <ActionBtn label="צרף חתימה" onClick={() => navigate(`/signature/${id}`)} variant="secondary" />
      </div>
      <RelatedTable title="פריטים במשלוח" rows={data.line_items ?? []}
        cols={[
          { key: "item_code", label: "קוד" },
          { key: "description", label: "תיאור" },
          { key: "qty_shipped", label: "נשלח" },
          { key: "qty_received", label: "התקבל" },
          { key: "uom", label: "יח׳" },
        ]} />
      <RelatedTable title="הזמנת לקוח" rows={data.source_order ? [data.source_order] : []}
        cols={[
          { key: "order_number", label: "מספר" },
          { key: "order_date", label: "תאריך" },
          { key: "grand_total", label: "סכום" },
        ]}
        onRowClick={(r) => navigate(`/order/${r.id}`)} />
      <RelatedTable title="חשבונית מקושרת" rows={data.invoice ? [data.invoice] : []}
        cols={[
          { key: "invoice_number", label: "מספר" },
          { key: "issue_date", label: "תאריך" },
          { key: "grand_total", label: "סכום" },
          { key: "state", label: "סטטוס" },
        ]}
        onRowClick={(r) => navigate(`/finance/${r.id}`)} />
      <RelatedTable title="מסמכים" rows={data.documents ?? []}
        cols={[
          { key: "filename", label: "קובץ" },
          { key: "document_type", label: "סוג" },
        ]} />
      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
