import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileText, GitBranch, CheckSquare, BookOpen, Search,
  TrendingUp, TrendingDown, PenLine, FileCode, FileBadge,
  Clock, User, Shield, Layers, Ruler, AlertCircle,
} from "lucide-react";

// ── Drawings Registry (15 drawings) ──
const FALLBACK_DRAWINGS = [
  { id: "DWG-001", title: "חלון אלומיניום 180x120", product: "חלון כנף", rev: "C", format: "CAD", scale: "1:5", size: "A1", status: "released", engineer: "יוסי כהן" },
  { id: "DWG-002", title: "דלת כניסה דו-כנפית", product: "דלת כניסה", rev: "B", format: "PDF", scale: "1:10", size: "A1", status: "approved", engineer: "שרה לוי" },
  { id: "DWG-003", title: "מעקה זכוכית מרפסת", product: "מעקה זכוכית", rev: "A", format: "DXF", scale: "1:5", size: "A3", status: "draft", engineer: "דוד מזרחי" },
  { id: "DWG-004", title: "ויטרינה חנות 300x250", product: "ויטרינה", rev: "D", format: "CAD", scale: "1:10", size: "A1", status: "released", engineer: "רחל אברהם" },
  { id: "DWG-005", title: "תריס גלילה חשמלי", product: "תריס גלילה", rev: "B", format: "CAD", scale: "1:5", size: "A3", status: "review", engineer: "אלון גולדשטיין" },
  { id: "DWG-006", title: "מחיצת אלומיניום משרדית", product: "מחיצה", rev: "A", format: "PDF", scale: "1:20", size: "A1", status: "draft", engineer: "מיכל ברק" },
  { id: "DWG-007", title: "חיפוי חוץ קומפוזיט", product: "חיפוי חוץ", rev: "C", format: "CAD", scale: "1:25", size: "A1", status: "approved", engineer: "עומר חדד" },
  { id: "DWG-008", title: "דלת הזזה מותאמת", product: "דלת הזזה", rev: "B", format: "DXF", scale: "1:10", size: "A3", status: "review", engineer: "נועה פרידמן" },
  { id: "DWG-009", title: "חלון ציר עליון 90x60", product: "חלון ציר", rev: "A", format: "CAD", scale: "1:5", size: "A3", status: "approved", engineer: "יוסי כהן" },
  { id: "DWG-010", title: "קיר מסך אלומיניום", product: "קיר מסך", rev: "E", format: "CAD", scale: "1:50", size: "A1", status: "released", engineer: "שרה לוי" },
  { id: "DWG-011", title: "פרגולה אלומיניום 4x3", product: "פרגולה", rev: "B", format: "PDF", scale: "1:20", size: "A1", status: "review", engineer: "דוד מזרחי" },
  { id: "DWG-012", title: "מסגרת זכוכית בטיחות", product: "מסגרת זכוכית", rev: "A", format: "DXF", scale: "1:5", size: "A3", status: "draft", engineer: "רחל אברהם" },
  { id: "DWG-013", title: "שער חניה אוטומטי", product: "שער חניה", rev: "C", format: "CAD", scale: "1:10", size: "A1", status: "approved", engineer: "אלון גולדשטיין" },
  { id: "DWG-014", title: "סורג אלומיניום חלון", product: "סורג", rev: "A", format: "PDF", scale: "1:5", size: "A3", status: "released", engineer: "מיכל ברק" },
  { id: "DWG-015", title: "דלת אש מבודדת EI60", product: "דלת אש", rev: "B", format: "CAD", scale: "1:10", size: "A1", status: "review", engineer: "עומר חדד" },
];

