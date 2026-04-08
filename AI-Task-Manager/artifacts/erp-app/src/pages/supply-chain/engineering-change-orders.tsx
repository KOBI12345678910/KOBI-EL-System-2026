import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FileEdit, ClipboardCheck, BarChart3, History, Search,
  AlertTriangle, Clock, CheckCircle2, XCircle, ArrowRight,
  TrendingUp, TrendingDown, Layers, DollarSign, Users, Zap,
} from "lucide-react";

const FALLBACK_ECOS = [
  { id: "ECO-2026-001", title: "שינוי עובי זכוכית מחוסמת 6mm ל-8mm", products: ["חלון ויטרינה VT-200", "דלת כניסה DK-150"], type: "design", priority: "critical", status: "in-progress", requestor: "דוד כהן", created: "2026-03-12", target: "2026-04-20" },
  { id: "ECO-2026-002", title: "החלפת סגסוגת אלומיניום 6063 ל-6061", products: ["פרופיל תריס PR-80"], type: "material", priority: "high", status: "approved", requestor: "מירי לוי", created: "2026-03-15", target: "2026-04-25" },
  { id: "ECO-2026-003", title: "שיפור תהליך ריתוך מסגרות TIG", products: ["מסגרת אלומיניום FR-300", "שלדת פלדה ST-100"], type: "process", priority: "medium", status: "review", requestor: "יוסי אברהם", created: "2026-03-18", target: "2026-05-01" },
  { id: "ECO-2026-004", title: "הוספת ציפוי אנודייז לפרופילים חיצוניים", products: ["פרופיל חוץ EX-40"], type: "quality", priority: "high", status: "implemented", requestor: "רונית שמש", created: "2026-02-20", target: "2026-03-30" },
  { id: "ECO-2026-005", title: "מעבר לזכוכית Low-E מספק מקומי", products: ["חלון כפול DG-500", "חלון ויטרינה VT-200"], type: "cost", priority: "medium", status: "draft", requestor: "אבי מזרחי", created: "2026-03-25", target: "2026-05-15" },
  { id: "ECO-2026-006", title: "שינוי מידות חיתוך פרופיל תריס", products: ["תריס גלילה RL-60"], type: "design", priority: "low", status: "approved", requestor: "דנה פרץ", created: "2026-03-28", target: "2026-04-30" },
  { id: "ECO-2026-007", title: "שדרוג חומר איטום סיליקון לעמידות UV", products: ["חלון כפול DG-500", "דלת כניסה DK-150", "ויטרינה חנות SH-700"], type: "material", priority: "critical", status: "review", requestor: "שלמה ביטון", created: "2026-04-01", target: "2026-04-18" },
  { id: "ECO-2026-008", title: "אופטימיזציה של תהליך חיתוך CNC", products: ["פרופיל אלומיניום AL-25"], type: "process", priority: "medium", status: "implemented", requestor: "מיכל גולן", created: "2026-02-10", target: "2026-03-20" },
  { id: "ECO-2026-009", title: "תוספת בדיקת QC לזכוכית מחוסמת", products: ["זכוכית מחוסמת TG-12"], type: "quality", priority: "high", status: "in-progress", requestor: "עוזי טכנו-כל", created: "2026-03-30", target: "2026-04-22" },
  { id: "ECO-2026-010", title: "החלפת ספק ברגים נירוסטה", products: ["מסגרת אלומיניום FR-300", "דלת כניסה DK-150"], type: "cost", priority: "low", status: "cancelled", requestor: "חיים רוזן", created: "2026-03-05", target: "2026-04-10" },
  { id: "ECO-2026-011", title: "עדכון מפרט צבע אלקטרוסטטי RAL 7016", products: ["פרופיל חוץ EX-40", "תריס גלילה RL-60"], type: "design", priority: "medium", status: "draft", requestor: "נועה כץ", created: "2026-04-03", target: "2026-05-10" },
  { id: "ECO-2026-012", title: "הקטנת עובי דופן פרופיל מ-2mm ל-1.6mm", products: ["פרופיל תריס PR-80"], type: "cost", priority: "high", status: "review", requestor: "אלי דהן", created: "2026-04-05", target: "2026-04-28" },
];

