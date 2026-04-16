// ============================================================
// FILE: src/features/workforce/Employee360.tsx
// ============================================================

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

type EmployeeCore = {
  id: number;
  public_id: string;
  employee_number: string;
  full_name: string;
  national_id?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  job_title?: string | null;
  department?: string | null;
  employment_type?: string | null;
  hire_date?: string | null;
  termination_date?: string | null;
  salary_type?: string | null;
  base_salary?: number | null;
  hourly_rate?: number | null;
  overtime_rate?: number | null;
  currency?: string | null;
  manager_user_id?: number | null;
  pension_status?: string | null;
  bank_status?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type EmployeeAttendance = {
  id: number;
  work_date: string;
  project_id?: number | null;
  work_order_id?: number | null;
  regular_hours: number;
  overtime_hours: number;
  approval_status: string;
  state: string;
};

type EmployeePayrollRun = {
  id: number;
  payroll_run_number: string;
  payroll_period_start: string;
  payroll_period_end: string;
  state: string;
  gross_pay?: number | null;
  net_pay?: number | null;
};

type EmployeeExpense = {
  id: number;
  expense_number: string;
  expense_date: string;
  category?: string | null;
  amount: number;
  reimbursement_status?: string | null;
  state: string;
  notes?: string | null;
};

type EmployeeAssignment = {
  id: number;
  project_id?: number | null;
  work_order_id?: number | null;
  assignment_role?: string | null;
  assigned_at: string;
  released_at?: string | null;
  state: string;
};

type EmployeePayComponent = {
  id: number;
  component_name: string;
  component_type: string;
  value_type: string;
  value_amount: number;
  effective_from: string;
  effective_to?: string | null;
  active: boolean;
};

type EmployeeLeaveRequest = {
  id: number;
  request_number: string;
  leave_name: string;
  start_date: string;
  end_date: string;
  total_days: number;
  approval_status: string;
};

type EmployeeInsight = {
  id: number;
  insight_number: string;
  category?: string | null;
  confidence_score?: number | null;
  recommendation_text?: string | null;
  state: string;
};

type EmployeeAudit = {
  id: number;
  action_name: string;
  performed_at: string;
  source_module: string;
  performed_by_user_name?: string | null;
};

type Employee360Payload = {
  employee: EmployeeCore;
  attendance?: EmployeeAttendance[];
  payroll_runs?: EmployeePayrollRun[];
  expenses?: EmployeeExpense[];
  assignments?: EmployeeAssignment[];
  pay_components?: EmployeePayComponent[];
  leave_requests?: EmployeeLeaveRequest[];
  insights?: EmployeeInsight[];
  audit?: EmployeeAudit[];
};

// ============================================================
// HELPERS
// ============================================================

const employeeMoney = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function em(v?: number | null) {
  return employeeMoney.format(v ?? 0);
}

function ed(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("he-IL");
  } catch {
    return v;
  }
}

function edt(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleString("he-IL");
  } catch {
    return v;
  }
}

function employeeBadgeClass(value?: string | null): string {
  const s = (value || "").toLowerCase();

  if (["active", "approved", "paid", "completed"].includes(s)) {
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  }

  if (["rejected", "blocked", "terminated", "cancelled"].includes(s)) {
    return "bg-red-100 text-red-800 border border-red-200";
  }

  if (["pending", "draft", "submitted", "open"].includes(s)) {
    return "bg-amber-100 text-amber-800 border border-amber-200";
  }

  return "bg-slate-100 text-slate-800 border border-slate-200";
}

// ============================================================
// API
// ============================================================

async function fetchEmployee360(employeeId: number): Promise<Employee360Payload> {
  const res = await fetch(`/api/employees/${employeeId}/360`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) throw new Error(`Failed to fetch employee 360: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

async function approveAttendance(attendanceId: number) {
  const res = await fetch(`/api/attendance/${attendanceId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ attendance_id: attendanceId }),
  });

  if (!res.ok) throw new Error("Failed to approve attendance");
  return res.json();
}

