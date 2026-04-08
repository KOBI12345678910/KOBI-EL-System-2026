import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Brain, TrendingUp, AlertTriangle, Gauge, Zap, BarChart3,
  Wrench, ShieldCheck, CalendarClock, Factory, Leaf, Flame,
  Search, Download, RefreshCw, Settings2, ChevronLeft
} from "lucide-react";

const kpis = [
  { label: "שיפור יעילות", value: "18.4%", delta: "+3.2%", icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { label: "דיוק חיזוי פגמים", value: "94.7%", delta: "+1.8%", icon: ShieldCheck, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { label: "השבתה חזויה", value: "6.2 שעות", delta: "-2.1 שעות", icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  { label: "אופטימיזציית OEE", value: "87.3%", delta: "+4.5%", icon: Gauge, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  { label: 'חיסכון אנרגיה', value: "₪124,500", delta: "+₪18,200", icon: Zap, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  { label: "עלייה בתפוקה", value: "12.8%", delta: "+2.4%", icon: BarChart3, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
];

const maintenanceEquipment = [
  { id: "EQ-301", name: "מכבש הידראולי A3", failureProb: 78, nextFailure: "3 ימים", component: "שסתום לחץ", severity: "קריטי", lastService: "15/02/2026", recommended: "החלפת שסתום + בדיקת סיל" },
  { id: "EQ-118", name: "מסוע ראשי B1", failureProb: 62, nextFailure: "8 ימים", component: "מנוע הנעה", severity: "גבוה", lastService: "28/01/2026", recommended: "שימון + כיול מתח רצועה" },
  { id: "EQ-205", name: "רובוט ריתוך C2", failureProb: 45, nextFailure: "14 ימים", component: "חיישן תרמי", severity: "בינוני", lastService: "10/03/2026", recommended: "כיול חיישנים + ניקוי זרוע" },
  { id: "EQ-410", name: "CNC מרכז עיבוד D1", failureProb: 31, nextFailure: "22 ימים", component: "ציר Y", severity: "נמוך", lastService: "01/03/2026", recommended: "בדיקת דיוק צירים" },
  { id: "EQ-507", name: "תנור חום E2", failureProb: 18, nextFailure: "35 ימים", component: "גוף חימום", severity: "נמוך", lastService: "20/03/2026", recommended: "ניקוי שגרתי" },
];

const maintenanceSchedule = [
  { date: "10/04/2026", equipment: "מכבש הידראולי A3", type: "מונעת קריטית", duration: "4 שעות", team: "צוות א'", impact: "עצירת קו 3", aiScore: 96 },
  { date: "14/04/2026", equipment: "מסוע ראשי B1", type: "מונעת מתוכננת", duration: "2 שעות", team: "צוות ב'", impact: "האטת קו 1", aiScore: 88 },
  { date: "18/04/2026", equipment: "רובוט ריתוך C2", type: "כיול תקופתי", duration: "1.5 שעות", team: "צוות א'", impact: "מינימלי", aiScore: 72 },
  { date: "25/04/2026", equipment: "CNC מרכז עיבוד D1", type: "בדיקה שגרתית", duration: "1 שעה", team: "צוות ג'", impact: "ללא", aiScore: 65 },
];

const qualityStations = [
  { station: "תחנת ריתוך A", defectProb: 8.2, trend: "עולה", topDefect: "ריתוך חלש", rootCause: "טמפרטורה לא יציבה", confidence: 91, recommendation: "כיול אוטומטי של טמפרטורת ריתוך" },
  { station: "תחנת הרכבה B", defectProb: 5.1, trend: "יורד", topDefect: "חוסר יישור", rootCause: "שחיקת ג'יג", confidence: 87, recommendation: "החלפת ג'יג הרכבה" },
  { station: "תחנת צביעה C", defectProb: 12.4, trend: "עולה", topDefect: "ציפוי לא אחיד", rootCause: "לחות גבוהה בתא", confidence: 94, recommendation: "התקנת בקר לחות אוטומטי" },
  { station: "תחנת בדיקה D", defectProb: 2.8, trend: "יציב", topDefect: "סטיית מידות", rootCause: "כיול חיישן", confidence: 78, recommendation: "כיול חיישנים חודשי" },
  { station: "תחנת אריזה E", defectProb: 3.5, trend: "יורד", topDefect: "אריזה פגומה", rootCause: "חומר גלם ירוד", confidence: 82, recommendation: "החלפת ספק חומרי אריזה" },
];

const schedulingOrders = [
  { order: "WO-4521", product: "מנוע X200", currentSeq: 3, aiSeq: 1, savings: "2.5 שעות", bottleneck: "תחנת CNC", capacity: 92 },
  { order: "WO-4522", product: "גלגל שיניים G50", currentSeq: 1, aiSeq: 2, savings: "1.8 שעות", bottleneck: "תחנת ריתוך", capacity: 78 },
  { order: "WO-4523", product: "מארז אלומיניום P30", currentSeq: 2, aiSeq: 3, savings: "0.5 שעות", bottleneck: "אין", capacity: 65 },
  { order: "WO-4524", product: "צינור הידראולי H10", currentSeq: 5, aiSeq: 4, savings: "3.1 שעות", bottleneck: "תחנת כיפוף", capacity: 88 },
  { order: "WO-4525", product: "לוח בקרה E80", currentSeq: 4, aiSeq: 5, savings: "0.8 שעות", bottleneck: "תחנת הלחמה", capacity: 71 },
];

const energyPatterns = [
  { zone: "אולם ייצור A", current: 342, optimized: 285, saving: 57, savingPct: 16.7, peak: "08:00-12:00", recommendation: "פיזור עומסים לשעות שפל" },
  { zone: "אולם ייצור B", current: 278, optimized: 241, saving: 37, savingPct: 13.3, peak: "10:00-14:00", recommendation: "התקנת VFD במנועים ראשיים" },
  { zone: "מחסן חומרי גלם", current: 124, optimized: 98, saving: 26, savingPct: 21.0, peak: "06:00-08:00", recommendation: "תאורת LED + חיישני נוכחות" },
  { zone: "קו אריזה", current: 186, optimized: 162, saving: 24, savingPct: 12.9, peak: "14:00-18:00", recommendation: "אופטימיזציית מהירות מסועים" },
];

const wasteRecommendations = [
  { category: "פסולת מתכת", current: "3.2 טון/חודש", target: "1.8 טון/חודש", reduction: 43.8, action: "אופטימיזציית חיתוך CNC + מיחזור שבבים", priority: "גבוה", roi: "₪18,500/חודש" },
  { category: "פסולת אריזה", current: "1.5 טון/חודש", target: "0.9 טון/חודש", reduction: 40.0, action: "מעבר לאריזה ביו-מתכלה + הקטנת אריזה", priority: "בינוני", roi: "₪7,200/חודש" },
  { category: "נוזלי קירור", current: "420 ליטר/חודש", target: "280 ליטר/חודש", reduction: 33.3, action: "מערכת סינון ומיחזור אוטומטית", priority: "גבוה", roi: "₪12,800/חודש" },
  { category: "חלקים פגומים", current: "2.1%", target: "0.8%", reduction: 61.9, action: "בקרת איכות AI בזמן אמת", priority: "קריטי", roi: "₪32,000/חודש" },
];

const severityColor: Record<string, string> = {
  "קריטי": "bg-red-500/20 text-red-300 border-red-500/30",
  "גבוה": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "בינוני": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "נמוך": "bg-green-500/20 text-green-300 border-green-500/30",
};

const trendIcon: Record<string, string> = { "עולה": "text-red-400", "יורד": "text-emerald-400", "יציב": "text-blue-400" };

export default function AiProductionInsights() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("maintenance");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">תובנות ייצור AI</h1>
            <p className="text-sm text-muted-foreground">אינטליגנציה מלאכותית לאופטימיזציית ייצור</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-64 bg-background/50" />
          </div>
          <Button variant="outline" size="sm"><RefreshCw className="w-4 h-4 ml-1" />רענון מודל</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
          <Button variant="outline" size="sm"><Settings2 className="w-4 h-4 ml-1" />הגדרות</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <Card key={i} className={`border ${k.bg}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <k.icon className={`w-5 h-5 ${k.color}`} />
                <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">{k.delta}</Badge>
              </div>
              <div className="text-xl font-bold text-foreground">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50 p-1">
          <TabsTrigger value="maintenance" className="gap-1.5"><Wrench className="w-4 h-4" />תחזוקה חזויה</TabsTrigger>
          <TabsTrigger value="quality" className="gap-1.5"><ShieldCheck className="w-4 h-4" />חיזוי איכות</TabsTrigger>
          <TabsTrigger value="scheduling" className="gap-1.5"><CalendarClock className="w-4 h-4" />אופטימיזציית תזמון</TabsTrigger>
          <TabsTrigger value="energy" className="gap-1.5"><Leaf className="w-4 h-4" />אנרגיה ופסולת</TabsTrigger>
        </TabsList>

        {/* Tab 1: Predictive Maintenance */}
        <TabsContent value="maintenance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  חיזוי כשל ציוד
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {maintenanceEquipment.map((eq) => (
                  <div key={eq.id} className="p-3 rounded-lg bg-background/30 border border-border/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-muted-foreground">{eq.id}</span>
                        <span className="text-sm font-medium text-foreground">{eq.name}</span>
                      </div>
                      <Badge className={severityColor[eq.severity] + " border text-xs"}>{eq.severity}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">סיכוי כשל</span>
                          <span className={eq.failureProb >= 60 ? "text-red-400" : eq.failureProb >= 40 ? "text-amber-400" : "text-emerald-400"}>{eq.failureProb}%</span>
                        </div>
                        <Progress value={eq.failureProb} className="h-2" />
                      </div>
                      <div className="text-left min-w-[70px]">
                        <div className="text-xs text-muted-foreground">כשל צפוי</div>
                        <div className="text-sm font-medium text-foreground">{eq.nextFailure}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>רכיב: {eq.component}</span>
                      <span>שירות אחרון: {eq.lastService}</span>
                    </div>
                    <div className="text-xs text-cyan-400 bg-cyan-500/10 rounded px-2 py-1">
                      <Factory className="w-3 h-3 inline ml-1" />המלצה: {eq.recommended}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-blue-400" />
                  אופטימיזציית לוח תחזוקה
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {maintenanceSchedule.map((ms, i) => (
                  <div key={i} className="p-3 rounded-lg bg-background/30 border border-border/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{ms.date}</Badge>
                        <span className="text-sm font-medium text-foreground">{ms.equipment}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Brain className="w-3 h-3 text-violet-400" />
                        <span className="text-xs text-violet-400 font-medium">{ms.aiScore}%</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">סוג: </span><span className="text-foreground">{ms.type}</span></div>
                      <div><span className="text-muted-foreground">משך: </span><span className="text-foreground">{ms.duration}</span></div>
                      <div><span className="text-muted-foreground">צוות: </span><span className="text-foreground">{ms.team}</span></div>
                      <div><span className="text-muted-foreground">השפעה: </span><span className="text-foreground">{ms.impact}</span></div>
                    </div>
                    <Progress value={ms.aiScore} className="h-1.5" />
                  </div>
                ))}
                <div className="p-3 rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 text-center">
                  <p className="text-xs text-violet-400">AI זיהה חפיפה בתחזוקת ציוד B1 ו-C2 - מומלץ איחוד לתאריך 16/04</p>
                  <Button size="sm" variant="outline" className="mt-2 text-xs">אמץ המלצה</Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 2: Quality Prediction */}
        <TabsContent value="quality" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {qualityStations.map((qs, i) => (
              <Card key={i} className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Factory className="w-4 h-4 text-blue-400" />
                      {qs.station}
                    </span>
                    <span className={`text-xs font-normal ${trendIcon[qs.trend]}`}>{qs.trend === "עולה" ? "▲" : qs.trend === "יורד" ? "▼" : "●"} {qs.trend}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">הסתברות פגם</span>
                    <span className={`text-lg font-bold ${qs.defectProb > 10 ? "text-red-400" : qs.defectProb > 5 ? "text-amber-400" : "text-emerald-400"}`}>{qs.defectProb}%</span>
                  </div>
                  <Progress value={qs.defectProb} className="h-2" />
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">פגם מוביל</span>
                      <span className="text-foreground">{qs.topDefect}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">שורש הבעיה</span>
                      <span className="text-foreground">{qs.rootCause}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">רמת ביטחון AI</span>
                      <span className="text-violet-400 font-medium">{qs.confidence}%</span>
                    </div>
                  </div>
                  <div className="p-2 rounded bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-400">
                    <Brain className="w-3 h-3 inline ml-1" />{qs.recommendation}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-medium text-foreground">ניתוח AI מרוכז</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="text-red-400 font-medium mb-1">התראה: תחנת צביעה C</div>
                  <p className="text-muted-foreground">שיעור פגמים עולה ב-3 ימים רצופים. AI ממליץ על בדיקת מערכת לחות מיידית.</p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-emerald-400 font-medium mb-1">שיפור: תחנת הרכבה B</div>
                  <p className="text-muted-foreground">ירידה של 22% בפגמי יישור מאז התקנת ג'יג חדש. ממשיך מגמה חיובית.</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="text-blue-400 font-medium mb-1">תחזית: שבוע הבא</div>
                  <p className="text-muted-foreground">מודל AI חוזה ירידה של 8% בפגמים כוללים בעקבות כיולים מתוכננים.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Scheduling Optimization */}
        <TabsContent value="scheduling" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-blue-400" />
                רצף ייצור מותאם AI
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">הזמנה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סדר נוכחי</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סדר AI</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חיסכון</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">צוואר בקבוק</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קיבולת</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedulingOrders.map((so) => (
                      <tr key={so.order} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 font-mono text-foreground">{so.order}</td>
                        <td className="p-3 text-foreground">{so.product}</td>
                        <td className="p-3 text-center text-muted-foreground">{so.currentSeq}</td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {so.currentSeq !== so.aiSeq && <ChevronLeft className="w-3 h-3 text-violet-400" />}
                            <span className="text-violet-400 font-bold">{so.aiSeq}</span>
                          </div>
                        </td>
                        <td className="p-3 text-emerald-400 font-medium">{so.savings}</td>
                        <td className="p-3">
                          {so.bottleneck !== "אין" ? (
                            <Badge variant="outline" className="text-xs text-amber-400 border-amber-500/30">{so.bottleneck}</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">אין</Badge>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={so.capacity} className="h-2 flex-1" />
                            <span className={`text-xs font-medium ${so.capacity > 85 ? "text-red-400" : so.capacity > 70 ? "text-amber-400" : "text-emerald-400"}`}>{so.capacity}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-violet-400 font-medium">סה"כ חיסכון מוערך: </span>
                  <span className="text-foreground font-bold">8.7 שעות / מחזור</span>
                  <span className="text-muted-foreground mr-2"> | עלייה בתפוקה: </span>
                  <span className="text-emerald-400 font-bold">14.2%</span>
                </div>
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700">אמץ רצף AI</Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-foreground">חיזוי צווארי בקבוק</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="p-2 rounded bg-red-500/10 border border-red-500/20 flex justify-between items-center">
                    <span className="text-foreground">תחנת CNC - קו 3</span>
                    <Badge className="bg-red-500/20 text-red-300 text-xs">92% עומס</Badge>
                  </div>
                  <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 flex justify-between items-center">
                    <span className="text-foreground">תחנת כיפוף - קו 1</span>
                    <Badge className="bg-amber-500/20 text-amber-300 text-xs">88% עומס</Badge>
                  </div>
                  <div className="p-2 rounded bg-yellow-500/10 border border-yellow-500/20 flex justify-between items-center">
                    <span className="text-foreground">תחנת ריתוך - קו 2</span>
                    <Badge className="bg-yellow-500/20 text-yellow-300 text-xs">78% עומס</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50 md:col-span-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Gauge className="w-4 h-4 text-cyan-400" />
                  <span className="text-sm font-medium text-foreground">איזון קיבולת קווי ייצור</span>
                </div>
                <div className="space-y-3">
                  {["קו ייצור 1", "קו ייצור 2", "קו ייצור 3", "קו ייצור 4"].map((line, i) => {
                    const current = [72, 85, 94, 58][i];
                    const optimal = [80, 80, 80, 80][i];
                    return (
                      <div key={line} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-20">{line}</span>
                        <div className="flex-1 relative">
                          <Progress value={current} className="h-3" />
                          <div className="absolute top-0 h-3 border-r-2 border-dashed border-violet-400" style={{ right: `${100 - optimal}%` }} />
                        </div>
                        <span className={`text-xs font-medium w-10 text-left ${current > 90 ? "text-red-400" : current > 80 ? "text-amber-400" : "text-emerald-400"}`}>{current}%</span>
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground mt-1">קו מקווקו סגול = יעד אופטימלי (80%) | AI ממליץ להעביר 15% עומס מקו 3 לקו 4</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Energy & Waste */}
        <TabsContent value="energy" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="w-4 h-4 text-orange-400" />
                דפוסי צריכת אנרגיה AI
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">אזור</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">נוכחי (kWh)</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">מותאם (kWh)</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">חיסכון</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שעות שיא</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">המלצה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {energyPatterns.map((ep, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 text-foreground font-medium">{ep.zone}</td>
                        <td className="p-3 text-center text-muted-foreground">{ep.current}</td>
                        <td className="p-3 text-center text-emerald-400 font-medium">{ep.optimized}</td>
                        <td className="p-3 text-center">
                          <Badge className="bg-emerald-500/20 text-emerald-300 text-xs">-{ep.savingPct}%</Badge>
                        </td>
                        <td className="p-3 text-foreground">{ep.peak}</td>
                        <td className="p-3 text-xs text-cyan-400">{ep.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm">
                <Zap className="w-4 h-4 inline ml-1 text-emerald-400" />
                <span className="text-emerald-400 font-medium">חיסכון חודשי מוערך: </span>
                <span className="text-foreground font-bold">₪28,800</span>
                <span className="text-muted-foreground"> | </span>
                <span className="text-emerald-400 font-medium">הפחתה כוללת: </span>
                <span className="text-foreground font-bold">144 kWh/יום</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Leaf className="w-4 h-4 text-green-400" />
                המלצות הפחתת פסולת
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {wasteRecommendations.map((wr, i) => (
                <div key={i} className="p-3 rounded-lg bg-background/30 border border-border/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{wr.category}</span>
                      <Badge className={severityColor[wr.priority] + " border text-xs"}>{wr.priority}</Badge>
                    </div>
                    <span className="text-xs text-emerald-400 font-medium">ROI: {wr.roi}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs mb-2">
                    <div>
                      <span className="text-muted-foreground">נוכחי: </span>
                      <span className="text-foreground">{wr.current}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">יעד: </span>
                      <span className="text-emerald-400">{wr.target}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">הפחתה: </span>
                      <span className="text-emerald-400 font-bold">{wr.reduction}%</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Progress value={100 - wr.reduction} className="h-2 flex-1 ml-3" />
                    <span className="text-xs text-cyan-400 bg-cyan-500/10 rounded px-2 py-1">{wr.action}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
