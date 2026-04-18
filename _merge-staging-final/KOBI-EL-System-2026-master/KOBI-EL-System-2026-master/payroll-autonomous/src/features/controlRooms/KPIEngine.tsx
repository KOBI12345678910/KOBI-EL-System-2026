import React from "react";
import { useQuery } from "@tanstack/react-query";

type KPISnapshot = {
  id: number;
  kpi_code: string;
  kpi_name: string;
  current_value: number;
  lower_threshold?: number | null;
  upper_threshold?: number | null;
  breach_status: string;
  unit_label?: string | null;
};

type KPIPayload = { snapshots: KPISnapshot[] };

async function fetchKPIEngine(): Promise<KPIPayload> {
  const res = await fetch("/api/intelligence/kpi-engine", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

function badgeClass(status: string): string {
  const s = status.toLowerCase();
  if (["ok", "normal", "green"].includes(s)) return "bg-emerald-100 text-emerald-800 border border-emerald-200";
  if (["breach", "critical", "red"].includes(s)) return "bg-red-100 text-red-800 border border-red-200";
  if (["warning", "yellow"].includes(s)) return "bg-amber-100 text-amber-800 border border-amber-200";
  return "bg-slate-100 text-slate-800 border border-slate-200";
}

export default function KPIEngine() {
  const query = useQuery({ queryKey: ["kpiEngine"], queryFn: fetchKPIEngine, refetchInterval: 30_000 });

  if (query.isLoading) return <div className="p-4 text-white">Loading KPI Engine...</div>;
  if (query.isError) return <div className="p-4"><div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 text-sm">Failed to load KPI Engine</div></div>;

  const snapshots = query.data?.snapshots ?? [];

  return (
    <div className="space-y-3">
      {snapshots.length === 0 ? (
        <div className="text-sm text-slate-500">No KPI snapshots available.</div>
      ) : (
        snapshots.map((s) => (
          <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-900">{s.kpi_name}</div>
                <div className="mt-1 text-sm text-slate-600">{s.kpi_code} &bull; {s.current_value} {s.unit_label || ""}</div>
              </div>
              <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(s.breach_status)}`}>{s.breach_status}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
