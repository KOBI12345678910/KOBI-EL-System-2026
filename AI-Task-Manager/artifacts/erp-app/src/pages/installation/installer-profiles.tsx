import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  UserCheck, Users, Star, Award, Shield, Clock, Wrench,
  GraduationCap, TrendingUp, Heart, AlertTriangle, CheckCircle
} from "lucide-react";

/* ── Installer data ──────────────────────────────────────────── */

const installers = [
  { id: 1, name: "יוסי כהן", idNum: "xxx-xxx-1234", team: "אלפא", role: "ראש צוות", specialty: "אלומיניום", certs: ["עבודה בגובה", "ריתוך"], completed: 312, score: 94, rating: 4.8, status: "פעיל" },
  { id: 2, name: "מוחמד חאלד", idNum: "xxx-xxx-2187", team: "אלפא", role: "מתקין בכיר", specialty: "זכוכית", certs: ["עבודה בגובה", "מנוף"], completed: 287, score: 91, rating: 4.7, status: "פעיל" },
  { id: 3, name: "אלכס פטרוב", idNum: "xxx-xxx-3341", team: "בטא", role: "מתקין בכיר", specialty: "ברזל", certs: ["ריתוך", "חשמל"], completed: 265, score: 88, rating: 4.5, status: "פעיל" },
  { id: 4, name: "דוד לוי", idNum: "xxx-xxx-4456", team: "בטא", role: "ראש צוות", specialty: "אלומיניום", certs: ["עבודה בגובה", "חשמל", "מנוף"], completed: 341, score: 96, rating: 4.9, status: "פעיל" },
  { id: 5, name: "חסן אבו סעיד", idNum: "xxx-xxx-5578", team: "גמא", role: "מתקין", specialty: "מעקות", certs: ["עבודה בגובה", "ריתוך"], completed: 198, score: 82, rating: 4.3, status: "פעיל" },
  { id: 6, name: "ויקטור ניקולאייב", idNum: "xxx-xxx-6612", team: "גמא", role: "מתקין בכיר", specialty: "זכוכית", certs: ["עבודה בגובה", "מנוף", "חשמל"], completed: 274, score: 90, rating: 4.6, status: "פעיל" },
  { id: 7, name: "שמעון מזרחי", idNum: "xxx-xxx-7789", team: "דלתא", role: "ראש צוות", specialty: "ברזל", certs: ["ריתוך", "עבודה בגובה"], completed: 356, score: 95, rating: 4.8, status: "פעיל" },
  { id: 8, name: "עלי נסאר", idNum: "xxx-xxx-8834", team: "דלתא", role: "מתקין", specialty: "אלומיניום", certs: ["עבודה בגובה"], completed: 176, score: 79, rating: 4.2, status: "פעיל" },
  { id: 9, name: "אנטון ברקוביץ'", idNum: "xxx-xxx-9921", team: "אלפא", role: "מתקין", specialty: "מעקות", certs: ["ריתוך", "חשמל"], completed: 203, score: 84, rating: 4.4, status: "פעיל" },
  { id: 10, name: "יעקב אוחנה", idNum: "xxx-xxx-1055", team: "בטא", role: "מתקין", specialty: "אלומיניום", certs: ["עבודה בגובה"], completed: 189, score: 81, rating: 4.3, status: "פעיל" },
  { id: 11, name: "סרגיי קוזלוב", idNum: "xxx-xxx-1167", team: "גמא", role: "מתקין", specialty: "ברזל", certs: ["ריתוך", "מנוף"], completed: 221, score: 86, rating: 4.5, status: "פעיל" },
  { id: 12, name: "ראיד ג'בארין", idNum: "xxx-xxx-1298", team: "דלתא", role: "מתקין בכיר", specialty: "זכוכית", certs: ["עבודה בגובה", "חשמל"], completed: 248, score: 87, rating: 4.4, status: "פעיל" },
  { id: 13, name: "אמיר גולדברג", idNum: "xxx-xxx-1342", team: "אלפא", role: "מתקין", specialty: "מעקות", certs: ["ריתוך"], completed: 157, score: 77, rating: 4.1, status: "פעיל" },
  { id: 14, name: "וואליד חמדאן", idNum: "xxx-xxx-1489", team: "בטא", role: "מתקין", specialty: "אלומיניום", certs: ["עבודה בגובה"], completed: 134, score: 74, rating: 4.0, status: "פעיל" },
  { id: 15, name: "מיכאל שטרן", idNum: "xxx-xxx-1523", team: "גמא", role: "חניך", specialty: "זכוכית", certs: [], completed: 28, score: 62, rating: 3.8, status: "בהכשרה" },
  { id: 16, name: "נאסר סלאמה", idNum: "xxx-xxx-1690", team: "דלתא", role: "מתקין", specialty: "ברזל", certs: ["ריתוך", "עבודה בגובה"], completed: 195, score: 83, rating: 4.3, status: "בחופשה" },
];

