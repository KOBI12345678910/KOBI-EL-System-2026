import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Crown, TrendingUp, TrendingDown, DollarSign, Users, Factory,
  AlertTriangle, CheckCircle, Target, BarChart3, Activity, Shield,
  Briefcase, Eye, Zap, Globe, Building, ArrowUpRight, ArrowDownRight,
  Clock, Layers
} from "lucide-react";

const companyKPIs = {
  revenue: { current: 12800000, target: 14000000, prevMonth: 11500000, pct: 91.4 },
  grossMargin: { current: 38.2, target: 40, prevMonth: 36.8 },
  ebitda: { current: 2850000, prevMonth: 2400000 },
  netProfit: { current: 1920000, prevMonth: 1650000 },
  cashPosition: 8400000,
  ar: 6200000,
  ap: 4100000,
  backlog: 42000000,
  headcount: 187,
  customerSatisfaction: 4.6,
  onTimeDelivery: 91,
  qualityRate: 99.2,
  activeProjects: 18,
  pipelineValue: 28000000,
  winRate: 34,
  avgDealSize: 1250000,
};

const FALLBACK_DIVISION_PERFORMANCE = [
  { name: "ייצור אלומיניום", revenue: 4200000, target: 4500000, margin: 42, headcount: 62, status: "on_track", trend: "up" },
  { name: "ייצור זכוכית", revenue: 3100000, target: 3200000, margin: 35, headcount: 45, status: "on_track", trend: "up" },
  { name: "ייצור ברזל/פלדה", revenue: 2800000, target: 3000000, margin: 38, headcount: 38, status: "at_risk", trend: "flat" },
  { name: "פרויקטים והתקנות", revenue: 1900000, target: 2300000, margin: 28, headcount: 28, status: "behind", trend: "down" },
  { name: "שירות ותחזוקה", revenue: 800000, target: 1000000, margin: 55, headcount: 14, status: "at_risk", trend: "up" },
];

const FALLBACK_STRATEGIC_INITIATIVES = [
  { name: "הרחבת קו ייצור אלומיניום אוטומטי", owner: "אורי כהן", phase: "ביצוע", pct: 65, budget: 3200000, spent: 2100000, deadline: "2026-Q3", status: "on_track" },
  { name: "כניסה לשוק ירדן", owner: "דנה לוי", phase: "תכנון", pct: 20, budget: 800000, spent: 160000, deadline: "2026-Q4", status: "on_track" },
  { name: "מערכת ERP — שדרוג מלא", owner: "קובי", phase: "ביצוע", pct: 82, budget: 450000, spent: 370000, deadline: "2026-Q2", status: "on_track" },
  { name: "הסמכת ISO 14001 סביבתי", owner: "מירי אביטל", phase: "ביקורת", pct: 90, budget: 120000, spent: 108000, deadline: "2026-04-30", status: "on_track" },
  { name: "מעבר לייצור ירוק — סולארי", owner: "יוסי מ.", phase: "מכרז", pct: 35, budget: 2800000, spent: 280000, deadline: "2027-Q1", status: "at_risk" },
];

const FALLBACK_CRITICAL_ALERTS = [
  { severity: "critical", module: "ייצור", message: "קו C — עומד מאז 06:30, ממתין לחלק חילוף", time: "07:15", action: "צוות תחזוקה בדרך" },
  { severity: "high", module: "כספים", message: "לקוח ׳אמות השקעות׳ — חוב 420K₪ מעל 90 יום", time: "אתמול", action: "שיחת גבייה תוזמנה" },
  { severity: "high", module: "פרויקטים", message: "PRJ-004 חריגת תקציב 12% — צפי להמשך עלייה", time: "היום", action: "ישיבת חירום ב-14:00" },
  { severity: "medium", module: "מלאי", message: "מלאי זכוכית 8mm — מתחת לרמה מינימלית", time: "היום", action: "הזמנה נשלחה לספק" },
  { severity: "medium", module: "HR", message: "3 עובדים בתקופת ניסיון מסתיימת השבוע", time: "השבוע", action: "טפסים להחלטה הופצו" },
];

const FALLBACK_MONTHLY_TREND = [
  { month: "נוב׳", revenue: 10200000, profit: 1380000, orders: 42 },
  { month: "דצמ׳", revenue: 10800000, profit: 1520000, orders: 38 },
  { month: "ינו׳", revenue: 11100000, profit: 1490000, orders: 45 },
  { month: "פבר׳", revenue: 11500000, profit: 1650000, orders: 48 },
  { month: "מרץ", revenue: 12800000, profit: 1920000, orders: 52 },
];

