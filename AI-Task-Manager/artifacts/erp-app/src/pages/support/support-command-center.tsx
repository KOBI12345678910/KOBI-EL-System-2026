import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Headphones, Clock, ShieldCheck, Star, PhoneCall, AlertTriangle,
  TrendingUp, Users, Crown, CheckCircle, MessageSquare, BarChart3,
  ArrowUpRight, ArrowDownRight, Timer, UserCheck
} from "lucide-react";

const kpis = {
  openTickets: 23,
  avgResponseMin: 18,
  slaCompliance: 94.2,
  csatScore: 4.6,
  firstContactResolution: 72,
  escalations: 4,
};

const FALLBACK_OPEN_TICKETS = [
  { id: "TKT-1041", customer: "קבוצת אלון", contact: "רועי כהן", category: "תקלה", subject: "חלון אלומיניום לא נסגר — פרויקט מגדל C", priority: "critical", sla: "02:15", status: "in_progress", agent: "מיכל לוי" },
  { id: "TKT-1042", customer: "אמות השקעות", contact: "דנה ברק", category: "בקשת שירות", subject: "התקנת דלת הזזה — קומה 12", priority: "high", sla: "04:30", status: "open", agent: "—" },
  { id: "TKT-1043", customer: "שיכון ובינוי", contact: "אלון דוד", category: "שאלה", subject: "מפרט טכני — זכוכית מחוסמת 10mm", priority: "medium", sla: "08:00", status: "in_progress", agent: "יוסי אברהם" },
  { id: "TKT-1044", customer: 'נדל"ן פלוס', contact: "שרה גולד", category: "תקלה", subject: "רטיבות סביב מסגרת ברזל — אתר צפון", priority: "high", sla: "01:45", status: "in_progress", agent: "מיכל לוי" },
  { id: "TKT-1045", customer: "חברת חשמל", contact: "ניר שמש", category: "בקשת שירות", subject: "תחזוקה שנתית — חלונות בניין ראשי", priority: "low", sla: "24:00", status: "open", agent: "—" },
  { id: "TKT-1046", customer: "קמפוס הייטק נתניה", contact: "מיכאל ברק", category: "תקלה", subject: "סדק בזכוכית כפולה — קומה 3", priority: "critical", sla: "00:45", status: "escalated", agent: "יוסי אברהם" },
  { id: "TKT-1047", customer: "מלון רויאל אילת", contact: "רינת כץ", category: "שאלה", subject: "הצעת מחיר לשדרוג פרופילים", priority: "low", sla: "16:00", status: "open", agent: "—" },
];

const FALLBACK_SLA_TRACKING = [
  { category: "תקלה קריטית", slaTarget: "4 שעות", compliance: 88, total: 12, met: 10, breached: 2, avgResolution: "3.2 שעות" },
  { category: "תקלה רגילה", slaTarget: "8 שעות", compliance: 95, total: 28, met: 26, breached: 2, avgResolution: "5.8 שעות" },
  { category: "בקשת שירות", slaTarget: "24 שעות", compliance: 98, total: 35, met: 34, breached: 1, avgResolution: "14 שעות" },
  { category: "שאלה", slaTarget: "48 שעות", compliance: 100, total: 20, met: 20, breached: 0, avgResolution: "12 שעות" },
  { category: "VIP — כל סוג", slaTarget: "2 שעות", compliance: 82, total: 8, met: 6, breached: 2, avgResolution: "1.8 שעות" },
];

const FALLBACK_TEAM_PERFORMANCE = [
  { name: "מיכל לוי", role: "ראש צוות שירות", ticketsClosed: 48, avgResponse: 12, csat: 4.8, fcr: 78, escalations: 1, slaRate: 97 },
  { name: "יוסי אברהם", role: "טכנאי בכיר", ticketsClosed: 42, avgResponse: 15, csat: 4.7, fcr: 82, escalations: 0, slaRate: 95 },
  { name: "נועה שמיר", role: "נציגת שירות", ticketsClosed: 35, avgResponse: 22, csat: 4.5, fcr: 65, escalations: 2, slaRate: 91 },
  { name: "אור ברק", role: "טכנאי שטח", ticketsClosed: 30, avgResponse: 28, csat: 4.3, fcr: 58, escalations: 1, slaRate: 88 },
];

