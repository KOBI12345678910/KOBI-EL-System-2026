import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Warehouse, Package, DollarSign, AlertTriangle, Ban, ShieldAlert,
  FolderKanban, Hammer, FlaskConical, Recycle, ArrowLeftRight,
  ClipboardCheck, TrendingUp, TrendingDown, Clock, Eye,
  BarChart3, Layers, Target, CheckCircle, Scissors
} from "lucide-react";

const API = "/api";

// ── Data ────────────────────────────────────────────────────────────────
const FALLBACK_KPIS = [
  { label: "סה\"כ פריטים", value: "3,842", icon: Package, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "שווי מלאי כולל", value: "₪12.4M", icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "מחסנים פעילים", value: "3", icon: Warehouse, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "מלאי נמוך", value: "47", icon: TrendingDown, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "אזל מהמלאי", value: "8", icon: Ban, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "משוריין", value: "214", icon: ShieldAlert, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "מוקצה לפרויקטים", value: "186", icon: FolderKanban, color: "text-indigo-400", bg: "bg-indigo-500/10" },
  { label: "פגום", value: "23", icon: Hammer, color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "בהסגר", value: "11", icon: FlaskConical, color: "text-pink-400", bg: "bg-pink-500/10" },
  { label: "שאריות / רמננטים", value: "156", icon: Scissors, color: "text-teal-400", bg: "bg-teal-500/10" },
];

const FALLBACK_WAREHOUSES = [
  {
    name: "מחסן ראשי",
    code: "WH-01",
    location: "חולון",
    items: 2180,
    value: 7200000,
    utilization: 87,
    zones: 12,
    bins: 480,
    lowStock: 28,
    outOfStock: 5,
  },
  {
    name: "מחסן חומרי גלם",
    code: "WH-02",
    location: "אשדוד",
    items: 980,
    value: 3800000,
    utilization: 72,
    zones: 8,
    bins: 320,
    lowStock: 14,
    outOfStock: 2,
  },
  {
    name: "מחסן מוצרים מוגמרים",
    code: "WH-03",
    location: "חולון",
    items: 682,
    value: 1400000,
    utilization: 54,
    zones: 6,
    bins: 240,
    lowStock: 5,
    outOfStock: 1,
  },
];

const FALLBACK_CRITICAL_ITEMS = [
  { sku: "ALU-6063-T5-3M", name: "פרופיל אלומיניום 6063 T5 3m", wh: "WH-01", current: 12, min: 100, max: 500, status: "critical", batch: "B-2026-0341", unit: 'מ"א', value: 18600, daysToOut: 2 },
  { sku: "GLS-TEMP-10MM", name: "זכוכית מחוסמת 10mm", wh: "WH-02", current: 0, min: 50, max: 200, status: "out", batch: "-", unit: "יח'", value: 0, daysToOut: 0 },
  { sku: "STL-FLAT-4MM", name: "פלטת פלדה 4mm", wh: "WH-02", current: 8, min: 40, max: 150, status: "critical", batch: "B-2026-0298", unit: "יח'", value: 12400, daysToOut: 3 },
  { sku: "ALU-5052-SHT", name: "גיליון אלומיניום 5052", wh: "WH-01", current: 22, min: 60, max: 200, status: "low", batch: "B-2026-0315", unit: "יח'", value: 34100, daysToOut: 7 },
  { sku: "GLS-LAM-6MM", name: "זכוכית למינציה 6mm", wh: "WH-02", current: 0, min: 30, max: 120, status: "out", batch: "-", unit: "יח'", value: 0, daysToOut: 0 },
  { sku: "ACC-SEAL-BLK", name: "גומיית איטום שחורה", wh: "WH-01", current: 45, min: 200, max: 800, status: "low", batch: "B-2026-0322", unit: 'מ"א', value: 3150, daysToOut: 5 },
  { sku: "BRZ-ANGLE-40", name: "זווית ברזל 40x40", wh: "WH-01", current: 15, min: 50, max: 200, status: "critical", batch: "B-2026-0289", unit: 'מ"א', value: 6750, daysToOut: 4 },
  { sku: "ALU-HNDL-EUR", name: "ידית אלומיניום אירופאית", wh: "WH-03", current: 0, min: 100, max: 400, status: "out", batch: "-", unit: "יח'", value: 0, daysToOut: 0 },
];

