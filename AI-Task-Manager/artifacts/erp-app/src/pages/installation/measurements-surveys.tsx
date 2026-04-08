import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Scaling, ClipboardCheck, Camera, MapPin, FileText, PenLine,
  CheckCircle, XCircle, AlertTriangle, Ruler, Eye, ArrowLeftRight,
  User, CalendarDays, Image, FileDown, ChevronLeft
} from "lucide-react";

/* ── Static mock data ─────────────────────────────────────────── */

const measurements = [
  { measurement_id: "MSR-001", project: "מגדלי הים — חיפה", customer: "חברת אקרו נדל\"ן", site_address: "שד' הנשיא 45, חיפה", measured_by: "יוסי כהן", measured_at: "2026-03-20", opening_width_mm: 1200, opening_height_mm: 1500, depth_mm: 120, floor_level_difference: "0 מ\"מ", wall_alignment_notes: "קירות ישרים, ללא סטיות", irregularities_found: "לא נמצאו", linked_photos: 8, linked_drawings: 2, approved_for_production: "כן", requires_change_order: "לא" },
  { measurement_id: "MSR-002", project: "פארק המדע — רחובות", customer: "רשות המדע הלאומית", site_address: "רח' הרצל 12, רחובות", measured_by: "שרה לוי", measured_at: "2026-03-22", opening_width_mm: 2400, opening_height_mm: 2100, depth_mm: 150, floor_level_difference: "3 מ\"מ", wall_alignment_notes: "סטייה קלה בקיר מזרחי", irregularities_found: "סדק אופקי 2 מ\"מ בקיר עליון", linked_photos: 12, linked_drawings: 3, approved_for_production: "כן", requires_change_order: "לא" },
  { measurement_id: "MSR-003", project: "בית חכם — הרצליה", customer: "גולדשטיין ובניו", site_address: "רח' סוקולוב 88, הרצליה", measured_by: "אלון גולדשטיין", measured_at: "2026-03-25", opening_width_mm: 1800, opening_height_mm: 2200, depth_mm: 140, floor_level_difference: "8 מ\"מ", wall_alignment_notes: "קיר צפוני נוטה 5 מ\"מ", irregularities_found: "הפרש גובה רצפה — דרוש פילוס", linked_photos: 6, linked_drawings: 2, approved_for_production: "ממתין", requires_change_order: "כן" },
  { measurement_id: "MSR-004", project: "מלון ים התיכון", customer: "רשת מלונות רויאל", site_address: "רח' הירקון 200, ת\"א", measured_by: "דוד מזרחי", measured_at: "2026-03-28", opening_width_mm: 3000, opening_height_mm: 2400, depth_mm: 160, floor_level_difference: "0 מ\"מ", wall_alignment_notes: "קירות בטון חשוף — ישרים", irregularities_found: "לא נמצאו", linked_photos: 15, linked_drawings: 4, approved_for_production: "כן", requires_change_order: "לא" },
  { measurement_id: "MSR-005", project: "קניון הדרום — באר שבע", customer: "קבוצת עזריאלי", site_address: "שד' רגר 50, באר שבע", measured_by: "נועה פרידמן", measured_at: "2026-03-30", opening_width_mm: 4200, opening_height_mm: 3000, depth_mm: 200, floor_level_difference: "12 מ\"מ", wall_alignment_notes: "סטייה 7 מ\"מ בקיר דרומי", irregularities_found: "רצפה לא מיושרת — 12 מ\"מ הפרש", linked_photos: 10, linked_drawings: 3, approved_for_production: "ממתין", requires_change_order: "כן" },
  { measurement_id: "MSR-006", project: "משרדי הייטק — הרצליה פיתוח", customer: "חברת סייבר-טק", site_address: "רח' המסגר 5, הרצליה", measured_by: "שרה לוי", measured_at: "2026-04-01", opening_width_mm: 1500, opening_height_mm: 2100, depth_mm: 110, floor_level_difference: "2 מ\"מ", wall_alignment_notes: "קיר גבס — דרוש חיזוק", irregularities_found: "קיר גבס ללא חיזוק מספיק", linked_photos: 5, linked_drawings: 1, approved_for_production: "ממתין", requires_change_order: "לא" },
  { measurement_id: "MSR-007", project: "בניין מגורים — נתניה", customer: "אפריקה ישראל מגורים", site_address: "רח' שמואלי 22, נתניה", measured_by: "אלון גולדשטיין", measured_at: "2026-04-02", opening_width_mm: 1000, opening_height_mm: 1200, depth_mm: 100, floor_level_difference: "0 מ\"מ", wall_alignment_notes: "קירות ישרים — תקין", irregularities_found: "לא נמצאו", linked_photos: 4, linked_drawings: 1, approved_for_production: "כן", requires_change_order: "לא" },
  { measurement_id: "MSR-008", project: "מרכז ספורט — ראשל\"צ", customer: "עיריית ראשון לציון", site_address: "רח' ביאליק 15, ראשל\"צ", measured_by: "דוד מזרחי", measured_at: "2026-04-03", opening_width_mm: 2000, opening_height_mm: 2500, depth_mm: 130, floor_level_difference: "5 מ\"מ", wall_alignment_notes: "בטון מזויין — ישר", irregularities_found: "חור אנקר קיים — דרוש סתימה", linked_photos: 7, linked_drawings: 2, approved_for_production: "כן", requires_change_order: "לא" },
  { measurement_id: "MSR-009", project: "מגדלי אקרו — תל אביב", customer: "אקרו נדל\"ן בע\"מ", site_address: "רח' יגאל אלון 94, ת\"א", measured_by: "יוסי כהן", measured_at: "2026-04-04", opening_width_mm: 1600, opening_height_mm: 2100, depth_mm: 140, floor_level_difference: "0 מ\"מ", wall_alignment_notes: "קירות בטון — ישרים", irregularities_found: "לא נמצאו", linked_photos: 9, linked_drawings: 3, approved_for_production: "כן", requires_change_order: "לא" },
  { measurement_id: "MSR-010", project: "מרכז רפואי — פתח תקווה", customer: "קופת חולים מאוחדת", site_address: "רח' ז'בוטינסקי 40, פ\"ת", measured_by: "נועה פרידמן", measured_at: "2026-04-05", opening_width_mm: 900, opening_height_mm: 2100, depth_mm: 110, floor_level_difference: "15 מ\"מ", wall_alignment_notes: "קיר בלוקים — סטייה 10 מ\"מ", irregularities_found: "הפרש רצפה 15 מ\"מ — דרוש סף מותאם", linked_photos: 6, linked_drawings: 2, approved_for_production: "ממתין", requires_change_order: "כן" },
  { measurement_id: "MSR-011", project: "מגדלי הים התיכון — אשדוד", customer: "חברת נתיבי אשדוד", site_address: "רח' הנמל 5, אשדוד", measured_by: "שרה לוי", measured_at: "2026-04-06", opening_width_mm: 2200, opening_height_mm: 1800, depth_mm: 130, floor_level_difference: "0 מ\"מ", wall_alignment_notes: "קירות ישרים", irregularities_found: "לא נמצאו", linked_photos: 8, linked_drawings: 2, approved_for_production: "כן", requires_change_order: "לא" },
  { measurement_id: "MSR-012", project: "משרדי חברת ענן — רעננה", customer: "ענן טכנולוגיות בע\"מ", site_address: "רח' אחוזה 120, רעננה", measured_by: "אלון גולדשטיין", measured_at: "2026-04-07", opening_width_mm: 1400, opening_height_mm: 2100, depth_mm: 120, floor_level_difference: "4 מ\"מ", wall_alignment_notes: "קיר גבס כפול — תקין", irregularities_found: "לא נמצאו", linked_photos: 5, linked_drawings: 1, approved_for_production: "ממתין", requires_change_order: "לא" },
];

