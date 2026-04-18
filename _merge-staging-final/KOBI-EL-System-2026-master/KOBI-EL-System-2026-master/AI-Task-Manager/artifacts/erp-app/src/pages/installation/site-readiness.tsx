import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ClipboardCheck, CheckCircle, XCircle, AlertTriangle, ShieldCheck,
  MapPin, Zap, Ruler, FileText, Package, Crane, HardHat, Clock,
  User, CalendarDays, Ban, ArrowUpCircle
} from "lucide-react";

/* ── Static mock data ─────────────────────────────────────────── */

const FALLBACK_SITES = [
  { id: "INS-101", project: "מגדלי אקרו — תל אביב", address: "רח' יגאל אלון 94, ת\"א", access: true, power: true, measurements: true, drawings: true, materials: true, crane: true, safety: true, score: 100, status: "מוכן" },
  { id: "INS-102", project: "פארק הייטק הרצליה — בניין C", address: "רח' המסגר 7, הרצליה פיתוח", access: true, power: true, measurements: true, drawings: true, materials: true, crane: true, safety: true, score: 100, status: "מוכן" },
  { id: "INS-103", project: "מגדל המשרדים — חיפה", address: "שד' העצמאות 33, חיפה", access: true, power: true, measurements: true, drawings: true, materials: false, crane: true, safety: true, score: 86, status: "חלקי" },
  { id: "INS-104", project: "פרויקט מגורים — רמת גן", address: "רח' בן גוריון 12, רמת גן", access: true, power: true, measurements: true, drawings: false, crane: true, materials: true, safety: true, score: 86, status: "חלקי" },
  { id: "INS-105", project: "קניון הים — נתניה", address: "רח' הרצל 55, נתניה", access: true, power: true, measurements: true, drawings: true, materials: true, crane: true, safety: true, score: 100, status: "מוכן" },
  { id: "INS-106", project: "בית הספר דרור — באר שבע", address: "שד' רגר 88, באר שבע", access: true, power: false, measurements: true, drawings: true, materials: false, crane: false, safety: true, score: 57, status: "חלקי" },
  { id: "INS-107", project: "מלון רויאל — אילת", address: "שד' התמרים 10, אילת", access: false, power: false, measurements: false, drawings: false, materials: false, crane: false, safety: false, score: 0, status: "לא מוכן" },
  { id: "INS-108", project: "מרכז רפואי — פתח תקווה", address: "רח' ז'בוטינסקי 40, פ\"ת", access: true, power: true, measurements: false, drawings: false, materials: false, crane: false, safety: false, score: 29, status: "לא מוכן" },
  { id: "INS-109", project: "מגדלי הים התיכון — אשדוד", address: "רח' הנמל 5, אשדוד", access: true, power: true, measurements: true, drawings: true, materials: true, crane: true, safety: true, score: 100, status: "מוכן" },
  { id: "INS-110", project: "משרדי חברת ענן — רעננה", address: "רח' אחוזה 120, רעננה", access: true, power: true, measurements: true, drawings: true, materials: true, crane: true, safety: true, score: 100, status: "מוכן" },
];

const FALLBACK_CHECKLIST_ITEMS = [
  { item: "סקר גישה לאתר — דרכי כניסה ופריקה", responsible: "יוסי כהן", due: "2026-04-01", status: "בוצע" },
  { item: "אישור חיבור חשמל זמני 32A", responsible: "דוד מזרחי", due: "2026-04-02", status: "בוצע" },
  { item: "מדידות שטח — אימות מול שרטוטים", responsible: "שרה לוי", due: "2026-04-03", status: "בוצע" },
  { item: "עדכון שרטוטי ייצור (Rev D)", responsible: "אלון גולדשטיין", due: "2026-04-03", status: "בוצע" },
  { item: "חומרים הגיעו למחסן אתר", responsible: "עומר חדד", due: "2026-04-05", status: "ממתין" },
  { item: "בדיקת ציוד הרמה — מנוף 20 טון", responsible: "נועה פרידמן", due: "2026-04-06", status: "בוצע" },
  { item: "אישור בטיחות מהנדס קונסטרוקציה", responsible: "רחל אברהם", due: "2026-04-04", status: "בוצע" },
  { item: "תיאום עם קבלן ראשי — חלון זמן", responsible: "איתן רוזנברג", due: "2026-04-05", status: "בוצע" },
  { item: "סימון נקודות עיגון בקומות 3-7", responsible: "תמר שלום", due: "2026-04-06", status: "ממתין" },
  { item: "פיגום חיצוני — בדיקת יציבות", responsible: "מיכל ברק", due: "2026-04-07", status: "לא התחיל" },
  { item: "ביטוח קבלני — אישור בתוקף", responsible: "אורי דהן", due: "2026-04-02", status: "בוצע" },
  { item: "תדריך בטיחות לצוות מתקינים", responsible: "גל שפירא", due: "2026-04-08", status: "לא התחיל" },
];

