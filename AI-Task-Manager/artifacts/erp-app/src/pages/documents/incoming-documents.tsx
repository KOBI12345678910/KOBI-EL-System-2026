import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  Inbox,
  Mail,
  MessageSquare,
  ScanLine,
  Upload,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Radio,
  ArrowRightLeft,
  FileText,
  Truck,
  Receipt,
  FileSignature,
  File,
  History,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

/* ── KPI Data ── */
const kpis: { label: string; value: string | number; icon: LucideIcon; color: string; sub?: string }[] = [
  { label: "התקבלו היום", value: 8, icon: Inbox, color: "text-blue-600", sub: "+2 מאתמול" },
  { label: "ממתינים לעיבוד", value: 5, icon: Clock, color: "text-amber-600", sub: "3 דחופים" },
  { label: "עובדו", value: 3, icon: CheckCircle2, color: "text-emerald-600", sub: "זמן ממוצע 2.4 דק'" },
  { label: "נדחו", value: 0, icon: XCircle, color: "text-red-600", sub: "אפס היום" },
  { label: "מקורות פעילים", value: 4, icon: Radio, color: "text-violet-600", sub: "כל הערוצים תקינים" },
];

/* ── Incoming Sources ── */
const incomingSources: { name: string; detail: string; pct: number; icon: LucideIcon; color: string; bg: string }[] = [
  { name: "אימייל", detail: "inbox@techno-kol.co.il", pct: 45, icon: Mail, color: "text-blue-600", bg: "bg-blue-50 border-blue-200" },
  { name: "WhatsApp Business", detail: "+972-52-XXXXXXX", pct: 20, icon: MessageSquare, color: "text-green-600", bg: "bg-green-50 border-green-200" },
  { name: "סורק רשת", detail: "Fujitsu fi-8170 / סניפים", pct: 25, icon: ScanLine, color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
  { name: "העלאה ידנית", detail: "ממשק DMS — טכנו-כל", pct: 10, icon: Upload, color: "text-violet-600", bg: "bg-violet-50 border-violet-200" },
];

/* ── Incoming Queue — 12 documents ── */
const FALLBACK_INCOMING_QUEUE = [
  { id: "INC-301", file: "invoice_elco_032026.pdf", source: "אימייל", sender: "אלקו בע\"מ (ספק)", received: "08/04/2026 08:12", type: "חשבונית", size: "245 KB", ocr: true, status: "חדש", entity: null },
  { id: "INC-302", file: "delivery_note_mashbir.pdf", source: "אימייל", sender: "המשביר (ספק)", received: "08/04/2026 08:30", type: "תעודת משלוח", size: "182 KB", ocr: false, status: "בעיבוד", entity: "הזמנה PO-2026-1190" },
  { id: "INC-303", file: "quote_hadar_q2.pdf", source: "WhatsApp Business", sender: "הדר מתכות (ספק)", received: "08/04/2026 09:01", type: "הצעת מחיר", size: "310 KB", ocr: true, status: "חדש", entity: null },
  { id: "INC-304", file: "contract_teva_2026.pdf", source: "אימייל", sender: "טבע תעשיות (לקוח)", received: "08/04/2026 09:15", type: "חוזה", size: "1.2 MB", ocr: false, status: "דורש בדיקה", entity: "לקוח CRM-4422" },
  { id: "INC-305", file: "scan_receipt_003.tiff", source: "סורק רשת", sender: "סורק סניף ראשי", received: "08/04/2026 09:22", type: "חשבונית", size: "890 KB", ocr: true, status: "בעיבוד", entity: null },
  { id: "INC-306", file: "inv_ampal_feb.jpg", source: "WhatsApp Business", sender: "אמפל חשמל (ספק)", received: "08/04/2026 09:40", type: "חשבונית", size: "520 KB", ocr: true, status: "מעובד", entity: "ספק SUP-1087" },
  { id: "INC-307", file: "shipping_delta_040826.pdf", source: "אימייל", sender: "דלתא לוגיסטיקה (ספק)", received: "08/04/2026 10:05", type: "תעודת משלוח", size: "175 KB", ocr: false, status: "מעובד", entity: "הזמנה PO-2026-1195" },
  { id: "INC-308", file: "price_list_omega.xlsx", source: "אימייל", sender: "אומגה כימיקלים (ספק)", received: "08/04/2026 10:18", type: "כללי", size: "430 KB", ocr: false, status: "חדש", entity: null },
  { id: "INC-309", file: "po_request_internal.pdf", source: "העלאה ידנית", sender: "מחלקת רכש (פנימי)", received: "08/04/2026 10:45", type: "הצעת מחיר", size: "98 KB", ocr: false, status: "מעובד", entity: "פרויקט PRJ-2026-07" },
  { id: "INC-310", file: "scan_invoice_branch2.pdf", source: "סורק רשת", sender: "סורק סניף דרום", received: "08/04/2026 11:00", type: "חשבונית", size: "340 KB", ocr: true, status: "חדש", entity: null },
  { id: "INC-311", file: "agreement_renewal_keter.pdf", source: "אימייל", sender: "כתר פלסטיק (לקוח)", received: "08/04/2026 11:20", type: "חוזה", size: "2.1 MB", ocr: false, status: "דורש בדיקה", entity: "לקוח CRM-3310" },
  { id: "INC-312", file: "delivery_scan_007.jpg", source: "סורק רשת", sender: "סורק מחסן מרכזי", received: "08/04/2026 11:35", type: "תעודת משלוח", size: "610 KB", ocr: true, status: "חדש", entity: null },
];

/* ── Processing / Routing Rules ── */
const FALLBACK_ROUTING_RULES = [
  { id: "RTR-01", name: "ספק אלקו → רכש", condition: "שולח מכיל 'אלקו' או 'elco'", target: "מחלקת רכש", action: "שיוך אוטומטי + התראה", docs: 124, active: true },
  { id: "RTR-02", name: "מילת מפתח 'חשבונית' → כספים", condition: "סוג מזוהה = חשבונית", target: "מחלקת כספים", action: "יצירת רשומת AP + OCR", docs: 312, active: true },
  { id: "RTR-03", name: "תעודת משלוח → מחסן", condition: "סוג = תעודת משלוח", target: "ניהול מחסן", action: "שיוך להזמנה פתוחה", docs: 198, active: true },
  { id: "RTR-04", name: "חוזה / הסכם → משפטי", condition: "סוג = חוזה או מילה 'הסכם'", target: "יועץ משפטי", action: "סימון לבדיקה ידנית", docs: 47, active: true },
  { id: "RTR-05", name: "קובץ > 5MB → בדיקת מנהל", condition: "גודל קובץ > 5MB", target: "מנהל DMS", action: "המתנה לאישור + דחיסה", docs: 18, active: false },
];

/* ── History Log ── */
const FALLBACK_HISTORY_LOG = [
  { time: "11:35", action: "קבלה", doc: "INC-312", detail: "delivery_scan_007.jpg התקבל מסורק מחסן מרכזי" },
  { time: "11:20", action: "קבלה", doc: "INC-311", detail: "agreement_renewal_keter.pdf התקבל מאימייל" },
  { time: "11:05", action: "ניתוב", doc: "INC-307", detail: "שויך להזמנה PO-2026-1195 (כלל RTR-03)" },
  { time: "10:50", action: "עיבוד", doc: "INC-306", detail: "OCR הושלם — 12 שדות חולצו, דיוק 94.7%" },
  { time: "10:45", action: "קבלה", doc: "INC-309", detail: "po_request_internal.pdf הועלה ידנית ע\"י מחלקת רכש" },
  { time: "10:30", action: "ניתוב", doc: "INC-306", detail: "שויך לספק SUP-1087 (כלל RTR-02)" },
  { time: "10:18", action: "קבלה", doc: "INC-308", detail: "price_list_omega.xlsx התקבל מאימייל" },
  { time: "10:05", action: "קבלה", doc: "INC-307", detail: "shipping_delta_040826.pdf התקבל מאימייל" },
  { time: "09:55", action: "עיבוד", doc: "INC-302", detail: "שויך להזמנה PO-2026-1190 — בעיבוד" },
  { time: "09:40", action: "קבלה", doc: "INC-306", detail: "inv_ampal_feb.jpg התקבל מ-WhatsApp Business" },
];

/* ── Helpers ── */
function statusBadge(status: string) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; cls: string }> = {
    "חדש": { variant: "default", cls: "bg-blue-600 hover:bg-blue-700" },
    "בעיבוד": { variant: "secondary", cls: "bg-amber-100 text-amber-700 border-amber-200" },
    "מעובד": { variant: "default", cls: "bg-emerald-600 hover:bg-emerald-700" },
    "דורש בדיקה": { variant: "destructive", cls: "bg-orange-500 hover:bg-orange-600" },
    "נדחה": { variant: "destructive", cls: "" },
  };
  const cfg = map[status] || { variant: "outline" as const, cls: "" };
  return <Badge variant={cfg.variant} className={cfg.cls}>{status}</Badge>;
}

