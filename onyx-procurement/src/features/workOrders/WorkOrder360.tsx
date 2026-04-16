// ============================================================
// FILE: src/features/workOrders/WorkOrder360.tsx
// ============================================================

import React, { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// ============================================================
// TYPES
// ============================================================

type WOCore = {
  id: number;
  public_id: string;
  work_order_number: string;
  project_id: number;
  title: string;
  description?: string | null;
  location_name?: string | null;
  state: string;
  progress_percent: number;
  owner_user_id?: number | null;
  required_start_date?: string | null;
  required_end_date?: string | null;
  actual_start_date?: string | null;
  actual_end_date?: string | null;
  created_at: string;
  updated_at: string;
};

type WOQAChecklist = {
  id: number;
  checklist_code: string;
  checklist_name: string;
  state: string;
  items_total?: number;
  items_passed?: number;
};

type WOAssignment = {
  id: number;
  employee_id: number;
  employee_name?: string;
  role_in_order?: string | null;
  state: string;
};

type WOReservation = {
  id: number;
  material_name?: string;
  quantity: number;
  state: string;
};

type WOAlert = {
  id: number;
  alert_number: string;
  severity: string;
  title: string;
  state: string;
};

type WO360Payload = {
  work_order: WOCore;
  qa_checklists?: WOQAChecklist[];
  assignments?: WOAssignment[];
  reservations?: WOReservation[];
  alerts?: WOAlert[];
  reservations_count?: number;
  assignments_count?: number;
  alerts_count?: number;
};

// ============================================================
// HELPERS
// ============================================================

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try { return new Date(v).toLocaleDateString("he-IL"); } catch { return v; }
}

function badgeClass(s?: string | null) {
  const v = (s || "").toLowerCase();
  if (["completed", "closed", "passed", "active"].includes(v)) return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (["blocked", "failed", "cancelled", "critical"].includes(v)) return "bg-red-100 text-red-800 border border-red-200";
  return "bg-amber-100 text-amber-800 border border-amber-200";
}

// ============================================================
// API
// ============================================================

