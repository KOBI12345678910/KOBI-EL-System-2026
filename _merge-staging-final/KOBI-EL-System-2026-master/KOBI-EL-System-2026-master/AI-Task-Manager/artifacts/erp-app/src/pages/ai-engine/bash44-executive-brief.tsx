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
  Brain, AlertTriangle, TrendingDown, DollarSign, Factory, FolderKanban,
  Users, Gavel, Lightbulb, RefreshCw, CalendarDays, Shield, Clock,
  ArrowUpRight, ArrowDownRight, Flame, CircleAlert, Package, Wrench,
  HeartPulse, BarChart3, FileWarning, ChevronLeft, ChevronRight,
  Sparkles, Target, Truck, Phone, Star, ThumbsDown, CheckCircle2
} from "lucide-react";

// --- DATA ---
const FALLBACK_TOP_PRIORITIES = [
  { id: 1, title: "פער תזרים מזומנים צפוי ב-15 לחודש", severity: "קריטי", owner: "דני כהן - CFO", urgency: "היום", desc: "חוסר של ₪1.2M בתזרים צפוי. נדרש שחרור כספים מפיקדון או הקדמת גבייה.", icon: DollarSign },
  { id: 2, title: "עיכוב אספקת חומרי גלם - קו ייצור 3", severity: "קריטי", owner: "שרון לוי - COO", urgency: "דחוף - 24 שעות", desc: "ספק מרכזי עיכב משלוח 2 שבועות. השפעה על 4 הזמנות לקוח בשווי ₪890K.", icon: Factory },
  { id: 3, title: "לקוח אסטרטגי מאיים בעזיבה", severity: "גבוה", owner: "מיכל אברהם - VP Sales", urgency: "48 שעות", desc: "טכנו-סיסטם (₪2.4M שנתי) לא שבע רצון מזמני תגובה. 3 תלונות בחודש האחרון.", icon: Users },
  { id: 4, title: "חריגת תקציב פרויקט מגדל-אור", severity: "גבוה", owner: "אבי רוזן - PM", urgency: "השבוע", desc: "חריגה של 22% (₪440K) מהתקציב המקורי. נדרש אישור תוספת או צמצום היקף.", icon: FolderKanban },
  { id: 5, title: "תקלת ציוד חוזרת - מכונת CNC מספר 7", severity: "בינוני", owner: "יוסי מזרחי - מנהל ייצור", urgency: "השבוע", desc: "תקלה שלישית בחודש. עלות השבתה מצטברת ₪180K. המלצה להחלפה.", icon: Wrench },
];

const FALLBACK_FINANCIAL_WATCHLIST = [
  { id: 1, title: "שחיקת מרווח - קו מוצרים B", metric: "מרווח גולמי ירד מ-34% ל-28%", impact: "₪620K אובדן שנתי", trend: -6, category: "מרווח" },
  { id: 2, title: "פער תזרים - ספקים מול גבייה", metric: "DSO: 52 יום | DPO: 31 יום", impact: "₪1.2M חוסר נזילות", trend: -8, category: "תזרים" },
  { id: 3, title: "חובות לקוחות באיחור 60+", metric: "₪1.8M ב-12 חשבוניות", impact: "סיכון מחיקה ₪340K", trend: -15, category: "גבייה" },
  { id: 4, title: "חריגת תקציב שיווק דיגיטלי", metric: "₪280K חריגה (118% מהתקציב)", impact: "ROI נמוך - ₪0.72 לכל ₪1", trend: -18, category: "תקציב" },
  { id: 5, title: "עלויות שעות נוספות חריגות", metric: "₪420K בחודש (עלייה של 35%)", impact: "שחיקת רווחיות ייצור", trend: -35, category: "עלויות" },
  { id: 6, title: "חשיפת מט\"ח לא מגודרת", metric: "$380K חשיפה פתוחה", impact: "סיכון הפסד עד ₪95K", trend: -4, category: "מט\"ח" },
];

