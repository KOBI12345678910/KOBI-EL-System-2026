import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { UserCog, Users, Star, Clock, Calendar, GraduationCap, CheckCircle, TrendingUp, Wrench, Zap, BadgeCheck, CircleDot } from "lucide-react";

type TechStatus = "active" | "training" | "vacation";
const statusCfg: Record<TechStatus, { label: string; cls: string }> = {
  active: { label: "פעיל", cls: "bg-emerald-500/20 text-emerald-400" },
  training: { label: "בהכשרה", cls: "bg-blue-500/20 text-blue-400" },
  vacation: { label: "בחופשה", cls: "bg-zinc-500/20 text-zinc-400" },
};
type SkillLevel = 0 | 1 | 2 | 3;
const skillLevelCfg: Record<SkillLevel, { label: string; cls: string }> = {
  0: { label: "—", cls: "text-zinc-600" },
  1: { label: "בסיסי", cls: "bg-zinc-500/20 text-zinc-400" },
  2: { label: "מתקדם", cls: "bg-blue-500/20 text-blue-400" },
  3: { label: "מומחה", cls: "bg-emerald-500/20 text-emerald-400" },
};

const FALLBACK_TECHNICIANS = [
  { id: "T-01", name: "יוסי כהן", specialty: "אלומיניום", certs: ["ISO 9001", "עבודה בגובה"], completed: 142, avgResponse: "3.2 שעות", satisfaction: 4.8, performance: 94, status: "active" as TechStatus },
  { id: "T-02", name: "מוטי לוי", specialty: "זכוכית", certs: ["מתקין מוסמך", "בטיחות"], completed: 118, avgResponse: "4.1 שעות", satisfaction: 4.5, performance: 88, status: "active" as TechStatus },
  { id: "T-03", name: "אבי דוד", specialty: "ברזל", certs: ["ריתוך MIG/TIG", "ISO 9001"], completed: 165, avgResponse: "2.8 שעות", satisfaction: 4.9, performance: 96, status: "active" as TechStatus },
  { id: "T-04", name: "רפי אזולאי", specialty: "חשמל", certs: ["חשמלאי מוסמך", "שליטה מרחוק"], completed: 97, avgResponse: "3.5 שעות", satisfaction: 4.6, performance: 90, status: "active" as TechStatus },
  { id: "T-05", name: "סאמר חוסיין", specialty: "מנועים", certs: ["מנועי DC/AC", "אלקטרוניקה"], completed: 83, avgResponse: "4.8 שעות", satisfaction: 4.3, performance: 82, status: "active" as TechStatus },
  { id: "T-06", name: "דניאל אברהם", specialty: "אלומיניום", certs: ["עבודה בגובה"], completed: 56, avgResponse: "5.1 שעות", satisfaction: 4.4, performance: 79, status: "active" as TechStatus },
  { id: "T-07", name: "עומר ביטון", specialty: "ברזל", certs: ["ריתוך MIG/TIG"], completed: 22, avgResponse: "6.2 שעות", satisfaction: 4.1, performance: 68, status: "training" as TechStatus },
  { id: "T-08", name: "נאסר זועבי", specialty: "זכוכית", certs: ["מתקין מוסמך", "ISO 9001"], completed: 131, avgResponse: "3.0 שעות", satisfaction: 4.7, performance: 92, status: "vacation" as TechStatus },
];
const skillNames = ["איטום", "נעילה", "זכוכית", "ריתוך", "חשמל", "מנועים", "צבע", "הרכבה"];
const skillsMatrix: Record<string, SkillLevel[]> = {
  "T-01": [3, 2, 2, 1, 1, 0, 2, 3],
  "T-02": [2, 1, 3, 0, 1, 0, 1, 2],
  "T-03": [1, 2, 0, 3, 2, 1, 3, 3],
  "T-04": [1, 2, 1, 1, 3, 3, 0, 2],
  "T-05": [0, 1, 0, 1, 3, 3, 0, 1],
  "T-06": [3, 1, 2, 0, 0, 0, 2, 3],
  "T-07": [1, 1, 0, 2, 1, 0, 1, 2],
  "T-08": [2, 2, 3, 0, 1, 0, 1, 3],
};
const weekDays = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"];
type DaySlot = "morning" | "afternoon" | "full" | "off" | "oncall";
const slotCfg: Record<DaySlot, { label: string; cls: string }> = {
  morning: { label: "בוקר", cls: "bg-cyan-500/20 text-cyan-400" },
  afternoon: { label: "צהריים", cls: "bg-amber-500/20 text-amber-400" },
  full: { label: "יום מלא", cls: "bg-emerald-500/20 text-emerald-400" },
  off: { label: "חופש", cls: "bg-zinc-500/20 text-zinc-500" },
  oncall: { label: "כוננות", cls: "bg-purple-500/20 text-purple-400" },
};
const availability: Record<string, DaySlot[]> = {
  "T-01": ["full", "full", "morning", "full", "full", "off"],
  "T-02": ["full", "morning", "full", "full", "afternoon", "off"],
  "T-03": ["full", "full", "full", "morning", "full", "morning"],
  "T-04": ["morning", "full", "full", "full", "full", "off"],
  "T-05": ["full", "full", "afternoon", "full", "morning", "off"],
  "T-06": ["full", "full", "full", "full", "full", "off"],
  "T-07": ["morning", "morning", "morning", "morning", "morning", "off"],
  "T-08": ["off", "off", "off", "off", "off", "off"],
};
const FALLBACK_PERFORMANCE_KPIS = [
  { id: "T-01", name: "יוסי כהן", closed: 142, avgDays: 1.4, firstFix: 89, rating: 4.8 },
  { id: "T-02", name: "מוטי לוי", closed: 118, avgDays: 1.9, firstFix: 82, rating: 4.5 },
  { id: "T-03", name: "אבי דוד", closed: 165, avgDays: 1.1, firstFix: 93, rating: 4.9 },
  { id: "T-04", name: "רפי אזולאי", closed: 97, avgDays: 1.6, firstFix: 85, rating: 4.6 },
  { id: "T-05", name: "סאמר חוסיין", closed: 83, avgDays: 2.3, firstFix: 76, rating: 4.3 },
  { id: "T-06", name: "דניאל אברהם", closed: 56, avgDays: 2.7, firstFix: 71, rating: 4.4 },
  { id: "T-07", name: "עומר ביטון", closed: 22, avgDays: 3.5, firstFix: 64, rating: 4.1 },
  { id: "T-08", name: "נאסר זועבי", closed: 131, avgDays: 1.3, firstFix: 90, rating: 4.7 },
];
type TrainingStatus = "completed" | "in_progress" | "scheduled";
const trainingStatusCfg: Record<TrainingStatus, { label: string; cls: string }> = {
  completed: { label: "הושלם", cls: "bg-emerald-500/20 text-emerald-400" },
  in_progress: { label: "בתהליך", cls: "bg-amber-500/20 text-amber-400" },
  scheduled: { label: "מתוכנן", cls: "bg-blue-500/20 text-blue-400" },
};
const FALLBACK_TRAINING_ENTRIES = [
  { id: "TR-01", techId: "T-07", techName: "עומר ביטון", course: "ריתוך TIG למתקדמים", date: "2026-03-15", endDate: "2026-05-15", status: "in_progress" as TrainingStatus },
  { id: "TR-02", techId: "T-06", techName: "דניאל אברהם", course: "הסמכת עבודה בגובה — רענון", date: "2026-04-20", endDate: "2026-04-22", status: "scheduled" as TrainingStatus },
  { id: "TR-03", techId: "T-01", techName: "יוסי כהן", course: "מערכות שליטה חכמות IoT", date: "2026-02-01", endDate: "2026-02-28", status: "completed" as TrainingStatus },
  { id: "TR-04", techId: "T-04", techName: "רפי אזולאי", course: "בקרים תעשייתיים PLC", date: "2026-05-01", endDate: "2026-06-30", status: "scheduled" as TrainingStatus },
  { id: "TR-05", techId: "T-02", techName: "מוטי לוי", course: "זכוכית מחוסמת — בטיחות והתקנה", date: "2026-01-10", endDate: "2026-01-12", status: "completed" as TrainingStatus },
  { id: "TR-06", techId: "T-05", techName: "סאמר חוסיין", course: "מנועי סרוו ובקרת תנועה", date: "2026-04-10", endDate: "2026-04-30", status: "in_progress" as TrainingStatus },
];


