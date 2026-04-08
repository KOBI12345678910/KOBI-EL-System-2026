import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Search, Plus, Download, Paintbrush, Thermometer, ShieldCheck,
  Layers, Timer, Gauge, Palette, FlaskConical, CalendarClock, Flame,
  CheckCircle2, AlertTriangle, Clock, ArrowUpDown, Eye
} from "lucide-react";

/* ───────── static data ───────── */
const kpis = [
  { label: "הזמנות פעילות", value: 24, icon: Layers, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "מ\"ר צבוע היום", value: "186.4", icon: Paintbrush, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "צבעים בשימוש", value: 14, icon: Palette, color: "text-violet-400", bg: "bg-violet-500/10" },
  { label: "זמן אפייה ממוצע", value: "22 דק'", icon: Timer, color: "text-amber-400", bg: "bg-amber-500/10" },
  { label: "אחוז איכות", value: "97.3%", icon: ShieldCheck, color: "text-green-400", bg: "bg-green-500/10" },
  { label: "ניצולת תנור", value: "81%", icon: Thermometer, color: "text-rose-400", bg: "bg-rose-500/10" },
];

type CoatingOrder = {
  id: string; order: string; product: string; colorName: string; ral: string;
  finish: string; sqm: number; thickness: number; status: string;
};

const statusMap: Record<string, string> = {
  "ממתין לציפוי": "bg-slate-500/20 text-slate-300",
  "בהכנה": "bg-yellow-500/20 text-yellow-300",
  "בתנור": "bg-orange-500/20 text-orange-300",
  "ייבוש": "bg-blue-500/20 text-blue-300",
  "בדיקת איכות": "bg-violet-500/20 text-violet-300",
  "הושלם": "bg-emerald-500/20 text-emerald-300",
};

const orders: CoatingOrder[] = [
  { id: "CO-2401", order: "PO-8810", product: "פרופיל אלומיניום 6063", colorName: "לבן אלפיני", ral: "RAL 9010", finish: "אבקה", sqm: 24.5, thickness: 72, status: "בתנור" },
  { id: "CO-2402", order: "PO-8812", product: "מסגרת חלון 4 כנפות", colorName: "אנתרציט", ral: "RAL 7016", finish: "אבקה", sqm: 18.2, thickness: 68, status: "הושלם" },
  { id: "CO-2403", order: "PO-8815", product: "דלת כניסה פלדה", colorName: "שחור מט", ral: "RAL 9005", finish: "צביעה רטובה", sqm: 6.8, thickness: 45, status: "בהכנה" },
  { id: "CO-2404", order: "PO-8818", product: "תריס חשמלי 2.4 מ'", colorName: "ברונזה", ral: "RAL 8001", finish: "אנודייז", sqm: 12.0, thickness: 20, status: "ממתין לציפוי" },
  { id: "CO-2405", order: "PO-8820", product: "מעקה מרפסת נירוסטה", colorName: "כסף מטאלי", ral: "RAL 9006", finish: "אבקה", sqm: 9.3, thickness: 75, status: "בדיקת איכות" },
  { id: "CO-2406", order: "PO-8823", product: "פרגולה אלומיניום", colorName: "חום טבק", ral: "RAL 8014", finish: "אבקה", sqm: 31.6, thickness: 70, status: "בתנור" },
  { id: "CO-2407", order: "PO-8825", product: "חיפוי קיר חיצוני", colorName: "אפור בטון", ral: "RAL 7023", finish: "צביעה רטובה", sqm: 42.0, thickness: 50, status: "ייבוש" },
  { id: "CO-2408", order: "PO-8828", product: "קורות תקרה דקורטיביות", colorName: "עץ אלון", ral: "RAL 1011", finish: "אבקה", sqm: 15.7, thickness: 80, status: "הושלם" },
  { id: "CO-2409", order: "PO-8830", product: "שער חנייה מתרומם", colorName: "ירוק יער", ral: "RAL 6005", finish: "אבקה", sqm: 8.4, thickness: 65, status: "בהכנה" },
  { id: "CO-2410", order: "PO-8833", product: "מערכת חלונות ויטרינה", colorName: "כחול כהה", ral: "RAL 5003", finish: "אנודייז", sqm: 22.8, thickness: 25, status: "ממתין לציפוי" },
];

