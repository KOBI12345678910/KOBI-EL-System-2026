import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileText, FilePlus, FileWarning, FileSearch, FileClock, FileCheck2,
  TrendingUp, TrendingDown, Search, Download, LayoutTemplate,
  AlertTriangle, CalendarClock, User, Hash, Clock,
} from "lucide-react";

/* ── Engineering Technical Documents ──
   technical_specs, installation_manuals, material_datasheets,
   test_reports, calculation_sheets, work_instructions,
   quality_plans, inspection_checklists, document_templates
*/

// ── Documents ──
const documents = [
  { id: "DOC-1001", title: "מפרט טכני פרופיל אלומיניום 6063-T5", type: "מפרט טכני", version: "3.2", status: "פעיל", owner: "יוסי כהן", updated: "2026-04-05" },
  { id: "DOC-1002", title: "מדריך התקנת קירות מסך מערכת XP-200", type: "מדריך התקנה", version: "2.1", status: "פעיל", owner: "שרה לוי", updated: "2026-04-03" },
  { id: "DOC-1003", title: "דף נתוני חומר -- זכוכית מחוסמת 10 מ\"מ", type: "דף נתוני חומר", version: "1.4", status: "פעיל", owner: "דוד מזרחי", updated: "2026-03-28" },
  { id: "DOC-1004", title: "דוח בדיקת עמידות לרוח -- מגדל תל אביב", type: "דוח בדיקה", version: "1.0", status: "ממתין לסקירה", owner: "רחל אברהם", updated: "2026-04-07" },
  { id: "DOC-1005", title: "גיליון חישוב עומסים -- חזית מפעל לוד", type: "גיליון חישוב", version: "2.0", status: "פעיל", owner: "אלון גולדשטיין", updated: "2026-04-01" },
  { id: "DOC-1006", title: "הוראות עבודה -- ריתוך פרופילי אלומיניום", type: "הוראות עבודה", version: "4.1", status: "פעיל", owner: "מיכל ברק", updated: "2026-03-20" },
  { id: "DOC-1007", title: "תוכנית איכות -- פרויקט בית חולים אשדוד", type: "תוכנית איכות", version: "1.2", status: "פג תוקף", owner: "עומר חדד", updated: "2025-12-15" },
  { id: "DOC-1008", title: "רשימת בדיקה -- בדיקת חלונות לפני משלוח", type: "רשימת בדיקה", version: "3.0", status: "פעיל", owner: "נועה פרידמן", updated: "2026-04-02" },
  { id: "DOC-1009", title: "מפרט טכני תריס חשמלי דגם TR-500", type: "מפרט טכני", version: "1.8", status: "ממתין לסקירה", owner: "יוסי כהן", updated: "2026-04-06" },
  { id: "DOC-1010", title: "מדריך התקנת דלתות מפולשות אוטומטיות", type: "מדריך התקנה", version: "2.5", status: "פעיל", owner: "שרה לוי", updated: "2026-03-15" },
  { id: "DOC-1011", title: "דף נתוני חומר -- אטם סיליקון מבני", type: "דף נתוני חומר", version: "1.1", status: "פעיל", owner: "דוד מזרחי", updated: "2026-02-20" },
  { id: "DOC-1012", title: "דוח בדיקת אטימות מים -- מרכז מסחרי ב\"ש", type: "דוח בדיקה", version: "1.0", status: "פעיל", owner: "רחל אברהם", updated: "2026-03-30" },
  { id: "DOC-1013", title: "גיליון חישוב בידוד תרמי -- קניון ירושלים", type: "גיליון חישוב", version: "1.3", status: "פג תוקף", owner: "אלון גולדשטיין", updated: "2025-11-10" },
  { id: "DOC-1014", title: "הוראות עבודה -- חיתוך CNC פרופילים", type: "הוראות עבודה", version: "5.0", status: "פעיל", owner: "מיכל ברק", updated: "2026-04-04" },
  { id: "DOC-1015", title: "רשימת בדיקה -- קבלת חומרי גלם", type: "רשימת בדיקה", version: "2.2", status: "ממתין לסקירה", owner: "נועה פרידמן", updated: "2026-04-08" },
];

