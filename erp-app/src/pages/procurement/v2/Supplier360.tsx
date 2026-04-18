import { useRoute, Link } from "wouter";
import { useDetail, useList, StatusBadge, Loading, ErrorBox, formatILS, formatDate } from "./_shared";

export default function Supplier360() {
  const [, params] = useRoute<{ id: string }>("/suppliers/:id");
  const id = params?.id;
  const { data: supplier, isLoading, error } = useDetail<any>(["procurement", "supplier", id], `/suppliers/${id}`, !!id);
  const { data: contacts } = useList<any>(["procurement", "supplier-contacts", id], "/supplier-contacts", { supplier_id: id });
  const { data: pos } = useList<any>(["procurement", "purchase-orders-by-supplier", id], "/purchase-orders", { supplier_id: id, limit: 10 });
  const { data: contracts } = useList<any>(["procurement", "contracts-by-supplier", id], "/contracts", { supplier_id: id, limit: 10 });
  const { data: evals } = useList<any>(["procurement", "evals-by-supplier", id], "/supplier-evaluations", { supplier_id: id, limit: 5 });

  if (isLoading) return <Loading />;
  if (error) return <ErrorBox err={error} />;
  if (!supplier) return null;

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">ספק #{supplier.supplier_number}</div>
          <h1 className="text-3xl font-semibold">{supplier.legal_name}</h1>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <StatusBadge state={supplier.status} />
            {supplier.preferred_supplier && <span className="rounded bg-amber-100 text-amber-900 px-2 py-0.5 text-xs">ספק מועדף</span>}
            {supplier.risk_level && <span className="rounded bg-orange-100 text-orange-900 px-2 py-0.5 text-xs">סיכון: {supplier.risk_level}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/rfqs?supplier_id=${supplier.id}`} className="rounded border px-3 py-1.5 text-sm">צור RFQ</Link>
          <Link href={`/purchase-orders?supplier_id=${supplier.id}`} className="rounded border px-3 py-1.5 text-sm">צור הזמנת רכש</Link>
          <Link href={`/supplier-evaluations?supplier_id=${supplier.id}`} className="rounded border px-3 py-1.5 text-sm">הערך ספק</Link>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi label="סה״כ הזמנות" value={pos?.rows?.length?.toString() ?? "—"} />
        <Kpi label="חוזים פעילים" value={(contracts?.rows?.filter((c: any) => c.state === "active").length ?? 0).toString()} />
        <Kpi label="ציון ממוצע" value={evals?.rows?.[0]?.overall_score ? `${evals.rows[0].overall_score}` : "—"} />
        <Kpi label="דירוג ביצועים" value={supplier.performance_score?.toString() ?? "—"} />
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <Card title="פרטי התקשרות">
          <Field label="טלפון" value={supplier.phone} />
          <Field label="אימייל" value={supplier.email} />
          <Field label="אתר" value={supplier.website} />
          <Field label="תנאי תשלום" value={supplier.payment_terms} />
          <Field label="תנאי אספקה" value={supplier.delivery_terms} />
          <Field label="מטבע מועדף" value={supplier.preferred_currency} />
        </Card>
        <Card title="כתובת">
          <Field label="רחוב" value={supplier.address_line_1} />
          <Field label="עיר" value={supplier.city} />
          <Field label="מדינה" value={supplier.country} />
          <Field label="מיקוד" value={supplier.postal_code} />
        </Card>
      </section>

      <Card title={`אנשי קשר (${contacts?.rows?.length ?? 0})`}>
        <MiniTable cols={["שם", "תפקיד", "טלפון", "אימייל", "ראשי"]} rows={(contacts?.rows ?? []).map((c: any) => [c.full_name, c.role_title, c.phone, c.email, c.is_primary ? "✓" : ""])} />
      </Card>

      <Card title={`הזמנות אחרונות (${pos?.rows?.length ?? 0})`}>
        <MiniTable
          cols={["מס׳ הזמנה", "תאריך", "סה״כ", "סטטוס"]}
          rows={(pos?.rows ?? []).map((p: any) => [p.po_number, formatDate(p.order_date), formatILS(p.grand_total), p.state])}
        />
      </Card>

      <Card title={`חוזים (${contracts?.rows?.length ?? 0})`}>
        <MiniTable
          cols={["מס׳ חוזה", "סוג", "תוקף עד", "סכום", "סטטוס"]}
          rows={(contracts?.rows ?? []).map((c: any) => [c.contract_number, c.contract_type, formatDate(c.expiry_date), formatILS(c.contract_value), c.state])}
        />
      </Card>

      <Card title={`הערכות (${evals?.rows?.length ?? 0})`}>
        <MiniTable
          cols={["תקופה", "ציון כללי", "ציון", "המלצה", "סטטוס"]}
          rows={(evals?.rows ?? []).map((e: any) => [
            `${formatDate(e.evaluation_period_start)}—${formatDate(e.evaluation_period_end)}`,
            e.overall_score ?? "—",
            e.grade ?? "—",
            e.recommendation ?? "—",
            e.state,
          ])}
        />
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border bg-white p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
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

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-3 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="col-span-2 font-medium">{value || "—"}</span>
    </div>
  );
}

function MiniTable({ cols, rows }: { cols: string[]; rows: (string | number | null | undefined)[][] }) {
  if (!rows || rows.length === 0) return <div className="text-sm text-gray-400">—</div>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          {cols.map((c) => <th key={c} className="p-2 text-right text-xs font-semibold text-gray-600">{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b last:border-b-0">{r.map((v, j) => <td key={j} className="p-2">{v ?? "—"}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
