import React, { useMemo, useState } from "react";
import DashboardWidgetsBoard from "../dashboard/DashboardWidgetsBoard";
import ExecutiveControlTower from "../controlRooms/ExecutiveControlTower";
import FinanceControlRoom from "../controlRooms/FinanceControlRoom";
import KPIEngine from "../controlRooms/KPIEngine";
import CommandCenter from "../controlRooms/CommandCenter";

type MobileTab = "home" | "executive" | "finance" | "kpi" | "command";

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-2xl px-3 py-3 text-xs font-black ${
        active ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"
      }`}
    >
      {label}
    </button>
  );
}

function MobileCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-lg font-black text-slate-900">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-500">{subtitle}</div> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function MobileExecutiveShell() {
  const [tab, setTab] = useState<MobileTab>("home");

  const title = useMemo(() => {
    if (tab === "home") return "Executive Mobile";
    if (tab === "executive") return "Executive";
    if (tab === "finance") return "Finance";
    if (tab === "kpi") return "KPI";
    return "Command";
  }, [tab]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-md px-3 py-4 space-y-4">
        <div className="rounded-3xl bg-slate-900 p-4 text-white shadow-sm">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-300">BASH44 Mobile</div>
          <div className="mt-2 text-2xl font-black">{title}</div>
          <div className="mt-1 text-xs text-slate-300">
            \u05E9\u05DB\u05D1\u05EA \u05D4\u05E0\u05D4\u05DC\u05D4 \u05DE\u05D5\u05D1\u05D9\u05D9\u05DC: KPI, executive pulse, finance pulse, command pulse.
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2">
          <TabButton active={tab === "home"} label="Home" onClick={() => setTab("home")} />
          <TabButton active={tab === "executive"} label="Exec" onClick={() => setTab("executive")} />
          <TabButton active={tab === "finance"} label="Fin" onClick={() => setTab("finance")} />
          <TabButton active={tab === "kpi"} label="KPI" onClick={() => setTab("kpi")} />
          <TabButton active={tab === "command"} label="Cmd" onClick={() => setTab("command")} />
        </div>

        {tab === "home" && (
          <div className="space-y-4">
            <MobileCard title="Executive Dashboard" subtitle="Personalized widgets">
              <DashboardWidgetsBoard boardCode="executive_main" />
            </MobileCard>
          </div>
        )}

        {tab === "executive" && (
          <MobileCard title="Executive Control Tower" subtitle="Mobile viewport">
            <div className="overflow-hidden rounded-2xl">
              <ExecutiveControlTower />
            </div>
          </MobileCard>
        )}

        {tab === "finance" && (
          <MobileCard title="Finance Control Room" subtitle="Collections, AP/AP, cashflow">
            <div className="overflow-hidden rounded-2xl">
              <FinanceControlRoom />
            </div>
          </MobileCard>
        )}

        {tab === "kpi" && (
          <MobileCard title="KPI Engine" subtitle="Thresholds and breaches">
            <div className="overflow-hidden rounded-2xl">
              <KPIEngine />
            </div>
          </MobileCard>
        )}

        {tab === "command" && (
          <MobileCard title="Command Center" subtitle="Workflow and queue pulse">
            <div className="overflow-hidden rounded-2xl">
              <CommandCenter />
            </div>
          </MobileCard>
        )}
      </div>
    </div>
  );
}
