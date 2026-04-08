import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Calculator, TrendingUp, Clock, CheckCircle2, AlertTriangle, Target,
  DollarSign, BarChart3, Package, Layers, ArrowUpDown, Eye, Send,
  FileText, ShieldCheck, Percent, Activity,
} from "lucide-react";

const fmt = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000
    ? `${(v / 1_000).toFixed(0)}K`
    : v.toLocaleString("he-IL");

const fmtFull = (v: number) => v.toLocaleString("he-IL");

/* ── KPI Data ───────────────────────────────────────────────── */
const kpis = [
  { label: "בקשות תמחור פעילות", value: 23, icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "הושלמו החודש", value: 47, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
  { label: "מרווח ממוצע %", value: "32.4%", icon: Percent, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "סה״כ ערך הצעות ₪", value: "₪4.85M", icon: DollarSign, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "ממתינות לאישור", value: 8, icon: ShieldCheck, color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "זמן תמחור ממוצע (שעות)", value: 4.2, icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "דיוק מול ביצוע %", value: "94.1%", icon: Target, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "אחוז זכייה על הצעות", value: "68%", icon: TrendingUp, color: "text-pink-400", bg: "bg-pink-500/10" },
];

/* ── Status / Urgency Maps ──────────────────────────────────── */
const statusMap: Record<string, { label: string; cls: string }> = {
  draft:       { label: "טיוטה",    cls: "bg-slate-600/40 text-slate-300" },
  calculating: { label: "בחישוב",   cls: "bg-blue-500/20 text-blue-400" },
  review:      { label: "בבדיקה",   cls: "bg-yellow-500/20 text-yellow-400" },
  approved:    { label: "מאושר",    cls: "bg-green-500/20 text-green-400" },
  sent:        { label: "נשלח",     cls: "bg-purple-500/20 text-purple-400" },
};

const urgencyMap: Record<string, { label: string; cls: string }> = {
  low:    { label: "רגיל",  cls: "bg-slate-600/40 text-slate-300" },
  medium: { label: "בינוני", cls: "bg-yellow-500/20 text-yellow-400" },
  high:   { label: "גבוה",  cls: "bg-orange-500/20 text-orange-400" },
  urgent: { label: "דחוף",  cls: "bg-red-500/20 text-red-400" },
};

/* ── Active Pricing Requests ────────────────────────────────── */
const pricingRequests = [
  { id: "PR-1041", project: "מגדל הים התיכון - חזית זכוכית", customer: "אורבן נדל״ן", systemType: "חזית", estimatedCost: 485000, recommendedPrice: 642000, margin: 32.4, status: "approved", urgency: "high" },
  { id: "PR-1042", project: "שערי כניסה - פארק רעננה", customer: "עיריית רעננה", systemType: "שער", estimatedCost: 78500, recommendedPrice: 108200, margin: 37.8, status: "sent", urgency: "medium" },
  { id: "PR-1043", project: "מעקות בטיחות - קניון הנגב", customer: "ביג מרכזי מסחר", systemType: "מעקה", estimatedCost: 215000, recommendedPrice: 296700, margin: 38.0, status: "review", urgency: "high" },
  { id: "PR-1044", project: "חלונות אלומיניום - פרויקט פינוי-בינוי", customer: "אזורים בנייה", systemType: "חלון", estimatedCost: 1250000, recommendedPrice: 1625000, margin: 30.0, status: "calculating", urgency: "urgent" },
  { id: "PR-1045", project: "חזית מבנה משרדים - רמת החייל", customer: "אמות השקעות", systemType: "חזית", estimatedCost: 920000, recommendedPrice: 1250000, margin: 35.9, status: "draft", urgency: "medium" },
  { id: "PR-1046", project: "שער חשמלי תעשייתי - מפעל שטראוס", customer: "שטראוס גרופ", systemType: "שער", estimatedCost: 42000, recommendedPrice: 56800, margin: 35.2, status: "approved", urgency: "low" },
  { id: "PR-1047", project: "מעקות זכוכית - לובי מלון דן", customer: "מלונות דן", systemType: "מעקה", estimatedCost: 167000, recommendedPrice: 218800, margin: 31.0, status: "review", urgency: "high" },
  { id: "PR-1048", project: "חלונות תרמיים - בית חולים הדסה", customer: "הדסה מדיקל", systemType: "חלון", estimatedCost: 535000, recommendedPrice: 695500, margin: 30.0, status: "calculating", urgency: "urgent" },
  { id: "PR-1049", project: "חזית קורטן - מרכז הייטק הרצליה", customer: "אלביט מערכות", systemType: "חזית", estimatedCost: 780000, recommendedPrice: 1053000, margin: 35.0, status: "draft", urgency: "medium" },
  { id: "PR-1050", project: "שער אלומיניום - בית ספר תל אביב", customer: "עיריית תל אביב", systemType: "שער", estimatedCost: 34500, recommendedPrice: 46500, margin: 34.8, status: "sent", urgency: "low" },
];

/* ── Top 5 Most Quoted Products ─────────────────────────────── */
const topProducts = [
  { name: "חלון אלומיניום תרמי 6000 סדרה", count: 34, revenue: 2450000 },
  { name: "חזית זכוכית מבודדת כפולה", count: 28, revenue: 3120000 },
  { name: "מעקה זכוכית עם מאחז נירוסטה", count: 22, revenue: 890000 },
  { name: "שער חשמלי אלומיניום מתקפל", count: 19, revenue: 520000 },
  { name: "דלת כניסה פלדה+אלומיניום", count: 16, revenue: 410000 },
];

/* ── Material Cost Distribution (19 categories) ─────────────── */
const materialCategories = [
  { name: "אלומיניום פרופיל ראשי", pct: 18.5, amount: 925000 },
  { name: "זכוכית מחוסמת", pct: 14.2, amount: 710000 },
  { name: "זכוכית מבודדת (LOW-E)", pct: 11.8, amount: 590000 },
  { name: "פלדת קונסטרוקציה", pct: 8.4, amount: 420000 },
  { name: "נירוסטה 304/316", pct: 7.1, amount: 355000 },
  { name: "אטמים וגומיות EPDM", pct: 5.3, amount: 265000 },
  { name: "ברגים וחומרי חיבור", pct: 4.6, amount: 230000 },
  { name: "צבע אלקטרוסטטי", pct: 4.2, amount: 210000 },
  { name: "מנועים חשמליים (שערים)", pct: 3.8, amount: 190000 },
  { name: "מנגנוני נעילה", pct: 3.5, amount: 175000 },
  { name: "סיליקון ואיטום", pct: 3.1, amount: 155000 },
  { name: "בידוד תרמי פוליאמיד", pct: 2.9, amount: 145000 },
  { name: "ידיות וצירים", pct: 2.6, amount: 130000 },
  { name: "אביזרי אלומיניום משלים", pct: 2.2, amount: 110000 },
  { name: "קורטן (פלדה חלודה)", pct: 1.9, amount: 95000 },
  { name: "ציפוי אנודייז", pct: 1.8, amount: 90000 },
  { name: "רשתות יתושים", pct: 1.4, amount: 70000 },
  { name: "אריזה והובלה", pct: 1.5, amount: 75000 },
  { name: "חומרי עזר שונים", pct: 1.2, amount: 60000 },
];

/* ── Margin Trend (last 6 months) ───────────────────────────── */
const marginTrend = [
  { month: "נובמבר", margin: 29.5, projects: 6 },
  { month: "דצמבר", margin: 31.2, projects: 8 },
  { month: "ינואר", margin: 30.8, projects: 7 },
  { month: "פברואר", margin: 33.1, projects: 9 },
  { month: "מרץ", margin: 32.4, projects: 11 },
  { month: "אפריל", margin: 34.2, projects: 6 },
];

const systemTypeIcon: Record<string, string> = {
  "שער": "🚪", "חלון": "🪟", "מעקה": "🛡️", "חזית": "🏢",
};

/* ── Component ──────────────────────────────────────────────── */
export default function PricingDashboard() {
  const [activeTab, setActiveTab] = useState("requests");
  const [sortField, setSortField] = useState<string>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const sorted = [...pricingRequests].sort((a: any, b: any) => {
    const av = a[sortField], bv = b[sortField];
    const cmp = typeof av === "number" ? av - bv : String(av).localeCompare(String(bv), "he");
    return sortDir === "asc" ? cmp : -cmp;
  });

  const maxMaterialPct = Math.max(...materialCategories.map((m) => m.pct));

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20">
            <Calculator className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">מנוע תמחור פרויקטים</h1>
            <p className="text-sm text-slate-400">טכנו-כל עוזי &mdash; מתכת, אלומיניום וזכוכית</p>
          </div>
        </div>
        <Badge className="bg-green-500/20 text-green-400 border-green-500/30 animate-pulse gap-1.5 px-3 py-1">
          <Activity className="h-3.5 w-3.5" />
          LIVE
        </Badge>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
            <CardContent className="p-4 flex flex-col gap-2">
              <div className={`p-2 rounded-lg w-fit ${k.bg}`}>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <span className="text-xl font-bold text-white">{k.value}</span>
              <span className="text-[11px] leading-tight text-slate-400">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-800/70 border border-slate-700">
          <TabsTrigger value="requests" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
            <FileText className="h-4 w-4 ml-1.5" /> בקשות פעילות
          </TabsTrigger>
          <TabsTrigger value="stats" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
            <BarChart3 className="h-4 w-4 ml-1.5" /> סטטיסטיקות
          </TabsTrigger>
          <TabsTrigger value="materials" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
            <Layers className="h-4 w-4 ml-1.5" /> עלויות חומרים
          </TabsTrigger>
        </TabsList>

        {/* ── Active Requests Table ─────────────────────────── */}
        <TabsContent value="requests">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-400" />
                בקשות תמחור פעילות ({pricingRequests.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700 hover:bg-slate-700/30">
                      {[
                        { key: "id", label: "מס׳ בקשה" },
                        { key: "project", label: "פרויקט / לקוח" },
                        { key: "systemType", label: "סוג מערכת" },
                        { key: "estimatedCost", label: "עלות משוערת" },
                        { key: "recommendedPrice", label: "מחיר מומלץ" },
                        { key: "margin", label: "מרווח %" },
                        { key: "status", label: "סטטוס" },
                        { key: "urgency", label: "דחיפות" },
                      ].map((col) => (
                        <TableHead
                          key={col.key}
                          className="text-slate-400 text-xs cursor-pointer hover:text-white whitespace-nowrap"
                          onClick={() => toggleSort(col.key)}
                        >
                          <span className="flex items-center gap-1">
                            {col.label}
                            {sortField === col.key && (
                              <ArrowUpDown className="h-3 w-3 text-blue-400" />
                            )}
                          </span>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((r) => (
                      <TableRow key={r.id} className="border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                        <TableCell className="font-mono text-blue-400 text-sm">{r.id}</TableCell>
                        <TableCell>
                          <div className="text-sm text-white font-medium leading-snug">{r.project}</div>
                          <div className="text-xs text-slate-500">{r.customer}</div>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {systemTypeIcon[r.systemType] || "📦"} {r.systemType}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-slate-300 font-mono">₪{fmtFull(r.estimatedCost)}</TableCell>
                        <TableCell className="text-sm text-white font-mono font-medium">₪{fmtFull(r.recommendedPrice)}</TableCell>
                        <TableCell>
                          <span className={`text-sm font-semibold ${r.margin >= 35 ? "text-green-400" : r.margin >= 30 ? "text-yellow-400" : "text-red-400"}`}>
                            {r.margin}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${statusMap[r.status]?.cls} text-xs border-0`}>
                            {statusMap[r.status]?.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${urgencyMap[r.urgency]?.cls} text-xs border-0`}>
                            {urgencyMap[r.urgency]?.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Quick Stats ───────────────────────────────────── */}
        <TabsContent value="stats" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top 5 Products */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <Package className="h-5 w-5 text-emerald-400" />
                  Top 5 מוצרים מתומחרים
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={p.name} className="flex items-center gap-3">
                    <span className="text-lg font-bold text-slate-500 w-6 text-center">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">{p.name}</div>
                      <div className="flex items-center gap-3 mt-1">
                        <Progress value={(p.count / topProducts[0].count) * 100} className="h-1.5 flex-1 bg-slate-700" />
                        <span className="text-xs text-slate-400 whitespace-nowrap">{p.count} הצעות</span>
                      </div>
                    </div>
                    <span className="text-sm text-emerald-400 font-mono font-medium whitespace-nowrap">
                      ₪{fmt(p.revenue)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Margin Trend */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-400" />
                  מגמת מרווח - 6 חודשים אחרונים
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {marginTrend.map((m) => (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="text-sm text-slate-400 w-16">{m.month}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-700 rounded-full h-2.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              m.margin >= 33 ? "bg-green-500" : m.margin >= 30 ? "bg-yellow-500" : "bg-red-500"
                            }`}
                            style={{ width: `${(m.margin / 40) * 100}%` }}
                          />
                        </div>
                        <span className={`text-sm font-semibold w-14 text-left ${
                          m.margin >= 33 ? "text-green-400" : m.margin >= 30 ? "text-yellow-400" : "text-red-400"
                        }`}>
                          {m.margin}%
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500 w-16 text-left">{m.projects} פרויקטים</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-700 flex items-center justify-between text-xs text-slate-400">
                  <span>יעד מרווח חברה: 32%</span>
                  <span className="text-green-400 font-medium">מגמה עולה +4.7% ב-6 חודשים</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Material Cost Distribution ────────────────────── */}
        <TabsContent value="materials">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Layers className="h-5 w-5 text-yellow-400" />
                התפלגות עלויות חומרים ({materialCategories.length} קטגוריות)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                {materialCategories.map((m) => (
                  <div key={m.name} className="flex items-center gap-3 py-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-slate-300 truncate">{m.name}</span>
                        <span className="text-xs text-slate-500 mr-2">{m.pct}%</span>
                      </div>
                      <div className="bg-slate-700 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-blue-500 to-cyan-500 transition-all"
                          style={{ width: `${(m.pct / maxMaterialPct) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 font-mono w-20 text-left">₪{fmtFull(m.amount)}</span>
                  </div>
                ))}
              </div>
              <div className="pt-4 mt-4 border-t border-slate-700 flex items-center justify-between">
                <span className="text-sm text-slate-400">סה״כ עלויות חומרים</span>
                <span className="text-lg font-bold text-white font-mono">
                  ₪{fmtFull(materialCategories.reduce((s, m) => s + m.amount, 0))}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Summary Footer ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-400 shrink-0" />
            <div>
              <div className="text-sm font-medium text-white">2 בקשות דחופות</div>
              <div className="text-xs text-slate-400">PR-1044, PR-1048 &mdash; ממתינות לחישוב</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <Eye className="h-5 w-5 text-yellow-400 shrink-0" />
            <div>
              <div className="text-sm font-medium text-white">2 בקשות בבדיקה</div>
              <div className="text-xs text-slate-400">PR-1043, PR-1047 &mdash; ממתינות לאישור מנהל</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <Send className="h-5 w-5 text-purple-400 shrink-0" />
            <div>
              <div className="text-sm font-medium text-white">2 הצעות נשלחו</div>
              <div className="text-xs text-slate-400">PR-1042, PR-1050 &mdash; ממתינות לתגובת לקוח</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
