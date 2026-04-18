import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Phone, AlertTriangle, Clock, DollarSign, RotateCcw, CheckCircle,
  Shield, Wrench, Search, TrendingUp, ShieldAlert, FileWarning
} from "lucide-react";

/* ── Static mock data ─────────────────────────────────────────── */

const FALLBACK_SERVICE_CALLS = [
  { id: "SVC-301", insId: "INS-001", project: "מגדלי הים — חיפה", client: "אלון נדל\"ן", date: "2026-04-06", fault: "נזילה", urgency: "קריטי", crew: "צוות שירות א׳", status: "בביצוע", days: 2, cost: 1800, warranty: true },
  { id: "SVC-302", insId: "INS-003", project: "בית חכם — הרצליה", client: "רוזנפלד בע\"מ", date: "2026-04-04", fault: "פעולת נעילה", urgency: "דחוף", crew: "צוות שירות ב׳", status: "ממתין לחלק", days: 4, cost: 950, warranty: true },
  { id: "SVC-303", insId: "INS-005", project: "קניון הדרום — באר שבע", client: "קניון הדרום בע\"מ", date: "2026-04-01", fault: "איטום לקוי", urgency: "קריטי", crew: "צוות שירות א׳", status: "חדש", days: 7, cost: 2200, warranty: true },
  { id: "SVC-304", insId: "INS-008", project: "מרכז ספורט — ראשל\"צ", client: "עיריית ראשל\"צ", date: "2026-03-28", fault: "רעש", urgency: "רגיל", crew: "צוות שירות ג׳", status: "הושלם", days: 0, cost: 450, warranty: false },
  { id: "SVC-305", insId: "INS-002", project: "פארק המדע — רחובות", client: "מכון ויצמן", date: "2026-04-03", fault: "זכוכית סדוקה", urgency: "דחוף", crew: "צוות שירות ב׳", status: "מתוכנן", days: 5, cost: 3400, warranty: true },
  { id: "SVC-306", insId: "INS-007", project: "בניין מגורים — נתניה", client: "שיכון ופיתוח", date: "2026-03-25", fault: "יישור", urgency: "רגיל", crew: "צוות שירות ג׳", status: "הושלם", days: 0, cost: 600, warranty: true },
  { id: "SVC-307", insId: "INS-004", project: "מלון ים התיכון", client: "רשת מלונות אטלס", date: "2026-04-05", fault: "חלודה", urgency: "רגיל", crew: "צוות שירות א׳", status: "מתוכנן", days: 3, cost: 750, warranty: false },
  { id: "SVC-308", insId: "INS-006", project: "משרדי הייטק — הרצליה פיתוח", client: "סייברטק בע\"מ", date: "2026-04-07", fault: "צבע מתקלף", urgency: "רגיל", crew: "צוות שירות ב׳", status: "חדש", days: 1, cost: 350, warranty: false },
  { id: "SVC-309", insId: "INS-001", project: "מגדלי הים — חיפה", client: "אלון נדל\"ן", date: "2026-03-20", fault: "איטום לקוי", urgency: "דחוף", crew: "צוות שירות א׳", status: "הושלם", days: 0, cost: 1600, warranty: true },
  { id: "SVC-310", insId: "INS-005", project: "קניון הדרום — באר שבע", client: "קניון הדרום בע\"מ", date: "2026-03-15", fault: "פעולת נעילה", urgency: "רגיל", crew: "צוות שירות ג׳", status: "הושלם", days: 0, cost: 520, warranty: true },
  { id: "SVC-311", insId: "INS-003", project: "בית חכם — הרצליה", client: "רוזנפלד בע\"מ", date: "2026-03-30", fault: "נזילה", urgency: "דחוף", crew: "צוות שירות ב׳", status: "הושלם", days: 0, cost: 1350, warranty: true },
  { id: "SVC-312", insId: "INS-007", project: "בניין מגורים — נתניה", client: "שיכון ופיתוח", date: "2026-04-02", fault: "זכוכית סדוקה", urgency: "דחוף", crew: "צוות שירות א׳", status: "בביצוע", days: 6, cost: 2800, warranty: true },
];

