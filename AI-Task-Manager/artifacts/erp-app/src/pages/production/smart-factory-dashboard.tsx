import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  Factory, Gauge, Clock, AlertTriangle, CheckCircle, TrendingUp,
  TrendingDown, Wrench, Package, BarChart3, Target, Zap, Shield,
  Activity, AlertCircle, Timer, Layers, RefreshCw, Ban
} from "lucide-react";

/* ── KPI Data ──────────────────────────────────────────────────── */
const kpis = [
  { key: "open_production_orders", label: "הזמנות ייצור פתוחות", value: 24, prev: 22, icon: Layers, color: "text-blue-400", bg: "bg-blue-500/10" },
  { key: "work_orders_in_progress", label: "פקודות עבודה פעילות", value: 14, prev: 12, icon: Activity, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { key: "delayed_jobs", label: "עבודות באיחור", value: 3, prev: 5, icon: Clock, color: "text-red-400", bg: "bg-red-500/10" },
  { key: "station_load_today", label: "עומס תחנות היום", value: 78, prev: 74, unit: "%", icon: Gauge, color: "text-amber-400", bg: "bg-amber-500/10" },
  { key: "material_shortages", label: "חוסרי חומר", value: 2, prev: 4, icon: AlertCircle, color: "text-orange-400", bg: "bg-orange-500/10" },
  { key: "defects_today", label: "ליקויים היום", value: 5, prev: 8, icon: Ban, color: "text-rose-400", bg: "bg-rose-500/10" },
  { key: "rework_jobs", label: "עבודות תיקון", value: 3, prev: 2, icon: RefreshCw, color: "text-purple-400", bg: "bg-purple-500/10" },
  { key: "machine_downtime", label: "השבתות מכונות", value: 45, prev: 60, unit: " דק'", icon: Wrench, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { key: "on_time_completion_rate", label: "אחוז סיום בזמן", value: 91, prev: 88, unit: "%", icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { key: "daily_output", label: "תפוקה יומית", value: 187, prev: 172, icon: Package, color: "text-indigo-400", bg: "bg-indigo-500/10" },
  { key: "expected_completion_today", label: "צפי סיום היום", value: 8, prev: 6, icon: Target, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { key: "bottleneck_station", label: "צוואר בקבוק", value: "ריתוך", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", isText: true },
];

/* ── Station Load ──────────────────────────────────────────────── */
const stations = [
  { name: "חיתוך", load: 85, jobs: 6, operator: "מוחמד ח." },
  { name: "ריתוך", load: 97, jobs: 8, operator: "עוזי כ." },
  { name: "שיוף", load: 62, jobs: 4, operator: "יוסי ד." },
  { name: "אלומיניום", load: 74, jobs: 5, operator: "אבי מ." },
  { name: "זכוכית", load: 68, jobs: 3, operator: "חיים ר." },
  { name: "צבע", load: 55, jobs: 3, operator: "סאלח ע." },
  { name: "הרכבה", load: 88, jobs: 7, operator: "דוד ל." },
  { name: "אריזה", load: 42, jobs: 2, operator: "מרים ש." },
];

/* ── Active Work Orders ────────────────────────────────────────── */
const workOrders = [
  { wo: "WO-1047", product: 'חלון אלומיניום 1.5×1.2 מ\'', project: "פרויקט אלון — רמת גן", station: "חיתוך", operator: "מוחמד ח.", progress: 72, eta: "12:30", status: "in_progress" },
  { wo: "WO-1048", product: "דלת הזזה כפולה 2.4 מ'", project: "מגדל הים — חיפה", station: "ריתוך", operator: "עוזי כ.", progress: 45, eta: "14:15", status: "in_progress" },
  { wo: "WO-1049", product: "ויטרינה מחוסמת 3×2.5 מ'", project: "קניון הזהב — ב\"ש", station: "זכוכית", operator: "חיים ר.", progress: 88, eta: "11:00", status: "in_progress" },
  { wo: "WO-1050", product: "מעקה ברזל מדגם A", project: "שיכון דניה — ת\"א", station: "ריתוך", operator: "עוזי כ.", progress: 15, eta: "16:45", status: "delayed" },
  { wo: "WO-1051", product: "פרגולה אלומיניום 4×3 מ'", project: "וילות הגולן — קצרין", station: "הרכבה", operator: "דוד ל.", progress: 60, eta: "13:00", status: "in_progress" },
  { wo: "WO-1052", product: "תריס חשמלי 1.8 מ'", project: "פרויקט אלון — רמת גן", station: "אלומיניום", operator: "אבי מ.", progress: 30, eta: "15:30", status: "in_progress" },
  { wo: "WO-1053", product: "דלת כניסה מפלדה", project: "מגדל הים — חיפה", station: "צבע", operator: "סאלח ע.", progress: 92, eta: "10:30", status: "in_progress" },
  { wo: "WO-1054", product: "חלון ציר 80×60 ס\"מ", project: "שיכון דניה — ת\"א", station: "שיוף", operator: "יוסי ד.", progress: 5, eta: "17:00", status: "pending" },
];

/* ── Live Alerts ───────────────────────────────────────────────── */
const alerts = [
  { time: "08:47", msg: "תחנת ריתוך — עומס קריטי 97%, שקול העברת עבודות לתחנת חיתוך", severity: "critical" },
  { time: "09:12", msg: "WO-1050 מאחר ב-35 דקות — חומר גלם עוכב בקבלה", severity: "warning" },
  { time: "09:30", msg: "מכונת חיתוך CNC-02 דורשת כיול — תחזוקה מונעת בשעה 13:00", severity: "info" },
  { time: "09:45", msg: "ליקוי איכות — 2 יחידות זכוכית מחוסמת עם שריטות, הועברו לבדיקה חוזרת", severity: "warning" },
  { time: "10:05", msg: "WO-1053 סיום צפוי ב-10:30 — מוכן להעברה לאריזה", severity: "success" },
];

/* ── OEE ───────────────────────────────────────────────────────── */
const oee = { score: 81.4, availability: 93.2, performance: 88.7, quality: 98.5 };

function oeeColor(v: number) {
  if (v >= 85) return "text-emerald-400";
  if (v >= 70) return "text-amber-400";
  return "text-red-400";
}

function oeeBarColor(v: number) {
  if (v >= 85) return "bg-emerald-500";
  if (v >= 70) return "bg-amber-500";
  return "bg-red-500";
}

function stationLoadColor(v: number) {
  if (v >= 90) return "bg-red-500";
  if (v >= 75) return "bg-amber-500";
  return "bg-emerald-500";
}

function statusBadge(s: string) {
  switch (s) {
    case "in_progress": return <Badge className="bg-blue-500/20 text-blue-400 border-0 text-[10px]">בביצוע</Badge>;
    case "delayed": return <Badge className="bg-red-500/20 text-red-400 border-0 text-[10px]">מאחר</Badge>;
    case "pending": return <Badge className="bg-zinc-500/20 text-zinc-400 border-0 text-[10px]">ממתין</Badge>;
    default: return <Badge className="bg-zinc-500/20 text-zinc-400 border-0 text-[10px]">{s}</Badge>;
  }
}

function alertIcon(severity: string) {
  switch (severity) {
    case "critical": return <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />;
    case "warning": return <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
    case "success": return <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
    default: return <Activity className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
  }
}

function alertBorder(severity: string) {
  switch (severity) {
    case "critical": return "border-r-red-500";
    case "warning": return "border-r-amber-500";
    case "success": return "border-r-emerald-500";
    default: return "border-r-blue-500";
  }
}

/* ══════════════════════════════════════════════════════════════════
   Component
   ══════════════════════════════════════════════════════════════════ */
export default function SmartFactoryDashboard() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-5 space-y-5" dir="rtl">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Factory className="h-7 w-7 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">מרכז פיקוד ייצור חכם</h1>
            <p className="text-xs text-zinc-500">טכנו-כל עוזי | Smart Factory Production Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-xs font-semibold tracking-wide">LIVE</Badge>
          <span className="text-[10px] text-zinc-500 font-mono">{new Date().toLocaleDateString("he-IL")} {new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>

      {/* ── 12 KPI Widgets ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-2">
        {kpis.map((k) => {
          const Icon = k.icon;
          const isText = (k as any).isText;
          const diff = isText ? 0 : (k.value as number) - (k.prev ?? 0);
          const up = diff > 0;
          // For "bad" metrics — lower is better
          const badMetrics = ["delayed_jobs", "material_shortages", "defects_today", "rework_jobs", "machine_downtime"];
          const isBad = badMetrics.includes(k.key);
          const trendPositive = isBad ? !up : up;
          return (
            <Card key={k.key} className={`${k.bg} border-zinc-800 shadow-md`}>
              <CardContent className="pt-3 pb-2 px-2 text-center space-y-0.5">
                <Icon className={`h-4 w-4 mx-auto ${k.color} mb-1`} />
                <p className="text-[9px] text-zinc-500 leading-tight truncate">{k.label}</p>
                <p className={`text-lg font-bold font-mono ${k.color}`}>
                  {isText ? k.value : `${k.value}${k.unit || ""}`}
                </p>
                {!isText && (
                  <div className={`flex items-center justify-center gap-0.5 text-[9px] ${trendPositive ? "text-emerald-400" : "text-red-400"}`}>
                    {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                    <span>{Math.abs(diff)}{k.unit || ""}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── OEE Score + Station Load ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* OEE Score */}
        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2 text-zinc-300">
              <Gauge className="h-4 w-4 text-blue-400" /> ציון OEE — יעילות כוללת
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className={`text-5xl font-extrabold font-mono ${oeeColor(oee.score)}`}>
                {oee.score}%
              </div>
              <Badge className={`mt-1 border-0 text-[10px] ${oee.score >= 85 ? "bg-emerald-500/20 text-emerald-400" : oee.score >= 70 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                {oee.score >= 85 ? "מצוין" : oee.score >= 70 ? "טוב — לשפר" : "נמוך — דרוש טיפול"}
              </Badge>
            </div>
            <div className="space-y-3">
              {[
                { label: "זמינות (Availability)", value: oee.availability },
                { label: "ביצועים (Performance)", value: oee.performance },
                { label: "איכות (Quality)", value: oee.quality },
              ].map((m) => (
                <div key={m.label} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-zinc-400">{m.label}</span>
                    <span className={`font-mono font-bold ${oeeColor(m.value)}`}>{m.value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                    <div className={`h-full rounded-full ${oeeBarColor(m.value)} transition-all`} style={{ width: `${m.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Station Load */}
        <Card className="lg:col-span-2 bg-zinc-900/80 border-zinc-800">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm flex items-center gap-2 text-zinc-300">
              <BarChart3 className="h-4 w-4 text-purple-400" /> עומס תחנות עבודה — 8 מרכזי עבודה
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {stations.map((s) => (
                <div key={s.name} className="flex items-center gap-3 bg-zinc-800/50 rounded-lg p-2.5">
                  <div className="min-w-[70px]">
                    <p className="text-xs font-semibold text-zinc-200">{s.name}</p>
                    <p className="text-[9px] text-zinc-500">{s.operator} | {s.jobs} עבודות</p>
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="h-3 rounded-full bg-zinc-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${stationLoadColor(s.load)} transition-all`}
                        style={{ width: `${s.load}%` }}
                      />
                    </div>
                  </div>
                  <span className={`text-sm font-bold font-mono min-w-[40px] text-left ${s.load >= 90 ? "text-red-400" : s.load >= 75 ? "text-amber-400" : "text-emerald-400"}`}>
                    {s.load}%
                  </span>
                  {s.load >= 90 && <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Active Work Orders ─────────────────────────────────── */}
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2 text-zinc-300">
            <Layers className="h-4 w-4 text-indigo-400" /> פקודות עבודה פעילות
            <Badge className="bg-blue-500/20 text-blue-400 border-0 text-[10px] mr-auto">{workOrders.length} פקודות</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 text-[11px] text-right">מס' פקודה</TableHead>
                <TableHead className="text-zinc-400 text-[11px] text-right">מוצר</TableHead>
                <TableHead className="text-zinc-400 text-[11px] text-right">פרויקט</TableHead>
                <TableHead className="text-zinc-400 text-[11px] text-right">תחנה</TableHead>
                <TableHead className="text-zinc-400 text-[11px] text-right">מפעיל</TableHead>
                <TableHead className="text-zinc-400 text-[11px] text-right">התקדמות</TableHead>
                <TableHead className="text-zinc-400 text-[11px] text-right">ETA</TableHead>
                <TableHead className="text-zinc-400 text-[11px] text-right">סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workOrders.map((wo) => (
                <TableRow key={wo.wo} className="border-zinc-800/50 hover:bg-zinc-800/30">
                  <TableCell className="font-mono text-xs text-blue-400 font-semibold">{wo.wo}</TableCell>
                  <TableCell className="text-xs text-zinc-200">{wo.product}</TableCell>
                  <TableCell className="text-xs text-zinc-400">{wo.project}</TableCell>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="border-zinc-700 text-zinc-300 text-[10px]">{wo.station}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">{wo.operator}</TableCell>
                  <TableCell className="min-w-[120px]">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-zinc-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${wo.progress >= 80 ? "bg-emerald-500" : wo.progress >= 40 ? "bg-blue-500" : "bg-amber-500"}`}
                          style={{ width: `${wo.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-zinc-400 min-w-[30px]">{wo.progress}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-zinc-300">{wo.eta}</TableCell>
                  <TableCell>{statusBadge(wo.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Alerts Ticker ──────────────────────────────────────── */}
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm flex items-center gap-2 text-zinc-300">
            <Zap className="h-4 w-4 text-amber-400" /> התראות רצפת ייצור
            <span className="relative flex h-2 w-2 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className={`flex items-start gap-3 bg-zinc-800/40 rounded-lg p-2.5 border-r-2 ${alertBorder(a.severity)}`}>
              {alertIcon(a.severity)}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-zinc-200 leading-relaxed">{a.msg}</p>
              </div>
              <span className="text-[10px] font-mono text-zinc-500 shrink-0">{a.time}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <div className="text-center text-[10px] text-zinc-600 pt-2">
        טכנו-כל עוזי — מערכת ERP ייצור חכם | נתונים מתעדכנים בזמן אמת
      </div>
    </div>
  );
}