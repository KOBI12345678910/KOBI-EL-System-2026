import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RotateCcw, Package, Wallet, Wrench, Clock, TrendingDown,
  Search, BarChart3, CheckCircle2, XCircle, Eye, ClipboardCheck,
  ArrowUpRight, ArrowDownRight, Truck, AlertTriangle, CreditCard, FileText
} from "lucide-react";

const FALLBACK_KPIS = [
  { label: "RMA פתוחים", value: 12, icon: RotateCcw, color: "text-blue-500", bg: "bg-blue-50", change: "+3", up: true },
  { label: "יחידות שהוחזרו", value: 47, icon: Package, color: "text-amber-500", bg: "bg-amber-50", change: "+8", up: true },
  { label: "ערך החזרים ₪", value: "34,200", icon: Wallet, color: "text-red-500", bg: "bg-red-50", change: "+5,100", up: true },
  { label: "שיעור תיקון", value: "62%", icon: Wrench, color: "text-green-500", bg: "bg-green-50", change: "+4%", up: true },
  { label: "ימי עיבוד ממוצע", value: "4.8", icon: Clock, color: "text-purple-500", bg: "bg-purple-50", change: "-0.7", up: false },
  { label: "שיעור RMA", value: "2.1%", icon: TrendingDown, color: "text-teal-500", bg: "bg-teal-50", change: "-0.3%", up: false },
];

const FALLBACK_RMA_LIST = [
  { id: "RMA-5001", customer: "אלומיניום הצפון בע\"מ", product: "פרופיל 6063 T5", reason: "סדק באורך", qty: 24, status: "התקבל", date: "07/04/2026", value: 3600 },
  { id: "RMA-5002", customer: "זגוגית השרון", product: "זכוכית מחוסמת 10 מ\"מ", reason: "שבר בהובלה", qty: 6, status: "בבדיקה", date: "06/04/2026", value: 4800 },
  { id: "RMA-5003", customer: "בניין ירוק בע\"מ", product: "חלון הזזה כפול", reason: "מידות שגויות", qty: 4, status: "אושר", date: "05/04/2026", value: 8200 },
  { id: "RMA-5004", customer: "מתכת פלוס", product: "פח גלוון 0.5 מ\"מ", reason: "חלודה", qty: 15, status: "נדחה", date: "04/04/2026", value: 2250 },
  { id: "RMA-5005", customer: "פרויקט מגדלי ים", product: "מעקה אלומיניום", reason: "פגם בריתוך", qty: 3, status: "זוכה", date: "03/04/2026", value: 5400 },
  { id: "RMA-5006", customer: "קבלן שמעון אלון", product: "דלת פלדה", reason: "צבע לא תואם", qty: 2, status: "התקבל", date: "07/04/2026", value: 3100 },
  { id: "RMA-5007", customer: "חברת בנייה אופק", product: "תריס חשמלי", reason: "תקלת מנוע", qty: 5, status: "בבדיקה", date: "06/04/2026", value: 7500 },
  { id: "RMA-5008", customer: "אלומטל תעשיות", product: "פרופיל תרמי", reason: "עיוות", qty: 10, status: "אושר", date: "05/04/2026", value: 4200 },
  { id: "RMA-5009", customer: "זכוכית אילת", product: "זכוכית למינציה", reason: "בועות באיטום", qty: 8, status: "זוכה", date: "02/04/2026", value: 6400 },
  { id: "RMA-5010", customer: "מפעלי גולן מתכת", product: "נירוסטה 304 גיליון", reason: "שריטות", qty: 12, status: "בבדיקה", date: "07/04/2026", value: 3800 },
];

const FALLBACK_INSPECTIONS = [
  { rma: "RMA-5001", product: "פרופיל 6063 T5", inspector: "אבי מלכה", date: "08/04/2026", result: "פגם ייצור", recommendation: "החלפה מלאה", qcScore: 35 },
  { rma: "RMA-5002", product: "זכוכית מחוסמת 10 מ\"מ", inspector: "רונן שפירא", date: "08/04/2026", result: "נזק הובלה", recommendation: "זיכוי חלקי", qcScore: 55 },
  { rma: "RMA-5004", product: "פח גלוון 0.5 מ\"מ", inspector: "אבי מלכה", date: "07/04/2026", result: "שימוש לא תקין", recommendation: "דחייה", qcScore: 78 },
  { rma: "RMA-5007", product: "תריס חשמלי", inspector: "רונן שפירא", date: "08/04/2026", result: "תקלת רכיב", recommendation: "תיקון + החזרה", qcScore: 42 },
  { rma: "RMA-5010", product: "נירוסטה 304 גיליון", inspector: "אבי מלכה", date: "08/04/2026", result: "בבדיקה", recommendation: "ממתין", qcScore: 0 },
];

