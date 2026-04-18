import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FolderKanban, Target, Clock, AlertTriangle, CheckCircle, TrendingUp,
  TrendingDown, Users, DollarSign, BarChart3, Calendar, Zap, Shield,
  Milestone, FileText, Briefcase, Activity, Layers, GitBranch
} from "lucide-react";

const FALLBACK_PORTFOLIO_KPIS = {
  totalProjects: 34,
  activeProjects: 18,
  completedThisQuarter: 7,
  atRisk: 4,
  behindSchedule: 3,
  onTrack: 11,
  totalBudget: 28500000,
  budgetUsed: 19200000,
  budgetPct: 67.4,
  avgEV: 0.92,
  avgSPI: 0.97,
  avgCPI: 1.03,
  resourceUtilization: 84,
  openMilestones: 42,
  overdueTasksGlobal: 15,
  changeOrdersPending: 6,
  avgProjectHealth: 78,
};

const FALLBACK_CC_PROJECTS_LIST = [
  { id: "PRJ-001", name: "בניין מגורים קריית אתא — שלב ב׳", pm: "אורי כהן", phase: "ביצוע", health: 92, budget: 4500000, spent: 3200000, spi: 1.02, cpi: 1.05, dueDate: "2026-08-15", status: "on_track", pct: 71 },
  { id: "PRJ-002", name: "פרויקט נדל\"ן פלוס — מגדל A", pm: "דנה לוי", phase: "ביצוע", health: 85, budget: 8200000, spent: 6100000, spi: 0.98, cpi: 0.96, dueDate: "2026-12-01", status: "on_track", pct: 58 },
  { id: "PRJ-003", name: "שיפוץ מבנה תעשייה — אזור הצפון", pm: "יוסי מרקוביץ", phase: "תכנון", health: 68, budget: 1800000, spent: 450000, spi: 0.85, cpi: 1.1, dueDate: "2026-06-30", status: "at_risk", pct: 25 },
  { id: "PRJ-004", name: "חלונות אלומיניום — פרויקט שיכון", pm: "מירי אביטל", phase: "ביצוע", health: 45, budget: 3200000, spent: 2900000, spi: 0.78, cpi: 0.82, dueDate: "2026-05-20", status: "behind", pct: 65 },
  { id: "PRJ-005", name: "מערכת זכוכית חזיתית — מגדל עזריאלי", pm: "אורי כהן", phase: "ביצוע", health: 95, budget: 6400000, spent: 4800000, spi: 1.08, cpi: 1.02, dueDate: "2026-10-30", status: "on_track", pct: 75 },
  { id: "PRJ-006", name: "ריצוף וחיפוי — קניון הצפון", pm: "דנה לוי", phase: "סיום", health: 100, budget: 2100000, spent: 1950000, spi: 1.0, cpi: 1.08, dueDate: "2026-04-15", status: "completing", pct: 97 },
  { id: "PRJ-007", name: "מבנה משרדים — רמת גן", pm: "יוסי מרקוביץ", phase: "תכנון", health: 55, budget: 5600000, spent: 800000, spi: 0.72, cpi: 0.9, dueDate: "2027-03-01", status: "at_risk", pct: 14 },
];

const FALLBACK_CC_MILESTONES = [
  { project: "PRJ-001", name: "סיום שלב שלד", due: "2026-04-20", status: "on_track", daysLeft: 12 },
  { project: "PRJ-002", name: "אישור תכנית ביצוע", due: "2026-04-08", status: "today", daysLeft: 0 },
  { project: "PRJ-004", name: "מסירת חלונות קומה 8-14", due: "2026-04-05", status: "overdue", daysLeft: -3 },
  { project: "PRJ-005", name: "הגעת זכוכית מיובאת", due: "2026-04-18", status: "on_track", daysLeft: 10 },
  { project: "PRJ-003", name: "אישור היתר בנייה", due: "2026-04-25", status: "at_risk", daysLeft: 17 },
  { project: "PRJ-007", name: "סיום תכנון אדריכלי", due: "2026-04-30", status: "at_risk", daysLeft: 22 },
];

