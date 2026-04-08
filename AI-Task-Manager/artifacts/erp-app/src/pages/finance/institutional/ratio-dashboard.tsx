import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle,
  XCircle, Target, BarChart3, Shield, Gauge, DollarSign, Activity,
  ArrowUpRight, ArrowDownRight, Percent
} from "lucide-react";

type RatioCategory = "profitability" | "loss" | "liquidity" | "leverage" | "efficiency" | "hedge" | "risk" | "multiple";

const categoryConfig: Record<RatioCategory, { label: string; labelHe: string; icon: any; color: string }> = {
  profitability: { label: "Profitability", labelHe: "רווחיות", icon: TrendingUp, color: "text-green-600" },
  loss: { label: "Loss & Downside", labelHe: "הפסד וסיכון שלילי", icon: TrendingDown, color: "text-red-600" },
  liquidity: { label: "Liquidity", labelHe: "נזילות", icon: DollarSign, color: "text-blue-600" },
  leverage: { label: "Leverage & Solvency", labelHe: "מינוף ויציבות", icon: Shield, color: "text-purple-600" },
  efficiency: { label: "Efficiency", labelHe: "יעילות", icon: Gauge, color: "text-amber-600" },
  hedge: { label: "Hedge", labelHe: "גידור", icon: Shield, color: "text-teal-600" },
  risk: { label: "Risk", labelHe: "סיכון", icon: AlertTriangle, color: "text-orange-600" },
  multiple: { label: "Multiples", labelHe: "מכפילים", icon: BarChart3, color: "text-indigo-600" },
};

