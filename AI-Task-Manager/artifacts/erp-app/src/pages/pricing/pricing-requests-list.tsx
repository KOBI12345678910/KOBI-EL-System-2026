import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileSpreadsheet, FileText, Calculator, CheckCircle2, Clock, Send,
  AlertTriangle, Eye, TrendingUp, Layers, Search, Filter,
} from "lucide-react";

/* ── Helpers ───────────────────────────────────────────────────── */
const shekel = (v: number) =>
  "₪" + v.toLocaleString("he-IL", { maximumFractionDigits: 0 });

const pct = (v: number) => v.toFixed(1) + "%";

/* ── Status / Urgency Maps ─────────────────────────────────────── */
const statusMap: Record<string, { label: string; cls: string }> = {
  draft:       { label: "טיוטה",       cls: "bg-slate-600/40 text-slate-300" },
  calculating: { label: "בחישוב",      cls: "bg-blue-500/20 text-blue-400" },
  review:      { label: "בבדיקה",      cls: "bg-yellow-500/20 text-yellow-400" },
  approved:    { label: "מאושר",       cls: "bg-green-500/20 text-green-400" },
  sent:        { label: "נשלח ללקוח",  cls: "bg-purple-500/20 text-purple-400" },
};

const urgencyMap: Record<string, { label: string; cls: string }> = {
  low:    { label: "רגיל",   cls: "bg-slate-600/40 text-slate-300" },
  medium: { label: "בינוני", cls: "bg-yellow-500/20 text-yellow-400" },
  high:   { label: "גבוה",  cls: "bg-orange-500/20 text-orange-400" },
  urgent: { label: "דחוף",  cls: "bg-red-500/20 text-red-400" },
};

const systemIcon: Record<string, string> = {
  "שער": "🚪", "חלון": "🪟", "מעקה": "🛡️", "חזית": "🏢", "פרגולה": "☀️",
};

/* ── KPI Data ──────────────────────────────────────────────────── */
const kpis = [
  { label: "סה״כ בקשות",    value: 12, icon: FileSpreadsheet, color: "text-blue-400",   bg: "bg-blue-500/10" },
  { label: "טיוטה",          value: 2,  icon: FileText,        color: "text-slate-400",  bg: "bg-slate-500/10" },
  { label: "בחישוב",         value: 3,  icon: Calculator,      color: "text-cyan-400",   bg: "bg-cyan-500/10" },
  { label: "בבדיקה",         value: 3,  icon: Eye,             color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "מאושרות",        value: 2,  icon: CheckCircle2,    color: "text-green-400",  bg: "bg-green-500/10" },
  { label: "נשלחו ללקוח",    value: 2,  icon: Send,            color: "text-purple-400", bg: "bg-purple-500/10" },
];

