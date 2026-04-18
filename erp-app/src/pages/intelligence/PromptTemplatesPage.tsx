import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useList, useSearchState, apiSend, SearchBar, Pagination, Loading, ErrorBox, EmptyBox, PageHeader, formatDate } from "./_shared";

export default function PromptTemplatesPage() {
  const s = useSearchState({ limit: 50 });
  const qc = useQueryClient();
  const [testOpen, setTestOpen] = useState<string | null>(null);
  const [testVars, setTestVars] = useState<string>("{}");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  const queryKey = ["intelligence", "prompt-templates", s.q, s.offset];
  const { data, isLoading, error } = useList<any>(queryKey, "/prompt-templates", {
    q: s.q || undefined, limit: s.limit, offset: s.offset,
  });

  async function runTest(id: string) {
    setTestResult(null); setTestErr(null);
    try {
      const vars = testVars.trim() ? JSON.parse(testVars) : {};
      const r = await apiSend<any>("POST", `/prompt-templates/${id}/test-run`, { variables: vars });
      setTestResult(r.rendered_prompt);
      qc.invalidateQueries({ queryKey: queryKey as any });
    } catch (e: any) { setTestErr(e?.message ?? String(e)); }
  }

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <PageHeader title="תבניות פרומפטים (ניהול)" />
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי שם/תוכן תבנית…" />
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">שם תבנית</th>
                <th className="p-2 text-right">קטגוריה</th>
                <th className="p-2 text-right">שפה</th>
                <th className="p-2 text-right">שימושים</th>
                <th className="p-2 text-right">עודכן</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2 font-medium">{r.template_name}</td>
                  <td className="p-2">{r.category ?? "—"}</td>
                  <td className="p-2">{r.language}</td>
                  <td className="p-2">{r.usage_count}</td>
                  <td className="p-2">{formatDate(r.updated_at)}</td>
                  <td className="p-2">
                    <button className="text-indigo-700 hover:underline" onClick={() => { setTestOpen(r.id); setTestVars(JSON.stringify(r.variables ?? {}, null, 2)); setTestResult(null); setTestErr(null); }}>הרץ בדיקה</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination offset={s.offset} limit={s.limit} total={data?.total} onChange={s.setOffset} />

      {testOpen && (
        <div className="rounded border p-4 bg-gray-50 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">בדיקת תבנית</h2>
            <button className="text-sm text-gray-600 hover:underline" onClick={() => setTestOpen(null)}>סגור</button>
          </div>
          <label className="block text-sm">משתנים (JSON):</label>
          <textarea className="w-full h-32 rounded border px-2 py-1 text-sm font-mono" value={testVars} onChange={(e) => setTestVars(e.target.value)} />
          <button className="rounded bg-indigo-600 px-3 py-1 text-white text-sm" onClick={() => runTest(testOpen)}>הרץ</button>
          {testErr && <div className="text-red-700 text-sm">{testErr}</div>}
          {testResult && (
            <div className="rounded border p-2 bg-white">
              <div className="text-xs text-gray-500 mb-1">תוצאה:</div>
              <pre className="whitespace-pre-wrap text-sm">{testResult}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
