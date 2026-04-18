import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Link, FileText, Package, Users, Truck, Factory, Wrench,
  ScrollText, Box, UserCheck, Building2, AlertTriangle, CheckCircle2,
  Zap, ClipboardList,
} from "lucide-react";

/* -- mock data -- */

const FALLBACK_ENTITY_TYPES = [
  { name: "פרויקטים", docs: 512, entities: 45, icon: <ClipboardList className="w-5 h-5" />, color: "text-blue-400", bg: "bg-blue-900/30" },
  { name: "הזמנות רכש", docs: 645, entities: 380, icon: <Package className="w-5 h-5" />, color: "text-emerald-400", bg: "bg-emerald-900/30" },
  { name: "לקוחות", docs: 320, entities: 89, icon: <Users className="w-5 h-5" />, color: "text-cyan-400", bg: "bg-cyan-900/30" },
  { name: "ספקים", docs: 410, entities: 62, icon: <Truck className="w-5 h-5" />, color: "text-orange-400", bg: "bg-orange-900/30" },
  { name: "הזמנות ייצור", docs: 480, entities: 290, icon: <Factory className="w-5 h-5" />, color: "text-purple-400", bg: "bg-purple-900/30" },
  { name: "התקנות", docs: 340, entities: 180, icon: <Wrench className="w-5 h-5" />, color: "text-pink-400", bg: "bg-pink-900/30" },
  { name: "חוזים", docs: 68, entities: 34, icon: <ScrollText className="w-5 h-5" />, color: "text-amber-400", bg: "bg-amber-900/30" },
  { name: "מוצרים", docs: 155, entities: 45, icon: <Box className="w-5 h-5" />, color: "text-teal-400", bg: "bg-teal-900/30" },
  { name: "עובדים", docs: 35, entities: 16, icon: <UserCheck className="w-5 h-5" />, color: "text-indigo-400", bg: "bg-indigo-900/30" },
  { name: "נכסים", docs: 59, entities: 45, icon: <Building2 className="w-5 h-5" />, color: "text-rose-400", bg: "bg-rose-900/30" },
];