const FALLBACK_RESOURCE_ALLOCATION = [
  { name: "אורי כהן", role: "מנהל פרויקט", projects: 2, utilization: 95, hours: 190, capacity: 200 },
  { name: "דנה לוי", role: "מנהלת פרויקט", projects: 2, utilization: 88, hours: 176, capacity: 200 },
  { name: "יוסי מרקוביץ", role: "מנהל פרויקט", projects: 2, utilization: 72, hours: 144, capacity: 200 },
  { name: "מירי אביטל", role: "מנהלת פרויקט", projects: 1, utilization: 90, hours: 180, capacity: 200 },
  { name: "צוות הנדסה A", role: "צוות ביצוע", projects: 3, utilization: 92, hours: 1100, capacity: 1200 },
  { name: "צוות הנדסה B", role: "צוות ביצוע", projects: 2, utilization: 78, hours: 936, capacity: 1200 },
];

const FALLBACK_CC_RISK_REGISTER = [
  { id: "RSK-01", project: "PRJ-004", desc: "חריגה בתקציב — צפי 112% מהמתוכנן", severity: "critical", impact: "high", probability: "high", mitigation: "בדיקת ספקים חלופיים" },
  { id: "RSK-02", project: "PRJ-003", desc: "עיכוב באישור היתר", severity: "high", impact: "high", probability: "medium", mitigation: "מעקב מול הוועדה" },
  { id: "RSK-03", project: "PRJ-007", desc: "תכנון לא סופי — שינויים תכופים", severity: "medium", impact: "medium", probability: "high", mitigation: "הקפאת תכנון עד 15/04" },
  { id: "RSK-04", project: "PRJ-002", desc: "תלות בספק יחיד לפלדה", severity: "medium", impact: "high", probability: "low", mitigation: "גיבוי ספק מאושר" },
];

const FALLBACK_CC_CHANGE_ORDERS = [
  { id: "CO-041", project: "PRJ-004", desc: "שינוי סוג זכוכית לקומות עליונות", amount: 185000, status: "pending", requestedBy: "לקוח", date: "2026-04-03" },
  { id: "CO-042", project: "PRJ-001", desc: "הוספת מעלית שירות", amount: 320000, status: "approved", requestedBy: "אדריכל", date: "2026-04-01" },
  { id: "CO-043", project: "PRJ-002", desc: "שדרוג מערכת כיבוי אש", amount: 95000, status: "pending", requestedBy: "יועץ בטיחות", date: "2026-04-06" },
  { id: "CO-044", project: "PRJ-005", desc: "שינוי גוון זכוכית חזית מערבית", amount: 42000, status: "rejected", requestedBy: "לקוח", date: "2026-03-28" },
];

const phaseColor = (p: string) => {
  if (p === "תכנון") return "bg-blue-500/20 text-blue-400";
  if (p === "ביצוע") return "bg-green-500/20 text-green-400";
  if (p === "סיום") return "bg-purple-500/20 text-purple-400";
  return "bg-slate-500/20 text-slate-400";
};
const statusBadge = (s: string) => {
  if (s === "on_track" || s === "completing") return "bg-emerald-500/20 text-emerald-400";
  if (s === "at_risk") return "bg-amber-500/20 text-amber-400";
  if (s === "behind") return "bg-red-500/20 text-red-400";
  return "bg-slate-500/20 text-slate-400";
};
const statusLabel = (s: string) => {
  if (s === "on_track") return "בזמן";
  if (s === "at_risk") return "בסיכון";
  if (s === "behind") return "באיחור";
  if (s === "completing") return "מסיים";
  return s;
};
const spiColor = (v: number) => v >= 1 ? "text-emerald-400" : v >= 0.9 ? "text-amber-400" : "text-red-400";
const cpiColor = (v: number) => v >= 1 ? "text-emerald-400" : v >= 0.9 ? "text-amber-400" : "text-red-400";
const severityBadge = (s: string) => {
  if (s === "critical") return "bg-red-500/20 text-red-400";
  if (s === "high") return "bg-orange-500/20 text-orange-400";
  if (s === "medium") return "bg-amber-500/20 text-amber-400";
  return "bg-slate-500/20 text-slate-400";
};
const milestoneStatusBadge = (s: string) => {
  if (s === "on_track") return "bg-emerald-500/20 text-emerald-400";
  if (s === "today") return "bg-blue-500/20 text-blue-400";
  if (s === "overdue") return "bg-red-500/20 text-red-400";
  if (s === "at_risk") return "bg-amber-500/20 text-amber-400";
  return "bg-slate-500/20 text-slate-400";
};
const milestoneLabel = (s: string) => {
  if (s === "on_track") return "בזמן";
  if (s === "today") return "היום";
  if (s === "overdue") return "באיחור";
  if (s === "at_risk") return "בסיכון";
  return s;
};
const coStatusBadge = (s: string) => {
  if (s === "approved") return "bg-emerald-500/20 text-emerald-400";
  if (s === "pending") return "bg-amber-500/20 text-amber-400";
  if (s === "rejected") return "bg-red-500/20 text-red-400";
  return "bg-slate-500/20 text-slate-400";
};
const coStatusLabel = (s: string) => {
  if (s === "approved") return "מאושר";
  if (s === "pending") return "ממתין";
  if (s === "rejected") return "נדחה";
  return s;
};
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtCurrency = (n: number) => "₪" + new Intl.NumberFormat("he-IL").format(n);

