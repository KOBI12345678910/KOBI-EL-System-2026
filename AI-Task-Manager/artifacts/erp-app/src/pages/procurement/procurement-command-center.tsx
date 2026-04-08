import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ShoppingCart, DollarSign, TrendingUp, TrendingDown, Target,
  AlertTriangle, CheckCircle, Clock, Truck, Shield, BarChart3,
  Building2, Globe, FileText, Zap, ArrowUpRight, ArrowDownRight,
  Package, Users, Award, Search
} from "lucide-react";

// ============================================================
// PROCUREMENT DATA
// ============================================================
const kpis = {
  totalSpendYTD: 8450000,
  totalSpendBudget: 10200000,
  savingsAchieved: 680000,
  savingsPercent: 8.1,
  openPOs: 24,
  openPOsValue: 2850000,
  pendingApprovals: 5,
  pendingApprovalsValue: 420000,
  avgLeadTimeDays: 12,
  onTimeDelivery: 87,
  supplierCount: 42,
  activeRFQs: 3,
  threeWayMatchRate: 94,
  priceVarianceAvg: -2.3,
};

const topSuppliers = [
  { name: "Foshan Glass Co.", spend: 1850000, pct: 21.9, orders: 18, onTime: 82, quality: 88, risk: "medium", country: "סין", trend: "up" },
  { name: "Schüco International", spend: 1420000, pct: 16.8, orders: 12, onTime: 95, quality: 96, risk: "low", country: "גרמניה", trend: "stable" },
  { name: "מפעלי ברזל השרון", spend: 980000, pct: 11.6, orders: 24, onTime: 91, quality: 85, risk: "low", country: "ישראל", trend: "up" },
  { name: "Alumil SA", spend: 750000, pct: 8.9, orders: 8, onTime: 78, quality: 82, risk: "medium", country: "יוון", trend: "down" },
  { name: "חברת חשמל + בזק", spend: 420000, pct: 5.0, orders: 12, onTime: 100, quality: 100, risk: "low", country: "ישראל", trend: "stable" },
];

const pendingApprovals = [
  { id: "PR-000128", requester: "יוסי אברהם", supplier: "Foshan Glass", amount: 185000, category: "חומרי גלם", urgency: "high", waitingDays: 3, approver: "CFO" },
  { id: "PR-000129", requester: "מיכל לוי", supplier: "ספק מקומי", amount: 42000, category: "כלים", urgency: "medium", waitingDays: 1, approver: "מנהל רכש" },
  { id: "PR-000130", requester: "דני כהן", supplier: "Schüco", amount: 95000, category: "חומרי גלם", urgency: "low", waitingDays: 0, approver: "מנהל רכש" },
  { id: "PO-000456", requester: "מערכת", supplier: "מפעלי ברזל", amount: 68000, category: "ברזל", urgency: "medium", waitingDays: 2, approver: "CFO" },
  { id: "PR-000131", requester: "שרה גולד", supplier: "Office Depot", amount: 30000, category: "ציוד משרדי", urgency: "low", waitingDays: 0, approver: "מנהל" },
];

const recentPOs = [
  { number: "PO-000458", supplier: "Foshan Glass", date: "2026-04-08", value: 180000, status: "sent", delivery: "2026-04-25", match: "pending" },
  { number: "PO-000457", supplier: "מפעלי ברזל", date: "2026-04-07", value: 85000, status: "confirmed", delivery: "2026-04-15", match: "matched" },
  { number: "PO-000456", supplier: "Schüco", date: "2026-04-05", value: 320000, status: "pending_approval", delivery: "2026-05-01", match: "pending" },
  { number: "PO-000455", supplier: "Alumil SA", date: "2026-04-03", value: 95000, status: "received", delivery: "2026-04-10", match: "matched" },
  { number: "PO-000454", supplier: "Foshan Glass", date: "2026-04-01", value: 145000, status: "received", delivery: "2026-04-08", match: "mismatch" },
];

const spendByCategory = [
  { category: "אלומיניום", amount: 3200000, pct: 37.9, budget: 3500000, variance: -8.6 },
  { category: "זכוכית", amount: 2100000, pct: 24.9, budget: 2200000, variance: -4.5 },
  { category: "ברזל", amount: 1200000, pct: 14.2, budget: 1100000, variance: 9.1 },
  { category: "אביזרים", amount: 650000, pct: 7.7, budget: 700000, variance: -7.1 },
  { category: "שירותים", amount: 520000, pct: 6.2, budget: 500000, variance: 4.0 },
  { category: "לוגיסטיקה", amount: 380000, pct: 4.5, budget: 400000, variance: -5.0 },
  { category: "ציוד משרדי", amount: 200000, pct: 2.4, budget: 250000, variance: -20.0 },
  { category: "אחר", amount: 200000, pct: 2.4, budget: 250000, variance: -20.0 },
];

