import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  ClipboardList, Package, CheckCircle2, Clock, ShieldCheck, AlertTriangle,
  Search, Plus, Download, Filter, ArrowUpDown, Wrench, Users, BarChart3, Calendar
} from "lucide-react";

const statusColors: Record<string, string> = {
  "בתור": "bg-slate-500/20 text-slate-300 border-slate-500/30",
  "בתהליך": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "בבקרת איכות": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "הושלם": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

const priorityColors: Record<string, string> = {
  "דחוף": "bg-red-500/20 text-red-300 border-red-500/30",
  "גבוה": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "רגיל": "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "נמוך": "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

const assemblyOrders = [
  { id: "ASM-2026-001", product: "חלון דו-כנפי אלומיניום 180x150", qty: 24, station: "תחנה 1", operator: "יוסי כהן", start: "08/04/2026", end: "10/04/2026", status: "בתהליך", priority: "דחוף" },
  { id: "ASM-2026-002", product: "דלת כניסה מעוצבת PVC", qty: 12, station: "תחנה 3", operator: "אבי לוי", start: "08/04/2026", end: "11/04/2026", status: "בתהליך", priority: "גבוה" },
  { id: "ASM-2026-003", product: "קיר מסך זכוכית כפולה", qty: 8, station: "תחנה 5", operator: "מיכאל ברק", start: "07/04/2026", end: "12/04/2026", status: "בבקרת איכות", priority: "דחוף" },
  { id: "ASM-2026-004", product: "חלון הזזה תרמי 200x120", qty: 36, station: "תחנה 2", operator: "דני שמעון", start: "09/04/2026", end: "13/04/2026", status: "בתור", priority: "רגיל" },
  { id: "ASM-2026-005", product: "דלת מרפסת דו-כנפית", qty: 18, station: "תחנה 4", operator: "רון אביב", start: "07/04/2026", end: "09/04/2026", status: "הושלם", priority: "גבוה" },
  { id: "ASM-2026-006", product: "ויטרינה חזית מסחרית", qty: 6, station: "תחנה 6", operator: "עמית דגן", start: "08/04/2026", end: "14/04/2026", status: "בתהליך", priority: "דחוף" },
  { id: "ASM-2026-007", product: "חלון ציר עליון 60x80", qty: 48, station: "תחנה 1", operator: "יוסי כהן", start: "10/04/2026", end: "12/04/2026", status: "בתור", priority: "נמוך" },
  { id: "ASM-2026-008", product: "דלת פנים מלבנית PVC", qty: 30, station: "תחנה 3", operator: "אבי לוי", start: "09/04/2026", end: "11/04/2026", status: "בתור", priority: "רגיל" },
  { id: "ASM-2026-009", product: "קיר מסך פרופיל מבודד", qty: 4, station: "תחנה 5", operator: "מיכאל ברק", start: "06/04/2026", end: "10/04/2026", status: "הושלם", priority: "גבוה" },
  { id: "ASM-2026-010", product: "חלון דריי-קיפ 100x140", qty: 20, station: "תחנה 2", operator: "דני שמעון", start: "08/04/2026", end: "10/04/2026", status: "בבקרת איכות", priority: "רגיל" },
  { id: "ASM-2026-011", product: "מערכת דלת אוטומטית", qty: 3, station: "תחנה 6", operator: "עמית דגן", start: "05/04/2026", end: "09/04/2026", status: "הושלם", priority: "דחוף" },
  { id: "ASM-2026-012", product: "חלון קבוע תרמי 240x180", qty: 15, station: "תחנה 4", operator: "רון אביב", start: "09/04/2026", end: "13/04/2026", status: "בתהליך", priority: "גבוה" },
];

const stations = [
  { name: "תחנה 1 - הרכבת חלונות", capacity: 40, currentLoad: 32, efficiency: 94, operator: "יוסי כהן", status: "פעיל", type: "חלונות" },
  { name: "תחנה 2 - הרכבה תרמית", capacity: 30, currentLoad: 26, efficiency: 88, operator: "דני שמעון", status: "פעיל", type: "בידוד תרמי" },
  { name: "תחנה 3 - הרכבת דלתות", capacity: 25, currentLoad: 22, efficiency: 91, operator: "אבי לוי", status: "פעיל", type: "דלתות" },
  { name: "תחנה 4 - הרכבת מרפסות", capacity: 20, currentLoad: 15, efficiency: 86, operator: "רון אביב", status: "פעיל", type: "דלתות מרפסת" },
  { name: "תחנה 5 - קירות מסך", capacity: 15, currentLoad: 12, efficiency: 92, operator: "מיכאל ברק", status: "פעיל", type: "קירות מסך" },
  { name: "תחנה 6 - ויטרינות ומסחרי", capacity: 10, currentLoad: 6, efficiency: 85, operator: "עמית דגן", status: "תחזוקה", type: "מסחרי" },
];

const qualityResults = [
  { order: "ASM-2026-003", product: "קיר מסך זכוכית כפולה", inspector: "שרון מזרחי", date: "08/04/2026", result: "עבר", score: 96, notes: "איטום מצוין, יישור מושלם" },
  { order: "ASM-2026-010", product: "חלון דריי-קיפ 100x140", inspector: "שרון מזרחי", date: "08/04/2026", result: "עבר בתנאי", score: 82, notes: "דרוש כיוונון ציר עליון" },
  { order: "ASM-2026-005", product: "דלת מרפסת דו-כנפית", inspector: "נועה רביבו", date: "07/04/2026", result: "עבר", score: 98, notes: "איכות גבוהה, אין ליקויים" },
  { order: "ASM-2026-009", product: "קיר מסך פרופיל מבודד", inspector: "נועה רביבו", date: "06/04/2026", result: "עבר", score: 94, notes: "נדרש שיפור קל בגימור" },
  { order: "ASM-2026-011", product: "מערכת דלת אוטומטית", inspector: "שרון מזרחי", date: "05/04/2026", result: "נכשל", score: 62, notes: "חיישן תנועה לא תקין - הוחזר לתיקון" },
];

const defectTypes = [
  { type: "יישור לא מדויק", count: 7, pct: 28 },
  { type: "פגם באיטום", count: 5, pct: 20 },
  { type: "שריטות בזכוכית", count: 4, pct: 16 },
  { type: "תקלת צירים", count: 4, pct: 16 },
  { type: "פגם בפרופיל", count: 3, pct: 12 },
  { type: "בעיית גימור", count: 2, pct: 8 },
];

const dailySchedule = [
  { time: "06:00-08:00", station: "תחנה 1", task: "הרכבת חלונות דו-כנפיים - ASM-001", workers: 3, status: "הושלם" },
  { time: "06:00-10:00", station: "תחנה 5", task: "הרכבת קיר מסך - ASM-003", workers: 4, status: "בתהליך" },
  { time: "08:00-12:00", station: "תחנה 3", task: "הרכבת דלתות כניסה - ASM-002", workers: 2, status: "בתהליך" },
  { time: "08:00-14:00", station: "תחנה 6", task: "הרכבת ויטרינה מסחרית - ASM-006", workers: 3, status: "בתהליך" },
  { time: "10:00-14:00", station: "תחנה 2", task: "הרכבה תרמית חלונות - ASM-004", workers: 2, status: "ממתין" },
  { time: "12:00-16:00", station: "תחנה 4", task: "הרכבת חלונות קבועים - ASM-012", workers: 2, status: "ממתין" },
  { time: "14:00-16:00", station: "תחנה 1", task: "הרכבת חלונות ציר - ASM-007", workers: 3, status: "ממתין" },
];

const resourceAllocation = [
  { resource: "צוות הרכבה א'", available: 6, assigned: 5, utilization: 83 },
  { resource: "צוות הרכבה ב'", available: 5, assigned: 4, utilization: 80 },
  { resource: "צוות קירות מסך", available: 4, assigned: 4, utilization: 100 },
  { resource: "צוות בקרת איכות", available: 3, assigned: 2, utilization: 67 },
  { resource: "ציוד הרמה כבד", available: 2, assigned: 1, utilization: 50 },
];

const kpis = [
  { label: "הזמנות פעילות", value: "9", icon: ClipboardList, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "יחידות להיום", value: "72", icon: Package, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "אחוז השלמה", value: "87.5%", icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
  { label: "זמן הרכבה ממוצע", value: "3.2 שעות", icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "עוברים בקרת איכות", value: "94.2%", icon: ShieldCheck, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "הזמנות באיחור", value: "2", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
];

export default function FabAssemblyOrders() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("orders");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredOrders = assemblyOrders.filter((o) => {
    const matchSearch = !search || o.id.includes(search) || o.product.includes(search) || o.operator.includes(search);
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">הזמנות הרכבה</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול הרכבת חלונות, דלתות וקירות מסך</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
          <Button size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />הזמנה חדשה</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="orders" className="gap-1.5"><ClipboardList className="w-4 h-4" />הזמנות</TabsTrigger>
          <TabsTrigger value="stations" className="gap-1.5"><Wrench className="w-4 h-4" />תחנות</TabsTrigger>
          <TabsTrigger value="quality" className="gap-1.5"><ShieldCheck className="w-4 h-4" />בקרת איכות</TabsTrigger>
          <TabsTrigger value="scheduling" className="gap-1.5"><Calendar className="w-4 h-4" />תזמון</TabsTrigger>
        </TabsList>

        {/* Tab 1: Orders */}
        <TabsContent value="orders" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-lg">רשימת הזמנות הרכבה</CardTitle>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="חיפוש הזמנה..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 w-64 bg-background/50" />
                  </div>
                  <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                    <option value="all">כל הסטטוסים</option>
                    <option value="בתור">בתור</option>
                    <option value="בתהליך">בתהליך</option>
                    <option value="בבקרת איכות">בבקרת איכות</option>
                    <option value="הושלם">הושלם</option>
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מספר הזמנה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">כמות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תחנה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מפעיל</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">התחלה</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סיום</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">עדיפות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                        <td className="p-3 font-mono text-foreground font-medium">{order.id}</td>
                        <td className="p-3 text-foreground">{order.product}</td>
                        <td className="p-3 text-center text-foreground font-medium">{order.qty}</td>
                        <td className="p-3 text-foreground">{order.station}</td>
                        <td className="p-3 text-foreground">{order.operator}</td>
                        <td className="p-3 text-center text-muted-foreground">{order.start}</td>
                        <td className="p-3 text-center text-muted-foreground">{order.end}</td>
                        <td className="p-3 text-center"><Badge className={statusColors[order.status]}>{order.status}</Badge></td>
                        <td className="p-3 text-center"><Badge variant="outline" className={priorityColors[order.priority]}>{order.priority}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground pt-3 border-t border-border/30">
                <span>מציג {filteredOrders.length} מתוך {assemblyOrders.length} הזמנות</span>
                <div className="flex gap-3">
                  {Object.entries(statusColors).map(([s, c]) => (
                    <span key={s} className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${c.split(" ")[0]}`} />{s}: {assemblyOrders.filter((o) => o.status === s).length}</span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Stations */}
        <TabsContent value="stations" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stations.map((st) => (
              <Card key={st.name} className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{st.name}</CardTitle>
                    <Badge className={st.status === "פעיל" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-amber-500/20 text-amber-300 border-amber-500/30"}>{st.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">סוג:</span>
                    <span className="text-foreground font-medium">{st.type}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">מפעיל:</span>
                    <span className="text-foreground">{st.operator}</span>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-muted-foreground">עומס נוכחי:</span>
                      <span className="text-foreground font-medium">{st.currentLoad}/{st.capacity} יחידות</span>
                    </div>
                    <Progress value={(st.currentLoad / st.capacity) * 100} className="h-2" />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">יעילות:</span>
                    <span className={`font-bold ${st.efficiency >= 90 ? "text-emerald-400" : st.efficiency >= 85 ? "text-amber-400" : "text-red-400"}`}>{st.efficiency}%</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Quality */}
        <TabsContent value="quality" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">תוצאות בקרת איכות</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-right p-3 text-muted-foreground font-medium">הזמנה</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">בודק</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">תאריך</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">תוצאה</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">ציון</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">הערות</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qualityResults.map((qr) => (
                        <tr key={qr.order} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="p-3 font-mono text-foreground">{qr.order}</td>
                          <td className="p-3 text-foreground">{qr.product}</td>
                          <td className="p-3 text-foreground">{qr.inspector}</td>
                          <td className="p-3 text-center text-muted-foreground">{qr.date}</td>
                          <td className="p-3 text-center">
                            <Badge className={qr.result === "עבר" ? "bg-emerald-500/20 text-emerald-300" : qr.result === "עבר בתנאי" ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300"}>{qr.result}</Badge>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`font-bold ${qr.score >= 90 ? "text-emerald-400" : qr.score >= 75 ? "text-amber-400" : "text-red-400"}`}>{qr.score}</span>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">{qr.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">פגמים לפי סוג</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {defectTypes.map((d) => (
                  <div key={d.type}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-foreground">{d.type}</span>
                      <span className="text-muted-foreground">{d.count} ({d.pct}%)</span>
                    </div>
                    <Progress value={d.pct} className="h-2" />
                  </div>
                ))}
                <div className="pt-3 border-t border-border/30 mt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">סה"כ פגמים החודש:</span>
                    <span className="text-foreground font-bold">25</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-muted-foreground">שיעור פגמים:</span>
                    <span className="text-amber-400 font-bold">5.8%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Scheduling */}
        <TabsContent value="scheduling" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">לוח זמנים יומי - 08/04/2026</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-right p-3 text-muted-foreground font-medium">שעות</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">תחנה</th>
                        <th className="text-right p-3 text-muted-foreground font-medium">משימה</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">עובדים</th>
                        <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailySchedule.map((s, i) => (
                        <tr key={i} className="border-b border-border/30 hover:bg-muted/10">
                          <td className="p-3 font-mono text-foreground">{s.time}</td>
                          <td className="p-3 text-foreground">{s.station}</td>
                          <td className="p-3 text-foreground">{s.task}</td>
                          <td className="p-3 text-center"><Badge variant="outline" className="bg-sky-500/10 text-sky-300 border-sky-500/30">{s.workers} <Users className="w-3 h-3 mr-1 inline" /></Badge></td>
                          <td className="p-3 text-center">
                            <Badge className={s.status === "הושלם" ? "bg-emerald-500/20 text-emerald-300" : s.status === "בתהליך" ? "bg-blue-500/20 text-blue-300" : "bg-slate-500/20 text-slate-300"}>{s.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">הקצאת משאבים</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {resourceAllocation.map((r) => (
                  <div key={r.resource}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-foreground font-medium">{r.resource}</span>
                      <span className="text-muted-foreground">{r.assigned}/{r.available}</span>
                    </div>
                    <Progress value={r.utilization} className="h-2" />
                    <p className={`text-xs mt-1 ${r.utilization >= 90 ? "text-red-400" : r.utilization >= 70 ? "text-amber-400" : "text-emerald-400"}`}>{r.utilization}% ניצולת</p>
                  </div>
                ))}
                <div className="pt-3 border-t border-border/30">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">סה"כ עובדים משובצים:</span>
                    <span className="text-foreground font-bold">16/20</span>
                  </div>
                  <div className="flex justify-between text-sm mt-1">
                    <span className="text-muted-foreground">ניצולת ממוצעת:</span>
                    <span className="text-amber-400 font-bold">76%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
