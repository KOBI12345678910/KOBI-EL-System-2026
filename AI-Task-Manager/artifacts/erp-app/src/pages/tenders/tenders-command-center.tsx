import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Trophy, TrendingUp, Clock, Send, DollarSign,
  BarChart3, Calendar, XCircle, Timer, Target, Gavel
} from "lucide-react";
const fmt = (v: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);
const kpis = {
  activeTenders: 12,
  winRate: 38,
  pipelineValue: 18750000,
  submittedThisMonth: 5,
  pendingDecisions: 7,
  avgBidValue: 1562500,
};
const activeTenders = [
  { id: "TND-301", name: "התקנת חלונות אלומיניום — בניין עירייה", customer: "עיריית חיפה", value: 2400000, deadline: "2026-04-22", status: "בהכנה", progress: 45, manager: "יוסי אברהם" },
  { id: "TND-302", name: "מעקות בטיחות למתחם צבאי", customer: "משרד הביטחון", value: 5200000, deadline: "2026-04-18", status: "בהכנה", progress: 72, manager: "דני כהן" },
  { id: "TND-303", name: "חזיתות זכוכית — מגדל משרדים", customer: "קבוצת אלון", value: 3800000, deadline: "2026-05-01", status: "בהכנה", progress: 20, manager: "מיכל לוי" },
  { id: "TND-304", name: "דלתות פלדה למוסד חינוכי", customer: "משרד החינוך", value: 980000, deadline: "2026-04-15", status: "הוגש", progress: 100, manager: "שרה גולד" },
  { id: "TND-305", name: "פרגולות אלומיניום — פארק תעשייה", customer: "חברת נכסים בע\"מ", value: 1450000, deadline: "2026-04-28", status: "בהכנה", progress: 60, manager: "שרה גולד" },
];
const submittedBids = [
  { id: "TND-280", name: "חלונות למגדל מגורים A", customer: "שיכון ובינוי", value: 3200000, submittedDate: "2026-03-28", status: "ממתין להחלטה", competitors: 4, expectedDate: "2026-04-20" },
  { id: "TND-275", name: "ויטרינות חנויות — קניון", customer: "קבוצת אלון", value: 1850000, submittedDate: "2026-03-15", status: "ממתין להחלטה", competitors: 3, expectedDate: "2026-04-12" },
  { id: "TND-270", name: "מעקות למרפסות בפרויקט מגורים", customer: "אפריקה ישראל", value: 920000, submittedDate: "2026-03-10", status: "זכייה", competitors: 5, expectedDate: "—" },
  { id: "TND-265", name: "דלתות כניסה — בית חולים", customer: "משרד הבריאות", value: 4100000, submittedDate: "2026-03-01", status: "הפסד", competitors: 6, expectedDate: "—" },
  { id: "TND-290", name: "תריסים חשמליים — מגורים", customer: 'נדל"ן פלוס', value: 1100000, submittedDate: "2026-04-02", status: "ממתין להחלטה", competitors: 3, expectedDate: "2026-04-25" },
];
const winLossAnalysis = [
  { quarter: "Q1 2026", submitted: 14, won: 5, lost: 6, pending: 3, winRate: 45, avgWonValue: 1420000, avgLostValue: 2800000, topLossReason: "מחיר גבוה" },
  { quarter: "Q4 2025", submitted: 18, won: 7, lost: 9, pending: 2, winRate: 44, avgWonValue: 1100000, avgLostValue: 3100000, topLossReason: "מחיר גבוה" },
  { quarter: "Q3 2025", submitted: 12, won: 3, lost: 8, pending: 1, winRate: 27, avgWonValue: 950000, avgLostValue: 2500000, topLossReason: "לו\"ז אספקה" },
];
const deadlines = [
  { id: "TND-304", name: "דלתות פלדה למוסד חינוכי", customer: "משרד החינוך", deadline: "2026-04-15", daysLeft: 7, status: "הוגש", urgency: "low" },
  { id: "TND-302", name: "מעקות בטיחות למתחם צבאי", customer: "משרד הביטחון", deadline: "2026-04-18", daysLeft: 10, status: "בהכנה", urgency: "high" },
  { id: "TND-301", name: "התקנת חלונות — בניין עירייה", customer: "עיריית חיפה", deadline: "2026-04-22", daysLeft: 14, status: "בהכנה", urgency: "medium" },
  { id: "TND-303", name: "חזיתות זכוכית — מגדל משרדים", customer: "קבוצת אלון", deadline: "2026-05-01", daysLeft: 23, status: "בהכנה", urgency: "low" },
];
const statusColor = (s: string) => {
  switch (s) {
    case "הוגש": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    case "בהכנה": return "bg-amber-500/20 text-amber-300 border-amber-500/30";
    case "זכייה": return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
    case "הפסד": return "bg-red-500/20 text-red-300 border-red-500/30";
    case "ממתין להחלטה": return "bg-purple-500/20 text-purple-300 border-purple-500/30";
    default: return "bg-slate-500/20 text-slate-300 border-slate-500/30";
  }
};
const urgencyColor = (u: string) => {
  switch (u) {
    case "high": return "bg-red-500/20 text-red-300";
    case "medium": return "bg-amber-500/20 text-amber-300";
    default: return "bg-slate-600/30 text-slate-400";
  }
};
export default function TendersCommandCenter() {
  return (
    <div className="p-6 space-y-5 bg-slate-900 min-h-screen" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2 text-white">
          <Gavel className="h-7 w-7 text-amber-400" /> Tenders Command Center
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">מכרזים | הצעות מחיר | ניתוח זכייה | לוחות זמנים — טכנו-כל עוזי</p>
      </div>
      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "מכרזים פעילים", value: String(kpis.activeTenders), icon: FileText, color: "text-blue-400", border: "border-blue-500/30" },
          { label: "אחוז זכייה", value: `${kpis.winRate}%`, icon: Trophy, color: "text-emerald-400", border: "border-emerald-500/30" },
          { label: "שווי Pipeline", value: fmt(kpis.pipelineValue), icon: TrendingUp, color: "text-purple-400", border: "border-purple-500/30" },
          { label: "הוגשו החודש", value: String(kpis.submittedThisMonth), icon: Send, color: "text-cyan-400", border: "border-cyan-500/30" },
          { label: "ממתין להחלטה", value: String(kpis.pendingDecisions), icon: Clock, color: "text-amber-400", border: "border-amber-500/30" },
          { label: "ממוצע הצעה", value: fmt(kpis.avgBidValue), icon: DollarSign, color: "text-rose-400", border: "border-rose-500/30" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`bg-slate-800/50 ${kpi.border} border shadow-lg`}>
              <CardContent className="pt-3 pb-2 text-center px-2">
                <Icon className={`h-5 w-5 mx-auto ${kpi.color} mb-1`} />
                <p className="text-[10px] text-slate-400 leading-tight">{kpi.label}</p>
                <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {/* Tabs */}
      <Tabs defaultValue="active">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl bg-slate-800/60 border border-slate-700">
          <TabsTrigger value="active" className="text-xs gap-1 text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white"><FileText className="h-3.5 w-3.5" /> מכרזים פעילים</TabsTrigger>
          <TabsTrigger value="submitted" className="text-xs gap-1 text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white"><Send className="h-3.5 w-3.5" /> הצעות שהוגשו</TabsTrigger>
          <TabsTrigger value="analysis" className="text-xs gap-1 text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white"><BarChart3 className="h-3.5 w-3.5" /> ניתוח זכייה</TabsTrigger>
          <TabsTrigger value="calendar" className="text-xs gap-1 text-slate-300 data-[state=active]:bg-slate-700 data-[state=active]:text-white"><Calendar className="h-3.5 w-3.5" /> לוח זמנים</TabsTrigger>
        </TabsList>
        {/* Active Tenders */}
        <TabsContent value="active">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-white">מכרזים בעבודה</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-700/40 border-slate-700">
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מספר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">שם המכרז</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">לקוח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">שווי</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מועד אחרון</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">התקדמות</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">אחראי</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeTenders.map(t => (
                    <TableRow key={t.id} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="font-mono text-[10px] text-slate-300">{t.id}</TableCell>
                      <TableCell className="text-xs text-white font-medium">{t.name}</TableCell>
                      <TableCell className="text-xs text-slate-300">{t.customer}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-emerald-400">{fmt(t.value)}</TableCell>
                      <TableCell className="text-[10px] text-slate-400">{t.deadline}</TableCell>
                      <TableCell><Badge className={`text-[9px] ${statusColor(t.status)}`}>{t.status}</Badge></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Progress value={t.progress} className="h-1.5 w-16 bg-slate-700 [&>div]:bg-blue-500" />
                          <span className="text-[9px] font-mono text-slate-400">{t.progress}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[10px] text-slate-400">{t.manager}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        {/* Submitted Bids */}
        <TabsContent value="submitted">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-white">הצעות שהוגשו</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-700/40 border-slate-700">
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מספר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">שם</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">לקוח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">סכום</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">תאריך הגשה</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מתחרים</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">תוצאה צפויה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submittedBids.map(b => (
                    <TableRow key={b.id} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="font-mono text-[10px] text-slate-300">{b.id}</TableCell>
                      <TableCell className="text-xs text-white font-medium">{b.name}</TableCell>
                      <TableCell className="text-xs text-slate-300">{b.customer}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-emerald-400">{fmt(b.value)}</TableCell>
                      <TableCell className="text-[10px] text-slate-400">{b.submittedDate}</TableCell>
                      <TableCell className="font-mono text-[10px] text-slate-400">{b.competitors} מציעים</TableCell>
                      <TableCell><Badge className={`text-[9px] ${statusColor(b.status)}`}>{b.status}</Badge></TableCell>
                      <TableCell className="text-[10px] text-slate-400">{b.expectedDate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        {/* Win/Loss Analysis */}
        <TabsContent value="analysis">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-emerald-500/10 border-emerald-500/30">
                <CardContent className="pt-4 pb-3 text-center">
                  <Trophy className="h-7 w-7 mx-auto text-emerald-400 mb-1" />
                  <p className="text-sm text-emerald-300">זכיות Q1 2026</p>
                  <p className="text-2xl font-bold font-mono text-emerald-400">5</p>
                  <p className="text-xs text-emerald-400/70">מתוך 14 שהוגשו</p>
                </CardContent>
              </Card>
              <Card className="bg-red-500/10 border-red-500/30">
                <CardContent className="pt-4 pb-3 text-center">
                  <XCircle className="h-7 w-7 mx-auto text-red-400 mb-1" />
                  <p className="text-sm text-red-300">סיבת הפסד עיקרית</p>
                  <p className="text-xl font-bold text-red-400">מחיר גבוה</p>
                  <p className="text-xs text-red-400/70">60% מההפסדים</p>
                </CardContent>
              </Card>
              <Card className="bg-purple-500/10 border-purple-500/30">
                <CardContent className="pt-4 pb-3 text-center">
                  <Target className="h-7 w-7 mx-auto text-purple-400 mb-1" />
                  <p className="text-sm text-purple-300">ממוצע זכייה</p>
                  <p className="text-2xl font-bold font-mono text-purple-400">{fmt(1420000)}</p>
                  <p className="text-xs text-purple-400/70">לעומת {fmt(2800000)} הפסד</p>
                </CardContent>
              </Card>
            </div>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-white">ניתוח זכייה/הפסד לפי רבעון</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-700/40 border-slate-700">
                      <TableHead className="text-right text-[10px] font-semibold text-slate-300">רבעון</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-slate-300">הוגשו</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-slate-300">זכיות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-slate-300">הפסדים</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-slate-300">% זכייה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-slate-300">ממוצע זכייה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold text-slate-300">סיבת הפסד</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {winLossAnalysis.map(q => (
                      <TableRow key={q.quarter} className="border-slate-700/50 hover:bg-slate-700/30">
                        <TableCell className="font-mono text-xs text-white font-medium">{q.quarter}</TableCell>
                        <TableCell className="font-mono text-[10px] text-slate-300">{q.submitted}</TableCell>
                        <TableCell className="font-mono text-[10px] text-emerald-400 font-bold">{q.won}</TableCell>
                        <TableCell className="font-mono text-[10px] text-red-400 font-bold">{q.lost}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Progress value={q.winRate} className="h-1.5 w-12 bg-slate-700 [&>div]:bg-emerald-500" />
                            <span className={`text-[9px] font-mono ${q.winRate >= 40 ? "text-emerald-400" : "text-amber-400"}`}>{q.winRate}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-[10px] text-slate-300">{fmt(q.avgWonValue)}</TableCell>
                        <TableCell><Badge className="text-[9px] bg-red-500/20 text-red-300 border-red-500/30">{q.topLossReason}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        {/* Deadline Calendar */}
        <TabsContent value="calendar">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-2"><CardTitle className="text-sm text-white flex items-center gap-2"><Timer className="h-4 w-4 text-amber-400" /> לוח זמנים — מועדים קרובים</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-700/40 border-slate-700">
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מספר</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">שם המכרז</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">לקוח</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">מועד אחרון</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">ימים שנותרו</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">סטטוס</TableHead>
                    <TableHead className="text-right text-[10px] font-semibold text-slate-300">דחיפות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deadlines.map(d => (
                    <TableRow key={d.id} className={`border-slate-700/50 hover:bg-slate-700/30 ${d.daysLeft <= 10 && d.status !== "הוגש" ? "bg-red-500/5" : ""}`}>
                      <TableCell className="font-mono text-[10px] text-slate-300">{d.id}</TableCell>
                      <TableCell className="text-xs text-white font-medium">{d.name}</TableCell>
                      <TableCell className="text-xs text-slate-300">{d.customer}</TableCell>
                      <TableCell className="text-[10px] text-slate-400">{d.deadline}</TableCell>
                      <TableCell>
                        <span className={`font-mono text-xs font-bold ${d.daysLeft <= 10 ? "text-red-400" : d.daysLeft <= 20 ? "text-amber-400" : "text-slate-400"}`}>
                          {d.daysLeft} ימים
                        </span>
                      </TableCell>
                      <TableCell><Badge className={`text-[9px] ${statusColor(d.status)}`}>{d.status}</Badge></TableCell>
                      <TableCell>
                        <Badge className={`text-[9px] ${urgencyColor(d.urgency)}`}>
                          {d.urgency === "high" ? "דחוף" : d.urgency === "medium" ? "בינוני" : "רגיל"}
                        </Badge>
                      </TableCell>
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