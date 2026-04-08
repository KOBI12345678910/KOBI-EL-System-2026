import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ClipboardList, CalendarCheck, Truck, HardHat, CheckCircle2,
  AlertTriangle, RotateCcw, XCircle, Clock, Package,
  MapPin, Ruler, Weight, Users, ShieldCheck, Banknote,
} from "lucide-react";

/* ───────── currency formatter ───────── */
const fmt = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

/* ───────── 15 statuses ───────── */
type InstallationStatus =
  | "draft" | "waiting_site_readiness" | "ready_for_planning" | "scheduled"
  | "loading_preparation" | "dispatched" | "on_site" | "in_progress"
  | "partially_completed" | "quality_hold" | "awaiting_customer_signoff"
  | "completed" | "return_visit_required" | "closed" | "cancelled";

const STATUS_META: Record<InstallationStatus, { label: string; color: string }> = {
  draft:                    { label: "טיוטה",              color: "bg-gray-100 text-gray-700" },
  waiting_site_readiness:   { label: "ממתין למוכנות אתר",  color: "bg-yellow-100 text-yellow-800" },
  ready_for_planning:       { label: "מוכן לתכנון",        color: "bg-sky-100 text-sky-700" },
  scheduled:                { label: "מתוזמן",             color: "bg-blue-100 text-blue-700" },
  loading_preparation:      { label: "הכנת טעינה",         color: "bg-indigo-100 text-indigo-700" },
  dispatched:               { label: "נשלח לאתר",          color: "bg-violet-100 text-violet-700" },
  on_site:                  { label: "באתר",               color: "bg-purple-100 text-purple-700" },
  in_progress:              { label: "בביצוע",             color: "bg-orange-100 text-orange-700" },
  partially_completed:      { label: "הושלם חלקית",        color: "bg-amber-100 text-amber-800" },
  quality_hold:             { label: "עצירת איכות",        color: "bg-red-100 text-red-700" },
  awaiting_customer_signoff:{ label: "ממתין לאישור לקוח",  color: "bg-pink-100 text-pink-700" },
  completed:                { label: "הושלם",              color: "bg-green-100 text-green-700" },
  return_visit_required:    { label: "דורש ביקור חוזר",    color: "bg-rose-100 text-rose-700" },
  closed:                   { label: "סגור",               color: "bg-emerald-100 text-emerald-800" },
  cancelled:                { label: "בוטל",               color: "bg-stone-200 text-stone-600" },
};

type ReadinessLevel = "ready" | "partial" | "not_ready";
const READINESS_BADGE: Record<ReadinessLevel, { label: string; color: string }> = {
  ready:     { label: "מוכן",      color: "bg-green-100 text-green-700" },
  partial:   { label: "חלקי",      color: "bg-yellow-100 text-yellow-700" },
  not_ready: { label: "לא מוכן",   color: "bg-red-100 text-red-700" },
};

/* ───────── order type ───────── */
interface InstallationOrder {
  id: string;
  installation_order_number: string;
  project_name: string;
  customer: string;
  installation_type: string;
  product_family: string;
  total_items_count: number;
  total_area_m2: number;
  estimated_weight_kg: number;
  complexity_level: "פשוט" | "בינוני" | "מורכב" | "מיוחד";
  floor_level: string;
  indoor_outdoor: "פנים" | "חוץ" | "משולב";
  target_installation_date: string;
  estimated_duration_hours: number;
  priority_level: "דחוף" | "גבוה" | "רגיל" | "נמוך";
  assigned_crew: string;
  site_readiness: ReadinessLevel;
  materials_readiness: ReadinessLevel;
  tools_readiness: ReadinessLevel;
  permits_readiness: ReadinessLevel;
  status: InstallationStatus;
  budget_ils: number;
  estimated_cost_ils: number;
  linked_production_order: string;
  linked_delivery: string;
}

