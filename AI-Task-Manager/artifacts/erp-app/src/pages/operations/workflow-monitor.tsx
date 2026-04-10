import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Activity, CheckCircle2, AlertTriangle, Clock, Search, Download, Workflow, Timer, Target, Zap, ArrowRight, Pause, Play, XCircle, Bot, User } from "lucide-react";

const FALLBACK_ACTIVE_WORKFLOWS = [
  {
    id: "WF-1042", name: "ייצור חלונות אלומיניום - HN-4521", client: "קבלן אפק בניה",
    startDate: "06/04", dueDate: "10/04", progress: 65, currentStep: "ציפוי אבקתי",
    steps: [
      { name: "חיתוך פרופילים", status: "done", duration: "2:10" },
      { name: "כיפוף ועיבוד", status: "done", duration: "3:45" },
      { name: "ריתוך מסגרות", status: "done", duration: "4:20" },
      { name: "ציפוי אבקתי", status: "stuck", duration: "ממתין - תנור בתחזוקה" },
      { name: "זיגוג", status: "pending", duration: "---" },
      { name: "הרכבה סופית", status: "pending", duration: "---" },
      { name: "בקרת איכות", status: "pending", duration: "---" },
    ],
    sla: "בסיכון",
  },
  {
    id: "WF-1041", name: "דלתות הזזה - T-200 (סדרה)", client: "טרגט עיצובים",
    startDate: "05/04", dueDate: "12/04", progress: 40, currentStep: "ריתוך",
    steps: [
      { name: "חיתוך פרופילים", status: "done", duration: "1:50" },
      { name: "כיפוף מסילות", status: "done", duration: "2:30" },
      { name: "ריתוך מסגרות", status: "active", duration: "1:15 (מתוך 4:00)" },
      { name: "ציפוי", status: "pending", duration: "---" },
      { name: "הרכבת מנגנון", status: "pending", duration: "---" },
      { name: "בקרת איכות", status: "pending", duration: "---" },
    ],
    sla: "בזמן",
  },
  {
    id: "WF-1040", name: "ויטרינה חנות - V-890", client: "רשת קפה ארומה",
    startDate: "04/04", dueDate: "11/04", progress: 72, currentStep: "זיגוג",
    steps: [
      { name: "חיתוך מסגרת", status: "done", duration: "3:00" },
      { name: "ריתוך", status: "done", duration: "5:20" },
      { name: "ציפוי", status: "done", duration: "2:45" },
      { name: "חיתוך זכוכית", status: "done", duration: "1:30" },
      { name: "זיגוג כפול", status: "active", duration: "0:45 (מתוך 2:00)" },
      { name: "הרכבה", status: "pending", duration: "---" },
      { name: "בקרת איכות", status: "pending", duration: "---" },
    ],
    sla: "בזמן",
  },
  {
    id: "WF-1039", name: "מעקות בטיחות - פרויקט מגדלים", client: "חברת שיכון ובינוי",
    startDate: "03/04", dueDate: "09/04", progress: 85, currentStep: "בקרת איכות",
    steps: [
      { name: "חיתוך", status: "done", duration: "2:00" },
      { name: "כיפוף", status: "done", duration: "3:10" },
      { name: "ריתוך", status: "done", duration: "4:00" },
      { name: "ציפוי", status: "done", duration: "2:30" },
      { name: "הרכבת חלקים", status: "done", duration: "3:45" },
      { name: "בקרת איכות", status: "active", duration: "0:30 (מתוך 1:00)" },
    ],
    sla: "בזמן",
  },
  {
    id: "WF-1038", name: "פרגולת אלומיניום - PG-445", client: "לקוח פרטי - דוד לוי",
    startDate: "02/04", dueDate: "08/04", progress: 90, currentStep: "הרכבה סופית",
    steps: [
      { name: "חיתוך קורות", status: "done", duration: "2:30" },
      { name: "ריתוך מסגרת", status: "done", duration: "5:00" },
      { name: "ציפוי", status: "done", duration: "3:00" },
      { name: "הרכבה סופית", status: "active", duration: "1:00 (מתוך 2:00)" },
      { name: "בדיקה ואריזה", status: "pending", duration: "---" },
    ],
    sla: "בזמן",
  },
  {
    id: "WF-1037", name: "חיפוי קיר אלומיניום - CL-320", client: "מלון ים המלח",
    startDate: "01/04", dueDate: "08/04", progress: 55, currentStep: "ציפוי",
    steps: [
      { name: "חיתוך לוחות", status: "done", duration: "4:00" },
      { name: "עיבוד CNC", status: "done", duration: "6:30" },
      { name: "ציפוי אנודייז", status: "stuck", duration: "עיכוב - ממתין לחומר כימי" },
      { name: "בקרת איכות", status: "pending", duration: "---" },
      { name: "אריזה ומשלוח", status: "pending", duration: "---" },
    ],
    sla: "באיחור",
  },
  {
    id: "WF-1036", name: "תריסי גלילה חשמליים - SH-780", client: "פרויקט רמת גן",
    startDate: "03/04", dueDate: "13/04", progress: 30, currentStep: "כיפוף",
    steps: [
      { name: "חיתוך למלות", status: "done", duration: "1:20" },
      { name: "כיפוף למלות", status: "active", duration: "2:00 (מתוך 3:00)" },
      { name: "הרכבת מנגנון", status: "pending", duration: "---" },
      { name: "התקנת מנוע", status: "pending", duration: "---" },
      { name: "בדיקה חשמלית", status: "pending", duration: "---" },
      { name: "אריזה", status: "pending", duration: "---" },
    ],
    sla: "בזמן",
  },
  {
    id: "WF-1035", name: "חלונות מבודדים - IN-225", client: "בית חולים שערי צדק",
    startDate: "07/04", dueDate: "17/04", progress: 15, currentStep: "חיתוך",
    steps: [
      { name: "חיתוך פרופילים", status: "active", duration: "1:30 (מתוך 3:00)" },
      { name: "עיבוד CNC", status: "pending", duration: "---" },
      { name: "ריתוך", status: "pending", duration: "---" },
      { name: "ציפוי", status: "pending", duration: "---" },
      { name: "זיגוג כפול", status: "pending", duration: "---" },
      { name: "הרכבה", status: "pending", duration: "---" },
      { name: "בקרת איכות", status: "pending", duration: "---" },
    ],
    sla: "בזמן",
  },
  {
    id: "WF-1034", name: "תחזוקה - קו ציפוי אבקתי", client: "פנימי",
    startDate: "08/04", dueDate: "08/04", progress: 40, currentStep: "החלפת אלמנט",
    steps: [
      { name: "אבחון תקלה", status: "done", duration: "0:45" },
      { name: "הזמנת חלק", status: "done", duration: "0:15" },
      { name: "החלפת אלמנט חימום", status: "active", duration: "1:30 (מתוך 2:00)" },
      { name: "בדיקת תפקוד", status: "pending", duration: "---" },
      { name: "חזרה לייצור", status: "pending", duration: "---" },
    ],
    sla: "קריטי",
  },
  {
    id: "WF-1033", name: "הזמנת חומרי גלם - PO-6780", client: "רכש",
    startDate: "07/04", dueDate: "09/04", progress: 60, currentStep: "אישור מנהל",
    steps: [
      { name: "בקשת רכש", status: "done", duration: "0:10" },
      { name: "בדיקת מלאי", status: "done", duration: "0:20" },
      { name: "אישור מנהל ייצור", status: "done", duration: "0:30" },
      { name: "אישור מנהל כספים", status: "active", duration: "ממתין" },
      { name: "שליחה לספק", status: "pending", duration: "---" },
    ],
    sla: "בזמן",
  },
];

