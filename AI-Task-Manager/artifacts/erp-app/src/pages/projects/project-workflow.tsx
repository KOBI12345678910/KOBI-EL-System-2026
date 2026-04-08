import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  GitBranch, ChevronLeft, Search, Zap, BarChart3, ArrowLeftRight,
  CheckCircle, Clock, AlertTriangle, Play, Pause, Settings,
  TrendingUp, Target, Truck, Wrench, FileText, CreditCard,
  ShieldCheck, HardHat, Package, Ruler, ClipboardList
} from "lucide-react";

const workflowStages = [
  { key: "lead_qualified", label: "ליד מאושר", icon: Target, color: "bg-slate-500" },
  { key: "site_visit", label: "ביקור באתר", icon: Ruler, color: "bg-blue-500" },
  { key: "estimate_created", label: "הערכת עלות", icon: FileText, color: "bg-indigo-500" },
  { key: "quote_approved", label: "הצעה מאושרת", icon: CheckCircle, color: "bg-violet-500" },
  { key: "project_opened", label: "פתיחת פרויקט", icon: Play, color: "bg-purple-500" },
  { key: "engineering_ready", label: "הנדסה מוכנה", icon: Settings, color: "bg-fuchsia-500" },
  { key: "procurement_started", label: "רכש הותחל", icon: Package, color: "bg-pink-500" },
  { key: "materials_received", label: "חומרים התקבלו", icon: Truck, color: "bg-rose-500" },
  { key: "production_started", label: "ייצור הותחל", icon: HardHat, color: "bg-amber-500" },
  { key: "qc_passed", label: "QC עבר", icon: ShieldCheck, color: "bg-yellow-500" },
  { key: "delivery_scheduled", label: "אספקה מתוזמנת", icon: Truck, color: "bg-lime-500" },
  { key: "installation_completed", label: "התקנה הושלמה", icon: Wrench, color: "bg-green-500" },
  { key: "punch_items_closed", label: "ליקויים נסגרו", icon: ClipboardList, color: "bg-emerald-500" },
  { key: "invoice_issued", label: "חשבונית הופקה", icon: CreditCard, color: "bg-teal-500" },
  { key: "payment_collected", label: "תשלום נגבה", icon: CreditCard, color: "bg-cyan-500" },
  { key: "project_closed", label: "פרויקט נסגר", icon: CheckCircle, color: "bg-sky-500" },
];

const FALLBACK_WF_PROJECTS = [
  { id: "WF-2001", name: "חלונות אלומיניום — מגדל הים", client: "גולדשטיין נדל\"ן", stage: "installation_completed", stageIdx: 11, value: 920000, pm: "אורי כהן" },
  { id: "WF-2002", name: "קירות מסך — משרדים הרצליה", client: "אמות השקעות", stage: "production_started", stageIdx: 8, value: 2100000, pm: "דנה לוי" },
  { id: "WF-2003", name: "דלתות פלדה — בית ספר אורט", client: "משרד החינוך", stage: "engineering_ready", stageIdx: 5, value: 380000, pm: "יוסי מרקוביץ" },
  { id: "WF-2004", name: "מעקות בטיחות — שיכון נוף", client: "שיכון ובינוי", stage: "site_visit", stageIdx: 1, value: 260000, pm: "מירי אביטל" },
  { id: "WF-2005", name: "פרגולות מתכת — סינמה סיטי", client: "סינמה סיטי בע\"מ", stage: "invoice_issued", stageIdx: 13, value: 185000, pm: "אורי כהן" },
  { id: "WF-2006", name: "שערי חניון — מגדל רמת גן", client: "אלקטרה נדל\"ן", stage: "project_closed", stageIdx: 15, value: 410000, pm: "דנה לוי" },
  { id: "WF-2007", name: "זכוכית חזיתית — מלון דניאל", client: "קבוצת דניאל", stage: "procurement_started", stageIdx: 6, value: 1750000, pm: "יוסי מרקוביץ" },
  { id: "WF-2008", name: "חלונות עץ-אלומיניום — וילה פרטית", client: "משפחת בן דוד", stage: "quote_approved", stageIdx: 3, value: 145000, pm: "מירי אביטל" },
];

