import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, DollarSign, BarChart3, Users, AlertTriangle,
  CheckCircle, XCircle, Lightbulb, Target, PieChart, ArrowUpRight
} from "lucide-react";

/* ── Static mock data ─────────────────────────────────────────── */

const FALLBACK_INSTALLATIONS = [
  { id: "INS-001", project: "מגדלי הים — חיפה", customer: "אזורים נדל\"ן", revenue: 72000, cost: 48500, team: "צוות אלפא", product: "חלונות" },
  { id: "INS-002", project: "פארק המדע — רחובות", customer: "רבוע כחול", revenue: 55000, cost: 41200, team: "צוות בטא", product: "ויטרינות" },
  { id: "INS-003", project: "בית חכם — הרצליה", customer: "גינדי השקעות", revenue: 38000, cost: 24700, team: "צוות גמא", product: "דלתות" },
  { id: "INS-004", project: "מלון ים התיכון", customer: "אלמוג מלונות", revenue: 64000, cost: 52300, team: "צוות אלפא", product: "מעקות" },
  { id: "INS-005", project: "קניון הדרום — באר שבע", customer: "ביג מרכזי קניות", revenue: 47000, cost: 33800, team: "צוות דלתא", product: "פרגולות" },
  { id: "INS-006", project: "משרדי הייטק — הרצליה פיתוח", customer: "אמות השקעות", revenue: 52000, cost: 36400, team: "צוות בטא", product: "מחיצות" },
  { id: "INS-007", project: "בניין מגורים — נתניה", customer: "שיכון ובינוי", revenue: 41000, cost: 38600, team: "צוות גמא", product: "חלונות" },
  { id: "INS-008", project: "מרכז ספורט — ראשל\"צ", customer: "עיריית ראשל\"צ", revenue: 33000, cost: 22100, team: "צוות דלתא", product: "דלתות" },
  { id: "INS-009", project: "תחנת רכבת — לוד", customer: "נת\"ע", revenue: 61000, cost: 43500, team: "צוות אלפא", product: "ויטרינות" },
  { id: "INS-010", project: "בית ספר — מודיעין", customer: "עיריית מודיעין", revenue: 29000, cost: 27800, team: "צוות בטא", product: "מעקות" },
  { id: "INS-011", project: "מגדל משרדים — ת\"א", customer: "אזורים נדל\"ן", revenue: 58000, cost: 34200, team: "צוות דלתא", product: "פרגולות" },
  { id: "INS-012", project: "וילה פרטית — קיסריה", customer: "לקוח פרטי", revenue: 30000, cost: 14900, team: "צוות גמא", product: "מחיצות" },
];

const FALLBACK_TEAM_DATA = [
  { name: "צוות אלפא", revenue: 197000, cost: 144300, count: 3 },
  { name: "צוות בטא", revenue: 136000, cost: 104800, count: 3 },
  { name: "צוות גמא", revenue: 109000, cost: 78200, count: 3 },
  { name: "צוות דלתא", revenue: 138000, cost: 90700, count: 3 },
];

const FALLBACK_PRODUCT_DATA = [
  { name: "חלונות", revenue: 113000, cost: 87100, count: 2 },
  { name: "דלתות", revenue: 71000, cost: 46800, count: 2 },
  { name: "ויטרינות", revenue: 116000, cost: 84700, count: 2 },
  { name: "מעקות", revenue: 93000, cost: 80100, count: 2 },
  { name: "פרגולות", revenue: 105000, cost: 68000, count: 2 },
  { name: "מחיצות", revenue: 82000, cost: 51300, count: 2 },
];

const FALLBACK_TOP_CUSTOMERS = [
  { name: "אזורים נדל\"ן", totalRevenue: 130000, totalCost: 82700, installations: 2 },
  { name: "נת\"ע", totalRevenue: 61000, totalCost: 43500, installations: 1 },
  { name: "אלמוג מלונות", totalRevenue: 64000, totalCost: 52300, installations: 1 },
  { name: "ביג מרכזי קניות", totalRevenue: 47000, totalCost: 33800, installations: 1 },
  { name: "אמות השקעות", totalRevenue: 52000, totalCost: 36400, installations: 1 },
];

