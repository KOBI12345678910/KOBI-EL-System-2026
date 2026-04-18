import { Link } from "wouter";
import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatILS, formatDate } from "./_shared";

export default function PurchaseOrdersListPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["procurement", "purchase-orders", s.q, s.state, s.offset],
    "/purchase-orders",
    { q: s.q || undefined, state: s.state || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">הזמנות רכש</h1>
        <Link href="/purchase-orders/new" className="rounded bg-indigo-600 px-4 py-2 text-white text-sm">הזמנה חדשה +</Link>
      </div>
      <div className="flex gap-2">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי מספר הזמנה…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="draft">טיוטה</option>
          <option value="pending_approval">ממתינה לאישור</option>
          <option value="approved">אושרה</option>
          <option value="submitted">נשלחה לספק</option>
          <option value="partially_received">התקבלה חלקית</option>
          <option value="fully_received">התקבלה במלואה</option>
          <option value="invoiced">חויבה</option>
          <option value="paid">שולמה</option>
          <option value="closed">נסגרה</option>
        </select>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">מס׳ הזמנה</th>
                <th className="p-2 text-right">תאריך</th>
                <th className="p-2 text-right">מועד אספקה</th>
                <th className="p-2 text-right">ספק</th>
                <th className="p-2 text-right">סה״כ</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">קבלה</th>
                <th className="p-2 text-right">תשלום</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.po_number}</td>
                  <td className="p-2">{formatDate(r.order_date)}</td>
                  <td className="p-2">{formatDate(r.expected_delivery_date)}</td>
                  <td className="p-2">{r.supplier_id}</td>
                  <td className="p-2 font-semibold">{formatILS(r.grand_total)}</td>
                  <td className="p-2"><StatusBadge state={r.state} /></td>
                  <td className="p-2 text-xs">{r.receiving_status}</td>
                  <td className="p-2 text-xs">{r.payment_status}</td>
                  <td className="p-2">
                    <Link href={`/purchase-orders/${r.id}`} className="text-indigo-600 hover:underline">פתח 360</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination offset={s.offset} limit={s.limit} total={data?.total} onChange={s.setOffset} />
    </div>
  );
}
