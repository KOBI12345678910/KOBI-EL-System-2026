import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign, TrendingUp, Receipt, Banknote, CreditCard,
  FileText, AlertTriangle, Search, BarChart3, ArrowUpLeft, ArrowDownRight,
  Clock, CheckCircle, Wallet, PiggyBank, Filter
} from "lucide-react";

const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtCurrency = (n: number) => "\u20AA" + new Intl.NumberFormat("he-IL").format(n);
const fmtPct = (n: number) => n.toFixed(1) + "%";

const kpis = {
  totalContractValue: 47850000,
  totalActualCosts: 31420000,
  overallGrossMargin: 34.3,
  invoicedTotal: 29600000,
  collectedTotal: 24150000,
  cashGap: 5450000,
  changeOrdersValue: 2870000,
  overdueCollections: 3280000,
};

const projectsPnL = [
  { id: "PRJ-001", name: "מגדל מגורים — קריית אתא", customer: "נדל\"ן פלוס בע\"מ", revenue: 8200000, costs: 5740000, margin: 30.0, budgetVariance: -2.1, status: "active" },
  { id: "PRJ-002", name: "חזית זכוכית — מגדל עזריאלי", customer: "עזריאלי קבוצה", revenue: 6400000, costs: 3840000, margin: 40.0, budgetVariance: 1.5, status: "active" },
  { id: "PRJ-003", name: "חלונות אלומיניום — שיכון דירות", customer: "שיכון ובינוי", revenue: 3200000, costs: 2560000, margin: 20.0, budgetVariance: -8.4, status: "at_risk" },
  { id: "PRJ-004", name: "מערכת מסגרות — קניון הצפון", customer: "ביג מרכזי קניות", revenue: 4500000, costs: 2925000, margin: 35.0, budgetVariance: 0.8, status: "active" },
  { id: "PRJ-005", name: "דלתות וחלונות — פרויקט יוקרה", customer: "אפריקה ישראל", revenue: 5600000, costs: 3920000, margin: 30.0, budgetVariance: -3.2, status: "active" },
  { id: "PRJ-006", name: "מעקות זכוכית — מלון חוף", customer: "רשת פתאל", revenue: 2100000, costs: 1260000, margin: 40.0, budgetVariance: 2.3, status: "completed" },
  { id: "PRJ-007", name: "חיפוי אלומיניום — בניין משרדים", customer: "הראל ביטוח", revenue: 5800000, costs: 4060000, margin: 30.0, budgetVariance: -1.0, status: "active" },
  { id: "PRJ-008", name: "תריסים חשמליים — שכונת הפארק", customer: "דניה סיבוס", revenue: 3400000, costs: 2380000, margin: 30.0, budgetVariance: 0.2, status: "active" },
  { id: "PRJ-009", name: "ויטרינות זכוכית — מרכז מסחרי", customer: "עמינח נכסים", revenue: 4200000, costs: 2940000, margin: 30.0, budgetVariance: -5.6, status: "at_risk" },
  { id: "PRJ-010", name: "פרגולות אלומיניום — מתחם ספורט", customer: "עיריית חיפה", revenue: 4450000, costs: 2670000, margin: 40.0, budgetVariance: 3.1, status: "active" },
];