const FALLBACK_AUTOMATION_RULES = [
  { id: "AR-01", name: "פתיחת פרויקט אוטומטית", trigger: "הצעת מחיר מאושרת על ידי הלקוח", action: "יצירת פרויקט חדש, הקצאת מנהל פרויקט, פתיחת תיק הנדסי", status: "active", runs: 23, lastRun: "2026-04-07" },
  { id: "AR-02", name: "התראת חריגת תקציב", trigger: "ניצול תקציב עובר 90% מהמתוכנן", action: "שליחת התראה למנהל פרויקט + מנהל כספים, הקפאת הזמנות חדשות", status: "active", runs: 8, lastRun: "2026-04-05" },
  { id: "AR-03", name: "התראת איחור בלוח זמנים", trigger: "שלב נשאר מעל 5 ימים מעבר ליעד", action: "שליחת אסקלציה למנהל תפעול, עדכון סטטוס ל-'באיחור'", status: "active", runs: 12, lastRun: "2026-04-06" },
  { id: "AR-04", name: "הפעלת רכש אוטומטי", trigger: "שלב הנדסה מוכנה — BOM סופי מאושר", action: "יצירת הזמנות רכש לכל חומרי הגלם, עדכון לוח זמנים צפוי", status: "active", runs: 15, lastRun: "2026-04-04" },
  { id: "AR-05", name: "עדכון שינויי הזמנה", trigger: "אישור הזמנת שינוי (Change Order) על ידי הלקוח", action: "עדכון תקציב, עדכון לוח זמנים, שליחת הודעה לכל הצוותים", status: "paused", runs: 4, lastRun: "2026-03-28" },
];

const FALLBACK_STAGE_ANALYTICS = [
  { stage: "lead_qualified", avgDays: 3.2, projects: 45, bottleneck: false },
  { stage: "site_visit", avgDays: 5.1, projects: 42, bottleneck: false },
  { stage: "estimate_created", avgDays: 7.8, projects: 40, bottleneck: true },
  { stage: "quote_approved", avgDays: 12.4, projects: 38, bottleneck: true },
  { stage: "project_opened", avgDays: 1.5, projects: 36, bottleneck: false },
  { stage: "engineering_ready", avgDays: 14.2, projects: 34, bottleneck: true },
  { stage: "procurement_started", avgDays: 8.6, projects: 32, bottleneck: false },
  { stage: "materials_received", avgDays: 18.3, projects: 30, bottleneck: true },
  { stage: "production_started", avgDays: 15.7, projects: 29, bottleneck: false },
  { stage: "qc_passed", avgDays: 3.4, projects: 27, bottleneck: false },
  { stage: "delivery_scheduled", avgDays: 4.1, projects: 26, bottleneck: false },
  { stage: "installation_completed", avgDays: 10.5, projects: 24, bottleneck: false },
  { stage: "punch_items_closed", avgDays: 8.9, projects: 22, bottleneck: true },
  { stage: "invoice_issued", avgDays: 2.1, projects: 21, bottleneck: false },
  { stage: "payment_collected", avgDays: 22.6, projects: 20, bottleneck: true },
  { stage: "project_closed", avgDays: 1.2, projects: 19, bottleneck: false },
];

const stageTransitions = [
  { id: "TR-01", project: "WF-2001", from: "punch_items_closed", to: "installation_completed", by: "חיים ביטון", date: "2026-04-07", time: "14:30", note: "סיום התקנה מלאה — ליקויים ייבדקו" },
  { id: "TR-02", project: "WF-2002", from: "materials_received", to: "production_started", by: "דנה לוי", date: "2026-04-06", time: "09:15", note: "כל החומרים התקבלו — ייצור מתחיל" },
  { id: "TR-03", project: "WF-2007", from: "engineering_ready", to: "procurement_started", by: "יוסי מרקוביץ", date: "2026-04-05", time: "11:00", note: "BOM אושר — הזמנות רכש נשלחו" },
  { id: "TR-04", project: "WF-2005", from: "punch_items_closed", to: "invoice_issued", by: "אורי כהן", date: "2026-04-04", time: "16:45", note: "כל הליקויים נסגרו — חשבונית הופקה" },
  { id: "TR-05", project: "WF-2008", from: "estimate_created", to: "quote_approved", by: "מירי אביטל", date: "2026-04-03", time: "13:20", note: "הלקוח אישר הצעה — ₪145,000" },
  { id: "TR-06", project: "WF-2003", from: "project_opened", to: "engineering_ready", by: "נועם גולן", date: "2026-04-02", time: "10:00", note: "שרטוטים הושלמו — מוכן לרכש" },
  { id: "TR-07", project: "WF-2006", from: "payment_collected", to: "project_closed", by: "דנה לוי", date: "2026-04-01", time: "15:30", note: "תשלום מלא התקבל — פרויקט נסגר" },
  { id: "TR-08", project: "WF-2004", from: "lead_qualified", to: "site_visit", by: "מירי אביטל", date: "2026-03-31", time: "08:45", note: "ביקור באתר תואם ל-01/04" },
];

