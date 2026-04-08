import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Ship, TrendingUp, TrendingDown, Clock, AlertTriangle, CheckCircle,
  Package, Truck, Globe, DollarSign, BarChart3, Search, ArrowLeft,
  ArrowRight, Anchor, Building2, ShieldCheck, Activity, Boxes,
  CircleDot, Container, MapPin, Warehouse
} from "lucide-react";

// ============================================================
// MOCK DATA
// ============================================================
const fmt = (v: number) => new Intl.NumberFormat("he-IL").format(v);
const fmtCurrency = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M ₪` : v >= 1000 ? `${fmt(v)} ₪` : `${v} ₪`;

const kpis = [
  { label: "הזמנות בצינור", value: "47", sub: "+6 השבוע", icon: Package, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "אחוז אספקה בזמן", value: "89.2%", sub: "יעד: 95%", icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "זמן אספקה ממוצע", value: "18 יום", sub: "ירידה של 2 ימים", icon: TrendingDown, color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "שיעור מילוי ספקים", value: "93.4%", sub: "יעד: 95%", icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
  { label: "מחזור מלאי", value: "6.8x", sub: "מעל הממוצע", icon: Boxes, color: "text-purple-600", bg: "bg-purple-50" },
  { label: "אירועי חוסר מלאי", value: "3", sub: "2 קריטיים", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  { label: "עלות הובלה חודשי", value: "₪284K", sub: "ירידה 4.2%", icon: DollarSign, color: "text-indigo-600", bg: "bg-indigo-50" },
  { label: "ציון בריאות שרשרת", value: "82/100", sub: "טוב", icon: Activity, color: "text-teal-600", bg: "bg-teal-50" },
];

const pipelineStages = [
  { stage: "ספק", icon: Building2, color: "bg-blue-500" },
  { stage: "נמל מוצא", icon: Anchor, color: "bg-cyan-500" },
  { stage: "מכס", icon: ShieldCheck, color: "bg-amber-500" },
  { stage: "מחסן", icon: Warehouse, color: "bg-purple-500" },
  { stage: "ייצור", icon: Container, color: "bg-emerald-500" },
  { stage: "לקוח", icon: MapPin, color: "bg-rose-500" },
];

const activeShipments = [
  { id: "SHP-4401", supplier: "Foshan Glass Co.", item: "זכוכית מחוסמת 10mm", stageIdx: 2, eta: "2026-04-14", status: "במכס — בדיקת מסמכים" },
  { id: "SHP-4402", supplier: "Schüco International", item: "פרופיל אלומיניום Premium", stageIdx: 3, eta: "2026-04-11", status: "הגיע למחסן — ממתין לפריקה" },
  { id: "SHP-4403", supplier: "Alumil SA", item: "חלון מסגרת כפולה", stageIdx: 1, eta: "2026-04-22", status: "בנמל פיראוס — ממתין להעמסה" },
  { id: "SHP-4404", supplier: "מפעלי ברזל השרון", item: "קורות פלדה HEB200", stageIdx: 4, eta: "2026-04-09", status: "בייצור — שילוב בהזמנה WO-2458" },
  { id: "SHP-4405", supplier: "Guardian Industries", item: "זכוכית Low-E 6mm", stageIdx: 0, eta: "2026-04-28", status: "אצל הספק — באריזה" },
  { id: "SHP-4406", supplier: "Foshan Glass Co.", item: "זכוכית למינציה 8mm", stageIdx: 5, eta: "2026-04-08", status: "נמסר ללקוח — אמות השקעות" },
  { id: "SHP-4407", supplier: "Technal SAS", item: "מערכת תריסים חשמלית", stageIdx: 1, eta: "2026-04-25", status: "בנמל מרסיי — ממתין לשילוח" },
];

const criticalAlerts = [
  { type: "חוסר חומר", severity: "critical", message: "מלאי זכוכית מחוסמת 8mm ירד מתחת לסף מינימלי — 12 יח' (מינימום: 50)", time: "לפני 25 דקות", action: "הזמנת חירום" },
  { type: "עיכוב משלוח", severity: "high", message: "SHP-4401 עוכב במכס אשדוד — חוסר תעודת מקור. צפי עיכוב 3-5 ימים", time: "לפני שעה", action: "שלח מסמכים" },
  { type: "עצירת איכות", severity: "high", message: "משלוח SHP-4402 — 15% מהפרופילים עם סטייה ממידות. ממתין לבדיקת QC", time: "לפני 2 שעות", action: "בדיקת QC" },
  { type: "קפיצת מחיר", severity: "medium", message: "Foshan Glass העלו מחיר זכוכית Low-E ב-12% — עדכון מ-1 במאי", time: "לפני 4 שעות", action: "משא ומתן" },
  { type: "עיכוב נמל", severity: "medium", message: "עומס בנמל חיפה — זמני פריקה גדלו ב-48 שעות. משפיע על 3 משלוחים", time: "לפני 6 שעות", action: "ניתוב לאשדוד" },
  { type: "ביטול הזמנה", severity: "low", message: "ספק Alumil ביטל חלקית הזמנת מסגרות (40 מ-80 יח') — בעיית ייצור", time: "לפני 8 שעות", action: "ספק חלופי" },
];

const topSuppliers = [
  { name: "Foshan Glass Co.", volume: 2450, pct: 24, country: "סין", trend: "up" },
  { name: "Schüco International", volume: 1820, pct: 18, country: "גרמניה", trend: "stable" },
  { name: "מפעלי ברזל השרון", volume: 1340, pct: 13, country: "ישראל", trend: "up" },
  { name: "Alumil SA", volume: 980, pct: 10, country: "יוון", trend: "down" },
  { name: "Guardian Industries", volume: 750, pct: 8, country: "ארה\"ב", trend: "stable" },
  { name: "Technal SAS", volume: 620, pct: 6, country: "צרפת", trend: "up" },
  { name: "אלו-סטיל בע\"מ", volume: 540, pct: 5, country: "ישראל", trend: "stable" },
  { name: "Reynaers Aluminium", volume: 480, pct: 5, country: "בלגיה", trend: "up" },
  { name: "YKK AP", volume: 350, pct: 4, country: "יפן", trend: "stable" },
  { name: "Pilkington Glass", volume: 310, pct: 3, country: "בריטניה", trend: "down" },
];

const todayReceiving = [
  { time: "08:00", supplier: "מפעלי ברזל השרון", items: "קורות HEB200 x40", dock: "רציף 2", status: "התקבל" },
  { time: "10:30", supplier: "Schüco International", items: "פרופיל Premium x120", dock: "רציף 1", status: "ממתין" },
  { time: "13:00", supplier: "אלו-סטיל בע\"מ", items: "אביזרי אלומיניום x300", dock: "רציף 3", status: "צפוי" },
  { time: "15:00", supplier: "Guardian Industries", items: "זכוכית Low-E x80", dock: "רציף 1", status: "צפוי" },
];

const bottlenecks = [
  { area: "מכס אשדוד", impact: "גבוה", detail: "3 משלוחים בהמתנה, עיכוב ממוצע 4 ימים", pctDelay: 72 },
  { area: "בדיקת איכות", impact: "בינוני", detail: "צוואר בקבוק ב-QC — 6 פריטים ממתינים", pctDelay: 55 },
  { area: "קיבולת מחסן", impact: "בינוני", detail: "תפוסת מחסן 87% — צפי מלא עד יום חמישי", pctDelay: 44 },
];

const shipmentsTable = [
  { id: "SHP-4401", supplier: "Foshan Glass Co.", origin: "שנג'ן, סין", eta: "2026-04-14", status: "במכס", items: 200, mode: "ימי" },
  { id: "SHP-4402", supplier: "Schüco International", origin: "בילפלד, גרמניה", eta: "2026-04-11", status: "במחסן", items: 120, mode: "ימי" },
  { id: "SHP-4403", supplier: "Alumil SA", origin: "אתונה, יוון", eta: "2026-04-22", status: "בנמל", items: 80, mode: "ימי" },
  { id: "SHP-4404", supplier: "מפעלי ברזל השרון", origin: "נתניה, ישראל", eta: "2026-04-09", status: "התקבל", items: 40, mode: "יבשתי" },
  { id: "SHP-4405", supplier: "Guardian Industries", origin: "מישיגן, ארה\"ב", eta: "2026-04-28", status: "הוזמן", items: 150, mode: "ימי" },
  { id: "SHP-4406", supplier: "Foshan Glass Co.", origin: "שנג'ן, סין", eta: "2026-04-08", status: "נמסר", items: 180, mode: "ימי" },
  { id: "SHP-4407", supplier: "Technal SAS", origin: "מרסיי, צרפת", eta: "2026-04-25", status: "בנמל", items: 60, mode: "ימי" },
  { id: "SHP-4408", supplier: "Reynaers Aluminium", origin: "אנטוורפן, בלגיה", eta: "2026-04-18", status: "נשלח", items: 95, mode: "ימי" },
  { id: "SHP-4409", supplier: "YKK AP", origin: "טוקיו, יפן", eta: "2026-05-02", status: "הוזמן", items: 45, mode: "אווירי" },
  { id: "SHP-4410", supplier: "Pilkington Glass", origin: "לונדון, בריטניה", eta: "2026-04-20", status: "נשלח", items: 110, mode: "ימי" },
  { id: "SHP-4411", supplier: "אלו-סטיל בע\"מ", origin: "חיפה, ישראל", eta: "2026-04-10", status: "במשלוח", items: 300, mode: "יבשתי" },
  { id: "SHP-4412", supplier: "Foshan Glass Co.", origin: "שנג'ן, סין", eta: "2026-04-30", status: "הוזמן", items: 220, mode: "ימי" },
];

const supplierPerformance = [
  { name: "Foshan Glass Co.", otd: 82, quality: 88, fillRate: 91, leadTime: 22, trend: "up", risk: "בינוני" },
  { name: "Schüco International", otd: 95, quality: 97, fillRate: 98, leadTime: 14, trend: "stable", risk: "נמוך" },
  { name: "מפעלי ברזל השרון", otd: 91, quality: 85, fillRate: 94, leadTime: 4, trend: "up", risk: "נמוך" },
  { name: "Alumil SA", otd: 78, quality: 82, fillRate: 87, leadTime: 18, trend: "down", risk: "גבוה" },
  { name: "Guardian Industries", otd: 88, quality: 94, fillRate: 92, leadTime: 25, trend: "stable", risk: "בינוני" },
  { name: "Technal SAS", otd: 90, quality: 93, fillRate: 95, leadTime: 16, trend: "up", risk: "נמוך" },
  { name: "Reynaers Aluminium", otd: 93, quality: 95, fillRate: 96, leadTime: 15, trend: "up", risk: "נמוך" },
  { name: "YKK AP", otd: 96, quality: 98, fillRate: 99, leadTime: 28, trend: "stable", risk: "נמוך" },
];

const costBreakdown = [
  { category: "הובלה ימית", thisMonth: 142000, lastMonth: 155000, pct: 50 },
  { category: "מכס ומיסים", thisMonth: 68000, lastMonth: 72000, pct: 24 },
  { category: "אחסון ומחסנים", thisMonth: 38000, lastMonth: 35000, pct: 13 },
  { category: "הובלה יבשתית", thisMonth: 22000, lastMonth: 20000, pct: 8 },
  { category: "ביטוח מטענים", thisMonth: 9000, lastMonth: 9500, pct: 3 },
  { category: "תפעול ומסמכים", thisMonth: 5000, lastMonth: 5500, pct: 2 },
];

const monthlyTrend = [
  { month: "ינואר", total: 265000 },
  { month: "פברואר", total: 278000 },
  { month: "מרץ", total: 296000 },
  { month: "אפריל", total: 284000 },
];

// ============================================================
// HELPERS
// ============================================================
const severityBadge = (s: string) => {
  const map: Record<string, string> = { critical: "bg-red-600 text-white", high: "bg-orange-500 text-white", medium: "bg-amber-400 text-black", low: "bg-slate-300 text-black" };
  const labels: Record<string, string> = { critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך" };
  return <Badge className={`text-[10px] px-1.5 py-0 ${map[s] || ""}`}>{labels[s]}</Badge>;
};

const statusBadge = (s: string) => {
  const map: Record<string, string> = {
    "הוזמן": "bg-slate-100 text-slate-700", "נשלח": "bg-blue-100 text-blue-700",
    "בנמל": "bg-cyan-100 text-cyan-700", "במכס": "bg-amber-100 text-amber-700",
    "במשלוח": "bg-indigo-100 text-indigo-700", "במחסן": "bg-purple-100 text-purple-700",
    "התקבל": "bg-emerald-100 text-emerald-700", "נמסר": "bg-green-100 text-green-700",
  };
  return <Badge className={`text-[10px] px-1.5 py-0 ${map[s] || "bg-gray-100"}`}>{s}</Badge>;
};

const trendIcon = (t: string) =>
  t === "up" ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> :
  t === "down" ? <TrendingDown className="h-3.5 w-3.5 text-red-500" /> :
  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />;

const riskBadge = (r: string) => {
  const map: Record<string, string> = { "נמוך": "bg-green-100 text-green-700", "בינוני": "bg-amber-100 text-amber-700", "גבוה": "bg-red-100 text-red-700" };
  return <Badge className={`text-[10px] px-1.5 py-0 ${map[r] || ""}`}>{r}</Badge>;
};

// ============================================================
// COMPONENT
// ============================================================
export default function SupplyChainCommandCenter() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Ship className="h-7 w-7 text-primary" /> מרכז פיקוד שרשרת אספקה
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">ספקים | משלוחים | מכס | מלאי | עלויות — טכנו-כל עוזי</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-2.5 top-2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="חיפוש משלוח, ספק..." className="pr-8 w-64 h-8 text-sm" />
          </div>
          <Button variant="outline" size="sm">ייצוא דו״ח</Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-8 gap-2">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg}/40 border-0 shadow-sm`}>
              <CardContent className="pt-2 pb-1.5 text-center px-1">
                <Icon className={`h-3.5 w-3.5 mx-auto ${kpi.color} mb-0.5`} />
                <p className="text-[8px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-sm font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                <p className="text-[7px] text-muted-foreground">{kpi.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Live Supply Chain Map */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Globe className="h-4 w-4" /> מפת שרשרת אספקה חיה</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Pipeline stages header */}
          <div className="flex items-center justify-between px-2">
            {pipelineStages.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={i} className="flex items-center gap-1">
                  <div className={`${s.color} rounded-full p-1.5`}>
                    <Icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-[10px] font-medium">{s.stage}</span>
                  {i < pipelineStages.length - 1 && (
                    <ArrowLeft className="h-3 w-3 text-muted-foreground mx-2" />
                  )}
                </div>
              );
            })}
          </div>
          {/* Active shipments on pipeline */}
          <div className="space-y-1.5">
            {activeShipments.map((sh) => (
              <div key={sh.id} className="flex items-center gap-2 bg-muted/30 rounded-md px-3 py-1.5 text-xs">
                <Badge variant="outline" className="text-[10px] font-mono shrink-0">{sh.id}</Badge>
                <span className="font-medium w-36 truncate">{sh.supplier}</span>
                <span className="text-muted-foreground w-44 truncate">{sh.item}</span>
                {/* Stage indicator */}
                <div className="flex items-center gap-0.5 flex-1">
                  {pipelineStages.map((s, idx) => (
                    <div key={idx} className="flex items-center gap-0.5">
                      <div className={`h-2 w-2 rounded-full ${idx <= sh.stageIdx ? pipelineStages[sh.stageIdx].color : "bg-slate-200"} ${idx === sh.stageIdx ? "ring-2 ring-offset-1 ring-blue-400" : ""}`} />
                      {idx < pipelineStages.length - 1 && <div className={`h-0.5 w-4 ${idx < sh.stageIdx ? pipelineStages[sh.stageIdx].color : "bg-slate-200"}`} />}
                    </div>
                  ))}
                </div>
                <span className="text-muted-foreground w-28 truncate">{sh.status}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">ETA: {sh.eta}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Critical Alerts */}
      <Card className="border-red-200 bg-red-50/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-4 w-4" /> התראות קריטיות ({criticalAlerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            {criticalAlerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-3 bg-white/70 rounded-md px-3 py-2 text-xs border border-red-100">
                {severityBadge(alert.severity)}
                <span className="font-semibold w-24 shrink-0">{alert.type}</span>
                <span className="text-muted-foreground flex-1">{alert.message}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{alert.time}</span>
                <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 shrink-0">{alert.action}</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="overview" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> סקירה</TabsTrigger>
          <TabsTrigger value="shipments" className="text-xs gap-1"><Truck className="h-3.5 w-3.5" /> משלוחים</TabsTrigger>
          <TabsTrigger value="suppliers" className="text-xs gap-1"><Building2 className="h-3.5 w-3.5" /> ביצועי ספקים</TabsTrigger>
          <TabsTrigger value="costs" className="text-xs gap-1"><DollarSign className="h-3.5 w-3.5" /> עלויות</TabsTrigger>
        </TabsList>

        {/* === Overview Tab === */}
        <TabsContent value="overview" className="space-y-4 mt-3">
          <div className="grid grid-cols-3 gap-4">
            {/* Top 10 Suppliers */}
            <Card className="col-span-1">
              <CardHeader className="pb-2"><CardTitle className="text-xs">טופ 10 ספקים לפי נפח</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {topSuppliers.map((s, i) => (
                  <div key={i} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1">
                        {trendIcon(s.trend)}
                        <span className="font-medium truncate max-w-[140px]">{s.name}</span>
                      </span>
                      <span className="text-muted-foreground">{fmt(s.volume)} יח' ({s.pct}%)</span>
                    </div>
                    <Progress value={s.pct * 4} className="h-1.5" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Bottlenecks + Receiving */}
            <div className="col-span-2 space-y-4">
              {/* Bottlenecks */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs">צווארי בקבוק מרכזיים</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {bottlenecks.map((b, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs">
                        <Badge className={`text-[10px] px-1.5 py-0 ${b.impact === "גבוה" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{b.impact}</Badge>
                        <span className="font-semibold w-28">{b.area}</span>
                        <span className="text-muted-foreground flex-1">{b.detail}</span>
                        <div className="w-24"><Progress value={b.pctDelay} className="h-1.5" /></div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Today's Receiving Schedule */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-xs">לוח קבלות היום — {new Date().toLocaleDateString("he-IL")}</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-1 text-[10px] font-semibold text-muted-foreground border-b pb-1 mb-1">
                    <span>שעה</span><span>ספק</span><span>פריטים</span><span>רציף / סטטוס</span>
                  </div>
                  {todayReceiving.map((r, i) => (
                    <div key={i} className="grid grid-cols-4 gap-1 text-xs py-1 border-b border-dashed last:border-0">
                      <span className="font-mono">{r.time}</span>
                      <span className="font-medium">{r.supplier}</span>
                      <span className="text-muted-foreground">{r.items}</span>
                      <span className="flex items-center gap-1">
                        {r.dock}
                        <Badge className={`text-[9px] px-1 py-0 ${r.status === "התקבל" ? "bg-green-100 text-green-700" : r.status === "ממתין" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{r.status}</Badge>
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* === Shipments Tab === */}
        <TabsContent value="shipments" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs">משלוחים פעילים ({shipmentsTable.length})</CardTitle>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <CircleDot className="h-3 w-3 text-amber-500" /> במכס: 1
                  <CircleDot className="h-3 w-3 text-blue-500" /> בדרך: 4
                  <CircleDot className="h-3 w-3 text-green-500" /> התקבל: 2
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-[10px] text-muted-foreground">
                      <th className="text-right py-1.5 font-medium">מס' משלוח</th>
                      <th className="text-right py-1.5 font-medium">ספק</th>
                      <th className="text-right py-1.5 font-medium">מוצא</th>
                      <th className="text-right py-1.5 font-medium">אמצעי</th>
                      <th className="text-right py-1.5 font-medium">פריטים</th>
                      <th className="text-right py-1.5 font-medium">ETA</th>
                      <th className="text-right py-1.5 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipmentsTable.map((s, i) => (
                      <tr key={i} className="border-b border-dashed hover:bg-muted/40 transition-colors">
                        <td className="py-1.5 font-mono font-medium">{s.id}</td>
                        <td className="py-1.5">{s.supplier}</td>
                        <td className="py-1.5 text-muted-foreground">{s.origin}</td>
                        <td className="py-1.5">
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{s.mode}</Badge>
                        </td>
                        <td className="py-1.5 font-mono">{s.items}</td>
                        <td className="py-1.5 font-mono">{s.eta}</td>
                        <td className="py-1.5">{statusBadge(s.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Supplier Performance Tab === */}
        <TabsContent value="suppliers" className="mt-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs">ביצועי ספקים — {supplierPerformance.length} ספקים מרכזיים</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-[10px] text-muted-foreground">
                      <th className="text-right py-1.5 font-medium">ספק</th>
                      <th className="text-right py-1.5 font-medium">אספקה בזמן %</th>
                      <th className="text-right py-1.5 font-medium">איכות %</th>
                      <th className="text-right py-1.5 font-medium">שיעור מילוי %</th>
                      <th className="text-right py-1.5 font-medium">זמן אספקה (ימים)</th>
                      <th className="text-right py-1.5 font-medium">מגמה</th>
                      <th className="text-right py-1.5 font-medium">סיכון</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierPerformance.map((s, i) => (
                      <tr key={i} className="border-b border-dashed hover:bg-muted/40 transition-colors">
                        <td className="py-2 font-medium">{s.name}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <Progress value={s.otd} className="h-1.5 w-16" />
                            <span className={`font-mono ${s.otd >= 90 ? "text-emerald-600" : s.otd >= 80 ? "text-amber-600" : "text-red-600"}`}>{s.otd}%</span>
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <Progress value={s.quality} className="h-1.5 w-16" />
                            <span className={`font-mono ${s.quality >= 90 ? "text-emerald-600" : "text-amber-600"}`}>{s.quality}%</span>
                          </div>
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <Progress value={s.fillRate} className="h-1.5 w-16" />
                            <span className="font-mono">{s.fillRate}%</span>
                          </div>
                        </td>
                        <td className="py-2 font-mono">{s.leadTime}</td>
                        <td className="py-2">{trendIcon(s.trend)}</td>
                        <td className="py-2">{riskBadge(s.risk)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === Costs Tab === */}
        <TabsContent value="costs" className="space-y-4 mt-3">
          <div className="grid grid-cols-2 gap-4">
            {/* Cost Breakdown */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs">פירוט עלויות — אפריל 2026</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {costBreakdown.map((c, i) => {
                  const change = ((c.thisMonth - c.lastMonth) / c.lastMonth * 100).toFixed(1);
                  const isDown = c.thisMonth < c.lastMonth;
                  return (
                    <div key={i} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-medium">{c.category} ({c.pct}%)</span>
                        <span className="flex items-center gap-1.5">
                          <span className="font-mono">{fmtCurrency(c.thisMonth)}</span>
                          <span className={`text-[10px] flex items-center gap-0.5 ${isDown ? "text-emerald-600" : "text-red-600"}`}>
                            {isDown ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                            {change}%
                          </span>
                        </span>
                      </div>
                      <Progress value={c.pct * 2} className="h-1.5" />
                    </div>
                  );
                })}
                <div className="flex items-center justify-between pt-2 border-t text-xs font-bold">
                  <span>סה״כ</span>
                  <span className="font-mono">{fmtCurrency(costBreakdown.reduce((s, c) => s + c.thisMonth, 0))}</span>
                </div>
              </CardContent>
            </Card>

            {/* Monthly Trend */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-xs">מגמת עלויות חודשית</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {monthlyTrend.map((m, i) => {
                    const maxVal = Math.max(...monthlyTrend.map(t => t.total));
                    const barPct = (m.total / maxVal) * 100;
                    const isLatest = i === monthlyTrend.length - 1;
                    return (
                      <div key={i} className="flex items-center gap-3 text-xs">
                        <span className="w-14 font-medium">{m.month}</span>
                        <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                          <div
                            className={`h-full rounded-full flex items-center justify-end px-2 text-[10px] font-mono text-white ${isLatest ? "bg-blue-500" : "bg-slate-400"}`}
                            style={{ width: `${barPct}%` }}
                          >
                            {fmtCurrency(m.total)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 p-3 bg-muted/40 rounded-md text-xs space-y-1">
                  <div className="flex justify-between"><span>ממוצע חודשי</span><span className="font-mono">{fmtCurrency(Math.round(monthlyTrend.reduce((s, m) => s + m.total, 0) / monthlyTrend.length))}</span></div>
                  <div className="flex justify-between"><span>סה״כ Q1 + אפריל</span><span className="font-mono">{fmtCurrency(monthlyTrend.reduce((s, m) => s + m.total, 0))}</span></div>
                  <div className="flex justify-between"><span>שינוי מרץ → אפריל</span><span className="font-mono text-emerald-600">-4.1%</span></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cost vs Last Month detail */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-xs">השוואת עלויות — החודש מול חודש קודם</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-[10px] text-muted-foreground">
                      <th className="text-right py-1.5 font-medium">קטגוריה</th>
                      <th className="text-right py-1.5 font-medium">אפריל 2026</th>
                      <th className="text-right py-1.5 font-medium">מרץ 2026</th>
                      <th className="text-right py-1.5 font-medium">שינוי</th>
                      <th className="text-right py-1.5 font-medium">חלק מהסה״כ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costBreakdown.map((c, i) => {
                      const change = ((c.thisMonth - c.lastMonth) / c.lastMonth * 100).toFixed(1);
                      const isDown = c.thisMonth < c.lastMonth;
                      return (
                        <tr key={i} className="border-b border-dashed">
                          <td className="py-1.5 font-medium">{c.category}</td>
                          <td className="py-1.5 font-mono">{fmtCurrency(c.thisMonth)}</td>
                          <td className="py-1.5 font-mono text-muted-foreground">{fmtCurrency(c.lastMonth)}</td>
                          <td className={`py-1.5 font-mono ${isDown ? "text-emerald-600" : "text-red-600"}`}>{isDown ? "" : "+"}{change}%</td>
                          <td className="py-1.5">
                            <div className="flex items-center gap-2">
                              <Progress value={c.pct * 2} className="h-1.5 w-16" />
                              <span className="text-muted-foreground">{c.pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-bold">
                      <td className="py-1.5">סה״כ</td>
                      <td className="py-1.5 font-mono">{fmtCurrency(costBreakdown.reduce((s, c) => s + c.thisMonth, 0))}</td>
                      <td className="py-1.5 font-mono text-muted-foreground">{fmtCurrency(costBreakdown.reduce((s, c) => s + c.lastMonth, 0))}</td>
                      <td className="py-1.5 font-mono text-emerald-600">-4.4%</td>
                      <td className="py-1.5">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