const siteSurveys = [
  { id: "SRV-001", project: "מגדלי הים — חיפה", surveyor: "יוסי כהן", date: "2026-03-18", photos: 24, notes: "גישה מלאה לקומות 3-12, חשמל זמני מחובר", findings: "תקין — מוכן להתקנה", status: "אושר" },
  { id: "SRV-002", project: "פארק המדע — רחובות", surveyor: "שרה לוי", date: "2026-03-20", photos: 18, notes: "שטח פנוי, ריצוף טרם הונח", findings: "דרוש תיאום עם קבלן ריצוף", status: "אושר עם הערות" },
  { id: "SRV-003", project: "מלון ים התיכון", surveyor: "דוד מזרחי", date: "2026-03-26", photos: 32, notes: "קומה 12 — גישה במנוף בלבד", findings: "דרוש מנוף 20 טון ביום ההתקנה", status: "אושר עם הערות" },
  { id: "SRV-004", project: "קניון הדרום — באר שבע", surveyor: "נועה פרידמן", date: "2026-03-28", photos: 15, notes: "כניסת משאית מוגבלת — רח' צדדי בלבד", findings: "הפרשי רצפה — דרוש פילוס לפני התקנה", status: "ממתין לתיקון" },
  { id: "SRV-005", project: "בית חכם — הרצליה", surveyor: "אלון גולדשטיין", date: "2026-03-23", photos: 20, notes: "בית פרטי, חניה זמינה, חשמל תקין", findings: "הפרש גובה רצפה 8 מ\"מ — דורש סף מותאם", status: "אושר עם הערות" },
  { id: "SRV-006", project: "משרדי הייטק — הרצליה פיתוח", surveyor: "שרה לוי", date: "2026-03-30", photos: 12, notes: "קומה 5 — מעלית משא זמינה", findings: "קיר גבס ללא חיזוק — דרוש עיבוד נוסף", status: "ממתין לתיקון" },
  { id: "SRV-007", project: "מרכז רפואי — פתח תקווה", surveyor: "נועה פרידמן", date: "2026-04-03", photos: 22, notes: "אגף חדש — שלד בלבד, טיח לא גמור", findings: "מידות פתחים לא סופיות — מדידה חוזרת נדרשת", status: "נדרשת חזרה" },
  { id: "SRV-008", project: "מגדלי אקרו — תל אביב", surveyor: "יוסי כהן", date: "2026-04-02", photos: 28, notes: "קומות 8-15, גישה מלאה, פיגום קיים", findings: "תקין — מוכן להתקנה", status: "אושר" },
];

