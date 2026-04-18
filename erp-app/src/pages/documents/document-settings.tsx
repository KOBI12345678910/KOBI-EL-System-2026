import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Settings, HardDrive, FileUp, FileType2, TextCursorInput, Globe, DatabaseBackup,
  FolderTree, Tag, Plus, Pencil, CheckCircle2, ClockAlert, Link2, Signature,
  Archive, Scale, ShieldAlert, Bell, CalendarClock, Timer, Gauge, ScanSearch,
  Plug, Mail, ScanLine, Cloud, Eye, PenTool, Wifi, WifiOff,
} from "lucide-react";
/* -- general config -- */
const FALLBACK_GENERAL_CONFIG = [
  { label: "מגבלת אחסון כוללת", value: "500 GB", used: "312 GB", pct: 62, icon: HardDrive, note: "188 GB פנויים" },
  { label: "גודל קובץ מקסימלי", value: "50 MB", used: "—", pct: 0, icon: FileUp, note: "קבצי CAD עד 100 MB באישור מנהל" },
  { label: "פורמטים מותרים", value: "28 סוגים", used: "PDF, DOCX, XLSX, DWG, STP, JPG, PNG, ZIP...", pct: 0, icon: FileType2, note: "ניתן להוסיף סוגים בהתאמה אישית" },
  { label: "מוסכמת שמות קבצים", value: "[TYPE]-[ID]-[VER]", used: "דוגמה: INV-78120-v1.0.pdf", pct: 0, icon: TextCursorInput, note: "אכיפה אוטומטית בהעלאה" },
  { label: "שפת ברירת מחדל", value: "עברית (he-IL)", used: "OCR + חיפוש", pct: 0, icon: Globe, note: "תמיכה באנגלית וערבית" },
  { label: "גיבוי אוטומטי", value: "כל 6 שעות", used: "גיבוי אחרון: 08/04/2026 02:00", pct: 0, icon: DatabaseBackup, note: "שמירה ב-3 אתרים גיאוגרפיים" },
];

/* -- categories -- */
const FALLBACK_CATEGORIES = [
  { name: "רכש", subs: ["הזמנות רכש", "תעודות משלוח", "חשבוניות ספק", "חוזי ספק"], docs: 645 },
  { name: "כספים", subs: ["חשבוניות", "קבלות", "דוחות כספיים", "אישורי תשלום"], docs: 1530 },
  { name: "ייצור", subs: ["הוראות עבודה", "דוחות QC", "שרטוטים", "BOM"], docs: 820 },
  { name: "התקנות", subs: ["פרוטוקולים", "תמונות שטח", "אישורי לקוח"], docs: 340 },
  { name: "הנדסה", subs: ["שרטוטים", "חישובים", "מפרטים טכניים"], docs: 180 },
  { name: "איכות", subs: ["תקנים", "נהלים", "דוחות בדיקה"], docs: 95 },
  { name: "משפטי", subs: ["חוזים", "NDA", "אישורי רגולציה"], docs: 68 },
  { name: "בטיחות", subs: ["הנחיות בטיחות", "דוחות בטיחות", "אישורים"], docs: 52 },
  { name: "לקוחות", subs: ["הצעות מחיר", "חוזי לקוח", "פרוטוקולי מסירה"], docs: 58 },
  { name: "משאבי אנוש", subs: ["חוזי עבודה", "הסמכות", "הדרכות"], docs: 35 },
  { name: "הנהלה", subs: ["פרוטוקולי ישיבות", "אסטרטגיה"], docs: 15 },
  { name: "כללי", subs: ["שונות"], docs: 9 },
];

/* -- approval workflow defaults -- */
const FALLBACK_APPROVAL_DEFAULTS = [
  { docType: "חוזה ספק", chain: 4, escalation: "24 שעות", signatures: 3, mandatory: true },
  { docType: "הצעת מחיר", chain: 3, escalation: "24 שעות", signatures: 2, mandatory: true },
  { docType: "שרטוט הנדסי", chain: 2, escalation: "48 שעות", signatures: 2, mandatory: true },
  { docType: "חשבונית", chain: 2, escalation: "12 שעות", signatures: 1, mandatory: false },
  { docType: "נוהל איכות / בטיחות", chain: 3, escalation: "24 שעות", signatures: 2, mandatory: true },
  { docType: "דוח כספי", chain: 4, escalation: "24 שעות", signatures: 3, mandatory: true },
  { docType: "מסמך כללי", chain: 1, escalation: "72 שעות", signatures: 1, mandatory: false },
];