async function fetchWO360(id: number): Promise<WO360Payload> {
  const res = await fetch(`/api/work-orders/${id}/360`, { headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`WO 360 fetch failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

async function completeWorkOrder(id: number) {
  const res = await fetch(`/api/work-orders/${id}/complete`, { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error("Complete failed");
  return res.json();
}

export const wo360QueryKey = (id: number) => ["wo360", id] as const;

// ============================================================
// UI
// ============================================================

function Badge({ value }: { value?: string | null }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>{value || "—"}</span>;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4"><div className="text-lg font-bold text-slate-900">{title}</div></div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

type WOTab = "overview" | "qa" | "assignments" | "materials" | "alerts";

// ============================================================
// MAIN
// ============================================================

export function WorkOrder360({ workOrderId }: { workOrderId: number }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<WOTab>("overview");

  const query = useQuery({ queryKey: wo360QueryKey(workOrderId), queryFn: () => fetchWO360(workOrderId) });
  const completeMut = useMutation({ mutationFn: () => completeWorkOrder(workOrderId), onSuccess: () => qc.invalidateQueries({ queryKey: wo360QueryKey(workOrderId) }) });

  if (query.isLoading) return <div className="p-6"><div className="h-10 w-72 rounded-xl bg-slate-200 animate-pulse" /></div>;
  if (query.isError || !query.data?.work_order) return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">שגיאה בטעינת Work Order 360</div></div>;

  const data = query.data;
  const wo = data.work_order;
  const qa = data.qa_checklists ?? [];
  const assignments = data.assignments ?? [];
  const reservations = data.reservations ?? [];
  const alerts = data.alerts ?? [];

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
                    <h1 className="text-3xl font-black text-slate-900">{wo.work_order_number}</h1>
                    <Badge value={wo.state} />
                  </div>
                  <div className="text-lg text-slate-700">{wo.title}</div>
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                    <span>התחלה: {fmtDate(wo.required_start_date)}</span>
                    <span>סיום: {fmtDate(wo.required_end_date)}</span>
                    <span>מיקום: {wo.location_name || "—"}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => completeMut.mutate()} disabled={completeMut.isPending || wo.state === "Completed"} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50">
                    {completeMut.isPending ? "מסיים..." : "סמן Completed"}
                  </button>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Metric title="התקדמות" value={`${wo.progress_percent ?? 0}%`} />
              <Metric title="שיבוצים" value={String(data.assignments_count ?? assignments.length)} />
              <Metric title="הזמנות חומר" value={String(data.reservations_count ?? reservations.length)} />
              <Metric title="Alerts" value={String(data.alerts_count ?? alerts.length)} />
            </div>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2">
              {(["overview", "qa", "assignments", "materials", "alerts"] as WOTab[]).map((t) => (
                <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${tab === t ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}>
                  {t === "overview" ? "סקירה" : t === "qa" ? `QA (${qa.length})` : t === "assignments" ? `שיבוצים (${assignments.length})` : t === "materials" ? `חומרים (${reservations.length})` : `Alerts (${alerts.length})`}
                </button>
              ))}
            </div>

            {tab === "overview" && (
              <Card title="פרטי Work Order">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700">
                  <div><span className="text-slate-500">תיאור:</span> {wo.description || "—"}</div>
                  <div><span className="text-slate-500">פרויקט:</span> #{wo.project_id}</div>
                  <div><span className="text-slate-500">התחלה בפועל:</span> {fmtDate(wo.actual_start_date)}</div>
                  <div><span className="text-slate-500">סיום בפועל:</span> {fmtDate(wo.actual_end_date)}</div>
                </div>
              </Card>
            )}

            {tab === "qa" && (
              <Card title="QA Checklists">
                {qa.length === 0 ? <div className="text-sm text-slate-600">אין QA checklists.</div> : (
                  <div className="space-y-3">
                    {qa.map((c) => (
                      <div key={c.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">{c.checklist_name}</div>
                          <div className="text-sm text-slate-600">{c.checklist_code} • {c.items_passed ?? 0}/{c.items_total ?? 0} items</div>
                        </div>
                        <Badge value={c.state} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {tab === "assignments" && (
              <Card title="שיבוצי עובדים">
                {assignments.length === 0 ? <div className="text-sm text-slate-600">אין שיבוצים.</div> : (
                  <div className="space-y-3">
                    {assignments.map((a) => (
                      <div key={a.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">{a.employee_name || `Employee #${a.employee_id}`}</div>
                          <div className="text-sm text-slate-600">{a.role_in_order || "—"}</div>
                        </div>
                        <Badge value={a.state} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {tab === "materials" && (
              <Card title="הזמנות חומר">
                {reservations.length === 0 ? <div className="text-sm text-slate-600">אין הזמנות חומר.</div> : (
                  <div className="space-y-3">
                    {reservations.map((r) => (
                      <div key={r.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">{r.material_name || "Material"}</div>
                          <div className="text-sm text-slate-600">כמות: {r.quantity}</div>
                        </div>
                        <Badge value={r.state} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {tab === "alerts" && (
              <Card title="Alerts">
                {alerts.length === 0 ? <div className="text-sm text-slate-600">אין Alerts.</div> : (
                  <div className="space-y-3">
                    {alerts.map((a) => (
                      <div key={a.id} className="rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
                        <div>
                          <div className="font-bold text-slate-900">{a.alert_number} • {a.title}</div>
                          <div className="text-sm text-slate-600">חומרה: {a.severity}</div>
                        </div>
                        <Badge value={a.state} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* Side */}
          <div className="space-y-6">
            <Card title="בריאות WO">
              <div className="space-y-3 text-sm text-slate-700">
                <div className="flex justify-between"><span>סטטוס</span><Badge value={wo.state} /></div>
                <div className="flex justify-between"><span>התקדמות</span><span className="font-bold">{wo.progress_percent ?? 0}%</span></div>
                <div className="flex justify-between"><span>QA</span><span className="font-bold">{qa.filter(c => c.state === "Completed").length}/{qa.length}</span></div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
