import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Clock, Timer, TrendingDown, Search, Download, Wrench, BarChart3, Activity, XCircle, Calendar, AlertCircle, CheckCircle2 } from "lucide-react";

const FALLBACK_ACTIVE_DOWNTIMES = [
  { id: "DT-001", machine: "תנור ציפוי אבקתי", reason: "תקלת אלמנט חימום", start: "08:22", duration: "4:15", impact: "עצירת קו ציפוי", severity: "קריטי", technician: "אבי כהן" },
  { id: "DT-002", machine: "מכונת חיתוך CNC #2", reason: "שחיקת כלי חיתוך", start: "10:05", duration: "1:30", impact: "ירידת קצב 40%", severity: "בינוני", technician: "משה לוי" },
  { id: "DT-003", machine: "מכונת כיפוף CNC", reason: "תקלת בקר PLC", start: "11:30", duration: "0:55", impact: "עצירת קו כיפוף", severity: "קריטי", technician: "דני שמש" },
  { id: "DT-004", machine: "מכונת זיגוג אוטומטית", reason: "סתימת דיזת הזרקה", start: "09:45", duration: "2:40", impact: "ירידת איכות", severity: "גבוה", technician: "יוסי ברק" },
  { id: "DT-005", machine: "מסוע הרכבה #3", reason: "תחזוקה מתוכננת", start: "07:00", duration: "5:30", impact: "עיכוב הרכבה", severity: "נמוך", technician: "רועי אדם" },
  { id: "DT-006", machine: "משאבת קירור מרכזית", reason: "דליפת נוזל קירור", start: "12:10", duration: "0:20", impact: "סיכון חימום יתר", severity: "גבוה", technician: "אלי דהן" },
];

const FALLBACK_DOWNTIME_HISTORY = [
  { id: "DT-H01", machine: "מכונת חיתוך CNC #1", reason: "תקלת סרוו מוטור", rootCause: "שחיקת מסבים", date: "07/04", duration: "3:20", resolved: true, cost: 4200 },
  { id: "DT-H02", machine: "מכבש הידראולי 200T", reason: "דליפת שמן הידראולי", rootCause: "אטם פגום", date: "07/04", duration: "1:45", resolved: true, cost: 1800 },
  { id: "DT-H03", machine: "רובוט ריתוך KUKA", reason: "כיול חיישן לייזר", rootCause: "רעידות מצטברות", date: "06/04", duration: "0:50", resolved: true, cost: 650 },
  { id: "DT-H04", machine: "שולחן חיתוך זכוכית", reason: "החלפת גלגל חיתוך", rootCause: "שחיקה נורמלית", date: "06/04", duration: "0:35", resolved: true, cost: 400 },
  { id: "DT-H05", machine: "מכונת חיתוך CNC #2", reason: "תקלת מחסנית כלים", rootCause: "חיישן מיקום תקול", date: "05/04", duration: "2:10", resolved: true, cost: 2800 },
  { id: "DT-H06", machine: "תנור ציפוי אבקתי", reason: "חריגת טמפרטורה", rootCause: "תרמוקפל שרוף", date: "05/04", duration: "4:00", resolved: true, cost: 5100 },
  { id: "DT-H07", machine: "מכונת כיפוף CNC", reason: "שגיאת תוכנה NC", rootCause: "באג בגרסה 4.2", date: "04/04", duration: "1:15", resolved: true, cost: 1200 },
  { id: "DT-H08", machine: "מכונת זיגוג אוטומטית", reason: "לחץ אוויר נמוך", rootCause: "מדחס תקול", date: "04/04", duration: "2:30", resolved: true, cost: 3400 },
  { id: "DT-H09", machine: "מסוע הרכבה #1", reason: "קרע ברצועה", rootCause: "אי יישור", date: "03/04", duration: "1:00", resolved: true, cost: 900 },
  { id: "DT-H10", machine: "מכונת חיתוך CNC #1", reason: "חימום יתר ציר", rootCause: "סינון שמן לקוי", date: "03/04", duration: "1:40", resolved: true, cost: 2100 },
  { id: "DT-H11", machine: "מכבש הידראולי 200T", reason: "תקלת שסתום", rootCause: "לכלוך בנוזל", date: "02/04", duration: "3:00", resolved: true, cost: 3800 },
  { id: "DT-H12", machine: "רובוט ריתוך KUKA", reason: "תקלת תקשורת", rootCause: "כבל רשת פגום", date: "02/04", duration: "0:25", resolved: true, cost: 300 },
  { id: "DT-H13", machine: "שולחן חיתוך זכוכית", reason: "שבר גלגל הובלה", rootCause: "עומס יתר", date: "01/04", duration: "2:00", resolved: true, cost: 2600 },
  { id: "DT-H14", machine: "תנור ציפוי אבקתי", reason: "תקלת מאוורר", rootCause: "מסב שחוק", date: "01/04", duration: "1:30", resolved: true, cost: 1500 },
  { id: "DT-H15", machine: "מכונת כיפוף CNC", reason: "תקלת מנוע ציר Y", rootCause: "מנוע שרוף", date: "31/03", duration: "6:00", resolved: true, cost: 8500 },
];

