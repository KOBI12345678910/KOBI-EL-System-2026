// ============================================================
// FILE: src/features/controlRooms/OperationsControlRoom.tsx
// ============================================================

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

type OperationsSummary = { snapshot_date?: string; active_work_orders?: number; delayed_work_orders?: number; avg_project_progress?: number; open_tasks?: number; material_shortages?: number; active_logistics_orders?: number };
type OperationsWorkOrder = { id: number; work_order_number: string; project_id: number; title: string; location_name?: string | null; required_start_date?: string | null; required_end_date?: string | null; progress_percent?: number | null; state: string };
type OperationsTask = { id: number; task_number: string; linked_entity_type?: string | null; linked_entity_id?: number | null; title: string; priority?: string | null; due_date?: string | null; state: string };
type OperationsShortage = { id: number; material_id: number; warehouse_id?: number | null; shortage_qty: number; parent_entity_type?: string | null; parent_entity_id?: number | null; severity: string; snapshot_at: string };
type OperationsLogistics = { id: number; logistics_order_number: string; project_id?: number | null; route_name?: string | null; scheduled_date?: string | null; assigned_driver_name?: string | null; state: string };
type OperationsAlert = { id: number; alert_number: string; category: string; severity: string; title: string; parent_entity_type?: string | null; parent_entity_id?: number | null; state: string };
type OperationsProjectRow = { project_id: number; project_number: string; project_name: string; state: string; progress_percent: number; blockers_count: number; risks_count: number };

type OperationsControlRoomPayload = {
  summary?: OperationsSummary;
  active_work_orders?: OperationsWorkOrder[];
  delayed_work_orders?: OperationsWorkOrder[];
  open_tasks?: OperationsTask[];
  shortages?: OperationsShortage[];
  logistics_orders?: OperationsLogistics[];
  alerts?: OperationsAlert[];
  project_rows?: OperationsProjectRow[];
};

// ============================================================
// HELPERS
// ============================================================

function formatDate(value?: string | null): string {
  if (!value) return "—";
  try { return new Date(value).toLocaleDateString("he-IL"); } catch { return value; }
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  try { return new Date(value).toLocaleString("he-IL"); } catch { return value; }
}

