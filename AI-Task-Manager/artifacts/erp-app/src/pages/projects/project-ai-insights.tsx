import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Activity, TrendingDown, TrendingUp, ShieldAlert, Gauge, Target,
  Lightbulb, FileText, AlertTriangle, CheckCircle, Clock, DollarSign,
  Users, Zap, ArrowUpRight, ArrowDownRight, BarChart3, Sparkles,
  RefreshCw, Search, ChevronLeft, ChevronRight, Wallet, Package
} from "lucide-react";

/* ───────── AI Score Gauges ───────── */
const aiScores = [
  { label: "בריאות פרויקט", score: 82, icon: Activity, color: "emerald", desc: "ציון כולל מבוסס AI" },
  { label: "סיכון עיכוב", score: 35, icon: Clock, color: "amber", desc: "הסתברות לחריגה מלו\"ז" },
  { label: "סיכון מרווח", score: 28, icon: DollarSign, color: "orange", desc: "סיכון לשחיקת רווחיות" },
  { label: "סיכון גבייה", score: 15, icon: Wallet, color: "blue", desc: "סיכון אי-גבייה" },
  { label: "מורכבות ביצוע", score: 67, icon: Gauge, color: "violet", desc: "רמת מורכבות טכנית" },
];

const colorMap: Record<string, { ring: string; text: string; bg: string; fill: string }> = {
  emerald: { ring: "stroke-emerald-500", text: "text-emerald-400", bg: "bg-emerald-500/10", fill: "bg-emerald-500" },
  amber: { ring: "stroke-amber-500", text: "text-amber-400", bg: "bg-amber-500/10", fill: "bg-amber-500" },
  orange: { ring: "stroke-orange-500", text: "text-orange-400", bg: "bg-orange-500/10", fill: "bg-orange-500" },
  blue: { ring: "stroke-blue-500", text: "text-blue-400", bg: "bg-blue-500/10", fill: "bg-blue-500" },
  violet: { ring: "stroke-violet-500", text: "text-violet-400", bg: "bg-violet-500/10", fill: "bg-violet-500" },
};