const FALLBACK_PARETO_DATA = [
  { cause: "תקלות חשמליות", hours: 18.5, pct: 24.3, cumPct: 24.3, events: 12 },
  { cause: "שחיקת כלים / חלקים", hours: 14.2, pct: 18.7, cumPct: 43.0, events: 18 },
  { cause: "תקלות הידראוליקה/פנאומטיקה", hours: 11.8, pct: 15.5, cumPct: 58.5, events: 8 },
  { cause: "תקלות תוכנה / בקרים", hours: 9.4, pct: 12.4, cumPct: 70.9, events: 10 },
  { cause: "תחזוקה מתוכננת", hours: 8.0, pct: 10.5, cumPct: 81.4, events: 6 },
  { cause: "חומר גלם / איכות", hours: 5.3, pct: 7.0, cumPct: 88.4, events: 7 },
  { cause: "טעות אנוש", hours: 4.8, pct: 6.3, cumPct: 94.7, events: 9 },
  { cause: "סביבתי (חום, אבק)", hours: 4.0, pct: 5.3, cumPct: 100.0, events: 4 },
];

const FALLBACK_MAINTENANCE_SCHEDULE = [
  { machine: "מכונת חיתוך CNC #1", type: "מניעתית", nextDate: "10/04/2026", frequency: "כל 2 שבועות", lastDone: "27/03/2026", estimatedDown: "2 שעות", priority: "רגיל" },
  { machine: "מכבש הידראולי 200T", type: "שמן והידראוליקה", nextDate: "12/04/2026", frequency: "חודשי", lastDone: "12/03/2026", estimatedDown: "4 שעות", priority: "גבוה" },
  { machine: "רובוט ריתוך KUKA", type: "כיול ובדיקה", nextDate: "15/04/2026", frequency: "חודשי", lastDone: "15/03/2026", estimatedDown: "1.5 שעות", priority: "רגיל" },
  { machine: "תנור ציפוי אבקתי", type: "ניקוי עומק", nextDate: "09/04/2026", frequency: "שבועי", lastDone: "02/04/2026", estimatedDown: "3 שעות", priority: "דחוף" },
  { machine: "מכונת זיגוג אוטומטית", type: "החלפת אטמים", nextDate: "11/04/2026", frequency: "רבעוני", lastDone: "11/01/2026", estimatedDown: "5 שעות", priority: "גבוה" },
  { machine: "מכונת כיפוף CNC", type: "מניעתית", nextDate: "14/04/2026", frequency: "כל 2 שבועות", lastDone: "31/03/2026", estimatedDown: "2 שעות", priority: "רגיל" },
  { machine: "שולחן חיתוך זכוכית", type: "החלפת גלגלים", nextDate: "20/04/2026", frequency: "חודשי", lastDone: "20/03/2026", estimatedDown: "1.5 שעות", priority: "רגיל" },
];

const SEV: Record<string, string> = {
  "קריטי": "bg-red-500/20 text-red-400 border-red-500/30",
  "גבוה": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "בינוני": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "נמוך": "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const PRIO: Record<string, string> = {
  "דחוף": "bg-red-500/20 text-red-400",
  "גבוה": "bg-orange-500/20 text-orange-400",
  "רגיל": "bg-blue-500/20 text-blue-400",
};

