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
  ClipboardCheck, FileSearch, ListChecks, BarChart3,
  TrendingUp, TrendingDown, Clock, CheckCircle2,
  AlertTriangle, XCircle, Eye, Search, Filter,
  ShieldCheck, Thermometer, Factory, DollarSign, Wrench, BookOpen,
} from "lucide-react";

// ── Design Reviews ──
const FALLBACK_REVIEWS = [
  { id: "DR-001", project: "בניין משרדים רמת גן", product: "קיר מסך אלומיניום", type: "preliminary", status: "approved", reviewers: "יוסי כהן, שרה לוי", date: "2026-03-12", findings: 3 },
  { id: "DR-002", project: "מפעל אלקטרוניקה חיפה", product: "דלתות זכוכית מחוסמת", type: "critical", status: "in-progress", reviewers: "דוד מזרחי, רחל אברהם", date: "2026-04-02", findings: 7 },
  { id: "DR-003", project: "מרכז מסחרי באר שבע", product: "חלונות אלומיניום תרמיים", type: "final", status: "approved", reviewers: "אלון גולדשטיין, מיכל ברק", date: "2026-03-28", findings: 2 },
  { id: "DR-004", project: "בית חולים אשדוד", product: "מחיצות זכוכית אקוסטיות", type: "critical", status: "rejected", reviewers: "עומר חדד, נועה פרידמן", date: "2026-04-05", findings: 9 },
  { id: "DR-005", project: "מגדל מגורים תל אביב", product: "מעקות זכוכית מרפסות", type: "preliminary", status: "scheduled", reviewers: "יוסי כהן, דוד מזרחי", date: "2026-04-10", findings: 0 },
  { id: "DR-006", project: "מפעל תעופה לוד", product: "תריסי אלומיניום חשמליים", type: "final", status: "revision-required", reviewers: "שרה לוי, רחל אברהם", date: "2026-04-01", findings: 5 },
  { id: "DR-007", project: "קניון ירושלים", product: "חזית זכוכית מבנית", type: "critical", status: "approved", reviewers: "מיכל ברק, עומר חדד", date: "2026-03-18", findings: 4 },
  { id: "DR-008", project: "מתחם ספורט נתניה", product: "דלתות אש אלומיניום", type: "preliminary", status: "in-progress", reviewers: "נועה פרידמן, אלון גולדשטיין", date: "2026-04-07", findings: 6 },
  { id: "DR-009", project: "בניין עיריית חולון", product: "חלונות פנורמיים", type: "final", status: "approved", reviewers: "יוסי כהן, מיכל ברק", date: "2026-03-25", findings: 1 },
  { id: "DR-010", project: "מלון ים המלח", product: "פרגולות אלומיניום מתכווננות", type: "critical", status: "scheduled", reviewers: "דוד מזרחי, שרה לוי", date: "2026-04-12", findings: 0 },
];

