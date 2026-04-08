import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FileText, Download, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

type StatementLine = {
  item: string;
  label: string;
  current: number;
  previous: number;
  budget?: number;
  isSubtotal?: boolean;
  isTotal?: boolean;
  indent?: number;
};

const pnlData: StatementLine[] = [
  // Revenue
  { item: "operating_revenue", label: "הכנסות תפעוליות", current: 4200000, previous: 3850000, budget: 4000000, indent: 1 },
  { item: "recurring_revenue", label: "הכנסות מחזוריות", current: 680000, previous: 620000, budget: 650000, indent: 1 },
  { item: "other_income", label: "הכנסות אחרות", current: 45000, previous: 38000, indent: 1 },
  { item: "total_revenue", label: "סה״כ הכנסות", current: 4925000, previous: 4508000, budget: 4650000, isSubtotal: true },
  // COGS
  { item: "material_cost", label: "עלות חומרים", current: -1850000, previous: -1720000, budget: -1800000, indent: 1 },
  { item: "labor_cost", label: "עלות עבודה", current: -520000, previous: -480000, budget: -500000, indent: 1 },
  { item: "subcontractor_cost", label: "קבלני משנה", current: -180000, previous: -165000, indent: 1 },
  { item: "logistics_cost", label: "עלות לוגיסטיקה", current: -95000, previous: -88000, indent: 1 },
  { item: "total_cogs", label: "סה״כ עלות המכירות", current: -2645000, previous: -2453000, budget: -2300000, isSubtotal: true },
  // Gross Profit
  { item: "gross_profit", label: "רווח גולמי", current: 2280000, previous: 2055000, budget: 2350000, isTotal: true },
  // OpEx
  { item: "salaries", label: "שכר ונלוות", current: -850000, previous: -790000, budget: -820000, indent: 1 },
  { item: "rent", label: "שכירות", current: -120000, previous: -115000, budget: -120000, indent: 1 },
  { item: "marketing_expenses", label: "שיווק ופרסום", current: -95000, previous: -82000, budget: -100000, indent: 1 },
  { item: "admin_expenses", label: "הוצאות הנהלה", current: -65000, previous: -60000, indent: 1 },
  { item: "software", label: "תוכנה ומנויים", current: -42000, previous: -38000, indent: 1 },
  { item: "depreciation", label: "פחת", current: -78000, previous: -75000, indent: 1 },
  { item: "utilities", label: "חשמל/מים/גז", current: -28000, previous: -25000, indent: 1 },
  { item: "total_opex", label: "סה״כ הוצאות תפעוליות", current: -1278000, previous: -1185000, budget: -1240000, isSubtotal: true },
  // EBIT
  { item: "ebit", label: "רווח תפעולי (EBIT)", current: 1002000, previous: 870000, budget: 1110000, isTotal: true },
  // Finance
  { item: "finance_income", label: "הכנסות מימון", current: 12000, previous: 8000, indent: 1 },
  { item: "finance_expense", label: "הוצאות מימון", current: -85000, previous: -78000, indent: 1 },
  { item: "net_finance", label: "מימון נטו", current: -73000, previous: -70000, isSubtotal: true },
  // PBT
  { item: "pbt", label: "רווח לפני מס", current: 929000, previous: 800000, isTotal: true },
  // Tax
  { item: "income_tax", label: "מס הכנסה (23%)", current: -213670, previous: -184000, indent: 1 },
  // Net
  { item: "net_income", label: "רווח נקי", current: 715330, previous: 616000, isTotal: true },
];

const balanceSheetData: { section: string; sectionHe: string; lines: StatementLine[] }[] = [
  {
    section: "assets", sectionHe: "נכסים", lines: [
      { item: "cash", label: "מזומנים ושווי מזומנים", current: 2850000, previous: 2420000 },
      { item: "accounts_receivable", label: "לקוחות", current: 1680000, previous: 1520000 },
      { item: "inventory", label: "מלאי", current: 920000, previous: 880000 },
      { item: "prepaid", label: "הוצאות ששולמו מראש", current: 145000, previous: 130000 },
      { item: "total_current", label: "סה״כ נכסים שוטפים", current: 5595000, previous: 4950000, isSubtotal: true },
      { item: "fixed_assets", label: "רכוש קבוע נטו", current: 3200000, previous: 3150000 },
      { item: "intangible", label: "נכסים בלתי מוחשיים", current: 280000, previous: 300000 },
      { item: "total_assets", label: "סה״כ נכסים", current: 9075000, previous: 8400000, isTotal: true },
    ],
  },
  {
    section: "liabilities", sectionHe: "התחייבויות", lines: [
      { item: "accounts_payable", label: "ספקים", current: 1120000, previous: 980000 },
      { item: "accrued", label: "התחייבויות צבורות", current: 340000, previous: 310000 },
      { item: "short_term_debt", label: "הלוואות לזמן קצר", current: 500000, previous: 650000 },
      { item: "tax_liabilities", label: "התחייבויות מס", current: 213670, previous: 184000 },
      { item: "deferred_revenue", label: "הכנסות נדחות", current: 180000, previous: 160000 },
      { item: "total_current_liab", label: "סה״כ התחייבויות שוטפות", current: 2353670, previous: 2284000, isSubtotal: true },
      { item: "long_term_debt", label: "הלוואות לזמן ארוך", current: 1800000, previous: 2000000 },
      { item: "total_liabilities", label: "סה״כ התחייבויות", current: 4153670, previous: 4284000, isTotal: true },
    ],
  },
  {
    section: "equity", sectionHe: "הון עצמי", lines: [
      { item: "share_capital", label: "הון מניות", current: 1000000, previous: 1000000 },
      { item: "retained_earnings", label: "עודפים", current: 3206000, previous: 2500000 },
      { item: "current_profit", label: "רווח תקופה שוטפת", current: 715330, previous: 616000 },
      { item: "total_equity", label: "סה״כ הון עצמי", current: 4921330, previous: 4116000, isTotal: true },
    ],
  },
];

