// ============================================================
// FILE: src/features/controlRooms/WorkforceControlRoom.tsx
// ============================================================

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

type WorkforceSummary = { snapshot_date?: string; active_employees?: number; missing_attendance?: number; pending_payroll_runs?: number; overtime_alerts?: number; pending_reimbursements?: number; leave_requests_pending?: number };
type WorkforceMissingAttendance = { employee_id: number; employee_number: string; full_name: string };
type WorkforcePayrollRun = { id: number; payroll_run_number: string; payroll_period_start: string; payroll_period_end: string; state: string };
type WorkforceOvertimeAlert = { employee_id: number; employee_number: string; full_name: string; overtime_hours: number; severity?: string | null };
type WorkforceExpense = { id: number; expense_number: string; employee_id: number; employee_name?: string | null; expense_date: string; amount: number; reimbursement_status?: string | null; state: string };
type WorkforceLeaveRequest = { id: number; request_number: string; employee_id: number; employee_name?: string | null; leave_name: string; start_date: string; end_date: string; total_days: number; approval_status: string };

type WorkforceControlRoomPayload = {
  summary?: WorkforceSummary;
  missing_attendance?: WorkforceMissingAttendance[];
  payroll_runs?: WorkforcePayrollRun[];
  overtime_alerts?: WorkforceOvertimeAlert[];
  expenses?: WorkforceExpense[];
  leave_requests?: WorkforceLeaveRequest[];
};

// ============================================================
// HELPERS
// ============================================================

const wMoney = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
function wm(v?: number | null) { return wMoney.format(v ?? 0); }
function wd(v?: string | null) { if (!v) return "—"; try { return new Date(v).toLocaleDateString("he-IL"); } catch { return v; } }

