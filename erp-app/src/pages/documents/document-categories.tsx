import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FolderOpen, FileText, Tag, ChevronDown, ChevronLeft, AlertTriangle,
  Zap, Search, ShieldCheck, Settings, Hash, PackageOpen, Banknote,
  Factory, Wrench, Ruler, Award, Scale, HardHat, Users, Briefcase,
  Building2, LayoutList,
} from "lucide-react";

/* ── category data ── */

const FALLBACK_CATEGORIES = [
  { id: 1, name: "רכש", icon: PackageOpen, docs: 645, color: "bg-blue-600", pct: 16.8, subs: ["הזמנות רכש", "תעודות משלוח", "חשבוניות ספק", "חוזי ספק"] },
  { id: 2, name: "כספים", icon: Banknote, docs: 1530, color: "bg-green-600", pct: 39.8, subs: ["חשבוניות", "קבלות", "דוחות כספיים", "אישורי תשלום"] },
  { id: 3, name: "ייצור", icon: Factory, docs: 820, color: "bg-orange-600", pct: 21.3, subs: ["הוראות עבודה", "דוחות QC", "שרטוטים", "BOM"] },
  { id: 4, name: "התקנות", icon: Wrench, docs: 340, color: "bg-purple-600", pct: 8.8, subs: ["פרוטוקולים", "תמונות שטח", "אישורי לקוח"] },
  { id: 5, name: "הנדסה", icon: Ruler, docs: 180, color: "bg-cyan-600", pct: 4.7, subs: ["שרטוטים", "חישובים", "מפרטים טכניים"] },
  { id: 6, name: "איכות", icon: Award, docs: 95, color: "bg-teal-600", pct: 2.5, subs: ["תקנים", "נהלים", "דוחות בדיקה"] },
  { id: 7, name: "משפטי", icon: Scale, docs: 68, color: "bg-rose-600", pct: 1.8, subs: ["חוזים", "NDA", "אישורי רגולציה"] },
  { id: 8, name: "בטיחות", icon: HardHat, docs: 52, color: "bg-amber-600", pct: 1.4, subs: ["הנחיות בטיחות", "דוחות בטיחות", "אישורים"] },
  { id: 9, name: "לקוחות", icon: Users, docs: 58, color: "bg-indigo-600", pct: 1.5, subs: ["הצעות מחיר", "חוזי לקוח", "פרוטוקולי מסירה"] },
  { id: 10, name: "משאבי אנוש", icon: Briefcase, docs: 35, color: "bg-pink-600", pct: 0.9, subs: ["חוזי עבודה", "הסמכות", "הדרכות"] },
  { id: 11, name: "הנהלה", icon: Building2, docs: 15, color: "bg-slate-600", pct: 0.4, subs: ["פרוטוקולי ישיבות", "אסטרטגיה"] },
  { id: 12, name: "כללי", icon: LayoutList, docs: 9, color: "bg-gray-500", pct: 0.2, subs: ["שונות"] },
];

const FALLBACK_UNCATEGORIZED = [
  { id: "UC-001", name: "סריקה_20260401_001.pdf", uploaded: "2026-04-01", uploader: "יוסי כהן", size: "2.4 MB", suggested: "רכש" },
  { id: "UC-002", name: "מייל_ספק_תמונות.zip", uploaded: "2026-04-02", uploader: "דוד מזרחי", size: "18 MB", suggested: "התקנות" },
  { id: "UC-003", name: "טיוטת_הסכם_v2.docx", uploaded: "2026-04-03", uploader: "רחל אברהם", size: "340 KB", suggested: "משפטי" },
  { id: "UC-004", name: "דוח_בדיקה_מעבדה.xlsx", uploaded: "2026-04-03", uploader: "מיכל ברק", size: "1.1 MB", suggested: "איכות" },
  { id: "UC-005", name: "הערות_ישיבה_030426.docx", uploaded: "2026-04-04", uploader: "נועה פרידמן", size: "180 KB", suggested: "הנהלה" },
  { id: "UC-006", name: "תמונה_שטח_IMG4522.jpg", uploaded: "2026-04-05", uploader: "אלון גולדשטיין", size: "5.6 MB", suggested: "התקנות" },
  { id: "UC-007", name: "קובץ_CAD_assembly.stp", uploaded: "2026-04-05", uploader: "אלון גולדשטיין", size: "42 MB", suggested: "הנדסה" },
  { id: "UC-008", name: "אישור_העברה_בנקאית.pdf", uploaded: "2026-04-06", uploader: "שרה לוי", size: "520 KB", suggested: "כספים" },
  { id: "UC-009", name: "תעודת_משלוח_4891.pdf", uploaded: "2026-04-06", uploader: "יוסי כהן", size: "890 KB", suggested: "רכש" },
  { id: "UC-010", name: "נוהל_חירום_טיוטה.docx", uploaded: "2026-04-07", uploader: "מיכל ברק", size: "420 KB", suggested: "בטיחות" },
  { id: "UC-011", name: "הצעת_מחיר_לקוח_XYZ.pdf", uploaded: "2026-04-07", uploader: "שרה מזרחי", size: "1.5 MB", suggested: "לקוחות" },
  { id: "UC-012", name: "חוזה_עבודה_חדש_2026.docx", uploaded: "2026-04-07", uploader: "דוד לוי", size: "310 KB", suggested: "משאבי אנוש" },
];

