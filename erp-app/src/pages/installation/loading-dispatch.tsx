import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Truck, Package, MapPin, Clock, CheckCircle, XCircle,
  ClipboardCheck, AlertTriangle, Navigation, Weight, Calendar,
  ShieldCheck
} from "lucide-react";

/* ── Static mock data ─────────────────────────────────────────── */

const FALLBACK_SHIPMENTS = [
  { id: "SHP-301", insId: "INS-001", project: "מגדלי הים — חיפה", vehicle: "832-45-971", driver: "מוטי אזולאי", items: "חלונות x8, דלתות x2", weightKg: 1450, loadTime: "06:00", status: "יצא", completeness: true },
  { id: "SHP-302", insId: "INS-002", project: "פארק המדע — רחובות", vehicle: "541-27-683", driver: "אבי כהן", items: "ויטרינות x4, מסגרות x4", weightKg: 2100, loadTime: "06:30", status: "נטען", completeness: true },
  { id: "SHP-303", insId: "INS-005", project: "קניון הדרום — באר שבע", vehicle: "278-93-415", driver: "סאמר חלבי", items: "פרגולות x3, עמודים x12", weightKg: 1820, loadTime: "07:00", status: "בהעמסה", completeness: false },
  { id: "SHP-304", insId: "INS-004", project: "מלון ים התיכון — ת״א", vehicle: "659-18-302", driver: "יוסי ברק", items: "מעקות זכוכית x16, חיבורים x32", weightKg: 980, loadTime: "07:30", status: "ממתין", completeness: true },
  { id: "SHP-305", insId: "INS-006", project: "משרדי הייטק — הרצליה פיתוח", vehicle: "832-45-971", driver: "מוטי אזולאי", items: "מחיצות זכוכית x10, פסי אלומיניום x20", weightKg: 1650, loadTime: "08:00", status: "ממתין", completeness: true },
  { id: "SHP-306", insId: "INS-007", project: "בניין מגורים — נתניה", vehicle: "541-27-683", driver: "אבי כהן", items: "חלונות Comfort x14", weightKg: 1100, loadTime: "09:00", status: "ממתין", completeness: false },
  { id: "SHP-307", insId: "INS-003", project: "בית חכם — הרצליה", vehicle: "278-93-415", driver: "סאמר חלבי", items: "דלתות הזזה x4, מנוע חשמלי x4", weightKg: 760, loadTime: "06:15", status: "נמסר", completeness: true },
  { id: "SHP-308", insId: "INS-008", project: "מרכז ספורט — ראשל״צ", vehicle: "659-18-302", driver: "יוסי ברק", items: "דלתות אש x6, מסגרות x6", weightKg: 1340, loadTime: "06:45", status: "יצא", completeness: true },
];

const FALLBACK_VEHICLES = [
  { plate: "832-45-971", type: "משאית 12T", driver: "מוטי אזולאי", available: "בדרך", location: "כביש 2 — צפון חדרה", nextAvailable: "09:30" },
  { plate: "541-27-683", type: "משאית 12T", driver: "אבי כהן", available: "בהעמסה", location: "מחסן ראשי — חולון", nextAvailable: "07:15" },
  { plate: "278-93-415", type: "טנדר 3.5T", driver: "סאמר חלבי", available: "בהעמסה", location: "מחסן ראשי — חולון", nextAvailable: "07:30" },
  { plate: "659-18-302", type: "משאית מנוף 8T", driver: "יוסי ברק", available: "זמין", location: "מחסן ראשי — חולון", nextAvailable: "07:30" },
];