// ── Findings ──
const FALLBACK_FINDINGS = [
  { id: "F-001", reviewId: "DR-002", severity: "critical", category: "שלמות מבנית", desc: "עובי פרופיל לא מספיק בקומה 8 - עומס רוח", assignedTo: "דוד מזרחי", status: "open" },
  { id: "F-002", reviewId: "DR-002", severity: "major", category: "בחירת חומרים", desc: "זכוכית מחוסמת לא עומדת בתקן בידוד", assignedTo: "רחל אברהם", status: "in-progress" },
  { id: "F-003", reviewId: "DR-004", severity: "critical", category: "תאימות תקנים", desc: "חוסר עמידה בתקן אקוסטי ת\"י 1004", assignedTo: "עומר חדד", status: "open" },
  { id: "F-004", reviewId: "DR-004", severity: "major", category: "ביצועים תרמיים", desc: "מעבר חום גבוה בחיבור מחיצה-תקרה", assignedTo: "נועה פרידמן", status: "open" },
  { id: "F-005", reviewId: "DR-001", severity: "minor", category: "אופטימיזציית עלויות", desc: "ניתן להחליף פרופיל לחלופה זולה ב-15%", assignedTo: "יוסי כהן", status: "closed" },
  { id: "F-006", reviewId: "DR-004", severity: "critical", category: "היתכנות ייצור", desc: "חתך מיוחד דורש כלי ייעודי שאין במלאי", assignedTo: "שרה לוי", status: "in-progress" },
  { id: "F-007", reviewId: "DR-006", severity: "major", category: "שיטת התקנה", desc: "גישת מנוף חסומה - דרושה שיטת הרכבה חלופית", assignedTo: "אלון גולדשטיין", status: "open" },
  { id: "F-008", reviewId: "DR-002", severity: "minor", category: "גישת תחזוקה", desc: "חוסר גישה לניקוי זכוכית פנימית", assignedTo: "דוד מזרחי", status: "closed" },
  { id: "F-009", reviewId: "DR-008", severity: "major", category: "שלמות מבנית", desc: "ציר דלת לא מותאם למשקל האגף", assignedTo: "נועה פרידמן", status: "in-progress" },
  { id: "F-010", reviewId: "DR-006", severity: "observation", category: "אופטימיזציית עלויות", desc: "הזמנה משולבת עם פרויקט ירושלים תחסוך 8%", assignedTo: "מיכל ברק", status: "open" },
  { id: "F-011", reviewId: "DR-004", severity: "major", category: "בחירת חומרים", desc: "איטום סיליקון לא מתאים לסביבה רטובה", assignedTo: "עומר חדד", status: "open" },
  { id: "F-012", reviewId: "DR-007", severity: "minor", category: "תאימות תקנים", desc: "תיעוד חסר לתקן EN 13830", assignedTo: "מיכל ברק", status: "closed" },
  { id: "F-013", reviewId: "DR-008", severity: "critical", category: "היתכנות ייצור", desc: "רוחב דלת חורג מקו ייצור סטנדרטי", assignedTo: "אלון גולדשטיין", status: "open" },
  { id: "F-014", reviewId: "DR-002", severity: "observation", category: "גישת תחזוקה", desc: "כדאי להוסיף פאנל גישה לתחזוקה שנתית", assignedTo: "רחל אברהם", status: "in-progress" },
  { id: "F-015", reviewId: "DR-006", severity: "minor", category: "שיטת התקנה", desc: "סימון קו התקנה חסר בשרטוט", assignedTo: "שרה לוי", status: "closed" },
];

// ── Checklist ──
const FALLBACK_CHECKLIST = [
  { item: "שלמות מבנית", icon: ShieldCheck, desc: "בדיקת עמידות מבנית, חישובי עומסים, רוח ורעידות", weight: 20, passRate: 88 },
  { item: "בחירת חומרים", icon: Factory, desc: "התאמת חומרי גלם, אלומיניום, זכוכית, איטומים", weight: 15, passRate: 92 },
  { item: "ביצועים תרמיים", icon: Thermometer, desc: "בידוד תרמי, U-value, גשר קור, עיבוי", weight: 15, passRate: 78 },
  { item: "היתכנות ייצור", icon: Factory, desc: "התאמה לקווי ייצור, כלים זמינים, זמני ייצור", weight: 15, passRate: 85 },
  { item: "אופטימיזציית עלויות", icon: DollarSign, desc: "עלות חומרים, עבודה, שינוע, חלופות זולות", weight: 10, passRate: 94 },
  { item: "תאימות תקנים", icon: BookOpen, desc: "תקני ישראל, EN, בטיחות אש, אקוסטיקה", weight: 10, passRate: 82 },
  { item: "שיטת התקנה", icon: Wrench, desc: "גישה לאתר, ציוד נדרש, סדר עבודה, בטיחות", weight: 10, passRate: 90 },
  { item: "גישת תחזוקה", icon: Eye, desc: "ניקוי, החלפת חלקים, גישה עתידית, אחריות", weight: 5, passRate: 96 },
];

// ── Badge helpers ──
const reviewStatusColor = (s: string) =>
  s === "approved" ? "bg-green-500/20 text-green-300"
  : s === "in-progress" ? "bg-blue-500/20 text-blue-300"
  : s === "rejected" ? "bg-red-500/20 text-red-300"
  : s === "revision-required" ? "bg-orange-500/20 text-orange-300"
  : "bg-gray-500/20 text-gray-300";

const reviewStatusLabel = (s: string) =>
  s === "approved" ? "מאושר" : s === "in-progress" ? "בבדיקה" : s === "rejected" ? "נדחה"
  : s === "revision-required" ? "דרוש תיקון" : "מתוזמן";

