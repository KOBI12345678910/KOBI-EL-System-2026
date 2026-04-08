import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, ShieldAlert, Clock, FileX, Ship, TrendingUp, TrendingDown, DollarSign, Globe, CheckCircle, XCircle, ArrowUpRight } from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low";
const SEV: Record<Severity, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/40",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/40",
  medium: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  low: "bg-blue-500/20 text-blue-400 border-blue-500/40",
};
const SEV_LABEL: Record<Severity, string> = { critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך" };

const alerts = [
  { id: "ALR-001", type: "missing_document", title: "מסמך חסר - שטר מטען", shipment: "SHP-2041", supplier: "Foshan Glass Co.", severity: "critical" as Severity, time: "לפני 12 דקות", desc: "שטר מטען (B/L) חסר למשלוח SHP-2041, עיכוב שחרור צפוי" },
  { id: "ALR-002", type: "shipment_delayed", title: "עיכוב משלוח - 6 ימים", shipment: "SHP-2038", supplier: "Schuco International", severity: "critical" as Severity, time: "לפני שעה", desc: "משלוח SHP-2038 מגרמניה מעוכב 6 ימים בנמל המבורג" },
  { id: "ALR-003", type: "eta_changed", title: "שינוי ETA - דחייה ב-4 ימים", shipment: "SHP-2040", supplier: "Alumil SA", severity: "high" as Severity, time: "לפני 2 שעות", desc: "ETA עודכן מ-12/04 ל-16/04. סטיית מסלול באגאי" },
  { id: "ALR-004", type: "customs_hold", title: "עצירת מכס - בדיקת תקן", shipment: "SHP-2035", supplier: "Technal India", severity: "critical" as Severity, time: "לפני 3 שעות", desc: "משלוח עוצר בבדיקת מכון התקנים, חסר אישור SI" },
  { id: "ALR-005", type: "freight_increase", title: "עליית הובלה +18%", shipment: "SHP-2042", supplier: "YiLida Hardware", severity: "high" as Severity, time: "לפני 4 שעות", desc: "מחיר הובלה ימית מסין עלה ב-18%, חריגה מתקציב" },
  { id: "ALR-006", type: "landed_cost_above_threshold", title: "חריגת Landed Cost +12%", shipment: "SHP-2039", supplier: "Foshan Glass Co.", severity: "high" as Severity, time: "לפני 5 שעות", desc: "עלות נחיתה חורגת ב-12% מהתחזית, דמי השהיה גבוהים" },
  { id: "ALR-007", type: "shortage", title: "חוסר - 200 יח' פרופיל", shipment: "SHP-2036", supplier: "Alumil SA", severity: "medium" as Severity, time: "לפני 6 שעות", desc: "נספרו 800 במקום 1000 יח' פרופיל אלומיניום 6060" },
  { id: "ALR-008", type: "damage", title: "נזק למטען - 15 יח' פגומות", shipment: "SHP-2033", supplier: "Schuco International", severity: "medium" as Severity, time: "לפני 8 שעות", desc: "15 פרופילים נמצאו פגומים, דווח לביטוח" },
  { id: "ALR-009", type: "clearance_stuck", title: "שחרור תקוע - 5 ימים", shipment: "SHP-2034", supplier: "Guangdong Metals", severity: "high" as Severity, time: "לפני 10 שעות", desc: "שחרור ממכס תקוע 5 ימים, חסר אישור תקן ישראלי" },
  { id: "ALR-010", type: "supplier_delay", title: "עיכוב ספק - ייצור באיחור", shipment: "SHP-2043", supplier: "Technal India", severity: "medium" as Severity, time: "לפני 12 שעות", desc: "ספק מדווח עיכוב 10 ימים בייצור, בעיית חומר גלם" },
  { id: "ALR-011", type: "exchange_rate_spike", title: "זינוק שער EUR +3.2%", shipment: "---", supplier: "כלל ספקי אירופה", severity: "high" as Severity, time: "לפני יום", desc: "שער EUR/ILS עלה ב-3.2% תוך שבוע, חשיפה של 480K ILS" },
  { id: "ALR-012", type: "demurrage_risk", title: "סיכון דמי השהיה - SHP-2037", shipment: "SHP-2037", supplier: "YiLida Hardware", severity: "medium" as Severity, time: "לפני יום", desc: "מכולה בנמל אשדוד 8 ימים, דמי השהיה $150/יום" },
];

const countryRiskMatrix = [
  { country: "טורקיה", flag: "🇹🇷", political: 72, economic: 65, logistics: 58, overall: 65, trend: "up" },
  { country: "סין", flag: "🇨🇳", political: 55, economic: 45, logistics: 42, overall: 47, trend: "stable" },
  { country: "גרמניה", flag: "🇩🇪", political: 15, economic: 20, logistics: 18, overall: 18, trend: "stable" },
  { country: "איטליה", flag: "🇮🇹", political: 30, economic: 38, logistics: 32, overall: 33, trend: "down" },
  { country: "הודו", flag: "🇮🇳", political: 48, economic: 52, logistics: 62, overall: 54, trend: "up" },
  { country: "יוון", flag: "🇬🇷", political: 35, economic: 42, logistics: 28, overall: 35, trend: "stable" },
  { country: "ספרד", flag: "🇪🇸", political: 22, economic: 28, logistics: 24, overall: 25, trend: "down" },
  { country: "פולין", flag: "🇵🇱", political: 40, economic: 32, logistics: 30, overall: 34, trend: "stable" },
];

const currencyExposure = [
  { currency: "USD", symbol: "$", position: 285000, hedged: 180000, open: 105000, rate: 3.72, weekChange: +1.1, monthChange: +2.8 },
  { currency: "EUR", symbol: "\u20AC", position: 198000, hedged: 120000, open: 78000, rate: 4.05, weekChange: +3.2, monthChange: +4.1 },
  { currency: "CNY", symbol: "\u00A5", position: 420000, hedged: 300000, open: 120000, rate: 0.52, weekChange: -0.4, monthChange: +1.2 },
];

const resolvedAlerts = [
  { id: "ALR-R01", title: "מסמך חסר - C/O", resolved: "05/04/2026", by: "יוסי כהן", duration: "4 שעות", type: "missing_document" },
  { id: "ALR-R02", title: "עיכוב משלוח SHP-2030", resolved: "03/04/2026", by: "שרה לוי", duration: "2 ימים", type: "shipment_delayed" },
  { id: "ALR-R03", title: "חריגת Landed Cost SHP-2028", resolved: "01/04/2026", by: "דוד מזרחי", duration: "6 שעות", type: "landed_cost_above_threshold" },
  { id: "ALR-R04", title: "עצירת מכס SHP-2025", resolved: "29/03/2026", by: "רחל אברהם", duration: "3 ימים", type: "customs_hold" },
  { id: "ALR-R05", title: "זינוק שער USD", resolved: "27/03/2026", by: "אלון גולדשטיין", duration: "1 יום", type: "exchange_rate_spike" },
  { id: "ALR-R06", title: "נזק למטען SHP-2022", resolved: "25/03/2026", by: "מיכל ברק", duration: "5 ימים", type: "damage" },
  { id: "ALR-R07", title: "סיכון דמי השהיה SHP-2020", resolved: "22/03/2026", by: "עומר חדד", duration: "1 יום", type: "demurrage_risk" },
  { id: "ALR-R08", title: "חוסר במשלוח SHP-2018", resolved: "20/03/2026", by: "נועה פרידמן", duration: "4 ימים", type: "shortage" },
];

const riskColor = (v: number) => v >= 60 ? "text-red-400" : v >= 40 ? "text-orange-400" : v >= 25 ? "text-amber-400" : "text-green-400";
const riskBg = (v: number) => v >= 60 ? "bg-red-500" : v >= 40 ? "bg-orange-500" : v >= 25 ? "bg-amber-500" : "bg-green-500";

export default function ImportRiskAlerts() {
  const [tab, setTab] = useState("alerts");
  const criticalCount = alerts.filter(a => a.severity === "critical").length;
  const highCount = alerts.filter(a => a.severity === "high").length;
  const mediumCount = alerts.filter(a => a.severity === "medium").length;
  const totalExposure = currencyExposure.reduce((s, c) => s + c.open * c.rate, 0);
  const delayedShipments = alerts.filter(a => ["shipment_delayed", "clearance_stuck", "supplier_delay"].includes(a.type)).length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="relative">
          <AlertTriangle className="h-8 w-8 text-red-400" />
          <span className="absolute -top-1 -left-1 h-3 w-3 bg-red-500 rounded-full animate-pulse" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">סיכונים והתראות יבוא</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי - מערכת בקרת סיכוני יבוא</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-5 pb-4 text-center">
            <ShieldAlert className="h-5 w-5 mx-auto text-red-400 mb-1" />
            <p className="text-[11px] text-muted-foreground">סיכונים פעילים</p>
            <p className="text-2xl font-bold font-mono text-red-400">{alerts.length}</p>
          </CardContent>
        </Card>
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="pt-5 pb-4 text-center">
            <XCircle className="h-5 w-5 mx-auto text-red-500 mb-1" />
            <p className="text-[11px] text-muted-foreground">קריטי</p>
            <p className="text-2xl font-bold font-mono text-red-500">{criticalCount}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-500/30 bg-orange-500/5">
          <CardContent className="pt-5 pb-4 text-center">
            <AlertTriangle className="h-5 w-5 mx-auto text-orange-400 mb-1" />
            <p className="text-[11px] text-muted-foreground">גבוה</p>
            <p className="text-2xl font-bold font-mono text-orange-400">{highCount}</p>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-5 pb-4 text-center">
            <Clock className="h-5 w-5 mx-auto text-amber-400 mb-1" />
            <p className="text-[11px] text-muted-foreground">בינוני</p>
            <p className="text-2xl font-bold font-mono text-amber-400">{mediumCount}</p>
          </CardContent>
        </Card>
        <Card className="border-cyan-500/30 bg-cyan-500/5">
          <CardContent className="pt-5 pb-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-cyan-400 mb-1" />
            <p className="text-[11px] text-muted-foreground">חשיפת מטבע</p>
            <p className="text-xl font-bold font-mono text-cyan-400">{(totalExposure / 1000).toFixed(0)}K</p>
          </CardContent>
        </Card>
        <Card className="border-purple-500/30 bg-purple-500/5">
          <CardContent className="pt-5 pb-4 text-center">
            <Ship className="h-5 w-5 mx-auto text-purple-400 mb-1" />
            <p className="text-[11px] text-muted-foreground">משלוחים מעוכבים</p>
            <p className="text-2xl font-bold font-mono text-purple-400">{delayedShipments}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger value="alerts" className="data-[state=active]:bg-red-500/20 data-[state=active]:text-red-400">התראות פעילות</TabsTrigger>
          <TabsTrigger value="matrix" className="data-[state=active]:bg-orange-500/20 data-[state=active]:text-orange-400">מטריצת סיכון</TabsTrigger>
          <TabsTrigger value="currency" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">חשיפת מטבע</TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-green-500/20 data-[state=active]:text-green-400">היסטוריה</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-3 mt-4">
          {alerts.map(a => (
            <Card key={a.id} className={`border ${a.severity === "critical" ? "border-red-500/40 bg-red-500/5" : a.severity === "high" ? "border-orange-500/30 bg-orange-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`${SEV[a.severity]} border text-xs`}>{SEV_LABEL[a.severity]}</Badge>
                      <span className="font-mono text-xs text-muted-foreground">{a.id}</span>
                      <span className="text-xs text-muted-foreground">{a.time}</span>
                    </div>
                    <p className="font-semibold text-foreground">{a.title}</p>
                    <p className="text-sm text-muted-foreground">{a.desc}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
                      <span className="flex items-center gap-1"><Ship className="h-3 w-3" />{a.shipment}</span>
                      <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{a.supplier}</span>
                    </div>
                  </div>
                  <div className={`w-2 h-16 rounded-full ${a.severity === "critical" ? "bg-red-500 animate-pulse" : a.severity === "high" ? "bg-orange-500" : "bg-amber-500"}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="matrix" className="mt-4">
          <Card className="border-border">
            <CardHeader><CardTitle className="text-base">מטריצת סיכון לפי מדינה</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מדינה</TableHead>
                    <TableHead className="text-right">פוליטי</TableHead>
                    <TableHead className="text-right">כלכלי</TableHead>
                    <TableHead className="text-right">לוגיסטי</TableHead>
                    <TableHead className="text-right">כולל</TableHead>
                    <TableHead className="text-right">מגמה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {countryRiskMatrix.map(c => (
                    <TableRow key={c.country}>
                      <TableCell className="font-medium">
                        <span className="ml-2">{c.flag}</span>{c.country}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={c.political} className={`h-2 w-16 [&>div]:${riskBg(c.political)}`} />
                          <span className={`font-mono text-xs ${riskColor(c.political)}`}>{c.political}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={c.economic} className={`h-2 w-16 [&>div]:${riskBg(c.economic)}`} />
                          <span className={`font-mono text-xs ${riskColor(c.economic)}`}>{c.economic}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={c.logistics} className={`h-2 w-16 [&>div]:${riskBg(c.logistics)}`} />
                          <span className={`font-mono text-xs ${riskColor(c.logistics)}`}>{c.logistics}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`${c.overall >= 60 ? "bg-red-500/20 text-red-400" : c.overall >= 40 ? "bg-orange-500/20 text-orange-400" : c.overall >= 25 ? "bg-amber-500/20 text-amber-400" : "bg-green-500/20 text-green-400"} border-0 font-mono`}>
                          {c.overall}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {c.trend === "up" && <TrendingUp className="h-4 w-4 text-red-400" />}
                        {c.trend === "down" && <TrendingDown className="h-4 w-4 text-green-400" />}
                        {c.trend === "stable" && <ArrowUpRight className="h-4 w-4 text-muted-foreground rotate-90" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="currency" className="mt-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-cyan-500/30 bg-cyan-500/5">
              <CardContent className="p-4 text-center">
                <p className="text-[11px] text-muted-foreground">סה"כ פוזיציות</p>
                <p className="text-lg font-bold font-mono text-cyan-400">
                  {(currencyExposure.reduce((s, c) => s + c.position * c.rate, 0) / 1000).toFixed(0)}K ILS
                </p>
              </CardContent>
            </Card>
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="p-4 text-center">
                <p className="text-[11px] text-muted-foreground">סה"כ מגודר</p>
                <p className="text-lg font-bold font-mono text-green-400">
                  {(currencyExposure.reduce((s, c) => s + c.hedged * c.rate, 0) / 1000).toFixed(0)}K ILS
                </p>
              </CardContent>
            </Card>
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="p-4 text-center">
                <p className="text-[11px] text-muted-foreground">סה"כ חשיפה פתוחה</p>
                <p className="text-lg font-bold font-mono text-red-400">
                  {(totalExposure / 1000).toFixed(0)}K ILS
                </p>
              </CardContent>
            </Card>
          </div>
          {currencyExposure.map(c => (
            <Card key={c.currency} className="border-border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-bold font-mono text-cyan-400">{c.symbol}</span>
                    <div>
                      <p className="font-semibold text-foreground">{c.currency}/ILS</p>
                      <p className="text-xs text-muted-foreground">שער: {c.rate.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <div className="text-center">
                      <p className="text-[11px] text-muted-foreground">שבועי</p>
                      <p className={`font-mono font-bold ${c.weekChange > 0 ? "text-red-400" : "text-green-400"}`}>
                        {c.weekChange > 0 ? "+" : ""}{c.weekChange}%
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] text-muted-foreground">חודשי</p>
                      <p className={`font-mono font-bold ${c.monthChange > 0 ? "text-red-400" : "text-green-400"}`}>
                        {c.monthChange > 0 ? "+" : ""}{c.monthChange}%
                      </p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/30 rounded-lg p-3 text-center">
                    <p className="text-[11px] text-muted-foreground">פוזיציה כוללת</p>
                    <p className="font-mono font-bold text-foreground">{c.symbol}{c.position.toLocaleString()}</p>
                  </div>
                  <div className="bg-green-500/10 rounded-lg p-3 text-center">
                    <p className="text-[11px] text-muted-foreground">מגודר</p>
                    <p className="font-mono font-bold text-green-400">{c.symbol}{c.hedged.toLocaleString()}</p>
                  </div>
                  <div className="bg-red-500/10 rounded-lg p-3 text-center">
                    <p className="text-[11px] text-muted-foreground">חשיפה פתוחה</p>
                    <p className="font-mono font-bold text-red-400">{c.symbol}{c.open.toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>כיסוי גידור</span>
                    <span className="font-mono">{((c.hedged / c.position) * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={(c.hedged / c.position) * 100} className="h-2" />
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="border-border">
            <CardHeader><CardTitle className="text-base">התראות שטופלו</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מזהה</TableHead>
                    <TableHead className="text-right">התראה</TableHead>
                    <TableHead className="text-right">תאריך טיפול</TableHead>
                    <TableHead className="text-right">טופל ע"י</TableHead>
                    <TableHead className="text-right">זמן טיפול</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolvedAlerts.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.id}</TableCell>
                      <TableCell className="font-medium text-foreground">{r.title}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{r.resolved}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{r.by}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{r.duration}</TableCell>
                      <TableCell><Badge className="bg-green-500/20 text-green-400 border-0"><CheckCircle className="h-3 w-3 ml-1" />טופל</Badge></TableCell>
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
