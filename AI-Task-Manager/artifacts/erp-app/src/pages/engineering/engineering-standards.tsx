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
  ShieldCheck, BookOpen, CalendarClock, AlertTriangle, FilePlus2,
  Search, CheckCircle2, XCircle, Clock, GraduationCap, ClipboardCheck,
  Grid3X3, Users, ArrowUpDown, Award,
} from "lucide-react";

/* ── 15 Engineering Standards ── */
const FALLBACK_STANDARDS = [
  { id: "STD-001", code: "ISO 9001:2015", name: "ניהול איכות", category: "איכות", status: "active", lastAudit: "2025-11-15", nextAudit: "2026-05-15", responsible: "יוסי כהן", scope: "כלל המפעל", certBody: "מכון התקנים" },
  { id: "STD-002", code: "ISO 14001:2015", name: "ניהול סביבתי", category: "סביבה", status: "active", lastAudit: "2025-10-20", nextAudit: "2026-04-20", responsible: "שרה לוי", scope: "כלל המפעל", certBody: "מכון התקנים" },
  { id: "STD-003", code: "EN 14351-1", name: "חלונות ודלתות -- ביצועים", category: "מוצר", status: "active", lastAudit: "2025-12-10", nextAudit: "2026-06-10", responsible: "דוד מזרחי", scope: "חלונות ודלתות", certBody: "TUV" },
  { id: "STD-004", code: "EN 12150", name: "זכוכית מחוסמת", category: "מוצר", status: "active", lastAudit: "2026-01-08", nextAudit: "2026-07-08", responsible: "רחל אברהם", scope: "קו זכוכית", certBody: "TUV" },
  { id: "STD-005", code: "EN 14449", name: "זכוכית למינציה", category: "מוצר", status: "review", lastAudit: "2025-06-22", nextAudit: "2026-04-22", responsible: "אלון גולדשטיין", scope: "קו זכוכית", certBody: "SGS" },
  { id: "STD-006", code: "EN 573", name: "סגסוגות אלומיניום", category: "חומרים", status: "active", lastAudit: "2025-09-14", nextAudit: "2026-09-14", responsible: "מיכל ברק", scope: "מחסן חומרים", certBody: "מכון התקנים" },
  { id: "STD-007", code: "EN 755", name: "פרופילי אלומיניום", category: "חומרים", status: "active", lastAudit: "2026-02-05", nextAudit: "2026-08-05", responsible: "עומר חדד", scope: "קו אלומיניום", certBody: "TUV" },
  { id: "STD-008", code: "SI 1281", name: "בידוד תרמי -- ת\"י 1281", category: "ישראלי", status: "active", lastAudit: "2025-12-01", nextAudit: "2026-06-01", responsible: "נועה פרידמן", scope: "כלל המוצרים", certBody: "מכון התקנים" },
  { id: "STD-009", code: "EN 1090", name: "מבני פלדה", category: "מוצר", status: "expired", lastAudit: "2024-08-15", nextAudit: "2026-04-15", responsible: "יוסי כהן", scope: "קו פלדה", certBody: "TUV" },
  { id: "STD-010", code: "EN 12608", name: "פרופילי PVC", category: "חומרים", status: "active", lastAudit: "2025-11-28", nextAudit: "2026-05-28", responsible: "שרה לוי", scope: "קו PVC", certBody: "SGS" },
  { id: "STD-011", code: "EN 1279", name: "זכוכית מבודדת", category: "מוצר", status: "review", lastAudit: "2025-07-10", nextAudit: "2026-04-10", responsible: "דוד מזרחי", scope: "קו זכוכית", certBody: "TUV" },
  { id: "STD-012", code: "EN 13830", name: "קירות מסך", category: "מוצר", status: "active", lastAudit: "2026-01-22", nextAudit: "2026-07-22", responsible: "רחל אברהם", scope: "קו קירות מסך", certBody: "מכון התקנים" },
  { id: "STD-013", code: "EN 14024", name: "מחסום תרמי", category: "מוצר", status: "active", lastAudit: "2025-10-05", nextAudit: "2026-10-05", responsible: "אלון גולדשטיין", scope: "פרופילים תרמיים", certBody: "TUV" },
  { id: "STD-014", code: "BS 6206", name: "זכוכית בטיחותית", category: "מוצר", status: "expired", lastAudit: "2024-05-20", nextAudit: "2026-05-20", responsible: "מיכל ברק", scope: "קו זכוכית", certBody: "BSI" },
  { id: "STD-015", code: "ASTM E283", name: "דליפת אוויר", category: "בדיקות", status: "active", lastAudit: "2025-08-30", nextAudit: "2026-08-30", responsible: "עומר חדד", scope: "מעבדת בדיקות", certBody: "ASTM" },
];

