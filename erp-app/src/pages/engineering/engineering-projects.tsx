import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FolderKanban, CheckCircle2, Clock, TrendingUp, TrendingDown,
  AlertTriangle, CalendarDays, Users, Wallet, Search,
  Building2, HardHat, Milestone, DollarSign, Timer,
} from "lucide-react";

/* ── 12 engineering projects ── */
const FALLBACK_PROJECTS = [
  { id: "PRJ-001", name: "חיפוי מגדל מגורים", client: "אזורים בנייה", type: "חזיתות אלומיניום", start: "2025-11-01", end: "2026-06-30", progress: 72, status: "בביצוע", lead: "יוסי כהן", budget: 1850000, actual: 1410000 },
  { id: "PRJ-002", name: "קיר מסך בית חולים", client: "שערי צדק", type: "קירות מסך", start: "2025-12-15", end: "2026-08-15", progress: 45, status: "בביצוע", lead: "שרה לוי", budget: 2400000, actual: 1080000 },
  { id: "PRJ-003", name: "מערכת כניסה קניון", client: "עזריאלי גרופ", type: "דלתות זכוכית", start: "2026-01-10", end: "2026-05-20", progress: 88, status: "בביצוע", lead: "דוד מזרחי", budget: 620000, actual: 545000 },
  { id: "PRJ-004", name: "החלפת חלונות בי\"ס", client: "עיריית תל אביב", type: "חלונות אלומיניום", start: "2026-02-01", end: "2026-04-30", progress: 95, status: "בביצוע", lead: "רחל אברהם", budget: 380000, actual: 361000 },
  { id: "PRJ-005", name: "חיפוי מגדל משרדים", client: "אמות השקעות", type: "חזיתות אלומיניום", start: "2025-09-01", end: "2026-03-31", progress: 100, status: "הושלם", lead: "אלון גולדשטיין", budget: 3200000, actual: 3050000 },
  { id: "PRJ-006", name: "דלתות וילה מותאמות", client: "משפחת ברק", type: "דלתות מעוצבות", start: "2026-03-01", end: "2026-06-15", progress: 30, status: "בביצוע", lead: "מיכל ברק", budget: 185000, actual: 55500 },
  { id: "PRJ-007", name: "קיר זכוכית לובי מלון", client: "מלון דן", type: "זכוכית מבנית", start: "2026-01-20", end: "2026-07-10", progress: 52, status: "בביצוע", lead: "עומר חדד", budget: 1100000, actual: 572000 },
  { id: "PRJ-008", name: "מערכת סקיילייט מפעל", client: "טבע תעשיות", type: "גגות שקופים", start: "2025-10-15", end: "2026-04-15", progress: 98, status: "בביצוע", lead: "נועה פרידמן", budget: 750000, actual: 735000 },
  { id: "PRJ-009", name: "שערי פלדה חניון", client: "חניוני אחוזת חוף", type: "שערי מתכת", start: "2026-02-20", end: "2026-05-30", progress: 60, status: "בעיכוב", lead: "איתי שמש", budget: 420000, actual: 294000 },
  { id: "PRJ-010", name: "ויטראז' בית כנסת", client: "קהילת אור חדש", type: "זכוכית אמנותית", start: "2025-12-01", end: "2026-09-01", progress: 35, status: "בביצוע", lead: "תמר הלוי", budget: 890000, actual: 311500 },
  { id: "PRJ-011", name: "חלונות ביטחון שגרירות", client: "משרד החוץ", type: "זכוכית בליסטית", start: "2026-01-05", end: "2026-06-20", progress: 55, status: "בביצוע", lead: "יוסי כהן", budget: 1650000, actual: 907500 },
  { id: "PRJ-012", name: "מעקה אצטדיון", client: "הפועל ת\"א", type: "מעקות מתכת", start: "2025-10-01", end: "2026-02-28", progress: 100, status: "הושלם", lead: "דוד מזרחי", budget: 560000, actual: 538000 },
];