export default function ProjectsCommandCenter() {
  const { data: apiCC } = useQuery({
    queryKey: ["projects-command-center"],
    queryFn: async () => { const r = await authFetch("/api/projects/command-center"); return r.json(); },
  });
  const portfolioKPIs = apiCC?.portfolioKPIs ?? apiCC?.data?.portfolioKPIs ?? FALLBACK_PORTFOLIO_KPIS;
  const projectsList = apiCC?.projectsList ?? apiCC?.data?.projectsList ?? FALLBACK_CC_PROJECTS_LIST;
  const milestones = apiCC?.milestones ?? apiCC?.data?.milestones ?? FALLBACK_CC_MILESTONES;
  const resourceAllocation = apiCC?.resourceAllocation ?? apiCC?.data?.resourceAllocation ?? FALLBACK_RESOURCE_ALLOCATION;
  const riskRegister = apiCC?.riskRegister ?? apiCC?.data?.riskRegister ?? FALLBACK_CC_RISK_REGISTER;
  const changeOrders = apiCC?.changeOrders ?? apiCC?.data?.changeOrders ?? FALLBACK_CC_CHANGE_ORDERS;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FolderKanban className="w-7 h-7 text-blue-400" />
            מרכז פיקוד פרויקטים
          </h1>
          <p className="text-sm text-slate-400 mt-1">ניהול תיק עבודות, Earned Value, סיכונים ומשאבים — זמן אמת</p>
        </div>
        <Badge className="bg-blue-500/20 text-blue-400 text-xs">Q2 2026</Badge>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: "פרויקטים פעילים", value: portfolioKPIs.activeProjects, icon: FolderKanban, color: "text-blue-400" },
          { label: "בזמן", value: portfolioKPIs.onTrack, icon: CheckCircle, color: "text-emerald-400" },
          { label: "בסיכון", value: portfolioKPIs.atRisk, icon: AlertTriangle, color: "text-amber-400" },
          { label: "באיחור", value: portfolioKPIs.behindSchedule, icon: TrendingDown, color: "text-red-400" },
          { label: "SPI ממוצע", value: portfolioKPIs.avgSPI.toFixed(2), icon: Target, color: portfolioKPIs.avgSPI >= 1 ? "text-emerald-400" : "text-amber-400" },
          { label: "CPI ממוצע", value: portfolioKPIs.avgCPI.toFixed(2), icon: DollarSign, color: portfolioKPIs.avgCPI >= 1 ? "text-emerald-400" : "text-amber-400" },
          { label: "ניצולת משאבים", value: portfolioKPIs.resourceUtilization + "%", icon: Users, color: "text-purple-400" },
          { label: "אבני דרך פתוחות", value: portfolioKPIs.openMilestones, icon: Milestone, color: "text-cyan-400" },
        ].map((kpi, i) => (
          <Card key={i} className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-3 text-center">
              <kpi.icon className={`w-5 h-5 mx-auto mb-1 ${kpi.color}`} />
              <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="text-[10px] text-slate-400">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Budget Overview */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-400" />
            תקציב תיק עבודות כולל
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-400">שימוש: {fmtCurrency(portfolioKPIs.budgetUsed)} מתוך {fmtCurrency(portfolioKPIs.totalBudget)}</span>
            <span className="text-white font-bold">{portfolioKPIs.budgetPct}%</span>
          </div>
          <Progress value={portfolioKPIs.budgetPct} className="h-3" />
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>יתרה: {fmtCurrency(portfolioKPIs.totalBudget - portfolioKPIs.budgetUsed)}</span>
            <span>משימות באיחור: {portfolioKPIs.overdueTasksGlobal} | שינויים ממתינים: {portfolioKPIs.changeOrdersPending}</span>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="projects" className="space-y-4">
        <TabsList className="bg-slate-800 border-slate-700">
          <TabsTrigger value="projects">תיק עבודות</TabsTrigger>
          <TabsTrigger value="milestones">אבני דרך</TabsTrigger>
          <TabsTrigger value="resources">משאבים</TabsTrigger>
          <TabsTrigger value="risks">סיכונים</TabsTrigger>
          <TabsTrigger value="changes">שינויי הזמנה</TabsTrigger>
        </TabsList>

        {/* Projects Tab */}
        <TabsContent value="projects">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                כל הפרויקטים — סטטוס Earned Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">פרויקט</TableHead>
                    <TableHead className="text-slate-400 text-right">מנהל</TableHead>
                    <TableHead className="text-slate-400 text-center">שלב</TableHead>
                    <TableHead className="text-slate-400 text-center">בריאות</TableHead>
                    <TableHead className="text-slate-400 text-center">התקדמות</TableHead>
                    <TableHead className="text-slate-400 text-center">SPI</TableHead>
                    <TableHead className="text-slate-400 text-center">CPI</TableHead>
                    <TableHead className="text-slate-400 text-right">תקציב</TableHead>
                    <TableHead className="text-slate-400 text-center">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectsList.map((p) => (
                    <TableRow key={p.id} className="border-slate-700/50">
                      <TableCell>
                        <div className="text-white font-medium text-sm">{p.name}</div>
                        <div className="text-xs text-slate-500">{p.id} | יעד: {p.dueDate}</div>
                      </TableCell>
                      <TableCell className="text-slate-300 text-sm">{p.pm}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${phaseColor(p.phase)} text-xs`}>{p.phase}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className={`text-lg font-bold ${p.health >= 80 ? "text-emerald-400" : p.health >= 60 ? "text-amber-400" : "text-red-400"}`}>
                          {p.health}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="w-20 mx-auto">
                          <Progress value={p.pct} className="h-2" />
                          <div className="text-[10px] text-slate-500 text-center mt-0.5">{p.pct}%</div>
                        </div>
                      </TableCell>
                      <TableCell className={`text-center font-mono font-bold ${spiColor(p.spi)}`}>{p.spi.toFixed(2)}</TableCell>
                      <TableCell className={`text-center font-mono font-bold ${cpiColor(p.cpi)}`}>{p.cpi.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <div className="text-xs text-slate-300">{fmtCurrency(p.spent)}</div>
                        <div className="text-[10px] text-slate-500">מתוך {fmtCurrency(p.budget)}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${statusBadge(p.status)} text-xs`}>{statusLabel(p.status)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Milestones Tab */}
        <TabsContent value="milestones">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Milestone className="w-4 h-4 text-cyan-400" />
                אבני דרך קרובות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">פרויקט</TableHead>
                    <TableHead className="text-slate-400 text-right">אבן דרך</TableHead>
                    <TableHead className="text-slate-400 text-center">תאריך יעד</TableHead>
                    <TableHead className="text-slate-400 text-center">ימים</TableHead>
                    <TableHead className="text-slate-400 text-center">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {milestones.map((m, i) => (
                    <TableRow key={i} className="border-slate-700/50">
                      <TableCell className="text-slate-300 text-sm font-medium">{m.project}</TableCell>
                      <TableCell className="text-white text-sm">{m.name}</TableCell>
                      <TableCell className="text-slate-300 text-center text-sm">{m.due}</TableCell>
                      <TableCell className={`text-center font-bold ${m.daysLeft < 0 ? "text-red-400" : m.daysLeft === 0 ? "text-blue-400" : m.daysLeft <= 7 ? "text-amber-400" : "text-slate-300"}`}>
                        {m.daysLeft < 0 ? `${Math.abs(m.daysLeft)}- ימים` : m.daysLeft === 0 ? "היום!" : `${m.daysLeft} ימים`}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${milestoneStatusBadge(m.status)} text-xs`}>{milestoneLabel(m.status)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Resources Tab */}
        <TabsContent value="resources">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                הקצאת משאבים ועומסים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">שם</TableHead>
                    <TableHead className="text-slate-400 text-right">תפקיד</TableHead>
                    <TableHead className="text-slate-400 text-center">פרויקטים</TableHead>
                    <TableHead className="text-slate-400 text-center">שעות</TableHead>
                    <TableHead className="text-slate-400 text-center">ניצולת</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resourceAllocation.map((r, i) => (
                    <TableRow key={i} className="border-slate-700/50">
                      <TableCell className="text-white font-medium text-sm">{r.name}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{r.role}</TableCell>
                      <TableCell className="text-center text-slate-300">{r.projects}</TableCell>
                      <TableCell className="text-center text-slate-300 text-sm">{r.hours}/{r.capacity}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 justify-center">
                          <Progress value={r.utilization} className="h-2 w-16" />
                          <span className={`text-sm font-bold ${r.utilization > 90 ? "text-red-400" : r.utilization > 75 ? "text-amber-400" : "text-emerald-400"}`}>
                            {r.utilization}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Risks Tab */}
        <TabsContent value="risks">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-400" />
                מרשם סיכונים פעיל
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">ID</TableHead>
                    <TableHead className="text-slate-400 text-right">פרויקט</TableHead>
                    <TableHead className="text-slate-400 text-right">תיאור סיכון</TableHead>
                    <TableHead className="text-slate-400 text-center">חומרה</TableHead>
                    <TableHead className="text-slate-400 text-right">מיטיגציה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {riskRegister.map((r) => (
                    <TableRow key={r.id} className="border-slate-700/50">
                      <TableCell className="text-slate-300 text-sm font-mono">{r.id}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{r.project}</TableCell>
                      <TableCell className="text-white text-sm">{r.desc}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${severityBadge(r.severity)} text-xs`}>
                          {r.severity === "critical" ? "קריטי" : r.severity === "high" ? "גבוה" : "בינוני"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-400 text-sm">{r.mitigation}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Change Orders Tab */}
        <TabsContent value="changes">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-orange-400" />
                שינויי הזמנה (Change Orders)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right">מספר</TableHead>
                    <TableHead className="text-slate-400 text-right">פרויקט</TableHead>
                    <TableHead className="text-slate-400 text-right">תיאור</TableHead>
                    <TableHead className="text-slate-400 text-right">סכום</TableHead>
                    <TableHead className="text-slate-400 text-center">מבקש</TableHead>
                    <TableHead className="text-slate-400 text-center">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changeOrders.map((co) => (
                    <TableRow key={co.id} className="border-slate-700/50">
                      <TableCell className="text-slate-300 font-mono text-sm">{co.id}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{co.project}</TableCell>
                      <TableCell className="text-white text-sm">{co.desc}</TableCell>
                      <TableCell className="text-amber-400 font-bold text-sm">{fmtCurrency(co.amount)}</TableCell>
                      <TableCell className="text-center text-slate-300 text-sm">{co.requestedBy}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${coStatusBadge(co.status)} text-xs`}>{coStatusLabel(co.status)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">סה״כ שינויים ממתינים:</span>
                  <span className="text-amber-400 font-bold">{fmtCurrency(changeOrders.filter(c => c.status === "pending").reduce((s, c) => s + c.amount, 0))}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
