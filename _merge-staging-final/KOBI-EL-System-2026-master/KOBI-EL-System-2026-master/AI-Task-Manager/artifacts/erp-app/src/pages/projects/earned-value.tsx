import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, TrendingDown, DollarSign, Activity, Target, BarChart3,
  RefreshCw, Filter, CheckCircle2, AlertTriangle, XCircle
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtCurrency = (v: any) => "₪" + fmt(v);
const fmtPct = (v: number) => (v * 100).toFixed(0) + "%";

function GaugeIndicator({ label, value, unit }: { label: string; value: number; unit?: string }) {
  const isGood = value >= 1;
  const isBad = value < 0.9;
  const color = isGood ? "text-emerald-400" : isBad ? "text-red-400" : "text-yellow-400";
  const bgColor = isGood ? "bg-emerald-500" : isBad ? "bg-red-500" : "bg-yellow-500";
  const pct = Math.min(Math.max((value / 1.5) * 100, 5), 100);

  return (
    <div className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/50 bg-muted/30">
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      <div className="relative w-20 h-20">
        {/* Background circle */}
        <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6"
            className="text-gray-700" />
          <circle cx="40" cy="40" r="34" fill="none" strokeWidth="6"
            className={isGood ? "text-emerald-500" : isBad ? "text-red-500" : "text-yellow-500"}
            strokeDasharray={`${pct * 2.136} 999`}
            strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-lg font-bold ${color}`}>{value.toFixed(2)}</span>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {isGood ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> :
          isBad ? <XCircle className="w-3 h-3 text-red-400" /> :
          <AlertTriangle className="w-3 h-3 text-yellow-400" />}
        <span className={`text-xs ${color}`}>
          {isGood ? "תקין" : isBad ? "חריגה" : "זהירות"}
        </span>
      </div>
    </div>
  );
}

function HealthBadge({ spi, cpi }: { spi: number; cpi: number }) {
  const health = spi >= 1 && cpi >= 1 ? "healthy" :
    spi >= 0.9 && cpi >= 0.9 ? "warning" : "critical";
  const map: Record<string, { label: string; color: string }> = {
    healthy:  { label: "בריא",    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    warning:  { label: "זהירות",  color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
    critical: { label: "קריטי",   color: "bg-red-500/20 text-red-400 border-red-500/30" },
  };
  const h = map[health];
  return <Badge className={`${h.color} border text-xs`}>{h.label}</Badge>;
}

function TimelineChart({ data }: { data: any[] }) {
  if (!data.length) return <div className="text-center py-8 text-gray-400 text-sm">אין נתוני ציר זמן</div>;
  const maxVal = Math.max(...data.flatMap(d => [d.pv || 0, d.ev || 0, d.ac || 0]), 1);

  return (
    <div className="space-y-2">
      <div className="flex gap-4 text-xs text-gray-400 mb-2">
        <span className="flex items-center gap-1"><span className="w-3 h-1 bg-blue-500 rounded" /> PV</span>
        <span className="flex items-center gap-1"><span className="w-3 h-1 bg-emerald-500 rounded" /> EV</span>
        <span className="flex items-center gap-1"><span className="w-3 h-1 bg-red-500 rounded" /> AC</span>
      </div>
      <div className="flex items-end gap-2 h-48">
        {data.map((d, i) => {
          const pvH = (d.pv / maxVal) * 100;
          const evH = (d.ev / maxVal) * 100;
          const acH = (d.ac / maxVal) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="flex items-end gap-0.5 h-40 w-full">
                <div className="flex-1 bg-blue-500/60 rounded-t transition-all" style={{ height: `${pvH}%` }} title={`PV: ${fmtCurrency(d.pv)}`} />
                <div className="flex-1 bg-emerald-500/60 rounded-t transition-all" style={{ height: `${evH}%` }} title={`EV: ${fmtCurrency(d.ev)}`} />
                <div className="flex-1 bg-red-500/60 rounded-t transition-all" style={{ height: `${acH}%` }} title={`AC: ${fmtCurrency(d.ac)}`} />
              </div>
              <span className="text-xs text-gray-500">{d.period || d.month || `T${i + 1}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function EarnedValuePage() {
  const [data, setData] = useState<any>({});
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [evRes, projRes] = await Promise.all([
        authFetch(`${API}/projects-sap/earned-value${selectedProject !== "all" ? `?project_id=${selectedProject}` : ""}`),
        authFetch(`${API}/projects-sap/projects`),
      ]);
      if (evRes.ok) {
        const json = await evRes.json();
        setData(json);
      }
      if (projRes.ok) setProjects(safeArray(await projRes.json()));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [selectedProject]);

  const ev = useMemo(() => {
    const pv = data.planned_value || data.pv || 0;
    const earned = data.earned_value || data.ev || 0;
    const ac = data.actual_cost || data.ac || 0;
    const spi = pv > 0 ? earned / pv : 0;
    const cpi = ac > 0 ? earned / ac : 0;
    const eac = cpi > 0 ? (data.bac || pv) / cpi : 0;
    const sv = earned - pv;
    const cv = earned - ac;
    const bac = data.bac || pv;
    const etc = eac - ac;
    const vac = bac - eac;
    const tcpi = (bac - earned) / (bac - ac) || 0;
    return { pv, ev: earned, ac, spi, cpi, eac, sv, cv, bac, etc, vac, tcpi };
  }, [data]);

  const timeline = useMemo(() => data.timeline || data.periods || [], [data]);

  const kpis = [
    { icon: Target, label: "PV - ערך מתוכנן", value: fmtCurrency(ev.pv), color: "from-blue-600 to-blue-800" },
    { icon: TrendingUp, label: "EV - ערך נרכש", value: fmtCurrency(ev.ev), color: "from-emerald-600 to-emerald-800" },
    { icon: DollarSign, label: "AC - עלות בפועל", value: fmtCurrency(ev.ac), color: "from-red-600 to-red-800" },
    { icon: Activity, label: "SPI", value: ev.spi.toFixed(2), color: ev.spi >= 1 ? "from-emerald-600 to-emerald-800" : "from-red-600 to-red-800" },
    { icon: BarChart3, label: "CPI", value: ev.cpi.toFixed(2), color: ev.cpi >= 1 ? "from-emerald-600 to-emerald-800" : "from-red-600 to-red-800" },
    { icon: DollarSign, label: "EAC - אומדן סיום", value: fmtCurrency(ev.eac), color: "from-purple-600 to-purple-800" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">ניהול ערך נרכש (EVM)</h1>
          {!loading && <HealthBadge spi={ev.spi} cpi={ev.cpi} />}
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 rounded-lg bg-muted hover:bg-muted text-gray-300">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Project Selector */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-gray-400" />
        <select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}
          className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground text-sm">
          <option value="all">כל הפרויקטים</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name || p.project_name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">טוען נתונים...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {kpis.map((k, i) => (
              <div key={i} className={`rounded-xl bg-gradient-to-br ${k.color} p-4 border border-white/10`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-foreground/70">{k.label}</div>
                    <div className="text-xl font-bold text-foreground mt-1">{k.value}</div>
                  </div>
                  <k.icon className="w-6 h-6 text-foreground/30" />
                </div>
              </div>
            ))}
          </div>

          {/* Gauges Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <GaugeIndicator label="SPI - מדד לוח זמנים" value={ev.spi} />
            <GaugeIndicator label="CPI - מדד עלות" value={ev.cpi} />
            <GaugeIndicator label="TCPI - מדד ביצוע לסיום" value={ev.tcpi} />
            <div className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/50 bg-muted/30">
              <span className="text-xs text-gray-400 font-medium">סטיות</span>
              <div className="space-y-2 w-full">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">SV (לו&quot;ז)</span>
                  <span className={`text-sm font-bold ${ev.sv >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtCurrency(ev.sv)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">CV (עלות)</span>
                  <span className={`text-sm font-bold ${ev.cv >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtCurrency(ev.cv)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">VAC</span>
                  <span className={`text-sm font-bold ${ev.vac >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {fmtCurrency(ev.vac)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">ETC</span>
                  <span className="text-sm font-bold text-gray-300">{fmtCurrency(ev.etc)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline Chart */}
          <div className="rounded-xl border border-border/50 bg-muted/30 p-5">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2 mb-4">
              <Activity className="w-5 h-5 text-blue-400" />
              ציר זמן - PV / EV / AC
            </h2>
            <TimelineChart data={timeline} />
          </div>

          {/* Summary Table */}
          <div className="rounded-xl border border-border/50 bg-muted/30 p-5">
            <h2 className="text-lg font-semibold text-foreground mb-4">סיכום מדדים</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "BAC - תקציב בסיום", value: fmtCurrency(ev.bac) },
                { label: "EAC - אומדן בסיום", value: fmtCurrency(ev.eac) },
                { label: "ETC - עלות לסיום", value: fmtCurrency(ev.etc) },
                { label: "VAC - סטיית תקציב", value: fmtCurrency(ev.vac), good: ev.vac >= 0 },
                { label: "SV - סטיית לו\"ז", value: fmtCurrency(ev.sv), good: ev.sv >= 0 },
                { label: "CV - סטיית עלות", value: fmtCurrency(ev.cv), good: ev.cv >= 0 },
                { label: "SPI", value: ev.spi.toFixed(3), good: ev.spi >= 1 },
                { label: "CPI", value: ev.cpi.toFixed(3), good: ev.cpi >= 1 },
              ].map((m, i) => (
                <div key={i} className="p-3 rounded-lg bg-muted/30">
                  <div className="text-xs text-gray-400 mb-1">{m.label}</div>
                  <div className={`text-lg font-bold ${m.good !== undefined ? (m.good ? "text-emerald-400" : "text-red-400") : "text-foreground"}`}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