/* ── Skills matrix data ──────────────────────────────────────── */

const skills = [
  "התקנת אלומיניום", "התקנת זכוכית", "ריתוך MIG/TIG", "עבודה בגובה",
  "הפעלת מנוף", "חיבורי חשמל", "מדידות לייזר", "קריאת שרטוטים",
  "איטום ובידוד", "בטיחות אש"
];

type SkillLevel = "expert" | "skilled" | "basic" | "none";

const skillMatrix: Record<number, SkillLevel[]> = {
  1:  ["expert","skilled","basic","expert","none","basic","expert","expert","skilled","skilled"],
  2:  ["skilled","expert","none","expert","expert","basic","skilled","skilled","expert","skilled"],
  3:  ["basic","basic","expert","skilled","none","expert","skilled","expert","skilled","basic"],
  4:  ["expert","skilled","skilled","expert","skilled","expert","expert","expert","expert","expert"],
  5:  ["skilled","basic","expert","expert","none","none","basic","skilled","skilled","basic"],
  6:  ["basic","expert","none","expert","expert","expert","skilled","skilled","expert","skilled"],
  7:  ["skilled","skilled","expert","expert","basic","basic","expert","expert","skilled","expert"],
  8:  ["expert","none","basic","expert","none","none","skilled","basic","basic","basic"],
  9:  ["basic","basic","skilled","basic","none","expert","skilled","skilled","skilled","basic"],
  10: ["expert","basic","none","expert","none","none","basic","skilled","basic","skilled"],
  11: ["basic","basic","expert","skilled","expert","basic","skilled","expert","expert","skilled"],
  12: ["skilled","expert","basic","expert","none","expert","skilled","skilled","expert","skilled"],
  13: ["basic","basic","expert","basic","none","none","basic","basic","skilled","basic"],
  14: ["expert","none","none","expert","none","none","basic","skilled","basic","basic"],
  15: ["none","basic","none","basic","none","none","none","basic","none","none"],
  16: ["skilled","basic","expert","expert","basic","basic","skilled","expert","skilled","expert"],
};

const levelLabel = (l: SkillLevel) => {
  switch (l) {
    case "expert": return "מומחה \u2605\u2605\u2605";
    case "skilled": return "מיומן \u2605\u2605";
    case "basic": return "בסיסי \u2605";
    default: return "\u2014";
  }
};

const levelColor = (l: SkillLevel) => {
  switch (l) {
    case "expert": return "bg-green-100 text-green-800";
    case "skilled": return "bg-blue-100 text-blue-800";
    case "basic": return "bg-yellow-100 text-yellow-800";
    default: return "bg-gray-50 text-gray-400";
  }
};

/* ── KPI data for top 5 ──────────────────────────────────────── */

interface InstallerKPI {
  name: string;
  installations_completed: number;
  on_time_rate: number;
  avg_installation_duration: string;
  quality_issue_rate: number;
  return_visit_rate: number;
  customer_signoff_rate: number;
  cost_per_installation_hour: number;
  productivity_score: number;
  safety_score: number;
}

const topKpis: InstallerKPI[] = [
  { name: "דוד לוי", installations_completed: 341, on_time_rate: 97.2, avg_installation_duration: "4.1 שעות", quality_issue_rate: 1.2, return_visit_rate: 2.1, customer_signoff_rate: 99.1, cost_per_installation_hour: 185, productivity_score: 96, safety_score: 98 },
  { name: "שמעון מזרחי", installations_completed: 356, on_time_rate: 95.8, avg_installation_duration: "4.3 שעות", quality_issue_rate: 1.8, return_visit_rate: 2.5, customer_signoff_rate: 98.5, cost_per_installation_hour: 192, productivity_score: 95, safety_score: 97 },
  { name: "יוסי כהן", installations_completed: 312, on_time_rate: 96.1, avg_installation_duration: "4.5 שעות", quality_issue_rate: 1.5, return_visit_rate: 2.8, customer_signoff_rate: 98.7, cost_per_installation_hour: 198, productivity_score: 94, safety_score: 95 },
  { name: "מוחמד חאלד", installations_completed: 287, on_time_rate: 94.5, avg_installation_duration: "4.6 שעות", quality_issue_rate: 2.1, return_visit_rate: 3.0, customer_signoff_rate: 97.9, cost_per_installation_hour: 201, productivity_score: 91, safety_score: 96 },
  { name: "ויקטור ניקולאייב", installations_completed: 274, on_time_rate: 93.8, avg_installation_duration: "4.8 שעות", quality_issue_rate: 2.4, return_visit_rate: 3.2, customer_signoff_rate: 97.2, cost_per_installation_hour: 210, productivity_score: 90, safety_score: 94 },
];