const FALLBACK_LINKED_DOCS = [
  { id: "DOC-1001", name: "מפרט טכני מסגרת T-400", entityType: "מוצרים", entityId: "PRD-045", entityName: "מסגרת T-400", linkType: "ראשי", linkedBy: "אלון גולדשטיין", date: "2026-04-01" },
  { id: "DOC-1002", name: "חוזה אספקה שנתי", entityType: "ספקים", entityId: "VND-012", entityName: "מתכת-פרו בע\"מ", linkType: "ראשי", linkedBy: "יוסי כהן", date: "2026-03-28" },
  { id: "DOC-1003", name: "תעודת משלוח 78120", entityType: "הזמנות רכש", entityId: "PO-4520", entityName: "הזמנת חומרי גלם Q2", linkType: "תומך", linkedBy: "דוד מזרחי", date: "2026-04-03" },
  { id: "DOC-1004", name: "הצעת מחיר פרויקט דלתא", entityType: "לקוחות", entityId: "CUS-089", entityName: "דלתא תעשיות", linkType: "ראשי", linkedBy: "שרה מזרחי", date: "2026-04-05" },
  { id: "DOC-1005", name: "פרוטוקול בדיקת קבלה", entityType: "הזמנות ייצור", entityId: "WO-2901", entityName: "ייצור ציר SH-40 אצווה 12", linkType: "תומך", linkedBy: "מיכל ברק", date: "2026-04-02" },
  { id: "DOC-1006", name: "דו\"ח התקנה סופי", entityType: "התקנות", entityId: "INS-180", entityName: "התקנת מערכת מיזוג אולם 3", linkType: "ראשי", linkedBy: "עומר חדד", date: "2026-04-04" },
  { id: "DOC-1007", name: "נספח תנאי תשלום", entityType: "חוזים", entityId: "CNT-034", entityName: "חוזה שכירות מחסן צפון", linkType: "נספח", linkedBy: "נועה פרידמן", date: "2026-03-30" },
  { id: "DOC-1008", name: "תכנית עבודה רבעונית", entityType: "פרויקטים", entityId: "PRJ-045", entityName: "פרויקט אלפא Q2", linkType: "תומך", linkedBy: "דוד לוי", date: "2026-04-06" },
  { id: "DOC-1009", name: "אישור כניסת ספק למפעל", entityType: "ספקים", entityId: "VND-033", entityName: "לוגיטק שירותים", linkType: "נספח", linkedBy: "רחל אברהם", date: "2026-04-01" },
  { id: "DOC-1010", name: "תעודת אחריות מורחבת", entityType: "מוצרים", entityId: "PRD-022", entityName: "לוח בקרה PCB-8L", linkType: "תומך", linkedBy: "אלון גולדשטיין", date: "2026-03-25" },
  { id: "DOC-1011", name: "טופס העסקת עובד", entityType: "עובדים", entityId: "EMP-016", entityName: "יעל שפירא", linkType: "ראשי", linkedBy: "שרה לוי", date: "2026-03-20" },
  { id: "DOC-1012", name: "שרטוט נכס מקרקעין", entityType: "נכסים", entityId: "AST-045", entityName: "מבנה תעשייה צפון 3", linkType: "ראשי", linkedBy: "נועה פרידמן", date: "2026-04-07" },
  { id: "DOC-1013", name: "דו\"ח איכות חומרי גלם", entityType: "הזמנות רכש", entityId: "PO-4488", entityName: "הזמנת פלדה אל-חלד", linkType: "תומך", linkedBy: "מיכל ברק", date: "2026-03-29" },
  { id: "DOC-1014", name: "סיכום ישיבת פתיחה", entityType: "פרויקטים", entityId: "PRJ-041", entityName: "פרויקט בטא שדרוג", linkType: "נספח", linkedBy: "דוד לוי", date: "2026-04-02" },
  { id: "DOC-1015", name: "חשבונית מס 92010", entityType: "לקוחות", entityId: "CUS-045", entityName: "אלקטרו-סיסטם בע\"מ", linkType: "תומך", linkedBy: "רחל אברהם", date: "2026-04-06" },
];