function wfBadge(value?: string | null): string {
  const s = (value || "").toLowerCase();
  if (["active", "approved", "paid", "good"].includes(s)) return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (["missing", "high", "open", "rejected", "critical"].includes(s)) return "bg-red-100 text-red-800 border border-red-200";
  if (["pending", "draft", "submitted", "medium"].includes(s)) return "bg-amber-100 text-amber-800 border border-amber-200";
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

// ============================================================
// API
// ============================================================

async function fetchWorkforceControlRoom(): Promise<WorkforceControlRoomPayload> {
  const res = await fetch("/api/control-room/workforce", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch workforce control room: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export const workforceControlRoomQueryKey = () => ["workforceControlRoom"] as const;

// ============================================================
// UI
// ============================================================

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">{title}</div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function Badge({ value }: { value?: string | null }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${wfBadge(value)}`}>{value || "—"}</span>;
}

type WorkforceTab = "overview" | "missingAttendance" | "payroll" | "overtime" | "expenses" | "leave";

function TabButton({ active, label, onClick, count }: { active: boolean; label: string; onClick: () => void; count?: number }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${active ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"}`}>
      {label}{typeof count === "number" ? ` (${count})` : ""}
    </button>
  );
}

// ============================================================
// MAIN
// ============================================================

export function WorkforceControlRoom() {
  const [activeTab, setActiveTab] = useState<WorkforceTab>("overview");
  const query = useQuery({ queryKey: workforceControlRoomQueryKey(), queryFn: fetchWorkforceControlRoom, refetchInterval: 60_000 });

  // FIX: useMemo before early returns
  const nextBestAction = useMemo(() => {
    if (!query.data) return "";
    const s = query.data.summary ?? {};
    if ((s.missing_attendance ?? 0) > 0) return "טפל בחוסרי נוכחות של היום";
    if ((s.pending_payroll_runs ?? 0) > 0) return "השלים ואשר payroll runs ממתינים";
    if ((s.leave_requests_pending ?? 0) > 0) return "בדוק בקשות חופשה ממתינות";
    return "שמור על נוכחות, שכר והוצאות נקיים";
  }, [query.data]);

  if (query.isLoading) return <div className="p-6"><div className="h-10 w-96 rounded-xl bg-slate-200 animate-pulse" /></div>;
  if (query.isError) return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">שגיאה בטעינת Workforce Control Room</div></div>;

  const data = query.data ?? {};
  const summary = data.summary ?? {};
  const missingAttendance = data.missing_attendance ?? [];
  const payrollRuns = data.payroll_runs ?? [];
  const overtimeAlerts = data.overtime_alerts ?? [];
  const expenses = data.expenses ?? [];
  const leaveRequests = data.leave_requests ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3"><h1 className="text-4xl font-black text-slate-900">Workforce Control Room</h1><Badge value="Live" /></div>
              <div className="text-sm text-slate-600">מרכז שליטה לכוח אדם, נוכחות, שכר, שעות נוספות, הוצאות וחופשות.</div>
              <div className="text-sm text-slate-500">Snapshot: {wd(summary.snapshot_date)}</div>
            </div>
            <button type="button" onClick={() => query.refetch()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">רענן</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          <MetricCard title="Active Employees" value={String(summary.active_employees ?? 0)} />
          <MetricCard title="Missing Attendance" value={String(summary.missing_attendance ?? 0)} />
          <MetricCard title="Pending Payroll" value={String(summary.pending_payroll_runs ?? 0)} />
          <MetricCard title="Overtime Alerts" value={String(summary.overtime_alerts ?? 0)} />
          <MetricCard title="Pending Expenses" value={String(summary.pending_reimbursements ?? 0)} />
          <MetricCard title="Leave Pending" value={String(summary.leave_requests_pending ?? 0)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <TabButton active={activeTab === "overview"} label="סקירה" onClick={() => setActiveTab("overview")} />
          <TabButton active={activeTab === "missingAttendance"} label="חוסר נוכחות" onClick={() => setActiveTab("missingAttendance")} count={missingAttendance.length} />
          <TabButton active={activeTab === "payroll"} label="Payroll" onClick={() => setActiveTab("payroll")} count={payrollRuns.length} />
          <TabButton active={activeTab === "overtime"} label="שעות נוספות" onClick={() => setActiveTab("overtime")} count={overtimeAlerts.length} />
          <TabButton active={activeTab === "expenses"} label="הוצאות" onClick={() => setActiveTab("expenses")} count={expenses.length} />
          <TabButton active={activeTab === "leave"} label="חופשות" onClick={() => setActiveTab("leave")} count={leaveRequests.length} />
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
            <Panel title="Missing Attendance">
              {missingAttendance.length === 0 ? <div className="text-sm text-slate-600">אין חוסרי נוכחות.</div> : (
                <div className="space-y-3">{missingAttendance.slice(0, 8).map((row) => (
                  <div key={row.employee_id} className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-900">{row.employee_number} • {row.full_name}</div><div className="mt-2"><Badge value="Missing" /></div></div>
                ))}</div>
              )}
            </Panel>
            <Panel title="Payroll Queue">
              {payrollRuns.length === 0 ? <div className="text-sm text-slate-600">אין payroll runs.</div> : (
                <div className="space-y-3">{payrollRuns.slice(0, 8).map((run) => (
                  <div key={run.id} className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-900">{run.payroll_run_number}</div><div className="mt-2 text-sm text-slate-600">{wd(run.payroll_period_start)} - {wd(run.payroll_period_end)}</div><div className="mt-2"><Badge value={run.state} /></div></div>
                ))}</div>
              )}
            </Panel>
          </div>
        )}

        {activeTab === "missingAttendance" && (
          <Panel title="Missing Attendance Queue">
            {missingAttendance.length === 0 ? <div className="text-sm text-slate-600">אין חוסרי נוכחות.</div> : (
              <div className="space-y-3">{missingAttendance.map((row) => (
                <div key={row.employee_id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div className="font-bold text-slate-900">{row.employee_number} • {row.full_name}</div><Badge value="Missing" /></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        {activeTab === "payroll" && (
          <Panel title="Payroll Runs">
            {payrollRuns.length === 0 ? <div className="text-sm text-slate-600">אין payroll runs.</div> : (
              <div className="space-y-3">{payrollRuns.map((run) => (
                <div key={run.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-bold text-slate-900">{run.payroll_run_number}</div><div className="text-sm text-slate-600">{wd(run.payroll_period_start)} - {wd(run.payroll_period_end)}</div></div><Badge value={run.state} /></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        {activeTab === "overtime" && (
          <Panel title="Overtime Alerts">
            {overtimeAlerts.length === 0 ? <div className="text-sm text-slate-600">אין חריגות שעות נוספות.</div> : (
              <div className="space-y-3">{overtimeAlerts.map((row) => (
                <div key={row.employee_id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-bold text-slate-900">{row.employee_number} • {row.full_name}</div><div className="text-sm text-slate-600">Overtime Hours: {row.overtime_hours}</div></div><Badge value={row.severity || "High"} /></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        {activeTab === "expenses" && (
          <Panel title="Pending Reimbursements">
            {expenses.length === 0 ? <div className="text-sm text-slate-600">אין הוצאות ממתינות.</div> : (
              <div className="space-y-3">{expenses.map((expense) => (
                <div key={expense.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-bold text-slate-900">{expense.expense_number} • {expense.employee_name || `Employee #${expense.employee_id}`}</div><div className="text-sm text-slate-600">Date: {wd(expense.expense_date)} • Amount: {wm(expense.amount)}</div></div><Badge value={expense.reimbursement_status || expense.state} /></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        {activeTab === "leave" && (
          <Panel title="Pending Leave Requests">
            {leaveRequests.length === 0 ? <div className="text-sm text-slate-600">אין בקשות חופשה ממתינות.</div> : (
              <div className="space-y-3">{leaveRequests.map((leave) => (
                <div key={leave.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><div><div className="font-bold text-slate-900">{leave.request_number} • {leave.employee_name || `Employee #${leave.employee_id}`}</div><div className="text-sm text-slate-600">{leave.leave_name} • {wd(leave.start_date)} - {wd(leave.end_date)} • {leave.total_days} days</div></div><Badge value={leave.approval_status} /></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <MetricCard title="Next Best Action" value={nextBestAction} />
          <MetricCard title="Snapshot" value={wd(summary.snapshot_date)} />
          <MetricCard title="Focus" value={(summary.missing_attendance ?? 0) > 0 ? "Attendance" : "Payroll"} />
          <MetricCard title="Refresh" value="60s" />
        </div>
      </div>
    </div>
  );
}
