import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, DollarSign, Users, Target, BarChart3,
  ArrowUpRight, ArrowDownRight, ShoppingCart, FileText, Clock,
  CheckCircle, XCircle, Percent, Award, Zap, ChevronRight
} from "lucide-react";
import { useLocation } from "wouter";

// ============================================================
// SALES KPIs
// ============================================================
const kpis = {
  revenueYTD: 14850000,
  revenueTarget: 18000000,
  revenuePrevYear: 12200000,
  ordersThisMonth: 42,
  avgOrderValue: 85000,
  conversionRate: 34.2,
  quotesOpen: 28,
  quotesValue: 3200000,
  pipelineValue: 8500000,
  winRate: 38,
  lostRate: 22,
  avgDealCycle: 28,
  newCustomersYTD: 18,
  churnRate: 4.2,
  nps: 72,
  repeatRate: 65,
};

const FALLBACK_PIPELINE_STAGES = [
  { stage: "ליד חדש", count: 45, value: 2200000, color: "bg-gray-400", pct: 10 },
  { stage: "פגישה ראשונה", count: 28, value: 1800000, color: "bg-blue-400", pct: 20 },
  { stage: "הצעת מחיר", count: 22, value: 1500000, color: "bg-indigo-400", pct: 40 },
  { stage: "משא ומתן", count: 15, value: 1800000, color: "bg-purple-400", pct: 60 },
  { stage: "אישור סופי", count: 8, value: 1200000, color: "bg-amber-400", pct: 80 },
  { stage: "נסגר ✓", count: 12, value: 2100000, color: "bg-emerald-500", pct: 100 },
];

const FALLBACK_TOP_DEALS = [
  { name: "פרויקט מגדל A - שלב ב'", customer: "קבוצת אלון", value: 850000, stage: "משא ומתן", probability: 65, closeDate: "2026-05-15", owner: "דני כהן" },
  { name: "חיפוי מגורים רמת גן", customer: "שיכון ובינוי", value: 620000, stage: "הצעת מחיר", probability: 40, closeDate: "2026-06-01", owner: "מיכל לוי" },
  { name: "משרדי hi-tech הרצליה", customer: "אמות השקעות", value: 480000, stage: "אישור סופי", probability: 85, closeDate: "2026-04-20", owner: "דני כהן" },
  { name: "בית ספר חולון - שיפוץ", customer: "עיריית חולון", value: 320000, stage: "פגישה ראשונה", probability: 25, closeDate: "2026-07-01", owner: "יוסי אברהם" },
  { name: "מפעל אור יהודה", customer: "תעשיות ORT", value: 290000, stage: "הצעת מחיר", probability: 50, closeDate: "2026-05-30", owner: "מיכל לוי" },
];

const FALLBACK_RECENT_ORDERS = [
  { number: "SO-002456", customer: "קבוצת שיכון ובינוי", date: "2026-04-08", amount: 145000, status: "confirmed" },
  { number: "SO-002455", customer: "חברת אלומיניום ישראל", date: "2026-04-07", amount: 85000, status: "in_progress" },
  { number: "SO-002454", customer: "עיריית חיפה", date: "2026-04-06", amount: 95000, status: "shipped" },
  { number: "SO-002453", customer: "אמות השקעות", date: "2026-04-05", amount: 210000, status: "confirmed" },
  { number: "SO-002452", customer: 'נדל"ן פלוס', date: "2026-04-04", amount: 68000, status: "delivered" },
];

const FALLBACK_SALES_TEAM = [
  { name: "דני כהן", quota: 5000000, actual: 3800000, deals: 18, winRate: 42, avgDeal: 211000 },
  { name: "מיכל לוי", quota: 4500000, actual: 3200000, deals: 22, winRate: 36, avgDeal: 145000 },
  { name: "יוסי אברהם", quota: 3500000, actual: 2100000, deals: 14, winRate: 35, avgDeal: 150000 },
];

const fmt = (v: number) => v >= 1000000 ? `₪${(v / 1000000).toFixed(1)}M` : `₪${(v / 1000).toFixed(0)}K`;