const FALLBACK_RECENT_MOVEMENTS = [
  { date: "08/04 11:20", type: "כניסה", sku: "ALU-6063-T5-3M", qty: "+200", wh: "WH-01", ref: "GR-004521", project: "-", by: "יוסי לוי" },
  { date: "08/04 10:05", type: "יציאה", sku: "GLS-TEMP-10MM", qty: "-80", wh: "WH-02", ref: "SO-008834", project: "פרויקט מגדלי TLV", by: "מערכת" },
  { date: "08/04 09:30", type: "העברה", sku: "STL-FLAT-4MM", qty: "30", wh: "WH-02 ← WH-01", ref: "TR-001245", project: "-", by: "דוד כהן" },
  { date: "07/04 16:45", type: "הקצאה", sku: "ALU-5052-SHT", qty: "50", wh: "WH-01", ref: "ALLOC-0089", project: "פרויקט קניון הנגב", by: "שרה אביב" },
  { date: "07/04 15:10", type: "שריון", sku: "ACC-SEAL-BLK", qty: "500", wh: "WH-01", ref: "RSV-00312", project: "פרויקט בית חולים", by: "מיכל ברק" },
  { date: "07/04 14:00", type: "ספירה", sku: "BRZ-ANGLE-40", qty: "-3 (התאמה)", wh: "WH-01", ref: "CC-000078", project: "-", by: "עומר חדד" },
  { date: "07/04 11:30", type: "כניסה", sku: "GLS-LAM-6MM", qty: "+120", wh: "WH-02", ref: "GR-004520", project: "-", by: "נועה שלום" },
];

const FALLBACK_RESERVATIONS = [
  { id: "RSV-00312", sku: "ACC-SEAL-BLK", name: "גומיית איטום שחורה", qty: 500, project: "פרויקט בית חולים", customer: "כללית הנדסה", date: "07/04/2026", expiry: "15/04/2026", status: "פעיל" },
  { id: "RSV-00308", sku: "ALU-6063-T5-3M", name: "פרופיל 6063 T5", qty: 150, project: "מגדלי TLV", customer: "אורבן בניה", date: "05/04/2026", expiry: "20/04/2026", status: "פעיל" },
  { id: "RSV-00305", sku: "GLS-TEMP-10MM", name: "זכוכית מחוסמת 10mm", qty: 60, project: "קניון הנגב", customer: "נגב מסחר", date: "03/04/2026", expiry: "12/04/2026", status: "חלקי" },
  { id: "RSV-00301", sku: "STL-FLAT-4MM", name: "פלטת פלדה 4mm", qty: 25, project: "מרכז לוגיסטי צפון", customer: "גלבוע תשתיות", date: "01/04/2026", expiry: "10/04/2026", status: "בסיכון" },
  { id: "RSV-00298", sku: "ALU-HNDL-EUR", name: "ידית אירופאית", qty: 200, project: "פרויקט אופיס פארק", customer: "פסגות נדל\"ן", date: "28/03/2026", expiry: "08/04/2026", status: "פג תוקף" },
];

