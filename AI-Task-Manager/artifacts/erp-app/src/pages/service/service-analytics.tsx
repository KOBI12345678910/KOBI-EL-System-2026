import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  BarChart3, PhoneCall, Clock, Star, ShieldCheck,
  TrendingUp, TrendingDown, RotateCcw, Users, AlertTriangle,
  Package, Target, ThermometerSun, Layers
} from "lucide-react";

/* ───── fault type data ───── */
const faultTypes = [
  { type: "נזילת מים מהמסגרת", count: 9, avgHours: 5.2, cost: 2800, trend: "up" as const },
  { type: "תקלת מנוע חשמלי", count: 7, avgHours: 8.4, cost: 4200, trend: "up" as const },
  { type: "שבר בזכוכית מבודדת", count: 6, avgHours: 4.8, cost: 3600, trend: "down" as const },
  { type: "קורוזיה בפרופיל", count: 5, avgHours: 7.1, cost: 2100, trend: "up" as const },
  { type: "ציר/מנגנון סגירה שבור", count: 4, avgHours: 3.5, cost: 1400, trend: "down" as const },
  { type: "רעש חריג בהפעלה", count: 4, avgHours: 6.0, cost: 1800, trend: "up" as const },
  { type: "בעיית איטום גומיות", count: 4, avgHours: 3.2, cost: 950, trend: "down" as const },
  { type: "תקלת בקר/שלט", count: 3, avgHours: 4.0, cost: 1650, trend: "down" as const },
];

/* ───── technician performance ───── */
const technicians = [
  { name: "יוסי כהן", cases: 11, avgHours: 5.1, firstFix: 82, rating: 4.5 },
  { name: "מוטי לוי", cases: 9, avgHours: 6.3, firstFix: 78, rating: 4.3 },
  { name: "אבי דוד", cases: 8, avgHours: 5.8, firstFix: 88, rating: 4.6 },
  { name: "רפי אזולאי", cases: 7, avgHours: 7.2, firstFix: 71, rating: 4.0 },
  { name: "שמעון ביטון", cases: 6, avgHours: 6.9, firstFix: 67, rating: 3.9 },
  { name: "עמית גולן", cases: 5, avgHours: 4.6, firstFix: 90, rating: 4.7 },
  { name: "דני מזרחי", cases: 4, avgHours: 8.1, firstFix: 75, rating: 4.1 },
  { name: "אורי שפירא", cases: 3, avgHours: 5.5, firstFix: 80, rating: 4.4 },
];

/* ───── product failure analysis ───── */
const productFailures = [
  { product: "חלונות אלומיניום", installed: 320, failures: 14, rate: 4.4, commonFault: "נזילת מים מהמסגרת", avgAge: "2.1 שנים" },
  { product: "דלתות כניסה", installed: 185, failures: 9, rate: 4.9, commonFault: "ציר/מנגנון סגירה שבור", avgAge: "1.8 שנים" },
  { product: "ויטרינות זכוכית", installed: 95, failures: 7, rate: 7.4, commonFault: "שבר בזכוכית מבודדת", avgAge: "1.3 שנים" },
  { product: "מעקות אלומיניום", installed: 210, failures: 5, rate: 2.4, commonFault: "קורוזיה בפרופיל", avgAge: "3.2 שנים" },
  { product: "שערים חשמליים", installed: 78, failures: 10, rate: 12.8, commonFault: "תקלת מנוע חשמלי", avgAge: "1.5 שנים" },
  { product: "תריסי גלילה", installed: 145, failures: 6, rate: 4.1, commonFault: "רעש חריג בהפעלה", avgAge: "2.4 שנים" },
  { product: "פרגולות", installed: 62, failures: 2, rate: 3.2, commonFault: "בעיית איטום גומיות", avgAge: "2.8 שנים" },
];

/* ───── satisfaction trend (6 months) ───── */
const satisfactionTrend = [
  { month: "נובמבר", rating: 3.8, responses: 28 },
  { month: "דצמבר", rating: 3.9, responses: 31 },
  { month: "ינואר", rating: 4.0, responses: 35 },
  { month: "פברואר", rating: 4.1, responses: 29 },
  { month: "מרץ", rating: 4.3, responses: 38 },
  { month: "אפריל", rating: 4.2, responses: 24 },
];

/* ───── root cause pareto ───── */
const rootCauses = [
  { cause: "התקנה לקויה", count: 14, pct: 33 },
  { cause: "חומר גלם פגום", count: 8, pct: 19 },
  { cause: "בלאי טבעי", count: 7, pct: 17 },
  { cause: "תנאי מזג אוויר", count: 7, pct: 17 },
  { cause: "שימוש לא תקין", count: 6, pct: 14 },
];

