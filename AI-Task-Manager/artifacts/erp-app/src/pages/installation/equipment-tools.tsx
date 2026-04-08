import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Wrench, Package, ShieldCheck, AlertTriangle, CalendarDays,
  Users, Gauge, MapPin, DollarSign, Clock, CheckCircle, Ruler
} from "lucide-react";

/* ── Static mock data ─────────────────────────────────────────── */

const equipment = [
  { id: "EQ-001", name: "מקדחה תעשייתית Hilti TE-70", category: "כלי חשמלי", location: "באתר INS-001", status: "תקין", lastCalibration: "2026-02-15", assignee: "צוות אלפא — יוסי כהן", value: 8500 },
  { id: "EQ-002", name: "פיגום 6m אלומיניום מודולרי", category: "הרמה", location: "באתר INS-005", status: "תקין", lastCalibration: "—", assignee: "צוות דלתא — מיכל ברק", value: 12000 },
  { id: "EQ-003", name: "מנוף זעיר 500 ק\"ג", category: "הרמה", location: "מחסן ראשי", status: "דורש תחזוקה", lastCalibration: "2025-11-20", assignee: "—", value: 35000 },
  { id: "EQ-004", name: "מכשיר מדידה לייזר Leica DISTO", category: "מדידה", location: "ברכב 2847", status: "דורש כיול", lastCalibration: "2025-08-10", assignee: "שרה לוי", value: 4200 },
  { id: "EQ-005", name: "אקדח איטום סיליקון פנאומטי", category: "כללי", location: "באתר INS-001", status: "תקין", lastCalibration: "—", assignee: "צוות אלפא — דוד מזרחי", value: 1800 },
  { id: "EQ-006", name: "מפתח אימפקט חשמלי 1/2\"", category: "כלי חשמלי", location: "מחסן ראשי", status: "תקין", lastCalibration: "—", assignee: "—", value: 3200 },
  { id: "EQ-007", name: "סולם טלסקופי 4.2m", category: "בטיחות", location: "ברכב 3011", status: "תקין", lastCalibration: "—", assignee: "צוות גמא — איתן רוזנברג", value: 2400 },
  { id: "EQ-008", name: "ערכת ריתוך TIG/MIG 250A", category: "כלי חשמלי", location: "מחסן ראשי", status: "בתיקון", lastCalibration: "2026-01-05", assignee: "—", value: 18500 },
  { id: "EQ-009", name: "מברגה חשמלית Makita 18V", category: "כלי חשמלי", location: "באתר INS-007", status: "תקין", lastCalibration: "—", assignee: "צוות גמא — תמר שלום", value: 2100 },
  { id: "EQ-010", name: "מסור מתכת דו-צדדי DeWalt", category: "כלי חשמלי", location: "מחסן ראשי", status: "תקין", lastCalibration: "—", assignee: "—", value: 5600 },
  { id: "EQ-011", name: "פלס לייזר סיבובי Bosch GRL", category: "מדידה", location: "ברכב 2847", status: "דורש כיול", lastCalibration: "2025-09-22", assignee: "שרה לוי", value: 6800 },
  { id: "EQ-012", name: "מלחציים הידראוליים 12 טון", category: "כללי", location: "באתר INS-005", status: "תקין", lastCalibration: "—", assignee: "צוות דלתא — אורי דהן", value: 4500 },
  { id: "EQ-013", name: "גלאי מתכות / כבלים Fluke", category: "מדידה", location: "מחסן ראשי", status: "דורש כיול", lastCalibration: "2025-07-14", assignee: "—", value: 3800 },
  { id: "EQ-014", name: "משאבת ואקום לוחות זכוכית", category: "הרמה", location: "באתר INS-001", status: "דורש תחזוקה", lastCalibration: "2026-03-01", assignee: "צוות אלפא — אלון גולדשטיין", value: 22000 },
  { id: "EQ-015", name: "רתמת בטיחות + קו חיים 15m", category: "בטיחות", location: "מחסן ראשי", status: "דורש תחזוקה", lastCalibration: "2025-12-10", assignee: "—", value: 3500 },
];

