import { useState } from "react";
import {
  UserMinus, CheckCircle2, Clock, AlertTriangle, Users,
  Calendar, ClipboardList, History, FileText, ShieldCheck,
  Briefcase, Key, Monitor, BookOpen, Mail, Landmark,
  GraduationCap, HeartHandshake, ChevronDown, ChevronUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

/* ── checklist template (12 items per Israeli employment law) ── */
const checklistTemplate = [
  { id: 1, label: "ראיון יציאה", icon: BookOpen, category: "תהליך" },
  { id: 2, label: "החזרת ציוד (מחשב, טלפון, כרטיס)", icon: Monitor, category: "ציוד" },
  { id: 3, label: "גמר חשבון – שכר, ימי חופשה, הבראה", icon: FileText, category: "כספי" },
  { id: 4, label: "ביטול הרשאות מערכת ודוא\"ל", icon: Key, category: "IT" },
  { id: 5, label: "העברת ידע למחליף", icon: GraduationCap, category: "תהליך" },
  { id: 6, label: "מכתב שחרור (אישור העסקה)", icon: Mail, category: "מסמכים" },
  { id: 7, label: "אישור טופס 161 – פיצויי פיטורין", icon: Landmark, category: "רגולציה" },
  { id: 8, label: "גמר פנסיה – שחרור / העברה", icon: Landmark, category: "רגולציה" },
  { id: 9, label: "הודעה מוקדמת לפי חוק", icon: ShieldCheck, category: "רגולציה" },
  { id: 10, label: "חתימה על סודיות ואי-תחרות", icon: ShieldCheck, category: "מסמכים" },
  { id: 11, label: "עדכון פנימי – מנהל, צוות, לקוחות", icon: Users, category: "תהליך" },
  { id: 12, label: "סגירת תיק עובד ברשויות (ביטוח לאומי, מס הכנסה)", icon: Briefcase, category: "רגולציה" },
];

/* ── active offboarding employees ── */
const activeOffboardings = [
  { id: 1, name: "אלון כהן", department: "ייצור", lastDay: "2026-04-25", reason: "התפטרות", hrPerson: "מיכל לוי", completed: [1, 3, 4, 5, 9, 10, 11] },
  { id: 2, name: "דנה פרידמן", department: "לוגיסטיקה", lastDay: "2026-05-10", reason: "פיטורין", hrPerson: "רון אברהם", completed: [1, 9] },
  { id: 3, name: "יוסי מזרחי", department: "תחזוקה", lastDay: "2026-04-30", reason: "סיום חוזה", hrPerson: "מיכל לוי", completed: [1, 2, 3, 4, 9] },
];

/* ── history (past 5 offboardings) ── */
const offboardingHistory = [
  { name: "שרון ביטון", department: "מכירות", endDate: "2026-01-15", reason: "התפטרות", durationDays: 12, knowledgeTransfer: "הושלם" },
  { name: "עמית גולן", department: "ייצור", endDate: "2025-11-30", reason: "פיטורין", durationDays: 18, knowledgeTransfer: "הושלם" },
  { name: "ליאור שמש", department: "הנדסה", endDate: "2025-09-20", reason: "התפטרות", durationDays: 10, knowledgeTransfer: "חלקי" },
  { name: "נועה רוזנברג", department: "כספים", endDate: "2025-07-01", reason: "סיום חוזה", durationDays: 14, knowledgeTransfer: "הושלם" },
  { name: "תומר אלקיים", department: "לוגיסטיקה", endDate: "2025-04-10", reason: "פרישה", durationDays: 21, knowledgeTransfer: "הושלם" },
];

/* ── retirement planning ── */
const retirementPlanning = [{
  name: "משה דיין", department: "תחזוקה", role: "טכנאי בכיר", yearsAtCompany: 28,
  plannedDate: "2026-09-01", pensionStatus: "מאושר – קרן מקפת",
  knowledgePlan: "תוכנית 6 חודשים: הכשרת רועי שמעון כמחליף, תיעוד נהלי תחזוקה, ליווי שוטף עד פרישה",
  advanceNoticeSent: true, severanceCalc: "מלא – 100% פיצויים לפי סעיף 14",
}];

/* ── helpers ── */
const reasonColor = (r: string) =>
  r === "התפטרות" ? "bg-yellow-500/20 text-yellow-300 border-yellow-500/30"
  : r === "פיטורין" ? "bg-red-500/20 text-red-300 border-red-500/30"
  : r === "פרישה" ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
  : "bg-blue-500/20 text-blue-300 border-blue-500/30";

const knowledgeColor = (s: string) =>
  s === "הושלם" ? "bg-green-500/20 text-green-300"
  : s === "חלקי" ? "bg-yellow-500/20 text-yellow-300"
  : "bg-red-500/20 text-red-300";

const pct = (completed: number[]) => Math.round((completed.length / checklistTemplate.length) * 100);

export default function OffboardingRetirementPage() {
  const [activeTab, setActiveTab] = useState("active");
  const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);

  const kpis = [
    { label: "בתהליך סיום", value: 3, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "הושלמו השנה", value: 5, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "פרישה מתוכננת", value: 1, icon: HeartHandshake, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "ממוצע ימי סיום", value: 14, icon: Calendar, color: "text-blue-400", bg: "bg-blue-500/10" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-red-500/10">
          <UserMinus className="h-6 w-6 text-red-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">סיום העסקה ופרישה</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי – ניהול תהליכי עזיבה ופרישה בהתאם לחוקי העבודה</p>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="border-border/40">
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`p-2 rounded-lg ${k.bg}`}>
                <k.icon className={`h-5 w-5 ${k.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-bold">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="active" className="gap-1">
            <Users className="h-4 w-4" /> בתהליך
          </TabsTrigger>
          <TabsTrigger value="checklist" className="gap-1">
            <ClipboardList className="h-4 w-4" /> צ'קליסט
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1">
            <History className="h-4 w-4" /> היסטוריה
          </TabsTrigger>
          <TabsTrigger value="retirement" className="gap-1">
            <HeartHandshake className="h-4 w-4" /> פרישה
          </TabsTrigger>
        </TabsList>

        {/* ═══ TAB: Active Offboardings ═══ */}
        <TabsContent value="active" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                תהליכי סיום פעילים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    {["שם עובד","מחלקה","יום אחרון","סיבה","השלמת צ'קליסט","אחראי HR"].map(h => (
                      <TableHead key={h} className="text-right">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeOffboardings.map((emp) => (
                    <TableRow key={emp.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell>{emp.department}</TableCell>
                      <TableCell>{emp.lastDay}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={reasonColor(emp.reason)}>{emp.reason}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-[140px]">
                          <Progress value={pct(emp.completed)} className="h-2 flex-1" />
                          <span className="text-xs font-medium w-10 text-left">{pct(emp.completed)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{emp.hrPerson}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* compliance note */}
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">תזכורות ציות – חוק הודעה מוקדמת</p>
                <p>עובד בשנה הראשונה: יום לכל חודש. שנה שנייה ואילך: חודש הודעה מוקדמת מלא. פיצויי פיטורין לפי חוק פיצויי פיטורים, תשכ"ג-1963.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: Checklist ═══ */}
        <TabsContent value="checklist" className="space-y-4 mt-4">
          {activeOffboardings.map((emp) => (
            <Card key={emp.id}>
              <CardHeader
                className="cursor-pointer"
                onClick={() => setExpandedEmployee(expandedEmployee === emp.id ? null : emp.id)}
              >
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-blue-400" />
                    <span>{emp.name}</span>
                    <Badge variant="outline" className={reasonColor(emp.reason)}>{emp.reason}</Badge>
                    <span className="text-sm text-muted-foreground">– יום אחרון: {emp.lastDay}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-normal text-muted-foreground">{emp.completed.length}/{checklistTemplate.length}</span>
                    <Progress value={pct(emp.completed)} className="h-2 w-24" />
                    {expandedEmployee === emp.id
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </CardTitle>
              </CardHeader>

              {expandedEmployee === emp.id && (
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {checklistTemplate.map((item) => {
                      const done = emp.completed.includes(item.id);
                      return (
                        <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${done ? "bg-green-500/5 border-green-500/20" : "bg-muted/5 border-border/40"}`}>
                          <item.icon className={`h-4 w-4 shrink-0 ${done ? "text-green-400" : "text-muted-foreground"}`} />
                          <span className={`text-sm flex-1 ${done ? "line-through text-muted-foreground" : ""}`}>{item.label}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{item.category}</Badge>
                          {done ? <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" /> : <Clock className="h-4 w-4 text-muted-foreground shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </TabsContent>

        {/* ═══ TAB: History ═══ */}
        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <History className="h-5 w-5 text-blue-400" />
                היסטוריית סיומי העסקה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    {["שם עובד","מחלקה","תאריך סיום","סיבה","משך (ימים)","העברת ידע"].map(h => (
                      <TableHead key={h} className="text-right">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {offboardingHistory.map((h, idx) => (
                    <TableRow key={idx} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{h.name}</TableCell>
                      <TableCell>{h.department}</TableCell>
                      <TableCell>{h.endDate}</TableCell>
                      <TableCell><Badge variant="outline" className={reasonColor(h.reason)}>{h.reason}</Badge></TableCell>
                      <TableCell>{h.durationDays}</TableCell>
                      <TableCell><Badge variant="outline" className={knowledgeColor(h.knowledgeTransfer)}>{h.knowledgeTransfer}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ TAB: Retirement Planning ═══ */}
        <TabsContent value="retirement" className="space-y-4 mt-4">
          {retirementPlanning.map((r, idx) => (
            <Card key={idx} className="border-purple-500/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <HeartHandshake className="h-5 w-5 text-purple-400" />
                  תכנון פרישה – {r.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {[
                    ["מחלקה", r.department], ["תפקיד", r.role], ["ותק בחברה", `${r.yearsAtCompany} שנים`],
                    ["תאריך פרישה מתוכנן", r.plannedDate],
                  ].map(([lbl, val]) => (
                    <div key={lbl} className="space-y-1">
                      <p className="text-xs text-muted-foreground">{lbl}</p>
                      <p className="font-medium">{val}</p>
                    </div>
                  ))}
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">סטטוס פנסיה</p>
                    <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/30">{r.pensionStatus}</Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">פיצויי פיטורין</p>
                    <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/30">{r.severanceCalc}</Badge>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">תוכנית העברת ידע</p>
                  <div className="p-3 rounded-lg bg-muted/10 border border-border/40 text-sm">
                    {r.knowledgePlan}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  {r.advanceNoticeSent
                    ? <><CheckCircle2 className="h-4 w-4 text-green-400" /><span className="text-green-400">הודעה מוקדמת נשלחה</span></>
                    : <><AlertTriangle className="h-4 w-4 text-amber-400" /><span className="text-amber-400">הודעה מוקדמת טרם נשלחה</span></>}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Legal info card */}
          <Card className="border-purple-500/20 bg-purple-500/5">
            <CardContent className="p-4 flex items-start gap-3">
              <Landmark className="h-5 w-5 text-purple-400 mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-semibold text-foreground">פרישה – דגשים חוקיים</p>
                <p>גיל פרישה חובה: 67 (גברים ונשים). פרישה מוקדמת אפשרית מגיל 60. פיצויי פיטורין מלאים (סעיף 14) + שחרור כספי פנסיה. יש לוודא חישוב ימי מחלה צבורים ופדיון חופשה.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
