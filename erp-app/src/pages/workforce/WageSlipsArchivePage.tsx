// ============================================================
// WageSlipsArchivePage — searchable archive of all wage slips.
// Fills the completion gate flagged in workforce.md.
// ============================================================
import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type WageSlip = {
  id: number;
  slip_number: string;
  payroll_entry_id: number;
  employee_id: number;
  employee_number?: string;
  full_name?: string;
  slip_date: string;
  gross_pay: number;
  net_pay: number;
  status: string;
  document_id: number | null;
  published_at: string | null;
};

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export default function WageSlipsArchivePage() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({
    employee_id: "",
    status: "",
    slip_date_from: "",
    slip_date_to: "",
  });

  const params = new URLSearchParams({ limit: "200" });
  if (filters.employee_id) params.set("employee_id", filters.employee_id);
  if (filters.status) params.set("status", filters.status);
  if (filters.slip_date_from) params.set("slip_date_from", filters.slip_date_from);
  if (filters.slip_date_to) params.set("slip_date_to", filters.slip_date_to);

  const q = useQuery<{ data: WageSlip[] }>({
    queryKey: ["wage-slips", filters],
    queryFn: () => apiFetch<{ data: WageSlip[] }>(`/api/workforce/wage-slips?${params}`),
  });

  const publishMut = useMutation({
    mutationFn: (slipId: number) =>
      apiFetch(`/api/workforce/wage-slips/${slipId}/publish`, {
        method: "POST",
        body: JSON.stringify({ generate_pdf: true, notify_employee: false }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wage-slips"] }),
  });

  const money = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" });

  return (
    <div dir="rtl" style={{ padding: 16 }}>
      <h1>ארכיון תלושי שכר</h1>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input type="number" placeholder="מזהה עובד"
          value={filters.employee_id}
          onChange={e => setFilters(f => ({ ...f, employee_id: e.target.value }))}
          style={input} />
        <select value={filters.status}
          onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          style={input}>
          <option value="">כל המצבים</option>
          <option value="draft">טיוטה</option>
          <option value="published">פורסם</option>
          <option value="superseded">הוחלף</option>
        </select>
        <input type="date" value={filters.slip_date_from}
          onChange={e => setFilters(f => ({ ...f, slip_date_from: e.target.value }))}
          style={input} />
        <input type="date" value={filters.slip_date_to}
          onChange={e => setFilters(f => ({ ...f, slip_date_to: e.target.value }))}
          style={input} />
      </div>

      {q.isLoading && <div>טוען…</div>}
      {q.isError && <div>שגיאה בטעינת תלושים</div>}

      {q.data && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={th}>מספר תלוש</th>
              <th style={th}>עובד</th>
              <th style={th}>תאריך</th>
              <th style={th}>ברוטו</th>
              <th style={th}>נטו</th>
              <th style={th}>מצב</th>
              <th style={th}>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {q.data.data.map(s => (
              <tr key={s.id}>
                <td style={td}>{s.slip_number}</td>
                <td style={td}>{s.full_name ?? s.employee_id}</td>
                <td style={td}>{s.slip_date}</td>
                <td style={td}>{money.format(Number(s.gross_pay))}</td>
                <td style={td}>{money.format(Number(s.net_pay))}</td>
                <td style={td}>
                  <span style={{
                    padding: "2px 8px",
                    background: s.status === "published" ? "#d4edda" : "#fff3cd",
                    borderRadius: 4, fontSize: 12,
                  }}>
                    {s.status}
                  </span>
                </td>
                <td style={td}>
                  {s.status === "draft" && (
                    <button disabled={publishMut.isPending}
                      onClick={() => publishMut.mutate(s.id)}>
                      פרסם
                    </button>
                  )}
                  {s.document_id && (
                    <a href={`/api/docs/documents/${s.document_id}/download`}
                       target="_blank" rel="noreferrer"
                       style={{ marginInlineStart: 8 }}>PDF</a>
                  )}
                </td>
              </tr>
            ))}
            {q.data.data.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...td, textAlign: "center", color: "#888" }}>
                  לא נמצאו תלושים
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: 8, textAlign: "right", borderBottom: "1px solid #ddd" };
const td: React.CSSProperties = { padding: 8, borderBottom: "1px solid #eee" };
const input: React.CSSProperties = { padding: 6, border: "1px solid #ccc", borderRadius: 4 };