const invoices = [
  { id: "INV-2601", project: "PRJ-001", customer: "נדל\"ן פלוס בע\"מ", amount: 820000, issueDate: "2026-01-15", dueDate: "2026-02-15", status: "paid" },
  { id: "INV-2602", project: "PRJ-002", customer: "עזריאלי קבוצה", amount: 1280000, issueDate: "2026-01-28", dueDate: "2026-03-01", status: "paid" },
  { id: "INV-2603", project: "PRJ-003", customer: "שיכון ובינוי", amount: 640000, issueDate: "2026-02-10", dueDate: "2026-03-10", status: "overdue" },
  { id: "INV-2604", project: "PRJ-004", customer: "ביג מרכזי קניות", amount: 1125000, issueDate: "2026-02-15", dueDate: "2026-03-15", status: "paid" },
  { id: "INV-2605", project: "PRJ-005", customer: "אפריקה ישראל", amount: 1400000, issueDate: "2026-02-20", dueDate: "2026-03-20", status: "overdue" },
  { id: "INV-2606", project: "PRJ-001", customer: "נדל\"ן פלוס בע\"מ", amount: 1640000, issueDate: "2026-03-01", dueDate: "2026-04-01", status: "partial" },
  { id: "INV-2607", project: "PRJ-007", customer: "הראל ביטוח", amount: 1160000, issueDate: "2026-03-05", dueDate: "2026-04-05", status: "overdue" },
  { id: "INV-2608", project: "PRJ-008", customer: "דניה סיבוס", amount: 680000, issueDate: "2026-03-10", dueDate: "2026-04-10", status: "sent" },
  { id: "INV-2609", project: "PRJ-009", customer: "עמינח נכסים", amount: 840000, issueDate: "2026-03-18", dueDate: "2026-04-18", status: "sent" },
  { id: "INV-2610", project: "PRJ-010", customer: "עיריית חיפה", amount: 890000, issueDate: "2026-03-22", dueDate: "2026-04-22", status: "draft" },
  { id: "INV-2611", project: "PRJ-002", customer: "עזריאלי קבוצה", amount: 960000, issueDate: "2026-03-25", dueDate: "2026-04-25", status: "draft" },
  { id: "INV-2612", project: "PRJ-005", customer: "אפריקה ישראל", amount: 1120000, issueDate: "2026-04-01", dueDate: "2026-05-01", status: "draft" },
];

const collections = [
  { aging: "שוטף (0-30 יום)", amount: 2570000, count: 4, pct: 32.1 },
  { aging: "30-60 יום", amount: 2040000, count: 3, pct: 25.5 },
  { aging: "60-90 יום", amount: 1640000, count: 2, pct: 20.5 },
  { aging: "90-120 יום", amount: 1080000, count: 2, pct: 13.5 },
  { aging: "מעל 120 יום", amount: 670000, count: 1, pct: 8.4 },
];

const collectionsByProject = [
  { project: "PRJ-001", name: "מגדל מגורים — קריית אתא", invoiced: 2460000, collected: 1820000, outstanding: 640000, lastPayment: "2026-03-12" },
  { project: "PRJ-002", name: "חזית זכוכית — מגדל עזריאלי", invoiced: 2240000, collected: 2240000, outstanding: 0, lastPayment: "2026-03-18" },
  { project: "PRJ-003", name: "חלונות אלומיניום — שיכון דירות", invoiced: 1280000, collected: 640000, outstanding: 640000, lastPayment: "2026-02-20" },
  { project: "PRJ-005", name: "דלתות וחלונות — פרויקט יוקרה", invoiced: 2520000, collected: 1120000, outstanding: 1400000, lastPayment: "2026-01-30" },
  { project: "PRJ-007", name: "חיפוי אלומיניום — בניין משרדים", invoiced: 1160000, collected: 0, outstanding: 1160000, lastPayment: "—" },
  { project: "PRJ-004", name: "מערכת מסגרות — קניון הצפון", invoiced: 2250000, collected: 2250000, outstanding: 0, lastPayment: "2026-03-25" },
];

const budgetCategories = [
  { category: "חומרי גלם (אלומיניום/זכוכית/מתכת)", budget: 12800000, actual: 13120000, variance: -320000, pct: 102.5 },
  { category: "עבודה ישירה", budget: 7200000, actual: 6840000, variance: 360000, pct: 95.0 },
  { category: "קבלני משנה", budget: 5400000, actual: 5940000, variance: -540000, pct: 110.0 },
  { category: "הובלה ולוגיסטיקה", budget: 1800000, actual: 1710000, variance: 90000, pct: 95.0 },
  { category: "התקנה באתר", budget: 3200000, actual: 2880000, variance: 320000, pct: 90.0 },
  { category: "תקורה ועקיפות", budget: 2100000, actual: 2310000, variance: -210000, pct: 110.0 },
];