/* ── Compliance Matrix: standards vs products ── */
const FALLBACK_PRODUCTS = ["חלונות אלומיניום", "דלתות אלומיניום", "קירות מסך", "זכוכית מחוסמת", "זכוכית למינציה", "פרופילי PVC"];
const complianceMatrix: Record<string, Record<string, "full" | "partial" | "none">> = {
  "ISO 9001:2015":  { "חלונות אלומיניום": "full", "דלתות אלומיניום": "full", "קירות מסך": "full", "זכוכית מחוסמת": "full", "זכוכית למינציה": "full", "פרופילי PVC": "full" },
  "ISO 14001:2015": { "חלונות אלומיניום": "full", "דלתות אלומיניום": "full", "קירות מסך": "full", "זכוכית מחוסמת": "full", "זכוכית למינציה": "full", "פרופילי PVC": "full" },
  "EN 14351-1":     { "חלונות אלומיניום": "full", "דלתות אלומיניום": "full", "קירות מסך": "partial", "זכוכית מחוסמת": "none", "זכוכית למינציה": "none", "פרופילי PVC": "partial" },
  "EN 12150":       { "חלונות אלומיניום": "partial", "דלתות אלומיניום": "partial", "קירות מסך": "full", "זכוכית מחוסמת": "full", "זכוכית למינציה": "none", "פרופילי PVC": "none" },
  "EN 14449":       { "חלונות אלומיניום": "partial", "דלתות אלומיניום": "none", "קירות מסך": "full", "זכוכית מחוסמת": "none", "זכוכית למינציה": "full", "פרופילי PVC": "none" },
  "EN 573":         { "חלונות אלומיניום": "full", "דלתות אלומיניום": "full", "קירות מסך": "full", "זכוכית מחוסמת": "none", "זכוכית למינציה": "none", "פרופילי PVC": "none" },
  "SI 1281":        { "חלונות אלומיניום": "full", "דלתות אלומיניום": "full", "קירות מסך": "full", "זכוכית מחוסמת": "partial", "זכוכית למינציה": "partial", "פרופילי PVC": "full" },
  "EN 1090":        { "חלונות אלומיניום": "none", "דלתות אלומיניום": "none", "קירות מסך": "partial", "זכוכית מחוסמת": "none", "זכוכית למינציה": "none", "פרופילי PVC": "none" },
  "EN 13830":       { "חלונות אלומיניום": "none", "דלתות אלומיניום": "none", "קירות מסך": "full", "זכוכית מחוסמת": "partial", "זכוכית למינציה": "partial", "פרופילי PVC": "none" },
  "ASTM E283":      { "חלונות אלומיניום": "full", "דלתות אלומיניום": "full", "קירות מסך": "full", "זכוכית מחוסמת": "none", "זכוכית למינציה": "none", "פרופילי PVC": "full" },
};

