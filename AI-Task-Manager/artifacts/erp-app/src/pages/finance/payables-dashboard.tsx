import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Building2, DollarSign, Clock, AlertTriangle, CheckCircle,
  Calendar, Send, Lock, Unlock, TrendingDown, Play, Pause
} from "lucide-react";

const agingBuckets = [
  { label: "שוטף (0-30)", amount: 520000, count: 18, color: "bg-emerald-500" },
  { label: "30-60 ימים", amount: 280000, count: 9, color: "bg-amber-500" },
  { label: "60-90 ימים", amount: 120000, count: 5, color: "bg-orange-500" },
  { label: "90+ ימים", amount: 45000, count: 2, color: "bg-red-500" },
];

const duePayments = [
  { id: 1, supplier: "Foshan Glass Co.", invoice: "EXI-000142", amount: 180000, currency: "USD", dueDate: "2026-04-12", daysUntilDue: 4, status: "pending", paymentMethod: "SWIFT", priority: "high" },
  { id: 2, supplier: 'Schüco International', invoice: "EXI-000138", amount: 320000, currency: "EUR", dueDate: "2026-04-15", daysUntilDue: 7, status: "approved", paymentMethod: "SWIFT", priority: "high" },
  { id: 3, supplier: "מפעלי ברזל השרון", invoice: "EXI-000145", amount: 85000, currency: "ILS", dueDate: "2026-04-18", daysUntilDue: 10, status: "pending", paymentMethod: "העברה בנקאית", priority: "medium" },
  { id: 4, supplier: "חברת חשמל", invoice: "EXI-000147", amount: 12000, currency: "ILS", dueDate: "2026-04-20", daysUntilDue: 12, status: "auto", paymentMethod: "הוראת קבע", priority: "low" },
  { id: 5, supplier: "בזק תקשורת", invoice: "EXI-000148", amount: 4500, currency: "ILS", dueDate: "2026-04-25", daysUntilDue: 17, status: "auto", paymentMethod: "הוראת קבע", priority: "low" },
  { id: 6, supplier: "משרד רו\"ח גולדשטיין", invoice: "EXI-000150", amount: 28000, currency: "ILS", dueDate: "2026-04-30", daysUntilDue: 22, status: "pending", paymentMethod: "צ'ק", priority: "medium" },
];

const paymentRuns = [
  { id: 1, date: "2026-04-07", totalAmount: 425000, paymentCount: 8, method: "העברה בנקאית", status: "completed", approvedBy: "CFO" },
  { id: 2, date: "2026-04-01", totalAmount: 185000, paymentCount: 5, method: 'מס"ב', status: "completed", approvedBy: "CFO" },
  { id: 3, date: "2026-03-25", totalAmount: 312000, paymentCount: 12, method: "מעורב", status: "completed", approvedBy: "CFO" },
];

const blockedPayments = [
  { supplier: "ספק X", invoice: "EXI-000135", amount: 42000, reason: "חריגה ממסגרת אשראי", blockedBy: "מערכת", blockedAt: "2026-04-05" },
  { supplier: "ספק Y", invoice: "EXI-000139", amount: 18000, reason: "חסר אישור מנהל", blockedBy: "workflow", blockedAt: "2026-04-06" },
];

const totalPayables = agingBuckets.reduce((s, b) => s + b.amount, 0);
const totalDue7Days = duePayments.filter(p => p.daysUntilDue <= 7).reduce((s, p) => s + p.amount, 0);
const fmt = (v: number) => `₪${v.toLocaleString("he-IL")}`;

