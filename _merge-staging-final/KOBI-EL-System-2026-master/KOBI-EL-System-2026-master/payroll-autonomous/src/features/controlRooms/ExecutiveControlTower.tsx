import React from "react";
import { useQuery } from "@tanstack/react-query";

type ExecutiveSummary = {
  total_projects?: number;
  active_work_orders?: number;
  total_employees?: number;
  open_alerts?: number;
  revenue_mtd?: number;
  open_leads?: number;
};

type ExecutivePayload = {
  summary?: ExecutiveSummary;
};

async function fetchExecutiveControlTower(): Promise<ExecutivePayload> {
  const res = await fetch("/api/control-room/executive", {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-3 text-3xl font-black text-slate-900">{value}</div>
    </div>
  );
}

export default function ExecutiveControlTower() {
  const query = useQuery({
    queryKey: ["executiveControlTower"],
    queryFn: fetchExecutiveControlTower,
    refetchInterval: 60_000,
  });

  if (query.isLoading) return <div className="p-6 text-white">Loading executive control tower...</div>;
  if (query.isError) return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">Failed to load Executive Control Tower</div></div>;

  const s = query.data?.summary ?? {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <MetricCard title="Projects" value={String(s.total_projects ?? 0)} />
        <MetricCard title="Work Orders" value={String(s.active_work_orders ?? 0)} />
        <MetricCard title="Employees" value={String(s.total_employees ?? 0)} />
        <MetricCard title="Open Alerts" value={String(s.open_alerts ?? 0)} />
        <MetricCard title="Revenue MTD" value={`\u20AA${(s.revenue_mtd ?? 0).toLocaleString("he-IL")}`} />
        <MetricCard title="Open Leads" value={String(s.open_leads ?? 0)} />
      </div>
    </div>
  );
}
