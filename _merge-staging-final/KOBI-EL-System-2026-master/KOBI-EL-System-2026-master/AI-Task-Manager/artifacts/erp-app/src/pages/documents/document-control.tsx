import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FolderOpen, FileText, ShieldCheck, Clock, PenTool, ScanSearch,
  AlertTriangle, CheckCircle2, History, Lock, Link2, ClipboardList,
} from "lucide-react";

/* ── mock data ── */

const FALLBACK_DOCUMENTS = [
  { id: "DOC-001", name: "חוזה ספק מתכת כללי", type: "חוזה", folder: "חוזים/ספקים", entity: "ספק: מתכת-פרו בע\"מ", version: "3.1", status: "מאושר", expiry: "2026-09-15" },
  { id: "DOC-002", name: "שרטוט מסגרת T-400", type: "שרטוט", folder: "הנדסה/שרטוטים", entity: "מוצר: מסגרת T-400", version: "2.0", status: "מאושר", expiry: "—" },
  { id: "DOC-003", name: "תעודת ISO 9001", type: "תעודה", folder: "איכות/תקנים", entity: "חברה", version: "1.0", status: "פעיל", expiry: "2026-06-30" },
  { id: "DOC-004", name: "הצעת מחיר פרויקט דלתא", type: "הצעה", folder: "מכירות/הצעות", entity: "לקוח: דלתא תעשיות", version: "1.2", status: "ממתין", expiry: "2026-05-01" },
  { id: "DOC-005", name: "חשבונית רכש 78120", type: "חשבונית", folder: "כספים/חשבוניות", entity: "הזמנה: PO-4520", version: "1.0", status: "מאושר", expiry: "—" },
  { id: "DOC-006", name: "אישור יבוא מכס 2026-44", type: "מסמך יבוא", folder: "לוגיסטיקה/יבוא", entity: "משלוח: SHP-890", version: "1.0", status: "פעיל", expiry: "2026-12-31" },
  { id: "DOC-007", name: "חוזה שכירות מחסן צפון", type: "חוזה", folder: "חוזים/נדל\"ן", entity: "מחסן: צפון-3", version: "2.0", status: "פג תוקף", expiry: "2026-03-01" },
  { id: "DOC-008", name: "שרטוט ציר הנעה SH-40", type: "שרטוט", folder: "הנדסה/שרטוטים", entity: "מוצר: ציר SH-40", version: "4.3", status: "מאושר", expiry: "—" },
];

const FALLBACK_APPROVALS = [
  { id: "APR-101", doc: "חוזה ספק מתכת כללי v3.1", requester: "יוסי כהן", role: "מנהל רכש", submitted: "2026-04-05", signers: "דוד לוי, רחל אברהם", status: "ממתין לחתימה" },
  { id: "APR-102", doc: "הצעת מחיר פרויקט דלתא v1.2", requester: "שרה מזרחי", role: "מנהלת מכירות", submitted: "2026-04-06", signers: "אלון גולדשטיין", status: "ממתין לחתימה" },
  { id: "APR-103", doc: "נוהל בטיחות עדכון 2026", requester: "מיכל ברק", role: "בטיחות", submitted: "2026-04-03", signers: "נועה פרידמן, עומר חדד", status: "חתימה 1/2" },
  { id: "APR-104", doc: "מפרט טכני PCB-8L Rev C", requester: "אלון גולדשטיין", role: "הנדסה", submitted: "2026-04-07", signers: "יוסי כהן", status: "ממתין לחתימה" },
  { id: "APR-105", doc: "תעודת כיול מכשיר M-22", requester: "דוד מזרחי", role: "איכות", submitted: "2026-04-02", signers: "רחל אברהם, שרה לוי", status: "חתימה 2/2" },
  { id: "APR-106", doc: "חוזה שכירות מחסן צפון v2.1", requester: "נועה פרידמן", role: "תפעול", submitted: "2026-04-04", signers: "דוד לוי", status: "ממתין לחתימה" },
];