/* ── milestones for timeline ── */
const FALLBACK_MILESTONES = [
  { project: "PRJ-001", name: "אישור שרטוטי ייצור", date: "2026-01-15", status: "הושלם" },
  { project: "PRJ-001", name: "השלמת ייצור קומות 1-10", date: "2026-03-20", status: "הושלם" },
  { project: "PRJ-001", name: "התקנה קומות 1-10", date: "2026-04-30", status: "בביצוע" },
  { project: "PRJ-001", name: "מסירה סופית", date: "2026-06-30", status: "עתידי" },
  { project: "PRJ-002", name: "מדידות שטח", date: "2026-01-10", status: "הושלם" },
  { project: "PRJ-002", name: "אישור אדריכלי", date: "2026-02-28", status: "הושלם" },
  { project: "PRJ-002", name: "ייצור פאנלים", date: "2026-05-15", status: "בביצוע" },
  { project: "PRJ-002", name: "התקנה באתר", date: "2026-07-01", status: "עתידי" },
  { project: "PRJ-003", name: "אישור דגם", date: "2026-02-01", status: "הושלם" },
  { project: "PRJ-003", name: "ייצור ומשלוח", date: "2026-03-30", status: "הושלם" },
  { project: "PRJ-003", name: "התקנה ובדיקות", date: "2026-05-01", status: "בביצוע" },
  { project: "PRJ-004", name: "פירוק ישנים", date: "2026-02-20", status: "הושלם" },
  { project: "PRJ-004", name: "התקנת חלונות חדשים", date: "2026-04-10", status: "באיחור" },
  { project: "PRJ-004", name: "מסירה", date: "2026-04-30", status: "עתידי" },
  { project: "PRJ-007", name: "הנדסת מבנים", date: "2026-02-15", status: "הושלם" },
  { project: "PRJ-007", name: "ייצור זכוכית", date: "2026-04-20", status: "בביצוע" },
  { project: "PRJ-007", name: "התקנה", date: "2026-06-10", status: "עתידי" },
  { project: "PRJ-009", name: "אישור תכנון", date: "2026-03-10", status: "הושלם" },
  { project: "PRJ-009", name: "ייצור שערים", date: "2026-04-20", status: "באיחור" },
  { project: "PRJ-009", name: "התקנה ובדיקות", date: "2026-05-20", status: "עתידי" },
  { project: "PRJ-010", name: "עיצוב ויטראז'", date: "2026-01-15", status: "הושלם" },
  { project: "PRJ-010", name: "ייצור לוחות", date: "2026-05-01", status: "בביצוע" },
  { project: "PRJ-010", name: "הרכבה באתר", date: "2026-08-01", status: "עתידי" },
  { project: "PRJ-011", name: "אישור ביטחוני", date: "2026-02-01", status: "הושלם" },
  { project: "PRJ-011", name: "ייצור זכוכית בליסטית", date: "2026-04-15", status: "בביצוע" },
  { project: "PRJ-011", name: "התקנה מאובטחת", date: "2026-06-01", status: "עתידי" },
];

/* ── resource allocation ── */
const FALLBACK_RESOURCES = [
  { engineer: "יוסי כהן", role: "מהנדס ראשי", projects: ["PRJ-001", "PRJ-011"], hoursWeek: 48, capacity: 90 },
  { engineer: "שרה לוי", role: "מהנדסת קונסטרוקציה", projects: ["PRJ-002"], hoursWeek: 42, capacity: 78 },
  { engineer: "דוד מזרחי", role: "מהנדס ייצור", projects: ["PRJ-003", "PRJ-012"], hoursWeek: 44, capacity: 82 },
  { engineer: "רחל אברהם", role: "מהנדסת פרויקטים", projects: ["PRJ-004"], hoursWeek: 38, capacity: 70 },
  { engineer: "אלון גולדשטיין", role: "מהנדס חזיתות", projects: ["PRJ-005"], hoursWeek: 20, capacity: 37 },
  { engineer: "מיכל ברק", role: "מעצבת תעשייתית", projects: ["PRJ-006"], hoursWeek: 32, capacity: 60 },
  { engineer: "עומר חדד", role: "מהנדס זכוכית", projects: ["PRJ-007"], hoursWeek: 40, capacity: 75 },
  { engineer: "נועה פרידמן", role: "מהנדסת גגות", projects: ["PRJ-008"], hoursWeek: 36, capacity: 67 },
  { engineer: "איתי שמש", role: "מהנדס מתכת", projects: ["PRJ-009"], hoursWeek: 45, capacity: 85 },
  { engineer: "תמר הלוי", role: "מהנדסת זכוכית אמנותית", projects: ["PRJ-010"], hoursWeek: 38, capacity: 72 },
];