const FALLBACK_RULES = [
  { id: 1, pattern: "הזמנת רכש / PO-*", target: "רכש > הזמנות רכש", matches: 312, accuracy: 97 },
  { id: 2, pattern: "חשבונית מס / INV-*", target: "כספים > חשבוניות", matches: 845, accuracy: 99 },
  { id: 3, pattern: "שרטוט / DWG-* / .dwg / .stp", target: "הנדסה > שרטוטים", matches: 128, accuracy: 94 },
  { id: 4, pattern: "דוח QC / QC-Report-*", target: "ייצור > דוחות QC", matches: 210, accuracy: 96 },
  { id: 5, pattern: "פרוטוקול התקנה / INST-*", target: "התקנות > פרוטוקולים", matches: 175, accuracy: 92 },
  { id: 6, pattern: "חוזה / NDA / הסכם*", target: "משפטי > חוזים", matches: 45, accuracy: 88 },
  { id: 7, pattern: "קבלה / REC-*", target: "כספים > קבלות", matches: 390, accuracy: 98 },
  { id: 8, pattern: "BOM / Bill of Materials*", target: "ייצור > BOM", matches: 64, accuracy: 91 },
  { id: 9, pattern: "הצעת מחיר / QUOTE-*", target: "לקוחות > הצעות מחיר", matches: 38, accuracy: 90 },
  { id: 10, pattern: "תעודת משלוח / DN-*", target: "רכש > תעודות משלוח", matches: 220, accuracy: 95 },
  { id: 11, pattern: "חוזה עבודה / EMP-*", target: "משאבי אנוש > חוזי עבודה", matches: 28, accuracy: 93 },
  { id: 12, pattern: "פרוטוקול ישיבה / MIN-*", target: "הנהלה > פרוטוקולי ישיבות", matches: 12, accuracy: 87 },
];

/* ── helpers ── */

const FALLBACK_SUMMARY_CARDS = [
  { label: "קטגוריות ראשיות", value: 12, icon: FolderOpen, accent: "text-blue-600" },
  { label: "תתי-קטגוריות", value: 48, icon: Tag, accent: "text-purple-600" },
  { label: "מסמכים מסווגים", value: "3,847", icon: FileText, accent: "text-green-600" },
  { label: "ללא קטגוריה", value: 23, icon: AlertTriangle, accent: "text-red-500" },
];

/* ── component ── */

