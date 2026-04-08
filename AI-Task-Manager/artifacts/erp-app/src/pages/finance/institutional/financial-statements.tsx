import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { authFetch } from "@/lib/utils";
import {
  FileText, Download, TrendingUp, TrendingDown, ArrowUpRight,
  ArrowDownRight, Minus, Printer, Lock, Unlock, CheckCircle,
  Clock, AlertTriangle, BarChart3, DollarSign, Percent
} from "lucide-react";

// ============================================================
// TYPES
// ============================================================
interface StatementLine {
  item: string;
  label: string;
  current: number;
  previous: number;
  budget?: number;
  isSection?: boolean;
  isSubtotal?: boolean;
  isTotal?: boolean;
  indent?: number;
  tooltip?: string;
}

// ============================================================
// FORMATTING
// ============================================================
function fmtCurrency(value: number, showDecimals = false): string {
  const abs = Math.abs(value);
  const formatted = showDecimals
    ? abs.toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : abs >= 1000000
      ? `${(abs / 1000000).toFixed(2)}M`
      : abs >= 1000
        ? `${(abs / 1000).toFixed(0)}K`
        : abs.toLocaleString("he-IL");
  return `${value < 0 ? "(" : ""}₪${formatted}${value < 0 ? ")" : ""}`;
}

