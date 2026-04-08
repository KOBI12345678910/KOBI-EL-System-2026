import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  LayoutDashboard, TrendingUp, TrendingDown, DollarSign, BarChart3, Banknote,
  AlertTriangle, CheckCircle, Target, Activity, ShieldCheck, Truck, Package,
  Factory, Wrench, Wallet, ShoppingCart, HeartHandshake, ArrowUpRight,
  ArrowDownRight, AlertCircle, Bell, Flame, Layers, Zap, CircleDot
} from "lucide-react";

/* ─── Executive KPIs ─── */
const FALLBACK_EXEC_KPIS = [
  { label: "הכנסות", value: 12800000, prev: 11500000, target: 14000000, icon: DollarSign, color: "text-green-400", prefix: "₪" },
  { label: "רווח גולמי", value: 38.2, prev: 36.8, target: 40, icon: TrendingUp, color: "text-emerald-400", suffix: "%" },
  { label: "EBITDA", value: 2850000, prev: 2400000, target: 3200000, icon: BarChart3, color: "text-blue-400", prefix: "₪" },
  { label: "מזומנים", value: 8400000, prev: 7900000, target: 10000000, icon: Banknote, color: "text-cyan-400", prefix: "₪" },
  { label: "Backlog", value: 42000000, prev: 38000000, target: 50000000, icon: Layers, color: "text-purple-400", prefix: "₪" },
  { label: "אספקה בזמן", value: 91, prev: 88, target: 95, icon: Truck, color: "text-orange-400", suffix: "%" },
];

/* ─── Module Health ─── */
const FALLBACK_MODULES = [
  { name: "רכש", icon: ShoppingCart, score: 87, trend: "up" as const, alerts: 2, color: "from-blue-500/20 to-blue-900/10", accent: "text-blue-400" },
  { name: "יבוא", icon: Package, score: 72, trend: "down" as const, alerts: 4, color: "from-indigo-500/20 to-indigo-900/10", accent: "text-indigo-400" },
  { name: "מלאי", icon: Layers, score: 68, trend: "down" as const, alerts: 5, color: "from-amber-500/20 to-amber-900/10", accent: "text-amber-400" },
  { name: "ייצור", icon: Factory, score: 91, trend: "up" as const, alerts: 1, color: "from-emerald-500/20 to-emerald-900/10", accent: "text-emerald-400" },
  { name: "התקנות", icon: Wrench, score: 78, trend: "flat" as const, alerts: 3, color: "from-orange-500/20 to-orange-900/10", accent: "text-orange-400" },
  { name: "כספים", icon: Wallet, score: 94, trend: "up" as const, alerts: 0, color: "from-cyan-500/20 to-cyan-900/10", accent: "text-cyan-400" },
  { name: "מכירות", icon: Target, score: 82, trend: "up" as const, alerts: 2, color: "from-purple-500/20 to-purple-900/10", accent: "text-purple-400" },
  { name: "שירות", icon: HeartHandshake, score: 76, trend: "flat" as const, alerts: 3, color: "from-pink-500/20 to-pink-900/10", accent: "text-pink-400" },
];

/* ─── Profitability ─── */
const FALLBACK_PROFITABILITY_DATA = [
  { project: "מגדל C — אלון", est: 1250000, actual: 1180000, margin: 28.5, status: "on_track" },
  { project: "קמפוס הייטק נתניה", est: 680000, actual: 740000, margin: 22.1, status: "over" },
  { project: "שדרוג מלון אילת", est: 420000, actual: 395000, margin: 31.2, status: "on_track" },
  { project: "פרויקט רכבת קלה", est: 2100000, actual: 2450000, margin: 18.4, status: "over" },
  { project: "בניין מגורים — חיפה", est: 550000, actual: 510000, margin: 34.8, status: "on_track" },
  { project: "מרכז מסחרי ב״ש", est: 890000, actual: 960000, margin: 15.2, status: "over" },
  { project: "מפעל תעשייתי — קריות", est: 320000, actual: 305000, margin: 38.1, status: "on_track" },
];

