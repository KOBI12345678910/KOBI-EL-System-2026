// ============================================================
// FILE: src/features/controlRooms/ExecutiveControlTower.tsx
// ============================================================

import React from "react";
import { useQuery } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

type ExecutiveSummary = {
  snapshot_date?: string;
  total_revenue?: number;
  open_projects_count?: number;
  overdue_collections_amount?: number;
  procurement_bottlenecks_count?: number;
  payroll_risk_count?: number;
  inventory_shortage_count?: number;
  open_alerts_count?: number;
};

type ExecutiveAlert = {
  id: number;
  alert_number: string;
  category: string;
  severity: string;
  title: string;
  state: string;
  parent_entity_type?: string | null;
  parent_entity_id?: number | null;
};

type ExecutiveRecommendation = {
  id: number;
  recommendation_number: string;
  parent_entity_type?: string | null;
  parent_entity_id?: number | null;
  recommendation_text: string;
  priority?: string | null;
  confidence_score?: number | null;
};

type ExecutiveProjectRisk = {
  project_id: number;
  project_number: string;
  project_name: string;
  state: string;
  progress_percent: number;
  blockers_count: number;
  risks_count: number;
};

type ExecutiveCollectionRisk = {
  invoice_id: number;
  invoice_number: string;
  customer_id: number;
  balance_due: number;
  due_date?: string | null;
  risk_score?: number | null;
  state: string;
};

type ExecutiveTowerPayload = {
  summary?: ExecutiveSummary;
  open_alerts?: ExecutiveAlert[];
  recommendations?: ExecutiveRecommendation[];
  project_risks?: ExecutiveProjectRisk[];
  collection_risks?: ExecutiveCollectionRisk[];
};

// ============================================================
// HELPERS
// ============================================================

const execMoney = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  maximumFractionDigits: 0,
});

function money(v?: number | null) {
  return execMoney.format(v ?? 0);
}

function dateLabel(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("he-IL");
  } catch {
    return v;
  }
}

function badgeClass(value?: string | null) {
  const s = (value || "").toLowerCase();

  if (["open", "overdue", "blocked", "high", "critical", "reopened"].includes(s)) {
    return "bg-red-100 text-red-800 border border-red-200";
  }

  if (["active", "resolved", "closed", "completed", "paid"].includes(s)) {
    return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  }

  return "bg-amber-100 text-amber-800 border border-amber-200";
}

// ============================================================
// API
// ============================================================