const FALLBACK_REVISIONS = [
  { doc: "חוזה ספק מתכת כללי", from: "3.0", to: "3.1", changedBy: "יוסי כהן", date: "2026-04-05", summary: "עדכון תנאי תשלום ל-שוטף+60" },
  { doc: "שרטוט מסגרת T-400", from: "1.9", to: "2.0", changedBy: "אלון גולדשטיין", date: "2026-03-28", summary: "שינוי מידות חור הרכבה" },
  { doc: "הצעת מחיר פרויקט דלתא", from: "1.1", to: "1.2", changedBy: "שרה מזרחי", date: "2026-04-06", summary: "הוספת סעיף אחריות מורחבת" },
  { doc: "נוהל בטיחות כללי", from: "5.3", to: "5.4", changedBy: "מיכל ברק", date: "2026-04-03", summary: "עדכון נהלי פינוי חירום" },
  { doc: "מפרט טכני PCB-8L", from: "Rev B", to: "Rev C", changedBy: "אלון גולדשטיין", date: "2026-04-07", summary: "הוספת שכבת נחושת חמישית" },
  { doc: "חוזה שכירות מחסן צפון", from: "1.0", to: "2.0", changedBy: "נועה פרידמן", date: "2026-03-15", summary: "חידוש חוזה + הרחבת שטח" },
  { doc: "שרטוט ציר הנעה SH-40", from: "4.2", to: "4.3", changedBy: "דוד מזרחי", date: "2026-03-20", summary: "תיקון טולרנס סובבים" },
];

const FALLBACK_EXPIRING_DOCS = [
  { id: "DOC-004", name: "הצעת מחיר פרויקט דלתא", expiry: "2026-05-01", daysLeft: 23, owner: "שרה מזרחי" },
  { id: "DOC-003", name: "תעודת ISO 9001", expiry: "2026-06-30", daysLeft: 83, owner: "מיכל ברק" },
  { id: "DOC-007", name: "חוזה שכירות מחסן צפון", expiry: "2026-03-01", daysLeft: -38, owner: "נועה פרידמן" },
  { id: "DOC-009", name: "רישיון עסק 2026", expiry: "2026-04-30", daysLeft: 22, owner: "דוד לוי" },
  { id: "DOC-010", name: "ביטוח צד ג' מפעל", expiry: "2026-05-15", daysLeft: 37, owner: "רחל אברהם" },
  { id: "DOC-011", name: "תעודת כיול מכשיר M-22", expiry: "2026-04-20", daysLeft: 12, owner: "דוד מזרחי" },
  { id: "DOC-006", name: "אישור יבוא מכס 2026-44", expiry: "2026-12-31", daysLeft: 267, owner: "עומר חדד" },
];

const FALLBACK_OCR_QUEUE = [
  { file: "scan_invoice_78120.pdf", pages: 3, status: "הושלם", preview: "חשבונית מס מספר 78120... סה\"כ ₪45,200" },
  { file: "contract_north_v2.pdf", pages: 8, status: "בעיבוד", preview: "חוזה שכירות... סעיף 4.2 תנאי..." },
  { file: "drawing_T400_rev2.tiff", pages: 1, status: "ממתין", preview: "—" },
  { file: "iso_cert_2026.pdf", pages: 2, status: "הושלם", preview: "CERTIFICATE OF REGISTRATION... ISO 9001:2015" },
  { file: "import_permit_44.pdf", pages: 4, status: "בעיבוד", preview: "אישור יבוא... מספר רישיון..." },
  { file: "safety_procedure_v54.docx", pages: 12, status: "ממתין", preview: "—" },
  { file: "calibration_M22.pdf", pages: 1, status: "שגיאה", preview: "לא ניתן לזהות טקסט – סריקה באיכות נמוכה" },
];

/* ── helpers ── */

const statusColor: Record<string, string> = {
  "מאושר": "bg-emerald-900/60 text-emerald-300",
  "פעיל": "bg-blue-900/60 text-blue-300",
  "ממתין": "bg-amber-900/60 text-amber-300",
  "פג תוקף": "bg-red-900/60 text-red-300",
};

