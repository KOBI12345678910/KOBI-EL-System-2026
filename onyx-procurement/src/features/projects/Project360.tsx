// ============================================================
// FILE: src/features/projects/Project360.tsx
// ============================================================

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

type ProjectCore = {
  id: number;
  public_id: string;
  project_number: string;
  project_name: string;
  customer_id: number;
  quote_id?: number | null;
  project_type?: string | null;
  location_name?: string | null;
  address_line_1?: string | null;
  city?: string | null;
  region?: string | null;
  owner_user_id?: number | null;
  budget_amount: number;
  actual_cost: number;
  billed_amount: number;
  collected_amount: number;
  progress_percent: number;
  priority?: string | null;
  planned_start_date?: string | null;
  planned_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  billable: boolean;
  state: string;
  created_at: string;
  updated_at: string;
};

type ProjectCostPlan = {
  id: number;
  project_id: number;
  materials_budget: number;
  labor_budget: number;
  subcontractor_budget: number;
  logistics_budget: number;
  contingency_budget: number;
  total_budget: number;
  version: number;
};

type ProjectRisk = {
  id: number;
  risk_number: string;
  risk_category: string;
  title: string;
  description?: string | null;
  probability_score: number;
  impact_score: number;
  overall_score: number;
  mitigation_plan?: string | null;
  state: string;
};

type ProjectBlocker = {
  id: number;
  blocker_number: string;
  blocker_type: string;
  title: string;
  description?: string | null;
  severity: string;
  state: string;
};

type ProjectWorkOrder = {
  id: number;
  work_order_number: string;
  title: string;
  state: string;
  progress_percent: number;
  required_start_date?: string | null;
  required_end_date?: string | null;
};

type ProjectTask = {
  id: number;
  task_number: string;
  title: string;
  state: string;
  priority?: string | null;
  due_date?: string | null;
};

type ProjectInvoice = {
  id: number;
  invoice_number: string;
  issue_date?: string | null;
  state: string;
  grand_total: number;
  balance_due: number;
};

type ProjectAlert = {
  id: number;
  alert_number: string;
  category: string;
  severity: string;
  title: string;
  state: string;
};

type ProjectInsight = {
  id: number;
  insight_number: string;
  category?: string | null;
  confidence_score?: number | null;
  recommendation_text?: string | null;
  state: string;
};

type Project360Payload = {
  project: ProjectCore;
  cost_plan?: ProjectCostPlan | null;
  risks?: ProjectRisk[];
  blockers?: ProjectBlocker[];
  work_orders?: ProjectWorkOrder[];
  tasks?: ProjectTask[];
  invoices?: ProjectInvoice[];
  alerts?: ProjectAlert[];
  insights?: ProjectInsight[];
  work_orders_count?: number;
  open_tasks_count?: number;
  invoice_balance?: number;
};

// ============================================================
// HELPERS
// ============================================================

const projectCurrencyFormatter = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function fmtMoney(v?: number | null) {
  return projectCurrencyFormatter.format(v ?? 0);
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("he-IL");
  } catch {
    return v;
  }
}

function projectBadgeClass(state?: string | null): string {
  const s = (state || "").toLowerCase();

  if (["active", "approved", "completed", "closed"].includes(s)) {
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  }

  if (["blocked", "overdue", "rejected", "cancelled"].includes(s)) {
    return "bg-red-100 text-red-800 border border-red-200";
  }

  if (["planning", "draft", "pending", "open", "assigned", "inprogress"].includes(s)) {
    return "bg-amber-100 text-amber-800 border border-amber-200";
  }

  return "bg-slate-100 text-slate-800 border border-slate-200";
}

// ============================================================
// API
// ============================================================

async function fetchProject360(projectId: number): Promise<Project360Payload> {
  const res = await fetch(`/api/projects/${projectId}/360`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch project 360: ${res.status}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

async function createWorkOrderForProject(projectId: number) {
  const res = await fetch(`/api/work-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      project_id: projectId,
      title: `Work Order for Project ${projectId}`,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to create work order");
  }

  return res.json();
}

async function createInvoiceForProject(projectId: number) {
  const res = await fetch(`/api/projects/${projectId}/create-invoice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to create invoice from project");
  }

  return res.json();
}

async function changeProjectState(projectId: number, toState: string) {
  const res = await fetch(`/api/projects/${projectId}/change-state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      to_state: toState,
    }),
  });

  if (!res.ok) {
    throw new Error("Failed to change project state");
  }

  return res.json();
}

// ============================================================
// QUERY KEYS
// ============================================================

export const project360QueryKey = (projectId: number) => ["project360", projectId] as const;

// ============================================================
// SMALL UI
// ============================================================

function StateBadge({ value }: { value?: string | null }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${projectBadgeClass(value)}`}>
      {value || "—"}
    </span>
  );
}

function SummaryCard({
  title,
  value,
  subValue,
}: {
  title: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
      {subValue ? <div className="mt-2 text-sm text-slate-500">{subValue}</div> : null}
    </div>
  );
}

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
        <div className="text-lg font-bold text-slate-900">{title}</div>
        <div>{right}</div>
      </div>
      <div className="p-5">{children}</div>
    </div>
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
  const className =
    variant === "dark"
      ? "rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50"
      : "rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50";

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {label}
    </button>
  );
}