const stg = (role: string, name: string, status: string, date?: string, comment?: string) => ({ role, name, status, date: date ?? null, comment: comment ?? null });
const FALLBACK_APPROVALPIPELINE = [
  { ecoId: "ECO-2026-007", title: "שדרוג חומר איטום סיליקון לעמידות UV", stages: [
    stg("מהנדס מוצר", "שלמה ביטון", "approved", "2026-04-02", "נדרש לעמידה בתקן ישראלי 1045"),
    stg("מנהל בקרת איכות", "רונית שמש", "approved", "2026-04-04", "אושר - בדיקות מעבדה הושלמו"),
    stg("מנהל ייצור", "יוסי אברהם", "pending"), stg("מנהל מפעל", "עוזי טכנו-כל", "waiting"),
  ]},
  { ecoId: "ECO-2026-003", title: "שיפור תהליך ריתוך מסגרות TIG", stages: [
    stg("מהנדס מוצר", "יוסי אברהם", "approved", "2026-03-20", "שיפור איכות ריתוך ב-30%"),
    stg("מנהל בקרת איכות", "רונית שמש", "pending"), stg("מנהל ייצור", "דוד כהן", "waiting"),
    stg("מנהל מפעל", "עוזי טכנו-כל", "waiting"),
  ]},
  { ecoId: "ECO-2026-012", title: "הקטנת עובי דופן פרופיל מ-2mm ל-1.6mm", stages: [
    stg("מהנדס מוצר", "אלי דהן", "approved", "2026-04-06", "חישובי חוזק אושרו"),
    stg("מנהל בקרת איכות", "רונית שמש", "rejected", "2026-04-07", "נדרשת בדיקת עמידות נוספת"),
    stg("מנהל ייצור", "יוסי אברהם", "waiting"), stg("מנהל מפעל", "עוזי טכנו-כל", "waiting"),
  ]},
  { ecoId: "ECO-2026-001", title: "שינוי עובי זכוכית מחוסמת 6mm ל-8mm", stages: [
    stg("מהנדס מוצר", "דוד כהן", "approved", "2026-03-14", "שיפור בטיחות משמעותי"),
    stg("מנהל בקרת איכות", "רונית שמש", "approved", "2026-03-16", "עומד בתקן ישראלי 1099"),
    stg("מנהל ייצור", "יוסי אברהם", "approved", "2026-03-18", "קו ייצור מוכן להתאמה"),
    stg("מנהל מפעל", "עוזי טכנו-כל", "approved", "2026-03-19", "אושר - תיאום עם לקוחות"),
  ]},
  { ecoId: "ECO-2026-005", title: "מעבר לזכוכית Low-E מספק מקומי", stages: [
    stg("מהנדס מוצר", "אבי מזרחי", "pending"), stg("מנהל בקרת איכות", "רונית שמש", "waiting"),
    stg("מנהל ייצור", "יוסי אברהם", "waiting"), stg("מנהל מפעל", "עוזי טכנו-כל", "waiting"),
  ]},
];

const impactData = {
  ecoId: "ECO-2026-001",
  title: "שינוי עובי זכוכית מחוסמת 6mm ל-8mm",
  affectedBOMs: [
    { bom: "BOM-VT200-R3", product: "חלון ויטרינה VT-200", changes: "עדכון רכיב זכוכית: 6mm → 8mm, עדכון משקל כולל" },
    { bom: "BOM-DK150-R5", product: "דלת כניסה DK-150", changes: "עדכון רכיב זכוכית: 6mm → 8mm, עדכון מסגרת תמיכה" },
    { bom: "BOM-SH700-R2", product: "ויטרינה חנות SH-700", changes: "עדכון רכיב זכוכית: 6mm → 8mm, חישוב מחדש" },
  ],
  affectedOrders: [
    { order: "PO-2026-0412", customer: "קבוצת שטראוס", qty: 24, status: "בייצור", impact: "עיכוב 3 ימים" },
    { order: "PO-2026-0398", customer: "רשת ACE", qty: 48, status: "מתוכנן", impact: "ללא עיכוב" },
    { order: "PO-2026-0425", customer: "עיריית חיפה", qty: 120, status: "מתוכנן", impact: "עיכוב 5 ימים" },
    { order: "PO-2026-0431", customer: "אלקטרה בנייה", qty: 36, status: "בהמתנה לחומרים", impact: "עיכוב 2 ימים" },
    { order: "PO-2026-0440", customer: "סולל בונה", qty: 60, status: "מתוכנן", impact: "ללא עיכוב" },
  ],
  inventoryImpact: { add: [{ item: "זכוכית מחוסמת 8mm", qty: 500, unit: "יח׳" }], remove: [{ item: "זכוכית מחוסמת 6mm", qty: 320, unit: "יח׳" }] },
  costImpact: { material: 45000, labor: 8500, tooling: 12000, total: 65500 },
  timelineImpact: { plannedDays: 25, actualEstimate: 32, delayDays: 7 },
  riskAssessment: [
    { risk: "עיכוב אספקת זכוכית 8mm מהספק", probability: "בינונית", severity: "גבוהה", mitigation: "הזמנה מוקדמת + ספק חלופי" },
    { risk: "צורך בהתאמת מסגרות קיימות", probability: "נמוכה", severity: "בינונית", mitigation: "בדיקת תאימות הושלמה" },
    { risk: "עלייה במשקל המוצר הסופי", probability: "גבוהה", severity: "נמוכה", mitigation: "עדכון מפרט שינוע" },
  ],
};