// ── Revision History (10 entries) ──
const FALLBACK_REVISIONS = [
  { dwg: "DWG-010", title: "קיר מסך אלומיניום", fromRev: "D", toRev: "E", date: "2026-04-06", engineer: "שרה לוי", reason: "עדכון מידות לפי מדידה סופית", scope: "מידות" },
  { dwg: "DWG-004", title: "ויטרינה חנות 300x250", fromRev: "C", toRev: "D", date: "2026-04-05", engineer: "רחל אברהם", reason: "שינוי סוג זכוכית לפי דרישת לקוח", scope: "חומרים" },
  { dwg: "DWG-001", title: "חלון אלומיניום 180x120", fromRev: "B", toRev: "C", date: "2026-04-04", engineer: "יוסי כהן", reason: "תיקון חתכים בפינות", scope: "גיאומטריה" },
  { dwg: "DWG-007", title: "חיפוי חוץ קומפוזיט", fromRev: "B", toRev: "C", date: "2026-04-03", engineer: "עומר חדד", reason: "הוספת פירוט עיגון לקיר", scope: "פירוט" },
  { dwg: "DWG-013", title: "שער חניה אוטומטי", fromRev: "B", toRev: "C", date: "2026-04-02", engineer: "אלון גולדשטיין", reason: "עדכון מנגנון פתיחה", scope: "מכני" },
  { dwg: "DWG-002", title: "דלת כניסה דו-כנפית", fromRev: "A", toRev: "B", date: "2026-04-01", engineer: "שרה לוי", reason: "הוספת פירוט ציר כבד", scope: "פירוט" },
  { dwg: "DWG-005", title: "תריס גלילה חשמלי", fromRev: "A", toRev: "B", date: "2026-03-30", engineer: "אלון גולדשטיין", reason: "שינוי קוטר גליל", scope: "מידות" },
  { dwg: "DWG-008", title: "דלת הזזה מותאמת", fromRev: "A", toRev: "B", date: "2026-03-28", engineer: "נועה פרידמן", reason: "עדכון מסילה תחתונה", scope: "מכני" },
  { dwg: "DWG-015", title: "דלת אש מבודדת EI60", fromRev: "A", toRev: "B", date: "2026-03-27", engineer: "עומר חדד", reason: "תיקון עובי בידוד לתקן", scope: "חומרים" },
  { dwg: "DWG-011", title: "פרגולה אלומיניום 4x3", fromRev: "A", toRev: "B", date: "2026-03-25", engineer: "דוד מזרחי", reason: "עדכון שיפוע ניקוז", scope: "גיאומטריה" },
];

// ── Pending Approvals (6 entries) ──
const FALLBACK_APPROVALS = [
  { dwg: "DWG-005", title: "תריס גלילה חשמלי", rev: "B", submitter: "אלון גולדשטיין", submitted: "2026-04-05", chain: ["מהנדס ראשי", "מנהל QC", "מנהל ייצור"], currentStep: 1, priority: "רגיל" },
  { dwg: "DWG-008", title: "דלת הזזה מותאמת", rev: "B", submitter: "נועה פרידמן", submitted: "2026-04-04", chain: ["מהנדס ראשי", "מנהל QC"], currentStep: 0, priority: "דחוף" },
  { dwg: "DWG-011", title: "פרגולה אלומיניום 4x3", rev: "B", submitter: "דוד מזרחי", submitted: "2026-04-03", chain: ["מהנדס ראשי", "מנהל QC", "מנהל פרויקט"], currentStep: 2, priority: "רגיל" },
  { dwg: "DWG-015", title: "דלת אש מבודדת EI60", rev: "B", submitter: "עומר חדד", submitted: "2026-04-06", chain: ["מהנדס ראשי", "מנהל QC", "מנהל בטיחות"], currentStep: 0, priority: "דחוף" },
  { dwg: "DWG-003", title: "מעקה זכוכית מרפסת", rev: "A", submitter: "דוד מזרחי", submitted: "2026-04-02", chain: ["מהנדס ראשי", "מנהל QC"], currentStep: 1, priority: "רגיל" },
  { dwg: "DWG-006", title: "מחיצת אלומיניום משרדית", rev: "A", submitter: "מיכל ברק", submitted: "2026-04-07", chain: ["מהנדס ראשי"], currentStep: 0, priority: "נמוך" },
];

