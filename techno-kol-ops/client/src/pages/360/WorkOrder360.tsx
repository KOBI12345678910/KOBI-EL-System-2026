import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { apiPost, ApiError } from "../../lib/api-client";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard } from "./shared360";

export default function WorkOrder360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const reload = useCallback(() => {
    if (!id) return;
    supabase.rpc("get_work_order_360_fast", { p_work_order_id: Number(id) })
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
        context: { entity: "work_order", entity_id: Number(id), actor: "ui" },
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

  if (loading) return <Loader label="טוען הזמנת עבודה..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const w = data.work_order ?? {};

  const breadcrumbs = [
    { label: "בית", to: "/" },
    ...(w.customer_id ? [{ label: w.customer_name ?? "לקוח", to: `/customer/${w.customer_id}` }] : []),
    ...(w.project_id ? [{ label: w.project_name ?? "פרויקט", to: `/project/${w.project_id}` }] : []),
    { label: `הזמנת עבודה ${w.wo_number ?? id ?? ""}` },
  ];

  return (
    <Page360
      title={`הזמנת עבודה ${w.wo_number ?? ""}`}
      subtitle={`${w.project_name ?? ""} · ${w.customer_name ?? ""}`}
      state={w.state}
      breadcrumbs={breadcrumbs}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="התקדמות" value={`${w.progress_percent ?? 0}%`} />
        <KPI label="עובדים מוקצים" value={data.assigned_employees?.length ?? 0} />
        <KPI label="חומרים" value={data.materials?.length ?? 0} />
        <KPI label="משימות" value={data.tasks?.length ?? 0} />
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
          label={acting === "work_order.start" ? "מתחיל..." : "התחל ביצוע"}
          onClick={() => runAction("work_order.start", "התחלת הזמנת עבודה")}
        />
        <ActionBtn
          label={acting === "work_order.signoff" ? "חותם..." : "חתימה וסגירה"}
          onClick={() => runAction("work_order.signoff", "חתימה וסגירה")}
          variant="secondary"
        />
      </div>

      <RelatedTable title="משימות" rows={data.tasks ?? []}
        cols={[
          { key: "task_name", label: "משימה" },
          { key: "assignee_name", label: "אחראי" },
          { key: "state", label: "סטטוס" },
          { key: "due_date", label: "מועד" },
        ]} />

      <RelatedTable title="חומרים" rows={data.materials ?? []}
        cols={[
          { key: "material_name", label: "חומר" },
          { key: "required_qty", label: "נדרש" },
          { key: "allocated_qty", label: "הוקצה" },
          { key: "state", label: "סטטוס" },
        ]} />

      <RelatedTable title="מסמכים" rows={data.documents ?? []}
        cols={[{ key: "filename", label: "קובץ" }, { key: "document_type", label: "סוג" }]} />

      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
