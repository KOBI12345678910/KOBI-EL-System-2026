import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";

type Policy = { id: number; policy_code: string; policy_name: string; category?: string|null; active: boolean; effective_from?: string|null; version: number };
type Ack = { id: number; policy_id: number; user_id: number; acknowledged_at: string; version: number };
type Payload = { policies?: Policy[]; acknowledgements?: Ack[] };

function fmt(v?:string|null):string{if(!v)return"\u2014";try{return new Date(v).toLocaleDateString("he-IL");}catch{return v;}}
function MC({title,value}:{title:string;value:string}){return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{title}</div><div className="mt-3 text-3xl font-black text-slate-900">{value}</div></div>;}

async function fetchCompliance(): Promise<Payload> {
  const res = await fetch("/api/control-room/compliance",{method:"GET",headers:{"Content-Type":"application/json"},credentials:"include"});
  if(!res.ok) throw new Error(`Failed: ${res.status}`); const json=await res.json(); return json.data??json;
}

export default function ComplianceDashboard() {
  const query=useQuery({queryKey:["complianceDashboard"],queryFn:fetchCompliance,refetchInterval:60_000});
  if(query.isLoading) return <div className="p-6 text-white">Loading compliance...</div>;
  if(query.isError) return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">Failed to load Compliance</div></div>;

  const policies=query.data?.policies??[];
  const acks=query.data?.acknowledgements??[];

  return (
    <div className="min-h-screen bg-slate-50"><div className="mx-auto max-w-[1600px] p-6 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-4xl font-black text-slate-900">Compliance Dashboard</h1><div className="mt-2 text-sm text-slate-600">\u05DE\u05D3\u05D9\u05E0\u05D9\u05D5\u05EA, \u05D0\u05D9\u05E9\u05D5\u05E8\u05D9\u05DD, \u05D4\u05DB\u05E8\u05D5\u05EA \u05E2\u05D5\u05D1\u05D3\u05D9\u05DD, audit readiness.</div></div>
      <div className="grid grid-cols-2 gap-4"><MC title="Active Policies" value={String(policies.filter(p=>p.active).length)} /><MC title="Total Acknowledgements" value={String(acks.length)} /></div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">Policies</div><div className="p-5 space-y-3">{policies.map(p=>(<div key={p.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><div className="font-bold text-slate-900">{p.policy_code} &bull; {p.policy_name}</div><div className="mt-2 text-sm text-slate-600">Category: {p.category||"\u2014"} &bull; Version: {p.version} &bull; Effective: {fmt(p.effective_from)}</div></div><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${p.active?"bg-emerald-100 text-emerald-800 border border-emerald-200":"bg-slate-100 text-slate-800 border border-slate-200"}`}>{p.active?"Active":"Inactive"}</span></div></div>))}</div></div>
    </div></div>
  );
}