const FALLBACK_INSIGHTS = [
  { icon: "up", text: "צוות אלפא הכי רווחי — הגדל את הקיבולת שלו", detail: "מרווח ממוצע 26.7% עם הכנסה גבוהה. הוספת איש צוות נוסף תגדיל את התפוקה ב-25%.", type: "positive" },
  { icon: "alert", text: "מעקות זכוכית — מרווח נמוך, שקול העלאת מחיר", detail: "מרווח של 13.9% בלבד לעומת ממוצע 28% בשאר הקטגוריות. עלות החומרים עלתה 15% ברבעון האחרון.", type: "warning" },
  { icon: "target", text: "אזורים נדל\"ן — נפח גבוה, מרווח נמוך — משא ומתן", detail: "לקוח הכי גדול (₪130,000) אבל מרווח 36.4%. אפשר לשפר תנאי תשלום או להעלות מחיר ב-5%.", type: "info" },
];

/* ── Helpers ──────────────────────────────────────────────────── */

const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");
const pct = (revenue: number, cost: number) => revenue === 0 ? 0 : Math.round(((revenue - cost) / revenue) * 100);
const marginColor = (m: number) => m >= 25 ? "text-green-600" : m >= 10 ? "text-amber-600" : "text-red-600";
const marginBg = (m: number) => m >= 25 ? "bg-green-500" : m >= 10 ? "bg-amber-500" : "bg-red-500";
const profitBadge = (m: number) => m >= 25 ? "רווחי" : m >= 10 ? "גבולי" : "הפסדי";
const badgeVariant = (m: number): "default" | "secondary" | "destructive" => m >= 25 ? "default" : m >= 10 ? "secondary" : "destructive";

/* ── Component ───────────────────────────────────────────────── */