const FALLBACK_ROOT_CAUSE_ANALYSIS = [
  { fault: "נזילה", pct: 22, avgCost: 1575, count: 2, suggestion: "שיפור בדיקת לחץ מים לפני מסירה" },
  { fault: "איטום לקוי", pct: 19, avgCost: 1900, count: 2, suggestion: "מעבר לחומר איטום SikaPro במפרט" },
  { fault: "פעולת נעילה", pct: 17, avgCost: 735, count: 2, suggestion: "בדיקת מנגנון נעילה כפולה בקבלה" },
  { fault: "זכוכית סדוקה", pct: 14, avgCost: 3100, count: 2, suggestion: "אריזת הגנה משופרת בהובלה" },
  { fault: "רעש", pct: 8, avgCost: 450, count: 1, suggestion: "התקנת גומיות בידוד בנקודות חיכוך" },
  { fault: "יישור", pct: 8, avgCost: 600, count: 1, suggestion: "כיול לייזר חובה בהתקנה" },
  { fault: "צבע מתקלף", pct: 6, avgCost: 350, count: 1, suggestion: "החלפת ספק צבע אלקטרוסטטי" },
  { fault: "חלודה", pct: 6, avgCost: 750, count: 1, suggestion: "ציפוי אנודייז כפול לסביבת ים" },
];

const FALLBACK_WARRANTY_IMPACT = [
  { label: "עלות אחריות כוללת", value: "₪11,470", desc: "סה\"כ תיקונים באחריות החודש", icon: DollarSign, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "תביעות אחריות בהמתנה", value: "3", desc: "קריאות פתוחות תחת אחריות", icon: ShieldAlert, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "אחריות / לא-אחריות", value: "75% / 25%", desc: "9 באחריות מתוך 12 קריאות", icon: Shield, color: "text-blue-400", bg: "bg-blue-500/10" },
];

/* ── Helpers ───────────────────────────────────────────────────── */

const urgencyColor: Record<string, string> = {
  "קריטי": "bg-red-500/20 text-red-300",
  "דחוף": "bg-amber-500/20 text-amber-300",
  "רגיל": "bg-blue-500/20 text-blue-300",
};

const statusColor: Record<string, string> = {
  "חדש": "bg-purple-500/20 text-purple-300",
  "מתוכנן": "bg-blue-500/20 text-blue-300",
  "בביצוע": "bg-yellow-500/20 text-yellow-300",
  "ממתין לחלק": "bg-orange-500/20 text-orange-300",
  "הושלם": "bg-emerald-500/20 text-emerald-300",
};

/* ── KPI cards ────────────────────────────────────────────────── */

const FALLBACK_KPI_DATA = [
  { label: "קריאות פתוחות", value: "7", icon: Phone, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "קריטיות", value: "2", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "נסגרו החודש", value: "9", icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "זמן תגובה ממוצע", value: "6.5 שעות", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "עלות שירות החודש", value: "₪12,400", icon: DollarSign, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "שיעור חזרה", value: "4.2%", icon: RotateCcw, color: "text-orange-400", bg: "bg-orange-500/10" },
];

/* ── Component ────────────────────────────────────────────────── */

