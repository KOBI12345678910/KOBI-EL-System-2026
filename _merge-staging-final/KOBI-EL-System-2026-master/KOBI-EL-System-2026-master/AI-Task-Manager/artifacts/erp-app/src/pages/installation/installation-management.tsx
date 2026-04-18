import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  HardHat, ClipboardList, Users, AlertTriangle, FileCheck, Camera,
  MapPin, Calendar, CheckCircle, XCircle, Zap, Wrench, Package, Clock
} from "lucide-react";

/* ── Static mock data ─────────────────────────────────────────── */

const FALLBACK_INSTALLATION_ORDERS = [
  { id: "INS-001", project: "מגדלי הים — חיפה", product: "חלונות אלומיניום Premium", address: "שד' הנשיא 45, חיפה", crew: "צוות אלפא", scheduled: "2026-04-10", status: "בביצוע", pct: 65 },
  { id: "INS-002", project: "פארק המדע — רחובות", product: "ויטרינות חזית 3m", address: "רח' הרצל 12, רחובות", crew: "צוות בטא", scheduled: "2026-04-11", status: "מתוכנן", pct: 0 },
  { id: "INS-003", project: "בית חכם — הרצליה", product: "דלתות הזזה חשמליות", address: "רח' סוקולוב 88, הרצליה", crew: "צוות גמא", scheduled: "2026-04-09", status: "הושלם", pct: 100 },
  { id: "INS-004", project: "מלון ים התיכון", product: "מעקות זכוכית קומה 12", address: "רח' הירקון 200, ת\"א", crew: "צוות אלפא", scheduled: "2026-04-13", status: "מתוכנן", pct: 0 },
  { id: "INS-005", project: "קניון הדרום — באר שבע", product: "פרגולות אלומיניום", address: "שד' רגר 50, ב\"ש", crew: "צוות דלתא", scheduled: "2026-04-08", status: "בביצוע", pct: 40 },
  { id: "INS-006", project: "משרדי הייטק — הרצליה פיתוח", product: "מחיצות זכוכית משרדיות", address: "רח' המסגר 5, הרצליה", crew: "צוות בטא", scheduled: "2026-04-14", status: "מתוכנן", pct: 0 },
  { id: "INS-007", project: "בניין מגורים — נתניה", product: "חלונות דגם Comfort", address: "רח' שמואלי 22, נתניה", crew: "צוות גמא", scheduled: "2026-04-12", status: "חריגה", pct: 30 },
  { id: "INS-008", project: "מרכז ספורט — ראשל\"צ", product: "דלתות אש + מסגרות", address: "רח' ביאליק 15, ראשל\"צ", crew: "צוות דלתא", scheduled: "2026-04-07", status: "הושלם", pct: 100 },
];

const FALLBACK_SITE_READINESS = [
  { insId: "INS-001", project: "מגדלי הים — חיפה", access: true, power: true, measurements: true, drawings: true, materials: false },
  { insId: "INS-002", project: "פארק המדע — רחובות", access: true, power: false, measurements: true, drawings: true, materials: true },
  { insId: "INS-004", project: "מלון ים התיכון", access: false, power: false, measurements: true, drawings: false, materials: false },
  { insId: "INS-005", project: "קניון הדרום — באר שבע", access: true, power: true, measurements: true, drawings: true, materials: true },
  { insId: "INS-006", project: "משרדי הייטק — הרצליה פיתוח", access: true, power: true, measurements: false, drawings: true, materials: false },
  { insId: "INS-007", project: "בניין מגורים — נתניה", access: true, power: true, measurements: true, drawings: true, materials: true },
];

const FALLBACK_CREWS = [
  { name: "צוות אלפא", members: "יוסי כהן, דוד מזרחי, אלון גולדשטיין", currentJob: "INS-001", nextJob: "INS-004", availability: "תפוס" },
  { name: "צוות בטא", members: "שרה לוי, עומר חדד, נועה פרידמן", currentJob: "—", nextJob: "INS-002", availability: "זמין" },
  { name: "צוות גמא", members: "רחל אברהם, איתן רוזנברג, תמר שלום", currentJob: "INS-007", nextJob: "—", availability: "תפוס" },
  { name: "צוות דלתא", members: "מיכל ברק, אורי דהן, גל שפירא", currentJob: "INS-005", nextJob: "—", availability: "תפוס" },
  { name: "צוות אפסילון", members: "ניר אשכנזי, הדר כץ, רועי לב", currentJob: "—", nextJob: "—", availability: "זמין" },
  { name: "צוות זטא", members: "ליאור בן-דוד, מאיה פרץ, טל רון", currentJob: "—", nextJob: "—", availability: "חופשה" },
];

