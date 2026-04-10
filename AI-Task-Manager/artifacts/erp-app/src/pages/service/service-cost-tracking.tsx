import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Calculator, Wallet, Wrench, Users, Car, ShieldCheck,
  TrendingUp, TrendingDown, Lightbulb, CircleDollarSign,
  FileText, PieChart, BarChart3, AlertTriangle
} from "lucide-react";

const fmt = (v: number) => `₪${v.toLocaleString("he-IL")}`;
const pct = (v: number) => `${v}%`;

/* ── KPI data ────────────────────────────────────────────── */
const FALLBACK_KPIS = [
  { label: "עלות שירות חודשית", value: fmt(34500), icon: Calculator, color: "text-blue-400", bg: "bg-blue-500/20" },
  { label: "עלות ממוצעת לקריאה", value: fmt(1200), icon: FileText, color: "text-emerald-400", bg: "bg-emerald-500/20" },
  { label: "חלקי חילוף", value: fmt(12000), icon: Wrench, color: "text-amber-400", bg: "bg-amber-500/20" },
  { label: 'כ"א', value: fmt(18000), icon: Users, color: "text-purple-400", bg: "bg-purple-500/20" },
  { label: "נסיעות", value: fmt(4500), icon: Car, color: "text-cyan-400", bg: "bg-cyan-500/20" },
  { label: "אחריות vs. חיוב", value: "60% / 40%", icon: ShieldCheck, color: "text-rose-400", bg: "bg-rose-500/20" },
];

/* ── Cost per case ───────────────────────────────────────── */
const FALLBACK_COST_CASES = [
  { id: "SRV-401", customer: "אלון מערכות בע\"מ", fault: "מנוע שרוף", labor: 1800, parts: 2200, travel: 350, warranty: true, billable: 0 },
  { id: "SRV-402", customer: "נדל\"ן צפון", fault: "רטיבות מסגרת", labor: 900, parts: 400, travel: 500, warranty: false, billable: 1800 },
  { id: "SRV-403", customer: "קיבוץ דגניה", fault: "חלודה בריתוך", labor: 1200, parts: 800, travel: 600, warranty: true, billable: 0 },
  { id: "SRV-404", customer: "עיריית חיפה", fault: "דופן רופפת", labor: 600, parts: 350, travel: 400, warranty: false, billable: 1350 },
  { id: "SRV-405", customer: "מפעלי הדרום", fault: "מנגנון גלילה", labor: 1500, parts: 1800, travel: 550, warranty: true, billable: 0 },
  { id: "SRV-406", customer: "רשת סופר-בית", fault: "ציר שבור", labor: 750, parts: 300, travel: 200, warranty: false, billable: 1250 },
  { id: "SRV-407", customer: "בית ספר אורט", fault: "בד הצללה קרוע", labor: 500, parts: 600, travel: 350, warranty: false, billable: 1450 },
  { id: "SRV-408", customer: "משרד הביטחון", fault: "בקר אלקטרוני", labor: 2200, parts: 3500, travel: 450, warranty: true, billable: 0 },
  { id: "SRV-409", customer: "חברת אופק", fault: "צבע מתקלף", labor: 800, parts: 500, travel: 300, warranty: false, billable: 1600 },
  { id: "SRV-410", customer: "מלון ים המלח", fault: "תריס לא נסגר", labor: 1100, parts: 1400, travel: 700, warranty: true, billable: 0 },
];

/* ── Cost categories ─────────────────────────────────────── */
const FALLBACK_COST_CATEGORIES = [
  { label: 'כ"א', icon: Users, planned: 16000, actual: 18000, color: "text-purple-400", bg: "bg-purple-500/20" },
  { label: "חלקי חילוף", icon: Wrench, planned: 10000, actual: 12000, color: "text-amber-400", bg: "bg-amber-500/20" },
  { label: "נסיעות", icon: Car, planned: 5000, actual: 4500, color: "text-cyan-400", bg: "bg-cyan-500/20" },
  { label: "שונות", icon: CircleDollarSign, planned: 1500, actual: 0, color: "text-zinc-400", bg: "bg-zinc-500/20" },
];

/* ── Warranty vs billable split ──────────────────────────── */
const warrantySplit = {
  warrantyCount: 5,
  billableCount: 5,
  warrantyCost: 20950,
  billableRevenue: 7450,
  absorbedLabor: 7600,
  absorbedParts: 8700,
  absorbedTravel: 2650,
  billedLabor: 3550,
  billedParts: 2150,
  billedTravel: 1750,
};