// ============================================================
// TABS
// ============================================================

type ProjectTab =
  | "overview"
  | "risks"
  | "blockers"
  | "workOrders"
  | "tasks"
  | "finance"
  | "alerts"
  | "ai";

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

export function Project360({ projectId }: { projectId: number }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ProjectTab>("overview");

  const query = useQuery({
    queryKey: project360QueryKey(projectId),
    queryFn: () => fetchProject360(projectId),
  });

  const createWorkOrderMutation = useMutation({
    mutationFn: () => createWorkOrderForProject(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: project360QueryKey(projectId) });
    },
  });

  const createInvoiceMutation = useMutation({
    mutationFn: () => createInvoiceForProject(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: project360QueryKey(projectId) });
    },
  });

  const changeStateMutation = useMutation({
    mutationFn: (toState: string) => changeProjectState(projectId, toState),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: project360QueryKey(projectId) });
    },
  });

  const data = query.data;

  const nextBestAction = useMemo(() => {
    if (!data?.project) return "—";

    if ((data.blockers?.length ?? 0) > 0) {
      return "טפל בחסמים פתוחים לפני כל פעולה אחרת";
    }

    if ((data.work_orders_count ?? data.work_orders?.length ?? 0) === 0) {
      return "צור Work Order ראשון לפרויקט";
    }

    if ((data.invoice_balance ?? 0) > 0) {
      return "בדוק יתרה פתוחה וגבייה";
    }

    if ((data.risks?.length ?? 0) > 0) {
      return "בדוק סיכונים פעילים ועדכן תוכנית מיתון";
    }

    return "המשך ביצוע ומעקב התקדמות";
  }, [data]);

  if (query.isLoading) {
    return (
      <div className="p-6">
        <div className="h-10 w-72 rounded-xl bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (query.isError || !data?.project) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          שגיאה בטעינת Project360
        </div>
      </div>
    );
  }

  const project = data.project;
  const risks = data.risks ?? [];
  const blockers = data.blockers ?? [];
  const workOrders = data.work_orders ?? [];
  const tasks = data.tasks ?? [];
  const invoices = data.invoices ?? [];
  const alerts = data.alerts ?? [];
  const insights = data.insights ?? [];
  const costPlan = data.cost_plan ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl p-6">
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
          <div className="space-y-6">
            {/* Header */}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-3xl font-black text-slate-900">{project.project_name}</h1>
                    <StateBadge value={project.state} />
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      {project.project_number}
                    </span>
                  </div>

                  <div className="text-sm text-slate-600">
                    סוג: {project.project_type || "—"} • עדיפות: {project.priority || "—"} • מיקום: {project.location_name || project.city || "—"}
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <span>התחלה מתוכננת: {fmtDate(project.planned_start_date)}</span>
                    <span>סיום מתוכנן: {fmtDate(project.planned_end_date)}</span>
                    <span>עודכן: {fmtDate(project.updated_at)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    label={createWorkOrderMutation.isPending ? "יוצר..." : "צור Work Order"}
                    onClick={() => createWorkOrderMutation.mutate()}
                    disabled={createWorkOrderMutation.isPending}
                  />
                  <ActionButton
                    label={createInvoiceMutation.isPending ? "יוצר..." : "צור חשבונית"}
                    onClick={() => createInvoiceMutation.mutate()}
                    disabled={createInvoiceMutation.isPending}
                  />
                  <ActionButton
                    variant="light"
                    label={changeStateMutation.isPending ? "מעדכן..." : "סמן Active"}
                    onClick={() => changeStateMutation.mutate("Active")}
                    disabled={changeStateMutation.isPending}
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <SummaryCard title="התקדמות" value={`${project.progress_percent ?? 0}%`} />
              <SummaryCard title="תקציב" value={fmtMoney(project.budget_amount)} />
              <SummaryCard title="עלות בפועל" value={fmtMoney(project.actual_cost)} />
              <SummaryCard title="יתרת חיוב פתוחה" value={fmtMoney(data.invoice_balance)} />
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              <TabButton active={activeTab === "overview"} label="סקירה" onClick={() => setActiveTab("overview")} />
              <TabButton active={activeTab === "risks"} label="סיכונים" onClick={() => setActiveTab("risks")} count={risks.length} />
              <TabButton active={activeTab === "blockers"} label="חסמים" onClick={() => setActiveTab("blockers")} count={blockers.length} />
              <TabButton active={activeTab === "workOrders"} label="Work Orders" onClick={() => setActiveTab("workOrders")} count={workOrders.length} />
              <TabButton active={activeTab === "tasks"} label="משימות" onClick={() => setActiveTab("tasks")} count={tasks.length} />
              <TabButton active={activeTab === "finance"} label="פיננסים" onClick={() => setActiveTab("finance")} count={invoices.length} />
              <TabButton active={activeTab === "alerts"} label="Alerts" onClick={() => setActiveTab("alerts")} count={alerts.length} />
              <TabButton active={activeTab === "ai"} label="AI" onClick={() => setActiveTab("ai")} count={insights.length} />
            </div>

            {/* Tab Content */}
            {activeTab === "overview" && (
              <div className="grid grid-cols-1 gap-6">
                <SectionCard title="תקציב ותוכנית עלויות">
                  {costPlan ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-sm text-slate-500">חומרים</div>
                        <div className="mt-2 text-xl font-bold">{fmtMoney(costPlan.materials_budget)}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-sm text-slate-500">עבודה</div>
                        <div className="mt-2 text-xl font-bold">{fmtMoney(costPlan.labor_budget)}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-sm text-slate-500">לוגיסטיקה</div>
                        <div className="mt-2 text-xl font-bold">{fmtMoney(costPlan.logistics_budget)}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-sm text-slate-500">קבלני משנה</div>
                        <div className="mt-2 text-xl font-bold">{fmtMoney(costPlan.subcontractor_budget)}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-sm text-slate-500">בלת״ם</div>
                        <div className="mt-2 text-xl font-bold">{fmtMoney(costPlan.contingency_budget)}</div>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-sm text-slate-500">סה״כ תוכנית</div>
                        <div className="mt-2 text-xl font-bold">{fmtMoney(costPlan.total_budget)}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-600">אין תוכנית עלויות מוגדרת עדיין.</div>
                  )}
                </SectionCard>

                <SectionCard title="Work Orders אחרונים">
                  {workOrders.length === 0 ? (
                    <div className="text-sm text-slate-600">אין Work Orders לפרויקט הזה.</div>
                  ) : (
                    <div className="space-y-3">
                      {workOrders.slice(0, 3).map((wo) => (
                        <div key={wo.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                              <div className="font-bold text-slate-900">
                                {wo.work_order_number} • {wo.title}
                              </div>
                              <div className="text-sm text-slate-600">
                                התקדמות: {wo.progress_percent ?? 0}% • התחלה: {fmtDate(wo.required_start_date)} • סיום: {fmtDate(wo.required_end_date)}
                              </div>
                            </div>
                            <StateBadge value={wo.state} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>
            )}

            {activeTab === "risks" && (
              <SectionCard title="סיכונים">
                {risks.length === 0 ? (
                  <div className="text-sm text-slate-600">אין סיכונים פתוחים כרגע.</div>
                ) : (
                  <div className="space-y-3">
                    {risks.map((risk) => (
                      <div key={risk.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">
                              {risk.risk_number} • {risk.title}
                            </div>
                            <div className="text-sm text-slate-600">
                              קטגוריה: {risk.risk_category} • P: {risk.probability_score} • I: {risk.impact_score} • Score: {risk.overall_score}
                            </div>
                            {risk.description ? (
                              <div className="mt-2 text-sm text-slate-700">{risk.description}</div>
                            ) : null}
                          </div>
                          <StateBadge value={risk.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "blockers" && (
              <SectionCard title="חסמים">
                {blockers.length === 0 ? (
                  <div className="text-sm text-slate-600">אין חסמים פתוחים.</div>
                ) : (
                  <div className="space-y-3">
                    {blockers.map((blocker) => (
                      <div key={blocker.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">
                              {blocker.blocker_number} • {blocker.title}
                            </div>
                            <div className="text-sm text-slate-600">
                              סוג: {blocker.blocker_type} • חומרה: {blocker.severity}
                            </div>
                            {blocker.description ? (
                              <div className="mt-2 text-sm text-slate-700">{blocker.description}</div>
                            ) : null}
                          </div>
                          <StateBadge value={blocker.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "workOrders" && (
              <SectionCard title="Work Orders">
                {workOrders.length === 0 ? (
                  <div className="text-sm text-slate-600">אין Work Orders.</div>
                ) : (
                  <div className="space-y-3">
                    {workOrders.map((wo) => (
                      <div key={wo.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">
                              {wo.work_order_number} • {wo.title}
                            </div>
                            <div className="text-sm text-slate-600">
                              התקדמות: {wo.progress_percent ?? 0}% • התחלה: {fmtDate(wo.required_start_date)} • סיום: {fmtDate(wo.required_end_date)}
                            </div>
                          </div>
                          <StateBadge value={wo.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "tasks" && (
              <SectionCard title="משימות">
                {tasks.length === 0 ? (
                  <div className="text-sm text-slate-600">אין משימות פתוחות.</div>
                ) : (
                  <div className="space-y-3">
                    {tasks.map((task) => (
                      <div key={task.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">
                              {task.task_number} • {task.title}
                            </div>
                            <div className="text-sm text-slate-600">
                              עדיפות: {task.priority || "—"} • יעד: {fmtDate(task.due_date)}
                            </div>
                          </div>
                          <StateBadge value={task.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "finance" && (
              <SectionCard title="פיננסים">
                {invoices.length === 0 ? (
                  <div className="text-sm text-slate-600">אין חשבוניות משויכות לפרויקט.</div>
                ) : (
                  <div className="space-y-3">
                    {invoices.map((invoice) => (
                      <div key={invoice.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">{invoice.invoice_number}</div>
                            <div className="text-sm text-slate-600">
                              תאריך: {fmtDate(invoice.issue_date)} • סכום: {fmtMoney(invoice.grand_total)} • יתרה: {fmtMoney(invoice.balance_due)}
                            </div>
                          </div>
                          <StateBadge value={invoice.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}

            {activeTab === "alerts" && (
              <SectionCard title="Alerts">
                {alerts.length === 0 ? (
                  <div className="text-sm text-slate-600">אין Alerts פתוחים לפרויקט.</div>
                ) : (
                  <div className="space-y-3">
                    {alerts.map((alert) => (
                      <div key={alert.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">
                              {alert.alert_number} • {alert.title}
                            </div>
                            <div className="text-sm text-slate-600">
                              קטגוריה: {alert.category} • חומרה: {alert.severity}
                            </div>
                          </div>
                          <StateBadge value={alert.state} />
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
                  <div className="text-sm text-slate-600">אין תובנות AI לפרויקט.</div>
                ) : (
                  <div className="space-y-3">
                    {insights.map((insight) => (
                      <div key={insight.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:justify-between">
                          <div>
                            <div className="font-bold text-slate-900">
                              {insight.insight_number} • {insight.category || "Insight"}
                            </div>
                            <div className="mt-2 text-sm text-slate-700">
                              {insight.recommendation_text || "—"}
                            </div>
                            <div className="mt-2 text-xs text-slate-500">
                              Confidence: {insight.confidence_score ?? "—"}
                            </div>
                          </div>
                          <StateBadge value={insight.state} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            )}
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            <SectionCard title="Next Best Action">
              <div className="text-sm text-slate-700">{nextBestAction}</div>
            </SectionCard>

            <SectionCard title="בריאות פרויקט">
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span>סטטוס</span>
                  <StateBadge value={project.state} />
                </div>
                <div className="flex items-center justify-between">
                  <span>התקדמות</span>
                  <span className="font-bold">{project.progress_percent ?? 0}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Work Orders</span>
                  <span className="font-bold">{data.work_orders_count ?? workOrders.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>משימות פתוחות</span>
                  <span className="font-bold">{data.open_tasks_count ?? tasks.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>יתרת חיוב</span>
                  <span className="font-bold">{fmtMoney(data.invoice_balance)}</span>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="פעולות מהירות">
              <div className="flex flex-col gap-2">
                <ActionButton
                  label={createWorkOrderMutation.isPending ? "יוצר..." : "צור Work Order"}
                  onClick={() => createWorkOrderMutation.mutate()}
                  disabled={createWorkOrderMutation.isPending}
                />
                <ActionButton
                  label={createInvoiceMutation.isPending ? "יוצר..." : "צור חשבונית"}
                  onClick={() => createInvoiceMutation.mutate()}
                  disabled={createInvoiceMutation.isPending}
                />
                <ActionButton
                  variant="light"
                  label="העבר ל־Active"
                  onClick={() => changeStateMutation.mutate("Active")}
                  disabled={changeStateMutation.isPending}
                />
                <ActionButton
                  variant="light"
                  label="סמן Completed"
                  onClick={() => changeStateMutation.mutate("Completed")}
                  disabled={changeStateMutation.isPending}
                />
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