const bottleneckDetails = [
  { stage: "estimate_created", reason: "המתנה לתשובות מהנדס חיצוני", suggestion: "שכירת מהנדס נוסף לצוות הערכות", impact: "₪180,000 עלות הזדמנות חודשית" },
  { stage: "quote_approved", reason: "זמן אישור לקוח ממושך", suggestion: "מעקב יזום אחרי 7 ימים + הנחה לאישור מוקדם", impact: "3 פרויקטים תקועים כרגע" },
  { stage: "engineering_ready", reason: "עומס על צוות הנדסה — שרטוטים מורכבים", suggestion: "חלוקת עבודה לקבלני משנה הנדסיים", impact: "איחור ממוצע של 4.2 ימים" },
  { stage: "materials_received", reason: "עיכובים בשרשרת האספקה — ייבוא אלומיניום", suggestion: "ספק גיבוי מקומי + מלאי ביטחון", impact: "עיכוב ממוצע של 6.1 ימים" },
  { stage: "punch_items_closed", reason: "ליקויים חוזרים — בעיות אטימה ואיכות גמר", suggestion: "הכשרת צוותים + רשימת בדיקה מוקדמת", impact: "עלות תיקון ₪12,000 לפרויקט" },
  { stage: "payment_collected", reason: "תנאי תשלום ארוכים — שוטף+60", suggestion: "תנאי תשלום מותנים בשלבים + קנסות איחור", impact: "₪2.1M חוב פתוח כרגע" },
];

const transitionStats = [
  { period: "השבוע", transitions: 6, avgTime: "1.2 שעות", fastest: "פתיחת פרויקט", slowest: "גביית תשלום" },
  { period: "החודש", transitions: 24, avgTime: "2.8 שעות", fastest: "פתיחת פרויקט", slowest: "אישור הצעה" },
  { period: "הרבעון", transitions: 87, avgTime: "3.1 שעות", fastest: "סגירת פרויקט", slowest: "קבלת חומרים" },
];

