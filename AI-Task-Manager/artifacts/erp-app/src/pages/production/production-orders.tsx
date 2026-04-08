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
  ClipboardList, Package, Clock, AlertTriangle, CheckCircle2,
  TrendingUp, Search, Factory,
} from "lucide-react";

type Status =
  | "draft" | "planned" | "released" | "in_progress"
  | "waiting_material" | "waiting_station" | "quality_hold"
  | "rework" | "completed" | "packed" | "ready_for_installation"
  | "closed" | "cancelled";

type Priority = "urgent" | "high" | "normal" | "low";

interface ProductionOrder {
  id: string;
  product: string;
  project: string;
  customer: string;
  qty: number;
  priority: Priority;
  startDate: string;
  dueDate: string;
  progress: number;
  status: Status;
  station: string;
}

const statusMap: Record<Status, { label: string; color: string }> = {
  draft:                  { label: "טיוטה",             color: "bg-slate-500/20 text-slate-400" },
  planned:                { label: "מתוכנן",            color: "bg-blue-500/20 text-blue-400" },
  released:               { label: "שוחרר לייצור",      color: "bg-indigo-500/20 text-indigo-400" },
  in_progress:            { label: "בביצוע",            color: "bg-yellow-500/20 text-yellow-400" },
  waiting_material:       { label: "ממתין לחומר",       color: "bg-orange-500/20 text-orange-400" },
  waiting_station:        { label: "ממתין לעמדה",       color: "bg-amber-500/20 text-amber-400" },
  quality_hold:           { label: "עצירת איכות",       color: "bg-purple-500/20 text-purple-400" },
  rework:                 { label: "עיבוד חוזר",        color: "bg-pink-500/20 text-pink-400" },
  completed:              { label: "הושלם",             color: "bg-green-500/20 text-green-400" },
  packed:                 { label: "ארוז",              color: "bg-teal-500/20 text-teal-400" },
  ready_for_installation: { label: "מוכן להתקנה",      color: "bg-cyan-500/20 text-cyan-400" },
  closed:                 { label: "סגור",              color: "bg-gray-500/20 text-gray-500" },
  cancelled:              { label: "מבוטל",             color: "bg-red-500/20 text-red-400" },
};

const priorityMap: Record<Priority, { label: string; color: string }> = {
  urgent: { label: "דחוף",   color: "bg-red-500/20 text-red-400" },
  high:   { label: "גבוה",   color: "bg-orange-500/20 text-orange-400" },
  normal: { label: "רגיל",   color: "bg-blue-500/20 text-blue-400" },
  low:    { label: "נמוך",   color: "bg-muted/20 text-muted-foreground" },
};

