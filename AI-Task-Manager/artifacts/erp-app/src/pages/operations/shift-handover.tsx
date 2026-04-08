import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Users, Clock, ClipboardList, AlertTriangle, CheckCircle2, Search, Download, ArrowLeftRight, MessageSquare, Calendar, Shield, FileText, Bell } from "lucide-react";

const currentShift = {
  name: "משמרת בוקר",
  time: "06:00 - 14:00",
  manager: "אבי כהן",
  workers: 24,
  targetOutput: 1200,
  actualOutput: 985,
  qualityRate: 97.8,
  safetyIncidents: 0,
  openIssues: 3,
  machines: [
    { name: "קו חיתוך A", status: "פעיל", output: 245, target: 300 },
    { name: "קו חיתוך B", status: "פעיל", output: 230, target: 300 },
    { name: "קו כיפוף", status: "מוגבל", output: 160, target: 200 },
    { name: "קו ריתוך", status: "פעיל", output: 180, target: 200 },
    { name: "קו ציפוי", status: "תחזוקה", output: 0, target: 200 },
    { name: "קו הרכבה", status: "פעיל", output: 170, target: 200 },
  ],
  notes: [
    { time: "07:15", text: "תנור ציפוי - נכנס לתחזוקת חירום, צפי חזרה עד 11:00", type: "warning" },
    { time: "08:30", text: "משלוח חומר גלם אלומיניום 6063 - התקבל וסווג למחסן", type: "info" },
    { time: "09:45", text: "קו כיפוף - ירידת קצב עקב חומר קשה, עובדים בקצב מופחת", type: "warning" },
    { time: "10:20", text: "הזמנת לקוח HN-4521 - קדימות גבוהה, מועד אספקה 10/04", type: "info" },
  ],
};

const handoverLog = [
  { id: "HO-041", shift: "לילה > בוקר", from: "דני שמש", to: "אבי כהן", date: "08/04", time: "06:00", output: 820, issues: 2, notes: "תנור ציפוי דורש תשומת לב, לחץ אוויר ירד", status: "הושלם" },
  { id: "HO-040", shift: "ערב > לילה", from: "משה לוי", to: "דני שמש", date: "07/04", time: "22:00", output: 1050, issues: 1, notes: "מכונת CNC #2 - כלי חדש הותקן, לעקוב אחרי איכות", status: "הושלם" },
  { id: "HO-039", shift: "בוקר > ערב", from: "אבי כהן", to: "משה לוי", date: "07/04", time: "14:00", output: 1180, issues: 0, notes: "יום טוב, כל הקווים עבדו תקין", status: "הושלם" },
  { id: "HO-038", shift: "לילה > בוקר", from: "דני שמש", to: "אבי כהן", date: "07/04", time: "06:00", output: 780, issues: 3, notes: "שבר בגלגל חיתוך זכוכית, הוחלף. רצועת מסוע #3 דורשת בדיקה", status: "הושלם" },
  { id: "HO-037", shift: "ערב > לילה", from: "משה לוי", to: "דני שמש", date: "06/04", time: "22:00", output: 1020, issues: 1, notes: "נוזל קירור הוחלף במכבש הידראולי", status: "הושלם" },
  { id: "HO-036", shift: "בוקר > ערב", from: "אבי כהן", to: "משה לוי", date: "06/04", time: "14:00", output: 1150, issues: 2, notes: "לקוח T-200 דיווח על סטיית מידות, בבדיקה. רובוט ריתוך - אחרי כיול", status: "הושלם" },
  { id: "HO-035", shift: "לילה > בוקר", from: "דני שמש", to: "אבי כהן", date: "06/04", time: "06:00", output: 800, issues: 1, notes: "הפסקת חשמל קצרה בשעה 03:00, כל המכונות חזרו", status: "הושלם" },
  { id: "HO-034", shift: "ערב > לילה", from: "משה לוי", to: "דני שמש", date: "05/04", time: "22:00", output: 1080, issues: 0, notes: "משמרת שקטה, אין הערות מיוחדות", status: "הושלם" },
  { id: "HO-033", shift: "בוקר > ערב", from: "אבי כהן", to: "משה לוי", date: "05/04", time: "14:00", output: 1200, issues: 1, notes: "מכונת חיתוך #1 - סרוו מוטור שוקם, לבדוק רעידות", status: "הושלם" },
  { id: "HO-032", shift: "לילה > בוקר", from: "דני שמש", to: "אבי כהן", date: "05/04", time: "06:00", output: 750, issues: 2, notes: "תקלת PLC בקו כיפוף, נפתרה. מחסנית כלים CNC #2 תקולה", status: "הושלם" },
];

