import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Search, Download, Filter, Truck, DollarSign, Clock, AlertTriangle,
  TrendingDown, ArrowUpDown, ChevronRight, ChevronLeft, Printer, Eye, Calendar
} from "lucide-react";

const FALLBACK_KPIS = [
  { title: "סה״כ חובות לספקים", value: "₪3,156,200", icon: DollarSign, color: "text-blue-400", bg: "bg-blue-500/10", change: "-3.5%", changeColor: "text-green-400" },
  { title: "שוטף (0-30 יום)", value: "₪1,520,800", icon: TrendingDown, color: "text-green-400", bg: "bg-green-500/10", change: "48%", changeColor: "text-green-400" },
  { title: "30-60 יום", value: "₪842,600", icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10", change: "27%", changeColor: "text-yellow-400" },
  { title: "60-90 יום", value: "₪498,300", icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10", change: "16%", changeColor: "text-orange-400" },
  { title: "90+ יום", value: "₪294,500", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", change: "9%", changeColor: "text-red-400" },
];

const statusBadge = (status: string) => {
  const m: Record<string, string> = {
    "תקין": "bg-green-500/20 text-green-300 border-green-500/30",
    "בבדיקה": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    "באיחור": "bg-orange-500/20 text-orange-300 border-orange-500/30",
    "דחוף": "bg-red-500/20 text-red-300 border-red-500/30",
  };
  return m[status] || "bg-gray-500/20 text-gray-300";
};

const FALLBACK_VENDORS = [
  { id: 1, name: "אלקום חומרי גלם בע״מ", current: 312000, d30: 145000, d60: 78000, d90: 0, total: 535000, terms: "שוטף+60", dueDate: "2026-05-02", status: "תקין", category: "חומרי גלם" },
  { id: 2, name: "מתכות ישראל אילת", current: 245000, d30: 112000, d60: 65000, d90: 45000, total: 467000, terms: "שוטף+45", dueDate: "2026-04-18", status: "באיחור", category: "מתכות" },
  { id: 3, name: "זכוכית פלוט ים המלח", current: 198000, d30: 87000, d60: 52000, d90: 0, total: 337000, terms: "שוטף+30", dueDate: "2026-04-25", status: "תקין", category: "זכוכית" },
  { id: 4, name: "ספקי אנרגיה מרכז", current: 89000, d30: 67000, d60: 45000, d90: 82000, total: 283000, terms: "שוטף+30", dueDate: "2026-04-10", status: "דחוף", category: "אנרגיה" },
  { id: 5, name: "מוביל שינוע הצפון", current: 76000, d30: 54000, d60: 38000, d90: 42000, total: 210000, terms: "שוטף+45", dueDate: "2026-04-22", status: "באיחור", category: "שינוע" },
  { id: 6, name: "כימיקלים תעשייתיים בע״מ", current: 134000, d30: 56000, d60: 32000, d90: 0, total: 222000, terms: "שוטף+60", dueDate: "2026-05-08", status: "תקין", category: "כימיקלים" },
  { id: 7, name: "ציוד בטיחות ארצי", current: 67000, d30: 45000, d60: 28000, d90: 35000, total: 175000, terms: "שוטף+30", dueDate: "2026-04-12", status: "באיחור", category: "בטיחות" },
  { id: 8, name: "אריזות תעשייתיות הדרום", current: 98000, d30: 42000, d60: 35000, d90: 0, total: 175000, terms: "שוטף+45", dueDate: "2026-04-28", status: "תקין", category: "אריזות" },
  { id: 9, name: "חשמל ותאורה תעשייתית", current: 78000, d30: 65000, d60: 42000, d90: 38000, total: 223000, terms: "שוטף+30", dueDate: "2026-04-15", status: "דחוף", category: "חשמל" },
  { id: 10, name: "שמנים וסיכה מקצועית", current: 56000, d30: 38000, d60: 25000, d90: 22000, total: 141000, terms: "שוטף+60", dueDate: "2026-05-05", status: "בבדיקה", category: "תחזוקה" },
  { id: 11, name: "כלי עבודה הגליל", current: 89000, d30: 67000, d60: 34000, d90: 18500, total: 208500, terms: "שוטף+45", dueDate: "2026-04-20", status: "בבדיקה", category: "כלי עבודה" },
  { id: 12, name: "פחי מתכת אשדוד", current: 78800, d30: 64600, d60: 24300, d90: 12000, total: 179700, terms: "שוטף+30", dueDate: "2026-04-30", status: "תקין", category: "חומרי גלם" },
];

const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");

export default function ReportVendorAgingPage() {
  const { data: reportvendoragingData } = useQuery({
    queryKey: ["report-vendor-aging"],
    queryFn: () => authFetch("/api/reports/report_vendor_aging"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = reportvendoragingData ?? FALLBACK_KPIS;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<string>("total");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 10;

  const filtered = vendors
    .filter(v => {
      if (statusFilter !== "all" && v.status !== statusFilter) return false;
      if (search && !v.name.includes(search) && !v.category.includes(search)) return false;
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

  const totalPayables = vendors.reduce((s, v) => s + v.total, 0);
  const urgentCount = vendors.filter(v => v.status === "דחוף").length;
  const lateCount = vendors.filter(v => v.status === "באיחור").length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">דוח גיול ספקים</h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי | ניתוח חובות לספקים לפי תקופת תשלום</p>
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
                <span className={`text-xs font-medium ${kpi.changeColor}`}>{kpi.change}</span>
              </div>
              <div className="text-xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.title}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Aging Distribution */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">התפלגות גיול חובות לספקים</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { label: "שוטף (0-30 יום)", value: 48, color: "bg-green-500", amount: "₪1,520,800" },
              { label: "30-60 יום", value: 27, color: "bg-yellow-500", amount: "₪842,600" },
              { label: "60-90 יום", value: 16, color: "bg-orange-500", amount: "₪498,300" },
              { label: "90+ יום", value: 9, color: "bg-red-500", amount: "₪294,500" },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground w-32 shrink-0">{item.label}</span>
                <div className="flex-1">
                  <Progress value={item.value} className="h-3" />
                </div>
                <span className="text-sm font-medium text-foreground w-28 text-left">{item.amount}</span>
                <span className="text-xs text-muted-foreground w-10 text-left">{item.value}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Truck className="w-5 h-5 text-blue-400" />
              <span className="text-sm font-medium text-foreground">סיכום ספקים</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">סה״כ ספקים פעילים</span><span className="font-medium text-foreground">{vendors.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">ספקים בסטטוס דחוף</span><span className="font-medium text-red-400">{urgentCount}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">ספקים באיחור</span><span className="font-medium text-orange-400">{lateCount}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">ממוצע ימי תשלום</span><span className="font-medium text-foreground">38 יום</span></div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <Calendar className="w-5 h-5 text-orange-400" />
              <span className="text-sm font-medium text-foreground">תשלומים קרובים (7 ימים)</span>
            </div>
            <div className="space-y-2 text-sm">
              {vendors.filter(v => v.dueDate <= "2026-04-15").slice(0, 4).map((v, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-muted-foreground truncate ml-2">{v.name}</span>
                  <span className="font-medium text-foreground text-xs">{fmt(v.total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <DollarSign className="w-5 h-5 text-green-400" />
              <span className="text-sm font-medium text-foreground">תזרים תשלומים צפוי</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">שבוע הקרוב</span><span className="font-medium text-red-400">₪506,000</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">שבוע שני</span><span className="font-medium text-orange-400">₪385,000</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">שבוע שלישי</span><span className="font-medium text-yellow-400">₪312,000</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">שבוע רביעי</span><span className="font-medium text-foreground">₪245,000</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">פירוט גיול ספקים</CardTitle>
            <span className="text-sm text-muted-foreground">{filtered.length} ספקים</span>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש ספק..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-background/50" />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                <option value="all">כל הסטטוסים</option>
                <option value="תקין">תקין</option>
                <option value="בבדיקה">בבדיקה</option>
                <option value="באיחור">באיחור</option>
                <option value="דחוף">דחוף</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-right p-3 text-muted-foreground font-medium">ספק</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                  <th className="text-right p-3 text-muted-foreground font-medium cursor-pointer" onClick={() => handleSort("current")}>
                    <span className="flex items-center gap-1">שוטף<ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="text-right p-3 text-muted-foreground font-medium cursor-pointer" onClick={() => handleSort("d30")}>
                    <span className="flex items-center gap-1">30 יום<ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="text-right p-3 text-muted-foreground font-medium cursor-pointer" onClick={() => handleSort("d60")}>
                    <span className="flex items-center gap-1">60 יום<ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="text-right p-3 text-muted-foreground font-medium cursor-pointer" onClick={() => handleSort("d90")}>
                    <span className="flex items-center gap-1">90+ יום<ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="text-right p-3 text-muted-foreground font-medium cursor-pointer" onClick={() => handleSort("total")}>
                    <span className="flex items-center gap-1">סה״כ<ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                  <th className="text-right p-3 text-muted-foreground font-medium">תנאי תשלום</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">ת. פירעון</th>
                  <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                  <th className="text-center p-3 text-muted-foreground font-medium w-16">צפה</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map(v => (
                  <tr key={v.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                    <td className="p-3 font-medium text-foreground">{v.name}</td>
                    <td className="p-3 text-muted-foreground">{v.category}</td>
                    <td className="p-3 text-green-400">{fmt(v.current)}</td>
                    <td className="p-3 text-yellow-400">{fmt(v.d30)}</td>
                    <td className="p-3 text-orange-400">{fmt(v.d60)}</td>
                    <td className="p-3 text-red-400">{v.d90 > 0 ? fmt(v.d90) : "-"}</td>
                    <td className="p-3 font-bold text-foreground">{fmt(v.total)}</td>
                    <td className="p-3 text-muted-foreground">{v.terms}</td>
                    <td className="p-3 text-muted-foreground">{v.dueDate}</td>
                    <td className="p-3 text-center"><Badge className={statusBadge(v.status)}>{v.status}</Badge></td>
                    <td className="p-3 text-center">
                      <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border/50 bg-card/30">
                  <td className="p-3 font-bold text-foreground" colSpan={2}>סה״כ</td>
                  <td className="p-3 font-bold text-green-400">{fmt(vendors.reduce((s, v) => s + v.current, 0))}</td>
                  <td className="p-3 font-bold text-yellow-400">{fmt(vendors.reduce((s, v) => s + v.d30, 0))}</td>
                  <td className="p-3 font-bold text-orange-400">{fmt(vendors.reduce((s, v) => s + v.d60, 0))}</td>
                  <td className="p-3 font-bold text-red-400">{fmt(vendors.reduce((s, v) => s + v.d90, 0))}</td>
                  <td className="p-3 font-bold text-foreground">{fmt(totalPayables)}</td>
                  <td className="p-3" colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
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
    </div>
  );
}