function sourceIcon(source: string) {
  if (source === "אימייל") return <Mail size={14} className="text-blue-500" />;
  if (source === "WhatsApp Business") return <MessageSquare size={14} className="text-green-500" />;
  if (source === "סורק רשת") return <ScanLine size={14} className="text-orange-500" />;
  return <Upload size={14} className="text-violet-500" />;
}

function typeIcon(type: string) {
  if (type === "חשבונית") return <Receipt size={14} className="text-blue-500" />;
  if (type === "תעודת משלוח") return <Truck size={14} className="text-emerald-500" />;
  if (type === "הצעת מחיר") return <FileText size={14} className="text-amber-500" />;
  if (type === "חוזה") return <FileSignature size={14} className="text-violet-500" />;
  return <File size={14} className="text-muted-foreground" />;
}

/* ── Main Component ── */
export default function IncomingDocumentsPage() {

  const { data: apiData } = useQuery({
    queryKey: ["incoming_documents"],
    queryFn: () => authFetch("/api/documents/incoming-documents").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const incomingQueue = apiData?.incomingQueue ?? FALLBACK_INCOMING_QUEUE;
  const routingRules = apiData?.routingRules ?? FALLBACK_ROUTING_RULES;
  const historyLog = apiData?.historyLog ?? FALLBACK_HISTORY_LOG;
  const [tab, setTab] = useState("queue");

  return (
    <div dir="rtl" className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg">
          <Inbox size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">מסמכים נכנסים</h1>
          <p className="text-sm text-muted-foreground">קליטה, ניתוב וסיווג אוטומטי של מסמכים נכנסים &bull; טכנו-כל עוזי</p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="relative overflow-hidden">
            <CardContent className="p-4 flex items-start gap-3">
              <div className={`mt-0.5 ${k.color}`}><k.icon size={22} /></div>
              <div>
                <p className="text-xl font-extrabold leading-none">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
                {k.sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{k.sub}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Incoming Sources */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {incomingSources.map((s) => (
          <Card key={s.name} className={`border ${s.bg}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <s.icon size={20} className={s.color} />
                <span className="font-semibold text-sm">{s.name}</span>
              </div>
              <p className="text-xs text-muted-foreground mb-2">{s.detail}</p>
              <div className="flex items-center gap-2">
                <Progress value={s.pct} className="h-2 flex-1" />
                <span className={`text-xs font-bold ${s.color}`}>{s.pct}%</span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">מתוך המסמכים הנכנסים</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="queue" className="gap-1.5"><Inbox size={14} /> תור נכנסים</TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5"><ArrowRightLeft size={14} /> כללי ניתוב</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><History size={14} /> היסטוריה</TabsTrigger>
        </TabsList>

        {/* ── Tab: Incoming Queue ── */}
        <TabsContent value="queue">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Inbox size={18} className="text-blue-500" /> תור מסמכים נכנסים — {incomingQueue.length} מסמכים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>מזהה</TableHead>
                      <TableHead>שם קובץ</TableHead>
                      <TableHead>מקור</TableHead>
                      <TableHead>שולח</TableHead>
                      <TableHead>תאריך קבלה</TableHead>
                      <TableHead>סוג מזוהה</TableHead>
                      <TableHead>גודל</TableHead>
                      <TableHead>OCR</TableHead>
                      <TableHead>סטטוס</TableHead>
                      <TableHead>שויך לישות</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomingQueue.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-mono text-xs font-bold text-blue-600">{doc.id}</TableCell>
                        <TableCell className="text-sm max-w-[180px] truncate">{doc.file}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5 text-xs">
                            {sourceIcon(doc.source)} {doc.source}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs max-w-[150px] truncate">{doc.sender}</TableCell>
                        <TableCell className="text-xs font-mono">{doc.received}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1 text-xs">
                            {typeIcon(doc.type)}
                            <Badge variant="outline" className="text-[11px]">{doc.type}</Badge>
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{doc.size}</TableCell>
                        <TableCell className="text-center">
                          {doc.ocr
                            ? <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">כן</Badge>
                            : <span className="text-xs text-muted-foreground">לא</span>
                          }
                        </TableCell>
                        <TableCell>{statusBadge(doc.status)}</TableCell>
                        <TableCell className="text-xs">
                          {doc.entity
                            ? <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200">{doc.entity}</Badge>
                            : <span className="text-muted-foreground">--</span>
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Routing Rules ── */}
        <TabsContent value="rules">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <ArrowRightLeft size={18} className="text-amber-500" /> כללי ניתוב אוטומטי — {routingRules.length} כללים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>מזהה</TableHead>
                    <TableHead>שם כלל</TableHead>
                    <TableHead>תנאי</TableHead>
                    <TableHead>יעד</TableHead>
                    <TableHead>פעולה</TableHead>
                    <TableHead>מסמכים</TableHead>
                    <TableHead>פעיל</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routingRules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs font-bold">{r.id}</TableCell>
                      <TableCell className="text-sm font-medium">{r.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.condition}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">{r.target}</Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate">{r.action}</TableCell>
                      <TableCell className="font-mono text-xs">{r.docs.toLocaleString()}</TableCell>
                      <TableCell>
                        {r.active
                          ? <CheckCircle2 size={16} className="text-emerald-500" />
                          : <span className="text-xs text-muted-foreground">מושבת</span>
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: History ── */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <History size={18} className="text-violet-500" /> היסטוריית קליטה — היום
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {historyLog.map((entry, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                    <span className="font-mono text-xs text-muted-foreground mt-0.5 min-w-[40px]">{entry.time}</span>
                    <Badge variant={entry.action === "קבלה" ? "default" : entry.action === "ניתוב" ? "secondary" : "outline"}
                      className={entry.action === "קבלה" ? "bg-blue-600" : entry.action === "ניתוב" ? "bg-amber-100 text-amber-700" : ""}>
                      {entry.action}
                    </Badge>
                    <span className="font-mono text-xs font-bold text-blue-600 min-w-[60px]">{entry.doc}</span>
                    <span className="text-sm text-muted-foreground">{entry.detail}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