const invoiceStatusBadge = (s: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "שולם", cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
    partial: { label: "שולם חלקית", cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
    sent: { label: "נשלח", cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
    overdue: { label: "באיחור", cls: "bg-red-500/20 text-red-400 border-red-500/30" },
    draft: { label: "טיוטה", cls: "bg-slate-500/20 text-slate-400 border-slate-500/30" },
  };
  const m = map[s] || { label: s, cls: "bg-slate-500/20 text-slate-400 border-slate-500/30" };
  return <Badge className={`${m.cls} border text-xs`}>{m.label}</Badge>;
};

const projectStatusBadge = (s: string) => {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "פעיל", cls: "bg-emerald-500/20 text-emerald-400" },
    at_risk: { label: "בסיכון", cls: "bg-red-500/20 text-red-400" },
    completed: { label: "הושלם", cls: "bg-blue-500/20 text-blue-400" },
  };
  const m = map[s] || { label: s, cls: "bg-slate-500/20 text-slate-400" };
  return <Badge className={`${m.cls} text-xs`}>{m.label}</Badge>;
};

const varianceColor = (v: number) => v >= 0 ? "text-emerald-400" : "text-red-400";
const varianceIcon = (v: number) => v >= 0
  ? <ArrowUpLeft className="w-3 h-3 text-emerald-400 inline" />
  : <ArrowDownRight className="w-3 h-3 text-red-400 inline" />;