export default function ReturnServiceCalls() {
  const { data: serviceCalls = FALLBACK_SERVICE_CALLS } = useQuery({
    queryKey: ["installation-service-calls"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/return-service-calls/service-calls");
      if (!res.ok) return FALLBACK_SERVICE_CALLS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SERVICE_CALLS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: rootCauseAnalysis = FALLBACK_ROOT_CAUSE_ANALYSIS } = useQuery({
    queryKey: ["installation-root-cause-analysis"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/return-service-calls/root-cause-analysis");
      if (!res.ok) return FALLBACK_ROOT_CAUSE_ANALYSIS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_ROOT_CAUSE_ANALYSIS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: warrantyImpact = FALLBACK_WARRANTY_IMPACT } = useQuery({
    queryKey: ["installation-warranty-impact"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/return-service-calls/warranty-impact");
      if (!res.ok) return FALLBACK_WARRANTY_IMPACT;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_WARRANTY_IMPACT;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: kpiData = FALLBACK_KPI_DATA } = useQuery({
    queryKey: ["installation-kpi-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/return-service-calls/kpi-data");
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
          <Phone className="h-7 w-7 text-primary" /> קריאות שירות חוזרות
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — מעקב קריאות | ניתוח שורש | אחריות | היסטוריה
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
      <Tabs defaultValue="open">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="open" className="text-xs gap-1"><Phone className="h-3.5 w-3.5" /> פתוחות</TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1"><Clock className="h-3.5 w-3.5" /> היסטוריה</TabsTrigger>
          <TabsTrigger value="rootcause" className="text-xs gap-1"><Search className="h-3.5 w-3.5" /> ניתוח שורש</TabsTrigger>
          <TabsTrigger value="warranty" className="text-xs gap-1"><Shield className="h-3.5 w-3.5" /> השפעה על אחריות</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Open Calls ───────────────────────────────── */}
        <TabsContent value="open">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Phone className="h-4 w-4 text-blue-400" /> קריאות שירות פתוחות
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מזהה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">התקנה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט / לקוח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך קריאה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג תקלה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">דחיפות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">צוות מטפל</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ימים</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">עלות (₪)</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אחריות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviceCalls.filter(c => c.status !== "הושלם").map((c) => (
                    <TableRow key={c.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{c.id}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{c.insId}</TableCell>
                      <TableCell>
                        <div className="leading-tight">
                          <span className="font-semibold">{c.project}</span>
                          <span className="block text-[10px] text-muted-foreground">{c.client}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{c.date}</TableCell>
                      <TableCell>{c.fault}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${urgencyColor[c.urgency] || "bg-gray-500/20 text-gray-300"}`}>{c.urgency}</Badge>
                      </TableCell>
                      <TableCell>{c.crew}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${statusColor[c.status] || "bg-gray-500/20 text-gray-300"}`}>{c.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-center">{c.days}</TableCell>
                      <TableCell className="font-mono">{c.cost.toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`text-[9px] ${c.warranty ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-500/20 text-gray-400"}`}>
                          {c.warranty ? "כן" : "לא"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: History ──────────────────────────────────── */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400" /> היסטוריית קריאות שירות
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מזהה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">התקנה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט / לקוח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך קריאה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג תקלה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">דחיפות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">צוות מטפל</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">עלות (₪)</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אחריות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {serviceCalls.map((c) => (
                    <TableRow key={c.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{c.id}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{c.insId}</TableCell>
                      <TableCell>
                        <div className="leading-tight">
                          <span className="font-semibold">{c.project}</span>
                          <span className="block text-[10px] text-muted-foreground">{c.client}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{c.date}</TableCell>
                      <TableCell>{c.fault}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${urgencyColor[c.urgency] || "bg-gray-500/20 text-gray-300"}`}>{c.urgency}</Badge>
                      </TableCell>
                      <TableCell>{c.crew}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${statusColor[c.status] || "bg-gray-500/20 text-gray-300"}`}>{c.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono">{c.cost.toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`text-[9px] ${c.warranty ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-500/20 text-gray-400"}`}>
                          {c.warranty ? "כן" : "לא"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Root Cause Analysis ──────────────────────── */}
        <TabsContent value="rootcause">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Search className="h-4 w-4 text-purple-400" /> ניתוח שורש — פילוח לפי סוג תקלה
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">סוג תקלה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מספר קריאות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold w-32">אחוז מסה״כ</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">עלות ממוצעת (₪)</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">המלצה למניעה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rootCauseAnalysis.map((r) => (
                    <TableRow key={r.fault} className="text-xs">
                      <TableCell className="font-semibold flex items-center gap-1.5">
                        <Wrench className="h-3 w-3 text-muted-foreground" />
                        {r.fault}
                      </TableCell>
                      <TableCell className="font-mono text-center">{r.count}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={r.pct} className="h-1.5 flex-1" />
                          <span className="text-[10px] font-mono w-8 text-left">{r.pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{r.avgCost.toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[250px]">
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3 text-emerald-400 shrink-0" />
                          {r.suggestion}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Warranty Impact ─────────────────────────── */}
        <TabsContent value="warranty">
          <div className="space-y-4">
            {/* Warranty KPI Cards */}
            <div className="grid grid-cols-3 gap-4">
              {warrantyImpact.map((w, i) => {
                const Icon = w.icon;
                return (
                  <Card key={i} className={`${w.bg} border-0 shadow-sm`}>
                    <CardContent className="pt-5 pb-4 text-center">
                      <Icon className={`h-6 w-6 mx-auto ${w.color} mb-2`} />
                      <p className="text-[11px] text-muted-foreground">{w.label}</p>
                      <p className={`text-3xl font-bold font-mono ${w.color} mt-1`}>{w.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{w.desc}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Warranty Breakdown Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileWarning className="h-4 w-4 text-amber-400" /> פירוט קריאות לפי סטטוס אחריות
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-right text-[10px] font-semibold">מזהה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">סוג תקלה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">עלות (₪)</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">באחריות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceCalls.map((c) => (
                      <TableRow key={c.id} className="text-xs">
                        <TableCell className="font-mono font-semibold text-primary">{c.id}</TableCell>
                        <TableCell>{c.project}</TableCell>
                        <TableCell>{c.fault}</TableCell>
                        <TableCell className="font-mono">{c.cost.toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge className={`text-[9px] ${c.warranty ? "bg-emerald-500/20 text-emerald-300" : "bg-gray-500/20 text-gray-400"}`}>
                            {c.warranty ? "באחריות" : "לא באחריות"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[9px] ${statusColor[c.status] || "bg-gray-500/20 text-gray-300"}`}>{c.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