/* ───────── 15 orders ───────── */
const orders: InstallationOrder[] = [
  {
    id: "1", installation_order_number: "INS-001", project_name: "מגדלי הים התיכון - מגדל A",
    customer: "אאורה נדל\"ן", installation_type: "חלונות אלומיניום", product_family: "אלומיניום",
    total_items_count: 128, total_area_m2: 312, estimated_weight_kg: 4680,
    complexity_level: "מורכב", floor_level: "קומות 1-8", indoor_outdoor: "חוץ",
    target_installation_date: "2026-04-15", estimated_duration_hours: 96,
    priority_level: "דחוף", assigned_crew: "צוות א - אמיר כהן",
    site_readiness: "ready", materials_readiness: "ready", tools_readiness: "ready", permits_readiness: "ready",
    status: "in_progress", budget_ils: 245000, estimated_cost_ils: 218500,
    linked_production_order: "WO-2240", linked_delivery: "DLV-1180",
  },
  {
    id: "2", installation_order_number: "INS-002", project_name: "פארק הייטק הרצליה - בניין 3",
    customer: "אלקטרה בנייה", installation_type: "קירות מסך", product_family: "זכוכית",
    total_items_count: 64, total_area_m2: 540, estimated_weight_kg: 8100,
    complexity_level: "מיוחד", floor_level: "קומות 1-12", indoor_outdoor: "חוץ",
    target_installation_date: "2026-04-20", estimated_duration_hours: 160,
    priority_level: "גבוה", assigned_crew: "צוות ב - מוחמד עלי",
    site_readiness: "ready", materials_readiness: "partial", tools_readiness: "ready", permits_readiness: "ready",
    status: "scheduled", budget_ils: 520000, estimated_cost_ils: 475000,
    linked_production_order: "WO-2251", linked_delivery: "DLV-1195",
  },
  {
    id: "3", installation_order_number: "INS-003", project_name: "קניון עזריאלי מודיעין",
    customer: "עזריאלי קבוצה", installation_type: "ויטרינות חנויות", product_family: "זכוכית",
    total_items_count: 22, total_area_m2: 88, estimated_weight_kg: 1320,
    complexity_level: "בינוני", floor_level: "קומת קרקע", indoor_outdoor: "פנים",
    target_installation_date: "2026-04-12", estimated_duration_hours: 24,
    priority_level: "רגיל", assigned_crew: "צוות ג - יוסי לוי",
    site_readiness: "ready", materials_readiness: "ready", tools_readiness: "ready", permits_readiness: "ready",
    status: "completed", budget_ils: 78000, estimated_cost_ils: 72000,
    linked_production_order: "WO-2218", linked_delivery: "DLV-1162",
  },
  {
    id: "4", installation_order_number: "INS-004", project_name: "בית ספר אורט כרמיאל",
    customer: "עיריית כרמיאל", installation_type: "דלתות ומחיצות", product_family: "אלומיניום",
    total_items_count: 45, total_area_m2: 135, estimated_weight_kg: 2025,
    complexity_level: "פשוט", floor_level: "קומות 0-2", indoor_outdoor: "משולב",
    target_installation_date: "2026-04-25", estimated_duration_hours: 32,
    priority_level: "רגיל", assigned_crew: "צוות ד - סאמר חוסין",
    site_readiness: "partial", materials_readiness: "ready", tools_readiness: "ready", permits_readiness: "partial",
    status: "waiting_site_readiness", budget_ils: 95000, estimated_cost_ils: 87000,
    linked_production_order: "WO-2260", linked_delivery: "DLV-1201",
  },
  {
    id: "5", installation_order_number: "INS-005", project_name: "מלון דן פנורמה ת\"א",
    customer: "רשת דן", installation_type: "מעקות זכוכית", product_family: "זכוכית + מתכת",
    total_items_count: 38, total_area_m2: 76, estimated_weight_kg: 1900,
    complexity_level: "מורכב", floor_level: "קומות 5-15", indoor_outdoor: "חוץ",
    target_installation_date: "2026-04-18", estimated_duration_hours: 64,
    priority_level: "גבוה", assigned_crew: "צוות א - אמיר כהן",
    site_readiness: "ready", materials_readiness: "ready", tools_readiness: "ready", permits_readiness: "ready",
    status: "loading_preparation", budget_ils: 185000, estimated_cost_ils: 162000,
    linked_production_order: "WO-2255", linked_delivery: "DLV-1198",
  },
  {
    id: "6", installation_order_number: "INS-006", project_name: "פרויקט פינוי-בינוי רחובות",
    customer: "יובלים בנייה", installation_type: "חלונות + תריסים", product_family: "אלומיניום",
    total_items_count: 210, total_area_m2: 420, estimated_weight_kg: 6300,
    complexity_level: "בינוני", floor_level: "קומות 1-10", indoor_outdoor: "חוץ",
    target_installation_date: "2026-05-01", estimated_duration_hours: 120,
    priority_level: "רגיל", assigned_crew: "צוות ה - דוד ברק",
    site_readiness: "not_ready", materials_readiness: "partial", tools_readiness: "ready", permits_readiness: "not_ready",
    status: "draft", budget_ils: 380000, estimated_cost_ils: 345000,
    linked_production_order: "WO-2270", linked_delivery: "-",
  },
  {
    id: "7", installation_order_number: "INS-007", project_name: "מרכז רפואי שיבא - אגף חדש",
    customer: "שיבא מרכז רפואי", installation_type: "מחיצות פנימיות", product_family: "אלומיניום + זכוכית",
    total_items_count: 55, total_area_m2: 165, estimated_weight_kg: 2475,
    complexity_level: "מורכב", floor_level: "קומות 0-4", indoor_outdoor: "פנים",
    target_installation_date: "2026-04-22", estimated_duration_hours: 48,
    priority_level: "דחוף", assigned_crew: "צוות ב - מוחמד עלי",
    site_readiness: "ready", materials_readiness: "ready", tools_readiness: "partial", permits_readiness: "ready",
    status: "in_progress", budget_ils: 210000, estimated_cost_ils: 195000,
    linked_production_order: "WO-2248", linked_delivery: "DLV-1190",
  },
  {
    id: "8", installation_order_number: "INS-008", project_name: "וילה פרטית - סביון",
    customer: "משפחת גולדשטיין", installation_type: "חלונות + דלתות כניסה", product_family: "מתכת + זכוכית",
    total_items_count: 18, total_area_m2: 52, estimated_weight_kg: 780,
    complexity_level: "פשוט", floor_level: "קומות 0-1", indoor_outdoor: "משולב",
    target_installation_date: "2026-04-10", estimated_duration_hours: 12,
    priority_level: "נמוך", assigned_crew: "צוות ג - יוסי לוי",
    site_readiness: "ready", materials_readiness: "ready", tools_readiness: "ready", permits_readiness: "ready",
    status: "completed", budget_ils: 42000, estimated_cost_ils: 38500,
    linked_production_order: "WO-2205", linked_delivery: "DLV-1155",
  },
  {
    id: "9", installation_order_number: "INS-009", project_name: "תחנת רכבת בנימינה - שדרוג",
    customer: "רכבת ישראל", installation_type: "גדרות ומעקות", product_family: "מתכת",
    total_items_count: 85, total_area_m2: 255, estimated_weight_kg: 5100,
    complexity_level: "בינוני", floor_level: "קומת קרקע", indoor_outdoor: "חוץ",
    target_installation_date: "2026-04-28", estimated_duration_hours: 56,
    priority_level: "גבוה", assigned_crew: "צוות ד - סאמר חוסין",
    site_readiness: "partial", materials_readiness: "ready", tools_readiness: "ready", permits_readiness: "partial",
    status: "scheduled", budget_ils: 165000, estimated_cost_ils: 148000,
    linked_production_order: "WO-2265", linked_delivery: "DLV-1205",
  },
  {
    id: "10", installation_order_number: "INS-010", project_name: "מרכז מסחרי נתניה",
    customer: "ביג מרכזים", installation_type: "חזיתות אלומיניום", product_family: "אלומיניום",
    total_items_count: 48, total_area_m2: 380, estimated_weight_kg: 5700,
    complexity_level: "מיוחד", floor_level: "קומות 0-3", indoor_outdoor: "חוץ",
    target_installation_date: "2026-04-30", estimated_duration_hours: 88,
    priority_level: "גבוה", assigned_crew: "צוות ה - דוד ברק",
    site_readiness: "ready", materials_readiness: "partial", tools_readiness: "ready", permits_readiness: "ready",
    status: "ready_for_planning", budget_ils: 430000, estimated_cost_ils: 395000,
    linked_production_order: "WO-2272", linked_delivery: "-",
  },
  {
    id: "11", installation_order_number: "INS-011", project_name: "בית דיור מוגן - חיפה",
    customer: "מגדלי הים", installation_type: "חלונות אלומיניום", product_family: "אלומיניום",
    total_items_count: 96, total_area_m2: 230, estimated_weight_kg: 3450,
    complexity_level: "בינוני", floor_level: "קומות 1-6", indoor_outdoor: "חוץ",
    target_installation_date: "2026-04-14", estimated_duration_hours: 72,
    priority_level: "רגיל", assigned_crew: "צוות א - אמיר כהן",
    site_readiness: "ready", materials_readiness: "ready", tools_readiness: "ready", permits_readiness: "ready",
    status: "awaiting_customer_signoff", budget_ils: 178000, estimated_cost_ils: 162000,
    linked_production_order: "WO-2230", linked_delivery: "DLV-1172",
  },
  {
    id: "12", installation_order_number: "INS-012", project_name: "מפעל שטראוס - נהריה",
    customer: "שטראוס גרופ", installation_type: "מחיצות חדר נקי", product_family: "אלומיניום + זכוכית",
    total_items_count: 30, total_area_m2: 90, estimated_weight_kg: 1350,
    complexity_level: "מיוחד", floor_level: "קומת קרקע", indoor_outdoor: "פנים",
    target_installation_date: "2026-04-16", estimated_duration_hours: 40,
    priority_level: "דחוף", assigned_crew: "צוות ב - מוחמד עלי",
    site_readiness: "ready", materials_readiness: "ready", tools_readiness: "ready", permits_readiness: "ready",
    status: "quality_hold", budget_ils: 155000, estimated_cost_ils: 142000,
    linked_production_order: "WO-2242", linked_delivery: "DLV-1184",
  },
  {
    id: "13", installation_order_number: "INS-013", project_name: "שכונת נאות אפק - עפולה",
    customer: "חברת עמרם", installation_type: "תריסים חשמליים", product_family: "אלומיניום",
    total_items_count: 160, total_area_m2: 200, estimated_weight_kg: 3200,
    complexity_level: "פשוט", floor_level: "קומות 1-5", indoor_outdoor: "חוץ",
    target_installation_date: "2026-04-08", estimated_duration_hours: 48,
    priority_level: "רגיל", assigned_crew: "צוות ג - יוסי לוי",
    site_readiness: "ready", materials_readiness: "ready", tools_readiness: "ready", permits_readiness: "ready",
    status: "return_visit_required", budget_ils: 112000, estimated_cost_ils: 104000,
    linked_production_order: "WO-2215", linked_delivery: "DLV-1160",
  },
  {
    id: "14", installation_order_number: "INS-014", project_name: "בסיס צה\"ל - מרכז",
    customer: "משרד הביטחון", installation_type: "דלתות חסינות", product_family: "מתכת",
    total_items_count: 14, total_area_m2: 42, estimated_weight_kg: 2100,
    complexity_level: "מיוחד", floor_level: "קומת קרקע + מרתף", indoor_outdoor: "פנים",
    target_installation_date: "2026-05-05", estimated_duration_hours: 36,
    priority_level: "דחוף", assigned_crew: "צוות ד - סאמר חוסין",
    site_readiness: "not_ready", materials_readiness: "partial", tools_readiness: "partial", permits_readiness: "not_ready",
    status: "draft", budget_ils: 290000, estimated_cost_ils: 265000,
    linked_production_order: "WO-2280", linked_delivery: "-",
  },
  {
    id: "15", installation_order_number: "INS-015", project_name: "מרפאת כללית - באר שבע",
    customer: "כללית שירותי בריאות", installation_type: "חלונות + דלתות", product_family: "אלומיניום + זכוכית",
    total_items_count: 34, total_area_m2: 102, estimated_weight_kg: 1530,
    complexity_level: "בינוני", floor_level: "קומות 0-2", indoor_outdoor: "משולב",
    target_installation_date: "2026-04-17", estimated_duration_hours: 28,
    priority_level: "רגיל", assigned_crew: "צוות ה - דוד ברק",
    site_readiness: "ready", materials_readiness: "ready", tools_readiness: "ready", permits_readiness: "ready",
    status: "dispatched", budget_ils: 92000, estimated_cost_ils: 84000,
    linked_production_order: "WO-2258", linked_delivery: "DLV-1200",
  },
];

