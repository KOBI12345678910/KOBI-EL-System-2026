import { Link } from "wouter";
import { useList, useSearchState, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, formatDate } from "./_shared";

export default function DocumentsListPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["docs", "documents", s.q, s.state, s.category, s.offset],
    "/documents",
    { q: s.q || undefined, status: s.state || undefined, document_type: s.category || undefined, limit: s.limit, offset: s.offset },
  );

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">מסמכים</h1>
        <Link href="/documents/new" className="rounded bg-indigo-600 px-4 py-2 text-white text-sm">מסמך חדש +</Link>
      </div>
      <div className="flex gap-2 items-center flex-wrap">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי שם קובץ, מספר מסמך…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="draft">טיוטה</option>
          <option value="pending_review">ממתין לבדיקה</option>
          <option value="approved">אושר</option>
          <option value="archived">בארכיון</option>
          <option value="deleted">נמחק</option>
        </select>
        <select value={s.category} onChange={(e) => { s.setCategory(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הקטגוריות</option>
          <option value="contract">חוזה</option>
          <option value="invoice">חשבונית</option>
          <option value="receipt">קבלה</option>
          <option value="id_document">ת.ז / מסמך זיהוי</option>
          <option value="quote">הצעת מחיר</option>
          <option value="purchase_order">הזמנת רכש</option>
          <option value="drawing">תרשים</option>
          <option value="other">אחר</option>
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
                <th className="p-2 text-right">מספר מסמך</th>
                <th className="p-2 text-right">שם קובץ</th>
                <th className="p-2 text-right">סוג</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">OCR</th>
                <th className="p-2 text-right">חתימה</th>
                <th className="p-2 text-right">עודכן</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">{r.document_number}</td>
                  <td className="p-2 font-medium">{r.filename}</td>
                  <td className="p-2">{r.document_type ?? "—"}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">{r.ocr_status ?? "—"}</td>
                  <td className="p-2">{r.signature_status ?? "—"}</td>
                  <td className="p-2">{formatDate(r.updated_at)}</td>
                  <td className="p-2">
                    <Link href={`/documents/${r.id}`} className="text-indigo-600 hover:underline">פתח 360</Link>
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