const ralColors = [
  { ral: "RAL 9010", name: "לבן אלפיני", hex: "#f1ece1", stock: 340, popular: true },
  { ral: "RAL 7016", name: "אנתרציט", hex: "#383e42", stock: 280, popular: true },
  { ral: "RAL 9005", name: "שחור מט", hex: "#0e0e10", stock: 220, popular: true },
  { ral: "RAL 9006", name: "כסף מטאלי", hex: "#a1a1a0", stock: 190, popular: true },
  { ral: "RAL 8001", name: "ברונזה", hex: "#955f20", stock: 145, popular: false },
  { ral: "RAL 8014", name: "חום טבק", hex: "#4a3526", stock: 130, popular: false },
  { ral: "RAL 7023", name: "אפור בטון", hex: "#808076", stock: 175, popular: false },
  { ral: "RAL 1011", name: "עץ אלון", hex: "#af8050", stock: 95, popular: false },
  { ral: "RAL 6005", name: "ירוק יער", hex: "#0f4336", stock: 110, popular: false },
  { ral: "RAL 5003", name: "כחול כהה", hex: "#1f3855", stock: 85, popular: false },
  { ral: "RAL 3000", name: "אדום אש", hex: "#a72920", stock: 60, popular: false },
  { ral: "RAL 1003", name: "צהוב אות", hex: "#f9a800", stock: 45, popular: false },
];

const qualityTests = [
  { id: "QT-501", order: "CO-2402", test: "עובי ציפוי", method: "מד עובי אלקטרומגנטי", target: "60-80 μm", result: "68 μm", pass: true },
  { id: "QT-502", order: "CO-2402", test: "הידבקות", method: "Cross-Cut ISO 2409", target: "דרגה 0-1", result: "דרגה 0", pass: true },
  { id: "QT-503", order: "CO-2405", test: "עובי ציפוי", method: "מד עובי אלקטרומגנטי", target: "60-80 μm", result: "75 μm", pass: true },
  { id: "QT-504", order: "CO-2405", test: "הידבקות", method: "Cross-Cut ISO 2409", target: "דרגה 0-1", result: "דרגה 1", pass: true },
  { id: "QT-505", order: "CO-2405", test: "ריסוס מלח", method: "ASTM B117 - 500 שעות", target: "ללא קורוזיה", result: "בבדיקה", pass: true },
  { id: "QT-506", order: "CO-2408", test: "עובי ציפוי", method: "מד עובי אלקטרומגנטי", target: "70-90 μm", result: "80 μm", pass: true },
  { id: "QT-507", order: "CO-2408", test: "הידבקות", method: "Cross-Cut ISO 2409", target: "דרגה 0-1", result: "דרגה 0", pass: true },
  { id: "QT-508", order: "CO-2408", test: "ריסוס מלח", method: "ASTM B117 - 500 שעות", target: "ללא קורוזיה", result: "עבר", pass: true },
  { id: "QT-509", order: "CO-2401", test: "עובי ציפוי", method: "מד עובי אלקטרומגנטי", target: "60-80 μm", result: "72 μm", pass: true },
  { id: "QT-510", order: "CO-2406", test: "עובי ציפוי", method: "מד עובי אלקטרומגנטי", target: "60-80 μm", result: "58 μm", pass: false },
];

const ovenSlots = [
  { id: "OV-A", name: "תנור A - ראשי", capacity: "12 מ\"ר", tempRange: "180-220°C", currentTemp: 195, cycle: "אפייה", order: "CO-2401", remaining: "8 דק'", utilization: 92 },
  { id: "OV-B", name: "תנור B - משני", capacity: "8 מ\"ר", tempRange: "160-200°C", currentTemp: 185, cycle: "אפייה", order: "CO-2406", remaining: "14 דק'", utilization: 78 },
  { id: "OV-C", name: "תנור C - אנודייז", capacity: "6 מ\"ר", tempRange: "60-100°C", currentTemp: 22, cycle: "מנוחה", order: "---", remaining: "---", utilization: 0 },
];

