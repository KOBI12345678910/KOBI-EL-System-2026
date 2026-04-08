import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Shield, CheckCircle, XCircle, AlertTriangle, ClipboardCheck,
  Camera, TrendingUp, User, Calendar, Eye, Wrench, Clock
} from "lucide-react";

/* ── Static mock data ─────────────────────────────────────────── */

const qcChecklist = [
  { id: 1, item: "יישור אנכי (±2mm)", category: "מידות", critical: true },
  { id: 2, item: "יישור אופקי (±2mm)", category: "מידות", critical: true },
  { id: 3, item: "איטום היקפי תקין", category: "איטום", critical: true },
  { id: 4, item: "פעולת פתיחה/סגירה חלקה", category: "תפקוד", critical: true },
  { id: 5, item: "נעילה פועלת תקין", category: "תפקוד", critical: true },
  { id: 6, item: "זכוכית שלמה ללא שריטות", category: "חזותי", critical: true },
  { id: 7, item: "גימור צבע תקין", category: "חזותי", critical: false },
  { id: 8, item: "ניקיון אחרי התקנה", category: "גימור", critical: false },
  { id: 9, item: "אביזרי חומרה מותקנים", category: "חומרה", critical: true },
  { id: 10, item: "תפקוד תריס/גלילה", category: "תפקוד", critical: true },
  { id: 11, item: "ניקוז מי גשם תקין", category: "איטום", critical: true },
  { id: 12, item: "חיבור חשמלי (אם רלוונטי)", category: "חשמל", critical: false },
  { id: 13, item: "בטיחות — קצוות חדים", category: "בטיחות", critical: true },
  { id: 14, item: "התאמה לשרטוט", category: "מידות", critical: true },
  { id: 15, item: "מראה כללי", category: "חזותי", critical: false },
];

const qcResults = [
  { id: "INS-301", inspector: "יוסי כהן", date: "2026-04-07", score: 97, result: "עבר", failedItems: 0, corrective: "—" },
  { id: "INS-302", inspector: "שרה לוי", date: "2026-04-07", score: 92, result: "עבר", failedItems: 1, corrective: "גימור צבע — ליטוש מקומי" },
  { id: "INS-303", inspector: "דוד מזרחי", date: "2026-04-06", score: 54, result: "נכשל", failedItems: 5, corrective: "יישור מחדש + החלפת איטום" },
  { id: "INS-304", inspector: "נועה פרידמן", date: "2026-04-06", score: 95, result: "עבר", failedItems: 0, corrective: "—" },
  { id: "INS-305", inspector: "אלון גולדשטיין", date: "2026-04-05", score: 88, result: "עבר", failedItems: 1, corrective: "ניקיון חוזר" },
  { id: "INS-306", inspector: "רחל אברהם", date: "2026-04-05", score: 91, result: "עבר", failedItems: 1, corrective: "כיוון נעילה" },
  { id: "INS-307", inspector: "עומר חדד", date: "2026-04-04", score: 96, result: "עבר", failedItems: 0, corrective: "—" },
  { id: "INS-308", inspector: "תמר שלום", date: "2026-04-04", score: 62, result: "נכשל", failedItems: 4, corrective: "החלפת זכוכית + תיקון איטום" },
  { id: "INS-309", inspector: "איתן רוזנברג", date: "2026-04-03", score: 89, result: "עבר", failedItems: 1, corrective: "התאמת ניקוז" },
  { id: "INS-310", inspector: "מיכל ברק", date: "2026-04-03", score: 0, result: "ממתין", failedItems: 0, corrective: "—" },
];

