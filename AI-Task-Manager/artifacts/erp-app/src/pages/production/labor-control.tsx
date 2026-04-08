import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Users, CheckCircle2, Clock, AlertTriangle, TrendingUp,
  HardHat, MapPin, Award, Timer, ShieldAlert, Star,
} from "lucide-react";

/* ── Mock data ── */
const workers = [
  { id: 1, name: "רועי כהן", skills: { cutting: true, welding: true, assembly: true, installation: false, cnc: true, painting: false }, cert: "טכנאי בכיר", clockIn: "07:02", clockOut: "16:05", hours: 9.05, location: "מפעל", overtime: 1.05, jobsDone: 14, avgTime: "32 דק׳", output: 108, target: 100, ranking: 1, active: true, onSite: false },
  { id: 2, name: "אמיר לוי", skills: { cutting: false, welding: true, assembly: true, installation: true, cnc: false, painting: false }, cert: "מתקין מוסמך", clockIn: "06:55", clockOut: "15:50", hours: 8.92, location: "שטח", overtime: 0.92, jobsDone: 11, avgTime: "38 דק׳", output: 95, target: 100, ranking: 3, active: true, onSite: true },
  { id: 3, name: "יוסי מזרחי", skills: { cutting: true, welding: true, assembly: false, installation: false, cnc: true, painting: true }, cert: "רתך מוסמך", clockIn: "07:10", clockOut: "16:30", hours: 9.33, location: "מפעל", overtime: 1.33, jobsDone: 16, avgTime: "28 דק׳", output: 115, target: 100, ranking: 2, active: true, onSite: false },
  { id: 4, name: "דני אברהם", skills: { cutting: true, welding: false, assembly: true, installation: true, cnc: false, painting: true }, cert: "טכנאי", clockIn: "07:00", clockOut: "15:00", hours: 8.0, location: "שטח", overtime: 0, jobsDone: 9, avgTime: "42 דק׳", output: 82, target: 100, ranking: 6, active: true, onSite: true },
  { id: 5, name: "מוחמד חסן", skills: { cutting: false, welding: false, assembly: true, installation: true, cnc: false, painting: true }, cert: "צבע מוסמך", clockIn: "07:15", clockOut: "16:20", hours: 9.08, location: "מפעל", overtime: 1.08, jobsDone: 12, avgTime: "35 דק׳", output: 97, target: 100, ranking: 4, active: true, onSite: false },
  { id: 6, name: "אלי ביטון", skills: { cutting: true, welding: true, assembly: true, installation: true, cnc: true, painting: false }, cert: "טכנאי בכיר", clockIn: "06:45", clockOut: "16:45", hours: 10.0, location: "מפעל", overtime: 2.0, jobsDone: 13, avgTime: "33 דק׳", output: 103, target: 100, ranking: 5, active: true, onSite: false },
  { id: 7, name: "שרה לוי", skills: { cutting: false, welding: false, assembly: true, installation: false, cnc: true, painting: true }, cert: "מפעילת CNC", clockIn: "07:30", clockOut: "—", hours: 6.5, location: "מפעל", overtime: 0, jobsDone: 8, avgTime: "40 דק׳", output: 78, target: 100, ranking: 7, active: true, onSite: false },
  { id: 8, name: "נועה פרידמן", skills: { cutting: false, welding: false, assembly: true, installation: true, cnc: false, painting: false }, cert: "מתקינה", clockIn: "07:00", clockOut: "—", hours: 7.0, location: "שטח", overtime: 0, jobsDone: 7, avgTime: "45 דק׳", output: 72, target: 100, ranking: 8, active: true, onSite: true },
];