const fieldSketches = [
  { id: "SKT-001", project: "מגדלי הים — חיפה", drawnBy: "אלון גולדשטיין", date: "2026-03-21", linkedDrawing: "DWG-045 Rev C", dimensions: "12 פתחים, קומות 3-7", approval: "מאושר" },
  { id: "SKT-002", project: "מלון ים התיכון", drawnBy: "דוד מזרחי", date: "2026-03-27", linkedDrawing: "DWG-078 Rev B", dimensions: "8 ויטרינות, קומה 12", approval: "מאושר" },
  { id: "SKT-003", project: "קניון הדרום — באר שבע", drawnBy: "נועה פרידמן", date: "2026-03-29", linkedDrawing: "DWG-091 Rev A", dimensions: "4 חזיתות, קומת קרקע", approval: "ממתין" },
  { id: "SKT-004", project: "בית חכם — הרצליה", drawnBy: "אלון גולדשטיין", date: "2026-03-24", linkedDrawing: "DWG-033 Rev D", dimensions: "6 פתחים, קומה אחת", approval: "מאושר" },
  { id: "SKT-005", project: "מרכז רפואי — פתח תקווה", drawnBy: "שרה לוי", date: "2026-04-04", linkedDrawing: "DWG-102 Rev A", dimensions: "10 דלתות, אגף B", approval: "נדחה — דרוש עדכון" },
  { id: "SKT-006", project: "משרדי חברת ענן — רעננה", drawnBy: "אלון גולדשטיין", date: "2026-04-06", linkedDrawing: "DWG-110 Rev A", dimensions: "5 מחיצות זכוכית", approval: "ממתין" },
];

