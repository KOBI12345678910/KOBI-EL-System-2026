import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, Search, Clock, Package, Truck,
  ShoppingCart, Timer, ArrowUpDown, RefreshCw,
} from "lucide-react";

/* ── helpers ────────────────────────────────────────────────────── */
const fmt = (v: number) => v.toLocaleString("he-IL");

/* ── Fallback shortage data ──────────────────────────────────────────────── */
const FALLBACK_SHORTAGES = [
  { id: "SHT-001", material: "RM-142 ציר כבד 120 מ\"מ", wo: "WO-1021", woName: "מבנה תעשייתי נתניה", qtyNeeded: 48, available: 12, supplier: "מחברי עוזי טכנו", leadDays: 7, action: "הזמנה", priority: "דחוף" },
  { id: "SHT-002", material: "RM-450 פרופיל גומי EPDM", wo: "WO-1021", woName: "מבנה תעשייתי נתניה", qtyNeeded: 120, available: 0, supplier: "גומי ואטמים בע\"מ", leadDays: 14, action: "הזמנה", priority: "דחוף" },
  { id: "SHT-003", material: "RM-315 סיליקון שקוף UV", wo: "WO-1025", woName: "ויטרינות חנויות ת\"א", qtyNeeded: 60, available: 22, supplier: "כימיקלים מרכז", leadDays: 5, action: "חלופי", priority: "גבוה" },
  { id: "SHT-004", material: "RM-425 צבע אפוקסי RAL7016", wo: "WO-1030", woName: "גדרות מתכת חולון", qtyNeeded: 30, available: 8, supplier: "צבעי המפרץ", leadDays: 3, action: "הזמנה", priority: "גבוה" },
  { id: "SHT-005", material: "RM-160 פלטת ברזל 200x200x10", wo: "WO-1028", woName: "קונסטרוקציה אשדוד", qtyNeeded: 80, available: 35, supplier: "פלדות השרון", leadDays: 10, action: "הזמנה", priority: "בינוני" },
  { id: "SHT-006", material: "RM-118 ברגים נירוסטה M8x30", wo: "WO-1035", woName: "מדרגות ברזל ראשל\"צ", qtyNeeded: 500, available: 220, supplier: "מחברי עוזי טכנו", leadDays: 4, action: "הזמנה", priority: "בינוני" },
  { id: "SHT-007", material: "RM-312 זכוכית מחוסמת 10 מ\"מ", wo: "WO-1025", woName: "ויטרינות חנויות ת\"א", qtyNeeded: 24, available: 10, supplier: "זכוכית הגליל", leadDays: 21, action: "המתנה", priority: "דחוף" },
  { id: "SHT-008", material: "RM-205 צינור נירוסטה 304 ø50", wo: "WO-1018", woName: "מעקות נירוסטה הרצליה", qtyNeeded: 40, available: 18, supplier: "נירוסטה פלוס", leadDays: 8, action: "הזמנה", priority: "גבוה" },
  { id: "SHT-009", material: "RM-110 פרופיל אלומיניום 40x40", wo: "WO-1032", woName: "חזית אלומיניום רמת גן", qtyNeeded: 200, available: 85, supplier: "אלומיניום ישראל בע\"מ", leadDays: 12, action: "הזמנה", priority: "גבוה" },
  { id: "SHT-010", material: "RM-330 לוח HPL 18 מ\"מ", wo: "WO-1018", woName: "מעקות נירוסטה הרצליה", qtyNeeded: 16, available: 6, supplier: "HPL ישראל", leadDays: 18, action: "חלופי", priority: "בינוני" },
  { id: "SHT-011", material: "RM-422 פח מגולוון 2.0 מ\"מ", wo: "WO-1030", woName: "גדרות מתכת חולון", qtyNeeded: 20, available: 20, supplier: "ייבוא מתכות דרום", leadDays: 6, action: "מסופק", priority: "נמוך" },
  { id: "SHT-012", material: "RM-260 אטם סיליקון שחור", wo: "WO-1032", woName: "חזית אלומיניום רמת גן", qtyNeeded: 80, available: 45, supplier: "כימיקלים מרכז", leadDays: 5, action: "הזמנה", priority: "בינוני" },
];

