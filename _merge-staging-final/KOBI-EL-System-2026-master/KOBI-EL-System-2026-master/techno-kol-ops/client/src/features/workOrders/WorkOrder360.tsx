import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard } from "../shared/shared360";

export default function WorkOrder360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_work_order_360_fast", { p_work_order_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען הזמנת עבודה..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const w = data.work_order ?? {};

  return (
    <Page360 title={`הזמנת עבודה ${w.wo_number ?? ""}`} subtitle={`${w.project_name ?? ""} · ${w.customer_name ?? ""}`} state={w.state}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="התקדמות" value={`${w.progress_percent ?? 0}%`} />
        <KPI label="עובדים מוקצים" value={data.assigned_employees?.length ?? 0} />
        <KPI label="חומרים" value={data.materials?.length ?? 0} />
        <KPI label="משימות" value={data.tasks?.length ?? 0} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="דיווח התקדמות" onClick={() => {}} />
        <ActionBtn label="בקשת חומרים" onClick={() => {}} variant="secondary" />
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