const FALLBACK_VIP_CUSTOMERS = [
  { customer: "קבוצת אלון", tier: "פלטינום", openTickets: 3, avgResponse: 8, csat: 4.9, revenue: "₪8.5M", lastContact: "2026-04-08", status: "active_issue" },
  { customer: "אמות השקעות", tier: "זהב", openTickets: 1, avgResponse: 14, csat: 4.5, revenue: "₪4.2M", lastContact: "2026-04-07", status: "active_issue" },
  { customer: "שיכון ובינוי", tier: "פלטינום", openTickets: 1, avgResponse: 10, csat: 4.7, revenue: "₪6.8M", lastContact: "2026-04-08", status: "active_issue" },
  { customer: "מלון רויאל אילת", tier: "זהב", openTickets: 1, avgResponse: 20, csat: 4.2, revenue: "₪3.1M", lastContact: "2026-04-06", status: "monitoring" },
  { customer: "חברת חשמל", tier: "כסף", openTickets: 1, avgResponse: 18, csat: 4.4, revenue: "₪2.0M", lastContact: "2026-04-05", status: "ok" },
];

const priorityBadge = (p: string) => {
  if (p === "critical") return "bg-red-500/20 text-red-400 border-red-500/30";
  if (p === "high") return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (p === "medium") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  return "bg-slate-500/20 text-slate-400 border-slate-500/30";
};
const priorityLabel = (p: string) => {
  if (p === "critical") return "קריטי";
  if (p === "high") return "גבוה";
  if (p === "medium") return "בינוני";
  return "נמוך";
};
const statusBadge = (s: string) => {
  if (s === "in_progress") return "bg-amber-500/20 text-amber-400";
  if (s === "open") return "bg-blue-500/20 text-blue-400";
  if (s === "escalated") return "bg-red-500/20 text-red-400";
  if (s === "resolved") return "bg-emerald-500/20 text-emerald-400";
  return "bg-slate-500/20 text-slate-400";
};
const statusLabel = (s: string) => {
  if (s === "in_progress") return "בטיפול";
  if (s === "open") return "פתוח";
  if (s === "escalated") return "הוסלם";
  if (s === "resolved") return "נפתר";
  return s;
};
const tierBadge = (t: string) => {
  if (t === "פלטינום") return "bg-purple-500/20 text-purple-400";
  if (t === "זהב") return "bg-amber-500/20 text-amber-400";
  return "bg-slate-500/20 text-slate-400";
};
const vipStatusBadge = (s: string) => {
  if (s === "active_issue") return "bg-red-500/20 text-red-400";
  if (s === "monitoring") return "bg-amber-500/20 text-amber-400";
  return "bg-emerald-500/20 text-emerald-400";
};
const vipStatusLabel = (s: string) => {
  if (s === "active_issue") return "פנייה פתוחה";
  if (s === "monitoring") return "מעקב";
  return "תקין";
};

