import { useList, useSearchState, SearchBar, Pagination, Loading, ErrorBox, EmptyBox, formatDate } from "./_shared";

export default function KnowledgeCardsPage() {
  const s = useSearchState({ limit: 50 });
  const { data, isLoading, error } = useList<any>(
    ["docs", "knowledge-cards", s.q, s.category, s.offset],
    "/knowledge-cards",
    { q: s.q || undefined, category: s.category || undefined, limit: s.limit, offset: s.offset },
  );
  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">כרטיסי ידע</h1>
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי כותרת או תקציר…" />
        <select value={s.category} onChange={(e) => { s.setCategory(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הקטגוריות</option>
          <option value="contract">חוזה</option>
          <option value="invoice">חשבונית</option>
          <option value="quote">הצעת מחיר</option>
          <option value="other">אחר</option>
        </select>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox />}
      {data && data.rows.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.rows.map((c: any) => (
            <div key={c.id} className="rounded border bg-white p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold">{c.title}</div>
                {c.category && <span className="rounded bg-indigo-100 text-indigo-900 px-2 py-0.5 text-xs">{c.category}</span>}
              </div>
              {c.summary && <div className="text-sm text-gray-700 line-clamp-4">{c.summary}</div>}
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>מסמך מקור: {c.source_document_id ?? "—"}</span>
                <span>{formatDate(c.created_at)}</span>
              </div>
              {Array.isArray(c.tags) && c.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.tags.map((t: string) => <span key={t} className="rounded bg-gray-100 px-2 py-0.5 text-xs">{t}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Pagination offset={s.offset} limit={s.limit} total={data?.total} onChange={s.setOffset} />
    </div>
  );
}