/* ── helpers ── */
const statusColor = (s: string) =>
  s === "הושלם" ? "bg-green-500/20 text-green-300"
  : s === "בעיכוב" ? "bg-red-500/20 text-red-300"
  : s === "בביצוע" ? "bg-blue-500/20 text-blue-300"
  : "bg-gray-500/20 text-gray-300";

const msColor = (s: string) =>
  s === "הושלם" ? "bg-green-500/20 text-green-300"
  : s === "באיחור" ? "bg-red-500/20 text-red-300"
  : s === "בביצוע" ? "bg-amber-500/20 text-amber-300"
  : "bg-gray-500/20 text-gray-300";

const msDot = (s: string) =>
  s === "הושלם" ? "bg-green-400"
  : s === "באיחור" ? "bg-red-400"
  : s === "בביצוע" ? "bg-amber-400"
  : "bg-gray-400";

const capacityColor = (v: number) =>
  v >= 85 ? "text-red-400" : v >= 65 ? "text-amber-400" : "text-green-400";

const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");

const th = "p-3 text-right text-muted-foreground font-medium text-xs";
const td = "p-3 text-sm";

export default function EngineeringProjectsPage() {
  const { data: apiprojects } = useQuery({
    queryKey: ["/api/engineering/engineering-projects/projects"],
    queryFn: () => authFetch("/api/engineering/engineering-projects/projects").then(r => r.json()).catch(() => null),
  });
  const projects = Array.isArray(apiprojects) ? apiprojects : (apiprojects?.data ?? apiprojects?.items ?? FALLBACK_PROJECTS);


  const { data: apimilestones } = useQuery({
    queryKey: ["/api/engineering/engineering-projects/milestones"],
    queryFn: () => authFetch("/api/engineering/engineering-projects/milestones").then(r => r.json()).catch(() => null),
  });
  const milestones = Array.isArray(apimilestones) ? apimilestones : (apimilestones?.data ?? apimilestones?.items ?? FALLBACK_MILESTONES);


  const { data: apiresources } = useQuery({
    queryKey: ["/api/engineering/engineering-projects/resources"],
    queryFn: () => authFetch("/api/engineering/engineering-projects/resources").then(r => r.json()).catch(() => null),
  });
  const resources = Array.isArray(apiresources) ? apiresources : (apiresources?.data ?? apiresources?.items ?? FALLBACK_RESOURCES);

  const [tab, setTab] = useState("projects");
  const [search, setSearch] = useState("");

  const activeProjects = projects.filter(p => p.status !== "הושלם");
  const completedQtr = projects.filter(p => p.status === "הושלם").length;
  const onTimeCount = activeProjects.filter(p => p.status !== "בעיכוב").length;
  const onTimePct = Math.round((onTimeCount / Math.max(activeProjects.length, 1)) * 100);
  const totalHours = resources.reduce((s, r) => s + r.hoursWeek, 0);
  const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
  const totalActual = projects.reduce((s, p) => s + p.actual, 0);
  const budgetPct = Math.round((totalActual / totalBudget) * 100);
  const overdueMilestones = milestones.filter(m => m.status === "באיחור").length;

  const kpis = [
    { label: "פרויקטים פעילים", value: String(activeProjects.length), icon: FolderKanban, color: "text-blue-400", trend: "+2", up: true },
    { label: "עמידה בלו\"ז", value: onTimePct + "%", icon: CheckCircle2, color: "text-green-400", trend: "+5%", up: true },
    { label: "שעות הנדסה שבועיות", value: String(totalHours), icon: Timer, color: "text-purple-400", trend: "+12", up: true },
    { label: "ניצול תקציב", value: budgetPct + "%", icon: Wallet, color: "text-cyan-400", trend: "-3%", up: true },
    { label: "אבני דרך באיחור", value: String(overdueMilestones), icon: AlertTriangle, color: "text-red-400", trend: "+1", up: false },
    { label: "הושלמו הרבעון", value: String(completedQtr), icon: CalendarDays, color: "text-emerald-400", trend: "+1", up: true },
  ];

  const filtered = projects.filter(p =>
    !search || p.name.includes(search) || p.client.includes(search) || p.id.includes(search) || p.lead.includes(search)
  );

  /* group milestones by project */
  const msGrouped = milestones.reduce<Record<string, typeof milestones>>((acc, m) => {
    (acc[m.project] ||= []).push(m);
    return acc;
  }, {});

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <HardHat className="h-6 w-6 text-blue-400" />
            ניהול פרויקטים הנדסיים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי -- Engineering Project Management</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש פרויקט..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9 w-56 bg-card/60 border-border text-sm"
            />
          </div>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
            <FolderKanban className="h-4 w-4" />פרויקט חדש
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {k.up ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                    <span className={`text-[10px] ${k.up ? "text-green-400" : "text-red-400"}`}>{k.trend}</span>
                  </div>
                </div>
                <k.icon className={`h-5 w-5 ${k.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Overall progress ── */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">תקציב כולל -- ₪{totalBudget.toLocaleString("he-IL")} | ביצוע בפועל</span>
            <span className="text-sm font-mono text-cyan-400">{budgetPct}%</span>
          </div>
          <Progress value={budgetPct} className="h-2" />
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-card/60 border border-border w-full justify-start gap-1 p-1 h-auto flex-wrap">
          <TabsTrigger value="projects" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><Building2 className="h-3.5 w-3.5" />פרויקטים</TabsTrigger>
          <TabsTrigger value="timeline" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><Milestone className="h-3.5 w-3.5" />ציר זמן</TabsTrigger>
          <TabsTrigger value="resources" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><Users className="h-3.5 w-3.5" />הקצאת משאבים</TabsTrigger>
          <TabsTrigger value="budget" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><DollarSign className="h-3.5 w-3.5" />תקציב</TabsTrigger>
        </TabsList>

        {/* ── Projects Tab ── */}
        <TabsContent value="projects">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מזהה</th><th className={th}>שם פרויקט</th><th className={th}>לקוח</th>
              <th className={th}>סוג</th><th className={th}>התחלה</th><th className={th}>סיום</th>
              <th className={th}>התקדמות</th><th className={th}>סטטוס</th><th className={th}>מהנדס אחראי</th>
            </tr></thead><tbody>
              {filtered.map((p, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400 font-bold`}>{p.id}</td>
                  <td className={`${td} text-foreground font-medium`}>{p.name}</td>
                  <td className={`${td} text-muted-foreground`}>{p.client}</td>
                  <td className={td}><Badge className="bg-indigo-500/20 text-indigo-300 border-0 text-xs">{p.type}</Badge></td>
                  <td className={`${td} font-mono text-muted-foreground text-xs`}>{p.start}</td>
                  <td className={`${td} font-mono text-muted-foreground text-xs`}>{p.end}</td>
                  <td className={`${td} w-32`}>
                    <div className="flex items-center gap-2">
                      <Progress value={p.progress} className="h-1.5 flex-1" />
                      <span className="text-xs font-mono text-muted-foreground w-8">{p.progress}%</span>
                    </div>
                  </td>
                  <td className={td}><Badge className={`${statusColor(p.status)} border-0 text-xs`}>{p.status}</Badge></td>
                  <td className={`${td} text-muted-foreground`}>{p.lead}</td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Timeline Tab ── */}
        <TabsContent value="timeline">
          <div className="space-y-3">
            {Object.entries(msGrouped).map(([projId, ms]) => {
              const proj = projects.find(p => p.id === projId);
              if (!proj) return null;
              return (
                <Card key={projId} className="bg-card/80 border-border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-blue-400 text-sm font-bold">{projId}</span>
                        <span className="text-foreground font-medium text-sm">{proj.name}</span>
                      </div>
                      <Badge className={`${statusColor(proj.status)} border-0 text-xs`}>{proj.status}</Badge>
                    </div>
                    {/* Gantt-like milestone bar */}
                    <div className="relative">
                      <div className="flex items-center gap-0.5">
                        {ms.map((m, idx) => {
                          const w = 100 / ms.length;
                          return (
                            <div key={idx} style={{ width: `${w}%` }} className="flex flex-col items-center">
                              <div className={`w-3 h-3 rounded-full ${msDot(m.status)} ring-2 ring-background`} />
                              {idx < ms.length - 1 && (
                                <div className="absolute top-1.5 h-0.5 bg-border" style={{ right: `${(idx * w) + w / 2}%`, width: `${w}%` }} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex mt-2">
                        {ms.map((m, idx) => (
                          <div key={idx} style={{ width: `${100 / ms.length}%` }} className="text-center px-1">
                            <p className="text-[11px] text-foreground font-medium leading-tight">{m.name}</p>
                            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{m.date}</p>
                            <Badge className={`${msColor(m.status)} border-0 text-[10px] mt-1`}>{m.status}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Resources Tab ── */}
        <TabsContent value="resources">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מהנדס</th><th className={th}>תפקיד</th><th className={th}>פרויקטים</th>
              <th className={th}>שעות / שבוע</th><th className={th}>ניצולת</th>
            </tr></thead><tbody>
              {resources.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} text-foreground font-medium`}>{r.engineer}</td>
                  <td className={`${td} text-muted-foreground`}>{r.role}</td>
                  <td className={td}>
                    <div className="flex gap-1 flex-wrap">
                      {r.projects.map(pid => (
                        <Badge key={pid} className="bg-blue-500/15 text-blue-300 border-0 text-[10px] font-mono">{pid}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className={`${td} font-mono`}>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span>{r.hoursWeek}</span>
                    </div>
                  </td>
                  <td className={`${td} w-40`}>
                    <div className="flex items-center gap-2">
                      <Progress value={r.capacity} className="h-1.5 flex-1" />
                      <span className={`text-xs font-mono font-bold ${capacityColor(r.capacity)}`}>{r.capacity}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
          {/* summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <Card className="bg-card/60 border-border">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">סה\"כ מהנדסים</p>
                <p className="text-xl font-bold font-mono text-blue-400 mt-1">{resources.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/60 border-border">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">שעות שבועיות כולל</p>
                <p className="text-xl font-bold font-mono text-purple-400 mt-1">{totalHours}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/60 border-border">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">ניצולת ממוצעת</p>
                <p className={`text-xl font-bold font-mono mt-1 ${capacityColor(Math.round(resources.reduce((s, r) => s + r.capacity, 0) / resources.length))}`}>
                  {Math.round(resources.reduce((s, r) => s + r.capacity, 0) / resources.length)}%
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Budget Tab ── */}
        <TabsContent value="budget">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מזהה</th><th className={th}>פרויקט</th><th className={th}>תקציב</th>
              <th className={th}>ביצוע בפועל</th><th className={th}>סטייה</th><th className={th}>ניצול %</th>
              <th className={th}>סטטוס</th>
            </tr></thead><tbody>
              {projects.map((p, i) => {
                const variance = p.actual - p.budget;
                const pct = Math.round((p.actual / p.budget) * 100);
                const overBudget = pct > 95 && p.status !== "הושלם";
                return (
                  <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className={`${td} font-mono text-blue-400 font-bold`}>{p.id}</td>
                    <td className={`${td} text-foreground font-medium`}>{p.name}</td>
                    <td className={`${td} font-mono text-muted-foreground`}>{fmt(p.budget)}</td>
                    <td className={`${td} font-mono text-foreground`}>{fmt(p.actual)}</td>
                    <td className={`${td} font-mono ${variance > 0 ? "text-red-400" : "text-green-400"}`}>
                      {variance > 0 ? "+" : ""}{fmt(variance)}
                    </td>
                    <td className={`${td} w-36`}>
                      <div className="flex items-center gap-2">
                        <Progress value={Math.min(pct, 100)} className="h-1.5 flex-1" />
                        <span className={`text-xs font-mono font-bold ${overBudget ? "text-red-400" : pct >= 75 ? "text-amber-400" : "text-green-400"}`}>{pct}%</span>
                      </div>
                    </td>
                    <td className={td}><Badge className={`${statusColor(p.status)} border-0 text-xs`}>{p.status}</Badge></td>
                  </tr>
                );
              })}
            </tbody></table>
          </div></CardContent></Card>
          {/* budget summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
            <Card className="bg-card/60 border-border">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">תקציב כולל</p>
                <p className="text-lg font-bold font-mono text-cyan-400 mt-1">{fmt(totalBudget)}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/60 border-border">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">ביצוע בפועל</p>
                <p className="text-lg font-bold font-mono text-blue-400 mt-1">{fmt(totalActual)}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/60 border-border">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">נותר</p>
                <p className="text-lg font-bold font-mono text-green-400 mt-1">{fmt(totalBudget - totalActual)}</p>
              </CardContent>
            </Card>
            <Card className="bg-card/60 border-border">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">חריגה ממוצעת</p>
                <p className="text-lg font-bold font-mono text-amber-400 mt-1">
                  {Math.round(projects.reduce((s, p) => s + ((p.actual / p.budget) * 100), 0) / projects.length)}%
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
