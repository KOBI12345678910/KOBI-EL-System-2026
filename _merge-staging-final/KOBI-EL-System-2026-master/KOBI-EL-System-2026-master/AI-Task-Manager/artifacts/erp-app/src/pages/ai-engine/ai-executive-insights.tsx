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
  Brain, AlertTriangle, TrendingDown, Coins, Radio, Lightbulb, Search, RefreshCw,
  Download, Sparkles, Shield, Activity, BarChart3, DollarSign, Users, Clock,
  Zap, Target, ArrowUpRight, ArrowDownRight, Minus, FileText
} from "lucide-react";

const FALLBACK_KPIS = [
  { label: "תובנות שנוצרו", value: "1,247", delta: "+89 היום", icon: Brain, color: "text-violet-400", bg: "bg-violet-500/10" },
  { label: "התראות קריטיות", value: "3", delta: "2 חדשות", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "חריגות הכנסה", value: "7", delta: "3 פתוחות", icon: TrendingDown, color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "חיסכון עלויות", value: "₪2.4M", delta: "+₪180K השבוע", icon: Coins, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "אותות שוק", value: "42", delta: "12 השבוע", icon: Radio, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "המלצות אסטרטגיות", value: "18", delta: "5 בעדיפות גבוהה", icon: Lightbulb, color: "text-amber-400", bg: "bg-amber-500/10" },
];

const FALLBACK_BRIEFING_SECTIONS = [
  { title: "בריאות פיננסית", icon: DollarSign, score: 87, items: [
    { text: "הכנסות Q1 חצו את היעד ב-4.2%, סה\"כ ₪48.7M", trend: "up" as const },
    { text: "שולי רווח גולמי יציבים על 38.4%, עלייה של 1.1% מ-Q4", trend: "up" as const },
    { text: "תזרים מזומנים חיובי: ₪6.2M נטו, יחס כיסוי 1.8x", trend: "up" as const },
    { text: "חובות לקוחות: DSO עלה ל-47 יום, דורש תשומת לב", trend: "down" as const },
  ]},
  { title: "דגשים תפעוליים", icon: Activity, score: 74, items: [
    { text: "יעילות ייצור (OEE) עלתה ל-82.3% לאחר שדרוג קו 4", trend: "up" as const },
    { text: "זמן אספקה ממוצע ירד ל-3.2 ימים מ-4.1", trend: "up" as const },
    { text: "שביעות רצון לקוחות NPS עלה ל-72, שיא שנתי", trend: "up" as const },
    { text: "שיעור תקלות קו 2 עלה ב-15% - בבדיקה", trend: "down" as const },
  ]},
  { title: "התראות סיכון", icon: Shield, score: 62, items: [
    { text: "ספק חומרי גלם מרכזי דיווח על עיכוב של 2 שבועות", trend: "down" as const },
    { text: "רגולציה חדשה: דרישות דיווח ESG נכנסות לתוקף ב-Q3", trend: "neutral" as const },
    { text: "3 עובדי מפתח בסיכון עזיבה לפי מודל AI", trend: "down" as const },
    { text: "חשיפה למט\"ח: USD/ILS תנודתיות צפויה בשבועיים הקרובים", trend: "neutral" as const },
  ]},
  { title: "עדכוני שוק", icon: BarChart3, score: 71, items: [
    { text: "מתחרה X השיק מוצר מתחרה - ניתוח השפעה בהכנה", trend: "down" as const },
    { text: "ביקוש בשוק ה-B2B צפוי לעלות ב-8% ב-Q2", trend: "up" as const },
    { text: "מחירי חומרי גלם (פלדה) ירדו ב-3.2% החודש", trend: "up" as const },
    { text: "שיתוף פעולה פוטנציאלי עם שותף אסטרטגי בשלבי משא ומתן", trend: "neutral" as const },
  ]},
];

