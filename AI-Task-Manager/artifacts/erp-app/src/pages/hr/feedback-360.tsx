import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  MessageCircle, Users, CheckCircle2, Clock, BarChart3,
  Star, TrendingUp, Calendar, Eye, ChevronDown, ChevronUp,
  UserCheck, Shield, MessageSquare
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

/* ── Static Data ── */

const FALLBACK_FEEDBACK_CYCLES = [
  { id: 1, name: "הערכה שנתית 2026 - Q1", startDate: "2026-01-15", endDate: "2026-04-15", employees: 18, completed: 128, total: 144, status: "פעיל" },
  { id: 2, name: "הערכת מנהלים רבעון 1", startDate: "2026-03-01", endDate: "2026-04-30", employees: 6, completed: 28, total: 48, status: "פעיל" },
];

const FALLBACK_EMPLOYEES = [
  { id: 1, name: "יוסי כהן", role: "מנהל ייצור", selfDone: true, managerDone: true, peerDone: 4, peerTotal: 4, subDone: 3, subTotal: 3, avg: 4.2, status: "הושלם" },
  { id: 2, name: "מיכל לוי", role: "מהנדסת איכות", selfDone: true, managerDone: true, peerDone: 3, peerTotal: 4, subDone: 0, subTotal: 0, avg: 3.9, status: "בתהליך" },
  { id: 3, name: "אבי מזרחי", role: "טכנאי בכיר", selfDone: true, managerDone: false, peerDone: 2, peerTotal: 4, subDone: 0, subTotal: 0, avg: 3.5, status: "בתהליך" },
  { id: 4, name: "רונית שפירא", role: "מנהלת משאבי אנוש", selfDone: true, managerDone: true, peerDone: 4, peerTotal: 4, subDone: 5, subTotal: 5, avg: 4.5, status: "הושלם" },
  { id: 5, name: "דוד ביטון", role: "מנהל מחסן", selfDone: false, managerDone: false, peerDone: 1, peerTotal: 4, subDone: 2, subTotal: 3, avg: 0, status: "ממתין" },
  { id: 6, name: "שירה אברהם", role: "מפעילת מכונות CNC", selfDone: true, managerDone: true, peerDone: 3, peerTotal: 3, subDone: 0, subTotal: 0, avg: 3.7, status: "בתהליך" },
  { id: 7, name: "עמית גולן", role: "ראש צוות הרכבה", selfDone: true, managerDone: true, peerDone: 4, peerTotal: 4, subDone: 4, subTotal: 4, avg: 4.0, status: "הושלם" },
  { id: 8, name: "נועה פרץ", role: "מהנדסת תהליכים", selfDone: true, managerDone: false, peerDone: 2, peerTotal: 4, subDone: 0, subTotal: 0, avg: 3.6, status: "בתהליך" },
  { id: 9, name: "איתן דהן", role: "מנהל תחזוקה", selfDone: true, managerDone: true, peerDone: 3, peerTotal: 4, subDone: 3, subTotal: 3, avg: 4.1, status: "בתהליך" },
  { id: 10, name: "הילה רוזן", role: "בודקת איכות", selfDone: false, managerDone: false, peerDone: 0, peerTotal: 3, subDone: 0, subTotal: 0, avg: 0, status: "ממתין" },
];

const selectedEmployeeResults = { name: "רונית שפירא", role: "מנהלת משאבי אנוש", categories: [
  { name: "מקצועיות", self: 4.5, manager: 4.5, peers: 4.3, subordinates: 4.6, avg: 4.48 },
  { name: "עבודת צוות", self: 4.0, manager: 4.5, peers: 4.7, subordinates: 4.5, avg: 4.43 },
  { name: "מנהיגות", self: 4.0, manager: 4.8, peers: 4.2, subordinates: 4.6, avg: 4.40 },
  { name: "תקשורת", self: 4.5, manager: 4.5, peers: 4.6, subordinates: 4.8, avg: 4.60 },
  { name: "יוזמה", self: 5.0, manager: 4.5, peers: 4.3, subordinates: 4.4, avg: 4.55 },
  { name: "אמינות", self: 4.5, manager: 5.0, peers: 4.7, subordinates: 4.8, avg: 4.75 },
] };

