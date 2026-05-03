import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard } from "./shared360";

export default function Employee360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_employee_360_fast", { p_employee_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען עובד..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const emp = data.employee ?? {};

  return (
    <Page360 title={emp.full_name ?? `עובד #${id}`} subtitle={`${emp.employee_number ?? ""} · ${emp.department ?? ""} · ${emp.job_title ?? ""}`} state={emp.state}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="ימי חופשה" value={emp.vacation_balance ?? "—"} />
        <KPI label="ימי מחלה" value={emp.sick_balance ?? "—"} />
        <KPI label="שעות נוספות (חודש)" value={emp.overtime_hours_month ?? 0} />
        <KPI label="תלושים" value={data.wage_slips?.length ?? 0} />
      </div>

      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="חישוב שכר" onClick={() => navigate(`/employee/${id}/payroll`)} />
        <ActionBtn label="בקשת חופשה" onClick={() => navigate(`/employee/${id}/leave-request`)} variant="secondary" />
      </div>

      <RelatedTable title="תלושי שכר" rows={data.wage_slips ?? []}
        cols={[
          { key: "period", label: "תקופה" },
          { key: "gross_pay", label: "ברוטו" },
          { key: "net_pay", label: "נטו" },
          { key: "state", label: "סטטוס" },
        ]} />

      <RelatedTable title="נוכחות" rows={data.attendance ?? []}
        cols={[
          { key: "date", label: "תאריך" },
          { key: "clock_in", label: "כניסה" },
          { key: "clock_out", label: "יציאה" },
          { key: "total_hours", label: "שעות" },
        ]}
        limit={30} />

      <RelatedTable title="בקשות חופשה" rows={data.leave_requests ?? []}
        cols={[
          { key: "leave_type", label: "סוג" },
          { key: "start_date", label: "מתאריך" },
          { key: "end_date", label: "עד" },
          { key: "state", label: "סטטוס" },
        ]} />

      <RelatedTable title="מסמכים" rows={data.documents ?? []}
        cols={[{ key: "filename", label: "קובץ" }, { key: "document_type", label: "סוג" }]} />

      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