const failedItemsDetail = [
  { inspection: "INS-303", item: "יישור אנכי (±2mm)", defectType: "סטייה 6mm ימינה", photos: 3, severity: "קריטי", action: "פירוק והתקנה מחדש", deadline: "2026-04-10" },
  { inspection: "INS-303", item: "איטום היקפי תקין", defectType: "פער באיטום תחתון", photos: 2, severity: "גבוה", action: "החלפת רצועת איטום", deadline: "2026-04-09" },
  { inspection: "INS-308", item: "זכוכית שלמה ללא שריטות", defectType: "שריטה 12 ס\"מ בפינה", photos: 4, severity: "קריטי", action: "החלפת יחידת זכוכית", deadline: "2026-04-11" },
  { inspection: "INS-308", item: "נעילה פועלת תקין", defectType: "ידית לא נועלת במצב סגור", photos: 1, severity: "גבוה", action: "החלפת מנגנון נעילה", deadline: "2026-04-09" },
  { inspection: "INS-303", item: "התאמה לשרטוט", defectType: "מיקום 3 ס\"מ גבוה מהתוכנית", photos: 2, severity: "בינוני", action: "התאמה עם קבלן ראשי", deadline: "2026-04-12" },
];

const trendData = [
  { week: "שבוע 10", inspections: 12, passRate: 75, avgScore: 84 },
  { week: "שבוע 11", inspections: 15, passRate: 80, avgScore: 87 },
  { week: "שבוע 12", inspections: 14, passRate: 79, avgScore: 86 },
  { week: "שבוע 13", inspections: 16, passRate: 81, avgScore: 88 },
  { week: "שבוע 14", inspections: 18, passRate: 83, avgScore: 91 },
];

/* ── Helpers ───────────────────────────────────────────────────── */

const resultColor: Record<string, string> = {
  "עבר": "bg-emerald-500/20 text-emerald-300",
  "נכשל": "bg-red-500/20 text-red-300",
  "ממתין": "bg-blue-500/20 text-blue-300",
};

const severityColor: Record<string, string> = {
  "קריטי": "bg-red-600/20 text-red-300",
  "גבוה": "bg-red-500/20 text-red-300",
  "בינוני": "bg-amber-500/20 text-amber-300",
  "נמוך": "bg-blue-500/20 text-blue-300",
};

const scoreColor = (score: number) =>
  score >= 85 ? "text-emerald-400" : score >= 70 ? "text-amber-400" : "text-red-400";

const progressColor = (score: number) =>
  score >= 85 ? "[&>div]:bg-emerald-500" : score >= 70 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500";

/* ── KPI summary ──────────────────────────────────────────────── */