function ScoreGauge({ label, score, icon: Icon, color, desc }: typeof aiScores[0]) {
  const c = colorMap[color];
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  return (
    <Card className="flex-1 min-w-[180px]">
      <CardContent className="pt-4 pb-3 flex flex-col items-center gap-2">
        <div className="relative w-24 h-24">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
            <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" className="text-muted/20" strokeWidth="7" />
            <circle cx="48" cy="48" r="40" fill="none" className={c.ring} strokeWidth="7"
              strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${c.text}`}>{score}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon size={14} className={c.text} />
          <span className="text-sm font-semibold text-foreground">{label}</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{desc}</span>
      </CardContent>
    </Card>
  );
}

/* ───────── Projects Health Data ───────── */
const projects = [
  { id: "PRJ-101", name: "חלונות אלומיניום — מגדל הים", client: "גולדשטיין נדל\"ן", pm: "אורי כהן", health: 91, delay: 12, margin: 18, budget: 920000, spent: 710000, pct: 82, status: "active" },
  { id: "PRJ-102", name: "זכוכית חזיתית — קניון עזריאלי", client: "עזריאלי קבוצה", pm: "דנה לוי", health: 74, delay: 45, margin: 38, budget: 1450000, spent: 890000, pct: 55, status: "active" },
  { id: "PRJ-103", name: "דלתות פלדה — בית ספר אורט", client: "משרד החינוך", pm: "יוסי מרקוביץ", health: 85, delay: 20, margin: 15, budget: 380000, spent: 125000, pct: 30, status: "active" },
  { id: "PRJ-104", name: "מעקות בטיחות — שיכון נוף", client: "שיכון ובינוי", pm: "מירי אביטל", health: 68, delay: 55, margin: 42, budget: 260000, spent: 78000, pct: 15, status: "warning" },
  { id: "PRJ-105", name: "פרגולות מתכת — סינמה סיטי", client: "סינמה סיטי בע\"מ", pm: "אורי כהן", health: 79, delay: 30, margin: 25, budget: 185000, spent: 140000, pct: 72, status: "active" },
  { id: "PRJ-106", name: "שערי חניון — מגדל רמת גן", client: "אלקטרה נדל\"ן", pm: "דנה לוי", health: 95, delay: 5, margin: 8, budget: 410000, spent: 395000, pct: 96, status: "closing" },
  { id: "PRJ-107", name: "חלונות עץ-אלומיניום — וילה פרטית", client: "משפחת בן דוד", pm: "מירי אביטל", health: 62, delay: 60, margin: 50, budget: 145000, spent: 12000, pct: 5, status: "planning" },
  { id: "PRJ-108", name: "קירות מסך — משרדים הרצליה", client: "אמות השקעות", pm: "יוסי מרקוביץ", health: 71, delay: 48, margin: 35, budget: 2100000, spent: 1050000, pct: 48, status: "warning" },
  { id: "PRJ-109", name: "ויטרינות חזית — מלון דן אילת", client: "מלונות דן", pm: "אורי כהן", health: 88, delay: 15, margin: 12, budget: 560000, spent: 320000, pct: 58, status: "active" },
  { id: "PRJ-110", name: "מחיצות זכוכית — מגדל אלון", client: "מגדל ביטוח", pm: "דנה לוי", health: 55, delay: 72, margin: 58, budget: 780000, spent: 620000, pct: 65, status: "critical" },
];

/* ───────── AI Predictions ───────── */
const predictions = [
  { id: 1, type: "budget", title: "חריגת תקציב — קירות מסך הרצליה", project: "PRJ-108", desc: "צפי לחריגה של 12% מהתקציב בשל עליית מחירי אלומיניום ושעות נוספות בייצור", confidence: 87, impact: "high", trend: "up", amount: "₪252,000" },
  { id: 2, type: "schedule", title: "עיכוב מסירה — מחיצות מגדל אלון", project: "PRJ-110", desc: "עיכוב צפוי של 3 שבועות עקב איחור באספקת זכוכית מחוסמת מהיצרן", confidence: 92, impact: "critical", trend: "up", amount: "21 יום" },
  { id: 3, type: "margin", title: "שחיקת רווח — מעקות שיכון נוף", project: "PRJ-104", desc: "מרווח הרווח צפוי לרדת מ-22% ל-14% עקב עלויות התקנה לא צפויות", confidence: 78, impact: "high", trend: "down", amount: "-8%" },
  { id: 4, type: "budget", title: "חיסכון פוטנציאלי — שערי חניון", project: "PRJ-106", desc: "ניתן לחסוך ₪18,000 ע\"י סיום מוקדם ושחרור צוות ההתקנה", confidence: 85, impact: "positive", trend: "down", amount: "₪18,000" },
  { id: 5, type: "schedule", title: "סיכון שרשרת אספקה — וילה בן דוד", project: "PRJ-107", desc: "ספק העץ-אלומיניום דיווח על עומס. זמן אספקה עלול לגדול ב-4 שבועות", confidence: 71, impact: "medium", trend: "up", amount: "28 יום" },
  { id: 6, type: "margin", title: "הזדמנות אפסלינג — ויטרינות דן אילת", project: "PRJ-109", desc: "הלקוח הביע עניין בשדרוג לזכוכית חכמה — פוטנציאל הגדלת הכנסה ב-₪85,000", confidence: 65, impact: "positive", trend: "up", amount: "+₪85,000" },
];

/* ───────── AI Recommendations ───────── */
const recommendations = [
  { id: 1, category: "resources", title: "העברת צוות בטא לפרויקט מגדל אלון", desc: "צוות בטא מסיים בסינמה סיטי ב-24/4. העברתו למגדל אלון תקצר את העיכוב ב-12 יום", impact: "high", effort: "low", confidence: 89, savings: "₪45,000" },
  { id: 2, category: "procurement", title: "הזמנת זכוכית חלופית מיצרן משני", desc: "ספק חירום בטורקיה יכול לספק זכוכית מחוסמת תוך 10 ימים במקום 28. עלות תוספת: ₪12,000", impact: "critical", effort: "medium", confidence: 82, savings: "₪95,000" },
  { id: 3, category: "collection", title: "שליחת תזכורת גבייה — גולדשטיין נדל\"ן", desc: "חשבונית PRJ-101 בסך ₪180,000 בפיגור 14 יום. היסטוריית תשלום: 92% בזמן", impact: "medium", effort: "low", confidence: 94, savings: "₪180,000" },
  { id: 4, category: "resources", title: "הקצאת מהנדס נוסף — קירות מסך הרצליה", desc: "הוספת מהנדס שרטוט תקצר את שלב ההנדסה ב-8 ימים ותמנע חריגת לו\"ז", impact: "high", effort: "medium", confidence: 76, savings: "₪32,000" },
  { id: 5, category: "procurement", title: "רכישה מרוכזת — פרופילי אלומיניום", desc: "איחוד הזמנות PRJ-101, PRJ-102, PRJ-108 לרכישה מרוכזת יחסוך 8% מעלות החומר", impact: "high", effort: "low", confidence: 91, savings: "₪67,000" },
  { id: 6, category: "collection", title: "הסדר תשלומים — משרד החינוך", desc: "פיצול חשבונית PRJ-103 ל-3 תשלומים יאיץ את אישור התשלום הממשלתי ב-20 יום", impact: "medium", effort: "low", confidence: 88, savings: "₪380,000" },
  { id: 7, category: "resources", title: "שחרור משאבים — שערי חניון רמת גן", desc: "הפרויקט ב-96% השלמה. ניתן לשחרר את צוות ההתקנה לפרויקט שיכון נוף", impact: "medium", effort: "low", confidence: 95, savings: "₪28,000" },
  { id: 8, category: "procurement", title: "אישור חומר מראש — וילה בן דוד", desc: "אישור מוקדם של דגימות עץ-אלומיניום יקצר את זמן האספקה ב-2 שבועות", impact: "high", effort: "low", confidence: 84, savings: "₪15,000" },
];

/* ───────── Manager Weekly Brief ───────── */
const weeklyBrief = {
  generatedAt: "08/04/2026, 08:00",
  period: "01/04 — 08/04/2026",
  topRisks: [
    { text: "פרויקט מחיצות מגדל אלון (PRJ-110) — ציון בריאות ירד ל-55. עיכוב צפוי של 3 שבועות", severity: "critical" },
    { text: "חריגת תקציב בקירות מסך הרצליה (PRJ-108) — צפי ₪252,000 מעל התקציב", severity: "high" },
    { text: "סיכון שרשרת אספקה בוילה בן דוד (PRJ-107) — ספק דיווח על עומס", severity: "medium" },
    { text: "פיגור גבייה של ₪180,000 מגולדשטיין נדל\"ן — 14 יום באיחור", severity: "high" },
  ],
  wins: [
    { text: "שערי חניון רמת גן (PRJ-106) — 96% השלמה, מסירה צפויה לפני המועד" },
    { text: "ויטרינות דן אילת (PRJ-109) — הלקוח אישר שדרוג לזכוכית חכמה, הכנסה נוספת ₪85,000" },
    { text: "חלונות מגדל הים (PRJ-101) — התקנה בקומות 8-14 הושלמה בהצלחה" },
    { text: "רווחיות כוללת של הפורטפוליו עומדת על 19.4%, מעל היעד של 18%" },
  ],
  actionItems: [
    { text: "לאשר הזמנת זכוכית חירום מטורקיה עבור PRJ-110", priority: "urgent", owner: "דנה לוי" },
    { text: "לבצע פגישת בקרה עם קבלן משנה — קירות מסך הרצליה", priority: "urgent", owner: "יוסי מרקוביץ" },
    { text: "לשלוח תזכורת גבייה לגולדשטיין נדל\"ן", priority: "high", owner: "מחלקת כספים" },
    { text: "להעביר צוות בטא לפרויקט מגדל אלון מ-24/4", priority: "high", owner: "אורי כהן" },
    { text: "לאשר דגימות עץ-אלומיניום עבור וילה בן דוד", priority: "medium", owner: "מירי אביטל" },
    { text: "לבצע רכישה מרוכזת של פרופילי אלומיניום — 3 פרויקטים", priority: "medium", owner: "מחלקת רכש" },
  ],
};

/* ───────── Helpers ───────── */
function healthColor(score: number) {
  if (score >= 85) return { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/30" };
  if (score >= 70) return { bg: "bg-amber-500/15", text: "text-amber-400", border: "border-amber-500/30" };
  if (score >= 55) return { bg: "bg-orange-500/15", text: "text-orange-400", border: "border-orange-500/30" };
  return { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30" };
}

function impactBadge(impact: string) {
  const map: Record<string, string> = {
    critical: "bg-red-500/20 text-red-400 border-red-500/30",
    high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    medium: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    positive: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  };
  const labels: Record<string, string> = { critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך", positive: "חיובי" };
  return <Badge variant="outline" className={`text-[11px] ${map[impact] || map.medium}`}>{labels[impact] || impact}</Badge>;
}

function effortBadge(effort: string) {
  const map: Record<string, string> = { low: "bg-green-500/20 text-green-400", medium: "bg-amber-500/20 text-amber-400", high: "bg-red-500/20 text-red-400" };
  const labels: Record<string, string> = { low: "מאמץ נמוך", medium: "מאמץ בינוני", high: "מאמץ גבוה" };
  return <span className={`px-2 py-0.5 rounded text-[11px] ${map[effort]}`}>{labels[effort]}</span>;
}

function severityDot(severity: string) {
  const map: Record<string, string> = { critical: "bg-red-500", high: "bg-orange-500", medium: "bg-amber-500", low: "bg-blue-500" };
  return <span className={`inline-block w-2 h-2 rounded-full ${map[severity] || map.medium}`} />;
}

function priorityBadge(priority: string) {
  const map: Record<string, string> = { urgent: "bg-red-500/20 text-red-400", high: "bg-orange-500/20 text-orange-400", medium: "bg-amber-500/20 text-amber-400" };
  const labels: Record<string, string> = { urgent: "דחוף", high: "גבוה", medium: "בינוני" };
  return <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${map[priority]}`}>{labels[priority]}</span>;
}