/* ─── Exceptions ─── */
const FALLBACK_EXCEPTIONS = [
  { id: "EXC-001", module: "ייצור", desc: "קו C — השבתה 12 שעות, חלק חילוף מאיטליה", impact: 185000, severity: "critical", days: 2 },
  { id: "EXC-002", module: "רכש", desc: "ספק זכוכית Pilkington — עיכוב 3 שבועות", impact: 140000, severity: "critical", days: 5 },
  { id: "EXC-003", module: "כספים", desc: "לקוח אמות — חוב 420K מעל 90 יום", impact: 420000, severity: "high", days: 14 },
  { id: "EXC-004", module: "התקנות", desc: "PRJ-004 חריגת תקציב 12% — עלייה צפויה", impact: 96000, severity: "high", days: 3 },
  { id: "EXC-005", module: "מלאי", desc: "מלאי זכוכית 8mm מתחת לרמה מינימלית", impact: 65000, severity: "medium", days: 1 },
  { id: "EXC-006", module: "יבוא", desc: "משלוח קונטיינר — איחור 8 ימים בנמל חיפה", impact: 52000, severity: "medium", days: 8 },
  { id: "EXC-007", module: "מכירות", desc: "הצעה 3.2M — אבדה ללקוח מתחרה", impact: 3200000, severity: "high", days: 0 },
  { id: "EXC-008", module: "שירות", desc: "תלונת לקוח VIP — דליפה בהתקנה", impact: 28000, severity: "medium", days: 1 },
  { id: "EXC-009", module: "רכש", desc: "עליית מחיר אלומיניום 8% — ללא עדכון מחירון", impact: 220000, severity: "high", days: 7 },
  { id: "EXC-010", module: "ייצור", desc: "סטייה באיכות — אצווה B-412 חורגת מסבילות", impact: 48000, severity: "medium", days: 1 },
];

/* ─── Alerts ─── */
const FALLBACK_ALERTS = [
  { severity: "critical", module: "ייצור", msg: "קו C עומד — ממתין לחלק חילוף חירום", time: "07:15", owner: "יוסי מ." },
  { severity: "critical", module: "רכש", msg: "ספק Pilkington — התראת עיכוב קריטי", time: "06:50", owner: "דנה לוי" },
  { severity: "high", module: "כספים", msg: "חוב אמות השקעות — חריגה מעל 90 יום", time: "אתמול", owner: "מירי אביטל" },
  { severity: "high", module: "התקנות", msg: "PRJ-004 חריגת תקציב — ישיבת חירום 14:00", time: "היום", owner: "אורי כהן" },
  { severity: "high", module: "מכירות", msg: "Deal Lost — הצעה 3.2M אבדה למתחרה", time: "אתמול", owner: "נועה פ." },
  { severity: "high", module: "רכש", msg: "עליית מחיר אלומיניום — דורש עדכון מחירון", time: "היום", owner: "דנה לוי" },
  { severity: "medium", module: "מלאי", msg: "זכוכית 8mm — מתחת לנקודת הזמנה", time: "היום", owner: "אלון ג." },
  { severity: "medium", module: "יבוא", msg: "קונטיינר — איחור 8 ימים בנמל", time: "אתמול", owner: "דנה לוי" },
  { severity: "medium", module: "שירות", msg: "תלונת VIP — דליפה לאחר התקנה", time: "היום", owner: "רחל א." },
  { severity: "low", module: "ייצור", msg: "תחזוקה מתוכננת — קו A ביום חמישי", time: "השבוע", owner: "יוסי מ." },
  { severity: "low", module: "כספים", msg: "3 חשבוניות ממתינות לאישור מנהל", time: "היום", owner: "מירי אביטל" },
];