/* ── Upcoming Audits ── */
const FALLBACK_AUDITS = [
  { id: "AUD-001", standard: "EN 1279", date: "2026-04-10", auditor: "TUV -- ד\"ר אנדריי ויס", type: "חידוש", status: "מאושר", scope: "קו זכוכית מבודדת" },
  { id: "AUD-002", standard: "EN 1090", date: "2026-04-15", auditor: "TUV -- מרק שטיינר", type: "חידוש דחוף", status: "בהכנה", scope: "קו מבני פלדה" },
  { id: "AUD-003", standard: "ISO 14001", date: "2026-04-20", auditor: "מכון התקנים -- רינה דנון", type: "מעקב שנתי", status: "מאושר", scope: "כלל המפעל" },
  { id: "AUD-004", standard: "EN 14449", date: "2026-04-22", auditor: "SGS -- טומאס מילר", type: "חידוש", status: "בהכנה", scope: "קו זכוכית למינציה" },
  { id: "AUD-005", standard: "ISO 9001", date: "2026-05-15", auditor: "מכון התקנים -- יאיר בן-דוד", type: "מעקב שנתי", status: "מתוכנן", scope: "כלל המפעל" },
  { id: "AUD-006", standard: "BS 6206", date: "2026-05-20", auditor: "BSI -- ג'יימס קולינס", type: "חידוש דחוף", status: "בהכנה", scope: "קו זכוכית בטיחותית" },
];

/* ── Training & Certifications ── */
const FALLBACK_TRAININGS = [
  { id: "TRN-001", name: "מבוא ל-ISO 9001:2015", trainer: "מכון התקנים", participants: 12, date: "2026-04-14", duration: "8 שעות", status: "מתוכנן", target: "כל מהנדסי המפעל" },
  { id: "TRN-002", name: "דרישות EN 14351-1 -- חלונות", trainer: "TUV Academy", participants: 8, date: "2026-04-18", duration: "16 שעות", status: "רישום פתוח", target: "צוות חלונות" },
  { id: "TRN-003", name: "בידוד תרמי ת\"י 1281", trainer: "פרופ' אבי שרון", participants: 15, date: "2026-04-25", duration: "4 שעות", status: "מתוכנן", target: "מהנדסי מוצר" },
  { id: "TRN-004", name: "מבדק פנימי -- ISO 14001", trainer: "שרה לוי (פנימי)", participants: 6, date: "2026-05-02", duration: "12 שעות", status: "רישום פתוח", target: "מבדקים פנימיים" },
  { id: "TRN-005", name: "בדיקת דליפת אוויר ASTM E283", trainer: "מעבדת חומרים", participants: 4, date: "2026-05-08", duration: "6 שעות", status: "הושלם", target: "טכנאי מעבדה" },
  { id: "TRN-006", name: "EN 1090 -- ריתוך ומבנים", trainer: "TUV Academy", participants: 10, date: "2026-05-15", duration: "24 שעות", status: "מתוכנן", target: "צוות פלדה" },
  { id: "TRN-007", name: "עדכוני EN 12150 -- זכוכית מחוסמת", trainer: "SGS Academy", participants: 7, date: "2026-03-20", duration: "8 שעות", status: "הושלם", target: "צוות זכוכית" },
  { id: "TRN-008", name: "קירות מסך EN 13830 -- מתקדם", trainer: "אלון גולדשטיין (פנימי)", participants: 9, date: "2026-05-22", duration: "16 שעות", status: "רישום פתוח", target: "צוות קירות מסך" },
];

/* ── Badge helpers ── */
const statusColor = (s: string) =>
  s === "active" ? "bg-green-500/20 text-green-300"
  : s === "expired" ? "bg-red-500/20 text-red-300"
  : "bg-amber-500/20 text-amber-300";

const statusLabel = (s: string) =>
  s === "active" ? "פעיל" : s === "expired" ? "פג תוקף" : "בבדיקה";

const auditStatusColor = (s: string) =>
  s === "מאושר" ? "bg-green-500/20 text-green-300"
  : s === "בהכנה" ? "bg-amber-500/20 text-amber-300"
  : "bg-blue-500/20 text-blue-300";

const trainingStatusColor = (s: string) =>
  s === "הושלם" ? "bg-green-500/20 text-green-300"
  : s === "רישום פתוח" ? "bg-blue-500/20 text-blue-300"
  : "bg-amber-500/20 text-amber-300";

const complianceCellColor = (v: "full" | "partial" | "none") =>
  v === "full" ? "bg-green-500/20 text-green-300"
  : v === "partial" ? "bg-amber-500/20 text-amber-300"
  : "bg-red-500/20 text-red-300";

const complianceCellLabel = (v: "full" | "partial" | "none") =>
  v === "full" ? "מלא" : v === "partial" ? "חלקי" : "לא רלוונטי";

