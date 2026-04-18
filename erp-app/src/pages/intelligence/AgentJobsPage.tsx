import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useList, useSearchState, apiSend, SearchBar, Pagination, StatusBadge, Loading, ErrorBox, EmptyBox, PageHeader, formatDate } from "./_shared";

export default function AgentJobsPage() {
  const s = useSearchState({ limit: 50 });
  const qc = useQueryClient();
  const [enqueueOpen, setEnqueueOpen] = useState(false);
  const [enqueueAgentId, setEnqueueAgentId] = useState<string>("");
  const [enqueueType, setEnqueueType] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [enqueueErr, setEnqueueErr] = useState<string | null>(null);

  const queryKey = ["intelligence", "agent-jobs", s.q, s.state, s.offset];
  const { data, isLoading, error } = useList<any>(queryKey, "/agent-jobs", {
    q: s.q || undefined, status: s.state || undefined, limit: s.limit, offset: s.offset,
  });

  async function enqueue() {
    setBusy(true); setEnqueueErr(null);
    try {
      await apiSend("POST", "/agent-jobs/enqueue", {
        agent_id: Number(enqueueAgentId),
        job_type: enqueueType,
        payload: {},
      });
      setEnqueueOpen(false); setEnqueueAgentId(""); setEnqueueType("");
      qc.invalidateQueries({ queryKey: queryKey as any });
    } catch (e: any) { setEnqueueErr(e?.message ?? String(e)); } finally { setBusy(false); }
  }

  async function cancel(id: number) {
    await apiSend("POST", `/agent-jobs/${id}/cancel`);
    qc.invalidateQueries({ queryKey: queryKey as any });
  }

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <PageHeader title="משימות סוכנים" actions={
        <button className="rounded bg-indigo-600 px-4 py-2 text-white text-sm" onClick={() => setEnqueueOpen(true)}>הוסף משימה +</button>
      } />
      <div className="flex gap-2 items-center">
        <SearchBar value={s.q} onChange={(v) => { s.setQ(v); s.setOffset(0); }} placeholder="חיפוש לפי סוג משימה…" />
        <select value={s.state} onChange={(e) => { s.setState(e.target.value); s.setOffset(0); }} className="rounded border px-2 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="queued">בתור</option>
          <option value="running">רץ</option>
          <option value="completed">הושלם</option>
          <option value="failed">נכשל</option>
        </select>
      </div>

      {enqueueOpen && (
        <div className="rounded border p-4 bg-gray-50">
          <h2 className="font-semibold mb-2">הוסף משימה חדשה</h2>
          <div className="flex gap-2 items-center">
            <input className="rounded border px-2 py-1 text-sm" placeholder="מזהה סוכן" value={enqueueAgentId} onChange={(e) => setEnqueueAgentId(e.target.value)} />
            <input className="rounded border px-2 py-1 text-sm" placeholder="סוג משימה" value={enqueueType} onChange={(e) => setEnqueueType(e.target.value)} />
            <button className="rounded bg-indigo-600 px-3 py-1 text-white text-sm" disabled={busy || !enqueueAgentId || !enqueueType} onClick={enqueue}>שלח</button>
            <button className="rounded border px-3 py-1 text-sm" onClick={() => setEnqueueOpen(false)}>בטל</button>
          </div>
          {enqueueErr && <div className="text-red-700 text-sm mt-2">{enqueueErr}</div>}
        </div>
      )}

      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">מזהה</th>
                <th className="p-2 text-right">סוכן</th>
                <th className="p-2 text-right">סוג</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">התחלה</th>
                <th className="p-2 text-right">סיום</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">{r.id}</td>
                  <td className="p-2">{r.agent_id}</td>
                  <td className="p-2">{r.job_type}</td>
                  <td className="p-2"><StatusBadge state={r.status} /></td>
                  <td className="p-2">{formatDate(r.started_at)}</td>
                  <td className="p-2">{formatDate(r.finished_at)}</td>
                  <td className="p-2">
                    {(r.status === "queued" || r.status === "running") && (
                      <button className="text-red-700 hover:underline" onClick={() => cancel(r.id)}>בטל</button>
                    )}
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