/* ── Monthly trend ───────────────────────────────────────── */
const FALLBACK_MONTHLY_TREND = [
  { month: "נובמבר 2025", cost: 28000, revenue: 9200, pl: -18800 },
  { month: "דצמבר 2025", cost: 31500, revenue: 8500, pl: -23000 },
  { month: "ינואר 2026", cost: 29000, revenue: 10800, pl: -18200 },
  { month: "פברואר 2026", cost: 33000, revenue: 11500, pl: -21500 },
  { month: "מרץ 2026", cost: 35200, revenue: 12000, pl: -23200 },
  { month: "אפריל 2026", cost: 34500, revenue: 7450, pl: -27050 },
];

/* ── AI insights ─────────────────────────────────────────── */
const FALLBACK_INSIGHTS = [
  {
    title: "עלות חלקי חילוף עולה על התקציב ב-20%",
    body: "מומלץ לנהל משא ומתן מחדש עם ספקי חלקי חילוף או לעבור לספק חלופי. בקרים אלקטרוניים הם 29% מהעלות הכוללת.",
    icon: AlertTriangle,
    color: "text-amber-400",
  },
  {
    title: "60% מהקריאות מכוסות באחריות — עלות נספגת גבוהה",
    body: "יש לשקול תמחור מחדש של חבילות האחריות. עלות ממוצעת לקריאת אחריות (₪4,190) גבוהה ב-35% מקריאה לחיוב.",
    icon: Lightbulb,
    color: "text-blue-400",
  },
  {
    title: "עלות נסיעות מתחת לתקציב ב-10%",
    body: "שיפור מסלולי טכנאים וצמצום נסיעות כפולות ממשיכים להניב חיסכון. ניתן להרחיב את המודל לאזורים נוספים.",
    icon: TrendingDown,
    color: "text-emerald-400",
  },
];

/* ════════════════════════════════════════════════════════════ */

