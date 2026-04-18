import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Lightbulb, Beaker, FlaskConical, TestTube, Clock, TrendingUp,
  DollarSign, Award, Rocket, Target, Star, FileText, Search,
  ChevronLeft, ChevronRight, AlertTriangle, CheckCircle, Layers,
  Shield, Thermometer, Wind, Volume2, Blinds, Smartphone, Weight,
  BarChart3, Sparkles, ArrowUpRight, ArrowDownRight, Flame
} from "lucide-react";

/* ── KPIs ── */
const FALLBACK_KPIS = [
  { label: "פרויקטי מו\"פ פעילים", value: "12", icon: FlaskConical, color: "text-blue-600", bg: "bg-blue-50", trend: "+2" },
  { label: "מוצרים בצנרת", value: "8", icon: Layers, color: "text-purple-600", bg: "bg-purple-50", trend: "+1" },
  { label: "שלב אב-טיפוס", value: "4", icon: Beaker, color: "text-amber-600", bg: "bg-amber-50", trend: "" },
  { label: "שלב בדיקות", value: "3", icon: TestTube, color: "text-emerald-600", bg: "bg-emerald-50", trend: "" },
  { label: "Time-to-Market ממוצע", value: "8.2 חודשים", icon: Clock, color: "text-indigo-600", bg: "bg-indigo-50", trend: "-0.6" },
  { label: "ניצול תקציב מו\"פ", value: "74%", icon: DollarSign, color: "text-teal-600", bg: "bg-teal-50", trend: "" },
  { label: "חידושים השנה", value: "6", icon: Lightbulb, color: "text-orange-600", bg: "bg-orange-50", trend: "+3" },
  { label: "פטנטים שהוגשו", value: "2", icon: Award, color: "text-rose-600", bg: "bg-rose-50", trend: "+1" },
];

/* ── Pipeline Stages ── */
const FALLBACK_PIPELINE_STAGES = [
  { stage: "רעיון / הערכה", count: 5, color: "bg-slate-400" },
  { stage: "מחקר ראשוני", count: 3, color: "bg-blue-400" },
  { stage: "תכנון מפורט", count: 2, color: "bg-purple-500" },
  { stage: "אב-טיפוס", count: 4, color: "bg-amber-500" },
  { stage: "בדיקות ותיקוף", count: 3, color: "bg-emerald-500" },
  { stage: "הכנה לייצור", count: 1, color: "bg-green-600" },
];

/* ── Milestones ── */
const FALLBACK_MILESTONES = [
  { date: "2026-04-06", project: "מערכת חלון Thermal Break", event: "אב-טיפוס v2 הושלם בהצלחה", type: "success" },
  { date: "2026-04-04", project: "זכוכית חכמה Smart Glass", event: "סיום סקר שוק — אישור להמשך פיתוח", type: "success" },
  { date: "2026-04-02", project: "תריס עמיד הוריקן", event: "בדיקת עמידות ASTM E1886 — עבר", type: "success" },
  { date: "2026-03-30", project: "דלת זכוכית חסינת אש", event: "עיכוב באישור תקן EI-60 — צפי 3 שבועות", type: "warning" },
  { date: "2026-03-28", project: "קיר מסך Triple-Glazed", event: "סיום שלב תכנון מפורט — מעבר לאב-טיפוס", type: "success" },
];

const FALLBACK_URGENT_ITEMS = [
  { project: "דלת זכוכית חסינת אש", issue: "עיכוב באישור תקן — נדרש מעקב מול מכון התקנים", priority: "high" },
  { project: "לוּבר ממונע", issue: "ספק מנועים הודיע על שינוי מפרט — נדרשת הערכה מחדש", priority: "high" },
  { project: "פאנל אלומיניום קל-משקל", issue: "תוצאות מבחן כיפוף לא עמדו ביעד — דרוש עיצוב מחדש", priority: "medium" },
];