const teams = [
  { name: "צוות התקנות צפון", members: ["אמיר לוי", "דני אברהם", "נועה פרידמן"], current: "פרויקט הרצליה - בניין A", next: "פרויקט נתניה - קומפלקס מגורים" },
  { name: "צוות התקנות דרום", members: ["רועי כהן", "אלי ביטון"], current: "פרויקט באר שבע - מפעל", next: "פרויקט אשדוד - מרכז מסחרי" },
  { name: "צוות מפעל - ריתוך", members: ["יוסי מזרחי", "מוחמד חסן"], current: "הזמנה WO-4510 שלדות פלדה", next: "הזמנה WO-4522 מעקות" },
  { name: "צוות מפעל - הרכבה", members: ["שרה לוי", "אלי ביטון"], current: "הזמנה WO-4515 חלונות אלו׳", next: "הזמנה WO-4520 דלתות" },
  { name: "צוות מפעל - צביעה", members: ["מוחמד חסן", "שרה לוי"], current: "הזמנה WO-4512 פרופילים RAL", next: "הזמנה WO-4518 מסגרות" },
  { name: "צוות התקנות מרכז", members: ["דני אברהם", "נועה פרידמן", "אמיר לוי"], current: "פרויקט ת״א - מגדל משרדים", next: "פרויקט ר״ג - קניון" },
  { name: "צוות חירום", members: ["רועי כהן", "יוסי מזרחי"], current: "תיקון דחוף - לקוח VIP", next: "אין" },
  { name: "צוות CNC", members: ["שרה לוי", "אלי ביטון", "רועי כהן"], current: "הזמנה WO-4525 חיתוך מדויק", next: "הזמנה WO-4530 כיפוף" },
];

const incidents = [
  { date: "2026-04-07", worker: "דני אברהם", type: "חתך קל", severity: "קל", location: "שטח - הרצליה", resolution: "טופל במקום" },
  { date: "2026-04-03", worker: "יוסי מזרחי", type: "כוויה קלה", severity: "קל", location: "מפעל - ריתוך", resolution: "טופל במרפאה" },
  { date: "2026-03-28", worker: "אלי ביטון", type: "נפילה מגובה", severity: "בינוני", location: "שטח - ת״א", resolution: "יום מנוחה + בדיקה" },
  { date: "2026-03-22", worker: "מוחמד חסן", type: "שאיפת אדים", severity: "קל", location: "מפעל - צביעה", resolution: "אוורור + הפסקה" },
  { date: "2026-03-15", worker: "נועה פרידמן", type: "מכה בראש", severity: "בינוני", location: "שטח - נתניה", resolution: "בדיקה בבי״ח" },
  { date: "2026-03-10", worker: "רועי כהן", type: "פציעת גב", severity: "בינוני", location: "מפעל - הרכבה", resolution: "3 ימי מנוחה" },
  { date: "2026-02-25", worker: "אמיר לוי", type: "חתך", severity: "קל", location: "שטח - באר שבע", resolution: "טופל במקום" },
  { date: "2026-02-18", worker: "שרה לוי", type: "פגיעה באצבע", severity: "קל", location: "מפעל - CNC", resolution: "חבישה + המשך עבודה" },
];

const skillLabels: Record<string, string> = { cutting: "חיתוך", welding: "ריתוך", assembly: "הרכבה", installation: "התקנה", cnc: "CNC", painting: "צביעה" };
const sevColor: Record<string, string> = { "קל": "bg-green-500/20 text-green-300", "בינוני": "bg-yellow-500/20 text-yellow-300", "חמור": "bg-red-500/20 text-red-300" };