const FALLBACK_ANOMALIES = [
  { id: 1, title: "ירידת הכנסות חדה - מגזר דרום", severity: "קריטי", type: "הכנסה", detected: "לפני 2 שעות", change: -18.4, explanation: "ירידה של 18.4% בהכנסות מגזר דרום. AI מזהה קורלציה עם עזיבת 2 אנשי מכירות בכירים ומעבר לקוח מרכזי למתחרה.", confidence: 94 },
  { id: 2, title: "עלייה חריגה בעלויות תפעול", severity: "גבוה", type: "עלות", detected: "לפני 5 שעות", change: 23.1, explanation: "עלויות תפעול עלו ב-23.1% מעל הנורמה. שעות נוספות בקו ייצור 3 עקב תקלת ציוד. עלות מצטברת: ₪340K.", confidence: 89 },
  { id: 3, title: "שינוי בדפוסי פרודוקטיביות", severity: "בינוני", type: "תפעול", detected: "לפני 1 יום", change: -12.7, explanation: "ירידה של 12.7% בפרודוקטיביות מחלקת פיתוח. קורלציה עם מעבר למערכת ניהול פרויקטים חדשה. צפי שיפור תוך 2-3 שבועות.", confidence: 76 },
  { id: 4, title: "חריגה בדפוס רכש", severity: "בינוני", type: "רכש", detected: "לפני 1 יום", change: 31.5, explanation: "עלייה של 31.5% בהזמנות רכש ממחלקת שיווק. כפילויות בהזמנות ספקי מדיה. חיסכון פוטנציאלי: ₪120K.", confidence: 82 },
  { id: 5, title: "ירידה בשיעור המרה דיגיטלי", severity: "גבוה", type: "מכירות", detected: "לפני 8 שעות", change: -22.3, explanation: "שיעור המרה ירד מ-3.8% ל-2.95%. בעיית ביצועים בעמוד תשלום. זמן טעינה עלה מ-1.2 ל-4.7 שניות.", confidence: 91 },
];

const FALLBACK_FORECASTS = [
  { metric: "הכנסות Q2", current: "₪48.7M", forecast: "₪52.1M", confidence: 82, trend: "up", range: "₪49.8M - ₪54.4M" },
  { metric: "שולי רווח גולמי", current: "38.4%", forecast: "39.1%", confidence: 75, trend: "up", range: "37.8% - 40.4%" },
  { metric: "ביקוש מוצר A", current: "12,400 יח'", forecast: "14,800 יח'", confidence: 79, trend: "up", range: "13,200 - 16,400" },
  { metric: "תזרים מזומנים", current: "₪6.2M", forecast: "₪7.8M", confidence: 71, trend: "up", range: "₪5.9M - ₪9.7M" },
  { metric: "עלות עובד ממוצעת", current: "₪28.4K", forecast: "₪29.1K", confidence: 88, trend: "up", range: "₪28.7K - ₪29.5K" },
  { metric: "שיעור נטישת לקוחות", current: "4.2%", forecast: "3.8%", confidence: 68, trend: "down", range: "3.2% - 4.5%" },
];

