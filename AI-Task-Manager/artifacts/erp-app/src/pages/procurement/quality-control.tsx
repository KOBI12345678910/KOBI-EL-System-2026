import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck, ClipboardCheck, CheckCircle2, XCircle, Clock,
  AlertTriangle, RotateCcw, Search, BarChart3, Users, PackageX
} from "lucide-react";

const fmt = (v: number) => new Intl.NumberFormat("he-IL").format(v);

const FALLBACK_KPIS = [
  { label: "בדיקות היום", value: "24", sub: "פריטים נבדקו", icon: ClipboardCheck, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "אחוז עוברים", value: "91.7%", sub: "מתוך 24 בדיקות", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "פריטים נכשלו", value: "2", sub: "דורשים טיפול", icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "ממתין לבדיקה", value: "9", sub: "משלוחים", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "שיעור פגמים ספקים", value: "4.8%", sub: "ממוצע חודשי", icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "החזרות שנפתחו", value: "5", sub: "החודש", icon: RotateCcw, color: "text-purple-400", bg: "bg-purple-500/10" },
];

type DefectType = "סדק" | "שריטה" | "מידה לא תואמת" | "צבע שונה" | "חלק חסר" | "אריזה פגומה";

const defectColors: Record<DefectType, string> = {
  "סדק": "bg-red-500/20 text-red-400 border-red-500/30",
  "שריטה": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "מידה לא תואמת": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "צבע שונה": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "חלק חסר": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "אריזה פגומה": "bg-teal-500/20 text-teal-400 border-teal-500/30",
};

const FALLBACK_INSPECTIONS = [
  { id: "QC-001", po: "PO-000461", supplier: "Foshan Glass Co.", item: "זכוכית מחוסמת 10מ״מ", qtyInspected: 120, qtyPassed: 118, qtyFailed: 2, defect: "סדק" as DefectType, inspector: "יוסי כהן", result: "עבר" },
  { id: "QC-002", po: "PO-000462", supplier: "Schüco International", item: "פרופיל אלומיניום 6060", qtyInspected: 300, qtyPassed: 300, qtyFailed: 0, defect: null, inspector: "שרה לוי", result: "עבר" },
  { id: "QC-003", po: "PO-000463", supplier: "מפעלי ברזל השרון", item: "פלדה מגולוונת 2מ״מ", qtyInspected: 80, qtyPassed: 74, qtyFailed: 6, defect: "שריטה" as DefectType, inspector: "דוד מזרחי", result: "נכשל" },
  { id: "QC-004", po: "PO-000464", supplier: "Alumil SA", item: "ידיות נירוסטה L-200", qtyInspected: 500, qtyPassed: 495, qtyFailed: 5, defect: "חלק חסר" as DefectType, inspector: "רחל אברהם", result: "עבר" },
  { id: "QC-005", po: "PO-000465", supplier: "תעשיות זכוכית ים", item: "זכוכית שקופה 6מ״מ", qtyInspected: 200, qtyPassed: 200, qtyFailed: 0, defect: null, inspector: "אלון גולדשטיין", result: "עבר" },
  { id: "QC-006", po: "PO-000466", supplier: "אלום-טק בע״מ", item: "חיבורי פינה 90°", qtyInspected: 1000, qtyPassed: 985, qtyFailed: 15, defect: "מידה לא תואמת" as DefectType, inspector: "מיכל ברק", result: "נכשל" },
  { id: "QC-007", po: "PO-000467", supplier: "Foshan Glass Co.", item: "זכוכית למינציה 8מ״מ", qtyInspected: 60, qtyPassed: 59, qtyFailed: 1, defect: "צבע שונה" as DefectType, inspector: "עומר חדד", result: "עבר" },
  { id: "QC-008", po: "PO-000468", supplier: "מפעלי ברזל השרון", item: "ברזל בניין 12מ״מ", qtyInspected: 450, qtyPassed: 444, qtyFailed: 6, defect: "אריזה פגומה" as DefectType, inspector: "נועה פרידמן", result: "עבר" },
];