const dimensionComparisons = [
  { measurement_id: "MSR-003", project: "בית חכם — הרצליה", element: "חלון סלון", planned_w: 1800, measured_w: 1793, planned_h: 2200, measured_h: 2198, planned_d: 140, measured_d: 138 },
  { measurement_id: "MSR-005", project: "קניון הדרום — באר שבע", element: "ויטרינה ראשית", planned_w: 4200, measured_w: 4188, planned_h: 3000, measured_h: 2994, planned_d: 200, measured_d: 198 },
  { measurement_id: "MSR-006", project: "משרדי הייטק — הרצליה פיתוח", element: "דלת כניסה", planned_w: 1500, measured_w: 1498, planned_h: 2100, measured_h: 2100, planned_d: 110, measured_d: 110 },
  { measurement_id: "MSR-010", project: "מרכז רפואי — פתח תקווה", element: "דלת חדר ניתוח", planned_w: 900, measured_w: 891, planned_h: 2100, measured_h: 2093, planned_d: 110, measured_d: 108 },
  { measurement_id: "MSR-012", project: "משרדי חברת ענן — רעננה", element: "מחיצת זכוכית", planned_w: 1400, measured_w: 1397, planned_h: 2100, measured_h: 2099, planned_d: 120, measured_d: 119 },
];

/* ── Helpers ───────────────────────────────────────────────────── */

const approvalColor: Record<string, string> = {
  "כן": "bg-emerald-500/20 text-emerald-300",
  "לא": "bg-red-500/20 text-red-300",
  "ממתין": "bg-amber-500/20 text-amber-300",
};

const surveyStatusColor: Record<string, string> = {
  "אושר": "bg-emerald-500/20 text-emerald-300",
  "אושר עם הערות": "bg-amber-500/20 text-amber-300",
  "ממתין לתיקון": "bg-orange-500/20 text-orange-300",
  "נדרשת חזרה": "bg-red-500/20 text-red-300",
};

const sketchApprovalColor: Record<string, string> = {
  "מאושר": "bg-emerald-500/20 text-emerald-300",
  "ממתין": "bg-amber-500/20 text-amber-300",
  "נדחה — דרוש עדכון": "bg-red-500/20 text-red-300",
};

const deviation = (planned: number, measured: number) => Math.abs(planned - measured);
const deviationClass = (planned: number, measured: number) =>
  deviation(planned, measured) > 5 ? "text-red-400 font-bold" : "text-emerald-400";

/* ── KPI data ────────────────────────────────────────────────── */

const kpiData = [
  { label: "סה\"כ מדידות", value: 28, icon: Scaling, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "ממתינות לאישור", value: 5, icon: ClipboardCheck, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "אושרו לייצור", value: 20, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "דורשות שינוי", value: 3, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "חוזרות", value: 2, icon: ArrowLeftRight, color: "text-purple-400", bg: "bg-purple-500/10" },
];

/* ── Component ────────────────────────────────────────────────── */

