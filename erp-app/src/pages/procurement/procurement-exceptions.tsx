import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  AlertOctagon, ShieldAlert, Clock, CheckCircle2, DollarSign,
  AlertTriangle, Users, TrendingUp, Truck, FileWarning,
  PackageX, FileX, BarChart3, History, RefreshCw
} from "lucide-react";

const API = "/api";

// ============================================================
// TYPES & DATA — טכנו-כל עוזי Procurement Exceptions
// ============================================================
type ExceptionType = "price_mismatch" | "delivery_delay" | "damaged_goods" | "missing_items" | "invoice_mismatch" | "supplier_non_compliance";
type Severity = "critical" | "high" | "medium" | "low";
type Status = "open" | "assigned" | "in_progress" | "resolved";

interface ProcException {
  id: string;
  type: ExceptionType;
  supplier: string;
  description: string;
  severity: Severity;
  assignedTo: string;
  daysOpen: number;
  status: Status;
  financialImpact: number;
  createdAt: string;
}

const typeConfig: Record<ExceptionType, { icon: typeof AlertOctagon; label: string; color: string }> = {
  price_mismatch:          { icon: DollarSign,   label: "אי-התאמת מחיר",   color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  delivery_delay:          { icon: Truck,         label: "עיכוב אספקה",     color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  damaged_goods:           { icon: PackageX,      label: "סחורה פגומה",     color: "bg-red-500/20 text-red-400 border-red-500/30" },
  missing_items:           { icon: FileX,         label: "פריטים חסרים",    color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  invoice_mismatch:        { icon: FileWarning,   label: "אי-התאמת חשבונית", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  supplier_non_compliance: { icon: ShieldAlert,   label: "אי-עמידה בתקן",  color: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
};

const sevStyle: Record<Severity, { bg: string; text: string; label: string; border: string }> = {
  critical: { bg: "bg-red-500/15",    text: "text-red-400",    label: "קריטי",  border: "border-red-500/40" },
  high:     { bg: "bg-orange-500/15", text: "text-orange-400", label: "גבוה",   border: "border-orange-500/40" },
  medium:   { bg: "bg-amber-500/15",  text: "text-amber-400",  label: "בינוני", border: "border-amber-500/40" },
  low:      { bg: "bg-slate-500/15",  text: "text-slate-400",  label: "נמוך",   border: "border-slate-500/40" },
};

const statusStyle: Record<Status, { label: string; cls: string }> = {
  open:        { label: "פתוח",     cls: "bg-red-500/20 text-red-400 border-red-500/30" },
  assigned:    { label: "שוייך",    cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  in_progress: { label: "בטיפול",   cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  resolved:    { label: "נסגר",     cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

const FALLBACK_EXCEPTIONS: ProcException[] = [
  {
    id: "EXC-001", type: "price_mismatch", supplier: "Foshan Glass Co.",
    description: "הפרש ₪14,200 בין מחיר מוסכם למחיר בחשבונית עבור זכוכית מחוסמת 10מ״מ. הספק חייב לפי מחירון חדש ללא הודעה מוקדמת.",
    severity: "critical", assignedTo: "שרה לוי", daysOpen: 5, status: "in_progress", financialImpact: 14200, createdAt: "2026-04-03",
  },
  {
    id: "EXC-002", type: "delivery_delay", supplier: "Schüco International",
    description: "עיכוב 18 יום במשלוח פרופילי אלומיניום AWS 75. הספק מדווח על בעיות ייצור במפעל גרמניה. קו ייצור 3 בסיכון עצירה.",
    severity: "critical", assignedTo: "דוד מזרחי", daysOpen: 12, status: "assigned", financialImpact: 45000, createdAt: "2026-03-27",
  },
  {
    id: "EXC-003", type: "damaged_goods", supplier: "מפעלי ברזל השרון",
    description: "22 יחידות פלדה מגולוונת התקבלו עם חלודה וכתמי חמצון. אריזה לא תקינה במשלוח. נדרשת החלפה מיידית.",
    severity: "high", assignedTo: "יוסי כהן", daysOpen: 3, status: "in_progress", financialImpact: 8700, createdAt: "2026-04-05",
  },
  {
    id: "EXC-004", type: "missing_items", supplier: "Alumil SA",
    description: "חסרים 45 ידיות נירוסטה L-200 מתוך הזמנה של 500 יחידות. תעודת משלוח מציינת 500 אך נספרו 455 בקבלה.",
    severity: "high", assignedTo: "רחל אברהם", daysOpen: 7, status: "assigned", financialImpact: 5400, createdAt: "2026-04-01",
  },
  {
    id: "EXC-005", type: "invoice_mismatch", supplier: "אלום-טק בע״מ",
    description: "חשבונית כוללת 2 פריטים שלא הוזמנו (חיבורי T) בסך ₪3,100. כמו כן מע״מ חושב על סכום ברוטו במקום נטו.",
    severity: "medium", assignedTo: "נועה פרידמן", daysOpen: 4, status: "in_progress", financialImpact: 3100, createdAt: "2026-04-04",
  },
  {
    id: "EXC-006", type: "supplier_non_compliance", supplier: "Foshan Glass Co.",
    description: "זכוכית למינציה 8מ״מ לא עומדת בתקן ISO 12543. בדיקת מעבדה חיצונית הראתה שכבת PVB דקה מהנדרש ב-0.2מ״מ.",
    severity: "critical", assignedTo: "אלון גולדשטיין", daysOpen: 9, status: "in_progress", financialImpact: 62000, createdAt: "2026-03-30",
  },
  {
    id: "EXC-007", type: "price_mismatch", supplier: "חומרי בניין ישראל",
    description: "תוספת הובלה ₪2,800 שלא סוכמה מראש. הספק טוען לעדכון מחירי דלק אך אין סעיף בחוזה.",
    severity: "low", assignedTo: "מיכל ברק", daysOpen: 2, status: "open", financialImpact: 2800, createdAt: "2026-04-06",
  },
  {
    id: "EXC-008", type: "delivery_delay", supplier: "תעשיות זכוכית ים",
    description: "משלוח זכוכית שקופה 6מ״מ באיחור של 8 ימים. הספק טוען לבעיית חומר גלם. דחיית לו״ז פרויקט מגדלי הים.",
    severity: "high", assignedTo: "עומר חדד", daysOpen: 8, status: "assigned", financialImpact: 18500, createdAt: "2026-03-31",
  },
  {
    id: "EXC-009", type: "damaged_goods", supplier: "Alumil SA",
    description: "12 פרופילי אלומיניום עם שריטות עמוקות לאורך 2 מטר. נראה כנזק מכני בזמן העמסה. דרוש זיכוי או החלפה.",
    severity: "medium", assignedTo: "שרה לוי", daysOpen: 6, status: "in_progress", financialImpact: 4200, createdAt: "2026-04-02",
  },
  {
    id: "EXC-010", type: "missing_items", supplier: "Schüco International",
    description: "ערכת הרכבה חסרה לחלוטין ב-3 ארגזי חלונות. ללא ברגים ואטמים לא ניתן להתקין. עיכוב באתר בנייה.",
    severity: "medium", assignedTo: "דוד מזרחי", daysOpen: 4, status: "open", financialImpact: 1900, createdAt: "2026-04-04",
  },
  // Resolved
  {
    id: "EXC-050", type: "invoice_mismatch", supplier: "מפעלי ברזל השרון",
    description: "כפל חיוב על הזמנה PO-000440. החשבונית שולמה פעמיים בטעות. זיכוי התקבל בהצלחה.",
    severity: "high", assignedTo: "נועה פרידמן", daysOpen: 0, status: "resolved", financialImpact: 22000, createdAt: "2026-03-15",
  },
  {
    id: "EXC-051", type: "supplier_non_compliance", supplier: "אלום-טק בע״מ",
    description: "חיבורי פינה לא עמדו בטולרנס ±0.5מ״מ. הספק תיקן את תהליך הייצור ושלח אצוות חלופיות.",
    severity: "critical", assignedTo: "אלון גולדשטיין", daysOpen: 0, status: "resolved", financialImpact: 15000, createdAt: "2026-03-10",
  },
];

const fmt = (v: number) => new Intl.NumberFormat("he-IL").format(v);
const TH = "text-right text-[10px] font-semibold";

// ============================================================
// COMPONENT
// ============================================================
export default function ProcurementExceptions() {
  const [tab, setTab] = useState("active");

  const { data: apiData } = useQuery({
    queryKey: ["procurement-exceptions"],
    queryFn: async () => {
      const res = await authFetch(`${API}/procurement/exceptions`);
      if (!res.ok) throw new Error("Failed to fetch procurement exceptions");
      return res.json();
    },
  });

  const exceptions: ProcException[] = apiData?.exceptions ?? FALLBACK_EXCEPTIONS;

  const active   = exceptions.filter(e => e.status !== "resolved");
  const critical = active.filter(e => e.severity === "critical");
  const resolved = exceptions.filter(e => e.status === "resolved");
  const totalImpact = active.reduce((s, e) => s + e.financialImpact, 0);
  const avgDays  = active.length ? Math.round(active.reduce((s, e) => s + e.daysOpen, 0) / active.length * 10) / 10 : 0;

  const supplierCounts: Record<string, number> = {};
  active.forEach(e => { supplierCounts[e.supplier] = (supplierCounts[e.supplier] || 0) + 1; });
  const repeatOffenders = Object.values(supplierCounts).filter(c => c >= 2).length;

  const typeCounts: Record<ExceptionType, number> = { price_mismatch: 0, delivery_delay: 0, damaged_goods: 0, missing_items: 0, invoice_mismatch: 0, supplier_non_compliance: 0 };
  active.forEach(e => { typeCounts[e.type]++; });

  const supplierRanking = Object.entries(supplierCounts).sort((a, b) => b[1] - a[1]);

  const kpis = [
    { label: "חריגות פתוחות", value: active.length,           icon: AlertOctagon,  color: "text-blue-400",    bg: "bg-blue-500/10" },
    { label: "קריטיות",       value: critical.length,         icon: AlertTriangle, color: "text-red-400",     bg: "bg-red-500/10" },
    { label: "נפתרו החודש",   value: resolved.length,         icon: CheckCircle2,  color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "ימי טיפול ממוצע", value: avgDays,               icon: Clock,         color: "text-amber-400",   bg: "bg-amber-500/10" },
    { label: "השפעה כספית ₪",  value: fmt(totalImpact),       icon: DollarSign,    color: "text-orange-400",  bg: "bg-orange-500/10" },
    { label: "ספקים חוזרים",   value: repeatOffenders,         icon: RefreshCw,     color: "text-purple-400",  bg: "bg-purple-500/10" },
  ];

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <AlertOctagon className="h-7 w-7 text-primary" /> ניהול חריגות רכש
        </h1>
        <Badge variant="outline" className="text-xs text-muted-foreground">טכנו-כל עוזי — מתכת / אלומיניום / זכוכית</Badge>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {kpis.map(k => (
          <Card key={k.label} className={`${k.bg} border-slate-700 bg-slate-800/50`}>
            <CardContent className="pt-3 pb-2 text-center px-2">
              <k.icon className={`h-4 w-4 mx-auto ${k.color} mb-1`} />
              <p className="text-[9px] text-muted-foreground leading-tight">{k.label}</p>
              <p className={`text-lg font-bold font-mono ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="active" className="text-xs gap-1"><AlertOctagon className="h-3.5 w-3.5" /> פעילות ({active.length})</TabsTrigger>
          <TabsTrigger value="types" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> סוגים</TabsTrigger>
          <TabsTrigger value="suppliers" className="text-xs gap-1"><Users className="h-3.5 w-3.5" /> ספקים</TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1"><History className="h-3.5 w-3.5" /> היסטוריה</TabsTrigger>
        </TabsList>

        {/* Active Exceptions */}
        <TabsContent value="active" className="space-y-3 mt-4">
          {active.map(exc => {
            const sev = sevStyle[exc.severity];
            const cfg = typeConfig[exc.type];
            const Icon = cfg.icon;
            const st = statusStyle[exc.status];
            return (
              <Card key={exc.id} className={`${sev.bg} border ${sev.border} transition-all hover:brightness-110`}>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-start gap-4">
                  <div className="flex items-center gap-3 sm:flex-col sm:items-center sm:min-w-[70px]">
                    <div className={`p-2 rounded-lg ${sev.bg}`}><Icon className={`h-5 w-5 ${sev.text}`} /></div>
                    <Badge className={`${sev.bg} ${sev.text} border ${sev.border} text-[11px]`}>{sev.label}</Badge>
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-semibold leading-snug flex items-center gap-2">
                        <span className="font-mono text-primary">{exc.id}</span> {exc.description.slice(0, 60)}...
                      </h3>
                      <Badge className={`${st.cls} text-[10px] shrink-0`}>{st.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{exc.description}</p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Badge className={`${cfg.color} text-[10px]`}>{cfg.label}</Badge>
                      <Badge variant="outline" className="text-[10px]">{exc.supplier}</Badge>
                      <Badge variant="outline" className="text-[10px]">אחראי: {exc.assignedTo}</Badge>
                      <Badge variant="outline" className="text-[10px] font-mono">{exc.daysOpen} ימים פתוח</Badge>
                      <Badge variant="outline" className="text-[10px] font-mono text-orange-400">₪{fmt(exc.financialImpact)}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Types Breakdown */}
        <TabsContent value="types" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-400" /> חריגות לפי סוג
              </h3>
              <div className="space-y-4">
                {(Object.entries(typeCounts) as [ExceptionType, number][])
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, count]) => {
                    const cfg = typeConfig[type];
                    const Icon = cfg.icon;
                    const pct = active.length ? Math.round(count / active.length * 100) : 0;
                    const impact = active.filter(e => e.type === type).reduce((s, e) => s + e.financialImpact, 0);
                    return (
                      <div key={type} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <Badge className={`${cfg.color} text-[10px]`}>{cfg.label}</Badge>
                          </div>
                          <div className="flex items-center gap-3 text-muted-foreground">
                            <span className="font-mono">{count} חריגות ({pct}%)</span>
                            <span className="font-mono text-orange-400">₪{fmt(impact)}</span>
                          </div>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </div>
                    );
                  })}
              </div>
              <div className="mt-6 p-3 rounded-lg bg-slate-700/30 border border-slate-700/50">
                <h4 className="text-xs font-semibold mb-2 flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> מגמות</h4>
                <div className="grid grid-cols-3 gap-3 text-[10px] text-muted-foreground">
                  <div>עיכובי אספקה <span className="text-red-400 font-bold">+25%</span> לעומת חודש קודם</div>
                  <div>אי-התאמת מחיר <span className="text-amber-400 font-bold">ללא שינוי</span></div>
                  <div>אי-עמידה בתקן <span className="text-emerald-400 font-bold">-15%</span> לעומת חודש קודם</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Suppliers */}
        <TabsContent value="suppliers" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-400" /> חריגות לפי ספק
              </h3>
              <div className="space-y-3">
                {supplierRanking.map(([supplier, count], i) => {
                  const supplierExcs = active.filter(e => e.supplier === supplier);
                  const impact = supplierExcs.reduce((s, e) => s + e.financialImpact, 0);
                  const types = [...new Set(supplierExcs.map(e => e.type))];
                  const hasCritical = supplierExcs.some(e => e.severity === "critical");
                  return (
                    <div key={supplier} className={`flex items-center gap-4 p-3 rounded-lg border ${hasCritical ? "bg-red-500/5 border-red-500/20" : "bg-slate-700/30 border-slate-700/50"}`}>
                      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${hasCritical ? "bg-red-500/20 text-red-400" : "bg-slate-700 text-muted-foreground"}`}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-sm font-medium truncate">{supplier}</span>
                          <div className="flex items-center gap-2">
                            <span className={`font-mono text-sm font-bold ${count >= 3 ? "text-red-400" : count >= 2 ? "text-amber-400" : "text-emerald-400"}`}>{count} חריגות</span>
                            <span className="font-mono text-xs text-orange-400">₪{fmt(impact)}</span>
                          </div>
                        </div>
                        <Progress value={Math.min(count / active.length * 100 * 3, 100)} className="h-2 mb-1.5" />
                        <div className="flex flex-wrap gap-1.5">
                          {types.map(t => (
                            <Badge key={t} className={`${typeConfig[t].color} text-[9px]`}>{typeConfig[t].label}</Badge>
                          ))}
                          {hasCritical && <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[9px]">כולל קריטי</Badge>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>מס׳ חריגה</TableHead>
                    <TableHead className={TH}>סוג</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>תיאור</TableHead>
                    <TableHead className={TH}>חומרה</TableHead>
                    <TableHead className={TH}>אחראי</TableHead>
                    <TableHead className={TH}>השפעה ₪</TableHead>
                    <TableHead className={TH}>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolved.map(exc => {
                    const cfg = typeConfig[exc.type];
                    const sev = sevStyle[exc.severity];
                    return (
                      <TableRow key={exc.id} className="bg-emerald-500/5">
                        <TableCell className="font-mono text-[11px] font-bold text-primary">{exc.id}</TableCell>
                        <TableCell><Badge className={`${cfg.color} text-[10px]`}>{cfg.label}</Badge></TableCell>
                        <TableCell className="text-xs">{exc.supplier}</TableCell>
                        <TableCell className="text-[10px] text-muted-foreground max-w-[220px] truncate" title={exc.description}>{exc.description}</TableCell>
                        <TableCell><Badge className={`${sev.bg} ${sev.text} border ${sev.border} text-[10px]`}>{sev.label}</Badge></TableCell>
                        <TableCell className="text-xs">{exc.assignedTo}</TableCell>
                        <TableCell className="font-mono text-xs text-orange-400">₪{fmt(exc.financialImpact)}</TableCell>
                        <TableCell><Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]"><CheckCircle2 className="h-3 w-3 inline ml-1" />נסגר</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
