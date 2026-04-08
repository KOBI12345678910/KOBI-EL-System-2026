import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Flame, Users, ShieldCheck, AlertTriangle, Award, Fuel,
  Search, Plus, Download, Eye, CheckCircle2, XCircle, Clock,
  Zap, CircleDot, Settings2
} from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: "פעיל", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  welding: { label: "בריתוך", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  inspection: { label: "בבדיקה", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  completed: { label: "הושלם", color: "bg-green-500/20 text-green-300 border-green-500/30" },
  hold: { label: "בהמתנה", color: "bg-red-500/20 text-red-300 border-red-500/30" },
};

const WELD_TYPE_COLORS: Record<string, string> = {
  MIG: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  TIG: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  Spot: "bg-pink-500/20 text-pink-300 border-pink-500/30",
};

const MATERIAL_COLORS: Record<string, string> = {
  "פלדה": "bg-slate-500/20 text-slate-300 border-slate-500/30",
  "אלומיניום": "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "נירוסטה": "bg-amber-500/20 text-amber-300 border-amber-500/30",
};

const weldingOrders = [
  { id: "WO-4001", product: "שלדת פלדה תעשייתית", weldType: "MIG", material: "פלדה", joints: 48, fillerWire: "ER70S-6 1.2mm", status: "active", welder: "יוסי כהן", progress: 35 },
  { id: "WO-4002", product: "מיכל לחץ אלומיניום", weldType: "TIG", material: "אלומיניום", joints: 32, fillerWire: "ER4043 2.4mm", status: "welding", welder: "משה לוי", progress: 62 },
  { id: "WO-4003", product: "צינור נירוסטה 316L", weldType: "TIG", material: "נירוסטה", joints: 24, fillerWire: "ER316L 1.6mm", status: "inspection", welder: "אבי דוד", progress: 90 },
  { id: "WO-4004", product: "קורת גשר פלדה", weldType: "MIG", material: "פלדה", joints: 56, fillerWire: "ER70S-6 1.0mm", status: "completed", welder: "דני רוזן", progress: 100 },
  { id: "WO-4005", product: "מסגרת רכב אלומיניום", weldType: "MIG", material: "אלומיניום", joints: 40, fillerWire: "ER5356 1.2mm", status: "welding", welder: "רון שמש", progress: 45 },
  { id: "WO-4006", product: "מערכת פליטה נירוסטה", weldType: "TIG", material: "נירוסטה", joints: 18, fillerWire: "ER308L 2.4mm", status: "active", welder: "עמי גולן", progress: 10 },
  { id: "WO-4007", product: "לוח חשמל פלדה", weldType: "Spot", material: "פלדה", joints: 64, fillerWire: "---", status: "welding", welder: "יוסי כהן", progress: 78 },
  { id: "WO-4008", product: "מחסן כימיקלים נירוסטה", weldType: "TIG", material: "נירוסטה", joints: 36, fillerWire: "ER316L 2.4mm", status: "hold", welder: "משה לוי", progress: 20 },
  { id: "WO-4009", product: "מעקה בטיחות פלדה", weldType: "MIG", material: "פלדה", joints: 28, fillerWire: "ER70S-6 0.8mm", status: "active", welder: "אבי דוד", progress: 55 },
  { id: "WO-4010", product: "גוף רכב אלומיניום", weldType: "Spot", material: "אלומיניום", joints: 72, fillerWire: "---", status: "completed", welder: "דני רוזן", progress: 100 },
];

const welders = [
  { id: "W-01", name: "יוסי כהן", cert: "EN ISO 9606-1", skills: ["MIG", "Spot"], assignment: "WO-4001 / WO-4007", level: "בכיר", passRate: 98 },
  { id: "W-02", name: "משה לוי", cert: "EN ISO 9606-1/2", skills: ["TIG", "MIG"], assignment: "WO-4002", level: "בכיר", passRate: 97 },
  { id: "W-03", name: "אבי דוד", cert: "EN ISO 9606-1", skills: ["TIG", "MIG"], assignment: "WO-4003 / WO-4009", level: "מומחה", passRate: 99 },
  { id: "W-04", name: "דני רוזן", cert: "EN ISO 9606-1", skills: ["MIG", "Spot"], assignment: "הושלם - פנוי", level: "בכיר", passRate: 96 },
  { id: "W-05", name: "רון שמש", cert: "EN ISO 9606-2", skills: ["MIG", "TIG"], assignment: "WO-4005", level: "מתקדם", passRate: 94 },
  { id: "W-06", name: "עמי גולן", cert: "EN ISO 9606-1/2", skills: ["TIG"], assignment: "WO-4006", level: "מומחה", passRate: 99 },
  { id: "W-07", name: "גיל ברק", cert: "EN ISO 9606-1", skills: ["MIG", "Spot"], assignment: "פנוי", level: "מתקדם", passRate: 93 },
  { id: "W-08", name: "עידו מזרחי", cert: "EN ISO 9606-1", skills: ["MIG"], assignment: "הכשרה TIG", level: "זוטר", passRate: 88 },
];

const qualityInspections = [
  { id: "QI-301", order: "WO-4003", joint: "J-12", method: "ויזואלי", result: "עובר", inspector: "ד\"ר שלמה", notes: "תקין - ללא פגמים נראים" },
  { id: "QI-302", order: "WO-4003", joint: "J-13", method: "חומר חודר (DPT)", result: "עובר", inspector: "ד\"ר שלמה", notes: "אין סדקים או נקבוביות" },
  { id: "QI-303", order: "WO-4002", joint: "J-08", method: "צילום רנטגן", result: "עובר", inspector: "ד\"ר שלמה", notes: "ללא פגמים פנימיים" },
  { id: "QI-304", order: "WO-4004", joint: "J-22", method: "ויזואלי", result: "עובר", inspector: "ליאור כץ", notes: "חדירה מלאה תקינה" },
  { id: "QI-305", order: "WO-4001", joint: "J-05", method: "חומר חודר (DPT)", result: "נכשל", inspector: "ליאור כץ", notes: "סדק 2mm - דרוש תיקון" },
  { id: "QI-306", order: "WO-4005", joint: "J-15", method: "ויזואלי", result: "עובר", inspector: "ליאור כץ", notes: "מראה תקין" },
  { id: "QI-307", order: "WO-4002", joint: "J-19", method: "צילום רנטגן", result: "עובר", inspector: "ד\"ר שלמה", notes: "חתך נקי" },
  { id: "QI-308", order: "WO-4007", joint: "J-30", method: "ויזואלי", result: "נכשל", inspector: "ליאור כץ", notes: "נקודת ריתוך לא סימטרית" },
  { id: "QI-309", order: "WO-4009", joint: "J-10", method: "חומר חודר (DPT)", result: "עובר", inspector: "ד\"ר שלמה", notes: "תקין" },
  { id: "QI-310", order: "WO-4006", joint: "J-03", method: "צילום רנטגן", result: "עובר", inspector: "ד\"ר שלמה", notes: "ללא ליקויים" },
];

const consumables = [
  { id: "C-01", name: "חוט מילוי ER70S-6 0.8mm", category: "חוט מילוי", stock: 120, unit: 'ק"ג', minStock: 50, status: "תקין" },
  { id: "C-02", name: "חוט מילוי ER70S-6 1.0mm", category: "חוט מילוי", stock: 85, unit: 'ק"ג', minStock: 40, status: "תקין" },
  { id: "C-03", name: "חוט מילוי ER70S-6 1.2mm", category: "חוט מילוי", stock: 30, unit: 'ק"ג', minStock: 60, status: "נמוך" },
  { id: "C-04", name: "חוט מילוי ER4043 2.4mm", category: "חוט מילוי", stock: 45, unit: 'ק"ג', minStock: 20, status: "תקין" },
  { id: "C-05", name: "חוט מילוי ER316L 1.6mm", category: "חוט מילוי", stock: 18, unit: 'ק"ג', minStock: 15, status: "נמוך" },
  { id: "C-06", name: "גז ארגון 99.99%", category: "גז מגן", stock: 8, unit: "בלון", minStock: 5, status: "תקין" },
  { id: "C-07", name: "תערובת Ar/CO2 82/18", category: "גז מגן", stock: 3, unit: "בלון", minStock: 4, status: "נמוך" },
  { id: "C-08", name: "אלקטרודה טונגסטן 2.4mm", category: "אלקטרודות", stock: 50, unit: "יח'", minStock: 20, status: "תקין" },
  { id: "C-09", name: "אלקטרודה טונגסטן 1.6mm", category: "אלקטרודות", stock: 35, unit: "יח'", minStock: 20, status: "תקין" },
  { id: "C-10", name: "חוט מילוי ER5356 1.2mm", category: "חוט מילוי", stock: 55, unit: 'ק"ג', minStock: 25, status: "תקין" },
  { id: "C-11", name: "גז הליום טהור", category: "גז מגן", stock: 2, unit: "בלון", minStock: 3, status: "נמוך" },
  { id: "C-12", name: "חוט מילוי ER308L 2.4mm", category: "חוט מילוי", stock: 22, unit: 'ק"ג', minStock: 15, status: "תקין" },
];

const kpis = [
  { title: "הזמנות פעילות", value: "7", icon: Flame, color: "text-orange-400", bg: "bg-orange-500/10" },
  { title: "מחברים היום", value: "136", icon: Zap, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { title: "ניצולת רתכים", value: "87%", icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
  { title: "אחוז פגמים", value: "2.1%", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  { title: "רתכים מוסמכים", value: "8", icon: Award, color: "text-green-400", bg: "bg-green-500/10" },
  { title: "צריכת גז (בלונים/שבוע)", value: "14", icon: Fuel, color: "text-purple-400", bg: "bg-purple-500/10" },
];

export default function FabWeldingOrders() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("orders");

  const filteredOrders = weldingOrders.filter(
    (o) => !search || o.id.includes(search) || o.product.includes(search) || o.welder.includes(search)
  );
  const filteredWelders = welders.filter(
    (w) => !search || w.name.includes(search) || w.cert.includes(search)
  );
  const filteredQuality = qualityInspections.filter(
    (q) => !search || q.order.includes(search) || q.method.includes(search)
  );
  const filteredConsumables = consumables.filter(
    (c) => !search || c.name.includes(search) || c.category.includes(search)
  );

  const passCount = qualityInspections.filter((q) => q.result === "עובר").length;
  const failCount = qualityInspections.filter((q) => q.result === "נכשל").length;
  const lowStockCount = consumables.filter((c) => c.status === "נמוך").length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Flame className="w-7 h-7 text-orange-400" />
            הזמנות ריתוך - מתכת ואלומיניום
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול הזמנות, רתכים, בקרת איכות וחומרים מתכלים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
          <Button size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />הזמנה חדשה</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="bg-card/60 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                <span className={`text-xs px-2 py-0.5 rounded-full ${kpi.bg} ${kpi.color}`}>KPI</span>
              </div>
              <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.title}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="חיפוש הזמנה, רתך, חומר..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9 bg-background/50"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card/60">
          <TabsTrigger value="orders">הזמנות ({weldingOrders.length})</TabsTrigger>
          <TabsTrigger value="welders">רתכים ({welders.length})</TabsTrigger>
          <TabsTrigger value="quality">בקרת איכות</TabsTrigger>
          <TabsTrigger value="consumables">חומרים מתכלים</TabsTrigger>
        </TabsList>

        {/* Orders Tab */}
        <TabsContent value="orders">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">הזמנות ריתוך פעילות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס' הזמנה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג ריתוך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חומר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מחברים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חוט מילוי</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">התקדמות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium w-20">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                        <td className="p-3 font-mono text-foreground font-medium">{order.id}</td>
                        <td className="p-3 text-foreground">{order.product}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={WELD_TYPE_COLORS[order.weldType]}>{order.weldType}</Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={MATERIAL_COLORS[order.material]}>{order.material}</Badge>
                        </td>
                        <td className="p-3 text-foreground font-medium">{order.joints}</td>
                        <td className="p-3 text-muted-foreground text-xs">{order.fillerWire}</td>
                        <td className="p-3 w-32">
                          <div className="flex items-center gap-2">
                            <Progress value={order.progress} className="h-2 flex-1" />
                            <span className="text-xs text-muted-foreground w-8">{order.progress}%</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={STATUS_MAP[order.status]?.color}>
                            {STATUS_MAP[order.status]?.label}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Welders Tab */}
        <TabsContent value="welders">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-green-400" />
                רתכים מוסמכים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredWelders.map((w) => (
                  <div key={w.id} className="border border-border/40 rounded-lg p-4 bg-background/30 hover:bg-muted/10 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-semibold text-foreground text-base">{w.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{w.id} | {w.level}</div>
                      </div>
                      <Badge variant="outline" className="bg-green-500/10 text-green-300 border-green-500/30 text-xs">
                        {w.cert}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {w.skills.map((s) => (
                        <Badge key={s} variant="outline" className={WELD_TYPE_COLORS[s] + " text-xs"}>{s}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        <Settings2 className="w-3.5 h-3.5 inline ml-1" />
                        {w.assignment}
                      </span>
                      <span className="text-muted-foreground">
                        עבר: <span className={w.passRate >= 95 ? "text-green-400" : "text-yellow-400"}>{w.passRate}%</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quality Tab */}
        <TabsContent value="quality">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-400 mx-auto mb-1" />
                <div className="text-2xl font-bold text-green-400">{passCount}</div>
                <div className="text-xs text-muted-foreground">עוברים</div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <XCircle className="w-8 h-8 text-red-400 mx-auto mb-1" />
                <div className="text-2xl font-bold text-red-400">{failCount}</div>
                <div className="text-xs text-muted-foreground">נכשלים</div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <CircleDot className="w-8 h-8 text-blue-400 mx-auto mb-1" />
                <div className="text-2xl font-bold text-blue-400">
                  {passCount + failCount > 0 ? Math.round((passCount / (passCount + failCount)) * 100) : 0}%
                </div>
                <div className="text-xs text-muted-foreground">אחוז מעבר</div>
              </CardContent>
            </Card>
          </div>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">בדיקות ריתוך</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס' בדיקה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">הזמנה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מחבר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שיטה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תוצאה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">בודק</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">הערות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredQuality.map((q) => (
                      <tr key={q.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                        <td className="p-3 font-mono text-foreground">{q.id}</td>
                        <td className="p-3 text-foreground">{q.order}</td>
                        <td className="p-3 text-foreground">{q.joint}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="bg-indigo-500/10 text-indigo-300 border-indigo-500/30 text-xs">
                            {q.method}
                          </Badge>
                        </td>
                        <td className="p-3">
                          {q.result === "עובר" ? (
                            <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/30">
                              <CheckCircle2 className="w-3 h-3 ml-1" />עובר
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                              <XCircle className="w-3 h-3 ml-1" />נכשל
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">{q.inspector}</td>
                        <td className="p-3 text-muted-foreground text-xs">{q.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Consumables Tab */}
        <TabsContent value="consumables">
          <div className="flex items-center gap-3 mb-4">
            <Card className="bg-card/50 border-border/50 flex-1">
              <CardContent className="p-4 flex items-center gap-3">
                <Clock className="w-6 h-6 text-yellow-400" />
                <div>
                  <div className="text-lg font-bold text-yellow-400">{lowStockCount}</div>
                  <div className="text-xs text-muted-foreground">פריטים במלאי נמוך</div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50 flex-1">
              <CardContent className="p-4 flex items-center gap-3">
                <Fuel className="w-6 h-6 text-purple-400" />
                <div>
                  <div className="text-lg font-bold text-purple-400">{consumables.filter(c => c.category === "גז מגן").length}</div>
                  <div className="text-xs text-muted-foreground">סוגי גז מגן</div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50 flex-1">
              <CardContent className="p-4 flex items-center gap-3">
                <Zap className="w-6 h-6 text-cyan-400" />
                <div>
                  <div className="text-lg font-bold text-cyan-400">{consumables.filter(c => c.category === "אלקטרודות").length}</div>
                  <div className="text-xs text-muted-foreground">סוגי אלקטרודות</div>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">מלאי חומרים מתכלים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">קוד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פריט</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מלאי</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מינימום</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מצב</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredConsumables.map((c) => (
                      <tr key={c.id} className="border-b border-border/30 hover:bg-muted/10 transition-colors">
                        <td className="p-3 font-mono text-foreground">{c.id}</td>
                        <td className="p-3 text-foreground">{c.name}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="bg-slate-500/10 text-slate-300 border-slate-500/30 text-xs">
                            {c.category}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <span className={c.stock <= c.minStock ? "text-red-400 font-semibold" : "text-foreground"}>
                            {c.stock} {c.unit}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground">{c.minStock} {c.unit}</td>
                        <td className="p-3">
                          {c.status === "תקין" ? (
                            <Badge variant="outline" className="bg-green-500/15 text-green-400 border-green-500/30">תקין</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-500/15 text-red-400 border-red-500/30">
                              <AlertTriangle className="w-3 h-3 ml-1" />נמוך
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
