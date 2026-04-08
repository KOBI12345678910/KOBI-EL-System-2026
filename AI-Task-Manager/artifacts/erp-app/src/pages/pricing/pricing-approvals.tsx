import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle, Clock, XCircle, TrendingUp, AlertTriangle, ShieldCheck,
  DollarSign, ThumbsUp, ThumbsDown, User, Layers, ArrowUpCircle,
} from "lucide-react";

const shekel = (v: number) =>
  "₪" + v.toLocaleString("he-IL", { maximumFractionDigits: 0 });

const urgencyMap: Record<string, { label: string; cls: string }> = {
  low:      { label: "רגילה",   cls: "bg-slate-600/40 text-slate-300" },
  medium:   { label: "בינונית", cls: "bg-blue-500/20 text-blue-400" },
  high:     { label: "גבוהה",  cls: "bg-orange-500/20 text-orange-400" },
  critical: { label: "קריטית", cls: "bg-red-500/20 text-red-400" },
};

/* ── Pending Approvals Queue ─────────────────────────────────── */
const pendingQueue = [
  { id: "PR-401", project: "חזית זכוכית - מגדל הים", customer: "אורבן נדל\"ן", totalCost: 485000, recommendedPrice: 642000, margin: 32.4, discount: 8, version: 3, requester: "רונן לוי", urgency: "critical" as const, daysWaiting: 5 },
  { id: "PR-402", project: "מעקות בטיחות - קניון הנגב", customer: "ביג מרכזי מסחר", totalCost: 215000, recommendedPrice: 296700, margin: 38.0, discount: 3, version: 1, requester: "אלון דוד", urgency: "high" as const, daysWaiting: 3 },
  { id: "PR-403", project: "חלונות תרמיים - בית חולים הדסה", customer: "הדסה מדיקל", totalCost: 535000, recommendedPrice: 695500, margin: 30.0, discount: 12, version: 1, requester: "שרון אברהם", urgency: "critical" as const, daysWaiting: 4 },
  { id: "PR-404", project: "שערי כניסה - פארק רעננה", customer: "עיריית רעננה", totalCost: 78500, recommendedPrice: 108200, margin: 37.8, discount: 5, version: 2, requester: "מיכל כהן", urgency: "medium" as const, daysWaiting: 2 },
  { id: "PR-405", project: "מעקות זכוכית - לובי מלון דן", customer: "מלונות דן", totalCost: 167000, recommendedPrice: 218800, margin: 31.0, discount: 15, version: 2, requester: "אלון דוד", urgency: "high" as const, daysWaiting: 3 },
  { id: "PR-406", project: "חלונות מבודדים - מחיר למשתכן", customer: "שיכון ובינוי", totalCost: 1480000, recommendedPrice: 1924000, margin: 30.0, discount: 10, version: 1, requester: "שרון אברהם", urgency: "critical" as const, daysWaiting: 1 },
  { id: "PR-407", project: "פרגולת אלומיניום - וילה הרצליה", customer: "משפחת רוזנברג", totalCost: 42000, recommendedPrice: 56800, margin: 35.2, discount: 0, version: 1, requester: "מיכל כהן", urgency: "low" as const, daysWaiting: 6 },
  { id: "PR-408", project: "חזית קורטן - מרכז הייטק", customer: "אלביט מערכות", totalCost: 780000, recommendedPrice: 1053000, margin: 35.0, discount: 7, version: 1, requester: "רונן לוי", urgency: "high" as const, daysWaiting: 2 },
  { id: "PR-409", project: "מעקות מדרגות - עזריאלי שרונה", customer: "עזריאלי קבוצה", totalCost: 310000, recommendedPrice: 415400, margin: 34.0, discount: 4, version: 3, requester: "אלון דוד", urgency: "medium" as const, daysWaiting: 1 },
  { id: "PR-410", project: "תושבת אלומיניום AL-50", customer: "מגה-טק תעשיות", totalCost: 28500, recommendedPrice: 42750, margin: 33.3, discount: 6, version: 2, requester: "רונית שמש", urgency: "medium" as const, daysWaiting: 4 },
];