const FALLBACK_DEVIATIONS = [
  { insId: "INS-007", issue: "פתח קיר צר מהתוכנית ב-4 ס\"מ", severity: "גבוהה", photo: true, resolution: "ממתין לאישור מהנדס" },
  { insId: "INS-001", issue: "נקודת חשמל חסרה בקיר צפוני", severity: "בינונית", photo: true, resolution: "חשמלאי תואם ל-09/04" },
  { insId: "INS-005", issue: "רצפה לא מיושרת — הפרש 1.5 ס\"מ", severity: "נמוכה", photo: false, resolution: "פילוס מקומי בוצע" },
  { insId: "INS-007", issue: "חומר איטום לא תואם מפרט", severity: "גבוהה", photo: true, resolution: "הוזמן חומר חלופי" },
  { insId: "INS-001", issue: "גישה חסומה לקומה 7 — מנוף", severity: "בינונית", photo: false, resolution: "תואם עם קבלן ראשי" },
  { insId: "INS-005", issue: "מידות משקוף שונות מתוכנית", severity: "נמוכה", photo: true, resolution: "התאמה בשטח בוצעה" },
];

const FALLBACK_CUSTOMER_SIGNOFFS = [
  { project: "בית חכם — הרצליה", date: "2026-04-09", signedBy: "אבי רוזנפלד", notes: "התקנה מעולה, בלי הערות", status: "אושר" },
  { project: "מרכז ספורט — ראשל\"צ", date: "2026-04-07", signedBy: "דנה כהן-מלמד", notes: "דלת אש #3 — ציר צריך כיוון", status: "אושר עם הערות" },
  { project: "מגדלי הים — חיפה", date: "—", signedBy: "—", notes: "ממתין להשלמת התקנה", status: "ממתין" },
  { project: "קניון הדרום — באר שבע", date: "—", signedBy: "—", notes: "ממתין להשלמת התקנה", status: "ממתין" },
  { project: "פארק המדע — רחובות", date: "—", signedBy: "—", notes: "טרם החל", status: "ממתין" },
  { project: "בניין מגורים — נתניה", date: "—", signedBy: "—", notes: "חריגה פתוחה — לא ניתן לאשר", status: "חסום" },
];

/* ── Helpers ───────────────────────────────────────────────────── */

const statusColor: Record<string, string> = {
  "בביצוע": "bg-yellow-500/20 text-yellow-300",
  "מתוכנן": "bg-blue-500/20 text-blue-300",
  "הושלם": "bg-emerald-500/20 text-emerald-300",
  "חריגה": "bg-red-500/20 text-red-300",
};

const availColor: Record<string, string> = {
  "זמין": "bg-emerald-500/20 text-emerald-300",
  "תפוס": "bg-yellow-500/20 text-yellow-300",
  "חופשה": "bg-gray-500/20 text-gray-400",
};

const sevColor: Record<string, string> = {
  "גבוהה": "bg-red-500/20 text-red-300",
  "בינונית": "bg-amber-500/20 text-amber-300",
  "נמוכה": "bg-blue-500/20 text-blue-300",
};

const signoffColor: Record<string, string> = {
  "אושר": "bg-emerald-500/20 text-emerald-300",
  "אושר עם הערות": "bg-amber-500/20 text-amber-300",
  "ממתין": "bg-blue-500/20 text-blue-300",
  "חסום": "bg-red-500/20 text-red-300",
};

const Check = ({ ok }: { ok: boolean }) =>
  ok ? <CheckCircle className="h-4 w-4 text-emerald-400 mx-auto" /> : <XCircle className="h-4 w-4 text-red-400 mx-auto" />;

/* ── KPI cards ────────────────────────────────────────────────── */

const FALLBACK_KPI_DATA = [
  { label: "התקנות פעילות", value: FALLBACK_INSTALLATION_ORDERS.filter(o => o.status === "בביצוע").length, icon: HardHat, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "מתוכננות השבוע", value: FALLBACK_INSTALLATION_ORDERS.filter(o => o.status === "מתוכנן").length, icon: Calendar, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "הושלמו החודש", value: FALLBACK_INSTALLATION_ORDERS.filter(o => o.status === "הושלם").length, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "צוותים זמינים", value: FALLBACK_CREWS.filter(c => c.availability === "זמין").length, icon: Users, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "חריגות פתוחות", value: FALLBACK_DEVIATIONS.length, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "אישורים ממתינים", value: FALLBACK_CUSTOMER_SIGNOFFS.filter(s => s.status === "ממתין" || s.status === "חסום").length, icon: FileCheck, color: "text-orange-400", bg: "bg-orange-500/10" },
];

/* ── Component ────────────────────────────────────────────────── */

