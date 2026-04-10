import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Gauge, Activity, CheckCircle2, AlertTriangle, Clock, TrendingUp, TrendingDown, Search, Download, Settings2, Zap, ShieldCheck, BarChart3, Timer } from "lucide-react";

const FALLBACK_PRODUCTION_LINES = [
  { id: "L1", name: "קו חיתוך אלומיניום A", oee: 87.3, availability: 92.1, performance: 96.5, quality: 98.2, status: "מעולה", product: "פרופיל אלומיניום 6060" },
  { id: "L2", name: "קו חיתוך אלומיניום B", oee: 78.5, availability: 85.0, performance: 94.2, quality: 98.0, status: "טוב", product: "פרופיל אלומיניום 6063" },
  { id: "L3", name: "קו כיפוף מתכת", oee: 72.1, availability: 80.3, performance: 91.8, quality: 97.5, status: "בינוני", product: "מסגרות פלדה" },
  { id: "L4", name: "קו ריתוך אוטומטי", oee: 91.2, availability: 95.5, performance: 97.0, quality: 98.5, status: "מעולה", product: "מבנים מרותכים" },
  { id: "L5", name: "קו ציפוי אבקתי", oee: 68.4, availability: 78.2, performance: 89.5, quality: 97.8, status: "נמוך", product: "אלומיניום צבוע" },
  { id: "L6", name: "קו זיגוג כפול", oee: 82.6, availability: 90.1, performance: 93.3, quality: 98.3, status: "טוב", product: "יחידות זכוכית מבודדת" },
  { id: "L7", name: "קו הרכבה ראשי", oee: 85.0, availability: 91.8, performance: 94.7, quality: 97.6, status: "טוב", product: "חלונות מוגמרים" },
  { id: "L8", name: "קו חיתוך זכוכית", oee: 76.9, availability: 83.5, performance: 93.8, quality: 98.1, status: "בינוני", product: "זכוכית מחוסמת" },
];

const FALLBACK_MACHINE_UPTIME = [
  { machine: "מכונת חיתוך CNC #1", uptime: 94.2, downtime: 5.8, plannedDown: 3.2, unplannedDown: 2.6, lastIncident: "תקלת סרוו", status: "פעיל" },
  { machine: "מכונת חיתוך CNC #2", uptime: 88.5, downtime: 11.5, plannedDown: 6.0, unplannedDown: 5.5, lastIncident: "שחיקת כלי", status: "פעיל" },
  { machine: "מכבש הידראולי 200T", uptime: 96.1, downtime: 3.9, plannedDown: 2.5, unplannedDown: 1.4, lastIncident: "דליפת שמן", status: "פעיל" },
  { machine: "תנור ציפוי אבקתי", uptime: 78.3, downtime: 21.7, plannedDown: 8.0, unplannedDown: 13.7, lastIncident: "תקלת חימום", status: "תחזוקה" },
  { machine: "רובוט ריתוך KUKA", uptime: 97.5, downtime: 2.5, plannedDown: 2.0, unplannedDown: 0.5, lastIncident: "כיול חיישן", status: "פעיל" },
  { machine: "מכונת זיגוג אוטומטית", uptime: 91.0, downtime: 9.0, plannedDown: 4.5, unplannedDown: 4.5, lastIncident: "סתימת דיזה", status: "פעיל" },
  { machine: "מכונת כיפוף CNC", uptime: 85.7, downtime: 14.3, plannedDown: 7.0, unplannedDown: 7.3, lastIncident: "תקלת בקר", status: "פעיל" },
  { machine: "שולחן חיתוך זכוכית", uptime: 89.3, downtime: 10.7, plannedDown: 5.5, unplannedDown: 5.2, lastIncident: "החלפת גלגל", status: "פעיל" },
];

const FALLBACK_PERFORMANCE_DATA = [
  { line: "קו חיתוך אלומיניום A", theoretical: 120, actual: 116, rate: 96.5, gap: 4, reason: "החלפת כלי" },
  { line: "קו חיתוך אלומיניום B", theoretical: 120, actual: 113, rate: 94.2, gap: 7, reason: "הזנה איטית" },
  { line: "קו כיפוף מתכת", theoretical: 80, actual: 73, rate: 91.8, gap: 7, reason: "חומר קשה" },
  { line: "קו ריתוך אוטומטי", theoretical: 60, actual: 58, rate: 97.0, gap: 2, reason: "---" },
  { line: "קו ציפוי אבקתי", theoretical: 200, actual: 179, rate: 89.5, gap: 21, reason: "עצירות חוזרות" },
  { line: "קו זיגוג כפול", theoretical: 90, actual: 84, rate: 93.3, gap: 6, reason: "כיול איטי" },
  { line: "קו הרכבה ראשי", theoretical: 45, actual: 43, rate: 94.7, gap: 2, reason: "---" },
  { line: "קו חיתוך זכוכית", theoretical: 150, actual: 141, rate: 93.8, gap: 9, reason: "פגם בחומר גלם" },
];