const priorityColor: Record<string, string> = {
  "דחוף": "bg-red-500/20 text-red-400",
  "גבוה": "bg-orange-500/20 text-orange-400",
  "בינוני": "bg-yellow-500/20 text-yellow-400",
  "נמוך": "bg-green-500/20 text-green-400",
};

const actionColor: Record<string, string> = {
  "הזמנה": "bg-blue-500/20 text-blue-400",
  "חלופי": "bg-purple-500/20 text-purple-400",
  "המתנה": "bg-yellow-500/20 text-yellow-400",
  "מסופק": "bg-green-500/20 text-green-400",
};

/* ================================================================ */
export default function ShortagesPage() {
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sortField, setSortField] = useState<string>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: apiData } = useQuery({
    queryKey: ["production-shortages"],
    queryFn: () => authFetch("/api/production/work-orders?type=shortages").then(r => r.json()),
  });
  const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
  const shortages = safeArr(apiData).length > 0 ? safeArr(apiData) : FALLBACK_SHORTAGES;

  /* KPI computations */
  const activeShortages = shortages.filter((s: any) => s.available < s.qtyNeeded).length;
  const urgentShortages = shortages.filter((s: any) => s.priority === "דחוף").length;
  const pendingOrders = shortages.filter(s => s.action === "הזמנה").length;
  const avgLeadTime = Math.round(shortages.reduce((s, sh) => s + sh.leadDays, 0) / shortages.length);
  const totalGap = shortages.reduce((s, sh) => s + Math.max(0, sh.qtyNeeded - sh.available), 0);
  const affectedWOs = new Set(shortages.filter(s => s.available < s.qtyNeeded).map(s => s.wo)).size;

  const kpis = [
    { label: "חוסרים פעילים", value: activeShortages, icon: AlertTriangle, color: "text-red-400" },
    { label: "דחופים", value: urgentShortages, icon: Timer, color: "text-orange-400" },
    { label: "הזמנות ממתינות", value: pendingOrders, icon: ShoppingCart, color: "text-blue-400" },
    { label: "זמן אספקה ממוצע", value: `${avgLeadTime} ימים`, icon: Truck, color: "text-purple-400" },
    { label: 'סה"כ פער כמות', value: fmt(totalGap), icon: Package, color: "text-yellow-400" },
    { label: "הזמנות עבודה מושפעות", value: affectedWOs, icon: AlertTriangle, color: "text-cyan-400" },
  ];

  const priorityOrder: Record<string, number> = { "דחוף": 0, "גבוה": 1, "בינוני": 2, "נמוך": 3 };

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("asc"); }
  };

  /* filtered & sorted */
  const sl = search.toLowerCase();
  const filtered = useMemo(() => {
    let arr = [...shortages];
    if (sl) arr = arr.filter(s =>
      s.material.toLowerCase().includes(sl) || s.wo.toLowerCase().includes(sl) ||
      s.woName.toLowerCase().includes(sl) || s.supplier.toLowerCase().includes(sl)
    );
    if (priorityFilter !== "all") arr = arr.filter(s => s.priority === priorityFilter);
    arr.sort((a: any, b: any) => {
      if (sortField === "priority") {
        const cmp = (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9);
        return sortDir === "asc" ? cmp : -cmp;
      }
      if (sortField === "gap") {
        const gapA = a.qtyNeeded - a.available;
        const gapB = b.qtyNeeded - b.available;
        return sortDir === "asc" ? gapA - gapB : gapB - gapA;
      }
      const av = a[sortField], bv = b[sortField];
      const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [sl, priorityFilter, sortField, sortDir]);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-red-500/10">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">חוסרי חומרים</h1>
            <p className="text-sm text-muted-foreground">ניטור חוסרים, זמני אספקה ופעולות נדרשות - טכנו-כל עוזי</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground"
          >
            <option value="all">כל העדיפויות</option>
            <option value="דחוף">דחוף</option>
            <option value="גבוה">גבוה</option>
            <option value="בינוני">בינוני</option>
            <option value="נמוך">נמוך</option>
          </select>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              className="bg-muted/50 border border-border rounded-lg pr-9 pl-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-red-500/40 w-64"
              placeholder="חיפוש חומר, הזמנה, ספק..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{k.label}</span>
                <k.icon className={`w-4 h-4 ${k.color}`} />
              </div>
              <span className="text-2xl font-bold text-foreground">{k.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Shortages Table */}
      <Card className="bg-card border-border overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {[
                    { key: "material", label: "חומר" },
                    { key: "wo", label: "הזמנת עבודה" },
                    { key: "qtyNeeded", label: "נדרש" },
                    { key: "available", label: "זמין" },
                    { key: "gap", label: "פער" },
                    { key: "supplier", label: "ספק" },
                    { key: "leadDays", label: "זמן אספקה" },
                    { key: "priority", label: "עדיפות" },
                    { key: "action", label: "פעולה" },
                  ].map(col => (
                    <TableHead
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="text-center text-muted-foreground cursor-pointer hover:text-foreground whitespace-nowrap"
                    >
                      <div className="flex items-center justify-center gap-1">
                        {col.label}
                        <ArrowUpDown className="w-3 h-3 opacity-40" />
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="text-center text-muted-foreground w-24">כיסוי</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((sh) => {
                  const gap = sh.qtyNeeded - sh.available;
                  const coverPct = sh.qtyNeeded > 0 ? Math.min(100, Math.round((sh.available / sh.qtyNeeded) * 100)) : 0;
                  return (
                    <TableRow key={sh.id} className={`border-border hover:bg-muted/30 ${sh.priority === "דחוף" ? "bg-red-500/5" : ""}`}>
                      <TableCell>
                        <div>
                          <div className="font-semibold text-foreground text-sm">{sh.material}</div>
                          <div className="text-xs text-muted-foreground">{sh.id}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-mono text-blue-400 text-sm">{sh.wo}</div>
                          <div className="text-xs text-muted-foreground">{sh.woName}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-mono text-foreground">{fmt(sh.qtyNeeded)}</TableCell>
                      <TableCell className="text-center font-mono text-foreground">{fmt(sh.available)}</TableCell>
                      <TableCell className={`text-center font-mono font-bold ${gap > 0 ? "text-red-400" : "text-green-400"}`}>
                        {gap > 0 ? `-${fmt(gap)}` : "0"}
                      </TableCell>
                      <TableCell className="text-center text-sm text-foreground">{sh.supplier}</TableCell>
                      <TableCell className="text-center">
                        <span className={`font-mono ${sh.leadDays > 14 ? "text-red-400" : sh.leadDays > 7 ? "text-yellow-400" : "text-foreground"}`}>
                          {sh.leadDays} ימים
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`${priorityColor[sh.priority]} border-0 text-xs`}>{sh.priority}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={`${actionColor[sh.action]} border-0 text-xs`}>{sh.action}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={coverPct} className="h-2 flex-1 bg-muted/40" />
                          <span className="text-xs text-muted-foreground w-8 text-left">{coverPct}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        <span>עודכן: 08/04/2026 08:45</span>
        <span>|</span>
        <span>{activeShortages} חוסרים פעילים</span>
        <span>|</span>
        <span>{urgentShortages} דחופים</span>
        <span>|</span>
        <span>{affectedWOs} הזמנות עבודה מושפעות</span>
      </div>
    </div>
  );
}