/* ═══════════════ Component ═══════════════ */
export default function LaborControl() {
  const [tab, setTab] = useState("skills");

  const activeCount = workers.filter(w => w.active).length;
  const onSiteCount = workers.filter(w => w.onSite).length;
  const inFactoryCount = workers.filter(w => w.active && !w.onSite).length;
  const totalOvertime = workers.reduce((s, w) => s + w.overtime, 0).toFixed(1);
  const avgProductivity = Math.round(workers.reduce((s, w) => s + w.output, 0) / workers.length);
  const monthIncidents = incidents.filter(i => i.date >= "2026-04-01").length;

  const kpis = [
    { label: "עובדים פעילים", value: activeCount, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "בשטח", value: onSiteCount, icon: MapPin, color: "text-orange-400", bg: "bg-orange-500/10" },
    { label: "במפעל", value: inFactoryCount, icon: HardHat, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "שעות נוספות", value: totalOvertime, icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "פרודוקטיביות ממוצעת", value: `${avgProductivity}%`, icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "תקריות החודש", value: monthIncidents, icon: ShieldAlert, color: monthIncidents > 2 ? "text-red-400" : "text-amber-400", bg: monthIncidents > 2 ? "bg-red-500/10" : "bg-amber-500/10" },
  ];

  return (
    <div className="p-6 space-y-5 bg-gray-950 min-h-screen text-gray-100" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Users className="h-7 w-7 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">בקרת כוח אדם ייצור/שטח</h1>
          <p className="text-xs text-gray-500 mt-0.5">טכנו-כל עוזי | ניהול עובדים, צוותות, נוכחות, פרודוקטיביות ובטיחות</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={i} className={`${k.bg} border border-gray-800`}>
              <CardContent className="py-3 px-4 flex items-center gap-3">
                <Icon className={`h-5 w-5 ${k.color}`} />
                <div>
                  <p className="text-[10px] text-gray-500">{k.label}</p>
                  <p className={`text-lg font-bold font-mono ${k.color}`}>{k.value}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-gray-900 border border-gray-800 p-1 gap-1">
          <TabsTrigger value="skills" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">מטריצת מיומנויות</TabsTrigger>
          <TabsTrigger value="attendance" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">נוכחות</TabsTrigger>
          <TabsTrigger value="productivity" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">פרודוקטיביות</TabsTrigger>
          <TabsTrigger value="teams" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">צוותות התקנה</TabsTrigger>
          <TabsTrigger value="safety" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-xs">בטיחות</TabsTrigger>
        </TabsList>

        {/* ── Skills Matrix ── */}
        <TabsContent value="skills">
          <Card className="border-gray-800 bg-gray-900/60">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/80">
                      <th className="p-3 text-right text-gray-400 font-medium">עובד/ת</th>
                      {Object.entries(skillLabels).map(([k, v]) => (
                        <th key={k} className="p-3 text-center text-gray-400 font-medium">{v}</th>
                      ))}
                      <th className="p-3 text-center text-gray-400 font-medium">הסמכה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workers.map(w => (
                      <tr key={w.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="p-3 font-medium text-gray-200">{w.name}</td>
                        {Object.keys(skillLabels).map(sk => (
                          <td key={sk} className="p-3 text-center">
                            {(w.skills as Record<string, boolean>)[sk]
                              ? <CheckCircle2 className="h-4 w-4 text-green-400 mx-auto" />
                              : <span className="text-gray-700">—</span>}
                          </td>
                        ))}
                        <td className="p-3 text-center">
                          <Badge className="bg-blue-500/20 text-blue-300 border-0 text-xs">{w.cert}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Attendance ── */}
        <TabsContent value="attendance">
          <Card className="border-gray-800 bg-gray-900/60">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/80">
                      <th className="p-3 text-right text-gray-400 font-medium">עובד/ת</th>
                      <th className="p-3 text-center text-gray-400 font-medium">כניסה</th>
                      <th className="p-3 text-center text-gray-400 font-medium">יציאה</th>
                      <th className="p-3 text-center text-gray-400 font-medium">שעות</th>
                      <th className="p-3 text-center text-gray-400 font-medium">מיקום</th>
                      <th className="p-3 text-center text-gray-400 font-medium">שעות נוספות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {workers.map(w => (
                      <tr key={w.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="p-3 font-medium text-gray-200">{w.name}</td>
                        <td className="p-3 text-center font-mono text-green-400">{w.clockIn}</td>
                        <td className="p-3 text-center font-mono text-red-400">{w.clockOut}</td>
                        <td className="p-3 text-center font-mono text-gray-300">{w.hours.toFixed(1)}</td>
                        <td className="p-3 text-center">
                          <Badge className={`border-0 text-xs ${w.onSite ? "bg-orange-500/20 text-orange-300" : "bg-green-500/20 text-green-300"}`}>
                            {w.location}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          {w.overtime > 0
                            ? <span className="font-mono text-purple-400">{w.overtime.toFixed(1)}</span>
                            : <span className="text-gray-600">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Productivity ── */}
        <TabsContent value="productivity">
          <Card className="border-gray-800 bg-gray-900/60">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/80">
                      <th className="p-3 text-right text-gray-400 font-medium">עובד/ת</th>
                      <th className="p-3 text-center text-gray-400 font-medium">עבודות שהושלמו</th>
                      <th className="p-3 text-center text-gray-400 font-medium">זמן ממוצע</th>
                      <th className="p-3 text-center text-gray-400 font-medium">תפוקה vs יעד</th>
                      <th className="p-3 text-center text-gray-400 font-medium">דירוג</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...workers].sort((a, b) => a.ranking - b.ranking).map(w => (
                      <tr key={w.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="p-3 font-medium text-gray-200 flex items-center gap-2">
                          {w.ranking <= 3 && <Star className={`h-4 w-4 ${w.ranking === 1 ? "text-yellow-400" : w.ranking === 2 ? "text-gray-300" : "text-amber-600"}`} />}
                          {w.name}
                        </td>
                        <td className="p-3 text-center font-mono text-gray-300">{w.jobsDone}</td>
                        <td className="p-3 text-center text-gray-400">
                          <div className="flex items-center justify-center gap-1"><Timer className="h-3 w-3" />{w.avgTime}</div>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2 justify-center">
                            <Progress value={w.output} className="h-2 w-24 bg-gray-800" />
                            <span className={`text-xs font-mono font-bold ${w.output >= 100 ? "text-green-400" : w.output >= 80 ? "text-yellow-400" : "text-red-400"}`}>{w.output}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <Badge className={`border-0 text-xs ${w.ranking <= 3 ? "bg-yellow-500/20 text-yellow-300" : "bg-gray-500/20 text-gray-400"}`}>
                            #{w.ranking}
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

        {/* ── Installation Teams ── */}
        <TabsContent value="teams">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {teams.map((t, i) => (
              <Card key={i} className="border-gray-800 bg-gray-900/60 hover:border-blue-500/30 transition-colors">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-gray-200 flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-400" />{t.name}
                    </h3>
                    <Badge className="bg-blue-500/20 text-blue-300 border-0 text-xs">{t.members.length} חברים</Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {t.members.map((m, j) => (
                      <Badge key={j} className="bg-gray-800 text-gray-300 border border-gray-700 text-xs">{m}</Badge>
                    ))}
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-500/20 text-green-300 border-0 text-[10px]">נוכחי</Badge>
                      <span className="text-gray-400">{t.current}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-amber-500/20 text-amber-300 border-0 text-[10px]">הבא</Badge>
                      <span className="text-gray-400">{t.next}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── Safety Incidents ── */}
        <TabsContent value="safety">
          <Card className="border-gray-800 bg-gray-900/60">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/80">
                      <th className="p-3 text-right text-gray-400 font-medium">תאריך</th>
                      <th className="p-3 text-right text-gray-400 font-medium">עובד/ת</th>
                      <th className="p-3 text-right text-gray-400 font-medium">סוג</th>
                      <th className="p-3 text-center text-gray-400 font-medium">חומרה</th>
                      <th className="p-3 text-right text-gray-400 font-medium">מיקום</th>
                      <th className="p-3 text-right text-gray-400 font-medium">טיפול</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidents.map((inc, i) => (
                      <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                        <td className="p-3 font-mono text-xs text-gray-400">{new Date(inc.date).toLocaleDateString("he-IL")}</td>
                        <td className="p-3 font-medium text-gray-200">{inc.worker}</td>
                        <td className="p-3 text-gray-300 flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />{inc.type}
                        </td>
                        <td className="p-3 text-center">
                          <Badge className={`${sevColor[inc.severity] || "bg-gray-500/20 text-gray-300"} border-0 text-xs`}>{inc.severity}</Badge>
                        </td>
                        <td className="p-3 text-gray-400 text-xs">{inc.location}</td>
                        <td className="p-3 text-gray-400 text-xs">{inc.resolution}</td>
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
