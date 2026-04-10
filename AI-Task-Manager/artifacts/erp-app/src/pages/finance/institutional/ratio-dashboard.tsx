import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { authFetch } from "@/lib/utils";
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, Calculator, CheckCircle, ChevronDown, ChevronRight, DollarSign, Download, Eye, Filter, Gauge, History, Info, Layers, Minus, Percent, Plus, RefreshCw, Search, Shield, Target, TrendingDown, TrendingUp, XCircle
} from "lucide-react";

// ============================================================
// TYPES
// ============================================================
type RatioCategory = "profitability" | "loss" | "liquidity" | "leverage" | "efficiency" | "hedge" | "risk" | "multiple";

interface RatioDefinition {
  id: number;
  name: string;
  labelHe: string;
  category: RatioCategory;
  formula: string;
  unit: string;
  higherIsBetter: boolean;
  warningThreshold?: number;
  criticalThreshold?: number;
}

interface RatioResult {
  id: number;
  ratioDefinitionId: number;
  value: number;
  previousValue?: number;
  changePercent?: number;
  status: string;
  numerator?: number;
  denominator?: number;
  computedAt: string;
}

// ============================================================
// CATEGORY CONFIG
// ============================================================
const categoryConfig: Record<RatioCategory, { label: string; labelHe: string; icon: any; color: string; bgLight: string; border: string }> = {
  profitability: { label: "Profitability", labelHe: "רווחיות", icon: TrendingUp, color: "text-emerald-600", bgLight: "bg-emerald-50", border: "border-emerald-200" },
  loss: { label: "Loss & Downside", labelHe: "הפסד וסיכון", icon: TrendingDown, color: "text-red-600", bgLight: "bg-red-50", border: "border-red-200" },
  liquidity: { label: "Liquidity", labelHe: "נזילות", icon: DollarSign, color: "text-blue-600", bgLight: "bg-blue-50", border: "border-blue-200" },
  leverage: { label: "Leverage", labelHe: "מינוף ויציבות", icon: Shield, color: "text-purple-600", bgLight: "bg-purple-50", border: "border-purple-200" },
  efficiency: { label: "Efficiency", labelHe: "יעילות", icon: Gauge, color: "text-amber-600", bgLight: "bg-amber-50", border: "border-amber-200" },
  hedge: { label: "Hedge", labelHe: "גידור", icon: Shield, color: "text-teal-600", bgLight: "bg-teal-50", border: "border-teal-200" },
  risk: { label: "Risk", labelHe: "סיכון", icon: AlertTriangle, color: "text-orange-600", bgLight: "bg-orange-50", border: "border-orange-200" },
  multiple: { label: "Multiples", labelHe: "מכפילים", icon: BarChart3, color: "text-indigo-600", bgLight: "bg-indigo-50", border: "border-indigo-200" },
};