const ovenQueue = [
  { position: 1, order: "CO-2409", product: "שער חנייה מתרומם", color: "ירוק יער", sqm: 8.4, oven: "OV-A", eta: "14:30" },
  { position: 2, order: "CO-2404", product: "תריס חשמלי 2.4 מ'", color: "ברונזה", sqm: 12.0, oven: "OV-B", eta: "15:10" },
  { position: 3, order: "CO-2410", product: "מערכת חלונות ויטרינה", color: "כחול כהה", sqm: 22.8, oven: "OV-C", eta: "15:45" },
  { position: 4, order: "CO-2403", product: "דלת כניסה פלדה", color: "שחור מט", sqm: 6.8, oven: "OV-A", eta: "16:20" },
];

/* ───────── component ───────── */
export default function FabCoatingOrders() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("orders");

  const filtered = orders.filter(o =>
    !search || [o.id, o.order, o.product, o.colorName, o.ral, o.finish, o.status].some(v => v.includes(search))
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">הזמנות ציפוי ואבקה</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול ציפוי אבקה, אנודייז וצביעה רטובה</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
          <Button size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />הזמנה חדשה</Button>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4 flex flex-col items-center gap-1">
              <div className={`p-2 rounded-lg ${k.bg}`}>
                <k.icon className={`w-5 h-5 ${k.color}`} />
              </div>
              <span className="text-xl font-bold text-foreground">{k.value}</span>
              <span className="text-[11px] text-muted-foreground text-center leading-tight">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── tabs ── */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-card/60 border border-border/40">
          <TabsTrigger value="orders"><Layers className="w-4 h-4 ml-1" />הזמנות</TabsTrigger>
          <TabsTrigger value="colors"><Palette className="w-4 h-4 ml-1" />ניהול צבעים</TabsTrigger>
          <TabsTrigger value="quality"><ShieldCheck className="w-4 h-4 ml-1" />איכות</TabsTrigger>
          <TabsTrigger value="oven"><Flame className="w-4 h-4 ml-1" />לו"ז תנורים</TabsTrigger>
        </TabsList>

        {/* ── TAB 1 : orders ── */}
        <TabsContent value="orders" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">הזמנות ציפוי פעילות</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש הזמנה, מוצר, צבע..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50 text-sm" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מזהה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">הזמנה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">צבע</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">RAL</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג ציפוי</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מ"ר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עובי μm</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium w-20">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(o => (
                      <tr key={o.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 text-foreground font-mono text-xs">{o.id}</td>
                        <td className="p-3 text-foreground">{o.order}</td>
                        <td className="p-3 text-foreground">{o.product}</td>
                        <td className="p-3 text-foreground">
                          <span className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full border border-border/60" style={{ background: ralColors.find(r => r.ral === o.ral)?.hex }} />
                            {o.colorName}
                          </span>
                        </td>
                        <td className="p-3 text-muted-foreground font-mono text-xs">{o.ral}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">
                            {o.finish}
                          </Badge>
                        </td>
                        <td className="p-3 text-foreground">{o.sqm}</td>
                        <td className="p-3 text-foreground">{o.thickness}</td>
                        <td className="p-3">
                          <Badge className={`${statusMap[o.status] || ""} text-xs`}>{o.status}</Badge>
                        </td>
                        <td className="p-3 text-center">
                          <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                מציג {filtered.length} מתוך {orders.length} הזמנות
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── TAB 2 : colors ── */}
        <TabsContent value="colors" className="space-y-4">
          {/* popular section */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">צבעים פופולריים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {ralColors.filter(c => c.popular).map(c => (
                  <div key={c.ral} className="flex items-center gap-3 p-3 rounded-lg bg-background/40 border border-border/30">
                    <div className="w-10 h-10 rounded-md border border-border/60 shadow-sm" style={{ background: c.hex }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{c.ral}</p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{c.stock} ק"ג</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* full catalog */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">מלאי צבעים - קטלוג RAL</CardTitle>
                <Button variant="outline" size="sm"><Plus className="w-4 h-4 ml-1" />התאמה מיוחדת</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">דוגמה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קוד RAL</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שם צבע</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מלאי (ק"ג)</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מצב</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ralColors.map(c => (
                      <tr key={c.ral} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3">
                          <div className="w-8 h-8 rounded border border-border/60" style={{ background: c.hex }} />
                        </td>
                        <td className="p-3 font-mono text-xs text-foreground">{c.ral}</td>
                        <td className="p-3 text-foreground">{c.name}</td>
                        <td className="p-3 text-foreground">{c.stock}</td>
                        <td className="p-3">
                          {c.stock < 80 ? (
                            <Badge className="bg-red-500/20 text-red-300 text-xs">מלאי נמוך</Badge>
                          ) : c.stock < 150 ? (
                            <Badge className="bg-yellow-500/20 text-yellow-300 text-xs">מלאי בינוני</Badge>
                          ) : (
                            <Badge className="bg-green-500/20 text-green-300 text-xs">תקין</Badge>
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

        {/* ── TAB 3 : quality ── */}
        <TabsContent value="quality" className="space-y-4">
          {/* summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <Gauge className="w-6 h-6 text-blue-400" />
                <span className="text-lg font-bold text-foreground">48 / 50</span>
                <span className="text-xs text-muted-foreground">בדיקות עובי עברו</span>
                <Progress value={96} className="h-2 w-full" />
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <FlaskConical className="w-6 h-6 text-violet-400" />
                <span className="text-lg font-bold text-foreground">23 / 23</span>
                <span className="text-xs text-muted-foreground">בדיקות הידבקות עברו</span>
                <Progress value={100} className="h-2 w-full" />
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
                <span className="text-lg font-bold text-foreground">12 / 13</span>
                <span className="text-xs text-muted-foreground">ריסוס מלח עברו</span>
                <Progress value={92} className="h-2 w-full" />
              </CardContent>
            </Card>
          </div>

          {/* test log table */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">יומן בדיקות איכות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מזהה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">הזמנה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג בדיקה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שיטה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">יעד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תוצאה</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">עבר/נכשל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qualityTests.map(t => (
                      <tr key={t.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-mono text-xs text-foreground">{t.id}</td>
                        <td className="p-3 text-foreground">{t.order}</td>
                        <td className="p-3 text-foreground">{t.test}</td>
                        <td className="p-3 text-muted-foreground text-xs">{t.method}</td>
                        <td className="p-3 text-muted-foreground">{t.target}</td>
                        <td className="p-3 text-foreground font-medium">{t.result}</td>
                        <td className="p-3 text-center">
                          {t.pass ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto" />
                          ) : (
                            <AlertTriangle className="w-5 h-5 text-red-400 mx-auto" />
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

        {/* ── TAB 4 : oven schedule ── */}
        <TabsContent value="oven" className="space-y-4">
          {/* oven status cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ovenSlots.map(ov => (
              <Card key={ov.id} className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{ov.name}</CardTitle>
                    <Badge className={ov.cycle === "אפייה" ? "bg-orange-500/20 text-orange-300 text-xs" : "bg-slate-500/20 text-slate-300 text-xs"}>
                      {ov.cycle}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">קיבולת</span>
                    <span className="text-foreground">{ov.capacity}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">טווח טמפ'</span>
                    <span className="text-foreground">{ov.tempRange}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">טמפ' נוכחית</span>
                    <span className={`font-bold ${ov.currentTemp > 100 ? "text-orange-400" : "text-foreground"}`}>{ov.currentTemp}°C</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">הזמנה</span>
                    <span className="text-foreground font-mono text-xs">{ov.order}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">זמן נותר</span>
                    <span className="text-foreground">{ov.remaining}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">ניצולת</span>
                      <span className="text-foreground">{ov.utilization}%</span>
                    </div>
                    <Progress value={ov.utilization} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* queue */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-muted-foreground" />
                  תור המתנה לתנורים
                </CardTitle>
                <Button variant="outline" size="sm"><ArrowUpDown className="w-4 h-4 ml-1" />שינוי סדר</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-center p-3 text-muted-foreground font-medium w-16">#</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">הזמנה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">צבע</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מ"ר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תנור מיועד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שעת כניסה משוערת</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ovenQueue.map(q => (
                      <tr key={q.position} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold">{q.position}</span>
                        </td>
                        <td className="p-3 text-foreground font-mono text-xs">{q.order}</td>
                        <td className="p-3 text-foreground">{q.product}</td>
                        <td className="p-3 text-foreground">{q.color}</td>
                        <td className="p-3 text-foreground">{q.sqm}</td>
                        <td className="p-3">
                          <Badge variant="outline" className="text-xs">{q.oven}</Badge>
                        </td>
                        <td className="p-3">
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3.5 h-3.5" />
                            {q.eta}
                          </span>
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
