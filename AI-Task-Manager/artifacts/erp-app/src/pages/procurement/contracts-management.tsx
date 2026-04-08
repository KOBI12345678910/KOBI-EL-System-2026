import { useState, useMemo } from "react";
import {
  FileSignature, Calendar, TrendingUp, Clock, PenTool, Timer,
  Search, Filter, RefreshCw, ArrowUpDown, CheckCircle2, AlertTriangle, XCircle
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const fmt = (v: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);

const fmtDate = (d: string) => new Date(d).toLocaleDateString("he-IL");

const statusMap: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active:    { label: "פעיל",     color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  expiring:  { label: "פג תוקף בקרוב", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", icon: AlertTriangle },
  pending:   { label: "ממתין לחתימה",  color: "bg-blue-500/20 text-blue-400 border-blue-500/30",    icon: PenTool },
  expired:   { label: "פג תוקף",  color: "bg-red-500/20 text-red-400 border-red-500/30",        icon: XCircle },
  renewed:   { label: "חודש",     color: "bg-purple-500/20 text-purple-400 border-purple-500/30", icon: RefreshCw },
};

const typeMap: Record<string, string> = { annual: "שנתי", framework: "מסגרת", project: "פרויקט" };

interface Contract {
  id: string;
  supplier: string;
  type: "annual" | "framework" | "project";
  value: number;
  startDate: string;
  endDate: string;
  status: keyof typeof statusMap;
  autoRenew: boolean;
  category: string;
  terms: string;
  paymentTerms: string;
  penalty: string;
}

const contracts: Contract[] = [
  {
    id: "CTR-001", supplier: "אלומיניום ישראל", type: "annual", value: 2850000,
    startDate: "2025-04-01", endDate: "2026-03-31", status: "active", autoRenew: true,
    category: "חומרי גלם", terms: "אספקה שבועית, אחריות 12 חודש", paymentTerms: "שוטף + 60", penalty: "5% קנס איחור"
  },
  {
    id: "CTR-002", supplier: "זכוכית הגליל", type: "framework", value: 1750000,
    startDate: "2025-01-15", endDate: "2026-07-14", status: "active", autoRenew: false,
    category: "חומרי גלם", terms: "הזמנה מינימלית 500 יח׳, איכות ISO 9001", paymentTerms: "שוטף + 45", penalty: "3% קנס איחור"
  },
  {
    id: "CTR-003", supplier: "פלדת צפון", type: "annual", value: 3200000,
    startDate: "2025-06-01", endDate: "2026-05-31", status: "expiring", autoRenew: true,
    category: "חומרי גלם", terms: "אספקה דו-שבועית, בדיקת איכות לכל משלוח", paymentTerms: "שוטף + 30", penalty: "7% קנס איחור"
  },
  {
    id: "CTR-004", supplier: "לוגיסטיקה מהירה בע\"מ", type: "annual", value: 480000,
    startDate: "2025-09-01", endDate: "2026-08-31", status: "active", autoRenew: true,
    category: "שירותי הובלה", terms: "הובלה יומית, ביטוח מלא", paymentTerms: "שוטף + 30", penalty: "10% קנס איחור באספקה"
  },
  {
    id: "CTR-005", supplier: "ציפויים מתקדמים בע\"מ", type: "project", value: 920000,
    startDate: "2025-11-01", endDate: "2026-04-30", status: "expiring", autoRenew: false,
    category: "קבלני משנה", terms: "אבני דרך לפי לוח זמנים, אחריות 24 חודש", paymentTerms: "30% מקדמה + שוטף + 45", penalty: "ערבות ביצוע 10%"
  },
  {
    id: "CTR-006", supplier: "מתכות דרום", type: "framework", value: 1100000,
    startDate: "2024-07-01", endDate: "2025-06-30", status: "expired", autoRenew: false,
    category: "חומרי גלם", terms: "הזמנה לפי דרישה, תנאי FOB", paymentTerms: "שוטף + 60", penalty: "4% קנס איחור"
  },
  {
    id: "CTR-007", supplier: "אנרגיה ירוקה ישראל", type: "annual", value: 360000,
    startDate: "2026-01-01", endDate: "2026-12-31", status: "pending", autoRenew: true,
    category: "אנרגיה", terms: "אספקת חשמל ירוק, מחיר קבוע לשנה", paymentTerms: "חודשי", penalty: "ללא"
  },
  {
    id: "CTR-008", supplier: "אל-בר טכנולוגיות", type: "annual", value: 540000,
    startDate: "2025-03-01", endDate: "2026-02-28", status: "renewed", autoRenew: true,
    category: "תחזוקה", terms: "תחזוקה מונעת חודשית, זמן תגובה 4 שעות", paymentTerms: "שוטף + 30", penalty: "קנס על זמן השבתה מעל 8 שעות"
  },
];

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function contractProgress(start: string, end: string): number {
  const s = new Date(start).getTime(), e = new Date(end).getTime(), now = Date.now();
  if (now <= s) return 0;
  if (now >= e) return 100;
  return Math.round(((now - s) / (e - s)) * 100);
}

export default function ContractsManagement() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [sortField, setSortField] = useState<keyof Contract>("endDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (f: keyof Contract) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };

  const kpis = useMemo(() => {
    const active = contracts.filter(c => c.status === "active" || c.status === "expiring").length;
    const expiring = contracts.filter(c => c.status === "expiring").length;
    const totalValue = contracts.filter(c => c.status !== "expired").reduce((s, c) => s + c.value, 0);
    const renewed = contracts.filter(c => c.status === "renewed").length;
    const pending = contracts.filter(c => c.status === "pending").length;
    const durations = contracts.map(c =>
      Math.round((new Date(c.endDate).getTime() - new Date(c.startDate).getTime()) / (1000 * 60 * 60 * 24 * 30))
    );
    const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    return [
      { icon: FileSignature, label: "חוזים פעילים", value: String(active), color: "from-emerald-600 to-emerald-800" },
      { icon: AlertTriangle, label: "פג תוקף בקרוב (30 יום)", value: String(expiring), color: "from-yellow-600 to-yellow-800" },
      { icon: TrendingUp, label: "סה\"כ ערך חוזים", value: fmt(totalValue), color: "from-blue-600 to-blue-800" },
      { icon: RefreshCw, label: "חודשו השנה", value: String(renewed), color: "from-purple-600 to-purple-800" },
      { icon: PenTool, label: "ממתינים לחתימה", value: String(pending), color: "from-cyan-600 to-cyan-800" },
      { icon: Timer, label: "משך חוזה ממוצע", value: `${avgDuration} חודשים`, color: "from-orange-600 to-orange-800" },
    ];
  }, []);

  const filtered = useMemo(() => {
    let arr = [...contracts];
    if (search) {
      const s = search.toLowerCase();
      arr = arr.filter(c => c.supplier.includes(s) || c.id.toLowerCase().includes(s));
    }
    if (filterType !== "all") arr = arr.filter(c => c.type === filterType);
    arr.sort((a, b) => {
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? (av as number) - (bv as number) : String(av).localeCompare(String(bv), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [search, filterType, sortField, sortDir]);

  const activeContracts = filtered.filter(c => c.status === "active" || c.status === "expiring" || c.status === "pending");
  const renewingContracts = filtered.filter(c => c.status === "expiring" || c.status === "renewed");
  const archivedContracts = filtered.filter(c => c.status === "expired");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-600 to-blue-800">
            <FileSignature className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">ניהול חוזים והסכמים</h1>
            <p className="text-sm text-gray-400">טכנו-כל עוזי — ניהול חוזי ספקים, תנאים וחידושים</p>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className={`rounded-xl bg-gradient-to-br ${k.color} p-4 border border-white/10`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-white/70">{k.label}</div>
                <div className="text-lg font-bold text-white mt-1">{k.value}</div>
              </div>
              <k.icon className="w-7 h-7 text-white/30" />
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="חיפוש לפי ספק או מזהה חוזה..." value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pr-10 pl-3 py-2 rounded-lg border border-border bg-muted/50 text-foreground text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="rounded-lg border border-border bg-muted/50 px-3 py-2 text-foreground text-sm">
            <option value="all">כל הסוגים</option>
            <option value="annual">שנתי</option>
            <option value="framework">מסגרת</option>
            <option value="project">פרויקט</option>
          </select>
        </div>
        <span className="text-sm text-gray-400">{filtered.length} חוזים</span>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="active" className="w-full">
        <TabsList className="bg-muted/50 border border-border/50">
          <TabsTrigger value="active">חוזים פעילים</TabsTrigger>
          <TabsTrigger value="renewing">מתחדשים</TabsTrigger>
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
          <TabsTrigger value="terms">תנאים</TabsTrigger>
        </TabsList>

        {/* Active Contracts Tab */}
        <TabsContent value="active" className="mt-4">
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    {[
                      { key: "id" as keyof Contract, label: "מזהה" },
                      { key: "supplier" as keyof Contract, label: "ספק" },
                      { key: "type" as keyof Contract, label: "סוג" },
                      { key: "value" as keyof Contract, label: "ערך" },
                      { key: "startDate" as keyof Contract, label: "תחילה" },
                      { key: "endDate" as keyof Contract, label: "סיום" },
                      { key: "status" as keyof Contract, label: "סטטוס" },
                      { key: "autoRenew" as keyof Contract, label: "חידוש אוטומטי" },
                    ].map(col => (
                      <th key={col.key} onClick={() => toggleSort(col.key)}
                        className="px-4 py-3 text-right font-medium text-gray-300 cursor-pointer hover:text-foreground whitespace-nowrap">
                        <div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3 opacity-40" /></div>
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right font-medium text-gray-300">התקדמות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {activeContracts.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-12 text-gray-400">לא נמצאו חוזים פעילים</td></tr>
                  ) : activeContracts.map(c => {
                    const st = statusMap[c.status];
                    const progress = contractProgress(c.startDate, c.endDate);
                    const days = daysUntil(c.endDate);
                    return (
                      <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-blue-400 text-xs">{c.id}</td>
                        <td className="px-4 py-3 text-foreground font-medium">{c.supplier}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{typeMap[c.type]}</Badge></td>
                        <td className="px-4 py-3 text-foreground font-medium">{fmt(c.value)}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(c.startDate)}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(c.endDate)}</td>
                        <td className="px-4 py-3"><Badge className={`${st.color} border text-xs`}>{st.label}</Badge></td>
                        <td className="px-4 py-3 text-center">{c.autoRenew ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" /> : <XCircle className="w-4 h-4 text-gray-500 mx-auto" />}</td>
                        <td className="px-4 py-3 w-36">
                          <div className="space-y-1">
                            <Progress value={progress} className="h-2" />
                            <span className="text-xs text-gray-400">{days > 0 ? `${days} ימים נותרו` : "הסתיים"}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Renewing Contracts Tab */}
        <TabsContent value="renewing" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renewingContracts.length === 0 ? (
              <Card className="col-span-full bg-muted/20 border-border/50"><CardContent className="p-8 text-center text-gray-400">אין חוזים בתהליך חידוש</CardContent></Card>
            ) : renewingContracts.map(c => {
              const st = statusMap[c.status];
              const days = daysUntil(c.endDate);
              return (
                <Card key={c.id} className="bg-muted/20 border-border/50">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-blue-400 text-sm">{c.id}</span>
                        <Badge className={`${st.color} border text-xs`}>{st.label}</Badge>
                      </div>
                      {c.autoRenew && <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">חידוש אוטומטי</Badge>}
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">{c.supplier}</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-400">סוג:</span> <span className="text-foreground">{typeMap[c.type]}</span></div>
                      <div><span className="text-gray-400">ערך:</span> <span className="text-foreground font-medium">{fmt(c.value)}</span></div>
                      <div><span className="text-gray-400">סיום:</span> <span className="text-foreground">{fmtDate(c.endDate)}</span></div>
                      <div><span className="text-gray-400">נותרו:</span> <span className={days <= 30 ? "text-yellow-400 font-medium" : "text-foreground"}>{days > 0 ? `${days} ימים` : "הסתיים"}</span></div>
                    </div>
                    <Progress value={contractProgress(c.startDate, c.endDate)} className="h-2" />
                    <div className="text-xs text-gray-400">{c.terms}</div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium text-gray-300">מזהה</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-300">ספק</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-300">סוג</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-300">ערך</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-300">תקופה</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-300">סטטוס</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {archivedContracts.length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400">אין חוזים בארכיון</td></tr>
                  ) : archivedContracts.map(c => {
                    const st = statusMap[c.status];
                    return (
                      <tr key={c.id} className="hover:bg-muted/30 transition-colors opacity-70">
                        <td className="px-4 py-3 font-mono text-blue-400 text-xs">{c.id}</td>
                        <td className="px-4 py-3 text-foreground">{c.supplier}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{typeMap[c.type]}</Badge></td>
                        <td className="px-4 py-3 text-foreground">{fmt(c.value)}</td>
                        <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(c.startDate)} — {fmtDate(c.endDate)}</td>
                        <td className="px-4 py-3"><Badge className={`${st.color} border text-xs`}>{st.label}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Terms Comparison Tab */}
        <TabsContent value="terms" className="mt-4">
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium text-gray-300">ספק</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-300">קטגוריה</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-300">תנאי תשלום</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-300">תנאים עיקריים</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-300">סנקציות / קנסות</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-300">ערך שנתי</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {filtered.map(c => (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-foreground font-medium">{c.supplier}</div>
                        <div className="text-xs text-gray-500 font-mono">{c.id}</div>
                      </td>
                      <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{c.category}</Badge></td>
                      <td className="px-4 py-3 text-foreground text-xs">{c.paymentTerms}</td>
                      <td className="px-4 py-3 text-gray-300 text-xs max-w-[250px]">{c.terms}</td>
                      <td className="px-4 py-3 text-yellow-400 text-xs">{c.penalty}</td>
                      <td className="px-4 py-3 text-foreground font-medium">{fmt(c.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