export default function ServiceCostTracking() {
  const { data: servicecosttrackingData } = useQuery({
    queryKey: ["service-cost-tracking"],
    queryFn: () => authFetch("/api/service/service_cost_tracking"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = servicecosttrackingData ?? FALLBACK_KPIS;
  const costCases = FALLBACK_COST_CASES;
  const costCategories = FALLBACK_COST_CATEGORIES;
  const insights = FALLBACK_INSIGHTS;
  const monthlyTrend = FALLBACK_MONTHLY_TREND;

  const [tab, setTab] = useState("cases");

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-500/20">
          <Calculator className="h-6 w-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">מעקב עלויות שירות</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניתוח עלויות שירות ואחריות</p>
        </div>
      </div>

      {/* ── KPI Strip ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-muted/50">
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded ${k.bg}`}>
                  <k.icon className={`h-4 w-4 ${k.color}`} />
                </div>
                <span className="text-xs text-muted-foreground">{k.label}</span>
              </div>
              <span className="text-lg font-bold">{k.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ───────────────────────────────────────── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="cases">עלות לקריאה</TabsTrigger>
          <TabsTrigger value="categories">קטגוריות עלות</TabsTrigger>
          <TabsTrigger value="warranty">אחריות vs. חיוב</TabsTrigger>
          <TabsTrigger value="trend">מגמה חודשית</TabsTrigger>
        </TabsList>

        {/* ── Cost per Case ────────────────────────────── */}
        <TabsContent value="cases">
          <Card className="bg-muted/50">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מס׳ קריאה</TableHead>
                    <TableHead className="text-right">לקוח</TableHead>
                    <TableHead className="text-right">סוג תקלה</TableHead>
                    <TableHead className="text-right">כ"א</TableHead>
                    <TableHead className="text-right">חלקים</TableHead>
                    <TableHead className="text-right">נסיעות</TableHead>
                    <TableHead className="text-right">סה"כ</TableHead>
                    <TableHead className="text-right">אחריות</TableHead>
                    <TableHead className="text-right">לחיוב</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costCases.map((c) => {
                    const total = c.labor + c.parts + c.travel;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-sm">{c.id}</TableCell>
                        <TableCell>{c.customer}</TableCell>
                        <TableCell>{c.fault}</TableCell>
                        <TableCell>{fmt(c.labor)}</TableCell>
                        <TableCell>{fmt(c.parts)}</TableCell>
                        <TableCell>{fmt(c.travel)}</TableCell>
                        <TableCell className="font-semibold">{fmt(total)}</TableCell>
                        <TableCell>
                          <Badge className={c.warranty ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-500/20 text-zinc-400"}>
                            {c.warranty ? "כן" : "לא"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold">{c.billable > 0 ? fmt(c.billable) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Cost Categories ──────────────────────────── */}
        <TabsContent value="categories">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {costCategories.map((cat) => {
              const ratio = cat.planned > 0 ? Math.round((cat.actual / cat.planned) * 100) : 0;
              const over = cat.actual > cat.planned;
              return (
                <Card key={cat.label} className="bg-muted/50">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded ${cat.bg}`}>
                          <cat.icon className={`h-4 w-4 ${cat.color}`} />
                        </div>
                        <span className="font-semibold">{cat.label}</span>
                      </div>
                      <Badge className={over ? "bg-red-500/20 text-red-400" : "bg-emerald-500/20 text-emerald-400"}>
                        {over ? "חריגה" : "בתקציב"}
                      </Badge>
                    </div>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>מתוכנן: {fmt(cat.planned)}</span>
                      <span>בפועל: {fmt(cat.actual)}</span>
                    </div>
                    <Progress value={Math.min(ratio, 100)} className="h-2" />
                    <p className="text-xs text-muted-foreground text-left">{pct(ratio)} ניצול</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ── Warranty vs Billable ─────────────────────── */}
        <TabsContent value="warranty">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Warranty absorbed */}
            <Card className="bg-muted/50 border-rose-500/30">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-rose-500/20">
                    <ShieldCheck className="h-4 w-4 text-rose-400" />
                  </div>
                  <span className="font-semibold">עלות אחריות נספגת</span>
                  <Badge className="bg-rose-500/20 text-rose-400 mr-auto">{warrantySplit.warrantyCount} קריאות</Badge>
                </div>
                <div className="text-2xl font-bold text-rose-400">{fmt(warrantySplit.warrantyCost)}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>כ"א</span><span>{fmt(warrantySplit.absorbedLabor)}</span></div>
                  <div className="flex justify-between"><span>חלקי חילוף</span><span>{fmt(warrantySplit.absorbedParts)}</span></div>
                  <div className="flex justify-between"><span>נסיעות</span><span>{fmt(warrantySplit.absorbedTravel)}</span></div>
                </div>
                <Progress value={60} className="h-2" />
                <p className="text-xs text-muted-foreground">60% מכלל הקריאות</p>
              </CardContent>
            </Card>

            {/* Billable revenue */}
            <Card className="bg-muted/50 border-emerald-500/30">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded bg-emerald-500/20">
                    <Wallet className="h-4 w-4 text-emerald-400" />
                  </div>
                  <span className="font-semibold">הכנסות שירות לחיוב</span>
                  <Badge className="bg-emerald-500/20 text-emerald-400 mr-auto">{warrantySplit.billableCount} קריאות</Badge>
                </div>
                <div className="text-2xl font-bold text-emerald-400">{fmt(warrantySplit.billableRevenue)}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span>כ"א</span><span>{fmt(warrantySplit.billedLabor)}</span></div>
                  <div className="flex justify-between"><span>חלקי חילוף</span><span>{fmt(warrantySplit.billedParts)}</span></div>
                  <div className="flex justify-between"><span>נסיעות</span><span>{fmt(warrantySplit.billedTravel)}</span></div>
                </div>
                <Progress value={40} className="h-2" />
                <p className="text-xs text-muted-foreground">40% מכלל הקריאות</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Monthly Trend ────────────────────────────── */}
        <TabsContent value="trend">
          <Card className="bg-muted/50">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">חודש</TableHead>
                    <TableHead className="text-right">עלות כוללת</TableHead>
                    <TableHead className="text-right">הכנסות שירות</TableHead>
                    <TableHead className="text-right">רווח/הפסד נטו</TableHead>
                    <TableHead className="text-right">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyTrend.map((m, i) => {
                    const prev = i > 0 ? monthlyTrend[i - 1].pl : m.pl;
                    const improving = m.pl > prev;
                    return (
                      <TableRow key={m.month}>
                        <TableCell className="font-medium">{m.month}</TableCell>
                        <TableCell>{fmt(m.cost)}</TableCell>
                        <TableCell>{fmt(m.revenue)}</TableCell>
                        <TableCell className={m.pl >= 0 ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                          {fmt(m.pl)}
                        </TableCell>
                        <TableCell>
                          {improving ? (
                            <TrendingUp className="h-4 w-4 text-emerald-400 inline" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-400 inline" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── AI Insights ────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-amber-400" />
          תובנות AI — אופטימיזציית עלויות
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {insights.map((ins) => (
            <Card key={ins.title} className="bg-muted/50">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <ins.icon className={`h-5 w-5 ${ins.color}`} />
                  <span className="font-semibold text-sm">{ins.title}</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{ins.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
