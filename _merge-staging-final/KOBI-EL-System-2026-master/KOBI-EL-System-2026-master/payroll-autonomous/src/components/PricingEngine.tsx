import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";

type RuleSet = { id: number; ruleset_code: string; ruleset_name: string; category?: string|null; active: boolean; version: number; rules_payload?: Record<string,unknown>|null };
type Calculation = { id: number; calculation_number: string; source_entity_type?: string|null; subtotal?: number|null; markup_amount?: number|null; discount_amount?: number|null; final_price?: number|null; margin_percent?: number|null };
type Payload = { rule_sets?: RuleSet[]; calculations?: Calculation[] };

const money = new Intl.NumberFormat("he-IL",{style:"currency",currency:"ILS",maximumFractionDigits:0});
function m(v?:number|null){return money.format(v??0);}
function MC({title,value}:{title:string;value:string}){return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{title}</div><div className="mt-3 text-3xl font-black text-slate-900">{value}</div></div>;}

async function fetchPricing(): Promise<Payload> {
  const res = await fetch("/api/control-room/pricing",{method:"GET",headers:{"Content-Type":"application/json"},credentials:"include"});
  if(!res.ok) throw new Error(`Failed: ${res.status}`); const json=await res.json(); return json.data??json;
}

export default function PricingEngine() {
  const [tab,setTab]=useState<"rules"|"calculations">("rules");
  const query=useQuery({queryKey:["pricingEngine"],queryFn:fetchPricing,refetchInterval:60_000});
  if(query.isLoading) return <div className="p-6 text-white">Loading pricing...</div>;
  if(query.isError) return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">Failed to load Pricing</div></div>;

  const rules=query.data?.rule_sets??[];
  const calcs=query.data?.calculations??[];

  return (
    <div className="min-h-screen bg-slate-50"><div className="mx-auto max-w-[1600px] p-6 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="text-4xl font-black text-slate-900">Pricing Engine</h1><div className="mt-2 text-sm text-slate-600">Rule sets, markup/discount calculations, margin analysis.</div></div>
      <div className="grid grid-cols-2 gap-4"><MC title="Rule Sets" value={String(rules.length)} /><MC title="Calculations" value={String(calcs.length)} /></div>
      <div className="flex gap-2">
        <button onClick={()=>setTab("rules")} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab==="rules"?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-700"}`}>Rules ({rules.length})</button>
        <button onClick={()=>setTab("calculations")} className={`rounded-xl px-4 py-2 text-sm font-bold ${tab==="calculations"?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-700"}`}>Calculations ({calcs.length})</button>
      </div>
      {tab==="rules" && <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">Pricing Rule Sets</div><div className="p-5 space-y-3">{rules.map(r=>(<div key={r.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><div className="font-bold text-slate-900">{r.ruleset_code} &bull; {r.ruleset_name}</div><div className="mt-2 text-sm text-slate-600">Category: {r.category||"\u2014"} &bull; Version: {r.version}</div><pre className="mt-2 text-xs text-slate-500 bg-slate-50 p-2 rounded-lg overflow-auto max-h-24">{JSON.stringify(r.rules_payload||{},null,2)}</pre></div><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${r.active?"bg-emerald-100 text-emerald-800 border border-emerald-200":"bg-slate-100 text-slate-800 border border-slate-200"}`}>{r.active?"Active":"Inactive"}</span></div></div>))}</div></div>}
      {tab==="calculations" && <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">Calculations</div><div className="p-5 space-y-3">{calcs.map(c=>(<div key={c.id} className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-900">{c.calculation_number}</div><div className="mt-2 text-sm text-slate-600">Source: {c.source_entity_type||"\u2014"} &bull; Subtotal: {m(c.subtotal)} &bull; Markup: {m(c.markup_amount)} &bull; Discount: {m(c.discount_amount)} &bull; Final: {m(c.final_price)} &bull; Margin: {c.margin_percent!=null?(c.margin_percent*100).toFixed(1)+"%":"\u2014"}</div></div>))}</div></div>}
    </div></div>
  );
}
