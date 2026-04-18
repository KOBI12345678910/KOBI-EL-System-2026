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
  Search, Download, Printer, FileText, DollarSign, TrendingUp,
  Clock, AlertTriangle, ArrowUpDown, ChevronRight, ChevronLeft,
  Eye, Filter, CreditCard, BarChart3, Users
} from "lucide-react";

const FALLBACK_KPIS = [
  { title: "חשבוניות שהונפקו", value: "342", icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10", sub: "שנת 2026" },
  { title: "סה״כ ערך", value: "₪18,450,000", icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10", sub: "+12.3% משנה קודמת" },
  { title: "ממוצע לחשבונית", value: "₪53,947", icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/10", sub: "חציון: ₪42,500" },
  { title: "באיחור תשלום", value: "18.4%", icon: Clock, color: "text-orange-400", bg: "bg-orange-500/10", sub: "63 חשבוניות" },
  { title: "זיכויים", value: "₪312,500", icon: CreditCard, color: "text-red-400", bg: "bg-red-500/10", sub: "14 הודעות זיכוי" },
];

const statusBadge = (status: string) => {
  const m: Record<string, string> = {
    "שולם": "bg-green-500/20 text-green-300 border-green-500/30",
    "פתוח": "bg-blue-500/20 text-blue-300 border-blue-500/30",
    "באיחור": "bg-orange-500/20 text-orange-300 border-orange-500/30",
    "חלקי": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    "זיכוי": "bg-red-500/20 text-red-300 border-red-500/30",
  };
  return m[status] || "bg-gray-500/20 text-gray-300";
};

const FALLBACK_INVOICES = [
  { id: "INV-2026-001", customer: "אלומיניום הגליל בע״מ", date: "2026-01-05", due: "2026-02-04", amount: 286650, paid: 286650, status: "שולם", category: "ייצור" },
  { id: "INV-2026-015", customer: "זגוגית הנגב", date: "2026-01-18", due: "2026-02-17", amount: 208260, paid: 208260, status: "שולם", category: "זגוגית" },
  { id: "INV-2026-034", customer: "מתכת השרון", date: "2026-02-03", due: "2026-03-05", amount: 182520, paid: 95000, status: "חלקי", category: "מתכת" },
  { id: "INV-2026-056", customer: "חלונות הצפון בע״מ", date: "2026-02-15", due: "2026-03-17", amount: 157365, paid: 157365, status: "שולם", category: "אלומיניום" },
  { id: "INV-2026-078", customer: "פרופילים מרכז הארץ", date: "2026-02-28", due: "2026-03-30", amount: 131040, paid: 0, status: "באיחור", category: "פרופילים" },
  { id: "INV-2026-089", customer: "בניין וזכוכית ת״א", date: "2026-03-05", due: "2026-04-04", amount: 232245, paid: 232245, status: "שולם", category: "זגוגית" },
  { id: "INV-2026-102", customer: "אקסטרודר הדרום", date: "2026-03-10", due: "2026-04-09", amount: 145800, paid: 0, status: "באיחור", category: "ייצור" },
  { id: "INV-2026-115", customer: "מפעלי ירושלים למתכת", date: "2026-03-14", due: "2026-04-13", amount: 98500, paid: 98500, status: "שולם", category: "מתכת" },
  { id: "INV-2026-128", customer: "גלאס טופ ישראל", date: "2026-03-18", due: "2026-04-17", amount: 104130, paid: 0, status: "פתוח", category: "זגוגית" },
  { id: "INV-2026-140", customer: "אלו-פרופיל חיפה", date: "2026-03-22", due: "2026-04-21", amount: 78390, paid: 0, status: "פתוח", category: "פרופילים" },
  { id: "INV-2026-155", customer: "זגוגית הים התיכון", date: "2026-03-25", due: "2026-04-24", amount: 134500, paid: 0, status: "פתוח", category: "זגוגית" },
  { id: "INV-2026-168", customer: "מסגריית הגולן", date: "2026-03-28", due: "2026-04-27", amount: 67800, paid: 0, status: "פתוח", category: "מתכת" },
  { id: "INV-2026-175", customer: "תריסי אור בע״מ", date: "2026-04-01", due: "2026-05-01", amount: 89200, paid: 0, status: "פתוח", category: "אלומיניום" },
  { id: "INV-2026-182", customer: "פלדה ואלומיניום מודיעין", date: "2026-04-03", due: "2026-05-03", amount: 112400, paid: 0, status: "פתוח", category: "מתכת" },
  { id: "CR-2026-008", customer: "מתכת השרון", date: "2026-03-15", due: "-", amount: -45000, paid: 0, status: "זיכוי", category: "מתכת" },
];

const FALLBACK_AGING_DATA = [
  { bucket: "שוטף (0-30 יום)", count: 42, amount: 1842300, pct: 43 },
  { bucket: "31-60 יום", count: 28, amount: 1156400, pct: 27 },
  { bucket: "61-90 יום", count: 18, amount: 728500, pct: 17 },
  { bucket: "91-120 יום", count: 8, amount: 345200, pct: 8 },
  { bucket: "120+ יום", count: 5, amount: 213200, pct: 5 },
];

const FALLBACK_SEGMENT_DATA = [
  { segment: "ייצור תעשייתי", invoices: 98, amount: 5420000, avgInvoice: 55306, overdue: "15%", share: 29.4 },
  { segment: "זגוגית וחלונות", invoices: 82, amount: 4180000, avgInvoice: 50976, overdue: "12%", share: 22.7 },
  { segment: "אלומיניום ופרופילים", invoices: 76, amount: 3950000, avgInvoice: 51974, overdue: "22%", share: 21.4 },
  { segment: "מתכת ומסגרות", invoices: 54, amount: 2890000, avgInvoice: 53519, overdue: "28%", share: 15.7 },
  { segment: "שיפוצים ובנייה", invoices: 32, amount: 2010000, avgInvoice: 62813, overdue: "18%", share: 10.9 },
];

const FALLBACK_MONTHLY_TRENDS = [
  { month: "ינואר", issued: 28, amount: 1520000, collected: 1380000, collectionRate: 91 },
  { month: "פברואר", issued: 32, amount: 1780000, collected: 1590000, collectionRate: 89 },
  { month: "מרץ", issued: 38, amount: 2150000, collected: 1820000, collectionRate: 85 },
  { month: "אפריל (חלקי)", issued: 12, amount: 680000, collected: 320000, collectionRate: 47 },
];

const fmt = (n: number) => {
  if (n < 0) return "(₪" + Math.abs(n).toLocaleString("he-IL") + ")";
  return "₪" + n.toLocaleString("he-IL");
};

export default function ReportInvoiceAnalysisPage() {
  const { data: reportinvoiceanalysisData } = useQuery({
    queryKey: ["report-invoice-analysis"],
    queryFn: () => authFetch("/api/reports/report_invoice_analysis"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = reportinvoiceanalysisData ?? FALLBACK_KPIS;
  const agingData = FALLBACK_AGING_DATA;
  const invoices = FALLBACK_INVOICES;
  const monthlyTrends = FALLBACK_MONTHLY_TRENDS;
  const segmentData = FALLBACK_SEGMENT_DATA;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<string>("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 10;

  const filtered = invoices
    .filter(inv => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (search && !inv.customer.includes(search) && !inv.id.includes(search)) return false;
      return true;
    })
    .sort((a, b) => {
      const av = (a as any)[sortField];
      const bv = (b as any)[sortField];
      if (typeof av === "number") return sortAsc ? av - bv : bv - av;
      return sortAsc ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  const handleSort = (field: string) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניתוח חשבוניות</h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי | ניתוח מקיף של חשבוניות וגבייה</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Printer className="w-4 h-4 ml-1" />הדפסה</Button>
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא Excel</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="list">רשימת חשבוניות</TabsTrigger>
          <TabsTrigger value="aging">ניתוח גיול</TabsTrigger>
          <TabsTrigger value="segments">לפי פלח לקוחות</TabsTrigger>
          <TabsTrigger value="trends">מגמות</TabsTrigger>
        </TabsList>

        {/* Invoice List Tab */}
        <TabsContent value="list">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">רשימת חשבוניות</CardTitle>
                <span className="text-sm text-muted-foreground">{filtered.length} חשבוניות</span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש חשבונית או לקוח..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-background/50" />
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                    <option value="all">כל הסטטוסים</option>
                    <option value="שולם">שולם</option>
                    <option value="פתוח">פתוח</option>
                    <option value="באיחור">באיחור</option>
                    <option value="חלקי">חלקי</option>
                    <option value="זיכוי">זיכוי</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס׳ חשבונית</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">לקוח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium cursor-pointer" onClick={() => handleSort("date")}>
                        <span className="flex items-center gap-1">תאריך<ArrowUpDown className="w-3 h-3" /></span>
                      </th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ת. פירעון</th>
                      <th className="text-right p-3 text-muted-foreground font-medium cursor-pointer" onClick={() => handleSort("amount")}>
                        <span className="flex items-center gap-1">סכום<ArrowUpDown className="w-3 h-3" /></span>
                      </th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שולם</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium w-16">צפה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((inv, i) => (
                      <tr key={i} className={`border-b border-border/30 hover:bg-card/30 transition-colors ${inv.status === "זיכוי" ? "bg-red-500/5" : ""}`}>
                        <td className="p-3 font-mono text-foreground">{inv.id}</td>
                        <td className="p-3 font-medium text-foreground">{inv.customer}</td>
                        <td className="p-3 text-muted-foreground">{inv.date}</td>
                        <td className="p-3 text-muted-foreground">{inv.due}</td>
                        <td className={`p-3 font-bold ${inv.amount < 0 ? "text-red-400" : "text-foreground"}`}>{fmt(inv.amount)}</td>
                        <td className="p-3 text-foreground">{inv.paid > 0 ? fmt(inv.paid) : "-"}</td>
                        <td className="p-3 text-center"><Badge className={statusBadge(inv.status)}>{inv.status}</Badge></td>
                        <td className="p-3 text-center"><Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
                <span>מציג {Math.min(filtered.length, (page - 1) * perPage + 1)}-{Math.min(filtered.length, page * perPage)} מתוך {filtered.length}</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="w-4 h-4" /></Button>
                  <span className="px-3 py-1">{page}/{totalPages}</span>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="w-4 h-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Aging Analysis Tab */}
        <TabsContent value="aging">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-400" />
                ניתוח גיול חשבוניות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">טווח ימים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">כמות חשבוניות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סכום</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">אחוז</th>
                      <th className="text-right p-3 text-muted-foreground font-medium w-48">התפלגות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agingData.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{row.bucket}</td>
                        <td className="p-3 text-foreground">{row.count}</td>
                        <td className="p-3 font-bold text-foreground">{fmt(row.amount)}</td>
                        <td className="p-3 text-muted-foreground">{row.pct}%</td>
                        <td className="p-3"><Progress value={row.pct} className="h-3" /></td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border/50 bg-card/30">
                      <td className="p-3 font-bold text-foreground">סה״כ</td>
                      <td className="p-3 font-bold text-foreground">{agingData.reduce((s, r) => s + r.count, 0)}</td>
                      <td className="p-3 font-bold text-foreground">{fmt(agingData.reduce((s, r) => s + r.amount, 0))}</td>
                      <td className="p-3 font-bold text-muted-foreground">100%</td>
                      <td className="p-3"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="p-4 bg-orange-500/5 rounded-lg border border-orange-500/20">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-sm font-medium text-orange-300">שימו לב</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      13 חשבוניות מעל 90 יום בסך ₪558,400. מומלץ לפנות ללקוחות הבאים: מתכת השרון, אקסטרודר הדרום, פרופילים מרכז הארץ.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customer Segments Tab */}
        <TabsContent value="segments">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                ניתוח לפי פלח לקוחות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">פלח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חשבוניות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סה״כ ערך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ממוצע לחשבונית</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">באיחור</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">נתח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium w-40">התפלגות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segmentData.map((seg, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{seg.segment}</td>
                        <td className="p-3 text-foreground">{seg.invoices}</td>
                        <td className="p-3 font-bold text-foreground">{fmt(seg.amount)}</td>
                        <td className="p-3 text-foreground">{fmt(seg.avgInvoice)}</td>
                        <td className={`p-3 font-medium ${parseInt(seg.overdue) > 20 ? "text-red-400" : parseInt(seg.overdue) > 15 ? "text-orange-400" : "text-green-400"}`}>{seg.overdue}</td>
                        <td className="p-3 text-muted-foreground">{seg.share}%</td>
                        <td className="p-3"><Progress value={seg.share} className="h-3" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trends Tab */}
        <TabsContent value="trends">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                מגמות חשבוניות וגבייה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">חודש</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חשבוניות שהונפקו</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סכום הנפקה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סכום גבייה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">אחוז גבייה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium w-40">ביצוע</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyTrends.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{row.month}</td>
                        <td className="p-3 text-foreground">{row.issued}</td>
                        <td className="p-3 text-blue-400">{fmt(row.amount)}</td>
                        <td className="p-3 text-green-400">{fmt(row.collected)}</td>
                        <td className={`p-3 font-medium ${row.collectionRate >= 90 ? "text-green-400" : row.collectionRate >= 80 ? "text-yellow-400" : "text-red-400"}`}>{row.collectionRate}%</td>
                        <td className="p-3"><Progress value={row.collectionRate} className="h-3" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Visual Bars */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium text-foreground">הנפקה מול גבייה - חודשי</h4>
                {monthlyTrends.map((row, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{row.month}</span>
                      <span>גבייה: {row.collectionRate}%</span>
                    </div>
                    <div className="flex gap-1 h-5">
                      <div className="bg-blue-500/40 rounded-sm transition-all" style={{ width: `${(row.amount / 2500000) * 100}%` }}></div>
                    </div>
                    <div className="flex gap-1 h-5">
                      <div className="bg-green-500/40 rounded-sm transition-all" style={{ width: `${(row.collected / 2500000) * 100}%` }}></div>
                    </div>
                  </div>
                ))}
                <div className="flex gap-4 text-xs text-muted-foreground mt-2">
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500/40 rounded-sm"></div>הנפקה</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500/40 rounded-sm"></div>גבייה</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