/* ─── KPI Scorecard ─── */
const FALLBACK_KPI_SCORECARD = [
  { category: "כספים", kpis: [
    { name: "הכנסות חודשיות", actual: "₪12.8M", target: "₪14M", pct: 91, status: "yellow" },
    { name: "רווח גולמי", actual: "38.2%", target: "40%", pct: 95, status: "green" },
    { name: "EBITDA", actual: "₪2.85M", target: "₪3.2M", pct: 89, status: "yellow" },
    { name: "תזרים מזומנים חופשי", actual: "₪1.2M", target: "₪1.5M", pct: 80, status: "yellow" },
    { name: "DSO — ימי חוב", actual: "52 ימים", target: "45 ימים", pct: 87, status: "yellow" },
  ]},
  { category: "מכירות", kpis: [
    { name: "Pipeline", actual: "₪28M", target: "₪35M", pct: 80, status: "yellow" },
    { name: "Win Rate", actual: "34%", target: "40%", pct: 85, status: "yellow" },
    { name: "גודל עסקה ממוצע", actual: "₪1.25M", target: "₪1.5M", pct: 83, status: "yellow" },
    { name: "לקוחות חדשים", actual: "4", target: "6", pct: 67, status: "red" },
  ]},
  { category: "ייצור", kpis: [
    { name: "OEE", actual: "78%", target: "85%", pct: 92, status: "green" },
    { name: "איכות — First Pass", actual: "99.2%", target: "99.5%", pct: 99, status: "green" },
    { name: "עמידה בלו״ז", actual: "91%", target: "95%", pct: 96, status: "green" },
    { name: "עלות לק״ג", actual: "₪42", target: "₪38", pct: 90, status: "yellow" },
  ]},
  { category: "שרשרת אספקה", kpis: [
    { name: "אספקה בזמן מספקים", actual: "84%", target: "92%", pct: 91, status: "green" },
    { name: "מלאי ימים", actual: "18 ימים", target: "15 ימים", pct: 83, status: "yellow" },
    { name: "חיסכון ברכש", actual: "₪340K", target: "₪500K", pct: 68, status: "red" },
    { name: "Lead Time ממוצע", actual: "28 ימים", target: "21 ימים", pct: 75, status: "red" },
  ]},
  { category: "לקוחות", kpis: [
    { name: "שביעות רצון", actual: "4.6/5", target: "4.8/5", pct: 96, status: "green" },
    { name: "תלונות פתוחות", actual: "7", target: "3", pct: 43, status: "red" },
    { name: "NPS", actual: "62", target: "70", pct: 89, status: "yellow" },
    { name: "שימור לקוחות", actual: "94%", target: "96%", pct: 98, status: "green" },
  ]},
];

/* ─── Helpers ─── */
const fmt = (n: number) => "₪" + new Intl.NumberFormat("he-IL").format(n);
const fmtShort = (n: number) => n >= 1000000 ? (n / 1000000).toFixed(1) + "M" : n >= 1000 ? (n / 1000).toFixed(0) + "K" : String(n);
const changePct = (c: number, p: number) => { const d = ((c - p) / p * 100).toFixed(1); return Number(d) >= 0 ? `+${d}%` : `${d}%`; };
const scoreColor = (s: number) => s >= 90 ? "text-emerald-400" : s >= 75 ? "text-blue-400" : s >= 60 ? "text-amber-400" : "text-red-400";
const scoreBg = (s: number) => s >= 90 ? "bg-emerald-500/20" : s >= 75 ? "bg-blue-500/20" : s >= 60 ? "bg-amber-500/20" : "bg-red-500/20";
const sevBadge = (s: string) => s === "critical" ? "bg-red-500/20 text-red-400" : s === "high" ? "bg-orange-500/20 text-orange-400" : s === "medium" ? "bg-amber-500/20 text-amber-400" : "bg-slate-500/20 text-slate-400";
const sevLabel = (s: string) => s === "critical" ? "קריטי" : s === "high" ? "גבוה" : s === "medium" ? "בינוני" : "נמוך";
const kpiStatusColor = (s: string) => s === "green" ? "bg-emerald-500" : s === "yellow" ? "bg-amber-500" : "bg-red-500";
const TrendIcon = ({ t }: { t: string }) => t === "up" ? <ArrowUpRight className="w-4 h-4 text-emerald-400" /> : t === "down" ? <ArrowDownRight className="w-4 h-4 text-red-400" /> : <Activity className="w-4 h-4 text-slate-400" />;