const typeColor = (t: string) =>
  t === "critical" ? "bg-red-500/20 text-red-300"
  : t === "final" ? "bg-purple-500/20 text-purple-300"
  : "bg-cyan-500/20 text-cyan-300";

const typeLabel = (t: string) =>
  t === "critical" ? "קריטי" : t === "final" ? "סופי" : "מקדמי";

const severityColor = (s: string) =>
  s === "critical" ? "bg-red-500/20 text-red-300"
  : s === "major" ? "bg-orange-500/20 text-orange-300"
  : s === "minor" ? "bg-yellow-500/20 text-yellow-300"
  : "bg-blue-500/20 text-blue-300";

const severityLabel = (s: string) =>
  s === "critical" ? "קריטי" : s === "major" ? "מהותי" : s === "minor" ? "קל" : "תצפית";

const findingStatusColor = (s: string) =>
  s === "open" ? "bg-red-500/20 text-red-300"
  : s === "in-progress" ? "bg-blue-500/20 text-blue-300"
  : "bg-green-500/20 text-green-300";

const findingStatusLabel = (s: string) =>
  s === "open" ? "פתוח" : s === "in-progress" ? "בטיפול" : "סגור";

const th = "p-3 text-right text-muted-foreground font-medium text-xs";
const td = "p-3 text-sm";