const FALLBACK_MATERIAL_CHECKLIST = [
  { shipId: "SHP-303", item: "פרגולה אלומיניום 4x3", planned: 3, loaded: 2, missing: 1, qc: false },
  { shipId: "SHP-303", item: "עמוד תמיכה 3m", planned: 12, loaded: 12, missing: 0, qc: true },
  { shipId: "SHP-303", item: "ברגי חיבור M12", planned: 48, loaded: 48, missing: 0, qc: true },
  { shipId: "SHP-303", item: "פח גמר עליון", planned: 3, loaded: 1, missing: 2, qc: false },
  { shipId: "SHP-306", item: "חלון Comfort 120x150", planned: 8, loaded: 0, missing: 8, qc: false },
  { shipId: "SHP-306", item: "חלון Comfort 80x120", planned: 6, loaded: 0, missing: 6, qc: false },
  { shipId: "SHP-306", item: "אטם סיליקון", planned: 14, loaded: 14, missing: 0, qc: true },
  { shipId: "SHP-306", item: "בורג קיבוע 8mm", planned: 56, loaded: 56, missing: 0, qc: true },
  { shipId: "SHP-304", item: "מעקה זכוכית 1.2m", planned: 16, loaded: 16, missing: 0, qc: true },
  { shipId: "SHP-304", item: "חיבור נירוסטה U", planned: 32, loaded: 32, missing: 0, qc: true },
  { shipId: "SHP-304", item: "סיליקון שקוף UV", planned: 8, loaded: 8, missing: 0, qc: true },
];

const FALLBACK_DISPATCH_TIMELINE = [
  { time: "05:45", event: "פתיחת מחסן — בדיקת מלאי בוקר", status: "הושלם", shipId: "—" },
  { time: "06:00", event: "תחילת העמסה — SHP-301 (מגדלי הים — חיפה)", status: "הושלם", shipId: "SHP-301" },
  { time: "06:15", event: "תחילת העמסה — SHP-307 (בית חכם — הרצליה)", status: "הושלם", shipId: "SHP-307" },
  { time: "06:30", event: "תחילת העמסה — SHP-302 (פארק המדע — רחובות)", status: "הושלם", shipId: "SHP-302" },
  { time: "06:45", event: "תחילת העמסה — SHP-308 (מרכז ספורט — ראשל״צ)", status: "הושלם", shipId: "SHP-308" },
  { time: "07:00", event: "שיגור SHP-301 → חיפה | יעד הגעה 09:00", status: "בדרך", shipId: "SHP-301" },
  { time: "07:00", event: "תחילת העמסה — SHP-303 (קניון הדרום — ב״ש)", status: "בביצוע", shipId: "SHP-303" },
  { time: "07:10", event: "שיגור SHP-307 → הרצליה | יעד הגעה 07:40", status: "נמסר", shipId: "SHP-307" },
  { time: "07:15", event: "שיגור SHP-308 → ראשל״צ | יעד הגעה 07:45", status: "בדרך", shipId: "SHP-308" },
  { time: "07:30", event: "סיום העמסה SHP-302 → שיגור לרחובות | יעד 08:30", status: "מתוכנן", shipId: "SHP-302" },
  { time: "08:00", event: "העמסת SHP-304 (מלון ים התיכון — ת״א)", status: "מתוכנן", shipId: "SHP-304" },
  { time: "08:00", event: "העמסת SHP-305 (משרדי הייטק — הרצליה פיתוח)", status: "מתוכנן", shipId: "SHP-305" },
  { time: "09:00", event: "הגעה משוערת SHP-301 — חיפה", status: "מתוכנן", shipId: "SHP-301" },
  { time: "09:00", event: "העמסת SHP-306 (בניין מגורים — נתניה) — חומרים חסרים!", status: "חסום", shipId: "SHP-306" },
  { time: "10:00", event: "שיגור SHP-305 → הרצליה פיתוח | יעד 10:30", status: "מתוכנן", shipId: "SHP-305" },
  { time: "10:30", event: "שיגור SHP-306 → נתניה (בכפוף להשלמת חומרים)", status: "מתוכנן", shipId: "SHP-306" },
];

/* ── Helpers ───────────────────────────────────────────────────── */

const shipStatusColor: Record<string, string> = {
  "ממתין": "bg-gray-500/20 text-gray-300",
  "בהעמסה": "bg-amber-500/20 text-amber-300",
  "נטען": "bg-blue-500/20 text-blue-300",
  "יצא": "bg-sky-500/20 text-sky-300",
  "נמסר": "bg-emerald-500/20 text-emerald-300",
};

const vehicleAvailColor: Record<string, string> = {
  "זמין": "bg-emerald-500/20 text-emerald-300",
  "בהעמסה": "bg-amber-500/20 text-amber-300",
  "בדרך": "bg-sky-500/20 text-sky-300",
};

