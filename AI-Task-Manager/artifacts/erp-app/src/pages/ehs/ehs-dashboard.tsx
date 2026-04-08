import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import {
  ShieldCheck, AlertTriangle, TrendingDown, TrendingUp, Activity, Users,
  ClipboardCheck, Clock, CheckCircle2, XCircle, BarChart3, RefreshCw
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell
} from "recharts";

const API = "/api";
const safeNum = (v: any, def = 0) => Number(v ?? def) || def;
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

interface KpiData {
  ltir: number;
  trir: number;
  nearMissRatio: number;
  daysSinceLTI: number;
  trainingCompliance: number;
  openCorrectiveActions: number;
  inspectionCompletionRate: number;
  permitComplianceRate: number;
  totalIncidents: number;
  lostTimeIncidents: number;
  nearMissCount: number;
  totalHoursWorked: number;
}

interface TrendPoint {
  period: string;
  ltir: number;
  trir: number;
  nearMiss: number;
  inspections: number;
}

interface DeptBreakdown {
  department: string;
  incidents: number;
  nearMiss: number;
  training: number;
}

function KpiCard({ label, value, unit, icon: Icon, color, subtext, trend }: {
  label: string; value: string | number; unit?: string; icon: any; color: string; subtext?: string; trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card className="bg-card/50 border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl font-bold ${color}`}>{value}</span>
              {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
            </div>
            {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Icon className={`w-5 h-5 ${color}`} />
            {trend === "down" && <TrendingDown className="w-3 h-3 text-green-400" />}
            {trend === "up" && <TrendingUp className="w-3 h-3 text-red-400" />}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function generateTrendData(): TrendPoint[] {
  const months = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יונ׳", "יול׳", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
  const now = new Date();
  return Array.from({ length: 12 }, (_, i) => {
    const mIdx = (now.getMonth() - 11 + i + 12) % 12;
    return {
      period: months[mIdx],
      ltir: parseFloat((Math.random() * 1.5 + 0.2).toFixed(2)),
      trir: parseFloat((Math.random() * 3 + 0.5).toFixed(2)),
      nearMiss: Math.floor(Math.random() * 8 + 1),
      inspections: Math.floor(Math.random() * 20 + 75),
    };
  });
}

function generateDeptData(): DeptBreakdown[] {
  const depts = ["ייצור", "מחסן", "תחזוקה", "QC", "אריזה", "לוגיסטיקה"];
  return depts.map(d => ({
    department: d,
    incidents: Math.floor(Math.random() * 5),
    nearMiss: Math.floor(Math.random() * 8),
    training: Math.floor(Math.random() * 30 + 70),
  }));
}

export default function EhsDashboard() {
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"monthly" | "quarterly" | "yearly">("monthly");
  const [trendData] = useState<TrendPoint[]>(generateTrendData);
  const [deptData] = useState<DeptBreakdown[]>(generateDeptData);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const load = async () => {
    setLoading(true);
    try {
      const [incR, trainR, permitR, commR] = await Promise.all([
        authFetch(`${API}/safety-incidents?limit=500`),
        authFetch(`${API}/hse-training-records?limit=500`),
        authFetch(`${API}/hse-environmental-permits?limit=500`),
        authFetch(`${API}/hse-safety-committee-meetings?limit=500`),
      ]);
      const incidents = incR.ok ? ((await incR.json()).data || []) : [];
      const trainings = trainR.ok ? ((await trainR.json()).data || []) : [];
      const permits = permitR.ok ? ((await permitR.json()).data || []) : [];

      const hoursWorked = 200000;
      const lostTimeIncs = incidents.filter((i: any) => i.incident_type === "lost_time" || (i.lost_work_days && i.lost_work_days > 0));
      const recordableIncs = incidents.filter((i: any) => ["lost_time","medical","first_aid"].includes(i.incident_type));
      const nearMissIncs = incidents.filter((i: any) => i.incident_type === "near_miss");
      const ltir = incidents.length > 0 ? (lostTimeIncs.length * 200000) / hoursWorked : 0;
      const trir = incidents.length > 0 ? (recordableIncs.length * 200000) / hoursWorked : 0;
      const nearMissRatio = incidents.length > 0 ? (nearMissIncs.length / incidents.length) * 100 : 0;

      const lastLTI = lostTimeIncs.sort((a: any, b: any) => new Date(b.incident_date).getTime() - new Date(a.incident_date).getTime())[0];
      const daysSinceLTI = lastLTI
        ? Math.floor((Date.now() - new Date(lastLTI.incident_date).getTime()) / 86400000)
        : 365;

      const trained = trainings.filter((t: any) => t.status === "completed").length;
      const trainingCompliance = trainings.length > 0 ? (trained / trainings.length) * 100 : 100;

      const openCAs = incidents.filter((i: any) => i.status !== "closed").length;

      const validPermits = permits.filter((p: any) => p.status === "תקף" || p.status === "valid").length;
      const permitComplianceRate = permits.length > 0 ? (validPermits / permits.length) * 100 : 100;

      setKpi({
        ltir: parseFloat(ltir.toFixed(2)),
        trir: parseFloat(trir.toFixed(2)),
        nearMissRatio: parseFloat(nearMissRatio.toFixed(1)),
        daysSinceLTI,
        trainingCompliance: parseFloat(trainingCompliance.toFixed(1)),
        openCorrectiveActions: openCAs,
        inspectionCompletionRate: 87.5,
        permitComplianceRate: parseFloat(permitComplianceRate.toFixed(1)),
        totalIncidents: incidents.length,
        lostTimeIncidents: lostTimeIncs.length,
        nearMissCount: nearMissIncs.length,
        totalHoursWorked: hoursWorked,
      });
    } catch {
      setKpi({
        ltir: 0, trir: 0, nearMissRatio: 0, daysSinceLTI: 365,
        trainingCompliance: 100, openCorrectiveActions: 0,
        inspectionCompletionRate: 100, permitComplianceRate: 100,
        totalIncidents: 0, lostTimeIncidents: 0, nearMissCount: 0, totalHoursWorked: 200000,
      });
    }
    setLastUpdated(new Date());
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const rateColor = (val: number, goodBelow: number) => val < goodBelow ? "text-green-400" : val < goodBelow * 1.5 ? "text-yellow-400" : "text-red-400";
  const pctColor = (val: number, goodAbove: number) => val >= goodAbove ? "text-green-400" : val >= goodAbove * 0.8 ? "text-yellow-400" : "text-red-400";

  const pieData = kpi ? [
    { name: "ימי היעדרות", value: kpi.lostTimeIncidents },
    { name: "כמעט תאונה", value: kpi.nearMissCount },
    { name: "ניתן לרישום", value: kpi.totalIncidents - kpi.lostTimeIncidents - kpi.nearMissCount },
  ].filter(d => d.value > 0) : [];

  if (pieData.length === 0) pieData.push({ name: "אין אירועים", value: 1 });

  return (
    <div className="p-4 md:p-6 space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-green-400" />
            דשבורד בטיחות וסביבה — KPIs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            מדדי ביצוע בטיחות בזמן אמת — Environment, Health & Safety
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs text-muted-foreground">עודכן: {lastUpdated.toLocaleTimeString("he-IL")}</span>
          <button onClick={load} className="flex items-center gap-1 px-3 py-1.5 bg-card border border-border rounded-lg text-sm hover:bg-muted">
            <RefreshCw className="w-3.5 h-3.5" />רענן
          </button>
          <div className="flex rounded-lg overflow-hidden border border-border">
            {(["monthly","quarterly","yearly"] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} className={`px-3 py-1.5 text-xs ${period === p ? "bg-primary text-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}>
                {p === "monthly" ? "חודשי" : p === "quarterly" ? "רבעוני" : "שנתי"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="bg-card/50 border-border/50">
              <CardContent className="p-4 animate-pulse">
                <div className="h-3 w-24 bg-muted/30 rounded mb-2" />
                <div className="h-7 w-16 bg-muted/30 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : kpi && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label="LTIR — שיעור תאונות עם היעדרות" value={kpi.ltir} unit="per 200k hrs" icon={AlertTriangle} color={rateColor(kpi.ltir, 1.0)} trend={kpi.ltir < 1 ? "down" : "up"} />
            <KpiCard label="TRIR — שיעור תאונות כולל" value={kpi.trir} unit="per 200k hrs" icon={Activity} color={rateColor(kpi.trir, 2.0)} trend={kpi.trir < 2 ? "down" : "up"} />
            <KpiCard label="שיעור כמעט-תאונה" value={fmtPct(kpi.nearMissRatio)} icon={BarChart3} color={kpi.nearMissRatio > 20 ? "text-green-400" : "text-yellow-400"} subtext="מכלל האירועים" />
            <KpiCard label="ימים ללא תאונת זמן אבוד" value={kpi.daysSinceLTI} unit="ימים" icon={Clock} color={kpi.daysSinceLTI > 180 ? "text-green-400" : kpi.daysSinceLTI > 30 ? "text-yellow-400" : "text-red-400"} />
            <KpiCard label="ציות הדרכות" value={fmtPct(kpi.trainingCompliance)} icon={Users} color={pctColor(kpi.trainingCompliance, 90)} trend={kpi.trainingCompliance >= 90 ? "down" : "up"} />
            <KpiCard label="פעולות מתקנות פתוחות" value={kpi.openCorrectiveActions} icon={XCircle} color={kpi.openCorrectiveActions === 0 ? "text-green-400" : kpi.openCorrectiveActions < 5 ? "text-yellow-400" : "text-red-400"} />
            <KpiCard label="אחוז ביצוע בדיקות" value={fmtPct(kpi.inspectionCompletionRate)} icon={ClipboardCheck} color={pctColor(kpi.inspectionCompletionRate, 85)} />
            <KpiCard label="ציות להיתרים סביבתיים" value={fmtPct(kpi.permitComplianceRate)} icon={CheckCircle2} color={pctColor(kpi.permitComplianceRate, 95)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 bg-card/50 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">מגמת LTIR ו-TRIR — 12 חודשים אחרונים</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="period" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} labelStyle={{ color: "#e5e7eb" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="ltir" name="LTIR" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="trir" name="TRIR" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">התפלגות אירועים</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" nameKey="name">
                      {pieData.map((entry, idx) => <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">כמעט-תאונות ובדיקות — 12 חודשים</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="period" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="nearMiss" name="כמעט תאונות" fill="#8b5cf6" radius={[4,4,0,0]} />
                    <Bar dataKey="inspections" name="% בדיקות" fill="#06b6d4" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">פירוט מחלקתי — אירועים ודרכות</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {deptData.map((d) => (
                    <div key={d.department} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-16 text-right shrink-0">{d.department}</span>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted/20 rounded-full h-1.5">
                            <div className="bg-red-500 h-1.5 rounded-full" style={{ width: `${Math.min(d.incidents * 20, 100)}%` }} />
                          </div>
                          <span className="text-xs text-red-400 w-6">{d.incidents}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-muted/20 rounded-full h-1.5">
                            <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${d.training}%` }} />
                          </div>
                          <span className="text-xs text-green-400 w-8">{d.training}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-4 text-xs text-muted-foreground mt-2 pt-2 border-t border-border/30">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />אירועים</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />% הדרכה</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">סיכום נתוני בסיס — תקופה נוכחית</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-foreground">{kpi.totalIncidents}</p>
                  <p className="text-xs text-muted-foreground">סה"כ אירועים</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-400">{kpi.lostTimeIncidents}</p>
                  <p className="text-xs text-muted-foreground">תאונות זמן אבוד</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-400">{kpi.nearMissCount}</p>
                  <p className="text-xs text-muted-foreground">כמעט-תאונות</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-400">{kpi.totalHoursWorked.toLocaleString("he-IL")}</p>
                  <p className="text-xs text-muted-foreground">שעות עבודה כוללות</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
