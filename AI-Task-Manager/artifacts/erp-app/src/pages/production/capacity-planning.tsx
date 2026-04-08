import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, Clock, Gauge, AlertTriangle, TrendingUp,
  Factory, Zap, CalendarDays, ArrowRight, ShieldAlert,
  CheckCircle2, XCircle, Lightbulb, Activity,
} from "lucide-react";

/* ── Work Centers ── */
const centers = [
  { id: "cut", name: "חיתוך", available: 48, planned: 42, ops: ["רועי כהן", "אלי ביטון"], shift: 2 },
  { id: "weld", name: "ריתוך", available: 48, planned: 51, ops: ["יוסי מזרחי"], shift: 2 },
  { id: "grind", name: "שיוף", available: 40, planned: 28, ops: ["דני אברהם"], shift: 1 },
  { id: "alu", name: "אלומיניום", available: 48, planned: 46, ops: ["שרה לוי", "אלי ביטון"], shift: 2 },
  { id: "glass", name: "זכוכית", available: 40, planned: 39, ops: ["אמיר לוי"], shift: 1 },
  { id: "paint", name: "צבע", available: 40, planned: 44, ops: ["מוחמד חסן"], shift: 1 },
  { id: "assy", name: "הרכבה", available: 56, planned: 52, ops: ["נועה פרידמן", "רועי כהן", "דני אברהם"], shift: 2 },
  { id: "pack", name: "אריזה", available: 40, planned: 22, ops: ["שלומי דהן"], shift: 1 },
];

const util = (c: typeof centers[0]) => Math.round((c.planned / c.available) * 100);
const totalAvail = centers.reduce((s, c) => s + c.available, 0);
const totalPlanned = centers.reduce((s, c) => s + c.planned, 0);
const overloaded = centers.filter(c => util(c) > 100);
const bottleneck = [...centers].sort((a, b) => util(b) - util(a))[0];
const avgUtil = Math.round(centers.reduce((s, c) => s + util(c), 0) / centers.length);

/* ── Weekly Grid Data (Sun-Thu) ── */
const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי"];
const weeklyGrid: Record<string, number[]> = {
  "חיתוך":    [8.5, 9.0, 8.0, 8.5, 8.0],
  "ריתוך":    [10.5, 10.0, 11.0, 10.0, 9.5],
  "שיוף":     [6.0, 5.5, 5.0, 6.0, 5.5],
  "אלומיניום": [9.5, 9.0, 9.5, 9.0, 9.0],
  "זכוכית":   [8.0, 7.5, 8.0, 8.0, 7.5],
  "צבע":      [9.0, 8.5, 9.5, 8.5, 8.5],
  "הרכבה":    [10.5, 10.0, 11.0, 10.5, 10.0],
  "אריזה":    [4.5, 4.0, 5.0, 4.5, 4.0],
};
const dailyCap: Record<string, number> = {
  "חיתוך": 9.6, "ריתוך": 9.6, "שיוף": 8.0, "אלומיניום": 9.6,
  "זכוכית": 8.0, "צבע": 8.0, "הרכבה": 11.2, "אריזה": 8.0,
};

/* ── Overload Resolutions ── */
const resolutions = [
  { center: "ריתוך", overflow: 3, suggestion: "הוספת משמרת שלישית חלקית (4 שעות) ביום שלישי ורביעי", impact: "עלות נוספת: ~1,200 \u20AA, חיסכון עיכוב: 2 ימים", priority: "high" },
  { center: "ריתוך", overflow: 3, suggestion: "העברת 2 הזמנות מעקות לקבלן-משנה (רתכי חוץ)", impact: "עלות קבלן: ~3,500 \u20AA, שחרור 6 שעות שבועיות", priority: "medium" },
  { center: "צבע", overflow: 4, suggestion: "הקדמת צביעה ליום ראשון במשמרת בוקר מוקדמת (05:00)", impact: "תוספת שעות: 4, ללא עלות נוספת (שעות רגילות)", priority: "high" },
  { center: "צבע", overflow: 4, suggestion: "ביצוע חלק מהצביעה במתקן אבקה חיצוני", impact: "עלות: ~2,800 \u20AA, שחרור 8 שעות שבועיות", priority: "low" },
  { center: "הרכבה", overflow: 2, suggestion: "שיבוץ דני אברהם (שיוף) לסיוע בהרכבה ביום רביעי", impact: "ניצול שיוף: 70% → 55%, הרכבה: 107% → 93%", priority: "high" },
];