export default function DowntimeTracking() {
  const { data: downtimetrackingData } = useQuery({
    queryKey: ["downtime-tracking"],
    queryFn: () => authFetch("/api/operations/downtime_tracking"),
    staleTime: 5 * 60 * 1000,
  });

  const activeDowntimes = downtimetrackingData ?? FALLBACK_ACTIVE_DOWNTIMES;
  const downtimeHistory = FALLBACK_DOWNTIME_HISTORY;
  const maintenanceSchedule = FALLBACK_MAINTENANCE_SCHEDULE;
  const paretoData = FALLBACK_PARETO_DATA;

  const [search, setSearch] = useState("");

  const totalDown = 76.0;
  const unplannedPct = 78.9;
  const mtbf = "18.4 שעות";
  const mttr = "1.8 שעות";
  const topCause = "תקלות חשמליות";

  const kpis = [
    { label: "סה\"כ השבתה (שבועי)", value: `${totalDown} שעות`, icon: Clock, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "השבתה לא מתוכננת", value: `${unplannedPct}%`, icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10" },
    { label: "MTBF - זמן ממוצע בין תקלות", value: mtbf, icon: Activity, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "MTTR - זמן ממוצע לתיקון", value: mttr, icon: Timer, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "סיבה מובילה", value: topCause, icon: AlertCircle, color: "text-purple-400", bg: "bg-purple-500/10" },
  ];

  const filteredHistory = downtimeHistory.filter(h =>
    !search || h.machine.includes(search) || h.reason.includes(search) || h.rootCause.includes(search)
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-7 h-7 text-orange-400" />
            מעקב השבתות ותקלות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי - ניטור זמני השבתה, תחזוקה ותקלות ציוד</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-red-600 hover:bg-red-700"><AlertTriangle className="w-4 h-4 ml-1" />דיווח תקלה</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <div className="text-xl font-bold text-foreground">{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="active">השבתות פעילות</TabsTrigger>
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
          <TabsTrigger value="pareto">ניתוח פארטו</TabsTrigger>
          <TabsTrigger value="maintenance">לוח תחזוקה</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><XCircle className="w-5 h-5 text-red-400" />השבתות פעילות כרגע ({activeDowntimes.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activeDowntimes.map(dt => (
                  <div key={dt.id} className="p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs font-mono">{dt.id}</Badge>
                        <span className="font-medium text-foreground">{dt.machine}</span>
                      </div>
                      <Badge className={SEV[dt.severity]}>{dt.severity}</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">סיבה: </span>
                        <span className="text-foreground">{dt.reason}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">התחלה: </span>
                        <span className="text-foreground">{dt.start}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">משך: </span>
                        <span className="text-red-400 font-medium">{dt.duration}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">השפעה: </span>
                        <span className="text-foreground">{dt.impact}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">טכנאי: </span>
                        <span className="text-blue-400">{dt.technician}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-blue-400" />היסטוריית השבתות</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מזהה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מכונה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סיבה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שורש הבעיה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תאריך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">משך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עלות</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map(h => (
                      <tr key={h.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-mono text-xs text-muted-foreground">{h.id}</td>
                        <td className="p-3 font-medium text-foreground">{h.machine}</td>
                        <td className="p-3 text-foreground">{h.reason}</td>
                        <td className="p-3 text-amber-400">{h.rootCause}</td>
                        <td className="p-3 text-muted-foreground">{h.date}</td>
                        <td className="p-3 text-foreground">{h.duration}</td>
                        <td className="p-3 text-red-400 font-medium">{h.cost.toLocaleString()} &#8362;</td>
                        <td className="p-3 text-center">
                          <Badge className="bg-green-500/20 text-green-400"><CheckCircle2 className="w-3 h-3 ml-1" />נפתר</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pareto" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5 text-purple-400" />ניתוח פארטו - סיבות השבתה מדורגות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {paretoData.map((p, i) => (
                  <div key={i} className="p-3 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground w-6">#{i + 1}</span>
                        <span className="font-medium text-foreground">{p.cause}</span>
                        <Badge variant="outline" className="text-xs">{p.events} אירועים</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-red-400">{p.hours} שעות</span>
                        <span className="text-sm text-muted-foreground">({p.pct}%)</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Progress value={p.pct} className="h-3" />
                      </div>
                      <span className="text-xs text-muted-foreground w-24 text-left">מצטבר: {p.cumPct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wrench className="w-5 h-5 text-green-400" />לוח תחזוקה מתוכננת</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מכונה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג תחזוקה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תאריך הבא</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תדירות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ביצוע אחרון</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">השבתה צפויה</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">עדיפות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenanceSchedule.map((m, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{m.machine}</td>
                        <td className="p-3 text-foreground">{m.type}</td>
                        <td className="p-3 text-blue-400 font-medium">{m.nextDate}</td>
                        <td className="p-3 text-muted-foreground">{m.frequency}</td>
                        <td className="p-3 text-muted-foreground">{m.lastDone}</td>
                        <td className="p-3 text-amber-400">{m.estimatedDown}</td>
                        <td className="p-3 text-center">
                          <Badge className={PRIO[m.priority] || "bg-gray-500/20 text-gray-400"}>{m.priority}</Badge>
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
