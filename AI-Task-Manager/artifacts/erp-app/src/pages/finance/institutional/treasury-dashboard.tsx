import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authFetch } from "@/lib/utils";
import {
  Building2, DollarSign, TrendingUp, TrendingDown, Shield, Landmark,
  AlertTriangle, CheckCircle, ArrowLeftRight, Wallet, CreditCard,
  Clock, Lock, Unlock, ArrowUpRight, ArrowDownRight, Globe,
  Banknote, Receipt, BarChart3, Target, Percent
} from "lucide-react";

// ============================================================
// BANK ACCOUNTS DATA
// ============================================================
const bankAccounts = [
  { bank: "בנק לאומי", branch: "125", account: "345-67890", type: 'עו"ש', balance: 1450000, limit: 2000000, currency: "ILS", lastActivity: "2026-04-08", color: "bg-blue-500" },
  { bank: "בנק הפועלים", branch: "632", account: "789-12345", type: 'עו"ש', balance: 820000, limit: 1500000, currency: "ILS", lastActivity: "2026-04-08", color: "bg-red-500" },
  { bank: "בנק דיסקונט", branch: "045", account: "123-45678", type: "פיקדון 3 חודשים", balance: 580000, limit: 580000, currency: "ILS", lastActivity: "2026-03-15", color: "bg-purple-500" },
  { bank: "HSBC", branch: "London", account: "GB29NWBK60161331926819", type: "FX Account", balance: 125000, limit: 500000, currency: "EUR", lastActivity: "2026-04-05", color: "bg-black" },
  { bank: "בנק מזרחי", branch: "412", account: "567-89012", type: "חיסכון", balance: 300000, limit: 300000, currency: "ILS", lastActivity: "2026-01-15", color: "bg-green-500" },
];

const liquidityBuckets = [
  { bucket: "0-7 ימים", label: "שבוע קרוב", inflow: 380000, outflow: 290000, net: 90000, cumulative: 2940000, items: "גבייה צ'קים (₪220K), תשלום ספקים (₪180K), שכר (₪110K)" },
  { bucket: "8-30 ימים", label: "חודש", inflow: 1200000, outflow: 950000, net: 250000, cumulative: 3190000, items: "חשבוניות פתוחות (₪850K), העברות בנקאיות (₪350K)" },
  { bucket: "31-60 ימים", label: "חודשיים", inflow: 890000, outflow: 1100000, net: -210000, cumulative: 2980000, items: "פרויקט קרית אתא - אבן דרך (₪500K), החזר הלוואה (₪350K)" },
  { bucket: "61-90 ימים", label: "רבעון", inflow: 750000, outflow: 680000, net: 70000, cumulative: 3050000, items: "מגזר ציבורי (₪450K), ביטוח שנתי (₪120K)" },
  { bucket: "91-180 ימים", label: "חצי שנה", inflow: 1800000, outflow: 1650000, net: 150000, cumulative: 3200000, items: "חוזים שנתיים, הלוואה טרנש 2" },
  { bucket: "181-365 ימים", label: "שנה", inflow: 3200000, outflow: 2800000, net: 400000, cumulative: 3600000, items: "תכנון שנתי, חידוש חוזים" },
];

const debtFacilities = [
  { name: "מסגרת אשראי - לאומי", type: "revolving", lender: "לאומי", total: 2000000, drawn: 550000, available: 1450000, rate: "פריים + 1.2%", effectiveRate: 5.2, maturity: "2027-06-30", status: "active", covenantStatus: "ok" },
  { name: "הלוואה בינונית - הפועלים", type: "term_loan", lender: "הפועלים", total: 1500000, drawn: 1250000, available: 0, rate: "4.8% קבוע", effectiveRate: 4.8, maturity: "2028-12-31", status: "active", covenantStatus: "ok" },
  { name: "ליסינג ציוד CNC", type: "leasing", lender: "מזרחי ליסינג", total: 450000, drawn: 320000, available: 0, rate: "5.5% קבוע", effectiveRate: 5.5, maturity: "2027-03-31", status: "active", covenantStatus: "warning" },
  { name: "אשראי ספקים (Foshan)", type: "trade_finance", lender: "HSBC", total: 300000, drawn: 180000, available: 120000, rate: "SOFR + 2.5%", effectiveRate: 7.8, maturity: "2026-09-30", status: "active", covenantStatus: "ok" },
];

