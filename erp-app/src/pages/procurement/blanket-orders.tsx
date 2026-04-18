import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  FileStack, TrendingUp, TrendingDown, DollarSign, Percent, Clock,
  Users, Search, Filter, CheckCircle2, AlertTriangle, XCircle, FileText,
  RefreshCw, Package
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const API = "/api";

const fmt = (v: number) => "₪" + new Intl.NumberFormat("he-IL").format(v);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("he-IL") : "—";
const pct = (v: number) => `${v.toFixed(1)}%`;

type BlanketStatus = "active" | "expiring" | "expired" | "draft";
const statusMap: Record<BlanketStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active:   { label: "פעיל",       color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  expiring: { label: "עומד לפוג",  color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",  icon: AlertTriangle },
  expired:  { label: "פג תוקף",    color: "bg-red-500/20 text-red-400 border-red-500/30",           icon: XCircle },
  draft:    { label: "טיוטה",      color: "bg-slate-500/20 text-slate-400 border-slate-500/30",     icon: FileText },
};

interface BlanketOrder {
  id: string;
  supplier: string;
  material: string;
  category: string;
  startDate: string;
  endDate: string;
  totalQty: number;
  usedQty: number;
  unitPrice: number;
  marketPrice: number;
  status: BlanketStatus;
}

interface Release {
  id: string;
  blanketId: string;
  date: string;
  qty: number;
  poRef: string;
  amount: number;
}

const FALLBACK_BLANKET_ORDERS: BlanketOrder[] = [
  { id: "BLK-001", supplier: "אלומיניום הגליל בע\"מ",  material: "פרופיל אלומיניום 6063",  category: "חומרי גלם", startDate: "2025-10-01", endDate: "2026-09-30", totalQty: 12000, usedQty: 7800,  unitPrice: 42,  marketPrice: 49,  status: "active" },
  { id: "BLK-002", supplier: "זכוכית שומרון בע\"מ",    material: "זכוכית מחוסמת 6 מ\"מ",   category: "חומרי גלם", startDate: "2025-07-01", endDate: "2026-06-30", totalQty: 8000,  usedQty: 6400,  unitPrice: 78,  marketPrice: 88,  status: "expiring" },
  { id: "BLK-003", supplier: "פלדת צפון תעשיות",       material: "פלדת קונסטרוקציה",       category: "חומרי גלם", startDate: "2026-01-01", endDate: "2026-12-31", totalQty: 5000,  usedQty: 1250,  unitPrice: 115, marketPrice: 132, status: "active" },
  { id: "BLK-004", supplier: "גומי ואטמים תעשייתי",    material: "אטמי EPDM",              category: "רכיבים",    startDate: "2025-04-01", endDate: "2026-03-31", totalQty: 50000, usedQty: 50000, unitPrice: 3.2, marketPrice: 4.1, status: "expired" },
  { id: "BLK-005", supplier: "אביזרי נעילה ד.מ.",      material: "ידיות ומנעולים",          category: "אביזרים",   startDate: "2026-01-15", endDate: "2027-01-14", totalQty: 20000, usedQty: 5200,  unitPrice: 18,  marketPrice: 22,  status: "active" },
  { id: "BLK-006", supplier: "ציפויים מתקדמים בע\"מ",  material: "אבקת צביעה אלקטרוסטטית", category: "חומרי עזר", startDate: "2025-11-01", endDate: "2026-10-31", totalQty: 3000,  usedQty: 1650,  unitPrice: 56,  marketPrice: 65,  status: "active" },
  { id: "BLK-007", supplier: "ברגים ומחברים ישראל",     material: "ברגי נירוסטה M8/M10",    category: "רכיבים",    startDate: "2026-04-01", endDate: "2027-03-31", totalQty: 100000,usedQty: 4500,  unitPrice: 0.85,marketPrice: 1.15,status: "draft" },
  { id: "BLK-008", supplier: "מפעלי סיליקון הדרום",    material: "סיליקון תעשייתי",         category: "חומרי עזר", startDate: "2025-08-01", endDate: "2026-07-31", totalQty: 6000,  usedQty: 4800,  unitPrice: 34,  marketPrice: 41,  status: "expiring" },
];

const FALLBACK_RELEASES: Release[] = [
  { id: "REL-001", blanketId: "BLK-001", date: "2026-03-15", qty: 800,  poRef: "PO-2026-041", amount: 33600 },
  { id: "REL-002", blanketId: "BLK-001", date: "2026-04-02", qty: 600,  poRef: "PO-2026-058", amount: 25200 },
  { id: "REL-003", blanketId: "BLK-002", date: "2026-03-20", qty: 500,  poRef: "PO-2026-044", amount: 39000 },
  { id: "REL-004", blanketId: "BLK-003", date: "2026-04-05", qty: 350,  poRef: "PO-2026-063", amount: 40250 },
  { id: "REL-005", blanketId: "BLK-005", date: "2026-03-28", qty: 1200, poRef: "PO-2026-052", amount: 21600 },
  { id: "REL-006", blanketId: "BLK-006", date: "2026-04-01", qty: 200,  poRef: "PO-2026-057", amount: 11200 },
  { id: "REL-007", blanketId: "BLK-008", date: "2026-03-10", qty: 400,  poRef: "PO-2026-039", amount: 13600 },
  { id: "REL-008", blanketId: "BLK-002", date: "2026-04-06", qty: 300,  poRef: "PO-2026-065", amount: 23400 },
  { id: "REL-009", blanketId: "BLK-001", date: "2026-02-10", qty: 1000, poRef: "PO-2026-028", amount: 42000 },
  { id: "REL-010", blanketId: "BLK-005", date: "2026-04-07", qty: 800,  poRef: "PO-2026-067", amount: 14400 },
];

export default function BlanketOrders() {
  const [tab, setTab] = useState("blankets");
  const [search, setSearch] = useState("");

  const { data: apiData } = useQuery({
    queryKey: ["procurement-blanket-orders"],
    queryFn: async () => {
      const res = await authFetch(`${API}/procurement/blanket-orders`);
      if (!res.ok) throw new Error("Failed to fetch blanket orders");
      return res.json();
    },
  });

  const blanketOrders: BlanketOrder[] = apiData?.blanketOrders ?? FALLBACK_BLANKET_ORDERS;
  const releases: Release[] = apiData?.releases ?? FALLBACK_RELEASES;

  const util = (o: BlanketOrder) => o.totalQty > 0 ? (o.usedQty / o.totalQty) * 100 : 0;
  const saving = (o: BlanketOrder) => o.marketPrice > 0 ? ((o.marketPrice - o.unitPrice) / o.marketPrice) * 100 : 0;

  const filtered = useMemo(() => {
    if (!search) return blanketOrders;
    const s = search.toLowerCase();
    return blanketOrders.filter(o =>
      o.id.toLowerCase().includes(s) || o.supplier.includes(s) || o.material.includes(s)
    );
  }, [search]);

  const activeCount = blanketOrders.filter(o => o.status === "active").length;
  const totalCommitted = blanketOrders.filter(o => o.status !== "expired").reduce((s, o) => s + o.totalQty * o.unitPrice, 0);
  const totalUsedValue = blanketOrders.reduce((s, o) => s + o.usedQty * o.unitPrice, 0);
  const totalCapacity = blanketOrders.filter(o => o.status !== "expired").reduce((s, o) => s + o.totalQty * o.unitPrice, 0);
  const overallUtil = totalCapacity > 0 ? (totalUsedValue / totalCapacity) * 100 : 0;
  const expiringCount = blanketOrders.filter(o => o.status === "expiring").length;
  const totalSaved = blanketOrders.reduce((s, o) => s + (o.marketPrice - o.unitPrice) * o.usedQty, 0);
  const totalMarket = blanketOrders.reduce((s, o) => s + o.marketPrice * o.usedQty, 0);
  const avgSavingPct = totalMarket > 0 ? (totalSaved / totalMarket) * 100 : 0;
  const suppliersOnContract = new Set(blanketOrders.filter(o => o.status !== "expired").map(o => o.supplier)).size;

  const kpis = [
    { label: "הזמנות מסגרת פעילות", value: String(activeCount), icon: FileStack, color: "text-blue-400" },
    { label: "ערך התחייבות כולל", value: fmt(totalCommitted), icon: DollarSign, color: "text-emerald-400" },
    { label: "ניצול כולל", value: pct(overallUtil), icon: Percent, color: "text-cyan-400" },
    { label: "עומדות לפוג", value: String(expiringCount), icon: Clock, color: "text-yellow-400" },
    { label: "חיסכון מול שוק", value: pct(avgSavingPct), icon: TrendingUp, color: "text-purple-400" },
    { label: "ספקים בחוזה", value: String(suppliersOnContract), icon: Users, color: "text-orange-400" },
  ];

  const renewalData = blanketOrders.filter(o => o.status === "expiring" || o.status === "expired");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-800">
          <FileStack className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">הזמנות מסגרת (Blanket Orders)</h1>
          <p className="text-sm text-gray-400">טכנו-כל עוזי — חוזים ארוכי טווח, שחרורים וניתוח חיסכון</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={i} className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{k.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-slate-700/50">
                    <Icon className={`h-4 w-4 ${k.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Search */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="חיפוש לפי מזהה, ספק או חומר..."
                className="w-full pr-9 pl-3 py-2 bg-slate-700/50 border border-slate-600 rounded-md text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span>{filtered.length} תוצאות</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-slate-800/80 border border-slate-700">
          <TabsTrigger value="blankets" className="text-xs gap-1 data-[state=active]:bg-blue-600">
            <FileStack className="h-3.5 w-3.5" /> הזמנות מסגרת
          </TabsTrigger>
          <TabsTrigger value="releases" className="text-xs gap-1 data-[state=active]:bg-indigo-600">
            <Package className="h-3.5 w-3.5" /> שחרורים
          </TabsTrigger>
          <TabsTrigger value="savings" className="text-xs gap-1 data-[state=active]:bg-emerald-600">
            <TrendingDown className="h-3.5 w-3.5" /> חיסכון
          </TabsTrigger>
          <TabsTrigger value="renewal" className="text-xs gap-1 data-[state=active]:bg-yellow-600">
            <RefreshCw className="h-3.5 w-3.5" /> חידוש
          </TabsTrigger>
        </TabsList>

        {/* Main Blanket Orders Table */}
        <TabsContent value="blankets">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-xs text-gray-400">מזהה</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">ספק</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">חומר / קטגוריה</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">תקופה</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">כמות כוללת</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">נוצל</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">נותר</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">ניצול %</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">מחיר יח׳</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">חיסכון מול שוק</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(o => {
                    const st = statusMap[o.status];
                    const StIcon = st.icon;
                    const u = util(o);
                    const sv = saving(o);
                    const remaining = o.totalQty - o.usedQty;
                    return (
                      <TableRow key={o.id} className="border-slate-700 hover:bg-slate-700/30">
                        <TableCell className="font-mono text-xs text-blue-400">{o.id}</TableCell>
                        <TableCell className="text-sm font-medium">{o.supplier}</TableCell>
                        <TableCell>
                          <div className="text-sm">{o.material}</div>
                          <div className="text-[10px] text-muted-foreground">{o.category}</div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDate(o.startDate)} — {fmtDate(o.endDate)}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{o.totalQty.toLocaleString("he-IL")}</TableCell>
                        <TableCell className="font-mono text-sm">{o.usedQty.toLocaleString("he-IL")}</TableCell>
                        <TableCell className="font-mono text-sm">{remaining.toLocaleString("he-IL")}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <Progress value={u} className="h-2 flex-1" />
                            <span className={`text-xs font-mono ${u >= 90 ? "text-red-400" : u >= 70 ? "text-yellow-400" : "text-emerald-400"}`}>
                              {pct(u)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{fmt(o.unitPrice)}</TableCell>
                        <TableCell>
                          <span className="text-xs font-mono text-emerald-400">▼ {pct(sv)}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] gap-1 ${st.color}`}>
                            <StIcon className="h-3 w-3" /> {st.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Releases Tab */}
        <TabsContent value="releases">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-xs text-gray-400">מזהה שחרור</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">הזמנת מסגרת</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">ספק</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">תאריך</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">כמות</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">הפניה ל-PO</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">סכום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {releases.map(r => {
                    const parent = blanketOrders.find(b => b.id === r.blanketId);
                    return (
                      <TableRow key={r.id} className="border-slate-700 hover:bg-slate-700/30">
                        <TableCell className="font-mono text-xs text-cyan-400">{r.id}</TableCell>
                        <TableCell className="font-mono text-xs text-blue-400">{r.blanketId}</TableCell>
                        <TableCell className="text-sm">{parent?.supplier ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{fmtDate(r.date)}</TableCell>
                        <TableCell className="font-mono text-sm">{r.qty.toLocaleString("he-IL")}</TableCell>
                        <TableCell className="font-mono text-xs text-indigo-400">{r.poRef}</TableCell>
                        <TableCell className="font-mono text-sm text-emerald-400">{fmt(r.amount)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Savings Analysis Tab */}
        <TabsContent value="savings">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground">ניתוח חיסכון — מחיר מסגרת מול מחיר שוק</h3>
                <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                  חיסכון כולל: {fmt(totalSaved)}
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-right text-xs text-gray-400">חומר</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">ספק</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">מחיר מסגרת</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">מחיר שוק</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">הפרש ליח׳</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">כמות שנוצלה</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">חיסכון כולל</TableHead>
                    <TableHead className="text-right text-xs text-gray-400">% חיסכון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blanketOrders.map(o => {
                    const diff = o.marketPrice - o.unitPrice;
                    const totalSave = diff * o.usedQty;
                    const svPct = saving(o);
                    return (
                      <TableRow key={o.id} className="border-slate-700 hover:bg-slate-700/30">
                        <TableCell className="text-sm font-medium">{o.material}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{o.supplier}</TableCell>
                        <TableCell className="font-mono text-sm">{fmt(o.unitPrice)}</TableCell>
                        <TableCell className="font-mono text-sm text-red-400">{fmt(o.marketPrice)}</TableCell>
                        <TableCell className="font-mono text-sm text-emerald-400">▼ {fmt(diff)}</TableCell>
                        <TableCell className="font-mono text-sm">{o.usedQty.toLocaleString("he-IL")}</TableCell>
                        <TableCell className="font-mono text-sm font-bold text-emerald-400">{fmt(totalSave)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-mono text-xs">
                            {pct(svPct)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Renewal Tracking Tab */}
        <TabsContent value="renewal">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 space-y-4">
              <h3 className="text-sm font-semibold text-foreground">מעקב חידוש הזמנות מסגרת</h3>
              {renewalData.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">אין הזמנות מסגרת הדורשות חידוש כעת</p>
              ) : (
                <div className="space-y-3">
                  {renewalData.map(o => {
                    const daysLeft = Math.ceil((new Date(o.endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    const u = util(o);
                    const sv = saving(o);
                    const st = statusMap[o.status];
                    const StIcon = st.icon;
                    return (
                      <Card key={o.id} className="bg-slate-700/40 border-slate-600">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm text-blue-400">{o.id}</span>
                                <Badge variant="outline" className={`text-[10px] gap-1 ${st.color}`}>
                                  <StIcon className="h-3 w-3" /> {st.label}
                                </Badge>
                              </div>
                              <p className="text-sm font-medium">{o.supplier} — {o.material}</p>
                              <p className="text-xs text-muted-foreground">
                                תקופה: {fmtDate(o.startDate)} — {fmtDate(o.endDate)}
                              </p>
                            </div>
                            <div className="text-left space-y-1">
                              <div className={`text-lg font-bold font-mono ${daysLeft <= 0 ? "text-red-400" : daysLeft <= 60 ? "text-yellow-400" : "text-emerald-400"}`}>
                                {daysLeft <= 0 ? "פג תוקף" : `${daysLeft} ימים`}
                              </div>
                              <p className="text-[10px] text-muted-foreground">עד סיום החוזה</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-slate-600">
                            <div>
                              <p className="text-[10px] text-muted-foreground">ניצול</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Progress value={u} className="h-1.5 flex-1" />
                                <span className="text-xs font-mono">{pct(u)}</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">ערך נותר</p>
                              <p className="text-sm font-mono mt-1">{fmt((o.totalQty - o.usedQty) * o.unitPrice)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">חיסכון ממוצע</p>
                              <p className="text-sm font-mono text-emerald-400 mt-1">{pct(sv)}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