/* ── 4-Week Forecast ── */
const forecast = [
  { week: "שבוע נוכחי (14-18/04)", utilPct: avgUtil, orders: 28, risk: "בינוני", notes: "עומס יתר בריתוך וצבע" },
  { week: "שבוע הבא (21-25/04)", utilPct: 82, orders: 32, risk: "גבוה", notes: "כניסת פרויקט הרצליה + הזמנת שופרסל" },
  { week: "שבוע 3 (28/04-02/05)", utilPct: 71, orders: 24, risk: "נמוך", notes: "יום העצמאות - 4 ימי עבודה" },
  { week: "שבוע 4 (05-09/05)", utilPct: 88, orders: 35, risk: "גבוה", notes: "עומס הרכבה + התקנות שטח" },
];

const riskColor: Record<string, string> = {
  "נמוך": "bg-green-500/20 text-green-400 border-green-500/30",
  "בינוני": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "גבוה": "bg-red-500/20 text-red-400 border-red-500/30",
};
const priColor: Record<string, string> = {
  high: "bg-red-500/20 text-red-400", medium: "bg-yellow-500/20 text-yellow-400", low: "bg-blue-500/20 text-blue-400",
};

const utilColor = (pct: number) =>
  pct > 100 ? "text-red-400" : pct >= 85 ? "text-yellow-400" : "text-emerald-400";
const barColor = (pct: number) =>
  pct > 100 ? "bg-red-500" : pct >= 85 ? "bg-yellow-500" : "bg-emerald-500";