const FALLBACK_QUALITY_DATA = [
  { product: "פרופיל אלומיניום 6060", fpy: 98.2, defectRate: 1.8, scrap: 0.5, rework: 1.3, topDefect: "שריטות משטח" },
  { product: "פרופיל אלומיניום 6063", fpy: 98.0, defectRate: 2.0, scrap: 0.7, rework: 1.3, topDefect: "סטיית מידות" },
  { product: "מסגרות פלדה", fpy: 97.5, defectRate: 2.5, scrap: 1.0, rework: 1.5, topDefect: "ריתוך לקוי" },
  { product: "מבנים מרותכים", fpy: 98.5, defectRate: 1.5, scrap: 0.3, rework: 1.2, topDefect: "עיוות תרמי" },
  { product: "אלומיניום צבוע", fpy: 97.8, defectRate: 2.2, scrap: 0.8, rework: 1.4, topDefect: "קילוף ציפוי" },
  { product: "יחידות זכוכית מבודדת", fpy: 98.3, defectRate: 1.7, scrap: 0.9, rework: 0.8, topDefect: "אטימות לקויה" },
  { product: "חלונות מוגמרים", fpy: 97.6, defectRate: 2.4, scrap: 0.6, rework: 1.8, topDefect: "התאמת מידות" },
  { product: "זכוכית מחוסמת", fpy: 98.1, defectRate: 1.9, scrap: 1.1, rework: 0.8, topDefect: "שבר במחסום" },
];

const SC: Record<string, string> = {
  "מעולה": "bg-green-500/20 text-green-400 border-green-500/30",
  "טוב": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "בינוני": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "נמוך": "bg-red-500/20 text-red-400 border-red-500/30",
};