function ChangeArrow({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <span className="text-[10px] text-muted-foreground">—</span>;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.5) return <span className="text-[10px] text-muted-foreground">—</span>;
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${pct > 0 ? "text-emerald-600" : "text-red-600"}`}>
      {pct > 0 ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function VarianceBadge({ actual, budget }: { actual: number; budget?: number }) {
  if (!budget) return null;
  const pct = ((actual - budget) / Math.abs(budget)) * 100;
  const favorable = actual >= 0 ? actual >= budget : Math.abs(actual) <= Math.abs(budget);
  return (
    <Badge variant="outline" className={`text-[9px] font-mono ${favorable ? "text-emerald-600 border-emerald-300" : "text-red-600 border-red-300"}`}>
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </Badge>
  );
}

// ============================================================
// P&L DATA
// ============================================================
const pnlData: StatementLine[] = [
  { item: "revenue_section", label: "הכנסות", current: 0, previous: 0, isSection: true },
  { item: "operating_revenue", label: "הכנסות תפעוליות", current: 4200000, previous: 3850000, budget: 4000000, indent: 1, tooltip: "הכנסות מפעילות עסקית שוטפת" },
  { item: "recurring_revenue", label: "הכנסות מחזוריות", current: 680000, previous: 620000, budget: 650000, indent: 1, tooltip: "הכנסות ממנויים וחוזים שוטפים" },
  { item: "other_income", label: "הכנסות אחרות", current: 45000, previous: 38000, indent: 1, tooltip: "ריביות, מענקים, רווחי הון" },
  { item: "total_revenue", label: "סה״כ הכנסות", current: 4925000, previous: 4508000, budget: 4650000, isSubtotal: true },

  { item: "cogs_section", label: "עלות המכירות", current: 0, previous: 0, isSection: true },
  { item: "material_cost", label: "חומרי גלם", current: -1850000, previous: -1720000, budget: -1800000, indent: 1, tooltip: "אלומיניום, זכוכית, ברזל, אביזרים" },
  { item: "labor_cost", label: "עלות עבודה ישירה", current: -520000, previous: -480000, budget: -500000, indent: 1, tooltip: "שכר עובדי ייצור" },
  { item: "subcontractor_cost", label: "קבלני משנה", current: -180000, previous: -165000, budget: -170000, indent: 1, tooltip: "התקנות, הובלה חיצונית" },
  { item: "logistics_cost", label: "לוגיסטיקה והובלה", current: -95000, previous: -88000, budget: -90000, indent: 1, tooltip: "שילוח, מכס, אריזה" },
  { item: "total_cogs", label: "סה״כ עלות המכירות", current: -2645000, previous: -2453000, budget: -2560000, isSubtotal: true },

  { item: "gross_profit", label: "רווח גולמי", current: 2280000, previous: 2055000, budget: 2090000, isTotal: true },

  { item: "opex_section", label: "הוצאות תפעוליות", current: 0, previous: 0, isSection: true },
  { item: "salaries", label: "שכר ונלוות (הנהלה + מכירות)", current: -850000, previous: -790000, budget: -820000, indent: 1 },
  { item: "rent", label: "שכירות ואחזקה", current: -120000, previous: -115000, budget: -120000, indent: 1 },
  { item: "marketing_expenses", label: "שיווק ופרסום", current: -95000, previous: -82000, budget: -100000, indent: 1 },
  { item: "admin_expenses", label: "הוצאות הנהלה וכלליות", current: -65000, previous: -60000, budget: -65000, indent: 1 },
  { item: "software", label: "תוכנה ומנויים", current: -42000, previous: -38000, budget: -40000, indent: 1 },
  { item: "depreciation", label: "פחת והפחתות", current: -78000, previous: -75000, budget: -78000, indent: 1 },
  { item: "utilities", label: "חשמל / מים / גז", current: -28000, previous: -25000, budget: -30000, indent: 1 },
  { item: "total_opex", label: "סה״כ הוצאות תפעוליות", current: -1278000, previous: -1185000, budget: -1253000, isSubtotal: true },

  { item: "ebit", label: "רווח תפעולי (EBIT)", current: 1002000, previous: 870000, budget: 837000, isTotal: true },

  { item: "ebitda_note", label: "EBITDA (EBIT + פחת)", current: 1080000, previous: 945000, budget: 915000, isSubtotal: true },

  { item: "finance_section", label: "מימון", current: 0, previous: 0, isSection: true },
  { item: "finance_income", label: "הכנסות מימון", current: 12000, previous: 8000, indent: 1, tooltip: "ריביות על פיקדונות" },
  { item: "finance_expense", label: "הוצאות מימון", current: -85000, previous: -78000, budget: -80000, indent: 1, tooltip: "ריביות על הלוואות, עמלות בנק" },
  { item: "fx_gain_loss", label: "רווח / הפסד מט״ח", current: -8000, previous: 5000, indent: 1, tooltip: "הפרשי שער" },
  { item: "net_finance", label: "מימון נטו", current: -81000, previous: -65000, isSubtotal: true },

  { item: "pbt", label: "רווח לפני מס", current: 921000, previous: 805000, isTotal: true },

  { item: "tax_section", label: "מסים", current: 0, previous: 0, isSection: true },
  { item: "income_tax", label: "מס הכנסה (23%)", current: -211830, previous: -185150, indent: 1 },
  { item: "deferred_tax", label: "מס נדחה", current: -3500, previous: -2000, indent: 1 },

  { item: "net_income", label: "רווח נקי", current: 705670, previous: 617850, isTotal: true },
];

// ============================================================
// BALANCE SHEET DATA
// ============================================================
const balanceSheetSections: { section: string; sectionHe: string; lines: StatementLine[] }[] = [
  {
    section: "current_assets", sectionHe: "נכסים שוטפים",
    lines: [
      { item: "cash", label: "מזומנים ושווי מזומנים", current: 2850000, previous: 2420000 },
      { item: "short_term_deposits", label: "פיקדונות לזמן קצר", current: 500000, previous: 400000 },
      { item: "accounts_receivable", label: "לקוחות", current: 1680000, previous: 1520000 },
      { item: "receivable_checks", label: "שיקים לגבייה", current: 245000, previous: 210000 },
      { item: "inventory_raw", label: "מלאי חומרי גלם", current: 620000, previous: 580000 },
      { item: "inventory_wip", label: "מלאי בתהליך", current: 180000, previous: 195000 },
      { item: "inventory_finished", label: "מלאי מוצרים מוגמרים", current: 120000, previous: 105000 },
      { item: "prepaid", label: "הוצאות ששולמו מראש", current: 145000, previous: 130000 },
      { item: "vat_receivable", label: 'מע"מ תשומות', current: 85000, previous: 72000 },
      { item: "total_current_assets", label: "סה״כ נכסים שוטפים", current: 6425000, previous: 5632000, isSubtotal: true },
    ],
  },
  {
    section: "non_current_assets", sectionHe: "נכסים לא שוטפים",
    lines: [
      { item: "machinery", label: "מכונות וציוד", current: 2100000, previous: 2050000 },
      { item: "vehicles", label: "כלי רכב", current: 450000, previous: 480000 },
      { item: "office_equipment", label: "ציוד משרדי", current: 120000, previous: 130000 },
      { item: "leasehold", label: "שיפורים במושכר", current: 350000, previous: 320000 },
      { item: "acc_depreciation", label: "פחת נצבר", current: -680000, previous: -620000 },
      { item: "net_fixed", label: "רכוש קבוע נטו", current: 2340000, previous: 2360000, isSubtotal: true },
      { item: "goodwill", label: "מוניטין", current: 180000, previous: 180000 },
      { item: "software_intangible", label: "תוכנה ופיתוח", current: 100000, previous: 120000 },
      { item: "total_non_current", label: "סה״כ נכסים לא שוטפים", current: 2620000, previous: 2660000, isSubtotal: true },
    ],
  },
  {
    section: "total_assets_row", sectionHe: "",
    lines: [
      { item: "total_assets", label: "סה״כ נכסים", current: 9045000, previous: 8292000, isTotal: true },
    ],
  },
  {
    section: "current_liabilities", sectionHe: "התחייבויות שוטפות",
    lines: [
      { item: "accounts_payable", label: "ספקים", current: 1120000, previous: 980000 },
      { item: "payable_checks", label: "שיקים לפירעון", current: 180000, previous: 165000 },
      { item: "accrued_expenses", label: "הוצאות לשלם", current: 340000, previous: 310000 },
      { item: "accrued_salaries", label: "שכר לשלם", current: 210000, previous: 195000 },
      { item: "short_term_loans", label: "הלוואות לזמן קצר", current: 500000, previous: 650000 },
      { item: "current_maturities", label: "חלויות שוטפות של הלוואות", current: 200000, previous: 200000 },
      { item: "tax_payable", label: "מסים לשלם", current: 211830, previous: 185150 },
      { item: "vat_payable", label: 'מע"מ עסקאות', current: 95000, previous: 82000 },
      { item: "deferred_revenue", label: "הכנסות נדחות", current: 180000, previous: 160000 },
      { item: "total_current_liab", label: "סה״כ התחייבויות שוטפות", current: 3036830, previous: 2927150, isSubtotal: true },
    ],
  },
  {
    section: "non_current_liabilities", sectionHe: "התחייבויות לזמן ארוך",
    lines: [
      { item: "long_term_loans", label: "הלוואות לזמן ארוך", current: 1200000, previous: 1400000 },
      { item: "employee_benefits", label: "התחייבויות בגין הטבות עובדים", current: 165000, previous: 150000 },
      { item: "deferred_tax_liab", label: "מסים נדחים", current: 45000, previous: 42000 },
      { item: "total_non_current_liab", label: "סה״כ התחייבויות לזמן ארוך", current: 1410000, previous: 1592000, isSubtotal: true },
    ],
  },
  {
    section: "total_liabilities_row", sectionHe: "",
    lines: [
      { item: "total_liabilities", label: "סה״כ התחייבויות", current: 4446830, previous: 4519150, isTotal: true },
    ],
  },
  {
    section: "equity", sectionHe: "הון עצמי",
    lines: [
      { item: "share_capital", label: "הון מניות", current: 1000000, previous: 1000000 },
      { item: "capital_reserves", label: "קרנות הון", current: 250000, previous: 250000 },
      { item: "retained_earnings", label: "עודפים", current: 2642500, previous: 1905000 },
      { item: "current_profit", label: "רווח תקופה שוטפת", current: 705670, previous: 617850 },
      { item: "total_equity", label: "סה״כ הון עצמי", current: 4598170, previous: 3772850, isTotal: true },
    ],
  },
  {
    section: "total_liab_equity", sectionHe: "",
    lines: [
      { item: "total_liab_equity", label: "סה״כ התחייבויות + הון", current: 9045000, previous: 8292000, isTotal: true },
    ],
  },
];

// ============================================================
// CASHFLOW DATA
// ============================================================
const cashflowSections: { section: string; sectionHe: string; lines: StatementLine[] }[] = [
  {
    section: "operating", sectionHe: "תזרים מפעילות שוטפת",
    lines: [
      { item: "net_income_cf", label: "רווח נקי", current: 705670, previous: 617850, indent: 1 },
      { item: "add_depreciation", label: "(+) פחת והפחתות", current: 78000, previous: 75000, indent: 1 },
      { item: "add_deferred_tax", label: "(+) מס נדחה", current: 3500, previous: 2000, indent: 1 },
      { item: "change_receivables", label: "שינוי בלקוחות", current: -160000, previous: -120000, indent: 1 },
      { item: "change_inventory", label: "שינוי במלאי", current: -40000, previous: 15000, indent: 1 },
      { item: "change_prepaid", label: "שינוי בהוצאות מראש", current: -15000, previous: -8000, indent: 1 },
      { item: "change_payables", label: "שינוי בספקים", current: 140000, previous: 85000, indent: 1 },
      { item: "change_accrued", label: "שינוי בהתחייבויות צבורות", current: 60000, previous: 42000, indent: 1 },
      { item: "change_deferred_rev", label: "שינוי בהכנסות נדחות", current: 20000, previous: -10000, indent: 1 },
      { item: "change_tax", label: "שינוי במסים לשלם", current: 26680, previous: 18000, indent: 1 },
      { item: "collections", label: "גבייה מלקוחות", current: 4780000, previous: 4350000, indent: 1, tooltip: "כולל צ'קים שנפרעו" },
      { item: "payments_suppliers", label: "תשלום לספקים", current: -2450000, previous: -2280000, indent: 1 },
      { item: "salaries_paid", label: "שכר ששולם", current: -850000, previous: -790000, indent: 1 },
      { item: "taxes_paid", label: "מסים ששולמו", current: -184000, previous: -168000, indent: 1 },
      { item: "operating_total", label: "תזרים נטו מפעילות שוטפת", current: 818850, previous: 716850, isSubtotal: true },
    ],
  },
  {
    section: "investing", sectionHe: "תזרים מפעילות השקעה",
    lines: [
      { item: "capex_machinery", label: "רכישת מכונות וציוד", current: -128000, previous: -95000, indent: 1 },
      { item: "capex_vehicles", label: "רכישת כלי רכב", current: 0, previous: -85000, indent: 1 },
      { item: "capex_software", label: "רכישת תוכנה", current: -15000, previous: -20000, indent: 1 },
      { item: "leasehold_improve", label: "שיפורים במושכר", current: -30000, previous: 0, indent: 1 },
      { item: "asset_sales", label: "מכירת נכסים", current: 15000, previous: 0, indent: 1 },
      { item: "deposits", label: "שינוי בפיקדונות", current: -100000, previous: -50000, indent: 1 },
      { item: "investing_total", label: "תזרים נטו מהשקעה", current: -258000, previous: -250000, isSubtotal: true },
    ],
  },
  {
    section: "financing", sectionHe: "תזרים מפעילות מימון",
    lines: [
      { item: "loans_received", label: "הלוואות שנתקבלו", current: 0, previous: 200000, indent: 1 },
      { item: "loan_repayments", label: "החזר הלוואות", current: -350000, previous: -300000, indent: 1 },
      { item: "short_term_change", label: "שינוי באשראי לזמן קצר", current: -150000, previous: 50000, indent: 1 },
      { item: "owner_distribution", label: "חלוקה לבעלים", current: -100000, previous: -80000, indent: 1 },
      { item: "financing_total", label: "תזרים נטו ממימון", current: -600000, previous: -130000, isSubtotal: true },
    ],
  },
];

const netCashMovement = 818850 - 258000 - 600000; // = -39,150
const openingCash = 2850000 + 39150; // reconstruct
const closingCash = 2850000;

// ============================================================
// KEY METRICS
// ============================================================
const keyMetrics = {
  pnl: [
    { label: "Gross Margin", value: (2280000 / 4925000 * 100), prev: (2055000 / 4508000 * 100), unit: "%" },
    { label: "EBIT Margin", value: (1002000 / 4925000 * 100), prev: (870000 / 4508000 * 100), unit: "%" },
    { label: "EBITDA Margin", value: (1080000 / 4925000 * 100), prev: (945000 / 4508000 * 100), unit: "%" },
    { label: "Net Margin", value: (705670 / 4925000 * 100), prev: (617850 / 4508000 * 100), unit: "%" },
  ],
  balance: [
    { label: "Current Ratio", value: 6425000 / 3036830, prev: 5632000 / 2927150, unit: "x" },
    { label: "Debt/Equity", value: (500000 + 200000 + 1200000) / 4598170, prev: (650000 + 200000 + 1400000) / 3772850, unit: "x" },
    { label: "Equity Ratio", value: 4598170 / 9045000, prev: 3772850 / 8292000, unit: "x" },
    { label: "Working Capital", value: (6425000 - 3036830) / 1000000, prev: (5632000 - 2927150) / 1000000, unit: "₪M" },
  ],
  cashflow: [
    { label: "Operating CF", value: 818850 / 1000000, prev: 716850 / 1000000, unit: "₪M" },
    { label: "Free CF", value: (818850 - 258000) / 1000000, prev: (716850 - 250000) / 1000000, unit: "₪M" },
    { label: "Cash Conversion", value: 818850 / 705670 * 100, prev: 716850 / 617850 * 100, unit: "%" },
    { label: "CAPEX/Revenue", value: 173000 / 4925000 * 100, prev: 200000 / 4508000 * 100, unit: "%" },
  ],
};

// ============================================================
// TABLE RENDERER
// ============================================================
function StatementTable({ data, showBudget, showFullNumbers }: { data: StatementLine[]; showBudget: boolean; showFullNumbers: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="bg-muted/40 sticky top-0">
          <TableHead className="text-right w-[320px] font-semibold text-xs">סעיף</TableHead>
          <TableHead className="text-right font-semibold text-xs w-[130px]">תקופה נוכחית</TableHead>
          <TableHead className="text-right font-semibold text-xs w-[130px]">תקופה קודמת</TableHead>
          <TableHead className="text-right font-semibold text-xs w-[70px]">שינוי</TableHead>
          {showBudget && <TableHead className="text-right font-semibold text-xs w-[130px]">תקציב</TableHead>}
          {showBudget && <TableHead className="text-right font-semibold text-xs w-[70px]">סטייה</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.filter(l => !l.isSection || true).map((line, i) => {
          if (line.isSection) {
            return (
              <TableRow key={i} className="bg-primary/5">
                <TableCell colSpan={showBudget ? 6 : 4} className="font-bold text-xs py-1.5 text-primary">{line.label}</TableCell>
              </TableRow>
            );
          }
          return (
            <TableRow key={i} className={`
              ${line.isTotal ? "bg-primary/10 font-bold border-t-2 border-primary/30" : ""}
              ${line.isSubtotal ? "bg-muted/30 font-semibold border-t border-border" : ""}
              hover:bg-muted/10
            `}>
              <TableCell className={`${line.indent ? "pr-8" : ""} ${line.isTotal ? "text-sm" : "text-xs"}`}>
                {line.label}
              </TableCell>
              <TableCell className={`font-mono text-left ${line.current < 0 ? "text-red-600" : ""} ${line.isTotal ? "text-sm" : "text-xs"}`}>
                {showFullNumbers ? fmtCurrency(line.current, true) : fmtCurrency(line.current)}
              </TableCell>
              <TableCell className="font-mono text-left text-muted-foreground text-xs">
                {showFullNumbers ? fmtCurrency(line.previous, true) : fmtCurrency(line.previous)}
              </TableCell>
              <TableCell><ChangeArrow current={line.current} previous={line.previous} /></TableCell>
              {showBudget && (
                <TableCell className="font-mono text-left text-muted-foreground text-xs">
                  {line.budget ? (showFullNumbers ? fmtCurrency(line.budget, true) : fmtCurrency(line.budget)) : "—"}
                </TableCell>
              )}
              {showBudget && <TableCell><VarianceBadge actual={line.current} budget={line.budget} /></TableCell>}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function MetricsStrip({ metrics }: { metrics: { label: string; value: number; prev: number; unit: string }[] }) {
  return (
    <div className="grid grid-cols-4 gap-3 mt-3">
      {metrics.map((m, i) => {
        const improved = m.value > m.prev;
        return (
          <Card key={i} className="border-border">
            <CardContent className="pt-3 pb-2 text-center">
              <p className="text-[10px] text-muted-foreground font-medium">{m.label}</p>
              <p className="text-lg font-bold font-mono">
                {m.unit === "%" ? `${m.value.toFixed(1)}%` : m.unit === "x" ? `${m.value.toFixed(2)}x` : `₪${m.value.toFixed(2)}M`}
              </p>
              <div className="flex items-center justify-center gap-1">
                <span className={`text-[10px] ${improved ? "text-emerald-600" : "text-red-600"}`}>
                  {improved ? "↑" : "↓"} קודם: {m.unit === "%" ? `${m.prev.toFixed(1)}%` : m.unit === "x" ? `${m.prev.toFixed(2)}x` : `₪${m.prev.toFixed(2)}M`}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function FinancialStatements() {
  const [period, setPeriod] = useState("2026-Q1");
  const [showBudget, setShowBudget] = useState(true);
  const [showFullNumbers, setShowFullNumbers] = useState(false);

  // API queries
  const { data: apiPnl } = useQuery({
    queryKey: ["/api/fin/quant/statements/pnl", period],
    queryFn: () => authFetch(`/api/fin/quant/statements/pnl?periodStart=2026-01-01&periodEnd=2026-03-31`).then(r => r.json()).catch(() => []),
  });

  const { data: periodCloseData } = useQuery({
    queryKey: ["/api/fin/quant/period-close"],
    queryFn: () => authFetch("/api/fin/quant/period-close").then(r => r.json()).catch(() => []),
  });

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" /> דוחות כספיים
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">מאזן | רווח והפסד | תזרים מזומנים | דוח הון</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2026-Q1">Q1 2026</SelectItem>
              <SelectItem value="2025-Q4">Q4 2025</SelectItem>
              <SelectItem value="2025-FY">שנתי 2025</SelectItem>
              <SelectItem value="2026-01">ינואר 2026</SelectItem>
              <SelectItem value="2026-02">פברואר 2026</SelectItem>
              <SelectItem value="2026-03">מרץ 2026</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5 border rounded-md px-2 py-1">
            <Switch checked={showBudget} onCheckedChange={setShowBudget} /><Label className="text-[10px]">תקציב</Label>
          </div>
          <div className="flex items-center gap-1.5 border rounded-md px-2 py-1">
            <Switch checked={showFullNumbers} onCheckedChange={setShowFullNumbers} /><Label className="text-[10px]">מספרים מלאים</Label>
          </div>
          <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5 ml-1" /> PDF</Button>
          <Button variant="outline" size="sm"><Printer className="h-3.5 w-3.5 ml-1" /> הדפסה</Button>
        </div>
      </div>

      <Tabs defaultValue="pnl">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="pnl" className="gap-1 text-xs"><BarChart3 className="h-3.5 w-3.5" /> רווח והפסד</TabsTrigger>
          <TabsTrigger value="balance" className="gap-1 text-xs"><DollarSign className="h-3.5 w-3.5" /> מאזן</TabsTrigger>
          <TabsTrigger value="cashflow" className="gap-1 text-xs"><TrendingUp className="h-3.5 w-3.5" /> תזרים</TabsTrigger>
          <TabsTrigger value="equity" className="gap-1 text-xs"><Percent className="h-3.5 w-3.5" /> הון</TabsTrigger>
        </TabsList>

        {/* P&L */}
        <TabsContent value="pnl">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">דוח רווח והפסד</CardTitle>
                  <CardDescription>לתקופה שהסתיימה 31.03.2026 | במונחי ₪</CardDescription>
                </div>
                <Badge variant="outline"><Clock className="h-3 w-3 ml-1" /> טרם נסגר</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[600px]">
                <StatementTable data={pnlData} showBudget={showBudget} showFullNumbers={showFullNumbers} />
              </ScrollArea>
            </CardContent>
          </Card>
          <MetricsStrip metrics={keyMetrics.pnl} />
        </TabsContent>

        {/* Balance Sheet */}
        <TabsContent value="balance">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">מאזן</CardTitle>
                  <CardDescription>ליום 31.03.2026 | במונחי ₪</CardDescription>
                </div>
                {balanceSheetSections.find(s => s.section === "total_assets_row")?.lines[0].current ===
                 balanceSheetSections.find(s => s.section === "total_liab_equity")?.lines[0].current
                  ? <Badge className="bg-emerald-100 text-emerald-700"><CheckCircle className="h-3 w-3 ml-1" /> מאזן מאוזן</Badge>
                  : <Badge className="bg-red-100 text-red-700"><AlertTriangle className="h-3 w-3 ml-1" /> חוסר איזון!</Badge>
                }
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 sticky top-0">
                      <TableHead className="text-right w-[320px] font-semibold text-xs">סעיף</TableHead>
                      <TableHead className="text-right font-semibold text-xs w-[130px]">31.03.2026</TableHead>
                      <TableHead className="text-right font-semibold text-xs w-[130px]">31.12.2025</TableHead>
                      <TableHead className="text-right font-semibold text-xs w-[70px]">שינוי</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {balanceSheetSections.map((section, si) => (
                      <>
                        {section.sectionHe && (
                          <TableRow key={`sh-${si}`} className="bg-primary/5">
                            <TableCell colSpan={4} className="font-bold text-xs py-1.5 text-primary">{section.sectionHe}</TableCell>
                          </TableRow>
                        )}
                        {section.lines.map((line, li) => (
                          <TableRow key={`${si}-${li}`} className={`
                            ${line.isTotal ? "bg-primary/10 font-bold border-t-2 border-primary/30" : ""}
                            ${line.isSubtotal ? "bg-muted/30 font-semibold border-t" : ""}
                            hover:bg-muted/10
                          `}>
                            <TableCell className={`${line.isTotal ? "text-sm" : "text-xs"} ${!line.isTotal && !line.isSubtotal ? "pr-8" : ""}`}>{line.label}</TableCell>
                            <TableCell className={`font-mono text-left ${line.current < 0 ? "text-red-600" : ""} ${line.isTotal ? "text-sm" : "text-xs"}`}>
                              {showFullNumbers ? fmtCurrency(line.current, true) : fmtCurrency(line.current)}
                            </TableCell>
                            <TableCell className="font-mono text-left text-muted-foreground text-xs">
                              {showFullNumbers ? fmtCurrency(line.previous, true) : fmtCurrency(line.previous)}
                            </TableCell>
                            <TableCell><ChangeArrow current={line.current} previous={line.previous} /></TableCell>
                          </TableRow>
                        ))}
                      </>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
          <MetricsStrip metrics={keyMetrics.balance} />
        </TabsContent>

        {/* Cash Flow */}
        <TabsContent value="cashflow">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">דוח תזרים מזומנים</CardTitle>
              <CardDescription>Q1 2026 | שיטה ישירה + עקיפה</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 sticky top-0">
                      <TableHead className="text-right w-[320px] font-semibold text-xs">סעיף</TableHead>
                      <TableHead className="text-right font-semibold text-xs w-[130px]">תקופה נוכחית</TableHead>
                      <TableHead className="text-right font-semibold text-xs w-[130px]">תקופה קודמת</TableHead>
                      <TableHead className="text-right font-semibold text-xs w-[70px]">שינוי</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashflowSections.map((section, si) => (
                      <>
                        <TableRow key={`cfs-${si}`} className="bg-primary/5">
                          <TableCell colSpan={4} className="font-bold text-xs py-1.5 text-primary">{section.sectionHe}</TableCell>
                        </TableRow>
                        {section.lines.map((line, li) => (
                          <TableRow key={`${si}-${li}`} className={`
                            ${line.isSubtotal ? "bg-muted/30 font-semibold border-t" : ""}
                            hover:bg-muted/10
                          `}>
                            <TableCell className={`${line.indent ? "pr-8" : ""} text-xs`}>{line.label}</TableCell>
                            <TableCell className={`font-mono text-left text-xs ${line.current < 0 ? "text-red-600" : "text-emerald-600"}`}>
                              {showFullNumbers ? fmtCurrency(line.current, true) : fmtCurrency(line.current)}
                            </TableCell>
                            <TableCell className="font-mono text-left text-muted-foreground text-xs">
                              {showFullNumbers ? fmtCurrency(line.previous, true) : fmtCurrency(line.previous)}
                            </TableCell>
                            <TableCell><ChangeArrow current={line.current} previous={line.previous} /></TableCell>
                          </TableRow>
                        ))}
                      </>
                    ))}
                    {/* Net movement + opening/closing */}
                    <TableRow className="bg-primary/10 font-bold border-t-2 border-primary/30">
                      <TableCell className="text-sm">תנועה נטו במזומנים</TableCell>
                      <TableCell className={`font-mono text-sm text-left ${netCashMovement < 0 ? "text-red-700" : "text-emerald-700"}`}>
                        {fmtCurrency(netCashMovement)}
                      </TableCell>
                      <TableCell className="font-mono text-left text-muted-foreground text-xs">{fmtCurrency(336850)}</TableCell>
                      <TableCell />
                    </TableRow>
                    <TableRow className="hover:bg-muted/10">
                      <TableCell className="text-xs pr-8">יתרת פתיחה</TableCell>
                      <TableCell className="font-mono text-xs text-left">{fmtCurrency(openingCash)}</TableCell>
                      <TableCell /><TableCell />
                    </TableRow>
                    <TableRow className="bg-primary/10 font-bold border-t-2">
                      <TableCell className="text-sm">יתרת סגירה</TableCell>
                      <TableCell className="font-mono text-sm text-left">{fmtCurrency(closingCash)}</TableCell>
                      <TableCell /><TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
          <MetricsStrip metrics={keyMetrics.cashflow} />
        </TabsContent>

        {/* Equity Statement */}
        <TabsContent value="equity">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">דוח שינויים בהון העצמי</CardTitle>
              <CardDescription>Q1 2026</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">רכיב</TableHead>
                    <TableHead className="text-right text-xs font-semibold">יתרת פתיחה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">רווח נקי</TableHead>
                    <TableHead className="text-right text-xs font-semibold">חלוקה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">אחר</TableHead>
                    <TableHead className="text-right text-xs font-semibold">יתרת סגירה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { label: "הון מניות", opening: 1000000, profit: 0, distribution: 0, other: 0, closing: 1000000 },
                    { label: "קרנות הון", opening: 250000, profit: 0, distribution: 0, other: 0, closing: 250000 },
                    { label: "עודפים", opening: 2522850, profit: 705670, distribution: -100000, other: 0, closing: 3128520 },
                    { label: "רווח נקי (תקופה קודמת)", opening: 617850, profit: 0, distribution: 0, other: -617850, closing: 0 },
                  ].map((row, i) => (
                    <TableRow key={i} className="hover:bg-muted/10">
                      <TableCell className="font-medium text-xs">{row.label}</TableCell>
                      <TableCell className="font-mono text-xs text-left">{fmtCurrency(row.opening)}</TableCell>
                      <TableCell className={`font-mono text-xs text-left ${row.profit > 0 ? "text-emerald-600" : ""}`}>
                        {row.profit ? fmtCurrency(row.profit) : "—"}
                      </TableCell>
                      <TableCell className={`font-mono text-xs text-left ${row.distribution < 0 ? "text-red-600" : ""}`}>
                        {row.distribution ? fmtCurrency(row.distribution) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-left text-muted-foreground">
                        {row.other ? fmtCurrency(row.other) : "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-left font-bold">{fmtCurrency(row.closing)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-primary/10 font-bold border-t-2 border-primary/30">
                    <TableCell className="text-sm">סה״כ הון עצמי</TableCell>
                    <TableCell className="font-mono text-sm text-left">{fmtCurrency(4390700)}</TableCell>
                    <TableCell className="font-mono text-sm text-left text-emerald-700">{fmtCurrency(705670)}</TableCell>
                    <TableCell className="font-mono text-sm text-left text-red-700">{fmtCurrency(-100000)}</TableCell>
                    <TableCell className="font-mono text-sm text-left">{fmtCurrency(-617850)}</TableCell>
                    <TableCell className="font-mono text-sm text-left">{fmtCurrency(4378520)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