export default function BICommandCenter() {
  const { data: bicommandcenterData } = useQuery({
    queryKey: ["bi-command-center"],
    queryFn: () => authFetch("/api/executive/bi_command_center"),
    staleTime: 5 * 60 * 1000,
  });

  const execKPIs = bicommandcenterData ?? FALLBACK_EXEC_KPIS;

  const [tab, setTab] = useState("overview");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <LayoutDashboard className="w-7 h-7 text-blue-400" />
            מרכז BI ושליטה — הנהלה
          </h1>
          <p className="text-sm text-slate-400 mt-1">10 דשבורדים משולבים: CEO, מפעל, רכש, מלאי, ייצור, התקנות, רווחיות, התראות, חריגות, KPIs</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-blue-500/20 text-blue-400 text-xs">אפריל 2026</Badge>
          <Badge className="bg-green-500/20 text-green-400 text-xs animate-pulse">LIVE</Badge>
        </div>
      </div>

      {/* Top Executive KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {execKPIs.map((kpi, i) => {
          const up = kpi.value > kpi.prev;
          const pct = changePct(kpi.value, kpi.prev);
          const display = kpi.prefix ? kpi.prefix + fmtShort(kpi.value) : fmtShort(kpi.value) + (kpi.suffix || "");
          return (
            <Card key={i} className="bg-gradient-to-br from-slate-800/80 to-slate-900/60 border-slate-700 hover:border-slate-600 transition-colors">
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  <span className={`text-[10px] flex items-center gap-0.5 ${up ? "text-emerald-400" : "text-red-400"}`}>
                    {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{pct}
                  </span>
                </div>
                <div className={`text-xl font-bold ${kpi.color}`}>{display}</div>
                <div className="text-[10px] text-slate-400">{kpi.label}</div>
                <Progress value={(kpi.value / kpi.target) * 100} className="h-1 mt-1.5" />
                <div className="text-[9px] text-slate-500 mt-0.5">יעד: {kpi.prefix || ""}{fmtShort(kpi.target)}{kpi.suffix || ""}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Module Health Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
        {modules.map((m, i) => (
          <Card key={i} className={`bg-gradient-to-br ${m.color} border-slate-700/50 hover:border-slate-600 transition-all cursor-pointer`}>
            <CardContent className="p-3 text-center">
              <m.icon className={`w-5 h-5 mx-auto mb-1 ${m.accent}`} />
              <div className="text-xs text-slate-300 font-medium">{m.name}</div>
              <div className={`text-2xl font-bold mt-1 ${scoreColor(m.score)}`}>{m.score}</div>
              <div className="flex items-center justify-center gap-1 mt-1">
                <TrendIcon t={m.trend} />
                {m.alerts > 0 && (
                  <Badge className="bg-red-500/20 text-red-400 text-[9px] px-1">{m.alerts}</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="overview">סקירה כללית</TabsTrigger>
          <TabsTrigger value="profitability">רווחיות</TabsTrigger>
          <TabsTrigger value="exceptions">חריגות</TabsTrigger>
          <TabsTrigger value="alerts">התראות</TabsTrigger>
          <TabsTrigger value="kpis">KPIs</TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ── */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {modules.map((m, i) => (
              <Card key={i} className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <m.icon className={`w-4 h-4 ${m.accent}`} />
                    <span className="text-white">{m.name}</span>
                    <Badge className={`${scoreBg(m.score)} ${scoreColor(m.score)} text-[10px] mr-auto`}>{m.score}/100</Badge>
                    <TrendIcon t={m.trend} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                  <Progress value={m.score} className="h-2 mb-2" />
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      {m.score >= 90 ? "תקין — ללא פעולה נדרשת" : m.score >= 75 ? "טוב — מעקב שוטף" : m.score >= 60 ? "דורש תשומת לב" : "קריטי — פעולה מיידית"}
                    </span>
                    {m.alerts > 0 && (
                      <span className="text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />{m.alerts} התראות
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-emerald-400">{modules.filter(m => m.score >= 80).length}</div>
                <div className="text-xs text-slate-400 mt-1">מודולים תקינים</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-amber-400">{modules.filter(m => m.score >= 60 && m.score < 80).length}</div>
                <div className="text-xs text-slate-400 mt-1">דורשים מעקב</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-red-400">{modules.reduce((s, m) => s + m.alerts, 0)}</div>
                <div className="text-xs text-slate-400 mt-1">סה״כ התראות פתוחות</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Profitability Tab ── */}
        <TabsContent value="profitability" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-400" />
                רווחיות לפי פרויקט — משוער מול בפועל
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">פרויקט</TableHead>
                    <TableHead className="text-slate-400 text-right">עלות משוערת</TableHead>
                    <TableHead className="text-slate-400 text-right">עלות בפועל</TableHead>
                    <TableHead className="text-slate-400 text-right">סטייה</TableHead>
                    <TableHead className="text-slate-400 text-right">רווחיות</TableHead>
                    <TableHead className="text-slate-400 text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profitabilityData.map((p, i) => {
                    const diff = p.actual - p.est;
                    const diffPct = ((diff / p.est) * 100).toFixed(1);
                    const over = diff > 0;
                    return (
                      <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/20">
                        <TableCell className="text-white font-medium">{p.project}</TableCell>
                        <TableCell className="text-slate-300">{fmt(p.est)}</TableCell>
                        <TableCell className="text-slate-300">{fmt(p.actual)}</TableCell>
                        <TableCell className={over ? "text-red-400" : "text-emerald-400"}>
                          {over ? "+" : ""}{diffPct}% ({over ? "+" : ""}{fmt(diff)})
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className={p.margin >= 30 ? "text-emerald-400" : p.margin >= 20 ? "text-amber-400" : "text-red-400"}>
                              {p.margin}%
                            </span>
                            <Progress value={p.margin} className="h-1.5 w-16" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={p.status === "on_track" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}>
                            {p.status === "on_track" ? "בתקציב" : "חריגה"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Profitability summary */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-emerald-400">
                  {(profitabilityData.reduce((s, p) => s + p.margin, 0) / profitabilityData.length).toFixed(1)}%
                </div>
                <div className="text-xs text-slate-400 mt-1">רווחיות ממוצעת</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-red-400">{profitabilityData.filter(p => p.status === "over").length}</div>
                <div className="text-xs text-slate-400 mt-1">פרויקטים בחריגה</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-400">
                  {fmt(profitabilityData.reduce((s, p) => s + (p.actual - p.est), 0))}
                </div>
                <div className="text-xs text-slate-400 mt-1">סה״כ סטייה</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Exceptions Tab ── */}
        <TabsContent value="exceptions" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700 border-r-4 border-r-orange-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-orange-400 flex items-center gap-2">
                <Flame className="w-4 h-4" />
                מרכז חריגות — Top 10 חוצה מודולים (ממוין לפי השפעה)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">מזהה</TableHead>
                    <TableHead className="text-slate-400 text-right">מודול</TableHead>
                    <TableHead className="text-slate-400 text-right">תיאור</TableHead>
                    <TableHead className="text-slate-400 text-right">השפעה כספית</TableHead>
                    <TableHead className="text-slate-400 text-right">חומרה</TableHead>
                    <TableHead className="text-slate-400 text-right">ימים פתוח</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...exceptions].sort((a, b) => b.impact - a.impact).map((ex, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/20">
                      <TableCell className="text-blue-400 font-mono text-xs">{ex.id}</TableCell>
                      <TableCell>
                        <Badge className="bg-slate-700 text-slate-300 text-[10px]">{ex.module}</Badge>
                      </TableCell>
                      <TableCell className="text-white text-sm">{ex.desc}</TableCell>
                      <TableCell className="text-red-400 font-medium">{fmt(ex.impact)}</TableCell>
                      <TableCell>
                        <Badge className={`${sevBadge(ex.severity)} text-[10px]`}>{sevLabel(ex.severity)}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-300">{ex.days}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid grid-cols-4 gap-3">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-red-400">{exceptions.filter(e => e.severity === "critical").length}</div>
                <div className="text-[10px] text-slate-400">קריטי</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-orange-400">{exceptions.filter(e => e.severity === "high").length}</div>
                <div className="text-[10px] text-slate-400">גבוה</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-amber-400">{exceptions.filter(e => e.severity === "medium").length}</div>
                <div className="text-[10px] text-slate-400">בינוני</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-3 text-center">
                <div className="text-2xl font-bold text-white">{fmt(exceptions.reduce((s, e) => s + e.impact, 0))}</div>
                <div className="text-[10px] text-slate-400">סה״כ חשיפה</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Alerts Tab ── */}
        <TabsContent value="alerts" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700 border-r-4 border-r-red-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-400 flex items-center gap-2">
                <Bell className="w-4 h-4" />
                מרכז התראות — כל המודולים (ממוין לפי חומרה)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...alerts]
                .sort((a, b) => {
                  const ord: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                  return (ord[a.severity] ?? 9) - (ord[b.severity] ?? 9);
                })
                .map((al, i) => (
                <div key={i} className={`p-3 rounded-lg border border-slate-700/50 flex items-center justify-between ${
                  al.severity === "critical" ? "bg-red-500/5 border-r-2 border-r-red-500" :
                  al.severity === "high" ? "bg-orange-500/5 border-r-2 border-r-orange-500" :
                  al.severity === "medium" ? "bg-amber-500/5 border-r-2 border-r-amber-500" :
                  "bg-slate-800/30 border-r-2 border-r-slate-600"
                }`}>
                  <div className="flex items-center gap-3">
                    <Badge className={`${sevBadge(al.severity)} text-[10px]`}>{sevLabel(al.severity)}</Badge>
                    <Badge className="bg-slate-700 text-slate-300 text-[10px]">{al.module}</Badge>
                    <span className="text-white text-sm">{al.msg}</span>
                  </div>
                  <div className="text-left flex items-center gap-3 shrink-0">
                    <span className="text-xs text-slate-500">{al.time}</span>
                    <span className="text-xs text-blue-400">{al.owner}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "קריטי", count: alerts.filter(a => a.severity === "critical").length, color: "text-red-400" },
              { label: "גבוה", count: alerts.filter(a => a.severity === "high").length, color: "text-orange-400" },
              { label: "בינוני", count: alerts.filter(a => a.severity === "medium").length, color: "text-amber-400" },
              { label: "נמוך", count: alerts.filter(a => a.severity === "low").length, color: "text-slate-400" },
            ].map((s, i) => (
              <Card key={i} className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-3 text-center">
                  <div className={`text-2xl font-bold ${s.color}`}>{s.count}</div>
                  <div className="text-[10px] text-slate-400">{s.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── KPIs Tab ── */}
        <TabsContent value="kpis" className="space-y-4">
          {kpiScorecard.map((cat, ci) => (
            <Card key={ci} className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <CircleDot className="w-4 h-4 text-blue-400" />
                  {cat.category}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700">
                      <TableHead className="text-slate-400 text-right w-8"></TableHead>
                      <TableHead className="text-slate-400 text-right">KPI</TableHead>
                      <TableHead className="text-slate-400 text-right">בפועל</TableHead>
                      <TableHead className="text-slate-400 text-right">יעד</TableHead>
                      <TableHead className="text-slate-400 text-right">עמידה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cat.kpis.map((kpi, ki) => (
                      <TableRow key={ki} className="border-slate-700/50 hover:bg-slate-700/20">
                        <TableCell>
                          <div className={`w-2.5 h-2.5 rounded-full ${kpiStatusColor(kpi.status)}`} />
                        </TableCell>
                        <TableCell className="text-white text-sm">{kpi.name}</TableCell>
                        <TableCell className="text-slate-200 font-medium">{kpi.actual}</TableCell>
                        <TableCell className="text-slate-400">{kpi.target}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={kpi.pct} className="h-1.5 w-20" />
                            <span className={`text-xs ${kpi.pct >= 95 ? "text-emerald-400" : kpi.pct >= 80 ? "text-amber-400" : "text-red-400"}`}>
                              {kpi.pct}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}

          {/* KPI summary footer */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-emerald-400">
                  {kpiScorecard.flatMap(c => c.kpis).filter(k => k.status === "green").length}
                </div>
                <div className="text-xs text-slate-400 mt-1">KPIs עומדים ביעד</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-amber-400">
                  {kpiScorecard.flatMap(c => c.kpis).filter(k => k.status === "yellow").length}
                </div>
                <div className="text-xs text-slate-400 mt-1">KPIs קרובים ליעד</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4 text-center">
                <div className="text-3xl font-bold text-red-400">
                  {kpiScorecard.flatMap(c => c.kpis).filter(k => k.status === "red").length}
                </div>
                <div className="text-xs text-slate-400 mt-1">KPIs בסטייה</div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