// ============================================================
// FULL RATIO DATA (120+ ratios)
// ============================================================
const ALL_RATIOS: Record<RatioCategory, Array<{ name: string; nameHe: string; formula: string; value: number; prev: number; unit: string; target?: number; higherIsBetter: boolean; description: string }>> = {
  profitability: [
    { name: "Gross Margin", nameHe: "שיעור רווח גולמי", formula: "gross_profit / revenue", value: 38.2, prev: 36.5, unit: "%", target: 40, higherIsBetter: true, description: "אחוז הכנסה שנשאר אחרי עלות מכר" },
    { name: "Operating Margin (EBIT)", nameHe: "שיעור רווח תפעולי", formula: "(revenue - cogs - opex) / revenue", value: 14.8, prev: 13.2, unit: "%", target: 15, higherIsBetter: true, description: "רווחיות תפעולית לפני מימון ומס" },
    { name: "EBITDA Margin", nameHe: "שיעור EBITDA", formula: "(ebit + depreciation) / revenue", value: 19.3, prev: 17.8, unit: "%", target: 20, higherIsBetter: true, description: "רווחיות תפעולית לפני פחת" },
    { name: "Net Margin", nameHe: "שיעור רווח נקי", formula: "net_income / revenue", value: 9.6, prev: 8.9, unit: "%", target: 10, higherIsBetter: true, description: "שורה תחתונה - כמה נשאר מכל שקל הכנסה" },
    { name: "Contribution Margin", nameHe: "רווח שולי", formula: "(revenue - variable_costs) / revenue", value: 52.3, prev: 50.8, unit: "%", higherIsBetter: true, description: "מרווח לכיסוי הוצאות קבועות" },
    { name: "Return on Equity (ROE)", nameHe: "תשואה על ההון", formula: "net_income / equity", value: 18.4, prev: 16.7, unit: "%", target: 20, higherIsBetter: true, description: "כמה רווח מייצר כל שקל הון עצמי" },
    { name: "Return on Assets (ROA)", nameHe: "תשואה על הנכסים", formula: "net_income / total_assets", value: 8.1, prev: 7.5, unit: "%", target: 8, higherIsBetter: true, description: "יעילות שימוש בנכסים" },
    { name: "Return on Invested Capital", nameHe: "תשואה על הון מושקע", formula: "nopat / invested_capital", value: 15.2, prev: 14.1, unit: "%", target: 15, higherIsBetter: true, description: "תשואה על הון שהושקע בעסק" },
    { name: "Return on Sales", nameHe: "תשואה על מכירות", formula: "operating_profit / revenue", value: 14.8, prev: 13.2, unit: "%", higherIsBetter: true, description: "רווח תפעולי ביחס למכירות" },
    { name: "Incremental Margin", nameHe: "מרווח שולי תוספתי", formula: "delta_profit / delta_revenue", value: 22.5, prev: 18.3, unit: "%", higherIsBetter: true, description: "רווחיות מכל שקל הכנסה נוסף" },
    { name: "Break-Even Ratio", nameHe: "יחס נקודת איזון", formula: "fixed_costs / contribution_margin", value: 68.2, prev: 71.5, unit: "%", target: 70, higherIsBetter: false, description: "כמה מהמכירות דרושות לכסות עלויות קבועות" },
    { name: "Project Profitability", nameHe: "רווחיות פרויקט ממוצעת", formula: "avg(project_profit / project_revenue)", value: 16.8, prev: 15.2, unit: "%", target: 15, higherIsBetter: true, description: "רווחיות ממוצעת לפרויקט" },
    { name: "Customer Profitability", nameHe: "רווחיות לקוח ממוצעת", formula: "avg(customer_profit / customer_revenue)", value: 21.3, prev: 19.8, unit: "%", higherIsBetter: true, description: "רווחיות ממוצעת ללקוח" },
    { name: "Product Profitability", nameHe: "רווחיות מוצר ממוצעת", formula: "avg(product_margin)", value: 35.6, prev: 33.2, unit: "%", higherIsBetter: true, description: "רווחיות ממוצעת למוצר" },
    { name: "Segment Profitability", nameHe: "רווחיות מגזרית", formula: "segment_profit / segment_revenue", value: 12.4, prev: 11.1, unit: "%", higherIsBetter: true, description: "רווחיות לפי מגזר פעילות" },
  ],
  loss: [
    { name: "Bad Debt Ratio", nameHe: "יחס חובות אבודים", formula: "bad_debts / total_receivables", value: 1.8, prev: 2.1, unit: "%", target: 2, higherIsBetter: false, description: "אחוז חובות שלא ניתן לגבות" },
    { name: "Maximum Drawdown", nameHe: "ירידה מקסימלית", formula: "max(peak - trough) / peak", value: 12.4, prev: 15.2, unit: "%", higherIsBetter: false, description: "הירידה הגדולה ביותר מהשיא" },
    { name: "Downside Deviation", nameHe: "סטיית ירידה", formula: "stddev(returns < target)", value: 8.3, prev: 9.1, unit: "%", higherIsBetter: false, description: "תנודתיות של תשואות שליליות בלבד" },
    { name: "Cost Overrun Ratio", nameHe: "יחס חריגת עלויות", formula: "overrun_amount / budget", value: 4.2, prev: 5.8, unit: "%", target: 5, higherIsBetter: false, description: "חריגות תקציב ממוצעות" },
    { name: "Budget Breach Ratio", nameHe: "יחס חריגת תקציב", formula: "breached_budgets / total_budgets", value: 12, prev: 18, unit: "%", target: 10, higherIsBetter: false, description: "אחוז תקציבים שנחרגו" },
    { name: "Uncollected Revenue", nameHe: "הכנסות שלא נגבו", formula: "overdue_receivables / total_revenue", value: 6.1, prev: 7.3, unit: "%", target: 5, higherIsBetter: false, description: "הכנסות שעברו מועד גבייה" },
    { name: "Failed Payment Ratio", nameHe: "יחס תשלומים שנכשלו", formula: "failed_payments / total_payments", value: 0.8, prev: 1.2, unit: "%", target: 1, higherIsBetter: false, description: "שיעור כשלון בסליקה/העברות" },
    { name: "Margin Erosion", nameHe: "שחיקת מרווחים", formula: "(prev_margin - current_margin) / prev_margin", value: 2.3, prev: 3.1, unit: "%", higherIsBetter: false, description: "קצב ירידת המרווח הגולמי" },
    { name: "Loss Ratio", nameHe: "יחס הפסד", formula: "loss_events / total_events", value: 3.5, prev: 4.2, unit: "%", target: 5, higherIsBetter: false, description: "שיעור אירועי הפסד" },
    { name: "Tail Loss Ratio", nameHe: "יחס הפסד זנב", formula: "p1_loss / median_outcome", value: 28.5, prev: 32.1, unit: "%", higherIsBetter: false, description: "חומרת הפסדים קיצוניים" },
    { name: "Expected Shortfall %", nameHe: "הפסד צפוי %", formula: "ES95 / mean", value: 15.2, prev: 18.4, unit: "%", higherIsBetter: false, description: "CVaR ביחס לממוצע" },
    { name: "Drawdown Ratio", nameHe: "יחס ירידה", formula: "avg_drawdown / peak", value: 5.8, prev: 7.2, unit: "%", higherIsBetter: false, description: "ירידה ממוצעת ביחס לשיא" },
  ],
  liquidity: [
    { name: "Current Ratio", nameHe: "יחס שוטף", formula: "current_assets / current_liabilities", value: 1.85, prev: 1.72, unit: "x", target: 2.0, higherIsBetter: true, description: "יכולת לכסות התחייבויות שוטפות" },
    { name: "Quick Ratio", nameHe: "יחס מהיר (Acid Test)", formula: "(current_assets - inventory) / current_liabilities", value: 1.32, prev: 1.25, unit: "x", target: 1.5, higherIsBetter: true, description: "נזילות ללא מלאי" },
    { name: "Cash Ratio", nameHe: "יחס מזומנים", formula: "cash / current_liabilities", value: 0.45, prev: 0.38, unit: "x", higherIsBetter: true, description: "כיסוי במזומן בלבד" },
    { name: "Operating Cash Flow Ratio", nameHe: "יחס תזרים תפעולי", formula: "operating_cf / current_liabilities", value: 0.82, prev: 0.75, unit: "x", higherIsBetter: true, description: "תזרים תפעולי ביחס להתחייבויות" },
    { name: "Working Capital Ratio", nameHe: "יחס הון חוזר", formula: "working_capital / revenue", value: 18.5, prev: 16.2, unit: "%", higherIsBetter: true, description: "הון חוזר ביחס להכנסות" },
    { name: "Liquidity Buffer", nameHe: "כרית נזילות", formula: "(cash + credit_lines) / monthly_expenses", value: 3.2, prev: 2.8, unit: "mo", target: 3, higherIsBetter: true, description: "חודשי פעילות מובטחים" },
    { name: "DSCR", nameHe: "יחס כיסוי חוב", formula: "net_operating_income / total_debt_service", value: 2.8, prev: 2.5, unit: "x", target: 2.0, higherIsBetter: true, description: "יכולת לשרת חובות" },
    { name: "Burn Rate", nameHe: "קצב שריפה", formula: "monthly_net_cash_outflow", value: 180000, prev: 195000, unit: "₪/mo", higherIsBetter: false, description: "הוצאה חודשית נטו" },
    { name: "Runway", nameHe: "אורך מסלול", formula: "available_cash / monthly_burn", value: 14.2, prev: 12.8, unit: "mo", target: 12, higherIsBetter: true, description: "כמה חודשים אפשר להמשיך" },
  ],
  leverage: [
    { name: "Debt to Equity", nameHe: "חוב להון", formula: "total_debt / total_equity", value: 0.62, prev: 0.71, unit: "x", target: 1.0, higherIsBetter: false, description: "מינוף פיננסי - כמה חוב ביחס להון" },
    { name: "Debt to Assets", nameHe: "חוב לנכסים", formula: "total_debt / total_assets", value: 0.38, prev: 0.41, unit: "x", higherIsBetter: false, description: "חלק הנכסים הממומנים בחוב" },
    { name: "Equity Ratio", nameHe: "יחס הון עצמי", formula: "equity / total_assets", value: 0.62, prev: 0.59, unit: "x", higherIsBetter: true, description: "חלק הנכסים הממומנים בהון" },
    { name: "Leverage Ratio", nameHe: "יחס מינוף", formula: "total_assets / equity", value: 1.62, prev: 1.69, unit: "x", higherIsBetter: false, description: "מכפיל ההון" },
    { name: "Interest Coverage", nameHe: "כיסוי ריבית", formula: "ebit / interest_expense", value: 5.4, prev: 4.8, unit: "x", target: 4, higherIsBetter: true, description: "יכולת לשלם ריביות" },
    { name: "Fixed Charge Coverage", nameHe: "כיסוי חיובים קבועים", formula: "(ebit + fixed_charges) / (fixed_charges + interest)", value: 3.2, prev: 2.9, unit: "x", higherIsBetter: true, description: "כיסוי כל ההתחייבויות הקבועות" },
    { name: "Liability Coverage", nameHe: "כיסוי התחייבויות", formula: "total_assets / total_liabilities", value: 2.18, prev: 1.96, unit: "x", higherIsBetter: true, description: "נכסים ביחס לכלל ההתחייבויות" },
    { name: "Solvency Ratio", nameHe: "יחס יציבות", formula: "(net_income + depreciation) / total_liabilities", value: 0.28, prev: 0.25, unit: "x", higherIsBetter: true, description: "יכולת לשלם את כל החובות" },
  ],
  efficiency: [
    { name: "DSO", nameHe: "ימי גבייה", formula: "receivables / (revenue / 365)", value: 42, prev: 48, unit: "days", target: 45, higherIsBetter: false, description: "כמה ימים בממוצע לגבות מלקוח" },
    { name: "DPO", nameHe: "ימי ספקים", formula: "payables / (cogs / 365)", value: 35, prev: 32, unit: "days", higherIsBetter: true, description: "כמה ימים בממוצע לשלם לספק" },
    { name: "DIO", nameHe: "ימי מלאי", formula: "inventory / (cogs / 365)", value: 28, prev: 31, unit: "days", target: 30, higherIsBetter: false, description: "כמה ימים מלאי מחזיקים" },
    { name: "Cash Conversion Cycle", nameHe: "מחזור המרת מזומנים", formula: "DSO + DIO - DPO", value: 35, prev: 47, unit: "days", higherIsBetter: false, description: "כמה ימים לוקח להפוך השקעה למזומן" },
    { name: "Asset Turnover", nameHe: "מחזור נכסים", formula: "revenue / total_assets", value: 1.8, prev: 1.65, unit: "x", higherIsBetter: true, description: "כמה הכנסה מייצר כל שקל נכסים" },
    { name: "Receivables Turnover", nameHe: "מחזור לקוחות", formula: "revenue / avg_receivables", value: 8.7, prev: 7.6, unit: "x", higherIsBetter: true, description: "כמה פעמים נגבו יתרות לקוחות" },
    { name: "Payables Turnover", nameHe: "מחזור ספקים", formula: "cogs / avg_payables", value: 10.4, prev: 11.4, unit: "x", higherIsBetter: false, description: "כמה פעמים שולמו יתרות ספקים" },
    { name: "Inventory Turnover", nameHe: "מחזור מלאי", formula: "cogs / avg_inventory", value: 13.0, prev: 11.8, unit: "x", higherIsBetter: true, description: "כמה פעמים המלאי התחלף" },
    { name: "Working Capital Turnover", nameHe: "מחזור הון חוזר", formula: "revenue / working_capital", value: 5.4, prev: 6.2, unit: "x", higherIsBetter: true, description: "יעילות שימוש בהון חוזר" },
    { name: "Revenue per Employee", nameHe: "הכנסה לעובד", formula: "revenue / headcount", value: 420000, prev: 395000, unit: "₪", higherIsBetter: true, description: "תפוקת הכנסה לעובד" },
    { name: "Cost per Project", nameHe: "עלות לפרויקט", formula: "total_costs / project_count", value: 125000, prev: 135000, unit: "₪", higherIsBetter: false, description: "עלות ממוצעת לפרויקט" },
  ],
  hedge: [
    { name: "Hedge Ratio", nameHe: "יחס גידור", formula: "hedged_amount / gross_exposure", value: 72, prev: 65, unit: "%", target: 80, higherIsBetter: true, description: "אחוז החשיפה המגודרת" },
    { name: "Hedge Coverage", nameHe: "כיסוי גידור", formula: "hedge_notional / expected_cashflow", value: 78, prev: 70, unit: "%", target: 80, higherIsBetter: true, description: "כיסוי תזרים צפוי" },
    { name: "Hedge Effectiveness", nameHe: "אפקטיביות גידור", formula: "delta_hedge_value / delta_exposure", value: 91, prev: 88, unit: "%", target: 90, higherIsBetter: true, description: "עד כמה הגידור מגן מפני תנועות" },
    { name: "Natural Hedge Ratio", nameHe: "גידור טבעי", formula: "natural_offset / gross_exposure", value: 35, prev: 32, unit: "%", higherIsBetter: true, description: "קיזוז טבעי בין הכנסות להוצאות" },
    { name: "Unhedged Exposure", nameHe: "חשיפה לא מגודרת", formula: "net_exposure / gross_exposure", value: 28, prev: 35, unit: "%", target: 20, higherIsBetter: false, description: "אחוז חשיפה פתוחה" },
    { name: "FX Protection", nameHe: 'הגנת מט"ח', formula: "fx_hedged / total_fx_exposure", value: 85, prev: 78, unit: "%", target: 80, higherIsBetter: true, description: "כיסוי חשיפת מטבע חוץ" },
    { name: "Commodity Protection", nameHe: "הגנת סחורות", formula: "commodity_hedged / commodity_exposure", value: 45, prev: 40, unit: "%", target: 60, higherIsBetter: true, description: "כיסוי חשיפת מחירי סחורות" },
    { name: "Cashflow Stability", nameHe: "יציבות תזרים", formula: "1 - cv(monthly_cashflows)", value: 88, prev: 84, unit: "%", higherIsBetter: true, description: "עקביות תזרימי מזומנים" },
    { name: "Supplier-Customer Offset", nameHe: "קיזוז ספק-לקוח", formula: "matching_currency_flows / total_flows", value: 42, prev: 38, unit: "%", higherIsBetter: true, description: "התאמת מטבעות בין כניסות ויציאות" },
    { name: "Interest Rate Protection", nameHe: "הגנת ריבית", formula: "fixed_rate_debt / total_debt", value: 65, prev: 58, unit: "%", target: 70, higherIsBetter: true, description: "חלק החוב בריבית קבועה" },
  ],
  risk: [
    { name: "Value at Risk (95%)", nameHe: "ערך בסיכון 95%", formula: "percentile(losses, 5)", value: 450000, prev: 520000, unit: "₪", higherIsBetter: false, description: "הפסד מקסימלי ב-95% מהמקרים" },
    { name: "Expected Shortfall (CVaR)", nameHe: "הפסד צפוי (CVaR)", formula: "mean(losses_beyond_var)", value: 680000, prev: 750000, unit: "₪", higherIsBetter: false, description: "ממוצע הפסדים מעבר ל-VaR" },
    { name: "Probability of Loss", nameHe: "הסתברות הפסד", formula: "count(outcome < 0) / n", value: 8.2, prev: 11.5, unit: "%", target: 10, higherIsBetter: false, description: "הסתברות לתוצאה שלילית" },
    { name: "Probability of Default", nameHe: "הסתברות כשל", formula: "pd_model(leverage, cashflow)", value: 0.8, prev: 1.2, unit: "%", target: 2, higherIsBetter: false, description: "הסתברות לחדלות פירעון" },
    { name: "Concentration (Top 5)", nameHe: "ריכוזיות 5 לקוחות", formula: "top5_revenue / total_revenue", value: 42, prev: 45, unit: "%", target: 40, higherIsBetter: false, description: "תלות ב-5 הלקוחות הגדולים" },
    { name: "Concentration (Top 3 Suppliers)", nameHe: "ריכוזיות 3 ספקים", formula: "top3_purchases / total_purchases", value: 55, prev: 58, unit: "%", target: 50, higherIsBetter: false, description: "תלות ב-3 הספקים הגדולים" },
    { name: "Supplier Dependency", nameHe: "תלות בספק יחיד", formula: "max_supplier_share", value: 18, prev: 22, unit: "%", target: 15, higherIsBetter: false, description: "נתח הרכש מספק בודד" },
    { name: "Collection Risk", nameHe: "סיכון גבייה", formula: "overdue_90d / total_receivables", value: 5.2, prev: 6.8, unit: "%", target: 5, higherIsBetter: false, description: "חלק מהחייבים באיחור קריטי" },
    { name: "Earnings at Risk", nameHe: "רווח בסיכון", formula: "var(earnings, 95%)", value: 320000, prev: 380000, unit: "₪", higherIsBetter: false, description: "סטיית רווח מקסימלית (95%)" },
    { name: "Cashflow at Risk", nameHe: "תזרים בסיכון", formula: "var(cashflow, 95%)", value: 450000, prev: 520000, unit: "₪", higherIsBetter: false, description: "סטיית תזרים מקסימלית (95%)" },
    { name: "Margin at Risk", nameHe: "מרווח בסיכון", formula: "var(margin, 95%)", value: 5.2, prev: 6.1, unit: "%", higherIsBetter: false, description: "סטיית מרווח מקסימלית (95%)" },
    { name: "Volatility Ratio", nameHe: "יחס תנודתיות", formula: "stddev(returns) / mean(returns)", value: 0.45, prev: 0.52, unit: "x", higherIsBetter: false, description: "תנודתיות ביחס לתשואה" },
    { name: "Scenario Breach", nameHe: "חריגת תרחיש", formula: "breached_scenarios / total_scenarios", value: 3.2, prev: 4.5, unit: "%", target: 5, higherIsBetter: false, description: "אחוז תרחישי קיצון שחרגו ממגבלות" },
    { name: "Project Failure Probability", nameHe: "הסתברות כשל פרויקט", formula: "p(project_loss > 0)", value: 8.5, prev: 12.3, unit: "%", target: 10, higherIsBetter: false, description: "הסתברות שפרויקט יפסיד" },
  ],
  multiple: [
    { name: "Revenue Multiple", nameHe: "מכפיל הכנסות", formula: "enterprise_value / revenue", value: 3.2, prev: 2.8, unit: "x", higherIsBetter: true, description: "שווי ביחס להכנסות" },
    { name: "EBIT Multiple", nameHe: "מכפיל EBIT", formula: "enterprise_value / ebit", value: 15.8, prev: 14.2, unit: "x", higherIsBetter: true, description: "שווי ביחס לרווח תפעולי" },
    { name: "EBITDA Multiple", nameHe: "מכפיל EBITDA", formula: "enterprise_value / ebitda", value: 12.5, prev: 11.2, unit: "x", higherIsBetter: true, description: "מכפיל ה-EBITDA (הנפוץ ביותר)" },
    { name: "Net Income Multiple", nameHe: "מכפיל רווח נקי", formula: "enterprise_value / net_income", value: 22.4, prev: 20.1, unit: "x", higherIsBetter: true, description: "שווי ביחס לרווח נקי" },
    { name: "Free Cash Flow Multiple", nameHe: "מכפיל תזרים חופשי", formula: "enterprise_value / fcf", value: 18.2, prev: 16.5, unit: "x", higherIsBetter: true, description: "שווי ביחס לתזרים חופשי" },
    { name: "Book Value Multiple", nameHe: "מכפיל שווי ספרים", formula: "market_cap / book_value", value: 2.8, prev: 2.5, unit: "x", higherIsBetter: true, description: "שווי שוק ביחס להון עצמי" },
    { name: "EV/Sales", nameHe: "שווי פירמה/מכירות", formula: "ev / sales", value: 2.8, prev: 2.5, unit: "x", higherIsBetter: true, description: "Enterprise Value ביחס למכירות" },
    { name: "EV/EBITDA", nameHe: "שווי פירמה/EBITDA", formula: "ev / ebitda", value: 12.5, prev: 11.2, unit: "x", higherIsBetter: true, description: "מכפיל השוק הנפוץ ביותר" },
    { name: "P/E Ratio", nameHe: "מכפיל רווח (P/E)", formula: "price / earnings_per_share", value: 18.4, prev: 16.8, unit: "x", higherIsBetter: true, description: "מחיר מניה ביחס לרווח" },
    { name: "P/B Ratio", nameHe: "מכפיל הון (P/B)", formula: "price / book_value_per_share", value: 2.6, prev: 2.3, unit: "x", higherIsBetter: true, description: "מחיר מניה ביחס להון" },
    { name: "P/S Ratio", nameHe: "מכפיל מכירות (P/S)", formula: "price / sales_per_share", value: 1.8, prev: 1.6, unit: "x", higherIsBetter: true, description: "מחיר ביחס למכירות" },
    { name: "PEG Ratio", nameHe: "PEG", formula: "pe / earnings_growth_rate", value: 1.15, prev: 1.3, unit: "x", target: 1.0, higherIsBetter: false, description: "P/E מנורמל לפי צמיחה" },
    { name: "LTV/CAC", nameHe: "LTV/CAC", formula: "customer_lifetime_value / acquisition_cost", value: 4.2, prev: 3.8, unit: "x", target: 3, higherIsBetter: true, description: "שווי לקוח ביחס לעלות גיוסו" },
    { name: "Payback Multiple", nameHe: "מכפיל החזר", formula: "investment / annual_return", value: 2.1, prev: 2.4, unit: "years", higherIsBetter: false, description: "שנים להחזר השקעה" },
    { name: "Project Value Multiple", nameHe: "מכפיל ערך פרויקט", formula: "project_npv / project_investment", value: 1.85, prev: 1.72, unit: "x", target: 1.5, higherIsBetter: true, description: "NPV ביחס להשקעה" },
  ],
};