const FALLBACK_BOTTLENECKS = [
  { step: "ציפוי אבקתי", avgDelay: "4.5 שעות", affectedWFs: 3, reason: "תנור בתחזוקת חירום", impact: "קריטי", suggestion: "הפנייה לציפוי חיצוני עד לתיקון" },
  { step: "אישור מנהל כספים", avgDelay: "8.2 שעות", affectedWFs: 2, reason: "עומס אישורים ידני", impact: "גבוה", suggestion: "הטמעת אישור אוטומטי עד 10,000 ש\"ח" },
  { step: "חיתוך זכוכית", avgDelay: "2.3 שעות", affectedWFs: 1, reason: "שולחן חיתוך עמוס", impact: "בינוני", suggestion: "תכנון ייצור מוקדם - מנגנון תור" },
  { step: "ריתוך מסגרות", avgDelay: "1.8 שעות", affectedWFs: 2, reason: "ממתינים לקו כיפוף", impact: "בינוני", suggestion: "מלאי ביניים בין כיפוף לריתוך" },
  { step: "בקרת איכות", avgDelay: "1.2 שעות", affectedWFs: 1, reason: "בודק אחד במשמרת", impact: "נמוך", suggestion: "הכשרת בודק נוסף" },
];

const FALLBACK_SLA_TRACKING = [
  { id: "WF-1042", name: "חלונות HN-4521", slaTarget: "10/04", forecast: "11/04", variance: "+1 יום", status: "בסיכון", reason: "עיכוב בציפוי" },
  { id: "WF-1041", name: "דלתות T-200", slaTarget: "12/04", forecast: "11/04", variance: "-1 יום", status: "בזמן", reason: "---" },
  { id: "WF-1040", name: "ויטרינה V-890", slaTarget: "11/04", forecast: "10/04", variance: "-1 יום", status: "בזמן", reason: "---" },
  { id: "WF-1039", name: "מעקות - מגדלים", slaTarget: "09/04", forecast: "09/04", variance: "0", status: "בזמן", reason: "---" },
  { id: "WF-1038", name: "פרגולה PG-445", slaTarget: "08/04", forecast: "08/04", variance: "0", status: "בזמן", reason: "---" },
  { id: "WF-1036", name: "חיפוי CL-320", slaTarget: "08/04", forecast: "10/04", variance: "+2 ימים", status: "באיחור", reason: "ממתין לחומר כימי" },
  { id: "WF-1037", name: "תריסים SH-780", slaTarget: "13/04", forecast: "12/04", variance: "-1 יום", status: "בזמן", reason: "---" },
  { id: "WF-1035", name: "חלונות IN-225", slaTarget: "17/04", forecast: "16/04", variance: "-1 יום", status: "בזמן", reason: "---" },
];

