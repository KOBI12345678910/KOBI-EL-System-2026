import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Factory, Gauge, Clock, AlertTriangle, CheckCircle, TrendingUp,
  TrendingDown, Wrench, Package, BarChart3, Target, Zap, Shield
} from "lucide-react";

const kpis = {
  oee: 82.5, oeeTarget: 85,
  availability: 92, performance: 89, quality: 99.2,
  activeOrders: 18, completedToday: 5, behindSchedule: 3,
  outputToday: 1250, outputTarget: 1400,
  defectRate: 0.8, scrapRate: 1.2,
  machineUptime: 94, maintenanceDue: 2,
  productionLines: 4, activelines: 4,
};

const activeOrders = [
  { wo: "WO-002456", product: "פרופיל Pro-X 100mm", customer: "קבוצת אלון", qty: 450, completed: 320, pct: 71, dueDate: "2026-04-12", status: "on_track", line: "קו A" },
  { wo: "WO-002457", product: "זכוכית מחוסמת 8mm", customer: "אמות השקעות", qty: 200, completed: 180, pct: 90, dueDate: "2026-04-10", status: "on_track", line: "קו B" },
  { wo: "WO-002458", product: "מסגרת ברזל מדגם B", customer: "שיכון ובינוי", qty: 80, completed: 25, pct: 31, dueDate: "2026-04-11", status: "behind", line: "קו C" },
  { wo: "WO-002459", product: "חלון אלומיניום דגם Premium", customer: "קבוצת אלון", qty: 120, completed: 0, pct: 0, dueDate: "2026-04-15", status: "pending", line: "קו A" },
  { wo: "WO-002460", product: "דלת הזזה 2.4m", customer: 'נדל"ן פלוס', qty: 30, completed: 12, pct: 40, dueDate: "2026-04-14", status: "on_track", line: "קו D" },
];

const productionLines = [
  { name: "קו A — אלומיניום", status: "running", oee: 88, currentWO: "WO-002456", speed: 95, quality: 99.5, uptime: 97 },
  { name: "קו B — זכוכית", status: "running", oee: 85, currentWO: "WO-002457", speed: 92, quality: 99.0, uptime: 95 },
  { name: "קו C — ברזל", status: "running", oee: 72, currentWO: "WO-002458", speed: 78, quality: 98.5, uptime: 88 },
  { name: "קו D — הרכבה", status: "running", oee: 82, currentWO: "WO-002460", speed: 88, quality: 99.8, uptime: 92 },
];

const qualityIssues = [
  { date: "2026-04-08", wo: "WO-002458", issue: "סטייה ממידות ±2mm", severity: "medium", action: "כיול מכונה + בדיקה חוזרת" },
  { date: "2026-04-07", wo: "WO-002455", issue: "שריטות על זכוכית — 3 יחידות", severity: "low", action: "החלפה + בדיקת תהליך אריזה" },
];