const FALLBACK_ANONYMOUS_COMMENTS = [
  { id: 1, text: "מנהלת מסורה ביותר, תמיד זמינה לשיחה ומקשיבה באמת. יוצרת אווירה חיובית בצוות.", category: "מנהיגות", sentiment: "positive" },
  { id: 2, text: "מקצועית ברמה גבוהה, מביאה פתרונות יצירתיים לבעיות מורכבות. ממליץ בחום.", category: "מקצועיות", sentiment: "positive" },
  { id: 3, text: "לעיתים מתעכבת בקבלת החלטות כשיש לחץ זמנים. כדאי לשפר את קצב התגובה.", category: "יוזמה", sentiment: "neutral" },
  { id: 4, text: "תקשורת מצוינת עם כל הדרגים. יודעת להעביר מסרים בצורה ברורה ומכבדת.", category: "תקשורת", sentiment: "positive" },
  { id: 5, text: "שומרת על מילה, אפשר לסמוך עליה בעיניים עצומות. דוגמה אישית לצוות כולו.", category: "אמינות", sentiment: "positive" },
];

const FALLBACK_HISTORY_DATA = [
  { cycle: "הערכה שנתית 2025", period: "ינו-מרץ 2025", employees: 22, completion: 94, avgScore: 3.7 },
  { cycle: "הערכת מנהלים Q3 2025", period: "יול-ספט 2025", employees: 5, completion: 100, avgScore: 4.0 },
  { cycle: "הערכה שנתית 2024", period: "ינו-מרץ 2024", employees: 20, completion: 89, avgScore: 3.6 },
  { cycle: "הערכת מנהלים Q3 2024", period: "יול-ספט 2024", employees: 5, completion: 100, avgScore: 3.8 },
];

/* ── Helpers ── */

const statusColor = (s: string) => s === "הושלם" ? "bg-green-100 text-green-800" : s === "בתהליך" ? "bg-blue-100 text-blue-800" : s === "ממתין" ? "bg-gray-100 text-gray-600" : s === "פעיל" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground";
const sentimentColor = (s: string) => s === "positive" ? "border-l-green-500" : s === "neutral" ? "border-l-yellow-500" : "border-l-red-500";
const scoreColor = (v: number) => v >= 4.5 ? "text-emerald-600" : v >= 3.5 ? "text-blue-600" : v >= 2.5 ? "text-yellow-600" : "text-red-600";
const progressColor = (v: number) => v >= 90 ? "bg-emerald-500" : v >= 70 ? "bg-blue-500" : v >= 50 ? "bg-yellow-500" : "bg-red-500";

/* ── Component ── */