export default function ProjectFinanceHub() {
  const [search, setSearch] = useState("");
  const [invFilter, setInvFilter] = useState("all");

  const totalBudget = budgetCategories.reduce((s, c) => s + c.budget, 0);
  const totalActual = budgetCategories.reduce((s, c) => s + c.actual, 0);
  const totalVariance = totalBudget - totalActual;

  const filteredProjects = projectsPnL.filter(p =>
    p.name.includes(search) || p.customer.includes(search) || p.id.includes(search)
  );

  const filteredInvoices = invoices.filter(inv =>
    (invFilter === "all" || inv.status === invFilter) &&
    (inv.id.includes(search) || inv.customer.includes(search) || inv.project.includes(search))
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <DollarSign className="w-7 h-7 text-green-400" />
            מרכז פיננסי חוצה-פרויקטים
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            ניהול רווחיות, חשבוניות, גבייה ותקציבים — טכנו-כל עוזי
          </p>
        </div>
        <Badge className="bg-green-500/20 text-green-400 text-xs border border-green-500/30">
          אפריל 2026
        </Badge>
      </div>

      {/* 8 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: "סה\"כ חוזים", value: fmtCurrency(kpis.totalContractValue), icon: FileText, color: "text-blue-400" },
          { label: "עלויות בפועל", value: fmtCurrency(kpis.totalActualCosts), icon: Wallet, color: "text-orange-400" },
          { label: "רווח גולמי", value: fmtPct(kpis.overallGrossMargin), icon: TrendingUp, color: "text-emerald-400" },
          { label: "חשבוניות שהופקו", value: fmtCurrency(kpis.invoicedTotal), icon: Receipt, color: "text-purple-400" },
          { label: "גבייה בפועל", value: fmtCurrency(kpis.collectedTotal), icon: Banknote, color: "text-green-400" },
          { label: "פער מזומן", value: fmtCurrency(kpis.cashGap), icon: CreditCard, color: "text-amber-400" },
          { label: "שינויי הזמנה", value: fmtCurrency(kpis.changeOrdersValue), icon: PiggyBank, color: "text-cyan-400" },
          { label: "גבייה באיחור", value: fmtCurrency(kpis.overdueCollections), icon: AlertTriangle, color: "text-red-400" },
        ].map((kpi, i) => (
          <Card key={i} className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-3 text-center">
              <kpi.icon className={`w-5 h-5 mx-auto mb-1 ${kpi.color}`} />
              <div className={`text-sm font-bold ${kpi.color} truncate`}>{kpi.value}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="חיפוש פרויקט, לקוח, חשבונית..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-10 bg-slate-800/50 border-slate-700 text-white"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pnl" className="space-y-4">
        <TabsList className="bg-slate-800/50 border border-slate-700">
          <TabsTrigger value="pnl" className="text-xs">רווח והפסד לפרויקט</TabsTrigger>
          <TabsTrigger value="invoicing" className="text-xs">חשבוניות</TabsTrigger>
          <TabsTrigger value="collections" className="text-xs">גבייה</TabsTrigger>
          <TabsTrigger value="budget" className="text-xs">ניתוח תקציבי</TabsTrigger>
        </TabsList>

        {/* Tab 1: P&L by Project */}
        <TabsContent value="pnl" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                רווח והפסד לפי פרויקט
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="text-right py-2 px-2 font-medium">מזהה</th>
                      <th className="text-right py-2 px-2 font-medium">פרויקט</th>
                      <th className="text-right py-2 px-2 font-medium">לקוח</th>
                      <th className="text-right py-2 px-2 font-medium">הכנסות</th>
                      <th className="text-right py-2 px-2 font-medium">עלויות</th>
                      <th className="text-right py-2 px-2 font-medium">רווח גולמי %</th>
                      <th className="text-right py-2 px-2 font-medium">סטייה מתקציב</th>
                      <th className="text-right py-2 px-2 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProjects.map(p => (
                      <tr key={p.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                        <td className="py-2.5 px-2 text-slate-400 font-mono text-xs">{p.id}</td>
                        <td className="py-2.5 px-2 text-white font-medium">{p.name}</td>
                        <td className="py-2.5 px-2 text-slate-300">{p.customer}</td>
                        <td className="py-2.5 px-2 text-emerald-400 font-medium">{fmtCurrency(p.revenue)}</td>
                        <td className="py-2.5 px-2 text-orange-400">{fmtCurrency(p.costs)}</td>
                        <td className="py-2.5 px-2">
                          <span className={p.margin >= 30 ? "text-emerald-400" : p.margin >= 20 ? "text-amber-400" : "text-red-400"}>
                            {fmtPct(p.margin)}
                          </span>
                        </td>
                        <td className="py-2.5 px-2">
                          <span className={varianceColor(p.budgetVariance)}>
                            {varianceIcon(p.budgetVariance)} {p.budgetVariance > 0 ? "+" : ""}{fmtPct(p.budgetVariance)}
                          </span>
                        </td>
                        <td className="py-2.5 px-2">{projectStatusBadge(p.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Summary Row */}
              <div className="flex items-center gap-6 mt-4 pt-3 border-t border-slate-700 text-sm">
                <span className="text-slate-400">סה"כ:</span>
                <span className="text-emerald-400 font-bold">הכנסות {fmtCurrency(projectsPnL.reduce((s, p) => s + p.revenue, 0))}</span>
                <span className="text-orange-400 font-bold">עלויות {fmtCurrency(projectsPnL.reduce((s, p) => s + p.costs, 0))}</span>
                <span className="text-white font-bold">
                  רווח גולמי {fmtCurrency(projectsPnL.reduce((s, p) => s + p.revenue - p.costs, 0))}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Invoicing */}
        <TabsContent value="invoicing" className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-slate-400" />
            {[
              { key: "all", label: "הכל" },
              { key: "paid", label: "שולם" },
              { key: "partial", label: "חלקי" },
              { key: "sent", label: "נשלח" },
              { key: "overdue", label: "באיחור" },
              { key: "draft", label: "טיוטה" },
            ].map(f => (
              <Button
                key={f.key}
                size="sm"
                variant={invFilter === f.key ? "default" : "outline"}
                onClick={() => setInvFilter(f.key)}
                className="text-xs h-7"
              >
                {f.label}
              </Button>
            ))}
          </div>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-purple-400" />
                חשבוניות ({filteredInvoices.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="text-right py-2 px-2 font-medium">מס׳ חשבונית</th>
                      <th className="text-right py-2 px-2 font-medium">פרויקט</th>
                      <th className="text-right py-2 px-2 font-medium">לקוח</th>
                      <th className="text-right py-2 px-2 font-medium">סכום</th>
                      <th className="text-right py-2 px-2 font-medium">תאריך הפקה</th>
                      <th className="text-right py-2 px-2 font-medium">תאריך תשלום</th>
                      <th className="text-right py-2 px-2 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.map(inv => (
                      <tr key={inv.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                        <td className="py-2.5 px-2 text-slate-300 font-mono text-xs">{inv.id}</td>
                        <td className="py-2.5 px-2 text-slate-400 text-xs">{inv.project}</td>
                        <td className="py-2.5 px-2 text-white">{inv.customer}</td>
                        <td className="py-2.5 px-2 text-purple-400 font-medium">{fmtCurrency(inv.amount)}</td>
                        <td className="py-2.5 px-2 text-slate-400">{inv.issueDate}</td>
                        <td className="py-2.5 px-2 text-slate-400">{inv.dueDate}</td>
                        <td className="py-2.5 px-2">{invoiceStatusBadge(inv.status)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-6 mt-4 pt-3 border-t border-slate-700 text-sm flex-wrap">
                {[
                  { label: "סה\"כ", val: fmtCurrency(invoices.reduce((s, i) => s + i.amount, 0)), cls: "text-white" },
                  { label: "שולם", val: fmtCurrency(invoices.filter(i => i.status === "paid").reduce((s, i) => s + i.amount, 0)), cls: "text-emerald-400" },
                  { label: "ממתין", val: fmtCurrency(invoices.filter(i => ["sent", "partial"].includes(i.status)).reduce((s, i) => s + i.amount, 0)), cls: "text-amber-400" },
                  { label: "באיחור", val: fmtCurrency(invoices.filter(i => i.status === "overdue").reduce((s, i) => s + i.amount, 0)), cls: "text-red-400" },
                ].map((x, i) => (
                  <span key={i} className="text-slate-400">{x.label}: <span className={`font-bold ${x.cls}`}>{x.val}</span></span>
                ))}</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Collections */}
        <TabsContent value="collections" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Aging Analysis */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  ניתוח גיול חובות (Aging)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {collections.map((c, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-300">{c.aging}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 text-xs">{c.count} חשבוניות</span>
                        <span className={`font-medium ${i <= 1 ? "text-emerald-400" : i <= 2 ? "text-amber-400" : "text-red-400"}`}>
                          {fmtCurrency(c.amount)}
                        </span>
                      </div>
                    </div>
                    <Progress
                      value={c.pct}
                      className={`h-2 ${i <= 1 ? "[&>div]:bg-emerald-500" : i <= 2 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`}
                    />
                  </div>
                ))}
                <div className="flex items-center justify-between pt-3 border-t border-slate-700 text-sm">
                  <span className="text-white font-medium">סה"כ חוב פתוח</span>
                  <span className="text-white font-bold">{fmtCurrency(collections.reduce((s, c) => s + c.amount, 0))}</span>
                </div>
              </CardContent>
            </Card>

            {/* Collections by Project */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-green-400" />
                  מעקב גבייה לפי פרויקט
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {collectionsByProject.map((cp, i) => {
                  const rate = cp.invoiced > 0 ? (cp.collected / cp.invoiced) * 100 : 0;
                  return (
                    <div key={i} className="p-2.5 rounded-lg border border-slate-700/50 bg-slate-900/30 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-white font-medium">{cp.name}</span>
                        {cp.outstanding === 0
                          ? <Badge className="bg-emerald-500/20 text-emerald-400 text-xs border border-emerald-500/30">נגבה</Badge>
                          : <span className="text-red-400 text-xs font-medium">{fmtCurrency(cp.outstanding)} פתוח</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={rate} className="flex-1 h-1.5" />
                        <span className="text-xs text-slate-400 w-10 text-left">{rate.toFixed(0)}%</span>
                      </div>
                      <div className="flex gap-4 text-xs text-slate-500">
                        <span>חשבוניות: {fmtCurrency(cp.invoiced)}</span>
                        <span>נגבה: {fmtCurrency(cp.collected)}</span>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="py-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "אחוז גבייה כולל", value: "81.6%", sub: "מתוך סה\"כ חשבוניות", cls: "text-emerald-400" },
                  { label: "DSO ממוצע", value: "47 ימים", sub: "יעד: 30 ימים", cls: "text-amber-400" },
                  { label: "חובות מסופקים", value: fmtCurrency(670000), sub: "מעל 120 יום", cls: "text-red-400" },
                  { label: "צפי גבייה החודש", value: fmtCurrency(3200000), sub: "על בסיס מועדי תשלום", cls: "text-blue-400" },
                ].map((k, i) => (
                  <div key={i} className="text-center p-2 rounded-lg bg-slate-900/30">
                    <div className="text-xs text-slate-400">{k.label}</div>
                    <div className={`text-xl font-bold ${k.cls}`}>{k.value}</div>
                    <div className="text-[10px] text-slate-500">{k.sub}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Budget Analysis */}
        <TabsContent value="budget" className="space-y-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-cyan-400" />
                ניתוח תקציב מול ביצוע לפי קטגוריית עלות
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {budgetCategories.map((cat, i) => {
                const over = cat.actual > cat.budget;
                return (
                  <div key={i} className="space-y-1.5 p-2.5 rounded-lg border border-slate-700/50 bg-slate-900/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white font-medium">{cat.category}</span>
                      <Badge className={`text-xs border ${over ? "bg-red-500/20 text-red-400 border-red-500/30" : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"}`}>
                        {over ? "חריגה" : "בתקציב"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-700/50 rounded-full h-2.5 overflow-hidden">
                        <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(cat.pct, 100)}%` }} />
                      </div>
                      <span className={`text-xs font-medium w-12 text-left ${over ? "text-red-400" : "text-emerald-400"}`}>{fmtPct(cat.pct)}</span>
                    </div>
                    <div className="flex gap-4 text-xs text-slate-400">
                      <span>תקציב: {fmtCurrency(cat.budget)}</span>
                      <span>בפועל: {fmtCurrency(cat.actual)}</span>
                      <span className={varianceColor(cat.variance)}>סטייה: {cat.variance > 0 ? "+" : ""}{fmtCurrency(Math.abs(cat.variance))}</span>
                    </div>
                  </div>
                );
              })}

              <div className="flex items-center gap-6 pt-4 border-t border-slate-700 text-sm flex-wrap">
                <span className="text-slate-400">תקציב: <span className="font-bold text-white">{fmtCurrency(totalBudget)}</span></span>
                <span className="text-slate-400">בפועל: <span className={`font-bold ${totalActual > totalBudget ? "text-red-400" : "text-emerald-400"}`}>{fmtCurrency(totalActual)}</span></span>
                <span className={`font-bold ${varianceColor(totalVariance)}`}>
                  סטייה: {totalVariance > 0 ? "+" : ""}{fmtCurrency(Math.abs(totalVariance))} ({totalVariance >= 0 ? "חיסכון" : "חריגה"})
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-3 border-t border-slate-700/50">
                {budgetCategories.map((cat, i) => {
                  const catPct = ((cat.actual / totalActual) * 100).toFixed(1);
                  const colors = ["bg-blue-500","bg-emerald-500","bg-orange-500","bg-purple-500","bg-cyan-500","bg-rose-500"];
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <div className={`w-2.5 h-2.5 rounded-full ${colors[i]}`} />
                      <span className="text-xs text-slate-400 truncate">{cat.category} — {catPct}%</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}