const stageLabel = (key: string) => workflowStages.find(s => s.key === key)?.label || key;
const stageColor = (key: string) => workflowStages.find(s => s.key === key)?.color || "bg-slate-500";
const fmt = (n: number) => "₪" + new Intl.NumberFormat("he-IL").format(n);
export default function ProjectWorkflowPage() {
  const [tab, setTab] = useState("pipeline");
  const [search, setSearch] = useState("");

  const { data: apiWf } = useQuery({
    queryKey: ["project-workflow"],
    queryFn: async () => { const r = await authFetch("/api/projects/workflow"); return r.json(); },
  });
  const projects = apiWf?.projects ?? apiWf?.data?.projects ?? FALLBACK_WF_PROJECTS;
  const automationRules = apiWf?.automationRules ?? apiWf?.data?.automationRules ?? FALLBACK_AUTOMATION_RULES;
  const stageAnalytics = apiWf?.stageAnalytics ?? apiWf?.data?.stageAnalytics ?? FALLBACK_STAGE_ANALYTICS;
  const maxBar = Math.max(...stageAnalytics.map((s: any) => s.avgDays));

  const filtered = projects.filter((p: any) =>
    p.name.includes(search) || p.client.includes(search) || p.id.includes(search)
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <GitBranch className="w-7 h-7 text-blue-400" /> ניהול תהליך פרויקט — 16 שלבים
          </h1>
          <p className="text-sm text-slate-400 mt-1">טכנו-כל עוזי — מעקב אוטומציה, שלבים, צווארי בקבוק ומעברי שלבים</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="חיפוש פרויקט..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9 bg-[#1e293b] border-slate-700 text-white w-56"
            />
          </div>
        </div>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "פרויקטים פעילים", value: projects.filter(p => p.stage !== "project_closed").length, icon: GitBranch, color: "text-blue-400" },
          { label: "כללי אוטומציה פעילים", value: automationRules.filter(r => r.status === "active").length, icon: Zap, color: "text-amber-400" },
          { label: "שלבי צוואר בקבוק", value: stageAnalytics.filter(s => s.bottleneck).length, icon: AlertTriangle, color: "text-red-400" },
          { label: "מעברים השבוע", value: stageTransitions.filter(t => t.date >= "2026-03-31").length, icon: ArrowLeftRight, color: "text-emerald-400" },
        ].map(k => (
          <Card key={k.label} className="bg-[#1e293b] border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`w-8 h-8 ${k.color}`} />
              <div>
                <p className="text-2xl font-bold text-white">{k.value}</p>
                <p className="text-xs text-slate-400">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#1e293b] border-slate-700">
          <TabsTrigger value="pipeline"><GitBranch className="w-4 h-4 ml-1" />צינור עבודה</TabsTrigger>
          <TabsTrigger value="automation"><Zap className="w-4 h-4 ml-1" />כללי אוטומציה</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="w-4 h-4 ml-1" />ניתוח שלבים</TabsTrigger>
          <TabsTrigger value="transitions"><ArrowLeftRight className="w-4 h-4 ml-1" />מעברי שלבים</TabsTrigger>
        </TabsList>

        {/* TAB 1: Workflow Pipeline */}
        <TabsContent value="pipeline" className="space-y-6">
          {/* Visual 16-step flow */}
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg">תהליך 16 השלבים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1 items-center">
                {workflowStages.map((stage, i) => {
                  const count = projects.filter(p => p.stage === stage.key).length;
                  return (
                    <div key={stage.key} className="flex items-center">
                      <div className={`rounded-lg px-3 py-2 text-center min-w-[90px] ${count > 0 ? stage.color + "/20 border border-current" : "bg-slate-800 border border-slate-700"}`}>
                        <stage.icon className={`w-4 h-4 mx-auto mb-1 ${count > 0 ? "text-white" : "text-slate-500"}`} />
                        <p className={`text-[10px] font-medium ${count > 0 ? "text-white" : "text-slate-500"}`}>{stage.label}</p>
                        {count > 0 && <Badge className={`${stage.color} text-white text-[10px] mt-1`}>{count}</Badge>}
                      </div>
                      {i < workflowStages.length - 1 && <ChevronLeft className="w-4 h-4 text-slate-600 mx-0.5" />}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Projects at various stages */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(p => {
              const pct = Math.round(((p.stageIdx + 1) / 16) * 100);
              return (
                <Card key={p.id} className="bg-[#1e293b] border-slate-700">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-bold">{p.name}</p>
                        <p className="text-xs text-slate-400">{p.id} | {p.client} | {p.pm}</p>
                      </div>
                      <p className="text-sm font-bold text-emerald-400">{fmt(p.value)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`${stageColor(p.stage)}/20 text-white text-xs`}>{stageLabel(p.stage)}</Badge>
                      <span className="text-xs text-slate-400">שלב {p.stageIdx + 1}/16</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Progress value={pct} className="flex-1 h-2" />
                      <span className="text-xs text-slate-300 font-bold">{pct}%</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* TAB 2: Automation Rules */}
        <TabsContent value="automation" className="space-y-4">
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" /> כללי אוטומציה — 5 כללים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {automationRules.map(rule => (
                <div key={rule.id} className="bg-slate-800/60 rounded-lg p-4 border border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge className={rule.status === "active" ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-500/20 text-slate-400"}>
                        {rule.status === "active" ? "פעיל" : "מושהה"}
                      </Badge>
                      <span className="text-white font-bold">{rule.name}</span>
                      <span className="text-xs text-slate-500">{rule.id}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`text-xs border-slate-600 ${rule.status === "active" ? "text-amber-400" : "text-emerald-400"}`}
                    >
                      {rule.status === "active" ? <><Pause className="w-3 h-3 ml-1" />השהה</> : <><Play className="w-3 h-3 ml-1" />הפעל</>}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="bg-slate-900/50 rounded p-3">
                      <p className="text-xs text-slate-500 mb-1">טריגר</p>
                      <p className="text-slate-300">{rule.trigger}</p>
                    </div>
                    <div className="bg-slate-900/50 rounded p-3">
                      <p className="text-xs text-slate-500 mb-1">פעולה</p>
                      <p className="text-slate-300">{rule.action}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>הרצות: {rule.runs}</span>
                    <span>הרצה אחרונה: {rule.lastRun}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: Stage Analytics */}
        <TabsContent value="analytics" className="space-y-4">
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" /> זמן ממוצע לכל שלב (ימים)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stageAnalytics.map(sa => (
                <div key={sa.stage} className="flex items-center gap-3">
                  <span className="text-xs text-slate-300 w-28 text-left truncate">{stageLabel(sa.stage)}</span>
                  <div className="flex-1 h-6 bg-slate-800 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full rounded-full ${sa.bottleneck ? "bg-red-500/70" : "bg-blue-500/70"}`}
                      style={{ width: `${(sa.avgDays / maxBar) * 100}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-3 text-[11px] text-white font-medium">
                      {sa.avgDays} ימים
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 w-16 text-center">{sa.projects} פרויקטים</span>
                  {sa.bottleneck && (
                    <Badge className="bg-red-500/20 text-red-400 text-[10px]">
                      <AlertTriangle className="w-3 h-3 ml-1" />צוואר בקבוק
                    </Badge>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-[#1e293b] border-slate-700">
              <CardContent className="p-4 text-center">
                <TrendingUp className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">139.6</p>
                <p className="text-xs text-slate-400">ימים ממוצע — מליד עד סגירה</p>
              </CardContent>
            </Card>
            <Card className="bg-[#1e293b] border-slate-700">
              <CardContent className="p-4 text-center">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">6</p>
                <p className="text-xs text-slate-400">שלבי צוואר בקבוק מזוהים</p>
              </CardContent>
            </Card>
            <Card className="bg-[#1e293b] border-slate-700">
              <CardContent className="p-4 text-center">
                <Clock className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                <p className="text-2xl font-bold text-white">22.6</p>
                <p className="text-xs text-slate-400">ימים — השלב האיטי ביותר (גביית תשלום)</p>
              </CardContent>
            </Card>
          </div>

          {/* Bottleneck Details */}
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" /> פירוט צווארי בקבוק — סיבות והמלצות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bottleneckDetails.map(bd => (
                <div key={bd.stage} className="bg-slate-800/60 rounded-lg p-4 border border-red-900/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className="bg-red-500/20 text-red-400 text-xs">{stageLabel(bd.stage)}</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">סיבת עיכוב</p>
                      <p className="text-slate-300">{bd.reason}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">המלצה לשיפור</p>
                      <p className="text-emerald-400">{bd.suggestion}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">השפעה עסקית</p>
                      <p className="text-amber-400">{bd.impact}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4: Stage Transitions */}
        <TabsContent value="transitions" className="space-y-4">
          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-emerald-400" /> מעברי שלבים אחרונים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stageTransitions.map(tr => (
                <div key={tr.id} className="bg-slate-800/60 rounded-lg p-4 border border-slate-700">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{tr.id}</span>
                      <span className="text-white font-bold text-sm">{projects.find(p => p.id === tr.project)?.name || tr.project}</span>
                    </div>
                    <span className="text-xs text-slate-500">{tr.date} {tr.time}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={`${stageColor(tr.from)}/20 text-white text-xs`}>{stageLabel(tr.from)}</Badge>
                    <ChevronLeft className="w-4 h-4 text-emerald-400" />
                    <Badge className={`${stageColor(tr.to)}/20 text-white text-xs`}>{stageLabel(tr.to)}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">בוצע ע"י: <span className="text-white">{tr.by}</span></span>
                    <span className="text-slate-500">{tr.note}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          {/* Transition Stats Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {transitionStats.map(ts => (
              <Card key={ts.period} className="bg-[#1e293b] border-slate-700">
                <CardContent className="p-4 space-y-2">
                  <p className="text-sm font-bold text-white">{ts.period}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-slate-500">מעברים</p>
                      <p className="text-white font-bold text-lg">{ts.transitions}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">זמן ממוצע</p>
                      <p className="text-white font-bold text-lg">{ts.avgTime}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">המהיר ביותר</p>
                      <p className="text-emerald-400">{ts.fastest}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">האיטי ביותר</p>
                      <p className="text-red-400">{ts.slowest}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}