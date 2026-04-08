import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Building2, DollarSign, TrendingUp, TrendingDown, Shield,
  Landmark, AlertTriangle, CheckCircle, ArrowLeftRight, Wallet
} from "lucide-react";

const bankAccounts = [
  { bank: "בנק לאומי", account: "12-345-67890", type: "עו\"ש", balance: 1450000, limit: 2000000, currency: "ILS" },
  { bank: "בנק הפועלים", account: "56-789-12345", type: "עו\"ש", balance: 820000, limit: 1500000, currency: "ILS" },
  { bank: "בנק דיסקונט", account: "78-123-45678", type: "פיקדון", balance: 580000, limit: 580000, currency: "ILS" },
  { bank: "HSBC", account: "GB29NWBK60161331926819", type: "FX Account", balance: 125000, limit: 500000, currency: "EUR" },
];

const liquidityBuckets = [
  { bucket: "0-7 ימים", inflow: 380000, outflow: 290000, net: 90000, cumulative: 2940000 },
  { bucket: "8-30 ימים", inflow: 1200000, outflow: 950000, net: 250000, cumulative: 3190000 },
  { bucket: "31-60 ימים", inflow: 890000, outflow: 1100000, net: -210000, cumulative: 2980000 },
  { bucket: "61-90 ימים", inflow: 750000, outflow: 680000, net: 70000, cumulative: 3050000 },
  { bucket: "91-180 ימים", inflow: 1800000, outflow: 1650000, net: 150000, cumulative: 3200000 },
  { bucket: "181-365 ימים", inflow: 3200000, outflow: 2800000, net: 400000, cumulative: 3600000 },
];

const debtFacilities = [
  { name: "מסגרת אשראי בנק לאומי", type: "revolving", lender: "לאומי", total: 2000000, drawn: 550000, rate: 5.2, maturity: "2027-06-30", covenantStatus: "ok" },
  { name: "הלוואה לטווח בינוני", type: "term_loan", lender: "הפועלים", total: 1500000, drawn: 1250000, rate: 4.8, maturity: "2028-12-31", covenantStatus: "ok" },
  { name: "ליסינג ציוד", type: "leasing", lender: "מזרחי", total: 450000, drawn: 320000, rate: 5.5, maturity: "2027-03-31", covenantStatus: "warning" },
];

const covenants = [
  { name: "Current Ratio ≥ 1.5", actual: 1.85, required: 1.5, status: "ok" },
  { name: "Debt/Equity ≤ 1.0", actual: 0.62, required: 1.0, status: "ok" },
  { name: "DSCR ≥ 2.0", actual: 2.8, required: 2.0, status: "ok" },
  { name: "Net Debt/EBITDA ≤ 3.0", actual: 2.1, required: 3.0, status: "ok" },
  { name: "Interest Coverage ≥ 4.0", actual: 5.4, required: 4.0, status: "ok" },
];