function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs >= 1000000
    ? `${(abs / 1000000).toFixed(2)}M`
    : abs >= 1000
      ? `${(abs / 1000).toFixed(0)}K`
      : abs.toLocaleString();
  return `${value < 0 ? "(" : ""}₪${formatted}${value < 0 ? ")" : ""}`;
}

function ChangeIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return <Minus className="h-3.5 w-3.5 text-gray-400" />;
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(change) < 0.5) return <span className="text-xs text-gray-400">—</span>;
  const isPositive = change > 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
      {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(change).toFixed(1)}%
    </span>
  );
}

export default function FinancialStatements() {
  const [period, setPeriod] = useState("2026-Q1");
  const [comparison, setComparison] = useState("previous_period");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-7 w-7 text-primary" /> דוחות כספיים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מאזן | רווח והפסד | תזרים מזומנים</p>
        </div>
        <div className="flex gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="2026-Q1">Q1 2026</SelectItem>
              <SelectItem value="2025-Q4">Q4 2025</SelectItem>
              <SelectItem value="2025-FY">שנתי 2025</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline"><Download className="h-4 w-4 ml-2" /> ייצוא PDF</Button>
        </div>
      </div>

      <Tabs defaultValue="pnl">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="pnl">רווח והפסד</TabsTrigger>
          <TabsTrigger value="balance">מאזן</TabsTrigger>
          <TabsTrigger value="cashflow">תזרים מזומנים</TabsTrigger>
        </TabsList>

        {/* P&L */}
        <TabsContent value="pnl">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>דוח רווח והפסד</CardTitle>
              <CardDescription>לתקופה {period} | השוואה לתקופה קודמת</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right w-[300px] font-semibold">סעיף</TableHead>
                    <TableHead className="text-right font-semibold">תקופה נוכחית</TableHead>
                    <TableHead className="text-right font-semibold">תקופה קודמת</TableHead>
                    <TableHead className="text-right font-semibold">שינוי</TableHead>
                    <TableHead className="text-right font-semibold">תקציב</TableHead>
                    <TableHead className="text-right font-semibold">סטייה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pnlData.map((line, i) => (
                    <TableRow
                      key={i}
                      className={`
                        ${line.isTotal ? "bg-primary/5 font-bold border-t-2 border-primary/20" : ""}
                        ${line.isSubtotal ? "bg-muted/30 font-semibold border-t" : ""}
                        hover:bg-muted/20
                      `}
                    >
                      <TableCell className={line.indent ? "pr-8" : ""}>
                        <span className={line.isTotal ? "text-base" : line.isSubtotal ? "text-sm" : "text-sm"}>
                          {line.label}
                        </span>
                      </TableCell>
                      <TableCell className={`font-mono text-left ${line.current < 0 ? "text-red-600" : ""} ${line.isTotal ? "text-base" : ""}`}>
                        {formatCurrency(line.current)}
                      </TableCell>
                      <TableCell className="font-mono text-left text-muted-foreground">
                        {formatCurrency(line.previous)}
                      </TableCell>
                      <TableCell>
                        <ChangeIndicator current={line.current} previous={line.previous} />
                      </TableCell>
                      <TableCell className="font-mono text-left text-muted-foreground">
                        {line.budget ? formatCurrency(line.budget) : "—"}
                      </TableCell>
                      <TableCell>
                        {line.budget && (
                          <span className={`text-xs font-mono ${
                            Math.abs(line.current) >= Math.abs(line.budget) ? "text-emerald-600" : "text-red-600"
                          }`}>
                            {((line.current - line.budget) / Math.abs(line.budget) * 100).toFixed(1)}%
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Key Margins */}
          <div className="grid grid-cols-4 gap-4 mt-4">
            {[
              { label: "Gross Margin", value: (2280000 / 4925000 * 100).toFixed(1), prev: (2055000 / 4508000 * 100).toFixed(1) },
              { label: "EBIT Margin", value: (1002000 / 4925000 * 100).toFixed(1), prev: (870000 / 4508000 * 100).toFixed(1) },
              { label: "Net Margin", value: (715330 / 4925000 * 100).toFixed(1), prev: (616000 / 4508000 * 100).toFixed(1) },
              { label: "EBITDA Margin", value: ((1002000 + 78000) / 4925000 * 100).toFixed(1), prev: ((870000 + 75000) / 4508000 * 100).toFixed(1) },
            ].map((m, i) => (
              <Card key={i}>
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-2xl font-bold font-mono">{m.value}%</p>
                  <p className="text-xs text-muted-foreground">קודם: {m.prev}%</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Balance Sheet */}
        <TabsContent value="balance">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>מאזן</CardTitle>
              <CardDescription>ליום 31.03.2026</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {balanceSheetData.map((section) => (
                <div key={section.section}>
                  <div className="bg-primary/10 px-4 py-2">
                    <h3 className="font-bold text-sm">{section.sectionHe}</h3>
                  </div>
                  <Table>
                    <TableBody>
                      {section.lines.map((line, i) => (
                        <TableRow
                          key={i}
                          className={`
                            ${line.isTotal ? "bg-primary/5 font-bold border-t-2" : ""}
                            ${line.isSubtotal ? "bg-muted/30 font-semibold border-t" : ""}
                          `}
                        >
                          <TableCell className="w-[300px]">{line.label}</TableCell>
                          <TableCell className="font-mono text-left">{formatCurrency(line.current)}</TableCell>
                          <TableCell className="font-mono text-left text-muted-foreground">{formatCurrency(line.previous)}</TableCell>
                          <TableCell><ChangeIndicator current={line.current} previous={line.previous} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cash Flow */}
        <TabsContent value="cashflow">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>דוח תזרים מזומנים</CardTitle>
              <CardDescription>Q1 2026</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right w-[300px] font-semibold">סעיף</TableHead>
                    <TableHead className="text-right font-semibold">סכום</TableHead>
                    <TableHead className="text-right font-semibold">קודם</TableHead>
                    <TableHead className="text-right font-semibold">שינוי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { section: "פעילות שוטפת", items: [
                      { label: "גבייה מלקוחות", current: 4780000, previous: 4350000 },
                      { label: "תשלום לספקים", current: -2450000, previous: -2280000 },
                      { label: "שכר ששולם", current: -850000, previous: -790000 },
                      { label: "מסים ששולמו", current: -184000, previous: -168000 },
                    ]},
                    { section: "פעילות השקעה", items: [
                      { label: "רכישות רכוש קבוע (CAPEX)", current: -128000, previous: -95000 },
                      { label: "מכירת נכסים", current: 15000, previous: 0 },
                    ]},
                    { section: "פעילות מימון", items: [
                      { label: "הלוואות שנתקבלו", current: 0, previous: 200000 },
                      { label: "החזר חוב", current: -350000, previous: -300000 },
                      { label: "הזרמת בעלים", current: 0, previous: 0 },
                    ]},
                  ].map((section, si) => (
                    <>
                      <TableRow key={`s-${si}`} className="bg-primary/10">
                        <TableCell colSpan={4} className="font-bold text-sm">{section.section}</TableCell>
                      </TableRow>
                      {section.items.map((item, ii) => (
                        <TableRow key={`${si}-${ii}`}>
                          <TableCell className="pr-8">{item.label}</TableCell>
                          <TableCell className={`font-mono ${item.current < 0 ? "text-red-600" : "text-emerald-600"}`}>
                            {formatCurrency(item.current)}
                          </TableCell>
                          <TableCell className="font-mono text-muted-foreground">{formatCurrency(item.previous)}</TableCell>
                          <TableCell><ChangeIndicator current={item.current} previous={item.previous} /></TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-semibold border-t">
                        <TableCell>סה״כ {section.section}</TableCell>
                        <TableCell className="font-mono font-bold">
                          {formatCurrency(section.items.reduce((s, i) => s + i.current, 0))}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {formatCurrency(section.items.reduce((s, i) => s + i.previous, 0))}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </>
                  ))}
                  <TableRow className="bg-primary/5 font-bold border-t-2 border-primary/20">
                    <TableCell className="text-base">תנועה נטו במזומנים</TableCell>
                    <TableCell className="font-mono text-base text-emerald-700">₪833K</TableCell>
                    <TableCell className="font-mono text-muted-foreground">₪917K</TableCell>
                    <TableCell><ChangeIndicator current={833000} previous={917000} /></TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>יתרת פתיחה</TableCell>
                    <TableCell className="font-mono">₪2.42M</TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                  <TableRow className="font-bold bg-primary/10 border-t-2">
                    <TableCell className="text-base">יתרת סגירה</TableCell>
                    <TableCell className="font-mono text-base">₪2.85M</TableCell>
                    <TableCell />
                    <TableCell />
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