const FALLBACK_ORDERS: ProductionOrder[] = [
  {
    id: "PO-1001", product: "שער חשמלי אלומיניום 4.5 מ'", project: "PRJ-220",
    customer: "אברהם נכסים בע\"מ", qty: 2, priority: "urgent",
    startDate: "2026-03-25", dueDate: "2026-04-10", progress: 78,
    status: "in_progress", station: "קו חיתוך אלומיניום",
  },
  {
    id: "PO-1002", product: "חלונות ויטרינה נירוסטה", project: "PRJ-218",
    customer: "רשת שופרסל", qty: 12, priority: "high",
    startDate: "2026-03-20", dueDate: "2026-04-12", progress: 55,
    status: "waiting_material", station: "קו נירוסטה",
  },
  {
    id: "PO-1003", product: "מעקה זכוכית מחוסמת 18 מ'", project: "PRJ-225",
    customer: "גולדן טאוורס", qty: 1, priority: "high",
    startDate: "2026-04-01", dueDate: "2026-04-15", progress: 40,
    status: "quality_hold", station: "קו זכוכית",
  },
  {
    id: "PO-1004", product: "גדר פלדה מגולוונת 30 מ'", project: "PRJ-210",
    customer: "מועצת גליל עליון", qty: 1, priority: "normal",
    startDate: "2026-03-15", dueDate: "2026-04-05", progress: 100,
    status: "completed", station: "קו ריתוך פלדה",
  },
  {
    id: "PO-1005", product: "שער כניסה דקורטיבי ברזל", project: "PRJ-228",
    customer: "דנה ויצמן - פרטי", qty: 1, priority: "normal",
    startDate: "2026-04-02", dueDate: "2026-04-20", progress: 20,
    status: "released", station: "קו עיצוב מתכת",
  },
  {
    id: "PO-1006", product: "מערכת חלונות אלומיניום תרמי", project: "PRJ-215",
    customer: "קבוצת ענבל בנייה", qty: 24, priority: "urgent",
    startDate: "2026-03-10", dueDate: "2026-04-08", progress: 92,
    status: "packed", station: "קו הרכבה סופי",
  },
  {
    id: "PO-1007", product: "מעקה מדרגות פנים נירוסטה", project: "PRJ-230",
    customer: "מלון רויאל ת\"א", qty: 4, priority: "high",
    startDate: "2026-04-05", dueDate: "2026-04-22", progress: 10,
    status: "in_progress", station: "קו נירוסטה",
  },
  {
    id: "PO-1008", product: "פרגולת אלומיניום חשמלית", project: "PRJ-222",
    customer: "עיריית חיפה - גנים", qty: 3, priority: "low",
    startDate: "2026-04-07", dueDate: "2026-05-01", progress: 0,
    status: "planned", station: "קו חיתוך אלומיניום",
  },
  {
    id: "PO-1009", product: "דלת כניסה ביטחונית פלדה", project: "PRJ-212",
    customer: "בנק לאומי סניף ראשי", qty: 2, priority: "urgent",
    startDate: "2026-03-28", dueDate: "2026-04-09", progress: 85,
    status: "rework", station: "קו ריתוך פלדה",
  },
  {
    id: "PO-1010", product: "מחיצות זכוכית למשרדים", project: "PRJ-232",
    customer: "הייטק סולושנס בע\"מ", qty: 8, priority: "normal",
    startDate: "2026-04-03", dueDate: "2026-04-25", progress: 5,
    status: "waiting_station", station: "קו זכוכית",
  },
  {
    id: "PO-1011", product: "שער הזזה תעשייתי 6 מ'", project: "PRJ-205",
    customer: "מפעלי ים המלח", qty: 1, priority: "normal",
    startDate: "2026-02-20", dueDate: "2026-03-30", progress: 100,
    status: "ready_for_installation", station: "קו הרכבה סופי",
  },
  {
    id: "PO-1012", product: "גדר קלועה עם עמודים 50 מ'", project: "PRJ-200",
    customer: "קיבוץ דגניה", qty: 1, priority: "low",
    startDate: "2026-01-15", dueDate: "2026-02-28", progress: 100,
    status: "closed", station: "קו ריתוך פלדה",
  },
];

const today = "2026-04-08";

function isDelayed(o: ProductionOrder): boolean {
  if (["completed", "packed", "ready_for_installation", "closed", "cancelled"].includes(o.status)) return false;
  return o.dueDate < today;
}

type TabKey = "all" | "active" | "waiting" | "done";

