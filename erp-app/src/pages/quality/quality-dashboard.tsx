import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadialBarChart, RadialBar
} from "recharts";
import {
  Award, TrendingUp, TrendingDown, AlertCircle, CheckCircle2,
  Clock, RefreshCw, AlertTriangle, Activity, DollarSign, BarChart3
} from "lucide-react";

const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

const COST_COLORS = {
  prevention: "#22c55e",
  appraisal: "#3b82f6",
  internalFailure: "#f59e0b",
  externalFailure: "#ef4444",
};

const COST_LABELS = {
  prevention: "מניעה",
  appraisal: "הערכה",
  internalFailure: "כשל פנימי",
  externalFailure: "כשל חיצוני",
};

const MONTHS_OPTIONS = [
  { value: "3", label: "3 חודשים" },
  { value: "6", label: "6 חודשים" },
  { value: "12", label: "12 חודשים" },
];

interface KPISummary {
  period: { from: string; to: string };
  ppm: number;
  firstPassYield: number;
  totalInspections: number;
  passedInspections: number;
  failedInspections: number;
  totalDefects: number;
  costOfQuality: {
    prevention: number;
    appraisal: number;
    internalFailure: number;
    externalFailure: number;
    total: number;
  };
  calibrationOverdue: number;
  openFindings: { total: number; bySeverity: Record<string, number> };
  certExpiringSoon: number;
}