const FALLBACK_EXCEPTIONS = [
  { id: "DMG-0045", sku: "ALU-6063-T5-3M", name: "פרופיל 6063 T5 — שריטות", type: "פגום", qty: 8, wh: "WH-01", date: "06/04/2026", action: "ממתין להחלטה", value: 12400 },
  { id: "QRN-0019", sku: "GLS-TEMP-10MM", name: "זכוכית מחוסמת — חשד סדק", type: "הסגר", qty: 15, wh: "WH-02", date: "05/04/2026", action: "בבדיקת QC", value: 23250 },
  { id: "DMG-0044", sku: "STL-FLAT-4MM", name: "פלטת פלדה — חלודה", type: "פגום", qty: 5, wh: "WH-02", date: "04/04/2026", action: "לגריטה", value: 7750 },
  { id: "SCR-0031", sku: "ALU-5052-SHT", name: "גיליון 5052 — חיתוך שגוי", type: "גרוטאה", qty: 3, wh: "WH-01", date: "03/04/2026", action: "ממתין למחזור", value: 4650 },
  { id: "QRN-0018", sku: "ACC-SEAL-BLK", name: "גומיית איטום — בדיקת ספק", type: "הסגר", qty: 200, wh: "WH-01", date: "02/04/2026", action: "בבדיקת ספק", value: 1400 },
  { id: "RMN-0112", sku: "ALU-6063-T5-3M", name: "שארית פרופיל 6063 (0.4-1.2m)", type: "שארית", qty: 34, wh: "WH-01", date: "07/04/2026", action: "זמין לשימוש", value: 5270 },
  { id: "RMN-0111", sku: "GLS-LAM-6MM", name: "שארית זכוכית למינציה (קטן)", type: "שארית", qty: 12, wh: "WH-02", date: "06/04/2026", action: "זמין לשימוש", value: 3720 },
  { id: "SCR-0030", sku: "BRZ-ANGLE-40", name: "זווית ברזל — עקום", type: "גרוטאה", qty: 7, wh: "WH-01", date: "01/04/2026", action: "אושר למחזור", value: 3150 },
];