const categoryIcons: Record<string, typeof Users> = { resources: Users, procurement: Package, collection: Wallet };
const categoryLabels: Record<string, string> = { resources: "הקצאת משאבים", procurement: "רכש ואספקה", collection: "גבייה ותשלומים" };

/* ═══════════════════════════════════════════════════════════════ */
export default function ProjectAiInsights() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("health");
  const [recFilter, setRecFilter] = useState<string>("all");

  const filteredProjects = projects
    .filter(p => p.name.includes(search) || p.client.includes(search) || p.id.includes(search))
    .sort((a, b) => a.health - b.health);

  const filteredRecs = recFilter === "all" ? recommendations : recommendations.filter(r => r.category === recFilter);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Brain size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">תובנות AI לפרויקטים</h1>
            <p className="text-sm text-muted-foreground">ניתוח חכם, תחזיות והמלצות — טכנו-כל עוזי</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 gap-1">
            <Sparkles size={12} /> מנוע AI v3.2
          </Badge>
          <Button variant="outline" size="sm" className="gap-1.5">
            <RefreshCw size={14} /> רענון ניתוח
          </Button>
        </div>
      </div>

      {/* AI Score Gauges */}
      <div className="flex gap-4 flex-wrap">
        {aiScores.map(s => <ScoreGauge key={s.label} {...s} />)}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="health" className="gap-1.5"><Activity size={14} /> סקירת בריאות</TabsTrigger>
          <TabsTrigger value="predictions" className="gap-1.5"><TrendingUp size={14} /> תחזיות</TabsTrigger>
          <TabsTrigger value="recommendations" className="gap-1.5"><Lightbulb size={14} /> המלצות</TabsTrigger>
          <TabsTrigger value="brief" className="gap-1.5"><FileText size={14} /> תדריך מנהל</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Health Overview ── */}
        <TabsContent value="health" className="space-y-4 mt-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="חיפוש פרויקט..." value={search} onChange={e => setSearch(e.target.value)}
                className="pr-9 h-9 text-sm" />
            </div>
            <span className="text-xs text-muted-foreground">{filteredProjects.length} פרויקטים ממוינים לפי סיכון</span>
          </div>

          <div className="grid gap-3">
            {filteredProjects.map(p => {
              const hc = healthColor(p.health);
              const budgetPct = Math.round((p.spent / p.budget) * 100);
              return (
                <Card key={p.id} className={`border ${hc.border}`}>
                  <CardContent className="py-4 px-5">
                    <div className="flex items-center gap-4">
                      {/* Health Score */}
                      <div className={`w-14 h-14 rounded-xl ${hc.bg} flex flex-col items-center justify-center shrink-0`}>
                        <span className={`text-xl font-bold ${hc.text}`}>{p.health}</span>
                        <span className="text-[9px] text-muted-foreground">AI</span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm text-foreground truncate">{p.name}</span>
                          <Badge variant="outline" className="text-[10px] shrink-0">{p.id}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{p.client}</span>
                          <span>מנהל: {p.pm}</span>
                          <span>השלמה: {p.pct}%</span>
                        </div>
                        <div className="mt-2">
                          <Progress value={p.pct} className="h-1.5" />
                        </div>
                      </div>

                      {/* Risk Indicators */}
                      <div className="flex gap-3 shrink-0">
                        <div className="text-center">
                          <div className="text-[10px] text-muted-foreground mb-0.5">סיכון עיכוב</div>
                          <span className={`text-sm font-bold ${p.delay > 50 ? "text-red-400" : p.delay > 30 ? "text-amber-400" : "text-emerald-400"}`}>{p.delay}%</span>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] text-muted-foreground mb-0.5">סיכון מרווח</div>
                          <span className={`text-sm font-bold ${p.margin > 40 ? "text-red-400" : p.margin > 25 ? "text-amber-400" : "text-emerald-400"}`}>{p.margin}%</span>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] text-muted-foreground mb-0.5">תקציב</div>
                          <span className={`text-sm font-bold ${budgetPct > 90 ? "text-red-400" : budgetPct > 75 ? "text-amber-400" : "text-emerald-400"}`}>{budgetPct}%</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Tab 2: Predictions ── */}
        <TabsContent value="predictions" className="space-y-4 mt-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain size={16} className="text-violet-400" />
            <span className="text-sm font-semibold text-foreground">6 תחזיות AI פעילות</span>
            <span className="text-xs text-muted-foreground">— מבוסס על ניתוח נתונים היסטוריים, שוק, וביצוע נוכחי</span>
          </div>

          <div className="grid gap-3">
            {predictions.map(pred => (
              <Card key={pred.id} className="hover:border-violet-500/30 transition-colors">
                <CardContent className="py-4 px-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                      pred.type === "budget" ? "bg-orange-500/15" : pred.type === "schedule" ? "bg-blue-500/15" : "bg-amber-500/15"
                    }`}>
                      {pred.type === "budget" ? <DollarSign size={18} className="text-orange-400" /> :
                       pred.type === "schedule" ? <Clock size={18} className="text-blue-400" /> :
                       <TrendingDown size={18} className="text-amber-400" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm text-foreground">{pred.title}</span>
                        {impactBadge(pred.impact)}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{pred.desc}</p>
                      <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-muted-foreground">ביטחון:</span>
                          <div className="w-20 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pred.confidence}%` }} />
                          </div>
                          <span className="text-xs font-medium text-violet-400">{pred.confidence}%</span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{pred.project}</Badge>
                      </div>
                    </div>

                    <div className="text-left shrink-0">
                      <div className="flex items-center gap-1">
                        {pred.trend === "up" && pred.impact !== "positive" ?
                          <ArrowUpRight size={14} className="text-red-400" /> :
                          <ArrowDownRight size={14} className="text-emerald-400" />}
                        <span className={`text-sm font-bold ${
                          pred.impact === "positive" ? "text-emerald-400" : "text-foreground"
                        }`}>{pred.amount}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {pred.type === "budget" ? "השפעה תקציבית" : pred.type === "schedule" ? "השפעה על לו\"ז" : "השפעה על מרווח"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Tab 3: Recommendations ── */}
        <TabsContent value="recommendations" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lightbulb size={16} className="text-amber-400" />
              <span className="text-sm font-semibold text-foreground">המלצות AI</span>
              <span className="text-xs text-muted-foreground">— {filteredRecs.length} המלצות פעילות</span>
            </div>
            <div className="flex gap-1.5">
              {[{ key: "all", label: "הכל" }, { key: "resources", label: "משאבים" }, { key: "procurement", label: "רכש" }, { key: "collection", label: "גבייה" }].map(f => (
                <Button key={f.key} variant={recFilter === f.key ? "default" : "outline"} size="sm"
                  className="text-xs h-7 px-3" onClick={() => setRecFilter(f.key)}>
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            {filteredRecs.map(rec => {
              const CatIcon = categoryIcons[rec.category] || Lightbulb;
              return (
                <Card key={rec.id} className="hover:border-amber-500/30 transition-colors">
                  <CardContent className="py-4 px-5">
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                        <CatIcon size={18} className="text-amber-400" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-sm text-foreground">{rec.title}</span>
                          {impactBadge(rec.impact)}
                          {effortBadge(rec.effort)}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{rec.desc}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-muted-foreground">ביטחון:</span>
                            <div className="w-16 h-1.5 bg-muted/30 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-500 rounded-full" style={{ width: `${rec.confidence}%` }} />
                            </div>
                            <span className="text-xs font-medium text-amber-400">{rec.confidence}%</span>
                          </div>
                          <Badge variant="outline" className="text-[10px]">{categoryLabels[rec.category]}</Badge>
                        </div>
                      </div>

                      <div className="text-left shrink-0 flex flex-col items-end gap-2">
                        <div className="flex items-center gap-1">
                          <DollarSign size={12} className="text-emerald-400" />
                          <span className="text-sm font-bold text-emerald-400">{rec.savings}</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">חיסכון / ערך</span>
                        <Button variant="outline" size="sm" className="text-[11px] h-6 px-2 gap-1">
                          <Zap size={10} /> יישם
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Tab 4: Manager Weekly Brief ── */}
        <TabsContent value="brief" className="space-y-4 mt-4">
          <Card className="border-violet-500/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center">
                    <FileText size={18} className="text-violet-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">תדריך שבועי — מנוע AI</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">תקופה: {weeklyBrief.period} | נוצר: {weeklyBrief.generatedAt}</p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-violet-500/10 text-violet-400 border-violet-500/30 text-[11px]">
                  <Sparkles size={10} className="ml-1" /> נוצר אוטומטית
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Top Risks */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={15} className="text-red-400" />
                  <h3 className="text-sm font-bold text-foreground">סיכונים עיקריים</h3>
                </div>
                <div className="space-y-2">
                  {weeklyBrief.topRisks.map((risk, i) => (
                    <div key={i} className="flex items-start gap-2.5 bg-red-500/5 rounded-lg px-3 py-2.5">
                      {severityDot(risk.severity)}
                      <span className="text-xs text-foreground leading-relaxed">{risk.text}</span>
                      {impactBadge(risk.severity)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Wins */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle size={15} className="text-emerald-400" />
                  <h3 className="text-sm font-bold text-foreground">הישגים והצלחות</h3>
                </div>
                <div className="space-y-2">
                  {weeklyBrief.wins.map((win, i) => (
                    <div key={i} className="flex items-start gap-2.5 bg-emerald-500/5 rounded-lg px-3 py-2.5">
                      <CheckCircle size={12} className="text-emerald-400 mt-0.5 shrink-0" />
                      <span className="text-xs text-foreground leading-relaxed">{win.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Items */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Target size={15} className="text-amber-400" />
                  <h3 className="text-sm font-bold text-foreground">פעולות נדרשות</h3>
                </div>
                <div className="space-y-2">
                  {weeklyBrief.actionItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2.5">
                      <span className="text-xs font-mono text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                      <span className="text-xs text-foreground flex-1">{item.text}</span>
                      {priorityBadge(item.priority)}
                      <span className="text-[11px] text-muted-foreground shrink-0">אחראי: {item.owner}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary Bar */}
              <div className="flex items-center justify-between pt-3 border-t border-border">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><BarChart3 size={12} /> 10 פרויקטים פעילים</span>
                  <span className="flex items-center gap-1"><AlertTriangle size={12} className="text-red-400" /> 4 סיכונים</span>
                  <span className="flex items-center gap-1"><CheckCircle size={12} className="text-emerald-400" /> 4 הישגים</span>
                  <span className="flex items-center gap-1"><Target size={12} className="text-amber-400" /> 6 פעולות</span>
                </div>
                <Button variant="outline" size="sm" className="text-xs gap-1.5">
                  <FileText size={12} /> ייצוא PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}