function StatCard({ title, value, unit, icon: Icon, color, trend, sub }: any) {
  return (
    <Card className="bg-card/50 border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`text-3xl font-bold mt-1 ${color}`}>{value}<span className="text-lg font-normal text-muted-foreground mr-1">{unit}</span></p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <Icon className={`w-8 h-8 ${color} opacity-70`} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 mt-2 text-xs ${trend >= 0 ? "text-red-400" : "text-green-400"}`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}% לעומת תקופה קודמת
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const MONTH_NAMES: Record<string, string> = {
  "01": "ינו", "02": "פבר", "03": "מרץ", "04": "אפר",
  "05": "מאי", "06": "יוני", "07": "יולי", "08": "אוג",
  "09": "ספט", "10": "אוק", "11": "נוב", "12": "דצמ",
};

function formatMonth(str: string) {
  const [y, m] = str.split("-");
  return `${MONTH_NAMES[m] || m} ${y?.slice(2)}`;
}

export default function QualityDashboard() {
  const queryClient = useQueryClient();
  const [months, setMonths] = useState("6");

  const { data: kpi, isLoading: loadingKpi } = useQuery<KPISummary | null>({
    queryKey: ["quality-kpis-summary"],
    queryFn: async () => {
      const r = await authFetch(`${BASE}/quality-kpis/summary`);
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: trends } = useQuery({
    queryKey: ["quality-kpis-trends", months],
    queryFn: async () => {
      const r = await authFetch(`${BASE}/quality-kpis/trends?months=${months}`);
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: pareto = [], isRefetching: refreshing } = useQuery<any[]>({
    queryKey: ["quality-kpis-pareto"],
    queryFn: async () => {
      const r = await authFetch(`${BASE}/quality-kpis/pareto`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  const loading = loadingKpi;

  const coq = kpi?.costOfQuality || { prevention: 0, appraisal: 0, internalFailure: 0, externalFailure: 0 };
  const costPieData = kpi ? [
    { name: COST_LABELS.prevention, value: coq.prevention, color: COST_COLORS.prevention },
    { name: COST_LABELS.appraisal, value: coq.appraisal, color: COST_COLORS.appraisal },
    { name: COST_LABELS.internalFailure, value: coq.internalFailure, color: COST_COLORS.internalFailure },
    { name: COST_LABELS.externalFailure, value: coq.externalFailure, color: COST_COLORS.externalFailure },
  ].filter(d => d.value > 0) : [];

  const trendData = trends?.inspectionTrends?.map((t: any) => ({
    month: formatMonth(t.month),
    fpy: parseFloat(t.fpy) || 0,
    ppm: parseFloat(t.ppm) || 0,
    defects: parseInt(t.defects) || 0,
  })) || [];

  const displayTrendData = trendData;

  const displayPareto = pareto.length > 0 ? pareto.map((p: any) => ({
    name: p.category,
    count: parseInt(p.total_defects) || parseInt(p.count) || 0,
  })) : [];

  const defaultKpi = {
    ppm: 0, firstPassYield: 0, totalInspections: 0,
    passedInspections: 0, failedInspections: 0, totalDefects: 0,
    costOfQuality: { prevention: 0, appraisal: 0, internalFailure: 0, externalFailure: 0, total: 0 },
    calibrationOverdue: 0, openFindings: { total: 0, bySeverity: {} }, certExpiringSoon: 0
  };
  const displayKpi = kpi ? {
    ...defaultKpi,
    ...kpi,
    costOfQuality: { ...defaultKpi.costOfQuality, ...(kpi.costOfQuality || {}) },
    openFindings: { ...defaultKpi.openFindings, ...(kpi.openFindings || {}) },
  } : defaultKpi;

  const hasNoData = !kpi || kpi.totalInspections === 0;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">דשבורד ניהול איכות — KPI</h1>
          <p className="text-sm text-muted-foreground mt-1">מדדי ביצוע עיקריים לניהול איכות מקיף</p>
        </div>
        <div className="flex items-center gap-2">
          {hasNoData && !loading && <Badge className="bg-slate-500/20 text-slate-300">אין נתונים</Badge>}
          <select value={months} onChange={e => setMonths(e.target.value)}
            className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
            {MONTHS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <Button variant="outline" size="sm" onClick={() => { queryClient.invalidateQueries({ queryKey: ["quality-kpis-summary"] }); queryClient.invalidateQueries({ queryKey: ["quality-kpis-trends", months] }); queryClient.invalidateQueries({ queryKey: ["quality-kpis-pareto"] }); }} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ml-1 ${refreshing ? "animate-spin" : ""}`} />רענן
          </Button>
        </div>
      </div>

      {/* Alerts Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${displayKpi.calibrationOverdue > 0 ? "bg-red-900/20 border-red-500/30" : "bg-green-900/20 border-green-500/30"}`}>
          <AlertCircle className={`w-6 h-6 ${displayKpi.calibrationOverdue > 0 ? "text-red-400" : "text-green-400"}`} />
          <div>
            <div className="text-lg font-bold text-foreground">{displayKpi.calibrationOverdue}</div>
            <div className="text-xs text-muted-foreground">מכשירים ללא כיול תקף</div>
          </div>
        </div>
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${displayKpi.openFindings.total > 0 ? "bg-orange-900/20 border-orange-500/30" : "bg-green-900/20 border-green-500/30"}`}>
          <AlertTriangle className={`w-6 h-6 ${displayKpi.openFindings.total > 0 ? "text-orange-400" : "text-green-400"}`} />
          <div>
            <div className="text-lg font-bold text-foreground">{displayKpi.openFindings.total}</div>
            <div className="text-xs text-muted-foreground">ממצאי ביקורת פתוחים</div>
          </div>
        </div>
        <div className={`flex items-center gap-3 p-3 rounded-lg border ${displayKpi.certExpiringSoon > 0 ? "bg-yellow-900/20 border-yellow-500/30" : "bg-green-900/20 border-green-500/30"}`}>
          <Clock className={`w-6 h-6 ${displayKpi.certExpiringSoon > 0 ? "text-yellow-400" : "text-green-400"}`} />
          <div>
            <div className="text-lg font-bold text-foreground">{displayKpi.certExpiringSoon}</div>
            <div className="text-xs text-muted-foreground">תעודות פוגות תוקף בקרוב</div>
          </div>
        </div>
      </div>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="PPM — פגמים למיליון"
          value={hasNoData ? "—" : displayKpi.ppm.toLocaleString()}
          unit={hasNoData ? "" : "ppm"}
          icon={Activity}
          color={hasNoData ? "text-muted-foreground" : displayKpi.ppm < 3000 ? "text-green-400" : displayKpi.ppm < 8000 ? "text-yellow-400" : "text-red-400"}
          sub={hasNoData ? "אין בדיקות איכות" : `${displayKpi.totalInspections} בדיקות`}
        />
        <StatCard
          title="תפוקה ראשונה — FPY"
          value={hasNoData ? "—" : displayKpi.firstPassYield.toFixed(1)}
          unit={hasNoData ? "" : "%"}
          icon={CheckCircle2}
          color={hasNoData ? "text-muted-foreground" : displayKpi.firstPassYield >= 97 ? "text-green-400" : displayKpi.firstPassYield >= 95 ? "text-yellow-400" : "text-red-400"}
          sub={hasNoData ? "אין בדיקות" : `עברו: ${displayKpi.passedInspections} / ${displayKpi.totalInspections}`}
        />
        <StatCard
          title="עלות איכות כוללת"
          value={hasNoData ? "—" : displayKpi.costOfQuality.total.toLocaleString()}
          unit={hasNoData ? "" : "₪"}
          icon={DollarSign}
          color="text-purple-400"
          sub={hasNoData ? "אין נתוני עלות" : undefined}
        />
        <StatCard
          title="פגמים שהתגלו"
          value={hasNoData ? "—" : displayKpi.totalDefects.toString()}
          unit=""
          icon={AlertCircle}
          color={hasNoData ? "text-muted-foreground" : displayKpi.totalDefects < 50 ? "text-green-400" : "text-orange-400"}
          sub={hasNoData ? "אין נתוני פגמים" : `${displayKpi.failedInspections} בדיקות שנכשלו`}
        />
      </div>

      {/* Charts Row 1: FPY Trend + PPM Trend */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-400" />מגמת תפוקה ראשונה FPY
            </CardTitle>
          </CardHeader>
          <CardContent>
            {displayTrendData.length === 0 ? (
              <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <TrendingUp className="w-10 h-10 opacity-20" />
                <p className="text-sm">אין נתוני מגמה זמינים</p>
                <p className="text-xs">בצע בדיקות איכות כדי לראות מגמות</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={displayTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis domain={[85, 100]} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", color: "#f9fafb" }}
                    formatter={(v: any) => [`${v}%`, "FPY"]} />
                  <Line type="monotone" dataKey="fpy" stroke="#22c55e" strokeWidth={2} dot={{ fill: "#22c55e", r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />מגמת PPM
            </CardTitle>
          </CardHeader>
          <CardContent>
            {displayTrendData.length === 0 ? (
              <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <BarChart3 className="w-10 h-10 opacity-20" />
                <p className="text-sm">אין נתוני PPM זמינים</p>
                <p className="text-xs">בצע בדיקות כדי לחשב PPM</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={displayTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="month" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", color: "#f9fafb" }}
                    formatter={(v: any) => [v.toLocaleString(), "PPM"]} />
                  <Bar dataKey="ppm" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: CoQ Pie + Pareto */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-purple-400" />עלות האיכות — CoQ
            </CardTitle>
          </CardHeader>
          <CardContent>
            {costPieData.length === 0 ? (
              <div className="h-[200px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <DollarSign className="w-10 h-10 opacity-20" />
                <p className="text-sm">אין נתוני עלות איכות</p>
                <p className="text-xs">נתונים יוצגו לאחר תיעוד עלויות</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={costPieData} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                    label={({ name, percent }) => `${name} ${Math.round(percent * 100)}%`}
                    labelLine={{ stroke: "#6b7280" }}>
                    {costPieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", color: "#f9fafb" }}
                    formatter={(v: any) => [`₪${v.toLocaleString()}`, ""]} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="grid grid-cols-2 gap-2 mt-3">
              {Object.entries(COST_LABELS).map(([k, label]) => (
                <div key={k} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COST_COLORS[k as keyof typeof COST_COLORS] }} />
                  <span className="text-xs text-muted-foreground">{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-foreground text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-orange-400" />פארטו פגמים עיקריים
            </CardTitle>
          </CardHeader>
          <CardContent>
            {displayPareto.length === 0 ? (
              <div className="h-[220px] flex flex-col items-center justify-center gap-2 text-muted-foreground">
                <BarChart3 className="w-10 h-10 opacity-20" />
                <p className="text-sm">אין נתוני פגמים לניתוח פארטו</p>
                <p className="text-xs">הגדר קטגוריות פגמים ובצע בדיקות</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={displayPareto} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} width={90} />
                  <Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", color: "#f9fafb" }}
                    formatter={(v: any) => [v, "פגמים"]} />
                  <Bar dataKey="count" fill="#f97316" radius={[0, 2, 2, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* CoQ Breakdown Table */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-foreground text-base">פירוט עלות האיכות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { key: "prevention", label: "עלויות מניעה", desc: "הכשרה, תכנון, תחזוקה מונעת", color: "text-green-400", bg: "bg-green-900/20" },
              { key: "appraisal", label: "עלויות הערכה", desc: "בדיקות, כיול, ביקורות", color: "text-blue-400", bg: "bg-blue-900/20" },
              { key: "internalFailure", label: "כשל פנימי", desc: "פסולת, עיבוד חוזר, ממצאים", color: "text-yellow-400", bg: "bg-yellow-900/20" },
              { key: "externalFailure", label: "כשל חיצוני", desc: "החזרות, אחריות, תלונות", color: "text-red-400", bg: "bg-red-900/20" },
            ].map(({ key, label, desc, color, bg }) => {
              const amount = displayKpi.costOfQuality[key as keyof typeof displayKpi.costOfQuality];
              const total = displayKpi.costOfQuality.total;
              const pct = total > 0 ? Math.round((amount as number) / total * 100) : 0;
              return (
                <div key={key} className={`p-4 rounded-lg ${bg}`}>
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  <p className={`text-2xl font-bold ${color}`}>
                    {hasNoData ? "—" : `₪${(amount as number).toLocaleString()}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{hasNoData ? "—" : `${pct}% מסה"כ`}</p>
                  <p className="text-xs text-muted-foreground mt-1">{desc}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