/* ── Approved Today ──────────────────────────────────────────── */
const approvedToday = [
  { id: "PR-391", project: "אטם סיליקון SG-7", customer: "תעשיות חן", totalCost: 5900, recommendedPrice: 8260, margin: 28.6, approvedBy: "עוזי טכנוכל", time: "08:45" },
  { id: "PR-392", project: "בורג נירוסטה M8", customer: "פלדה בע\"מ", totalCost: 3200, recommendedPrice: 4800, margin: 33.3, approvedBy: "שרה מנהלת", time: "10:20" },
  { id: "PR-393", project: "מכסה פלסטיק TK-200", customer: "פלסטיק פלוס", totalCost: 12400, recommendedPrice: 18600, margin: 33.3, approvedBy: "עוזי טכנוכל", time: "11:30" },
  { id: "PR-394", project: "צינור גומי FL-12", customer: "גומיטק", totalCost: 8750, recommendedPrice: 13125, margin: 33.3, approvedBy: "עוזי טכנוכל", time: "14:15" },
];

/* ── Rejected ────────────────────────────────────────────────── */
const rejected = [
  { id: "PR-381", project: "בורג נירוסטה M8 v2", customer: "פלדה בע\"מ", totalCost: 3450, recommendedPrice: 5175, margin: 33.3, rejectedBy: "עוזי טכנוכל", date: "2026-04-06", reason: "עליית מחיר ספק גבוהה מדי - לחפש ספק חלופי" },
  { id: "PR-382", project: "חלונות תרמיים - ניסיון 1", customer: "הדסה מדיקל", totalCost: 560000, recommendedPrice: 672000, margin: 20.0, rejectedBy: "שרה מנהלת", date: "2026-04-05", reason: "מרווח נמוך מ-25% - לא עומד במדיניות החברה" },
  { id: "PR-383", project: "שער חשמלי - גורדון", customer: "עיריית ת\"א", totalCost: 38000, recommendedPrice: 42000, margin: 10.5, rejectedBy: "עוזי טכנוכל", date: "2026-04-04", reason: "הנחה 20% חורגת ממדיניות - דורש אישור מנכ\"ל" },
  { id: "PR-384", project: "מעקה זכוכית - פרויקט אישי", customer: "משפחת כהן", totalCost: 24000, recommendedPrice: 28800, margin: 20.0, rejectedBy: "שרה מנהלת", date: "2026-04-03", reason: "חסר פירוט עלויות הובלה והתקנה" },
];

/* ── Approval Rules ──────────────────────────────────────────── */
const approvalRules = [
  { condition: "מחיר מעל ₪500,000", approver: "מנהל כללי", level: "CEO", color: "text-red-400" },
  { condition: "מחיר מעל ₪100,000", approver: "מנהל תפעול", level: "מנהל", color: "text-orange-400" },
  { condition: "מחיר עד ₪100,000", approver: "מנהל מכירות", level: "מנהל", color: "text-blue-400" },
  { condition: "מרווח מתחת ל-25%", approver: "מנהל כספים", level: "כספים", color: "text-yellow-400" },
  { condition: "מרווח מתחת ל-20%", approver: "מנהל כללי + כספים", level: "CEO+CFO", color: "text-red-400" },
  { condition: "הנחה מעל 10%", approver: "מנהל כללי", level: "CEO", color: "text-red-400" },
  { condition: "הנחה 5%-10%", approver: "מנהל מכירות", level: "מנהל", color: "text-orange-400" },
  { condition: "הנחה עד 5%", approver: "אישור אוטומטי", level: "מערכת", color: "text-green-400" },
  { condition: "לקוח חדש - כל סכום", approver: "מנהל מכירות + כספים", level: "מנהל+CFO", color: "text-purple-400" },
  { condition: "גרסה 3+ לאותו פרויקט", approver: "מנהל תפעול", level: "מנהל", color: "text-cyan-400" },
];

/* ── KPIs ─────────────────────────────────────────────────────── */
const highValuePending = pendingQueue.filter(p => p.recommendedPrice >= 500000).reduce((s, p) => s + p.recommendedPrice, 0);
const escalated = pendingQueue.filter(p => p.discount > 10 || p.margin < 25).length;

