import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard } from "./shared360";

export default function InventoryItem360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("rpc_get_inventoryitem_360", { p_item_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען פריט מלאי..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const it = data.item ?? {};
  const lowStock = (it.on_hand_qty ?? 0) < (it.reorder_point ?? 0);

  const breadcrumbs = [
    { label: "בית", to: "/" },
    { label: "מלאי", to: "/materials" },
    { label: `${it.item_code ?? id ?? ""}` },
  ];

  return (
    <Page360
      title={`${it.item_code ?? ""} — ${it.item_name ?? ""}`}
      subtitle={`${it.category ?? ""} · ${it.uom ?? ""}`}
      state={lowStock ? "LowStock" : it.state}
      breadcrumbs={breadcrumbs}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="זמין במלאי" value={it.on_hand_qty ?? 0} color={lowStock ? "red" : "green"} />
        <KPI label="משוריין" value={it.reserved_qty ?? 0} />
        <KPI label="בהזמנה" value={it.on_order_qty ?? 0} />
        <KPI label="נקודת הזמנה" value={it.reorder_point ?? "—"} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="מחיר עלות" value={it.cost_price ? `₪${Number(it.cost_price).toLocaleString()}` : "—"} />
        <KPI label="מחיר מכירה" value={it.sell_price ? `₪${Number(it.sell_price).toLocaleString()}` : "—"} />
        <KPI label="ערך מלאי" value={`₪${Number((it.on_hand_qty ?? 0) * (it.cost_price ?? 0)).toLocaleString()}`} />
        <KPI label="ימי מלאי" value={it.days_of_stock ?? "—"} color={lowStock ? "red" : undefined} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="צור הזמנת רכש" onClick={() => navigate(`/po/new?item=${id}`)} />
        <ActionBtn label="התאמת מלאי" onClick={() => navigate(`/inventory/${id}/adjust`)} variant="secondary" />
        <ActionBtn label="העברה בין מחסנים" onClick={() => navigate(`/inventory/${id}/transfer`)} variant="secondary" />
        <ActionBtn label="הדפס תווית" onClick={() => window.open(`/api/inventory/${id}/label`, "_blank")} variant="secondary" />
      </div>
      <RelatedTable title="מחסנים ומיקומים" rows={data.locations ?? []}
        cols={[
          { key: "warehouse_name", label: "מחסן" },
          { key: "bin_location", label: "מיקום" },
          { key: "qty", label: "כמות" },
          { key: "last_count_date", label: "ספירה אחרונה" },
        ]} />
      <RelatedTable title="תנועות מלאי (30 יום)" rows={data.movements ?? []}
        cols={[
          { key: "movement_date", label: "תאריך" },
          { key: "movement_type", label: "סוג" },
          { key: "qty_change", label: "שינוי" },
          { key: "ref_doc", label: "מסמך" },
          { key: "user_name", label: "משתמש" },
        ]} />
      <RelatedTable title="הזמנות רכש פתוחות" rows={data.open_pos ?? []}
        cols={[
          { key: "po_number", label: "מספר" },
          { key: "supplier_name", label: "ספק" },
          { key: "qty_ordered", label: "כמות" },
          { key: "expected_date", label: "צפוי" },
        ]}
        onRowClick={(r) => navigate(`/po/${r.id}`)} />
      <RelatedTable title="ספקים" rows={data.suppliers ?? []}
        cols={[
          { key: "supplier_name", label: "ספק" },
          { key: "last_price", label: "מחיר אחרון" },
          { key: "lead_time_days", label: "זמן אספקה" },
          { key: "is_preferred", label: "מועדף", render: (v: any) => v ? "כן" : "לא" },
        ]}
        onRowClick={(r) => navigate(`/supplier/${r.supplier_id}`)} />
      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
