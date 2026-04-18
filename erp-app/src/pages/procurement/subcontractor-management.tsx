import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  HardHat, Users, FileText, DollarSign, TrendingUp, ShieldCheck, Clock,
  BarChart3, Search, Star, CheckCircle2, AlertTriangle, Wrench
} from "lucide-react";

const fmt = (v: number) => "₪" + new Intl.NumberFormat("he-IL").format(v);

const statusMap: Record<string, { label: string; color: string }> = {
  active:   { label: "פעיל",    color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  paused:   { label: "מושהה",   color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  ended:    { label: "הסתיים",  color: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  pending:  { label: "ממתין",   color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

const orderStatusMap: Record<string, { label: string; color: string }> = {
  in_progress: { label: "בביצוע",    color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  completed:   { label: "הושלם",     color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  delayed:     { label: "באיחור",    color: "bg-red-500/20 text-red-400 border-red-500/30" },
  pending:     { label: "ממתין",     color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
};

const FALLBACK_SUBCONTRACTORS = [
  { id: "SC-001", name: "גלוון הצפון", specialty: "גלוון חם וקר", contact: "אבי כהן", phone: "04-9551234", activeOrders: 4, totalValue: 285000, performance: 92, quality: 96.5, onTime: 88, status: "active" },
  { id: "SC-002", name: "צביעת אבקה — מפעלי דרום", specialty: "צביעה אלקטרוסטטית", contact: "מוחמד חלבי", phone: "08-6234567", activeOrders: 3, totalValue: 198000, performance: 87, quality: 94.2, onTime: 91, status: "active" },
  { id: "SC-003", name: "התקנות אלומיניום גליל", specialty: "התקנת מערכות אלומיניום", contact: "יוסי מזרחי", phone: "04-6789012", activeOrders: 2, totalValue: 342000, performance: 95, quality: 98.1, onTime: 96, status: "active" },
  { id: "SC-004", name: "ריתוך מיוחד בע״מ", specialty: "ריתוך TIG/MIG מיוחד", contact: "דוד לוי", phone: "03-5123456", activeOrders: 3, totalValue: 156000, performance: 78, quality: 89.4, onTime: 72, status: "active" },
  { id: "SC-005", name: "חיתוך לייזר אור", specialty: "חיתוך CNC ולייזר", contact: "עמית שרון", phone: "09-7654321", activeOrders: 1, totalValue: 87000, performance: 91, quality: 97.3, onTime: 94, status: "paused" },
  { id: "SC-006", name: "ציפוי אנודייז — א.ב. מתכות", specialty: "אנודייז ואלקטרוליזה", contact: "בני אלוני", phone: "04-8321654", activeOrders: 2, totalValue: 124000, performance: 85, quality: 91.8, onTime: 83, status: "active" },
  { id: "SC-007", name: "הרכבות דיוק תעשייתי", specialty: "הרכבה מכנית מדויקת", contact: "ענבל רוזן", phone: "03-6987412", activeOrders: 0, totalValue: 215000, performance: 89, quality: 93.6, onTime: 90, status: "ended" },
  { id: "SC-008", name: "עיבוד שבבי מרכזי", specialty: "CNC מחרטה וכרסום", contact: "חיים ברגר", phone: "08-9112233", activeOrders: 2, totalValue: 178000, performance: 93, quality: 95.7, onTime: 95, status: "active" },
];

const FALLBACK_ORDERS = [
  { id: "SCO-001", subcontractor: "גלוון הצפון", scope: "גלוון 450 יח׳ פרופילים", value: 72000, startDate: "2026-03-01", dueDate: "2026-04-15", progress: 78, status: "in_progress" },
  { id: "SCO-002", subcontractor: "צביעת אבקה — מפעלי דרום", scope: "צביעה RAL 7016 — 300 יח׳", value: 54000, startDate: "2026-03-10", dueDate: "2026-04-10", progress: 95, status: "in_progress" },
  { id: "SCO-003", subcontractor: "התקנות אלומיניום גליל", scope: "התקנת חזיתות בניין A", value: 185000, startDate: "2026-02-15", dueDate: "2026-05-01", progress: 62, status: "in_progress" },
  { id: "SCO-004", subcontractor: "ריתוך מיוחד בע״מ", scope: "ריתוך מסגרות נירוסטה 316L", value: 48000, startDate: "2026-03-20", dueDate: "2026-04-08", progress: 45, status: "delayed" },
  { id: "SCO-005", subcontractor: "גלוון הצפון", scope: "גלוון אצווה #B-2026-12", value: 38000, startDate: "2026-03-15", dueDate: "2026-04-20", progress: 55, status: "in_progress" },
  { id: "SCO-006", subcontractor: "עיבוד שבבי מרכזי", scope: "עיבוד CNC — 200 פינים", value: 92000, startDate: "2026-03-05", dueDate: "2026-04-25", progress: 40, status: "in_progress" },
  { id: "SCO-007", subcontractor: "ציפוי אנודייז — א.ב. מתכות", scope: "אנודייז שחור — 150 יח׳", value: 31000, startDate: "2026-03-25", dueDate: "2026-04-18", progress: 30, status: "pending" },
  { id: "SCO-008", subcontractor: "צביעת אבקה — מפעלי דרום", scope: "צביעה לבן RAL 9010 — 500 יח׳", value: 67000, startDate: "2026-02-20", dueDate: "2026-03-30", progress: 100, status: "completed" },
];

const FALLBACK_COST_DATA = [
  { subcontractor: "גלוון הצפון", budgeted: 290000, actual: 285000, variance: -5000, invoiced: 248000, paid: 220000 },
  { subcontractor: "צביעת אבקה — מפעלי דרום", budgeted: 185000, actual: 198000, variance: 13000, invoiced: 175000, paid: 160000 },
  { subcontractor: "התקנות אלומיניום גליל", budgeted: 350000, actual: 342000, variance: -8000, invoiced: 280000, paid: 240000 },
  { subcontractor: "ריתוך מיוחד בע״מ", budgeted: 140000, actual: 156000, variance: 16000, invoiced: 130000, paid: 110000 },
  { subcontractor: "חיתוך לייזר אור", budgeted: 90000, actual: 87000, variance: -3000, invoiced: 87000, paid: 87000 },
  { subcontractor: "ציפוי אנודייז — א.ב. מתכות", budgeted: 120000, actual: 124000, variance: 4000, invoiced: 95000, paid: 80000 },
  { subcontractor: "הרכבות דיוק תעשייתי", budgeted: 210000, actual: 215000, variance: 5000, invoiced: 215000, paid: 215000 },
  { subcontractor: "עיבוד שבבי מרכזי", budgeted: 170000, actual: 178000, variance: 8000, invoiced: 140000, paid: 120000 },
];

const FALLBACK_KPIS = [
  { label: "קבלנים פעילים", value: "6", icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "הזמנות פתוחות", value: "7", icon: FileText, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "שווי כולל", value: fmt(1585000), icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "ביצוע ממוצע", value: "88.8", icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "איכות %", value: "94.6%", icon: ShieldCheck, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "בזמן %", value: "88.6%", icon: Clock, color: "text-orange-400", bg: "bg-orange-500/10" },
];

const perfColor = (v: number) => v >= 90 ? "text-emerald-400" : v >= 80 ? "text-amber-400" : "text-red-400";
const progressColor = (v: number) => v >= 90 ? "bg-emerald-500" : v >= 60 ? "bg-blue-500" : v >= 40 ? "bg-amber-500" : "bg-red-500";

export default function SubcontractorManagement() {
  const { data: subcontractormanagementData } = useQuery({
    queryKey: ["subcontractor-management"],
    queryFn: () => authFetch("/api/procurement/subcontractor_management"),
    staleTime: 5 * 60 * 1000,
  });

  const subcontractors = subcontractormanagementData ?? FALLBACK_SUBCONTRACTORS;
  const costData = FALLBACK_COST_DATA;
  const kpis = FALLBACK_KPIS;
  const orders = FALLBACK_ORDERS;

  const [tab, setTab] = useState("profiles");
  const [search, setSearch] = useState("");

  const filtered = subcontractors.filter(s =>
    !search || s.name.includes(search) || s.specialty.includes(search)
  );

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <HardHat className="h-7 w-7 text-primary" /> ניהול קבלני משנה
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">פרופילים, הזמנות, עלויות וביצועים — טכנו-כל עוזי</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-6 gap-2">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border-slate-700 bg-slate-800/50`}>
              <CardContent className="pt-3 pb-2 text-center px-2">
                <Icon className={`h-4 w-4 mx-auto ${kpi.color} mb-1`} />
                <p className="text-[9px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="profiles" className="text-xs gap-1"><Users className="h-3.5 w-3.5" /> קבלנים</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" /> הזמנות</TabsTrigger>
          <TabsTrigger value="costs" className="text-xs gap-1"><DollarSign className="h-3.5 w-3.5" /> עלויות</TabsTrigger>
          <TabsTrigger value="performance" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> ביצועים</TabsTrigger>
        </TabsList>

        {/* Profiles Tab */}
        <TabsContent value="profiles" className="space-y-3 mt-3">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text" placeholder="חיפוש קבלן..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pr-10 pl-3 py-2 rounded-lg border border-border bg-muted/50 text-foreground text-sm"
            />
          </div>
          <Card className="border-slate-700 bg-slate-900/50">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-[10px] font-semibold">קבלן</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">התמחות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">הזמנות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שווי כולל</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ביצוע</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">איכות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(s => {
                    const st = statusMap[s.status] || statusMap.active;
                    return (
                      <TableRow key={s.id} className="border-slate-700/50 hover:bg-slate-800/40">
                        <TableCell>
                          <div className="font-medium text-foreground text-xs">{s.name}</div>
                          <div className="text-[10px] text-muted-foreground">{s.contact} | {s.phone}</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{s.specialty}</TableCell>
                        <TableCell className="text-xs font-mono text-center">{s.activeOrders}</TableCell>
                        <TableCell className="text-xs font-mono">{fmt(s.totalValue)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <Progress value={s.performance} className={`h-2 flex-1 [&>div]:${progressColor(s.performance)}`} />
                            <span className={`text-xs font-mono font-bold ${perfColor(s.performance)}`}>{s.performance}</span>
                          </div>
                        </TableCell>
                        <TableCell className={`text-xs font-mono font-bold ${perfColor(s.quality)}`}>{s.quality}%</TableCell>
                        <TableCell><Badge className={`${st.color} border text-[10px]`}>{st.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Orders Tab */}
        <TabsContent value="orders" className="mt-3">
          <Card className="border-slate-700 bg-slate-900/50">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-[10px] font-semibold">מס׳</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">קבלן</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">היקף עבודה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שווי</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">יעד</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">התקדמות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map(o => {
                    const os = orderStatusMap[o.status] || orderStatusMap.in_progress;
                    return (
                      <TableRow key={o.id} className="border-slate-700/50 hover:bg-slate-800/40">
                        <TableCell className="text-xs font-mono text-muted-foreground">{o.id}</TableCell>
                        <TableCell className="text-xs font-medium text-foreground">{o.subcontractor}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{o.scope}</TableCell>
                        <TableCell className="text-xs font-mono">{fmt(o.value)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{o.dueDate}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[110px]">
                            <Progress value={o.progress} className={`h-2 flex-1 [&>div]:${progressColor(o.progress)}`} />
                            <span className="text-[10px] font-mono text-muted-foreground">{o.progress}%</span>
                          </div>
                        </TableCell>
                        <TableCell><Badge className={`${os.color} border text-[10px]`}>{os.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Costs Tab */}
        <TabsContent value="costs" className="mt-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Card className="bg-emerald-500/10 border-slate-700">
              <CardContent className="pt-3 pb-2 text-center">
                <p className="text-[9px] text-muted-foreground">סה״כ תקציב</p>
                <p className="text-lg font-bold font-mono text-emerald-400">{fmt(1555000)}</p>
              </CardContent>
            </Card>
            <Card className="bg-blue-500/10 border-slate-700">
              <CardContent className="pt-3 pb-2 text-center">
                <p className="text-[9px] text-muted-foreground">סה״כ בפועל</p>
                <p className="text-lg font-bold font-mono text-blue-400">{fmt(1585000)}</p>
              </CardContent>
            </Card>
            <Card className="bg-amber-500/10 border-slate-700">
              <CardContent className="pt-3 pb-2 text-center">
                <p className="text-[9px] text-muted-foreground">סה״כ שולם</p>
                <p className="text-lg font-bold font-mono text-amber-400">{fmt(1232000)}</p>
              </CardContent>
            </Card>
          </div>
          <Card className="border-slate-700 bg-slate-900/50">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-[10px] font-semibold">קבלן</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תקציב</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">בפועל</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטייה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">חשבוניות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שולם</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costData.map((c, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-800/40">
                      <TableCell className="text-xs font-medium text-foreground">{c.subcontractor}</TableCell>
                      <TableCell className="text-xs font-mono">{fmt(c.budgeted)}</TableCell>
                      <TableCell className="text-xs font-mono">{fmt(c.actual)}</TableCell>
                      <TableCell className={`text-xs font-mono font-bold ${c.variance <= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {c.variance > 0 ? "+" : ""}{fmt(c.variance)}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{fmt(c.invoiced)}</TableCell>
                      <TableCell className="text-xs font-mono">{fmt(c.paid)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="mt-3 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {subcontractors.filter(s => s.status === "active").map(s => (
              <Card key={s.id} className="border-slate-700 bg-slate-900/50">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground text-sm">{s.name}</p>
                      <p className="text-[10px] text-muted-foreground">{s.specialty}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className={`h-4 w-4 ${s.performance >= 90 ? "text-yellow-400 fill-yellow-400" : "text-gray-500"}`} />
                      <span className={`text-lg font-bold font-mono ${perfColor(s.performance)}`}>{s.performance}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> איכות</span>
                      <span className={`font-mono font-bold ${perfColor(s.quality)}`}>{s.quality}%</span>
                    </div>
                    <Progress value={s.quality} className="h-1.5 [&>div]:bg-emerald-500" />
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> עמידה בזמנים</span>
                      <span className={`font-mono font-bold ${perfColor(s.onTime)}`}>{s.onTime}%</span>
                    </div>
                    <Progress value={s.onTime} className={`h-1.5 [&>div]:${s.onTime >= 90 ? "bg-emerald-500" : s.onTime >= 80 ? "bg-amber-500" : "bg-red-500"}`} />
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground flex items-center gap-1"><Wrench className="h-3 w-3" /> הזמנות פעילות</span>
                      <span className="font-mono text-foreground">{s.activeOrders}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" /> שווי</span>
                      <span className="font-mono text-foreground">{fmt(s.totalValue)}</span>
                    </div>
                  </div>
                  {s.performance < 80 && (
                    <div className="flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 rounded px-2 py-1">
                      <AlertTriangle className="h-3 w-3" /> ביצוע מתחת לסף — נדרשת בדיקה
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}