function badgeClass(value?: string | null): string {
  const s = (value || "").toLowerCase();
  if (["active", "inprogress", "assigned", "completed", "resolved"].includes(s)) return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (["delayed", "blocked", "open", "critical", "reopened", "cancelled"].includes(s)) return "bg-red-100 text-red-800 border border-red-200";
  if (["planning", "pending", "waitingmaterials", "qa", "medium"].includes(s)) return "bg-amber-100 text-amber-800 border border-amber-200";
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

// ============================================================
// API
// ============================================================

async function fetchOperationsControlRoom(): Promise<OperationsControlRoomPayload> {
  const res = await fetch("/api/control-room/operations", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch operations control room: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export const operationsControlRoomQueryKey = () => ["operationsControlRoom"] as const;

// ============================================================
// UI
// ============================================================

function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="text-lg font-black text-slate-900">{title}</div><div>{right}</div></div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function MetricCard({ title, value, subValue }: { title: string; value: string; subValue?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-black text-slate-900">{value}</div>
      {subValue ? <div className="mt-2 text-sm text-slate-500">{subValue}</div> : null}
    </div>
  );
}

function Badge({ value }: { value?: string | null }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>{value || "—"}</span>;
}

type OperationsTab = "overview" | "workOrders" | "tasks" | "shortages" | "logistics" | "alerts" | "projects";

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

export function OperationsControlRoom() {
  const [activeTab, setActiveTab] = useState<OperationsTab>("overview");
  const query = useQuery({ queryKey: operationsControlRoomQueryKey(), queryFn: fetchOperationsControlRoom, refetchInterval: 60_000 });

  // FIX: useMemo MUST be called before any early returns (Rules of Hooks)
  const nextBestAction = useMemo(() => {
    if (!query.data) return "";
    const summary = query.data.summary ?? {};
    const alerts = query.data.alerts ?? [];
    if ((summary.material_shortages ?? 0) > 0) return "טפל בחוסרי חומרים דחופים";
    if ((summary.delayed_work_orders ?? 0) > 0) return "העבר פוקוס ל־Work Orders מאוחרים";
    if (alerts.some((x) => ["critical", "open"].includes((x.severity || x.state || "").toLowerCase()))) return "טפל ב־Alerts תפעוליים קריטיים";
    return "שמור על קצב ביצוע, לוגיסטיקה וחומרי גלם";
  }, [query.data]);

  if (query.isLoading) return <div className="p-6"><div className="h-10 w-96 rounded-xl bg-slate-200 animate-pulse" /></div>;
  if (query.isError) return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">שגיאה בטעינת Operations Control Room</div></div>;

  const data = query.data ?? {};
  const summary = data.summary ?? {};
  const activeWorkOrders = data.active_work_orders ?? [];
  const delayedWorkOrders = data.delayed_work_orders ?? [];
  const openTasks = data.open_tasks ?? [];
  const shortages = data.shortages ?? [];
  const logisticsOrders = data.logistics_orders ?? [];
  const alerts = data.alerts ?? [];
  const projectRows = data.project_rows ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3"><h1 className="text-4xl font-black text-slate-900">Operations Control Room</h1><Badge value="Live" /></div>
              <div className="text-sm text-slate-600">מרכז שליטה תפעולי ל־Work Orders, משימות, חסרים, לוגיסטיקה ו־Alerts.</div>
              <div className="text-sm text-slate-500">Snapshot: {formatDate(summary.snapshot_date)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => query.refetch()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700">רענן</button>
              <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Export Ops</button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
          <MetricCard title="Active WOs" value={String(summary.active_work_orders ?? 0)} />
          <MetricCard title="Delayed WOs" value={String(summary.delayed_work_orders ?? 0)} />
          <MetricCard title="Avg Progress" value={`${Math.round(summary.avg_project_progress ?? 0)}%`} />
          <MetricCard title="Open Tasks" value={String(summary.open_tasks ?? 0)} />
          <MetricCard title="Shortages" value={String(summary.material_shortages ?? 0)} />
          <MetricCard title="Logistics" value={String(summary.active_logistics_orders ?? 0)} />
        </div>

        <div className="flex flex-wrap gap-2">
          <TabButton active={activeTab === "overview"} label="סקירה" onClick={() => setActiveTab("overview")} />
          <TabButton active={activeTab === "workOrders"} label="Work Orders" onClick={() => setActiveTab("workOrders")} count={activeWorkOrders.length} />
          <TabButton active={activeTab === "tasks"} label="משימות" onClick={() => setActiveTab("tasks")} count={openTasks.length} />
          <TabButton active={activeTab === "shortages"} label="חוסרים" onClick={() => setActiveTab("shortages")} count={shortages.length} />
          <TabButton active={activeTab === "logistics"} label="לוגיסטיקה" onClick={() => setActiveTab("logistics")} count={logisticsOrders.length} />
          <TabButton active={activeTab === "alerts"} label="Alerts" onClick={() => setActiveTab("alerts")} count={alerts.length} />
          <TabButton active={activeTab === "projects"} label="פרויקטים" onClick={() => setActiveTab("projects")} count={projectRows.length} />
        </div>

        {activeTab === "overview" && (
          <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-6">
            <Panel title="Delayed Work Orders">
              {delayedWorkOrders.length === 0 ? <div className="text-sm text-slate-600">אין Work Orders מאוחרים כרגע.</div> : (
                <div className="space-y-3">{delayedWorkOrders.slice(0, 8).map((wo) => (
                  <div key={wo.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="font-bold text-slate-900">{wo.work_order_number} • {wo.title}</div><div className="text-sm text-slate-600">Project #{wo.project_id} • יעד סיום: {formatDate(wo.required_end_date)} • Progress: {wo.progress_percent ?? 0}%</div></div><Badge value={wo.state} /></div></div>
                ))}</div>
              )}
            </Panel>
            <Panel title="Material Shortages">
              {shortages.length === 0 ? <div className="text-sm text-slate-600">אין חוסרים כרגע.</div> : (
                <div className="space-y-3">{shortages.slice(0, 8).map((s) => (
                  <div key={s.id} className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-900">Material #{s.material_id} • Shortage: {s.shortage_qty}</div><div className="mt-2 text-sm text-slate-600">Warehouse #{s.warehouse_id || "—"} • Parent: {s.parent_entity_type || "—"} #{s.parent_entity_id || "—"}</div><div className="mt-2"><Badge value={s.severity} /></div></div>
                ))}</div>
              )}
            </Panel>
          </div>
        )}

        {activeTab === "workOrders" && (
          <Panel title="Active Work Orders">
            {activeWorkOrders.length === 0 ? <div className="text-sm text-slate-600">אין Work Orders פעילים.</div> : (
              <div className="space-y-3">{activeWorkOrders.map((wo) => (
                <div key={wo.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="font-bold text-slate-900">{wo.work_order_number} • {wo.title}</div><div className="text-sm text-slate-600">Project #{wo.project_id} • {wo.location_name || "—"} • Start: {formatDate(wo.required_start_date)} • End: {formatDate(wo.required_end_date)}</div></div><div className="flex items-center gap-2"><div className="text-sm font-bold text-slate-700">{wo.progress_percent ?? 0}%</div><Badge value={wo.state} /></div></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        {activeTab === "tasks" && (
          <Panel title="Open Tasks">
            {openTasks.length === 0 ? <div className="text-sm text-slate-600">אין משימות פתוחות.</div> : (
              <div className="space-y-3">{openTasks.map((task) => (
                <div key={task.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:justify-between"><div><div className="font-bold text-slate-900">{task.task_number} • {task.title}</div><div className="text-sm text-slate-600">{task.linked_entity_type || "—"} #{task.linked_entity_id || "—"} • יעד: {formatDate(task.due_date)}</div></div><div className="flex items-center gap-2"><Badge value={task.priority || task.state} /><Badge value={task.state} /></div></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        {activeTab === "shortages" && (
          <Panel title="Shortage Queue">
            {shortages.length === 0 ? <div className="text-sm text-slate-600">אין חוסרים.</div> : (
              <div className="space-y-3">{shortages.map((s) => (
                <div key={s.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:justify-between"><div><div className="font-bold text-slate-900">Material #{s.material_id}</div><div className="text-sm text-slate-600">Qty: {s.shortage_qty} • Snapshot: {formatDateTime(s.snapshot_at)}</div><div className="mt-1 text-sm text-slate-600">Parent: {s.parent_entity_type || "—"} #{s.parent_entity_id || "—"}</div></div><Badge value={s.severity} /></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        {activeTab === "logistics" && (
          <Panel title="Logistics Orders">
            {logisticsOrders.length === 0 ? <div className="text-sm text-slate-600">אין הזמנות לוגיסטיקה.</div> : (
              <div className="space-y-3">{logisticsOrders.map((l) => (
                <div key={l.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:justify-between"><div><div className="font-bold text-slate-900">{l.logistics_order_number}</div><div className="text-sm text-slate-600">Project #{l.project_id || "—"} • Route: {l.route_name || "—"} • Date: {formatDate(l.scheduled_date)}</div><div className="mt-1 text-sm text-slate-600">Driver: {l.assigned_driver_name || "—"}</div></div><Badge value={l.state} /></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        {activeTab === "alerts" && (
          <Panel title="Operational Alerts">
            {alerts.length === 0 ? <div className="text-sm text-slate-600">אין Alerts תפעוליים.</div> : (
              <div className="space-y-3">{alerts.map((a) => (
                <div key={a.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:justify-between"><div><div className="font-bold text-slate-900">{a.alert_number} • {a.title}</div><div className="text-sm text-slate-600">Category: {a.category} • Severity: {a.severity} • Parent: {a.parent_entity_type || "—"} #{a.parent_entity_id || "—"}</div></div><Badge value={a.state} /></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        {activeTab === "projects" && (
          <Panel title="Project Ops Heat">
            {projectRows.length === 0 ? <div className="text-sm text-slate-600">אין פרויקטים להצגה.</div> : (
              <div className="space-y-3">{projectRows.map((p) => (
                <div key={p.project_id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:justify-between"><div><div className="font-bold text-slate-900">{p.project_number} • {p.project_name}</div><div className="text-sm text-slate-600">Progress: {p.progress_percent}% • Risks: {p.risks_count} • Blockers: {p.blockers_count}</div></div><Badge value={p.state} /></div></div>
              ))}</div>
            )}
          </Panel>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          <MetricCard title="Next Best Action" value={nextBestAction} />
          <MetricCard title="Snapshot" value={formatDate(summary.snapshot_date)} />
          <MetricCard title="Focus" value={summary.material_shortages ? "Materials" : "Execution"} />
          <MetricCard title="Live Refresh" value="60s" />
        </div>
      </div>
    </div>
  );
}