const pendingItems = [
  { id: "PI-01", item: "תנור ציפוי - החזרה לפעולה אחרי תיקון", from: "משמרת לילה", priority: "קריטי", dueBy: "11:00 היום", assignee: "יוסי ברק", status: "בטיפול" },
  { id: "PI-02", item: "בדיקת רצועת מסוע #3 - סימני שחיקה", from: "07/04 בוקר", priority: "גבוה", dueBy: "סוף יום", assignee: "רועי אדם", status: "ממתין" },
  { id: "PI-03", item: "תלונת לקוח T-200 - סטיית מידות בחלונות", from: "06/04 ערב", priority: "גבוה", dueBy: "10/04", assignee: "QC - שרה דהן", status: "בבדיקה" },
  { id: "PI-04", item: "מכונת CNC #2 - בדיקת איכות חיתוך עם כלי חדש", from: "07/04 לילה", priority: "בינוני", dueBy: "08/04 ערב", assignee: "משה לוי", status: "ממתין" },
  { id: "PI-05", item: "הזמנה מצטברת חומר 6063 - לתאם עם רכש", from: "08/04 בוקר", priority: "בינוני", dueBy: "09/04", assignee: "מנהל רכש", status: "ממתין" },
  { id: "PI-06", item: "לחץ אוויר - בדיקת מדחס מרכזי", from: "08/04 בוקר", priority: "גבוה", dueBy: "08/04", assignee: "אלי דהן", status: "בטיפול" },
  { id: "PI-07", item: "עדכון תוכנת NC בקו כיפוף - גרסה 4.3", from: "04/04 ערב", priority: "נמוך", dueBy: "12/04", assignee: "IT - עומר", status: "מתוכנן" },
];

const weeklySchedule = [
  { day: "ראשון 06/04", morning: { manager: "אבי כהן", workers: 24 }, evening: { manager: "משה לוי", workers: 22 }, night: { manager: "דני שמש", workers: 18 } },
  { day: "שני 07/04", morning: { manager: "אבי כהן", workers: 24 }, evening: { manager: "משה לוי", workers: 22 }, night: { manager: "דני שמש", workers: 18 } },
  { day: "שלישי 08/04", morning: { manager: "אבי כהן", workers: 24 }, evening: { manager: "משה לוי", workers: 22 }, night: { manager: "דני שמש", workers: 18 } },
  { day: "רביעי 09/04", morning: { manager: "אבי כהן", workers: 23 }, evening: { manager: "משה לוי", workers: 21 }, night: { manager: "דני שמש", workers: 17 } },
  { day: "חמישי 10/04", morning: { manager: "אבי כהן", workers: 24 }, evening: { manager: "משה לוי", workers: 20 }, night: { manager: "דני שמש", workers: 16 } },
  { day: "שישי 11/04", morning: { manager: "אבי כהן", workers: 22 }, evening: { manager: "---", workers: 0 }, night: { manager: "---", workers: 0 } },
  { day: "שבת 12/04", morning: { manager: "---", workers: 0 }, evening: { manager: "---", workers: 0 }, night: { manager: "---", workers: 0 } },
];

const PRIO: Record<string, string> = {
  "קריטי": "bg-red-500/20 text-red-400",
  "גבוה": "bg-orange-500/20 text-orange-400",
  "בינוני": "bg-yellow-500/20 text-yellow-400",
  "נמוך": "bg-blue-500/20 text-blue-400",
};