/* ═══════════════ Component ═══════════════ */
export default function CapacityPlanning() {
  const [tab, setTab] = useState("weekly");

  const kpis = [
    { label: "קיבולת שבועית כוללת", value: `${totalAvail} שעות`, icon: Clock, color: "text-blue-400" },
    { label: "ניצול כולל", value: `${Math.round((totalPlanned / totalAvail) * 100)}%`, icon: Gauge, color: "text-emerald-400" },
    { label: "שעות פנויות", value: `${totalAvail - totalPlanned > 0 ? totalAvail - totalPlanned : 0}`, icon: CalendarDays, color: "text-cyan-400" },
    { label: "תחנות בעומס יתר", value: `${overloaded.length}`, icon: AlertTriangle, color: overloaded.length > 0 ? "text-red-400" : "text-emerald-400" },
    { label: "צוואר בקבוק", value: bottleneck.name, icon: ShieldAlert, color: "text-orange-400" },
    { label: "ניצול ממוצע", value: `${avgUtil}%`, icon: TrendingUp, color: avgUtil > 90 ? "text-red-400" : "text-emerald-400" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6 bg-gradient-to-br from-[#0a0e1a] to-[#101829] min-h-screen text-white">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30">
          <BarChart3 className="w-6 h-6 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">תכנון קיבולת</h1>
          <p className="text-sm text-slate-400">טכנו-כל עוזי | שבוע 14-18 אפריל 2026</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-[#0d1527]/80 border-slate-700/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <k.icon className={`w-4 h-4 ${k.color}`} />
                <span className="text-[11px] text-slate-400">{k.label}</span>
              </div>
              <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Work Centers Overview */}
      <Card className="bg-[#0d1527]/80 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Factory className="w-4 h-4 text-indigo-400" />
            תחנות עבודה - סקירת קיבולת שבועית
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {centers.map(c => {
              const u = util(c);
              const overflow = c.planned - c.available;
              return (
                <div key={c.id} className={`rounded-lg border p-3 ${u > 100 ? "bg-red-900/20 border-red-700/40" : u >= 85 ? "bg-yellow-900/15 border-yellow-700/30" : "bg-slate-800/40 border-slate-700/40"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm">{c.name}</span>
                    <Badge variant="outline" className={`text-[10px] ${u > 100 ? "text-red-400 border-red-500/40" : u >= 85 ? "text-yellow-400 border-yellow-500/40" : "text-emerald-400 border-emerald-500/40"}`}>
                      {u > 100 ? "עומס יתר" : u >= 85 ? "עומס גבוה" : "תקין"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                    <span>פנוי: {c.available} שעות</span>
                    <span>מתוכנן: {c.planned} שעות</span>
                  </div>
                  <Progress value={Math.min(u, 100)} className={`h-2 ${barColor(u)}`} />
                  <div className="flex items-center justify-between mt-1.5">
                    <span className={`text-sm font-bold ${utilColor(u)}`}>{u}%</span>
                    {overflow > 0 && (
                      <span className="text-[10px] text-red-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> +{overflow} שעות חריגה
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-800/60 border border-slate-700/50">
          <TabsTrigger value="weekly" className="data-[state=active]:bg-indigo-600/40 text-xs">שבועי</TabsTrigger>
          <TabsTrigger value="station" className="data-[state=active]:bg-indigo-600/40 text-xs">לפי תחנה</TabsTrigger>
          <TabsTrigger value="overload" className="data-[state=active]:bg-indigo-600/40 text-xs">עומס יתר</TabsTrigger>
          <TabsTrigger value="forecast" className="data-[state=active]:bg-indigo-600/40 text-xs">תחזית</TabsTrigger>
        </TabsList>

        {/* ── Weekly Grid ── */}
        <TabsContent value="weekly">
          <Card className="bg-[#0d1527]/80 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-cyan-400" />
                מטריצת קיבולת שבועית (שעות מתוכננות / קיבולת יומית)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700/50">
                      <TableHead className="text-slate-300 text-xs text-right">תחנה</TableHead>
                      {days.map(d => <TableHead key={d} className="text-slate-300 text-xs text-center">{d}</TableHead>)}
                      <TableHead className="text-slate-300 text-xs text-center">סה״כ שבועי</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(weeklyGrid).map(([name, hrs]) => {
                      const cap = dailyCap[name];
                      const total = hrs.reduce((s, h) => s + h, 0);
                      const weekCap = cap * 5;
                      const weekPct = Math.round((total / weekCap) * 100);
                      return (
                        <TableRow key={name} className="border-slate-700/30 hover:bg-slate-800/30">
                          <TableCell className="font-medium text-sm">{name}</TableCell>
                          {hrs.map((h, i) => {
                            const pct = Math.round((h / cap) * 100);
                            return (
                              <TableCell key={i} className="text-center">
                                <div className={`text-xs font-mono ${utilColor(pct)}`}>{h}/{cap}</div>
                                <div className="text-[10px] text-slate-500">{pct}%</div>
                              </TableCell>
                            );
                          })}
                          <TableCell className="text-center">
                            <span className={`text-sm font-bold ${utilColor(weekPct)}`}>{weekPct}%</span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Station Detail ── */}
        <TabsContent value="station">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {centers.map(c => {
              const u = util(c);
              return (
                <Card key={c.id} className="bg-[#0d1527]/80 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <Zap className={`w-4 h-4 ${utilColor(u)}`} />
                        {c.name}
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${u > 100 ? "text-red-400 border-red-500/40" : "text-emerald-400 border-emerald-500/40"}`}>
                        {u}% ניצול
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-800/50 rounded p-2">
                        <div className="text-[10px] text-slate-400">קיבולת</div>
                        <div className="text-sm font-bold text-blue-400">{c.available} שעות</div>
                      </div>
                      <div className="bg-slate-800/50 rounded p-2">
                        <div className="text-[10px] text-slate-400">מתוכנן</div>
                        <div className={`text-sm font-bold ${utilColor(u)}`}>{c.planned} שעות</div>
                      </div>
                      <div className="bg-slate-800/50 rounded p-2">
                        <div className="text-[10px] text-slate-400">משמרות</div>
                        <div className="text-sm font-bold text-cyan-400">{c.shift}</div>
                      </div>
                    </div>
                    <Progress value={Math.min(u, 100)} className={`h-2.5 ${barColor(u)}`} />
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-slate-400">מפעילים:</span>
                      {c.ops.map(op => (
                        <Badge key={op} className="bg-slate-700/50 text-slate-300 text-[10px]">{op}</Badge>
                      ))}
                    </div>
                    {u > 100 && (
                      <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 rounded p-2">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        חריגה של {c.planned - c.available} שעות - נדרש פתרון
                      </div>
                    )}
                    {u >= 85 && u <= 100 && (
                      <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-900/15 rounded p-2">
                        <Activity className="w-3.5 h-3.5" />
                        ניצול גבוה - לעקוב מקרוב
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Overload Resolutions ── */}
        <TabsContent value="overload">
          <Card className="bg-[#0d1527]/80 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                תחנות בעומס יתר - הצעות לפתרון
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Overloaded stations summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {overloaded.length > 0 ? overloaded.map(c => {
                  const u = util(c);
                  return (
                    <div key={c.id} className="bg-red-900/20 border border-red-700/40 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-sm">{c.name}</span>
                        <span className="text-red-400 font-bold text-lg">{u}%</span>
                      </div>
                      <div className="text-xs text-slate-400">חריגה: +{c.planned - c.available} שעות</div>
                      <Progress value={100} className="h-1.5 mt-2 bg-red-500" />
                    </div>
                  );
                }) : (
                  <div className="col-span-3 text-center text-slate-400 py-6">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                    אין תחנות בעומס יתר השבוע
                  </div>
                )}
              </div>

              {/* Resolution suggestions */}
              {resolutions.length > 0 && (
                <div className="space-y-3 mt-4">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-yellow-400" />
                    הצעות לפתרון
                  </h3>
                  {resolutions.map((r, i) => (
                    <div key={i} className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-[10px] text-slate-300 border-slate-500/40">{r.center}</Badge>
                        <Badge className={`text-[10px] ${priColor[r.priority]}`}>
                          {r.priority === "high" ? "עדיפות גבוהה" : r.priority === "medium" ? "עדיפות בינונית" : "עדיפות נמוכה"}
                        </Badge>
                      </div>
                      <p className="text-sm text-slate-200 mb-1">{r.suggestion}</p>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <ArrowRight className="w-3 h-3" />
                        {r.impact}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Forecast ── */}
        <TabsContent value="forecast">
          <Card className="bg-[#0d1527]/80 border-slate-700/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-400" />
                תחזית קיבולת - 4 שבועות קדימה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {forecast.map((f, i) => (
                  <div key={i} className="bg-slate-800/40 border border-slate-700/40 rounded-lg p-4 space-y-3">
                    <div className="text-sm font-semibold text-slate-200">{f.week}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-3xl font-bold">
                        <span className={utilColor(f.utilPct)}>{f.utilPct}%</span>
                      </span>
                      <Badge variant="outline" className={`text-[10px] ${riskColor[f.risk]}`}>
                        סיכון {f.risk}
                      </Badge>
                    </div>
                    <Progress value={Math.min(f.utilPct, 100)} className={`h-2 ${barColor(f.utilPct)}`} />
                    <div className="text-xs text-slate-400 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>הזמנות:</span>
                        <span className="text-slate-200 font-medium">{f.orders}</span>
                      </div>
                      <div className="flex items-start gap-1 mt-1">
                        <Lightbulb className="w-3 h-3 text-yellow-400 mt-0.5 shrink-0" />
                        <span>{f.notes}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Forecast summary table */}
              <div className="mt-6 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700/50">
                      <TableHead className="text-slate-300 text-xs text-right">שבוע</TableHead>
                      <TableHead className="text-slate-300 text-xs text-center">ניצול %</TableHead>
                      <TableHead className="text-slate-300 text-xs text-center">הזמנות</TableHead>
                      <TableHead className="text-slate-300 text-xs text-center">סיכון</TableHead>
                      <TableHead className="text-slate-300 text-xs text-right">הערות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forecast.map((f, i) => (
                      <TableRow key={i} className="border-slate-700/30 hover:bg-slate-800/30">
                        <TableCell className="text-sm">{f.week}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${utilColor(f.utilPct)}`}>{f.utilPct}%</span>
                        </TableCell>
                        <TableCell className="text-center text-sm">{f.orders}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`text-[10px] ${riskColor[f.risk]}`}>{f.risk}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-400">{f.notes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
