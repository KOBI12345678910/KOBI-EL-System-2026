// ============================================================
// PayrollRun360 — 360° view of a payroll run with line items,
// exceptions and approval actions. Fills the completion gate
// flagged in _master-registry/domains/workforce.md.
// ============================================================
import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type PayrollRun = {
  id: number;
  payroll_run_number: string;
  payroll_period_start: string;
  payroll_period_end: string;
  status: string;
  state: string;
  employer_id: number | null;
  calculated_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  line_count: number;
  total_gross: number;
  total_net: number;
  open_exceptions: number;
  notes: string | null;
};

type PayrollLineItem = {
  id: number;
  employee_id: number;
  employee_number?: string;
  full_name?: string;
  gross_pay: number;
  deductions: number;
  net_pay: number;
  pension_total: number;
  overtime_pay: number;
  attendance_hours: number;
  state: string;
};

type PayrollException = {
  id: number;
  employee_id: number | null;
  exception_type: string;
  severity: string;
  description: string;
  state: string;
  detected_at: string;
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

export default function PayrollRun360() {
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"lines" | "exceptions">("lines");

  const runQ = useQuery<PayrollRun>({
    queryKey: ["payroll-run", id],
    queryFn: () => apiFetch<PayrollRun>(`/api/workforce/payroll-runs/${id}`),
    enabled: Number.isInteger(id) && id > 0,
  });

  const linesQ = useQuery<{ data: PayrollLineItem[] }>({
    queryKey: ["payroll-run-lines", id],
    queryFn: () =>
      apiFetch<{ data: PayrollLineItem[] }>(
        `/api/workforce/payroll-line-items?payroll_run_id=${id}&limit=500`,
      ),
    enabled: Number.isInteger(id) && id > 0,
  });

  const exceptionsQ = useQuery<{ data: PayrollException[] }>({
    queryKey: ["payroll-run-exceptions", id],
    queryFn: () =>
      apiFetch<{ data: PayrollException[] }>(
        `/api/workforce/payroll-exceptions?payroll_run_id=${id}&limit=500`,
      ),
    enabled: Number.isInteger(id) && id > 0,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["payroll-run", id] });
    qc.invalidateQueries({ queryKey: ["payroll-run-lines", id] });
    qc.invalidateQueries({ queryKey: ["payroll-run-exceptions", id] });
  };

  const calculateMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/workforce/payroll-runs/${id}/calculate`, {
        method: "POST",
        body: JSON.stringify({ recompute: false }),
      }),
    onSuccess: invalidateAll,
  });

  const approveMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/workforce/payroll-runs/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ approval_notes: null }),
      }),
    onSuccess: invalidateAll,
  });

  const payMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/workforce/payroll-runs/${id}/pay`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: invalidateAll,
  });

  const closeMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/workforce/payroll-runs/${id}/close`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: invalidateAll,
  });

  const run = runQ.data;
  const money = useMemo(
    () =>
      new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" }),
    [],
  );

  if (!Number.isInteger(id) || id <= 0) {
    return <div style={{ padding: 16 }}>מזהה לא תקין</div>;
  }
  if (runQ.isLoading) return <div style={{ padding: 16 }}>טוען…</div>;
  if (runQ.isError || !run) return <div style={{ padding: 16 }}>ריצת שכר לא נמצאה</div>;

  const canCalculate = ["draft", "in_progress"].includes(run.status);
  const canApprove = run.status === "in_progress";
  const canPay = run.status === "approved";
  const canClose = ["paid", "approved"].includes(run.status);

  return (
    <div dir="rtl" style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>ריצת שכר: {run.payroll_run_number}</h1>
          <div style={{ color: "#666" }}>
            {run.payroll_period_start} – {run.payroll_period_end}
          </div>
        </div>
        <div>
          <span style={{
            padding: "4px 10px",
            background: run.status === "paid" ? "#d4edda" :
                         run.status === "approved" ? "#cce5ff" :
                         run.status === "closed" ? "#e2e3e5" : "#fff3cd",
            borderRadius: 4,
          }}>
            {run.status}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}>
        <StatCard label="שורות" value={String(run.line_count ?? 0)} />
        <StatCard label='סה"כ ברוטו' value={money.format(Number(run.total_gross ?? 0))} />
        <StatCard label='סה"כ נטו' value={money.format(Number(run.total_net ?? 0))} />
        <StatCard label="חריגים פתוחים" value={String(run.open_exceptions ?? 0)}
          tone={Number(run.open_exceptions ?? 0) > 0 ? "warn" : "neutral"} />
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button disabled={!canCalculate || calculateMut.isPending}
          onClick={() => calculateMut.mutate()}>
          חשב ריצה
        </button>
        <button disabled={!canApprove || approveMut.isPending}
          onClick={() => approveMut.mutate()}>
          אשר
        </button>
        <button disabled={!canPay || payMut.isPending}
          onClick={() => payMut.mutate()}>
          שלם
        </button>
        <button disabled={!canClose || closeMut.isPending}
          onClick={() => closeMut.mutate()}>
          סגור
        </button>
      </div>

      <div style={{ marginTop: 20, borderBottom: "1px solid #ddd" }}>
        <TabBtn active={tab === "lines"} onClick={() => setTab("lines")}>
          שורות שכר ({linesQ.data?.data.length ?? 0})
        </TabBtn>
        <TabBtn active={tab === "exceptions"} onClick={() => setTab("exceptions")}>
          חריגים ({exceptionsQ.data?.data.length ?? 0})
        </TabBtn>
      </div>

      {tab === "lines" && (
        <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={th}>עובד</th>
              <th style={th}>שעות</th>
              <th style={th}>ברוטו</th>
              <th style={th}>ניכויים</th>
              <th style={th}>נטו</th>
              <th style={th}>פנסיה</th>
              <th style={th}>מצב</th>
            </tr>
          </thead>
          <tbody>
            {(linesQ.data?.data ?? []).map(r => (
              <tr key={r.id}>
                <td style={td}>{r.full_name ?? r.employee_id}</td>
                <td style={td}>{Number(r.attendance_hours).toFixed(2)}</td>
                <td style={td}>{money.format(Number(r.gross_pay))}</td>
                <td style={td}>{money.format(Number(r.deductions))}</td>
                <td style={td}>{money.format(Number(r.net_pay))}</td>
                <td style={td}>{money.format(Number(r.pension_total))}</td>
                <td style={td}>{r.state}</td>
              </tr>
            ))}
            {(linesQ.data?.data ?? []).length === 0 && (
              <tr><td colSpan={7} style={{ ...td, textAlign: "center", color: "#888" }}>
                עדיין אין שורות — בצע "חשב ריצה"
              </td></tr>
            )}
          </tbody>
        </table>
      )}

      {tab === "exceptions" && (
        <table style={{ width: "100%", marginTop: 12, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f5f5f5" }}>
              <th style={th}>עובד</th>
              <th style={th}>סוג</th>
              <th style={th}>חומרה</th>
              <th style={th}>תיאור</th>
              <th style={th}>מצב</th>
              <th style={th}>זוהה ב</th>
            </tr>
          </thead>
          <tbody>
            {(exceptionsQ.data?.data ?? []).map(x => (
              <tr key={x.id}>
                <td style={td}>{x.employee_id ?? "-"}</td>
                <td style={td}>{x.exception_type}</td>
                <td style={td}>{x.severity}</td>
                <td style={td}>{x.description}</td>
                <td style={td}>{x.state}</td>
                <td style={td}>{new Date(x.detected_at).toLocaleDateString("he-IL")}</td>
              </tr>
            ))}
            {(exceptionsQ.data?.data ?? []).length === 0 && (
              <tr><td colSpan={6} style={{ ...td, textAlign: "center", color: "#888" }}>
                אין חריגים
              </td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th: React.CSSProperties = { padding: 8, textAlign: "right", borderBottom: "1px solid #ddd" };
const td: React.CSSProperties = { padding: 8, borderBottom: "1px solid #eee" };

function StatCard(props: { label: string; value: string; tone?: "warn" | "neutral" }) {
  const bg = props.tone === "warn" ? "#fff3cd" : "#fff";
  return (
    <div style={{ background: bg, padding: 12, border: "1px solid #ddd", borderRadius: 6 }}>
      <div style={{ color: "#666", fontSize: 12 }}>{props.label}</div>
      <div style={{ fontSize: 22, fontWeight: 600 }}>{props.value}</div>
    </div>
  );
}

function TabBtn(props: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={props.onClick} style={{
      padding: "8px 12px", marginInlineEnd: 4,
      border: "none", background: "transparent",
      borderBottom: props.active ? "3px solid #0066cc" : "3px solid transparent",
      cursor: "pointer", fontWeight: props.active ? 600 : 400,
    }}>
      {props.children}
    </button>
  );
}