const PISTAT: Record<string, string> = {
  "בטיפול": "bg-blue-500/20 text-blue-400",
  "ממתין": "bg-yellow-500/20 text-yellow-400",
  "בבדיקה": "bg-purple-500/20 text-purple-400",
  "מתוכנן": "bg-gray-500/20 text-gray-400",
};

export default function ShiftHandover() {
  const [search, setSearch] = useState("");

  const kpis = [
    { label: "משמרות היום", value: "3", icon: Clock, color: "text-blue-400" },
    { label: "מסירות שהושלמו", value: "1 מתוך 3", icon: CheckCircle2, color: "text-green-400" },
    { label: "נושאים פתוחים", value: "7", icon: ClipboardList, color: "text-amber-400" },
    { label: "הערות ייצור", value: "4", icon: MessageSquare, color: "text-purple-400" },
    { label: "התראות בטיחות", value: "0", icon: Shield, color: "text-emerald-400" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ArrowLeftRight className="w-7 h-7 text-blue-400" />
            מסירת משמרות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי - דיווחי משמרות, מסירות ומעקב נושאים פתוחים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-primary"><FileText className="w-4 h-4 ml-1" />מסירה חדשה</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <kpi.icon className={`w-5 h-5 ${kpi.color} mb-2`} />
              <div className="text-xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="current" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="current">משמרת נוכחית</TabsTrigger>
          <TabsTrigger value="log">יומן מסירות</TabsTrigger>
          <TabsTrigger value="pending">נושאים ממתינים</TabsTrigger>
          <TabsTrigger value="schedule">לוח משמרות</TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/50 border-border/50 md:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-blue-400" />{currentShift.name} ({currentShift.time})</CardTitle>
                  <Badge className="bg-green-500/20 text-green-400">פעילה</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="text-center p-3 rounded-lg bg-background/30">
                    <div className="text-2xl font-bold text-foreground">{currentShift.actualOutput}</div>
                    <div className="text-xs text-muted-foreground">תפוקה בפועל</div>
                    <Progress value={(currentShift.actualOutput / currentShift.targetOutput) * 100} className="h-1.5 mt-1" />
                    <div className="text-xs text-muted-foreground mt-0.5">יעד: {currentShift.targetOutput}</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-background/30">
                    <div className="text-2xl font-bold text-green-400">{currentShift.qualityRate}%</div>
                    <div className="text-xs text-muted-foreground">שיעור איכות</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-background/30">
                    <div className="text-2xl font-bold text-foreground">{currentShift.workers}</div>
                    <div className="text-xs text-muted-foreground">עובדים</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-background/30">
                    <div className="text-2xl font-bold text-emerald-400">{currentShift.safetyIncidents}</div>
                    <div className="text-xs text-muted-foreground">אירועי בטיחות</div>
                  </div>
                </div>
                <h4 className="font-medium text-foreground mb-2">סטטוס קווי ייצור:</h4>
                <div className="space-y-2">
                  {currentShift.machines.map((m, i) => (
                    <div key={i} className="flex items-center justify-between p-2 rounded bg-background/20">
                      <div className="flex items-center gap-2">
                        <Badge className={m.status === "פעיל" ? "bg-green-500/20 text-green-400" : m.status === "תחזוקה" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}>
                          {m.status}
                        </Badge>
                        <span className="text-sm text-foreground">{m.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Progress value={m.target > 0 ? (m.output / m.target) * 100 : 0} className="h-2 w-24" />
                        <span className="text-xs text-muted-foreground w-20">{m.output}/{m.target} יח'</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bell className="w-5 h-5 text-amber-400" />הערות והתראות</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {currentShift.notes.map((n, i) => (
                    <div key={i} className={`p-3 rounded-lg border ${n.type === 'warning' ? 'bg-amber-500/5 border-amber-500/20' : 'bg-blue-500/5 border-blue-500/20'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        {n.type === 'warning' ? <AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> : <MessageSquare className="w-3.5 h-3.5 text-blue-400" />}
                        <span className="text-xs text-muted-foreground">{n.time}</span>
                      </div>
                      <p className="text-sm text-foreground">{n.text}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="log" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-blue-400" />יומן מסירות אחרונות</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {handoverLog.filter(h => !search || h.notes.includes(search) || h.from.includes(search) || h.to.includes(search)).map(h => (
                  <div key={h.id} className="p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="text-xs font-mono">{h.id}</Badge>
                        <span className="font-medium text-foreground">{h.shift}</span>
                        <span className="text-sm text-muted-foreground">{h.date} | {h.time}</span>
                      </div>
                      <Badge className="bg-green-500/20 text-green-400"><CheckCircle2 className="w-3 h-3 ml-1" />{h.status}</Badge>
                    </div>
                    <div className="grid grid-cols-4 gap-3 text-sm mb-2">
                      <div><span className="text-muted-foreground">מוסר: </span><span className="text-foreground">{h.from}</span></div>
                      <div><span className="text-muted-foreground">מקבל: </span><span className="text-foreground">{h.to}</span></div>
                      <div><span className="text-muted-foreground">תפוקה: </span><span className="text-foreground font-medium">{h.output} יח'</span></div>
                      <div><span className="text-muted-foreground">נושאים: </span><span className={h.issues > 0 ? "text-amber-400" : "text-green-400"}>{h.issues}</span></div>
                    </div>
                    <p className="text-sm text-muted-foreground">{h.notes}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-400" />נושאים ממתינים לטיפול ({pendingItems.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingItems.map(pi => (
                  <div key={pi.id} className="p-4 rounded-lg bg-background/30 border border-border/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Badge className={PRIO[pi.priority]}>{pi.priority}</Badge>
                        <span className="font-medium text-foreground">{pi.item}</span>
                      </div>
                      <Badge className={PISTAT[pi.status]}>{pi.status}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>מקור: {pi.from}</span>
                      <span>נדרש עד: <span className="text-foreground">{pi.dueBy}</span></span>
                      <span>אחראי: <span className="text-blue-400">{pi.assignee}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calendar className="w-5 h-5 text-green-400" />לוח משמרות שבועי</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">יום</th>
                      <th className="text-center p-3 text-muted-foreground font-medium" colSpan={2}>בוקר (06:00-14:00)</th>
                      <th className="text-center p-3 text-muted-foreground font-medium" colSpan={2}>ערב (14:00-22:00)</th>
                      <th className="text-center p-3 text-muted-foreground font-medium" colSpan={2}>לילה (22:00-06:00)</th>
                    </tr>
                    <tr className="border-b border-border/30">
                      <th></th>
                      <th className="text-center p-2 text-xs text-muted-foreground">אחראי</th>
                      <th className="text-center p-2 text-xs text-muted-foreground">עובדים</th>
                      <th className="text-center p-2 text-xs text-muted-foreground">אחראי</th>
                      <th className="text-center p-2 text-xs text-muted-foreground">עובדים</th>
                      <th className="text-center p-2 text-xs text-muted-foreground">אחראי</th>
                      <th className="text-center p-2 text-xs text-muted-foreground">עובדים</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklySchedule.map((d, i) => (
                      <tr key={i} className={`border-b border-border/30 ${d.day.includes('08/04') ? 'bg-blue-500/10' : ''}`}>
                        <td className="p-3 font-medium text-foreground">{d.day} {d.day.includes('08/04') && <Badge className="bg-blue-500/20 text-blue-400 mr-1 text-xs">היום</Badge>}</td>
                        <td className="p-3 text-center text-foreground">{d.morning.manager}</td>
                        <td className="p-3 text-center"><Badge variant="outline">{d.morning.workers}</Badge></td>
                        <td className="p-3 text-center text-foreground">{d.evening.manager}</td>
                        <td className="p-3 text-center"><Badge variant="outline">{d.evening.workers}</Badge></td>
                        <td className="p-3 text-center text-foreground">{d.night.manager}</td>
                        <td className="p-3 text-center"><Badge variant="outline">{d.night.workers}</Badge></td>
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
