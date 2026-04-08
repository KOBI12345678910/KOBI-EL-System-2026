import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  RefreshCcw, TrendingUp, TrendingDown, AlertTriangle, Brain,
  Package, Wrench, HardHat, BarChart3, Lightbulb, ShieldAlert,
} from "lucide-react";

const fmt = (v: number) => "₪" + v.toLocaleString("he-IL");
const pct = (v: number) => (v > 0 ? "+" : "") + v.toFixed(1) + "%";

const projects = [
  { id: "PRJ-1041", name: "בניין מגורים — רעננה", client: "אורן נכסים",
    estMat: 185000, estLab: 92000, estInst: 48000, estTotal: 325000,
    actMat: 201000, actLab: 88000, actInst: 55000, actTotal: 344000,
    estProfit: 95000, actProfit: 76000, reason: "עליית מחירי ברזל" },
  { id: "PRJ-1042", name: "מרכז מסחרי — נתניה", client: "שקד השקעות",
    estMat: 310000, estLab: 145000, estInst: 72000, estTotal: 527000,
    actMat: 298000, actLab: 152000, actInst: 70000, actTotal: 520000,
    estProfit: 143000, actProfit: 150000, reason: "חיסכון בחומרים" },
  { id: "PRJ-1043", name: "שיפוץ משרדים — ת״א", client: "הייטק פלוס",
    estMat: 78000, estLab: 65000, estInst: 22000, estTotal: 165000,
    actMat: 82000, actLab: 71000, actInst: 28000, actTotal: 181000,
    estProfit: 45000, actProfit: 29000, reason: "שינויים של לקוח" },
  { id: "PRJ-1044", name: "מפעל ייצור — חיפה", client: "טכנו-כל עוזי",
    estMat: 420000, estLab: 210000, estInst: 115000, estTotal: 745000,
    actMat: 415000, actLab: 208000, actInst: 118000, actTotal: 741000,
    estProfit: 205000, actProfit: 209000, reason: "ביצוע מדויק" },
  { id: "PRJ-1045", name: "גן ילדים — הרצליה", client: "עיריית הרצליה",
    estMat: 62000, estLab: 38000, estInst: 18000, estTotal: 118000,
    actMat: 74000, actLab: 42000, actInst: 25000, actTotal: 141000,
    estProfit: 32000, actProfit: 9000, reason: "עיכובים וקנסות" },
  { id: "PRJ-1046", name: "קומה נוספת — רמת גן", client: "משפחת לוי",
    estMat: 135000, estLab: 72000, estInst: 35000, estTotal: 242000,
    actMat: 138000, actLab: 70000, actInst: 37000, actTotal: 245000,
    estProfit: 58000, actProfit: 55000, reason: "סטייה מינורית" },
  { id: "PRJ-1047", name: "מחסן לוגיסטי — אשדוד", client: "לוג׳יטק",
    estMat: 255000, estLab: 118000, estInst: 65000, estTotal: 438000,
    actMat: 248000, actLab: 125000, actInst: 62000, actTotal: 435000,
    estProfit: 112000, actProfit: 115000, reason: "אופטימיזציה" },
  { id: "PRJ-1048", name: "מרפאה — פ״ת", client: "כללית",
    estMat: 98000, estLab: 55000, estInst: 30000, estTotal: 183000,
    actMat: 112000, actLab: 58000, actInst: 38000, actTotal: 208000,
    estProfit: 47000, actProfit: 22000, reason: "דרישות רגולציה" },
];

const materialCategories = [
  { cat: "ברזל/פלדה", est: 320000, act: 348000, var: 8.8, trend: "up" },
  { cat: "בטון", est: 210000, act: 215000, var: 2.4, trend: "stable" },
  { cat: "עץ/MDF", est: 145000, act: 140000, var: -3.4, trend: "down" },
  { cat: "חשמל", est: 98000, act: 105000, var: 7.1, trend: "up" },
  { cat: "אינסטלציה", est: 85000, act: 88000, var: 3.5, trend: "stable" },
  { cat: "גמר/צבע", est: 72000, act: 69000, var: -4.2, trend: "down" },
  { cat: "אלומיניום/זכוכית", est: 115000, act: 128000, var: 11.3, trend: "up" },
];