const fmt = (v: number) => v >= 1000000 ? `₪${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `₪${(v / 1000).toFixed(0)}K` : `₪${v.toLocaleString()}`;

export default function ProcurementCommandCenter() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-7 w-7 text-primary" /> Procurement Command Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">הוצאה | ספקים | אישורים | 3-Way Match | חיסכון | Risk</p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-7 gap-2">
        {[
          { label: "הוצאה YTD", value: fmt(kpis.totalSpendYTD), sub: `מתוך ${fmt(kpis.totalSpendBudget)}`, icon: DollarSign, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "חיסכון", value: fmt(kpis.savingsAchieved), sub: `${kpis.savingsPercent}%`, icon: TrendingDown, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "POs פתוחות", value: String(kpis.openPOs), sub: fmt(kpis.openPOsValue), icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "ממתין לאישור", value: String(kpis.pendingApprovals), sub: fmt(kpis.pendingApprovalsValue), icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Lead Time ממוצע", value: `${kpis.avgLeadTimeDays}d`, sub: "", icon: Truck, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "On-Time Delivery", value: `${kpis.onTimeDelivery}%`, sub: "", icon: CheckCircle, color: kpis.onTimeDelivery >= 90 ? "text-emerald-600" : "text-amber-600", bg: kpis.onTimeDelivery >= 90 ? "bg-emerald-50" : "bg-amber-50" },
          { label: "3-Way Match", value: `${kpis.threeWayMatchRate}%`, sub: "", icon: Shield, color: "text-teal-600", bg: "bg-teal-50" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg}/40 border-0 shadow-sm`}>
              <CardContent className="pt-2 pb-1.5 text-center px-1">
                <Icon className={`h-3.5 w-3.5 mx-auto ${kpi.color} mb-0.5`} />
                <p className="text-[8px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-sm font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                {kpi.sub && <p className="text-[7px] text-muted-foreground">{kpi.sub}</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="approvals">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="approvals" className="text-xs gap-1"><Clock className="h-3.5 w-3.5" /> אישורים ({kpis.pendingApprovals})</TabsTrigger>
          <TabsTrigger value="suppliers" className="text-xs gap-1"><Building2 className="h-3.5 w-3.5" /> ספקים מובילים</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" /> הזמנות אחרונות</TabsTrigger>
          <TabsTrigger value="spend" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> ניתוח הוצאה</TabsTrigger>
          <TabsTrigger value="savings" className="text-xs gap-1"><TrendingDown className="h-3.5 w-3.5" /> חיסכון</TabsTrigger>
        </TabsList>

        {/* Pending Approvals */}
        <TabsContent value="approvals">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מספר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מבקש</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ספק</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סכום</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">קטגוריה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">דחיפות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ממתין</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מאשר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingApprovals.map(pa => (
                    <TableRow key={pa.id} className={pa.urgency === "high" ? "bg-red-50/20" : ""}>
                      <TableCell className="font-mono text-[10px]">{pa.id}</TableCell>
                      <TableCell className="text-xs">{pa.requester}</TableCell>
                      <TableCell className="text-xs font-medium">{pa.supplier}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">{fmt(pa.amount)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[8px]">{pa.category}</Badge></TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] ${pa.urgency === "high" ? "bg-red-100 text-red-700" : pa.urgency === "medium" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}`}>
                          {pa.urgency === "high" ? "דחוף" : pa.urgency === "medium" ? "רגיל" : "נמוך"}
                        </Badge>
                      </TableCell>
                      <TableCell className={`font-mono text-[10px] ${pa.waitingDays >= 3 ? "text-red-600 font-bold" : ""}`}>{pa.waitingDays}d</TableCell>
                      <TableCell className="text-[10px]">{pa.approver}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="default" size="sm" className="h-6 text-[9px]"><CheckCircle className="h-3 w-3 ml-0.5" />אשר</Button>
                          <Button variant="ghost" size="sm" className="h-6 text-[9px] text-red-600">דחה</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Top Suppliers */}
        <TabsContent value="suppliers">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">ספק</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מדינה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">הוצאה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">נתח %</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">הזמנות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">On-Time</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Quality</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">Risk</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topSuppliers.map((s, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-xs">{s.name}</TableCell>
                      <TableCell className="flex items-center gap-1 text-[10px]"><Globe className="h-3 w-3" />{s.country}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">{fmt(s.spend)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Progress value={s.pct} className="h-1.5 w-12" />
                          <span className="text-[9px] font-mono">{s.pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-[10px]">{s.orders}</TableCell>
                      <TableCell className={`font-mono text-[10px] ${s.onTime >= 90 ? "text-emerald-600" : s.onTime >= 80 ? "text-amber-600" : "text-red-600"}`}>{s.onTime}%</TableCell>
                      <TableCell className={`font-mono text-[10px] ${s.quality >= 90 ? "text-emerald-600" : "text-amber-600"}`}>{s.quality}</TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] ${s.risk === "low" ? "bg-emerald-100 text-emerald-700" : s.risk === "medium" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                          {s.risk === "low" ? "נמוך" : s.risk === "medium" ? "בינוני" : "גבוה"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {s.trend === "up" ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" /> : s.trend === "down" ? <ArrowDownRight className="h-3.5 w-3.5 text-red-500" /> : <span className="text-[10px] text-muted-foreground">→</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Recent POs */}
        <TabsContent value="orders">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מספר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ספק</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סכום</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אספקה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">3-Way</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentPOs.map(po => (
                    <TableRow key={po.number}>
                      <TableCell className="font-mono text-[10px]">{po.number}</TableCell>
                      <TableCell className="text-xs">{po.supplier}</TableCell>
                      <TableCell className="text-[10px]">{po.date}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">{fmt(po.value)}</TableCell>
                      <TableCell className="text-[10px]">{po.delivery}</TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] ${
                          po.status === "received" ? "bg-emerald-100 text-emerald-700" :
                          po.status === "confirmed" ? "bg-blue-100 text-blue-700" :
                          po.status === "sent" ? "bg-purple-100 text-purple-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {po.status === "received" ? "התקבל" : po.status === "confirmed" ? "אושר" : po.status === "sent" ? "נשלח" : "ממתין"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] ${po.match === "matched" ? "bg-emerald-100 text-emerald-700" : po.match === "mismatch" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                          {po.match === "matched" ? "✓ תואם" : po.match === "mismatch" ? "✗ חריגה" : "⏳ ממתין"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Spend Analysis */}
        <TabsContent value="spend">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">ניתוח הוצאה לפי קטגוריה</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">קטגוריה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">הוצאה בפועל</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">נתח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תקציב</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטייה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold w-32">ניצול</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spendByCategory.sort((a, b) => b.amount - a.amount).map((cat, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-xs">{cat.category}</TableCell>
                      <TableCell className="font-mono text-xs">{fmt(cat.amount)}</TableCell>
                      <TableCell className="font-mono text-[10px]">{cat.pct}%</TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">{fmt(cat.budget)}</TableCell>
                      <TableCell>
                        <Badge className={`font-mono text-[9px] ${cat.variance < 0 ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {cat.variance > 0 ? "+" : ""}{cat.variance.toFixed(1)}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Progress value={(cat.amount / cat.budget) * 100} className={`h-2 w-20 ${(cat.amount / cat.budget) > 1 ? "[&>div]:bg-red-500" : ""}`} />
                          <span className="text-[9px] font-mono">{((cat.amount / cat.budget) * 100).toFixed(0)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Savings */}
        <TabsContent value="savings">
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardContent className="pt-5 text-center">
                <TrendingDown className="h-8 w-8 mx-auto text-emerald-600 mb-2" />
                <p className="text-sm text-emerald-700">חיסכון שהושג</p>
                <p className="text-3xl font-bold font-mono text-emerald-800">{fmt(kpis.savingsAchieved)}</p>
                <p className="text-xs text-emerald-600">{kpis.savingsPercent}% מסה"כ ההוצאה</p>
              </CardContent>
            </Card>
            <Card className="border-blue-200 bg-blue-50/30">
              <CardContent className="pt-5 text-center">
                <BarChart3 className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                <p className="text-sm text-blue-700">Price Variance ממוצע</p>
                <p className="text-3xl font-bold font-mono text-blue-800">{kpis.priceVarianceAvg}%</p>
                <p className="text-xs text-blue-600">מתחת למחיר שוק</p>
              </CardContent>
            </Card>
            <Card className="border-purple-200 bg-purple-50/30">
              <CardContent className="pt-5 text-center">
                <Target className="h-8 w-8 mx-auto text-purple-600 mb-2" />
                <p className="text-sm text-purple-700">RFQs פעילים</p>
                <p className="text-3xl font-bold text-purple-800">{kpis.activeRFQs}</p>
                <p className="text-xs text-purple-600">הצעות מתחרות פתוחות</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