/* -- retention policies -- */
const FALLBACK_RETENTION_POLICIES = [
  { docType: "חוזים משפטיים", retention: 25, autoArchive: true, legalHold: false },
  { docType: "חשבוניות מס", retention: 7, autoArchive: true, legalHold: false },
  { docType: "דוחות כספיים", retention: 10, autoArchive: true, legalHold: false },
  { docType: "שרטוטים הנדסיים", retention: 15, autoArchive: false, legalHold: false },
  { docType: "תעודות ISO / תקנים", retention: 10, autoArchive: true, legalHold: false },
  { docType: "חוזי עבודה", retention: 7, autoArchive: true, legalHold: true },
  { docType: "מסמכי בטיחות / QC", retention: 20, autoArchive: true, legalHold: false },
  { docType: "הצעות מחיר", retention: 5, autoArchive: true, legalHold: false },
  { docType: "מסמכי יבוא/יצוא", retention: 3, autoArchive: true, legalHold: false },
];

/* -- alert thresholds -- */
const FALLBACK_ALERT_THRESHOLDS = [
  { label: "התראת פקיעת תוקף", value: "30 יום", detail: "התראה 30 יום לפני פקיעת תוקף מסמך", icon: CalendarClock },
  { label: "הפרת SLA אישור", value: "4 שעות", detail: "הסלמה למנהל כשאישור לא טופל בזמן", icon: Timer },
  { label: "אזהרת נפח אחסון", value: "90%", detail: "התראה כשנפח האחסון חוצה 90% מהמכסה", icon: Gauge },
  { label: "סריקת מסמכים יתומים", value: "כל 7 ימים", detail: "חיפוש קבצים ללא קטגוריה, בעלים או גישה", icon: ScanSearch },
  { label: "גיבוי כושל", value: "מיידי", detail: "התראת SMS + מייל בכשל גיבוי", icon: DatabaseBackup },
  { label: "גירסה ללא אישור", value: "48 שעות", detail: "טיוטה 48+ שעות ללא תחילת אישור", icon: ClockAlert },
];

/* -- integrations -- */
const FALLBACK_INTEGRATIONS = [
  { name: "שרת דוא\"ל (Exchange)", provider: "Microsoft Exchange 2019", status: "מחובר", icon: Mail, lastSync: "08/04/2026 08:15" },
  { name: "סורק רשתי (Fujitsu)", provider: "Fujitsu fi-8170", status: "מחובר", icon: ScanLine, lastSync: "08/04/2026 09:30" },
  { name: "אחסון ענן (Azure Blob)", provider: "Microsoft Azure", status: "מחובר", icon: Cloud, lastSync: "08/04/2026 10:00" },
  { name: "מנוע OCR (ABBYY)", provider: "ABBYY FineReader Engine 12", status: "מחובר", icon: Eye, lastSync: "08/04/2026 07:45" },
  { name: "חתימה דיגיטלית (CoSign)", provider: "ARX CoSign", status: "מנותק", icon: PenTool, lastSync: "06/04/2026 14:20" },
];

