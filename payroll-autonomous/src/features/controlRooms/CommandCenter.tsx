import React from "react";
import { useQuery } from "@tanstack/react-query";

type QueueSummary = {
  active_workflows?: number;
  pending_jobs?: number;
  failed_jobs?: number;
  completed_today?: number;
};

type CommandCenterPayload = { summary?: QueueSummary };

async function fetchCommandCenter(): Promise<CommandCenterPayload> {
  const res = await fetch("/api/control-room/command-center", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

export default function CommandCenter() {
  const query = useQuery({ queryKey: ["commandCenter"], queryFn: fetchCommandCenter, refetchInterval: 20_000 });

  if (query.isLoading) return <div className="p-4 text-white">Loading Command Center...</div>;
  if (query.isError) return <div className="p-4"><div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 text-sm">Failed to load Command Center</div></div>;

  const s = query.data?.summary ?? {};

  return (
    <div className="grid grid-cols-2 gap-3">
      <MetricCard title="Active Workflows" value={String(s.active_workflows ?? 0)} />
      <MetricCard title="Pending Jobs" value={String(s.pending_jobs ?? 0)} />
      <MetricCard title="Failed Jobs" value={String(s.failed_jobs ?? 0)} />
      <MetricCard title="Completed Today" value={String(s.completed_today ?? 0)} />
    </div>
  );
}
