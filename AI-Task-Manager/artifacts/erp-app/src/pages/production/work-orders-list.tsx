import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Clock, CheckCircle2, AlertTriangle, Package,
  Search, Timer, Activity, Layers, PauseCircle,
} from "lucide-react";

/* ── Types ── */
type WOStatus = "in_progress" | "waiting_material" | "waiting_station" | "completed" | "on_hold" | "cancelled";
type Operation = "חיתוך" | "ריתוך" | "שיוף" | "צביעה" | "הרכבה" | "אריזה";

interface WorkOrder {
  id: string;
  productionOrder: string;
  product: string;
  operation: Operation;
  station: string;
  operator: string;
  qty: number;
  progress: number;
  startTime: string;
  estimatedEnd: string;
  actualEnd: string | null;
  status: WOStatus;
}

/* ── Status config ── */
const statusMap: Record<WOStatus, { label: string; color: string }> = {
  in_progress:      { label: "בביצוע",        color: "bg-yellow-500/20 text-yellow-400" },
  waiting_material: { label: "ממתין לחומר",   color: "bg-orange-500/20 text-orange-400" },
  waiting_station:  { label: "ממתין לעמדה",   color: "bg-amber-500/20 text-amber-400" },
  completed:        { label: "הושלם",         color: "bg-green-500/20 text-green-400" },
  on_hold:          { label: "מושהה",         color: "bg-purple-500/20 text-purple-400" },
  cancelled:        { label: "מבוטל",         color: "bg-red-500/20 text-red-400" },
};

const operationColor: Record<Operation, string> = {
  "חיתוך": "bg-blue-500/20 text-blue-400",
  "ריתוך": "bg-orange-500/20 text-orange-400",
  "שיוף":  "bg-indigo-500/20 text-indigo-400",
  "צביעה": "bg-pink-500/20 text-pink-400",
  "הרכבה": "bg-teal-500/20 text-teal-400",
  "אריזה": "bg-cyan-500/20 text-cyan-400",
};

/* ── Fallback data — 14 work orders across all operations ── */
const FALLBACK_WORK_ORDERS: WorkOrder[] = [
  { id: "WO-4501", productionOrder: "PO-1001", product: "שער חשמלי אלומיניום 4.5 מ'", operation: "חיתוך", station: "מסור CNC-1", operator: "רועי כהן", qty: 24, progress: 88, startTime: "07:15", estimatedEnd: "10:30", actualEnd: null, status: "in_progress" },
  { id: "WO-4502", productionOrder: "PO-1001", product: "שער חשמלי אלומיניום 4.5 מ'", operation: "ריתוך", station: "ריתוך TIG-2", operator: "יוסי מזרחי", qty: 12, progress: 45, startTime: "08:00", estimatedEnd: "12:00", actualEnd: null, status: "in_progress" },
  { id: "WO-4503", productionOrder: "PO-1002", product: "חלונות ויטרינה נירוסטה", operation: "חיתוך", station: "לייזר-1", operator: "אמיר לוי", qty: 48, progress: 100, startTime: "06:30", estimatedEnd: "09:00", actualEnd: "08:45", status: "completed" },
  { id: "WO-4504", productionOrder: "PO-1002", product: "חלונות ויטרינה נירוסטה", operation: "ריתוך", station: "ריתוך MIG-1", operator: "דני אברהם", qty: 48, progress: 0, startTime: "—", estimatedEnd: "—", actualEnd: null, status: "waiting_material" },
  { id: "WO-4505", productionOrder: "PO-1003", product: "מעקה זכוכית מחוסמת 18 מ'", operation: "שיוף", station: "שיוף-2", operator: "מוחמד חסן", qty: 36, progress: 72, startTime: "07:45", estimatedEnd: "11:15", actualEnd: null, status: "in_progress" },
  { id: "WO-4506", productionOrder: "PO-1005", product: "שער כניסה דקורטיבי ברזל", operation: "צביעה", station: "תא ריסוס-1", operator: "עלי נאסר", qty: 8, progress: 60, startTime: "08:30", estimatedEnd: "13:00", actualEnd: null, status: "in_progress" },
  { id: "WO-4507", productionOrder: "PO-1006", product: "מערכת חלונות אלומיניום תרמי", operation: "הרכבה", station: "הרכבה-3", operator: "אלי ביטון", qty: 24, progress: 100, startTime: "06:00", estimatedEnd: "10:30", actualEnd: "10:15", status: "completed" },
  { id: "WO-4508", productionOrder: "PO-1006", product: "מערכת חלונות אלומיניום תרמי", operation: "אריזה", station: "אריזה-1", operator: "שלומי דהן", qty: 24, progress: 35, startTime: "10:30", estimatedEnd: "13:30", actualEnd: null, status: "in_progress" },
  { id: "WO-4509", productionOrder: "PO-1007", product: "מעקה מדרגות פנים נירוסטה", operation: "חיתוך", station: "מסור CNC-2", operator: "רועי כהן", qty: 16, progress: 0, startTime: "—", estimatedEnd: "—", actualEnd: null, status: "waiting_station" },
  { id: "WO-4510", productionOrder: "PO-1009", product: "דלת כניסה ביטחונית פלדה", operation: "ריתוך", station: "ריתוך TIG-1", operator: "יוסי מזרחי", qty: 6, progress: 100, startTime: "06:00", estimatedEnd: "09:30", actualEnd: "09:20", status: "completed" },
  { id: "WO-4511", productionOrder: "PO-1009", product: "דלת כניסה ביטחונית פלדה", operation: "צביעה", station: "תא ריסוס-2", operator: "עלי נאסר", qty: 6, progress: 25, startTime: "10:00", estimatedEnd: "14:00", actualEnd: null, status: "in_progress" },
  { id: "WO-4512", productionOrder: "PO-1010", product: "מחיצות זכוכית למשרדים", operation: "חיתוך", station: "לייזר-1", operator: "אמיר לוי", qty: 32, progress: 0, startTime: "—", estimatedEnd: "—", actualEnd: null, status: "waiting_station" },
  { id: "WO-4513", productionOrder: "PO-1003", product: "מעקה זכוכית מחוסמת 18 מ'", operation: "הרכבה", station: "הרכבה-1", operator: "אלי ביטון", qty: 18, progress: 0, startTime: "—", estimatedEnd: "—", actualEnd: null, status: "waiting_material" },
  { id: "WO-4514", productionOrder: "PO-1004", product: "גדר פלדה מגולוונת 30 מ'", operation: "אריזה", station: "אריזה-2", operator: "שלומי דהן", qty: 10, progress: 100, startTime: "07:00", estimatedEnd: "08:30", actualEnd: "08:20", status: "completed" },
  { id: "WO-4515", productionOrder: "PO-1008", product: "פרגולת אלומיניום חשמלית", operation: "חיתוך", station: "מסור CNC-1", operator: "אמיר לוי", qty: 42, progress: 15, startTime: "09:30", estimatedEnd: "14:00", actualEnd: null, status: "in_progress" },
];