export default function OeeDashboard() {
  const { data: oeedashboardData } = useQuery({
    queryKey: ["oee-dashboard"],
    queryFn: () => authFetch("/api/operations/oee_dashboard"),
    staleTime: 5 * 60 * 1000,
  });

  const productionLines = oeedashboardData ?? FALLBACK_PRODUCTION_LINES;
  const machineUptime = FALLBACK_MACHINE_UPTIME;
  const performanceData = FALLBACK_PERFORMANCE_DATA;
  const qualityData = FALLBACK_QUALITY_DATA;

  const [search, setSearch] = useState("");

  const avgOee = (productionLines.reduce((s, l) => s + l.oee, 0) / productionLines.length).toFixed(1);
  const avgAvail = (productionLines.reduce((s, l) => s + l.availability, 0) / productionLines.length).toFixed(1);
  const avgPerf = (productionLines.reduce((s, l) => s + l.performance, 0) / productionLines.length).toFixed(1);
  const avgQual = (productionLines.reduce((s, l) => s + l.quality, 0) / productionLines.length).toFixed(1);
  const plannedDown = "18.2 שעות";
  const unplannedDown = "9.8 שעות";

  const kpis = [
    { label: "OEE ממוצע", value: `${avgOee}%`, icon: Gauge, color: "text-blue-400", bg: "bg-blue-500/10", target: "85%", trend: "+2.1%" },
    { label: "זמינות ממוצעת", value: `${avgAvail}%`, icon: Activity, color: "text-green-400", bg: "bg-green-500/10", target: "92%", trend: "+1.4%" },
    { label: "ביצועים ממוצעים", value: `${avgPerf}%`, icon: Zap, color: "text-purple-400", bg: "bg-purple-500/10", target: "95%", trend: "-0.3%" },
    { label: "איכות ממוצעת", value: `${avgQual}%`, icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/10", target: "98%", trend: "+0.2%" },
    { label: "השבתה מתוכננת", value: plannedDown, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10", target: "20 שעות", trend: "-1.8 שעות" },
    { label: "השבתה לא מתוכננת", value: unplannedDown, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", target: "5 שעות", trend: "+2.3 שעות" },
  ];

  const filteredLines = productionLines.filter(l =>
    !search || l.name.includes(search) || l.product.includes(search)
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Gauge className="w-7 h-7 text-blue-400" />
            דשבורד OEE - יעילות ציוד כוללת
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי - ניטור ביצועי קווי ייצור בזמן אמת</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא דו"ח</Button>
          <Button variant="outline" size="sm"><Settings2 className="w-4 h-4 ml-1" />הגדרות</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                <span className={`text-xs ${kpi.trend.includes('+') && kpi.label.includes('השבתה לא') ? 'text-red-400' : kpi.trend.includes('+') ? 'text-green-400' : kpi.trend.includes('-') && kpi.label.includes('השבתה') ? 'text-green-400' : 'text-red-400'} flex items-center gap-0.5`}>
                  {kpi.trend.includes('+') ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {kpi.trend}
                </span>
              </div>
              <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">יעד: {kpi.target}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">סקירת OEE</TabsTrigger>
          <TabsTrigger value="availability">זמינות</TabsTrigger>
          <TabsTrigger value="performance">ביצועים</TabsTrigger>
          <TabsTrigger value="quality">איכות</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-blue-400" />פירוט OEE לפי קו ייצור</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש קו ייצור..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredLines.map(line => (
                  <div key={line.id} className="p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-blue-400">{line.id}</span>
                        <span className="font-medium text-foreground">{line.name}</span>
                        <Badge variant="outline" className="text-xs">{line.product}</Badge>
                      </div>
                      <Badge className={SC[line.status]}>{line.status}</Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">OEE</div>
                        <div className="flex items-center gap-2">
                          <Progress value={line.oee} className="h-2 flex-1" />
                          <span className="text-sm font-bold text-foreground w-14 text-left">{line.oee}%</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">זמינות</div>
                        <div className="flex items-center gap-2">
                          <Progress value={line.availability} className="h-2 flex-1" />
                          <span className="text-sm font-bold text-green-400 w-14 text-left">{line.availability}%</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">ביצועים</div>
                        <div className="flex items-center gap-2">
                          <Progress value={line.performance} className="h-2 flex-1" />
                          <span className="text-sm font-bold text-purple-400 w-14 text-left">{line.performance}%</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">איכות</div>
                        <div className="flex items-center gap-2">
                          <Progress value={line.quality} className="h-2 flex-1" />
                          <span className="text-sm font-bold text-emerald-400 w-14 text-left">{line.quality}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="availability" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Timer className="w-5 h-5 text-green-400" />מעקב זמינות מכונות - Uptime / Downtime</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מכונה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">זמן פעילות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">השבתה מתוכננת</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">השבתה לא מתוכננת</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תקלה אחרונה</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machineUptime.map((m, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{m.machine}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={m.uptime} className="h-2 w-20" />
                            <span className="text-green-400 font-medium">{m.uptime}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-amber-400">{m.plannedDown}%</td>
                        <td className="p-3 text-red-400 font-medium">{m.unplannedDown}%</td>
                        <td className="p-3 text-muted-foreground">{m.lastIncident}</td>
                        <td className="p-3 text-center">
                          <Badge className={m.status === "פעיל" ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}>
                            {m.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-purple-400" />ביצועים - תפוקה בפועל מול תיאורטית</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">קו ייצור</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תפוקה תיאורטית</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תפוקה בפועל</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">יחס ביצועים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פער (יח')</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סיבת פער</th>
                    </tr>
                  </thead>
                  <tbody>
                    {performanceData.map((p, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{p.line}</td>
                        <td className="p-3 text-muted-foreground">{p.theoretical} יח'/שעה</td>
                        <td className="p-3 text-foreground font-medium">{p.actual} יח'/שעה</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={p.rate} className="h-2 w-20" />
                            <span className={`font-medium ${p.rate >= 95 ? 'text-green-400' : p.rate >= 90 ? 'text-yellow-400' : 'text-red-400'}`}>{p.rate}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-red-400">-{p.gap}</td>
                        <td className="p-3 text-muted-foreground">{p.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quality" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-400" />איכות - תשואת מעבר ראשון ושיעורי פגמים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מוצר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">FPY</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שיעור פגמים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">גריטה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עיבוד חוזר</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פגם עיקרי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {qualityData.map((q, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{q.product}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={q.fpy} className="h-2 w-16" />
                            <span className="text-green-400 font-medium">{q.fpy}%</span>
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge className={q.defectRate <= 1.8 ? "bg-green-500/20 text-green-400" : q.defectRate <= 2.2 ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}>
                            {q.defectRate}%
                          </Badge>
                        </td>
                        <td className="p-3 text-red-400">{q.scrap}%</td>
                        <td className="p-3 text-amber-400">{q.rework}%</td>
                        <td className="p-3 text-muted-foreground">{q.topDefect}</td>
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