const technicians = FALLBACK_TECHNICIANS;
const activeTechs = technicians.filter(t => t.status === "active").length;
const trainingTechs = technicians.filter(t => t.status === "training").length;
const vacationTechs = technicians.filter(t => t.status === "vacation").length;
const avgSatisfaction = (technicians.reduce((s, t) => s + t.satisfaction, 0) / technicians.length).toFixed(1);

export default function TechnicianManagement() {
  const { data: technicianmanagementData } = useQuery({
    queryKey: ["technician-management"],
    queryFn: () => authFetch("/api/service/technician_management"),
    staleTime: 5 * 60 * 1000,
  });

  const technicians = technicianmanagementData ?? FALLBACK_TECHNICIANS;
  const performanceKPIs = FALLBACK_PERFORMANCE_KPIS;
  const trainingEntries = FALLBACK_TRAINING_ENTRIES;

  const [activeTab, setActiveTab] = useState("roster");
  const hCls = "text-right text-[10px] font-semibold text-muted-foreground";
  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <UserCog className="h-7 w-7 text-cyan-400" /> ניהול טכנאים
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">טכנו-כל עוזי — צוות טכנאים, כישורים, זמינות, ביצועים והכשרות</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { label: "סה\"כ טכנאים", value: `${technicians.length}`, color: "text-cyan-400", icon: Users },
          { label: "פעילים", value: `${activeTechs}`, color: "text-emerald-400", icon: CheckCircle },
          { label: "בהכשרה", value: `${trainingTechs}`, color: "text-blue-400", icon: GraduationCap },
          { label: "בחופשה", value: `${vacationTechs}`, color: "text-zinc-400", icon: Calendar },
        ] as const).map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="bg-card/80 border-border hover:border-border/80 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</p>
                  </div>
                  <Icon className={`h-5 w-5 ${kpi.color} opacity-40`} />
                </div>
              </CardContent>
            </Card>);
        })}
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="roster" className="text-xs gap-1"><Users className="h-3.5 w-3.5" /> רשימת טכנאים</TabsTrigger>
          <TabsTrigger value="skills" className="text-xs gap-1"><Wrench className="h-3.5 w-3.5" /> מטריצת כישורים</TabsTrigger>
          <TabsTrigger value="availability" className="text-xs gap-1"><Calendar className="h-3.5 w-3.5" /> זמינות</TabsTrigger>
          <TabsTrigger value="performance" className="text-xs gap-1"><TrendingUp className="h-3.5 w-3.5" /> ביצועים</TabsTrigger>
          <TabsTrigger value="training" className="text-xs gap-1"><GraduationCap className="h-3.5 w-3.5" /> הכשרות</TabsTrigger>
        </TabsList>
        <TabsContent value="roster" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      {["מזהה","שם","מומחיות","הסמכות","קריאות הושלמו","זמן תגובה ממוצע","שביעות רצון","ציון ביצוע","סטטוס"].map(h => (
                        <TableHead key={h} className={hCls}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {technicians.map(t => (
                      <TableRow key={t.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-xs text-blue-400">{t.id}</TableCell>
                        <TableCell className="text-xs font-medium text-foreground">{t.name}</TableCell>
                        <TableCell><Badge className="text-[10px] bg-cyan-500/20 text-cyan-400">{t.specialty}</Badge></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {t.certs.map((c, i) => (
                              <Badge key={i} variant="outline" className="text-[9px] border-border text-muted-foreground"><BadgeCheck className="h-2.5 w-2.5 ml-0.5" />{c}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-foreground">{t.completed}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground"><Clock className="h-3 w-3 text-muted-foreground inline ml-1" />{t.avgResponse}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-400 fill-amber-400" /><span className="font-mono text-xs text-amber-400">{t.satisfaction}</span><span className="text-[9px] text-muted-foreground">/5</span></span>
                        </TableCell>
                        <TableCell><div className="flex items-center gap-2 min-w-[80px]"><Progress value={t.performance} className="h-1.5 flex-1" /><span className={`font-mono text-[10px] ${t.performance >= 90 ? "text-emerald-400" : t.performance >= 75 ? "text-amber-400" : "text-red-400"}`}>{t.performance}%</span></div></TableCell>
                        <TableCell><Badge className={`text-[10px] ${statusCfg[t.status].cls}`}>{statusCfg[t.status].label}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* Tab 2: Skills Matrix */}
        <TabsContent value="skills" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className={hCls}>טכנאי</TableHead>
                      {skillNames.map(s => (
                        <TableHead key={s} className={`${hCls} text-center`}>{s}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {technicians.map(t => (
                      <TableRow key={t.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <TableCell className="text-xs font-medium text-foreground whitespace-nowrap">{t.name}</TableCell>
                        {skillsMatrix[t.id].map((level, i) => (
                          <TableCell key={i} className="text-center">{level === 0
                            ? <span className="text-zinc-600 text-[10px]">—</span>
                            : <Badge className={`text-[9px] ${skillLevelCfg[level].cls}`}>{skillLevelCfg[level].label}</Badge>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* Tab 3: Availability */}
        <TabsContent value="availability" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className={hCls}>טכנאי</TableHead>
                      {weekDays.map(d => (
                        <TableHead key={d} className={`${hCls} text-center`}>{d}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {technicians.map(t => (
                      <TableRow key={t.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <TableCell className="text-xs font-medium text-foreground whitespace-nowrap">
                          <span className="flex items-center gap-1"><CircleDot className={`h-2.5 w-2.5 ${statusCfg[t.status].cls.split(" ")[1]}`} />{t.name}</span>
                        </TableCell>
                        {availability[t.id].map((slot, i) => (
                          <TableCell key={i} className="text-center"><Badge className={`text-[9px] ${slotCfg[slot].cls}`}>{slotCfg[slot].label}</Badge></TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* Tab 4: Performance */}
        <TabsContent value="performance" className="mt-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([
                { label: "ממוצע קריאות שנסגרו", value: Math.round(performanceKPIs.reduce((s, p) => s + p.closed, 0) / performanceKPIs.length).toString(), color: "text-blue-400", icon: CheckCircle },
                { label: "ממוצע ימי טיפול", value: (performanceKPIs.reduce((s, p) => s + p.avgDays, 0) / performanceKPIs.length).toFixed(1), color: "text-amber-400", icon: Clock },
                { label: "ממוצע תיקון ראשון", value: `${Math.round(performanceKPIs.reduce((s, p) => s + p.firstFix, 0) / performanceKPIs.length)}%`, color: "text-emerald-400", icon: Zap },
                { label: "שביעות רצון ממוצעת", value: `${avgSatisfaction}/5`, color: "text-amber-400", icon: Star },
              ] as const).map((kpi, i) => {
                const Icon = kpi.icon;
                return (
                  <Card key={i} className="bg-card/80 border-border">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                          <p className={`text-lg font-bold font-mono mt-0.5 ${kpi.color}`}>{kpi.value}</p>
                        </div>
                        <Icon className={`h-4 w-4 ${kpi.color} opacity-40`} />
                      </div>
                    </CardContent>
                  </Card>);
              })}
            </div>
            <Card className="bg-card/80 border-border">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-border bg-background/50">
                        {["טכנאי","קריאות שנסגרו","ממוצע ימי טיפול","תיקון ראשון (%)","דירוג לקוח","ציון כולל"].map(h => (
                          <TableHead key={h} className={hCls}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {performanceKPIs.map(p => {
                        const overall = Math.round((p.firstFix * 0.3) + (p.rating * 10 * 0.3) + ((10 - p.avgDays) * 10 * 0.2) + (Math.min(p.closed, 150) / 150 * 100 * 0.2));
                        return (
                          <TableRow key={p.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            <TableCell className="text-xs font-medium text-foreground">{p.name}</TableCell>
                            <TableCell className="font-mono text-xs text-foreground">{p.closed}</TableCell>
                            <TableCell className={`font-mono text-xs ${p.avgDays <= 1.5 ? "text-emerald-400" : p.avgDays <= 2.5 ? "text-amber-400" : "text-red-400"}`}>{p.avgDays} ימים</TableCell>
                            <TableCell><div className="flex items-center gap-2 min-w-[80px]"><Progress value={p.firstFix} className="h-1.5 flex-1" /><span className={`font-mono text-[10px] ${p.firstFix >= 85 ? "text-emerald-400" : p.firstFix >= 70 ? "text-amber-400" : "text-red-400"}`}>{p.firstFix}%</span></div></TableCell>
                            <TableCell><span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-400 fill-amber-400" /><span className="font-mono text-xs text-amber-400">{p.rating}</span></span></TableCell>
                            <TableCell><div className="flex items-center gap-2 min-w-[80px]"><Progress value={overall} className="h-1.5 flex-1" /><span className={`font-mono text-[10px] font-bold ${overall >= 85 ? "text-emerald-400" : overall >= 70 ? "text-amber-400" : "text-red-400"}`}>{overall}</span></div></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {/* Tab 5: Training */}
        <TabsContent value="training" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      {["מזהה","טכנאי","קורס","תאריך התחלה","תאריך סיום","התקדמות","סטטוס"].map(h => (
                        <TableHead key={h} className={hCls}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trainingEntries.map(tr => {
                      const start = new Date(tr.date).getTime();
                      const end = new Date(tr.endDate).getTime();
                      const now = new Date("2026-04-08").getTime();
                      const progress = tr.status === "completed" ? 100 : tr.status === "scheduled" ? 0 : Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
                      return (
                        <TableRow key={tr.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <TableCell className="font-mono text-xs text-blue-400">{tr.id}</TableCell>
                          <TableCell className="text-xs font-medium text-foreground">{tr.techName}</TableCell>
                          <TableCell className="text-xs text-foreground">{tr.course}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{tr.date}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{tr.endDate}</TableCell>
                          <TableCell><div className="flex items-center gap-2 min-w-[80px]"><Progress value={progress} className="h-1.5 flex-1" /><span className="text-[10px] font-mono text-muted-foreground">{progress}%</span></div></TableCell>
                          <TableCell><Badge className={`text-[10px] ${trainingStatusCfg[tr.status].cls}`}>{trainingStatusCfg[tr.status].label}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
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