/* ── Training history ────────────────────────────────────────── */

const trainings = [
  { id: 1, installer: "מיכאל שטרן", course: "הכשרת מתקין זכוכית — קורס יסוד", date: "2026-03-15", endDate: "2026-05-15", status: "בתהליך" },
  { id: 2, installer: "יוסי כהן", course: "ריענון בטיחות עבודה בגובה", date: "2026-02-20", endDate: "2026-02-20", status: "עבר" },
  { id: 3, installer: "חסן אבו סעיד", course: "הסמכת מנוף נייד 25 טון", date: "2026-04-20", endDate: "2026-04-24", status: "מתוכנן" },
  { id: 4, installer: "אלכס פטרוב", course: "ריתוך TIG מתקדם — נירוסטה", date: "2026-01-10", endDate: "2026-01-14", status: "עבר" },
  { id: 5, installer: "ויקטור ניקולאייב", course: "עדכון תקן ישראלי 1142 — זיגוג בטיחותי", date: "2026-03-05", endDate: "2026-03-05", status: "עבר" },
  { id: 6, installer: "עלי נסאר", course: "קורס בטיחות חשמל למתקינים", date: "2026-05-01", endDate: "2026-05-03", status: "מתוכנן" },
  { id: 7, installer: "דוד לוי", course: "ניהול פרויקט התקנה — מתקדם", date: "2026-02-01", endDate: "2026-02-05", status: "עבר" },
  { id: 8, installer: "סרגיי קוזלוב", course: "הפעלת מנוף צריח — הסמכה ראשונית", date: "2026-03-20", endDate: "2026-04-10", status: "בתהליך" },
];

/* ── Helper functions ────────────────────────────────────────── */

const statusColor = (s: string) => {
  switch (s) {
    case "פעיל": return "bg-green-100 text-green-800";
    case "בחופשה": return "bg-orange-100 text-orange-800";
    case "בהכשרה": return "bg-blue-100 text-blue-800";
    case "לא פעיל": return "bg-gray-100 text-gray-600";
    default: return "bg-gray-100 text-gray-600";
  }
};

const trainingStatusColor = (s: string) => {
  switch (s) {
    case "עבר": return "bg-green-100 text-green-800";
    case "בתהליך": return "bg-blue-100 text-blue-800";
    case "מתוכנן": return "bg-yellow-100 text-yellow-800";
    default: return "bg-gray-100 text-gray-600";
  }
};

const certColor = (c: string) => {
  switch (c) {
    case "עבודה בגובה": return "bg-red-100 text-red-700";
    case "ריתוך": return "bg-orange-100 text-orange-700";
    case "חשמל": return "bg-yellow-100 text-yellow-700";
    case "מנוף": return "bg-purple-100 text-purple-700";
    default: return "bg-gray-100 text-gray-700";
  }
};

const scoreColor = (v: number) => {
  if (v >= 90) return "text-green-600";
  if (v >= 75) return "text-blue-600";
  if (v >= 60) return "text-yellow-600";
  return "text-red-600";
};

/* ── Main component ──────────────────────────────────────────── */