const maintenanceSchedule = [
  { eqId: "EQ-003", name: "מנוף זעיר 500 ק\"ג", type: "שמן + בדיקת כבלים", dueDate: "2026-04-10", urgency: "גבוהה", assignedTo: "ניר אשכנזי" },
  { eqId: "EQ-004", name: "מכשיר מדידה לייזר Leica DISTO", type: "כיול מעבדתי", dueDate: "2026-04-12", urgency: "בינונית", assignedTo: "מעבדת כיול חיצונית" },
  { eqId: "EQ-008", name: "ערכת ריתוך TIG/MIG 250A", type: "בדיקה חשמלית + החלפת ראש", dueDate: "2026-04-14", urgency: "גבוהה", assignedTo: "ספק — ריתוך בע\"מ" },
  { eqId: "EQ-011", name: "פלס לייזר סיבובי Bosch GRL", type: "כיול מעבדתי", dueDate: "2026-04-15", urgency: "בינונית", assignedTo: "מעבדת כיול חיצונית" },
  { eqId: "EQ-014", name: "משאבת ואקום לוחות זכוכית", type: "בדיקת אטימות + שמן", dueDate: "2026-04-09", urgency: "דחופה", assignedTo: "גל שפירא" },
  { eqId: "EQ-015", name: "רתמת בטיחות + קו חיים 15m", type: "בדיקה שנתית תקן", dueDate: "2026-04-11", urgency: "גבוהה", assignedTo: "בודק מוסמך — SafetyPro" },
];

const teamAllocations = [
  { team: "צוות אלפא", site: "INS-001 — מגדלי הים, חיפה", items: ["EQ-001 מקדחה תעשייתית", "EQ-005 אקדח איטום", "EQ-014 משאבת ואקום זכוכית"], count: 3 },
  { team: "צוות בטא", site: "לא משובץ — זמין", items: ["—"], count: 0 },
  { team: "צוות גמא", site: "INS-007 — בניין מגורים, נתניה", items: ["EQ-009 מברגה חשמלית", "EQ-007 סולם טלסקופי"], count: 2 },
  { team: "צוות דלתא", site: "INS-005 — קניון הדרום, באר שבע", items: ["EQ-002 פיגום 6m", "EQ-012 מלחציים הידראוליים"], count: 2 },
  { team: "צוות אפסילון", site: "לא משובץ — זמין", items: ["—"], count: 0 },
];

const costSummary = {
  totalValue: equipment.reduce((s, e) => s + e.value, 0),
  maintenanceCostMonth: 8750,
  depreciationMonth: 4200,
  insuranceCostMonth: 1650,
  purchasesThisQuarter: 26300,
};

/* ── Helpers ───────────────────────────────────────────────────── */

const statusColor: Record<string, string> = {
  "תקין": "bg-emerald-500/20 text-emerald-300",
  "דורש תחזוקה": "bg-amber-500/20 text-amber-300",
  "בתיקון": "bg-red-500/20 text-red-300",
  "דורש כיול": "bg-blue-500/20 text-blue-300",
};

const urgencyColor: Record<string, string> = {
  "דחופה": "bg-red-600/20 text-red-300",
  "גבוהה": "bg-red-500/20 text-red-300",
  "בינונית": "bg-amber-500/20 text-amber-300",
  "נמוכה": "bg-blue-500/20 text-blue-300",
};

const categoryColor: Record<string, string> = {
  "כלי חשמלי": "bg-violet-500/20 text-violet-300",
  "הרמה": "bg-orange-500/20 text-orange-300",
  "מדידה": "bg-cyan-500/20 text-cyan-300",
  "בטיחות": "bg-red-500/20 text-red-300",
  "כללי": "bg-gray-500/20 text-gray-300",
};

const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");

/* ── KPI data ─────────────────────────────────────────────────── */

const kpiData = [
  { label: "סה\"כ פריטי ציוד", value: 45, icon: Package, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "זמינים", value: 32, icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "בשימוש", value: 10, icon: Users, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "בתחזוקה", value: 3, icon: Wrench, color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "דורשי כיול", value: 4, icon: Gauge, color: "text-cyan-400", bg: "bg-cyan-500/10" },
];

/* ── Component ────────────────────────────────────────────────── */