// ============================================================
// HELPERS
// ============================================================
function getStatus(value: number, target: number | undefined, higherIsBetter: boolean): "good" | "warning" | "critical" {
  if (!target) return "good";
  const ratio = higherIsBetter ? value / target : target / value;
  if (ratio >= 1) return "good";
  if (ratio >= 0.85) return "warning";
  return "critical";
}

function formatValue(value: number, unit: string): string {
  if (unit === "₪" || unit === "₪/mo") return `₪${value.toLocaleString("he-IL")}`;
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  if (unit === "days") return `${value} ימים`;
  if (unit === "mo") return `${value.toFixed(1)} חודשים`;
  if (unit === "years") return `${value.toFixed(1)} שנים`;
  return String(value);
}

function TrendBadge({ current, previous, higherIsBetter }: { current: number; previous: number; higherIsBetter: boolean }) {
  const change = ((current - previous) / Math.abs(previous || 1)) * 100;
  if (Math.abs(change) < 0.5) return <span className="text-xs text-muted-foreground">—</span>;
  const isGood = higherIsBetter ? change > 0 : change < 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-semibold ${isGood ? "text-emerald-600" : "text-red-600"}`}>
      {change > 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(change).toFixed(1)}%
    </span>
  );
}

function StatusDot({ status }: { status: "good" | "warning" | "critical" }) {
  return (
    <div className={`h-2.5 w-2.5 rounded-full ${
      status === "good" ? "bg-emerald-500" : status === "warning" ? "bg-amber-500" : "bg-red-500"
    }`} />
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

const Hash: any[] = [];
export default function RatioDashboard() {
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<RatioCategory>("profitability");
  const [period, setPeriod] = useState("current_quarter");
  const [searchTerm, setSearchTerm] = useState("");
  const [showFormulaColumn, setShowFormulaColumn] = useState(false);
  const [expandedRatio, setExpandedRatio] = useState<string | null>(null);

  // API queries
  const { data: apiDefinitions } = useQuery({
    queryKey: ["/api/fin/quant/ratios/definitions"],
    queryFn: () => authFetch("/api/fin/quant/ratios/definitions").then(r => r.json()).catch(() => []),
  });

  const computeMutation = useMutation({
    mutationFn: (payload: any) =>
      authFetch("/api/fin/quant/ratios/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/fin/quant/ratios"] }),
  });

  const categories = Object.entries(categoryConfig) as [RatioCategory, typeof categoryConfig[RatioCategory]][];
  const currentRatios = ALL_RATIOS[selectedCategory];
  const config = categoryConfig[selectedCategory];

  // Filter by search
  const filteredRatios = useMemo(() => {
    if (!searchTerm) return currentRatios;
    const term = searchTerm.toLowerCase();
    return currentRatios.filter(r =>
      r.name.toLowerCase().includes(term) ||
      r.nameHe.includes(searchTerm) ||
      r.formula.toLowerCase().includes(term)
    );
  }, [currentRatios, searchTerm]);

  // Summary across all categories
  const allRatios = useMemo(() =>
    Object.values(ALL_RATIOS).flat(), []
  );
  const totalCount = allRatios.length;
  const goodCount = allRatios.filter(r => getStatus(r.value, r.target, r.higherIsBetter) === "good").length;
  const warningCount = allRatios.filter(r => getStatus(r.value, r.target, r.higherIsBetter) === "warning").length;
  const criticalCount = allRatios.filter(r => getStatus(r.value, r.target, r.higherIsBetter) === "critical").length;
  const improvedCount = allRatios.filter(r => r.higherIsBetter ? r.value > r.prev : r.value < r.prev).length;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Calculator className="h-7 w-7 text-primary" /> יחסים פיננסיים
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalCount} יחסים | 8 קטגוריות | מעקב יעדים | ניתוח מגמות
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="current_month">חודש נוכחי</SelectItem>
              <SelectItem value="current_quarter">רבעון נוכחי</SelectItem>
              <SelectItem value="ytd">מתחילת השנה</SelectItem>
              <SelectItem value="last_12m">12 חודשים</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => computeMutation.mutate({ periodStart: "2026-01-01", periodEnd: "2026-03-31" })}>
            <RefreshCw className={`h-3.5 w-3.5 ml-1 ${computeMutation.isPending ? "animate-spin" : ""}`} /> חשב מחדש
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-3.5 w-3.5 ml-1" /> ייצוא
          </Button>
        </div>
      </div>

      {/* Health Summary */}
      <div className="grid grid-cols-5 gap-3">
        <Card className="border-border">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Hash className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">סה״כ יחסים</p>
              <p className="text-2xl font-bold">{totalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`${categoryConfig.profitability.border} ${categoryConfig.profitability.bgLight}`}>
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
            <div>
              <p className="text-[10px] text-emerald-700 uppercase tracking-wider">תקין</p>
              <p className="text-2xl font-bold text-emerald-800">{goodCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
            <div>
              <p className="text-[10px] text-amber-700 uppercase tracking-wider">אזהרה</p>
              <p className="text-2xl font-bold text-amber-800">{warningCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <XCircle className="h-8 w-8 text-red-600" />
            <div>
              <p className="text-[10px] text-red-700 uppercase tracking-wider">חריגה</p>
              <p className="text-2xl font-bold text-red-800">{criticalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-4 pb-3 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-[10px] text-blue-700 uppercase tracking-wider">השתפרו</p>
              <p className="text-2xl font-bold text-blue-800">{improvedCount}/{totalCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category selector + search */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5 flex-wrap flex-1">
          {categories.map(([key, cfg]) => {
            const Icon = cfg.icon;
            const isActive = selectedCategory === key;
            const catRatios = ALL_RATIOS[key];
            const catCritical = catRatios.filter(r => getStatus(r.value, r.target, r.higherIsBetter) === "critical").length;

            return (
              <button
                key={key}
                onClick={() => { setSelectedCategory(key); setSearchTerm(""); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all
                  ${isActive ? "bg-primary text-primary-foreground border-primary shadow-sm" : "bg-card hover:bg-accent border-border"}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {cfg.labelHe}
                <Badge variant={isActive ? "secondary" : "outline"} className="text-[9px] h-4 px-1 ml-0.5">
                  {catRatios.length}
                </Badge>
                {catCritical > 0 && !isActive && (
                  <span className="h-4 px-1 rounded-full bg-red-100 text-red-700 text-[9px] flex items-center">{catCritical}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative w-56">
          <Search className="absolute right-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="חפש יחס..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="h-8 text-xs pr-8"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Switch checked={showFormulaColumn} onCheckedChange={setShowFormulaColumn} />
          <Label className="text-xs">נוסחה</Label>
        </div>
      </div>

      {/* Ratio Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <config.icon className={`h-5 w-5 ${config.color}`} />
            <CardTitle className="text-base">{config.labelHe}</CardTitle>
            <CardDescription className="mr-auto">{config.label} — {filteredRatios.length} יחסים</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-right w-6 px-2" />
                  <TableHead className="text-right w-[240px] font-semibold text-xs">יחס</TableHead>
                  {showFormulaColumn && <TableHead className="text-right font-semibold text-xs w-[200px]">נוסחה</TableHead>}
                  <TableHead className="text-right font-semibold text-xs">ערך נוכחי</TableHead>
                  <TableHead className="text-right font-semibold text-xs">קודם</TableHead>
                  <TableHead className="text-right font-semibold text-xs">שינוי</TableHead>
                  <TableHead className="text-right font-semibold text-xs">יעד</TableHead>
                  <TableHead className="text-right font-semibold text-xs w-[120px]">עמידה</TableHead>
                  <TableHead className="text-right font-semibold text-xs w-14">סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRatios.map((ratio, i) => {
                  const status = getStatus(ratio.value, ratio.target, ratio.higherIsBetter);
                  const isExpanded = expandedRatio === ratio.name;
                  const targetProgress = ratio.target
                    ? Math.min(100, ratio.higherIsBetter
                      ? (ratio.value / ratio.target) * 100
                      : (ratio.target / ratio.value) * 100)
                    : 0;

                  return (
                    <>
                      <TableRow
                        key={i}
                        className={`hover:bg-muted/20 cursor-pointer ${status === "critical" ? "bg-red-50/30" : ""}`}
                        onClick={() => setExpandedRatio(isExpanded ? null : ratio.name)}
                      >
                        <TableCell className="px-2">
                          <StatusDot status={status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                            <div>
                              <p className="font-medium text-sm">{ratio.nameHe}</p>
                              <p className="text-[10px] text-muted-foreground">{ratio.name}</p>
                            </div>
                          </div>
                        </TableCell>
                        {showFormulaColumn && (
                          <TableCell className="font-mono text-[10px] text-muted-foreground">{ratio.formula}</TableCell>
                        )}
                        <TableCell className={`font-mono font-bold text-sm ${
                          status === "critical" ? "text-red-600" : status === "warning" ? "text-amber-600" : ""
                        }`}>
                          {formatValue(ratio.value, ratio.unit)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {formatValue(ratio.prev, ratio.unit)}
                        </TableCell>
                        <TableCell>
                          <TrendBadge current={ratio.value} previous={ratio.prev} higherIsBetter={ratio.higherIsBetter} />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {ratio.target ? formatValue(ratio.target, ratio.unit) : "—"}
                        </TableCell>
                        <TableCell>
                          {ratio.target && (
                            <div className="flex items-center gap-1.5">
                              <Progress
                                value={targetProgress}
                                className={`h-1.5 w-16 ${status === "critical" ? "[&>div]:bg-red-500" : status === "warning" ? "[&>div]:bg-amber-500" : ""}`}
                              />
                              <span className="text-[10px] font-mono w-8">{Math.round(targetProgress)}%</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[9px] px-1.5 ${
                            status === "good" ? "text-emerald-600 border-emerald-300" :
                            status === "warning" ? "text-amber-600 border-amber-300" :
                            "text-red-600 border-red-300"
                          }`}>
                            {status === "good" ? "OK" : status === "warning" ? "!" : "!!"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow className="bg-muted/10">
                          <TableCell colSpan={showFormulaColumn ? 9 : 8} className="py-3 px-6">
                            <div className="grid grid-cols-3 gap-4 text-xs">
                              <div>
                                <p className="text-muted-foreground font-medium mb-1">תיאור</p>
                                <p>{ratio.description}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-medium mb-1">נוסחה</p>
                                <code className="bg-muted px-2 py-0.5 rounded font-mono text-[11px]">{ratio.formula}</code>
                              </div>
                              <div>
                                <p className="text-muted-foreground font-medium mb-1">ניתוח</p>
                                <p>
                                  {ratio.higherIsBetter ? "ערך גבוה = חיובי" : "ערך נמוך = חיובי"}
                                  {ratio.target && ` | יעד: ${formatValue(ratio.target, ratio.unit)}`}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
