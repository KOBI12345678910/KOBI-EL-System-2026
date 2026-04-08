import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3,
  Search, Clock, ArrowUpDown, Target,
} from "lucide-react";

/* ── helpers ────────────────────────────────────────────────────── */
const ils = (v: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const pctAbs = (v: number) => `${v.toFixed(1)}%`;

/* ── project data ───────────────────────────────────────────────── */
const FALLBACK_PROJECTS = [
  { id: "PRJ-2601", name: "מבנה תעשייתי - נתניה", revenue: 2800000, plannedCost: 1680000, actualCost: 1610000, savings: 70000,  increase: 0,      marginPlanned: 40.0, marginActual: 42.5 },
  { id: "PRJ-2602", name: "חזית אלומיניום - רמת גן", revenue: 1950000, plannedCost: 1170000, actualCost: 1230000, savings: 0,      increase: 60000,  marginPlanned: 40.0, marginActual: 36.9 },
  { id: "PRJ-2603", name: "מעקות נירוסטה - הרצליה", revenue: 680000,  plannedCost: 408000,  actualCost: 385000,  savings: 23000,  increase: 0,      marginPlanned: 40.0, marginActual: 43.4 },
  { id: "PRJ-2604", name: "פרגולות - כפר סבא", revenue: 520000,  plannedCost: 312000,  actualCost: 330000,  savings: 0,      increase: 18000,  marginPlanned: 40.0, marginActual: 36.5 },
  { id: "PRJ-2605", name: "דלתות אש - באר שבע", revenue: 1400000, plannedCost: 840000,  actualCost: 795000,  savings: 45000,  increase: 0,      marginPlanned: 40.0, marginActual: 43.2 },
  { id: "PRJ-2606", name: "קונסטרוקציה - אשדוד", revenue: 3200000, plannedCost: 1920000, actualCost: 2050000, savings: 0,      increase: 130000, marginPlanned: 40.0, marginActual: 35.9 },
  { id: "PRJ-2607", name: "ויטרינות חנויות - ת\"א", revenue: 450000,  plannedCost: 270000,  actualCost: 255000,  savings: 15000,  increase: 0,      marginPlanned: 40.0, marginActual: 43.3 },
  { id: "PRJ-2608", name: "גדרות מתכת - חולון", revenue: 380000,  plannedCost: 228000,  actualCost: 228000,  savings: 0,      increase: 0,      marginPlanned: 40.0, marginActual: 40.0 },
  { id: "PRJ-2609", name: "מדרגות ברזל - ראשל\"צ", revenue: 920000,  plannedCost: 552000,  actualCost: 510000,  savings: 42000,  increase: 0,      marginPlanned: 40.0, marginActual: 44.6 },
  { id: "PRJ-2610", name: "חיפוי אלומיניום - חיפה", revenue: 2100000, plannedCost: 1260000, actualCost: 1340000, savings: 0,      increase: 80000,  marginPlanned: 40.0, marginActual: 36.2 },
];

/* ================================================================ */
export default function ProcurementProfitImpact() {
  const { data: procurementprofitimpactData } = useQuery({
    queryKey: ["procurement-profit-impact"],
    queryFn: () => authFetch("/api/procurement/procurement_profit_impact"),
    staleTime: 5 * 60 * 1000,
  });

  const projects = procurementprofitimpactData ?? FALLBACK_PROJECTS;

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<string>("marginActual");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  /* KPI calculations */
  const totalRevenue = projects.reduce((s, p) => s + p.revenue, 0);
  const totalPlannedCost = projects.reduce((s, p) => s + p.plannedCost, 0);
  const totalActualCost = projects.reduce((s, p) => s + p.actualCost, 0);
  const totalSavings = projects.reduce((s, p) => s + p.savings, 0);
  const totalIncrease = projects.reduce((s, p) => s + p.increase, 0);
  const netImpact = totalSavings - totalIncrease;
  const marginPlanned = totalRevenue > 0 ? ((totalRevenue - totalPlannedCost) / totalRevenue) * 100 : 0;
  const marginActual = totalRevenue > 0 ? ((totalRevenue - totalActualCost) / totalRevenue) * 100 : 0;
  const marginDelta = marginActual - marginPlanned;

  const kpis = [
    { label: "חיסכון רכש", value: ils(totalSavings), icon: TrendingDown, color: "text-green-400", bg: "from-green-600 to-green-800" },
    { label: "עליית עלויות", value: ils(totalIncrease), icon: TrendingUp, color: "text-red-400", bg: "from-red-600 to-red-800" },
    { label: "השפעה נטו על רווח", value: ils(netImpact), icon: DollarSign, color: netImpact >= 0 ? "text-green-400" : "text-red-400", bg: netImpact >= 0 ? "from-emerald-600 to-emerald-800" : "from-red-600 to-red-800" },
    { label: "שינוי מרווח", value: pct(marginDelta), icon: Target, color: marginDelta >= 0 ? "text-green-400" : "text-red-400", bg: marginDelta >= 0 ? "from-blue-600 to-blue-800" : "from-orange-600 to-orange-800" },
  ];

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  /* filtered & sorted */
  const sl = search.toLowerCase();
  const filtered = useMemo(() => {
    let arr = [...projects];
    if (sl) arr = arr.filter(p => p.name.toLowerCase().includes(sl) || p.id.toLowerCase().includes(sl));
    arr.sort((a: any, b: any) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [sl, sortField, sortDir]);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-500/10">
            <TrendingUp className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">השפעת רכש על רווחיות</h1>
            <p className="text-sm text-muted-foreground">ניתוח השפעת עלויות רכש על מרווח הפרויקטים - טכנו-כל עוזי</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="bg-muted/50 border border-border rounded-lg pr-9 pl-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40 w-60"
            placeholder="חיפוש פרויקט..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-xl bg-gradient-to-br ${k.bg} p-4 border border-white/10`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-foreground/70">{k.label}</div>
                <div className="text-2xl font-bold text-foreground mt-1">{k.value}</div>
              </div>
              <k.icon className="w-8 h-8 text-foreground/30" />
            </div>
          </div>
        ))}
      </div>

      {/* Margin Summary Bar */}
      <Card className="bg-card border-border">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-foreground">סיכום מרווח כולל</h2>
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">מרווח מתוכנן</span>
              <div className="flex items-center gap-2">
                <Progress value={marginPlanned} className="h-3 flex-1 bg-muted/40" />
                <span className="text-lg font-bold text-foreground">{pctAbs(marginPlanned)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">מרווח בפועל</span>
              <div className="flex items-center gap-2">
                <Progress value={marginActual} className="h-3 flex-1 bg-muted/40" />
                <span className={`text-lg font-bold ${marginActual >= marginPlanned ? "text-green-400" : "text-red-400"}`}>{pctAbs(marginActual)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">הפרש</span>
              <div className="flex items-center gap-3">
                {marginDelta >= 0 ? <TrendingUp className="w-5 h-5 text-green-400" /> : <TrendingDown className="w-5 h-5 text-red-400" />}
                <span className={`text-lg font-bold ${marginDelta >= 0 ? "text-green-400" : "text-red-400"}`}>{pct(marginDelta)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Project Impact Table */}
      <Card className="bg-card border-border overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {[
                    { key: "id", label: "מס'" },
                    { key: "name", label: "פרויקט" },
                    { key: "revenue", label: "הכנסה" },
                    { key: "plannedCost", label: "עלות מתוכננת" },
                    { key: "actualCost", label: "עלות בפועל" },
                    { key: "savings", label: "חיסכון" },
                    { key: "increase", label: "עליית עלות" },
                    { key: "marginPlanned", label: "מרווח מתוכנן" },
                    { key: "marginActual", label: "מרווח בפועל" },
                  ].map(col => (
                    <TableHead
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="text-center text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap"
                    >
                      <div className="flex items-center justify-center gap-1">
                        {col.label}
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="text-center text-muted-foreground">השפעה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const delta = p.marginActual - p.marginPlanned;
                  const impact = delta >= 1 ? "חיובי" : delta <= -1 ? "שלילי" : "נייטרלי";
                  const impactColor: Record<string, string> = {
                    "חיובי": "bg-green-500/20 text-green-400",
                    "שלילי": "bg-red-500/20 text-red-400",
                    "נייטרלי": "bg-gray-500/20 text-gray-400",
                  };
                  return (
                    <TableRow key={p.id} className={`border-border hover:bg-muted/30 ${delta <= -3 ? "bg-red-500/5" : delta >= 3 ? "bg-green-500/5" : ""}`}>
                      <TableCell className="font-mono font-semibold text-foreground text-center">{p.id}</TableCell>
                      <TableCell className="text-foreground font-medium">{p.name}</TableCell>
                      <TableCell className="text-center font-mono text-foreground">{ils(p.revenue)}</TableCell>
                      <TableCell className="text-center font-mono text-muted-foreground">{ils(p.plannedCost)}</TableCell>
                      <TableCell className={`text-center font-mono ${p.actualCost > p.plannedCost ? "text-red-400" : "text-green-400"}`}>{ils(p.actualCost)}</TableCell>
                      <TableCell className="text-center font-mono text-green-400">{p.savings > 0 ? ils(p.savings) : "—"}</TableCell>
                      <TableCell className="text-center font-mono text-red-400">{p.increase > 0 ? ils(p.increase) : "—"}</TableCell>
                      <TableCell className="text-center text-muted-foreground">{pctAbs(p.marginPlanned)}</TableCell>
                      <TableCell className={`text-center font-bold ${p.marginActual >= p.marginPlanned ? "text-green-400" : "text-red-400"}`}>{pctAbs(p.marginActual)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`${impactColor[impact]} border-0 text-xs`}>{impact}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        <span>עודכן: 08/04/2026 11:00</span>
        <span>|</span>
        <span>סה"כ הכנסות: {ils(totalRevenue)}</span>
        <span>|</span>
        <span>השפעה נטו: {ils(netImpact)}</span>
      </div>
    </div>
  );
}