const FALLBACK_TOP_DEALS = [
  { name: "מגדל C — קבוצת אלון", value: 8500000, stage: "משא ומתן", prob: 75, pm: "אורי כהן" },
  { name: "פרויקט הרכבת הקלה — תחנות", value: 12000000, stage: "הצעה", prob: 40, pm: "דנה לוי" },
  { name: "קמפוס הייטק נתניה", value: 4200000, stage: "ניהול מו״מ סופי", prob: 85, pm: "מירי אביטל" },
  { name: "שדרוג מלון — אילת", value: 3100000, stage: "סקירה טכנית", prob: 60, pm: "יוסי מ." },
];

const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtM = (n: number) => (n / 1000000).toFixed(1) + "M₪";
const fmtCurrency = (n: number) => "₪" + new Intl.NumberFormat("he-IL").format(n);
const statusBadge = (s: string) => {
  if (s === "on_track") return "bg-emerald-500/20 text-emerald-400";
  if (s === "at_risk") return "bg-amber-500/20 text-amber-400";
  if (s === "behind") return "bg-red-500/20 text-red-400";
  return "bg-slate-500/20 text-slate-400";
};
const statusLabel = (s: string) => {
  if (s === "on_track") return "בזמן";
  if (s === "at_risk") return "בסיכון";
  if (s === "behind") return "באיחור";
  return s;
};
const severityColor = (s: string) => {
  if (s === "critical") return "border-r-red-500 bg-red-500/5";
  if (s === "high") return "border-r-orange-500 bg-orange-500/5";
  return "border-r-amber-500 bg-amber-500/5";
};
const severityLabel = (s: string) => {
  if (s === "critical") return "קריטי";
  if (s === "high") return "גבוה";
  return "בינוני";
};
const severityBadge = (s: string) => {
  if (s === "critical") return "bg-red-500/20 text-red-400";
  if (s === "high") return "bg-orange-500/20 text-orange-400";
  return "bg-amber-500/20 text-amber-400";
};
const changePct = (curr: number, prev: number) => {
  const pct = ((curr - prev) / prev * 100).toFixed(1);
  return Number(pct) >= 0 ? `+${pct}%` : `${pct}%`;
};

