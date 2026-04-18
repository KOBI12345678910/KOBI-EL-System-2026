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
  Brain, TrendingUp, AlertTriangle, Gauge, Zap, BarChart3, Wrench, ShieldCheck,
  CalendarClock, Factory, Leaf, Flame, Search, Download, RefreshCw, ChevronLeft
} from "lucide-react";

const FALLBACK_KPIS = [
  { label: "שיפור יעילות", value: "18.4%", delta: "+3.2%", icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { label: "דיוק חיזוי פגמים", value: "94.7%", delta: "+1.8%", icon: ShieldCheck, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { label: "השבתה חזויה", value: "6.2 שעות", delta: "-2.1 שעות", icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  { label: "אופטימיזציית OEE", value: "87.3%", delta: "+4.5%", icon: Gauge, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  { label: "חיסכון אנרגיה", value: "₪124,500", delta: "+₪18,200", icon: Zap, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  { label: "עלייה בתפוקה", value: "12.8%", delta: "+2.4%", icon: BarChart3, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
];
const FALLBACK_EQUIPMENT = [
  { id: "EQ-301", name: "מכבש הידראולי A3", prob: 78, fail: "3 ימים", part: "שסתום לחץ", sev: "קריטי", svc: "15/02", rec: "החלפת שסתום + בדיקת סיל" },
  { id: "EQ-118", name: "מסוע ראשי B1", prob: 62, fail: "8 ימים", part: "מנוע הנעה", sev: "גבוה", svc: "28/01", rec: "שימון + כיול מתח רצועה" },
  { id: "EQ-205", name: "רובוט ריתוך C2", prob: 45, fail: "14 ימים", part: "חיישן תרמי", sev: "בינוני", svc: "10/03", rec: "כיול חיישנים + ניקוי זרוע" },
  { id: "EQ-410", name: "CNC מרכז עיבוד D1", prob: 31, fail: "22 ימים", part: "ציר Y", sev: "נמוך", svc: "01/03", rec: "בדיקת דיוק צירים" },
];
const FALLBACK_SCHEDULE = [
  { date: "10/04", eq: "מכבש הידראולי A3", type: "מונעת קריטית", dur: "4 שעות", team: "צוות א'", impact: "עצירת קו 3", ai: 96 },
  { date: "14/04", eq: "מסוע ראשי B1", type: "מונעת מתוכננת", dur: "2 שעות", team: "צוות ב'", impact: "האטת קו 1", ai: 88 },
  { date: "18/04", eq: "רובוט ריתוך C2", type: "כיול תקופתי", dur: "1.5 שעות", team: "צוות א'", impact: "מינימלי", ai: 72 },
  { date: "25/04", eq: "CNC מרכז עיבוד D1", type: "בדיקה שגרתית", dur: "1 שעה", team: "צוות ג'", impact: "ללא", ai: 65 },
];
const FALLBACK_STATIONS = [
  { name: "תחנת ריתוך A", prob: 8.2, trend: "עולה", defect: "ריתוך חלש", cause: "טמפרטורה לא יציבה", conf: 91, rec: "כיול אוטומטי טמפרטורת ריתוך" },
  { name: "תחנת הרכבה B", prob: 5.1, trend: "יורד", defect: "חוסר יישור", cause: "שחיקת ג'יג", conf: 87, rec: "החלפת ג'יג הרכבה" },
  { name: "תחנת צביעה C", prob: 12.4, trend: "עולה", defect: "ציפוי לא אחיד", cause: "לחות גבוהה בתא", conf: 94, rec: "התקנת בקר לחות אוטומטי" },
  { name: "תחנת בדיקה D", prob: 2.8, trend: "יציב", defect: "סטיית מידות", cause: "כיול חיישן", conf: 78, rec: "כיול חיישנים חודשי" },
];
const FALLBACK_ORDERS = [
  { id: "WO-4521", prod: "מנוע X200", cur: 3, ai: 1, save: "2.5 שעות", bn: "תחנת CNC", cap: 92 },
  { id: "WO-4522", prod: "גלגל שיניים G50", cur: 1, ai: 2, save: "1.8 שעות", bn: "תחנת ריתוך", cap: 78 },
  { id: "WO-4523", prod: "מארז אלומיניום P30", cur: 2, ai: 3, save: "0.5 שעות", bn: "אין", cap: 65 },
  { id: "WO-4524", prod: "צינור הידראולי H10", cur: 5, ai: 4, save: "3.1 שעות", bn: "תחנת כיפוף", cap: 88 },
  { id: "WO-4525", prod: "לוח בקרה E80", cur: 4, ai: 5, save: "0.8 שעות", bn: "תחנת הלחמה", cap: 71 },
];
const FALLBACK_ENERGY = [
  { zone: "אולם ייצור A", cur: 342, opt: 285, pct: 16.7, peak: "08:00-12:00", rec: "פיזור עומסים לשעות שפל" },
  { zone: "אולם ייצור B", cur: 278, opt: 241, pct: 13.3, peak: "10:00-14:00", rec: "התקנת VFD במנועים ראשיים" },
  { zone: "מחסן חומרי גלם", cur: 124, opt: 98, pct: 21.0, peak: "06:00-08:00", rec: "תאורת LED + חיישני נוכחות" },
  { zone: "קו אריזה", cur: 186, opt: 162, pct: 12.9, peak: "14:00-18:00", rec: "אופטימיזציית מהירות מסועים" },
];
const FALLBACK_WASTE = [
  { cat: "פסולת מתכת", cur: "3.2 טון/חודש", tgt: "1.8 טון/חודש", red: 43.8, act: "אופטימיזציית חיתוך CNC + מיחזור שבבים", pri: "גבוה", roi: "₪18,500/חודש" },
  { cat: "נוזלי קירור", cur: "420 ליטר/חודש", tgt: "280 ליטר/חודש", red: 33.3, act: "מערכת סינון ומיחזור אוטומטית", pri: "גבוה", roi: "₪12,800/חודש" },
  { cat: "חלקים פגומים", cur: "2.1%", tgt: "0.8%", red: 61.9, act: "בקרת איכות AI בזמן אמת", pri: "קריטי", roi: "₪32,000/חודש" },
];
const SC: Record<string, string> = { "קריטי": "bg-red-500/20 text-red-300 border-red-500/30", "גבוה": "bg-orange-500/20 text-orange-300 border-orange-500/30", "בינוני": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30", "נמוך": "bg-green-500/20 text-green-300 border-green-500/30" };
const TC: Record<string, string> = { "עולה": "text-red-400", "יורד": "text-emerald-400", "יציב": "text-blue-400" };

export default function AiProductionInsights() {

  const { data: apiData } = useQuery({
    queryKey: ["ai_production_insights"],
    queryFn: () => authFetch("/api/ai/ai-production-insights").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const equipment = apiData?.equipment ?? FALLBACK_EQUIPMENT;
  const schedule = apiData?.schedule ?? FALLBACK_SCHEDULE;
  const stations = apiData?.stations ?? FALLBACK_STATIONS;
  const orders = apiData?.orders ?? FALLBACK_ORDERS;
  const energy = apiData?.energy ?? FALLBACK_ENERGY;
  const waste = apiData?.waste ?? FALLBACK_WASTE;
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("maintenance");

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
            <Input placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-56 bg-background/50" />
          </div>
          <Button variant="outline" size="sm"><RefreshCw className="w-4 h-4 ml-1" />רענון</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
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
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50 p-1">
          <TabsTrigger value="maintenance" className="gap-1.5"><Wrench className="w-4 h-4" />תחזוקה חזויה</TabsTrigger>
          <TabsTrigger value="quality" className="gap-1.5"><ShieldCheck className="w-4 h-4" />חיזוי איכות</TabsTrigger>
          <TabsTrigger value="scheduling" className="gap-1.5"><CalendarClock className="w-4 h-4" />אופטימיזציית תזמון</TabsTrigger>
          <TabsTrigger value="energy" className="gap-1.5"><Leaf className="w-4 h-4" />אנרגיה ופסולת</TabsTrigger>
        </TabsList>

        {/* Tab 1 - Predictive Maintenance */}
        <TabsContent value="maintenance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" />חיזוי כשל ציוד</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {equipment.map(eq => (
                  <div key={eq.id} className="p-3 rounded-lg bg-background/30 border border-border/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-muted-foreground">{eq.id}</span>
                        <span className="text-sm font-medium text-foreground">{eq.name}</span>
                      </div>
                      <Badge className={SC[eq.sev] + " border text-xs"}>{eq.sev}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">סיכוי כשל</span>
                          <span className={eq.prob >= 60 ? "text-red-400" : eq.prob >= 40 ? "text-amber-400" : "text-emerald-400"}>{eq.prob}%</span>
                        </div>
                        <Progress value={eq.prob} className="h-2" />
                      </div>
                      <div className="text-left min-w-[70px]">
                        <div className="text-xs text-muted-foreground">כשל צפוי</div>
                        <div className="text-sm font-medium text-foreground">{eq.fail}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>רכיב: {eq.part}</span><span>שירות: {eq.svc}</span>
                    </div>
                    <div className="text-xs text-cyan-400 bg-cyan-500/10 rounded px-2 py-1">
                      <Factory className="w-3 h-3 inline ml-1" />המלצה: {eq.rec}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="w-4 h-4 text-blue-400" />אופטימיזציית לוח תחזוקה</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {schedule.map((s, i) => (
                  <div key={i} className="p-3 rounded-lg bg-background/30 border border-border/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{s.date}</Badge>
                        <span className="text-sm font-medium text-foreground">{s.eq}</span>
                      </div>
                      <div className="flex items-center gap-1"><Brain className="w-3 h-3 text-violet-400" /><span className="text-xs text-violet-400 font-medium">{s.ai}%</span></div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">סוג: </span><span className="text-foreground">{s.type}</span></div>
                      <div><span className="text-muted-foreground">משך: </span><span className="text-foreground">{s.dur}</span></div>
                      <div><span className="text-muted-foreground">צוות: </span><span className="text-foreground">{s.team}</span></div>
                      <div><span className="text-muted-foreground">השפעה: </span><span className="text-foreground">{s.impact}</span></div>
                    </div>
                    <Progress value={s.ai} className="h-1.5" />
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

        {/* Tab 2 - Quality Prediction */}
        <TabsContent value="quality" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {stations.map((q, i) => (
              <Card key={i} className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2"><Factory className="w-4 h-4 text-blue-400" />{q.name}</span>
                    <span className={`text-xs font-normal ${TC[q.trend]}`}>{q.trend === "עולה" ? "▲" : q.trend === "יורד" ? "▼" : "●"} {q.trend}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">הסתברות פגם</span>
                    <span className={`text-lg font-bold ${q.prob > 10 ? "text-red-400" : q.prob > 5 ? "text-amber-400" : "text-emerald-400"}`}>{q.prob}%</span>
                  </div>
                  <Progress value={q.prob} className="h-2" />
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between"><span className="text-muted-foreground">פגם מוביל</span><span className="text-foreground">{q.defect}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">שורש הבעיה</span><span className="text-foreground">{q.cause}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">ביטחון AI</span><span className="text-violet-400 font-medium">{q.conf}%</span></div>
                  </div>
                  <div className="p-2 rounded bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-400"><Brain className="w-3 h-3 inline ml-1" />{q.rec}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3"><Brain className="w-4 h-4 text-violet-400" /><span className="text-sm font-medium text-foreground">ניתוח AI מרוכז</span></div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <div className="text-red-400 font-medium mb-1">התראה: תחנת צביעה C</div>
                  <p className="text-muted-foreground">שיעור פגמים עולה ב-3 ימים רצופים. AI ממליץ בדיקת מערכת לחות מיידית.</p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-emerald-400 font-medium mb-1">שיפור: תחנת הרכבה B</div>
                  <p className="text-muted-foreground">ירידה של 22% בפגמי יישור מאז התקנת ג'יג חדש. מגמה חיובית.</p>
                </div>
                <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="text-blue-400 font-medium mb-1">תחזית: שבוע הבא</div>
                  <p className="text-muted-foreground">מודל AI חוזה ירידה של 8% בפגמים כוללים בעקבות כיולים מתוכננים.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3 - Scheduling Optimization */}
        <TabsContent value="scheduling" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="w-4 h-4 text-blue-400" />רצף ייצור מותאם AI</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/50">
                    {["הזמנה","מוצר","סדר נוכחי","סדר AI","חיסכון","צוואר בקבוק","קיבולת"].map(h => (
                      <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{orders.map(o => (
                    <tr key={o.id} className="border-b border-border/30 hover:bg-card/30">
                      <td className="p-3 font-mono text-foreground">{o.id}</td>
                      <td className="p-3 text-foreground">{o.prod}</td>
                      <td className="p-3 text-center text-muted-foreground">{o.cur}</td>
                      <td className="p-3 text-center">
                        <span className="flex items-center justify-center gap-1">
                          {o.cur !== o.ai && <ChevronLeft className="w-3 h-3 text-violet-400" />}
                          <span className="text-violet-400 font-bold">{o.ai}</span>
                        </span>
                      </td>
                      <td className="p-3 text-emerald-400 font-medium">{o.save}</td>
                      <td className="p-3">
                        <Badge variant="outline" className={`text-xs ${o.bn !== "אין" ? "text-amber-400 border-amber-500/30" : "text-emerald-400 border-emerald-500/30"}`}>{o.bn}</Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Progress value={o.cap} className="h-2 flex-1" />
                          <span className={`text-xs font-medium ${o.cap > 85 ? "text-red-400" : o.cap > 70 ? "text-amber-400" : "text-emerald-400"}`}>{o.cap}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-between">
                <div className="text-sm">
                  <span className="text-violet-400 font-medium">חיסכון מוערך: </span><span className="text-foreground font-bold">8.7 שעות/מחזור</span>
                  <span className="text-muted-foreground mr-2"> | תפוקה: </span><span className="text-emerald-400 font-bold">+14.2%</span>
                </div>
                <Button size="sm" className="bg-violet-600 hover:bg-violet-700">אמץ רצף AI</Button>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-amber-400" /><span className="text-sm font-medium text-foreground">חיזוי צווארי בקבוק</span></div>
                <div className="space-y-2 text-xs">
                  {[{ n: "תחנת CNC - קו 3", v: 92, c: "red" }, { n: "תחנת כיפוף - קו 1", v: 88, c: "amber" }, { n: "תחנת ריתוך - קו 2", v: 78, c: "yellow" }].map((b, i) => (
                    <div key={i} className={`p-2 rounded bg-${b.c}-500/10 border border-${b.c}-500/20 flex justify-between items-center`}>
                      <span className="text-foreground">{b.n}</span>
                      <Badge className={`bg-${b.c}-500/20 text-${b.c}-300 text-xs`}>{b.v}% עומס</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50 md:col-span-2">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3"><Gauge className="w-4 h-4 text-cyan-400" /><span className="text-sm font-medium text-foreground">איזון קיבולת קווי ייצור</span></div>
                <div className="space-y-3">
                  {[{ l: "קו ייצור 1", v: 72 }, { l: "קו ייצור 2", v: 85 }, { l: "קו ייצור 3", v: 94 }, { l: "קו ייצור 4", v: 58 }].map(ln => (
                    <div key={ln.l} className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-20">{ln.l}</span>
                      <div className="flex-1 relative">
                        <Progress value={ln.v} className="h-3" />
                        <div className="absolute top-0 h-3 border-r-2 border-dashed border-violet-400" style={{ right: "20%" }} />
                      </div>
                      <span className={`text-xs font-medium w-10 text-left ${ln.v > 90 ? "text-red-400" : ln.v > 80 ? "text-amber-400" : "text-emerald-400"}`}>{ln.v}%</span>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground">קו סגול מקווקו = יעד 80% | AI ממליץ העברת 15% עומס מקו 3 לקו 4</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4 - Energy & Waste */}
        <TabsContent value="energy" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Flame className="w-4 h-4 text-orange-400" />דפוסי צריכת אנרגיה AI</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/50">
                    {["אזור","נוכחי (kWh)","מותאם (kWh)","חיסכון","שעות שיא","המלצה"].map(h => (
                      <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{energy.map((e, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-card/30">
                      <td className="p-3 text-foreground font-medium">{e.zone}</td>
                      <td className="p-3 text-center text-muted-foreground">{e.cur}</td>
                      <td className="p-3 text-center text-emerald-400 font-medium">{e.opt}</td>
                      <td className="p-3 text-center"><Badge className="bg-emerald-500/20 text-emerald-300 text-xs">-{e.pct}%</Badge></td>
                      <td className="p-3 text-foreground">{e.peak}</td>
                      <td className="p-3 text-xs text-cyan-400">{e.rec}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm">
                <Zap className="w-4 h-4 inline ml-1 text-emerald-400" />
                <span className="text-emerald-400 font-medium">חיסכון חודשי: </span><span className="text-foreground font-bold">₪28,800</span>
                <span className="text-muted-foreground"> | </span>
                <span className="text-emerald-400 font-medium">הפחתה: </span><span className="text-foreground font-bold">144 kWh/יום</span>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Leaf className="w-4 h-4 text-green-400" />המלצות הפחתת פסולת</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {waste.map((w, i) => (
                <div key={i} className="p-3 rounded-lg bg-background/30 border border-border/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{w.cat}</span>
                      <Badge className={SC[w.pri] + " border text-xs"}>{w.pri}</Badge>
                    </div>
                    <span className="text-xs text-emerald-400 font-medium">ROI: {w.roi}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs mb-2">
                    <div><span className="text-muted-foreground">נוכחי: </span><span className="text-foreground">{w.cur}</span></div>
                    <div><span className="text-muted-foreground">יעד: </span><span className="text-emerald-400">{w.tgt}</span></div>
                    <div><span className="text-muted-foreground">הפחתה: </span><span className="text-emerald-400 font-bold">{w.red}%</span></div>
                  </div>
                  <div className="flex items-center justify-between">
                    <Progress value={100 - w.red} className="h-2 flex-1 ml-3" />
                    <span className="text-xs text-cyan-400 bg-cyan-500/10 rounded px-2 py-1">{w.act}</span>
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
