import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck, Clock, CheckCircle2, XCircle, Zap, Search, AlertTriangle,
  ThumbsUp, ThumbsDown, Settings2, Lock, DollarSign, UserCog, Bot,
  FileText, RefreshCw, ShieldAlert, Timer
} from "lucide-react";

const kpis = [
  { label: "ממתינים לאישור", value: "8", delta: "+3 היום", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  { label: "אושרו היום", value: "23", delta: "+5 מאתמול", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { label: "נדחו היום", value: "4", delta: "-2 מאתמול", icon: XCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  { label: "זמן אישור ממוצע", value: "12 דקות", delta: "-3 דקות", icon: Timer, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { label: "בוצעו אוטומטית", value: "147", delta: "+18 היום", icon: Zap, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
];

type ApprovalTier = "auto_execute" | "manager_approval" | "finance_approval" | "admin_approval";
type ApprovalStatus = "pending" | "approved" | "rejected";

interface ApprovalItem {
  id: string;
  title: string;
  module: string;
  tier: ApprovalTier;
  status: ApprovalStatus;
  recommendation: string;
  confidence: number;
  risk: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  message: string;
  minRole: string;
  requestedBy: string;
  requestedAt: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

const tierConfig: Record<ApprovalTier, { label: string; icon: any; color: string; bg: string; border: string }> = {
  auto_execute: { label: "ביצוע אוטומטי", icon: Zap, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  manager_approval: { label: "אישור מנהל", icon: UserCog, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  finance_approval: { label: "אישור כספים", icon: DollarSign, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  admin_approval: { label: "אישור מנהל מערכת", icon: Lock, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
};

const riskColors: Record<string, string> = {
  low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  high: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
};
const riskLabels: Record<string, string> = { low: "נמוך", medium: "בינוני", high: "גבוה", critical: "קריטי" };

const pendingItems: ApprovalItem[] = [
  { id: "APR-301", title: "שינוי מחיר מוצר X200 ל-₪1,850", module: "מכירות", tier: "finance_approval", status: "pending", recommendation: "אשר — המחיר תואם מגמת שוק ומרווח >35%", confidence: 92, risk: "סטייה של 8% מהמחיר הממוצע בקטגוריה", riskLevel: "medium", message: "שינוי מחיר דורש אישור מחלקת כספים לפי מדיניות מרווח מינימלי", minRole: "מנהל כספים", requestedBy: "שרה כהן", requestedAt: "08/04/2026 09:12" },
  { id: "APR-302", title: "שיבוץ משמרת לילה — צוות ב׳", module: "משאבי אנוש", tier: "manager_approval", status: "pending", recommendation: "אשר — תואם דרישות כ״א ותקנות עבודה", confidence: 88, risk: "עובד אחד חורג ממכסת שעות שבועית", riskLevel: "low", message: "שיבוץ משמרות דורש אישור מנהל משמרת", minRole: "מנהל משמרות", requestedBy: "AI-שיבוץ", requestedAt: "08/04/2026 07:30" },
  { id: "APR-303", title: "הזמנת רכש — 500 יח׳ חומר גלם T40", module: "רכש", tier: "manager_approval", status: "pending", recommendation: "אשר — מלאי צפוי להיגמר תוך 5 ימים", confidence: 95, risk: "עלות כוללת ₪42,000 — מתחת לתקרת אישור מנהל", riskLevel: "low", message: "הזמנת רכש מעל ₪10,000 דורשת אישור מנהל רכש", minRole: "מנהל רכש", requestedBy: "AI-מלאי", requestedAt: "08/04/2026 08:45" },
  { id: "APR-304", title: "שינוי חשבונית #INV-8821 — הנחה 12%", module: "כספים", tier: "finance_approval", status: "pending", recommendation: "דחה — הנחה חורגת ממדיניות (מקסימום 10%)", confidence: 97, risk: "חריגה של 2% ממדיניות הנחות — פגיעה ברווחיות", riskLevel: "high", message: "שינוי חשבונית עם הנחה מעל 10% דורש אישור CFO", minRole: "CFO", requestedBy: "יוסי לוי", requestedAt: "08/04/2026 10:22" },
  { id: "APR-305", title: "שינוי תקציב פרויקט אלפא — +₪85,000", module: "כספים", tier: "finance_approval", status: "pending", recommendation: "אשר בתנאים — דורש הקטנת תקציב שיווק ברבעון", confidence: 78, risk: "חריגה מתקציב שנתי ב-3.2%", riskLevel: "high", message: "שינוי תקציב פרויקט מעל ₪50,000 דורש אישור הנהלה", minRole: "סמנכ״ל כספים", requestedBy: "דנה שמיר", requestedAt: "08/04/2026 11:05" },
  { id: "APR-306", title: "תזמון התקנה — לקוח ׳רשת אופק׳", module: "שירות", tier: "manager_approval", status: "pending", recommendation: "אשר — חלון זמן פנוי + צוות זמין", confidence: 91, risk: "מינימלי — התקנה סטנדרטית", riskLevel: "low", message: "תזמון התקנה ללקוח VIP דורש אישור מנהל שירות", minRole: "מנהל שירות", requestedBy: "AI-לו״ז", requestedAt: "08/04/2026 09:50" },
  { id: "APR-307", title: "שינוי תפקיד — עובד #E-205 למנהל צוות", module: "משאבי אנוש", tier: "admin_approval", status: "pending", recommendation: "אשר — עובד עם ביצועים מצוינים + 3 שנות ותק", confidence: 85, risk: "שינוי הרשאות מערכת + גישה לדוחות כספיים", riskLevel: "medium", message: "שינוי תפקיד עם הרחבת הרשאות דורש אישור מנהל מערכת", minRole: "מנהל מערכת", requestedBy: "מיכל ברק", requestedAt: "08/04/2026 10:40" },
  { id: "APR-308", title: "שינוי כלל מערכת — מרווח מינימלי 30%→28%", module: "הגדרות", tier: "admin_approval", status: "pending", recommendation: "דחה — הורדת מרווח מסוכנת ברבעון הנוכחי", confidence: 94, risk: "השפעה על כל הצעות המחיר + ירידה צפויה ברווח ₪220,000/שנה", riskLevel: "critical", message: "שינוי כללי מערכת גלובליים דורש אישור כפול — מנהל מערכת + CFO", minRole: "מנהל מערכת + CFO", requestedBy: "אבי גולד", requestedAt: "08/04/2026 11:30" },
];

const approvedHistory: ApprovalItem[] = [
  { id: "APR-291", title: "הזמנת רכש — 200 יח׳ ברגים M10", module: "רכש", tier: "manager_approval", status: "approved", recommendation: "אושר", confidence: 96, risk: "מינימלי", riskLevel: "low", message: "אישור שגרתי", minRole: "מנהל רכש", requestedBy: "AI-מלאי", requestedAt: "07/04/2026 14:20", resolvedBy: "רון דוד", resolvedAt: "07/04/2026 14:35" },
  { id: "APR-285", title: "עדכון מחיר מוצר G50 ל-₪980", module: "מכירות", tier: "finance_approval", status: "approved", recommendation: "אושר", confidence: 89, risk: "מינימלי", riskLevel: "low", message: "תואם מדיניות", minRole: "מנהל כספים", requestedBy: "שרה כהן", requestedAt: "07/04/2026 11:10", resolvedBy: "דן אלון", resolvedAt: "07/04/2026 11:45" },
  { id: "APR-275", title: "הקצאת תקציב שיווק Q2 — ₪120,000", module: "כספים", tier: "finance_approval", status: "approved", recommendation: "אושר", confidence: 82, risk: "עלייה של 15% מ-Q1", riskLevel: "medium", message: "אושר על ידי CFO", minRole: "סמנכ״ל כספים", requestedBy: "טלי וינר", requestedAt: "05/04/2026 13:30", resolvedBy: "דן אלון", resolvedAt: "05/04/2026 15:00" },
];

const rejectedHistory: ApprovalItem[] = [
  { id: "APR-295", title: "הנחה 20% ללקוח חד-פעמי", module: "מכירות", tier: "finance_approval", status: "rejected", recommendation: "נדחה — חורג ממדיניות הנחות", confidence: 96, risk: "פגיעה ברווחיות + תקדים מסוכן", riskLevel: "high", message: "הנחה מעל 15% לא מאושרת ללקוח ללא היסטוריה", minRole: "CFO", requestedBy: "עמית רז", requestedAt: "07/04/2026 16:00", resolvedBy: "דן אלון", resolvedAt: "07/04/2026 16:30" },
  { id: "APR-288", title: "שינוי ספק ראשי — חומר גלם T40", module: "רכש", tier: "admin_approval", status: "rejected", recommendation: "נדחה — ספק חלופי לא עבר אישור איכות", confidence: 91, risk: "סיכון איכות + עיכוב ייצור", riskLevel: "critical", message: "שינוי ספק ראשי דורש מעבר אישור QA מלא", minRole: "מנהל מערכת", requestedBy: "רון דוד", requestedAt: "06/04/2026 10:00", resolvedBy: "מנהל מערכת", resolvedAt: "06/04/2026 11:15" },
  { id: "APR-278", title: "שינוי מרווח מינימלי ל-25%", module: "הגדרות", tier: "admin_approval", status: "rejected", recommendation: "נדחה — מרווח נמוך מדי ברבעון חלש", confidence: 95, risk: "ירידה צפויה ברווח ₪380,000 בשנה", riskLevel: "critical", message: "שינוי גלובלי נדחה ע״י CFO", minRole: "מנהל מערכת + CFO", requestedBy: "אבי גולד", requestedAt: "04/04/2026 09:00", resolvedBy: "דן אלון", resolvedAt: "04/04/2026 10:30" },
];

const policyTiers = [
  {
    tier: "auto_execute" as ApprovalTier,
    actions: [
      { action: "יצירת משימה", desc: "משימות שנוצרות אוטומטית ע״י AI", threshold: "ללא מגבלה", active: true },
      { action: "סיכום שיחה / פגישה", desc: "סיכומים אוטומטיים מ-AI NLP", threshold: "ללא מגבלה", active: true },
      { action: "טיוטת מסמך", desc: "הצעות מחיר / דוחות — טיוטה בלבד", threshold: "ללא מגבלה", active: true },
      { action: "עדכון סטטוס משימה", desc: "שינוי סטטוס אוטומטי לפי כללים", threshold: "ללא מגבלה", active: true },
    ],
  },
  {
    tier: "manager_approval" as ApprovalTier,
    actions: [
      { action: "שיבוץ משמרות", desc: "שינוי או יצירת משמרות עובדים", threshold: "כל שינוי", active: true },
      { action: "הזמנת רכש", desc: "הזמנות מעל ₪10,000", threshold: "₪10,000-₪100,000", active: true },
      { action: "תזמון התקנה", desc: "תזמון התקנות ללקוחות VIP", threshold: "לקוחות VIP", active: true },
      { action: "שינוי לו״ז ייצור", desc: "הזזת פקודות עבודה בלו״ז", threshold: "השפעה > 2 שעות", active: true },
    ],
  },
  {
    tier: "finance_approval" as ApprovalTier,
    actions: [
      { action: "שינוי מחיר מוצר", desc: "עדכון מחירון פעיל", threshold: "סטייה > 5%", active: true },
      { action: "שינוי / ביטול חשבונית", desc: "הנחות, זיכויים, ביטולים", threshold: "כל שינוי", active: true },
      { action: "שינוי תקציב פרויקט", desc: "הגדלה או הקטנת תקציב", threshold: "מעל ₪50,000", active: true },
      { action: "שינוי מרווח רווח", desc: "שינוי מרווח ברמת מוצר/לקוח", threshold: "כל שינוי", active: true },
    ],
  },
  {
    tier: "admin_approval" as ApprovalTier,
    actions: [
      { action: "שינוי תפקיד / הרשאות", desc: "שינוי רמת גישה לעובד", threshold: "כל שינוי", active: true },
      { action: "סגירת פרויקט", desc: "סגירה סופית של פרויקט", threshold: "כל פרויקט", active: true },
      { action: "שינוי ספק ראשי", desc: "החלפת ספק מאושר", threshold: "ספקים קריטיים", active: true },
      { action: "שינוי כללי מערכת", desc: "פרמטרים גלובליים — מרווח, מדיניות, כללים", threshold: "כל שינוי", active: true },
    ],
  },
];

export default function Bash44ApprovalQueue() {
  const [tab, setTab] = useState("pending");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState(pendingItems);

  const handleAction = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));
  const filterFn = (i: ApprovalItem) => i.title.includes(search) || i.module.includes(search) || i.id.includes(search);
  const filteredPending = items.filter(filterFn);
  const filteredApproved = approvedHistory.filter(filterFn);
  const filteredRejected = rejectedHistory.filter(filterFn);

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#101829] to-[#0a0e1a] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30">
            <ShieldCheck className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-l from-amber-400 to-orange-400 bg-clip-text text-transparent">תור אישורים — שער בקרת AI</h1>
            <p className="text-sm text-slate-400">ניהול אישורים לפעולות AI — מדיניות דרגות, אישור/דחייה, היסטוריה</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:bg-slate-800">
          <RefreshCw className="w-4 h-4 ml-1" /> רענן
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className={`bg-[#0d1525]/80 border ${k.bg} backdrop-blur-sm`}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${k.bg}`}>
                <k.icon className={`w-5 h-5 ${k.color}`} />
              </div>
              <div>
                <p className="text-xs text-slate-400">{k.label}</p>
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                <p className="text-[10px] text-slate-500">{k.delta}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input placeholder="חיפוש לפי מזהה, כותרת או מודול..." value={search} onChange={(e) => setSearch(e.target.value)}
          className="pr-10 bg-[#0d1525] border-slate-700 text-slate-200 placeholder:text-slate-500" />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-[#0d1525] border border-slate-700/50">
          <TabsTrigger value="pending" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400">
            <Clock className="w-4 h-4 ml-1" /> ממתינים ({filteredPending.length})
          </TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 ml-1" /> אושרו ({filteredApproved.length})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">
            <XCircle className="w-4 h-4 ml-1" /> נדחו ({filteredRejected.length})
          </TabsTrigger>
          <TabsTrigger value="policy" className="data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400">
            <Settings2 className="w-4 h-4 ml-1" /> מדיניות אישורים
          </TabsTrigger>
        </TabsList>

        {/* Pending Tab */}
        <TabsContent value="pending" className="space-y-3">
          {filteredPending.length === 0 && (
            <Card className="bg-[#0d1525]/80 border-slate-700/50">
              <CardContent className="p-8 text-center text-slate-500">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500/40" />
                <p>אין פריטים ממתינים לאישור</p>
              </CardContent>
            </Card>
          )}
          {filteredPending.map((item) => {
            const tc = tierConfig[item.tier];
            const TierIcon = tc.icon;
            return (
              <Card key={item.id} className="bg-[#0d1525]/80 border-slate-700/50 hover:border-slate-600/70 transition-colors">
                <CardContent className="p-5 space-y-4">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`p-2 rounded-lg ${tc.bg} border ${tc.border}`}>
                        <TierIcon className={`w-5 h-5 ${tc.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-slate-500">{item.id}</span>
                          <Badge variant="outline" className={`${tc.bg} ${tc.color} border ${tc.border} text-[10px]`}>
                            {tc.label}
                          </Badge>
                          <Badge variant="outline" className="bg-slate-800/50 text-slate-400 border-slate-700 text-[10px]">
                            {item.module}
                          </Badge>
                          <Badge variant="outline" className={`${riskColors[item.riskLevel]} text-[10px]`}>
                            סיכון: {riskLabels[item.riskLevel]}
                          </Badge>
                        </div>
                        <h3 className="font-semibold text-slate-100 mt-1">{item.title}</h3>
                      </div>
                    </div>
                    <div className="text-left text-xs text-slate-500 whitespace-nowrap">
                      <p>{item.requestedAt}</p>
                      <p>ע״י {item.requestedBy}</p>
                    </div>
                  </div>

                  {/* AI Recommendation */}
                  <div className="bg-[#0a1020] rounded-lg p-3 border border-slate-700/30 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Bot className="w-3.5 h-3.5 text-violet-400" />
                      <span className="text-violet-400 font-medium">המלצת AI</span>
                      <span className="mr-auto">ביטחון: {item.confidence}%</span>
                    </div>
                    <p className="text-sm text-slate-300">{item.recommendation}</p>
                    <div className="flex items-center gap-1">
                      <Progress value={item.confidence} className="h-1.5 flex-1" />
                    </div>
                  </div>

                  {/* Risk + Message */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-slate-500 text-xs">סיבת סיכון:</span>
                        <p className="text-slate-300">{item.risk}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <FileText className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-slate-500 text-xs">הודעת מדיניות:</span>
                        <p className="text-slate-300">{item.message}</p>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-700/30">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <ShieldAlert className="w-3.5 h-3.5" />
                      <span>תפקיד מינימלי: <span className="text-slate-300">{item.minRole}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                        onClick={() => handleAction(item.id)}
                      >
                        <ThumbsDown className="w-3.5 h-3.5 ml-1" /> דחה
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleAction(item.id)}
                      >
                        <ThumbsUp className="w-3.5 h-3.5 ml-1" /> אשר
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Approved Tab */}
        <TabsContent value="approved" className="space-y-3">
          {filteredApproved.map((item) => {
            const tc = tierConfig[item.tier]; const TierIcon = tc.icon;
            return (
              <Card key={item.id} className="bg-[#0d1525]/80 border-slate-700/50">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${tc.bg} border ${tc.border}`}><TierIcon className={`w-5 h-5 ${tc.color}`} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-slate-500">{item.id}</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]"><CheckCircle2 className="w-3 h-3 ml-0.5" /> אושר</Badge>
                      <Badge variant="outline" className="bg-slate-800/50 text-slate-400 border-slate-700 text-[10px]">{item.module}</Badge>
                    </div>
                    <h3 className="font-medium text-slate-200 mt-0.5 text-sm">{item.title}</h3>
                  </div>
                  <div className="text-left text-xs text-slate-500 shrink-0">
                    <p>הוגש: {item.requestedAt}</p>
                    <p className="text-emerald-400">אושר: {item.resolvedAt}</p>
                    <p>ע״י {item.resolvedBy}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Rejected Tab */}
        <TabsContent value="rejected" className="space-y-3">
          {filteredRejected.map((item) => (
            <Card key={item.id} className="bg-[#0d1525]/80 border-slate-700/50">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30"><XCircle className="w-5 h-5 text-red-400" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-slate-500">{item.id}</span>
                      <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/30 text-[10px]"><XCircle className="w-3 h-3 ml-0.5" /> נדחה</Badge>
                      <Badge variant="outline" className={`${riskColors[item.riskLevel]} text-[10px]`}>סיכון: {riskLabels[item.riskLevel]}</Badge>
                      <Badge variant="outline" className="bg-slate-800/50 text-slate-400 border-slate-700 text-[10px]">{item.module}</Badge>
                    </div>
                    <h3 className="font-medium text-slate-200 mt-0.5 text-sm">{item.title}</h3>
                  </div>
                  <div className="text-left text-xs text-slate-500 shrink-0">
                    <p>הוגש: {item.requestedAt}</p>
                    <p className="text-red-400">נדחה: {item.resolvedAt}</p>
                    <p>ע״י {item.resolvedBy}</p>
                  </div>
                </div>
                <div className="bg-red-500/5 rounded-lg p-2.5 border border-red-500/10">
                  <p className="text-xs text-slate-400 mb-0.5">סיבת דחייה:</p>
                  <p className="text-sm text-red-300">{item.risk}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Policy Config Tab */}
        <TabsContent value="policy" className="space-y-4">
          {policyTiers.map((pt) => {
            const tc = tierConfig[pt.tier]; const TierIcon = tc.icon;
            return (
              <Card key={pt.tier} className="bg-[#0d1525]/80 border-slate-700/50">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <div className={`p-1.5 rounded-lg ${tc.bg} border ${tc.border}`}><TierIcon className={`w-4 h-4 ${tc.color}`} /></div>
                    <span className={tc.color}>{tc.label}</span>
                    <Badge variant="outline" className="mr-auto bg-slate-800/50 text-slate-400 border-slate-700 text-[10px]">{pt.actions.length} כללים</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50 text-slate-400 text-xs">
                        <th className="text-right py-2 pr-2 font-medium">סוג פעולה</th>
                        <th className="text-right py-2 font-medium">תיאור</th>
                        <th className="text-right py-2 font-medium">תנאי הפעלה</th>
                        <th className="text-center py-2 font-medium">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pt.actions.map((a, idx) => (
                        <tr key={idx} className="border-b border-slate-700/20 hover:bg-slate-800/20">
                          <td className="py-2.5 pr-2 text-slate-200 font-medium">{a.action}</td>
                          <td className="py-2.5 text-slate-400">{a.desc}</td>
                          <td className="py-2.5"><Badge variant="outline" className="bg-slate-800/50 text-slate-300 border-slate-700 text-[10px]">{a.threshold}</Badge></td>
                          <td className="py-2.5 text-center">
                            <Badge variant="outline" className={a.active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px]" : "bg-slate-800/50 text-slate-500 border-slate-700 text-[10px]"}>{a.active ? "פעיל" : "מושבת"}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
}
