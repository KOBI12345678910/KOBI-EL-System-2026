import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type SyncStatus = { routes_count: number; menu_nodes_count: number; permission_links_count: number };

async function fetchSyncStatus(): Promise<SyncStatus> {
  const res = await fetch("/api/admin/route-menu-permission-sync/status", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`Failed to fetch sync status: ${res.status}`);
  const json = await res.json();
  return json.data ?? json;
}

async function runSync() {
  const res = await fetch("/api/admin/route-menu-permission-sync/run", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error("Failed to run sync");
  return res.json();
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{title}</div><div className="mt-3 text-3xl font-black text-slate-900">{value}</div></div>);
}

export default function RouteMenuPermissionSyncConsole() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["routeMenuPermissionSyncStatus"], queryFn: fetchSyncStatus });
  const syncMutation = useMutation({ mutationFn: runSync, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ["routeMenuPermissionSyncStatus"] }); } });

  if (query.isLoading) return <div className="p-6 text-white">Loading sync console...</div>;
  if (query.isError) return (<div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">Failed to load Route/Menu/Permission Sync Console</div></div>);

  const data = query.data!;
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-4xl font-black text-slate-900">Route / Menu / Permission Sync</h1>
          <div className="mt-2 text-sm text-slate-600">\u05E1\u05E0\u05DB\u05E8\u05D5\u05DF \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9 \u05D1\u05D9\u05DF route registry, menu nodes \u05D5\u05BE route permission map.</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard title="Routes" value={String(data.routes_count)} />
          <MetricCard title="Menu Nodes" value={String(data.menu_nodes_count)} />
          <MetricCard title="Permission Links" value={String(data.permission_links_count)} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <button type="button" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">{syncMutation.isPending ? "\u05DE\u05E1\u05E0\u05DB\u05E8\u05DF..." : "Run Full Sync"}</button>
        </div>
      </div>
    </div>
  );
}