/* ── Tab filter types ── */
type TabKey = "all" | "in_progress" | "waiting" | "completed";

/* ═══════════════════ Component ═══════════════════ */
export default function WorkOrdersList() {
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");

  const { data: apiData } = useQuery({
    queryKey: ["production-work-orders-list"],
    queryFn: () => authFetch("/api/production/work-orders").then(r => r.json()),
  });
  const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
  const workOrders: WorkOrder[] = safeArr(apiData).length > 0 ? safeArr(apiData) : FALLBACK_WORK_ORDERS;

  /* ── Filtering ── */
  const filtered = useMemo(() => {
    let list = [...workOrders];

    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (w) =>
          w.id.toLowerCase().includes(s) ||
          w.productionOrder.toLowerCase().includes(s) ||
          w.product.toLowerCase().includes(s) ||
          w.operation.includes(s) ||
          w.station.toLowerCase().includes(s) ||
          w.operator.includes(s)
      );
    }

    if (tab === "in_progress")
      list = list.filter((w) => w.status === "in_progress");
    else if (tab === "waiting")
      list = list.filter((w) => ["waiting_material", "waiting_station", "on_hold"].includes(w.status));
    else if (tab === "completed")
      list = list.filter((w) => w.status === "completed");

    return list;
  }, [tab, search]);

  /* ── KPI calculations ── */
  const totalWOs = workOrders.length;
  const activeCount = workOrders.filter((w) => w.status === "in_progress").length;
  const completedTodayCount = workOrders.filter((w) => w.status === "completed").length;
  const waitingMaterialCount = workOrders.filter((w) => w.status === "waiting_material").length;
  const waitingStationCount = workOrders.filter((w) => w.status === "waiting_station").length;

  const completedOrders = workOrders.filter((w) => w.status === "completed" && w.actualEnd);
  const avgMinutes = completedOrders.length > 0
    ? Math.round(
        completedOrders.reduce((acc, w) => {
          const [sh, sm] = w.startTime.split(":").map(Number);
          const [eh, em] = (w.actualEnd ?? "00:00").split(":").map(Number);
          return acc + (eh * 60 + em) - (sh * 60 + sm);
        }, 0) / completedOrders.length
      )
    : 0;
  const avgHours = Math.floor(avgMinutes / 60);
  const avgMins = avgMinutes % 60;
  const avgCompletionTime = `${avgHours}:${String(avgMins).padStart(2, "0")} שעות`;

  const kpis = [
    { label: "סה\"כ הוראות", value: totalWOs, icon: FileText, color: "text-blue-400" },
    { label: "פעילות", value: activeCount, icon: Activity, color: "text-yellow-400" },
    { label: "הושלמו היום", value: completedTodayCount, icon: CheckCircle2, color: "text-green-400" },
    { label: "ממתין לחומר", value: waitingMaterialCount, icon: Package, color: "text-orange-400" },
    { label: "ממתין לעמדה", value: waitingStationCount, icon: PauseCircle, color: "text-amber-400" },
    { label: "ממוצע השלמה", value: avgCompletionTime, icon: Timer, color: "text-emerald-400" },
  ];

  /* ── Render ── */
  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10">
            <FileText className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">הוראות עבודה</h1>
            <p className="text-sm text-muted-foreground">ניהול ומעקב הוראות עבודה - טכנו-כל עוזי</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="bg-muted/50 border border-border rounded-lg pr-9 pl-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-64"
            placeholder="חיפוש הוראה, מוצר, מפעיל..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
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

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="all">כל ההוראות</TabsTrigger>
          <TabsTrigger value="in_progress">בביצוע</TabsTrigger>
          <TabsTrigger value="waiting">ממתינות</TabsTrigger>
          <TabsTrigger value="completed">הושלמו</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Work Orders Table */}
      <Card className="bg-card border-border overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-right text-muted-foreground">מס' הוראה</TableHead>
                  <TableHead className="text-right text-muted-foreground">הזמנת ייצור</TableHead>
                  <TableHead className="text-right text-muted-foreground">מוצר</TableHead>
                  <TableHead className="text-center text-muted-foreground">פעולה</TableHead>
                  <TableHead className="text-right text-muted-foreground">עמדה</TableHead>
                  <TableHead className="text-right text-muted-foreground">מפעיל</TableHead>
                  <TableHead className="text-center text-muted-foreground">כמות</TableHead>
                  <TableHead className="text-center text-muted-foreground w-32">התקדמות</TableHead>
                  <TableHead className="text-center text-muted-foreground">שעת התחלה</TableHead>
                  <TableHead className="text-center text-muted-foreground">סיום משוער</TableHead>
                  <TableHead className="text-center text-muted-foreground">סיום בפועל</TableHead>
                  <TableHead className="text-center text-muted-foreground">סטטוס</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-12 text-muted-foreground">
                      לא נמצאו הוראות עבודה מתאימות
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((w) => {
                    const st = statusMap[w.status];
                    const opColor = operationColor[w.operation];
                    return (
                      <TableRow
                        key={w.id}
                        className="border-border hover:bg-muted/30 transition-colors"
                      >
                        <TableCell className="font-mono font-semibold text-foreground">
                          {w.id}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground text-sm">
                          {w.productionOrder}
                        </TableCell>
                        <TableCell className="text-foreground max-w-[180px] truncate text-sm">
                          {w.product}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`${opColor} border-0 text-xs`}>
                            {w.operation}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {w.station}
                        </TableCell>
                        <TableCell className="text-sm text-foreground">
                          {w.operator}
                        </TableCell>
                        <TableCell className="text-center text-foreground">
                          {w.qty}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={w.progress}
                              className="h-2 flex-1 bg-muted/40"
                            />
                            <span className="text-xs text-muted-foreground w-8 text-left">
                              {w.progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground text-sm font-mono">
                          {w.startTime}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground text-sm font-mono">
                          {w.estimatedEnd}
                        </TableCell>
                        <TableCell className="text-center text-sm font-mono">
                          {w.actualEnd ? (
                            <span className="text-green-400">{w.actualEnd}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`${st.color} border-0 text-xs`}>
                            {st.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Operation breakdown */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {(["חיתוך", "ריתוך", "שיוף", "צביעה", "הרכבה", "אריזה"] as Operation[]).map((op) => {
          const opOrders = workOrders.filter((w) => w.operation === op);
          const opActive = opOrders.filter((w) => w.status === "in_progress").length;
          const opDone = opOrders.filter((w) => w.status === "completed").length;
          return (
            <div
              key={op}
              className="flex items-center gap-2 bg-muted/20 border border-border rounded-lg px-3 py-2"
            >
              <Badge variant="outline" className={`${operationColor[op]} border-0 text-xs`}>
                {op}
              </Badge>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>{opOrders.length} הוראות</span>
                <span className="text-yellow-400">{opActive} פעילות</span>
                <span className="text-green-400">{opDone} הושלמו</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary footer */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Layers className="w-3.5 h-3.5" />
        <span>מציג {filtered.length} מתוך {totalWOs} הוראות עבודה</span>
        <span>|</span>
        <span>{activeCount} בביצוע</span>
        <span>|</span>
        <span>{waitingMaterialCount + waitingStationCount} ממתינות</span>
        <span>|</span>
        <span>{completedTodayCount} הושלמו היום</span>
      </div>
    </div>
  );
}