/* -- component -- */
export default function DocumentSettingsPage() {

  const { data: apiData } = useQuery({
    queryKey: ["document_settings"],
    queryFn: () => authFetch("/api/documents/document-settings").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const generalConfig = apiData?.generalConfig ?? FALLBACK_GENERAL_CONFIG;
  const categories = apiData?.categories ?? FALLBACK_CATEGORIES;
  const approvalDefaults = apiData?.approvalDefaults ?? FALLBACK_APPROVAL_DEFAULTS;
  const retentionPolicies = apiData?.retentionPolicies ?? FALLBACK_RETENTION_POLICIES;
  const alertThresholds = apiData?.alertThresholds ?? FALLBACK_ALERT_THRESHOLDS;
  const integrations = apiData?.integrations ?? FALLBACK_INTEGRATIONS;
  const [activeTab, setActiveTab] = useState("general");

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-slate-100"><Settings className="h-7 w-7 text-slate-700" /></div>
        <div>
          <h1 className="text-2xl font-bold">הגדרות ניהול מסמכים</h1>
          <p className="text-muted-foreground text-sm">טכנו-כל עוזי — קונפיגורציה מרכזית של מערכת ה-DMS</p>
        </div>
      </div>
      {/* tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="general"><Settings className="h-4 w-4 ml-1" />כללי</TabsTrigger>
          <TabsTrigger value="categories"><FolderTree className="h-4 w-4 ml-1" />קטגוריות</TabsTrigger>
          <TabsTrigger value="approvals"><CheckCircle2 className="h-4 w-4 ml-1" />אישורים</TabsTrigger>
          <TabsTrigger value="retention"><Archive className="h-4 w-4 ml-1" />שימור</TabsTrigger>
          <TabsTrigger value="alerts"><Bell className="h-4 w-4 ml-1" />התראות</TabsTrigger>
          <TabsTrigger value="integrations"><Plug className="h-4 w-4 ml-1" />אינטגרציות</TabsTrigger>
        </TabsList>
        {/* -- general -- */}
        <TabsContent value="general" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {generalConfig.map((cfg) => (
              <Card key={cfg.label}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-3">
                    <cfg.icon className="h-5 w-5 text-slate-600" />
                    <span className="font-semibold">{cfg.label}</span>
                    <Badge variant="secondary" className="mr-auto">{cfg.value}</Badge>
                  </div>
                  {cfg.pct > 0 && <div className="flex items-center gap-2"><Progress value={cfg.pct} className="h-2 flex-1" /><span className="text-xs text-muted-foreground">{cfg.pct}%</span></div>}
                  <p className="text-xs text-muted-foreground">{cfg.used}</p>
                  <p className="text-xs text-muted-foreground italic">{cfg.note}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        {/* -- categories -- */}
        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <FolderTree className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold">ניהול קטגוריות</h3>
                <Badge variant="secondary" className="mr-auto">{categories.length} קטגוריות ראשיות</Badge>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">קטגוריה</TableHead><TableHead className="text-right">תתי-קטגוריות</TableHead><TableHead className="text-right">מסמכים</TableHead><TableHead className="text-right">סטטוס</TableHead><TableHead className="text-right">פעולות</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {categories.map((cat) => (
                      <TableRow key={cat.name}>
                        <TableCell className="font-semibold">{cat.name}</TableCell>
                        <TableCell><div className="flex flex-wrap gap-1">{cat.subs.map((s) => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}</div></TableCell>
                        <TableCell className="font-bold">{cat.docs.toLocaleString()}</TableCell>
                        <TableCell><Badge className="bg-green-100 text-green-800 text-xs"><Tag className="h-3 w-3 ml-1" />פעיל</Badge></TableCell>
                        <TableCell><div className="flex gap-1"><Badge variant="outline" className="cursor-pointer text-xs"><Pencil className="h-3 w-3 ml-1" />עריכה</Badge><Badge variant="outline" className="cursor-pointer text-xs"><Plus className="h-3 w-3 ml-1" />תת-קטגוריה</Badge></div></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* -- approvals -- */}
        <TabsContent value="approvals" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {[
              { icon: ClockAlert, color: "text-amber-600", val: "24 שעות", lbl: "זמן הסלמה אוטומטי" },
              { icon: Link2, color: "text-blue-600", val: "4 שלבים", lbl: "שרשרת אישורים מקסימלית" },
              { icon: Signature, color: "text-purple-600", val: "3 חתימות", lbl: "מקסימום חתימות חובה" },
            ].map((s) => (
              <Card key={s.lbl}>
                <CardContent className="p-4 flex items-center gap-3">
                  <s.icon className={`h-8 w-8 ${s.color}`} />
                  <div>
                    <p className="text-2xl font-bold">{s.val}</p>
                    <p className="text-xs text-muted-foreground">{s.lbl}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardContent className="p-4">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">סוג מסמך</TableHead><TableHead className="text-right">שלבי אישור</TableHead><TableHead className="text-right">זמן הסלמה</TableHead><TableHead className="text-right">חתימות נדרשות</TableHead><TableHead className="text-right">חובה</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {approvalDefaults.map((a) => (
                      <TableRow key={a.docType}>
                        <TableCell className="font-semibold">{a.docType}</TableCell>
                        <TableCell><div className="flex items-center gap-2"><Progress value={a.chain * 25} className="h-2 w-16" /><span className="text-sm">{a.chain}</span></div></TableCell>
                        <TableCell>{a.escalation}</TableCell>
                        <TableCell className="font-bold">{a.signatures}</TableCell>
                        <TableCell>{a.mandatory ? <Badge className="bg-red-100 text-red-800 text-xs">חובה</Badge> : <Badge variant="outline" className="text-xs">רשות</Badge>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* -- retention -- */}
        <TabsContent value="retention" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Archive className="h-5 w-5 text-orange-600" />
                <h3 className="font-semibold">מדיניות שימור מסמכים</h3>
                <Badge variant="secondary" className="mr-auto">{retentionPolicies.length} סוגי מסמכים</Badge>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead className="text-right">סוג מסמך</TableHead><TableHead className="text-right">תקופת שימור</TableHead><TableHead className="text-right">ארכיון אוטומטי</TableHead><TableHead className="text-right">החזקה משפטית</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {retentionPolicies.map((r) => (
                      <TableRow key={r.docType}>
                        <TableCell className="font-semibold">{r.docType}</TableCell>
                        <TableCell><div className="flex items-center gap-2"><Progress value={r.retention * 4} className="h-2 w-20" /><span className="font-bold">{r.retention} שנים</span></div></TableCell>
                        <TableCell>{r.autoArchive ? <Badge className="bg-green-100 text-green-800 text-xs"><CheckCircle2 className="h-3 w-3 ml-1" />מופעל</Badge> : <Badge variant="outline" className="text-xs">כבוי</Badge>}</TableCell>
                        <TableCell>{r.legalHold ? <Badge className="bg-red-100 text-red-800 text-xs"><ShieldAlert className="h-3 w-3 ml-1" />פעיל</Badge> : <Badge variant="outline" className="text-xs">--</Badge>}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground"><Scale className="h-4 w-4 inline ml-1 text-orange-600" />מדיניות שימור עומדת בדרישות רשות המסים, חוק הארכיון, ותקנות הגנת הפרטיות.</p>
            </CardContent>
          </Card>
        </TabsContent>
        {/* -- alerts -- */}
        <TabsContent value="alerts" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {alertThresholds.map((a) => (
              <Card key={a.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-md bg-amber-100"><a.icon className="h-5 w-5 text-amber-700" /></div>
                    <span className="font-semibold">{a.label}</span>
                    <Badge className="mr-auto bg-amber-100 text-amber-800">{a.value}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{a.detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
        {/* -- integrations -- */}
        <TabsContent value="integrations" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations.map((intg) => {
              const ok = intg.status === "מחובר";
              return (
                <Card key={intg.name} className={!ok ? "border-red-200" : ""}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-md ${ok ? "bg-green-100" : "bg-red-100"}`}>
                        <intg.icon className={`h-5 w-5 ${ok ? "text-green-700" : "text-red-700"}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{intg.name}</p>
                        <p className="text-xs text-muted-foreground">{intg.provider}</p>
                      </div>
                      <Badge className={ok ? "bg-green-100 text-green-800 text-xs" : "bg-red-100 text-red-800 text-xs"}>
                        {ok ? <><Wifi className="h-3 w-3 ml-1" />מחובר</> : <><WifiOff className="h-3 w-3 ml-1" />מנותק</>}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">סנכרון אחרון: {intg.lastSync}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