async function calculatePayroll(employeeId: number) {
  const res = await fetch(`/api/payroll/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ employee_id: employeeId }),
  });

  if (!res.ok) throw new Error("Failed to calculate payroll");
  return res.json();
}

// ============================================================
// QUERY KEY
// ============================================================

export const employee360QueryKey = (employeeId: number) => ["employee360", employeeId] as const;

// ============================================================
// UI PARTS
// ============================================================

function SectionCard({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="text-lg font-black text-slate-900">{title}</div>
        <div>{right}</div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function Badge({ value }: { value?: string | null }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${employeeBadgeClass(value)}`}>
      {value || "—"}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  disabled,
  variant = "dark",
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "dark" | "light";
}) {
  const cls =
    variant === "dark"
      ? "rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
      : "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {label}
    </button>
  );
}

type EmployeeTab =
  | "overview"
  | "attendance"
  | "payroll"
  | "expenses"
  | "assignments"
  | "payComponents"
  | "leave"
  | "ai"
  | "audit";

function TabButton({
  active,
  label,
  onClick,
  count,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
        active
          ? "bg-slate-900 text-white"
          : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
      }`}
    >
      {label}
      {typeof count === "number" ? ` (${count})` : ""}
    </button>
  );
}

// ============================================================
// MAIN
// ============================================================

export function Employee360({ employeeId }: { employeeId: number }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<EmployeeTab>("overview");

  const query = useQuery({
    queryKey: employee360QueryKey(employeeId),
    queryFn: () => fetchEmployee360(employeeId),
  });

  const approveAttendanceMutation = useMutation({
    mutationFn: approveAttendance,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: employee360QueryKey(employeeId) });
    },
  });

  const calculatePayrollMutation = useMutation({
    mutationFn: () => calculatePayroll(employeeId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: employee360QueryKey(employeeId) });
    },
  });

  // FIX: useMemo MUST be called before any early returns (Rules of Hooks)
  const nextBestAction = useMemo(() => {
    if (!query.data) return "";
    const att = query.data.attendance ?? [];
    const pr = query.data.payroll_runs ?? [];
    const lr = query.data.leave_requests ?? [];

    const pendingAttendance = att.find((x) => ["pending", "Submitted", "submitted"].includes(x.approval_status));
    if (pendingAttendance) return "אשר נוכחות ממתינה";
    if (pr.length === 0) return "חשב שכר לעובד";
    if (lr.some((x) => x.approval_status === "Pending")) return "בדוק בקשות חופשה ממתינות";
    return "המשך מעקב כוח אדם ושכר";
  }, [query.data]);

  if (query.isLoading) {
    return (
      <div className="p-6">
        <div className="h-10 w-72 rounded-xl bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (query.isError || !query.data?.employee) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          שגיאה בטעינת Employee360
        </div>
      </div>
    );
  }

  const data = query.data;
  const employee = data.employee;
  const attendance = data.attendance ?? [];
  const payrollRuns = data.payroll_runs ?? [];
  const expenses = data.expenses ?? [];
  const assignments = data.assignments ?? [];
  const payComponents = data.pay_components ?? [];
  const leaveRequests = data.leave_requests ?? [];
  const insights = data.insights ?? [];
  const audit = data.audit ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl p-6">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-black text-slate-900">{employee.full_name}</h1>
                    <Badge value={employee.status} />
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      {employee.employee_number}
                    </span>
                  </div>

                  <div className="text-sm text-slate-600">
                    {employee.job_title || "—"} • {employee.department || "—"} • {employee.employment_type || "—"}
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <span>Hire Date: {ed(employee.hire_date)}</span>
                    <span>Email: {employee.email || "—"}</span>
                    <span>Phone: {employee.mobile || employee.phone || "—"}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    label={calculatePayrollMutation.isPending ? "מחשב..." : "Calculate Payroll"}
                    onClick={() => calculatePayrollMutation.mutate()}
                    disabled={calculatePayrollMutation.isPending}
                  />
                  <ActionButton variant="light" label="Create Expense" />
                  <ActionButton variant="light" label="Submit Attendance" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <SummaryCard title="Base Salary" value={em(employee.base_salary)} />
              <SummaryCard title="Hourly Rate" value={em(employee.hourly_rate)} />
              <SummaryCard title="Attendance Rows" value={String(attendance.length)} />
              <SummaryCard title="Payroll Runs" value={String(payrollRuns.length)} />
            </div>

            <div className="flex flex-wrap gap-2">
              <TabButton active={activeTab === "overview"} label="סקירה" onClick={() => setActiveTab("overview")} />
              <TabButton active={activeTab === "attendance"} label="נוכחות" onClick={() => setActiveTab("attendance")} count={attendance.length} />
              <TabButton active={activeTab === "payroll"} label="שכר" onClick={() => setActiveTab("payroll")} count={payrollRuns.length} />
              <TabButton active={activeTab === "expenses"} label="הוצאות" onClick={() => setActiveTab("expenses")} count={expenses.length} />
              <TabButton active={activeTab === "assignments"} label="שיוכים" onClick={() => setActiveTab("assignments")} count={assignments.length} />
              <TabButton active={activeTab === "payComponents"} label="רכיבי שכר" onClick={() => setActiveTab("payComponents")} count={payComponents.length} />
              <TabButton active={activeTab === "leave"} label="חופשות" onClick={() => setActiveTab("leave")} count={leaveRequests.length} />
              <TabButton active={activeTab === "ai"} label="AI" onClick={() => setActiveTab("ai")} count={insights.length} />
              <TabButton active={activeTab === "audit"} label="Audit" onClick={() => setActiveTab("audit")} count={audit.length} />
            </div>

            {activeTab === "overview" && (
              <div className="grid grid-cols-1 gap-6">
                <SectionCard title="תמונת עובד">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm text-slate-500">Salary Type</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">{employee.salary_type || "—"}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm text-slate-500">Pension</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">{employee.pension_status || "—"}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm text-slate-500">Bank Status</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">{employee.bank_status || "—"}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm text-slate-500">Currency</div>
                      <div className="mt-2 text-xl font-bold text-slate-900">{employee.currency || "ILS"}</div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="נוכחות אחרונה">
                  {attendance.length === 0 ? (
                    <div className="text-sm text-slate-600">אין נוכחות.</div>
                  ) : (
                    <div className="space-y-3">
                      {attendance.slice(0, 5).map((row) => (
                        <div key={row.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="font-bold text-slate-900">{ed(row.work_date)}</div>
                              <div className="text-sm text-slate-600">
                                Regular: {row.regular_hours} • Overtime: {row.overtime_hours} • WO #{row.work_order_id || "—"}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge value={row.approval_status || row.state} />
                              {["pending", "Submitted", "submitted"].includes(row.approval_status) ? (
                                <ActionButton
                                  label="Approve"
                                  variant="light"
                                  onClick={() => approveAttendanceMutation.mutate(row.id)}
                                  disabled={approveAttendanceMutation.isPending}
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>
            )}

            {activeTab === "attendance" && (
              <SectionCard title="נוכחות">
                {attendance.length === 0 ? (
                  <div className="text-sm text-slate-600">אין נוכחות.</div>
                ) : (
                  <div className="space-y-3">
                    {attendance.map((row) => (
                      <div key={row.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{ed(row.work_date)}</div>
                            <div className="text-sm text-slate-600">
                              Project #{row.project_id || "—"} • Work Order #{row.work_order_id || "—"}
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                              Regular: {row.regular_hours} • Overtime: {row.overtime_hours}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge value={row.approval_status || row.state} />
                            {["pending", "Submitted", "submitted"].includes(row.approval_status) ? (
                              <ActionButton
                                label="Approve"
                                variant="light"
                                onClick={() => approveAttendanceMutation.mutate(row.id)}
                                disabled={approveAttendanceMutation.isPending}
                              />
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "payroll" && (
              <SectionCard title="Payroll Runs">
                {payrollRuns.length === 0 ? (
                  <div className="text-sm text-slate-600">אין payroll runs.</div>
                ) : (
                  <div className="space-y-3">
                    {payrollRuns.map((run) => (
                      <div key={run.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{run.payroll_run_number}</div>
                            <div className="text-sm text-slate-600">
                              {ed(run.payroll_period_start)} - {ed(run.payroll_period_end)}
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                              Gross: {em(run.gross_pay)} • Net: {em(run.net_pay)}
                            </div>
                          </div>
                          <Badge value={run.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "expenses" && (
              <SectionCard title="הוצאות">
                {expenses.length === 0 ? (
                  <div className="text-sm text-slate-600">אין הוצאות.</div>
                ) : (
                  <div className="space-y-3">
                    {expenses.map((expense) => (
                      <div key={expense.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{expense.expense_number}</div>
                            <div className="text-sm text-slate-600">
                              Date: {ed(expense.expense_date)} • Category: {expense.category || "—"} • Amount: {em(expense.amount)}
                            </div>
                            {expense.notes ? <div className="mt-2 text-sm text-slate-700">{expense.notes}</div> : null}
                          </div>
                          <Badge value={expense.reimbursement_status || expense.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "assignments" && (
              <SectionCard title="שיוכים">
                {assignments.length === 0 ? (
                  <div className="text-sm text-slate-600">אין שיוכים.</div>
                ) : (
                  <div className="space-y-3">
                    {assignments.map((assignment) => (
                      <div key={assignment.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{assignment.assignment_role || "Assignment"}</div>
                            <div className="text-sm text-slate-600">
                              Project #{assignment.project_id || "—"} • Work Order #{assignment.work_order_id || "—"}
                            </div>
                            <div className="mt-1 text-sm text-slate-600">
                              Assigned: {edt(assignment.assigned_at)} • Released: {edt(assignment.released_at)}
                            </div>
                          </div>
                          <Badge value={assignment.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "payComponents" && (
              <SectionCard title="רכיבי שכר">
                {payComponents.length === 0 ? (
                  <div className="text-sm text-slate-600">אין רכיבי שכר.</div>
                ) : (
                  <div className="space-y-3">
                    {payComponents.map((component) => (
                      <div key={component.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="font-bold text-slate-900">{component.component_name}</div>
                        <div className="mt-2 text-sm text-slate-600">
                          Type: {component.component_type} • Value Type: {component.value_type} • Amount: {em(component.value_amount)}
                        </div>
                        <div className="mt-1 text-sm text-slate-600">
                          {ed(component.effective_from)} - {ed(component.effective_to)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "leave" && (
              <SectionCard title="חופשות">
                {leaveRequests.length === 0 ? (
                  <div className="text-sm text-slate-600">אין בקשות חופשה.</div>
                ) : (
                  <div className="space-y-3">
                    {leaveRequests.map((leave) => (
                      <div key={leave.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{leave.request_number}</div>
                            <div className="text-sm text-slate-600">
                              {leave.leave_name} • {ed(leave.start_date)} - {ed(leave.end_date)} • {leave.total_days} days
                            </div>
                          </div>
                          <Badge value={leave.approval_status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "ai" && (
              <SectionCard title="AI Insights">
                {insights.length === 0 ? (
                  <div className="text-sm text-slate-600">אין תובנות AI.</div>
                ) : (
                  <div className="space-y-3">
                    {insights.map((insight) => (
                      <div key={insight.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">
                              {insight.insight_number} • {insight.category || "Insight"}
                            </div>
                            <div className="mt-2 text-sm text-slate-700">{insight.recommendation_text || "—"}</div>
                            <div className="mt-2 text-xs text-slate-500">Confidence: {insight.confidence_score ?? "—"}</div>
                          </div>
                          <Badge value={insight.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "audit" && (
              <SectionCard title="Audit">
                {audit.length === 0 ? (
                  <div className="text-sm text-slate-600">אין Audit.</div>
                ) : (
                  <div className="space-y-3">
                    {audit.map((item) => (
                      <div key={item.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{item.action_name}</div>
                            <div className="text-sm text-slate-600">
                              מודול: {item.source_module} • משתמש: {item.performed_by_user_name || "—"}
                            </div>
                          </div>
                          <div className="text-sm text-slate-500">{edt(item.performed_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}
          </div>

          <div className="space-y-6">
            <SectionCard title="Next Best Action">
              <div className="text-sm text-slate-700">{nextBestAction}</div>
            </SectionCard>

            <SectionCard title="בריאות עובד">
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>סטטוס</span>
                  <Badge value={employee.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span>Salary Type</span>
                  <span className="font-bold">{employee.salary_type || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Pension</span>
                  <span className="font-bold">{employee.pension_status || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Assignments</span>
                  <span className="font-bold">{assignments.length}</span>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