/* ───────── helpers ───────── */
const PRIORITY_COLOR: Record<string, string> = {
  "דחוף": "bg-red-100 text-red-700",
  "גבוה": "bg-orange-100 text-orange-700",
  "רגיל": "bg-blue-100 text-blue-700",
  "נמוך": "bg-gray-100 text-gray-600",
};

const COMPLEXITY_COLOR: Record<string, string> = {
  "פשוט": "bg-green-100 text-green-700",
  "בינוני": "bg-yellow-100 text-yellow-700",
  "מורכב": "bg-orange-100 text-orange-700",
  "מיוחד": "bg-purple-100 text-purple-700",
};

const tabGroups: { value: string; label: string; filter: (o: InstallationOrder) => boolean }[] = [
  { value: "all",        label: "הכל",          filter: () => true },
  { value: "draft",      label: "טיוטה",        filter: (o) => o.status === "draft" },
  { value: "scheduled",  label: "מתוכנן",       filter: (o) => ["ready_for_planning", "scheduled", "loading_preparation", "dispatched", "waiting_site_readiness"].includes(o.status) },
  { value: "active",     label: "בביצוע",       filter: (o) => ["on_site", "in_progress", "partially_completed"].includes(o.status) },
  { value: "completed",  label: "הושלם",        filter: (o) => ["awaiting_customer_signoff", "completed", "closed"].includes(o.status) },
  { value: "return",     label: "דורש חזרה",    filter: (o) => ["return_visit_required", "quality_hold"].includes(o.status) },
];