export default function SalesDashboard() {
  const { data: salesdashboardData } = useQuery({
    queryKey: ["sales-dashboard"],
    queryFn: () => authFetch("/api/sales/sales_dashboard"),
    staleTime: 5 * 60 * 1000,
  });

  const pipelineStages = salesdashboardData ?? FALLBACK_PIPELINE_STAGES;

  const [, navigate] = useLocation();
  const [period, setPeriod] = useState("ytd");

  const revenueProgress = (kpis.revenueYTD / kpis.revenueTarget) * 100;
  const revenueGrowth = ((kpis.revenueYTD - kpis.revenuePrevYear) / kpis.revenuePrevYear) * 100;
  const weightedPipeline = pipelineStages.reduce((s, st) => s + st.value * (st.pct / 100), 0);

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-primary" /> דשבורד מכירות
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Pipeline | ביצוע מול יעד | צוות | הזמנות | לקוחות</p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="this_month">חודש נוכחי</SelectItem>
              <SelectItem value="this_quarter">רבעון</SelectItem>
              <SelectItem value="ytd">מתחילת השנה</SelectItem>
              <SelectItem value="last_12m">12 חודשים</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => navigate("/sales/quotations")}>הצעות מחיר</Button>
          <Button variant="outline" onClick={() => navigate("/sales/sales-orders")}>הזמנות</Button>
        </div>
      </div>

      {/* Revenue Target */}
      <Card className="border-primary/20">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm text-muted-foreground">הכנסות מצטבר vs יעד</p>
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-3xl font-bold font-mono">{fmt(kpis.revenueYTD)}</span>
                <span className="text-muted-foreground">מתוך {fmt(kpis.revenueTarget)}</span>
                <Badge className={`${revenueGrowth > 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                  {revenueGrowth > 0 ? <ArrowUpRight className="h-3 w-3 ml-0.5" /> : <ArrowDownRight className="h-3 w-3 ml-0.5" />}
                  {revenueGrowth.toFixed(1)}% YoY
                </Badge>
              </div>
            </div>
            <div className="text-left">
              <p className="text-4xl font-bold font-mono text-primary">{revenueProgress.toFixed(0)}%</p>
              <p className="text-[10px] text-muted-foreground">מהיעד השנתי</p>
            </div>
          </div>
          <Progress value={revenueProgress} className="h-3" />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>₪0</span>
            <span>חסר: {fmt(kpis.revenueTarget - kpis.revenueYTD)}</span>
            <span>{fmt(kpis.revenueTarget)}</span>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "הזמנות החודש", value: String(kpis.ordersThisMonth), icon: FileText, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
          { label: "ממוצע הזמנה", value: fmt(kpis.avgOrderValue), icon: DollarSign, color: "text-green-600", bg: "bg-green-50", border: "border-green-200" },
          { label: "שיעור המרה", value: `${kpis.conversionRate}%`, icon: Percent, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
          { label: "Win Rate", value: `${kpis.winRate}%`, icon: Award, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
          { label: "מחזור Deal ממוצע", value: `${kpis.avgDealCycle} ימים`, icon: Clock, color: "text-indigo-600", bg: "bg-indigo-50", border: "border-indigo-200" },
          { label: "NPS", value: String(kpis.nps), icon: Target, color: "text-teal-600", bg: "bg-teal-50", border: "border-teal-200" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.border} ${kpi.bg}/30`}>
              <CardContent className="pt-3 pb-2 text-center">
                <Icon className={`h-5 w-5 mx-auto ${kpi.color} mb-1`} />
                <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-bold font-mono">{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pipeline Funnel */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Sales Pipeline</CardTitle>
            <div className="text-left">
              <span className="text-sm text-muted-foreground">Pipeline כולל: </span>
              <span className="font-bold font-mono">{fmt(kpis.pipelineValue)}</span>
              <span className="text-muted-foreground mx-2">|</span>
              <span className="text-sm text-muted-foreground">Weighted: </span>
              <span className="font-bold font-mono text-emerald-600">{fmt(weightedPipeline)}</span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Funnel visualization */}
          <div className="space-y-2">
            {pipelineStages.map((stage, i) => {
              const width = 100 - (i * 12);
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-left">{stage.stage}</div>
                  <div className="flex-1 relative h-8">
                    <div
                      className={`h-full ${stage.color} rounded flex items-center justify-between px-3 text-white text-xs font-medium transition-all`}
                      style={{ width: `${width}%` }}
                    >
                      <span>{stage.count} deals</span>
                      <span className="font-mono">{fmt(stage.value)}</span>
                    </div>
                  </div>
                  <div className="w-12 text-[10px] text-muted-foreground text-left">{stage.pct}%</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        {/* Top Deals */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">עסקאות מובילות</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/sales/crm-pipeline")} className="text-xs">
                Pipeline מלא <ChevronRight className="h-3 w-3 mr-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-right text-[10px]">עסקה</TableHead>
                  <TableHead className="text-right text-[10px]">ערך</TableHead>
                  <TableHead className="text-right text-[10px]">שלב</TableHead>
                  <TableHead className="text-right text-[10px]">סיכוי</TableHead>
                  <TableHead className="text-right text-[10px]">סגירה</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topDeals.map((deal, i) => (
                  <TableRow key={i} className="hover:bg-muted/10">
                    <TableCell>
                      <div>
                        <p className="text-xs font-medium">{deal.name}</p>
                        <p className="text-[10px] text-muted-foreground">{deal.customer}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs font-bold">{fmt(deal.value)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[9px]">{deal.stage}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Progress value={deal.probability} className="h-1.5 w-10" />
                        <span className="text-[10px] font-mono">{deal.probability}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{deal.closeDate}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent Orders */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">הזמנות אחרונות</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate("/sales/sales-orders")} className="text-xs">
                כל ההזמנות <ChevronRight className="h-3 w-3 mr-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-right text-[10px]">מספר</TableHead>
                  <TableHead className="text-right text-[10px]">לקוח</TableHead>
                  <TableHead className="text-right text-[10px]">סכום</TableHead>
                  <TableHead className="text-right text-[10px]">סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentOrders.map((order, i) => (
                  <TableRow key={i} className="hover:bg-muted/10">
                    <TableCell className="font-mono text-[10px]">{order.number}</TableCell>
                    <TableCell className="text-xs">{order.customer}</TableCell>
                    <TableCell className="font-mono text-xs font-bold">{fmt(order.amount)}</TableCell>
                    <TableCell>
                      <Badge className={`text-[9px] ${
                        order.status === "delivered" ? "bg-emerald-100 text-emerald-700" :
                        order.status === "shipped" ? "bg-blue-100 text-blue-700" :
                        order.status === "in_progress" ? "bg-amber-100 text-amber-700" :
                        "bg-purple-100 text-purple-700"
                      }`}>
                        {order.status === "delivered" ? "נמסר" : order.status === "shipped" ? "נשלח" : order.status === "in_progress" ? "בעבודה" : "אושר"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Sales Team Performance */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> ביצועי צוות מכירות</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="text-right text-xs font-semibold">נציג</TableHead>
                <TableHead className="text-right text-xs font-semibold">יעד</TableHead>
                <TableHead className="text-right text-xs font-semibold">ביצוע</TableHead>
                <TableHead className="text-right text-xs font-semibold w-32">עמידה</TableHead>
                <TableHead className="text-right text-xs font-semibold">עסקאות</TableHead>
                <TableHead className="text-right text-xs font-semibold">Win Rate</TableHead>
                <TableHead className="text-right text-xs font-semibold">ממוצע עסקה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesTeam.map((rep, i) => {
                const progress = (rep.actual / rep.quota) * 100;
                return (
                  <TableRow key={i}>
                    <TableCell className="font-medium text-sm">{rep.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{fmt(rep.quota)}</TableCell>
                    <TableCell className="font-mono text-xs font-bold">{fmt(rep.actual)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={progress} className={`h-2 w-20 ${progress >= 80 ? "" : "[&>div]:bg-amber-500"}`} />
                        <span className={`text-xs font-mono font-bold ${progress >= 80 ? "text-emerald-600" : "text-amber-600"}`}>{progress.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{rep.deals}</TableCell>
                    <TableCell className="font-mono text-xs">{rep.winRate}%</TableCell>
                    <TableCell className="font-mono text-xs">{fmt(rep.avgDeal)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
