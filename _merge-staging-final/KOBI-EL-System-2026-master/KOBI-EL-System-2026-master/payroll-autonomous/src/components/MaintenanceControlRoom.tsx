import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";

type Asset = { id: number; asset_number: string; asset_name: string; asset_type?: string|null; operational_status: string; criticality: string; location_name?: string|null };
type MaintWO = { id: number; maintenance_work_order_number: string; title: string; request_type: string; priority: string; state: string; planned_date?: string|null; completed_at?: string|null };
type Payload = { assets?: Asset[]; work_orders?: MaintWO[] };

function fmt(v?: string|null): string { if(!v) return "\u2014"; try { return new Date(v).toLocaleDateString("he-IL"); } catch { return v; } }
function bc(v?: string|null): string { const s=(v||"").toLowerCase(); if(["active","completed","closed"].includes(s)) return "bg-emerald-100 text-emerald-800 border border-emerald-200"; if(["critical","high","open"].includes(s)) return "bg-red-100 text-red-800 border border-red-200"; if(["medium","normal","inprogress"].includes(s)) return "bg-amber-100 text-amber-800 border border-amber-200"; return "bg-slate-100 text-slate-800 border border-slate-200"; }
function Badge({value}:{value?:string|null}){return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${bc(value)}`}>{value||"\u2014"}</span>;}
function MC({title,value}:{title:string;value:string}){return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{title}</div><div className="mt-3 text-3xl font-black text-slate-900">{value}</div></div>;}

async function fetchMaintenance(): Promise<Payload> {
  const res = await fetch("/api/control-room/maintenance", { method:"GET", headers:{"Content-Type":"application/json"}, credentials:"include" });
  if(!res.ok) throw new Error(`Failed: ${res.status}`); const json=await res.json(); return json.data??json;
}

export default function MaintenanceControlRoom() {
  const [tab,setTab]=useState<"assets"|"work-orders">("assets");
  const query=useQuery({queryKey:["maintenanceControlRoom"],queryFn:fetchMaintenance,refetchInterval:60_000});
  if(query.isLoading) return <div className="p-6 text-white">Loading maintenance...</div>;
  if(query.isError) return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">Failed to load Maintenance</div></div>;

  const assets=query.data?.assets??[];
  const wos=query.data?.work_orders??[];

  return (
    <div className="min-h-screen bg-slate-50"><div className="mx-auto max-w-[1600px] p-6 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-4xl font-black text-slate-900">Maintenance Control Room</h1><div className="mt-2 text-sm text-slate-600">\u05E0\u05DB\u05E1\u05D9\u05DD, \u05EA\u05D7\u05D6\u05D5\u05E7\u05D4, \u05D4\u05D5\u05E8\u05D0\u05D5\u05EA \u05E2\u05D1\u05D5\u05D3\u05D4, \u05EA\u05D7\u05D6\u05D5\u05E7\u05D4 \u05DE\u05E0\u05D9\u05E2\u05EA\u05D9\u05EA.</div></div>
      <div className="grid grid-cols-2 gap-4"><MC title="Assets" value={String(assets.length)} /><MC title="Open Work Orders" value={String(wos.filter(w=>["Open","InProgress"].includes(w.state)).length)} /></div>
      <div className="flex gap-2">
        <button onClick={()=>setTab("assets")} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab==="assets"?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-700"}`}>Assets ({assets.length})</button>
        <button onClick={()=>setTab("work-orders")} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab==="work-orders"?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-700"}`}>Work Orders ({wos.length})</button>
      </div>
      {tab==="assets" && <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">Assets</div><div className="p-5 space-y-3">{assets.map(a=>(<div key={a.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><div className="font-bold text-slate-900">{a.asset_number} &bull; {a.asset_name}</div><div className="mt-2 text-sm text-slate-600">Type: {a.asset_type||"\u2014"} &bull; Location: {a.location_name||"\u2014"}</div></div><div className="flex gap-2"><Badge value={a.operational_status}/><Badge value={a.criticality}/></div></div></div>))}</div></div>}
      {tab==="work-orders" && <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">Maintenance Work Orders</div><div className="p-5 space-y-3">{wos.map(w=>(<div key={w.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><div className="font-bold text-slate-900">{w.maintenance_work_order_number} &bull; {w.title}</div><div className="mt-2 text-sm text-slate-600">Type: {w.request_type} &bull; Planned: {fmt(w.planned_date)} &bull; Completed: {fmt(w.completed_at)}</div></div><div className="flex gap-2"><Badge value={w.priority}/><Badge value={w.state}/></div></div></div>))}</div></div>}
    </div></div>
  );
}
