import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Search, Download, Filter, Users, DollarSign, Clock, AlertTriangle,
  TrendingUp, ArrowUpDown, ChevronRight, ChevronLeft, Printer, Eye
} from "lucide-react";

const kpis = [
  { title: "סה״כ חובות לקוחות", value: "₪4,285,600", icon: DollarSign, color: "text-blue-400", bg: "bg-blue-500/10", change: "+8.2%", changeColor: "text-red-400" },
  { title: "שוטף (0-30 יום)", value: "₪1,842,300", icon: TrendingUp, color: "text-green-400", bg: "bg-green-500/10", change: "43%", changeColor: "text-green-400" },
  { title: "30-60 יום", value: "₪1,156,400", icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10", change: "27%", changeColor: "text-yellow-400" },
  { title: "60-90 יום", value: "₪728,500", icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10", change: "17%", changeColor: "text-orange-400" },
  { title: "90+ יום", value: "₪558,400", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", change: "13%", changeColor: "text-red-400" },
];

const riskBadge = (risk: string) => {
  const m: Record<string, string> = {
    "נמוך": "bg-green-500/20 text-green-300 border-green-500/30",
    "בינוני": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    "גבוה": "bg-orange-500/20 text-orange-300 border-orange-500/30",
    "קריטי": "bg-red-500/20 text-red-300 border-red-500/30",
  };
  return m[risk] || "bg-gray-500/20 text-gray-300";
};

const customers = [
  { id: 1, name: "אלומיניום הגליל בע״מ", current: 245000, d30: 180000, d60: 95000, d90: 42000, total: 562000, creditLimit: 700000, balance: 562000, lastPayment: "2026-03-28", risk: "בינוני" },
  { id: 2, name: "זגוגית הנגב", current: 198000, d30: 125000, d60: 88000, d90: 0, total: 411000, creditLimit: 500000, balance: 411000, lastPayment: "2026-04-01", risk: "נמוך" },
  { id: 3, name: "מתכת השרון", current: 156000, d30: 112000, d60: 67000, d90: 145000, total: 480000, creditLimit: 450000, balance: 480000, lastPayment: "2026-02-15", risk: "קריטי" },
  { id: 4, name: "חלונות הצפון בע״מ", current: 134500, d30: 89000, d60: 45000, d90: 22000, total: 290500, creditLimit: 400000, balance: 290500, lastPayment: "2026-03-20", risk: "נמוך" },
  { id: 5, name: "פרופילים מרכז הארץ", current: 112000, d30: 95000, d60: 78000, d90: 65000, total: 350000, creditLimit: 350000, balance: 350000, lastPayment: "2026-01-30", risk: "גבוה" },
  { id: 6, name: "בניין וזכוכית ת״א", current: 167000, d30: 52000, d60: 31000, d90: 0, total: 250000, creditLimit: 300000, balance: 250000, lastPayment: "2026-04-03", risk: "נמוך" },
  { id: 7, name: "אקסטרודר הדרום", current: 98000, d30: 76000, d60: 54000, d90: 89000, total: 317000, creditLimit: 280000, balance: 317000, lastPayment: "2026-02-08", risk: "קריטי" },
  { id: 8, name: "מפעלי ירושלים למתכת", current: 145000, d30: 67000, d60: 38000, d90: 15000, total: 265000, creditLimit: 350000, balance: 265000, lastPayment: "2026-03-25", risk: "נמוך" },
  { id: 9, name: "גלאס טופ ישראל", current: 89000, d30: 102000, d60: 45000, d90: 56000, total: 292000, creditLimit: 300000, balance: 292000, lastPayment: "2026-02-20", risk: "גבוה" },
  { id: 10, name: "אלו-פרופיל חיפה", current: 76000, d30: 54000, d60: 32000, d90: 28000, total: 190000, creditLimit: 250000, balance: 190000, lastPayment: "2026-03-18", risk: "בינוני" },
  { id: 11, name: "זגוגית הים התיכון", current: 123000, d30: 45000, d60: 22000, d90: 0, total: 190000, creditLimit: 250000, balance: 190000, lastPayment: "2026-04-02", risk: "נמוך" },
  { id: 12, name: "מסגריית הגולן", current: 67000, d30: 48000, d60: 35000, d90: 42000, total: 192000, creditLimit: 200000, balance: 192000, lastPayment: "2026-02-25", risk: "גבוה" },
  { id: 13, name: "תריסי אור בע״מ", current: 89000, d30: 56000, d60: 44000, d90: 18000, total: 207000, creditLimit: 250000, balance: 207000, lastPayment: "2026-03-12", risk: "בינוני" },
  { id: 14, name: "פלדה ואלומיניום מודיעין", current: 54000, d30: 32000, d60: 28000, d90: 36500, total: 150500, creditLimit: 180000, balance: 150500, lastPayment: "2026-02-10", risk: "גבוה" },
  { id: 15, name: "קריסטל זכוכית ראשל״צ", current: 88800, d30: 23400, d60: 25500, d90: 0, total: 137700, creditLimit: 200000, balance: 137700, lastPayment: "2026-03-30", risk: "נמוך" },
];

const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");

export default function ReportCustomerAgingPage() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [sortField, setSortField] = useState<string>("total");
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 10;

  const filtered = customers
    .filter(c => {
      if (riskFilter !== "all" && c.risk !== riskFilter) return false;
      if (search && !c.name.includes(search) && !fmt(c.total).includes(search)) return false;
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

  const totalReceivables = customers.reduce((s, c) => s + c.total, 0);
  const totalOverCredit = customers.filter(c => c.balance > c.creditLimit).length;
  const avgDays = 42;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">דוח גיול לקוחות</h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי | ניתוח חובות לקוחות לפי תקופת איחור</p>
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

      {/* Aging Distribution Bar */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">התפלגות גיול חובות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { label: "שוטף (0-30 יום)", value: 43, color: "bg-green-500", amount: "₪1,842,300" },
              { label: "30-60 יום", value: 27, color: "bg-yellow-500", amount: "₪1,156,400" },
              { label: "60-90 יום", value: 17, color: "bg-orange-500", amount: "₪728,500" },
              { label: "90+ יום", value: 13, color: "bg-red-500", amount: "₪558,400" },
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
              <Users className="w-5 h-5 text-blue-400" />
              <span className="text-sm font-medium text-foreground">סיכום לקוחות</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">סה״כ לקוחות פעילים</span><span className="font-medium text-foreground">{customers.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">לקוחות באיחור 90+</span><span className="font-medium text-red-400">{customers.filter(c => c.d90 > 0).length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">חריגה ממסגרת אשראי</span><span className="font-medium text-orange-400">{totalOverCredit}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">ממוצע ימי גבייה</span><span className="font-medium text-foreground">{avgDays} יום</span></div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-sm font-medium text-foreground">לקוחות בסיכון גבוה</span>
            </div>
            <div className="space-y-2 text-sm">
              {customers.filter(c => c.risk === "קריטי" || c.risk === "גבוה").slice(0, 4).map((c, i) => (
                <div key={i} className="flex justify-between items-center">
                  <span className="text-muted-foreground truncate ml-2">{c.name}</span>
                  <Badge className={riskBadge(c.risk)}>{c.risk}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <span className="text-sm font-medium text-foreground">מגמות גבייה</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">גבייה החודש</span><span className="font-medium text-green-400">₪1,245,000</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">יעד גבייה חודשי</span><span className="font-medium text-foreground">₪1,500,000</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">אחוז גבייה</span><span className="font-medium text-yellow-400">83%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">שיפור לעומת חודש קודם</span><span className="font-medium text-green-400">+5.3%</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">פירוט גיול לקוחות</CardTitle>
            <span className="text-sm text-muted-foreground">{filtered.length} לקוחות</span>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש לקוח..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="pr-9 bg-background/50" />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <select value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(1); }} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                <option value="all">כל הסיכונים</option>
                <option value="נמוך">נמוך</option>
                <option value="בינוני">בינוני</option>
                <option value="גבוה">גבוה</option>
                <option value="קריטי">קריטי</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-right p-3 text-muted-foreground font-medium">לקוח</th>
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
                  <th className="text-right p-3 text-muted-foreground font-medium">מסגרת אשראי</th>
                  <th className="text-right p-3 text-muted-foreground font-medium">תשלום אחרון</th>
                  <th className="text-center p-3 text-muted-foreground font-medium">סיכון</th>
                  <th className="text-center p-3 text-muted-foreground font-medium w-16">צפה</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map(c => {
                  const overLimit = c.balance > c.creditLimit;
                  return (
                    <tr key={c.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                      <td className="p-3 font-medium text-foreground">{c.name}</td>
                      <td className="p-3 text-green-400">{fmt(c.current)}</td>
                      <td className="p-3 text-yellow-400">{fmt(c.d30)}</td>
                      <td className="p-3 text-orange-400">{fmt(c.d60)}</td>
                      <td className="p-3 text-red-400">{c.d90 > 0 ? fmt(c.d90) : "-"}</td>
                      <td className="p-3 font-bold text-foreground">{fmt(c.total)}</td>
                      <td className={`p-3 ${overLimit ? "text-red-400 font-medium" : "text-foreground"}`}>
                        {fmt(c.creditLimit)} {overLimit && <span className="text-xs">(חריגה!)</span>}
                      </td>
                      <td className="p-3 text-muted-foreground">{c.lastPayment}</td>
                      <td className="p-3 text-center"><Badge className={riskBadge(c.risk)}>{c.risk}</Badge></td>
                      <td className="p-3 text-center">
                        <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border/50 bg-card/30">
                  <td className="p-3 font-bold text-foreground">סה״כ</td>
                  <td className="p-3 font-bold text-green-400">{fmt(customers.reduce((s, c) => s + c.current, 0))}</td>
                  <td className="p-3 font-bold text-yellow-400">{fmt(customers.reduce((s, c) => s + c.d30, 0))}</td>
                  <td className="p-3 font-bold text-orange-400">{fmt(customers.reduce((s, c) => s + c.d60, 0))}</td>
                  <td className="p-3 font-bold text-red-400">{fmt(customers.reduce((s, c) => s + c.d90, 0))}</td>
                  <td className="p-3 font-bold text-foreground">{fmt(totalReceivables)}</td>
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