export default function MeasurementsSurveys() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Scaling className="h-7 w-7 text-primary" /> מדידות וסקרי אתר
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — מדידות שטח | סקרי אתר | שרטוטים | השוואת מידות
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-3">
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
      <Tabs defaultValue="measurements">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="measurements" className="text-xs gap-1"><Ruler className="h-3.5 w-3.5" /> מדידות</TabsTrigger>
          <TabsTrigger value="surveys" className="text-xs gap-1"><Eye className="h-3.5 w-3.5" /> סקרי אתר</TabsTrigger>
          <TabsTrigger value="sketches" className="text-xs gap-1"><PenLine className="h-3.5 w-3.5" /> שרטוטי שטח</TabsTrigger>
          <TabsTrigger value="compare" className="text-xs gap-1"><ArrowLeftRight className="h-3.5 w-3.5" /> השוואת מידות</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Measurements ─────────────────────────────── */}
        <TabsContent value="measurements">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מס׳ מדידה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">לקוח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">כתובת</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מודד</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">רוחב (מ״מ)</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">גובה (מ״מ)</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">עומק (מ״מ)</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תמונות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שרטוטים</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אושר לייצור</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שינוי נדרש</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {measurements.map((m) => (
                    <TableRow key={m.measurement_id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{m.measurement_id}</TableCell>
                      <TableCell>{m.project}</TableCell>
                      <TableCell className="text-muted-foreground">{m.customer}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{m.site_address}</span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />{m.measured_by}</span>
                      </TableCell>
                      <TableCell className="font-mono">{m.measured_at}</TableCell>
                      <TableCell className="font-mono text-center">{m.opening_width_mm.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-center">{m.opening_height_mm.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-center">{m.depth_mm}</TableCell>
                      <TableCell className="text-center">
                        <span className="flex items-center justify-center gap-1"><Camera className="h-3 w-3 text-muted-foreground" />{m.linked_photos}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="flex items-center justify-center gap-1"><FileText className="h-3 w-3 text-muted-foreground" />{m.linked_drawings}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${approvalColor[m.approved_for_production] || "bg-gray-500/20 text-gray-300"}`}>{m.approved_for_production}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${m.requires_change_order === "כן" ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"}`}>{m.requires_change_order}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Site Surveys ─────────────────────────────── */}
        <TabsContent value="surveys">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מס׳ סקר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוקר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תמונות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">הערות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ממצאים</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {siteSurveys.map((s) => (
                    <TableRow key={s.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{s.id}</TableCell>
                      <TableCell>{s.project}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />{s.surveyor}</span>
                      </TableCell>
                      <TableCell className="font-mono">{s.date}</TableCell>
                      <TableCell className="text-center">
                        <span className="flex items-center justify-center gap-1"><Image className="h-3 w-3 text-muted-foreground" />{s.photos}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">{s.notes}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{s.findings}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${surveyStatusColor[s.status] || "bg-gray-500/20 text-gray-300"}`}>{s.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Field Sketches ───────────────────────────── */}
        <TabsContent value="sketches">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מס׳ שרטוט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שורטט ע״י</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שרטוט מקושר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מידות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אישור</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fieldSketches.map((sk) => (
                    <TableRow key={sk.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{sk.id}</TableCell>
                      <TableCell>{sk.project}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />{sk.drawnBy}</span>
                      </TableCell>
                      <TableCell className="font-mono">{sk.date}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1"><FileDown className="h-3 w-3 text-blue-400" />{sk.linkedDrawing}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{sk.dimensions}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${sketchApprovalColor[sk.approval] || "bg-gray-500/20 text-gray-300"}`}>{sk.approval}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Dimension Comparison ─────────────────────── */}
        <TabsContent value="compare">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-primary" />
                השוואת מידות — מתוכנן מול נמדד
                <span className="text-[10px] text-muted-foreground font-normal mr-2">סטייה מעל 5 מ״מ מסומנת באדום</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מס׳ מדידה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אלמנט</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">רוחב מתוכנן</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">רוחב נמדד</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">סטייה (מ״מ)</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">גובה מתוכנן</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">גובה נמדד</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">סטייה (מ״מ)</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">עומק מתוכנן</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">עומק נמדד</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">סטייה (מ״מ)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dimensionComparisons.map((c) => (
                    <TableRow key={c.measurement_id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{c.measurement_id}</TableCell>
                      <TableCell>{c.project}</TableCell>
                      <TableCell>{c.element}</TableCell>
                      <TableCell className="font-mono text-center">{c.planned_w.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-center">{c.measured_w.toLocaleString()}</TableCell>
                      <TableCell className={`font-mono text-center ${deviationClass(c.planned_w, c.measured_w)}`}>
                        {deviation(c.planned_w, c.measured_w)}
                      </TableCell>
                      <TableCell className="font-mono text-center">{c.planned_h.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-center">{c.measured_h.toLocaleString()}</TableCell>
                      <TableCell className={`font-mono text-center ${deviationClass(c.planned_h, c.measured_h)}`}>
                        {deviation(c.planned_h, c.measured_h)}
                      </TableCell>
                      <TableCell className="font-mono text-center">{c.planned_d}</TableCell>
                      <TableCell className="font-mono text-center">{c.measured_d}</TableCell>
                      <TableCell className={`font-mono text-center ${deviationClass(c.planned_d, c.measured_d)}`}>
                        {deviation(c.planned_d, c.measured_d)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Measurement Detail Card ───────────────────────────── */}
      <Card className="border-primary/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Scaling className="h-4 w-4 text-primary" />
            פרטי מדידה — MSR-003 | בית חכם — הרצליה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Dimension Grid */}
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">רוחב פתח</p>
              <p className="text-xl font-bold font-mono text-blue-400">1,800 <span className="text-xs">מ״מ</span></p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">גובה פתח</p>
              <p className="text-xl font-bold font-mono text-blue-400">2,200 <span className="text-xs">מ״מ</span></p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">עומק</p>
              <p className="text-xl font-bold font-mono text-blue-400">140 <span className="text-xs">מ״מ</span></p>
            </div>
            <div className="bg-muted/30 rounded-lg p-3 text-center">
              <p className="text-[10px] text-muted-foreground">הפרש גובה רצפה</p>
              <p className="text-xl font-bold font-mono text-amber-400">8 <span className="text-xs">מ״מ</span></p>
            </div>
          </div>

          {/* Info Rows */}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <div className="flex justify-between border-b border-muted/30 pb-1">
                <span className="text-muted-foreground">לקוח:</span>
                <span className="font-medium">גולדשטיין ובניו</span>
              </div>
              <div className="flex justify-between border-b border-muted/30 pb-1">
                <span className="text-muted-foreground">כתובת:</span>
                <span className="font-medium">רח' סוקולוב 88, הרצליה</span>
              </div>
              <div className="flex justify-between border-b border-muted/30 pb-1">
                <span className="text-muted-foreground">מודד:</span>
                <span className="font-medium">אלון גולדשטיין</span>
              </div>
              <div className="flex justify-between border-b border-muted/30 pb-1">
                <span className="text-muted-foreground">תאריך מדידה:</span>
                <span className="font-mono">2026-03-25</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between border-b border-muted/30 pb-1">
                <span className="text-muted-foreground">יישור קירות:</span>
                <span className="font-medium text-amber-400">קיר צפוני נוטה 5 מ״מ</span>
              </div>
              <div className="flex justify-between border-b border-muted/30 pb-1">
                <span className="text-muted-foreground">אי-סדירויות:</span>
                <span className="font-medium text-red-400">הפרש גובה רצפה — דרוש פילוס</span>
              </div>
              <div className="flex justify-between border-b border-muted/30 pb-1">
                <span className="text-muted-foreground">תמונות מקושרות:</span>
                <span className="font-mono">6</span>
              </div>
              <div className="flex justify-between border-b border-muted/30 pb-1">
                <span className="text-muted-foreground">שרטוטים מקושרים:</span>
                <span className="font-mono">2</span>
              </div>
            </div>
          </div>

          {/* Photo Thumbnails Placeholder */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1"><Camera className="h-3 w-3" /> תמונות מצורפות (6)</p>
            <div className="grid grid-cols-6 gap-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="bg-muted/20 border border-dashed border-muted-foreground/30 rounded-md h-16 flex items-center justify-center">
                  <Image className="h-5 w-5 text-muted-foreground/40" />
                </div>
              ))}
            </div>
          </div>

          {/* Approval Workflow */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-2">תהליך אישור</p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-emerald-500/10 rounded-lg px-3 py-1.5">
                <CheckCircle className="h-4 w-4 text-emerald-400" />
                <div>
                  <p className="text-[10px] font-semibold text-emerald-300">מודד</p>
                  <p className="text-[9px] text-muted-foreground">אלון גולדשטיין — 25/03</p>
                </div>
              </div>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center gap-1.5 bg-amber-500/10 rounded-lg px-3 py-1.5 border border-amber-500/30">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <div>
                  <p className="text-[10px] font-semibold text-amber-300">מהנדס</p>
                  <p className="text-[9px] text-muted-foreground">ממתין לאישור</p>
                </div>
              </div>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              <div className="flex items-center gap-1.5 bg-muted/20 rounded-lg px-3 py-1.5">
                <XCircle className="h-4 w-4 text-muted-foreground/40" />
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground/60">ייצור</p>
                  <p className="text-[9px] text-muted-foreground">טרם הועבר</p>
                </div>
              </div>
            </div>
          </div>

          {/* Status Badges */}
          <div className="flex gap-3 pt-1">
            <Badge className="text-[9px] bg-amber-500/20 text-amber-300">אושר לייצור: ממתין</Badge>
            <Badge className="text-[9px] bg-red-500/20 text-red-300">דורש שינוי הזמנה: כן</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}