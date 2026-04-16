import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type ServiceSummary = { snapshot_date?: string; open_tickets?: number; high_severity_tickets?: number };
type ServiceTicketRow = { id: number; public_id?: string; ticket_number: string; customer_id?: number | null; project_id?: number | null; work_order_id?: number | null; title: string; description?: string | null; severity: string; priority: string; state: string; assigned_to_user_id?: number | null; opened_at: string; resolved_at?: string | null; closed_at?: string | null; created_at: string; updated_at?: string | null };
type ServicePayload = { summary?: ServiceSummary; tickets?: ServiceTicketRow[] };

function formatDateTime(v?: string | null): string { if (!v) return "\u2014"; try { return new Date(v).toLocaleString("he-IL"); } catch { return v; } }
function badgeClass(v?: string | null): string { const s = (v || "").toLowerCase(); if (["resolved","closed","low"].includes(s)) return "bg-emerald-100 text-emerald-800 border border-emerald-200"; if (["critical","high","open"].includes(s)) return "bg-red-100 text-red-800 border border-red-200"; if (["assigned","inprogress","medium","normal"].includes(s)) return "bg-amber-100 text-amber-800 border border-amber-200"; return "bg-slate-100 text-slate-800 border border-slate-200"; }
function Badge({ value }: { value?: string | null }) { return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>{value || "\u2014"}</span>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return (<div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">{title}</div><div className="p-5">{children}</div></div>); }
function MetricCard({ title, value }: { title: string; value: string }) { return (<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{title}</div><div className="mt-3 text-3xl font-black text-slate-900">{value}</div></div>); }
function TabButton({ active, label, onClick, count }: { active: boolean; label: string; onClick: () => void; count?: number }) { return (<button type="button" onClick={onClick} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${active ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"}`}>{label}{typeof count === "number" ? ` (${count})` : ""}</button>); }

async function fetchServiceControlRoom(): Promise<ServicePayload> { const res = await fetch("/api/control-room/service", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }); if (!res.ok) throw new Error(`Failed: ${res.status}`); const json = await res.json(); return json.data ?? json; }
export const serviceControlRoomQueryKey = () => ["serviceControlRoom"] as const;
type ServiceTab = "overview" | "tickets" | "high";

export default function ServiceControlRoom() {
  const [tab, setTab] = useState<ServiceTab>("overview");
  const query = useQuery({ queryKey: serviceControlRoomQueryKey(), queryFn: fetchServiceControlRoom, refetchInterval: 60_000 });
  if (query.isLoading) return <div className="p-6 text-white">Loading service control room...</div>;
  if (query.isError) return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA Service Control Room</div></div>;

  const summary = query.data?.summary ?? {};
  const tickets = query.data?.tickets ?? [];
  const highTickets = useMemo(() => tickets.filter((t) => ["high","critical"].includes((t.severity || "").toLowerCase())), [tickets]);

  return (
    <div className="min-h-screen bg-slate-50"><div className="mx-auto max-w-[1600px] p-6 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><h1 className="text-4xl font-black text-slate-900">Service Control Room</h1><div className="mt-2 text-sm text-slate-600">\u05E9\u05DC\u05D9\u05D8\u05D4 \u05D1\u05D8\u05D9\u05E7\u05D8\u05D9 \u05E9\u05D9\u05E8\u05D5\u05EA, SLA pressure, high severity cases.</div></div><button type="button" onClick={() => query.refetch()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">\u05E8\u05E2\u05E0\u05DF</button></div></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><MetricCard title="Open Tickets" value={String(summary.open_tickets ?? 0)} /><MetricCard title="High Severity" value={String(summary.high_severity_tickets ?? 0)} /></div>
      <div className="flex flex-wrap gap-2"><TabButton active={tab === "overview"} label="\u05E1\u05E7\u05D9\u05E8\u05D4" onClick={() => setTab("overview")} /><TabButton active={tab === "tickets"} label="All Tickets" onClick={() => setTab("tickets")} count={tickets.length} /><TabButton active={tab === "high"} label="High Severity" onClick={() => setTab("high")} count={highTickets.length} /></div>
      {tab === "overview" && <Panel title="High Severity Queue"><div className="space-y-3">{highTickets.slice(0,10).map((t) => (<div key={t.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><div className="font-bold text-slate-900">{t.ticket_number} &bull; {t.title}</div><div className="mt-2 text-sm text-slate-600">{t.description || "\u2014"}</div><div className="mt-1 text-sm text-slate-600">Opened: {formatDateTime(t.opened_at)}</div></div><div className="flex gap-2"><Badge value={t.severity} /><Badge value={t.state} /></div></div></div>))}</div></Panel>}
      {tab === "tickets" && <Panel title="All Tickets"><div className="space-y-3">{tickets.map((t) => (<div key={t.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><div className="font-bold text-slate-900">{t.ticket_number} &bull; {t.title}</div><div className="mt-2 text-sm text-slate-600">{t.description || "\u2014"}</div><div className="mt-1 text-sm text-slate-600">Opened: {formatDateTime(t.opened_at)} &bull; Resolved: {formatDateTime(t.resolved_at)}</div></div><div className="flex gap-2"><Badge value={t.severity} /><Badge value={t.state} /></div></div></div>))}</div></Panel>}
      {tab === "high" && <Panel title="Critical / High"><div className="space-y-3">{highTickets.map((t) => (<div key={t.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><div className="font-bold text-slate-900">{t.ticket_number} &bull; {t.title}</div><div className="mt-2 text-sm text-slate-600">{t.description || "\u2014"}</div></div><div className="flex gap-2"><Badge value={t.severity} /><Badge value={t.priority} /><Badge value={t.state} /></div></div></div>))}</div></Panel>}
    </div></div>
  );
}