export default function ProductionCommandCenter() {
  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Factory className="h-7 w-7 text-primary" /> Production Command Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">OEE | קווי ייצור | הזמנות | איכות | תחזוקה</p>
        </div>
      </div>

      {/* OEE Gauge */}
      <div className="grid grid-cols-8 gap-2">
        {[
          { label: "OEE", value: `${kpis.oee}%`, target: `יעד: ${kpis.oeeTarget}%`, icon: Gauge, color: kpis.oee >= kpis.oeeTarget ? "text-emerald-600" : "text-amber-600", bg: kpis.oee >= kpis.oeeTarget ? "bg-emerald-50" : "bg-amber-50" },
          { label: "Availability", value: `${kpis.availability}%`, icon: CheckCircle, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Performance", value: `${kpis.performance}%`, icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Quality", value: `${kpis.quality}%`, icon: Shield, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "תפוקה היום", value: `${kpis.outputToday}/${kpis.outputTarget}`, icon: Package, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "מאחורי לו\"ז", value: String(kpis.behindSchedule), icon: AlertTriangle, color: kpis.behindSchedule > 0 ? "text-red-600" : "text-emerald-600", bg: kpis.behindSchedule > 0 ? "bg-red-50" : "bg-emerald-50" },
          { label: "Defect Rate", value: `${kpis.defectRate}%`, icon: Target, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "תחזוקה ממתינה", value: String(kpis.maintenanceDue), icon: Wrench, color: kpis.maintenanceDue > 0 ? "text-orange-600" : "text-emerald-600", bg: kpis.maintenanceDue > 0 ? "bg-orange-50" : "bg-emerald-50" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg}/40 border-0 shadow-sm`}>
              <CardContent className="pt-2 pb-1.5 text-center px-1">
                <Icon className={`h-3.5 w-3.5 mx-auto ${kpi.color} mb-0.5`} />
                <p className="text-[8px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-sm font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="lines">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="lines" className="text-xs gap-1"><Factory className="h-3.5 w-3.5" /> קווי ייצור</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs gap-1"><Package className="h-3.5 w-3.5" /> הזמנות ({activeOrders.length})</TabsTrigger>
          <TabsTrigger value="quality" className="text-xs gap-1"><Shield className="h-3.5 w-3.5" /> איכות</TabsTrigger>
          <TabsTrigger value="maintenance" className="text-xs gap-1"><Wrench className="h-3.5 w-3.5" /> תחזוקה</TabsTrigger>
        </TabsList>

        {/* Production Lines */}
        <TabsContent value="lines">
          <div className="grid grid-cols-2 gap-4">
            {productionLines.map((line, i) => (
              <Card key={i} className={line.oee < 80 ? "border-amber-200" : "border-emerald-200"}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{line.name}</CardTitle>
                    <Badge className={`text-[9px] ${line.status === "running" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-700"}`}>
                      {line.status === "running" ? "🟢 פעיל" : "🔴 מושבת"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-center">
                    <span className={`text-3xl font-bold font-mono ${line.oee >= 85 ? "text-emerald-600" : line.oee >= 75 ? "text-amber-600" : "text-red-600"}`}>
                      {line.oee}%
                    </span>
                    <span className="text-xs text-muted-foreground block">OEE</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div className="text-center">
                      <p className="text-muted-foreground">Speed</p>
                      <p className="font-mono font-bold">{line.speed}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">Quality</p>
                      <p className="font-mono font-bold">{line.quality}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-muted-foreground">Uptime</p>
                      <p className="font-mono font-bold">{line.uptime}%</p>
                    </div>
                  </div>
                  <div className="text-[9px] text-muted-foreground text-center">הזמנה: {line.currentWO}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Work Orders */}
        <TabsContent value="orders">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-right text-[10px] font-semibold">WO</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">מוצר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">לקוח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">כמות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold w-28">התקדמות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">קו</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">דדליין</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeOrders.map(wo => (
                    <TableRow key={wo.wo} className={wo.status === "behind" ? "bg-red-50/20" : ""}>
                      <TableCell className="font-mono text-[10px]">{wo.wo}</TableCell>
                      <TableCell className="text-xs font-medium">{wo.product}</TableCell>
                      <TableCell className="text-[10px]">{wo.customer}</TableCell>
                      <TableCell className="font-mono text-[10px]">{wo.completed}/{wo.qty}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Progress value={wo.pct} className={`h-2 w-16 ${wo.status === "behind" ? "[&>div]:bg-red-500" : ""}`} />
                          <span className="text-[9px] font-mono">{wo.pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px]">{wo.line}</TableCell>
                      <TableCell className="text-[10px]">{wo.dueDate}</TableCell>
                      <TableCell>
                        <Badge className={`text-[8px] ${wo.status === "on_track" ? "bg-emerald-100 text-emerald-700" : wo.status === "behind" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}`}>
                          {wo.status === "on_track" ? "✓ בזמן" : wo.status === "behind" ? "⚠️ מאחר" : "⏳ ממתין"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quality */}
        <TabsContent value="quality">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <Card className="border-emerald-200 bg-emerald-50/30">
              <CardContent className="pt-4 text-center">
                <p className="text-sm text-emerald-700">Quality Rate</p>
                <p className="text-3xl font-bold font-mono text-emerald-800">{kpis.quality}%</p>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50/30">
              <CardContent className="pt-4 text-center">
                <p className="text-sm text-amber-700">Defect Rate</p>
                <p className="text-3xl font-bold font-mono text-amber-800">{kpis.defectRate}%</p>
              </CardContent>
            </Card>
            <Card className="border-red-200 bg-red-50/30">
              <CardContent className="pt-4 text-center">
                <p className="text-sm text-red-700">Scrap Rate</p>
                <p className="text-3xl font-bold font-mono text-red-800">{kpis.scrapRate}%</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">בעיות איכות אחרונות</CardTitle></CardHeader>
            <CardContent>
              {qualityIssues.map((qi, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b last:border-0">
                  <AlertTriangle className={`h-4 w-4 ${qi.severity === "medium" ? "text-amber-500" : "text-blue-500"} shrink-0`} />
                  <div className="flex-1">
                    <p className="text-xs font-medium">{qi.wo} — {qi.issue}</p>
                    <p className="text-[10px] text-primary">{qi.action}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{qi.date}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Maintenance */}
        <TabsContent value="maintenance">
          <Card>
            <CardContent className="pt-4 text-center">
              <Wrench className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-lg font-bold">{kpis.maintenanceDue} משימות תחזוקה ממתינות</p>
              <p className="text-sm text-muted-foreground">Machine Uptime: {kpis.machineUptime}%</p>
              <p className="text-xs text-muted-foreground mt-2">לפירוט מלא ← CMMS Dashboard</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
