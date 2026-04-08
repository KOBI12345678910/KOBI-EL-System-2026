import { useState } from "react";
import { Scan, Brain, FileSearch, CheckCircle2, AlertTriangle, Clock, Mail, Upload, Smartphone, Eye, BarChart3, Sparkles, ShieldCheck, Layers, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

/* ── KPI Data ── */
const kpis: { label: string; value: string | number; icon: LucideIcon; color: string; sub?: string }[] = [
  { label: "נסרקו היום", value: 12, icon: Scan, color: "text-blue-600", sub: "+3 מאתמול" },
  { label: "ממתינים לסריקה", value: 5, icon: Clock, color: "text-amber-600", sub: "2 דחופים" },
  { label: "דיוק ממוצע", value: "96.8%", icon: Brain, color: "text-emerald-600", sub: "ML v3.2" },
  { label: "סווגו אוטומטית", value: "89%", icon: Sparkles, color: "text-violet-600", sub: "מתוך 12" },
  { label: "דורשים בדיקה", value: 3, icon: AlertTriangle, color: "text-red-600", sub: "ביטחון < 80%" },
];

/* ── Scan Queue ── */
const scanQueue = [
  { id: "SCN-1041", file: "invoice_elco_032026.pdf", source: "סורק", lang: "עברית", type: "חשבונית", confidence: 98.2, status: "הושלם", fields: 14 },
  { id: "SCN-1042", file: "delivery_note_8812.pdf", source: "אימייל", lang: "עברית", type: "תעודת משלוח", confidence: 95.7, status: "הושלם", fields: 11 },
  { id: "SCN-1043", file: "PO_mashbir_2026.pdf", source: "העלאה ידנית", lang: "אנגלית", type: "הזמנה", confidence: 91.3, status: "הושלם", fields: 9 },
  { id: "SCN-1044", file: "contract_hadar_v2.pdf", source: "אימייל", lang: "עברית", type: "חוזה", confidence: 74.5, status: "דורש בדיקה", fields: 7 },
  { id: "SCN-1045", file: "inv_ampal_feb.jpg", source: "WhatsApp", lang: "עברית", type: "חשבונית", confidence: 88.9, status: "בסריקה", fields: 0 },
  { id: "SCN-1046", file: "receipt_scan_003.tiff", source: "סורק", lang: "ערבית", type: "חשבונית", confidence: 67.2, status: "דורש בדיקה", fields: 5 },
  { id: "SCN-1047", file: "ship_note_teva.pdf", source: "אימייל", lang: "אנגלית", type: "תעודת משלוח", confidence: 0, status: "בתור", fields: 0 },
  { id: "SCN-1048", file: "quote_delta_q1.pdf", source: "העלאה ידנית", lang: "עברית", type: "הזמנה", confidence: 0, status: "נכשל", fields: 0 },
];

/* ── Extracted Fields (sample invoice) ── */
const extractedFields = [
  { field: "שם ספק", value: "אלקו בע\"מ", confidence: 99.1 },
  { field: "מספר חשבונית", value: "INV-2026-03-4417", confidence: 99.8 },
  { field: "תאריך חשבונית", value: "15/03/2026", confidence: 98.5 },
  { field: "סכום לפני מע\"מ", value: "12,450.00 \u20AA", confidence: 97.3 },
  { field: "מע\"מ (17%)", value: "2,116.50 \u20AA", confidence: 97.1 },
  { field: "סה\"כ לתשלום", value: "14,566.50 \u20AA", confidence: 98.9 },
  { field: "תנאי תשלום", value: "שוטף + 60", confidence: 91.2 },
  { field: "פריט 1 — תיאור", value: "כבל חשמל תלת-פאזי 4x16 מ\"מ", confidence: 94.6 },
  { field: "פריט 1 — כמות", value: "200 מטר", confidence: 96.8 },
  { field: "פריט 1 — מחיר יחידה", value: "38.50 \u20AA", confidence: 95.4 },
  { field: "פריט 2 — תיאור", value: "ארון חשמל תעשייתי 60x80", confidence: 89.7 },
  { field: "פריט 2 — כמות", value: "5 יח'", confidence: 97.2 },
  { field: "פריט 2 — מחיר יחידה", value: "980.00 \u20AA", confidence: 96.1 },
  { field: "מספר הזמנה", value: "PO-2026-1187", confidence: 93.5 },
];

/* ── Auto-Classification Rules ── */
const classificationRules = [
  { id: "CLS-01", name: "זיהוי חשבונית לפי מילות מפתח", method: "Keyword Matching", keywords: "חשבונית מס, סה\"כ לתשלום, מע\"מ", accuracy: 94.2, docs: 847, active: true },
  { id: "CLS-02", name: "זיהוי תעודת משלוח — Layout", method: "Layout Detection", keywords: "מבנה טבלאי, כותרת תעודה, חתימת מקבל", accuracy: 91.8, docs: 312, active: true },
  { id: "CLS-03", name: "זיהוי ספק לפי לוגו + כותרת", method: "Supplier Recognition", keywords: "OCR Header, Logo ML Model, ח.פ.", accuracy: 97.5, docs: 1203, active: true },
  { id: "CLS-04", name: "סיווג חוזה — NLP", method: "Keyword Matching", keywords: "הסכם, צד א', צד ב', תנאים", accuracy: 88.4, docs: 156, active: true },
  { id: "CLS-05", name: "זיהוי הזמנה לפי מספר PO", method: "Layout Detection", keywords: "PO Number, Purchase Order, הזמנת רכש", accuracy: 93.1, docs: 534, active: true },
  { id: "CLS-06", name: "סיווג קבלה — סכום + תאריך", method: "Supplier Recognition", keywords: "קבלה, התקבל, סכום ששולם", accuracy: 90.6, docs: 289, active: false },
];

/* ── Helpers ── */
function statusBadge(status: string) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; cls: string }> = {
    "הושלם": { variant: "default", cls: "bg-emerald-600 hover:bg-emerald-700" },
    "בסריקה": { variant: "secondary", cls: "bg-blue-100 text-blue-700 border-blue-200" },
    "בתור": { variant: "outline", cls: "border-amber-300 text-amber-700" },
    "דורש בדיקה": { variant: "destructive", cls: "bg-orange-500 hover:bg-orange-600" },
    "נכשל": { variant: "destructive", cls: "" },
  };
  const cfg = map[status] || { variant: "outline" as const, cls: "" };
  return <Badge variant={cfg.variant} className={cfg.cls}>{status}</Badge>;
}