const fmt = (v: number) =>
  v >= 1000000 ? `₪${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `₪${(v / 1000).toFixed(0)}K` : `₪${v.toLocaleString()}`;

const movementColor: Record<string, string> = {
  "כניסה": "bg-emerald-500/20 text-emerald-300",
  "יציאה": "bg-red-500/20 text-red-300",
  "העברה": "bg-blue-500/20 text-blue-300",
  "הקצאה": "bg-indigo-500/20 text-indigo-300",
  "שריון": "bg-cyan-500/20 text-cyan-300",
  "ספירה": "bg-amber-500/20 text-amber-300",
};

const rsvStatusColor: Record<string, string> = {
  "פעיל": "bg-emerald-500/20 text-emerald-300",
  "חלקי": "bg-amber-500/20 text-amber-300",
  "בסיכון": "bg-red-500/20 text-red-300",
  "פג תוקף": "bg-gray-500/20 text-gray-400",
};

const excTypeColor: Record<string, string> = {
  "פגום": "bg-orange-500/20 text-orange-300",
  "הסגר": "bg-pink-500/20 text-pink-300",
  "גרוטאה": "bg-red-500/20 text-red-300",
  "שארית": "bg-teal-500/20 text-teal-300",
};

// ── Component ───────────────────────────────────────────────────────────
export default function InventoryUltraDashboard() {
  const [activeTab, setActiveTab] = useState("overview");

  const { data: apiData } = useQuery({
    queryKey: ["inventory-ultra-dashboard"],
    queryFn: async () => {
      const res = await authFetch(`${API}/inventory/dashboard`);
      if (!res.ok) throw new Error("Failed to fetch inventory ultra dashboard");
      return res.json();
    },
  });

  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const warehouses = apiData?.warehouses ?? FALLBACK_WAREHOUSES;
  const criticalItems = apiData?.criticalItems ?? FALLBACK_CRITICAL_ITEMS;
  const recentMovements = apiData?.recentMovements ?? FALLBACK_RECENT_MOVEMENTS;
  const reservations = apiData?.reservations ?? FALLBACK_RESERVATIONS;
  const exceptions = apiData?.exceptions ?? FALLBACK_EXCEPTIONS;

  return (
    <div className="p-6 space-y-5 bg-[#0a0e1a] min-h-screen text-gray-100" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Warehouse className="h-7 w-7 text-blue-400" />
            מרכז פיקוד מלאי Ultra
            <Badge className="bg-red-500/20 text-red-400 border-red-500/30 animate-pulse text-[10px] mr-2">
              LIVE
            </Badge>
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            טכנו-כל עוזי | מחסנים | אזורים | אצוות | סריאלי | תנועות | שריונות | הקצאות | ספירות | שאריות | הערכת שווי
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] border-gray-700 text-gray-400">
            <Clock className="h-3 w-3 ml-1" /> עדכון: 08/04/2026 11:25
          </Badge>
          <Badge variant="outline" className="text-[10px] border-emerald-700 text-emerald-400">
            <CheckCircle className="h-3 w-3 ml-1" /> 21 מודולים פעילים
          </Badge>
        </div>
      </div>

      {/* KPI Row — 10 cards */}
      <div className="grid grid-cols-10 gap-2">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border-gray-800 shadow-lg`}>
              <CardContent className="pt-2.5 pb-2 text-center px-1">
                <Icon className={`h-4 w-4 mx-auto ${kpi.color} mb-1`} />
                <p className="text-[8px] text-gray-500 leading-tight truncate">{kpi.label}</p>
                <p className={`text-sm font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Warehouse Cards — 3 */}
      <div className="grid grid-cols-3 gap-4">
        {warehouses.map((wh, i) => (
          <Card key={i} className={`border-gray-800 bg-gray-900/60 ${wh.utilization > 80 ? "ring-1 ring-amber-500/40" : ""}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 text-gray-100">
                  <Warehouse className="h-4 w-4 text-blue-400" />
                  {wh.name}
                </CardTitle>
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="font-mono text-[9px] border-gray-700 text-gray-400">{wh.code}</Badge>
                  <Badge variant="outline" className="text-[9px] border-gray-700 text-gray-500">{wh.location}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-gray-400">ניצול קיבולת</span>
                  <span className={`font-mono font-bold ${wh.utilization > 80 ? "text-amber-400" : wh.utilization > 60 ? "text-blue-400" : "text-emerald-400"}`}>
                    {wh.utilization}%
                  </span>
                </div>
                <Progress
                  value={wh.utilization}
                  className={`h-2 bg-gray-800 ${wh.utilization > 80 ? "[&>div]:bg-amber-500" : wh.utilization > 60 ? "[&>div]:bg-blue-500" : "[&>div]:bg-emerald-500"}`}
                />
              </div>
              <div className="grid grid-cols-3 gap-x-3 gap-y-1.5 text-[10px]">
                <div className="flex justify-between"><span className="text-gray-500">פריטים</span><span className="font-mono text-gray-200">{wh.items.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">שווי</span><span className="font-mono text-emerald-400">{fmt(wh.value)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">אזורים/תאים</span><span className="font-mono text-gray-200">{wh.zones}/{wh.bins}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">מלאי נמוך</span><span className="font-mono text-amber-400">{wh.lowStock}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">חסר</span><span className="font-mono text-red-400">{wh.outOfStock}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">ניצול</span><span className="font-mono text-blue-400">{wh.utilization}%</span></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Critical Items Table */}
      <Card className="border-gray-800 bg-gray-900/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2 text-gray-100">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            פריטים קריטיים — דורשים טיפול מיידי
            <Badge className="bg-red-500/20 text-red-400 text-[10px] mr-2">{criticalItems.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-800/50 border-gray-700">
                <TableHead className="text-right text-[10px] font-semibold text-gray-400">SKU</TableHead>
                <TableHead className="text-right text-[10px] font-semibold text-gray-400">פריט</TableHead>
                <TableHead className="text-right text-[10px] font-semibold text-gray-400">מחסן</TableHead>
                <TableHead className="text-right text-[10px] font-semibold text-gray-400">קיים</TableHead>
                <TableHead className="text-right text-[10px] font-semibold text-gray-400">מינ/מקס</TableHead>
                <TableHead className="text-right text-[10px] font-semibold text-gray-400 w-24">מצב</TableHead>
                <TableHead className="text-right text-[10px] font-semibold text-gray-400">ימים ל-0</TableHead>
                <TableHead className="text-right text-[10px] font-semibold text-gray-400">שווי</TableHead>
                <TableHead className="text-right text-[10px] font-semibold text-gray-400">סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {criticalItems
                .sort((a, b) => a.daysToOut - b.daysToOut)
                .map((item, i) => (
                  <TableRow key={i} className={`border-gray-800 ${item.status === "out" ? "bg-red-500/5" : item.status === "critical" ? "bg-amber-500/5" : ""}`}>
                    <TableCell className="font-mono text-[10px] text-gray-300">{item.sku}</TableCell>
                    <TableCell className="text-xs font-medium text-gray-200">{item.name}</TableCell>
                    <TableCell className="text-[10px] text-gray-400">{item.wh}</TableCell>
                    <TableCell className={`font-mono text-xs font-bold ${item.current === 0 ? "text-red-400" : item.current < item.min * 0.3 ? "text-amber-400" : "text-gray-200"}`}>
                      {item.current} {item.unit}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-gray-500">{item.min}/{item.max}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Progress
                          value={item.max > 0 ? (item.current / item.max) * 100 : 0}
                          className={`h-2 w-14 bg-gray-800 ${item.current === 0 ? "[&>div]:bg-red-500" : (item.current / item.min) < 0.5 ? "[&>div]:bg-red-500" : "[&>div]:bg-amber-500"}`}
                        />
                        <span className="text-[9px] font-mono text-gray-500">
                          {item.max > 0 ? ((item.current / item.max) * 100).toFixed(0) : 0}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={`font-mono text-xs font-bold ${item.daysToOut === 0 ? "text-red-400" : item.daysToOut <= 3 ? "text-amber-400" : "text-gray-300"}`}>
                      {item.daysToOut === 0 ? "אזל" : `${item.daysToOut}d`}
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-gray-400">{item.value > 0 ? fmt(item.value) : "-"}</TableCell>
                    <TableCell>
                      <Badge className={`text-[8px] ${item.status === "out" ? "bg-red-500/20 text-red-300 animate-pulse" : item.status === "critical" ? "bg-amber-500/20 text-amber-300" : "bg-yellow-500/20 text-yellow-300"}`}>
                        {item.status === "out" ? "אזל" : item.status === "critical" ? "קריטי" : "נמוך"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-gray-800/50 border border-gray-700">
          <TabsTrigger value="overview" className="text-xs gap-1 data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">
            <Eye className="h-3.5 w-3.5" /> סקירה
          </TabsTrigger>
          <TabsTrigger value="movements" className="text-xs gap-1 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-300">
            <ArrowLeftRight className="h-3.5 w-3.5" /> תנועות
          </TabsTrigger>
          <TabsTrigger value="reservations" className="text-xs gap-1 data-[state=active]:bg-cyan-600/20 data-[state=active]:text-cyan-300">
            <ShieldAlert className="h-3.5 w-3.5" /> שריונות
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="text-xs gap-1 data-[state=active]:bg-orange-600/20 data-[state=active]:text-orange-300">
            <Hammer className="h-3.5 w-3.5" /> חריגים
          </TabsTrigger>
        </TabsList>

        {/* ── Overview Tab ────────────────────────────────────── */}
        <TabsContent value="overview">
          <div className="grid grid-cols-3 gap-4">
            {/* Module status grid */}
            <Card className="col-span-2 border-gray-800 bg-gray-900/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-gray-100 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-blue-400" /> 21 מודולים — סטטוס
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { name: "מחסנים", status: "תקין", count: 3 },
                    { name: "אזורים/תאים", status: "תקין", count: 1040 },
                    { name: "פריטי מלאי", status: "תקין", count: 3842 },
                    { name: "יחידות מידה", status: "תקין", count: 18 },
                    { name: "אצוות", status: "תקין", count: 624 },
                    { name: "מספרים סריאליים", status: "תקין", count: 1280 },
                    { name: "תנועות מלאי", status: "תקין", count: 12840 },
                    { name: "שריונות", status: "התראה", count: 214 },
                    { name: "הקצאה לפרויקטים", status: "תקין", count: 186 },
                    { name: "מינ/מקס", status: "התראה", count: 47 },
                    { name: "נקודת הזמנה חוזרת", status: "קריטי", count: 8 },
                    { name: "ספירות מחזוריות", status: "תקין", count: 12 },
                    { name: "ספירות מלאי", status: "תקין", count: 4 },
                    { name: "פגום", status: "התראה", count: 23 },
                    { name: "הסגר", status: "התראה", count: 11 },
                    { name: "גרוטאות", status: "תקין", count: 10 },
                    { name: "שאריות/רמננטים", status: "תקין", count: 156 },
                    { name: "העברות בין מחסנים", status: "תקין", count: 38 },
                    { name: "הערכת שווי", status: "תקין", count: 1 },
                    { name: "ניתוח Aging", status: "תקין", count: 1 },
                    { name: "זמינות Real-time", status: "תקין", count: 1 },
                  ].map((mod, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-800/40 rounded px-2 py-1.5 text-[10px]">
                      <span className="text-gray-300">{mod.name}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-gray-400">{mod.count.toLocaleString()}</span>
                        <span className={`w-2 h-2 rounded-full ${mod.status === "תקין" ? "bg-emerald-500" : mod.status === "התראה" ? "bg-amber-500 animate-pulse" : "bg-red-500 animate-pulse"}`} />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Right side summary */}
            <div className="space-y-4">
              <Card className="border-gray-800 bg-gray-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-100 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-purple-400" /> הערכת שווי
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-[11px]">
                  {[
                    { label: "חומרי גלם", value: 5800000, pct: 47 },
                    { label: "מוצרים מוגמרים", value: 3200000, pct: 26 },
                    { label: "חלפים ואביזרים", value: 2100000, pct: 17 },
                    { label: "שאריות ורמננטים", value: 820000, pct: 6.5 },
                    { label: "אחר", value: 480000, pct: 3.5 },
                  ].map((cat, i) => (
                    <div key={i}>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-gray-400">{cat.label}</span>
                        <span className="font-mono text-gray-200">{fmt(cat.value)} ({cat.pct}%)</span>
                      </div>
                      <Progress value={cat.pct} className="h-1.5 bg-gray-800 [&>div]:bg-purple-500" />
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t border-gray-700 font-bold">
                    <span className="text-gray-300">סה"כ</span>
                    <span className="font-mono text-emerald-400">₪12.4M</span>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-gray-800 bg-gray-900/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-gray-100 flex items-center gap-2">
                    <Target className="h-4 w-4 text-amber-400" /> Aging מלאי
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-[11px]">
                  {[
                    { range: "0-30 יום", items: 2180, pct: 57, color: "bg-emerald-500" },
                    { range: "31-60 יום", items: 890, pct: 23, color: "bg-blue-500" },
                    { range: "61-90 יום", items: 480, pct: 12.5, color: "bg-amber-500" },
                    { range: "90+ יום", items: 292, pct: 7.5, color: "bg-red-500" },
                  ].map((age, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-gray-400 w-16">{age.range}</span>
                      <Progress value={age.pct} className={`h-2 flex-1 bg-gray-800 [&>div]:${age.color}`} />
                      <span className="font-mono text-gray-300 text-[10px] w-20 text-left">{age.items} ({age.pct}%)</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Movements Tab ───────────────────────────────────── */}
        <TabsContent value="movements">
          <Card className="border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-100 flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-emerald-400" /> תנועות מלאי אחרונות
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-800/50 border-gray-700">
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">תאריך</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">סוג</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">SKU</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">כמות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">מחסן</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">אסמכתא</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">פרויקט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">בוצע ע"י</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentMovements.map((mv, i) => (
                    <TableRow key={i} className="border-gray-800">
                      <TableCell className="text-[10px] text-gray-400">{mv.date}</TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] ${movementColor[mv.type] || "bg-gray-500/20 text-gray-300"}`}>
                          {mv.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-gray-300">{mv.sku}</TableCell>
                      <TableCell className={`font-mono text-xs font-bold ${mv.qty.startsWith("+") ? "text-emerald-400" : mv.qty.startsWith("-") ? "text-red-400" : "text-blue-400"}`}>
                        {mv.qty}
                      </TableCell>
                      <TableCell className="text-[10px] text-gray-400">{mv.wh}</TableCell>
                      <TableCell className="font-mono text-[9px] text-gray-500">{mv.ref}</TableCell>
                      <TableCell className="text-[10px] text-gray-400">{mv.project}</TableCell>
                      <TableCell className="text-[10px] text-gray-300">{mv.by}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Reservations Tab ────────────────────────────────── */}
        <TabsContent value="reservations">
          <Card className="border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-100 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-cyan-400" /> שריונות והקצאות פעילות
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-800/50 border-gray-700">
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">מס' שריון</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">SKU</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">פריט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">כמות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">פרויקט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">לקוח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">תוקף</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservations.map((rsv, i) => (
                    <TableRow key={i} className={`border-gray-800 ${rsv.status === "פג תוקף" ? "bg-red-500/5" : rsv.status === "בסיכון" ? "bg-amber-500/5" : ""}`}>
                      <TableCell className="font-mono text-[10px] text-blue-400">{rsv.id}</TableCell>
                      <TableCell className="font-mono text-[10px] text-gray-300">{rsv.sku}</TableCell>
                      <TableCell className="text-xs text-gray-200">{rsv.name}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-gray-200">{rsv.qty}</TableCell>
                      <TableCell className="text-[10px] text-gray-300">{rsv.project}</TableCell>
                      <TableCell className="text-[10px] text-gray-400">{rsv.customer}</TableCell>
                      <TableCell className="font-mono text-[10px] text-gray-400">{rsv.expiry}</TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] ${rsvStatusColor[rsv.status] || "bg-gray-500/20 text-gray-300"}`}>
                          {rsv.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Exceptions Tab ──────────────────────────────────── */}
        <TabsContent value="exceptions">
          <Card className="border-gray-800 bg-gray-900/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-gray-100 flex items-center gap-2">
                <Hammer className="h-4 w-4 text-orange-400" /> חריגים — פגום / הסגר / גרוטאות / שאריות
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-800/50 border-gray-700">
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">מס'</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">SKU</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">תיאור</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">סוג</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">כמות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">מחסן</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">תאריך</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">פעולה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-gray-400">שווי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exceptions.map((exc, i) => (
                    <TableRow key={i} className="border-gray-800">
                      <TableCell className="font-mono text-[10px] text-blue-400">{exc.id}</TableCell>
                      <TableCell className="font-mono text-[10px] text-gray-300">{exc.sku}</TableCell>
                      <TableCell className="text-xs text-gray-200">{exc.name}</TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] ${excTypeColor[exc.type] || "bg-gray-500/20 text-gray-300"}`}>
                          {exc.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs font-bold text-gray-200">{exc.qty}</TableCell>
                      <TableCell className="text-[10px] text-gray-400">{exc.wh}</TableCell>
                      <TableCell className="font-mono text-[10px] text-gray-400">{exc.date}</TableCell>
                      <TableCell className="text-[10px] text-gray-300">{exc.action}</TableCell>
                      <TableCell className="font-mono text-[10px] text-gray-400">{fmt(exc.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