const FALLBACK_CREDITS = [
  { rma: "RMA-5005", customer: "פרויקט מגדלי ים", type: "זיכוי מלא", amount: 5400, invoiceRef: "INV-8834", date: "04/04/2026", status: "בוצע" },
  { rma: "RMA-5009", customer: "זכוכית אילת", type: "זיכוי מלא", amount: 6400, invoiceRef: "INV-8801", date: "03/04/2026", status: "בוצע" },
  { rma: "RMA-5003", customer: "בניין ירוק בע\"מ", type: "החלפת מוצר", amount: 8200, invoiceRef: "INV-8812", date: "06/04/2026", status: "בתהליך" },
  { rma: "RMA-5008", customer: "אלומטל תעשיות", type: "זיכוי חלקי", amount: 2940, invoiceRef: "INV-8790", date: "06/04/2026", status: "בתהליך" },
];

const FALLBACK_RETURN_REASONS = [
  { reason: "פגם ייצור", count: 18, pct: 38, color: "bg-red-500" },
  { reason: "מידות שגויות", count: 10, pct: 21, color: "bg-amber-500" },
  { reason: "נזק בהובלה", count: 8, pct: 17, color: "bg-blue-500" },
  { reason: "צבע לא תואם", count: 5, pct: 11, color: "bg-purple-500" },
  { reason: "תקלת רכיב", count: 4, pct: 8, color: "bg-teal-500" },
  { reason: "אחר", count: 2, pct: 5, color: "bg-gray-400" },
];

const statusColor: Record<string, string> = {
  "התקבל": "bg-blue-100 text-blue-700",
  "בבדיקה": "bg-amber-100 text-amber-700",
  "אושר": "bg-green-100 text-green-700",
  "נדחה": "bg-red-100 text-red-700",
  "זוכה": "bg-purple-100 text-purple-700",
};

const creditStatusColor: Record<string, string> = {
  "בוצע": "bg-green-100 text-green-700",
  "בתהליך": "bg-amber-100 text-amber-700",
};