const FALLBACK_BLOCKING_ISSUES = [
  { id: "BLK-01", site: "INS-107", project: "מלון רויאל — אילת", issue: "אתר סגור — עבודות שלד טרם הושלמו", severity: "קריטי", type: "גישה", responsible: "ניר אשכנזי", deadline: "2026-04-20" },
  { id: "BLK-02", site: "INS-108", project: "מרכז רפואי — פתח תקווה", issue: "מדידות לא תואמות — הפרש 8 ס\"מ בפתחים", severity: "גבוה", type: "מדידות", responsible: "שרה לוי", deadline: "2026-04-12" },
  { id: "BLK-03", site: "INS-106", project: "בית הספר דרור — באר שבע", issue: "חיבור חשמל זמני לא אושר ע\"י חח\"י", severity: "גבוה", type: "חשמל", responsible: "דוד מזרחי", deadline: "2026-04-14" },
  { id: "BLK-04", site: "INS-103", project: "מגדל המשרדים — חיפה", issue: "חומרי איטום חסרים — עיכוב באספקה מספק", severity: "בינוני", type: "חומרים", responsible: "עומר חדד", deadline: "2026-04-11" },
  { id: "BLK-05", site: "INS-108", project: "מרכז רפואי — פתח תקווה", issue: "אישור בטיחות קונסטרוקציה — ממתין לחתימה", severity: "גבוה", type: "בטיחות", responsible: "רחל אברהם", deadline: "2026-04-13" },
];

/* ── Helpers ───────────────────────────────────────────────────── */

const statusColor: Record<string, string> = {
  "מוכן": "bg-emerald-500/20 text-emerald-300",
  "חלקי": "bg-amber-500/20 text-amber-300",
  "לא מוכן": "bg-red-500/20 text-red-300",
  "ממתין לבדיקה": "bg-blue-500/20 text-blue-300",
};

const checkStatusColor: Record<string, string> = {
  "בוצע": "bg-emerald-500/20 text-emerald-300",
  "ממתין": "bg-amber-500/20 text-amber-300",
  "לא התחיל": "bg-red-500/20 text-red-300",
};

const severityColor: Record<string, string> = {
  "קריטי": "bg-red-600/20 text-red-300",
  "גבוה": "bg-red-500/20 text-red-300",
  "בינוני": "bg-amber-500/20 text-amber-300",
  "נמוך": "bg-blue-500/20 text-blue-300",
};

const scoreColor = (score: number) =>
  score >= 85 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";

const progressColor = (score: number) =>
  score >= 85 ? "[&>div]:bg-emerald-500" : score >= 50 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500";

const Check = ({ ok }: { ok: boolean }) =>
  ok ? <CheckCircle className="h-4 w-4 text-emerald-400 mx-auto" /> : <XCircle className="h-4 w-4 text-red-400 mx-auto" />;

/* ── KPI summary ──────────────────────────────────────────────── */

const FALLBACK_KPI_DATA = [
  { label: "אתרים מוכנים", value: FALLBACK_SITES.filter(s => s.status === "מוכן").length, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "חלקית", value: FALLBACK_SITES.filter(s => s.status === "חלקי").length, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "לא מוכנים", value: FALLBACK_SITES.filter(s => s.status === "לא מוכן").length, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "ממתינים לבדיקה", value: 2, icon: ClipboardCheck, color: "text-blue-400", bg: "bg-blue-500/10" },
];

/* ── Component ────────────────────────────────────────────────── */