const covenants = [
  { name: "Current Ratio ≥ 1.5", formula: "current_assets / current_liabilities", required: 1.5, actual: 2.12, headroom: 41, status: "ok", facility: "לאומי + הפועלים" },
  { name: "Debt/Equity ≤ 1.0", formula: "total_debt / equity", required: 1.0, actual: 0.50, headroom: 50, status: "ok", facility: "הפועלים" },
  { name: "DSCR ≥ 2.0", formula: "NOI / debt_service", required: 2.0, actual: 2.8, headroom: 40, status: "ok", facility: "הפועלים" },
  { name: "Net Debt/EBITDA ≤ 3.0", formula: "net_debt / ebitda", required: 3.0, actual: 1.6, headroom: 47, status: "ok", facility: "לאומי" },
  { name: "Interest Coverage ≥ 4.0", formula: "ebit / interest_expense", required: 4.0, actual: 5.4, headroom: 35, status: "ok", facility: "הפועלים" },
  { name: "Minimum Cash Balance ₪500K", formula: "cash >= 500000", required: 500000, actual: 2850000, headroom: 470, status: "ok", facility: "מזרחי" },
  { name: "CAPEX/EBITDA ≤ 25%", formula: "capex / ebitda", required: 25, actual: 16, headroom: 36, status: "ok", facility: "הפועלים" },
];

const capitalStructure = {
  equity: 4598170,
  shortTermDebt: 700000,
  longTermDebt: 1200000,
  totalDebt: 1900000,
  totalCapital: 6498170,
  debtRatio: (1900000 / 6498170 * 100),
  equityRatio: (4598170 / 6498170 * 100),
  wacc: 8.2,
  costOfDebt: 5.1,
  costOfEquity: 12.5,
  taxShield: (1900000 * 0.051 * 0.23),
};

const cashBoxes = [
  { name: "קופה ראשית - משרד", balance: 5200, limit: 10000, lastCount: "2026-04-07", custodian: "שרה כהן" },
  { name: "קופה מפעל", balance: 3800, limit: 5000, lastCount: "2026-04-05", custodian: "דוד לוי" },
  { name: "קופה פרויקטים", balance: 1500, limit: 3000, lastCount: "2026-04-01", custodian: "יוסי אברהם" },
];

const fmt = (v: number) => Math.abs(v) >= 1000000 ? `₪${(v / 1000000).toFixed(2)}M` : `₪${v.toLocaleString("he-IL")}`;

