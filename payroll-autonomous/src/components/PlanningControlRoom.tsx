import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";

type CapCalendar = { id: number; calendar_code: string; calendar_name: string; work_center_code?: string|null; capacity_unit: string; active: boolean };
type DemandForecast = { id: number; forecast_number: string; forecast_date: string; category?: string|null; expected_count: number; expected_revenue?: number|null; scenario_name: string };
type Payload = { calendars?: CapCalendar[]; forecasts?: DemandForecast[] };

const money = new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",maximumFractionDigits:0});
function m(v?:number|null){return money.format(v??0);}
function fmt(v?:string|null):string{if(!v)return"\u2014";try{return new Date(v).toLocaleDateString("he-IL");}catch{return v;}}
function MC({title,value}:{title:string;value:string}){return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{title}</div><div className="mt-3 text-3xl font-black text-slate-900">{value}</div></div>;}

async function fetchPlanning(): Promise<Payload> {
  const res = await fetch("/api/control-room/planning",{method:"GET",headers:{"Content-Type":"application/json"},credentials:"include"});
  if(!res.ok) throw new Error(`Failed: ${res.status}`); const json=await res.json(); return json.data??json;
}

export default function PlanningControlRoom() {
  const [tab,setTab]=useState<"calendars"|"forecasts">("calendars");
  const query=useQuery({queryKey:["planningControlRoom"],queryFn:fetchPlanning,refetchInterval:60_000});
  if(query.isLoading) return <div className="p-6 text-white">Loading planning...</div>;
  if(query.isError) return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">Failed to load Planning</div></div>;

  const calendars=query.data?.calendars??[];
  const forecasts=query.data?.forecasts??[];

  return (
    <div className="min-h-screen bg-slate-50"><div className="mx-auto max-w-[1600px] p-6 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-4xl font-black text-slate-900">Planning Control Room</h1><div className="mt-2 text-sm text-slate-600">Capacity calendars, demand forecasts, resource planning.</div></div>
      <div className="grid grid-cols-2 gap-4"><MC title="Calendars" value={String(calendars.length)} /><MC title="Forecasts" value={String(forecasts.length)} /></div>
      <div className="flex gap-2">
        <button onClick={()=>setTab("calendars")} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab==="calendars"?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-700"}`}>Calendars ({calendars.length})</button>
        <button onClick={()=>setTab("forecasts")} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab==="forecasts"?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-700"}`}>Forecasts ({forecasts.length})</button>
      </div>
      {tab==="calendars" && <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">Capacity Calendars</div><div className="p-5 space-y-3">{calendars.map(c=>(<div key={c.id} className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-900">{c.calendar_code} &bull; {c.calendar_name}</div><div className="mt-2 text-sm text-slate-600">Work Center: {c.work_center_code||"\u2014"} &bull; Unit: {c.capacity_unit} &bull; {c.active?"Active":"Inactive"}</div></div>))}</div></div>}
      {tab==="forecasts" && <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">Demand Forecasts</div><div className="p-5 space-y-3">{forecasts.map(f=>(<div key={f.id} className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-900">{f.forecast_number} &bull; {fmt(f.forecast_date)}</div><div className="mt-2 text-sm text-slate-600">Category: {f.category||"\u2014"} &bull; Count: {f.expected_count} &bull; Revenue: {m(f.expected_revenue)} &bull; Scenario: {f.scenario_name}</div></div>))}</div></div>}
    </div></div>
  );
}
