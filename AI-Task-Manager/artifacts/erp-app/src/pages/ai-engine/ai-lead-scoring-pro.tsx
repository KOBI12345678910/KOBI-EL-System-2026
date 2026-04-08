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
  Brain, Users, Flame, TrendingUp, Target, Zap, Search, Download,
  RefreshCw, ArrowUpRight, ArrowDownRight, BarChart3, Activity,
  Percent, Star, Calendar, Building2, DollarSign
} from "lucide-react";

const FALLBACK_KPIS = [
  { label: "לידים שנוקדו", value: "2,847", change: "+184", up: true, icon: Users, color: "from-blue-500 to-blue-600" },
  { label: "ציון ממוצע", value: "64.3", change: "+2.8", up: true, icon: Brain, color: "from-purple-500 to-purple-600" },
  { label: "לידים חמים (80+)", value: "412", change: "+37", up: true, icon: Flame, color: "from-orange-500 to-red-500" },
  { label: "חיזוי המרה %", value: "34.7%", change: "+3.1%", up: true, icon: TrendingUp, color: "from-emerald-500 to-emerald-600" },
  { label: "דיוק המודל", value: "91.2%", change: "+0.8%", up: true, icon: Target, color: "from-cyan-500 to-cyan-600" },
  { label: "הרצות ניקוד היום", value: "18", change: "-2", up: false, icon: Zap, color: "from-yellow-500 to-amber-500" },
];

const FALLBACK_LEADS = [
  { id: 1, name: "אבי כהן", co: "טכנולוגיות עתיד", score: 94, src: "אתר", budget: "₪350K", time: "30 יום", eng: "גבוהה", action: "תאם פגישה דחופה" },
  { id: 2, name: "מיכל לוי", co: "פתרונות ענן בע\"מ", score: 91, src: "הפניה", budget: "₪520K", time: "14 יום", eng: "גבוהה מאוד", action: "שלח הצעת מחיר" },
  { id: 3, name: "יוסף מזרחי", co: "דטה פרו", score: 87, src: "לינקדאין", budget: "₪180K", time: "60 יום", eng: "גבוהה", action: "תאם שיחה" },
  { id: 4, name: "שרה ברק", co: "סמארט סולושנס", score: 85, src: "כנס", budget: "₪420K", time: "45 יום", eng: "בינונית-גבוהה", action: "שלח חומר שיווקי" },
  { id: 5, name: "דוד אשכנזי", co: "אינוביט תוכנה", score: 82, src: "אתר", budget: "₪290K", time: "30 יום", eng: "גבוהה", action: "תאם דמו" },
  { id: 6, name: "רחל גולן", co: "נקסט ג'ן", score: 78, src: "פרסום", budget: "₪150K", time: "90 יום", eng: "בינונית", action: "שלח ניוזלטר" },
  { id: 7, name: "עמית פרץ", co: "קלאוד מאסטרס", score: 76, src: "הפניה", budget: "₪680K", time: "60 יום", eng: "בינונית", action: "מעקב טלפוני" },
  { id: 8, name: "נועה שמש", co: "AI ישראל", score: 73, src: "לינקדאין", budget: "₪230K", time: "45 יום", eng: "בינונית", action: "הזמנה לוובינר" },
  { id: 9, name: "אורי דגן", co: "ביג דטה בע\"מ", score: 69, src: "אתר", budget: "₪400K", time: "120 יום", eng: "נמוכה-בינונית", action: "המשך טיפוח" },
  { id: 10, name: "תמר רוזן", co: "פיוצ'ר טק", score: 65, src: "כנס", budget: "₪175K", time: "90 יום", eng: "בינונית", action: "שלח מקרה בוחן" },
  { id: 11, name: "גיל נחמיאס", co: "סייבר שילד", score: 58, src: "פרסום", budget: "₪95K", time: "180 יום", eng: "נמוכה", action: "הוסף לרשימת דיוור" },
  { id: 12, name: "ליאת חדד", co: "דיגיטל פירסט", score: 52, src: "אתר", budget: "₪130K", time: "90 יום", eng: "נמוכה", action: "שלח תוכן חינוכי" },
  { id: 13, name: "משה אלון", co: "טק סטארט", score: 45, src: "לינקדאין", budget: "₪60K", time: "180 יום", eng: "נמוכה", action: "טיפוח ארוך טווח" },
  { id: 14, name: "הדר קליין", co: "אופטימל IT", score: 38, src: "פרסום", budget: "₪45K", time: "לא ידוע", eng: "מינימלית", action: "ניטור בלבד" },
  { id: 15, name: "ירון בן-דוד", co: "מיקרו סיסטמס", score: 27, src: "אתר", budget: "לא ידוע", time: "לא ידוע", eng: "מינימלית", action: "סיווג מחדש" },
];