export default function Rma() {
  const { data: rmaData } = useQuery({
    queryKey: ["rma"],
    queryFn: () => authFetch("/api/customer-service/rma"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = rmaData ?? FALLBACK_KPIS;
  const credits = FALLBACK_CREDITS;
  const inspections = FALLBACK_INSPECTIONS;
  const returnReasons = FALLBACK_RETURN_REASONS;
  const rmaList = FALLBACK_RMA_LIST;

  const [search, setSearch] = useState("");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RotateCcw className="h-7 w-7 text-blue-600" />
            ניהול החזרות RMA - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">אישור החזרת סחורה, בדיקות וזיכויים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><BarChart3 className="h-4 w-4 ml-1" />דוחות</Button>
          <Button size="sm"><FileText className="h-4 w-4 ml-1" />RMA חדש</Button>
        </div>
      </div>

      {/* 6 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={i}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${k.bg}`}><Icon className={`h-5 w-5 ${k.color}`} /></div>
                  <span className={`text-xs font-medium flex items-center gap-0.5 ${k.up ? (k.label.includes("תיקון") ? "text-green-600" : "text-red-600") : "text-green-600"}`}>
                    {k.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {k.change}
                  </span>
                </div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="rmalist" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="rmalist">רשימת RMA</TabsTrigger>
          <TabsTrigger value="inspection">בדיקות</TabsTrigger>
          <TabsTrigger value="credits">זיכויים והחזרים</TabsTrigger>
          <TabsTrigger value="analytics">ניתוח</TabsTrigger>
        </TabsList>

        {/* RMA List Tab */}
        <TabsContent value="rmalist" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">רשימת בקשות RMA</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="חיפוש RMA..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right p-3 font-medium text-muted-foreground">מס' RMA</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">לקוח</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">מוצר</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סיבה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">כמות</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">ערך ₪</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סטטוס</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">תאריך</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rmaList
                      .filter(r => !search || Object.values(r).some(v => String(v).includes(search)))
                      .map((r, i) => (
                        <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
                          <td className="p-3 font-mono text-xs font-bold">{r.id}</td>
                          <td className="p-3 font-medium">{r.customer}</td>
                          <td className="p-3">{r.product}</td>
                          <td className="p-3">{r.reason}</td>
                          <td className="p-3 text-center">{r.qty}</td>
                          <td className="p-3 font-medium">{r.value.toLocaleString()}</td>
                          <td className="p-3"><Badge className={statusColor[r.status]}>{r.status}</Badge></td>
                          <td className="p-3 text-xs text-muted-foreground">{r.date}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inspection Tab */}
        <TabsContent value="inspection" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-amber-500" />בדיקות איכות - פריטים שהוחזרו</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right p-3 font-medium text-muted-foreground">RMA</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">מוצר</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">בודק</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">תאריך</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">ממצא</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">המלצה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">ציון QC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.map((ins, i) => (
                      <tr key={i} className="border-b hover:bg-muted/50">
                        <td className="p-3 font-mono text-xs font-bold">{ins.rma}</td>
                        <td className="p-3">{ins.product}</td>
                        <td className="p-3">{ins.inspector}</td>
                        <td className="p-3 text-xs">{ins.date}</td>
                        <td className="p-3 font-medium">{ins.result}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={
                            ins.recommendation === "דחייה" ? "border-red-300 text-red-600" :
                            ins.recommendation === "ממתין" ? "border-gray-300 text-gray-600" :
                            "border-green-300 text-green-600"
                          }>{ins.recommendation}</Badge>
                        </td>
                        <td className="p-3">
                          {ins.qcScore > 0 ? (
                            <div className="flex items-center gap-2">
                              <Progress value={ins.qcScore} className="h-2 w-16" />
                              <span className={`text-xs font-bold ${ins.qcScore < 50 ? "text-red-600" : ins.qcScore < 70 ? "text-amber-600" : "text-green-600"}`}>{ins.qcScore}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">ממתין</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5 text-center">
                <Eye className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                <p className="text-3xl font-bold">3</p>
                <p className="text-sm text-muted-foreground">בבדיקה כעת</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <CheckCircle2 className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="text-3xl font-bold text-green-600">62%</p>
                <p className="text-sm text-muted-foreground">שיעור אישור</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <XCircle className="h-8 w-8 mx-auto text-red-500 mb-2" />
                <p className="text-3xl font-bold text-red-600">12%</p>
                <p className="text-sm text-muted-foreground">שיעור דחייה</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Credits Tab */}
        <TabsContent value="credits" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><CreditCard className="h-5 w-5 text-green-500" />זיכויים והחזרים כספיים</CardTitle>
                <Badge className="bg-blue-100 text-blue-700">סה"כ החודש: ₪22,940</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right p-3 font-medium text-muted-foreground">RMA</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">לקוח</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סוג זיכוי</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סכום ₪</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">חשבונית</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">תאריך</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {credits.map((c, i) => (
                      <tr key={i} className="border-b hover:bg-muted/50">
                        <td className="p-3 font-mono text-xs font-bold">{c.rma}</td>
                        <td className="p-3 font-medium">{c.customer}</td>
                        <td className="p-3">{c.type}</td>
                        <td className="p-3 font-bold">{c.amount.toLocaleString()}</td>
                        <td className="p-3 font-mono text-xs">{c.invoiceRef}</td>
                        <td className="p-3 text-xs">{c.date}</td>
                        <td className="p-3"><Badge className={creditStatusColor[c.status]}>{c.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingDown className="h-5 w-5 text-red-500" />סיבות החזרה</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {returnReasons.map((r, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{r.reason}</span>
                      <span className="text-muted-foreground">{r.count} ({r.pct}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full ${r.color}`} style={{ width: `${r.pct}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-lg">מגמות חודשיות</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {[
                  { month: "ינואר 2026", rmas: 8, value: 22400, rate: "1.8%" },
                  { month: "פברואר 2026", rmas: 11, value: 29800, rate: "2.3%" },
                  { month: "מרץ 2026", rmas: 10, value: 31500, rate: "2.0%" },
                  { month: "אפריל 2026 (עד כה)", rmas: 12, value: 34200, rate: "2.1%" },
                ].map((m, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div>
                      <p className="font-medium">{m.month}</p>
                      <p className="text-xs text-muted-foreground">{m.rmas} בקשות RMA</p>
                    </div>
                    <div className="text-left">
                      <p className="font-bold">₪{m.value.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">שיעור: {m.rate}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5 text-center">
                <Truck className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                <p className="text-3xl font-bold">4.8 ימים</p>
                <p className="text-sm text-muted-foreground">זמן עיבוד ממוצע</p>
                <p className="text-xs text-green-600 mt-1">שיפור של 12% מהחודש הקודם</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <Wrench className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="text-3xl font-bold text-green-600">62%</p>
                <p className="text-sm text-muted-foreground">שיעור תיקון מוצלח</p>
                <p className="text-xs text-muted-foreground mt-1">38% הוחלפו/זוכו</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-red-500 mb-2" />
                <p className="text-3xl font-bold">פרופילים</p>
                <p className="text-sm text-muted-foreground">מוצר עם הכי הרבה RMA</p>
                <p className="text-xs text-red-600 mt-1">38% מכלל ההחזרות</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