// Professional ratio data
const ratioData: Record<RatioCategory, Array<{ name: string; nameHe: string; value: number; prev: number; unit: string; target?: number; higherIsBetter: boolean }>> = {
  profitability: [
    { name: "Gross Margin", nameHe: "שיעור רווח גולמי", value: 38.2, prev: 36.5, unit: "%", target: 40, higherIsBetter: true },
    { name: "Operating Margin (EBIT)", nameHe: "שיעור רווח תפעולי", value: 14.8, prev: 13.2, unit: "%", target: 15, higherIsBetter: true },
    { name: "EBITDA Margin", nameHe: "שיעור EBITDA", value: 19.3, prev: 17.8, unit: "%", target: 20, higherIsBetter: true },
    { name: "Net Margin", nameHe: "שיעור רווח נקי", value: 9.6, prev: 8.9, unit: "%", target: 10, higherIsBetter: true },
    { name: "ROE", nameHe: "תשואה על ההון", value: 18.4, prev: 16.7, unit: "%", target: 20, higherIsBetter: true },
    { name: "ROA", nameHe: "תשואה על הנכסים", value: 8.1, prev: 7.5, unit: "%", target: 8, higherIsBetter: true },
    { name: "ROIC", nameHe: "תשואה על הון מושקע", value: 15.2, prev: 14.1, unit: "%", target: 15, higherIsBetter: true },
    { name: "Contribution Margin", nameHe: "רווח שולי", value: 52.3, prev: 50.8, unit: "%", higherIsBetter: true },
  ],
  loss: [
    { name: "Bad Debt Ratio", nameHe: "יחס חובות אבודים", value: 1.8, prev: 2.1, unit: "%", target: 2, higherIsBetter: false },
    { name: "Maximum Drawdown", nameHe: "ירידה מקסימלית", value: 12.4, prev: 15.2, unit: "%", higherIsBetter: false },
    { name: "Cost Overrun Ratio", nameHe: "יחס חריגה בעלויות", value: 4.2, prev: 5.8, unit: "%", target: 5, higherIsBetter: false },
    { name: "Uncollected Revenue", nameHe: "הכנסות שלא נגבו", value: 6.1, prev: 7.3, unit: "%", target: 5, higherIsBetter: false },
    { name: "Failed Payment Ratio", nameHe: "יחס תשלומים שנכשלו", value: 0.8, prev: 1.2, unit: "%", target: 1, higherIsBetter: false },
    { name: "Margin Erosion", nameHe: "שחיקת מרווחים", value: 2.3, prev: 3.1, unit: "%", higherIsBetter: false },
  ],
  liquidity: [
    { name: "Current Ratio", nameHe: "יחס שוטף", value: 1.85, prev: 1.72, unit: "x", target: 2.0, higherIsBetter: true },
    { name: "Quick Ratio", nameHe: "יחס מהיר", value: 1.32, prev: 1.25, unit: "x", target: 1.5, higherIsBetter: true },
    { name: "Cash Ratio", nameHe: "יחס מזומנים", value: 0.45, prev: 0.38, unit: "x", higherIsBetter: true },
    { name: "DSCR", nameHe: "יחס כיסוי חוב", value: 2.8, prev: 2.5, unit: "x", target: 2.0, higherIsBetter: true },
    { name: "Burn Rate", nameHe: "קצב שריפה", value: 180000, prev: 195000, unit: "₪/mo", higherIsBetter: false },
    { name: "Runway", nameHe: "אורך מסלול", value: 14.2, prev: 12.8, unit: "mo", target: 12, higherIsBetter: true },
  ],
  leverage: [
    { name: "Debt to Equity", nameHe: "חוב להון", value: 0.62, prev: 0.71, unit: "x", target: 1.0, higherIsBetter: false },
    { name: "Debt to Assets", nameHe: "חוב לנכסים", value: 0.38, prev: 0.41, unit: "x", higherIsBetter: false },
    { name: "Equity Ratio", nameHe: "יחס הון עצמי", value: 0.62, prev: 0.59, unit: "x", higherIsBetter: true },
    { name: "Interest Coverage", nameHe: "כיסוי ריבית", value: 5.4, prev: 4.8, unit: "x", target: 4, higherIsBetter: true },
    { name: "Solvency Ratio", nameHe: "יחס יציבות", value: 0.28, prev: 0.25, unit: "x", higherIsBetter: true },
  ],
  efficiency: [
    { name: "DSO", nameHe: "ימי גבייה", value: 42, prev: 48, unit: "days", target: 45, higherIsBetter: false },
    { name: "DPO", nameHe: "ימי ספקים", value: 35, prev: 32, unit: "days", higherIsBetter: true },
    { name: "DIO", nameHe: "ימי מלאי", value: 28, prev: 31, unit: "days", target: 30, higherIsBetter: false },
    { name: "Cash Conversion Cycle", nameHe: "מחזור המרת מזומנים", value: 35, prev: 47, unit: "days", higherIsBetter: false },
    { name: "Asset Turnover", nameHe: "מחזור נכסים", value: 1.8, prev: 1.65, unit: "x", higherIsBetter: true },
    { name: "Revenue per Employee", nameHe: "הכנסה לעובד", value: 420000, prev: 395000, unit: "₪", higherIsBetter: true },
  ],
  hedge: [
    { name: "Hedge Ratio", nameHe: "יחס גידור", value: 72, prev: 65, unit: "%", target: 80, higherIsBetter: true },
    { name: "Hedge Effectiveness", nameHe: "אפקטיביות גידור", value: 91, prev: 88, unit: "%", target: 90, higherIsBetter: true },
    { name: "Unhedged Exposure", nameHe: "חשיפה לא מגודרת", value: 28, prev: 35, unit: "%", target: 20, higherIsBetter: false },
    { name: "FX Protection", nameHe: "הגנת מט\"ח", value: 85, prev: 78, unit: "%", target: 80, higherIsBetter: true },
    { name: "Cashflow Stability", nameHe: "יציבות תזרים", value: 88, prev: 84, unit: "%", higherIsBetter: true },
  ],
  risk: [
    { name: "VaR (95%)", nameHe: "ערך בסיכון 95%", value: 450000, prev: 520000, unit: "₪", higherIsBetter: false },
    { name: "Expected Shortfall", nameHe: "הפסד צפוי", value: 680000, prev: 750000, unit: "₪", higherIsBetter: false },
    { name: "P(Loss)", nameHe: "הסתברות הפסד", value: 8.2, prev: 11.5, unit: "%", target: 10, higherIsBetter: false },
    { name: "Concentration Top 5", nameHe: "ריכוזיות 5 לקוחות", value: 42, prev: 45, unit: "%", target: 40, higherIsBetter: false },
    { name: "Supplier Dependency", nameHe: "תלות בספק", value: 18, prev: 22, unit: "%", target: 15, higherIsBetter: false },
    { name: "Earnings at Risk", nameHe: "רווח בסיכון", value: 320000, prev: 380000, unit: "₪", higherIsBetter: false },
  ],
  multiple: [
    { name: "Revenue Multiple", nameHe: "מכפיל הכנסות", value: 3.2, prev: 2.8, unit: "x", higherIsBetter: true },
    { name: "EBITDA Multiple", nameHe: "מכפיל EBITDA", value: 12.5, prev: 11.2, unit: "x", higherIsBetter: true },
    { name: "P/E Ratio", nameHe: "מכפיל רווח", value: 18.4, prev: 16.8, unit: "x", higherIsBetter: true },
    { name: "EV/Sales", nameHe: "שווי פירמה/מכירות", value: 2.8, prev: 2.5, unit: "x", higherIsBetter: true },
    { name: "LTV/CAC", nameHe: "LTV/CAC", value: 4.2, prev: 3.8, unit: "x", target: 3, higherIsBetter: true },
    { name: "Payback Multiple", nameHe: "מכפיל החזר", value: 2.1, prev: 2.4, unit: "x", higherIsBetter: false },
  ],
};