const ocrColor: Record<string, string> = {
  "הושלם": "bg-emerald-900/60 text-emerald-300",
  "בעיבוד": "bg-blue-900/60 text-blue-300",
  "ממתין": "bg-slate-700 text-slate-300",
  "שגיאה": "bg-red-900/60 text-red-300",
};

function urgencyBadge(days: number) {
  if (days < 0) return <Badge className="bg-red-900/60 text-red-300">פג תוקף</Badge>;
  if (days <= 14) return <Badge className="bg-red-900/60 text-red-300">דחוף</Badge>;
  if (days <= 60) return <Badge className="bg-amber-900/60 text-amber-300">קרוב</Badge>;
  return <Badge className="bg-emerald-900/60 text-emerald-300">תקין</Badge>;
}

/* ── KPIs ── */

const FALLBACK_KPIS = [
  { label: "סה\"כ מסמכים", value: 1_284, icon: <FileText className="w-5 h-5" />, color: "text-blue-400" },
  { label: "ממתינים לאישור", value: 6, icon: <Clock className="w-5 h-5" />, color: "text-amber-400" },
  { label: "תוקף קרוב", value: 4, icon: <AlertTriangle className="w-5 h-5" />, color: "text-orange-400" },
  { label: "חובה חסרים", value: 2, icon: <ClipboardList className="w-5 h-5" />, color: "text-red-400" },
  { label: "חתומים דיגיטלית", value: 987, icon: <PenTool className="w-5 h-5" />, color: "text-emerald-400" },
  { label: "תור OCR", value: 7, icon: <ScanSearch className="w-5 h-5" />, color: "text-purple-400" },
];

/* ── component ── */