export default function DocumentCategoriesPage() {

  const { data: apiData } = useQuery({
    queryKey: ["document_categories"],
    queryFn: () => authFetch("/api/documents/document-categories").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const categories = apiData?.categories ?? FALLBACK_CATEGORIES;
  const uncategorized = apiData?.uncategorized ?? FALLBACK_UNCATEGORIZED;
  const rules = apiData?.rules ?? FALLBACK_RULES;
  const summaryCards = apiData?.summaryCards ?? FALLBACK_SUMMARY_CARDS;
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggle = (id: number) => setExpanded(expanded === id ? null : id);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-100">
          <FolderOpen className="h-7 w-7 text-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">קטגוריות וסיווג מסמכים</h1>
          <p className="text-muted-foreground text-sm">טכנו-כל עוזי — ניהול טקסונומיה וסיווג אוטומטי של מסמכים</p>
        </div>
      </div>

      {/* summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {summaryCards.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-8 w-8 ${s.accent}`} />
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* tabs */}
      <Tabs defaultValue="tree" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tree"><FolderOpen className="h-4 w-4 ml-1" />עץ קטגוריות</TabsTrigger>
          <TabsTrigger value="uncat"><AlertTriangle className="h-4 w-4 ml-1" />ללא סיווג</TabsTrigger>
          <TabsTrigger value="rules"><Zap className="h-4 w-4 ml-1" />כללי סיווג</TabsTrigger>
        </TabsList>

        {/* ── category tree ── */}
        <TabsContent value="tree" className="space-y-3">
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isOpen = expanded === cat.id;
            return (
              <Card key={cat.id} className="overflow-hidden">
                <button
                  onClick={() => toggle(cat.id)}
                  className="w-full text-right p-4 flex items-center gap-3 hover:bg-muted/40 transition-colors"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronLeft className="h-4 w-4 shrink-0" />}
                  <div className={`p-2 rounded-md ${cat.color} text-white shrink-0`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base">{cat.name}</span>
                      <Badge variant="secondary" className="text-xs">{cat.docs} מסמכים</Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Progress value={cat.pct} className="h-1.5 flex-1" />
                      <span className="text-xs text-muted-foreground w-12 text-left">{cat.pct}%</span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground hidden sm:block">{cat.subs.length} תתי-קטגוריות</span>
                </button>
                {isOpen && (
                  <CardContent className="pt-0 pb-4 px-6 border-t">
                    <p className="text-sm text-muted-foreground mb-2">תתי-קטגוריות:</p>
                    <div className="flex flex-wrap gap-2">
                      {cat.subs.map((sub) => (
                        <Badge key={sub} variant="outline" className="text-sm py-1 px-3">
                          <Hash className="h-3 w-3 ml-1 opacity-50" />
                          {sub}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-lg font-bold">{cat.docs}</p>
                        <p className="text-xs text-muted-foreground">סה״כ מסמכים</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{cat.subs.length}</p>
                        <p className="text-xs text-muted-foreground">תתי-קטגוריות</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold">{cat.pct}%</p>
                        <p className="text-xs text-muted-foreground">מכלל המסמכים</p>
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* distribution summary */}
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <LayoutList className="h-4 w-4 text-muted-foreground" />
                סיכום התפלגות מסמכים
              </h3>
              <div className="space-y-2">
                {categories.slice(0, 5).map((cat) => (
                  <div key={cat.id} className="flex items-center gap-3">
                    <span className="text-sm w-20 font-medium">{cat.name}</span>
                    <Progress value={cat.pct} className="h-3 flex-1" />
                    <span className="text-sm text-muted-foreground w-20 text-left">
                      {cat.docs} ({cat.pct}%)
                    </span>
                  </div>
                ))}
                <div className="flex items-center gap-3">
                  <span className="text-sm w-20 font-medium text-muted-foreground">אחר</span>
                  <Progress value={4.7} className="h-3 flex-1" />
                  <span className="text-sm text-muted-foreground w-20 text-left">
                    332 (8.6%)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── uncategorized ── */}
        <TabsContent value="uncat" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <h3 className="font-semibold">23 מסמכים ללא סיווג</h3>
                <Badge variant="destructive" className="mr-auto">דורש טיפול</Badge>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">מזהה</TableHead>
                      <TableHead className="text-right">שם קובץ</TableHead>
                      <TableHead className="text-right">תאריך העלאה</TableHead>
                      <TableHead className="text-right">מעלה</TableHead>
                      <TableHead className="text-right">גודל</TableHead>
                      <TableHead className="text-right">קטגוריה מוצעת</TableHead>
                      <TableHead className="text-right">פעולה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uncategorized.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-mono text-xs">{doc.id}</TableCell>
                        <TableCell className="font-medium">{doc.name}</TableCell>
                        <TableCell>{doc.uploaded}</TableCell>
                        <TableCell>{doc.uploader}</TableCell>
                        <TableCell>{doc.size}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-blue-50">
                            <Search className="h-3 w-3 ml-1" />
                            {doc.suggested}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Badge className="cursor-pointer bg-green-600 hover:bg-green-700 text-white text-xs">אשר</Badge>
                            <Badge variant="outline" className="cursor-pointer text-xs">שנה</Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">* מוצגים 8 מתוך 23 מסמכים ללא סיווג. הקטגוריה המוצעת מבוססת על ניתוח AI של שם הקובץ ותוכנו.</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── classification rules ── */}
        <TabsContent value="rules" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Settings className="h-5 w-5 text-purple-600" />
                <h3 className="font-semibold">כללי סיווג אוטומטי</h3>
                <Badge variant="secondary" className="mr-auto">{rules.length} כללים פעילים</Badge>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">#</TableHead>
                      <TableHead className="text-right">תבנית / Pattern</TableHead>
                      <TableHead className="text-right">קטגוריית יעד</TableHead>
                      <TableHead className="text-right">התאמות</TableHead>
                      <TableHead className="text-right">דיוק</TableHead>
                      <TableHead className="text-right">סטטוס</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono">{r.id}</TableCell>
                        <TableCell className="font-mono text-sm">{r.pattern}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.target}</Badge>
                        </TableCell>
                        <TableCell className="font-bold">{r.matches.toLocaleString()}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={r.accuracy} className="h-2 w-16" />
                            <span className="text-xs">{r.accuracy}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-green-100 text-green-800">
                            <ShieldCheck className="h-3 w-3 ml-1" />
                            פעיל
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                <Zap className="h-4 w-4 inline ml-1 text-yellow-600" />
                מנוע הסיווג האוטומטי פועל על כל מסמך חדש שמועלה למערכת. כללים מבוססים על שם קובץ, סוג קובץ, מטאדאטה ותוכן המסמך (OCR + NLP).
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