export default function DesignReviewsPage() {
  const { data: apireviews } = useQuery({
    queryKey: ["/api/engineering/design-reviews/reviews"],
    queryFn: () => authFetch("/api/engineering/design-reviews/reviews").then(r => r.json()).catch(() => null),
  });
  const reviews = Array.isArray(apireviews) ? apireviews : (apireviews?.data ?? apireviews?.items ?? FALLBACK_REVIEWS);


  const { data: apifindings } = useQuery({
    queryKey: ["/api/engineering/design-reviews/findings"],
    queryFn: () => authFetch("/api/engineering/design-reviews/findings").then(r => r.json()).catch(() => null),
  });
  const findings = Array.isArray(apifindings) ? apifindings : (apifindings?.data ?? apifindings?.items ?? FALLBACK_FINDINGS);


  const { data: apichecklist } = useQuery({
    queryKey: ["/api/engineering/design-reviews/checklist"],
    queryFn: () => authFetch("/api/engineering/design-reviews/checklist").then(r => r.json()).catch(() => null),
  });
  const checklist = Array.isArray(apichecklist) ? apichecklist : (apichecklist?.data ?? apichecklist?.items ?? FALLBACK_CHECKLIST);

  const [tab, setTab] = useState("reviews");
  const [search, setSearch] = useState("");

  // ── KPIs ──
  const totalReviews = reviews.length;
  const pendingReviews = reviews.filter(r => r.status === "scheduled" || r.status === "in-progress").length;
  const approvedMonth = reviews.filter(r => r.status === "approved" && r.date >= "2026-03-01").length;
  const rejectionRate = Math.round((reviews.filter(r => r.status === "rejected").length / totalReviews) * 100);
  const avgReviewDays = 4.2;

  const kpis = [
    { label: "סה\"כ סקירות", value: totalReviews.toString(), icon: ClipboardCheck, color: "text-blue-400", trend: "+3", up: true },
    { label: "סקירות ממתינות", value: pendingReviews.toString(), icon: Clock, color: "text-amber-400", trend: "+1", up: false },
    { label: "אושרו החודש", value: approvedMonth.toString(), icon: CheckCircle2, color: "text-green-400", trend: "+2", up: true },
    { label: "אחוז דחיות", value: `${rejectionRate}%`, icon: XCircle, color: "text-red-400", trend: "-3%", up: true },
    { label: "זמן סקירה ממוצע", value: `${avgReviewDays}`, icon: FileSearch, color: "text-purple-400", trend: "-0.5", up: true },
  ];

  const cycleTimes = [{ type: "מקדמי", avg: 2.8, min: 1, max: 5 }, { type: "קריטי", avg: 5.1, min: 3, max: 8 }, { type: "סופי", avg: 3.4, min: 2, max: 6 }];
  const findingDist = [
    { severity: "קריטי", count: findings.filter(f => f.severity === "critical").length, color: "bg-red-500" },
    { severity: "מהותי", count: findings.filter(f => f.severity === "major").length, color: "bg-orange-500" },
    { severity: "קל", count: findings.filter(f => f.severity === "minor").length, color: "bg-yellow-500" },
    { severity: "תצפית", count: findings.filter(f => f.severity === "observation").length, color: "bg-blue-500" },
  ];
  const approvalRates = [{ month: "ינואר", rate: 82 }, { month: "פברואר", rate: 78 }, { month: "מרץ", rate: 85 }, { month: "אפריל", rate: 80 }];
  const filteredReviews = reviews.filter(r => !search || r.project.includes(search) || r.id.includes(search) || r.product.includes(search));
  const filteredFindings = findings.filter(f => !search || f.desc.includes(search) || f.id.includes(search) || f.reviewId.includes(search));

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-blue-400" />
            סקירות עיצוב
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי -- ניהול תהליך סקירת עיצוב ואישורים</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9 w-56 bg-card/60 border-border text-sm"
            />
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <Filter className="h-3.5 w-3.5" /> סינון
          </Button>
        </div>
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

      {/* ── Approval progress ── */}
      <Card className="bg-card/60 border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">סקירות שהושלמו בהצלחה -- יעד 85%</span>
            <span className="text-sm font-mono text-green-400">{Math.round((approvedMonth / totalReviews) * 100)}%</span>
          </div>
          <Progress value={Math.round((approvedMonth / totalReviews) * 100)} className="h-2" />
        </CardContent>
      </Card>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-card/60 border border-border w-full justify-start gap-1 p-1 h-auto flex-wrap">
          <TabsTrigger value="reviews" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><ClipboardCheck className="h-3.5 w-3.5" />סקירות</TabsTrigger>
          <TabsTrigger value="findings" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><AlertTriangle className="h-3.5 w-3.5" />ממצאים</TabsTrigger>
          <TabsTrigger value="checklist" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><ListChecks className="h-3.5 w-3.5" />רשימת בדיקה</TabsTrigger>
          <TabsTrigger value="metrics" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white gap-1.5 text-xs"><BarChart3 className="h-3.5 w-3.5" />מדדים</TabsTrigger>
        </TabsList>

        {/* ── Reviews Tab ── */}
        <TabsContent value="reviews">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מזהה</th><th className={th}>פרויקט</th><th className={th}>מוצר</th>
              <th className={th}>סוג</th><th className={th}>סטטוס</th><th className={th}>סוקרים</th>
              <th className={th}>תאריך</th><th className={th}>ממצאים</th>
            </tr></thead><tbody>
              {filteredReviews.map((r, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400`}>{r.id}</td>
                  <td className={td}>{r.project}</td>
                  <td className={`${td} text-muted-foreground`}>{r.product}</td>
                  <td className={td}><Badge className={`${typeColor(r.type)} border-0 text-[10px]`}>{typeLabel(r.type)}</Badge></td>
                  <td className={td}><Badge className={`${reviewStatusColor(r.status)} border-0 text-[10px]`}>{reviewStatusLabel(r.status)}</Badge></td>
                  <td className={`${td} text-muted-foreground text-xs`}>{r.reviewers}</td>
                  <td className={`${td} font-mono text-xs`}>{r.date}</td>
                  <td className={`${td} text-center font-mono`}>
                    <span className={r.findings > 5 ? "text-red-400" : r.findings > 2 ? "text-amber-400" : "text-green-400"}>
                      {r.findings}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Findings Tab ── */}
        <TabsContent value="findings">
          <Card className="bg-card/80 border-border"><CardContent className="p-0"><div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border bg-background/50">
              <th className={th}>מזהה</th><th className={th}>סקירה</th><th className={th}>חומרה</th>
              <th className={th}>קטגוריה</th><th className={th}>תיאור</th><th className={th}>אחראי</th>
              <th className={th}>סטטוס</th>
            </tr></thead><tbody>
              {filteredFindings.map((f, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className={`${td} font-mono text-blue-400`}>{f.id}</td>
                  <td className={`${td} font-mono text-xs`}>{f.reviewId}</td>
                  <td className={td}><Badge className={`${severityColor(f.severity)} border-0 text-[10px]`}>{severityLabel(f.severity)}</Badge></td>
                  <td className={`${td} text-muted-foreground text-xs`}>{f.category}</td>
                  <td className={`${td} max-w-xs`}>{f.desc}</td>
                  <td className={td}>{f.assignedTo}</td>
                  <td className={td}><Badge className={`${findingStatusColor(f.status)} border-0 text-[10px]`}>{findingStatusLabel(f.status)}</Badge></td>
                </tr>
              ))}
            </tbody></table>
          </div></CardContent></Card>
        </TabsContent>

        {/* ── Checklist Tab ── */}
        <TabsContent value="checklist">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {checklist.map((c, i) => (
              <Card key={i} className="bg-card/80 border-border hover:border-border transition-colors"><CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10"><c.icon className="h-5 w-5 text-blue-400" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{c.item}</h3>
                      <Badge className="bg-blue-500/20 text-blue-300 border-0 text-[10px]">משקל {c.weight}%</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{c.desc}</p>
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-muted-foreground">שיעור עמידה</span>
                        <span className={`text-xs font-mono ${c.passRate >= 90 ? "text-green-400" : c.passRate >= 80 ? "text-amber-400" : "text-red-400"}`}>{c.passRate}%</span>
                      </div>
                      <Progress value={c.passRate} className="h-1.5" />
                    </div>
                  </div>
                </div>
              </CardContent></Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Metrics Tab ── */}
        <TabsContent value="metrics">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <Card className="bg-card/80 border-border"><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-purple-400" />זמני מחזור סקירה (ימים)</h3>
              <div className="space-y-3">{cycleTimes.map((ct, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs"><span>{ct.type}</span><span className="font-mono text-purple-400">ממוצע {ct.avg}</span></div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-8">{ct.min}</span>
                    <div className="flex-1 h-3 bg-muted/30 rounded-full overflow-hidden"><div className="h-full bg-purple-500/60 rounded-full" style={{ width: `${(ct.avg / 10) * 100}%` }} /></div>
                    <span className="text-[10px] text-muted-foreground w-8">{ct.max}</span>
                  </div>
                </div>
              ))}</div>
            </CardContent></Card>
            <Card className="bg-card/80 border-border"><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-400" />פילוח ממצאים לפי חומרה</h3>
              <div className="space-y-3">{findingDist.map((fd, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs"><span>{fd.severity}</span><span className="font-mono">{fd.count}</span></div>
                  <div className="h-3 bg-muted/30 rounded-full overflow-hidden"><div className={`h-full ${fd.color} rounded-full opacity-70`} style={{ width: `${(fd.count / findings.length) * 100}%` }} /></div>
                </div>
              ))}
              <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground"><span>סה"כ ממצאים</span><span className="font-mono">{findings.length}</span></div>
              </div>
            </CardContent></Card>
            <Card className="bg-card/80 border-border"><CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-400" />שיעורי אישור חודשיים</h3>
              <div className="space-y-3">{approvalRates.map((ar, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center justify-between text-xs"><span>{ar.month}</span><span className={`font-mono ${ar.rate >= 85 ? "text-green-400" : ar.rate >= 75 ? "text-amber-400" : "text-red-400"}`}>{ar.rate}%</span></div>
                  <div className="h-3 bg-muted/30 rounded-full overflow-hidden"><div className={`h-full rounded-full ${ar.rate >= 85 ? "bg-green-500/70" : ar.rate >= 75 ? "bg-amber-500/70" : "bg-red-500/70"}`} style={{ width: `${ar.rate}%` }} /></div>
                </div>
              ))}
              <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground"><span>ממוצע רבעוני</span><span className="font-mono text-green-400">{Math.round(approvalRates.reduce((s, a) => s + a.rate, 0) / approvalRates.length)}%</span></div>
              </div>
            </CardContent></Card>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            {[
              { label: "ממצאים פתוחים", value: findings.filter(f => f.status === "open").length, color: "text-red-400" },
              { label: "ממצאים בטיפול", value: findings.filter(f => f.status === "in-progress").length, color: "text-blue-400" },
              { label: "ממצאים שנסגרו", value: findings.filter(f => f.status === "closed").length, color: "text-green-400" },
              { label: "ממצאים קריטיים", value: findings.filter(f => f.severity === "critical").length, color: "text-red-400" },
            ].map((s, i) => (
              <Card key={i} className="bg-card/60 border-border"><CardContent className="p-3 text-center">
                <p className="text-[11px] text-muted-foreground">{s.label}</p>
                <p className={`text-xl font-bold font-mono mt-1 ${s.color}`}>{s.value}</p>
              </CardContent></Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
