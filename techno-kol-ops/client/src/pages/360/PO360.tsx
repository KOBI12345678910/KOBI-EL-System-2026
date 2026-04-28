import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { apiPost, ApiError } from "../../lib/api-client";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard } from "./shared360";

export default function PO360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const reload = useCallback(() => {
    if (!id) return;
    supabase.rpc("get_po_360_fast", { p_po_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  const runAction = async (actionKey: string, label: string) => {
    if (!id || acting) return;
    setActing(actionKey);
    setFlash(null);
    try {
      await apiPost("/api/orchestrator/execute", {
        action: actionKey,
        context: { entity: "po", entity_id: Number(id), actor: "ui" },
      });
      setFlash({ kind: "ok", msg: `${label} בוצע` });
      reload();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? "שגיאה";
      setFlash({ kind: "err", msg: `${label} נכשל: ${msg}` });
    } finally {
      setActing(null);
    }
  };

  if (loading) return <Loader label="טוען הזמנת רכש..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const po = data.purchase_order ?? {};

  const breadcrumbs = [
    { label: "בית", to: "/" },
    ...(po.supplier_id ? [{ label: po.supplier_name ?? "ספק", to: `/360/supplier/${po.supplier_id}` }] : []),
    ...(po.project_id ? [{ label: po.project_name ?? "פרויקט", to: `/360/project/${po.project_id}` }] : []),
    { label: `הזמנת רכש ${po.po_number ?? id ?? ""}` },
  ];

  return (
    <Page360
      title={`הזמנת רכש ${po.po_number ?? ""}`}
      subtitle={`${po.supplier_name ?? ""} · ${po.order_date ?? ""}`}
      state={po.state}
      breadcrumbs={breadcrumbs}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="סכום כולל" value={po.total_amount ? `₪${Number(po.total_amount).toLocaleString()}` : "—"} />
        <KPI label="שורות" value={data.line_items?.length ?? 0} />
        <KPI label="אספקה צפויה" value={po.expected_delivery_date ?? "—"} />
        <KPI label="קבלות" value={data.receipts?.length ?? 0} />
      </div>

      {flash && (
        <div className={`text-sm px-3 py-2 rounded border ${flash.kind === "ok"
          ? "bg-green-900/20 border-green-500/40 text-green-300"
          : "bg-red-900/20 border-red-500/40 text-red-300"}`}>
          {flash.msg}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <ActionBtn
          label={acting === "po.receive_items" ? "רושם..." : "קבלת סחורה"}
          onClick={() => runAction("po.receive_items", "קבלת סחורה")}
        />
        <ActionBtn
          label="פתח ספק"
          onClick={() => po.supplier_id && navigate(`/360/supplier/${po.supplier_id}`)}
          variant="secondary"
        />
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