export default function TreasuryDashboard() {
  const totalCash = bankAccounts.reduce((s, a) => s + (a.currency === "ILS" ? a.balance : a.balance * 3.8), 0);
  const totalDebt = debtFacilities.reduce((s, f) => s + f.drawn, 0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Landmark className="h-7 w-7 text-primary" /> טרז'רי והון
          </h1>
          <p className="text-sm text-muted-foreground mt-1">נזילות | מסגרות אשראי | Covenants | מבנה הון</p>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Wallet className="h-8 w-8 text-emerald-600" />
              <div>
                <p className="text-xs text-muted-foreground">מזומנים זמינים</p>
                <p className="text-2xl font-bold font-mono text-emerald-700">₪{(totalCash / 1000000).toFixed(2)}M</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Building2 className="h-8 w-8 text-red-600" />
              <div>
                <p className="text-xs text-muted-foreground">חוב כולל</p>
                <p className="text-2xl font-bold font-mono text-red-700">₪{(totalDebt / 1000000).toFixed(2)}M</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-blue-600" />
              <div>
                <p className="text-xs text-muted-foreground">Net Cash Position</p>
                <p className="text-2xl font-bold font-mono text-blue-700">₪{((totalCash - totalDebt) / 1000000).toFixed(2)}M</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-purple-600" />
              <div>
                <p className="text-xs text-muted-foreground">Covenant Status</p>
                <p className="text-2xl font-bold text-emerald-600">5/5 OK</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="accounts">
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="accounts">חשבונות בנק</TabsTrigger>
          <TabsTrigger value="liquidity">סולם נזילות</TabsTrigger>
          <TabsTrigger value="debt">מסגרות אשראי</TabsTrigger>
          <TabsTrigger value="covenants">Covenants</TabsTrigger>
        </TabsList>

        {/* Bank Accounts */}
        <TabsContent value="accounts">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right font-semibold">בנק</TableHead>
                    <TableHead className="text-right font-semibold">חשבון</TableHead>
                    <TableHead className="text-right font-semibold">סוג</TableHead>
                    <TableHead className="text-right font-semibold">יתרה</TableHead>
                    <TableHead className="text-right font-semibold">מסגרת</TableHead>
                    <TableHead className="text-right font-semibold">ניצול</TableHead>
                    <TableHead className="text-right font-semibold">מטבע</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankAccounts.map((acc, i) => {
                    const utilization = (acc.balance / acc.limit) * 100;
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium flex items-center gap-2">
                          <Landmark className="h-4 w-4 text-muted-foreground" />{acc.bank}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{acc.account}</TableCell>
                        <TableCell><Badge variant="outline">{acc.type}</Badge></TableCell>
                        <TableCell className="font-mono font-bold text-emerald-700">
                          {acc.currency === "ILS" ? "₪" : "€"}{acc.balance.toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {acc.currency === "ILS" ? "₪" : "€"}{acc.limit.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={utilization} className="h-2 w-20" />
                            <span className="text-xs font-mono">{utilization.toFixed(0)}%</span>
                          </div>
                        </TableCell>
                        <TableCell><Badge variant="secondary">{acc.currency}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Liquidity Ladder */}
        <TabsContent value="liquidity">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">סולם נזילות (Liquidity Ladder)</CardTitle>
              <CardDescription>תחזית תזרימים לפי דליים זמניים</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right font-semibold">תקופה</TableHead>
                    <TableHead className="text-right font-semibold">תקבולים</TableHead>
                    <TableHead className="text-right font-semibold">תשלומים</TableHead>
                    <TableHead className="text-right font-semibold">נטו</TableHead>
                    <TableHead className="text-right font-semibold">מצטבר</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liquidityBuckets.map((b, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{b.bucket}</TableCell>
                      <TableCell className="font-mono text-emerald-600">₪{b.inflow.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-red-600">₪{b.outflow.toLocaleString()}</TableCell>
                      <TableCell className={`font-mono font-bold ${b.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                        {b.net >= 0 ? "+" : ""}₪{b.net.toLocaleString()}
                      </TableCell>
                      <TableCell className="font-mono font-bold">₪{(b.cumulative / 1000000).toFixed(2)}M</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Debt Facilities */}
        <TabsContent value="debt">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right font-semibold">מסגרת</TableHead>
                    <TableHead className="text-right font-semibold">סוג</TableHead>
                    <TableHead className="text-right font-semibold">גורם מממן</TableHead>
                    <TableHead className="text-right font-semibold">סכום כולל</TableHead>
                    <TableHead className="text-right font-semibold">ניצול</TableHead>
                    <TableHead className="text-right font-semibold">ריבית</TableHead>
                    <TableHead className="text-right font-semibold">פקיעה</TableHead>
                    <TableHead className="text-right font-semibold">Covenant</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {debtFacilities.map((f, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{f.name}</TableCell>
                      <TableCell><Badge variant="outline">{f.type}</Badge></TableCell>
                      <TableCell>{f.lender}</TableCell>
                      <TableCell className="font-mono">₪{f.total.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={(f.drawn / f.total) * 100} className="h-2 w-16" />
                          <span className="text-xs font-mono">₪{f.drawn.toLocaleString()}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{f.rate}%</TableCell>
                      <TableCell className="text-sm">{f.maturity}</TableCell>
                      <TableCell>
                        {f.covenantStatus === "ok"
                          ? <CheckCircle className="h-4 w-4 text-emerald-500" />
                          : <AlertTriangle className="h-4 w-4 text-amber-500" />
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Covenants */}
        <TabsContent value="covenants">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">מעקב Covenants</CardTitle>
              <CardDescription>עמידה בתנאי אמות מידה פיננסיות</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-right font-semibold">Covenant</TableHead>
                    <TableHead className="text-right font-semibold">נדרש</TableHead>
                    <TableHead className="text-right font-semibold">בפועל</TableHead>
                    <TableHead className="text-right font-semibold">מרווח</TableHead>
                    <TableHead className="text-right font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {covenants.map((c, i) => {
                    const headroom = ((c.actual - c.required) / c.required * 100);
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="font-mono">{c.required}</TableCell>
                        <TableCell className="font-mono font-bold text-emerald-700">{c.actual}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-emerald-600">
                            +{headroom.toFixed(0)}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                            <span className="text-sm text-emerald-600 font-medium">עומד</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
