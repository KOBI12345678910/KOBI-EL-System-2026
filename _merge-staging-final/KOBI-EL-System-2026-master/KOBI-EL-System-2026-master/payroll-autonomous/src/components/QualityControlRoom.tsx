import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";

type QualitySummary = { open_defects?: number; active_inspections?: number; plans_count?: number; avg_score?: number };
type DefectRow = { id: number; defect_number: string; title: string; severity: string; state: string; target_resolution_date?: string | null; resolved_at?: string | null; created_at: string };
type InspectionRunRow = { id: number; run_number: string; state: string; score?: number | null; defects_count: number; started_at?: string | null; completed_at?: string | null };
type QualityPayload = { summary?: QualitySummary; defects?: DefectRow[]; inspection_runs?: InspectionRunRow[] };

function fmt(v?: string | null): string { if (!v) return "\u2014"; try { return new Date(v).toLocaleDateString("he-IL"); } catch { return v; } }
function bc(v?: string | null): string { const s = (v||"").toLowerCase(); if (["resolved","closed","completed"].includes(s)) return "bg-emerald-100 text-emerald-800 border border-emerald-200"; if (["critical","high","open"].includes(s)) return "bg-red-100 text-red-800 border border-red-200"; if (["medium","draft","inprogress"].includes(s)) return "bg-amber-100 text-amber-800 border border-amber-200"; return "bg-slate-100 text-slate-800 border border-slate-200"; }
function Badge({ value }: { value?: string | null }) { return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${bc(value)}`}>{value||"\u2014"}</span>; }
function MC({ title, value }: { title: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{title}</div><div className="mt-3 text-3xl font-black text-slate-900">{value}</div></div>; }

async function fetchQuality(): Promise<QualityPayload> {
  const res = await fetch("/api/control-room/quality", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" });
  if (!res.ok) throw new Error(`Failed: ${res.status}`); const json = await res.json(); return json.data ?? json;
}

export default function QualityControlRoom() {
  const [tab, setTab] = useState<"defects"|"inspections">("defects");
  const query = useQuery({ queryKey: ["qualityControlRoom"], queryFn: fetchQuality, refetchInterval: 60_000 });
  if (query.isLoading) return <div className="p-6 text-white">Loading quality...</div>;
  if (query.isError) return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">Failed to load Quality Control Room</div></div>;

  const s = query.data?.summary ?? {};
  const defects = query.data?.defects ?? [];
  const runs = query.data?.inspection_runs ?? [];

  return (
    <div className="min-h-screen bg-slate-50"><div className="mx-auto max-w-[1600px] p-6 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-4xl font-black text-slate-900">Quality Control Room</h1><div className="mt-2 text-sm text-slate-600">Inspection plans, runs, defects, QC scores, NCR tracking.</div></div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4"><MC title="Open Defects" value={String(s.open_defects??0)} /><MC title="Active Inspections" value={String(s.active_inspections??0)} /><MC title="Plans" value={String(s.plans_count??0)} /><MC title="Avg Score" value={s.avg_score ? s.avg_score.toFixed(1) : "\u2014"} /></div>
      <div className="flex gap-2">
        <button onClick={()=>setTab("defects")} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab==="defects"?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-700"}`}>Defects ({defects.length})</button>
        <button onClick={()=>setTab("inspections")} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab==="inspections"?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-700"}`}>Inspections ({runs.length})</button>
      </div>
      {tab==="defects" && <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">Defects</div><div className="p-5 space-y-3">{defects.map(d=>(<div key={d.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><div className="font-bold text-slate-900">{d.defect_number} &bull; {d.title}</div><div className="mt-2 text-sm text-slate-600">Target: {fmt(d.target_resolution_date)} &bull; Resolved: {fmt(d.resolved_at)}</div></div><div className="flex gap-2"><Badge value={d.severity} /><Badge value={d.state} /></div></div></div>))}</div></div>}
      {tab==="inspections" && <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">Inspection Runs</div><div className="p-5 space-y-3">{runs.map(r=>(<div key={r.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><div className="font-bold text-slate-900">{r.run_number}</div><div className="mt-2 text-sm text-slate-600">Score: {r.score??"\u2014"} &bull; Defects: {r.defects_count} &bull; Started: {fmt(r.started_at)} &bull; Completed: {fmt(r.completed_at)}</div></div><Badge value={r.state} /></div></div>))}</div></div>}
    </div></div>
  );
}