const FALLBACK_DEFECTS_BY_TYPE: { type: DefectType; count: number; pct: number }[] = [
  { type: "סדק", count: 14, pct: 25.5 },
  { type: "שריטה", count: 11, pct: 20.0 },
  { type: "מידה לא תואמת", count: 10, pct: 18.2 },
  { type: "אריזה פגומה", count: 9, pct: 16.4 },
  { type: "חלק חסר", count: 6, pct: 10.9 },
  { type: "צבע שונה", count: 5, pct: 9.1 },
];

const FALLBACK_DEFECTS_BY_SUPPLIER = [
  { supplier: "מפעלי ברזל השרון", defects: 18, inspected: 530, rate: 3.4, topDefect: "שריטה" as DefectType },
  { supplier: "אלום-טק בע״מ", defects: 15, inspected: 1000, rate: 1.5, topDefect: "מידה לא תואמת" as DefectType },
  { supplier: "Foshan Glass Co.", defects: 12, inspected: 380, rate: 3.2, topDefect: "סדק" as DefectType },
  { supplier: "Alumil SA", defects: 8, inspected: 700, rate: 1.1, topDefect: "חלק חסר" as DefectType },
  { supplier: "תעשיות זכוכית ים", defects: 4, inspected: 350, rate: 1.1, topDefect: "אריזה פגומה" as DefectType },
  { supplier: "Schüco International", defects: 2, inspected: 2300, rate: 0.1, topDefect: "שריטה" as DefectType },
];

const FALLBACK_SUPPLIER_RANKING = [
  { supplier: "Schüco International", score: 98.2, defectRate: 0.1, inspections: 2300, trend: "up" },
  { supplier: "Alumil SA", score: 95.8, defectRate: 1.1, inspections: 700, trend: "up" },
  { supplier: "תעשיות זכוכית ים", score: 94.5, defectRate: 1.1, inspections: 350, trend: "stable" },
  { supplier: "אלום-טק בע״מ", score: 91.2, defectRate: 1.5, inspections: 1000, trend: "down" },
  { supplier: "Foshan Glass Co.", score: 87.4, defectRate: 3.2, inspections: 380, trend: "down" },
  { supplier: "מפעלי ברזל השרון", score: 84.6, defectRate: 3.4, inspections: 530, trend: "down" },
];

const FALLBACK_RETURNS = [
  { id: "RMA-001", date: "2026-04-07", supplier: "מפעלי ברזל השרון", item: "פלדה מגולוונת 2מ״מ", qty: 6, reason: "שריטות עמוקות על 7.5% מהמשלוח", status: "נשלח לספק" },
  { id: "RMA-002", date: "2026-04-06", supplier: "אלום-טק בע״מ", item: "חיבורי פינה 90°", qty: 15, reason: "מידות חורגות מטולרנס ±0.5מ״מ", status: "ממתין לאישור" },
  { id: "RMA-003", date: "2026-04-05", supplier: "Foshan Glass Co.", item: "זכוכית מחוסמת 10מ״מ", qty: 2, reason: "סדקים מיקרוסקופיים בשולי הזכוכית", status: "זיכוי התקבל" },
  { id: "RMA-004", date: "2026-04-03", supplier: "Alumil SA", item: "ידיות נירוסטה L-200", qty: 5, reason: "ברגים חסרים בערכת ההרכבה", status: "חלופי בדרך" },
  { id: "RMA-005", date: "2026-04-01", supplier: "Foshan Glass Co.", item: "זכוכית למינציה 8מ״מ", qty: 1, reason: "גוון לא תואם לדגימה שאושרה", status: "בבירור" },
  { id: "RMA-006", date: "2026-03-29", supplier: "מפעלי ברזל השרון", item: "ברזל בניין 12מ״מ", qty: 6, reason: "אריזה פגומה גרמה לחמצון", status: "נשלח לספק" },
  { id: "RMA-007", date: "2026-03-27", supplier: "תעשיות זכוכית ים", item: "זכוכית שקופה 6מ״מ", qty: 3, reason: "אריזה לא מספקת — שברים במשלוח", status: "זיכוי התקבל" },
  { id: "RMA-008", date: "2026-03-25", supplier: "אלום-טק בע״מ", item: "חיבורי פינה 90°", qty: 8, reason: "מידה לא תואמת למפרט טכני", status: "ממתין לאישור" },
];