const kpiData = [
  { label: "בדיקות שבוצעו", value: 18, icon: ClipboardCheck, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "עברו", value: 15, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "נכשלו", value: 2, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "ממתינות", value: 1, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "שיעור עמידה", value: "83%", icon: Shield, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "ממוצע ציון", value: "91%", icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
];

/* ── Component ────────────────────────────────────────────────── */

export default function InstallationQualityControl() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-7 w-7 text-primary" /> בקרת איכות התקנה
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — בדיקות QC | תבנית בדיקה | כשלים | מגמות
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-6 gap-3">
        {kpiData.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border-0 shadow-sm`}>
              <CardContent className="pt-3 pb-2 text-center px-2">
                <Icon className={`h-5 w-5 mx-auto ${kpi.color} mb-1`} />
                <p className="text-[10px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-2xl font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="inspections">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="inspections" className="text-xs gap-1"><Eye className="h-3.5 w-3.5" /> בדיקות</TabsTrigger>
          <TabsTrigger value="template" className="text-xs gap-1"><ClipboardCheck className="h-3.5 w-3.5" /> תבנית בדיקה</TabsTrigger>
          <TabsTrigger value="failures" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> כשלים</TabsTrigger>
          <TabsTrigger value="trends" className="text-xs gap-1"><TrendingUp className="h-3.5 w-3.5" /> מגמות</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: QC Results ─────────────────────────────────── */}
        <TabsContent value="inspections">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Eye className="h-4 w-4" /> תוצאות בדיקות QC אחרונות
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מזהה בדיקה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">בודק</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold w-28">ציון</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תוצאה</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">פריטים שנכשלו</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פעולה מתקנת</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qcResults.map((r) => (
                    <TableRow key={r.id} className="text-xs hover:bg-muted/20">
                      <TableCell className="font-mono font-semibold text-primary">{r.id}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1"><User className="h-3 w-3 text-muted-foreground" />{r.inspector}</span>
                      </TableCell>
                      <TableCell className="font-mono">{r.date}</TableCell>
                      <TableCell>
                        {r.result !== "ממתין" ? (
                          <div className="flex items-center gap-2">
                            <Progress value={r.score} className={`h-2 flex-1 ${progressColor(r.score)}`} />
                            <span className={`text-xs font-mono font-bold ${scoreColor(r.score)}`}>{r.score}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-[10px]">טרם נבדק</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] border-0 ${resultColor[r.result] || "bg-gray-500/20 text-gray-300"}`}>{r.result}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {r.failedItems > 0 ? (
                          <span className="text-red-400 font-bold font-mono">{r.failedItems}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">{r.corrective}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: QC Checklist Template ─────────────────────── */}
        <TabsContent value="template">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" /> תבנית בדיקת איכות התקנה — 15 פריטים
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-center text-[10px] font-semibold w-12">#</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פריט בדיקה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">קטגוריה</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">קריטי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qcChecklist.map((c) => (
                    <TableRow key={c.id} className="text-xs hover:bg-muted/20">
                      <TableCell className="text-center font-mono text-muted-foreground">{c.id}</TableCell>
                      <TableCell className="font-medium">{c.item}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[9px]">{c.category}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {c.critical ? (
                          <CheckCircle className="h-4 w-4 text-red-400 mx-auto" />
                        ) : (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Failed Items Detail ───────────────────────── */}
        <TabsContent value="failures">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" /> פירוט כשלים פתוחים
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">בדיקה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פריט</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג ליקוי</TableHead>
                    <TableHead className="text-center text-[10px] font-semibold">תמונות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">חומרה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">פעולה נדרשת</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">דדליין</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failedItemsDetail.map((f, i) => (
                    <TableRow key={i} className="text-xs hover:bg-muted/20">
                      <TableCell className="font-mono font-semibold text-primary">{f.inspection}</TableCell>
                      <TableCell className="font-medium">{f.item}</TableCell>
                      <TableCell className="text-muted-foreground">{f.defectType}</TableCell>
                      <TableCell className="text-center">
                        <span className="flex items-center justify-center gap-1">
                          <Camera className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono">{f.photos}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] border-0 ${severityColor[f.severity] || "bg-gray-500/20 text-gray-300"}`}>{f.severity}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1"><Wrench className="h-3 w-3 text-muted-foreground" />{f.action}</span>
                      </TableCell>
                      <TableCell className="font-mono">
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3 text-muted-foreground" />{f.deadline}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Trends ────────────────────────────────────── */}
        <TabsContent value="trends">
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> מגמת שיעור עמידה לפי שבוע
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-right text-[10px] font-semibold">שבוע</TableHead>
                      <TableHead className="text-center text-[10px] font-semibold">בדיקות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold w-28">שיעור עמידה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold w-28">ממוצע ציון</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trendData.map((t, i) => (
                      <TableRow key={i} className="text-xs hover:bg-muted/20">
                        <TableCell className="font-medium">{t.week}</TableCell>
                        <TableCell className="text-center font-mono">{t.inspections}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={t.passRate} className={`h-2 flex-1 ${progressColor(t.passRate)}`} />
                            <span className={`text-xs font-mono font-bold ${scoreColor(t.passRate)}`}>{t.passRate}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={t.avgScore} className={`h-2 flex-1 ${progressColor(t.avgScore)}`} />
                            <span className={`text-xs font-mono font-bold ${scoreColor(t.avgScore)}`}>{t.avgScore}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-400" /> ליקויים שכיחים — Top 5
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                {[
                  { item: "איטום היקפי תקין", count: 6, pct: 33 },
                  { item: "יישור אנכי (±2mm)", count: 4, pct: 22 },
                  { item: "זכוכית שלמה ללא שריטות", count: 3, pct: 17 },
                  { item: "נעילה פועלת תקין", count: 3, pct: 17 },
                  { item: "ניקוז מי גשם תקין", count: 2, pct: 11 },
                ].map((d, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">{d.item}</span>
                      <span className="font-mono text-muted-foreground">{d.count} ליקויים ({d.pct}%)</span>
                    </div>
                    <Progress value={d.pct} className={`h-2 ${i < 2 ? "[&>div]:bg-red-500" : i < 4 ? "[&>div]:bg-amber-500" : "[&>div]:bg-blue-500"}`} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}