const FALLBACK_HISTORYDATA = [
  { id: "ECO-2025-048", title: "מעבר לפרופיל תרמי משופר", implemented: "2025-12-15", plannedDays: 30, actualDays: 28, savings: 32000, lessons: "תיאום מוקדם עם ספק קיצר זמנים" },
  { id: "ECO-2025-045", title: "החלפת גומיות EPDM לסיליקון", implemented: "2025-11-20", plannedDays: 21, actualDays: 25, savings: 18500, lessons: "בדיקות QC נוספות היו נחוצות" },
  { id: "ECO-2025-042", title: "שדרוג מנגנון נעילה רב-נקודתי", implemented: "2025-10-10", plannedDays: 45, actualDays: 42, savings: 55000, lessons: "הכשרת צוות ייצור במקביל חסכה זמן" },
  { id: "ECO-2025-039", title: "שינוי ציפוי אבקתי לצבע PVDF", implemented: "2025-09-05", plannedDays: 35, actualDays: 40, savings: -12000, lessons: "עלות חומר גולם גבוהה מהצפוי" },
  { id: "ECO-2025-036", title: "אופטימיזציה חיתוך זכוכית - הפחתת פחת", implemented: "2025-08-18", plannedDays: 14, actualDays: 12, savings: 41000, lessons: "תוכנת Nesting החדשה הצליחה מעבר לצפוי" },
  { id: "ECO-2025-033", title: "החלפת ספק ציפוי אנודייז", implemented: "2025-07-22", plannedDays: 60, actualDays: 58, savings: 28000, lessons: "דגימות מוקדמות מנעו בעיות איכות" },
  { id: "ECO-2025-030", title: "שינוי תהליך כיפוף אלומיניום", implemented: "2025-06-15", plannedDays: 28, actualDays: 35, savings: 15000, lessons: "נדרשה כיול מחדש של מכונת CNC" },
  { id: "ECO-2025-027", title: "הוספת שכבת הגנה UV לזכוכית", implemented: "2025-05-08", plannedDays: 21, actualDays: 19, savings: 22000, lessons: "שיתוף פעולה עם מעבדה חיצונית זירז אישור" },
  { id: "ECO-2025-024", title: "מעבר לברגים נירוסטה 316", implemented: "2025-04-12", plannedDays: 10, actualDays: 10, savings: 8500, lessons: "שינוי פשוט - ללא בעיות מיוחדות" },
  { id: "ECO-2025-021", title: "שדרוג מערכת הרכבה מודולרית", implemented: "2025-03-01", plannedDays: 50, actualDays: 55, savings: 67000, lessons: "הדרכת מתקינים בשטח דרשה זמן נוסף" },
];

const badge = (key: string, map: Record<string, [string, string]>) => {
  const [label, cls] = map[key] || [key, ""];
  return <Badge className={cls}>{label}</Badge>;
};
const typeMap: Record<string, [string, string]> = { design: ["שינוי עיצוב","bg-blue-500/20 text-blue-700"], material: ["החלפת חומר","bg-purple-500/20 text-purple-700"], process: ["שינוי תהליך","bg-amber-500/20 text-amber-700"], quality: ["שיפור איכות","bg-green-500/20 text-green-700"], cost: ["הפחתת עלות","bg-teal-500/20 text-teal-700"] };
const prioMap: Record<string, [string, string]> = { critical: ["קריטי","bg-red-600/20 text-red-700"], high: ["גבוה","bg-orange-500/20 text-orange-700"], medium: ["בינוני","bg-yellow-500/20 text-yellow-700"], low: ["נמוך","bg-gray-400/20 text-gray-600"] };
const statMap: Record<string, [string, string]> = { draft: ["טיוטה","bg-gray-400/20 text-gray-600"], review: ["בבדיקה","bg-blue-500/20 text-blue-700"], approved: ["מאושר","bg-emerald-500/20 text-emerald-700"], "in-progress": ["בביצוע","bg-amber-500/20 text-amber-700"], implemented: ["הוטמע","bg-green-600/20 text-green-700"], cancelled: ["בוטל","bg-red-400/20 text-red-600"] };