const resultBadge = (result: string) => {
  if (result === "עבר") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">עבר</Badge>;
  return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">נכשל</Badge>;
};

const returnStatusBadge = (status: string) => {
  if (status === "זיכוי התקבל") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">{status}</Badge>;
  if (status === "נשלח לספק" || status === "חלופי בדרך") return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-[10px]">{status}</Badge>;
  if (status === "ממתין לאישור") return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">{status}</Badge>;
  return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">{status}</Badge>;
};

const trendIcon = (trend: string) => {
  if (trend === "up") return <span className="text-emerald-400 text-[10px] font-bold">&#9650;</span>;
  if (trend === "down") return <span className="text-red-400 text-[10px] font-bold">&#9660;</span>;
  return <span className="text-gray-400 text-[10px] font-bold">&#9654;</span>;
};

const scoreColor = (score: number) => {
  if (score >= 95) return "text-emerald-400";
  if (score >= 90) return "text-blue-400";
  if (score >= 85) return "text-amber-400";
  return "text-red-400";
};

const TH = "text-right text-[10px] font-semibold";

export default function QualityControl() {
  const { data: qualitycontrolData } = useQuery({
    queryKey: ["quality-control"],
    queryFn: () => authFetch("/api/procurement/quality_control"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = qualitycontrolData ?? FALLBACK_KPIS;

  const [tab, setTab] = useState("inspections");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-7 w-7 text-primary" /> בקרת איכות רכש
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">ניהול בדיקות איכות, ניתוח פגמים, דירוג ספקים והחזרות — טכנו-כל עוזי</p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-6 gap-2">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border-slate-700 bg-slate-800/50`}>
              <CardContent className="pt-3 pb-2 text-center px-2">
                <Icon className={`h-4 w-4 mx-auto ${kpi.color} mb-1`} />
                <p className="text-[9px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                <p className="text-[8px] text-muted-foreground">{kpi.sub}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="inspections" className="text-xs gap-1"><Search className="h-3.5 w-3.5" /> בדיקות</TabsTrigger>
          <TabsTrigger value="defects" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> פגמים</TabsTrigger>
          <TabsTrigger value="suppliers" className="text-xs gap-1"><Users className="h-3.5 w-3.5" /> ספקים</TabsTrigger>
          <TabsTrigger value="returns" className="text-xs gap-1"><PackageX className="h-3.5 w-3.5" /> החזרות</TabsTrigger>
        </TabsList>

        {/* Inspections Tab */}
        <TabsContent value="inspections">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>מס׳ בדיקה</TableHead>
                    <TableHead className={TH}>הזמנה</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>פריט</TableHead>
                    <TableHead className={TH}>נבדקו</TableHead>
                    <TableHead className={TH}>עברו</TableHead>
                    <TableHead className={TH}>נכשלו</TableHead>
                    <TableHead className={TH}>סוג פגם</TableHead>
                    <TableHead className={TH}>בודק</TableHead>
                    <TableHead className={TH}>תוצאה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspections.map((row) => (
                    <TableRow key={row.id} className={row.result === "נכשל" ? "bg-red-500/5" : ""}>
                      <TableCell className="font-mono text-[11px] font-bold text-primary">{row.id}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.po}</TableCell>
                      <TableCell className="text-xs">{row.supplier}</TableCell>
                      <TableCell className="text-xs">{row.item}</TableCell>
                      <TableCell className="font-mono text-xs">{fmt(row.qtyInspected)}</TableCell>
                      <TableCell className="font-mono text-xs text-emerald-400">{fmt(row.qtyPassed)}</TableCell>
                      <TableCell className={`font-mono text-xs font-bold ${row.qtyFailed > 0 ? "text-red-400" : "text-gray-500"}`}>{fmt(row.qtyFailed)}</TableCell>
                      <TableCell>
                        {row.defect ? (
                          <Badge className={`${defectColors[row.defect]} text-[10px]`}>{row.defect}</Badge>
                        ) : (
                          <span className="text-gray-500 text-[10px]">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{row.inspector}</TableCell>
                      <TableCell>{resultBadge(row.result)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Defects Analysis Tab */}
        <TabsContent value="defects">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Type */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-400" /> פגמים לפי סוג
                </h3>
                <div className="space-y-3">
                  {defectsByType.map((d) => (
                    <div key={d.type} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Badge className={`${defectColors[d.type]} text-[10px]`}>{d.type}</Badge>
                        </div>
                        <span className="text-muted-foreground font-mono">{d.count} ({d.pct}%)</span>
                      </div>
                      <Progress value={d.pct} className="h-2" />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* By Supplier */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4 text-purple-400" /> פגמים לפי ספק
                </h3>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className={TH}>ספק</TableHead>
                      <TableHead className={TH}>פגמים</TableHead>
                      <TableHead className={TH}>נבדקו</TableHead>
                      <TableHead className={TH}>שיעור %</TableHead>
                      <TableHead className={TH}>פגם עיקרי</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {defectsBySupplier.map((row) => (
                      <TableRow key={row.supplier}>
                        <TableCell className="text-xs font-medium">{row.supplier}</TableCell>
                        <TableCell className="font-mono text-xs font-bold text-red-400">{row.defects}</TableCell>
                        <TableCell className="font-mono text-xs">{fmt(row.inspected)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Progress value={row.rate * 10} className="h-1.5 w-10" />
                            <span className={`font-mono text-[11px] font-bold ${row.rate > 3 ? "text-red-400" : row.rate > 1 ? "text-amber-400" : "text-emerald-400"}`}>
                              {row.rate}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`${defectColors[row.topDefect]} text-[10px]`}>{row.topDefect}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Supplier Ranking Tab */}
        <TabsContent value="suppliers">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" /> דירוג איכות ספקים
              </h3>
              <div className="space-y-4">
                {supplierRanking.map((s, i) => (
                  <div key={s.supplier} className="flex items-center gap-4 p-3 rounded-lg bg-slate-700/30 border border-slate-700/50">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-sm text-muted-foreground">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium truncate">{s.supplier}</span>
                        <div className="flex items-center gap-2">
                          {trendIcon(s.trend)}
                          <span className={`font-mono text-sm font-bold ${scoreColor(s.score)}`}>{s.score}%</span>
                        </div>
                      </div>
                      <Progress value={s.score} className="h-2 mb-1.5" />
                      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                        <span>שיעור פגמים: <span className={`font-mono font-bold ${s.defectRate > 3 ? "text-red-400" : s.defectRate > 1 ? "text-amber-400" : "text-emerald-400"}`}>{s.defectRate}%</span></span>
                        <span>בדיקות: <span className="font-mono font-bold text-foreground">{fmt(s.inspections)}</span></span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Returns Tab */}
        <TabsContent value="returns">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className={TH}>מס׳ החזרה</TableHead>
                    <TableHead className={TH}>תאריך</TableHead>
                    <TableHead className={TH}>ספק</TableHead>
                    <TableHead className={TH}>פריט</TableHead>
                    <TableHead className={TH}>כמות</TableHead>
                    <TableHead className={TH}>סיבה</TableHead>
                    <TableHead className={TH}>סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {returns.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-[11px] font-bold text-primary">{row.id}</TableCell>
                      <TableCell className="font-mono text-[11px]">{row.date}</TableCell>
                      <TableCell className="text-xs font-medium">{row.supplier}</TableCell>
                      <TableCell className="text-xs">{row.item}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-red-400">{row.qty}</TableCell>
                      <TableCell className="text-[10px] text-muted-foreground max-w-[200px] truncate" title={row.reason}>{row.reason}</TableCell>
                      <TableCell>{returnStatusBadge(row.status)}</TableCell>
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