const FALLBACK_AUTOMATION_DATA = [
  { process: "חיתוך CNC", automated: 95, manual: 5, savings: "4.2 שעות/יום", status: "מלא" },
  { process: "כיפוף CNC", automated: 90, manual: 10, savings: "3.5 שעות/יום", status: "מלא" },
  { process: "ריתוך רובוטי", automated: 80, manual: 20, savings: "6.0 שעות/יום", status: "חלקי" },
  { process: "ציפוי אבקתי", automated: 75, manual: 25, savings: "2.8 שעות/יום", status: "חלקי" },
  { process: "זיגוג", automated: 70, manual: 30, savings: "2.0 שעות/יום", status: "חלקי" },
  { process: "בקרת איכות", automated: 30, manual: 70, savings: "0.5 שעות/יום", status: "ידני בעיקר" },
  { process: "אריזה ומשלוח", automated: 15, manual: 85, savings: "0.2 שעות/יום", status: "ידני" },
  { process: "תכנון ייצור", automated: 60, manual: 40, savings: "1.5 שעות/יום", status: "חלקי" },
  { process: "רכש ואישורים", automated: 40, manual: 60, savings: "1.0 שעות/יום", status: "חלקי" },
  { process: "דיווח ומעקב", automated: 55, manual: 45, savings: "1.2 שעות/יום", status: "חלקי" },
];

const STEP: Record<string, string> = {
  "done": "bg-green-500/20 text-green-400",
  "active": "bg-blue-500/20 text-blue-400",
  "stuck": "bg-red-500/20 text-red-400",
  "pending": "bg-gray-500/20 text-gray-400",
};