export default function ProductionOrders() {
  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");

  const { data: apiData } = useQuery({
    queryKey: ["production-orders"],
    queryFn: () => authFetch("/api/production/work-orders").then(r => r.json()),
  });
  const safeArr = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
  const orders: ProductionOrder[] = safeArr(apiData).length > 0 ? safeArr(apiData) : FALLBACK_ORDERS;

  const filtered = useMemo(() => {
    let list = [...orders];

    if (search) {
      const s = search.toLowerCase();
      list = list.filter(
        (o) =>
          o.id.toLowerCase().includes(s) ||
          o.product.toLowerCase().includes(s) ||
          o.customer.toLowerCase().includes(s) ||
          o.project.toLowerCase().includes(s) ||
          o.station.toLowerCase().includes(s)
      );
    }

    if (tab === "active")
      list = list.filter((o) =>
        ["released", "in_progress", "rework"].includes(o.status)
      );
    else if (tab === "waiting")
      list = list.filter((o) =>
        ["waiting_material", "waiting_station", "quality_hold"].includes(o.status)
      );
    else if (tab === "done")
      list = list.filter((o) =>
        ["completed", "packed", "ready_for_installation", "closed"].includes(o.status)
      );

    return list;
  }, [tab, search]);

  const totalOrders = orders.length;
  const inProgressCount = orders.filter((o) => o.status === "in_progress").length;
  const waitingMaterialCount = orders.filter((o) => o.status === "waiting_material").length;
  const completedTodayCount = orders.filter(
    (o) => o.status === "completed" && o.progress === 100
  ).length;
  const delayedCount = orders.filter(isDelayed).length;
  const activeNonDelayed = orders.filter(
    (o) =>
      !["completed", "packed", "ready_for_installation", "closed", "cancelled"].includes(o.status) &&
      !isDelayed(o)
  ).length;
  const totalActive = activeNonDelayed + delayedCount;
  const onTimeRate = totalActive > 0 ? Math.round((activeNonDelayed / totalActive) * 100) : 100;

  const kpis = [
    { label: "סה\"כ הזמנות", value: totalOrders, icon: ClipboardList, color: "text-blue-400" },
    { label: "בביצוע", value: inProgressCount, icon: Factory, color: "text-yellow-400" },
    { label: "ממתינות לחומר", value: waitingMaterialCount, icon: Package, color: "text-orange-400" },
    { label: "הושלמו היום", value: completedTodayCount, icon: CheckCircle2, color: "text-green-400" },
    { label: "באיחור", value: delayedCount, icon: AlertTriangle, color: "text-red-400" },
    { label: "אחוז בזמן", value: `${onTimeRate}%`, icon: TrendingUp, color: "text-emerald-400" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-500/10">
            <ClipboardList className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">הזמנות ייצור</h1>
            <p className="text-sm text-muted-foreground">ניהול ומעקב הזמנות ייצור - טכנו-כל עוזי</p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            className="bg-muted/50 border border-border rounded-lg pr-9 pl-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-64"
            placeholder="חיפוש הזמנה, מוצר, לקוח..."
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
          <TabsTrigger value="all">כל ההזמנות</TabsTrigger>
          <TabsTrigger value="active">בביצוע</TabsTrigger>
          <TabsTrigger value="waiting">ממתינות</TabsTrigger>
          <TabsTrigger value="done">הושלמו</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Orders Table */}
      <Card className="bg-card border-border overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-right text-muted-foreground">מס' הזמנה</TableHead>
                  <TableHead className="text-right text-muted-foreground">מוצר</TableHead>
                  <TableHead className="text-right text-muted-foreground">פרויקט</TableHead>
                  <TableHead className="text-right text-muted-foreground">לקוח</TableHead>
                  <TableHead className="text-center text-muted-foreground">כמות</TableHead>
                  <TableHead className="text-center text-muted-foreground">עדיפות</TableHead>
                  <TableHead className="text-center text-muted-foreground">תאריך התחלה</TableHead>
                  <TableHead className="text-center text-muted-foreground">תאריך יעד</TableHead>
                  <TableHead className="text-center text-muted-foreground w-32">התקדמות</TableHead>
                  <TableHead className="text-center text-muted-foreground">סטטוס</TableHead>
                  <TableHead className="text-right text-muted-foreground">עמדת ייצור</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12 text-muted-foreground">
                      לא נמצאו הזמנות מתאימות
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((o) => {
                    const st = statusMap[o.status];
                    const pr = priorityMap[o.priority];
                    const delayed = isDelayed(o);
                    return (
                      <TableRow
                        key={o.id}
                        className={`border-border hover:bg-muted/30 transition-colors ${
                          delayed ? "bg-red-500/5" : ""
                        }`}
                      >
                        <TableCell className="font-mono font-semibold text-foreground">
                          {o.id}
                          {delayed && (
                            <AlertTriangle className="inline w-3.5 h-3.5 text-red-400 mr-1.5" />
                          )}
                        </TableCell>
                        <TableCell className="text-foreground max-w-[180px] truncate">
                          {o.product}
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground text-sm">
                          {o.project}
                        </TableCell>
                        <TableCell className="text-foreground text-sm">{o.customer}</TableCell>
                        <TableCell className="text-center text-foreground">{o.qty}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`${pr.color} border-0 text-xs`}>
                            {pr.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground text-sm">
                          {o.startDate}
                        </TableCell>
                        <TableCell
                          className={`text-center text-sm ${
                            delayed ? "text-red-400 font-semibold" : "text-muted-foreground"
                          }`}
                        >
                          {o.dueDate}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={o.progress}
                              className="h-2 flex-1 bg-muted/40"
                            />
                            <span className="text-xs text-muted-foreground w-8 text-left">
                              {o.progress}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className={`${st.color} border-0 text-xs`}>
                            {st.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {o.station}
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

      {/* Summary footer */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <Clock className="w-3.5 h-3.5" />
        <span>מציג {filtered.length} מתוך {totalOrders} הזמנות</span>
        <span>|</span>
        <span>{delayedCount > 0 ? `${delayedCount} הזמנות באיחור` : "כל ההזמנות בזמן"}</span>
      </div>
    </div>
  );
}