const FALLBACK_ORPHAN_DOCS = [
  { id: "ORP-001", name: "סריקה_חשבונית_לא_מזוהה.pdf", uploaded: "2026-04-05", size: "1.2 MB", suggestedEntity: "הזמנות רכש" },
  { id: "ORP-002", name: "מכתב_ספק_ישן.docx", uploaded: "2026-04-03", size: "340 KB", suggestedEntity: "ספקים" },
  { id: "ORP-003", name: "תמונות_התקנה_שטח.zip", uploaded: "2026-04-06", size: "45 MB", suggestedEntity: "התקנות" },
  { id: "ORP-004", name: "הערות_ישיבה_20260401.pdf", uploaded: "2026-04-01", size: "890 KB", suggestedEntity: "פרויקטים" },
  { id: "ORP-005", name: "drawing_unknown_rev3.dwg", uploaded: "2026-03-30", size: "5.6 MB", suggestedEntity: "מוצרים" },
  { id: "ORP-006", name: "אישור_משלוח_חסר_פרטים.pdf", uploaded: "2026-04-04", size: "220 KB", suggestedEntity: "הזמנות רכש" },
  { id: "ORP-007", name: "חוזה_טיוטה_v0.docx", uploaded: "2026-04-02", size: "1.8 MB", suggestedEntity: "חוזים" },
  { id: "ORP-008", name: "scan_batch_040726.pdf", uploaded: "2026-04-07", size: "12 MB", suggestedEntity: "---" },
  { id: "ORP-009", name: "קובץ_אקסל_נתונים.xlsx", uploaded: "2026-03-28", size: "3.4 MB", suggestedEntity: "פרויקטים" },
  { id: "ORP-010", name: "תעודת_כיול_ללא_מספר.pdf", uploaded: "2026-04-01", size: "510 KB", suggestedEntity: "נכסים" },
  { id: "ORP-011", name: "מייל_מצורף_לקוח.eml", uploaded: "2026-04-05", size: "180 KB", suggestedEntity: "לקוחות" },
  { id: "ORP-012", name: "photo_warehouse_damage.jpg", uploaded: "2026-04-06", size: "8.2 MB", suggestedEntity: "נכסים" },
  { id: "ORP-013", name: "נוהל_ישן_ללא_קוד.pdf", uploaded: "2026-03-25", size: "670 KB", suggestedEntity: "---" },
  { id: "ORP-014", name: "הזמנה_סרוקה_טשטוש.pdf", uploaded: "2026-04-03", size: "950 KB", suggestedEntity: "הזמנות רכש" },
  { id: "ORP-015", name: "מסמך_בדיקה_temp.pdf", uploaded: "2026-04-07", size: "430 KB", suggestedEntity: "הזמנות ייצור" },
  { id: "ORP-016", name: "עדכון_מחירון_2025.xlsx", uploaded: "2026-03-20", size: "2.1 MB", suggestedEntity: "ספקים" },
  { id: "ORP-017", name: "צילום_שלט_בטיחות.png", uploaded: "2026-04-04", size: "4.5 MB", suggestedEntity: "---" },
  { id: "ORP-018", name: "draft_proposal_v1.pdf", uploaded: "2026-04-02", size: "1.5 MB", suggestedEntity: "לקוחות" },
  { id: "ORP-019", name: "רשימת_חלקים_חסרה.csv", uploaded: "2026-04-06", size: "120 KB", suggestedEntity: "מוצרים" },
  { id: "ORP-020", name: "סיכום_שיחה_ספק.pdf", uploaded: "2026-04-01", size: "280 KB", suggestedEntity: "ספקים" },
  { id: "ORP-021", name: "תשריט_קומה_ישן.pdf", uploaded: "2026-03-29", size: "6.7 MB", suggestedEntity: "נכסים" },
  { id: "ORP-022", name: "טבלת_מעקב_לא_שמורה.xlsx", uploaded: "2026-04-05", size: "1.9 MB", suggestedEntity: "פרויקטים" },
  { id: "ORP-023", name: "אישור_כיבוי_אש_ישן.pdf", uploaded: "2026-03-22", size: "340 KB", suggestedEntity: "נכסים" },
];

const FALLBACK_AUTO_RULES = [
  { pattern: "חשבונית*", targetEntity: "הזמנות רכש", field: "מספר הזמנה", confidence: 95, active: true },
  { pattern: "חוזה*", targetEntity: "חוזים", field: "מספר חוזה", confidence: 92, active: true },
  { pattern: "שרטוט*|DWG*", targetEntity: "מוצרים", field: "קוד מוצר", confidence: 88, active: true },
  { pattern: "פרוטוקול בדיקה*", targetEntity: "הזמנות ייצור", field: "מספר WO", confidence: 90, active: true },
  { pattern: "דו\"ח התקנה*", targetEntity: "התקנות", field: "מספר התקנה", confidence: 94, active: true },
  { pattern: "טופס עובד*|HR-*", targetEntity: "עובדים", field: "מספר עובד", confidence: 97, active: true },
  { pattern: "תעודת משלוח*", targetEntity: "הזמנות רכש", field: "מספר PO", confidence: 91, active: false },
  { pattern: "הצעת מחיר*", targetEntity: "לקוחות", field: "מספר לקוח", confidence: 86, active: true },
];

/* -- helpers -- */

const linkTypeColor: Record<string, string> = {
  "ראשי": "bg-blue-900/60 text-blue-300",
  "תומך": "bg-emerald-900/60 text-emerald-300",
  "נספח": "bg-amber-900/60 text-amber-300",
};