const SLAC: Record<string, string> = {
  "בזמן": "bg-green-500/20 text-green-400",
  "בסיכון": "bg-yellow-500/20 text-yellow-400",
  "באיחור": "bg-red-500/20 text-red-400",
  "קריטי": "bg-red-500/20 text-red-400",
};

const IMP: Record<string, string> = {
  "קריטי": "bg-red-500/20 text-red-400",
  "גבוה": "bg-orange-500/20 text-orange-400",
  "בינוני": "bg-yellow-500/20 text-yellow-400",
  "נמוך": "bg-blue-500/20 text-blue-400",
};

export default function WorkflowMonitor() {
  const { data: workflowmonitorData } = useQuery({
    queryKey: ["workflow-monitor"],
    queryFn: () => authFetch("/api/operations/workflow_monitor"),
    staleTime: 5 * 60 * 1000,
  });

  const activeWorkflows = workflowmonitorData ?? FALLBACK_ACTIVE_WORKFLOWS;
  const automationData = FALLBACK_AUTOMATION_DATA;
  const bottlenecks = FALLBACK_BOTTLENECKS;
  const slaTracking = FALLBACK_SLA_TRACKING;

  const [search, setSearch] = useState("");

  const totalActive = activeWorkflows.length;
  const completedToday = 2;
  const stuckWFs = activeWorkflows.filter(w => w.steps.some(s => s.status === "stuck")).length;
  const avgCycle = "4.2 ימים";
  const slaCompliance = ((slaTracking.filter(s => s.status === "בזמן").length / slaTracking.length) * 100).toFixed(0);
  const automationRate = (automationData.reduce((s, a) => s + a.automated, 0) / automationData.length).toFixed(0);

  const kpis = [
    { label: "תהליכים פעילים", value: totalActive.toString(), icon: Activity, color: "text-blue-400" },
    { label: "הושלמו היום", value: completedToday.toString(), icon: CheckCircle2, color: "text-green-400" },
    { label: "תהליכים תקועים", value: stuckWFs.toString(), icon: AlertTriangle, color: "text-red-400" },
    { label: "זמן מחזור ממוצע", value: avgCycle, icon: Timer, color: "text-purple-400" },
    { label: "עמידה ב-SLA", value: `${slaCompliance}%`, icon: Target, color: "text-cyan-400" },
    { label: "שיעור אוטומציה", value: `${automationRate}%`, icon: Zap, color: "text-amber-400" },
  ];

  const filteredWorkflows = activeWorkflows.filter(w =>
    !search || w.name.includes(search) || w.client.includes(search) || w.id.includes(search)
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Workflow className="w-7 h-7 text-blue-400" />
            ניטור תהליכי עבודה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי - מעקב תהליכי ייצור, צווארי בקבוק ואוטומציה</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <kpi.icon className={`w-5 h-5 ${kpi.color} mb-2`} />
              <div className="text-xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="active">תהליכים פעילים</TabsTrigger>
          <TabsTrigger value="bottlenecks">צווארי בקבוק</TabsTrigger>
          <TabsTrigger value="sla">מעקב SLA</TabsTrigger>
          <TabsTrigger value="automation">אוטומציה</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-blue-400" />תהליכים פעילים ({totalActive})</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredWorkflows.map(wf => (
                  <div key={wf.id} className="p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs font-mono">{wf.id}</Badge>
                        <span className="font-medium text-foreground">{wf.name}</span>
                        <span className="text-xs text-muted-foreground">| {wf.client}</span>
                      </div>
                      <Badge className={SLAC[wf.sla]}>{wf.sla}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <Progress value={wf.progress} className="h-2 flex-1" />
                      <span className="text-sm font-bold text-foreground">{wf.progress}%</span>
                      <span className="text-xs text-muted-foreground">|</span>
                      <span className="text-xs text-muted-foreground">{wf.startDate} - {wf.dueDate}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {wf.steps.map((step, j) => (
                        <div key={j} className="flex items-center gap-1">
                          <Badge className={`${STEP[step.status]} text-xs`}>
                            {step.status === "done" && <CheckCircle2 className="w-3 h-3 ml-0.5" />}
                            {step.status === "active" && <Play className="w-3 h-3 ml-0.5" />}
                            {step.status === "stuck" && <Pause className="w-3 h-3 ml-0.5" />}
                            {step.name}
                          </Badge>
                          {j < wf.steps.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bottlenecks" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-400" />צווארי בקבוק - שלבים מעכבים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {bottlenecks.map((b, i) => (
                  <div key={i} className="p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground">#{i + 1}</span>
                        <span className="font-medium text-foreground">{b.step}</span>
                        <Badge className={IMP[b.impact]}>{b.impact}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-red-400 font-bold">עיכוב ממוצע: {b.avgDelay}</span>
                        <Badge variant="outline" className="text-xs">{b.affectedWFs} תהליכים</Badge>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground mb-2">
                      <span className="text-foreground">סיבה: </span>{b.reason}
                    </div>
                    <div className="p-2 rounded bg-green-500/5 border border-green-500/20 text-sm">
                      <span className="text-green-400 font-medium">המלצה: </span>
                      <span className="text-muted-foreground">{b.suggestion}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sla" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target className="w-5 h-5 text-cyan-400" />מעקב SLA - עמידה ביעדי אספקה</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                  <div className="text-2xl font-bold text-green-400">{slaTracking.filter(s => s.status === "בזמן").length}</div>
                  <div className="text-xs text-muted-foreground">בזמן</div>
                </div>
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-center">
                  <div className="text-2xl font-bold text-yellow-400">{slaTracking.filter(s => s.status === "בסיכון").length}</div>
                  <div className="text-xs text-muted-foreground">בסיכון</div>
                </div>
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-center">
                  <div className="text-2xl font-bold text-red-400">{slaTracking.filter(s => s.status === "באיחור").length}</div>
                  <div className="text-xs text-muted-foreground">באיחור</div>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מזהה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תהליך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">יעד SLA</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">צפי סיום</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטייה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סיבה</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slaTracking.map(s => (
                      <tr key={s.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-mono text-xs text-muted-foreground">{s.id}</td>
                        <td className="p-3 font-medium text-foreground">{s.name}</td>
                        <td className="p-3 text-foreground">{s.slaTarget}</td>
                        <td className="p-3 text-foreground">{s.forecast}</td>
                        <td className="p-3">
                          <span className={s.variance.includes('+') ? 'text-red-400 font-medium' : s.variance === '0' ? 'text-green-400' : 'text-green-400'}>
                            {s.variance}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground">{s.reason}</td>
                        <td className="p-3 text-center"><Badge className={SLAC[s.status]}>{s.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="automation" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-amber-400" />אוטומציה מול תהליכים ידניים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="text-sm text-blue-400">
                  <Bot className="w-4 h-4 inline ml-1" />
                  שיעור אוטומציה כולל: <span className="font-bold">{automationRate}%</span> | חיסכון יומי מוערך: <span className="font-bold">{automationData.reduce((s, a) => s + parseFloat(a.savings), 0).toFixed(1)} שעות</span>
                </div>
              </div>
              <div className="space-y-3">
                {automationData.map((a, i) => (
                  <div key={i} className="p-3 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-foreground">{a.process}</span>
                        <Badge className={a.automated >= 80 ? "bg-green-500/20 text-green-400" : a.automated >= 50 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}>
                          {a.status}
                        </Badge>
                      </div>
                      <span className="text-sm text-green-400">חיסכון: {a.savings}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Bot className="w-4 h-4 text-blue-400" />
                      <div className="flex-1 h-3 bg-background/50 rounded-full overflow-hidden flex">
                        <div className="bg-blue-500/60 h-full" style={{ width: `${a.automated}%` }} />
                        <div className="bg-orange-500/40 h-full" style={{ width: `${a.manual}%` }} />
                      </div>
                      <User className="w-4 h-4 text-orange-400" />
                      <span className="text-xs text-muted-foreground w-24">
                        <span className="text-blue-400">{a.automated}%</span> / <span className="text-orange-400">{a.manual}%</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