export default function PayablesDashboard() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" /> זכאים ותשלומים לספקים
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Aging | לוח תשלומים | הרצות | חסומים</p>
        </div>
        <Button><Play className="h-4 w-4 ml-1" /> הרץ תשלומים</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3">
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-blue-700">סה״כ זכאים</p>
            <p className="text-xl font-bold font-mono text-blue-800">{fmt(totalPayables)}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-red-700">לתשלום 7 ימים</p>
            <p className="text-xl font-bold font-mono text-red-800">{fmt(totalDue7Days)}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-amber-700">DPO ממוצע</p>
            <p className="text-xl font-bold font-mono text-amber-800">35 ימים</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-purple-700">חסומים</p>
            <p className="text-xl font-bold text-purple-800">{blockedPayments.length}</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-3 pb-2 text-center">
            <p className="text-[10px] text-emerald-700">שולמו החודש</p>
            <p className="text-xl font-bold font-mono text-emerald-800">{fmt(paymentRuns.reduce((s, r) => s + r.totalAmount, 0))}</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging bar */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">גיול ספקים (AP Aging)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-1 h-8 rounded-lg overflow-hidden mb-2">
            {agingBuckets.map((b, i) => (
              <div key={i} className={`${b.color} flex items-center justify-center text-white text-[9px] font-bold`}
                style={{ width: `${(b.amount / totalPayables) * 100}%` }}>
                {(b.amount / totalPayables * 100) > 10 && `${(b.amount / totalPayables * 100).toFixed(0)}%`}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {agingBuckets.map((b, i) => (
              <div key={i}>
                <p className="text-[10px] text-muted-foreground">{b.label}</p>
                <p className="text-sm font-bold font-mono">{fmt(b.amount)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="due">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="due" className="text-xs gap-1"><Calendar className="h-3.5 w-3.5" /> לוח תשלומים</TabsTrigger>
          <TabsTrigger value="runs" className="text-xs gap-1"><Play className="h-3.5 w-3.5" /> הרצות</TabsTrigger>
          <TabsTrigger value="blocked" className="text-xs gap-1"><Lock className="h-3.5 w-3.5" /> חסומים</TabsTrigger>
          <TabsTrigger value="balances" className="text-xs gap-1"><DollarSign className="h-3.5 w-3.5" /> יתרות ספקים</TabsTrigger>
        </TabsList>

        <TabsContent value="due">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">ספק</TableHead>
                    <TableHead className="text-right text-xs font-semibold">חשבונית</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סכום</TableHead>
                    <TableHead className="text-right text-xs font-semibold">מטבע</TableHead>
                    <TableHead className="text-right text-xs font-semibold">תאריך פירעון</TableHead>
                    <TableHead className="text-right text-xs font-semibold">ימים</TableHead>
                    <TableHead className="text-right text-xs font-semibold">אמצעי</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duePayments.map(p => (
                    <TableRow key={p.id} className={p.daysUntilDue <= 7 ? "bg-red-50/30" : ""}>
                      <TableCell className="font-medium text-xs">{p.supplier}</TableCell>
                      <TableCell className="font-mono text-[10px]">{p.invoice}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">{p.currency === "ILS" ? "₪" : p.currency === "EUR" ? "€" : "$"}{p.amount.toLocaleString()}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[9px]">{p.currency}</Badge></TableCell>
                      <TableCell className="text-xs">{p.dueDate}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-mono text-[10px] ${p.daysUntilDue <= 7 ? "text-red-600 border-red-300" : "text-amber-600 border-amber-300"}`}>
                          {p.daysUntilDue}d
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[10px]">{p.paymentMethod}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${
                          p.status === "approved" ? "bg-emerald-100 text-emerald-700" :
                          p.status === "auto" ? "bg-blue-100 text-blue-700" :
                          "bg-amber-100 text-amber-700"
                        }`}>
                          {p.status === "approved" ? "מאושר" : p.status === "auto" ? "אוטומטי" : "ממתין"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">תאריך</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סכום כולל</TableHead>
                    <TableHead className="text-right text-xs font-semibold">תשלומים</TableHead>
                    <TableHead className="text-right text-xs font-semibold">אמצעי</TableHead>
                    <TableHead className="text-right text-xs font-semibold">אושר ע\"י</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentRuns.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{r.date}</TableCell>
                      <TableCell className="font-mono text-xs font-bold">{fmt(r.totalAmount)}</TableCell>
                      <TableCell className="text-xs">{r.paymentCount}</TableCell>
                      <TableCell className="text-xs">{r.method}</TableCell>
                      <TableCell className="text-xs">{r.approvedBy}</TableCell>
                      <TableCell><Badge className="bg-emerald-100 text-emerald-700 text-[9px]"><CheckCircle className="h-3 w-3 ml-1" />בוצע</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="blocked">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-xs font-semibold">ספק</TableHead>
                    <TableHead className="text-right text-xs font-semibold">חשבונית</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סכום</TableHead>
                    <TableHead className="text-right text-xs font-semibold">סיבת חסימה</TableHead>
                    <TableHead className="text-right text-xs font-semibold">חסם</TableHead>
                    <TableHead className="text-right text-xs font-semibold">תאריך</TableHead>
                    <TableHead className="text-right text-xs font-semibold">פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blockedPayments.map((b, i) => (
                    <TableRow key={i} className="bg-red-50/20">
                      <TableCell className="font-medium text-xs">{b.supplier}</TableCell>
                      <TableCell className="font-mono text-[10px]">{b.invoice}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-red-600">{fmt(b.amount)}</TableCell>
                      <TableCell className="text-xs">{b.reason}</TableCell>
                      <TableCell className="text-xs">{b.blockedBy}</TableCell>
                      <TableCell className="text-[10px]">{b.blockedAt}</TableCell>
                      <TableCell><Button variant="outline" size="sm" className="h-6 text-[10px]"><Unlock className="h-3 w-3 ml-1" />שחרר</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="balances">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              יתרות ספקים מפורטות - מחובר למודול ספקים
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
