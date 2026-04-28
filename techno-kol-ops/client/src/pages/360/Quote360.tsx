import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { apiPost, ApiError } from "../../lib/api-client";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard } from "./shared360";

export default function Quote360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const reload = useCallback(() => {
    if (!id) return;
    supabase.rpc("get_quote_360_fast", { p_quote_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  useEffect(() => { reload(); }, [reload]);

  const runAction = async (
    actionKey: string,
    label: string,
    opts: { navigateTo?: (resp: any) => string | null } = {},
  ) => {
    if (!id || acting) return;
    setActing(actionKey);
    setFlash(null);
    try {
      const resp: any = await apiPost("/api/orchestrator/execute", {
        action: actionKey,
        context: { entity: "quote", entity_id: Number(id), actor: "ui" },
      });
      setFlash({ kind: "ok", msg: `${label} בוצע` });
      const next = opts.navigateTo?.(resp);
      if (next) navigate(next);
      else reload();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? "שגיאה";
      setFlash({ kind: "err", msg: `${label} נכשל: ${msg}` });
    } finally {
      setActing(null);
    }
  };

  if (loading) return <Loader label="טוען הצעת מחיר..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const q = data.quote ?? {};

  const breadcrumbs = [
    { label: "בית", to: "/" },
    ...(q.customer_id ? [{ label: q.customer_name ?? "לקוח", to: `/360/customer/${q.customer_id}` }] : []),
    { label: `הצעת מחיר ${q.quote_number ?? id ?? ""}` },
  ];

  return (
    <Page360
      title={`הצעת מחיר ${q.quote_number ?? ""}`}
      subtitle={`${q.customer_name ?? ""} · ${q.quote_date ?? ""}`}
      state={q.state}
      breadcrumbs={breadcrumbs}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="סכום כולל" value={q.grand_total ? `₪${Number(q.grand_total).toLocaleString()}` : "—"} />
        <KPI label="שורות" value={data.line_items?.length ?? 0} />
        <KPI label="תוקף עד" value={q.valid_until ?? "—"} />
        <KPI label="אישור" value={q.approval_status ?? "—"} />
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
          label={acting === "quote.approve" ? "מאשר..." : "אשר ושלח"}
          onClick={() => runAction("quote.approve", "אישור הצעה")}
        />
        <ActionBtn
          label={acting === "quote.convert_to_project" ? "ממיר..." : "המר לפרויקט"}
          onClick={() => runAction("quote.convert_to_project", "המרה לפרויקט", {
            navigateTo: (r) => {
              const newId = r?.effects_executed?.find((x: any) => x.entity === "project")?.new_id;
              return newId ? `/360/project/${newId}` : null;
            },
          })}
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

      <RelatedTable title="מסמכים" rows={data.documents ?? []}
        cols={[{ key: "filename", label: "קובץ" }, { key: "document_type", label: "סוג" }]} />

      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