// ── Drawing Standards ──
const FALLBACK_STANDARDS = [
  { category: "בלוק כותרת", standard: "ISO 7200", desc: "בלוק כותרת אחיד -- שם חברה, מספר שרטוט, רוויזיה, תאריך, קנ\"מ, שם שרטט, אישור", compliance: 94 },
  { category: "סבילויות מידה", standard: "ISO 2768-1", desc: "סבילויות כלליות -- עדין (f), בינוני (m), גס (c) לפי סוג עיבוד", compliance: 88 },
  { category: "סבילויות גיאומטריות", standard: "ISO 1101", desc: "סימון ישרות, שטוחות, עגולות, מקבילות, ניצבות ותנועתיות", compliance: 82 },
  { category: "סימון חומרים", standard: "ISO 1302 / EN 573", desc: "סימון סגסוגות אלומיניום (6060-T6, 6063-T5), זכוכית (ESG, VSG), פלדה", compliance: 91 },
  { category: "סימון ריתוך", standard: "ISO 2553", desc: "סימוני ריתוך -- סוג, גודל, מיקום, בדיקה נדרשת", compliance: 78 },
  { category: "גימור שטח", standard: "ISO 1302", desc: "סימון חספוס שטח Ra, טיפולי אנודייז, צביעה אלקטרוסטטית", compliance: 85 },
  { category: "מערכת הטלה", standard: "ISO 5456-2", desc: "הטלה מזווית ראשונה (First Angle) -- תקן אירופאי", compliance: 96 },
  { category: "קנה מידה", standard: "ISO 5455", desc: "קנ\"מ מועדפים: 1:1, 1:2, 1:5, 1:10, 1:20, 1:50, 2:1, 5:1", compliance: 97 },
  { category: "מידות וקווים", standard: "ISO 129-1", desc: "סימון מידות ליניאריות, רדיוסים, קטרים, זוויות -- מיקום וכיוון חיצים", compliance: 90 },
  { category: "חומרי ממשק", standard: "EN 12150 / EN 14449", desc: "תקני זכוכית בטיחות מחוסמת (ESG) וזכוכית שכבתית (VSG/PVB)", compliance: 86 },
  { category: "סוגי קווים", standard: "ISO 128-2", desc: "קו מלא עבה (קו ראות), קו מקוטע (קו נסתר), קו ציר (מרכז), קו דמיוני", compliance: 93 },
];

// ── Badge color helpers ──
const statusColor = (s: string) =>
  s === "released" ? "bg-blue-500/20 text-blue-300"
  : s === "approved" ? "bg-green-500/20 text-green-300"
  : s === "review" ? "bg-amber-500/20 text-amber-300"
  : "bg-gray-500/20 text-gray-300";

const statusLabel = (s: string) =>
  s === "released" ? "שוחרר" : s === "approved" ? "מאושר" : s === "review" ? "בבדיקה" : "טיוטה";

const formatColor = (f: string) =>
  f === "CAD" ? "bg-purple-500/20 text-purple-300"
  : f === "DXF" ? "bg-cyan-500/20 text-cyan-300"
  : "bg-orange-500/20 text-orange-300";

const prioColor = (p: string) =>
  p === "דחוף" ? "bg-red-500/20 text-red-300"
  : p === "נמוך" ? "bg-gray-500/20 text-gray-300"
  : "bg-blue-500/20 text-blue-300";

const scopeColor = (s: string) =>
  s === "מידות" ? "bg-blue-500/20 text-blue-300"
  : s === "חומרים" ? "bg-amber-500/20 text-amber-300"
  : s === "גיאומטריה" ? "bg-purple-500/20 text-purple-300"
  : s === "מכני" ? "bg-cyan-500/20 text-cyan-300"
  : "bg-green-500/20 text-green-300";

const complianceColor = (v: number) =>
  v >= 90 ? "text-green-400" : v >= 80 ? "text-amber-400" : "text-red-400";

const th = "p-3 text-right text-muted-foreground font-medium text-xs";
const td = "p-3 text-sm";

