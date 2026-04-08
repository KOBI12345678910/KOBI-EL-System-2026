import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  AlertTriangle, FileText, Shield, Users, Clock,
  CheckCircle2, XCircle, ChevronLeft, ChevronRight,
  Gavel, UserX, Ban, Eye, ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

/* ── severity helpers ── */
const severityColor: Record<string, string> = {
  "נמוך": "bg-blue-100 text-blue-800",
  "בינוני": "bg-yellow-100 text-yellow-800",
  "גבוה": "bg-orange-100 text-orange-800",
  "קריטי": "bg-red-100 text-red-800",
};

const stageColor: Record<string, string> = {
  "תיעוד": "bg-slate-100 text-slate-700",
  "שיחה": "bg-blue-100 text-blue-700",
  "אזהרה": "bg-yellow-100 text-yellow-700",
  "שימוע": "bg-orange-100 text-orange-700",
  "החלטה": "bg-red-100 text-red-700",
  "נסגר": "bg-green-100 text-green-700",
};

/* ── KPI data ── */
const FALLBACK_KPIS = [
  { label: "תיקים פתוחים", value: 4, icon: FileText, color: "text-orange-600", bg: "bg-orange-50" },
  { label: "אזהרות השנה", value: 8, icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50" },
  { label: "שימועים", value: 2, icon: Gavel, color: "text-red-600", bg: "bg-red-50" },
  { label: "פיטורים", value: 1, icon: UserX, color: "text-red-700", bg: "bg-red-50" },
  { label: "אירועי בטיחות", value: 3, icon: Shield, color: "text-blue-600", bg: "bg-blue-50" },
];

/* ── 10 disciplinary cases ── */
const FALLBACK_CASES = [
  { id: "DIS-001", employee: "יוסף כהן", dept: "ייצור", type: "איחורים חוזרים", severity: "בינוני", date: "2026-01-15", stage: "אזהרה", handler: "רחל לוי" },
  { id: "DIS-002", employee: "מיכאל אברהם", dept: "מחסן", type: "היעדרות", severity: "גבוה", date: "2026-02-03", stage: "שימוע", handler: "דוד מזרחי" },
  { id: "DIS-003", employee: "שרה ביטון", dept: "אריזה", type: "התנהגות", severity: "בינוני", date: "2026-02-18", stage: "שיחה", handler: "רחל לוי" },
  { id: "DIS-004", employee: "אמיר חסן", dept: "ייצור", type: "בטיחות", severity: "גבוה", date: "2026-03-01", stage: "אזהרה", handler: "עוזי טכנו" },
  { id: "DIS-005", employee: "נועה פרידמן", dept: "QC", type: "הפרת נהלים", severity: "נמוך", date: "2026-03-05", stage: "תיעוד", handler: "רחל לוי" },
  { id: "DIS-006", employee: "רועי שמעוני", dept: "תחזוקה", type: "גניבה", severity: "קריטי", date: "2026-03-10", stage: "שימוע", handler: "דוד מזרחי" },
  { id: "DIS-007", employee: "לילך מורנו", dept: "אריזה", type: "איחורים חוזרים", severity: "נמוך", date: "2026-03-12", stage: "שיחה", handler: "רחל לוי" },
  { id: "DIS-008", employee: "חיים וקנין", dept: "ייצור", type: "אלימות", severity: "קריטי", date: "2026-03-18", stage: "החלטה", handler: "דוד מזרחי" },
  { id: "DIS-009", employee: "טל ברוך", dept: "מחסן", type: "היעדרות", severity: "בינוני", date: "2026-03-22", stage: "תיעוד", handler: "רחל לוי" },
  { id: "DIS-010", employee: "אורלי דהן", dept: "QC", type: "הפרת נהלים", severity: "נמוך", date: "2026-04-01", stage: "נסגר", handler: "עוזי טכנו" },
];

/* ── Escalation workflow steps ── */
const workflowSteps = [
  { label: "תיעוד", desc: "רישום האירוע ותיעוד ראשוני", pct: 100 },
  { label: "שיחת בירור", desc: "שיחה עם העובד והמנהל הישיר", pct: 80 },
  { label: "אזהרה בכתב", desc: "מכתב אזהרה רשמי לעובד", pct: 50 },
  { label: "שימוע", desc: "שימוע רשמי בנוכחות נציגות", pct: 25 },
  { label: "החלטה", desc: "החלטת הנהלה סופית", pct: 10 },
];

/* ── 3 safety incidents ── */
const FALLBACK_SAFETY_INCIDENTS = [
  { date: "2026-02-10", employee: "אמיר חסן", type: "נפילה מגובה", severity: "גבוה", daysLost: 5, corrective: "התקנת מעקות בטיחות נוספות בקו ייצור 3" },
  { date: "2026-03-05", employee: "יוסף כהן", type: "חשיפה לחומר כימי", severity: "בינוני", daysLost: 2, corrective: "הוספת ציוד מגן אישי ועדכון נהלי עבודה" },
  { date: "2026-03-28", employee: "רועי שמעוני", type: "פגיעה ממכונה", severity: "גבוה", daysLost: 7, corrective: "התקנת מגן בטיחות ועדכון הדרכה תקופתית" },
];

/* ── Procedures ── */
const FALLBACK_PROCEDURES = [
  { title: "נוהל משמעת כללי", code: "HR-DIS-001", updated: "2025-12-01", summary: "תהליך טיפול באירועי משמעת מתיעוד ועד החלטה סופית, כולל לוחות זמנים ואחריות." },
  { title: "נוהל שימוע", code: "HR-DIS-002", updated: "2025-11-15", summary: "הנחיות לקיום שימוע כחוק, כולל זכויות העובד, נוכחות נציגות, ותיעוד הדיון." },
  { title: "נוהל אירועי בטיחות", code: "HR-SAF-001", updated: "2026-01-10", summary: "דיווח, חקירה ותיקון אירועי בטיחות, כולל חובת דיווח למשרד העבודה." },
  { title: "מדיניות אפס סובלנות לאלימות", code: "HR-DIS-003", updated: "2025-10-20", summary: "מדיניות ברורה בנושא אלימות פיזית ומילולית, עם סנקציות מיידיות." },
];

/* ── Statistics ── */
const FALLBACK_TYPE_STATS = [
  { type: "איחורים חוזרים", count: 2, pct: 20 },
  { type: "היעדרות", count: 2, pct: 20 },
  { type: "הפרת נהלים", count: 2, pct: 20 },
  { type: "בטיחות", count: 1, pct: 10 },
  { type: "התנהגות", count: 1, pct: 10 },
  { type: "גניבה", count: 1, pct: 10 },
  { type: "אלימות", count: 1, pct: 10 },
];

const FALLBACK_DEPT_STATS = [
  { dept: "ייצור", count: 3, pct: 30 },
  { dept: "מחסן", count: 2, pct: 20 },
  { dept: "אריזה", count: 2, pct: 20 },
  { dept: "QC", count: 2, pct: 20 },
  { dept: "תחזוקה", count: 1, pct: 10 },
];

export default function DisciplinaryIncidentsPage() {
  const { data: disciplinaryincidentsData } = useQuery({
    queryKey: ["disciplinary-incidents"],
    queryFn: () => authFetch("/api/hr/disciplinary_incidents"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = disciplinaryincidentsData ?? FALLBACK_KPIS;

  const [activeTab, setActiveTab] = useState("cases");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-orange-100">
          <AlertTriangle className="h-6 w-6 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">משמעת ואירועים</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניהול תיקי משמעת ואירועי בטיחות</p>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className={k.bg}>
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`h-8 w-8 ${k.color}`} />
              <div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="cases">תיקים</TabsTrigger>
          <TabsTrigger value="safety">אירועי בטיחות</TabsTrigger>
          <TabsTrigger value="stats">סטטיסטיקות</TabsTrigger>
          <TabsTrigger value="procedures">נהלים</TabsTrigger>
        </TabsList>

        {/* ───────── Tab: Cases ───────── */}
        <TabsContent value="cases" className="space-y-6">
          {/* Escalation Workflow */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowRight className="h-4 w-4" />
                תהליך אסקלציה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {workflowSteps.map((step, i) => (
                  <div key={step.label} className="flex items-center gap-2">
                    <div className="flex flex-col items-center min-w-[110px]">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold
                        ${i === 0 ? "bg-green-100 text-green-700" : i === workflowSteps.length - 1 ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                        {i + 1}
                      </div>
                      <p className="text-sm font-medium mt-1">{step.label}</p>
                      <p className="text-xs text-muted-foreground text-center mt-0.5">{step.desc}</p>
                    </div>
                    {i < workflowSteps.length - 1 && (
                      <ChevronLeft className="h-5 w-5 text-muted-foreground shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Cases Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">תיקי משמעת ({cases.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>מס׳ תיק</TableHead>
                    <TableHead>עובד</TableHead>
                    <TableHead>מחלקה</TableHead>
                    <TableHead>סוג</TableHead>
                    <TableHead>חומרה</TableHead>
                    <TableHead>תאריך פתיחה</TableHead>
                    <TableHead>שלב</TableHead>
                    <TableHead>אחראי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm">{c.id}</TableCell>
                      <TableCell className="font-medium">{c.employee}</TableCell>
                      <TableCell>{c.dept}</TableCell>
                      <TableCell>{c.type}</TableCell>
                      <TableCell>
                        <Badge className={severityColor[c.severity] || ""}>{c.severity}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{c.date}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={stageColor[c.stage] || ""}>{c.stage}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{c.handler}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────── Tab: Safety Incidents ───────── */}
        <TabsContent value="safety" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-600" />
                אירועי בטיחות ({safetyIncidents.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>עובד</TableHead>
                    <TableHead>סוג אירוע</TableHead>
                    <TableHead>חומרה</TableHead>
                    <TableHead>ימי היעדרות</TableHead>
                    <TableHead>פעולה מתקנת</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {safetyIncidents.map((inc, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">{inc.date}</TableCell>
                      <TableCell className="font-medium">{inc.employee}</TableCell>
                      <TableCell>{inc.type}</TableCell>
                      <TableCell>
                        <Badge className={severityColor[inc.severity] || ""}>{inc.severity}</Badge>
                      </TableCell>
                      <TableCell className="text-center font-medium">{inc.daysLost}</TableCell>
                      <TableCell className="text-sm max-w-[260px]">{inc.corrective}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 p-3 bg-muted/50 rounded-lg text-sm">
                <p className="font-medium mb-1">סיכום רבעוני</p>
                <div className="flex gap-6 text-muted-foreground">
                  <span>סה״כ אירועים: <strong className="text-foreground">3</strong></span>
                  <span>ימי היעדרות: <strong className="text-foreground">14</strong></span>
                  <span>פעולות מתקנות שהושלמו: <strong className="text-foreground">2/3</strong></span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────── Tab: Statistics ───────── */}
        <TabsContent value="stats" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* By type */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">לפי סוג אירוע</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {typeStats.map((s) => (
                  <div key={s.type} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{s.type}</span>
                      <span className="text-muted-foreground">{s.count} תיקים ({s.pct}%)</span>
                    </div>
                    <Progress value={s.pct} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* By department */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">לפי מחלקה</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {deptStats.map((s) => (
                  <div key={s.dept} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{s.dept}</span>
                      <span className="text-muted-foreground">{s.count} תיקים ({s.pct}%)</span>
                    </div>
                    <Progress value={s.pct} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Yearly summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">סיכום שנתי 2026</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">10</p>
                  <p className="text-xs text-muted-foreground">סה״כ תיקים</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">8</p>
                  <p className="text-xs text-muted-foreground">אזהרות בכתב</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold">14</p>
                  <p className="text-xs text-muted-foreground">ימי היעדרות (בטיחות)</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-2xl font-bold text-green-600">1</p>
                  <p className="text-xs text-muted-foreground">תיקים שנסגרו</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ───────── Tab: Procedures ───────── */}
        <TabsContent value="procedures" className="space-y-4">
          {procedures.map((p) => (
            <Card key={p.code}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <h3 className="font-medium">{p.title}</h3>
                      <Badge variant="outline" className="text-xs">{p.code}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{p.summary}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">עדכון: {p.updated}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
