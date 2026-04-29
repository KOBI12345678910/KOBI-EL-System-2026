import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { Page360, KPI, RelatedTable, AuditLog, ActionBtn, Loader, ErrCard } from "./shared360";

export default function Payment360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc("get_payment_360_fast", { p_payment_id: Number(id) })
      .then(({ data: p, error: e }) => { if (e) setError(e.message); else setData(p); setLoading(false); });
  }, [id]);

  if (loading) return <Loader label="טוען תשלום..." />;
  if (error) return <ErrCard msg={error} />;
  if (!data) return <ErrCard msg="לא נמצא" />;

  const p = data.payment ?? {};
  const reconcile = async () => {
    const { error: e } = await supabase.rpc("orchestrator_execute",
      { p_action: "reconcile_payment", p_entity_id: Number(id) });
    if (!e) window.location.reload();
  };

  const breadcrumbs = [
    { label: "בית", to: "/" },
    { label: "כספים", to: "/finance" },
    { label: `תשלום ${p.payment_number ?? id ?? ""}` },
  ];

  return (
    <Page360
      title={`תשלום ${p.payment_number ?? ""}`}
      subtitle={`${p.payer_name ?? ""} · ${p.payment_date ?? ""}`}
      state={p.state}
      breadcrumbs={breadcrumbs}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI label="סכום" value={p.amount ? `₪${Number(p.amount).toLocaleString()}` : "—"} color="green" />
        <KPI label="אמצעי" value={p.payment_method ?? "—"} />
        <KPI label="חשבון בנק" value={p.bank_account_name ?? "—"} />
        <KPI label="הותאם" value={p.is_reconciled ? "כן" : "לא"} color={p.is_reconciled ? "green" : "yellow"} />
      </div>
      <div className="flex gap-2 flex-wrap">
        <ActionBtn label="הוצא קבלה" onClick={() => window.open(`/api/payments/${id}/receipt`, "_blank")} />
        <ActionBtn label="התאם לבנק" onClick={reconcile} variant="secondary" />
        <ActionBtn label="הקצה לחשבונית" onClick={() => {}} variant="secondary" />
        <ActionBtn label="בטל תשלום" onClick={() => {}} variant="secondary" />
      </div>
      <RelatedTable title="חשבוניות שהוקצו" rows={data.allocations ?? []}
        cols={[
          { key: "invoice_number", label: "חשבונית" },
          { key: "invoice_total", label: "סך הכל" },
          { key: "allocated_amount", label: "הוקצה" },
          { key: "remaining_balance", label: "יתרה" },
        ]}
        onRowClick={(r) => navigate(`/finance/${r.invoice_id}`)} />
      <RelatedTable title="פרטי המחאה / העברה" rows={p.payment_method ? [p] : []}
        cols={[
          { key: "check_number", label: "מס׳ המחאה" },
          { key: "check_date", label: "תאריך המחאה" },
          { key: "bank_name", label: "בנק מושך" },
          { key: "bank_branch", label: "סניף" },
          { key: "transaction_ref", label: "אסמכתא" },
        ]} />
      <RelatedTable title="התאמת בנק" rows={data.bank_match ? [data.bank_match] : []}
        cols={[
          { key: "statement_date", label: "תאריך תדפיס" },
          { key: "statement_amount", label: "סכום בתדפיס" },
          { key: "match_status", label: "סטטוס" },
          { key: "matched_by", label: "הותאם ע״י" },
        ]} />
      <AuditLog entries={data.audit ?? []} />
    </Page360>
  );
}