const th = "p-3 text-right text-muted-foreground font-medium text-xs";
const td = "p-3 text-sm";

export default function EngineeringStandardsPage() {
  const { data: apistandards } = useQuery({
    queryKey: ["/api/engineering/engineering-standards/standards"],
    queryFn: () => authFetch("/api/engineering/engineering-standards/standards").then(r => r.json()).catch(() => null),
  });
  const standards = Array.isArray(apistandards) ? apistandards : (apistandards?.data ?? apistandards?.items ?? FALLBACK_STANDARDS);


  const { data: apiproducts } = useQuery({
    queryKey: ["/api/engineering/engineering-standards/products"],
    queryFn: () => authFetch("/api/engineering/engineering-standards/products").then(r => r.json()).catch(() => null),
  });
  const products = Array.isArray(apiproducts) ? apiproducts : (apiproducts?.data ?? apiproducts?.items ?? FALLBACK_PRODUCTS);


  const { data: apiaudits } = useQuery({
    queryKey: ["/api/engineering/engineering-standards/audits"],
    queryFn: () => authFetch("/api/engineering/engineering-standards/audits").then(r => r.json()).catch(() => null),
  });
  const audits = Array.isArray(apiaudits) ? apiaudits : (apiaudits?.data ?? apiaudits?.items ?? FALLBACK_AUDITS);


  const { data: apitrainings } = useQuery({
    queryKey: ["/api/engineering/engineering-standards/trainings"],
    queryFn: () => authFetch("/api/engineering/engineering-standards/trainings").then(r => r.json()).catch(() => null),
  });
  const trainings = Array.isArray(apitrainings) ? apitrainings : (apitrainings?.data ?? apitrainings?.items ?? FALLBACK_TRAININGS);

  const [tab, setTab] = useState("registry");
  const [search, setSearch] = useState("");

  /* ── KPI calculations ── */
  const totalStandards = standards.length;
  const compliant = standards.filter(s => s.status === "active").length;
  const compliantPct = Math.round((compliant / totalStandards) * 100);
  const upcomingAudits = audits.length;
  const expiredCount = standards.filter(s => s.status === "expired").length;
  const newThisYear = 3;

  const kpis = [
    { label: "סה\"כ תקנים", value: totalStandards.toString(), icon: BookOpen, color: "text-blue-400" },
    { label: "אחוז עמידה", value: `${compliantPct}%`, icon: ShieldCheck, color: "text-green-400" },
    { label: "מבדקים קרובים", value: upcomingAudits.toString(), icon: CalendarClock, color: "text-amber-400" },
    { label: "תקנים שפגו", value: expiredCount.toString(), icon: AlertTriangle, color: "text-red-400" },
    { label: "חדשים השנה", value: newThisYear.toString(), icon: FilePlus2, color: "text-purple-400" },
  ];

  const filteredStandards = standards.filter(s =>
    s.code.toLowerCase().includes(search.toLowerCase()) ||
    s.name.includes(search) ||
    s.responsible.includes(search)
  );

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-green-400" />
            תקנים הנדסיים ותאימות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי -- Engineering Standards & Compliance</p>
        </div>
        <Button size="sm" className="gap-1.5">
          <FilePlus2 className="h-4 w-4" />
          הוסף תקן
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
            <span className="text-sm text-muted-foreground">עמידה בתקנים -- יעד 100%</span>
            <span className={`text-sm font-mono ${compliantPct >= 90 ? "text-green-400" : "text-amber-400"}`}>{compliantPct}%</span>
          </div>
          <Progress value={compliantPct} className="h-2" />
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/60">
          <TabsTrigger value="registry" className="gap-1.5 text-xs"><BookOpen className="h-3.5 w-3.5" />מרשם תקנים</TabsTrigger>
          <TabsTrigger value="compliance" className="gap-1.5 text-xs"><Grid3X3 className="h-3.5 w-3.5" />מטריצת תאימות</TabsTrigger>
          <TabsTrigger value="audits" className="gap-1.5 text-xs"><ClipboardCheck className="h-3.5 w-3.5" />לוח מבדקים</TabsTrigger>
          <TabsTrigger value="training" className="gap-1.5 text-xs"><GraduationCap className="h-3.5 w-3.5" />הכשרות</TabsTrigger>
        </TabsList>

        {/* ═══ Tab 1: Standards Registry ═══ */}
        <TabsContent value="registry">
          <Card className="bg-card/60 border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="חיפוש תקן, קוד או אחראי..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pr-9 bg-background/50 text-sm"
                  />
                </div>
                <Badge variant="outline" className="text-xs">{filteredStandards.length} תקנים</Badge>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className={th}>קוד</th>
                      <th className={th}>שם התקן</th>
                      <th className={th}>קטגוריה</th>
                      <th className={th}>סטטוס</th>
                      <th className={th}>מבדק אחרון</th>
                      <th className={th}>מבדק הבא</th>
                      <th className={th}>אחראי</th>
                      <th className={th}>גוף מאשר</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredStandards.map(s => (
                      <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                        <td className={`${td} font-mono text-xs font-semibold text-blue-400`}>{s.code}</td>
                        <td className={td}>{s.name}</td>
                        <td className={td}>
                          <Badge variant="outline" className="text-[10px]">{s.category}</Badge>
                        </td>
                        <td className={td}>
                          <Badge className={`text-[10px] ${statusColor(s.status)}`}>{statusLabel(s.status)}</Badge>
                        </td>
                        <td className={`${td} font-mono text-xs text-muted-foreground`}>{s.lastAudit}</td>
                        <td className={`${td} font-mono text-xs`}>
                          <span className={s.status === "expired" ? "text-red-400" : "text-muted-foreground"}>{s.nextAudit}</span>
                        </td>
                        <td className={td}>{s.responsible}</td>
                        <td className={`${td} text-muted-foreground text-xs`}>{s.certBody}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Tab 2: Compliance Matrix ═══ */}
        <TabsContent value="compliance">
          <Card className="bg-card/60 border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Grid3X3 className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-semibold">מטריצת תאימות -- תקנים מול מוצרים</span>
              </div>
              <div className="flex gap-4 text-[10px] text-muted-foreground mb-2">
                <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-400" />מלא</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-amber-400" />חלקי</span>
                <span className="flex items-center gap-1"><XCircle className="h-3 w-3 text-red-400" />לא רלוונטי</span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className={th}>תקן</th>
                      {products.map(p => (
                        <th key={p} className={`${th} text-center`}>{p}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {Object.entries(complianceMatrix).map(([std, vals]) => (
                      <tr key={std} className="hover:bg-muted/20 transition-colors">
                        <td className={`${td} font-mono text-xs font-semibold text-blue-400 whitespace-nowrap`}>{std}</td>
                        {products.map(p => (
                          <td key={p} className={`${td} text-center`}>
                            <Badge className={`text-[10px] ${complianceCellColor(vals[p])}`}>
                              {complianceCellLabel(vals[p])}
                            </Badge>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Tab 3: Audit Schedule ═══ */}
        <TabsContent value="audits">
          <Card className="bg-card/60 border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-amber-400" />
                  <span className="text-sm font-semibold">מבדקים קרובים</span>
                </div>
                <Badge variant="outline" className="text-xs">{audits.length} מבדקים מתוכננים</Badge>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[800px]">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className={th}>מזהה</th>
                      <th className={th}>תקן</th>
                      <th className={th}>תאריך</th>
                      <th className={th}>סוג מבדק</th>
                      <th className={th}>מבדק / גוף</th>
                      <th className={th}>היקף</th>
                      <th className={th}>סטטוס</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {audits.map(a => (
                      <tr key={a.id} className="hover:bg-muted/20 transition-colors">
                        <td className={`${td} font-mono text-xs font-semibold`}>{a.id}</td>
                        <td className={`${td} font-mono text-xs text-blue-400`}>{a.standard}</td>
                        <td className={`${td} font-mono text-xs`}>{a.date}</td>
                        <td className={td}>
                          <Badge variant="outline" className={`text-[10px] ${a.type.includes("דחוף") ? "border-red-500/50 text-red-300" : ""}`}>
                            {a.type}
                          </Badge>
                        </td>
                        <td className={`${td} text-xs`}>{a.auditor}</td>
                        <td className={`${td} text-muted-foreground text-xs`}>{a.scope}</td>
                        <td className={td}>
                          <Badge className={`text-[10px] ${auditStatusColor(a.status)}`}>{a.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Audit prep cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                {audits.filter(a => a.status === "בהכנה").map(a => (
                  <Card key={a.id} className="bg-amber-500/5 border-amber-500/20">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400" />
                        <span className="text-sm font-semibold">{a.standard}</span>
                        <Badge className="bg-amber-500/20 text-amber-300 text-[10px] mr-auto">{a.type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">תאריך: {a.date}</p>
                      <p className="text-xs text-muted-foreground">מבדק: {a.auditor}</p>
                      <Progress value={45} className="h-1.5 mt-2" />
                      <p className="text-[10px] text-muted-foreground mt-1">הכנה: 45% הושלם</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Tab 4: Training ═══ */}
        <TabsContent value="training">
          <Card className="bg-card/60 border-border">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-purple-400" />
                  <span className="text-sm font-semibold">הכשרות והסמכות מהנדסים</span>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                  <FilePlus2 className="h-3.5 w-3.5" />
                  הוסף הכשרה
                </Button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[850px]">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className={th}>מזהה</th>
                      <th className={th}>שם ההכשרה</th>
                      <th className={th}>מרצה / גוף</th>
                      <th className={th}>משתתפים</th>
                      <th className={th}>תאריך</th>
                      <th className={th}>משך</th>
                      <th className={th}>קהל יעד</th>
                      <th className={th}>סטטוס</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trainings.map(t => (
                      <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                        <td className={`${td} font-mono text-xs font-semibold`}>{t.id}</td>
                        <td className={`${td} font-semibold text-xs`}>{t.name}</td>
                        <td className={`${td} text-xs`}>{t.trainer}</td>
                        <td className={`${td} text-center`}>
                          <div className="flex items-center gap-1 justify-center">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            <span className="font-mono text-xs">{t.participants}</span>
                          </div>
                        </td>
                        <td className={`${td} font-mono text-xs`}>{t.date}</td>
                        <td className={`${td} text-xs text-muted-foreground`}>{t.duration}</td>
                        <td className={`${td} text-xs text-muted-foreground`}>{t.target}</td>
                        <td className={td}>
                          <Badge className={`text-[10px] ${trainingStatusColor(t.status)}`}>{t.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Training summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <Card className="bg-card/80 border-border">
                  <CardContent className="p-3 text-center">
                    <Award className="h-5 w-5 text-green-400 mx-auto mb-1" />
                    <p className="text-lg font-bold font-mono text-green-400">{trainings.filter(t => t.status === "הושלם").length}</p>
                    <p className="text-[10px] text-muted-foreground">הכשרות הושלמו</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/80 border-border">
                  <CardContent className="p-3 text-center">
                    <CalendarClock className="h-5 w-5 text-amber-400 mx-auto mb-1" />
                    <p className="text-lg font-bold font-mono text-amber-400">{trainings.filter(t => t.status === "מתוכנן").length}</p>
                    <p className="text-[10px] text-muted-foreground">מתוכננות</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/80 border-border">
                  <CardContent className="p-3 text-center">
                    <Users className="h-5 w-5 text-blue-400 mx-auto mb-1" />
                    <p className="text-lg font-bold font-mono text-blue-400">{trainings.reduce((s, t) => s + t.participants, 0)}</p>
                    <p className="text-[10px] text-muted-foreground">סה&quot;כ משתתפים</p>
                  </CardContent>
                </Card>
                <Card className="bg-card/80 border-border">
                  <CardContent className="p-3 text-center">
                    <ArrowUpDown className="h-5 w-5 text-purple-400 mx-auto mb-1" />
                    <p className="text-lg font-bold font-mono text-purple-400">{trainings.filter(t => t.status === "רישום פתוח").length}</p>
                    <p className="text-[10px] text-muted-foreground">רישום פתוח</p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