const levelBadge = (v: string) => <Badge className={v === "גבוהה" ? "bg-red-500/20 text-red-700" : v === "בינונית" ? "bg-amber-500/20 text-amber-700" : "bg-green-500/20 text-green-700"}>{v}</Badge>;
const approvalIcon = (s: string) => {
  if (s === "approved") return <CheckCircle2 className="h-5 w-5 text-green-600" />;
  if (s === "rejected") return <XCircle className="h-5 w-5 text-red-600" />;
  if (s === "pending") return <Clock className="h-5 w-5 text-amber-500 animate-pulse" />;
  return <div className="h-5 w-5 rounded-full border-2 border-gray-300" />;
};

export default function EngineeringChangeOrdersPage() {
  const { data: apiecos } = useQuery({
    queryKey: ["/api/supply-chain/engineering-change-orders/ecos"],
    queryFn: () => authFetch("/api/supply-chain/engineering-change-orders/ecos").then(r => r.json()).catch(() => null),
  });
  const ecos = Array.isArray(apiecos) ? apiecos : (apiecos?.data ?? apiecos?.items ?? FALLBACK_ECOS);


  const { data: apiapprovalPipeline } = useQuery({
    queryKey: ["/api/supply-chain/engineering-change-orders/approvalpipeline"],
    queryFn: () => authFetch("/api/supply-chain/engineering-change-orders/approvalpipeline").then(r => r.json()).catch(() => null),
  });
  const approvalPipeline = Array.isArray(apiapprovalPipeline) ? apiapprovalPipeline : (apiapprovalPipeline?.data ?? apiapprovalPipeline?.items ?? FALLBACK_APPROVALPIPELINE);


  const { data: apihistoryData } = useQuery({
    queryKey: ["/api/supply-chain/engineering-change-orders/historydata"],
    queryFn: () => authFetch("/api/supply-chain/engineering-change-orders/historydata").then(r => r.json()).catch(() => null),
  });
  const historyData = Array.isArray(apihistoryData) ? apihistoryData : (apihistoryData?.data ?? apihistoryData?.items ?? FALLBACK_HISTORYDATA);

  const [search, setSearch] = useState("");
  const filtered = ecos.filter(e =>
    e.id.toLowerCase().includes(search.toLowerCase()) ||
    e.title.includes(search) ||
    e.products.some(p => p.includes(search))
  );

  const kpis = [
    { label: "ECOs פתוחים", value: 7, icon: FileEdit, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "ממתינים לאישור", value: 3, icon: ClipboardCheck, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "הוטמעו החודש", value: 4, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
    { label: "זמן אישור ממוצע", value: "5.2", unit: "ימים", icon: Clock, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "הזמנות ייצור מושפעות", value: 12, icon: Layers, color: "text-red-600", bg: "bg-red-50" },
    { label: "השפעת עלות כוללת", value: "₪142,500", icon: DollarSign, color: "text-teal-600", bg: "bg-teal-50" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileEdit className="h-7 w-7 text-blue-600" />
          הזמנות שינוי הנדסיות (ECO)
        </h1>
        <Button className="gap-2"><Zap className="h-4 w-4" /> יצירת ECO חדש</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k, i) => (
          <Card key={i} className={k.bg}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-center gap-3">
                <k.icon className={`h-8 w-8 ${k.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-xl font-bold">{k.value}{k.unit ? ` ${k.unit}` : ""}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="orders" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="orders">הזמנות שינוי</TabsTrigger>
          <TabsTrigger value="approval">תהליך אישור</TabsTrigger>
          <TabsTrigger value="impact">ניתוח השפעה</TabsTrigger>
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
        </TabsList>

        {/* Tab 1 - Change Orders */}
        <TabsContent value="orders">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">רשימת הזמנות שינוי הנדסיות</CardTitle>
                <div className="relative w-72">
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="חיפוש לפי מספר ECO, כותרת, מוצר..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    {["מספר ECO","כותרת","מוצרים מושפעים","סוג שינוי","עדיפות","סטטוס","מבקש","תאריך יצירה","תאריך יעד"].map(h => <TableHead key={h}>{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(e => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono font-semibold text-blue-700">{e.id}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{e.title}</TableCell>
                      <TableCell className="max-w-[160px]">
                        <div className="flex flex-wrap gap-1">{e.products.map((p, i) => <Badge key={i} variant="outline" className="text-xs">{p}</Badge>)}</div>
                      </TableCell>
                      <TableCell>{badge(e.type, typeMap)}</TableCell>
                      <TableCell>{badge(e.priority, prioMap)}</TableCell>
                      <TableCell>{badge(e.status, statMap)}</TableCell>
                      <TableCell>{e.requestor}</TableCell>
                      <TableCell className="text-sm">{e.created}</TableCell>
                      <TableCell className="text-sm">{e.target}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2 - Approval Flow */}
        <TabsContent value="approval">
          <div className="space-y-4">
            {approvalPipeline.map(ap => (
              <Card key={ap.ecoId}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <span className="font-mono text-blue-700">{ap.ecoId}</span>
                      <span className="text-muted-foreground">|</span>
                      {ap.title}
                    </CardTitle>
                    <Badge variant="outline">{ap.stages.filter(s => s.status === "approved").length}/{ap.stages.length} אישורים</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    {ap.stages.map((stage, i) => (
                      <div key={i} className="flex items-center gap-2 flex-1">
                        <div className={`flex-1 rounded-lg border p-3 ${stage.status === "approved" ? "bg-green-50 border-green-200" : stage.status === "rejected" ? "bg-red-50 border-red-200" : stage.status === "pending" ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-200"}`}>
                          <div className="flex items-center gap-2 mb-1">
                            {approvalIcon(stage.status)}
                            <span className="text-sm font-semibold">{stage.role}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{stage.name}</p>
                          {stage.date && <p className="text-xs mt-1">{stage.date}</p>}
                          {stage.comment && <p className="text-xs text-muted-foreground mt-1 italic">"{stage.comment}"</p>}
                        </div>
                        {i < ap.stages.length - 1 && <ArrowRight className="h-4 w-4 text-gray-400 shrink-0" />}
                      </div>
                    ))}
                  </div>
                  <Progress value={(ap.stages.filter(s => s.status === "approved").length / ap.stages.length) * 100} className="mt-3 h-2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3 - Impact Analysis */}
        <TabsContent value="impact">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-600" /> ניתוח השפעה: <span className="font-mono text-blue-700">{impactData.ecoId}</span> - {impactData.title}
                </CardTitle>
              </CardHeader>
            </Card>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Affected BOMs */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">BOMs מושפעים ({impactData.affectedBOMs.length})</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>מספר BOM</TableHead><TableHead>מוצר</TableHead><TableHead>שינויים</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {impactData.affectedBOMs.map((b, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">{b.bom}</TableCell>
                          <TableCell className="text-sm">{b.product}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{b.changes}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Affected Production Orders */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">הזמנות ייצור מושפעות ({impactData.affectedOrders.length})</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>הזמנה</TableHead><TableHead>לקוח</TableHead><TableHead>כמות</TableHead><TableHead>סטטוס</TableHead><TableHead>השפעה</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {impactData.affectedOrders.map((o, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">{o.order}</TableCell>
                          <TableCell className="text-sm">{o.customer}</TableCell>
                          <TableCell>{o.qty}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{o.status}</Badge></TableCell>
                          <TableCell className="text-sm">{o.impact.includes("עיכוב") ? <span className="text-red-600 font-medium">{o.impact}</span> : <span className="text-green-600">{o.impact}</span>}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Inventory Impact */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">השפעה על מלאי</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-green-700 flex items-center gap-1"><TrendingUp className="h-4 w-4" /> רכיבים להוסיף</p>
                    {impactData.inventoryImpact.add.map((a, i) => (
                      <div key={i} className="flex justify-between text-sm mt-1 bg-green-50 p-2 rounded"><span>{a.item}</span><span className="font-semibold">{a.qty} {a.unit}</span></div>
                    ))}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-red-700 flex items-center gap-1"><TrendingDown className="h-4 w-4" /> רכיבים להסיר</p>
                    {impactData.inventoryImpact.remove.map((r, i) => (
                      <div key={i} className="flex justify-between text-sm mt-1 bg-red-50 p-2 rounded"><span>{r.item}</span><span className="font-semibold">{r.qty} {r.unit}</span></div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Cost Impact */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">השפעת עלויות</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { label: "חומרי גלם", val: impactData.costImpact.material, pct: 69 },
                    { label: "עבודה", val: impactData.costImpact.labor, pct: 13 },
                    { label: "כלי עבודה / תבניות", val: impactData.costImpact.tooling, pct: 18 },
                  ].map((c, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1"><span>{c.label}</span><span className="font-semibold">₪{c.val.toLocaleString()}</span></div>
                      <Progress value={c.pct} className="h-2" />
                    </div>
                  ))}
                  <div className="border-t pt-2 mt-2 flex justify-between font-bold text-base">
                    <span>סה״כ השפעת עלות</span><span className="text-red-700">₪{impactData.costImpact.total.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Timeline Impact */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">השפעה על לוח זמנים</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {[{ v: impactData.timelineImpact.plannedDays, l: "ימים מתוכננים", bg: "bg-blue-50", c: "text-blue-700" },
                      { v: impactData.timelineImpact.actualEstimate, l: "הערכה בפועל", bg: "bg-amber-50", c: "text-amber-700" },
                      { v: `+${impactData.timelineImpact.delayDays}`, l: "ימי עיכוב", bg: "bg-red-50", c: "text-red-700" },
                    ].map((t, i) => <div key={i} className={`${t.bg} rounded-lg p-3`}><p className={`text-2xl font-bold ${t.c}`}>{t.v}</p><p className="text-xs text-muted-foreground">{t.l}</p></div>)}
                  </div>
                  <Progress value={(impactData.timelineImpact.plannedDays / impactData.timelineImpact.actualEstimate) * 100} className="h-3" />
                </CardContent>
              </Card>

              {/* Risk Assessment */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> הערכת סיכונים</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader><TableRow><TableHead>סיכון</TableHead><TableHead>הסתברות</TableHead><TableHead>חומרה</TableHead><TableHead>מיטיגציה</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {impactData.riskAssessment.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{r.risk}</TableCell>
                          <TableCell>{levelBadge(r.probability)}</TableCell>
                          <TableCell>{levelBadge(r.severity)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.mitigation}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab 4 - History */}
        <TabsContent value="history">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><History className="h-5 w-5" /> היסטוריית ECOs שהוטמעו</CardTitle>
                <Badge variant="outline" className="text-sm">{historyData.length} שינויים</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    {["מספר ECO","כותרת","תאריך הטמעה","מתוכנן","בפועל","סטטוס זמן","חיסכון / עלות","לקחים"].map(h => <TableHead key={h}>{h}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.map(h => {
                    const onTime = h.actualDays <= h.plannedDays;
                    return (
                      <TableRow key={h.id}>
                        <TableCell className="font-mono font-semibold text-blue-700">{h.id}</TableCell>
                        <TableCell className="max-w-[180px] truncate">{h.title}</TableCell>
                        <TableCell className="text-sm">{h.implemented}</TableCell>
                        <TableCell className="text-center">{h.plannedDays}</TableCell>
                        <TableCell className="text-center">{h.actualDays}</TableCell>
                        <TableCell>{onTime ? <Badge className="bg-green-500/20 text-green-700">בזמן</Badge> : <Badge className="bg-red-500/20 text-red-700">+{h.actualDays - h.plannedDays} ימים</Badge>}</TableCell>
                        <TableCell className={h.savings >= 0 ? "text-green-700 font-semibold" : "text-red-700 font-semibold"}>{h.savings >= 0 ? `+₪${h.savings.toLocaleString()}` : `-₪${Math.abs(h.savings).toLocaleString()}`}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{h.lessons}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="mt-4 grid grid-cols-3 gap-4">
                {[{ val: "+₪275,000", label: "סה״כ חיסכון מצטבר", bg: "bg-green-50", clr: "text-green-700" },
                  { val: "70%", label: "הושלמו בזמן", bg: "bg-blue-50", clr: "text-blue-700" },
                  { val: "31.4", label: "ימים ממוצע להטמעה", bg: "bg-purple-50", clr: "text-purple-700" },
                ].map((s, i) => (
                  <div key={i} className={`${s.bg} rounded-lg p-4 text-center`}>
                    <p className={`text-2xl font-bold ${s.clr}`}>{s.val}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
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