/* ── 12 Pricing Requests ──────────────────────────────────────── */
const requests = [
  { id: "PR-301", project: "מגדל הים התיכון - חזית זכוכית",      customer: "אורבן נדל״ן",      systemType: "חזית",   areaSqm: 1420, weightKg: 8540,  estimatedCost: 485000,  recommendedPrice: 642000,  margin: 32.4, version: 3, status: "approved",    urgency: "high",   createdBy: "רונן לוי",     date: "2026-03-12" },
  { id: "PR-302", project: "שערי כניסה - פארק רעננה",            customer: "עיריית רעננה",      systemType: "שער",    areaSqm: 86,   weightKg: 1260,  estimatedCost: 78500,   recommendedPrice: 108200,  margin: 37.8, version: 2, status: "sent",        urgency: "medium", createdBy: "מיכל כהן",     date: "2026-03-18" },
  { id: "PR-303", project: "מעקות בטיחות - קניון הנגב",          customer: "ביג מרכזי מסחר",    systemType: "מעקה",   areaSqm: 310,  weightKg: 3720,  estimatedCost: 215000,  recommendedPrice: 296700,  margin: 38.0, version: 1, status: "review",      urgency: "high",   createdBy: "אלון דוד",     date: "2026-03-22" },
  { id: "PR-304", project: "חלונות אלומיניום - פינוי-בינוי נתניה", customer: "אזורים בנייה",     systemType: "חלון",   areaSqm: 2800, weightKg: 14200, estimatedCost: 1250000, recommendedPrice: 1625000, margin: 30.0, version: 1, status: "calculating", urgency: "urgent", createdBy: "שרון אברהם",   date: "2026-03-25" },
  { id: "PR-305", project: "חזית מבנה משרדים - רמת החייל",       customer: "אמות השקעות",       systemType: "חזית",   areaSqm: 960,  weightKg: 5760,  estimatedCost: 920000,  recommendedPrice: 1250000, margin: 35.9, version: 2, status: "draft",       urgency: "medium", createdBy: "רונן לוי",     date: "2026-03-28" },
  { id: "PR-306", project: "פרגולת אלומיניום - וילה הרצליה פיתוח", customer: "משפחת רוזנברג",    systemType: "פרגולה", areaSqm: 54,   weightKg: 820,   estimatedCost: 42000,   recommendedPrice: 56800,   margin: 35.2, version: 1, status: "approved",    urgency: "low",    createdBy: "מיכל כהן",     date: "2026-03-30" },
  { id: "PR-307", project: "מעקות זכוכית - לובי מלון דן",        customer: "מלונות דן",         systemType: "מעקה",   areaSqm: 185,  weightKg: 2220,  estimatedCost: 167000,  recommendedPrice: 218800,  margin: 31.0, version: 2, status: "review",      urgency: "high",   createdBy: "אלון דוד",     date: "2026-04-01" },
  { id: "PR-308", project: "חלונות תרמיים - בית חולים הדסה",     customer: "הדסה מדיקל",        systemType: "חלון",   areaSqm: 1150, weightKg: 6900,  estimatedCost: 535000,  recommendedPrice: 695500,  margin: 30.0, version: 1, status: "calculating", urgency: "urgent", createdBy: "שרון אברהם",   date: "2026-04-02" },
  { id: "PR-309", project: "חזית קורטן - מרכז הייטק הרצליה",     customer: "אלביט מערכות",      systemType: "חזית",   areaSqm: 780,  weightKg: 9360,  estimatedCost: 780000,  recommendedPrice: 1053000, margin: 35.0, version: 1, status: "draft",       urgency: "medium", createdBy: "רונן לוי",     date: "2026-04-03" },
  { id: "PR-310", project: "שער חשמלי - בית ספר גורדון ת״א",     customer: "עיריית תל אביב",    systemType: "שער",    areaSqm: 32,   weightKg: 480,   estimatedCost: 34500,   recommendedPrice: 46500,   margin: 34.8, version: 1, status: "sent",        urgency: "low",    createdBy: "מיכל כהן",     date: "2026-04-04" },
  { id: "PR-311", project: "מעקות מדרגות - מגדל עזריאלי שרונה",  customer: "עזריאלי קבוצה",     systemType: "מעקה",   areaSqm: 420,  weightKg: 5040,  estimatedCost: 310000,  recommendedPrice: 415400,  margin: 34.0, version: 3, status: "review",      urgency: "high",   createdBy: "אלון דוד",     date: "2026-04-05" },
  { id: "PR-312", project: "חלונות מבודדים - פרויקט מחיר למשתכן", customer: "שיכון ובינוי",     systemType: "חלון",   areaSqm: 3600, weightKg: 18000, estimatedCost: 1480000, recommendedPrice: 1924000, margin: 30.0, version: 1, status: "calculating", urgency: "urgent", createdBy: "שרון אברהם",   date: "2026-04-07" },
];