const FALLBACK_SCORING_FACTORS = [
  { factor: "גודל חברה", weight: 22, impact: "גבוה", desc: "מספר עובדים, הכנסות שנתיות, נתח שוק", trend: "+3%" },
  { factor: "התאמת תעשייה", weight: 20, impact: "גבוה", desc: "מגזר, תת-ענף, מגמות שוק, רגולציה", trend: "+1%" },
  { factor: "תקציב", weight: 18, impact: "גבוה", desc: "תקציב מוצהר, היסטוריית רכישות, ROI צפוי", trend: "0%" },
  { factor: "ציר זמן החלטה", weight: 16, impact: "בינוני-גבוה", desc: "דחיפות, מועד יעד, תהליך אישור פנימי", trend: "+2%" },
  { factor: "רמת מעורבות", weight: 14, impact: "בינוני", desc: "ביקורים באתר, פתיחת מיילים, הורדות, צ'אט", trend: "+5%" },
  { factor: "רכישות עבר", weight: 10, impact: "בינוני", desc: "היסטוריית לקוח, חידושים, שדרוגים, NPS", trend: "-1%" },
];

const FALLBACK_SCORE_BANDS = [
  { range: "90-100", label: "חם מאוד", count: 127, conversion: 72, color: "bg-red-500" },
  { range: "80-89", label: "חם", count: 285, conversion: 54, color: "bg-orange-500" },
  { range: "70-79", label: "חמים", count: 419, conversion: 38, color: "bg-yellow-500" },
  { range: "60-69", label: "בינוני", count: 583, conversion: 22, color: "bg-blue-500" },
  { range: "50-59", label: "קריר", count: 496, conversion: 12, color: "bg-cyan-500" },
  { range: "40-49", label: "קר", count: 412, conversion: 6, color: "bg-indigo-400" },
  { range: "30-39", label: "קר מאוד", count: 298, conversion: 3, color: "bg-slate-400" },
  { range: "0-29", label: "לא פעיל", count: 227, conversion: 1, color: "bg-slate-600" },
];

const FALLBACK_PERF_ACCURACY = [
  { month: "ינואר", value: 87.4 }, { month: "פברואר", value: 88.1 }, { month: "מרץ", value: 88.9 },
  { month: "אפריל", value: 89.5 }, { month: "מאי", value: 90.2 }, { month: "יוני", value: 91.2 },
];
const falseRates = { fp: 5.3, fn: 3.5, prevFp: 6.1, prevFn: 4.2 };
const FALLBACK_AB_TESTS = [
  { name: "מודל V3 vs V2", metric: "דיוק", vA: 91.2, vB: 88.9, winner: "V3", lift: "+2.6%" },
  { name: "משקל מעורבות x2", metric: "המרה", vA: 36.4, vB: 34.7, winner: "A", lift: "+4.9%" },
  { name: "פיצ'ר תעשייה חדש", metric: "F1-Score", vA: 0.89, vB: 0.86, winner: "A", lift: "+3.5%" },
  { name: "חלון 30 vs 60 יום", metric: "Recall", vA: 84.1, vB: 81.7, winner: "30 יום", lift: "+2.9%" },
];