const laborOps = [
  { op: "עבודות שלד", estH: 1200, actH: 1280, estCost: 180000, actCost: 192000, var: 6.7 },
  { op: "טיח/ריצוף", estH: 850, actH: 820, estCost: 110500, actCost: 106600, var: -3.5 },
  { op: "חשמל", estH: 620, actH: 680, estCost: 93000, actCost: 102000, var: 9.7 },
  { op: "אינסטלציה", estH: 480, actH: 490, estCost: 72000, actCost: 73500, var: 2.1 },
  { op: "גמר פנים", estH: 720, actH: 750, estCost: 86400, actCost: 90000, var: 4.2 },
  { op: "ניהול אתר", estH: 400, actH: 380, estCost: 80000, actCost: 76000, var: -5.0 },
];

const installData = [
  { type: "מזגנים/מיזוג", est: 85000, act: 92000, var: 8.2, accuracy: 91.8 },
  { type: "מעליות", est: 120000, act: 118000, var: -1.7, accuracy: 98.3 },
  { type: "מערכות אש", est: 45000, act: 52000, var: 15.6, accuracy: 84.4 },
  { type: "חשמל ראשי", est: 68000, act: 72000, var: 5.9, accuracy: 94.1 },
  { type: "מים/ביוב", est: 38000, act: 41000, var: 7.9, accuracy: 92.1 },
];

const aiInsights = [
  { pattern: "עליית מחירי ברזל מעל 8% ברבעון", confidence: 94, action: "להוסיף 10% כרית בטחון לאומדני ברזל", impact: "₪45,000 חיסכון פוטנציאלי" },
  { pattern: "עבודות חשמל חורגות ב-9%+ בממוצע", confidence: 87, action: "לעדכן תעריפי חשמלאים ב-+8%", impact: "דיוק אומדן ישתפר ב-6%" },
  { pattern: "שינויי לקוח מייקרים פרויקטים ב-12%", confidence: 91, action: "לכלול סעיף שינויים בחוזה (עד 5%)", impact: "הגנה על מרווח של ₪32,000" },
  { pattern: "התקנות אש חורגות ב-15%+ בעקביות", confidence: 89, action: "לעדכן אומדן התקנות אש פי 1.15", impact: "צמצום סטייה מ-15% ל-3%" },
  { pattern: "פרויקטים ממשלתיים — עיכובים ב-70% מהמקרים", confidence: 82, action: "להוסיף 20% זמן buffer לפרויקטים ממשלתיים", impact: "הפחתת קנסות ב-₪18,000" },
];

const accuracyTrend = [
  { period: "Q1 2025", matAcc: 88, labAcc: 91, instAcc: 85, overall: 88 },
  { period: "Q2 2025", matAcc: 90, labAcc: 89, instAcc: 87, overall: 89 },
  { period: "Q3 2025", matAcc: 91, labAcc: 92, instAcc: 88, overall: 90 },
  { period: "Q4 2025", matAcc: 93, labAcc: 93, instAcc: 90, overall: 92 },
  { period: "Q1 2026", matAcc: 94, labAcc: 94, instAcc: 92, overall: 93 },
];

const erosionAlerts = [
  { project: "גן ילדים — הרצליה", erosion: 71.9, cause: "עיכובים רגולטוריים + קנסות", action: "משא ומתן על הארכה ללא קנס", severity: "critical" },
  { project: "מרפאה — פ״ת", erosion: 53.2, cause: "דרישות רגולציה לא צפויות", action: "הגשת דרישת תשלום נוסף", severity: "critical" },
  { project: "שיפוץ משרדים — ת״א", erosion: 35.6, cause: "שינויי לקוח מרובים", action: "הפעלת סעיף שינויים בחוזה", severity: "warning" },
  { project: "קומה נוספת — רמת גן", erosion: 5.2, cause: "סטייה מינורית בחומרים", action: "מעקב — ללא פעולה נדרשת", severity: "info" },
  { project: "מחסן לוגיסטי — אשדוד", erosion: -2.7, cause: "אופטימיזציה בשטח", action: "לתעד כ-best practice", severity: "positive" },
];

const sevColors: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300",
  warning: "bg-yellow-500/20 text-yellow-300",
  info: "bg-blue-500/20 text-blue-300",
  positive: "bg-emerald-500/20 text-emerald-300",
};

