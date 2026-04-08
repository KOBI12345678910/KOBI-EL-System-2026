import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Search, Download, Printer, Receipt, DollarSign, Calculator,
  CheckCircle, FileText, ArrowUpDown, ChevronRight, ChevronLeft, AlertTriangle, TrendingUp
} from "lucide-react";

const FALLBACK_KPIS = [
  { title: 'מע״מ תשומות', value: "₪386,200", icon: Receipt, color: "text-blue-400", bg: "bg-blue-500/10", sub: "חשבוניות רכש" },
  { title: 'מע״מ עסקאות', value: "₪612,800", icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10", sub: "חשבוניות מכירה" },
  { title: 'מע״מ נטו לתשלום', value: "₪226,600", icon: Calculator, color: "text-orange-400", bg: "bg-orange-500/10", sub: "עסקאות - תשומות" },
  { title: "סטטוס הגשה", value: "הוגש", icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10", sub: "תקופה: מרץ 2026" },
];

const FALLBACK_MONTHLY_SUMMARY = [
  { month: "ינואר 2026", input: 298500, output: 478200, net: 179700, status: "הוגש" },
  { month: "פברואר 2026", input: 342100, output: 521400, net: 179300, status: "הוגש" },
  { month: "מרץ 2026", input: 386200, output: 612800, net: 226600, status: "הוגש" },
  { month: "אפריל 2026", input: 125600, output: 198400, net: 72800, status: "טיוטה" },
  { month: "מאי 2026", input: 0, output: 0, net: 0, status: "פתוח" },
  { month: "יוני 2026", input: 0, output: 0, net: 0, status: "פתוח" },
];

const FALLBACK_INPUT_INVOICES = [
  { id: "INV-S-001", vendor: "אלקום חומרי גלם בע״מ", date: "2026-03-05", amount: 125000, vat: 21250, total: 146250, type: "חשבונית מס" },
  { id: "INV-S-002", vendor: "מתכות ישראל אילת", date: "2026-03-08", amount: 98000, vat: 16660, total: 114660, type: "חשבונית מס" },
  { id: "INV-S-003", vendor: "זכוכית פלוט ים המלח", date: "2026-03-12", amount: 87500, vat: 14875, total: 102375, type: "חשבונית מס" },
  { id: "INV-S-004", vendor: "ספקי אנרגיה מרכז", date: "2026-03-15", amount: 45000, vat: 7650, total: 52650, type: "חשבונית מס" },
  { id: "INV-S-005", vendor: "כימיקלים תעשייתיים בע״מ", date: "2026-03-18", amount: 67000, vat: 11390, total: 78390, type: "חשבונית מס" },
  { id: "INV-S-006", vendor: "ציוד בטיחות ארצי", date: "2026-03-20", amount: 34500, vat: 5865, total: 40365, type: "חשבונית מס" },
  { id: "INV-S-007", vendor: "מוביל שינוע הצפון", date: "2026-03-22", amount: 28000, vat: 4760, total: 32760, type: "חשבונית מס/קבלה" },
  { id: "INV-S-008", vendor: "חשמל ותאורה תעשייתית", date: "2026-03-25", amount: 52300, vat: 8891, total: 61191, type: "חשבונית מס" },
];

const FALLBACK_OUTPUT_INVOICES = [
  { id: "INV-C-001", customer: "אלומיניום הגליל בע״מ", date: "2026-03-03", amount: 245000, vat: 41650, total: 286650, type: "חשבונית מס" },
  { id: "INV-C-002", customer: "זגוגית הנגב", date: "2026-03-06", amount: 178000, vat: 30260, total: 208260, type: "חשבונית מס" },
  { id: "INV-C-003", customer: "מתכת השרון", date: "2026-03-10", amount: 156000, vat: 26520, total: 182520, type: "חשבונית מס" },
  { id: "INV-C-004", customer: "חלונות הצפון בע״מ", date: "2026-03-14", amount: 134500, vat: 22865, total: 157365, type: "חשבונית מס" },
  { id: "INV-C-005", customer: "פרופילים מרכז הארץ", date: "2026-03-17", amount: 112000, vat: 19040, total: 131040, type: "חשבונית מס" },
  { id: "INV-C-006", customer: "בניין וזכוכית ת״א", date: "2026-03-20", amount: 198500, vat: 33745, total: 232245, type: "חשבונית מס" },
  { id: "INV-C-007", customer: "גלאס טופ ישראל", date: "2026-03-24", amount: 89000, vat: 15130, total: 104130, type: "חשבונית מס" },
  { id: "INV-C-008", customer: "תריסי אור בע״מ", date: "2026-03-28", amount: 67200, vat: 11424, total: 78624, type: "חשבונית מס/קבלה" },
];

const FALLBACK_RECONCILIATION = [
  { item: 'סה״כ מע״מ עסקאות לפי ספר חשבוניות', book: 612800, reported: 612800, diff: 0 },
  { item: 'סה״כ מע״מ תשומות לפי ספר חשבוניות', book: 386200, reported: 386200, diff: 0 },
  { item: 'מע״מ נטו לפי ספרים', book: 226600, reported: 226600, diff: 0 },
  { item: 'תיקוני מע״מ מתקופות קודמות', book: 0, reported: 3200, diff: -3200 },
  { item: 'זיכויים שהתקבלו', book: 12400, reported: 12400, diff: 0 },
  { item: 'סה״כ מע״מ לתשלום סופי', book: 214200, reported: 217400, diff: -3200 },
];

const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");

const statusColor = (s: string) => {
  const m: Record<string, string> = {
    "הוגש": "bg-green-500/20 text-green-300 border-green-500/30",
    "טיוטה": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    "פתוח": "bg-gray-500/20 text-gray-300 border-gray-500/30",
  };
  return m[s] || "bg-gray-500/20 text-gray-300";
};

export default function ReportVatPage() {
  const { data: reportvatData } = useQuery({
    queryKey: ["report-vat"],
    queryFn: () => authFetch("/api/reports/report_vat"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = reportvatData ?? FALLBACK_KPIS;

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 8;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">דוח מע״מ</h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי | דיווח מע״מ תקופתי - שנת המס 2026</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Printer className="w-4 h-4 ml-1" />הדפסה</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא PCN874</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
              </div>
              <div className="text-xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.title}</div>
              <div className="text-[10px] text-muted-foreground/70 mt-0.5">{kpi.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="monthly" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="monthly">סיכום חודשי</TabsTrigger>
          <TabsTrigger value="input">חשבוניות תשומות</TabsTrigger>
          <TabsTrigger value="output">חשבוניות עסקאות</TabsTrigger>
          <TabsTrigger value="reconcile">התאמות</TabsTrigger>
        </TabsList>

        {/* Monthly Summary Tab */}
        <TabsContent value="monthly">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">סיכום מע״מ חודשי - שנת 2026</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">חודש</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מע״מ תשומות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מע״מ עסקאות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מע״מ נטו</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{row.month}</td>
                        <td className="p-3 text-blue-400">{row.input > 0 ? fmt(row.input) : "-"}</td>
                        <td className="p-3 text-green-400">{row.output > 0 ? fmt(row.output) : "-"}</td>
                        <td className="p-3 font-bold text-orange-400">{row.net > 0 ? fmt(row.net) : "-"}</td>
                        <td className="p-3 text-center"><Badge className={statusColor(row.status)}>{row.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border/50 bg-card/30">
                      <td className="p-3 font-bold text-foreground">סה״כ שנתי</td>
                      <td className="p-3 font-bold text-blue-400">{fmt(monthlySummary.reduce((s, r) => s + r.input, 0))}</td>
                      <td className="p-3 font-bold text-green-400">{fmt(monthlySummary.reduce((s, r) => s + r.output, 0))}</td>
                      <td className="p-3 font-bold text-orange-400">{fmt(monthlySummary.reduce((s, r) => s + r.net, 0))}</td>
                      <td className="p-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* VAT Comparison Chart Placeholder */}
              <div className="mt-6 space-y-3">
                <h4 className="text-sm font-medium text-foreground">השוואת מע״מ - Q1 2026</h4>
                {monthlySummary.filter(r => r.input > 0).map((row, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{row.month}</span>
                      <span>{fmt(row.net)} נטו</span>
                    </div>
                    <div className="flex gap-1 h-6">
                      <div className="bg-blue-500/40 rounded-sm" style={{ width: `${(row.input / 700000) * 100}%` }}></div>
                      <div className="bg-green-500/40 rounded-sm" style={{ width: `${(row.output / 700000) * 100}%` }}></div>
                    </div>
                  </div>
                ))}
                <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500/40 rounded-sm"></div>תשומות</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500/40 rounded-sm"></div>עסקאות</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Input Invoices Tab */}
        <TabsContent value="input">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">חשבוניות תשומות - מרץ 2026</CardTitle>
                <span className="text-sm text-muted-foreground">{inputInvoices.length} חשבוניות</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="חיפוש ספק או מספר חשבונית..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס׳ חשבונית</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ספק</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תאריך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סכום לפני מע״מ</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מע״מ</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סה״כ</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inputInvoices.filter(inv => !search || inv.vendor.includes(search) || inv.id.includes(search)).map((inv, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-mono text-foreground">{inv.id}</td>
                        <td className="p-3 font-medium text-foreground">{inv.vendor}</td>
                        <td className="p-3 text-muted-foreground">{inv.date}</td>
                        <td className="p-3 text-foreground">{fmt(inv.amount)}</td>
                        <td className="p-3 text-blue-400 font-medium">{fmt(inv.vat)}</td>
                        <td className="p-3 font-bold text-foreground">{fmt(inv.total)}</td>
                        <td className="p-3"><Badge className="bg-blue-500/20 text-blue-300">{inv.type}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border/50 bg-card/30">
                      <td className="p-3 font-bold text-foreground" colSpan={3}>סה״כ תשומות</td>
                      <td className="p-3 font-bold text-foreground">{fmt(inputInvoices.reduce((s, inv) => s + inv.amount, 0))}</td>
                      <td className="p-3 font-bold text-blue-400">{fmt(inputInvoices.reduce((s, inv) => s + inv.vat, 0))}</td>
                      <td className="p-3 font-bold text-foreground">{fmt(inputInvoices.reduce((s, inv) => s + inv.total, 0))}</td>
                      <td className="p-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Output Invoices Tab */}
        <TabsContent value="output">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">חשבוניות עסקאות - מרץ 2026</CardTitle>
                <span className="text-sm text-muted-foreground">{outputInvoices.length} חשבוניות</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative mb-4">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input placeholder="חיפוש לקוח או מספר חשבונית..." className="pr-9 bg-background/50" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס׳ חשבונית</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">לקוח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תאריך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סכום לפני מע״מ</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מע״מ</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סה״כ</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outputInvoices.map((inv, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-mono text-foreground">{inv.id}</td>
                        <td className="p-3 font-medium text-foreground">{inv.customer}</td>
                        <td className="p-3 text-muted-foreground">{inv.date}</td>
                        <td className="p-3 text-foreground">{fmt(inv.amount)}</td>
                        <td className="p-3 text-green-400 font-medium">{fmt(inv.vat)}</td>
                        <td className="p-3 font-bold text-foreground">{fmt(inv.total)}</td>
                        <td className="p-3"><Badge className="bg-green-500/20 text-green-300">{inv.type}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border/50 bg-card/30">
                      <td className="p-3 font-bold text-foreground" colSpan={3}>סה״כ עסקאות</td>
                      <td className="p-3 font-bold text-foreground">{fmt(outputInvoices.reduce((s, inv) => s + inv.amount, 0))}</td>
                      <td className="p-3 font-bold text-green-400">{fmt(outputInvoices.reduce((s, inv) => s + inv.vat, 0))}</td>
                      <td className="p-3 font-bold text-foreground">{fmt(outputInvoices.reduce((s, inv) => s + inv.total, 0))}</td>
                      <td className="p-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reconciliation Tab */}
        <TabsContent value="reconcile">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">התאמת מע״מ - מרץ 2026</CardTitle>
                <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">הפרש: ₪3,200</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">פריט</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">לפי ספרים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">לפי דיווח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">הפרש</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliation.map((row, i) => (
                      <tr key={i} className={`border-b border-border/30 hover:bg-card/30 transition-colors ${row.diff !== 0 ? "bg-red-500/5" : ""}`}>
                        <td className="p-3 font-medium text-foreground">{row.item}</td>
                        <td className="p-3 text-foreground">{fmt(row.book)}</td>
                        <td className="p-3 text-foreground">{fmt(row.reported)}</td>
                        <td className={`p-3 font-bold ${row.diff !== 0 ? "text-red-400" : "text-green-400"}`}>
                          {row.diff !== 0 ? fmt(row.diff) : "תואם"}
                        </td>
                        <td className="p-3 text-center">
                          {row.diff === 0 ? (
                            <Badge className="bg-green-500/20 text-green-300">תקין</Badge>
                          ) : (
                            <Badge className="bg-red-500/20 text-red-300">דורש בדיקה</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 p-4 bg-yellow-500/5 rounded-lg border border-yellow-500/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-medium text-yellow-300">נדרשת בדיקה</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      קיים הפרש של ₪3,200 בין הספרים לדיווח. ההפרש נובע מתיקון מע״מ מתקופות קודמות שלא נרשם בספרים.
                      יש לבצע רישום מתקן ולעדכן את הספרים בהתאם.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