export default function Feedback360Page() {
  const { data: feedback360Data } = useQuery({
    queryKey: ["feedback-360"],
    queryFn: () => authFetch("/api/hr/feedback_360"),
    staleTime: 5 * 60 * 1000,
  });

  const feedbackCycles = feedback360Data ?? FALLBACK_FEEDBACK_CYCLES;

  const [activeTab, setActiveTab] = useState("cycles");
  const [expandedEmployee, setExpandedEmployee] = useState<number | null>(null);

  const done = feedbackCycles.reduce((s, c) => s + c.completed, 0);
  const total = feedbackCycles.reduce((s, c) => s + c.total, 0);
  const pctDone = Math.round((done / total) * 100);
  const avgAll = employees.filter(e => e.avg > 0).reduce((s, e) => s + e.avg, 0) / employees.filter(e => e.avg > 0).length;
  const kpis = [
    { label: "מחזורי משוב פעילים", value: "2", icon: Calendar, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "עובדים בהערכה", value: "24", icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "משובים הושלמו", value: `${done}/${total}`, icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50" },
    { label: "שיעור השלמה", value: `${pctDone}%`, icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "ציון ממוצע", value: `${avgAll.toFixed(1)}/5`, icon: Star, color: "text-indigo-600", bg: "bg-indigo-50" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-purple-100">
          <MessageCircle className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">משוב 360°</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי - מערכת הערכת עובדים רב-כיוונית</p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${k.bg}`}>
                <k.icon className={`w-5 h-5 ${k.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="cycles">מחזורים פעילים</TabsTrigger>
          <TabsTrigger value="matrix">מטריצת משוב</TabsTrigger>
          <TabsTrigger value="results">תוצאות</TabsTrigger>
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
        </TabsList>

        {/* Tab 1: Active Cycles */}
        <TabsContent value="cycles" className="space-y-4">
          {feedbackCycles.map((cycle) => {
            const pct = Math.round((cycle.completed / cycle.total) * 100);
            return (
              <Card key={cycle.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{cycle.name}</CardTitle>
                    <Badge className={statusColor(cycle.status)}>{cycle.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><span className="text-muted-foreground">התחלה:</span> <span className="font-medium">{cycle.startDate}</span></div>
                    <div><span className="text-muted-foreground">סיום:</span> <span className="font-medium">{cycle.endDate}</span></div>
                    <div><span className="text-muted-foreground">עובדים:</span> <span className="font-medium">{cycle.employees}</span></div>
                    <div><span className="text-muted-foreground">השלמה:</span> <span className="font-bold">{cycle.completed}/{cycle.total}</span></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${progressColor(pct)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm font-bold min-w-[40px]">{pct}%</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Tab 2: Feedback Matrix */}
        <TabsContent value="matrix">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                מטריצת משוב 360° - {employees.length} עובדים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>עובד/ת</TableHead>
                    <TableHead>תפקיד</TableHead>
                    <TableHead className="text-center">הערכה עצמית</TableHead>
                    <TableHead className="text-center">הערכת מנהל</TableHead>
                    <TableHead className="text-center">עמיתים</TableHead>
                    <TableHead className="text-center">כפיפים</TableHead>
                    <TableHead className="text-center">ציון ממוצע</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                    <TableHead className="text-center w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((emp) => (
                    <>
                      <TableRow
                        key={emp.id}
                        className="cursor-pointer"
                        onClick={() => setExpandedEmployee(expandedEmployee === emp.id ? null : emp.id)}
                      >
                        <TableCell className="font-medium">{emp.name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{emp.role}</TableCell>
                        <TableCell className="text-center">{emp.selfDone ? <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" /> : <Clock className="w-4 h-4 text-gray-400 mx-auto" />}</TableCell>
                        <TableCell className="text-center">{emp.managerDone ? <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" /> : <Clock className="w-4 h-4 text-gray-400 mx-auto" />}</TableCell>
                        <TableCell className="text-center"><span className={emp.peerDone === emp.peerTotal ? "text-green-600 font-medium" : "text-amber-600"}>{emp.peerDone}/{emp.peerTotal}</span></TableCell>
                        <TableCell className="text-center">{emp.subTotal > 0 ? <span className={emp.subDone === emp.subTotal ? "text-green-600 font-medium" : "text-amber-600"}>{emp.subDone}/{emp.subTotal}</span> : <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell className="text-center">{emp.avg > 0 ? <span className={`font-bold ${scoreColor(emp.avg)}`}>{emp.avg.toFixed(1)}</span> : <span className="text-muted-foreground">-</span>}</TableCell>
                        <TableCell className="text-center">
                          <Badge className={statusColor(emp.status)}>{emp.status}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {expandedEmployee === emp.id
                            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                        </TableCell>
                      </TableRow>
                      {expandedEmployee === emp.id && (
                        <TableRow key={`${emp.id}-detail`}>
                          <TableCell colSpan={9} className="bg-muted/30 p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div className="flex items-center gap-2"><UserCheck className="w-4 h-4 text-blue-500" /><span>עצמית: {emp.selfDone ? "הושלמה" : "ממתינה"}</span></div>
                              <div className="flex items-center gap-2"><Shield className="w-4 h-4 text-purple-500" /><span>מנהל: {emp.managerDone ? "הושלמה" : "ממתינה"}</span></div>
                              <div className="flex items-center gap-2"><Users className="w-4 h-4 text-cyan-500" /><span>עמיתים: {emp.peerDone}/{emp.peerTotal}</span></div>
                              <div className="flex items-center gap-2"><Eye className="w-4 h-4 text-amber-500" /><span>כפיפים: {emp.subTotal > 0 ? `${emp.subDone}/${emp.subTotal}` : "לא רלוונטי"}</span></div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Results Summary */}
        <TabsContent value="results" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-500" />
                  תוצאות - {selectedEmployeeResults.name}
                </CardTitle>
                <Badge className="bg-purple-100 text-purple-700">{selectedEmployeeResults.role}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedEmployeeResults.categories.map((cat) => {
                const pct = (cat.avg / 5) * 100;
                return (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{cat.name}</span>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>עצמי: {cat.self.toFixed(1)}</span>
                        <span>מנהל: {cat.manager.toFixed(1)}</span>
                        <span>עמיתים: {cat.peers.toFixed(1)}</span>
                        {cat.subordinates > 0 && <span>כפיפים: {cat.subordinates.toFixed(1)}</span>}
                        <span className={`font-bold text-sm ${scoreColor(cat.avg)}`}>
                          ממוצע: {cat.avg.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${progressColor(pct)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {(() => { const total = selectedEmployeeResults.categories.reduce((s, c) => s + c.avg, 0) / selectedEmployeeResults.categories.length; return (
                <div className="pt-4 border-t flex items-center justify-between">
                  <span className="font-bold">ציון כולל ממוצע</span>
                  <span className={`text-xl font-bold ${scoreColor(total)}`}>{total.toFixed(2)}/5</span>
                </div>
              ); })()}
            </CardContent>
          </Card>

          {/* Anonymous Comments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-indigo-500" />
                משובים אנונימיים ({anonymousComments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {anonymousComments.map((c) => (
                <div key={c.id} className={`border-r-4 ${sentimentColor(c.sentiment)} bg-muted/30 rounded-lg p-3`}>
                  <div className="flex items-center justify-between mb-1">
                    <Badge variant="outline" className="text-xs">{c.category}</Badge>
                    <span className="text-xs text-muted-foreground">{c.sentiment === "positive" ? "חיובי" : c.sentiment === "neutral" ? "ניטרלי" : "לשיפור"}</span>
                  </div>
                  <p className="text-sm leading-relaxed">{c.text}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: History */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-500" />
                היסטוריית מחזורי משוב
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>מחזור</TableHead>
                    <TableHead>תקופה</TableHead>
                    <TableHead className="text-center">עובדים</TableHead>
                    <TableHead className="text-center">השלמה</TableHead>
                    <TableHead className="text-center">ציון ממוצע</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.cycle}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.period}</TableCell>
                      <TableCell className="text-center">{row.employees}</TableCell>
                      <TableCell className="text-center"><div className="flex items-center gap-2 justify-center"><div className="w-16 h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${progressColor(row.completion)}`} style={{ width: `${row.completion}%` }} /></div><span className="text-sm font-medium">{row.completion}%</span></div></TableCell>
                      <TableCell className="text-center"><span className={`font-bold ${scoreColor(row.avgScore)}`}>{row.avgScore.toFixed(1)}</span></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Trends Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                מגמות לאורך זמן
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">שיפור ציון ממוצע</p>
                  <p className="text-2xl font-bold text-emerald-600">+0.2</p>
                  <p className="text-xs text-muted-foreground">עלייה מ-3.6 ב-2024 ל-3.8 ב-2026</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">שיעור השלמה ממוצע</p>
                  <p className="text-2xl font-bold text-blue-600">95.8%</p>
                  <p className="text-xs text-muted-foreground">ממוצע כל המחזורים ההיסטוריים</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">עובדים שהוערכו</p>
                  <p className="text-2xl font-bold text-purple-600">52</p>
                  <p className="text-xs text-muted-foreground">סך הכל ב-4 מחזורים אחרונים</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