/* ───────── KPIs ───────── */
const kpis = [
  { label: "סה\"כ הזמנות",       value: 22,  icon: ClipboardList, color: "text-blue-600" },
  { label: "טיוטה",              value: 3,   icon: Clock,          color: "text-gray-500" },
  { label: "מתוזמנות",           value: 6,   icon: CalendarCheck,  color: "text-indigo-600" },
  { label: "בביצוע",             value: 4,   icon: HardHat,        color: "text-orange-600" },
  { label: "הושלם החודש",        value: 8,   icon: CheckCircle2,   color: "text-green-600" },
  { label: "עצירת איכות",        value: 1,   icon: AlertTriangle,  color: "text-red-600" },
  { label: "ביקור חוזר",         value: 2,   icon: RotateCcw,      color: "text-rose-600" },
  { label: "בוטלו",              value: 0,   icon: XCircle,        color: "text-stone-400" },
];

/* ═══════════════════════════ Component ═══════════════════════════ */
export default function InstallationOrders() {
  const [activeTab, setActiveTab] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<InstallationOrder | null>(null);

  const filtered = tabGroups.find((t) => t.value === activeTab)?.filter
    ? orders.filter(tabGroups.find((t) => t.value === activeTab)!.filter)
    : orders;

  return (
    <div dir="rtl" className="p-6 space-y-6 bg-background min-h-screen">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <ClipboardList className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">הזמנות התקנה</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניהול פעולות התקנה מלא</p>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex flex-col items-center gap-1 text-center">
              <k.icon className={`h-5 w-5 ${k.color}`} />
              <span className="text-2xl font-bold">{k.value}</span>
              <span className="text-xs text-muted-foreground">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs + Table ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          {tabGroups.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">
                {tabGroups.find((t) => t.value === activeTab)?.label} — {filtered.length} הזמנות
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מס׳ הזמנה</TableHead>
                    <TableHead className="text-right">פרויקט / לקוח</TableHead>
                    <TableHead className="text-right">סוג התקנה</TableHead>
                    <TableHead className="text-right">פריטים</TableHead>
                    <TableHead className="text-right">שטח מ״ר</TableHead>
                    <TableHead className="text-right">משקל ק״ג</TableHead>
                    <TableHead className="text-right">מורכבות</TableHead>
                    <TableHead className="text-right">קומה</TableHead>
                    <TableHead className="text-right">תאריך יעד</TableHead>
                    <TableHead className="text-right">שעות</TableHead>
                    <TableHead className="text-right">עדיפות</TableHead>
                    <TableHead className="text-right">צוות</TableHead>
                    <TableHead className="text-right">מוכנות אתר</TableHead>
                    <TableHead className="text-right">מוכנות חומרים</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((o) => (
                    <TableRow
                      key={o.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedOrder(o)}
                    >
                      <TableCell className="font-mono font-semibold">{o.installation_order_number}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{o.project_name}</div>
                        <div className="text-xs text-muted-foreground">{o.customer}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{o.installation_type}</div>
                        <div className="text-xs text-muted-foreground">{o.product_family}</div>
                      </TableCell>
                      <TableCell className="text-center">{o.total_items_count}</TableCell>
                      <TableCell className="text-center">{o.total_area_m2}</TableCell>
                      <TableCell className="text-center">{o.estimated_weight_kg.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge className={COMPLEXITY_COLOR[o.complexity_level]}>{o.complexity_level}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{o.floor_level}</TableCell>
                      <TableCell className="font-mono text-sm">{o.target_installation_date}</TableCell>
                      <TableCell className="text-center">{o.estimated_duration_hours}</TableCell>
                      <TableCell>
                        <Badge className={PRIORITY_COLOR[o.priority_level]}>{o.priority_level}</Badge>
                      </TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{o.assigned_crew}</TableCell>
                      <TableCell>
                        <Badge className={READINESS_BADGE[o.site_readiness].color}>
                          {READINESS_BADGE[o.site_readiness].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={READINESS_BADGE[o.materials_readiness].color}>
                          {READINESS_BADGE[o.materials_readiness].label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_META[o.status].color}>
                          {STATUS_META[o.status].label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Order Detail Card ── */}
      {selectedOrder && (
        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Package className="h-5 w-5" />
                פרטי הזמנה {selectedOrder.installation_order_number}
              </CardTitle>
              <Badge className={STATUS_META[selectedOrder.status].color + " text-sm px-3 py-1"}>
                {STATUS_META[selectedOrder.status].label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {selectedOrder.project_name} — {selectedOrder.customer}
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Scope */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Ruler className="h-4 w-4 text-blue-500" /> היקף ההתקנה
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">סוג התקנה:</span>
                  <span className="font-medium">{selectedOrder.installation_type}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">משפחת מוצר:</span>
                  <span>{selectedOrder.product_family}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">פריטים:</span>
                  <span className="font-medium">{selectedOrder.total_items_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">שטח כולל:</span>
                  <span>{selectedOrder.total_area_m2} מ״ר</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">משקל משוער:</span>
                  <span className="flex items-center gap-1">
                    <Weight className="h-3 w-3" /> {selectedOrder.estimated_weight_kg.toLocaleString()} ק״ג
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">מורכבות:</span>
                  <Badge className={COMPLEXITY_COLOR[selectedOrder.complexity_level]}>
                    {selectedOrder.complexity_level}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">קומה:</span>
                  <span>{selectedOrder.floor_level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">מיקום:</span>
                  <Badge variant="outline">
                    <MapPin className="h-3 w-3 ml-1" /> {selectedOrder.indoor_outdoor}
                  </Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">משך משוער:</span>
                  <span>{selectedOrder.estimated_duration_hours} שעות</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">צוות:</span>
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" /> {selectedOrder.assigned_crew}
                  </span>
                </div>
              </div>
            </div>

            {/* Readiness Checks */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <ShieldCheck className="h-4 w-4 text-green-500" /> בדיקות מוכנות
              </h3>
              <div className="space-y-3">
                {[
                  { label: "מוכנות אתר", value: selectedOrder.site_readiness },
                  { label: "מוכנות חומרים", value: selectedOrder.materials_readiness },
                  { label: "מוכנות כלים", value: selectedOrder.tools_readiness },
                  { label: "היתרים ואישורים", value: selectedOrder.permits_readiness },
                ].map((r) => {
                  const pct = r.value === "ready" ? 100 : r.value === "partial" ? 55 : 10;
                  return (
                    <div key={r.label} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span>{r.label}</span>
                        <Badge className={READINESS_BADGE[r.value].color}>
                          {READINESS_BADGE[r.value].label}
                        </Badge>
                      </div>
                      <Progress value={pct} className="h-2" />
                    </div>
                  );
                })}
              </div>

              {/* Linked Records */}
              <div className="pt-3 border-t space-y-2">
                <h3 className="font-semibold flex items-center gap-2 text-sm">
                  <Truck className="h-4 w-4 text-indigo-500" /> רשומות מקושרות
                </h3>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">הזמנת ייצור:</span>
                  <span className="font-mono text-primary">{selectedOrder.linked_production_order}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">משלוח:</span>
                  <span className="font-mono text-primary">{selectedOrder.linked_delivery}</span>
                </div>
              </div>
            </div>

            {/* Commercial */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2 text-sm">
                <Banknote className="h-4 w-4 text-emerald-500" /> נתונים מסחריים
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">תקציב:</span>
                  <span className="font-bold text-lg">{fmt.format(selectedOrder.budget_ils)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">עלות משוערת:</span>
                  <span className="font-medium">{fmt.format(selectedOrder.estimated_cost_ils)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">מרווח צפוי:</span>
                  <span className="font-medium text-green-600">
                    {fmt.format(selectedOrder.budget_ils - selectedOrder.estimated_cost_ils)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">אחוז מרווח:</span>
                  <span className="font-medium text-green-600">
                    {((1 - selectedOrder.estimated_cost_ils / selectedOrder.budget_ils) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Budget utilization bar */}
              <div className="pt-2 space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>ניצול תקציב</span>
                  <span>{((selectedOrder.estimated_cost_ils / selectedOrder.budget_ils) * 100).toFixed(0)}%</span>
                </div>
                <Progress
                  value={(selectedOrder.estimated_cost_ils / selectedOrder.budget_ils) * 100}
                  className="h-2.5"
                />
              </div>

              {/* Priority + date */}
              <div className="pt-3 border-t space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">עדיפות:</span>
                  <Badge className={PRIORITY_COLOR[selectedOrder.priority_level]}>
                    {selectedOrder.priority_level}
                  </Badge>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">תאריך יעד:</span>
                  <span className="font-mono">{selectedOrder.target_installation_date}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