export default function SiteReadiness() {
  const { data: sites = FALLBACK_SITES } = useQuery({
    queryKey: ["installation-sites"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/site-readiness/sites");
      if (!res.ok) return FALLBACK_SITES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SITES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: checklistItems = FALLBACK_CHECKLIST_ITEMS } = useQuery({
    queryKey: ["installation-checklist-items"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/site-readiness/checklist-items");
      if (!res.ok) return FALLBACK_CHECKLIST_ITEMS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_CHECKLIST_ITEMS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: blockingIssues = FALLBACK_BLOCKING_ISSUES } = useQuery({
    queryKey: ["installation-blocking-issues"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/site-readiness/blocking-issues");
      if (!res.ok) return FALLBACK_BLOCKING_ISSUES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_BLOCKING_ISSUES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: kpiData = FALLBACK_KPI_DATA } = useQuery({
    queryKey: ["installation-kpi-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/site-readiness/kpi-data");
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
          <ClipboardCheck className="h-7 w-7 text-primary" /> מוכנות אתר
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — בדיקת מוכנות אתרים להתקנה | צ'קליסט | חסימות
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3">
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
      <Tabs defaultValue="sites">
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="sites" className="text-xs gap-1"><MapPin className="h-3.5 w-3.5" /> מפת אתרים</TabsTrigger>
          <TabsTrigger value="checklist" className="text-xs gap-1"><ClipboardCheck className="h-3.5 w-3.5" /> צ'קליסט מפורט</TabsTrigger>
          <TabsTrigger value="blocking" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> חסימות</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Sites Table ──────────────────────────────── */}
        <TabsContent value="sites">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מזהה התקנה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">כתובת</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">גישה לאתר</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">חשמל זמין</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">מדידות אושרו</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">שרטוטים מעודכנים</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">חומרים באתר</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">ציוד הרמה</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">אישור בטיחות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold w-28">ציון מוכנות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sites.map((s) => (
                    <TableRow key={s.id} className="hover:bg-muted/20 text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{s.id}</TableCell>
                      <TableCell className="font-medium">{s.project}</TableCell>
                      <TableCell className="text-muted-foreground text-[11px]">{s.address}</TableCell>
                      <TableCell className="text-center"><Check ok={s.access} /></TableCell>
                      <TableCell className="text-center"><Check ok={s.power} /></TableCell>
                      <TableCell className="text-center"><Check ok={s.measurements} /></TableCell>
                      <TableCell className="text-center"><Check ok={s.drawings} /></TableCell>
                      <TableCell className="text-center"><Check ok={s.materials} /></TableCell>
                      <TableCell className="text-center"><Check ok={s.crane} /></TableCell>
                      <TableCell className="text-center"><Check ok={s.safety} /></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={s.score} className={`h-2 flex-1 ${progressColor(s.score)}`} />
                          <span className={`text-xs font-mono font-bold ${scoreColor(s.score)}`}>{s.score}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${statusColor[s.status] || "bg-gray-500/20 text-gray-300"} text-[10px] border-0`}>
                          {s.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Readiness Checklist Detail ───────────────── */}
        <TabsContent value="checklist">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <HardHat className="h-5 w-5 text-primary" />
                צ'קליסט מוכנות — INS-103 מגדל המשרדים — חיפה
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                ציון מוכנות: <span className="text-amber-400 font-bold">86%</span> — סטטוס: <Badge className="bg-amber-500/20 text-amber-300 text-[10px] border-0 mr-1">חלקי</Badge>
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold w-8">#</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פריט בדיקה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אחראי</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך יעד</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checklistItems.map((c, i) => (
                    <TableRow key={i} className="hover:bg-muted/20 text-xs">
                      <TableCell className="font-mono text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {c.status === "בוצע" ? (
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          ) : c.status === "ממתין" ? (
                            <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                          ) : (
                            <Ban className="h-3.5 w-3.5 text-red-400 shrink-0" />
                          )}
                          {c.item}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {c.responsible}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <CalendarDays className="h-3 w-3" />
                          {c.due}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${checkStatusColor[c.status] || "bg-gray-500/20 text-gray-300"} text-[10px] border-0`}>
                          {c.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Summary strip under checklist */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <Card className="bg-emerald-500/10 border-0">
              <CardContent className="pt-3 pb-2 text-center">
                <p className="text-[10px] text-muted-foreground">בוצעו</p>
                <p className="text-xl font-bold font-mono text-emerald-400">{checklistItems.filter(c => c.status === "בוצע").length}</p>
              </CardContent>
            </Card>
            <Card className="bg-amber-500/10 border-0">
              <CardContent className="pt-3 pb-2 text-center">
                <p className="text-[10px] text-muted-foreground">ממתינים</p>
                <p className="text-xl font-bold font-mono text-amber-400">{checklistItems.filter(c => c.status === "ממתין").length}</p>
              </CardContent>
            </Card>
            <Card className="bg-red-500/10 border-0">
              <CardContent className="pt-3 pb-2 text-center">
                <p className="text-[10px] text-muted-foreground">לא התחילו</p>
                <p className="text-xl font-bold font-mono text-red-400">{checklistItems.filter(c => c.status === "לא התחיל").length}</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 3: Blocking Issues ──────────────────────────── */}
        <TabsContent value="blocking">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-400" />
                חסימות המונעות תחילת התקנה
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {blockingIssues.length} חסימות פתוחות — {blockingIssues.filter(b => b.severity === "קריטי").length} קריטיות
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מזהה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אתר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תיאור חסימה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">חומרה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אחראי</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">דדליין</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blockingIssues.map((b) => (
                    <TableRow key={b.id} className="hover:bg-muted/20 text-xs">
                      <TableCell className="font-mono font-semibold text-red-400">{b.id}</TableCell>
                      <TableCell>
                        <span className="font-mono text-primary">{b.site}</span>
                        <span className="text-muted-foreground mr-1 text-[10px]">({b.project})</span>
                      </TableCell>
                      <TableCell className="font-medium max-w-xs">{b.issue}</TableCell>
                      <TableCell>
                        <Badge className={`${severityColor[b.severity] || "bg-gray-500/20 text-gray-300"} text-[10px] border-0`}>
                          <ArrowUpCircle className="h-3 w-3 ml-0.5" />
                          {b.severity}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">{b.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {b.responsible}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <CalendarDays className="h-3 w-3" />
                          {b.deadline}
                        </div>
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