async function fetchExecutiveControlTower(): Promise<ExecutiveTowerPayload> {
  const res = await fetch("/api/control-tower/executive", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch executive control tower: ${res.status}`);
  }

  const json = await res.json();
  return json.data ?? json;
}

// ============================================================
// QUERY KEY
// ============================================================

export const executiveControlTowerQueryKey = () => ["executiveControlTower"] as const;

// ============================================================
// UI PARTS
// ============================================================

function MetricCard({
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
      <div className="mt-3 text-3xl font-black text-slate-900">{value}</div>
      {subValue ? <div className="mt-2 text-sm text-slate-500">{subValue}</div> : null}
    </div>
  );
}

function Panel({
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

function Badge({ value }: { value?: string | null }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>
      {value || "—"}
    </span>
  );
}

// ============================================================
// MAIN
// ============================================================

export function ExecutiveControlTower() {
  const query = useQuery({
    queryKey: executiveControlTowerQueryKey(),
    queryFn: fetchExecutiveControlTower,
    refetchInterval: 60_000,
  });

  if (query.isLoading) {
    return (
      <div className="p-6">
        <div className="h-10 w-96 rounded-xl bg-slate-200 animate-pulse" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
          שגיאה בטעינת Executive Control Tower
        </div>
      </div>
    );
  }

  const data = query.data ?? {};
  const summary = data.summary ?? {};
  const openAlerts = data.open_alerts ?? [];
  const recommendations = data.recommendations ?? [];
  const projectRisks = data.project_risks ?? [];
  const collectionRisks = data.collection_risks ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-4xl font-black text-slate-900">Executive Control Tower</h1>
                <Badge value="Live" />
              </div>
              <div className="text-sm text-slate-600">
                תמונת שליטה ניהולית רוחבית: כספים, תפעול, סיכונים, גבייה, חסמים, AI, וחריגות חוצות מערכת.
              </div>
              <div className="text-sm text-slate-500">
                Snapshot: {dateLabel(summary.snapshot_date)}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => query.refetch()}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
              >
                רענן Control Tower
              </button>
              <button
                type="button"
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                Export Snapshot
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <MetricCard title="Revenue" value={money(summary.total_revenue)} />
          <MetricCard title="Open Projects" value={String(summary.open_projects_count ?? 0)} />
          <MetricCard title="Overdue Collections" value={money(summary.overdue_collections_amount)} />
          <MetricCard title="Open Alerts" value={String(summary.open_alerts_count ?? 0)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <MetricCard title="Procurement Bottlenecks" value={String(summary.procurement_bottlenecks_count ?? 0)} />
          <MetricCard title="Payroll Risk" value={String(summary.payroll_risk_count ?? 0)} />
          <MetricCard title="Inventory Shortages" value={String(summary.inventory_shortage_count ?? 0)} />
          <MetricCard title="Snapshot Date" value={dateLabel(summary.snapshot_date)} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-6">
          <Panel title="Open Alerts">
            {openAlerts.length === 0 ? (
              <div className="text-sm text-slate-600">אין Alerts פתוחים כרגע.</div>
            ) : (
              <div className="space-y-3">
                {openAlerts.map((alert) => (
                  <div key={alert.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <div className="font-bold text-slate-900">
                          {alert.alert_number} • {alert.title}
                        </div>
                        <div className="text-sm text-slate-600">
                          קטגוריה: {alert.category} • חומרה: {alert.severity} • Parent: {alert.parent_entity_type || "—"} #{alert.parent_entity_id || "—"}
                        </div>
                      </div>
                      <Badge value={alert.state} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="AI Recommendations">
            {recommendations.length === 0 ? (
              <div className="text-sm text-slate-600">אין המלצות AI חדשות.</div>
            ) : (
              <div className="space-y-3">
                {recommendations.map((rec) => (
                  <div key={rec.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="font-bold text-slate-900">
                      {rec.recommendation_number} • {rec.priority || "normal"}
                    </div>
                    <div className="mt-2 text-sm text-slate-700">{rec.recommendation_text}</div>
                    <div className="mt-2 text-xs text-slate-500">
                      Parent: {rec.parent_entity_type || "—"} #{rec.parent_entity_id || "—"} • Confidence: {rec.confidence_score ?? "—"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6">
          <Panel title="Project Risk Table">
            {projectRisks.length === 0 ? (
              <div className="text-sm text-slate-600">אין פרויקטים בסיכון כרגע.</div>
            ) : (
              <div className="space-y-3">
                {projectRisks.map((project) => (
                  <div key={project.project_id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <div className="font-bold text-slate-900">
                          {project.project_number} • {project.project_name}
                        </div>
                        <div className="text-sm text-slate-600">
                          Progress: {project.progress_percent}% • Risks: {project.risks_count} • Blockers: {project.blockers_count}
                        </div>
                      </div>
                      <Badge value={project.state} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Collection Risk Table">
            {collectionRisks.length === 0 ? (
              <div className="text-sm text-slate-600">אין סיכוני גבייה כרגע.</div>
            ) : (
              <div className="space-y-3">
                {collectionRisks.map((risk) => (
                  <div key={risk.invoice_id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{risk.invoice_number}</div>
                        <div className="text-sm text-slate-600">
                          Due: {dateLabel(risk.due_date)} • Balance: {money(risk.balance_due)} • Risk Score: {risk.risk_score ?? "—"}
                        </div>
                      </div>
                      <Badge value={risk.state} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Finance Risk</div>
            <div className="mt-3 text-2xl font-black text-slate-900">
              {money(summary.overdue_collections_amount)}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Operations Exposure</div>
            <div className="mt-3 text-2xl font-black text-slate-900">
              {summary.open_projects_count ?? 0}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">Procurement Stress</div>
            <div className="mt-3 text-2xl font-black text-slate-900">
              {summary.procurement_bottlenecks_count ?? 0}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-slate-500">System Alert Load</div>
            <div className="mt-3 text-2xl font-black text-slate-900">
              {summary.open_alerts_count ?? 0}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