export default function SupportCommandCenter() {
  const { data: supportcommandcenterData } = useQuery({
    queryKey: ["support-command-center"],
    queryFn: () => authFetch("/api/support/support_command_center"),
    staleTime: 5 * 60 * 1000,
  });

  const openTickets = supportcommandcenterData ?? FALLBACK_OPEN_TICKETS;
  const slaTracking = FALLBACK_SLA_TRACKING;
  const teamPerformance = FALLBACK_TEAM_PERFORMANCE;
  const vipCustomers = FALLBACK_VIP_CUSTOMERS;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Headphones className="w-7 h-7 text-cyan-400" />
            מרכז פיקוד שירות ותמיכה
          </h1>
          <p className="text-sm text-slate-400 mt-1">פניות | SLA | ביצועי צוות | לקוחות VIP — טכנו-כל עוזי</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-cyan-500/20 text-cyan-400 text-xs">אפריל 2026</Badge>
          <Badge className="bg-green-500/20 text-green-400 text-xs">LIVE</Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "פניות פתוחות", value: kpis.openTickets, icon: MessageSquare, color: "text-cyan-400", bg: "bg-cyan-500/10", trend: "+3 היום", trendUp: true },
          { label: "זמן תגובה ממוצע", value: `${kpis.avgResponseMin} דק׳`, icon: Timer, color: "text-blue-400", bg: "bg-blue-500/10", trend: "-4 דק׳", trendUp: false },
          { label: "עמידה ב-SLA", value: `${kpis.slaCompliance}%`, icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/10", trend: "+1.2%", trendUp: true },
          { label: "CSAT Score", value: `${kpis.csatScore}/5`, icon: Star, color: "text-amber-400", bg: "bg-amber-500/10", trend: "+0.1", trendUp: true },
          { label: "פתרון במגע ראשון", value: `${kpis.firstContactResolution}%`, icon: CheckCircle, color: "text-purple-400", bg: "bg-purple-500/10", trend: "+5%", trendUp: true },
          { label: "הסלמות", value: kpis.escalations, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10", trend: "+1 השבוע", trendUp: true },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg} border-slate-700 bg-slate-800/50`}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`h-5 w-5 ${kpi.color}`} />
                  <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                    {kpi.label === "הסלמות" || kpi.label === "פניות פתוחות" ? (
                      <ArrowUpRight className="h-3 w-3 text-red-400" />
                    ) : kpi.trendUp ? (
                      <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3 text-emerald-400" />
                    )}
                    {kpi.trend}
                  </span>
                </div>
                <p className="text-xs text-slate-400">{kpi.label}</p>
                <p className={`text-xl font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="tickets">
        <TabsList className="bg-slate-800/50 border border-slate-700">
          <TabsTrigger value="tickets" className="text-xs gap-1 data-[state=active]:bg-slate-700"><MessageSquare className="h-3.5 w-3.5" /> פניות פתוחות</TabsTrigger>
          <TabsTrigger value="sla" className="text-xs gap-1 data-[state=active]:bg-slate-700"><ShieldCheck className="h-3.5 w-3.5" /> SLA</TabsTrigger>
          <TabsTrigger value="team" className="text-xs gap-1 data-[state=active]:bg-slate-700"><Users className="h-3.5 w-3.5" /> ביצועי צוות</TabsTrigger>
          <TabsTrigger value="vip" className="text-xs gap-1 data-[state=active]:bg-slate-700"><Crown className="h-3.5 w-3.5" /> לקוחות VIP</TabsTrigger>
        </TabsList>

        {/* Open Tickets Tab */}
        <TabsContent value="tickets">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white flex items-center gap-2"><MessageSquare className="h-4 w-4 text-cyan-400" /> פניות פתוחות ({openTickets.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400 text-xs">#</TableHead>
                    <TableHead className="text-slate-400 text-xs">לקוח</TableHead>
                    <TableHead className="text-slate-400 text-xs">קטגוריה</TableHead>
                    <TableHead className="text-slate-400 text-xs">נושא</TableHead>
                    <TableHead className="text-slate-400 text-xs">עדיפות</TableHead>
                    <TableHead className="text-slate-400 text-xs">SLA נותר</TableHead>
                    <TableHead className="text-slate-400 text-xs">סטטוס</TableHead>
                    <TableHead className="text-slate-400 text-xs">מטפל</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openTickets.map((t) => (
                    <TableRow key={t.id} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-slate-300 font-mono text-xs">{t.id}</TableCell>
                      <TableCell className="text-white text-xs">{t.customer}</TableCell>
                      <TableCell className="text-slate-300 text-xs">{t.category}</TableCell>
                      <TableCell className="text-slate-300 text-xs max-w-[250px] truncate">{t.subject}</TableCell>
                      <TableCell><Badge className={`${priorityBadge(t.priority)} text-[10px]`}>{priorityLabel(t.priority)}</Badge></TableCell>
                      <TableCell className={`font-mono text-xs ${t.sla <= "02:00" ? "text-red-400" : "text-slate-300"}`}>{t.sla}</TableCell>
                      <TableCell><Badge className={`${statusBadge(t.status)} text-[10px]`}>{statusLabel(t.status)}</Badge></TableCell>
                      <TableCell className="text-slate-300 text-xs">{t.agent}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SLA Tab */}
        <TabsContent value="sla">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /> מעקב SLA לפי קטגוריה</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400 text-xs">קטגוריה</TableHead>
                    <TableHead className="text-slate-400 text-xs">יעד SLA</TableHead>
                    <TableHead className="text-slate-400 text-xs">עמידה</TableHead>
                    <TableHead className="text-slate-400 text-xs">סה״כ</TableHead>
                    <TableHead className="text-slate-400 text-xs">עמדו</TableHead>
                    <TableHead className="text-slate-400 text-xs">חריגות</TableHead>
                    <TableHead className="text-slate-400 text-xs">זמן טיפול ממוצע</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slaTracking.map((s, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-white text-xs font-medium">{s.category}</TableCell>
                      <TableCell className="text-slate-300 text-xs">{s.slaTarget}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={s.compliance} className="h-1.5 w-16 bg-slate-700" />
                          <span className={`text-xs font-mono ${s.compliance >= 95 ? "text-emerald-400" : s.compliance >= 85 ? "text-amber-400" : "text-red-400"}`}>{s.compliance}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-300 text-xs font-mono">{s.total}</TableCell>
                      <TableCell className="text-emerald-400 text-xs font-mono">{s.met}</TableCell>
                      <TableCell className={`text-xs font-mono ${s.breached > 0 ? "text-red-400" : "text-emerald-400"}`}>{s.breached}</TableCell>
                      <TableCell className="text-slate-300 text-xs">{s.avgResolution}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Performance Tab */}
        <TabsContent value="team">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white flex items-center gap-2"><Users className="h-4 w-4 text-purple-400" /> ביצועי צוות — חודש נוכחי</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400 text-xs">שם</TableHead>
                    <TableHead className="text-slate-400 text-xs">תפקיד</TableHead>
                    <TableHead className="text-slate-400 text-xs">פניות שנסגרו</TableHead>
                    <TableHead className="text-slate-400 text-xs">תגובה ממוצעת</TableHead>
                    <TableHead className="text-slate-400 text-xs">CSAT</TableHead>
                    <TableHead className="text-slate-400 text-xs">FCR</TableHead>
                    <TableHead className="text-slate-400 text-xs">הסלמות</TableHead>
                    <TableHead className="text-slate-400 text-xs">SLA</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {teamPerformance.map((m, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-white text-xs font-medium">{m.name}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{m.role}</TableCell>
                      <TableCell className="text-slate-300 text-xs font-mono">{m.ticketsClosed}</TableCell>
                      <TableCell className="text-slate-300 text-xs font-mono">{m.avgResponse} דק׳</TableCell>
                      <TableCell>
                        <span className={`text-xs font-mono ${m.csat >= 4.5 ? "text-emerald-400" : "text-amber-400"}`}>{m.csat}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={m.fcr} className="h-1.5 w-12 bg-slate-700" />
                          <span className={`text-xs font-mono ${m.fcr >= 75 ? "text-emerald-400" : m.fcr >= 60 ? "text-amber-400" : "text-red-400"}`}>{m.fcr}%</span>
                        </div>
                      </TableCell>
                      <TableCell className={`text-xs font-mono ${m.escalations === 0 ? "text-emerald-400" : "text-red-400"}`}>{m.escalations}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] ${m.slaRate >= 95 ? "bg-emerald-500/20 text-emerald-400" : m.slaRate >= 90 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>{m.slaRate}%</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* VIP Customers Tab */}
        <TabsContent value="vip">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white flex items-center gap-2"><Crown className="h-4 w-4 text-amber-400" /> לקוחות VIP — סטטוס שירות</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400 text-xs">לקוח</TableHead>
                    <TableHead className="text-slate-400 text-xs">דרגה</TableHead>
                    <TableHead className="text-slate-400 text-xs">פניות פתוחות</TableHead>
                    <TableHead className="text-slate-400 text-xs">תגובה ממוצעת</TableHead>
                    <TableHead className="text-slate-400 text-xs">CSAT</TableHead>
                    <TableHead className="text-slate-400 text-xs">הכנסה שנתית</TableHead>
                    <TableHead className="text-slate-400 text-xs">קשר אחרון</TableHead>
                    <TableHead className="text-slate-400 text-xs">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vipCustomers.map((v, i) => (
                    <TableRow key={i} className="border-slate-700/50 hover:bg-slate-700/30">
                      <TableCell className="text-white text-xs font-medium">{v.customer}</TableCell>
                      <TableCell><Badge className={`${tierBadge(v.tier)} text-[10px]`}>{v.tier}</Badge></TableCell>
                      <TableCell className={`text-xs font-mono ${v.openTickets > 0 ? "text-amber-400" : "text-emerald-400"}`}>{v.openTickets}</TableCell>
                      <TableCell className="text-slate-300 text-xs font-mono">{v.avgResponse} דק׳</TableCell>
                      <TableCell>
                        <span className={`text-xs font-mono ${v.csat >= 4.5 ? "text-emerald-400" : "text-amber-400"}`}>{v.csat}</span>
                      </TableCell>
                      <TableCell className="text-slate-300 text-xs font-mono">{v.revenue}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{v.lastContact}</TableCell>
                      <TableCell><Badge className={`${vipStatusBadge(v.status)} text-[10px]`}>{vipStatusLabel(v.status)}</Badge></TableCell>
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