export default function DrawingManagementPage() {
  const { data: apidrawings } = useQuery({
    queryKey: ["/api/engineering/drawing-management/drawings"],
    queryFn: () => authFetch("/api/engineering/drawing-management/drawings").then(r => r.json()).catch(() => null),
  });
  const drawings = Array.isArray(apidrawings) ? apidrawings : (apidrawings?.data ?? apidrawings?.items ?? FALLBACK_DRAWINGS);


  const { data: apirevisions } = useQuery({
    queryKey: ["/api/engineering/drawing-management/revisions"],
    queryFn: () => authFetch("/api/engineering/drawing-management/revisions").then(r => r.json()).catch(() => null),
  });
  const revisions = Array.isArray(apirevisions) ? apirevisions : (apirevisions?.data ?? apirevisions?.items ?? FALLBACK_REVISIONS);


  const { data: apiapprovals } = useQuery({
    queryKey: ["/api/engineering/drawing-management/approvals"],
    queryFn: () => authFetch("/api/engineering/drawing-management/approvals").then(r => r.json()).catch(() => null),
  });
  const approvals = Array.isArray(apiapprovals) ? apiapprovals : (apiapprovals?.data ?? apiapprovals?.items ?? FALLBACK_APPROVALS);


  const { data: apistandards } = useQuery({
    queryKey: ["/api/engineering/drawing-management/standards"],
    queryFn: () => authFetch("/api/engineering/drawing-management/standards").then(r => r.json()).catch(() => null),
  });
  const standards = Array.isArray(apistandards) ? apistandards : (apistandards?.data ?? apistandards?.items ?? FALLBACK_STANDARDS);

  const [tab, setTab] = useState("registry");
  const [search, setSearch] = useState("");

  const filteredDrawings = drawings.filter(d =>
    d.id.includes(search) || d.title.includes(search) || d.product.includes(search) || d.engineer.includes(search)
  );

  const kpis = [
    { label: "סה\"כ שרטוטים", value: "156", icon: FileText, color: "text-blue-400", trend: "+12", up: true },
    { label: "רוויזיות פעילות", value: "38", icon: GitBranch, color: "text-purple-400", trend: "+5", up: true },
    { label: "ממתין לאישור", value: "6", icon: CheckSquare, color: "text-amber-400", trend: "-2", up: true },
    { label: "קבצי CAD", value: "94", icon: FileCode, color: "text-cyan-400", trend: "+8", up: true },
    { label: "שרטוטים החודש", value: "18", icon: PenLine, color: "text-green-400", trend: "+3", up: true },
    { label: "שיעור רוויזיות", value: "24%", icon: Layers, color: "text-red-400", trend: "+2%", up: false },
  ];

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileBadge className="h-6 w-6 text-blue-400" />
            ניהול שרטוטים טכניים ו-CAD
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי -- Technical Drawings & CAD Management</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש שרטוט..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9 w-56 bg-card/60 border-border text-sm"
            />
          </div>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5">
            <PenLine className="h-3.5 w-3.5" />שרטוט חדש
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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

      {/* ── Approval progress ── */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">שרטוטים מאושרים/שוחררו -- יעד 85%</span>
            <span className="text-sm font-mono text-green-400">73%</span>
          </div>
          <Progress value={73} className="h-2" />
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-card/60 border border-border w-full justify-start gap-1 p-1 h-auto flex-wrap">
          <TabsTrigger value="registry" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><FileText className="h-3.5 w-3.5" />מאגר שרטוטים</TabsTrigger>
          <TabsTrigger value="revisions" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><GitBranch className="h-3.5 w-3.5" />רוויזיות</TabsTrigger>
          <TabsTrigger value="approvals" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><CheckSquare className="h-3.5 w-3.5" />אישורים</TabsTrigger>
          <TabsTrigger value="standards" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><BookOpen className="h-3.5 w-3.5" />תקנים</TabsTrigger>
        </TabsList>

        {/* ── Drawings Registry Tab ── */}
        <TabsContent value="registry">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מספר שרטוט</th><th className={th}>כותרת</th><th className={th}>מוצר</th>
              <th className={th}>רוויזיה</th><th className={th}>פורמט</th><th className={th}>קנ"מ</th>
              <th className={th}>גודל</th><th className={th}>סטטוס</th><th className={th}>מהנדס</th>
            </tr></thead><tbody>
              {filteredDrawings.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400 font-bold`}>{r.id}</td>
                  <td className={`${td} text-foreground font-medium`}>{r.title}</td>
                  <td className={`${td} text-muted-foreground`}>{r.product}</td>
                  <td className={`${td} font-mono text-center text-purple-400 font-bold`}>{r.rev}</td>
                  <td className={td}><Badge className={`${formatColor(r.format)} border-0 text-xs`}>{r.format}</Badge></td>
                  <td className={`${td} font-mono text-muted-foreground text-center`}>{r.scale}</td>
                  <td className={`${td} font-mono text-center`}>{r.size}</td>
                  <td className={td}><Badge className={`${statusColor(r.status)} border-0 text-xs`}>{statusLabel(r.status)}</Badge></td>
                  <td className={`${td} text-muted-foreground`}>
                    <span className="flex items-center gap-1"><User className="h-3 w-3" />{r.engineer}</span>
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Revisions Tab ── */}
        <TabsContent value="revisions">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>שרטוט</th><th className={th}>כותרת</th><th className={th}>מ-Rev</th>
              <th className={th}>ל-Rev</th><th className={th}>תאריך</th><th className={th}>מהנדס</th>
              <th className={th}>סיבת שינוי</th><th className={th}>היקף</th>
            </tr></thead><tbody>
              {revisions.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400 font-bold`}>{r.dwg}</td>
                  <td className={`${td} text-foreground font-medium`}>{r.title}</td>
                  <td className={`${td} font-mono text-center text-red-400`}>{r.fromRev}</td>
                  <td className={`${td} font-mono text-center text-green-400 font-bold`}>{r.toRev}</td>
                  <td className={`${td} font-mono text-muted-foreground`}>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{r.date}</span>
                  </td>
                  <td className={`${td} text-muted-foreground`}>{r.engineer}</td>
                  <td className={`${td} text-muted-foreground max-w-[240px]`}>{r.reason}</td>
                  <td className={td}><Badge className={`${scopeColor(r.scope)} border-0 text-xs`}>{r.scope}</Badge></td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Approvals Tab ── */}
        <TabsContent value="approvals">
          <div className="grid gap-3">
            {approvals.map((a, i) => (
              <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-blue-400 font-bold">{a.dwg}</span>
                        <span className="text-foreground font-medium">{a.title}</span>
                        <Badge className="bg-purple-500/20 text-purple-300 border-0 text-xs">Rev {a.rev}</Badge>
                        <Badge className={`${prioColor(a.priority)} border-0 text-xs`}>{a.priority}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />{a.submitter}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{a.submitted}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="text-xs border-red-500/50 text-red-400 hover:bg-red-500/10">
                        <AlertCircle className="h-3 w-3 ml-1" />דחייה
                      </Button>
                      <Button size="sm" className="text-xs bg-green-600 hover:bg-green-700 text-white">
                        <Shield className="h-3 w-3 ml-1" />אישור
                      </Button>
                    </div>
                  </div>
                  {/* Approval Chain */}
                  <div className="mt-3 flex items-center gap-2 flex-wrap">
                    {a.chain.map((step, si) => (
                      <div key={si} className="flex items-center gap-1.5">
                        <div className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border ${
                          si < a.currentStep
                            ? "bg-green-500/20 border-green-500/40 text-green-300"
                            : si === a.currentStep
                            ? "bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse"
                            : "bg-muted/30 border-border text-muted-foreground"
                        }`}>
                          {si < a.currentStep ? <CheckSquare className="h-3 w-3" /> : <Ruler className="h-3 w-3" />}
                          {step}
                        </div>
                        {si < a.chain.length - 1 && <span className="text-muted-foreground text-xs">&larr;</span>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2">
                    <Progress value={Math.round((a.currentStep / a.chain.length) * 100)} className="h-1.5" />
                    <p className="text-[10px] text-muted-foreground mt-1">{a.currentStep} מתוך {a.chain.length} שלבים הושלמו</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Standards Tab ── */}
        <TabsContent value="standards">
          <div className="grid gap-3">
            {standards.map((s, i) => (
              <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-indigo-500/20 text-indigo-300 border-0 text-xs">{s.category}</Badge>
                        <span className="font-mono text-sm text-blue-400 font-bold">{s.standard}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{s.desc}</p>
                    </div>
                    <div className="text-center min-w-[80px]">
                      <p className={`text-xl font-bold font-mono ${complianceColor(s.compliance)}`}>{s.compliance}%</p>
                      <p className="text-[10px] text-muted-foreground">עמידה בתקן</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <Progress value={s.compliance} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>
            ))}
            {/* ── Standards Summary ── */}
            <Card className="bg-card/60 border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-foreground flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-blue-400" />
                    סיכום עמידה בתקנים
                  </span>
                  <Badge className="bg-green-500/20 text-green-300 border-0 text-xs">
                    ממוצע: {Math.round(standards.reduce((a, s) => a + s.compliance, 0) / standards.length)}%
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="text-center p-2 rounded-md bg-green-500/10 border border-green-500/20">
                    <p className="text-lg font-bold font-mono text-green-400">
                      {standards.filter(s => s.compliance >= 90).length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">תקנים בעמידה מלאה (&ge;90%)</p>
                  </div>
                  <div className="text-center p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                    <p className="text-lg font-bold font-mono text-amber-400">
                      {standards.filter(s => s.compliance >= 80 && s.compliance < 90).length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">דורשים שיפור (80-89%)</p>
                  </div>
                  <div className="text-center p-2 rounded-md bg-red-500/10 border border-red-500/20">
                    <p className="text-lg font-bold font-mono text-red-400">
                      {standards.filter(s => s.compliance < 80).length}
                    </p>
                    <p className="text-[10px] text-muted-foreground">מתחת ליעד (&lt;80%)</p>
                  </div>
                  <div className="text-center p-2 rounded-md bg-blue-500/10 border border-blue-500/20">
                    <p className="text-lg font-bold font-mono text-blue-400">{standards.length}</p>
                    <p className="text-[10px] text-muted-foreground">סה"כ תקנים במעקב</p>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">ציון כולל -- יעד 90%</span>
                    <span className="text-xs font-mono text-amber-400">
                      {Math.round(standards.reduce((a, s) => a + s.compliance, 0) / standards.length)}%
                    </span>
                  </div>
                  <Progress
                    value={Math.round(standards.reduce((a, s) => a + s.compliance, 0) / standards.length)}
                    className="h-2"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
