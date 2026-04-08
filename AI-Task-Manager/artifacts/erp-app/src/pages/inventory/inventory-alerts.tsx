import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Bell, AlertTriangle, PackageX, TrendingDown, Clock, Package,
  ShieldAlert, ArrowDownCircle, RotateCcw, CheckCircle2, XCircle,
  AlertOctagon, Boxes, BarChart3, Truck, Search, Filter,
} from "lucide-react";

const API = "/api";

const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);

type Severity = "critical" | "high" | "medium" | "low";
type AlertType = "low_stock" | "out_of_stock" | "below_reorder" | "expiring_batch" | "overstock" | "slow_moving" | "damaged_detected" | "reservation_conflict";

const SEV: Record<Severity, { label: string; color: string; bg: string; border: string }> = {
  critical: { label: "קריטי", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/40" },
  high: { label: "גבוה", color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/40" },
  medium: { label: "בינוני", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/40" },
  low: { label: "נמוך", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/40" },
};

const TYPE_LABELS: Record<AlertType, { label: string; icon: any }> = {
  low_stock: { label: "מלאי נמוך", icon: TrendingDown },
  out_of_stock: { label: "אזל מהמלאי", icon: PackageX },
  below_reorder: { label: "מתחת לנקודת הזמנה", icon: ArrowDownCircle },
  expiring_batch: { label: "אצווה פגת תוקף", icon: Clock },
  overstock: { label: "עודף מלאי", icon: Boxes },
  slow_moving: { label: "מלאי איטי תנועה", icon: BarChart3 },
  damaged_detected: { label: "נזק שזוהה", icon: AlertOctagon },
  reservation_conflict: { label: "התנגשות הזמנות", icon: ShieldAlert },
};

interface Alert {
  id: number; type: AlertType; severity: Severity; item: string; sku: string;
  currentQty: number; threshold: number; unit: string; warehouse: string;
  action: string; createdAt: string;
}

const FALLBACK_ALERTS: Alert[] = [
  { id: 1, type: "out_of_stock", severity: "critical", item: "פלדה אל-חלד 304", sku: "RM-1001", currentQty: 0, threshold: 500, unit: 'ק"ג', warehouse: "מחסן ראשי", action: "הזמנה דחופה מספק מתכות הצפון", createdAt: "2026-04-08 08:15" },
  { id: 2, type: "low_stock", severity: "high", item: "ברגים M8x30", sku: "FP-2044", currentQty: 120, threshold: 500, unit: "יח'", warehouse: "מחסן חלפים", action: "להעלות כמות הזמנה ל-1,000 יח'", createdAt: "2026-04-08 07:30" },
  { id: 3, type: "below_reorder", severity: "high", item: "שמן הידראולי ISO 46", sku: "RM-3022", currentQty: 45, threshold: 100, unit: "ליטר", warehouse: "מחסן ראשי", action: "להפעיל הזמנה אוטומטית - ספק שמנים בע\"מ", createdAt: "2026-04-08 06:00" },
  { id: 4, type: "expiring_batch", severity: "critical", item: "דבק אפוקסי תעשייתי", sku: "RM-4015", currentQty: 30, threshold: 0, unit: 'ק"ג', warehouse: "מחסן כימיקלים", action: "לנצל לפני 15/04 או להחזיר לספק", createdAt: "2026-04-07 16:00" },
  { id: 5, type: "overstock", severity: "medium", item: "אריזות קרטון 40x30", sku: "PK-7001", currentQty: 12000, threshold: 3000, unit: "יח'", warehouse: "מחסן אריזה", action: "לעצור הזמנות - מלאי ל-4 חודשים", createdAt: "2026-04-07 14:30" },
  { id: 6, type: "slow_moving", severity: "low", item: "רצועות הנעה B68", sku: "SP-5033", currentQty: 340, threshold: 50, unit: "יח'", warehouse: "מחסן חלפים", action: "לבחון הנחה או העברה לסניף דרום", createdAt: "2026-04-07 11:00" },
  { id: 7, type: "damaged_detected", severity: "high", item: "צינורות נחושת 15mm", sku: "RM-1088", currentQty: 85, threshold: 200, unit: "מטר", warehouse: "מחסן ראשי", action: "בדיקת איכות + תביעת ביטוח", createdAt: "2026-04-07 09:45" },
  { id: 8, type: "reservation_conflict", severity: "medium", item: "מנועי חשמל 2.2kW", sku: "FP-8002", currentQty: 3, threshold: 8, unit: "יח'", warehouse: "מחסן מוצרים", action: "3 יח' שמורות ל-2 הזמנות — לפצל משלוח", createdAt: "2026-04-08 09:00" },
  { id: 9, type: "low_stock", severity: "medium", item: "חוט ריתוך MIG 0.8mm", sku: "RM-2011", currentQty: 8, threshold: 25, unit: "גלילים", warehouse: "מחסן ראשי", action: "הזמנה רגילה — אספקה תוך 3 ימים", createdAt: "2026-04-06 15:00" },
  { id: 10, type: "out_of_stock", severity: "critical", item: "שסתומי לחץ DN25", sku: "FP-9010", currentQty: 0, threshold: 20, unit: "יח'", warehouse: "מחסן חלפים", action: "לאתר ספק חלופי — מוביל אינו זמין", createdAt: "2026-04-08 07:00" },
  { id: 11, type: "expiring_batch", severity: "high", item: "צבע תעשייתי RAL 7035", sku: "RM-6005", currentQty: 60, threshold: 0, unit: "ליטר", warehouse: "מחסן כימיקלים", action: "תפוגה 20/04 — לתעדף בייצור השבוע", createdAt: "2026-04-07 10:00" },
  { id: 12, type: "below_reorder", severity: "medium", item: "אומים M10 גלוון", sku: "FP-2051", currentQty: 200, threshold: 500, unit: "יח'", warehouse: "מחסן חלפים", action: "הזמנה משלימה ל-1,500 יח'", createdAt: "2026-04-06 12:00" },
];

const FALLBACK_REORDERS = [
  { id: 1, item: "פלדה אל-חלד 304", sku: "RM-1001", current: 0, reorderPt: 500, suggestedQty: 2000, unit: 'ק"ג', supplier: "מתכות הצפון בע\"מ", estCost: 48000, leadDays: 5 },
  { id: 2, item: "ברגים M8x30", sku: "FP-2044", current: 120, reorderPt: 500, suggestedQty: 1000, unit: "יח'", supplier: "פסטנרס ישראל", estCost: 1200, leadDays: 3 },
  { id: 3, item: "שמן הידראולי ISO 46", sku: "RM-3022", current: 45, reorderPt: 100, suggestedQty: 400, unit: "ליטר", supplier: "שמנים בע\"מ", estCost: 6800, leadDays: 4 },
  { id: 4, item: "שסתומי לחץ DN25", sku: "FP-9010", current: 0, reorderPt: 20, suggestedQty: 50, unit: "יח'", supplier: "ואלבקו בע\"מ", estCost: 15500, leadDays: 14 },
  { id: 5, item: "חוט ריתוך MIG 0.8mm", sku: "RM-2011", current: 8, reorderPt: 25, suggestedQty: 50, unit: "גלילים", supplier: "לינקולן אלקטריק", estCost: 4200, leadDays: 3 },
  { id: 6, item: "אומים M10 גלוון", sku: "FP-2051", current: 200, reorderPt: 500, suggestedQty: 1500, unit: "יח'", supplier: "פסטנרס ישראל", estCost: 900, leadDays: 3 },
  { id: 7, item: "צינורות נחושת 15mm", sku: "RM-1088", current: 85, reorderPt: 200, suggestedQty: 500, unit: "מטר", supplier: "נחושתן בע\"מ", estCost: 22500, leadDays: 7 },
];

const FALLBACK_HISTORY = [
  { id: 101, item: "אלומיניום 6061 T6", type: "low_stock" as AlertType, resolvedAt: "2026-04-05 14:30", resolvedBy: "יוסי כהן", resolution: "הוזמנו 500 ק\"ג — אספקה התקבלה" },
  { id: 102, item: "גומיות O-Ring DN50", type: "out_of_stock" as AlertType, resolvedAt: "2026-04-04 11:00", resolvedBy: "שרה לוי", resolution: "ספק חלופי סיפק 200 יח' באופן מיידי" },
  { id: 103, item: "ממס תעשייתי", type: "expiring_batch" as AlertType, resolvedAt: "2026-04-03 16:45", resolvedBy: "דוד מזרחי", resolution: "נוצל בייצור לפני תפוגה" },
  { id: 104, item: "פילטרים אוויר תעשייתיים", type: "overstock" as AlertType, resolvedAt: "2026-04-02 09:15", resolvedBy: "רחל אברהם", resolution: "הועבר עודף לסניף דרום" },
  { id: 105, item: "לוחות PVC 5mm", type: "damaged_detected" as AlertType, resolvedAt: "2026-04-01 13:00", resolvedBy: "אלון גולדשטיין", resolution: "תביעת ביטוח אושרה — פיצוי ₪8,200" },
];

export default function InventoryAlerts() {
  const [search, setSearch] = useState("");
  const [sevFilter, setSevFilter] = useState<Severity | "all">("all");

  const { data: apiData } = useQuery({
    queryKey: ["inventory-alerts"],
    queryFn: async () => {
      const res = await authFetch(`${API}/inventory/alerts`);
      if (!res.ok) throw new Error("Failed to fetch inventory alerts");
      return res.json();
    },
  });

  const ALERTS: Alert[] = apiData?.alerts ?? FALLBACK_ALERTS;
  const REORDERS = apiData?.reorders ?? FALLBACK_REORDERS;
  const HISTORY = apiData?.history ?? FALLBACK_HISTORY;

  const KPI_DATA = [
    { label: "התראות פעילות", value: ALERTS.length, icon: Bell, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "מלאי נמוך", value: ALERTS.filter(a => a.type === "low_stock").length, icon: TrendingDown, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "אזל מהמלאי", value: ALERTS.filter(a => a.type === "out_of_stock").length, icon: PackageX, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "מתחת לנק' הזמנה", value: ALERTS.filter(a => a.type === "below_reorder").length, icon: ArrowDownCircle, color: "text-orange-400", bg: "bg-orange-500/10" },
    { label: "פגי תוקף", value: ALERTS.filter(a => a.type === "expiring_batch").length, icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "עודף מלאי", value: ALERTS.filter(a => a.type === "overstock").length, icon: Boxes, color: "text-blue-400", bg: "bg-blue-500/10" },
  ];

  const filtered = ALERTS.filter(a => {
    if (sevFilter !== "all" && a.severity !== sevFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return a.item.includes(s) || a.sku.toLowerCase().includes(s) || a.warehouse.includes(s);
    }
    return true;
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="relative w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
          <Bell className="w-5 h-5 text-red-400" />
          <span className="absolute -top-1 -left-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">התראות מלאי והזמנות חוזרות</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניטור חריגות וניהול הזמנות אוטומטיות</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPI_DATA.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/40">
            <CardContent className="p-4 flex flex-col items-center gap-1.5">
              <div className={`w-9 h-9 rounded-lg ${k.bg} flex items-center justify-center`}>
                <k.icon className={`w-4 h-4 ${k.color}`} />
              </div>
              <span className="text-2xl font-bold">{k.value}</span>
              <span className="text-xs text-muted-foreground text-center">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="alerts" className="space-y-4">
        <TabsList className="bg-card border border-border/50">
          <TabsTrigger value="alerts" className="gap-1.5"><AlertTriangle size={14} /> התראות</TabsTrigger>
          <TabsTrigger value="reorder" className="gap-1.5"><RotateCcw size={14} /> הזמנות חוזרות</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><CheckCircle2 size={14} /> היסטוריה</TabsTrigger>
        </TabsList>

        {/* Tab: Active Alerts */}
        <TabsContent value="alerts" className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder={'חיפוש לפי פריט, מק"ט, מחסן...'}
                className="w-full pr-9 pl-3 py-2 rounded-lg bg-card border border-border/50 text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div className="flex gap-1">
              {(["all", "critical", "high", "medium", "low"] as const).map(s => (
                <button key={s} onClick={() => setSevFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sevFilter === s ? "bg-primary text-primary-foreground" : "bg-card border border-border/50 text-muted-foreground hover:text-foreground"}`}>
                  {s === "all" ? "הכל" : SEV[s].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            {filtered.map(a => {
              const sev = SEV[a.severity];
              const tp = TYPE_LABELS[a.type];
              const Icon = tp.icon;
              const pct = a.threshold > 0 ? Math.min((a.currentQty / a.threshold) * 100, 100) : 0;
              return (
                <Card key={a.id} className={`${sev.bg} ${sev.border} border`}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-lg ${sev.bg} flex items-center justify-center shrink-0`}>
                          <Icon className={`w-4 h-4 ${sev.color}`} />
                        </div>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold">{a.item}</span>
                            <Badge variant="outline" className="text-xs">{a.sku}</Badge>
                            <Badge className={`${sev.bg} ${sev.color} border-0 text-xs`}>{sev.label}</Badge>
                            <Badge variant="outline" className="text-xs">{tp.label}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{a.warehouse} &bull; {a.createdAt}</p>
                        </div>
                      </div>
                      <div className="text-left min-w-[120px]">
                        <p className="text-xs text-muted-foreground">כמות נוכחית / סף</p>
                        <p className={`text-lg font-bold ${sev.color}`}>{a.currentQty.toLocaleString()} <span className="text-sm text-muted-foreground">/ {a.threshold.toLocaleString()} {a.unit}</span></p>
                        {a.threshold > 0 && <Progress value={pct} className="h-1.5 mt-1" />}
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 bg-card/50 rounded-lg px-3 py-2">
                      <Truck className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm"><span className="text-muted-foreground">פעולה נדרשת: </span>{a.action}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filtered.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>אין התראות התואמות לסינון</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab: Auto-Reorder Suggestions */}
        <TabsContent value="reorder" className="space-y-4">
          <Card className="bg-card/50 border-border/40">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/30">
                      <TableHead className="text-right">פריט</TableHead>
                      <TableHead className="text-right">מק"ט</TableHead>
                      <TableHead className="text-center">נוכחי</TableHead>
                      <TableHead className="text-center">נק' הזמנה</TableHead>
                      <TableHead className="text-center">כמות מוצעת</TableHead>
                      <TableHead className="text-right">ספק</TableHead>
                      <TableHead className="text-center">עלות משוערת</TableHead>
                      <TableHead className="text-center">זמן אספקה</TableHead>
                      <TableHead className="text-center">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {REORDERS.map(r => {
                      const ratio = r.reorderPt > 0 ? r.current / r.reorderPt : 0;
                      const statusColor = ratio === 0 ? "text-red-400" : ratio < 0.5 ? "text-orange-400" : "text-amber-400";
                      return (
                        <TableRow key={r.id} className="border-border/20 hover:bg-card/80">
                          <TableCell className="font-medium">{r.item}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{r.sku}</Badge></TableCell>
                          <TableCell className={`text-center font-bold ${statusColor}`}>{r.current.toLocaleString()} {r.unit}</TableCell>
                          <TableCell className="text-center">{r.reorderPt.toLocaleString()} {r.unit}</TableCell>
                          <TableCell className="text-center font-bold text-green-400">{r.suggestedQty.toLocaleString()} {r.unit}</TableCell>
                          <TableCell>{r.supplier}</TableCell>
                          <TableCell className="text-center font-medium">{fmt(r.estCost)}</TableCell>
                          <TableCell className="text-center">{r.leadDays} ימים</TableCell>
                          <TableCell className="text-center">
                            <Badge className="bg-amber-500/15 text-amber-400 border-0 text-xs">ממתין לאישור</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <div className="flex items-center justify-between bg-card/40 border border-border/30 rounded-lg px-4 py-3">
            <span className="text-sm text-muted-foreground">סה"כ עלות הזמנות מוצעות:</span>
            <span className="text-lg font-bold text-green-400">{fmt(REORDERS.reduce((s, r) => s + r.estCost, 0))}</span>
          </div>
        </TabsContent>

        {/* Tab: History */}
        <TabsContent value="history" className="space-y-4">
          <Card className="bg-card/50 border-border/40">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/30">
                      <TableHead className="text-right">פריט</TableHead>
                      <TableHead className="text-right">סוג התראה</TableHead>
                      <TableHead className="text-right">טופל ע"י</TableHead>
                      <TableHead className="text-right">תאריך סגירה</TableHead>
                      <TableHead className="text-right">פתרון</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {HISTORY.map(h => {
                      const tp = TYPE_LABELS[h.type];
                      const Icon = tp.icon;
                      return (
                        <TableRow key={h.id} className="border-border/20 hover:bg-card/80">
                          <TableCell className="font-medium">{h.item}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm">{tp.label}</span>
                            </div>
                          </TableCell>
                          <TableCell>{h.resolvedBy}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{h.resolvedAt}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
                              <span className="text-sm">{h.resolution}</span>
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