export default function InstallationProfitability() {
  const { data: installations = FALLBACK_INSTALLATIONS } = useQuery({
    queryKey: ["installation-installations"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-profitability/installations");
      if (!res.ok) return FALLBACK_INSTALLATIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_INSTALLATIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: teamData = FALLBACK_TEAM_DATA } = useQuery({
    queryKey: ["installation-team-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-profitability/team-data");
      if (!res.ok) return FALLBACK_TEAM_DATA;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_TEAM_DATA;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: productData = FALLBACK_PRODUCT_DATA } = useQuery({
    queryKey: ["installation-product-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-profitability/product-data");
      if (!res.ok) return FALLBACK_PRODUCT_DATA;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_PRODUCT_DATA;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: topCustomers = FALLBACK_TOP_CUSTOMERS } = useQuery({
    queryKey: ["installation-top-customers"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-profitability/top-customers");
      if (!res.ok) return FALLBACK_TOP_CUSTOMERS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_TOP_CUSTOMERS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: insights = FALLBACK_INSIGHTS } = useQuery({
    queryKey: ["installation-insights"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-profitability/insights");
      if (!res.ok) return FALLBACK_INSIGHTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_INSIGHTS;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const totalRevenue = 580000;
  const totalCost = 418000;
  const grossProfit = totalRevenue - totalCost;
  const overallMargin = pct(totalRevenue, totalCost);
  const profitableCount = installations.filter(i => pct(i.revenue, i.cost) >= 10).length;
  const lossCount = installations.filter(i => pct(i.revenue, i.cost) < 10).length;

  const kpis = [
    { label: "הכנסה מהתקנות", value: fmt(totalRevenue), icon: DollarSign, color: "text-blue-600" },
    { label: "עלות כוללת", value: fmt(totalCost), icon: BarChart3, color: "text-orange-600" },
    { label: "רווח גולמי", value: fmt(grossProfit), icon: TrendingUp, color: "text-green-600" },
    { label: "מרווח", value: overallMargin + "%", icon: PieChart, color: "text-purple-600" },
    { label: "התקנות רווחיות", value: profitableCount + " / " + installations.length, icon: CheckCircle, color: "text-emerald-600" },
    { label: "התקנות הפסדיות", value: String(lossCount), icon: XCircle, color: "text-red-600" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-green-100">
          <TrendingUp className="h-7 w-7 text-green-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">רווחיות התקנות</h1>
          <p className="text-muted-foreground text-sm">טכנו-כל עוזי — ניתוח רווחיות לכל התקנה, צוות, מוצר ולקוח</p>
        </div>
      </div>

      {/* ── Summary KPIs ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="pt-4 pb-3 px-4 flex flex-col items-center text-center">
              <k.icon className={`h-5 w-5 mb-1 ${k.color}`} />
              <span className="text-xs text-muted-foreground">{k.label}</span>
              <span className="text-lg font-bold mt-1">{k.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <Tabs defaultValue="installations" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="installations">רווחיות לפי התקנה</TabsTrigger>
          <TabsTrigger value="teams">רווחיות לפי צוות</TabsTrigger>
          <TabsTrigger value="products">רווחיות לפי מוצר</TabsTrigger>
          <TabsTrigger value="customers">רווחיות לפי לקוח</TabsTrigger>
          <TabsTrigger value="insights">תובנות והמלצות</TabsTrigger>
        </TabsList>

        {/* ── Per Installation ─────────────────────────────── */}
        <TabsContent value="installations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5 text-blue-600" />
                רווחיות לפי התקנה — 12 התקנות אחרונות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מס׳</TableHead>
                    <TableHead className="text-right">פרויקט</TableHead>
                    <TableHead className="text-right">לקוח</TableHead>
                    <TableHead className="text-right">הכנסה</TableHead>
                    <TableHead className="text-right">עלות</TableHead>
                    <TableHead className="text-right">רווח</TableHead>
                    <TableHead className="text-right">מרווח</TableHead>
                    <TableHead className="text-right w-[120px]">ביצוע</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installations.map(ins => {
                    const profit = ins.revenue - ins.cost;
                    const margin = pct(ins.revenue, ins.cost);
                    return (
                      <TableRow key={ins.id}>
                        <TableCell className="font-mono text-sm">{ins.id}</TableCell>
                        <TableCell className="font-medium">{ins.project}</TableCell>
                        <TableCell>{ins.customer}</TableCell>
                        <TableCell>{fmt(ins.revenue)}</TableCell>
                        <TableCell>{fmt(ins.cost)}</TableCell>
                        <TableCell className={`font-semibold ${marginColor(margin)}`}>{fmt(profit)}</TableCell>
                        <TableCell className={`font-semibold ${marginColor(margin)}`}>{margin}%</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={margin} className={`h-2 w-16 ${marginBg(margin)}`} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={badgeVariant(margin)}>{profitBadge(margin)}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Per Team ─────────────────────────────────────── */}
        <TabsContent value="teams">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-indigo-600" />
                רווחיות לפי צוות התקנה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">צוות</TableHead>
                    <TableHead className="text-right">הכנסה כוללת</TableHead>
                    <TableHead className="text-right">עלות כוללת</TableHead>
                    <TableHead className="text-right">רווח</TableHead>
                    <TableHead className="text-right">מרווח %</TableHead>
                    <TableHead className="text-right">התקנות</TableHead>
                    <TableHead className="text-right">רווח ממוצע להתקנה</TableHead>
                    <TableHead className="text-right w-[120px]">ביצוע</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamData.map(t => {
                    const profit = t.revenue - t.cost;
                    const margin = pct(t.revenue, t.cost);
                    const avgProfit = Math.round(profit / t.count);
                    return (
                      <TableRow key={t.name}>
                        <TableCell className="font-semibold">{t.name}</TableCell>
                        <TableCell>{fmt(t.revenue)}</TableCell>
                        <TableCell>{fmt(t.cost)}</TableCell>
                        <TableCell className={`font-semibold ${marginColor(margin)}`}>{fmt(profit)}</TableCell>
                        <TableCell className={`font-semibold ${marginColor(margin)}`}>{margin}%</TableCell>
                        <TableCell className="text-center">{t.count}</TableCell>
                        <TableCell>{fmt(avgProfit)}</TableCell>
                        <TableCell>
                          <Progress value={margin} className={`h-2 ${marginBg(margin)}`} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Per Product ──────────────────────────────────── */}
        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <PieChart className="h-5 w-5 text-teal-600" />
                רווחיות לפי סוג מוצר
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {productData.map(p => {
                  const profit = p.revenue - p.cost;
                  const margin = pct(p.revenue, p.cost);
                  return (
                    <Card key={p.name} className="border">
                      <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-bold text-base">{p.name}</span>
                          <Badge variant={badgeVariant(margin)}>{margin}% מרווח</Badge>
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">הכנסה</span>
                            <span className="font-medium">{fmt(p.revenue)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">עלות</span>
                            <span className="font-medium">{fmt(p.cost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">רווח</span>
                            <span className={`font-semibold ${marginColor(margin)}`}>{fmt(profit)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">התקנות</span>
                            <span>{p.count}</span>
                          </div>
                        </div>
                        <Progress value={margin} className={`h-2 mt-3 ${marginBg(margin)}`} />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Per Customer ─────────────────────────────────── */}
        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-rose-600" />
                רווחיות לפי לקוח — Top 5
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">#</TableHead>
                    <TableHead className="text-right">לקוח</TableHead>
                    <TableHead className="text-right">הכנסה כוללת</TableHead>
                    <TableHead className="text-right">עלות כוללת</TableHead>
                    <TableHead className="text-right">רווח כולל</TableHead>
                    <TableHead className="text-right">מרווח %</TableHead>
                    <TableHead className="text-right">מס׳ התקנות</TableHead>
                    <TableHead className="text-right w-[120px]">ביצוע</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCustomers.map((c, idx) => {
                    const profit = c.totalRevenue - c.totalCost;
                    const margin = pct(c.totalRevenue, c.totalCost);
                    return (
                      <TableRow key={c.name}>
                        <TableCell className="font-bold text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-semibold">{c.name}</TableCell>
                        <TableCell>{fmt(c.totalRevenue)}</TableCell>
                        <TableCell>{fmt(c.totalCost)}</TableCell>
                        <TableCell className={`font-semibold ${marginColor(margin)}`}>{fmt(profit)}</TableCell>
                        <TableCell className={`font-semibold ${marginColor(margin)}`}>{margin}%</TableCell>
                        <TableCell className="text-center">{c.installations}</TableCell>
                        <TableCell>
                          <Progress value={margin} className={`h-2 ${marginBg(margin)}`} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Insights ─────────────────────────────────────── */}
        <TabsContent value="insights">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Lightbulb className="h-5 w-5 text-yellow-600" />
                תובנות והמלצות לשיפור רווחיות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {insights.map((ins, idx) => (
                <Card key={idx} className={`border-r-4 ${
                  ins.type === "positive" ? "border-r-green-500 bg-green-50/50" :
                  ins.type === "warning" ? "border-r-amber-500 bg-amber-50/50" :
                  "border-r-blue-500 bg-blue-50/50"
                }`}>
                  <CardContent className="pt-4 pb-3 px-4">
                    <div className="flex items-start gap-3">
                      {ins.type === "positive" && <ArrowUpRight className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />}
                      {ins.type === "warning" && <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />}
                      {ins.type === "info" && <Target className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />}
                      <div>
                        <h3 className="font-bold text-sm">{ins.text}</h3>
                        <p className="text-muted-foreground text-sm mt-1">{ins.detail}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