export default function TreasuryDashboard() {
  const totalCash = bankAccounts.filter(a => a.currency === "ILS").reduce((s, a) => s + a.balance, 0) +
    bankAccounts.filter(a => a.currency === "EUR").reduce((s, a) => s + a.balance * 3.82, 0);
  const totalDebt = debtFacilities.reduce((s, f) => s + f.drawn, 0);
  const totalAvailable = debtFacilities.reduce((s, f) => s + f.available, 0);
  const netCash = totalCash - totalDebt;
  const pettyCash = cashBoxes.reduce((s, c) => s + c.balance, 0);

  // API
  const { data: apiLiquidity } = useQuery({
    queryKey: ["/api/fin/quant/treasury/liquidity"],
    queryFn: () => authFetch("/api/fin/quant/treasury/liquidity").then(r => r.json()).catch(() => []),
  });
  const { data: apiDebt } = useQuery({
    queryKey: ["/api/fin/quant/treasury/debt"],
    queryFn: () => authFetch("/api/fin/quant/treasury/debt").then(r => r.json()).catch(() => ({ facilities: [], summary: {} })),
  });

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Landmark className="h-7 w-7 text-primary" /> טרז'רי והון
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">בנקים | נזילות | מסגרות | Covenants | מבנה הון | קופות</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-6 gap-3">
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Wallet className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
            <p className="text-[10px] text-emerald-700">מזומנים</p>
            <p className="text-xl font-bold font-mono text-emerald-800">{fmt(totalCash)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Building2 className="h-5 w-5 mx-auto text-red-600 mb-1" />
            <p className="text-[10px] text-red-700">חוב</p>
            <p className="text-xl font-bold font-mono text-red-800">{fmt(totalDebt)}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-blue-600 mb-1" />
            <p className="text-[10px] text-blue-700">Net Cash</p>
            <p className="text-xl font-bold font-mono text-blue-800">{fmt(netCash)}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <CreditCard className="h-5 w-5 mx-auto text-purple-600 mb-1" />
            <p className="text-[10px] text-purple-700">אשראי זמין</p>
            <p className="text-xl font-bold font-mono text-purple-800">{fmt(totalAvailable)}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Percent className="h-5 w-5 mx-auto text-amber-600 mb-1" />
            <p className="text-[10px] text-amber-700">WACC</p>
            <p className="text-xl font-bold font-mono text-amber-800">{capitalStructure.wacc}%</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <Shield className="h-5 w-5 mx-auto text-green-600 mb-1" />
            <p className="text-[10px] text-green-700">Covenants</p>
            <p className="text-xl font-bold text-green-800">{covenants.filter(c => c.status === "ok").length}/{covenants.length} OK</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="accounts" className="text-xs gap-1"><Landmark className="h-3.5 w-3.5" /> בנקים</TabsTrigger>
          <TabsTrigger value="liquidity" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> נזילות</TabsTrigger>
          <TabsTrigger value="debt" className="text-xs gap-1"><Building2 className="h-3.5 w-3.5" /> מסגרות</TabsTrigger>
          <TabsTrigger value="covenants" className="text-xs gap-1"><Shield className="h-3.5 w-3.5" /> Covenants</TabsTrigger>
          <TabsTrigger value="capital" className="text-xs gap-1"><Target className="h-3.5 w-3.5" /> מבנה הון</TabsTrigger>
          <TabsTrigger value="cash" className="text-xs gap-1"><Banknote className="h-3.5 w-3.5" /> קופות</TabsTrigger>
        </TabsList>

        {/* Bank Accounts */}
        <TabsContent value="accounts">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">בנק</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סניף</TableHead>
                    <TableHead className="text-right text-xs font-semibold">חשבון</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סוג</TableHead>
                    <TableHead className="text-right text-xs font-semibold">יתרה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">מסגרת</TableHead>
                    <TableHead className="text-right text-xs font-semibold w-28">ניצול</TableHead>
                    <TableHead className="text-right text-xs font-semibold">מטבע</TableHead>
                    <TableHead className="text-right text-xs font-semibold">פעילות אחרונה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankAccounts.map((acc, i) => {
                    const util = (acc.balance / acc.limit) * 100;
                    return (
                      <TableRow key={i} className="hover:bg-muted/10">
                        <TableCell className="font-medium text-sm flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${acc.color}`} />{acc.bank}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{acc.branch}</TableCell>
                        <TableCell className="text-xs font-mono">{acc.account}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[9px]">{acc.type}</Badge></TableCell>
                        <TableCell className="font-mono text-sm font-bold text-emerald-700">
                          {acc.currency === "EUR" ? "€" : "₪"}{acc.balance.toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {acc.currency === "EUR" ? "€" : "₪"}{acc.limit.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Progress value={util} className="h-1.5 w-16" />
                            <span className="text-[10px] font-mono">{util.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="secondary" className="text-[9px]">{acc.currency}</Badge></TableCell>
                        <TableCell className="text-[10px] text-muted-foreground">{acc.lastActivity}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-primary/5 font-bold border-t-2">
                    <TableCell colSpan={4} className="text-sm">סה״כ (ILS equivalent)</TableCell>
                    <TableCell className="font-mono text-sm text-emerald-800">{fmt(totalCash)}</TableCell>
                    <TableCell colSpan={4} />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Liquidity Ladder */}
        <TabsContent value="liquidity">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">סולם נזילות (Liquidity Ladder)</CardTitle>
              <CardDescription>תחזית תזרימים לפי דליים זמניים — יתרת פתיחה: {fmt(totalCash)}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">תקופה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">תקבולים</TableHead>
                    <TableHead className="text-right text-xs font-semibold">תשלומים</TableHead>
                    <TableHead className="text-right text-xs font-semibold">נטו</TableHead>
                    <TableHead className="text-right text-xs font-semibold">מצטבר</TableHead>
                    <TableHead className="text-right text-xs font-semibold w-80">פריטים עיקריים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liquidityBuckets.map((b, i) => (
                    <TableRow key={i} className={`hover:bg-muted/10 ${b.net < 0 ? "bg-red-50/30" : ""}`}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-xs">{b.bucket}</p>
                          <p className="text-[10px] text-muted-foreground">{b.label}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-emerald-600">{fmt(b.inflow)}</TableCell>
                      <TableCell className="font-mono text-xs text-red-600">{fmt(b.outflow)}</TableCell>
                      <TableCell className={`font-mono text-xs font-bold ${b.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {b.net >= 0 ? "+" : ""}{fmt(b.net)}
                      </TableCell>
                      <TableCell className="font-mono text-xs font-bold">{fmt(b.cumulative)}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{b.items}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Liquidity bar visualization */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">מצטבר נזילות</CardTitle></CardHeader>
            <CardContent>
              <div className="h-32 flex items-end gap-4 justify-around">
                {liquidityBuckets.map((b, i) => {
                  const maxCum = Math.max(...liquidityBuckets.map(lb => lb.cumulative));
                  const h = (b.cumulative / maxCum) * 100;
                  return (
                    <div key={i} className="flex flex-col items-center gap-1 flex-1">
                      <span className="text-[9px] font-mono">{fmt(b.cumulative)}</span>
                      <div className={`w-full rounded-t ${b.net >= 0 ? "bg-emerald-400" : "bg-red-400"}`} style={{ height: `${h}%` }} />
                      <span className="text-[9px] text-muted-foreground">{b.bucket}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Debt Facilities */}
        <TabsContent value="debt">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">מסגרת</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סוג</TableHead>
                    <TableHead className="text-right text-xs font-semibold">מלווה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סכום כולל</TableHead>
                    <TableHead className="text-right text-xs font-semibold">ניצול</TableHead>
                    <TableHead className="text-right text-xs font-semibold">זמין</TableHead>
                    <TableHead className="text-right text-xs font-semibold">ריבית</TableHead>
                    <TableHead className="text-right text-xs font-semibold">פקיעה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">C</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debtFacilities.map((f, i) => (
                    <TableRow key={i} className="hover:bg-muted/10">
                      <TableCell className="font-medium text-xs">{f.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[9px]">{f.type}</Badge></TableCell>
                      <TableCell className="text-xs">{f.lender}</TableCell>
                      <TableCell className="font-mono text-xs">{fmt(f.total)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Progress value={(f.drawn / f.total) * 100} className="h-1.5 w-14" />
                          <span className="text-[10px] font-mono">{fmt(f.drawn)}</span>
                        </div>
                      </TableCell>
                      <TableCell className={`font-mono text-xs ${f.available > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
                        {fmt(f.available)}
                      </TableCell>
                      <TableCell className="text-[10px]">{f.rate}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{f.maturity}</TableCell>
                      <TableCell>
                        {f.covenantStatus === "ok"
                          ? <CheckCircle className="h-4 w-4 text-emerald-500" />
                          : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-primary/5 font-bold border-t-2">
                    <TableCell colSpan={3} className="text-xs">סה״כ</TableCell>
                    <TableCell className="font-mono text-xs">{fmt(debtFacilities.reduce((s, f) => s + f.total, 0))}</TableCell>
                    <TableCell className="font-mono text-xs">{fmt(totalDebt)}</TableCell>
                    <TableCell className="font-mono text-xs text-emerald-600">{fmt(totalAvailable)}</TableCell>
                    <TableCell className="text-[10px]">ממוצע: {(debtFacilities.reduce((s, f) => s + f.effectiveRate * f.drawn, 0) / totalDebt).toFixed(1)}%</TableCell>
                    <TableCell colSpan={2} />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Covenants */}
        <TabsContent value="covenants">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">מעקב Covenants — אמות מידה פיננסיות</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">Covenant</TableHead>
                    <TableHead className="text-right text-xs font-semibold">נוסחה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">נדרש</TableHead>
                    <TableHead className="text-right text-xs font-semibold">בפועל</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Headroom</TableHead>
                    <TableHead className="text-right text-xs font-semibold w-28">מרווח</TableHead>
                    <TableHead className="text-right text-xs font-semibold">מסגרת</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {covenants.map((c, i) => (
                    <TableRow key={i} className="hover:bg-muted/10">
                      <TableCell className="font-medium text-xs">{c.name}</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">{c.formula}</TableCell>
                      <TableCell className="font-mono text-xs">{typeof c.required === "number" && c.required > 1000 ? fmt(c.required) : c.required}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-emerald-700">
                        {typeof c.actual === "number" && c.actual > 1000 ? fmt(c.actual) : c.actual}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-emerald-600 border-emerald-300 text-[10px]">
                          +{c.headroom}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Progress value={100 - c.headroom * 0.8} className="h-1.5 w-16" />
                          <span className="text-[10px] font-mono">{(100 - c.headroom * 0.8).toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{c.facility}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="text-[10px] text-emerald-600 font-medium">עומד</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Capital Structure */}
        <TabsContent value="capital">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">מבנה הון</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="h-8 flex rounded-lg overflow-hidden">
                  <div className="bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${capitalStructure.equityRatio}%` }}>
                    הון {capitalStructure.equityRatio.toFixed(0)}%
                  </div>
                  <div className="bg-amber-500 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${(capitalStructure.shortTermDebt / capitalStructure.totalCapital * 100)}%` }}>
                    קצר
                  </div>
                  <div className="bg-red-500 flex items-center justify-center text-white text-[10px] font-bold" style={{ width: `${(capitalStructure.longTermDebt / capitalStructure.totalCapital * 100)}%` }}>
                    ארוך
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    ["הון עצמי", fmt(capitalStructure.equity), "text-emerald-600"],
                    ["חוב לז\"ק", fmt(capitalStructure.shortTermDebt), "text-amber-600"],
                    ["חוב לז\"א", fmt(capitalStructure.longTermDebt), "text-red-600"],
                    ["סה״כ הון", fmt(capitalStructure.totalCapital), "font-bold"],
                    ["Debt/Equity", `${(capitalStructure.totalDebt / capitalStructure.equity).toFixed(2)}x`, ""],
                    ["Equity Ratio", `${capitalStructure.equityRatio.toFixed(1)}%`, ""],
                  ].map(([label, value, cls], i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-dashed">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`font-mono font-semibold ${cls}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">עלות הון (WACC)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="text-center py-4">
                  <p className="text-4xl font-bold font-mono text-primary">{capitalStructure.wacc}%</p>
                  <p className="text-xs text-muted-foreground">Weighted Average Cost of Capital</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {[
                    ["עלות חוב (Kd)", `${capitalStructure.costOfDebt}%`],
                    ["עלות הון (Ke)", `${capitalStructure.costOfEquity}%`],
                    ["מגן מס", fmt(capitalStructure.taxShield)],
                    ["WACC", `${capitalStructure.wacc}%`],
                  ].map(([label, value], i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b border-dashed">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-mono font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Cash Boxes */}
        <TabsContent value="cash">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2"><Banknote className="h-4 w-4" /> קופות מזומנים</CardTitle>
                <Badge variant="outline">סה״כ: ₪{pettyCash.toLocaleString()}</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">קופה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">יתרה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">מסגרת</TableHead>
                    <TableHead className="text-right text-xs font-semibold w-28">ניצול</TableHead>
                    <TableHead className="text-right text-xs font-semibold">ספירה אחרונה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">אחראי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashBoxes.map((box, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-xs">{box.name}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">₪{box.balance.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">₪{box.limit.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Progress value={(box.balance / box.limit) * 100} className="h-1.5 w-16" />
                          <span className="text-[10px] font-mono">{((box.balance / box.limit) * 100).toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px] text-muted-foreground">{box.lastCount}</TableCell>
                      <TableCell className="text-xs">{box.custodian}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
