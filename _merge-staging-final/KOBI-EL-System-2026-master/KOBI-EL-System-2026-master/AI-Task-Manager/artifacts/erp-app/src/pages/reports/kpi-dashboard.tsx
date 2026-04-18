import { useState } from "react";
import { LoadingOverlay } from "@/components/ui/unified-states";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { LucideIcon } from "lucide-react";
import {
  Target, ChevronLeft, TrendingUp, TrendingDown, Minus, DollarSign,
  ShoppingCart, Users, BarChart3, ArrowUpRight, CreditCard,
  Wallet, FileText, Clock, AlertTriangle, PieChart as PieChartIcon,
  RefreshCw, Building2, ArrowDownRight,
  Download, Printer, Filter, Calendar, FileSpreadsheet,
  Factory, Gauge, Activity, CheckCircle2, XCircle,
  Receipt, AlertCircle,
  Boxes, CircleDot, Eye, FolderKanban, Truck, Zap, Trophy,
  Package, AlertOctagon, Plus, Star,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { authJson } from "@/lib/utils";
import { exportToExcel } from "@/lib/export-utils";

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

interface KpiMetric {
  value: number;
  change?: number;
  amount?: number;
  salaryCost?: number;
  drillDown?: string;
}

interface FinancialSubSection {
  outstanding?: number;
  overdueCount?: number;
  overdueAmount?: number;
  avgDaysOverdue?: number;
  dueThisWeek?: number;
}

interface BalanceSection {
  cash: number;
  receivables: number;
  payables: number;
  netPosition: number;
}

interface BudgetSection {
  budget: number;
  actual: number;
  utilization: number;
  remaining: number;
}

interface SalesTrendRow {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

interface ExpenseBreakdownRow {
  name: string;
  value: number;
}

interface CashFlowRow {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

interface DepartmentRow {
  name: string;
  employees: number;
  salaryCost: number;
  expenses: number;
}

interface ProductionData {
  completed: number;
  inProgress: number;
  planned: number;
  draft: number;
  totalProduced: number;
  totalPlanned: number;
  efficiency: number;
  recentWorkOrders: Array<{ wo_number: string; product_name: string; status: string; priority: string; produced: number; planned: number; start_date: string; due_date: string }>;
}

interface SalesPipeline {
  quotes: { total: number; approved: number; pending: number; draft: number; totalValue: number; approvedValue: number };
  orders: { total: number; totalValue: number; active: number };
  topCustomers: Array<{ name: string; order_count: number; total_value: number }>;
}

interface InventoryData {
  totalItems: number;
  lowStock: number;
  belowReorder: number;
  outOfStock: number;
  totalValue: number;
  supplierCount: number;
  lowStockItems: Array<{ material_number: string; material_name: string; current_stock: number; minimum_stock: number; reorder_point: number; unit: string }>;
  categoryBreakdown: Array<{ name: string; count: number; value: number }>;
}

interface ProjectsData {
  total: number;
  active: number;
  completed: number;
  onHold: number;
  estimatedRevenue: number;
  actualRevenue: number;
  estimatedCost: number;
  actualCost: number;
  avgCompletion: number;
  recentProjects: Array<{ project_number: string; project_name: string; customer_name: string; status: string; completion_pct: number; start_date: string; end_date: string; profit_margin: number }>;
}

interface SuppliersData {
  total: number;
  active: number;
  rated: number;
  avgRating: number;
}

interface AutomationsData {
  totalRuns7d: number;
  recentRuns: Array<{ flow_id: string; flow_name: string; affected: number; status: string; created_at: string }>;
}

interface AlertItem {
  type: string;
  severity: string;
  message: string;
  count: number;
}

interface DashboardData {
  periodLabel: string;
  startDate: string;
  endDate: string;
  kpis: Record<string, KpiMetric>;
  financialSummary: {
    accountsReceivable: FinancialSubSection;
    accountsPayable: FinancialSubSection;
    balance: BalanceSection;
    budgetVsActual: BudgetSection;
  };
  charts: {
    salesTrend: SalesTrendRow[];
    expenseBreakdown: ExpenseBreakdownRow[];
    cashFlow: CashFlowRow[];
    departmentPerformance: DepartmentRow[];
  };
  departments: string[];
  modules: Array<{ id: number; name: string; slug: string }>;
  production?: ProductionData | null;
  salesPipeline?: SalesPipeline | null;
  inventory?: InventoryData | null;
  projects?: ProjectsData | null;
  suppliers?: SuppliersData | null;
  automations?: AutomationsData | null;
  invoiceAging?: {
    receivable: { current: { count: number; amount: number }; d0_30: { count: number; amount: number }; d31_60: { count: number; amount: number }; d61_90: { count: number; amount: number }; d90_plus: { count: number; amount: number } };
    payable: { current: { count: number; amount: number }; d0_30: { count: number; amount: number }; d31_60: { count: number; amount: number }; d61_90: { count: number; amount: number }; d90_plus: { count: number; amount: number } };
  } | null;
  alerts?: AlertItem[];
  recentActivity?: Array<{ action: string; entity_type: string; entity_id: string; details: string | Record<string, unknown> | null; created_at: string; user_id: string }>;
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

function fmt(n: number) {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("he-IL").format(n);
}

function fmtPct(n: number) {
  return `${n}%`;
}

function fmtCompact(n: number) {
  if (n >= 1000000) return `₪${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `₪${(n / 1000).toFixed(0)}K`;
  return `₪${n}`;
}

type PeriodType = "month" | "quarter" | "year" | "custom";

const MONTH_OPTIONS = [
  { value: "1", label: "ינואר" }, { value: "2", label: "פברואר" }, { value: "3", label: "מרץ" },
  { value: "4", label: "אפריל" }, { value: "5", label: "מאי" }, { value: "6", label: "יוני" },
  { value: "7", label: "יולי" }, { value: "8", label: "אוגוסט" }, { value: "9", label: "ספטמבר" },
  { value: "10", label: "אוקטובר" }, { value: "11", label: "נובמבר" }, { value: "12", label: "דצמבר" },
];

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

function ChangeIndicator({ change }: { change?: number }) {
  if (change === undefined || change === null) return null;
  const isPositive = change > 0;
  const isNegative = change < 0;
  const Icon = isPositive ? TrendingUp : isNegative ? TrendingDown : Minus;
  const color = isPositive ? "text-green-400" : isNegative ? "text-red-400" : "text-muted-foreground";

  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${color}`}>
      <Icon className="w-3.5 h-3.5" />
      {Math.abs(change)}%
    </span>
  );
}

async function exportExcel(data: DashboardData | null) {
  if (!data) return;
  const kpis = data.kpis || {};
  const rows: Record<string, string | number>[] = [
    { category: "הכנסות", metric: "הכנסות", value: kpis.revenue?.value || 0, change: `${kpis.revenue?.change || 0}%` },
    { category: "הוצאות", metric: "הוצאות", value: kpis.expenses?.value || 0, change: `${kpis.expenses?.change || 0}%` },
    { category: "רווח", metric: "רווח גולמי", value: kpis.grossProfit?.value || 0, change: `${kpis.grossProfit?.change || 0}%` },
    { category: "רווח", metric: "שולי רווח", value: `${kpis.profitMargin?.value || 0}%`, change: "" },
    { category: "תפעולי", metric: "הזמנות פתוחות", value: kpis.openOrders?.value || 0, change: "" },
    { category: "תפעולי", metric: "אישורים ממתינים", value: kpis.pendingApprovals?.value || 0, change: "" },
    { category: "משאבי אנוש", metric: "עובדים", value: kpis.headcount?.value || 0, change: "" },
    { category: "כספים", metric: "יתרת מזומן", value: kpis.cashBalance?.value || 0, change: "" },
  ];
  const fs = data.financialSummary;
  if (fs) {
    rows.push(
      { category: "חייבים", metric: "יתרה", value: fs.accountsReceivable?.outstanding || 0, change: "" },
      { category: "חייבים", metric: "חובות באיחור", value: fs.accountsReceivable?.overdueAmount || 0, change: "" },
      { category: "זכאים", metric: "יתרה", value: fs.accountsPayable?.outstanding || 0, change: "" },
      { category: "זכאים", metric: "לתשלום השבוע", value: fs.accountsPayable?.dueThisWeek || 0, change: "" },
    );
  }
  if (data.charts?.salesTrend) {
    data.charts.salesTrend.forEach((m: SalesTrendRow) => {
      rows.push({ category: "מגמת מכירות", metric: m.month, value: m.revenue, change: `הוצאות: ${m.expenses} | רווח: ${m.profit}` });
    });
  }
  const headers = { category: "קטגוריה", metric: "מדד", value: "ערך", change: "שינוי/פירוט" };
  await exportToExcel(rows, headers, "דשבורד-מנהלים", { rtl: true });
}

function exportDashboardCSV(data: DashboardData | null) {
  if (!data) return;
  let csv = "\uFEFF";
  csv += "קטגוריה,מדד,ערך,שינוי\n";
  const kpis = data.kpis || {};
  csv += `הכנסות,הכנסות,${kpis.revenue?.value || 0},${kpis.revenue?.change || 0}%\n`;
  csv += `הוצאות,הוצאות,${kpis.expenses?.value || 0},${kpis.expenses?.change || 0}%\n`;
  csv += `רווח,רווח גולמי,${kpis.grossProfit?.value || 0},${kpis.grossProfit?.change || 0}%\n`;
  csv += `רווח,שולי רווח,${kpis.profitMargin?.value || 0}%,\n`;
  csv += `תפעולי,הזמנות פתוחות,${kpis.openOrders?.value || 0},\n`;
  csv += `תפעולי,אישורים ממתינים,${kpis.pendingApprovals?.value || 0},\n`;
  csv += `משאבי אנוש,עובדים,${kpis.headcount?.value || 0},\n`;
  csv += `כספים,יתרת מזומן,${kpis.cashBalance?.value || 0},\n`;
  const fs = data.financialSummary;
  csv += "\n\nסיכום פיננסי\n";
  csv += `חייבים - יתרה,${fs?.accountsReceivable?.outstanding || 0}\n`;
  csv += `חייבים - חובות באיחור,${fs?.accountsReceivable?.overdueAmount || 0}\n`;
  csv += `זכאים - יתרה,${fs?.accountsPayable?.outstanding || 0}\n`;
  csv += `זכאים - לתשלום השבוע,${fs?.accountsPayable?.dueThisWeek || 0}\n`;
  if (data.charts?.salesTrend) {
    csv += "\n\nמגמת מכירות\n";
    csv += "חודש,הכנסות,הוצאות,רווח\n";
    data.charts.salesTrend.forEach((m: SalesTrendRow) => {
      csv += `${m.month},${m.revenue},${m.expenses},${m.profit}\n`;
    });
  }
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "executive-dashboard.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function exportDashboardPDF(data: DashboardData | null) {
  if (!data) return;
  const kpis = data.kpis || {};
  const fs = data.financialSummary;
  const dateStr = new Date().toLocaleDateString("he-IL");
  const timeStr = new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  const kpiRows = [
    { category: "הכנסות", metric: "הכנסות", value: (kpis.revenue?.value || 0).toLocaleString("he-IL"), change: `${kpis.revenue?.change || 0}%` },
    { category: "הוצאות", metric: "הוצאות", value: (kpis.expenses?.value || 0).toLocaleString("he-IL"), change: `${kpis.expenses?.change || 0}%` },
    { category: "רווח", metric: "רווח גולמי", value: (kpis.grossProfit?.value || 0).toLocaleString("he-IL"), change: `${kpis.grossProfit?.change || 0}%` },
    { category: "רווח", metric: "שולי רווח", value: `${kpis.profitMargin?.value || 0}%`, change: "" },
    { category: "תפעולי", metric: "הזמנות פתוחות", value: kpis.openOrders?.value || 0, change: "" },
    { category: "תפעולי", metric: "אישורים ממתינים", value: kpis.pendingApprovals?.value || 0, change: "" },
    { category: "משאבי אנוש", metric: "עובדים", value: kpis.headcount?.value || 0, change: "" },
    { category: "כספים", metric: "יתרת מזומן", value: (kpis.cashBalance?.value || 0).toLocaleString("he-IL"), change: "" },
  ];

  const kpiTableRows = kpiRows.map(r => `<tr><td>${r.category}</td><td>${r.metric}</td><td>${r.value}</td><td>${r.change}</td></tr>`).join("");

  let financialSection = "";
  if (fs) {
    financialSection = `
      <h2 class="section-title">סיכום פיננסי</h2>
      <table>
        <thead><tr><th>קטגוריה</th><th>מדד</th><th>ערך</th></tr></thead>
        <tbody>
          <tr><td>חייבים</td><td>יתרה</td><td>${(fs.accountsReceivable?.outstanding || 0).toLocaleString("he-IL")}</td></tr>
          <tr><td>חייבים</td><td>חובות באיחור</td><td>${(fs.accountsReceivable?.overdueAmount || 0).toLocaleString("he-IL")}</td></tr>
          <tr><td>זכאים</td><td>יתרה</td><td>${(fs.accountsPayable?.outstanding || 0).toLocaleString("he-IL")}</td></tr>
          <tr><td>זכאים</td><td>לתשלום השבוע</td><td>${(fs.accountsPayable?.dueThisWeek || 0).toLocaleString("he-IL")}</td></tr>
        </tbody>
      </table>`;
  }

  let salesTrendSection = "";
  if (data.charts?.salesTrend && data.charts.salesTrend.length > 0) {
    const trendRows = data.charts.salesTrend.map((m: SalesTrendRow) =>
      `<tr><td>${m.month}</td><td>${Number(m.revenue).toLocaleString("he-IL")}</td><td>${Number(m.expenses).toLocaleString("he-IL")}</td><td>${Number(m.profit).toLocaleString("he-IL")}</td></tr>`
    ).join("");
    salesTrendSection = `
      <h2 class="section-title">מגמת מכירות</h2>
      <table>
        <thead><tr><th>חודש</th><th>הכנסות</th><th>הוצאות</th><th>רווח</th></tr></thead>
        <tbody>${trendRows}</tbody>
      </table>`;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="utf-8">
      <title>דשבורד מנהלים</title>
      <style>
        @page { size: A4 landscape; margin: 15mm; }
        body { font-family: Arial, sans-serif; direction: rtl; color: #1e293b; background: #fff; }
        .pdf-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1e40af; padding-bottom: 10px; margin-bottom: 20px; }
        .pdf-company { font-size: 18px; font-weight: bold; color: #1e40af; }
        .pdf-company-sub { font-size: 10px; color: #64748b; }
        .pdf-title { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
        .pdf-date { font-size: 10px; color: #64748b; }
        .section-title { font-size: 14px; font-weight: bold; margin: 20px 0 8px; color: #1e40af; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11px; }
        th { background: #1e40af; color: white; padding: 6px 10px; text-align: right; font-size: 10px; }
        td { padding: 5px 10px; border-bottom: 1px solid #e2e8f0; text-align: right; }
        tr:nth-child(even) { background: #f8fafc; }
        .pdf-footer { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
    </head>
    <body>
      <div class="pdf-header">
        <div>
          <div class="pdf-title">דשבורד מנהלים</div>
          <div class="pdf-date">${dateStr} | ${timeStr}</div>
        </div>
        <div>
          <div class="pdf-company">טכנו-כל עוזי</div>
          <div class="pdf-company-sub">TECHNO-KOL UZI | ח.פ 054227129</div>
        </div>
      </div>
      <h2 class="section-title">מדדי KPI</h2>
      <table>
        <thead><tr><th>קטגוריה</th><th>מדד</th><th>ערך</th><th>שינוי</th></tr></thead>
        <tbody>${kpiTableRows}</tbody>
      </table>
      ${financialSection}
      ${salesTrendSection}
      <div class="pdf-footer">
        <span>TECHNO-KOL UZI | ERP System</span>
        <span>${new Date().toISOString()}</span>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 500);
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayloadEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl text-sm" dir="rtl">
      <p className="text-slate-300 mb-1 font-medium">{label}</p>
      {payload.map((entry: TooltipPayloadEntry, i: number) => (
        <p key={i} className="text-slate-200" style={{ color: entry.color }}>
          {entry.name}: {fmt(entry.value)}
        </p>
      ))}
    </div>
  );
}

function MiniProgressBar({ value, max, color = "bg-blue-500" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-slate-700/50 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function getActivityDetailsText(details: string | Record<string, unknown> | null | undefined): string {
  if (!details) return "";
  if (typeof details === "string") return details.substring(0, 50);
  if (typeof details === "object") {
    const d = details as Record<string, unknown>;
    const text = d.description ?? d.name ?? d.label ?? "";
    return typeof text === "string" ? text.substring(0, 50) : "";
  }
  return "";
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-emerald-400", in_progress: "bg-blue-400", planned: "bg-amber-400",
    draft: "bg-slate-400", approved: "bg-green-400", pending: "bg-yellow-400",
    overdue: "bg-red-400", active: "bg-emerald-400",
  };
  return <div className={`w-2 h-2 rounded-full ${colors[status] || "bg-slate-400"} flex-shrink-0`} />;
}

export default function KPIDashboard() {
  const [, navigate] = useLocation();
  const now = new Date();
  const [period, setPeriod] = useState<PeriodType>("year");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [quarter, setQuarter] = useState(String(Math.ceil((now.getMonth() + 1) / 3)));
  const [customStart, setCustomStart] = useState(now.toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(now.toISOString().slice(0, 10));
  const [department, setDepartment] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  function buildQueryParams(): string {
    const params = new URLSearchParams();
    if (period === "custom") {
      params.set("startDate", customStart);
      params.set("endDate", customEnd);
    } else {
      params.set("period", period);
      params.set("year", year);
      if (period === "month") params.set("month", month);
      if (period === "quarter") params.set("quarter", quarter);
    }
    if (department) params.set("department", department);
    if (moduleFilter) params.set("module", moduleFilter);
    return params.toString();
  }

  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery<DashboardData | null>({
    queryKey: ["executive-dashboard", period, year, month, quarter, customStart, customEnd, department, moduleFilter],
    queryFn: async () => {
      try {
        return await authJson(`${API}/reports-center/executive-dashboard?${buildQueryParams()}`);
      } catch {
        return null;
      }
    },
    refetchInterval: autoRefresh ? 60000 : false,
    staleTime: 30000,
  });

  const kpis = data?.kpis || {};
  const fs = data?.financialSummary;
  const charts = data?.charts;
  const departments: string[] = data?.departments || [];
  const modules: Array<{ id: number; name: string; slug: string }> = data?.modules || [];
  const production = data?.production;
  const salesPipeline = data?.salesPipeline;
  const inventory = data?.inventory;
  const projects = data?.projects;
  const suppliers = data?.suppliers;
  const automations = data?.automations;
  const invoiceAging = data?.invoiceAging;
  const alerts = data?.alerts || [];
  const recentActivity = data?.recentActivity || [];
  const hasError = !isLoading && !isFetching && !data;

  if (isLoading) {
    return <LoadingOverlay className="h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />;
  }

  const grossProfit = (kpis.revenue?.value || 0) - (kpis.expenses?.value || 0);
  const healthScore = calculateHealthScore(kpis, fs, production, alerts);

  return (
    <div className="space-y-4 pb-8" dir="rtl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <button onClick={() => navigate("/reports")} className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="w-4 h-4" />
          מרכז דוחות
        </button>
        <span>/</span>
        <span className="text-foreground">דשבורד מנהלים</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 shadow-lg shadow-blue-500/20">
              <Target className="w-5 h-5 text-foreground" />
            </div>
            דשבורד מנהלים — טכנו-כל עוזי
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            סקירה כללית של ביצועי העסק {data?.periodLabel ? `— ${data.periodLabel}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs border-slate-600" onClick={() => setAutoRefresh(!autoRefresh)}>
            <RefreshCw className={`w-3.5 h-3.5 ml-1 ${autoRefresh ? "animate-spin" : ""}`} />
            {autoRefresh ? "חי" : "ידני"}
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs border-slate-600" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          {dataUpdatedAt > 0 && (
            <span className="text-[10px] text-muted-foreground">
              עודכן: {new Date(dataUpdatedAt).toLocaleTimeString("he-IL")}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Filter className="w-3.5 h-3.5" />
          <span>תקופה:</span>
        </div>
        <Select value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
          <SelectTrigger className="w-28 h-8 text-xs bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="month">חודשי</SelectItem>
            <SelectItem value="quarter">רבעוני</SelectItem>
            <SelectItem value="year">שנתי</SelectItem>
            <SelectItem value="custom">טווח מותאם</SelectItem>
          </SelectContent>
        </Select>
        {(period === "year" || period === "month" || period === "quarter") && (
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-20 h-8 text-xs bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {[2024, 2025, 2026].map(y => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
        {period === "month" && (
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-24 h-8 text-xs bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {MONTH_OPTIONS.map(m => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
        {period === "quarter" && (
          <Select value={quarter} onValueChange={setQuarter}>
            <SelectTrigger className="w-20 h-8 text-xs bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              {[1, 2, 3, 4].map(q => (<SelectItem key={q} value={String(q)}>Q{q}</SelectItem>))}
            </SelectContent>
          </Select>
        )}
        {period === "custom" && (
          <>
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-36 h-8 text-xs bg-slate-800 border-slate-700" />
            <span className="text-xs text-muted-foreground">עד</span>
            <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-36 h-8 text-xs bg-slate-800 border-slate-700" />
          </>
        )}
        {departments.length > 0 && (
          <>
            <div className="w-px h-6 bg-slate-700 mx-1" />
            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
            <Select value={department || "all"} onValueChange={(v) => setDepartment(v === "all" ? "" : v)}>
              <SelectTrigger className="w-28 h-8 text-xs bg-slate-800 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                <SelectItem value="all">הכל</SelectItem>
                {departments.map(d => (<SelectItem key={d} value={d}>{d}</SelectItem>))}
              </SelectContent>
            </Select>
          </>
        )}
        <TooltipProvider>
          <div className="flex gap-1 mr-auto">
            <UITooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="sm" className="h-8 text-xs border-slate-600" disabled={!data} onClick={() => exportExcel(data)}>
                    <FileSpreadsheet className="w-3.5 h-3.5 ml-1" /> Excel
                  </Button>
                </span>
              </TooltipTrigger>
              {!data && <TooltipContent>אין נתונים לייצוא</TooltipContent>}
            </UITooltip>
            <UITooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="sm" className="h-8 text-xs border-slate-600" disabled={!data} onClick={() => exportDashboardCSV(data)}>
                    <Download className="w-3.5 h-3.5 ml-1" /> CSV
                  </Button>
                </span>
              </TooltipTrigger>
              {!data && <TooltipContent>אין נתונים לייצוא</TooltipContent>}
            </UITooltip>
            <UITooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="sm" className="h-8 text-xs border-slate-600" disabled={!data} onClick={() => exportDashboardPDF(data)}>
                    <Printer className="w-3.5 h-3.5 ml-1" /> PDF
                  </Button>
                </span>
              </TooltipTrigger>
              {!data && <TooltipContent>אין נתונים לייצוא</TooltipContent>}
            </UITooltip>
          </div>
        </TooltipProvider>
      </div>

      {hasError && (
        <Card className="bg-red-950/30 border-red-800/50">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-300 font-medium">שגיאה בטעינת נתונים</p>
              <p className="text-xs text-red-400/70">לא ניתן לטעון את נתוני הדשבורד. אנא נסה שוב.</p>
            </div>
            <Button variant="outline" size="sm" className="text-xs border-red-800 text-red-300 hover:bg-red-900/50" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5 ml-1" /> נסה שוב
            </Button>
          </CardContent>
        </Card>
      )}

      <div data-report-content>
        {alerts.length > 0 && (
          <div className="mb-4 space-y-1.5">
            {alerts.map((alert, i) => (
              <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-sm ${
                alert.severity === "high" ? "bg-red-500/5 border-red-500/20 text-red-300" : "bg-amber-500/5 border-amber-500/20 text-amber-300"
              }`}>
                {alert.severity === "high" ? <AlertTriangle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                <span className="flex-1">{alert.message}</span>
                <Badge variant="outline" className={`text-[10px] ${alert.severity === "high" ? "border-red-500/30 text-red-400" : "border-amber-500/30 text-amber-400"}`}>
                  {alert.severity === "high" ? "דחוף" : "אזהרה"}
                </Badge>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
          <HealthScoreCard score={healthScore} kpis={kpis} production={production} alerts={alerts} inventory={inventory} hasData={!!(  (kpis.revenue?.value || 0) > 0 || (kpis.openOrders?.value || 0) > 0 || (kpis.activeCustomers?.value || 0) > 0 || (production != null && (production.inProgress > 0 || production.completed > 0)))} />
          <KpiCard title="הכנסות" value={fmt(kpis.revenue?.value || 0)} change={kpis.revenue?.change} icon={DollarSign} iconColor="text-green-400" iconBg="bg-green-500/10" onClick={() => kpis.revenue?.drillDown && navigate(kpis.revenue.drillDown)} />
          <KpiCard title="הוצאות" value={fmt(kpis.expenses?.value || 0)} change={kpis.expenses?.change} icon={CreditCard} iconColor="text-red-400" iconBg="bg-red-500/10" invertChange onClick={() => kpis.expenses?.drillDown && navigate(kpis.expenses.drillDown)} />
          <KpiCard title="רווח גולמי" value={fmt(grossProfit)} change={kpis.grossProfit?.change} icon={TrendingUp} iconColor="text-blue-400" iconBg="bg-blue-500/10" onClick={() => navigate("/reports/financial")} />
          <KpiCard title="שולי רווח" value={fmtPct(kpis.profitMargin?.value || 0)} icon={PieChartIcon} iconColor="text-purple-400" iconBg="bg-purple-500/10" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
          <MiniKpiCard title="הזמנות פתוחות" value={fmtNum(kpis.openOrders?.value || 0)} subtitle={kpis.openOrders?.amount ? fmtCompact(kpis.openOrders.amount) : undefined} icon={ShoppingCart} color="text-orange-400" onClick={() => navigate("/purchase-orders")} />
          <MiniKpiCard title="ממתינים לאישור" value={fmtNum(kpis.pendingApprovals?.value || 0)} icon={Clock} color="text-yellow-400" onClick={() => navigate("/purchase-approvals")} />
          <MiniKpiCard title="עובדים פעילים" value={fmtNum(kpis.headcount?.value || 0)} subtitle={kpis.headcount?.salaryCost ? fmtCompact(kpis.headcount.salaryCost) : undefined} icon={Users} color="text-cyan-400" onClick={() => navigate("/hr")} />
          <MiniKpiCard title="יתרת מזומן" value={fmtCompact(kpis.cashBalance?.value || 0)} icon={Wallet} color="text-emerald-400" onClick={() => navigate("/finance")} />
          <MiniKpiCard title="לקוחות פעילים" value={fmtNum(kpis.activeCustomers?.value || 0)} subtitle={kpis.activeCustomers?.amount ? `${kpis.activeCustomers.amount} חדשים` : undefined} icon={Users} color="text-pink-400" onClick={() => navigate("/sales/customers")} />
          <MiniKpiCard title="פריטי מלאי" value={fmtNum(inventory?.totalItems || 0)} subtitle={inventory?.lowStock ? `${inventory.lowStock} מתחת למינימום` : undefined} subtitleColor={inventory?.lowStock ? "text-red-400" : undefined} icon={Boxes} color="text-violet-400" onClick={() => navigate("/raw-materials")} />
          <MiniKpiCard title="ייצור פעיל" value={fmtNum(production?.inProgress || 0)} subtitle={production ? `${production.efficiency}% יעילות` : undefined} icon={Factory} color="text-indigo-400" onClick={() => navigate("/production/work-orders")} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
          <MiniKpiCard title="פרויקטים פעילים" value={fmtNum(projects?.active || 0)} subtitle={projects?.avgCompletion ? `${projects.avgCompletion}% ממוצע` : undefined} icon={FolderKanban} color="text-pink-400" onClick={() => navigate("/projects")} />
          <MiniKpiCard title="ספקים פעילים" value={fmtNum(suppliers?.active || 0)} subtitle={suppliers?.avgRating ? `דירוג ${suppliers.avgRating}/5` : undefined} icon={Truck} color="text-lime-400" onClick={() => navigate("/suppliers")} />
          <MiniKpiCard title="שווי מלאי" value={fmtCompact(inventory?.totalValue || 0)} icon={Package} color="text-teal-400" onClick={() => navigate("/raw-materials")} />
          <MiniKpiCard title="אוטומציות (7 ימים)" value={fmtNum(automations?.totalRuns7d || 0)} icon={Zap} color="text-amber-400" onClick={() => navigate("/platform/data-flow-automations")} />
          <MiniKpiCard title="אין במלאי" value={fmtNum(inventory?.outOfStock || 0)} subtitleColor={inventory?.outOfStock ? "text-red-400" : undefined} icon={AlertOctagon} color="text-red-400" />
          <MiniKpiCard title="פרויקטים שהושלמו" value={fmtNum(projects?.completed || 0)} icon={CheckCircle2} color="text-emerald-400" onClick={() => navigate("/projects")} />
          <MiniKpiCard title="הכנסות פרויקטים" value={fmtCompact(projects?.actualRevenue || 0)} icon={DollarSign} color="text-green-400" onClick={() => navigate("/projects")} />
          <MiniKpiCard title="מתחת לנק' הזמנה" value={fmtNum(inventory?.belowReorder || 0)} subtitleColor={(inventory?.belowReorder || 0) > 0 ? "text-amber-400" : undefined} icon={Package} color="text-orange-400" />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <Button size="sm" className="h-7 text-xs bg-blue-600 hover:bg-blue-700" onClick={() => navigate("/sales/orders")}>
            <Plus className="w-3 h-3 ml-1" /> הזמנת מכירה
          </Button>
          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => navigate("/price-quotes")}>
            <Plus className="w-3 h-3 ml-1" /> הצעת מחיר
          </Button>
          <Button size="sm" className="h-7 text-xs bg-purple-600 hover:bg-purple-700" onClick={() => navigate("/purchase-orders")}>
            <Plus className="w-3 h-3 ml-1" /> הזמנת רכש
          </Button>
          <Button size="sm" className="h-7 text-xs bg-orange-600 hover:bg-orange-700" onClick={() => navigate("/production/work-orders")}>
            <Plus className="w-3 h-3 ml-1" /> פקודת עבודה
          </Button>
          <Button size="sm" className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700" onClick={() => navigate("/sales/customers")}>
            <Plus className="w-3 h-3 ml-1" /> לקוח חדש
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs border-slate-600 mr-auto" onClick={() => navigate("/platform/data-flow-automations")}>
            <Zap className="w-3 h-3 ml-1 text-amber-400" /> ניהול אוטומציות
          </Button>
        </div>

        <Tabs defaultValue="overview" className="mb-4">
          <TabsList className="bg-slate-800/50 border border-slate-700 h-9">
            <TabsTrigger value="overview" className="text-xs">סקירה כללית</TabsTrigger>
            <TabsTrigger value="financial" className="text-xs">כספים</TabsTrigger>
            <TabsTrigger value="sales" className="text-xs">מכירות</TabsTrigger>
            <TabsTrigger value="production" className="text-xs">ייצור</TabsTrigger>
            <TabsTrigger value="inventory" className="text-xs">מלאי</TabsTrigger>
            <TabsTrigger value="projects" className="text-xs">פרויקטים</TabsTrigger>
            <TabsTrigger value="activity" className="text-xs">פעילות אחרונה</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-3 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-400" />
                    הכנסות מול הוצאות — 12 חודשים אחרונים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height={224}>
                      <BarChart data={charts?.salesTrend || []} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 9 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Bar dataKey="revenue" name="הכנסות" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="expenses" name="הוצאות" fill="#ef4444" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="profit" name="רווח" fill="#10b981" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    תזרים מזומנים
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height={224}>
                      <AreaChart data={charts?.cashFlow || []} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                        <defs>
                          <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorNet" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 9 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        <Area type="monotone" dataKey="income" name="הכנסות" stroke="#3b82f6" fill="url(#colorIncome)" />
                        <Area type="monotone" dataKey="expenses" name="הוצאות" stroke="#ef4444" fill="#ef4444" fillOpacity={0.05} />
                        <Area type="monotone" dataKey="net" name="נטו" stroke="#10b981" fill="url(#colorNet)" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <PieChartIcon className="w-4 h-4 text-purple-400" />
                    פילוח הוצאות
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    {(charts?.expenseBreakdown || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height={224}>
                        <PieChart>
                          <Pie data={charts?.expenseBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}
                            label={({ name, percent }: { name: string; percent: number }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                            labelLine={{ stroke: "#64748b" }}>
                            {(charts?.expenseBreakdown || []).map((_: ExpenseBreakdownRow, i: number) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => fmt(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">אין נתוני הוצאות</div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-cyan-400" />
                    ביצועי מחלקות
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    {(charts?.departmentPerformance || []).length > 0 ? (
                      <ResponsiveContainer width="100%" height={224}>
                        <BarChart data={charts?.departmentPerformance} layout="vertical" margin={{ top: 5, right: 5, left: 40, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                          <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                          <YAxis dataKey="name" type="category" tick={{ fill: "#94a3b8", fontSize: 9 }} width={60} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="salaryCost" name="עלות שכר" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                          <Bar dataKey="expenses" name="הוצאות" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-muted-foreground">אין נתוני מחלקות</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {salesPipeline?.topCustomers && salesPipeline.topCustomers.length > 0 && (
              <Card className="bg-slate-900/50 border-slate-700/50 mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    טופ 5 לקוחות לפי הכנסות
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" dir="rtl">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-right py-2 px-3 text-muted-foreground font-medium w-8">#</th>
                          <th className="text-right py-2 px-3 text-muted-foreground font-medium">שם לקוח</th>
                          <th className="text-center py-2 px-3 text-muted-foreground font-medium">הזמנות</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">סה"כ הכנסות</th>
                          <th className="text-left py-2 px-3 text-muted-foreground font-medium">נתח</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const totalAllCustomers = salesPipeline.topCustomers.reduce((s: number, c: { total_value: number }) => s + Number(c.total_value || 0), 0);
                          return salesPipeline.topCustomers.map((c: { name: string; order_count: number; total_value: number }, i: number) => {
                            const pct = totalAllCustomers > 0 ? ((Number(c.total_value) / totalAllCustomers) * 100).toFixed(1) : "0";
                            const medals = ["🥇", "🥈", "🥉"];
                            return (
                              <tr key={i} className="border-b border-slate-700/30 hover:bg-slate-800/30">
                                <td className="py-2.5 px-3 text-center">{i < 3 ? medals[i] : <span className="text-muted-foreground">{i + 1}</span>}</td>
                                <td className="py-2.5 px-3 text-slate-200 font-medium">{c.name || "לקוח לא ידוע"}</td>
                                <td className="py-2.5 px-3 text-center text-slate-300">{Number(c.order_count || 0)}</td>
                                <td className="py-2.5 px-3 text-left text-emerald-400 font-medium">{fmt(Number(c.total_value || 0))}</td>
                                <td className="py-2.5 px-3 text-left">
                                  <div className="flex items-center gap-2">
                                    <div className="w-16 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(Number(pct), 100)}%` }} />
                                    </div>
                                    <span className="text-muted-foreground text-[10px]">{pct}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {recentActivity.length > 0 && (
              <Card className="bg-slate-900/50 border-slate-700/50 mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4 text-violet-400" />
                    פעילות אחרונה
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {recentActivity.slice(0, 5).map((a, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-1.5 rounded-lg hover:bg-slate-800/50 text-xs transition-colors">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                          a.action === "create" ? "bg-green-500/10 text-green-400" :
                          a.action === "update" ? "bg-blue-500/10 text-blue-400" :
                          a.action === "delete" ? "bg-red-500/10 text-red-400" :
                          "bg-muted/10 text-muted-foreground"
                        }`}>
                          {a.action === "create" ? <CheckCircle2 className="w-3 h-3" /> :
                           a.action === "update" ? <Eye className="w-3 h-3" /> :
                           a.action === "delete" ? <XCircle className="w-3 h-3" /> :
                           <CircleDot className="w-3 h-3" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-300">{a.action}</span>
                          <span className="text-muted-foreground mx-1">—</span>
                          <span className="text-muted-foreground">{a.entity_type}</span>
                          {a.details && <span className="text-muted-foreground mr-2 truncate"> {getActivityDetailsText(a.details)}</span>}
                        </div>
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {new Date(a.created_at).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="financial" className="mt-3 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-green-400" />
                    חייבים (AR)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <FinancialRow label="יתרה פתוחה" value={fmt(fs?.accountsReceivable?.outstanding || 0)} />
                  <FinancialRow label="באיחור" value={fmt(fs?.accountsReceivable?.overdueAmount || 0)}
                    badge={(fs?.accountsReceivable?.overdueCount || 0) > 0 ? `${fs?.accountsReceivable?.overdueCount} חשבוניות` : undefined} badgeColor="destructive" />
                  <FinancialRow label="ממוצע ימי איחור" value={`${fs?.accountsReceivable?.avgDaysOverdue || 0} ימים`} />
                  <div className="pt-2 border-t border-slate-700/50">
                    <Button variant="ghost" size="sm" className="text-xs text-blue-400 hover:text-blue-300 p-0 h-auto" onClick={() => navigate("/finance")}>
                      צפה בפירוט <ChevronLeft className="w-3 h-3 mr-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowDownRight className="w-4 h-4 text-red-400" />
                    זכאים (AP)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <FinancialRow label="יתרה פתוחה" value={fmt(fs?.accountsPayable?.outstanding || 0)} />
                  <FinancialRow label="באיחור" value={fmt(fs?.accountsPayable?.overdueAmount || 0)}
                    badge={(fs?.accountsPayable?.overdueCount || 0) > 0 ? `${fs?.accountsPayable?.overdueCount} חשבוניות` : undefined} badgeColor="destructive" />
                  <FinancialRow label="לתשלום השבוע" value={fmt(fs?.accountsPayable?.dueThisWeek || 0)} highlight />
                  <div className="pt-2 border-t border-slate-700/50">
                    <Button variant="ghost" size="sm" className="text-xs text-blue-400 hover:text-blue-300 p-0 h-auto" onClick={() => navigate("/finance")}>
                      צפה בפירוט <ChevronLeft className="w-3 h-3 mr-1" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-400" />
                    מאזן כללי
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <FinancialRow label="מזומן" value={fmt(fs?.balance?.cash || 0)} valueColor="text-green-400" />
                  <FinancialRow label="חייבים" value={fmt(fs?.balance?.receivables || 0)} valueColor="text-blue-400" />
                  <FinancialRow label="זכאים" value={`(${fmt(fs?.balance?.payables || 0)})`} valueColor="text-red-400" />
                  <div className="pt-2 border-t border-slate-700/50">
                    <FinancialRow label="מצב נטו" value={fmt(fs?.balance?.netPosition || 0)} valueColor={(fs?.balance?.netPosition || 0) >= 0 ? "text-green-400" : "text-red-400"} bold />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-slate-900/50 border-slate-700/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-400" />
                    תקציב מול ביצוע
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <FinancialRow label="תקציב מתוכנן" value={fmt(fs?.budgetVsActual?.budget || 0)} />
                  <FinancialRow label="ביצוע בפועל" value={fmt(fs?.budgetVsActual?.actual || 0)} />
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">ניצול תקציב</span>
                      <span className={`text-xs font-medium ${(fs?.budgetVsActual?.utilization || 0) > 90 ? "text-red-400" : (fs?.budgetVsActual?.utilization || 0) > 70 ? "text-yellow-400" : "text-green-400"}`}>
                        {fs?.budgetVsActual?.utilization || 0}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-700 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${(fs?.budgetVsActual?.utilization || 0) > 90 ? "bg-red-500" : (fs?.budgetVsActual?.utilization || 0) > 70 ? "bg-yellow-500" : "bg-green-500"}`}
                        style={{ width: `${Math.min(fs?.budgetVsActual?.utilization || 0, 100)}%` }} />
                    </div>
                  </div>
                  <FinancialRow label="יתרה" value={fmt(fs?.budgetVsActual?.remaining || 0)} valueColor={(fs?.budgetVsActual?.remaining || 0) >= 0 ? "text-green-400" : "text-red-400"} />
                </CardContent>
              </Card>
            </div>

            {invoiceAging && (
              <Card className="bg-slate-900/50 border-slate-700/50 mt-4">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400" />
                    גיול חשבוניות (Invoice Aging)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" dir="rtl">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-right py-2 px-3 text-muted-foreground font-medium">סוג</th>
                          <th className="text-center py-2 px-3 text-green-400 font-medium">שוטף</th>
                          <th className="text-center py-2 px-3 text-blue-400 font-medium">0-30 יום</th>
                          <th className="text-center py-2 px-3 text-yellow-400 font-medium">31-60 יום</th>
                          <th className="text-center py-2 px-3 text-orange-400 font-medium">61-90 יום</th>
                          <th className="text-center py-2 px-3 text-red-400 font-medium">90+ יום</th>
                          <th className="text-center py-2 px-3 text-foreground font-medium">סה"כ</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-slate-700/50 hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 text-slate-300 font-medium">חייבים (AR)</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-green-400 font-medium">{fmt(invoiceAging.receivable.current.amount)}</span>
                            <span className="text-muted-foreground block text-[10px]">{invoiceAging.receivable.current.count} חשב'</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-blue-400 font-medium">{fmt(invoiceAging.receivable.d0_30.amount)}</span>
                            <span className="text-muted-foreground block text-[10px]">{invoiceAging.receivable.d0_30.count} חשב'</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-yellow-400 font-medium">{fmt(invoiceAging.receivable.d31_60.amount)}</span>
                            <span className="text-muted-foreground block text-[10px]">{invoiceAging.receivable.d31_60.count} חשב'</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-orange-400 font-medium">{fmt(invoiceAging.receivable.d61_90.amount)}</span>
                            <span className="text-muted-foreground block text-[10px]">{invoiceAging.receivable.d61_90.count} חשב'</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-red-400 font-medium">{fmt(invoiceAging.receivable.d90_plus.amount)}</span>
                            <span className="text-muted-foreground block text-[10px]">{invoiceAging.receivable.d90_plus.count} חשב'</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-foreground font-bold">{fmt(invoiceAging.receivable.current.amount + invoiceAging.receivable.d0_30.amount + invoiceAging.receivable.d31_60.amount + invoiceAging.receivable.d61_90.amount + invoiceAging.receivable.d90_plus.amount)}</span>
                          </td>
                        </tr>
                        <tr className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 text-slate-300 font-medium">זכאים (AP)</td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-green-400 font-medium">{fmt(invoiceAging.payable.current.amount)}</span>
                            <span className="text-muted-foreground block text-[10px]">{invoiceAging.payable.current.count} חשב'</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-blue-400 font-medium">{fmt(invoiceAging.payable.d0_30.amount)}</span>
                            <span className="text-muted-foreground block text-[10px]">{invoiceAging.payable.d0_30.count} חשב'</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-yellow-400 font-medium">{fmt(invoiceAging.payable.d31_60.amount)}</span>
                            <span className="text-muted-foreground block text-[10px]">{invoiceAging.payable.d31_60.count} חשב'</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-orange-400 font-medium">{fmt(invoiceAging.payable.d61_90.amount)}</span>
                            <span className="text-muted-foreground block text-[10px]">{invoiceAging.payable.d61_90.count} חשב'</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-red-400 font-medium">{fmt(invoiceAging.payable.d90_plus.amount)}</span>
                            <span className="text-muted-foreground block text-[10px]">{invoiceAging.payable.d90_plus.count} חשב'</span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="text-foreground font-bold">{fmt(invoiceAging.payable.current.amount + invoiceAging.payable.d0_30.amount + invoiceAging.payable.d31_60.amount + invoiceAging.payable.d61_90.amount + invoiceAging.payable.d90_plus.amount)}</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="sales" className="mt-3 space-y-4">
            {salesPipeline ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-blue-400" />
                      הצעות מחיר
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-lg sm:text-2xl font-bold text-foreground">{salesPipeline.quotes.total}</span>
                      <span className="text-sm text-muted-foreground">{fmt(salesPipeline.quotes.totalValue)}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center">
                      <div className="bg-green-500/10 rounded-lg p-2">
                        <p className="text-lg font-bold text-green-400">{salesPipeline.quotes.approved}</p>
                        <p className="text-[10px] text-green-400/70">אושרו</p>
                      </div>
                      <div className="bg-yellow-500/10 rounded-lg p-2">
                        <p className="text-lg font-bold text-yellow-400">{salesPipeline.quotes.pending}</p>
                        <p className="text-[10px] text-yellow-400/70">ממתינים</p>
                      </div>
                      <div className="bg-muted/10 rounded-lg p-2">
                        <p className="text-lg font-bold text-muted-foreground">{salesPipeline.quotes.draft}</p>
                        <p className="text-[10px] text-muted-foreground/70">טיוטה</p>
                      </div>
                    </div>
                    {salesPipeline.quotes.total > 0 && (
                      <div>
                        <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                          <span>שיעור אישור</span>
                          <span>{Math.round((salesPipeline.quotes.approved / salesPipeline.quotes.total) * 100)}%</span>
                        </div>
                        <MiniProgressBar value={salesPipeline.quotes.approved} max={salesPipeline.quotes.total} color="bg-green-500" />
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <ShoppingCart className="w-4 h-4 text-orange-400" />
                      הזמנות מכירה
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-lg sm:text-2xl font-bold text-foreground">{salesPipeline.orders.total}</span>
                      <span className="text-sm text-muted-foreground">{fmt(salesPipeline.orders.totalValue)}</span>
                    </div>
                    <div className="bg-blue-500/10 rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-blue-400">{salesPipeline.orders.active}</p>
                      <p className="text-[10px] text-blue-400/70">הזמנות פעילות</p>
                    </div>
                    {salesPipeline.orders.total > 0 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Gauge className="w-3.5 h-3.5" />
                        <span>ממוצע להזמנה: {fmt(salesPipeline.orders.totalValue / salesPipeline.orders.total)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="w-4 h-4 text-violet-400" />
                      לקוחות מובילים
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(salesPipeline.topCustomers || []).map((c: { name: string; order_count: number; total_value: number }, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-amber-500/20 text-amber-400" : "bg-slate-700 text-muted-foreground"}`}>{i + 1}</span>
                            <span className="text-slate-300 truncate">{c.name || "לא ידוע"}</span>
                          </div>
                          <div className="text-left flex items-center gap-2 flex-shrink-0">
                            <span className="text-muted-foreground">{c.order_count} הזמנות</span>
                            <span className="text-foreground font-medium">{fmtCompact(Number(c.total_value))}</span>
                          </div>
                        </div>
                      ))}
                      {(salesPipeline.topCustomers || []).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">אין נתוני לקוחות</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">אין נתוני מכירות זמינים</div>
            )}
          </TabsContent>

          <TabsContent value="production" className="mt-3 space-y-4">
            {production ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Factory className="w-4 h-4 text-indigo-400" />
                      סטטוס ייצור
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="text-center p-2 bg-emerald-500/10 rounded-lg">
                        <p className="text-xl font-bold text-emerald-400">{production.completed}</p>
                        <p className="text-[10px] text-emerald-400/70">הושלמו</p>
                      </div>
                      <div className="text-center p-2 bg-blue-500/10 rounded-lg">
                        <p className="text-xl font-bold text-blue-400">{production.inProgress}</p>
                        <p className="text-[10px] text-blue-400/70">בביצוע</p>
                      </div>
                      <div className="text-center p-2 bg-amber-500/10 rounded-lg">
                        <p className="text-xl font-bold text-amber-400">{production.planned}</p>
                        <p className="text-[10px] text-amber-400/70">מתוכננים</p>
                      </div>
                      <div className="text-center p-2 bg-muted/10 rounded-lg">
                        <p className="text-xl font-bold text-muted-foreground">{production.draft}</p>
                        <p className="text-[10px] text-muted-foreground/70">טיוטה</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">יעילות ייצור</span>
                        <span className={`font-medium ${production.efficiency >= 80 ? "text-green-400" : production.efficiency >= 50 ? "text-yellow-400" : "text-red-400"}`}>{production.efficiency}%</span>
                      </div>
                      <MiniProgressBar value={production.efficiency} max={100} color={production.efficiency >= 80 ? "bg-green-500" : production.efficiency >= 50 ? "bg-yellow-500" : "bg-red-500"} />
                      <div className="flex justify-between text-xs text-muted-foreground pt-1">
                        <span>יוצר: {fmtNum(production.totalProduced)}</span>
                        <span>מתוכנן: {fmtNum(production.totalPlanned)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-400" />
                      הזמנות עבודה פעילות
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(production.recentWorkOrders || []).map((wo: { wo_number: string; product_name: string; status: string; priority: string; produced: number; planned: number; due_date: string }, i: number) => (
                        <div key={i} className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg text-xs">
                          <StatusDot status={wo.status} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-foreground font-mono text-[10px]">{wo.wo_number}</span>
                              <span className="text-slate-300 truncate">{wo.product_name}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <MiniProgressBar value={Number(wo.produced)} max={Number(wo.planned)} color="bg-blue-500" />
                              <span className="text-[10px] text-muted-foreground flex-shrink-0">{wo.produced}/{wo.planned}</span>
                            </div>
                          </div>
                          {wo.priority === "high" && <Badge variant="destructive" className="text-[9px] h-4">דחוף</Badge>}
                        </div>
                      ))}
                      {(production.recentWorkOrders || []).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">אין הזמנות עבודה פעילות</p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs text-blue-400 hover:text-blue-300 p-0 h-auto mt-3" onClick={() => navigate("/production/work-orders")}>
                      צפה בכל הזמנות העבודה <ChevronLeft className="w-3 h-3 mr-1" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">אין נתוני ייצור זמינים</div>
            )}
          </TabsContent>

          <TabsContent value="inventory" className="mt-3 space-y-4">
            {inventory ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Boxes className="w-4 h-4 text-violet-400" />
                      סטטוס מלאי
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="text-center p-2 bg-blue-500/10 rounded-lg">
                        <p className="text-xl font-bold text-blue-400">{fmtNum(inventory.totalItems)}</p>
                        <p className="text-[10px] text-blue-400/70">סה"כ פריטים</p>
                      </div>
                      <div className="text-center p-2 bg-amber-500/10 rounded-lg">
                        <p className="text-xl font-bold text-amber-400">{fmtNum(inventory.lowStock)}</p>
                        <p className="text-[10px] text-amber-400/70">מלאי נמוך</p>
                      </div>
                      <div className="text-center p-2 bg-orange-500/10 rounded-lg">
                        <p className="text-xl font-bold text-orange-400">{fmtNum(inventory.belowReorder)}</p>
                        <p className="text-[10px] text-orange-400/70">מתחת להזמנה</p>
                      </div>
                      <div className="text-center p-2 bg-red-500/10 rounded-lg">
                        <p className="text-xl font-bold text-red-400">{fmtNum(inventory.outOfStock)}</p>
                        <p className="text-[10px] text-red-400/70">אזל מהמלאי</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <FinancialRow label="שווי מלאי כולל" value={fmt(inventory.totalValue)} valueColor="text-green-400" bold />
                      <FinancialRow label="ספקים פעילים" value={fmtNum(inventory.supplierCount)} />
                    </div>
                    {(inventory.categoryBreakdown || []).length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs text-muted-foreground mb-2">שווי מלאי לפי קטגוריה</p>
                        <div className="h-40">
                          <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={inventory.categoryBreakdown} layout="vertical" margin={{ top: 5, right: 5, left: 50, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                              <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 9 }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}K`} />
                              <YAxis dataKey="name" type="category" tick={{ fill: "#94a3b8", fontSize: 9 }} width={50} />
                              <Tooltip content={<CustomTooltip />} />
                              <Bar dataKey="value" name="שווי" fill="#8b5cf6" radius={[0, 3, 3, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertOctagon className="w-4 h-4 text-red-400" />
                      פריטים במלאי נמוך
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(inventory.lowStockItems || []).map((item, i) => {
                        const pct = Number(item.reorder_point || item.minimum_stock) > 0 ? Math.round((Number(item.current_stock) / Number(item.reorder_point || item.minimum_stock)) * 100) : 0;
                        return (
                          <div key={i} className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg text-xs">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${pct <= 25 ? "bg-red-400" : pct <= 50 ? "bg-amber-400" : "bg-yellow-400"}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-foreground font-mono text-[10px]">{item.material_number}</span>
                                <span className="text-slate-300 truncate">{item.material_name}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <MiniProgressBar value={Number(item.current_stock)} max={Number(item.reorder_point || item.minimum_stock)} color={pct <= 25 ? "bg-red-500" : "bg-amber-500"} />
                                <span className="text-[10px] text-muted-foreground flex-shrink-0">{item.current_stock}/{item.reorder_point || item.minimum_stock} {item.unit}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {(inventory.lowStockItems || []).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">כל הפריטים במלאי תקין</p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs text-blue-400 hover:text-blue-300 p-0 h-auto mt-3" onClick={() => navigate("/raw-materials")}>
                      צפה בכל המלאי <ChevronLeft className="w-3 h-3 mr-1" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">אין נתוני מלאי זמינים</div>
            )}
          </TabsContent>

          <TabsContent value="projects" className="mt-3 space-y-4">
            {projects ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FolderKanban className="w-4 h-4 text-pink-400" />
                      סטטוס פרויקטים
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                      <div className="text-center p-2 bg-blue-500/10 rounded-lg">
                        <p className="text-xl font-bold text-blue-400">{projects.active}</p>
                        <p className="text-[10px] text-blue-400/70">פעילים</p>
                      </div>
                      <div className="text-center p-2 bg-emerald-500/10 rounded-lg">
                        <p className="text-xl font-bold text-emerald-400">{projects.completed}</p>
                        <p className="text-[10px] text-emerald-400/70">הושלמו</p>
                      </div>
                      <div className="text-center p-2 bg-amber-500/10 rounded-lg">
                        <p className="text-xl font-bold text-amber-400">{projects.onHold}</p>
                        <p className="text-[10px] text-amber-400/70">מוקפאים</p>
                      </div>
                      <div className="text-center p-2 bg-violet-500/10 rounded-lg">
                        <p className="text-xl font-bold text-violet-400">{projects.total}</p>
                        <p className="text-[10px] text-violet-400/70">סה"כ</p>
                      </div>
                    </div>
                    {projects.active > 0 && (
                      <div className="mb-4">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">ממוצע השלמה (פעילים)</span>
                          <span className="text-foreground font-medium">{projects.avgCompletion}%</span>
                        </div>
                        <MiniProgressBar value={projects.avgCompletion} max={100} color="bg-pink-500" />
                      </div>
                    )}
                    <div className="space-y-2 pt-2 border-t border-slate-700/50">
                      <FinancialRow label="הכנסות צפויות" value={fmt(projects.estimatedRevenue)} />
                      <FinancialRow label="הכנסות בפועל" value={fmt(projects.actualRevenue)} valueColor="text-green-400" />
                      <FinancialRow label="עלות צפויה" value={fmt(projects.estimatedCost)} />
                      <FinancialRow label="עלות בפועל" value={fmt(projects.actualCost)} valueColor="text-red-400" />
                      <div className="pt-1 border-t border-slate-700/30">
                        <FinancialRow label="רווח בפועל" value={fmt(projects.actualRevenue - projects.actualCost)} valueColor={(projects.actualRevenue - projects.actualCost) >= 0 ? "text-green-400" : "text-red-400"} bold />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-slate-900/50 border-slate-700/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="w-4 h-4 text-blue-400" />
                      פרויקטים פעילים
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {(projects.recentProjects || []).map((proj, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg text-xs">
                          <StatusDot status={proj.status} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-foreground font-mono text-[10px]">{proj.project_number}</span>
                              <span className="text-slate-300 truncate">{proj.project_name}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <MiniProgressBar value={Number(proj.completion_pct || 0)} max={100} color="bg-pink-500" />
                              <span className="text-[10px] text-muted-foreground flex-shrink-0">{proj.completion_pct || 0}%</span>
                            </div>
                            {proj.customer_name && <span className="text-[10px] text-muted-foreground">{proj.customer_name}</span>}
                          </div>
                          {proj.end_date && (
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">
                              {new Date(proj.end_date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                            </span>
                          )}
                        </div>
                      ))}
                      {(projects.recentProjects || []).length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">אין פרויקטים פעילים</p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs text-blue-400 hover:text-blue-300 p-0 h-auto mt-3" onClick={() => navigate("/projects")}>
                      צפה בכל הפרויקטים <ChevronLeft className="w-3 h-3 mr-1" />
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">אין נתוני פרויקטים זמינים</div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-3">
            <Card className="bg-slate-900/50 border-slate-700/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-violet-400" />
                  פעילות אחרונה (3 ימים)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1.5">
                  {recentActivity.map((a, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 text-xs transition-colors">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        a.action === "create" ? "bg-green-500/10 text-green-400" :
                        a.action === "update" ? "bg-blue-500/10 text-blue-400" :
                        a.action === "delete" ? "bg-red-500/10 text-red-400" :
                        "bg-muted/10 text-muted-foreground"
                      }`}>
                        {a.action === "create" ? <CheckCircle2 className="w-3.5 h-3.5" /> :
                         a.action === "update" ? <Eye className="w-3.5 h-3.5" /> :
                         a.action === "delete" ? <XCircle className="w-3.5 h-3.5" /> :
                         <CircleDot className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-slate-300">{a.action}</span>
                        <span className="text-muted-foreground mx-1">—</span>
                        <span className="text-muted-foreground">{a.entity_type}</span>
                        {a.details && <span className="text-muted-foreground mr-2 truncate"> {getActivityDetailsText(a.details)}</span>}
                      </div>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {new Date(a.created_at).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ))}
                  {recentActivity.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center">
                        <Activity className="w-6 h-6 text-slate-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-400">אין פעילות ב-3 הימים האחרונים</p>
                        <p className="text-xs text-muted-foreground mt-1">פעולות במערכת יופיעו כאן בזמן אמת</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function calculateHealthScore(kpis: Record<string, KpiMetric>, fs: DashboardData["financialSummary"] | undefined, production: ProductionData | null | undefined, alerts: AlertItem[]): number {
  const hasRevenue = (kpis.revenue?.value || 0) > 0;
  const hasOrders = (kpis.openOrders?.value || 0) > 0;
  const hasCustomers = (kpis.activeCustomers?.value || 0) > 0;
  const hasProduction = production != null && (production.inProgress > 0 || production.completed > 0);
  const hasAnyData = hasRevenue || hasOrders || hasCustomers || hasProduction;
  if (!hasAnyData) return 50;
  let score = 50;
  if ((kpis.profitMargin?.value || 0) > 10) score += 15;
  else if ((kpis.profitMargin?.value || 0) > 0) score += 8;
  else if (hasRevenue) score -= 5;
  if ((fs?.budgetVsActual?.utilization || 0) > 0 && (fs?.budgetVsActual?.utilization || 0) <= 80) score += 10;
  else if ((fs?.budgetVsActual?.utilization || 0) > 95) score -= 10;
  if (hasRevenue && (fs?.accountsReceivable?.overdueCount || 0) === 0) score += 10;
  else if ((fs?.accountsReceivable?.overdueCount || 0) > 0) score -= 5;
  if (production && production.efficiency >= 80) score += 10;
  else if (production && production.efficiency >= 50) score += 5;
  const alertPenalty = Math.min(20, alerts.filter(a => a.severity === "high").length * 5 + alerts.filter(a => a.severity === "medium").length * 2);
  score -= alertPenalty;
  return Math.max(0, Math.min(100, score));
}

function HealthScoreCard({ score, kpis, production, alerts, inventory, hasData }: { score: number; kpis?: Record<string, KpiMetric>; production?: ProductionData | null; alerts?: AlertItem[]; inventory?: InventoryData | null; hasData?: boolean }) {
  const color = score >= 80 ? "text-green-400" : score >= 65 ? "text-yellow-400" : "text-red-400";
  const bgColor = score >= 80 ? "from-green-600/20 to-green-600/5" : score >= 65 ? "from-yellow-600/20 to-yellow-600/5" : "from-red-600/20 to-red-600/5";
  const label = !hasData ? "אין מספיק נתונים" : score >= 80 ? "מצוין" : score >= 65 ? "טוב" : "דורש תשומת לב";

  const productionStatus = production == null ? "warn" : production.efficiency >= 80 ? "good" : production.efficiency >= 50 ? "warn" : "bad";
  const productionValue = production == null ? "N/A" : `${production.efficiency}%`;

  const indicators = [
    { label: "רווחיות", status: (kpis?.profitMargin?.value || 0) > 10 ? "good" : (kpis?.profitMargin?.value || 0) > 0 ? "warn" : "bad", value: `${(kpis?.profitMargin?.value || 0).toFixed(1)}%` },
    { label: "יעילות ייצור", status: productionStatus, value: productionValue },
    { label: "מלאי", status: (inventory?.lowStock || 0) === 0 ? "good" : (inventory?.lowStock || 0) <= 3 ? "warn" : "bad", value: `${inventory?.lowStock || 0} נמוכים` },
    { label: "גבייה", status: (kpis?.openInvoices?.value || 0) <= 5 ? "good" : (kpis?.openInvoices?.value || 0) <= 15 ? "warn" : "bad", value: `${kpis?.openInvoices?.value || 0} פתוחות` },
    { label: "התראות", status: (alerts || []).filter(a => a.severity === "high").length === 0 ? "good" : "bad", value: `${(alerts || []).filter(a => a.severity === "high").length} קריטיות` },
  ];

  const statusIcon = (s: string) => s === "good" ? <CheckCircle2 className="w-3 h-3 text-green-400" /> : s === "warn" ? <AlertCircle className="w-3 h-3 text-yellow-400" /> : <XCircle className="w-3 h-3 text-red-400" />;
  const statusColor = (s: string) => s === "good" ? "text-green-400" : s === "warn" ? "text-yellow-400" : "text-red-400";

  return (
    <Card className={`bg-gradient-to-br ${bgColor} border-slate-700/50 p-4`}>
      <div className="flex items-center gap-3 mb-3">
        <div className="relative w-12 h-12">
          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#334155" strokeWidth="3" />
            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none"
              stroke={score >= 80 ? "#22c55e" : score >= 65 ? "#eab308" : "#ef4444"}
              strokeWidth="3" strokeDasharray={`${score}, 100`} strokeLinecap="round" />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${color}`}>{score}</span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">בריאות העסק</p>
          <p className={`text-sm font-bold ${color}`}>{label}</p>
        </div>
      </div>
      <div className="space-y-1.5">
        {indicators.map((ind, i) => (
          <div key={i} className="flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              {statusIcon(ind.status)}
              <span className="text-muted-foreground">{ind.label}</span>
            </div>
            <span className={`font-medium ${statusColor(ind.status)}`}>{ind.value}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

interface KpiCardProps {
  title: string;
  value: string;
  change?: number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  invertChange?: boolean;
  onClick?: () => void;
}

function KpiCard({ title, value, change, subtitle, icon: Icon, iconColor, iconBg, invertChange, onClick }: KpiCardProps) {
  const displayChange = invertChange && change !== undefined ? -change : change;

  return (
    <Card className={`bg-slate-900/50 border-slate-700/50 p-4 transition-all ${onClick ? "cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/50" : ""}`} onClick={onClick}>
      <div className="flex items-start justify-between mb-2">
        <div className={`p-2 rounded-lg ${iconBg}`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        {onClick && <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{title}</p>
      {(change !== undefined || subtitle) && (
        <div className="mt-1.5 flex items-center gap-2">
          {change !== undefined && <ChangeIndicator change={displayChange} />}
          {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
        </div>
      )}
    </Card>
  );
}

function MiniKpiCard({ title, value, subtitle, subtitleColor, icon: Icon, color, onClick }: {
  title: string; value: string; subtitle?: string; subtitleColor?: string; icon: LucideIcon; color: string; onClick?: () => void;
}) {
  return (
    <Card className={`bg-slate-900/50 border-slate-700/50 p-3 transition-all ${onClick ? "cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/50" : ""}`} onClick={onClick}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-[10px] text-muted-foreground truncate">{title}</span>
      </div>
      <p className="text-base font-bold text-foreground">{value}</p>
      {subtitle && <p className={`text-[10px] mt-0.5 ${subtitleColor || "text-muted-foreground"}`}>{subtitle}</p>}
    </Card>
  );
}

interface FinancialRowProps {
  label: string;
  value: string;
  badge?: string;
  badgeColor?: "destructive" | "default";
  valueColor?: string;
  highlight?: boolean;
  bold?: boolean;
}

function FinancialRow({ label, value, badge, badgeColor, valueColor, highlight, bold }: FinancialRowProps) {
  return (
    <div className={`flex items-center justify-between ${highlight ? "bg-slate-800/50 -mx-2 px-2 py-1.5 rounded-lg" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs ${bold ? "font-bold text-foreground" : "text-muted-foreground"}`}>{label}</span>
        {badge && (
          <Badge variant={badgeColor || "default"} className="text-[10px] h-4">{badge}</Badge>
        )}
      </div>
      <span className={`text-sm font-medium ${bold ? "font-bold" : ""} ${valueColor || "text-foreground"}`}>{value}</span>
    </div>
  );
}