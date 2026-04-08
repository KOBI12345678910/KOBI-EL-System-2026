import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Camera, Image, ClipboardCheck, ShieldCheck, AlertTriangle,
  Upload, Download, Eye, Calendar, User, HardDrive, FolderOpen,
  CheckCircle, XCircle, Clock, Pencil
} from "lucide-react";

/* ── Static mock data ─────────────────────────────────────────── */

const FALLBACK_DOCUMENT_TYPES = [
  { name: "פרוטוקול מסירה", count: 12, icon: ClipboardCheck, color: "text-blue-400", bg: "bg-blue-500/10", type: "מסמך" },
  { name: "דו\"ח בקרת איכות", count: 18, icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/10", type: "מסמך" },
  { name: "טופס חריגה", count: 8, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", type: "מסמך" },
  { name: "תמונות לפני התקנה", count: 34, icon: Camera, color: "text-amber-400", bg: "bg-amber-500/10", type: "תמונה" },
  { name: "תמונות אחרי התקנה", count: 55, icon: Image, color: "text-purple-400", bg: "bg-purple-500/10", type: "תמונה" },
  { name: "אישור לקוח חתום", count: 10, icon: CheckCircle, color: "text-teal-400", bg: "bg-teal-500/10", type: "מסמך" },
  { name: "דו\"ח בטיחות", count: 6, icon: ShieldCheck, color: "text-orange-400", bg: "bg-orange-500/10", type: "מסמך" },
  { name: "שרטוטי As-Built", count: 4, icon: Pencil, color: "text-cyan-400", bg: "bg-cyan-500/10", type: "מסמך" },
];

const FALLBACK_DOCUMENTS = [
  { id: "DOC-101", docType: "פרוטוקול מסירה", insId: "INS-003", project: "בית חכם — הרצליה", uploadDate: "2026-04-09", uploadedBy: "יוסי כהן", fileSize: "1.2MB", status: "מאושר" },
  { id: "DOC-102", docType: "דו\"ח בקרת איכות", insId: "INS-001", project: "מגדלי הים — חיפה", uploadDate: "2026-04-08", uploadedBy: "שרה לוי", fileSize: "3.4MB", status: "סופי" },
  { id: "DOC-103", docType: "טופס חריגה", insId: "INS-007", project: "בניין מגורים — נתניה", uploadDate: "2026-04-07", uploadedBy: "רחל אברהם", fileSize: "0.8MB", status: "סופי" },
  { id: "DOC-104", docType: "אישור לקוח חתום", insId: "INS-003", project: "בית חכם — הרצליה", uploadDate: "2026-04-09", uploadedBy: "אבי רוזנפלד", fileSize: "2.1MB", status: "מאושר" },
  { id: "DOC-105", docType: "דו\"ח בטיחות", insId: "INS-005", project: "קניון הדרום — באר שבע", uploadDate: "2026-04-06", uploadedBy: "מיכל ברק", fileSize: "1.7MB", status: "טיוטה" },
  { id: "DOC-106", docType: "שרטוטי As-Built", insId: "INS-008", project: "מרכז ספורט — ראשל\"צ", uploadDate: "2026-04-07", uploadedBy: "אורי דהן", fileSize: "5.6MB", status: "מאושר" },
  { id: "DOC-107", docType: "פרוטוקול מסירה", insId: "INS-008", project: "מרכז ספורט — ראשל\"צ", uploadDate: "2026-04-07", uploadedBy: "גל שפירא", fileSize: "1.4MB", status: "מאושר" },
  { id: "DOC-108", docType: "דו\"ח בקרת איכות", insId: "INS-005", project: "קניון הדרום — באר שבע", uploadDate: "2026-04-05", uploadedBy: "טל רון", fileSize: "2.8MB", status: "סופי" },
  { id: "DOC-109", docType: "טופס חריגה", insId: "INS-001", project: "מגדלי הים — חיפה", uploadDate: "2026-04-04", uploadedBy: "דוד מזרחי", fileSize: "0.6MB", status: "סופי" },
  { id: "DOC-110", docType: "דו\"ח בקרת איכות", insId: "INS-003", project: "בית חכם — הרצליה", uploadDate: "2026-04-09", uploadedBy: "נועה פרידמן", fileSize: "4.1MB", status: "מאושר" },
  { id: "DOC-111", docType: "דו\"ח בטיחות", insId: "INS-001", project: "מגדלי הים — חיפה", uploadDate: "2026-04-03", uploadedBy: "אלון גולדשטיין", fileSize: "1.9MB", status: "טיוטה" },
  { id: "DOC-112", docType: "אישור לקוח חתום", insId: "INS-008", project: "מרכז ספורט — ראשל\"צ", uploadDate: "2026-04-07", uploadedBy: "דנה כהן-מלמד", fileSize: "1.1MB", status: "מאושר" },
  { id: "DOC-113", docType: "פרוטוקול מסירה", insId: "INS-005", project: "קניון הדרום — באר שבע", uploadDate: "2026-04-06", uploadedBy: "מיכל ברק", fileSize: "1.3MB", status: "חסר" },
  { id: "DOC-114", docType: "שרטוטי As-Built", insId: "INS-001", project: "מגדלי הים — חיפה", uploadDate: "2026-04-02", uploadedBy: "הדר כץ", fileSize: "6.2MB", status: "טיוטה" },
  { id: "DOC-115", docType: "דו\"ח בקרת איכות", insId: "INS-007", project: "בניין מגורים — נתניה", uploadDate: "2026-04-06", uploadedBy: "איתן רוזנברג", fileSize: "3.0MB", status: "סופי" },
];

const FALLBACK_PHOTO_GALLERY = [
  { insId: "INS-001", date: "2026-04-02", desc: "קיר צפוני — מצב מבנה קיים", label: "לפני", size: "4.2MB" },
  { insId: "INS-001", date: "2026-04-08", desc: "קיר צפוני — חלונות מותקנים", label: "אחרי", size: "3.8MB" },
  { insId: "INS-003", date: "2026-03-28", desc: "פתח דלת הזזה — מדידות", label: "לפני", size: "2.9MB" },
  { insId: "INS-003", date: "2026-04-09", desc: "דלת הזזה חשמלית — הושלם", label: "אחרי", size: "3.5MB" },
  { insId: "INS-005", date: "2026-04-01", desc: "גג פרגולה — יציקת בסיס", label: "לפני", size: "5.1MB" },
  { insId: "INS-005", date: "2026-04-06", desc: "פרגולה — שלד אלומיניום מורכב", label: "אחרי", size: "4.7MB" },
  { insId: "INS-007", date: "2026-04-03", desc: "חדר שינה — פתח חלון לא תקני", label: "לפני", size: "2.4MB" },
  { insId: "INS-007", date: "2026-04-07", desc: "חדר שינה — חלון מותאם מותקן", label: "אחרי", size: "3.1MB" },
  { insId: "INS-008", date: "2026-03-30", desc: "מבואת כניסה — מסגרת דלת אש", label: "לפני", size: "2.6MB" },
  { insId: "INS-008", date: "2026-04-07", desc: "מבואה — דלת אש + חיווי", label: "אחרי", size: "3.3MB" },
  { insId: "INS-002", date: "2026-04-01", desc: "חזית מבנה — ויטרינה קיימת", label: "לפני", size: "4.0MB" },
  { insId: "INS-004", date: "2026-04-05", desc: "מרפסת קומה 12 — הכנה למעקה", label: "לפני", size: "3.6MB" },
];

const FALLBACK_MISSING_DOCUMENTS = [
  { insId: "INS-001", project: "מגדלי הים — חיפה", missingDoc: "פרוטוקול מסירה", daysOverdue: 0, urgency: "בינונית", note: "ממתין להשלמת התקנה" },
  { insId: "INS-002", project: "פארק המדע — רחובות", missingDoc: "דו\"ח בקרת איכות", daysOverdue: 3, urgency: "גבוהה", note: "התקנה טרם החלה — נדרש QC מקדים" },
  { insId: "INS-004", project: "מלון ים התיכון", missingDoc: "דו\"ח בטיחות", daysOverdue: 5, urgency: "קריטית", note: "חובה לפני עבודה בגובה קומה 12" },
  { insId: "INS-005", project: "קניון הדרום — באר שבע", missingDoc: "אישור לקוח חתום", daysOverdue: 2, urgency: "גבוהה", note: "לקוח ביקש דחייה עד 10/04" },
  { insId: "INS-006", project: "משרדי הייטק — הרצליה פיתוח", missingDoc: "שרטוטי As-Built", daysOverdue: 7, urgency: "קריטית", note: "אדריכל דורש לפני מסירה סופית" },
];

/* ── Helpers ───────────────────────────────────────────────────── */

const statusColor: Record<string, string> = {
  "טיוטה": "bg-gray-500/20 text-gray-300",
  "סופי": "bg-blue-500/20 text-blue-300",
  "מאושר": "bg-emerald-500/20 text-emerald-300",
  "חסר": "bg-red-500/20 text-red-300",
};

const labelColor: Record<string, string> = {
  "לפני": "bg-amber-500/20 text-amber-300",
  "אחרי": "bg-emerald-500/20 text-emerald-300",
};

const urgencyColor: Record<string, string> = {
  "קריטית": "bg-red-500/20 text-red-300",
  "גבוהה": "bg-amber-500/20 text-amber-300",
  "בינונית": "bg-blue-500/20 text-blue-300",
};

/* ── KPI cards ────────────────────────────────────────────────── */

const FALLBACK_KPI_DATA = [
  { label: "מסמכים כוללים", value: 145, icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "תמונות שטח", value: 89, icon: Camera, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "פרוטוקולי מסירה", value: 14, icon: ClipboardCheck, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "דו\"חות QC", value: 18, icon: ShieldCheck, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "חסרים", value: 5, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
];

/* ── Component ────────────────────────────────────────────────── */

export default function InstallationDocuments() {
  const { data: documentTypes = FALLBACK_DOCUMENT_TYPES } = useQuery({
    queryKey: ["installation-document-types"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-documents/document-types");
      if (!res.ok) return FALLBACK_DOCUMENT_TYPES;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DOCUMENT_TYPES;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: documents = FALLBACK_DOCUMENTS } = useQuery({
    queryKey: ["installation-documents"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-documents/documents");
      if (!res.ok) return FALLBACK_DOCUMENTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DOCUMENTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: photoGallery = FALLBACK_PHOTO_GALLERY } = useQuery({
    queryKey: ["installation-photo-gallery"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-documents/photo-gallery");
      if (!res.ok) return FALLBACK_PHOTO_GALLERY;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_PHOTO_GALLERY;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: missingDocuments = FALLBACK_MISSING_DOCUMENTS } = useQuery({
    queryKey: ["installation-missing-documents"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-documents/missing-documents");
      if (!res.ok) return FALLBACK_MISSING_DOCUMENTS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_MISSING_DOCUMENTS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: kpiData = FALLBACK_KPI_DATA } = useQuery({
    queryKey: ["installation-kpi-data"],
    queryFn: async () => {
      const res = await authFetch("/api/installation/installation-documents/kpi-data");
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
          <FileText className="h-7 w-7 text-primary" /> מסמכים ותיעוד התקנה
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — מסמכים | תמונות שטח | פרוטוקולים | בקרת איכות | מעקב חוסרים
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

      {/* Document Types Grid */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-primary" /> סוגי מסמכים
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {documentTypes.map((dt, i) => {
              const Icon = dt.icon;
              return (
                <div key={i} className={`${dt.bg} rounded-lg p-3 flex items-center gap-3`}>
                  <Icon className={`h-8 w-8 ${dt.color} shrink-0`} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">{dt.name}</p>
                    <p className={`text-lg font-bold font-mono ${dt.color}`}>{dt.count}</p>
                    <p className="text-[10px] text-muted-foreground">{dt.type === "תמונה" ? "תמונות" : "מסמכים"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="documents">
        <TabsList className="grid grid-cols-3 w-full max-w-lg">
          <TabsTrigger value="documents" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" /> מסמכים</TabsTrigger>
          <TabsTrigger value="photos" className="text-xs gap-1"><Camera className="h-3.5 w-3.5" /> גלריית תמונות</TabsTrigger>
          <TabsTrigger value="missing" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> חסרים</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Documents Table ──────────────────────────── */}
        <TabsContent value="documents">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מזהה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג מסמך</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">התקנה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך העלאה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">הועלה ע"י</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">גודל קובץ</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{doc.id}</TableCell>
                      <TableCell>{doc.docType}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{doc.insId}</TableCell>
                      <TableCell>{doc.project}</TableCell>
                      <TableCell className="font-mono">{doc.uploadDate}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1"><User className="h-3 w-3 text-muted-foreground" />{doc.uploadedBy}</span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1"><HardDrive className="h-3 w-3 text-muted-foreground" />{doc.fileSize}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${statusColor[doc.status] || "bg-gray-500/20 text-gray-300"}`}>{doc.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Eye className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-primary" />
                          <Download className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-primary" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Photo Gallery ────────────────────────────── */}
        <TabsContent value="photos">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Camera className="h-4 w-4 text-primary" /> תיעוד צילומי — לפני / אחרי
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {photoGallery.map((photo, i) => (
                  <div key={i} className="bg-muted/30 rounded-lg border border-muted overflow-hidden">
                    <div className="h-28 bg-gradient-to-br from-muted/60 to-muted/20 flex items-center justify-center">
                      <Image className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                    <div className="p-2.5 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-semibold text-primary">{photo.insId}</span>
                        <Badge className={`text-[9px] ${labelColor[photo.label] || "bg-gray-500/20 text-gray-300"}`}>{photo.label}</Badge>
                      </div>
                      <p className="text-xs leading-tight">{photo.desc}</p>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-0.5"><Calendar className="h-2.5 w-2.5" />{photo.date}</span>
                        <span className="flex items-center gap-0.5"><HardDrive className="h-2.5 w-2.5" />{photo.size}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Missing Documents ────────────────────────── */}
        <TabsContent value="missing">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" /> מסמכים חסרים — נדרש טיפול
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Summary bar */}
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-3">
                <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-red-300">5 מסמכים חסרים ב-5 התקנות</p>
                  <p className="text-[10px] text-muted-foreground">2 קריטיים — נדרש טיפול מיידי לפני המשך עבודה</p>
                </div>
                <div className="mr-auto flex items-center gap-2">
                  <Badge className="bg-red-500/20 text-red-300 text-[9px]">2 קריטיים</Badge>
                  <Badge className="bg-amber-500/20 text-amber-300 text-[9px]">2 גבוהים</Badge>
                  <Badge className="bg-blue-500/20 text-blue-300 text-[9px]">1 בינוני</Badge>
                </div>
              </div>

              {/* Missing documents list */}
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">התקנה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פרויקט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מסמך חסר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ימי איחור</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">דחיפות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">הערה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פעולה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {missingDocuments.map((md, i) => (
                    <TableRow key={i} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{md.insId}</TableCell>
                      <TableCell>{md.project}</TableCell>
                      <TableCell className="font-semibold">{md.missingDoc}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {md.daysOverdue === 0 ? "טרם נדרש" : `${md.daysOverdue} ימים`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${urgencyColor[md.urgency] || "bg-gray-500/20 text-gray-300"}`}>{md.urgency}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[180px] truncate">{md.note}</TableCell>
                      <TableCell>
                        <Upload className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-primary" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Completion progress */}
              <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">שלמות תיעוד כוללת</span>
                  <span className="font-mono text-primary font-bold">96.6%</span>
                </div>
                <Progress value={96.6} className="h-2" />
                <p className="text-[10px] text-muted-foreground">140 מתוך 145 מסמכים הועלו ואושרו — 5 חסרים</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}