export default function ProfitabilityFeedbackLoop() {
  const [tab, setTab] = useState("summary");

  const avgMatVar = (projects.reduce((s, p) => s + ((p.actMat - p.estMat) / p.estMat) * 100, 0) / projects.length);
  const avgLabVar = (projects.reduce((s, p) => s + ((p.actLab - p.estLab) / p.estLab) * 100, 0) / projects.length);
  const avgInstVar = (projects.reduce((s, p) => s + ((p.actInst - p.estInst) / p.estInst) * 100, 0) / projects.length);
  const profitAcc = (projects.reduce((s, p) => s + (Math.min(p.actProfit, p.estProfit) / Math.max(p.actProfit, p.estProfit)) * 100, 0) / projects.length);
  const alertCount = erosionAlerts.filter(a => a.severity === "critical" || a.severity === "warning").length;

  const kpis = [
    { label: "פרויקטים מנותחים", value: projects.length.toString(), icon: BarChart3, color: "text-blue-400" },
    { label: "סטיית חומרים ממוצעת", value: pct(avgMatVar), icon: Package, color: avgMatVar > 5 ? "text-red-400" : "text-emerald-400" },
    { label: "סטיית עבודה ממוצעת", value: pct(avgLabVar), icon: Wrench, color: avgLabVar > 5 ? "text-red-400" : "text-emerald-400" },
    { label: "סטיית התקנה ממוצעת", value: pct(avgInstVar), icon: HardHat, color: avgInstVar > 5 ? "text-red-400" : "text-emerald-400" },
    { label: "דיוק רווח כולל", value: profitAcc.toFixed(1) + "%", icon: TrendingUp, color: "text-cyan-400" },
    { label: "התראות שחיקת מרווח", value: alertCount.toString(), icon: AlertTriangle, color: "text-amber-400" },
  ];

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <RefreshCcw className="h-6 w-6 text-cyan-400" />
            לולאת רווחיות — Estimated vs Actual
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח סטיות, קודי סיבה ולמידת AI לשיפור תמחור עתידי</p>
        </div>
        <Badge variant="outline" className="border-cyan-500/50 text-cyan-300 text-xs">
          טכנו-כל עוזי — {new Date().toLocaleDateString("he-IL")}
        </Badge>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className="bg-[#1a1a2e] border-gray-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <k.icon className={`h-4 w-4 ${k.color}`} />
                <span className="text-xs text-muted-foreground">{k.label}</span>
              </div>
              <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#1a1a2e] border border-gray-800">
          <TabsTrigger value="summary">סיכום</TabsTrigger>
          <TabsTrigger value="materials">חומרים</TabsTrigger>
          <TabsTrigger value="labor">עבודה</TabsTrigger>
          <TabsTrigger value="installation">התקנה</TabsTrigger>
          <TabsTrigger value="learning">למידה</TabsTrigger>
          <TabsTrigger value="alerts">התראות</TabsTrigger>
        </TabsList>

        {/* Tab: Summary */}
        <TabsContent value="summary">
          <Card className="bg-[#1a1a2e] border-gray-800">
            <CardHeader><CardTitle className="text-lg">השוואת אומדן מול ביצוע — לפי פרויקט</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800">
                    <TableHead className="text-right">פרויקט</TableHead>
                    <TableHead className="text-right">חומרים (א)</TableHead>
                    <TableHead className="text-right">עבודה (א)</TableHead>
                    <TableHead className="text-right">התקנה (א)</TableHead>
                    <TableHead className="text-right">סה״כ אומדן</TableHead>
                    <TableHead className="text-right">חומרים (ב)</TableHead>
                    <TableHead className="text-right">עבודה (ב)</TableHead>
                    <TableHead className="text-right">התקנה (ב)</TableHead>
                    <TableHead className="text-right">סה״כ בפועל</TableHead>
                    <TableHead className="text-right">רווח א</TableHead>
                    <TableHead className="text-right">רווח ב</TableHead>
                    <TableHead className="text-right">סטייה %</TableHead>
                    <TableHead className="text-right">סיבה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p) => {
                    const varPct = ((p.actProfit - p.estProfit) / p.estProfit) * 100;
                    return (
                      <TableRow key={p.id} className="border-gray-800 hover:bg-gray-800/40">
                        <TableCell>
                          <div className="text-sm font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.id} — {p.client}</div>
                        </TableCell>
                        <TableCell className="text-sm">{fmt(p.estMat)}</TableCell>
                        <TableCell className="text-sm">{fmt(p.estLab)}</TableCell>
                        <TableCell className="text-sm">{fmt(p.estInst)}</TableCell>
                        <TableCell className="text-sm font-medium">{fmt(p.estTotal)}</TableCell>
                        <TableCell className="text-sm">{fmt(p.actMat)}</TableCell>
                        <TableCell className="text-sm">{fmt(p.actLab)}</TableCell>
                        <TableCell className="text-sm">{fmt(p.actInst)}</TableCell>
                        <TableCell className="text-sm font-medium">{fmt(p.actTotal)}</TableCell>
                        <TableCell className="text-sm text-emerald-400">{fmt(p.estProfit)}</TableCell>
                        <TableCell className={`text-sm ${p.actProfit >= p.estProfit ? "text-emerald-400" : "text-red-400"}`}>{fmt(p.actProfit)}</TableCell>
                        <TableCell>
                          <Badge className={varPct >= 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}>
                            {pct(varPct)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[120px]">{p.reason}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Materials */}
        <TabsContent value="materials">
          <Card className="bg-[#1a1a2e] border-gray-800">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Package className="h-5 w-5 text-orange-400" />דיוק עלות חומרים — לפי קטגוריה</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800">
                    <TableHead className="text-right">קטגוריה</TableHead>
                    <TableHead className="text-right">אומדן</TableHead>
                    <TableHead className="text-right">בפועל</TableHead>
                    <TableHead className="text-right">סטייה %</TableHead>
                    <TableHead className="text-right">דיוק</TableHead>
                    <TableHead className="text-right">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materialCategories.map((m, i) => (
                    <TableRow key={i} className="border-gray-800 hover:bg-gray-800/40">
                      <TableCell className="font-medium">{m.cat}</TableCell>
                      <TableCell>{fmt(m.est)}</TableCell>
                      <TableCell>{fmt(m.act)}</TableCell>
                      <TableCell>
                        <Badge className={m.var > 5 ? "bg-red-500/20 text-red-300" : m.var < -2 ? "bg-emerald-500/20 text-emerald-300" : "bg-yellow-500/20 text-yellow-300"}>
                          {pct(m.var)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={100 - Math.abs(m.var)} className="h-2 w-20" />
                          <span className="text-xs">{(100 - Math.abs(m.var)).toFixed(1)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {m.trend === "up" && <TrendingUp className="h-4 w-4 text-red-400" />}
                        {m.trend === "down" && <TrendingDown className="h-4 w-4 text-emerald-400" />}
                        {m.trend === "stable" && <span className="text-xs text-muted-foreground">יציב</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Labor */}
        <TabsContent value="labor">
          <Card className="bg-[#1a1a2e] border-gray-800">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Wrench className="h-5 w-5 text-blue-400" />דיוק עלות עבודה — לפי סוג פעולה</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800">
                    <TableHead className="text-right">סוג פעולה</TableHead>
                    <TableHead className="text-right">שעות אומדן</TableHead>
                    <TableHead className="text-right">שעות בפועל</TableHead>
                    <TableHead className="text-right">עלות אומדן</TableHead>
                    <TableHead className="text-right">עלות בפועל</TableHead>
                    <TableHead className="text-right">סטייה %</TableHead>
                    <TableHead className="text-right">דיוק</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {laborOps.map((l, i) => (
                    <TableRow key={i} className="border-gray-800 hover:bg-gray-800/40">
                      <TableCell className="font-medium">{l.op}</TableCell>
                      <TableCell>{l.estH.toLocaleString("he-IL")}</TableCell>
                      <TableCell>{l.actH.toLocaleString("he-IL")}</TableCell>
                      <TableCell>{fmt(l.estCost)}</TableCell>
                      <TableCell>{fmt(l.actCost)}</TableCell>
                      <TableCell>
                        <Badge className={l.var > 5 ? "bg-red-500/20 text-red-300" : l.var < 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-yellow-500/20 text-yellow-300"}>
                          {pct(l.var)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={100 - Math.abs(l.var)} className="h-2 w-20" />
                          <span className="text-xs">{(100 - Math.abs(l.var)).toFixed(1)}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Installation */}
        <TabsContent value="installation">
          <Card className="bg-[#1a1a2e] border-gray-800">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><HardHat className="h-5 w-5 text-amber-400" />דיוק עלות התקנה — לפי סוג</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800">
                    <TableHead className="text-right">סוג התקנה</TableHead>
                    <TableHead className="text-right">אומדן</TableHead>
                    <TableHead className="text-right">בפועל</TableHead>
                    <TableHead className="text-right">סטייה %</TableHead>
                    <TableHead className="text-right">דיוק</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installData.map((d, i) => (
                    <TableRow key={i} className="border-gray-800 hover:bg-gray-800/40">
                      <TableCell className="font-medium">{d.type}</TableCell>
                      <TableCell>{fmt(d.est)}</TableCell>
                      <TableCell>{fmt(d.act)}</TableCell>
                      <TableCell>
                        <Badge className={d.var > 10 ? "bg-red-500/20 text-red-300" : d.var < 0 ? "bg-emerald-500/20 text-emerald-300" : "bg-yellow-500/20 text-yellow-300"}>
                          {pct(d.var)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={d.accuracy} className="h-2 w-24" />
                          <span className="text-xs">{d.accuracy}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Learning / AI Insights */}
        <TabsContent value="learning" className="space-y-4">
          <Card className="bg-[#1a1a2e] border-gray-800">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Brain className="h-5 w-5 text-purple-400" />תובנות AI — דפוסים שזוהו והמלצות תמחור</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {aiInsights.map((ins, i) => (
                <div key={i} className="border border-gray-700 rounded-lg p-4 hover:bg-gray-800/40 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Lightbulb className="h-4 w-4 text-yellow-400" />
                        <span className="text-sm font-medium">{ins.pattern}</span>
                      </div>
                      <p className="text-sm text-muted-foreground mr-6">{ins.action}</p>
                    </div>
                    <div className="text-left space-y-1">
                      <Badge variant="outline" className="border-purple-500/50 text-purple-300 text-xs">
                        ביטחון: {ins.confidence}%
                      </Badge>
                      <div className="text-xs text-emerald-400">{ins.impact}</div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a2e] border-gray-800">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><TrendingUp className="h-5 w-5 text-cyan-400" />מגמת שיפור דיוק — לפי רבעון</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800">
                    <TableHead className="text-right">תקופה</TableHead>
                    <TableHead className="text-right">דיוק חומרים</TableHead>
                    <TableHead className="text-right">דיוק עבודה</TableHead>
                    <TableHead className="text-right">דיוק התקנה</TableHead>
                    <TableHead className="text-right">דיוק כולל</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accuracyTrend.map((t, i) => (
                    <TableRow key={i} className="border-gray-800">
                      <TableCell className="font-medium">{t.period}</TableCell>
                      {[t.matAcc, t.labAcc, t.instAcc, t.overall].map((v, j) => (
                        <TableCell key={j}>
                          <div className="flex items-center gap-2">
                            <Progress value={v} className="h-2 w-16" />
                            <span className={`text-xs ${v >= 93 ? "text-emerald-400" : v >= 88 ? "text-yellow-300" : "text-red-400"}`}>{v}%</span>
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Alerts */}
        <TabsContent value="alerts">
          <Card className="bg-[#1a1a2e] border-gray-800">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-red-400" />התראות שחיקת מרווח</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800">
                    <TableHead className="text-right">פרויקט</TableHead>
                    <TableHead className="text-right">שחיקה %</TableHead>
                    <TableHead className="text-right">סיבה</TableHead>
                    <TableHead className="text-right">פעולה מומלצת</TableHead>
                    <TableHead className="text-right">חומרה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {erosionAlerts.map((a, i) => (
                    <TableRow key={i} className="border-gray-800 hover:bg-gray-800/40">
                      <TableCell className="font-medium">{a.project}</TableCell>
                      <TableCell>
                        <span className={a.erosion > 30 ? "text-red-400 font-bold" : a.erosion > 10 ? "text-yellow-300" : a.erosion < 0 ? "text-emerald-400" : "text-muted-foreground"}>
                          {a.erosion > 0 ? "-" : "+"}{Math.abs(a.erosion).toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.cause}</TableCell>
                      <TableCell className="text-sm">{a.action}</TableCell>
                      <TableCell>
                        <Badge className={sevColors[a.severity]}>
                          {a.severity === "critical" ? "קריטי" : a.severity === "warning" ? "אזהרה" : a.severity === "positive" ? "חיובי" : "מידע"}
                        </Badge>
                      </TableCell>
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