const FALLBACK_RECOMMENDATIONS = [
  { id: 1, title: "איחוד ספקי חומרי גלם", confidence: 92, impact: "₪1.8M חיסכון שנתי", effort: "בינוני", priority: "קריטי", category: "רכש", desc: "איחוד 7 ספקים ל-3 אסטרטגיים. פוטנציאל חיסכון 12% על בסיס נפח מצטבר ותנאי תשלום.", timeline: "3-4 חודשים" },
  { id: 2, title: "אוטומציה של תהליך הזמנות", confidence: 88, impact: "₪640K + 40% קיצור זמן", effort: "גבוה", priority: "גבוה", category: "תפעול", desc: "הטמעת RPA לחיסכון 2,400 שעות בשנה והפחתת שגיאות ב-95%.", timeline: "4-6 חודשים" },
  { id: 3, title: "הרחבת קו מוצרים לשוק SMB", confidence: 81, impact: "₪3.2M הכנסות חדשות", effort: "גבוה", priority: "גבוה", category: "אסטרטגיה", desc: "פער משמעותי בשוק SMB. התאמת מוצר A לפורמט קטן תפתח 340 לקוחות.", timeline: "6-8 חודשים" },
  { id: 4, title: "שיפור מערך שימור עובדים", confidence: 85, impact: "₪920K חיסכון בגיוס", effort: "נמוך", priority: "גבוה", category: "HR", desc: "12 עובדי מפתח בסיכון עזיבה. תוכנית שימור ממוקדת להפחתת נטישה ב-60%.", timeline: "1-2 חודשים" },
  { id: 5, title: "מעבר לענן היברידי", confidence: 77, impact: "₪480K חיסכון + ביצועים", effort: "גבוה", priority: "בינוני", category: "IT", desc: "העברת 60% עומסים לענן ציבורי. שיפור זמני תגובה ב-35%.", timeline: "8-12 חודשים" },
  { id: 6, title: "אופטימיזציה של תמחור דינמי", confidence: 84, impact: "₪1.1M תוספת הכנסה", effort: "בינוני", priority: "גבוה", category: "מכירות", desc: "מודל תמחור AI בזמן אמת. בדיקות A/B מראות עלייה של 7% בהכנסה למכירה.", timeline: "3-5 חודשים" },
  { id: 7, title: "שיפור חוויית לקוח דיגיטלית", confidence: 79, impact: "15% עלייה בהמרות", effort: "בינוני", priority: "בינוני", category: "דיגיטל", desc: "שדרוג מסע לקוח: chatbot AI, פרסונליזציה ו-checkout מקוצר.", timeline: "4-6 חודשים" },
];

