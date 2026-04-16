import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

type TreasurySummary = { snapshot_date?: string; bank_accounts_count?: number; total_current_balance?: number; forecasts_count?: number; low_balance_accounts?: number };
type BankAccountRow = { id: number; account_number_masked: string; bank_name: string; branch_name?: string | null; currency: string; account_type: string; current_balance?: number | null; active: boolean; owner_company_name?: string | null; created_at: string; updated_at?: string | null };
type CashPositionRow = { id: number; bank_account_id: number; snapshot_date: string; opening_balance?: number | null; inflow_amount?: number | null; outflow_amount?: number | null; closing_balance?: number | null };
type ForecastRow = { id: number; forecast_date: string; bank_account_id?: number | null; scenario_name: string; expected_inflow?: number | null; expected_outflow?: number | null; projected_closing_balance?: number | null; confidence_score?: number | null; created_at: string; updated_at?: string | null };
type TreasuryPayload = { summary?: TreasurySummary; bank_accounts?: BankAccountRow[]; cash_positions?: CashPositionRow[]; forecasts?: ForecastRow[] };

const money = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
function m(v?: number | null) { return money.format(v ?? 0); }
function formatDate(v?: string | null): string { if (!v) return "\u2014"; try { return new Date(v).toLocaleDateString("he-IL"); } catch { return v; } }
function badgeClass(v?: string | null): string { const s = (v || "").toLowerCase(); if (["active","base","healthy"].includes(s)) return "bg-emerald-100 text-emerald-800 border border-emerald-200"; if (["stress","critical","low"].includes(s)) return "bg-red-100 text-red-800 border border-red-200"; if (["warning","checking","medium"].includes(s)) return "bg-amber-100 text-amber-800 border border-amber-200"; return "bg-slate-100 text-slate-800 border border-slate-200"; }
function Badge({ value }: { value?: string | null }) { return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${badgeClass(value)}`}>{value || "\u2014"}</span>; }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return (<div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4 text-lg font-black text-slate-900">{title}</div><div className="p-5">{children}</div></div>); }
function MetricCard({ title, value }: { title: string; value: string }) { return (<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-sm text-slate-500">{title}</div><div className="mt-3 text-3xl font-black text-slate-900">{value}</div></div>); }
function TabButton({ active, label, onClick, count }: { active: boolean; label: string; onClick: () => void; count?: number }) { return (<button type="button" onClick={onClick} className={`rounded-xl px-4 py-2 text-sm font-bold transition ${active ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"}`}>{label}{typeof count === "number" ? ` (${count})` : ""}</button>); }

async function fetchTreasuryControlRoom(): Promise<TreasuryPayload> { const res = await fetch("/api/control-room/treasury", { method: "GET", headers: { "Content-Type": "application/json" }, credentials: "include" }); if (!res.ok) throw new Error(`Failed: ${res.status}`); const json = await res.json(); return json.data ?? json; }
export const treasuryControlRoomQueryKey = () => ["treasuryControlRoom"] as const;
type TreasuryTab = "overview" | "accounts" | "positions" | "forecasts";

export default function TreasuryControlRoom() {
  const [tab, setTab] = useState<TreasuryTab>("overview");
  const query = useQuery({ queryKey: treasuryControlRoomQueryKey(), queryFn: fetchTreasuryControlRoom, refetchInterval: 60_000 });
  if (query.isLoading) return <div className="p-6 text-white">Loading treasury control room...</div>;
  if (query.isError) return <div className="p-6"><div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA Treasury Control Room</div></div>;

  const summary = query.data?.summary ?? {};
  const bankAccounts = query.data?.bank_accounts ?? [];
  const cashPositions = query.data?.cash_positions ?? [];
  const forecasts = query.data?.forecasts ?? [];
  const lowAccounts = useMemo(() => bankAccounts.filter((a) => Number(a.current_balance ?? 0) < 50000), [bankAccounts]);

  return (
    <div className="min-h-screen bg-slate-50"><div className="mx-auto max-w-[1600px] p-6 space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><h1 className="text-4xl font-black text-slate-900">Treasury Control Room</h1><div className="mt-2 text-sm text-slate-600">\u05E9\u05DC\u05D9\u05D8\u05D4 \u05D1\u05D7\u05E9\u05D1\u05D5\u05E0\u05D5\u05EA \u05D1\u05E0\u05E7, cash positions, forecasts, treasury pulse.</div></div><button type="button" onClick={() => query.refetch()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">\u05E8\u05E2\u05E0\u05DF</button></div></div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"><MetricCard title="Bank Accounts" value={String(summary.bank_accounts_count ?? 0)} /><MetricCard title="Total Balance" value={m(summary.total_current_balance)} /><MetricCard title="Forecasts" value={String(summary.forecasts_count ?? 0)} /><MetricCard title="Low Balance" value={String(summary.low_balance_accounts ?? 0)} /></div>
      <div className="flex flex-wrap gap-2"><TabButton active={tab === "overview"} label="\u05E1\u05E7\u05D9\u05E8\u05D4" onClick={() => setTab("overview")} /><TabButton active={tab === "accounts"} label="Accounts" onClick={() => setTab("accounts")} count={bankAccounts.length} /><TabButton active={tab === "positions"} label="Cash Positions" onClick={() => setTab("positions")} count={cashPositions.length} /><TabButton active={tab === "forecasts"} label="Forecasts" onClick={() => setTab("forecasts")} count={forecasts.length} /></div>
      {tab === "overview" && <div className="grid grid-cols-1 xl:grid-cols-2 gap-6"><Panel title="Low Balance Accounts"><div className="space-y-3">{lowAccounts.map((a) => (<div key={a.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><div className="font-bold text-slate-900">{a.bank_name} &bull; {a.account_number_masked}</div><div className="mt-2 text-sm text-slate-600">Balance: {m(a.current_balance)}</div></div><Badge value="low" /></div></div>))}</div></Panel><Panel title="Upcoming Forecasts"><div className="space-y-3">{forecasts.slice(0,10).map((f) => (<div key={f.id} className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-900">{formatDate(f.forecast_date)} &bull; {f.scenario_name}</div><div className="mt-2 text-sm text-slate-600">Inflow: {m(f.expected_inflow)} &bull; Outflow: {m(f.expected_outflow)} &bull; Close: {m(f.projected_closing_balance)}</div></div>))}</div></Panel></div>}
      {tab === "accounts" && <Panel title="Bank Accounts"><div className="space-y-3">{bankAccounts.map((a) => (<div key={a.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><div className="font-bold text-slate-900">{a.bank_name} &bull; {a.account_number_masked}</div><div className="mt-2 text-sm text-slate-600">Branch: {a.branch_name || "\u2014"} &bull; {a.currency} &bull; Balance: {m(a.current_balance)}</div></div><Badge value={a.active ? "active" : "inactive"} /></div></div>))}</div></Panel>}
      {tab === "positions" && <Panel title="Cash Positions"><div className="space-y-3">{cashPositions.map((p) => (<div key={p.id} className="rounded-2xl border border-slate-200 p-4"><div className="font-bold text-slate-900">Account #{p.bank_account_id} &bull; {formatDate(p.snapshot_date)}</div><div className="mt-2 text-sm text-slate-600">Open: {m(p.opening_balance)} &bull; In: {m(p.inflow_amount)} &bull; Out: {m(p.outflow_amount)} &bull; Close: {m(p.closing_balance)}</div></div>))}</div></Panel>}
      {tab === "forecasts" && <Panel title="Forecasts"><div className="space-y-3">{forecasts.map((f) => (<div key={f.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><div className="font-bold text-slate-900">{formatDate(f.forecast_date)} &bull; {f.scenario_name}</div><div className="mt-2 text-sm text-slate-600">In: {m(f.expected_inflow)} &bull; Out: {m(f.expected_outflow)} &bull; Close: {m(f.projected_closing_balance)}</div></div><Badge value={f.scenario_name} /></div></div>))}</div></Panel>}
    </div></div>
  );
}