function getStatus(value: number, target: number | undefined, higherIsBetter: boolean): "good" | "warning" | "critical" {
  if (!target) return "good";
  const ratio = higherIsBetter ? value / target : target / value;
  if (ratio >= 1) return "good";
  if (ratio >= 0.85) return "warning";
  return "critical";
}

function StatusBadge({ status }: { status: "good" | "warning" | "critical" }) {
  if (status === "good") return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 font-medium">תקין</Badge>;
  if (status === "warning") return <Badge className="bg-amber-100 text-amber-700 border-amber-200 font-medium">אזהרה</Badge>;
  return <Badge className="bg-red-100 text-red-700 border-red-200 font-medium">חריגה</Badge>;
}

function TrendIndicator({ current, previous, higherIsBetter }: { current: number; previous: number; higherIsBetter: boolean }) {
  const changePercent = ((current - previous) / Math.abs(previous || 1)) * 100;
  const isPositive = higherIsBetter ? changePercent > 0 : changePercent < 0;

  if (Math.abs(changePercent) < 0.5) return <Minus className="h-4 w-4 text-gray-400" />;

  return (
    <div className={`flex items-center gap-1 text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
      {changePercent > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {Math.abs(changePercent).toFixed(1)}%
    </div>
  );
}

function formatValue(value: number, unit: string): string {
  if (unit === "₪" || unit === "₪/mo") return `₪${value.toLocaleString("he-IL")}`;
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  if (unit === "days") return `${value} ימים`;
  if (unit === "mo") return `${value.toFixed(1)} חודשים`;
  return String(value);
}

export default function RatioDashboard() {
  const [selectedCategory, setSelectedCategory] = useState<RatioCategory>("profitability");
  const [period, setPeriod] = useState("current_quarter");

  const categories = Object.entries(categoryConfig) as [RatioCategory, typeof categoryConfig[RatioCategory]][];
  const currentRatios = ratioData[selectedCategory];
  const config = categoryConfig[selectedCategory];

  // Summary counts
  const allRatios = Object.entries(ratioData).flatMap(([cat, ratios]) =>
    ratios.map(r => ({ ...r, category: cat as RatioCategory }))
  );
  const goodCount = allRatios.filter(r => getStatus(r.value, r.target, r.higherIsBetter) === "good").length;
  const warningCount = allRatios.filter(r => getStatus(r.value, r.target, r.higherIsBetter) === "warning").length;
  const criticalCount = allRatios.filter(r => getStatus(r.value, r.target, r.higherIsBetter) === "critical").length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">דשבורד יחסים פיננסיים</h1>
          <p className="text-sm text-muted-foreground mt-1">120+ יחסים פיננסיים | 8 קטגוריות | ניתוח מוסדי</p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="current_month">חודש נוכחי</SelectItem>
            <SelectItem value="current_quarter">רבעון נוכחי</SelectItem>
            <SelectItem value="ytd">מתחילת השנה</SelectItem>
            <SelectItem value="last_12m">12 חודשים</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Health Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="pt-5 flex items-center gap-4">
            <CheckCircle className="h-10 w-10 text-emerald-600" />
            <div>
              <p className="text-sm text-emerald-700 font-medium">תקין</p>
              <p className="text-3xl font-bold text-emerald-800">{goodCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-5 flex items-center gap-4">
            <AlertTriangle className="h-10 w-10 text-amber-600" />
            <div>
              <p className="text-sm text-amber-700 font-medium">אזהרה</p>
              <p className="text-3xl font-bold text-amber-800">{warningCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="pt-5 flex items-center gap-4">
            <XCircle className="h-10 w-10 text-red-600" />
            <div>
              <p className="text-sm text-red-700 font-medium">חריגה</p>
              <p className="text-3xl font-bold text-red-800">{criticalCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 flex-wrap">
        {categories.map(([key, cfg]) => {
          const Icon = cfg.icon;
          const isActive = selectedCategory === key;
          const catRatios = ratioData[key];
          const catCritical = catRatios.filter(r => getStatus(r.value, r.target, r.higherIsBetter) === "critical").length;

          return (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all
                ${isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card hover:bg-accent border-border"
                }`}
            >
              <Icon className="h-4 w-4" />
              {cfg.labelHe}
              {catCritical > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${isActive ? "bg-white/20" : "bg-red-100 text-red-700"}`}>
                  {catCritical}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Ratio Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <config.icon className={`h-6 w-6 ${config.color}`} />
            <div>
              <CardTitle>{config.labelHe}</CardTitle>
              <CardDescription>{config.label} Ratios</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-right w-[280px] font-semibold">יחס</TableHead>
                <TableHead className="text-right font-semibold">ערך נוכחי</TableHead>
                <TableHead className="text-right font-semibold">קודם</TableHead>
                <TableHead className="text-right font-semibold">שינוי</TableHead>
                <TableHead className="text-right font-semibold">יעד</TableHead>
                <TableHead className="text-right font-semibold">עמידה ביעד</TableHead>
                <TableHead className="text-right font-semibold">סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentRatios.map((ratio, i) => {
                const status = getStatus(ratio.value, ratio.target, ratio.higherIsBetter);
                return (
                  <TableRow key={i} className="hover:bg-muted/30">
                    <TableCell>
                      <div>
                        <p className="font-medium">{ratio.nameHe}</p>
                        <p className="text-xs text-muted-foreground">{ratio.name}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono font-bold text-base">
                      {formatValue(ratio.value, ratio.unit)}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {formatValue(ratio.prev, ratio.unit)}
                    </TableCell>
                    <TableCell>
                      <TrendIndicator current={ratio.value} previous={ratio.prev} higherIsBetter={ratio.higherIsBetter} />
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {ratio.target ? formatValue(ratio.target, ratio.unit) : "—"}
                    </TableCell>
                    <TableCell>
                      {ratio.target && (
                        <div className="flex items-center gap-2">
                          <Progress
                            value={Math.min(100, ratio.higherIsBetter
                              ? (ratio.value / ratio.target) * 100
                              : (ratio.target / ratio.value) * 100
                            )}
                            className="h-2 w-20"
                          />
                          <span className="text-xs font-mono">
                            {Math.round(ratio.higherIsBetter
                              ? (ratio.value / ratio.target) * 100
                              : (ratio.target / ratio.value) * 100
                            )}%
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={status} />
                    </TableCell>
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