/* ── R&D Projects (8) ── */
const FALLBACK_RD_PROJECTS = [
  { id: "RD-101", name: "מערכת חלון Thermal Break", icon: Thermometer, stage: "אב-טיפוס", progress: 72, lead: "מהנדס דוד לוי", budget: 180000, spent: 126000, start: "2025-09", eta: "2026-08", status: "on_track", desc: "חלון אלומיניום עם גשר תרמי מתקדם — Uf 1.2 W/m²K" },
  { id: "RD-102", name: "קיר מסך Triple-Glazed", icon: Layers, stage: "אב-טיפוס", progress: 55, lead: "מהנדסת רונית כהן", budget: 320000, spent: 192000, start: "2025-07", eta: "2026-11", status: "on_track", desc: "קיר מסך חיצוני עם זיגוג משולש — חיסכון אנרגטי 40%" },
  { id: "RD-103", name: "דלת זכוכית חסינת אש EI-60", icon: Flame, stage: "בדיקות", progress: 85, lead: "מהנדס עומר חדד", budget: 150000, spent: 135000, start: "2025-05", eta: "2026-06", status: "at_risk", desc: "דלת זכוכית עמידה לאש 60 דקות — תקן ישראלי ואירופי" },
  { id: "RD-104", name: "לוּבר ממונע אוטומטי", icon: Blinds, stage: "תכנון מפורט", progress: 38, lead: "מהנדס אמיר נאור", budget: 95000, spent: 41000, start: "2025-11", eta: "2026-10", status: "at_risk", desc: "מערכת לוּברים ממונעת עם בקרת אור חכמה ושלט רחוק" },
  { id: "RD-105", name: "חלון אקוסטי מתקדם", icon: Volume2, stage: "בדיקות", progress: 78, lead: "מהנדסת ליאת ברק", budget: 120000, spent: 98000, start: "2025-08", eta: "2026-07", status: "on_track", desc: "חלון בידוד אקוסטי Rw 45dB — זכוכית למינציה עם PVB" },
  { id: "RD-106", name: "תריס עמיד הוריקן", icon: Wind, stage: "בדיקות", progress: 88, lead: "מהנדס יוסי מזרחי", budget: 200000, spent: 182000, start: "2025-04", eta: "2026-05", status: "on_track", desc: "תריס אלומיניום חיצוני — עמידות לרוחות 250 קמ\"ש ASTM" },
  { id: "RD-107", name: "אינטגרציית זכוכית חכמה", icon: Smartphone, stage: "מחקר ראשוני", progress: 22, lead: "מהנדס נועם שפירא", budget: 250000, spent: 58000, start: "2026-01", eta: "2027-03", status: "on_track", desc: "זכוכית אלקטרוכרומית עם בקרה באפליקציה — שינוי שקיפות" },
  { id: "RD-108", name: "פאנל אלומיניום קל-משקל", icon: Weight, stage: "אב-טיפוס", progress: 45, lead: "מהנדסת מיכל אורן", budget: 140000, spent: 70000, start: "2025-10", eta: "2026-09", status: "delayed", desc: "פאנל חיפוי מבנים — חיסכון 30% במשקל עם ליבת חלת דבש" },
];

/* ── Innovation Backlog ── */
const FALLBACK_INNOVATION_IDEAS = [
  { id: "IDEA-301", title: "ציפוי ננו אנטי-לכלוך לזכוכית", score: 92, market: "גבוה", effort: "בינוני", category: "חומרים", submitter: "צוות מו\"פ" },
  { id: "IDEA-302", title: "חלון סולארי — ייצור חשמל מזכוכית", score: 88, market: "גבוה מאוד", effort: "גבוה", category: "אנרגיה", submitter: "דוד לוי" },
  { id: "IDEA-303", title: "מערכת אוורור משולבת במסגרת", score: 81, market: "בינוני", effort: "נמוך", category: "אינטגרציה", submitter: "רונית כהן" },
  { id: "IDEA-304", title: "פרופיל ממוחזר 100% — קו ירוק", score: 79, market: "גבוה", effort: "בינוני", category: "קיימות", submitter: "צוות ייצור" },
  { id: "IDEA-305", title: "חיישן פריצה משולב במסגרת חלון", score: 75, market: "בינוני", effort: "בינוני", category: "IoT", submitter: "נועם שפירא" },
  { id: "IDEA-306", title: "זיגוג אנטי-בקטריאלי לחדרי ניתוח", score: 72, market: "נישתי", effort: "גבוה", category: "בריאות", submitter: "ליאת ברק" },
  { id: "IDEA-307", title: "מסגרת חלון מודפסת 3D", score: 68, market: "בינוני", effort: "גבוה", category: "ייצור", submitter: "אמיר נאור" },
];