// ── Templates ──
const templates = [
  { id: "TPL-01", name: "תבנית מפרט טכני", category: "מפרט", format: "DOCX", pages: 12, lastUsed: "2026-04-05", usageCount: 34 },
  { id: "TPL-02", name: "תבנית דוח בדיקה", category: "בדיקה", format: "DOCX", pages: 8, lastUsed: "2026-04-07", usageCount: 28 },
  { id: "TPL-03", name: "תבנית גיליון חישוב", category: "חישוב", format: "XLSX", pages: 5, lastUsed: "2026-04-01", usageCount: 19 },
  { id: "TPL-04", name: "תבנית כותרת שרטוט", category: "שרטוט", format: "DWG", pages: 1, lastUsed: "2026-04-06", usageCount: 87 },
  { id: "TPL-05", name: "תבנית אישור חומר", category: "איכות", format: "PDF", pages: 3, lastUsed: "2026-03-28", usageCount: 42 },
  { id: "TPL-06", name: "תבנית מדריך התקנה", category: "התקנה", format: "DOCX", pages: 20, lastUsed: "2026-04-03", usageCount: 15 },
  { id: "TPL-07", name: "תבנית מדריך תחזוקה", category: "תחזוקה", format: "DOCX", pages: 15, lastUsed: "2026-03-20", usageCount: 11 },
  { id: "TPL-08", name: "תבנית מסמך אחריות", category: "אחריות", format: "PDF", pages: 4, lastUsed: "2026-04-02", usageCount: 23 },
];

// ── Expiring Documents ──
const expiringDocs = [
  { id: "DOC-1007", title: "תוכנית איכות -- פרויקט בית חולים אשדוד", reviewDate: "2025-12-15", daysOverdue: 114, owner: "עומר חדד", severity: "קריטי" },
  { id: "DOC-1013", title: "גיליון חישוב בידוד תרמי -- קניון ירושלים", reviewDate: "2025-11-10", daysOverdue: 149, owner: "אלון גולדשטיין", severity: "קריטי" },
  { id: "DOC-1006", title: "הוראות עבודה -- ריתוך פרופילי אלומיניום", reviewDate: "2026-04-20", daysOverdue: -12, owner: "מיכל ברק", severity: "אזהרה" },
  { id: "DOC-1011", title: "דף נתוני חומר -- אטם סיליקון מבני", reviewDate: "2026-04-25", daysOverdue: -17, owner: "דוד מזרחי", severity: "אזהרה" },
  { id: "DOC-1010", title: "מדריך התקנת דלתות מפולשות אוטומטיות", reviewDate: "2026-05-01", daysOverdue: -23, owner: "שרה לוי", severity: "תקין" },
  { id: "DOC-1003", title: "דף נתוני חומר -- זכוכית מחוסמת 10 מ\"מ", reviewDate: "2026-05-10", daysOverdue: -32, owner: "דוד מזרחי", severity: "תקין" },
];

// ── Badge color helpers ──
const docStatusColor = (s: string) =>
  s === "פעיל" ? "bg-green-500/20 text-green-300"
  : s === "ממתין לסקירה" ? "bg-amber-500/20 text-amber-300"
  : "bg-red-500/20 text-red-300";

const severityColor = (s: string) =>
  s === "קריטי" ? "bg-red-500/20 text-red-300"
  : s === "אזהרה" ? "bg-amber-500/20 text-amber-300"
  : "bg-green-500/20 text-green-300";

const formatColor = (s: string) =>
  s === "DOCX" ? "bg-blue-500/20 text-blue-300"
  : s === "XLSX" ? "bg-green-500/20 text-green-300"
  : s === "DWG" ? "bg-purple-500/20 text-purple-300"
  : "bg-orange-500/20 text-orange-300";

const typeColor = (s: string) =>
  s === "מפרט טכני" ? "bg-blue-500/20 text-blue-300"
  : s === "מדריך התקנה" ? "bg-cyan-500/20 text-cyan-300"
  : s === "דף נתוני חומר" ? "bg-teal-500/20 text-teal-300"
  : s === "דוח בדיקה" ? "bg-amber-500/20 text-amber-300"
  : s === "גיליון חישוב" ? "bg-purple-500/20 text-purple-300"
  : s === "הוראות עבודה" ? "bg-indigo-500/20 text-indigo-300"
  : s === "תוכנית איכות" ? "bg-rose-500/20 text-rose-300"
  : "bg-emerald-500/20 text-emerald-300";