const timelineStatusColor: Record<string, string> = {
  "הושלם": "bg-emerald-500/20 text-emerald-300",
  "בביצוע": "bg-amber-500/20 text-amber-300",
  "בדרך": "bg-sky-500/20 text-sky-300",
  "מתוכנן": "bg-blue-500/20 text-blue-300",
  "נמסר": "bg-emerald-500/20 text-emerald-300",
  "חסום": "bg-red-500/20 text-red-300",
};

const Check = ({ ok }: { ok: boolean }) =>
  ok ? <CheckCircle className="h-4 w-4 text-emerald-400 mx-auto" /> : <XCircle className="h-4 w-4 text-red-400 mx-auto" />;

/* ── KPI cards ────────────────────────────────────────────────── */

const FALLBACK_KPI_DATA = [
  { label: "משלוחים היום", value: 5, icon: Truck, color: "text-sky-400", bg: "bg-sky-500/10" },
  { label: "נטענים כרגע", value: 2, icon: Package, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "בדרך", value: 2, icon: Navigation, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "נמסרו", value: 1, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "ממתינים להעמסה", value: 3, icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "חומרים חסרים", value: 1, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
];

/* ── Component ────────────────────────────────────────────────── */

export default function LoadingDispatch() {
  const { data: shipments = FALLBACK_SHIPMENTS } = useQuery({
    queryKey: ["installation-shipments"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/loading-dispatch/shipments");
      if (!res.ok) return FALLBACK_SHIPMENTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SHIPMENTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: vehicles = FALLBACK_VEHICLES } = useQuery({
    queryKey: ["installation-vehicles"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/loading-dispatch/vehicles");
      if (!res.ok) return FALLBACK_VEHICLES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_VEHICLES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: materialChecklist = FALLBACK_MATERIAL_CHECKLIST } = useQuery({
    queryKey: ["installation-material-checklist"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/loading-dispatch/material-checklist");
      if (!res.ok) return FALLBACK_MATERIAL_CHECKLIST;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MATERIAL_CHECKLIST;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: dispatchTimeline = FALLBACK_DISPATCH_TIMELINE } = useQuery({
    queryKey: ["installation-dispatch-timeline"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/loading-dispatch/dispatch-timeline");
      if (!res.ok) return FALLBACK_DISPATCH_TIMELINE;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DISPATCH_TIMELINE;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: kpiData = FALLBACK_KPI_DATA } = useQuery({
    queryKey: ["installation-kpi-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/loading-dispatch/kpi-data");
      if (!res.ok) return FALLBACK_KPI_DATA;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_KPI_DATA;
    },
    staleTime: 30_000,
    retry: 1,
  });


  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Truck className="h-7 w-7 text-primary" /> העמסה ושיגור
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — תור העמסה | צי רכבים | אימות חומרים | ציר זמן שיגור
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-6 gap-3">
        {kpiData.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border-0 shadow-sm`}>
              <CardContent className="pt-3 pb-2 text-center px-2">
                <Icon className={`h-5 w-5 mx-auto ${kpi.color} mb-1`} />
                <p className="text-[10px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-2xl font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="queue">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="queue" className="text-xs gap-1"><Package className="h-3.5 w-3.5" /> תור העמסה</TabsTrigger>
          <TabsTrigger value="fleet" className="text-xs gap-1"><Truck className="h-3.5 w-3.5" /> צי רכבים</TabsTrigger>
          <TabsTrigger value="materials" className="text-xs gap-1"><ClipboardCheck className="h-3.5 w-3.5" /> אימות חומרים</TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs gap-1"><Calendar className="h-3.5 w-3.5" /> ציר זמן</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Loading Queue ────────────────────────────── */}
        <TabsContent value="queue">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מס׳ משלוח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">התקנה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">רכב</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">נהג</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פריטים</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">משקל</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">העמסה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">שלמות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shipments.map((s) => (
                    <TableRow key={s.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{s.id}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{s.insId}</TableCell>
                      <TableCell>{s.project}</TableCell>
                      <TableCell className="font-mono">{s.vehicle}</TableCell>
                      <TableCell>{s.driver}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[180px] truncate">{s.items}</TableCell>
                      <TableCell className="font-mono">
                        <span className="flex items-center gap-1"><Weight className="h-3 w-3" />{s.weightKg.toLocaleString()} kg</span>
                      </TableCell>
                      <TableCell className="font-mono">{s.loadTime}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${shipStatusColor[s.status] || "bg-gray-500/20 text-gray-300"}`}>{s.status}</Badge>
                      </TableCell>
                      <TableCell><Check ok={s.completeness} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Vehicle Fleet ────────────────────────────── */}
        <TabsContent value="fleet">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="h-4 w-4 text-sky-400" /> צי רכבים — זמינות ומיקום
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מספר רישוי</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג רכב</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">נהג</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">זמינות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מיקום נוכחי</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פנוי ב-</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vehicles.map((v) => (
                    <TableRow key={v.plate} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{v.plate}</TableCell>
                      <TableCell>{v.type}</TableCell>
                      <TableCell>{v.driver}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${vehicleAvailColor[v.available] || "bg-gray-500/20 text-gray-300"}`}>{v.available}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{v.location}</span>
                      </TableCell>
                      <TableCell className="font-mono">{v.nextAvailable}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Material Verification ────────────────────── */}
        <TabsContent value="materials">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-amber-400" /> אימות חומרים לפי משלוח
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">משלוח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פריט</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">כמות מתוכננת</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">כמות נטענה</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">חסר</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">אישור QC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materialChecklist.map((m, i) => (
                    <TableRow key={i} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{m.shipId}</TableCell>
                      <TableCell>{m.item}</TableCell>
                      <TableCell className="text-center font-mono">{m.planned}</TableCell>
                      <TableCell className="text-center font-mono">{m.loaded}</TableCell>
                      <TableCell className="text-center">
                        {m.missing > 0 ? (
                          <Badge className="text-[9px] bg-red-500/20 text-red-300">{m.missing}</Badge>
                        ) : (
                          <span className="text-emerald-400 font-mono">0</span>
                        )}
                      </TableCell>
                      <TableCell><Check ok={m.qc} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Summary cards below the table */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <Card className="bg-red-500/10 border-0">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <span className="text-xs font-semibold text-red-300">SHP-303 — קניון הדרום</span>
                </div>
                <p className="text-[11px] text-muted-foreground">חסרים: פרגולה x1, פח גמר x2</p>
                <p className="text-[11px] text-muted-foreground mt-1">סטטוס: ממתין לאספקה ממחסן משני — צפי 08:30</p>
                <Progress value={75} className="h-1.5 mt-2" />
              </CardContent>
            </Card>
            <Card className="bg-red-500/10 border-0">
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  <span className="text-xs font-semibold text-red-300">SHP-306 — בניין מגורים נתניה</span>
                </div>
                <p className="text-[11px] text-muted-foreground">חסרים: חלון 120x150 x8, חלון 80x120 x6</p>
                <p className="text-[11px] text-muted-foreground mt-1">סטטוס: ייצור נמשך — צפי גמר 10:00</p>
                <Progress value={30} className="h-1.5 mt-2" />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 4: Dispatch Timeline ────────────────────────── */}
        <TabsContent value="timeline">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-400" /> ציר זמן שיגור — היום 08/04/2026
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold w-16">שעה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אירוע</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold w-20">משלוח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold w-20">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dispatchTimeline.map((t, i) => (
                    <TableRow key={i} className={`text-xs ${t.status === "חסום" ? "bg-red-500/5" : ""}`}>
                      <TableCell className="font-mono font-semibold">{t.time}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1">
                          {t.status === "חסום" && <AlertTriangle className="h-3 w-3 text-red-400" />}
                          {t.status === "בדרך" && <Navigation className="h-3 w-3 text-sky-400" />}
                          {t.status === "נמסר" && <ShieldCheck className="h-3 w-3 text-emerald-400" />}
                          {t.event}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">{t.shipId}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${timelineStatusColor[t.status] || "bg-gray-500/20 text-gray-300"}`}>{t.status}</Badge>
                      </TableCell>
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
