import React from "react";
import { useQuery } from "@tanstack/react-query";

type Widget = {
  id: number;
  widget_code: string;
  title: string;
  value?: string | number | null;
  trend?: string | null;
  sort_order: number;
};

type DashboardPayload = { widgets: Widget[] };

async function fetchWidgets(boardCode: string): Promise<DashboardPayload> {
  const res = await fetch(`/api/dashboard/widgets?board=${boardCode}`, { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

export default function DashboardWidgetsBoard({ boardCode }: { boardCode: string }) {
  const query = useQuery({ queryKey: ["dashboardWidgets", boardCode], queryFn: () => fetchWidgets(boardCode), refetchInterval: 60_000 });

  if (query.isLoading) return <div className="text-xs text-slate-400">Loading widgets...</div>;
  if (query.isError) return <div className="text-xs text-red-400">Failed to load widgets</div>;

  const widgets = query.data?.widgets ?? [];

  if (widgets.length === 0) return <div className="text-xs text-slate-400">No widgets configured for {boardCode}.</div>;

  return (
    <div className="grid grid-cols-2 gap-3">
      {widgets.map((w) => (
        <div key={w.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">{w.title}</div>
          <div className="mt-2 text-2xl font-black text-slate-900">{w.value ?? "\u2014"}</div>
          {w.trend ? <div className="mt-1 text-xs text-slate-400">{w.trend}</div> : null}
        </div>
      ))}
    </div>
  );
}