/* ── Component ─────────────────────────────────────────────────── */
export default function PricingRequestsList() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = requests.filter((r) => {
    const matchTab =
      activeTab === "all" ||
      (activeTab === "draft" && r.status === "draft") ||
      (activeTab === "calculating" && r.status === "calculating") ||
      (activeTab === "review" && r.status === "review") ||
      (activeTab === "approved" && (r.status === "approved" || r.status === "sent"));
    const matchSearch =
      !search ||
      r.id.toLowerCase().includes(search.toLowerCase()) ||
      r.project.includes(search) ||
      r.customer.includes(search);
    return matchTab && matchSearch;
  });

  const totalEstimated = requests.reduce((s, r) => s + r.estimatedCost, 0);
  const totalRecommended = requests.reduce((s, r) => s + r.recommendedPrice, 0);
  const avgMargin = requests.reduce((s, r) => s + r.margin, 0) / requests.length;

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/20">
            <FileSpreadsheet className="h-6 w-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">בקשות תמחור פרויקטים</h1>
            <p className="text-sm text-slate-400">טכנו-כל עוזי &mdash; ניהול בקשות תמחור, מעקב סטטוס ואישורים</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי מס׳ / פרויקט / לקוח..."
              className="bg-slate-800 border border-slate-700 rounded-lg pr-10 pl-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 w-72"
            />
          </div>
        </div>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
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

      {/* ── Summary Strip ──────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10">
              <Calculator className="h-5 w-5 text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">סה״כ עלויות משוערות</p>
              <p className="text-lg font-bold text-white">{shekel(totalEstimated)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <TrendingUp className="h-5 w-5 text-green-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">סה״כ מחירים מומלצים</p>
              <p className="text-lg font-bold text-white">{shekel(totalRecommended)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Layers className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">מרווח ממוצע</p>
              <p className="text-lg font-bold text-white">{pct(avgMargin)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabs + Table ───────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-800/70 border border-slate-700">
          <TabsTrigger value="all" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
            כל הבקשות
          </TabsTrigger>
          <TabsTrigger value="draft" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
            טיוטה
          </TabsTrigger>
          <TabsTrigger value="calculating" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
            בחישוב
          </TabsTrigger>
          <TabsTrigger value="review" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
            בבדיקה
          </TabsTrigger>
          <TabsTrigger value="approved" className="data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
            מאושרות
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} forceMount className={activeTab ? "" : "hidden"}>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-blue-400" />
                בקשות תמחור ({filtered.length} מתוך {requests.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700 hover:bg-slate-700/30">
                      <TableHead className="text-slate-400 text-right text-xs font-medium">מס׳ בקשה</TableHead>
                      <TableHead className="text-slate-400 text-right text-xs font-medium">פרויקט</TableHead>
                      <TableHead className="text-slate-400 text-right text-xs font-medium">לקוח</TableHead>
                      <TableHead className="text-slate-400 text-right text-xs font-medium">סוג מערכת</TableHead>
                      <TableHead className="text-slate-400 text-right text-xs font-medium">שטח מ״ר</TableHead>
                      <TableHead className="text-slate-400 text-right text-xs font-medium">משקל ק״ג</TableHead>
                      <TableHead className="text-slate-400 text-right text-xs font-medium">עלות משוערת</TableHead>
                      <TableHead className="text-slate-400 text-right text-xs font-medium">מחיר מומלץ</TableHead>
                      <TableHead className="text-slate-400 text-right text-xs font-medium">מרווח %</TableHead>
                      <TableHead className="text-slate-400 text-right text-xs font-medium">גרסה</TableHead>
                      <TableHead className="text-slate-400 text-right text-xs font-medium">סטטוס</TableHead>
                      <TableHead className="text-slate-400 text-right text-xs font-medium">דחיפות</TableHead>
                      <TableHead className="text-slate-400 text-right text-xs font-medium">נוצר ע״י</TableHead>
                      <TableHead className="text-slate-400 text-right text-xs font-medium">תאריך</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const st = statusMap[r.status];
                      const ur = urgencyMap[r.urgency];
                      const marginColor =
                        r.margin >= 35 ? "text-green-400" : r.margin >= 30 ? "text-yellow-400" : "text-red-400";
                      return (
                        <TableRow key={r.id} className="border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                          <TableCell className="text-blue-400 font-mono text-sm font-semibold">{r.id}</TableCell>
                          <TableCell className="text-white text-sm max-w-[200px] truncate">{r.project}</TableCell>
                          <TableCell className="text-slate-300 text-sm">{r.customer}</TableCell>
                          <TableCell className="text-sm">
                            <span className="flex items-center gap-1.5 text-slate-300">
                              <span>{systemIcon[r.systemType] ?? "📦"}</span>
                              {r.systemType}
                            </span>
                          </TableCell>
                          <TableCell className="text-slate-300 text-sm font-mono">{r.areaSqm.toLocaleString("he-IL")}</TableCell>
                          <TableCell className="text-slate-300 text-sm font-mono">{r.weightKg.toLocaleString("he-IL")}</TableCell>
                          <TableCell className="text-white text-sm font-mono">{shekel(r.estimatedCost)}</TableCell>
                          <TableCell className="text-white text-sm font-mono font-semibold">{shekel(r.recommendedPrice)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress
                                value={r.margin}
                                className="h-1.5 w-12 bg-slate-700"
                              />
                              <span className={`text-sm font-mono font-semibold ${marginColor}`}>{pct(r.margin)}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="border-slate-600 text-slate-300 text-xs">
                              v{r.version}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${st.cls} text-xs border-0`}>{st.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${ur.cls} text-xs border-0`}>{ur.label}</Badge>
                          </TableCell>
                          <TableCell className="text-slate-300 text-sm">{r.createdBy}</TableCell>
                          <TableCell className="text-slate-400 text-sm font-mono">{r.date}</TableCell>
                        </TableRow>
                      );
                    })}
                    {filtered.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={14} className="text-center py-12 text-slate-500">
                          <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          לא נמצאו בקשות תמחור בסינון הנוכחי
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── System Type Breakdown ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm">פילוח לפי סוג מערכת</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {["שער", "חלון", "מעקה", "חזית", "פרגולה"].map((type) => {
              const items = requests.filter((r) => r.systemType === type);
              const total = items.reduce((s, r) => s + r.recommendedPrice, 0);
              const pctVal = (total / totalRecommended) * 100;
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-lg w-7 text-center">{systemIcon[type]}</span>
                  <span className="text-slate-300 text-sm w-16">{type}</span>
                  <span className="text-slate-500 text-xs w-6">{items.length}</span>
                  <div className="flex-1">
                    <Progress value={pctVal} className="h-2 bg-slate-700" />
                  </div>
                  <span className="text-white text-sm font-mono w-24 text-left">{shekel(total)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-sm">בקשות דחופות</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {requests
              .filter((r) => r.urgency === "urgent" || r.urgency === "high")
              .sort((a, b) => (a.urgency === "urgent" ? -1 : 1))
              .map((r) => (
                <div key={r.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-700/30 hover:bg-slate-700/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <Badge className={`${urgencyMap[r.urgency].cls} text-xs border-0`}>
                      {r.urgency === "urgent" ? <AlertTriangle className="h-3 w-3 ml-1" /> : null}
                      {urgencyMap[r.urgency].label}
                    </Badge>
                    <span className="text-blue-400 font-mono text-sm">{r.id}</span>
                    <span className="text-white text-sm truncate max-w-[180px]">{r.project}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={`${statusMap[r.status].cls} text-xs border-0`}>{statusMap[r.status].label}</Badge>
                    <span className="text-white text-sm font-mono">{shekel(r.recommendedPrice)}</span>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