export default function InstallerProfilesPage() {
  const active = installers.filter(i => i.status === "פעיל").length;
  const inTraining = installers.filter(i => i.status === "בהכשרה").length;
  const onLeave = installers.filter(i => i.status === "בחופשה").length;

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="bg-blue-100 p-2 rounded-lg">
          <UserCheck className="h-6 w-6 text-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">פרופילי מתקינים</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניהול כוח אדם התקנות</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-indigo-500" />
            <div>
              <p className="text-sm text-muted-foreground">סה"כ מתקינים</p>
              <p className="text-2xl font-bold">{installers.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-sm text-muted-foreground">פעילים</p>
              <p className="text-2xl font-bold">{active}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <GraduationCap className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-sm text-muted-foreground">בהכשרה</p>
              <p className="text-2xl font-bold">{inTraining}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Clock className="h-8 w-8 text-orange-500" />
            <div>
              <p className="text-sm text-muted-foreground">בחופשה</p>
              <p className="text-2xl font-bold">{onLeave}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">רשימה</TabsTrigger>
          <TabsTrigger value="skills">מיומנויות</TabsTrigger>
          <TabsTrigger value="performance">ביצועים</TabsTrigger>
          <TabsTrigger value="training">הכשרות</TabsTrigger>
        </TabsList>

        {/* ── Tab: רשימה ──────────────────────────────────────── */}
        <TabsContent value="list">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> רשימת מתקינים</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שם</TableHead>
                    <TableHead className="text-right">ת.ז.</TableHead>
                    <TableHead className="text-right">צוות</TableHead>
                    <TableHead className="text-right">תפקיד</TableHead>
                    <TableHead className="text-right">התמחות</TableHead>
                    <TableHead className="text-right">הסמכות</TableHead>
                    <TableHead className="text-right">התקנות</TableHead>
                    <TableHead className="text-right min-w-[160px]">ציון ביצוע</TableHead>
                    <TableHead className="text-right">דירוג לקוח</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installers.map(inst => (
                    <TableRow key={inst.id}>
                      <TableCell className="font-medium">{inst.name}</TableCell>
                      <TableCell className="font-mono text-xs">{inst.idNum}</TableCell>
                      <TableCell>{inst.team}</TableCell>
                      <TableCell>{inst.role}</TableCell>
                      <TableCell>{inst.specialty}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {inst.certs.length > 0
                            ? inst.certs.map(c => <Badge key={c} variant="outline" className={`text-xs ${certColor(c)}`}>{c}</Badge>)
                            : <span className="text-xs text-muted-foreground">—</span>
                          }
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">{inst.completed}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={inst.score} className="h-2 w-20" />
                          <span className={`text-sm font-bold ${scoreColor(inst.score)}`}>{inst.score}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-500" />
                          <span className="text-sm">{inst.rating}/5</span>
                        </div>
                      </TableCell>
                      <TableCell><Badge className={statusColor(inst.status)}>{inst.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: מיומנויות ──────────────────────────────────── */}
        <TabsContent value="skills">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Award className="h-5 w-5" /> מטריצת מיומנויות</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right sticky right-0 bg-background z-10 min-w-[120px]">מתקין</TableHead>
                    {skills.map(s => <TableHead key={s} className="text-center text-xs min-w-[90px]">{s}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {installers.map(inst => (
                    <TableRow key={inst.id}>
                      <TableCell className="font-medium sticky right-0 bg-background z-10">{inst.name}</TableCell>
                      {skillMatrix[inst.id].map((lvl, idx) => (
                        <TableCell key={idx} className="text-center p-1">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${levelColor(lvl)}`}>
                            {levelLabel(lvl)}
                          </span>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab: ביצועים ────────────────────────────────────── */}
        <TabsContent value="performance">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2"><TrendingUp className="h-5 w-5" /> ביצועי חמשת המתקינים המובילים</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {topKpis.map((kpi, idx) => (
                <Card key={idx}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="bg-blue-100 rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold text-blue-700">{idx + 1}</div>
                      {kpi.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                      <span className="text-muted-foreground">התקנות שהושלמו</span>
                      <span className="font-semibold">{kpi.installations_completed}</span>
                      <span className="text-muted-foreground">שיעור בזמן</span>
                      <span className="font-semibold">{kpi.on_time_rate}%</span>
                      <span className="text-muted-foreground">זמן התקנה ממוצע</span>
                      <span className="font-semibold">{kpi.avg_installation_duration}</span>
                      <span className="text-muted-foreground">שיעור בעיות איכות</span>
                      <span className="font-semibold">{kpi.quality_issue_rate}%</span>
                      <span className="text-muted-foreground">שיעור ביקור חוזר</span>
                      <span className="font-semibold">{kpi.return_visit_rate}%</span>
                      <span className="text-muted-foreground">אישור לקוח</span>
                      <span className="font-semibold">{kpi.customer_signoff_rate}%</span>
                      <span className="text-muted-foreground">עלות לשעת התקנה</span>
                      <span className="font-semibold">{kpi.cost_per_installation_hour} &#8362;</span>
                      <span className="text-muted-foreground">ציון פרודוקטיביות</span>
                      <div className="flex items-center gap-1.5">
                        <Progress value={kpi.productivity_score} className="h-1.5 w-14" />
                        <span className={`font-bold ${scoreColor(kpi.productivity_score)}`}>{kpi.productivity_score}</span>
                      </div>
                      <span className="text-muted-foreground">ציון בטיחות</span>
                      <div className="flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-green-600" />
                        <span className={`font-bold ${scoreColor(kpi.safety_score)}`}>{kpi.safety_score}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* ── Tab: הכשרות ─────────────────────────────────────── */}
        <TabsContent value="training">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><GraduationCap className="h-5 w-5" /> היסטוריית הכשרות</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">מתקין</TableHead>
                    <TableHead className="text-right">קורס / הכשרה</TableHead>
                    <TableHead className="text-right">תאריך התחלה</TableHead>
                    <TableHead className="text-right">תאריך סיום</TableHead>
                    <TableHead className="text-right">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trainings.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.installer}</TableCell>
                      <TableCell>{t.course}</TableCell>
                      <TableCell>{t.date}</TableCell>
                      <TableCell>{t.endDate}</TableCell>
                      <TableCell><Badge className={trainingStatusColor(t.status)}>{t.status}</Badge></TableCell>
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
