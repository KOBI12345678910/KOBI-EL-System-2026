import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiSend, useList, StatusBadge, Loading, ErrorBox, EmptyBox, formatDate } from "./_shared";

export default function ProcurementApprovalsQueue() {
  const [state, setState] = useState("pending");
  const qc = useQueryClient();
  const { data, isLoading, error } = useList<any>(
    ["procurement", "approvals", state],
    "/approvals",
    { state, limit: 100 },
  );
  const [busy, setBusy] = useState<number | null>(null);

  async function decide(id: number, decision: "approve" | "reject" | "escalate") {
    const comments = prompt("הערות (אופציונלי):") ?? undefined;
    setBusy(id);
    try {
      await apiSend("POST", `/approvals/${id}/decide`, { decision, comments });
      qc.invalidateQueries({ queryKey: ["procurement", "approvals"] });
    } catch (e: any) { alert(e.message); } finally { setBusy(null); }
  }

  return (
    <div dir="rtl" className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">תור אישורי רכש</h1>
      <div className="flex gap-2 text-sm">
        <select value={state} onChange={(e) => setState(e.target.value)} className="rounded border px-2 py-2">
          <option value="pending">ממתינים</option>
          <option value="approved">אושרו</option>
          <option value="rejected">נדחו</option>
          <option value="escalated">הוסלמו</option>
        </select>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorBox err={error} />}
      {data && data.rows.length === 0 && <EmptyBox label="אין אישורים" />}
      {data && data.rows.length > 0 && (
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 text-right">ID</th>
                <th className="p-2 text-right">סוג ישות</th>
                <th className="p-2 text-right">ID ישות</th>
                <th className="p-2 text-right">סוג אישור</th>
                <th className="p-2 text-right">מבקש</th>
                <th className="p-2 text-right">מאשר</th>
                <th className="p-2 text-right">נדרש ב</th>
                <th className="p-2 text-right">מדיניות</th>
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((a: any) => (
                <tr key={a.id} className="border-t hover:bg-gray-50">
                  <td className="p-2">{a.id}</td>
                  <td className="p-2">{a.entity_type}</td>
                  <td className="p-2">{a.entity_id}</td>
                  <td className="p-2">{a.approval_type}</td>
                  <td className="p-2">{a.requested_by_user_id ?? "—"}</td>
                  <td className="p-2">{a.assigned_approver_user_id ?? "—"}</td>
                  <td className="p-2">{formatDate(a.requested_at)}</td>
                  <td className="p-2 text-xs">{a.approval_policy_code ?? "—"}</td>
                  <td className="p-2"><StatusBadge state={a.state} /></td>
                  <td className="p-2 space-x-2 space-x-reverse">
                    {a.state === "pending" && (
                      <>
                        <button onClick={() => decide(a.id, "approve")} disabled={busy === a.id} className="text-emerald-700 hover:underline text-sm disabled:opacity-60">אשר</button>
                        <button onClick={() => decide(a.id, "reject")} disabled={busy === a.id} className="text-red-700 hover:underline text-sm disabled:opacity-60">דחה</button>
                        <button onClick={() => decide(a.id, "escalate")} disabled={busy === a.id} className="text-amber-700 hover:underline text-sm disabled:opacity-60">הסלם</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