const th = "p-3 text-right text-muted-foreground font-medium text-xs";
const td = "p-3 text-sm";

export default function EngineeringDocumentsPage() {
  const [tab, setTab] = useState("documents");
  const [searchQuery, setSearchQuery] = useState("");

  const activeCount = documents.filter(d => d.status === "פעיל").length;
  const expiredCount = documents.filter(d => d.status === "פג תוקף").length;
  const pendingCount = documents.filter(d => d.status === "ממתין לסקירה").length;
  const thisMonthCount = documents.filter(d => d.updated.startsWith("2026-04")).length;

  const kpis = [
    { label: "סה\"כ מסמכים", value: documents.length.toString(), icon: FileText, color: "text-blue-400", trend: "+4", up: true },
    { label: "גרסאות פעילות", value: activeCount.toString(), icon: FileCheck2, color: "text-green-400", trend: "+3", up: true },
    { label: "פג תוקף", value: expiredCount.toString(), icon: FileWarning, color: "text-red-400", trend: "-1", up: true },
    { label: "ממתינים לסקירה", value: pendingCount.toString(), icon: FileClock, color: "text-amber-400", trend: "+2", up: false },
    { label: "מסמכים החודש", value: thisMonthCount.toString(), icon: FilePlus, color: "text-purple-400", trend: "+5", up: true },
  ];

  // ── Search logic ──
  const searchResults = searchQuery.trim().length > 0
    ? documents.filter(d =>
        d.title.includes(searchQuery) ||
        d.id.includes(searchQuery) ||
        d.type.includes(searchQuery) ||
        d.owner.includes(searchQuery)
      )
    : [];

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-400" />
            תיעוד טכני / הנדסי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי -- Engineering Technical Documentation</p>
        </div>
        <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2 text-xs">
          <FilePlus className="h-4 w-4" />
          מסמך חדש
        </Button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] text-muted-foreground">{k.label}</p>
                  <p className={`text-lg font-bold font-mono mt-1 ${k.color}`}>{k.value}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {k.up ? <TrendingUp className="h-3 w-3 text-green-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                    <span className={`text-[10px] ${k.up ? "text-green-400" : "text-red-400"}`}>{k.trend}</span>
                  </div>
                </div>
                <k.icon className={`h-5 w-5 ${k.color} opacity-60`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Compliance Progress ── */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">מסמכים בתוקף -- יעד 95%</span>
            <span className="text-sm font-mono text-green-400">{Math.round((activeCount / documents.length) * 100)}%</span>
          </div>
          <Progress value={Math.round((activeCount / documents.length) * 100)} className="h-2" />
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-card/60 border border-border w-full justify-start gap-1 p-1 h-auto flex-wrap">
          <TabsTrigger value="documents" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />מסמכים</TabsTrigger>
          <TabsTrigger value="templates" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><LayoutTemplate className="h-3.5 w-3.5" />תבניות</TabsTrigger>
          <TabsTrigger value="expiring" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><AlertTriangle className="h-3.5 w-3.5" />תוקף מתקרב</TabsTrigger>
          <TabsTrigger value="search" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><Search className="h-3.5 w-3.5" />חיפוש</TabsTrigger>
        </TabsList>

        {/* ── Documents Tab ── */}
        <TabsContent value="documents">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מספר מסמך</th><th className={th}>כותרת</th><th className={th}>סוג</th>
              <th className={th}>גרסה</th><th className={th}>סטטוס</th><th className={th}>אחראי</th><th className={th}>עודכן</th>
            </tr></thead><tbody>
              {documents.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400 font-bold`}>{r.id}</td>
                  <td className={`${td} text-foreground font-medium max-w-[300px]`}>{r.title}</td>
                  <td className={td}><Badge className={`${typeColor(r.type)} border-0 text-xs`}>{r.type}</Badge></td>
                  <td className={`${td} font-mono text-center text-purple-400`}>v{r.version}</td>
                  <td className={td}><Badge className={`${docStatusColor(r.status)} border-0 text-xs`}>{r.status}</Badge></td>
                  <td className={`${td} text-muted-foreground`}><span className="flex items-center gap-1"><User className="h-3 w-3" />{r.owner}</span></td>
                  <td className={`${td} font-mono text-muted-foreground text-xs`}>{r.updated}</td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Templates Tab ── */}
        <TabsContent value="templates">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {templates.map((t, i) => (
              <Card key={i} className="bg-card/80 border-border hover:border-blue-500/40 transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <LayoutTemplate className="h-5 w-5 text-blue-400" />
                      <span className="font-mono text-xs text-muted-foreground">{t.id}</span>
                    </div>
                    <Badge className={`${formatColor(t.format)} border-0 text-xs`}>{t.format}</Badge>
                  </div>
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Hash className="h-3 w-3" />{t.pages} עמודים</span>
                    <span>{t.category}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.lastUsed}</span>
                    <span className="text-green-400">{t.usageCount} שימושים</span>
                  </div>
                  <Button variant="outline" className="w-full text-xs gap-1.5 h-8 border-border hover:bg-blue-600/20 hover:text-blue-300">
                    <Download className="h-3 w-3" />
                    הורד תבנית
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Expiring Tab ── */}
        <TabsContent value="expiring">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מספר מסמך</th><th className={th}>כותרת</th><th className={th}>תאריך סקירה</th>
              <th className={th}>ימים</th><th className={th}>אחראי</th><th className={th}>חומרה</th>
            </tr></thead><tbody>
              {expiringDocs.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400 font-bold`}>{r.id}</td>
                  <td className={`${td} text-foreground font-medium max-w-[300px]`}>{r.title}</td>
                  <td className={`${td} font-mono text-muted-foreground`}>
                    <span className="flex items-center gap-1"><CalendarClock className="h-3 w-3" />{r.reviewDate}</span>
                  </td>
                  <td className={`${td} font-mono text-center`}>
                    <span className={r.daysOverdue > 0 ? "text-red-400 font-bold" : "text-amber-400"}>
                      {r.daysOverdue > 0 ? `+${r.daysOverdue} באיחור` : `${Math.abs(r.daysOverdue)} ימים`}
                    </span>
                  </td>
                  <td className={`${td} text-muted-foreground`}><span className="flex items-center gap-1"><User className="h-3 w-3" />{r.owner}</span></td>
                  <td className={td}><Badge className={`${severityColor(r.severity)} border-0 text-xs`}>{r.severity}</Badge></td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Search Tab ── */}
        <TabsContent value="search">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <FileSearch className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="חיפוש לפי כותרת, מספר מסמך, סוג או אחראי..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pr-10 bg-background/50 border-border text-sm"
                  />
                </div>
                <Button variant="outline" className="text-xs border-border gap-1.5 hover:bg-blue-600/20 hover:text-blue-300">
                  <Search className="h-3.5 w-3.5" />
                  חפש
                </Button>
              </div>

              {searchQuery.trim().length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileSearch className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">הקלד מילות חיפוש כדי לחפש במסמכים הנדסיים</p>
                  <p className="text-xs mt-1">ניתן לחפש לפי כותרת, מספר מסמך, סוג מסמך או שם אחראי</p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-40 text-amber-400" />
                  <p className="text-sm">לא נמצאו תוצאות עבור "{searchQuery}"</p>
                  <p className="text-xs mt-1">נסה מילות חיפוש אחרות</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <p className="text-xs text-muted-foreground mb-2">{searchResults.length} תוצאות נמצאו</p>
                  <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
                    <th className={th}>מספר מסמך</th><th className={th}>כותרת</th><th className={th}>סוג</th>
                    <th className={th}>גרסה</th><th className={th}>סטטוס</th><th className={th}>אחראי</th>
                  </tr></thead><tbody>
                    {searchResults.map((r, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className={`${td} font-mono text-blue-400 font-bold`}>{r.id}</td>
                        <td className={`${td} text-foreground font-medium max-w-[300px]`}>{r.title}</td>
                        <td className={td}><Badge className={`${typeColor(r.type)} border-0 text-xs`}>{r.type}</Badge></td>
                        <td className={`${td} font-mono text-center text-purple-400`}>v{r.version}</td>
                        <td className={td}><Badge className={`${docStatusColor(r.status)} border-0 text-xs`}>{r.status}</Badge></td>
                        <td className={`${td} text-muted-foreground`}>{r.owner}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