export default function EquipmentTools() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Wrench className="h-7 w-7 text-primary" /> ציוד וכלי עבודה
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — מלאי ציוד | תחזוקה | הקצאות צוותים | עלויות
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-3">
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
      <Tabs defaultValue="inventory">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="inventory" className="text-xs gap-1"><Package className="h-3.5 w-3.5" /> מלאי ציוד</TabsTrigger>
          <TabsTrigger value="maintenance" className="text-xs gap-1"><Wrench className="h-3.5 w-3.5" /> תחזוקה</TabsTrigger>
          <TabsTrigger value="allocation" className="text-xs gap-1"><Users className="h-3.5 w-3.5" /> הקצאות</TabsTrigger>
          <TabsTrigger value="costs" className="text-xs gap-1"><DollarSign className="h-3.5 w-3.5" /> עלויות</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Equipment Inventory ──────────────────────── */}
        <TabsContent value="inventory">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מזהה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שם הציוד</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">קטגוריה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מיקום נוכחי</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מצב</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">כיול אחרון</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">צוות / אחראי</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ערך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipment.map((eq) => (
                    <TableRow key={eq.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{eq.id}</TableCell>
                      <TableCell>{eq.name}</TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${categoryColor[eq.category] || "bg-gray-500/20 text-gray-300"}`}>{eq.category}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{eq.location}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${statusColor[eq.status] || "bg-gray-500/20 text-gray-300"}`}>{eq.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">{eq.lastCalibration}</TableCell>
                      <TableCell className="text-muted-foreground">{eq.assignee}</TableCell>
                      <TableCell className="font-mono font-semibold">{fmt(eq.value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Maintenance Schedule ─────────────────────── */}
        <TabsContent value="maintenance">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wrench className="h-4 w-4 text-orange-400" /> לוח תחזוקה קרוב
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">מזהה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">שם הציוד</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סוג תחזוקה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">תאריך יעד</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">דחיפות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אחראי ביצוע</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {maintenanceSchedule.map((m, i) => (
                    <TableRow key={i} className="text-xs">
                      <TableCell className="font-mono font-semibold text-primary">{m.eqId}</TableCell>
                      <TableCell>{m.name}</TableCell>
                      <TableCell className="text-muted-foreground">{m.type}</TableCell>
                      <TableCell className="font-mono">
                        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{m.dueDate}</span>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${urgencyColor[m.urgency] || "bg-gray-500/20 text-gray-300"}`}>{m.urgency}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.assignedTo}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 3: Team Allocation ──────────────────────────── */}
        <TabsContent value="allocation">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-400" /> הקצאת ציוד לצוותים — היום
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">צוות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">אתר / סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">ציוד מוקצה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">כמות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamAllocations.map((t) => (
                    <TableRow key={t.team} className="text-xs">
                      <TableCell className="font-semibold">{t.team}</TableCell>
                      <TableCell className="text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{t.site}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {t.items.map((item, j) => (
                            <Badge key={j} variant="outline" className="text-[9px]">{item}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono font-semibold text-center">
                        {t.count > 0 ? (
                          <Badge className="bg-blue-500/20 text-blue-300 text-[9px]">{t.count}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 4: Costs ────────────────────────────────────── */}
        <TabsContent value="costs">
          <div className="grid grid-cols-3 gap-4">
            <Card className="col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-emerald-400" /> סיכום עלויות ציוד
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-4">
                  <div className="rounded-lg bg-blue-500/10 p-4 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">שווי כולל ציוד</p>
                    <p className="text-xl font-bold font-mono text-blue-400">{fmt(costSummary.totalValue)}</p>
                  </div>
                  <div className="rounded-lg bg-orange-500/10 p-4 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">עלות תחזוקה חודשית</p>
                    <p className="text-xl font-bold font-mono text-orange-400">{fmt(costSummary.maintenanceCostMonth)}</p>
                  </div>
                  <div className="rounded-lg bg-amber-500/10 p-4 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">פחת חודשי</p>
                    <p className="text-xl font-bold font-mono text-amber-400">{fmt(costSummary.depreciationMonth)}</p>
                  </div>
                  <div className="rounded-lg bg-violet-500/10 p-4 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">ביטוח ציוד חודשי</p>
                    <p className="text-xl font-bold font-mono text-violet-400">{fmt(costSummary.insuranceCostMonth)}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-500/10 p-4 text-center">
                    <p className="text-[10px] text-muted-foreground mb-1">רכישות רבעון נוכחי</p>
                    <p className="text-xl font-bold font-mono text-emerald-400">{fmt(costSummary.purchasesThisQuarter)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-cyan-400" /> פירוט ערך לפי קטגוריה
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-right text-[10px] font-semibold">קטגוריה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">כמות פריטים</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">שווי כולל</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold w-48">חלק יחסי</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {["כלי חשמלי", "הרמה", "מדידה", "בטיחות", "כללי"].map((cat) => {
                      const items = equipment.filter((e) => e.category === cat);
                      const total = items.reduce((s, e) => s + e.value, 0);
                      const pct = Math.round((total / costSummary.totalValue) * 100);
                      return (
                        <TableRow key={cat} className="text-xs">
                          <TableCell>
                            <Badge className={`text-[9px] ${categoryColor[cat]}`}>{cat}</Badge>
                          </TableCell>
                          <TableCell className="font-mono">{items.length}</TableCell>
                          <TableCell className="font-mono font-semibold">{fmt(total)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="h-1.5 flex-1" />
                              <span className="text-[10px] font-mono w-8 text-left">{pct}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