const kpis = [
  { label: "ממתינים לאישור", value: String(pendingQueue.length), icon: Clock, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "אושרו היום", value: String(approvedToday.length), icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10" },
  { label: "נדחו", value: String(rejected.length), icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  { label: "זמן אישור ממוצע", value: "2.8 ימים", icon: TrendingUp, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "ערך גבוה ממתין", value: shekel(highValuePending), icon: DollarSign, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "הוסלמו", value: String(escalated), icon: ArrowUpCircle, color: "text-orange-400", bg: "bg-orange-500/10" },
];

/* ── Component ────────────────────────────────────────────────── */
export default function PricingApprovals() {
  const [tab, setTab] = useState("pending");

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-green-500/20">
          <CheckCircle className="h-6 w-6 text-green-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">אישורי תמחור</h1>
          <p className="text-sm text-slate-400">טכנו-כל עוזי &mdash; ניהול אישורים, מדיניות הנחות וכללי אישור</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-slate-800/50 border-slate-700 hover:border-slate-600 transition-colors">
            <CardContent className="p-4 flex flex-col gap-2">
              <div className={`p-2 rounded-lg w-fit ${k.bg}`}>
                <k.icon className={`h-4 w-4 ${k.color}`} />
              </div>
              <span className="text-xl font-bold text-white">{k.value}</span>
              <span className="text-[11px] leading-tight text-slate-400">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-slate-800/70 border border-slate-700">
          <TabsTrigger value="pending" className="gap-1.5 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
            <Clock className="w-4 h-4" />ממתינים ({pendingQueue.length})
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-1.5 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
            <CheckCircle className="w-4 h-4" />מאושרים ({approvedToday.length})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-1.5 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
            <XCircle className="w-4 h-4" />נדחו ({rejected.length})
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5 data-[state=active]:bg-slate-700 data-[state=active]:text-white text-slate-400">
            <ShieldCheck className="w-4 h-4" />כללים
          </TabsTrigger>
        </TabsList>

        {/* Pending Queue */}
        <TabsContent value="pending">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-400" />
                תור אישורים ממתינים
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-slate-700/30">
                    <TableHead className="text-slate-400 text-right text-xs">מס׳ בקשה</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">פרויקט</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">לקוח</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">עלות כוללת</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">מחיר מומלץ</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">מרווח %</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">הנחה %</TableHead>
                    <TableHead className="text-slate-400 text-center text-xs">גרסה</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">מבקש</TableHead>
                    <TableHead className="text-slate-400 text-center text-xs">דחיפות</TableHead>
                    <TableHead className="text-slate-400 text-center text-xs">ימי המתנה</TableHead>
                    <TableHead className="text-slate-400 text-center text-xs">פעולות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingQueue.map((p) => {
                    const u = urgencyMap[p.urgency];
                    const marginClr = p.margin >= 35 ? "text-green-400" : p.margin >= 30 ? "text-yellow-400" : "text-red-400";
                    const discClr = p.discount >= 10 ? "text-red-400" : p.discount >= 5 ? "text-orange-400" : "text-green-400";
                    return (
                      <TableRow key={p.id} className="border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                        <TableCell className="text-blue-400 font-mono text-sm font-semibold">{p.id}</TableCell>
                        <TableCell className="text-white text-sm max-w-[180px] truncate">{p.project}</TableCell>
                        <TableCell className="text-slate-300 text-sm">{p.customer}</TableCell>
                        <TableCell className="text-white text-sm font-mono">{shekel(p.totalCost)}</TableCell>
                        <TableCell className="text-white text-sm font-mono font-semibold">{shekel(p.recommendedPrice)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Progress value={p.margin} className="h-1.5 w-10 bg-slate-700" />
                            <span className={`text-sm font-mono ${marginClr}`}>{p.margin}%</span>
                          </div>
                        </TableCell>
                        <TableCell className={`text-sm font-mono font-semibold ${discClr}`}>{p.discount}%</TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="border-slate-600 text-slate-300 text-xs">v{p.version}</Badge>
                        </TableCell>
                        <TableCell className="text-slate-300 text-sm">
                          <span className="flex items-center gap-1"><User className="w-3 h-3" />{p.requester}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className={`${u.cls} text-xs border-0`}>{u.label}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`text-sm font-mono ${p.daysWaiting >= 4 ? "text-red-400" : p.daysWaiting >= 2 ? "text-yellow-400" : "text-slate-300"}`}>
                            {p.daysWaiting}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-1.5 justify-center">
                            <button className="flex items-center gap-1 px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30 text-xs transition-colors">
                              <ThumbsUp className="w-3 h-3" />אשר
                            </button>
                            <button className="flex items-center gap-1 px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs transition-colors">
                              <ThumbsDown className="w-3 h-3" />דחה
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approved Today */}
        <TabsContent value="approved">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-400" />
                אושרו היום
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right text-xs">מס׳ בקשה</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">פרויקט</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">לקוח</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">עלות כוללת</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">מחיר מומלץ</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">מרווח %</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">אושר ע״י</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">שעה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvedToday.map((a) => (
                    <TableRow key={a.id} className="border-slate-700/50 hover:bg-slate-700/20">
                      <TableCell className="text-blue-400 font-mono text-sm font-semibold">{a.id}</TableCell>
                      <TableCell className="text-white text-sm">{a.project}</TableCell>
                      <TableCell className="text-slate-300 text-sm">{a.customer}</TableCell>
                      <TableCell className="text-white text-sm font-mono">{shekel(a.totalCost)}</TableCell>
                      <TableCell className="text-white text-sm font-mono font-semibold">{shekel(a.recommendedPrice)}</TableCell>
                      <TableCell>
                        <span className={`text-sm font-mono ${a.margin >= 30 ? "text-green-400" : "text-yellow-400"}`}>{a.margin}%</span>
                      </TableCell>
                      <TableCell className="text-slate-300 text-sm">{a.approvedBy}</TableCell>
                      <TableCell className="text-slate-400 text-sm font-mono">{a.time}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rejected */}
        <TabsContent value="rejected">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <XCircle className="h-5 w-5 text-red-400" />
                בקשות שנדחו
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {rejected.map((r) => (
                <Card key={r.id} className="bg-slate-700/30 border-red-500/20">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-3">
                          <span className="text-blue-400 font-mono text-sm font-semibold">{r.id}</span>
                          <span className="text-white font-semibold text-sm">{r.project}</span>
                          <span className="text-slate-400 text-xs">({r.customer})</span>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div className="text-slate-400">עלות: <span className="text-white font-mono">{shekel(r.totalCost)}</span></div>
                          <div className="text-slate-400">מחיר: <span className="text-white font-mono">{shekel(r.recommendedPrice)}</span></div>
                          <div className="text-slate-400">מרווח: <span className={r.margin >= 25 ? "text-green-400" : "text-red-400"}>{r.margin}%</span></div>
                          <div className="text-slate-400">תאריך: <span className="text-slate-300 font-mono">{r.date}</span></div>
                        </div>
                        <div className="flex items-center gap-2 bg-red-500/10 rounded px-3 py-2 border border-red-500/20">
                          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                          <span className="text-red-300 text-sm">נדחה ע״י {r.rejectedBy}: {r.reason}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Approval Rules */}
        <TabsContent value="rules">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-400" />
                מטריצת כללי אישור
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-right text-xs">תנאי</TableHead>
                    <TableHead className="text-slate-400 text-right text-xs">מאשר נדרש</TableHead>
                    <TableHead className="text-slate-400 text-center text-xs">רמת אישור</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvalRules.map((rule, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/20">
                      <TableCell className="text-white text-sm font-medium">{rule.condition}</TableCell>
                      <TableCell className={`text-sm font-semibold ${rule.color}`}>{rule.approver}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="border-slate-600 text-slate-300 text-xs">{rule.level}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <DollarSign className="h-5 w-5 text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">מחיר מעל ₪500K = אישור מנכ״ל</p>
                  <p className="text-lg font-bold text-white">₪500,000+</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-yellow-500/10">
                  <Layers className="h-5 w-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">מרווח מתחת ל-25% = אישור כספים</p>
                  <p className="text-lg font-bold text-white">&lt;25%</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/10">
                  <ArrowUpCircle className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-400">הנחה מעל 10% = אישור מנכ״ל</p>
                  <p className="text-lg font-bold text-white">&gt;10%</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