export default function InstallationManagement() {
  const { data: installationOrders = FALLBACK_INSTALLATION_ORDERS } = useQuery({
    queryKey: ["installation-installation-orders"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-management/installation-orders");
      if (!res.ok) return FALLBACK_INSTALLATION_ORDERS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_INSTALLATION_ORDERS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: siteReadiness = FALLBACK_SITE_READINESS } = useQuery({
    queryKey: ["installation-site-readiness"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-management/site-readiness");
      if (!res.ok) return FALLBACK_SITE_READINESS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SITE_READINESS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: crews = FALLBACK_CREWS } = useQuery({
    queryKey: ["installation-crews"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-management/crews");
      if (!res.ok) return FALLBACK_CREWS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_CREWS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: deviations = FALLBACK_DEVIATIONS } = useQuery({
    queryKey: ["installation-deviations"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-management/deviations");
      if (!res.ok) return FALLBACK_DEVIATIONS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DEVIATIONS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: customerSignoffs = FALLBACK_CUSTOMER_SIGNOFFS } = useQuery({
    queryKey: ["installation-customer-signoffs"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-management/customer-signoffs");
      if (!res.ok) return FALLBACK_CUSTOMER_SIGNOFFS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_CUSTOMER_SIGNOFFS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: kpiData = FALLBACK_KPI_DATA } = useQuery({
    queryKey: ["installation-kpi-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-management/kpi-data");
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
          <HardHat className="h-7 w-7 text-primary" /> ניהול התקנות
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — הזמנות | מוכנות אתר | צוותים | חריגות | אישורי לקוח
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
      <Tabs defaultValue="orders">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="orders" className="text-xs gap-1"><ClipboardList className="h-3.5 w-3.5" /> התקנות</TabsTrigger>
          <TabsTrigger value="readiness" className="text-xs gap-1"><Zap className="h-3.5 w-3.5" /> מוכנות</TabsTrigger>
          <TabsTrigger value="crews" className="text-xs gap-1"><Users className="h-3.5 w-3.5" /> צוותים</TabsTrigger>
          <TabsTrigger value="deviations" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> חריגות</TabsTrigger>
          <TabsTrigger value="signoffs" className="text-xs gap-1"><FileCheck className="h-3.5 w-3.5" /> אישורים</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Installation Orders ───────────────────────── */}
        <TabsContent value="orders">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מס׳</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מוצר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">כתובת</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">צוות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך מתוכנן</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold w-24">התקדמות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installationOrders.map((o) => (
                    <TableRow key={o.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{o.id}</TableCell>
                      <TableCell>{o.project}</TableCell>
                      <TableCell className="text-muted-foreground">{o.product}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{o.address}</span>
                      </TableCell>
                      <TableCell>{o.crew}</TableCell>
                      <TableCell className="font-mono">{o.scheduled}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={o.pct} className="h-1.5 flex-1" />
                          <span className="text-[10px] font-mono w-8 text-left">{o.pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${statusColor[o.status] || "bg-gray-500/20 text-gray-300"}`}>{o.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Site Readiness ────────────────────────────── */}
        <TabsContent value="readiness">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" /> בדיקת מוכנות אתר
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">התקנה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">גישה</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">חשמל</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">מידות</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">תוכניות</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">חומרים</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">מוכנות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {siteReadiness.map((s) => {
                    const total = [s.access, s.power, s.measurements, s.drawings, s.materials].filter(Boolean).length;
                    const allReady = total === 5;
                    return (
                      <TableRow key={s.insId} className="text-xs">
                        <TableCell className="font-mono font-semibold text-primary">{s.insId}</TableCell>
                        <TableCell>{s.project}</TableCell>
                        <TableCell><Check ok={s.access} /></TableCell>
                        <TableCell><Check ok={s.power} /></TableCell>
                        <TableCell><Check ok={s.measurements} /></TableCell>
                        <TableCell><Check ok={s.drawings} /></TableCell>
                        <TableCell><Check ok={s.materials} /></TableCell>
                        <TableCell className="text-center">
                          <Badge className={`text-[9px] ${allReady ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                            {total}/5
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Crew Assignment ───────────────────────────── */}
        <TabsContent value="crews">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-400" /> שיבוץ צוותים
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">שם צוות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">חברי צוות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">עבודה נוכחית</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">עבודה הבאה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">זמינות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crews.map((c) => (
                    <TableRow key={c.name} className="text-xs">
                      <TableCell className="font-semibold">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.members}</TableCell>
                      <TableCell className="font-mono">{c.currentJob}</TableCell>
                      <TableCell className="font-mono">{c.nextJob}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${availColor[c.availability] || "bg-gray-500/20 text-gray-300"}`}>{c.availability}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Deviations ────────────────────────────────── */}
        <TabsContent value="deviations">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" /> חריגות באתר
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">התקנה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תיאור חריגה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">חומרה</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">תמונה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">טיפול / פתרון</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deviations.map((d, i) => (
                    <TableRow key={i} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{d.insId}</TableCell>
                      <TableCell>{d.issue}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${sevColor[d.severity] || "bg-gray-500/20 text-gray-300"}`}>{d.severity}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {d.photo ? <Camera className="h-4 w-4 text-sky-400 mx-auto" /> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{d.resolution}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 5: Customer Signoffs ─────────────────────────── */}
        <TabsContent value="signoffs">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-emerald-400" /> אישורי לקוח
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">חתום ע״י</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">הערות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerSignoffs.map((s, i) => (
                    <TableRow key={i} className="text-xs">
                      <TableCell className="font-semibold">{s.project}</TableCell>
                      <TableCell className="font-mono">{s.date}</TableCell>
                      <TableCell>{s.signedBy}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">{s.notes}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${signoffColor[s.status] || "bg-gray-500/20 text-gray-300"}`}>{s.status}</Badge>
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