const cumulativePercents = rootCauses.reduce<number[]>((acc, rc) => {
  acc.push((acc.length > 0 ? acc[acc.length - 1] : 0) + rc.pct);
  return acc;
}, []);

export default function ServiceAnalytics() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-7 w-7 text-cyan-400" /> אנליטיקת שירות
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          טכנו-כל עוזי — ניתוח ביצועי שירות, תקלות, טכנאים ומגמות שביעות רצון
        </p>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "קריאות החודש", value: "42", color: "text-blue-400", icon: PhoneCall, trend: "+6", up: false },
          { label: "First-Fix Rate", value: "78%", color: "text-emerald-400", icon: Target, trend: "+3%", up: true },
          { label: "MTTR", value: "6.5 שעות", color: "text-purple-400", icon: Clock, trend: "-0.8", up: true },
          { label: "עמידה ב-SLA", value: "87%", color: "text-cyan-400", icon: ShieldCheck, trend: "+2%", up: true },
          { label: "חזרות", value: "8%", color: "text-amber-400", icon: RotateCcw, trend: "-1%", up: true },
          { label: "שביעות רצון", value: "4.2/5", color: "text-yellow-400", icon: Star, trend: "+0.1", up: true },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className="bg-card/80 border-border hover:border-border/80 transition-colors">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] text-muted-foreground">{kpi.label}</p>
                    <p className={`text-lg font-bold font-mono mt-1 ${kpi.color}`}>{kpi.value}</p>
                    <div className="flex items-center gap-1 mt-1">
                      {kpi.up ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                      <span className={`text-[10px] ${kpi.up ? "text-emerald-400" : "text-red-400"}`}>{kpi.trend}</span>
                    </div>
                  </div>
                  <Icon className={`h-5 w-5 ${kpi.color} opacity-40`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="overview" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> סקירה</TabsTrigger>
          <TabsTrigger value="faults" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> תקלות</TabsTrigger>
          <TabsTrigger value="technicians" className="text-xs gap-1"><Users className="h-3.5 w-3.5" /> טכנאים</TabsTrigger>
          <TabsTrigger value="products" className="text-xs gap-1"><Package className="h-3.5 w-3.5" /> מוצרים</TabsTrigger>
          <TabsTrigger value="trends" className="text-xs gap-1"><TrendingUp className="h-3.5 w-3.5" /> מגמות</TabsTrigger>
        </TabsList>

        {/* ── Tab: Overview ── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          {/* Root Cause Pareto */}
          <Card className="bg-card/80 border-border">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                <Layers className="h-4 w-4 text-cyan-400" /> ניתוח פארטו — גורם שורש
              </h3>
              <div className="space-y-3">
                {rootCauses.map((rc, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-28 text-xs text-foreground truncate">{rc.cause}</span>
                    <div className="flex-1">
                      <Progress value={rc.pct} className="h-2.5" />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-10 text-left">{rc.count}</span>
                    <span className="text-xs font-mono text-cyan-400 w-12 text-left">{rc.pct}%</span>
                    <Badge className="text-[10px] bg-blue-500/20 text-blue-400 w-14 justify-center">
                      {cumulativePercents[i]}%
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Satisfaction Trend */}
          <Card className="bg-card/80 border-border">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                <Star className="h-4 w-4 text-yellow-400" /> מגמת שביעות רצון — 6 חודשים אחרונים
              </h3>
              <div className="grid grid-cols-6 gap-2">
                {satisfactionTrend.map((m, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className="w-full bg-muted/30 rounded-md relative" style={{ height: 90 }}>
                      <div className="absolute bottom-0 w-full rounded-md bg-yellow-500/30 border border-yellow-500/50" style={{ height: `${(m.rating / 5) * 100}%` }} />
                    </div>
                    <span className="text-sm font-bold font-mono text-yellow-400">{m.rating}</span>
                    <span className="text-[10px] text-muted-foreground">{m.month}</span>
                    <span className="text-[10px] text-muted-foreground">{m.responses} משיבים</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Faults ── */}
        <TabsContent value="faults" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">סוג תקלה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">כמות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">זמן טיפול ממוצע</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">עלות ממוצעת</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">התפלגות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מגמה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {faultTypes.map((f, i) => {
                      const pct = Math.round((f.count / 42) * 100);
                      return (
                        <TableRow key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <TableCell className="text-xs font-medium text-foreground">{f.type}</TableCell>
                          <TableCell className="font-mono text-xs text-blue-400">{f.count}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{f.avgHours} שעות</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">₪{f.cost.toLocaleString("he-IL")}</TableCell>
                          <TableCell className="min-w-[100px]">
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="h-1.5 flex-1" />
                              <span className="text-[10px] font-mono text-muted-foreground">{pct}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {f.trend === "up"
                              ? <Badge className="text-[10px] bg-red-500/20 text-red-400 gap-0.5"><TrendingUp className="h-3 w-3" /> עולה</Badge>
                              : <Badge className="text-[10px] bg-emerald-500/20 text-emerald-400 gap-0.5"><TrendingDown className="h-3 w-3" /> יורד</Badge>
                            }
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Technicians ── */}
        <TabsContent value="technicians" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">דירוג</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">טכנאי</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">קריאות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">זמן ממוצע</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">First-Fix Rate</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">דירוג לקוח</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {technicians.map((t, i) => (
                      <TableRow key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <TableCell>
                          <Badge className={`text-[10px] w-6 justify-center ${i < 3 ? "bg-yellow-500/20 text-yellow-400" : "bg-zinc-500/20 text-zinc-400"}`}>
                            {i + 1}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground flex items-center gap-1">
                          <Users className="h-3 w-3 text-muted-foreground" />{t.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-blue-400">{t.cases}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{t.avgHours} שעות</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[100px]">
                            <Progress value={t.firstFix} className="h-1.5 flex-1" />
                            <span className={`text-[10px] font-mono ${t.firstFix >= 80 ? "text-emerald-400" : t.firstFix >= 70 ? "text-amber-400" : "text-red-400"}`}>
                              {t.firstFix}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Star className={`h-3 w-3 ${t.rating >= 4.5 ? "text-yellow-400" : "text-muted-foreground"}`} />
                            <span className="font-mono text-xs text-foreground">{t.rating}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Products ── */}
        <TabsContent value="products" className="mt-4">
          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border bg-background/50">
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מוצר</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">מותקנים</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">תקלות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">אחוז כשל</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">תקלה נפוצה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-muted-foreground">גיל ממוצע לתקלה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productFailures.map((p, i) => (
                      <TableRow key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <TableCell className="text-xs font-medium text-foreground">{p.product}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.installed}</TableCell>
                        <TableCell className="font-mono text-xs text-blue-400">{p.failures}</TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${p.rate > 10 ? "bg-red-500/20 text-red-400" : p.rate > 5 ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                            {p.rate}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{p.commonFault}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{p.avgAge}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: Trends ── */}
        <TabsContent value="trends" className="mt-4 space-y-4">
          {/* Satisfaction Trend */}
          <Card className="bg-card/80 border-border">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                <Star className="h-4 w-4 text-yellow-400" /> מגמת שביעות רצון לקוחות
              </h3>
              <div className="grid grid-cols-6 gap-2">
                {satisfactionTrend.map((m, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className="w-full bg-muted/30 rounded-md relative" style={{ height: 90 }}>
                      <div className="absolute bottom-0 w-full rounded-md bg-yellow-500/30 border border-yellow-500/50" style={{ height: `${(m.rating / 5) * 100}%` }} />
                    </div>
                    <span className="text-sm font-bold font-mono text-yellow-400">{m.rating}</span>
                    <span className="text-[10px] text-muted-foreground">{m.month}</span>
                    <span className="text-[10px] text-muted-foreground">{m.responses} משיבים</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Monthly KPI comparison */}
          <Card className="bg-card/80 border-border">
            <CardContent className="p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                <ThermometerSun className="h-4 w-4 text-orange-400" /> השוואת מדדים חודשית
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "קריאות — מרץ", val: 36, prev: "פברואר: 31", pct: 16, up: false },
                  { label: "MTTR — מרץ", val: "6.5 שעות", prev: "פברואר: 7.3", pct: 11, up: true },
                  { label: "SLA — מרץ", val: "87%", prev: "פברואר: 84%", pct: 3, up: true },
                  { label: "חזרות — מרץ", val: "8%", prev: "פברואר: 9%", pct: 11, up: true },
                ].map((m, i) => (
                  <Card key={i} className="bg-muted/20 border-border/50">
                    <CardContent className="p-3">
                      <p className="text-[10px] text-muted-foreground">{m.label}</p>
                      <p className="text-lg font-bold font-mono text-foreground mt-1">{m.val}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{m.prev}</p>
                      <div className="flex items-center gap-1 mt-1">
                        {m.up ? <TrendingUp className="h-3 w-3 text-emerald-400" /> : <TrendingDown className="h-3 w-3 text-red-400" />}
                        <span className={`text-[10px] ${m.up ? "text-emerald-400" : "text-red-400"}`}>{m.pct}%</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