function sourceIcon(source: string) {
  if (source === "סורק") return <Scan size={14} className="text-blue-500" />;
  if (source === "אימייל") return <Mail size={14} className="text-amber-500" />;
  if (source === "WhatsApp") return <Smartphone size={14} className="text-green-500" />;
  return <Upload size={14} className="text-muted-foreground" />;
}

function confidenceColor(pct: number) {
  if (pct >= 95) return "text-emerald-600";
  if (pct >= 85) return "text-blue-600";
  if (pct >= 70) return "text-amber-600";
  return "text-red-600";
}

function confidenceBar(pct: number) {
  if (pct === 0) return <span className="text-xs text-muted-foreground">--</span>;
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <Progress value={pct} className="h-2 flex-1" />
      <span className={`text-xs font-mono font-bold ${confidenceColor(pct)}`}>{pct}%</span>
    </div>
  );
}

/* ── Statistics Panel ── */
function StatsPanel() {
  const stats = [
    { label: "סריקות החודש", value: "284", delta: "+12%" },
    { label: "דיוק OCR ממוצע", value: "96.8%", delta: "+0.3%" },
    { label: "סיווג אוטומטי מוצלח", value: "89%", delta: "+2%" },
    { label: "זמן עיבוד ממוצע", value: "4.2 שנ'", delta: "-0.8 שנ'" },
    { label: "שפות מזוהות", value: "3", delta: "עב/אנ/ער" },
    { label: "חיסכון שעות ידניות", value: "~47 שע'", delta: "החודש" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {stats.map((s) => (
        <Card key={s.label} className="border-dashed">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
            <p className="text-xs text-emerald-600 mt-0.5">{s.delta}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ── Main Component ── */
export default function OCRProcessingPage() {
  const [tab, setTab] = useState("queue");

  return (
    <div dir="rtl" className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg">
          <Scan size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">סריקה וזיהוי מסמכים — OCR</h1>
          <p className="text-sm text-muted-foreground">מערכת זיהוי אוטומטי, חילוץ שדות וסיווג AI &bull; טכנו-כל עוזי</p>
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

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="queue" className="gap-1.5"><FileSearch size={14} /> תור סריקה</TabsTrigger>
          <TabsTrigger value="fields" className="gap-1.5"><Eye size={14} /> שדות שחולצו</TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5"><Layers size={14} /> כללי סיווג</TabsTrigger>
          <TabsTrigger value="stats" className="gap-1.5"><BarChart3 size={14} /> סטטיסטיקות</TabsTrigger>
        </TabsList>

        {/* ── Tab: Scan Queue ── */}
        <TabsContent value="queue">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileSearch size={18} className="text-blue-500" /> תור סריקה — {scanQueue.length} מסמכים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>מזהה</TableHead>
                    <TableHead>קובץ מקור</TableHead>
                    <TableHead>מקור</TableHead>
                    <TableHead>שפה</TableHead>
                    <TableHead>סוג מזוהה</TableHead>
                    <TableHead>ביטחון סיווג</TableHead>
                    <TableHead>סטטוס</TableHead>
                    <TableHead>שדות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanQueue.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-mono text-xs font-bold text-blue-600">{doc.id}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{doc.file}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-xs">
                          {sourceIcon(doc.source)} {doc.source}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{doc.lang}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{doc.type}</Badge>
                      </TableCell>
                      <TableCell>{confidenceBar(doc.confidence)}</TableCell>
                      <TableCell>{statusBadge(doc.status)}</TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {doc.fields > 0 ? doc.fields : "--"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Extracted Fields ── */}
        <TabsContent value="fields">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye size={18} className="text-violet-500" /> שדות שחולצו — חשבונית SCN-1041
                </CardTitle>
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle2 size={12} /> {extractedFields.length} שדות זוהו
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">שדה</TableHead>
                    <TableHead>ערך שחולץ</TableHead>
                    <TableHead className="w-[180px]">ביטחון AI</TableHead>
                    <TableHead className="w-[80px]">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extractedFields.map((f) => (
                    <TableRow key={f.field}>
                      <TableCell className="font-medium text-sm">{f.field}</TableCell>
                      <TableCell className="font-mono text-sm">{f.value}</TableCell>
                      <TableCell>{confidenceBar(f.confidence)}</TableCell>
                      <TableCell>
                        {f.confidence >= 90
                          ? <CheckCircle2 size={16} className="text-emerald-500" />
                          : <AlertTriangle size={16} className="text-amber-500" />
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Classification Rules ── */}
        <TabsContent value="rules">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Layers size={18} className="text-amber-500" /> כללי סיווג אוטומטי — {classificationRules.length} כללים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>מזהה</TableHead>
                    <TableHead>שם כלל</TableHead>
                    <TableHead>שיטה</TableHead>
                    <TableHead>מילות מפתח / סימנים</TableHead>
                    <TableHead>דיוק</TableHead>
                    <TableHead>מסמכים</TableHead>
                    <TableHead>פעיל</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {classificationRules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs font-bold">{r.id}</TableCell>
                      <TableCell className="text-sm font-medium">{r.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">{r.method}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">{r.keywords}</TableCell>
                      <TableCell>{confidenceBar(r.accuracy)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.docs.toLocaleString()}</TableCell>
                      <TableCell>
                        {r.active
                          ? <ShieldCheck size={16} className="text-emerald-500" />
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

        {/* ── Tab: Statistics ── */}
        <TabsContent value="stats">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 size={18} className="text-emerald-500" /> סטטיסטיקות OCR — סיכום חודשי
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StatsPanel />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