const scoreColor = (s: number) => s >= 80 ? "text-red-400" : s >= 60 ? "text-yellow-400" : s >= 40 ? "text-blue-400" : "text-slate-400";
const engBadge = (e: string) => e.includes("גבוהה מאוד") ? "bg-emerald-500/20 text-emerald-300" : e.includes("גבוהה") ? "bg-green-500/20 text-green-300" : e.includes("בינונית") ? "bg-yellow-500/20 text-yellow-300" : "bg-slate-500/20 text-slate-400";
const impactBadge = (i: string) => i === "גבוה" ? "bg-red-500/20 text-red-300" : i === "בינוני-גבוה" ? "bg-orange-500/20 text-orange-300" : "bg-yellow-500/20 text-yellow-300";

export default function AiLeadScoringPro() {

  const { data: apiData } = useQuery({
    queryKey: ["ai_lead_scoring_pro"],
    queryFn: () => authFetch("/api/ai/ai-lead-scoring-pro").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const leads = apiData?.leads ?? FALLBACK_LEADS;
  const scoringFactors = apiData?.scoringFactors ?? FALLBACK_SCORING_FACTORS;
  const scoreBands = apiData?.scoreBands ?? FALLBACK_SCORE_BANDS;
  const perfAccuracy = apiData?.perfAccuracy ?? FALLBACK_PERF_ACCURACY;
  const abTests = apiData?.abTests ?? FALLBACK_AB_TESTS;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("scored-leads");
  const filtered = leads.filter((l) => l.name.includes(search) || l.co.includes(search) || l.src.includes(search));
  const maxBand = Math.max(...scoreBands.map((b) => b.count));

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="w-7 h-7 text-purple-400" />דירוג לידים AI מתקדם
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מנוע ניקוד חכם | ניתוח מבוסס למידת מכונה בזמן אמת</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><RefreshCw className="w-4 h-4 ml-1" />הרצת ניקוד</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-card/60 border-border/50 hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg bg-gradient-to-br ${k.color} bg-opacity-20`}>
                  <k.icon className="w-4 h-4 text-white" />
                </div>
                <span className={`text-xs font-medium flex items-center gap-0.5 ${k.up ? "text-emerald-400" : "text-red-400"}`}>
                  {k.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{k.change}
                </span>
              </div>
              <div className="text-xl font-bold text-foreground">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50 p-1">
          <TabsTrigger value="scored-leads">לידים מנוקדים</TabsTrigger>
          <TabsTrigger value="scoring-model">מודל ניקוד</TabsTrigger>
          <TabsTrigger value="distribution">התפלגות ציונים</TabsTrigger>
          <TabsTrigger value="performance">ביצועי מודל</TabsTrigger>
        </TabsList>

        <TabsContent value="scored-leads" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">לידים מנוקדים ({filtered.length})</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש ליד, חברה, מקור..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      {["ציון AI","איש קשר","חברה","מקור","תקציב","ציר זמן","מעורבות","פעולה מומלצת"].map((h) => (
                        <th key={h} className="text-right p-3 font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => (
                      <tr key={l.id} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <span className={`text-lg font-bold ${scoreColor(l.score)}`}>{l.score}</span>
                            <Progress value={l.score} className="h-1.5 w-12" />
                          </div>
                        </td>
                        <td className="p-3 font-medium text-foreground">{l.name}</td>
                        <td className="p-3"><span className="flex items-center gap-1.5 text-muted-foreground"><Building2 className="w-3.5 h-3.5" />{l.co}</span></td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{l.src}</Badge></td>
                        <td className="p-3"><span className="flex items-center gap-1 text-foreground"><DollarSign className="w-3.5 h-3.5 text-emerald-400" />{l.budget}</span></td>
                        <td className="p-3"><span className="flex items-center gap-1 text-muted-foreground"><Calendar className="w-3.5 h-3.5" />{l.time}</span></td>
                        <td className="p-3"><Badge className={`text-xs ${engBadge(l.eng)}`}>{l.eng}</Badge></td>
                        <td className="p-3"><span className="text-xs text-blue-400 font-medium">{l.action}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scoring-model" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="w-5 h-5 text-cyan-400" />גורמי ניקוד ומשקלות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {scoringFactors.map((f) => (
                <div key={f.factor} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-foreground">{f.factor}</span>
                      <Badge className={impactBadge(f.impact)}>השפעה: {f.impact}</Badge>
                      <span className={`text-xs font-medium ${f.trend.startsWith("+") ? "text-emerald-400" : f.trend === "0%" ? "text-muted-foreground" : "text-red-400"}`}>{f.trend}</span>
                    </div>
                    <span className="text-sm font-bold text-foreground">{f.weight}%</span>
                  </div>
                  <Progress value={f.weight} className="h-3" />
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
              ))}
              <div className="mt-4 p-3 bg-muted/30 rounded-lg border border-border/50">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Activity className="w-4 h-4 text-purple-400" />
                  סה״כ משקל: 100% | המודל מתעדכן כל 24 שעות | אימון אחרון: היום 03:00
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distribution" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-400" />התפלגות ציונים ושיעורי המרה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {scoreBands.map((b) => (
                <div key={b.range} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <span className="font-mono font-bold text-foreground w-14">{b.range}</span>
                      <Badge variant="outline" className="text-xs">{b.label}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{b.count} לידים</span>
                      <span className="font-semibold text-foreground">{b.conversion}% המרה</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-muted/30 rounded-full h-6 overflow-hidden">
                      <div className={`h-full ${b.color} rounded-full flex items-center justify-end px-2 transition-all`} style={{ width: `${(b.count / maxBand) * 100}%` }}>
                        <span className="text-[10px] font-bold text-white">{b.count}</span>
                      </div>
                    </div>
                    <div className="w-20 bg-muted/30 rounded-full h-6 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full flex items-center justify-center transition-all" style={{ width: `${b.conversion}%` }}>
                        {b.conversion >= 10 && <span className="text-[10px] font-bold text-white">{b.conversion}%</span>}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-border/50">
                {[{ v: "2,847", l: "סה״כ לידים מנוקדים", c: "text-foreground" }, { v: "64.3", l: "ציון חציוני", c: "text-emerald-400" }, { v: "14.5%", l: "לידים חמים מסה״כ", c: "text-orange-400" }].map((s) => (
                  <div key={s.l} className="text-center p-3 bg-muted/20 rounded-lg">
                    <div className={`text-2xl font-bold ${s.c}`}>{s.v}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.l}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-400" />מגמת דיוק המודל
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-3 h-40">
                {perfAccuracy.map((item) => (
                  <div key={item.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-xs font-bold text-foreground">{item.value}%</span>
                    <div className="w-full bg-muted/30 rounded-t-md overflow-hidden relative" style={{ height: "100%" }}>
                      <div className="absolute bottom-0 w-full bg-gradient-to-t from-emerald-600 to-emerald-400 rounded-t-md transition-all" style={{ height: `${((item.value - 85) / 10) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{item.month}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Percent className="w-4 h-4 text-yellow-400" />שיעורי שגיאה
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[{ label: "False Positive (חיובי שגוי)", val: falseRates.fp, prev: falseRates.prevFp },
                  { label: "False Negative (שלילי שגוי)", val: falseRates.fn, prev: falseRates.prevFn }].map((r) => (
                  <div key={r.label} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{r.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{r.val}%</span>
                        <span className="text-xs text-emerald-400 flex items-center"><ArrowDownRight className="w-3 h-3" />מ-{r.prev}%</span>
                      </div>
                    </div>
                    <Progress value={r.val * 10} className="h-2" />
                  </div>
                ))}
                <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20 mt-4">
                  <div className="text-xs text-emerald-400 flex items-center gap-1">
                    <Star className="w-3.5 h-3.5" />שיעורי שגיאה בירידה מתמשכת -- שיפור של 12% ב-6 החודשים האחרונים
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-400" />תוצאות A/B Testing
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {abTests.map((t, i) => (
                    <div key={i} className="p-3 bg-muted/20 rounded-lg border border-border/30">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-medium text-sm text-foreground">{t.name}</span>
                        <Badge className="bg-emerald-500/20 text-emerald-300 text-xs">{t.lift}</Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>מטריקה: {t.metric}</span>
                        <span>A: {t.vA} | B: {t.vB}</span>
                        <Badge variant="outline" className="text-[10px]">מנצח: {t.winner}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