export default function DocumentControl() {

  const { data: apiData } = useQuery({
    queryKey: ["document_control"],
    queryFn: () => authFetch("/api/documents/document-control").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const documents = apiData?.documents ?? FALLBACK_DOCUMENTS;
  const approvals = apiData?.approvals ?? FALLBACK_APPROVALS;
  const revisions = apiData?.revisions ?? FALLBACK_REVISIONS;
  const expiringDocs = apiData?.expiringDocs ?? FALLBACK_EXPIRING_DOCS;
  const ocrQueue = apiData?.ocrQueue ?? FALLBACK_OCR_QUEUE;
  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const [tab, setTab] = useState("repository");

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FolderOpen className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold tracking-tight">בקרת מסמכים (DMS)</h1>
        <Badge className="bg-blue-900/50 text-blue-300 mr-auto">טכנו-כל עוזי</Badge>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-4 flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className={k.color}>{k.icon}</span>
                <span className="text-2xl font-bold">{k.value.toLocaleString("he-IL")}</span>
              </div>
              <span className="text-xs text-slate-400">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-[#12121a] border border-[#1e1e2e] flex-wrap">
          <TabsTrigger value="repository">מאגר</TabsTrigger>
          <TabsTrigger value="approvals">אישורים</TabsTrigger>
          <TabsTrigger value="revisions">גרסאות</TabsTrigger>
          <TabsTrigger value="expiry">תוקף</TabsTrigger>
          <TabsTrigger value="ocr">OCR</TabsTrigger>
        </TabsList>

        {/* ── Repository ── */}
        <TabsContent value="repository">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">מזהה</TableHead>
                    <TableHead className="text-right text-slate-400">שם מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">סוג</TableHead>
                    <TableHead className="text-right text-slate-400">תיקייה</TableHead>
                    <TableHead className="text-right text-slate-400">ישות מקושרת</TableHead>
                    <TableHead className="text-right text-slate-400">גרסה</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                    <TableHead className="text-right text-slate-400">תפוגה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((d) => (
                    <TableRow key={d.id} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-mono text-blue-400">{d.id}</TableCell>
                      <TableCell>{d.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-slate-300 border-slate-600">{d.type}</Badge></TableCell>
                      <TableCell className="text-slate-400 text-xs">{d.folder}</TableCell>
                      <TableCell className="text-xs">{d.entity}</TableCell>
                      <TableCell className="font-mono">{d.version}</TableCell>
                      <TableCell><Badge className={statusColor[d.status] || "bg-slate-700 text-slate-300"}>{d.status}</Badge></TableCell>
                      <TableCell className="text-slate-400">{d.expiry}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Approvals ── */}
        <TabsContent value="approvals">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">מזהה</TableHead>
                    <TableHead className="text-right text-slate-400">מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">מבקש</TableHead>
                    <TableHead className="text-right text-slate-400">תפקיד</TableHead>
                    <TableHead className="text-right text-slate-400">הוגש</TableHead>
                    <TableHead className="text-right text-slate-400">חותמים</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvals.map((a) => (
                    <TableRow key={a.id} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-mono text-purple-400">{a.id}</TableCell>
                      <TableCell>{a.doc}</TableCell>
                      <TableCell>{a.requester}</TableCell>
                      <TableCell className="text-slate-400">{a.role}</TableCell>
                      <TableCell className="text-slate-400">{a.submitted}</TableCell>
                      <TableCell className="text-xs">{a.signers}</TableCell>
                      <TableCell>
                        <Badge className={a.status.includes("חתימה") ? "bg-blue-900/60 text-blue-300" : "bg-amber-900/60 text-amber-300"}>
                          {a.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Revisions ── */}
        <TabsContent value="revisions">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">מגרסה</TableHead>
                    <TableHead className="text-right text-slate-400">לגרסה</TableHead>
                    <TableHead className="text-right text-slate-400">שונה ע\"י</TableHead>
                    <TableHead className="text-right text-slate-400">תאריך</TableHead>
                    <TableHead className="text-right text-slate-400">תקציר שינויים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revisions.map((r, i) => (
                    <TableRow key={i} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell>{r.doc}</TableCell>
                      <TableCell className="font-mono text-red-400">{r.from}</TableCell>
                      <TableCell className="font-mono text-emerald-400">{r.to}</TableCell>
                      <TableCell>{r.changedBy}</TableCell>
                      <TableCell className="text-slate-400">{r.date}</TableCell>
                      <TableCell className="text-xs max-w-[260px] truncate">{r.summary}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Expiry tracking ── */}
        <TabsContent value="expiry">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">מזהה</TableHead>
                    <TableHead className="text-right text-slate-400">שם מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">תפוגה</TableHead>
                    <TableHead className="text-right text-slate-400">ימים נותרים</TableHead>
                    <TableHead className="text-right text-slate-400">דחיפות</TableHead>
                    <TableHead className="text-right text-slate-400">אחראי</TableHead>
                    <TableHead className="text-right text-slate-400">התקדמות חידוש</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiringDocs.sort((a, b) => a.daysLeft - b.daysLeft).map((d) => (
                    <TableRow key={d.id} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-mono text-blue-400">{d.id}</TableCell>
                      <TableCell>{d.name}</TableCell>
                      <TableCell className="text-slate-400">{d.expiry}</TableCell>
                      <TableCell className={d.daysLeft < 0 ? "text-red-400 font-bold" : d.daysLeft <= 30 ? "text-amber-400" : "text-slate-300"}>
                        {d.daysLeft < 0 ? `פג לפני ${Math.abs(d.daysLeft)} יום` : `${d.daysLeft} יום`}
                      </TableCell>
                      <TableCell>{urgencyBadge(d.daysLeft)}</TableCell>
                      <TableCell>{d.owner}</TableCell>
                      <TableCell className="w-32">
                        <Progress value={d.daysLeft < 0 ? 0 : d.daysLeft > 90 ? 100 : Math.max(10, 100 - d.daysLeft)} className="h-2" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── OCR queue ── */}
        <TabsContent value="ocr">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">קובץ</TableHead>
                    <TableHead className="text-right text-slate-400">עמודים</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                    <TableHead className="text-right text-slate-400">תצוגה מקדימה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ocrQueue.map((o, i) => (
                    <TableRow key={i} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-mono text-cyan-400">{o.file}</TableCell>
                      <TableCell>{o.pages}</TableCell>
                      <TableCell><Badge className={ocrColor[o.status] || "bg-slate-700"}>{o.status}</Badge></TableCell>
                      <TableCell className="text-xs text-slate-400 max-w-[340px] truncate">{o.preview}</TableCell>
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