const FALLBACK_OPERATIONAL_WATCHLIST = [
  { id: 1, title: "עיכוב ייצור - הזמנה #4872", status: "מאחר 5 ימים", cause: "חוסר חומר גלם + תקלת ציוד", client: "אלקטרו-טק בע\"מ", risk: "קריטי" },
  { id: 2, title: "חסימת רכש - אישור תקציב ממתין", status: "ממתין 8 ימים", cause: "הזמנת רכש ₪340K ממתינה לאישור סמנכ\"ל", client: "פנימי", risk: "גבוה" },
  { id: 3, title: "כשל התקנה - פרויקט נתניה", status: "נדחה פעמיים", cause: "אי התאמת מפרט לשטח. דרוש סקר מחדש", client: "בניה-פלוס בע\"מ", risk: "גבוה" },
  { id: 4, title: "איחור אספקה מספק חו\"ל", status: "מאחר 12 ימים", cause: "עיכוב מכס + בדיקת תקן", client: "מספר פרויקטים", risk: "בינוני" },
  { id: 5, title: "תקלת מערכת ERP - מודול מלאי", status: "חוזר כל 48 שעות", cause: "באג בסנכרון מלאי בין מחסנים", client: "פנימי", risk: "בינוני" },
];

const FALLBACK_PROJECT_WATCHLIST = [
  { id: 1, name: "פרויקט מגדל-אור", health: 38, budget: "₪2.4M", spent: "₪2.84M", deadline: "15/06/2026", status: "חריגה קריטית", issues: ["חריגת תקציב 22%", "איחור 3 שבועות", "שינויי מפרט"] },
  { id: 2, name: "שדרוג קו ייצור 4", health: 55, budget: "₪1.8M", spent: "₪1.1M", deadline: "30/07/2026", status: "בסיכון", issues: ["עיכוב ציוד מיבוא", "חוסר כ\"א מוסמך"] },
  { id: 3, name: "פרויקט דיגיטציה - שלב ב'", health: 62, budget: "₪960K", spent: "₪580K", deadline: "01/09/2026", status: "אזהרה", issues: ["אינטגרציה מורכבת מהצפוי", "דרוש יועץ נוסף"] },
  { id: 4, name: "הקמת מחסן חכם - אשדוד", health: 71, budget: "₪3.2M", spent: "₪1.4M", deadline: "15/10/2026", status: "במעקב", issues: ["היתר בנייה מתעכב", "שינוי דרישות בטיחות"] },
  { id: 5, name: "מערכת CRM חדשה", health: 45, budget: "₪520K", spent: "₪490K", deadline: "20/05/2026", status: "בסיכון גבוה", issues: ["חריגת תקציב 94%", "הטמעה חלקית", "התנגדות משתמשים"] },
];

const FALLBACK_CUSTOMER_WATCHLIST = [
  { id: 1, name: "טכנו-סיסטם בע\"מ", value: "₪2.4M/שנה", issue: "3 תלונות על זמני תגובה. NPS ירד מ-8 ל-4.", action: "פגישת הנהלה דחופה", risk: "קריטי", satisfaction: 35 },
  { id: 2, name: "אלקטרו-טק בע\"מ", value: "₪1.8M/שנה", issue: "עיכוב אספקה חוזר. שוקלים ספק חלופי.", action: "הצעת פיצוי + תוכנית שיפור", risk: "גבוה", satisfaction: 42 },
  { id: 3, name: "בניה-פלוס בע\"מ", value: "₪1.1M/שנה", issue: "כשל התקנה בפרויקט נתניה. דורשים פיצוי.", action: "שליחת צוות מיוחד + הנחה", risk: "גבוה", satisfaction: 48 },
  { id: 4, name: "סולאר-גרין בע\"מ", value: "₪860K/שנה", issue: "ירידה ברכישות 40% ב-Q1. עברו לקו מוצרים מתחרה.", action: "הצעה מותאמת + ביקור מנכ\"ל", risk: "בינוני", satisfaction: 55 },
];