const FALLBACK_KPIS = [
  { label: "מסמכים מקושרים", value: 3_824, icon: <Link className="w-5 h-5" />, color: "text-blue-400" },
  { label: "ישויות עם מסמכים", value: 1_245, icon: <Users className="w-5 h-5" />, color: "text-emerald-400" },
  { label: "קישורים", value: 5_890, icon: <FileText className="w-5 h-5" />, color: "text-purple-400" },
  { label: "יתומים", value: 23, icon: <AlertTriangle className="w-5 h-5" />, color: "text-red-400" },
];

/* -- component -- */

export default function EntityLinkedDocuments() {

  const { data: apiData } = useQuery({
    queryKey: ["entity_linked_documents"],
    queryFn: () => authFetch("/api/documents/entity-linked-documents").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const entityTypes = apiData?.entityTypes ?? FALLBACK_ENTITY_TYPES;
  const linkedDocs = apiData?.linkedDocs ?? FALLBACK_LINKED_DOCS;
  const orphanDocs = apiData?.orphanDocs ?? FALLBACK_ORPHAN_DOCS;
  const autoRules = apiData?.autoRules ?? FALLBACK_AUTO_RULES;
  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const [tab, setTab] = useState("overview");

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0a0f] text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link className="w-7 h-7 text-blue-400" />
        <h1 className="text-2xl font-bold tracking-tight">מסמכים מקושרים לישויות</h1>
        <Badge className="bg-blue-900/50 text-blue-300 mr-auto">טכנו-כל עוזי</Badge>
      </div>

      <p className="text-sm text-slate-400">כל מסמך חייב להיות מקושר לישות עסקית -- אין קבצים יתומים</p>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <TabsTrigger value="overview">סקירה</TabsTrigger>
          <TabsTrigger value="links">קישורים</TabsTrigger>
          <TabsTrigger value="orphans">יתומים</TabsTrigger>
          <TabsTrigger value="rules">חוקי קישור אוטומטי</TabsTrigger>
        </TabsList>

        {/* -- Overview -- */}
        <TabsContent value="overview">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {entityTypes.map((e) => (
              <Card key={e.name} className="bg-[#12121a] border-[#1e1e2e] hover:border-[#2e2e4e] transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={e.color}>{e.icon}</span>
                    <span className="font-semibold text-sm">{e.name}</span>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-2xl font-bold">{e.docs.toLocaleString("he-IL")}</div>
                      <div className="text-xs text-slate-400">מסמכים</div>
                    </div>
                    <div className="text-left">
                      <div className="text-lg font-semibold text-slate-300">{e.entities}</div>
                      <div className="text-xs text-slate-500">ישויות</div>
                    </div>
                  </div>
                  <Progress value={Math.min(100, (e.docs / 650) * 100)} className="h-1.5" />
                  <div className="text-xs text-slate-500">ממוצע {(e.docs / e.entities).toFixed(1)} מסמכים/ישות</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Coverage summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <Card className="bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-semibold">כיסוי קישורים</span>
                </div>
                <div className="text-3xl font-bold text-emerald-400">99.4%</div>
                <Progress value={99.4} className="h-2" />
                <p className="text-xs text-slate-500">3,824 מתוך 3,847 מסמכים מקושרים לישות</p>
              </CardContent>
            </Card>
            <Card className="bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Link className="w-4 h-4 text-purple-400" />
                  <span className="text-sm font-semibold">ממוצע קישורים/מסמך</span>
                </div>
                <div className="text-3xl font-bold text-purple-400">1.54</div>
                <Progress value={77} className="h-2" />
                <p className="text-xs text-slate-500">5,890 קישורים ל-3,824 מסמכים</p>
              </CardContent>
            </Card>
            <Card className="bg-[#12121a] border-[#1e1e2e]">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold">קישור אוטומטי (חודש אחרון)</span>
                </div>
                <div className="text-3xl font-bold text-amber-400">312</div>
                <Progress value={62} className="h-2" />
                <p className="text-xs text-slate-500">62% מהקישורים בוצעו אוטומטית</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* -- Links table -- */}
        <TabsContent value="links">
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">מזהה</TableHead>
                    <TableHead className="text-right text-slate-400">שם מסמך</TableHead>
                    <TableHead className="text-right text-slate-400">סוג ישות</TableHead>
                    <TableHead className="text-right text-slate-400">מזהה ישות</TableHead>
                    <TableHead className="text-right text-slate-400">שם ישות</TableHead>
                    <TableHead className="text-right text-slate-400">סוג קישור</TableHead>
                    <TableHead className="text-right text-slate-400">קושר ע"י</TableHead>
                    <TableHead className="text-right text-slate-400">תאריך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linkedDocs.map((d) => (
                    <TableRow key={d.id} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-mono text-blue-400">{d.id}</TableCell>
                      <TableCell>{d.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-slate-300 border-slate-600">{d.entityType}</Badge></TableCell>
                      <TableCell className="font-mono text-cyan-400">{d.entityId}</TableCell>
                      <TableCell className="text-sm">{d.entityName}</TableCell>
                      <TableCell><Badge className={linkTypeColor[d.linkType] || "bg-slate-700 text-slate-300"}>{d.linkType}</Badge></TableCell>
                      <TableCell className="text-slate-400">{d.linkedBy}</TableCell>
                      <TableCell className="text-slate-400">{d.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -- Orphan documents -- */}
        <TabsContent value="orphans">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-sm text-red-300 font-semibold">{orphanDocs.length} מסמכים יתומים דורשים שיוך לישות עסקית</span>
          </div>
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">מזהה</TableHead>
                    <TableHead className="text-right text-slate-400">שם קובץ</TableHead>
                    <TableHead className="text-right text-slate-400">הועלה</TableHead>
                    <TableHead className="text-right text-slate-400">גודל</TableHead>
                    <TableHead className="text-right text-slate-400">ישות מוצעת (AI)</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orphanDocs.map((o) => (
                    <TableRow key={o.id} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-mono text-red-400">{o.id}</TableCell>
                      <TableCell className="font-mono text-xs">{o.name}</TableCell>
                      <TableCell className="text-slate-400">{o.uploaded}</TableCell>
                      <TableCell className="text-slate-400">{o.size}</TableCell>
                      <TableCell>
                        {o.suggestedEntity === "---"
                          ? <Badge className="bg-slate-700 text-slate-400">לא זוהה</Badge>
                          : <Badge className="bg-purple-900/60 text-purple-300">{o.suggestedEntity}</Badge>
                        }
                      </TableCell>
                      <TableCell><Badge className="bg-red-900/60 text-red-300">ממתין לשיוך</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* -- Auto-link rules -- */}
        <TabsContent value="rules">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-5 h-5 text-amber-400" />
            <span className="text-sm text-slate-300 font-semibold">חוקים לקישור אוטומטי של מסמכים לישויות</span>
          </div>
          <Card className="bg-[#12121a] border-[#1e1e2e]">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e1e2e]">
                    <TableHead className="text-right text-slate-400">תבנית שם קובץ</TableHead>
                    <TableHead className="text-right text-slate-400">ישות יעד</TableHead>
                    <TableHead className="text-right text-slate-400">שדה מזהה</TableHead>
                    <TableHead className="text-right text-slate-400">רמת ביטחון</TableHead>
                    <TableHead className="text-right text-slate-400">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {autoRules.map((r, i) => (
                    <TableRow key={i} className="border-[#1e1e2e] hover:bg-[#1a1a2e]">
                      <TableCell className="font-mono text-cyan-400 text-xs">{r.pattern}</TableCell>
                      <TableCell><Badge variant="outline" className="text-slate-300 border-slate-600">{r.targetEntity}</Badge></TableCell>
                      <TableCell className="text-slate-400">{r.field}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={r.confidence} className="h-2 w-20" />
                          <span className="text-xs text-slate-300">{r.confidence}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={r.active ? "bg-emerald-900/60 text-emerald-300" : "bg-slate-700 text-slate-400"}>
                          {r.active ? "פעיל" : "מושבת"}
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
    </div>
  );
}
