import { useRoute } from "wouter";
import { useDetail, StatusBadge, Loading, ErrorBox, formatDate, formatILS } from "./_shared";

export default function Contract360() {
  const [, params] = useRoute<{ id: string }>("/contracts/:id");
  const id = params?.id;
  const { data: contract, isLoading, error } = useDetail<any>(["procurement", "contract", id], `/contracts/${id}`, !!id);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox err={error} />;
  if (!contract) return null;

  const now = new Date();
  const expiry = contract.expiry_date ? new Date(contract.expiry_date) : null;
  const daysToExpiry = expiry ? Math.ceil((expiry.getTime() - now.getTime()) / (86400000)) : null;

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <header>
        <div className="text-sm text-gray-500">חוזה #{contract.contract_number}</div>
        <h1 className="text-3xl font-semibold">{contract.contract_type}</h1>
        <div className="mt-2 flex items-center gap-2 text-sm">
          <StatusBadge state={contract.state} />
          {daysToExpiry !== null && daysToExpiry <= (contract.renewal_notice_days ?? 30) && daysToExpiry > 0 && (
            <span className="rounded bg-amber-200 text-amber-900 px-2 py-0.5 text-xs">מתקרב לסיום ב-{daysToExpiry} ימים</span>
          )}
          {daysToExpiry !== null && daysToExpiry <= 0 && <span className="rounded bg-red-200 text-red-900 px-2 py-0.5 text-xs">פג תוקף</span>}
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card title="פרטי חוזה">
          <Field label="מספר" value={contract.contract_number} />
          <Field label="סוג" value={contract.contract_type} />
          <Field label="תחילה" value={formatDate(contract.effective_date)} />
          <Field label="סיום" value={formatDate(contract.expiry_date)} />
          <Field label="מטבע" value={contract.currency} />
          <Field label="ערך חוזה" value={formatILS(contract.contract_value)} />
          <Field label="חידוש אוטומטי" value={contract.auto_renew ? "כן" : "לא"} />
          <Field label="התראה לפני סיום" value={`${contract.renewal_notice_days ?? 30} ימים`} />
          <Field label="נחתם ב" value={formatDate(contract.signed_at)} />
        </Card>
        <Card title="צדדים לחוזה">
          <Field label="ספק" value={contract.supplier_id ?? "—"} />
          <Field label="לקוח" value={contract.customer_id ?? "—"} />
          <Field label="הצעת מחיר" value={contract.quote_id ?? "—"} />
          <Field label="הזמנה" value={contract.po_id ?? "—"} />
          <Field label="פרויקט" value={contract.project_id ?? "—"} />
        </Card>
      </section>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border bg-white">
      <div className="border-b bg-gray-50 px-4 py-2 font-semibold">{title}</div>
      <div className="p-4 space-y-2">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="grid grid-cols-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="col-span-2 font-medium">{value ?? "—"}</span>
    </div>
  );
}