const FALLBACK_DECISIONS_NEEDED = [
  { id: 1, title: "אישור תוספת תקציב - פרויקט מגדל-אור", deadline: "היום", context: "חריגה של ₪440K. ללא אישור, עצירת פרויקט ועלות פיצוי ₪200K.", options: [
    { label: "אישור תוספת מלאה (₪440K)", pros: "המשך ללא עיכוב", cons: "חריגה תקציבית" },
    { label: "אישור חלקי (₪280K) + צמצום היקף", pros: "חיסכון ₪160K", cons: "דחיית תכולה 2 חודשים" },
    { label: "הקפאת פרויקט לבחינה מחדש", pros: "זמן לתכנון", cons: "עלות פיצוי + מוניטין" },
  ]},
  { id: 2, title: "החלפת ספק חומרי גלם מרכזי", deadline: "48 שעות", context: "ספק נוכחי עיכב 3 משלוחות ב-Q1. ספק חלופי זול ב-8% אך ללא ניסיון.", options: [
    { label: "מעבר מלא לספק חדש", pros: "חיסכון 8%, אמינות חדשה", cons: "סיכון איכות, תקופת הרצה" },
    { label: "פיצול - 60% ישן / 40% חדש", pros: "גיוון סיכון", cons: "מורכבות תפעולית" },
    { label: "התראה אחרונה לספק נוכחי + SLA", pros: "שימור יחסים", cons: "סיכון חזרה על עיכובים" },
  ]},
  { id: 3, title: "השקעה בשדרוג מכונת CNC #7", deadline: "השבוע", context: "3 תקלות בחודש, עלות תיקון מצטברת ₪180K. מכונה חדשה: ₪420K, פחת 7 שנים.", options: [
    { label: "החלפה למכונה חדשה (₪420K)", pros: "אמינות, יעילות +25%", cons: "השקעה גבוהה" },
    { label: "שיפוץ כללי (₪95K)", pros: "עלות נמוכה", cons: "ללא אחריות, סיכון חוזר" },
    { label: "ליסינג מכונה (₪8.5K/חודש)", pros: "תזרים שוטף", cons: "עלות כוללת גבוהה יותר" },
  ]},
];

const FALLBACK_SUGGESTED_ACTIONS = [
  { id: 1, title: "להפעיל תוכנית גבייה מואצת", priority: "קריטי", impact: "שחרור ₪1.8M תוך 30 יום", responsible: "מנהל כספים", timeline: "מיידי", desc: "מיקוד ב-12 חשבוניות באיחור 60+. הצעת הנחה 3% לתשלום מיידי." },
  { id: 2, title: "כנס חירום עם טכנו-סיסטם", priority: "קריטי", impact: "שימור לקוח ₪2.4M/שנה", responsible: "VP Sales + CEO", timeline: "48 שעות", desc: "פגישת הנהלה, הצגת תוכנית שיפור, הקצאת מנהל לקוח ייעודי." },
  { id: 3, title: "הקמת War Room לפרויקט מגדל-אור", priority: "גבוה", impact: "החזרת פרויקט למסלול", responsible: "מנהל פרויקטים", timeline: "מחר", desc: "ישיבת סטטוס יומית, דוח חריגות שבועי, הגדרת אבני דרך מחודשות." },
  { id: 4, title: "ניהול סיכוני ספקים - גיוון אספקה", priority: "גבוה", impact: "הפחתת סיכון שרשרת אספקה 60%", responsible: "מנהל רכש", timeline: "שבועיים", desc: "זיהוי 2 ספקי גיבוי, משא ומתן ראשוני, הגדרת SLA מחודש." },
  { id: 5, title: "אופטימיזציית עלויות שעות נוספות", priority: "בינוני", impact: "חיסכון ₪150K/חודש", responsible: "מנהל ייצור + HR", timeline: "חודש", desc: "ניתוח עומסים, תכנון משמרות מחדש, גיוס 3 עובדי ייצור." },
];

const sev: Record<string, string> = {
  "קריטי": "bg-red-500/20 text-red-300 border-red-500/30",
  "גבוה": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "בינוני": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
};

const healthColor = (h: number) => h >= 70 ? "text-green-400" : h >= 50 ? "text-yellow-400" : "text-red-400";
const healthBg = (h: number) => h >= 70 ? "bg-green-500" : h >= 50 ? "bg-yellow-500" : "bg-red-500";