const sev: Record<string, string> = { "קריטי": "bg-red-500/20 text-red-300 border-red-500/30", "גבוה": "bg-orange-500/20 text-orange-300 border-orange-500/30", "בינוני": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" };
const pri: Record<string, string> = { "קריטי": "bg-red-500/20 text-red-300", "גבוה": "bg-orange-500/20 text-orange-300", "בינוני": "bg-yellow-500/20 text-yellow-300" };
const eff: Record<string, string> = { "נמוך": "bg-green-500/20 text-green-300", "בינוני": "bg-yellow-500/20 text-yellow-300", "גבוה": "bg-red-500/20 text-red-300" };

function TrendIcon({ t }: { t: string }) {
  if (t === "up") return <ArrowUpRight className="w-4 h-4 text-emerald-400" />;
  if (t === "down") return <ArrowDownRight className="w-4 h-4 text-red-400" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

export default function AiExecutiveInsights() {

  const { data: apiData } = useQuery({
    queryKey: ["ai_executive_insights"],
    queryFn: () => authFetch("/api/ai/ai-executive-insights").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const briefingSections = apiData?.briefingSections ?? FALLBACK_BRIEFING_SECTIONS;
  const anomalies = apiData?.anomalies ?? FALLBACK_ANOMALIES;
  const forecasts = apiData?.forecasts ?? FALLBACK_FORECASTS;
  const recommendations = apiData?.recommendations ?? FALLBACK_RECOMMENDATIONS;
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("briefing");
  const [expandedAnomaly, setExpandedAnomaly] = useState<number | null>(null);
  const [expandedRec, setExpandedRec] = useState<number | null>(null);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20">
            <Brain className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">תובנות מנהליות AI</h1>
            <p className="text-sm text-muted-foreground">מודיעין ביצועי עסקי לדרג C-Suite</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="חיפוש תובנות..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-64 bg-background/50" />
          </div>
          <Button variant="outline" size="sm"><RefreshCw className="w-4 h-4 ml-1" />רענון</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50 hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${k.bg}`}><k.icon className={`w-4 h-4 ${k.color}`} /></div>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground border-border/50">{k.delta}</Badge>
              </div>
              <div className="text-xl font-bold text-foreground">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50 p-1">
          <TabsTrigger value="briefing" className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-300 gap-1.5">
            <FileText className="w-4 h-4" />תדריך יומי
          </TabsTrigger>
          <TabsTrigger value="anomalies" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-300 gap-1.5">
            <AlertTriangle className="w-4 h-4" />זיהוי חריגות
          </TabsTrigger>
          <TabsTrigger value="predictive" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 gap-1.5">
            <BarChart3 className="w-4 h-4" />ניתוח חזוי
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300 gap-1.5">
            <Lightbulb className="w-4 h-4" />המלצות אסטרטגיות
          </TabsTrigger>
        </TabsList>

        {/* Daily Briefing Tab */}
        <TabsContent value="briefing" className="space-y-4">
          <Card className="bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 border-violet-500/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-violet-400" />
                  <CardTitle className="text-lg">סיכום מנכ"ל יומי - 8 באפריל 2026</CardTitle>
                </div>
                <Badge className="bg-violet-500/20 text-violet-300 border-violet-500/30">נוצר ע"י AI</Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground leading-relaxed">
                מצב העסק חיובי עם הכנסות מעל ליעד ושולי רווח יציבים. נדרשת תשומת לב לעיכוב בשרשרת אספקה
                ולזיהוי סיכון עזיבת עובדים. שוק ה-B2B מראה סימני צמיחה שכדאי לנצל.
              </p>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {briefingSections.map(s => (
              <Card key={s.title} className="bg-card/50 border-border/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <s.icon className="w-5 h-5 text-muted-foreground" />
                      <CardTitle className="text-base">{s.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{s.score}/100</span>
                      <Progress value={s.score} className="w-20 h-2" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2.5">
                  {s.items.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <TrendIcon t={item.trend} />
                      <span className="text-muted-foreground leading-relaxed">{item.text}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Anomaly Detection Tab */}
        <TabsContent value="anomalies" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">AI מנטר 2,847 נקודות נתונים ומזהה דפוסים חריגים בזמן אמת</p>
            <div className="flex gap-1">
              {["קריטי","גבוה","בינוני"].map(s => (
                <Badge key={s} className={`${sev[s]} text-xs`}>{anomalies.filter(a => a.severity === s).length} {s}</Badge>
              ))}
            </div>
          </div>
          {anomalies.map(a => (
            <Card key={a.id} className={`bg-card/50 border-border/50 cursor-pointer transition-all hover:border-border ${expandedAnomaly === a.id ? "ring-1 ring-border" : ""}`}
              onClick={() => setExpandedAnomaly(expandedAnomaly === a.id ? null : a.id)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${a.change < 0 ? "bg-red-500/10" : "bg-orange-500/10"}`}>
                      {a.change < 0 ? <TrendingDown className="w-4 h-4 text-red-400" /> : <ArrowUpRight className="w-4 h-4 text-orange-400" />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{a.title}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge className={`${sev[a.severity]} text-[10px]`}>{a.severity}</Badge>
                        <span className="text-xs text-muted-foreground">{a.type} &#x2022; {a.detected}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-left">
                    <div className={`text-lg font-bold ${a.change < 0 ? "text-red-400" : "text-orange-400"}`}>
                      {a.change > 0 ? "+" : ""}{a.change}%
                    </div>
                    <div className="text-xs text-muted-foreground">שינוי מהנורמה</div>
                  </div>
                </div>
                {expandedAnomaly === a.id && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                      <span className="text-sm font-medium text-foreground">ניתוח AI</span>
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">ביטחון {a.confidence}%</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{a.explanation}</p>
                    <div className="flex gap-2 mt-3">
                      <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-xs">צור תוכנית פעולה</Button>
                      <Button variant="outline" size="sm" className="text-xs">שתף עם צוות</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Predictive Analytics Tab */}
        <TabsContent value="predictive" className="space-y-4">
          <Card className="bg-gradient-to-br from-cyan-500/5 to-blue-500/5 border-cyan-500/20">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-cyan-400" />
                <CardTitle className="text-lg">תחזית רבעון הבא (Q2 2026)</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">מבוסס על 18 חודשי נתונים, מגמות שוק ודפוסים עונתיים</p>
            </CardHeader>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {forecasts.map(f => (
              <Card key={f.metric} className="bg-card/50 border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-foreground text-sm">{f.metric}</h3>
                    <TrendIcon t={f.trend} />
                  </div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-2xl font-bold text-foreground">{f.forecast}</span>
                    <span className="text-xs text-muted-foreground">מ-{f.current}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mb-3">טווח: {f.range}</div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">רמת ביטחון</span>
                    <span className={`font-medium ${f.confidence >= 80 ? "text-emerald-400" : f.confidence >= 70 ? "text-yellow-400" : "text-orange-400"}`}>{f.confidence}%</span>
                  </div>
                  <Progress value={f.confidence} className="h-1.5 mt-1" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-5 h-5 text-cyan-400" />מגמות ביקוש צפויות
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {[
                { label: "מוצר A - Enterprise", growth: 19, conf: 84 },
                { label: "מוצר B - SMB", growth: 8, conf: 72 },
                { label: "שירותי ענן", growth: 34, conf: 78 },
                { label: "שירותים מקצועיים", growth: -3, conf: 65 },
              ].map(d => (
                <div key={d.label} className="flex items-center gap-3">
                  <span className="text-sm text-foreground w-40 flex-shrink-0">{d.label}</span>
                  <div className="flex-1"><Progress value={Math.abs(d.growth) * 2.5} className="h-2" /></div>
                  <span className={`text-sm font-medium w-14 text-left ${d.growth >= 0 ? "text-emerald-400" : "text-red-400"}`}>{d.growth > 0 ? "+" : ""}{d.growth}%</span>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground w-16 justify-center">{d.conf}%</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Strategic Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">AI ניתח 847 נקודות נתונים ויצר {recommendations.length} המלצות מתועדפות</p>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">עדכון אחרון: לפני 3 שעות</span>
            </div>
          </div>
          {recommendations.map((r, idx) => (
            <Card key={r.id} className={`bg-card/50 border-border/50 cursor-pointer transition-all hover:border-border ${expandedRec === r.id ? "ring-1 ring-border" : ""}`}
              onClick={() => setExpandedRec(expandedRec === r.id ? null : r.id)}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/10 text-amber-400 font-bold text-sm flex-shrink-0">{idx + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-foreground">{r.title}</h3>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge className={`${pri[r.priority]} text-[10px]`}>{r.priority}</Badge>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">{r.category}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Target className="w-3 h-3" />ביטחון: <span className={`font-medium ${r.confidence >= 85 ? "text-emerald-400" : r.confidence >= 75 ? "text-yellow-400" : "text-orange-400"}`}>{r.confidence}%</span>
                      </span>
                      <span className="flex items-center gap-1"><Zap className="w-3 h-3" />השפעה: <span className="text-foreground font-medium">{r.impact}</span></span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />מאמץ: <Badge className={`${eff[r.effort]} text-[10px] px-1.5 py-0`}>{r.effort}</Badge></span>
                    </div>
                    {expandedRec === r.id && (
                      <div className="mt-3 pt-3 border-t border-border/50">
                        <p className="text-sm text-muted-foreground leading-relaxed mb-2">{r.desc}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">לוח זמנים: <span className="text-foreground font-medium">{r.timeline}</span></span>
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-xs">אשר והפעל</Button>
                            <Button variant="outline" size="sm" className="text-xs">ניתוח מעמיק</Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
