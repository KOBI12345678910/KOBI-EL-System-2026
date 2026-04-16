import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, Section, ActionBtn, Loader, ErrCard } from "../shared/shared360";

export default function Supplier360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_supplier_360_fast", { p_supplier_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען ספק..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const s = data.supplier ?? {};

  return (
    <Page360 title={s.supplier_name ?? `ספק #${id}`} subtitle={`${s.supplier_number ?? ""} · ${s.city ?? ""}`} state={s.state}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="הזמנות רכש" value={data.purchase_orders?.length ?? 0} />
        <KPI label="RFQs" value={data.rfqs?.length ?? 0} />
        <KPI label="ציון כולל" value={s.overall_score ?? "—"} />
        <KPI label="מסמכים" value={data.documents?.length ?? 0} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="הזמנת רכש חדשה" onClick={() => navigate(`/po/new?supplier=${id}`)} />
        <ActionBtn label="RFQ חדש" onClick={() => navigate(`/rfq/new?supplier=${id}`)} />
      </div>

      <RelatedTable title="הזמנות רכש" rows={data.purchase_orders ?? []}
        cols={[{ key: "po_number", label: "מספר" }, { key: "total_amount", label: "סכום" }, { key: "state", label: "סטטוס" }]}
        onRowClick={(r) => navigate(`/po/${r.id}`)} />

      <RelatedTable title="מסמכים" rows={data.documents ?? []}
        cols={[{ key: "document_number", label: "מספר" }, { key: "filename", label: "קובץ" }, { key: "document_type", label: "סוג" }]} />

      <Section title="יומן פעילות">
        {(data.audit?.length ?? 0) === 0 ? <p className="text-gray-500 text-sm">אין רשומות</p> : (
          <div className="space-y-1 max-h-48 overflow-auto">
            {data.audit.map((a: any) => (
              <div key={a.id} className="flex gap-3 text-xs text-gray-400 py-1 border-b border-gray-800/30">
                <span className="w-32 shrink-0">{a.performed_at?.slice(0, 16)?.replace("T", " ")}</span>
                <span>{a.action_name}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Page360>
  );
}