/* ── Budget Data ── */
const budgetSummary = {
  totalBudget: 1455000,
  totalSpent: 902000,
  utilization: 62,
  forecast: 1380000,
};

export default function ProductDevCommandCenter() {
  const { data: productdevcommandcenterData } = useQuery({
    queryKey: ["product-dev-command-center"],
    queryFn: () => authFetch("/api/product-dev/product_dev_command_center"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = productdevcommandcenterData ?? FALLBACK_KPIS;
  const innovationIdeas = FALLBACK_INNOVATION_IDEAS;
  const milestones = FALLBACK_MILESTONES;
  const pipelineStages = FALLBACK_PIPELINE_STAGES;
  const rdProjects = FALLBACK_RD_PROJECTS;
  const urgentItems = FALLBACK_URGENT_ITEMS;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Rocket className="h-7 w-7 text-primary" /> מרכז פיקוד מו"פ ופיתוח מוצר
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">פרויקטי מו"פ | צנרת מוצרים | חדשנות | תקציב — טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="חיפוש פרויקט..." className="w-52 h-8 text-xs" />
          <Button size="sm" variant="outline" className="text-xs gap-1"><Search className="h-3.5 w-3.5" />חפש</Button>
        </div>
      </div>

      {/* KPI Strip — 8 cards */}
      <div className="grid grid-cols-8 gap-2">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg}/40 border-0 shadow-sm`}>
              <CardContent className="pt-2 pb-1.5 text-center px-1">
                <Icon className={`h-3.5 w-3.5 mx-auto ${kpi.color} mb-0.5`} />
                <p className="text-[8px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-sm font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                {kpi.trend && (
                  <span className={`text-[8px] font-medium ${kpi.trend.startsWith("-") ? "text-emerald-600" : "text-blue-600"}`}>
                    {kpi.trend.startsWith("-") ? <ArrowDownRight className="inline h-2.5 w-2.5" /> : <ArrowUpRight className="inline h-2.5 w-2.5" />}
                    {kpi.trend}
                  </span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="overview" className="text-xs gap-1"><Target className="h-3.5 w-3.5" /> סקירה כללית</TabsTrigger>
          <TabsTrigger value="projects" className="text-xs gap-1"><FlaskConical className="h-3.5 w-3.5" /> פרויקטים ({rdProjects.length})</TabsTrigger>
          <TabsTrigger value="innovation" className="text-xs gap-1"><Lightbulb className="h-3.5 w-3.5" /> חדשנות</TabsTrigger>
          <TabsTrigger value="budget" className="text-xs gap-1"><DollarSign className="h-3.5 w-3.5" /> תקציב מו"פ</TabsTrigger>
        </TabsList>

        {/* ═══ TAB 1: Overview ═══ */}
        <TabsContent value="overview" className="space-y-4 mt-3">
          {/* Pipeline Funnel */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-4 w-4 text-purple-600" /> שלבי צנרת מוצרים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-28">
                {pipelineStages.map((s, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-lg font-bold">{s.count}</span>
                    <div className={`w-full rounded-t ${s.color}`} style={{ height: `${s.count * 18}px` }} />
                    <span className="text-[9px] text-muted-foreground text-center leading-tight mt-1">{s.stage}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            {/* Recent Milestones */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Star className="h-4 w-4 text-amber-500" /> אבני דרך אחרונות</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {milestones.map((m, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs border-b pb-2 last:border-0">
                    {m.type === "success"
                      ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />}
                    <div className="flex-1">
                      <p className="font-medium">{m.project}</p>
                      <p className="text-muted-foreground">{m.event}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{m.date}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Urgent Items */}
            <Card className="border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-red-700"><AlertTriangle className="h-4 w-4" /> פריטים דחופים</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {urgentItems.map((u, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs border-b pb-2 last:border-0">
                    <Badge className={`text-[9px] shrink-0 ${u.priority === "high" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {u.priority === "high" ? "דחיפות גבוהה" : "דחיפות בינונית"}
                    </Badge>
                    <div className="flex-1">
                      <p className="font-medium">{u.project}</p>
                      <p className="text-muted-foreground">{u.issue}</p>
                    </div>
                  </div>
                ))}
                {/* Quick project status summary */}
                <div className="pt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-emerald-50 rounded p-1.5">
                    <p className="text-lg font-bold text-emerald-700">5</p>
                    <p className="text-[9px] text-muted-foreground">במסלול</p>
                  </div>
                  <div className="bg-amber-50 rounded p-1.5">
                    <p className="text-lg font-bold text-amber-700">2</p>
                    <p className="text-[9px] text-muted-foreground">בסיכון</p>
                  </div>
                  <div className="bg-red-50 rounded p-1.5">
                    <p className="text-lg font-bold text-red-700">1</p>
                    <p className="text-[9px] text-muted-foreground">באיחור</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ═══ TAB 2: Projects ═══ */}
        <TabsContent value="projects" className="space-y-3 mt-3">
          <div className="grid grid-cols-2 gap-3">
            {rdProjects.map((p) => {
              const Icon = p.icon;
              const statusColors: Record<string, string> = {
                on_track: "bg-emerald-100 text-emerald-700",
                at_risk: "bg-amber-100 text-amber-700",
                delayed: "bg-red-100 text-red-700",
              };
              const statusLabels: Record<string, string> = {
                on_track: "במסלול",
                at_risk: "בסיכון",
                delayed: "באיחור",
              };
              const budgetPct = Math.round((p.spent / p.budget) * 100);
              return (
                <Card key={p.id} className={`${p.status === "delayed" ? "border-red-200" : p.status === "at_risk" ? "border-amber-200" : "border-emerald-200"}`}>
                  <CardHeader className="pb-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary" />
                        <CardTitle className="text-xs">{p.name}</CardTitle>
                      </div>
                      <Badge className={`text-[9px] ${statusColors[p.status]}`}>{statusLabels[p.status]}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <p className="text-[10px] text-muted-foreground">{p.desc}</p>
                    <div className="flex justify-between text-muted-foreground">
                      <span>שלב: <strong className="text-foreground">{p.stage}</strong></span>
                      <span>אחראי: <strong className="text-foreground">{p.lead}</strong></span>
                    </div>
                    <div>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-muted-foreground">התקדמות</span>
                        <span className="font-mono font-bold">{p.progress}%</span>
                      </div>
                      <Progress value={p.progress} className="h-1.5" />
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>תחילה: {p.start}</span>
                      <span>צפי סיום: {p.eta}</span>
                      <span>תקציב: {budgetPct}% נוצל</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ═══ TAB 3: Innovation ═══ */}
        <TabsContent value="innovation" className="space-y-4 mt-3">
          <div className="grid grid-cols-3 gap-4">
            {/* Idea Backlog */}
            <Card className="col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" /> Backlog רעיונות חדשנות</CardTitle>
                  <Badge variant="secondary" className="text-[9px]">{innovationIdeas.length} רעיונות</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {innovationIdeas.map((idea) => (
                    <div key={idea.id} className="flex items-center gap-3 text-xs border rounded p-2 hover:bg-muted/50">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-amber-100 to-orange-100">
                        <span className="text-sm font-bold text-amber-700">{idea.score}</span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{idea.title}</p>
                        <div className="flex gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[8px]">{idea.category}</Badge>
                          <span className="text-muted-foreground">הוגש ע"י: {idea.submitter}</span>
                        </div>
                      </div>
                      <div className="text-left space-y-0.5">
                        <div className="text-[10px]">שוק: <strong className={idea.market === "גבוה מאוד" ? "text-emerald-600" : idea.market === "גבוה" ? "text-blue-600" : "text-muted-foreground"}>{idea.market}</strong></div>
                        <div className="text-[10px]">מאמץ: <strong className={idea.effort === "גבוה" ? "text-red-600" : idea.effort === "בינוני" ? "text-amber-600" : "text-emerald-600"}>{idea.effort}</strong></div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Innovation Scoring & Market Assessment */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-indigo-600" /> מדד חדשנות</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    { label: "פוטנציאל הכנסה", value: 85, color: "bg-emerald-500" },
                    { label: "יתרון תחרותי", value: 78, color: "bg-blue-500" },
                    { label: "היתכנות טכנית", value: 82, color: "bg-purple-500" },
                    { label: "התאמה אסטרטגית", value: 90, color: "bg-amber-500" },
                    { label: "מוכנות שוק", value: 71, color: "bg-teal-500" },
                  ].map((m, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span>{m.label}</span>
                        <span className="font-mono font-bold">{m.value}</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full ${m.color}`} style={{ width: `${m.value}%` }} />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /> הערכת הזדמנות שוק</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {[
                    { segment: "בנייה ירוקה / חיסכון אנרגטי", potential: "₪12M", growth: "+18%", rank: 1 },
                    { segment: "חזיתות מבנים גבוהים", potential: "₪8.5M", growth: "+12%", rank: 2 },
                    { segment: "ביטחון ועמידות מזג אוויר", potential: "₪6M", growth: "+9%", rank: 3 },
                    { segment: "בית חכם / IoT", potential: "₪4.2M", growth: "+25%", rank: 4 },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center gap-2 border-b pb-1.5 last:border-0">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">{s.rank}</span>
                      <div className="flex-1">
                        <p className="font-medium">{s.segment}</p>
                        <div className="flex gap-3 text-muted-foreground">
                          <span>פוטנציאל: <strong className="text-foreground">{s.potential}</strong></span>
                          <span className="text-emerald-600 font-medium">{s.growth}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ═══ TAB 4: Budget ═══ */}
        <TabsContent value="budget" className="space-y-4 mt-3">
          {/* Budget Summary */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "תקציב מו\"פ כולל", value: `₪${(budgetSummary.totalBudget / 1000).toFixed(0)}K`, icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "הוצאה בפועל", value: `₪${(budgetSummary.totalSpent / 1000).toFixed(0)}K`, icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
              { label: "ניצול תקציב", value: `${budgetSummary.utilization}%`, icon: Target, color: "text-teal-600", bg: "bg-teal-50" },
              { label: "תחזית שנתית", value: `₪${(budgetSummary.forecast / 1000).toFixed(0)}K`, icon: BarChart3, color: "text-amber-600", bg: "bg-amber-50" },
            ].map((s, i) => {
              const Icon = s.icon;
              return (
                <Card key={i} className={`${s.bg}/40`}>
                  <CardContent className="pt-3 pb-2 text-center">
                    <Icon className={`h-5 w-5 mx-auto ${s.color} mb-1`} />
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    <p className={`text-lg font-bold font-mono ${s.color}`}>{s.value}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Spend by Project */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4 text-indigo-600" /> הוצאות מו"פ לפי פרויקט (₪)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {rdProjects.map((p) => {
                const pct = Math.round((p.spent / p.budget) * 100);
                const overBudget = pct > 90;
                return (
                  <div key={p.id} className="text-xs">
                    <div className="flex justify-between mb-0.5">
                      <span className="font-medium">{p.name}</span>
                      <div className="flex gap-3">
                        <span className="text-muted-foreground">₪{(p.spent / 1000).toFixed(0)}K / ₪{(p.budget / 1000).toFixed(0)}K</span>
                        <span className={`font-mono font-bold ${overBudget ? "text-red-600" : "text-foreground"}`}>{pct}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${overBudget ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* ROI Tracking */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-emerald-600" /> מעקב ROI צפוי</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { project: "תריס עמיד הוריקן", investment: "₪200K", projectedRevenue: "₪1.8M", roi: "800%", timeline: "12 חודשים", confidence: "גבוהה" },
                  { project: "מערכת Thermal Break", investment: "₪180K", projectedRevenue: "₪1.2M", roi: "567%", timeline: "14 חודשים", confidence: "גבוהה" },
                  { project: "חלון אקוסטי", investment: "₪120K", projectedRevenue: "₪750K", roi: "525%", timeline: "10 חודשים", confidence: "בינונית" },
                  { project: "זכוכית חכמה", investment: "₪250K", projectedRevenue: "₪2.5M", roi: "900%", timeline: "24 חודשים", confidence: "נמוכה" },
                ].map((r, i) => (
                  <Card key={i} className="bg-muted/30">
                    <CardContent className="pt-3 pb-2 text-xs space-y-1.5">
                      <p className="font-semibold text-sm">{r.project}</p>
                      <div className="flex justify-between"><span className="text-muted-foreground">השקעה:</span><span className="font-mono">{r.investment}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">הכנסה צפויה:</span><span className="font-mono text-emerald-600">{r.projectedRevenue}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">ROI:</span><span className="font-mono font-bold text-emerald-700">{r.roi}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">לוח זמנים:</span><span>{r.timeline}</span></div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">ביטחון:</span>
                        <Badge className={`text-[8px] ${r.confidence === "גבוהה" ? "bg-emerald-100 text-emerald-700" : r.confidence === "בינונית" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{r.confidence}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