export default function ExecutiveCommandCenter() {
  const { data: executivecommandcenterData } = useQuery({
    queryKey: ["executive-command-center"],
    queryFn: () => authFetch("/api/executive/executive_command_center"),
    staleTime: 5 * 60 * 1000,
  });

  const divisionPerformance = executivecommandcenterData ?? FALLBACK_DIVISION_PERFORMANCE;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Crown className="w-7 h-7 text-amber-400" />
            מרכז פיקוד אסטרטגי — CEO
          </h1>
          <p className="text-sm text-slate-400 mt-1">סקירה כוללת של ביצועי החברה, יוזמות אסטרטגיות והתראות קריטיות</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-amber-500/20 text-amber-400 text-xs">מרץ 2026</Badge>
          <Badge className="bg-green-500/20 text-green-400 text-xs">LIVE</Badge>
        </div>
      </div>

      {/* Top Financial KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: "הכנסות חודשי", value: fmtM(companyKPIs.revenue.current), sub: changePct(companyKPIs.revenue.current, companyKPIs.revenue.prevMonth), icon: DollarSign, color: "text-green-400", subUp: true },
          { label: "רווח גולמי", value: companyKPIs.grossMargin.current + "%", sub: `יעד: ${companyKPIs.grossMargin.target}%`, icon: TrendingUp, color: "text-emerald-400", subUp: true },
          { label: "EBITDA", value: fmtM(companyKPIs.ebitda.current), sub: changePct(companyKPIs.ebitda.current, companyKPIs.ebitda.prevMonth), icon: BarChart3, color: "text-blue-400", subUp: true },
          { label: "מזומנים", value: fmtM(companyKPIs.cashPosition), sub: `AR: ${fmtM(companyKPIs.ar)}`, icon: Briefcase, color: "text-cyan-400", subUp: false },
          { label: "Backlog", value: fmtM(companyKPIs.backlog), sub: `${companyKPIs.activeProjects} פרויקטים`, icon: Layers, color: "text-purple-400", subUp: false },
          { label: "Pipeline", value: fmtM(companyKPIs.pipelineValue), sub: `Win Rate: ${companyKPIs.winRate}%`, icon: Target, color: "text-orange-400", subUp: false },
        ].map((kpi, i) => (
          <Card key={i} className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                {kpi.subUp && <span className="text-emerald-400 text-[10px] flex items-center"><ArrowUpRight className="w-3 h-3" />{kpi.sub}</span>}
              </div>
              <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="text-[10px] text-slate-400">{kpi.label}</div>
              {!kpi.subUp && <div className="text-[10px] text-slate-500 mt-0.5">{kpi.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Operational Health Bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "אספקה בזמן", value: companyKPIs.onTimeDelivery, target: 95, icon: Clock, color: "text-blue-400" },
          { label: "איכות", value: companyKPIs.qualityRate, target: 99.5, icon: Shield, color: "text-emerald-400" },
          { label: "שביעות רצון", value: (companyKPIs.customerSatisfaction / 5 * 100).toFixed(0), target: 90, icon: Users, color: "text-purple-400", display: `${companyKPIs.customerSatisfaction}/5` },
          { label: "כ״א פעיל", value: companyKPIs.headcount, target: 200, icon: Users, color: "text-cyan-400", display: `${companyKPIs.headcount}` },
        ].map((item, i) => (
          <Card key={i} className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-3 flex items-center gap-3">
              <item.icon className={`w-8 h-8 ${item.color}`} />
              <div className="flex-1">
                <div className="text-sm text-slate-400">{item.label}</div>
                <div className={`text-lg font-bold ${item.color}`}>{item.display || item.value + "%"}</div>
                <Progress value={typeof item.value === "number" ? (item.value / item.target * 100) : Number(item.value)} className="h-1.5 mt-1" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Critical Alerts */}
      <Card className="bg-slate-800/50 border-slate-700 border-r-4 border-r-red-500">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            התראות קריטיות — דורשות תשומת לב
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {criticalAlerts.map((alert, i) => (
            <div key={i} className={`p-3 rounded-lg border-r-2 ${severityColor(alert.severity)} border border-slate-700/50 flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <Badge className={`${severityBadge(alert.severity)} text-[10px]`}>{severityLabel(alert.severity)}</Badge>
                <div>
                  <span className="text-white text-sm">{alert.message}</span>
                  <span className="text-slate-500 text-xs mr-2">({alert.module})</span>
                </div>
              </div>
              <div className="text-left">
                <div className="text-xs text-slate-500">{alert.time}</div>
                <div className="text-xs text-blue-400">{alert.action}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Tabs defaultValue="divisions" className="space-y-4">
        <TabsList className="bg-slate-800 border-slate-700">
          <TabsTrigger value="divisions">חטיבות</TabsTrigger>
          <TabsTrigger value="strategy">יוזמות אסטרטגיות</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline מכירות</TabsTrigger>
          <TabsTrigger value="trend">מגמה חודשית</TabsTrigger>
        </TabsList>

        {/* Divisions */}
        <TabsContent value="divisions">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Building className="w-4 h-4 text-blue-400" />
                ביצועי חטיבות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">חטיבה</TableHead>
                    <TableHead className="text-slate-400 text-right">הכנסות</TableHead>
                    <TableHead className="text-slate-400 text-center">עמידה ביעד</TableHead>
                    <TableHead className="text-slate-400 text-center">מרווח</TableHead>
                    <TableHead className="text-slate-400 text-center">כ״א</TableHead>
                    <TableHead className="text-slate-400 text-center">מגמה</TableHead>
                    <TableHead className="text-slate-400 text-center">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {divisionPerformance.map((d, i) => (
                    <TableRow key={i} className="border-slate-700/50">
                      <TableCell className="text-white font-medium">{d.name}</TableCell>
                      <TableCell className="text-slate-300">{fmtCurrency(d.revenue)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 justify-center">
                          <Progress value={d.revenue / d.target * 100} className="h-2 w-16" />
                          <span className="text-xs text-slate-300">{(d.revenue / d.target * 100).toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className={`text-center font-bold ${d.margin >= 40 ? "text-emerald-400" : d.margin >= 30 ? "text-amber-400" : "text-red-400"}`}>
                        {d.margin}%
                      </TableCell>
                      <TableCell className="text-center text-slate-300">{d.headcount}</TableCell>
                      <TableCell className="text-center">
                        {d.trend === "up" ? <TrendingUp className="w-4 h-4 text-emerald-400 mx-auto" /> :
                         d.trend === "down" ? <TrendingDown className="w-4 h-4 text-red-400 mx-auto" /> :
                         <Activity className="w-4 h-4 text-amber-400 mx-auto" />}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${statusBadge(d.status)} text-xs`}>{statusLabel(d.status)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 flex items-center justify-between">
                <span className="text-slate-400 text-sm">סה״כ הכנסות חטיבות:</span>
                <span className="text-green-400 font-bold">{fmtCurrency(divisionPerformance.reduce((s, d) => s + d.revenue, 0))}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Strategic Initiatives */}
        <TabsContent value="strategy">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-400" />
                יוזמות אסטרטגיות — מעקב ביצוע
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">יוזמה</TableHead>
                    <TableHead className="text-slate-400 text-right">אחראי</TableHead>
                    <TableHead className="text-slate-400 text-center">שלב</TableHead>
                    <TableHead className="text-slate-400 text-center">התקדמות</TableHead>
                    <TableHead className="text-slate-400 text-right">תקציב</TableHead>
                    <TableHead className="text-slate-400 text-center">יעד</TableHead>
                    <TableHead className="text-slate-400 text-center">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {strategicInitiatives.map((si, i) => (
                    <TableRow key={i} className="border-slate-700/50">
                      <TableCell className="text-white font-medium text-sm">{si.name}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{si.owner}</TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-blue-500/20 text-blue-400 text-xs">{si.phase}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="w-20 mx-auto">
                          <Progress value={si.pct} className="h-2" />
                          <div className="text-[10px] text-slate-500 text-center">{si.pct}%</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-xs text-slate-300">{fmtCurrency(si.spent)}</div>
                        <div className="text-[10px] text-slate-500">מתוך {fmtCurrency(si.budget)}</div>
                      </TableCell>
                      <TableCell className="text-center text-slate-300 text-sm">{si.deadline}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${statusBadge(si.status)} text-xs`}>{statusLabel(si.status)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sales Pipeline */}
        <TabsContent value="pipeline">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-400" />
                עסקאות מובילות — Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">עסקה</TableHead>
                    <TableHead className="text-slate-400 text-right">שווי</TableHead>
                    <TableHead className="text-slate-400 text-center">שלב</TableHead>
                    <TableHead className="text-slate-400 text-center">סיכוי</TableHead>
                    <TableHead className="text-slate-400 text-center">שווי משוקלל</TableHead>
                    <TableHead className="text-slate-400 text-right">אחראי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topDeals.map((d, i) => (
                    <TableRow key={i} className="border-slate-700/50">
                      <TableCell className="text-white font-medium text-sm">{d.name}</TableCell>
                      <TableCell className="text-green-400 font-bold">{fmtCurrency(d.value)}</TableCell>
                      <TableCell className="text-center">
                        <Badge className="bg-blue-500/20 text-blue-400 text-xs">{d.stage}</Badge>
                      </TableCell>
                      <TableCell className={`text-center font-bold ${d.prob >= 70 ? "text-emerald-400" : d.prob >= 50 ? "text-amber-400" : "text-slate-400"}`}>
                        {d.prob}%
                      </TableCell>
                      <TableCell className="text-center text-cyan-400 font-bold">
                        {fmtCurrency(Math.round(d.value * d.prob / 100))}
                      </TableCell>
                      <TableCell className="text-slate-300 text-sm">{d.pm}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-slate-500">סה״כ Pipeline</div>
                  <div className="text-green-400 font-bold">{fmtCurrency(topDeals.reduce((s, d) => s + d.value, 0))}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">שווי משוקלל</div>
                  <div className="text-cyan-400 font-bold">{fmtCurrency(topDeals.reduce((s, d) => s + Math.round(d.value * d.prob / 100), 0))}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">סיכוי ממוצע</div>
                  <div className="text-amber-400 font-bold">{(topDeals.reduce((s, d) => s + d.prob, 0) / topDeals.length).toFixed(0)}%</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Monthly Trend */}
        <TabsContent value="trend">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                מגמה חודשית — 5 חודשים אחרונים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">חודש</TableHead>
                    <TableHead className="text-slate-400 text-right">הכנסות</TableHead>
                    <TableHead className="text-slate-400 text-center">בר הכנסות</TableHead>
                    <TableHead className="text-slate-400 text-right">רווח נקי</TableHead>
                    <TableHead className="text-slate-400 text-center">הזמנות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyTrend.map((m, i) => (
                    <TableRow key={i} className="border-slate-700/50">
                      <TableCell className="text-white font-medium">{m.month}</TableCell>
                      <TableCell className="text-green-400 font-bold">{fmtCurrency(m.revenue)}</TableCell>
                      <TableCell>
                        <div className="w-24 mx-auto">
                          <Progress value={m.revenue / 14000000 * 100} className="h-3" />
                        </div>
                      </TableCell>
                      <TableCell className="text-cyan-400 font-bold">{fmtCurrency(m.profit)}</TableCell>
                      <TableCell className="text-center text-slate-300 font-bold">{m.orders}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50 flex items-center justify-between">
                <span className="text-slate-400 text-sm">מגמה:</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" />
                  צמיחה של {changePct(monthlyTrend[4].revenue, monthlyTrend[0].revenue)} ב-5 חודשים
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