// --- COMPONENT ---
export default function Bash44ExecutiveBrief() {

  const { data: apiData } = useQuery({
    queryKey: ["bash44_executive_brief"],
    queryFn: () => authFetch("/api/ai/bash44-executive-brief").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const topPriorities = apiData?.topPriorities ?? FALLBACK_TOP_PRIORITIES;
  const financialWatchlist = apiData?.financialWatchlist ?? FALLBACK_FINANCIAL_WATCHLIST;
  const operationalWatchlist = apiData?.operationalWatchlist ?? FALLBACK_OPERATIONAL_WATCHLIST;
  const projectWatchlist = apiData?.projectWatchlist ?? FALLBACK_PROJECT_WATCHLIST;
  const customerWatchlist = apiData?.customerWatchlist ?? FALLBACK_CUSTOMER_WATCHLIST;
  const decisionsNeeded = apiData?.decisionsNeeded ?? FALLBACK_DECISIONS_NEEDED;
  const suggestedActions = apiData?.suggestedActions ?? FALLBACK_SUGGESTED_ACTIONS;
  const [briefDate, setBriefDate] = useState("2026-04-08");
  const [activeTab, setActiveTab] = useState("priorities");
  const [generating, setGenerating] = useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => setGenerating(false), 2000);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#101829] to-[#0a0e1a] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-xl border border-violet-500/30">
            <Brain className="w-7 h-7 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-l from-violet-300 to-fuchsia-300 bg-clip-text text-transparent">
              תדרוך מנהלים - טכנו-כל עוזי
            </h1>
            <p className="text-sm text-slate-400">סיכום AI אוטומטי למנכ"ל / סמנכ"ל כספים / סמנכ"ל תפעול</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Input type="date" value={briefDate} onChange={(e) => setBriefDate(e.target.value)}
            className="bg-slate-800/50 border-slate-700 text-white w-44" />
          <Button onClick={handleGenerate} disabled={generating}
            className="bg-gradient-to-l from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 gap-2">
            {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {generating ? "מייצר תדרוך..." : "ייצר תדרוך חדש"}
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "עדיפויות קריטיות", value: "5", icon: Flame, color: "text-red-400", bg: "bg-red-500/10" },
          { label: "סה\"כ פריטי מעקב", value: "28", icon: CircleAlert, color: "text-orange-400", bg: "bg-orange-500/10" },
          { label: "החלטות נדרשות היום", value: "3", icon: Gavel, color: "text-violet-400", bg: "bg-violet-500/10" },
          { label: "המלצות פעולה", value: "5", icon: Lightbulb, color: "text-emerald-400", bg: "bg-emerald-500/10" },
        ].map((kpi) => (
          <Card key={kpi.label} className="bg-slate-900/60 border-slate-700/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${kpi.bg}`}>
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-xs text-slate-400">{kpi.label}</p>
                <p className="text-xl font-bold">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800/60 border border-slate-700/50 flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="priorities" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-300 gap-1.5 text-xs">
            <Flame className="w-3.5 h-3.5" /> עדיפויות עליונות
          </TabsTrigger>
          <TabsTrigger value="financial" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300 gap-1.5 text-xs">
            <DollarSign className="w-3.5 h-3.5" /> מעקב פיננסי
          </TabsTrigger>
          <TabsTrigger value="operational" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300 gap-1.5 text-xs">
            <Factory className="w-3.5 h-3.5" /> מעקב תפעולי
          </TabsTrigger>
          <TabsTrigger value="projects" className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-300 gap-1.5 text-xs">
            <FolderKanban className="w-3.5 h-3.5" /> מעקב פרויקטים
          </TabsTrigger>
          <TabsTrigger value="customers" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 gap-1.5 text-xs">
            <Users className="w-3.5 h-3.5" /> מעקב לקוחות
          </TabsTrigger>
          <TabsTrigger value="decisions" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300 gap-1.5 text-xs">
            <Gavel className="w-3.5 h-3.5" /> החלטות נדרשות
          </TabsTrigger>
          <TabsTrigger value="actions" className="data-[state=active]:bg-fuchsia-500/20 data-[state=active]:text-fuchsia-300 gap-1.5 text-xs">
            <Lightbulb className="w-3.5 h-3.5" /> המלצות פעולה
          </TabsTrigger>
        </TabsList>

        {/* 1) Top Priorities */}
        <TabsContent value="priorities" className="space-y-3 mt-4">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-red-300">
                <Flame className="w-5 h-5" /> 5 עדיפויות עליונות להיום
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {topPriorities.map((item, i) => (
                <div key={item.id} className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/40 hover:border-slate-600/60 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-700/50 text-sm font-bold text-slate-300 shrink-0">
                        {i + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <item.icon className="w-4 h-4 text-slate-400" />
                          <span className="font-semibold text-sm">{item.title}</span>
                          <Badge className={`text-[10px] ${sev[item.severity]}`}>{item.severity}</Badge>
                        </div>
                        <p className="text-xs text-slate-400 mb-2">{item.desc}</p>
                        <div className="flex items-center gap-4 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {item.owner}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {item.urgency}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2) Financial Watchlist */}
        <TabsContent value="financial" className="space-y-3 mt-4">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-emerald-300">
                <DollarSign className="w-5 h-5" /> מעקב פיננסי - 6 פריטים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {financialWatchlist.map((item) => (
                <div key={item.id} className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-sm">{item.title}</span>
                        <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">{item.category}</Badge>
                      </div>
                      <p className="text-xs text-slate-400">{item.metric}</p>
                      <p className="text-xs text-orange-300/80 mt-1">השפעה: {item.impact}</p>
                    </div>
                    <div className="flex items-center gap-1 text-red-400 text-sm font-bold shrink-0">
                      <ArrowDownRight className="w-4 h-4" />
                      {item.trend}%
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3) Operational Watchlist */}
        <TabsContent value="operational" className="space-y-3 mt-4">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-blue-300">
                <Factory className="w-5 h-5" /> מעקב תפעולי - 5 פריטים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {operationalWatchlist.map((item) => (
                <div key={item.id} className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/40">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-sm">{item.title}</span>
                      <Badge className={`text-[10px] ${sev[item.risk]}`}>{item.risk}</Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-xs">
                      <div className="bg-slate-700/30 rounded-lg p-2">
                        <span className="text-slate-500">סטטוס: </span>
                        <span className="text-slate-300">{item.status}</span>
                      </div>
                      <div className="bg-slate-700/30 rounded-lg p-2">
                        <span className="text-slate-500">סיבה: </span>
                        <span className="text-slate-300">{item.cause}</span>
                      </div>
                      <div className="bg-slate-700/30 rounded-lg p-2">
                        <span className="text-slate-500">לקוח: </span>
                        <span className="text-slate-300">{item.client}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4) Project Watchlist */}
        <TabsContent value="projects" className="space-y-3 mt-4">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-violet-300">
                <FolderKanban className="w-5 h-5" /> מעקב פרויקטים בסיכון - 5 פרויקטים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {projectWatchlist.map((proj) => (
                <div key={proj.id} className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/40">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{proj.name}</span>
                        <Badge className={`text-[10px] ${sev[proj.health < 50 ? "קריטי" : proj.health < 65 ? "גבוה" : "בינוני"]}`}>{proj.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500">
                        <span>תקציב: {proj.budget}</span>
                        <span>הוצאה: {proj.spent}</span>
                        <span>יעד: {proj.deadline}</span>
                      </div>
                    </div>
                    <div className="text-center shrink-0">
                      <div className={`text-2xl font-bold ${healthColor(proj.health)}`}>{proj.health}</div>
                      <div className="text-[10px] text-slate-500">בריאות</div>
                    </div>
                  </div>
                  <Progress value={proj.health} className={`h-2 ${healthBg(proj.health)}`} />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {proj.issues.map((issue, j) => (
                      <span key={j} className="text-[10px] bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded-full">{issue}</span>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5) Customer Watchlist */}
        <TabsContent value="customers" className="space-y-3 mt-4">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-cyan-300">
                <Users className="w-5 h-5" /> מעקב לקוחות - 4 פריטים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customerWatchlist.map((cust) => (
                <div key={cust.id} className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-sm">{cust.name}</span>
                        <Badge className={`text-[10px] ${sev[cust.risk]}`}>{cust.risk}</Badge>
                        <Badge variant="outline" className="text-[10px] border-cyan-500/30 text-cyan-400">{cust.value}</Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{cust.issue}</p>
                      <p className="text-xs text-cyan-300/70 mt-1 flex items-center gap-1">
                        <Target className="w-3 h-3" /> פעולה נדרשת: {cust.action}
                      </p>
                    </div>
                    <div className="text-center shrink-0">
                      <div className={`text-2xl font-bold ${cust.satisfaction >= 60 ? "text-green-400" : cust.satisfaction >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                        {cust.satisfaction}%
                      </div>
                      <div className="text-[10px] text-slate-500">שביעות רצון</div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6) Decisions Needed */}
        <TabsContent value="decisions" className="space-y-3 mt-4">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-amber-300">
                <Gavel className="w-5 h-5" /> 3 החלטות נדרשות היום
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {decisionsNeeded.map((dec, i) => (
                <div key={dec.id} className="p-4 bg-slate-800/40 rounded-xl border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-500/20 text-amber-300 text-sm font-bold">{i + 1}</div>
                    <span className="font-semibold text-sm flex-1">{dec.title}</span>
                    <Badge className="bg-amber-500/20 text-amber-300 text-[10px]">
                      <Clock className="w-3 h-3 ml-1" /> {dec.deadline}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 mb-3 bg-slate-700/30 p-2 rounded-lg">{dec.context}</p>
                  <div className="space-y-2">
                    {dec.options.map((opt, j) => (
                      <div key={j} className="flex items-start gap-2 p-2.5 bg-slate-700/20 rounded-lg border border-slate-700/40 hover:border-amber-500/30 transition-all cursor-pointer">
                        <div className="w-6 h-6 rounded-full bg-slate-600/50 flex items-center justify-center text-[11px] font-bold text-slate-300 shrink-0 mt-0.5">
                          {String.fromCharCode(1488 + j)}
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-medium text-slate-200">{opt.label}</p>
                          <div className="flex gap-3 mt-1 text-[10px]">
                            <span className="text-green-400/80 flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3" /> {opt.pros}</span>
                            <span className="text-red-400/80 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> {opt.cons}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 7) Suggested Actions */}
        <TabsContent value="actions" className="space-y-3 mt-4">
          <Card className="bg-slate-900/60 border-slate-700/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2 text-fuchsia-300">
                <Lightbulb className="w-5 h-5" /> 5 המלצות פעולה מנהלית
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {suggestedActions.map((act, i) => (
                <div key={act.id} className="p-4 bg-slate-800/40 rounded-xl border border-slate-700/40 hover:border-fuchsia-500/30 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-500/20 to-violet-500/20 text-fuchsia-300 text-sm font-bold shrink-0">
                      {i + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-sm">{act.title}</span>
                        <Badge className={`text-[10px] ${sev[act.priority]}`}>{act.priority}</Badge>
                      </div>
                      <p className="text-xs text-slate-400 mb-2">{act.desc}</p>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                        <div className="bg-slate-700/30 rounded-lg p-1.5 text-center">
                          <span className="text-slate-500 block">השפעה</span>
                          <span className="text-emerald-300 font-medium">{act.impact}</span>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-1.5 text-center">
                          <span className="text-slate-500 block">אחראי</span>
                          <span className="text-slate-300">{act.responsible}</span>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-1.5 text-center">
                          <span className="text-slate-500 block">לו\"ז</span>
                          <span className="text-amber-300">{act.timeline}</span>
                        </div>
                        <div className="bg-slate-700/30 rounded-lg p-1.5 text-center">
                          <span className="text-slate-500 block">עדיפות</span>
                          <span className={act.priority === "קריטי" ? "text-red-300" : act.priority === "גבוה" ? "text-orange-300" : "text-yellow-300"}>{act.priority}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Footer */}
      <div className="text-center text-[11px] text-slate-600 border-t border-slate-800 pt-4">
        תדרוך זה נוצר אוטומטית על ידי מנוע AI | טכנו-כל עוזי | {briefDate} | גרסה 4.4
      </div>
    </div>
  );
}