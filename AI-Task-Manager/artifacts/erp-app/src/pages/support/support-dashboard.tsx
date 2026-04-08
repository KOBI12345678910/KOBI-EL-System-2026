import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Headphones, TicketCheck, Clock, AlertTriangle, TrendingUp,
  Users, BarChart3, MessageSquare, Search, CheckCircle2,
  Phone, Mail, Timer, Star, UserCheck, ArrowUpRight
} from "lucide-react";

const tickets = [
  { id: "TK-4501", subject: "תקלה בפרופיל T-60 - סדק אחרי התקנה", customer: "קונסטרקט מהנדסים", priority: "דחוף", category: "איכות", assignee: "אבי מזרחי", opened: "2026-04-08 08:30", sla: "4 שעות", status: "פתוח", channel: "טלפון" },
  { id: "TK-4502", subject: "עיכוב משלוח הזמנה #H-2890", customer: "ארקיטקט פלוס", priority: "גבוה", category: "לוגיסטיקה", assignee: "בני גולן", opened: "2026-04-08 09:15", sla: "8 שעות", status: "בטיפול", channel: "אימייל" },
  { id: "TK-4503", subject: "בקשת מפרט טכני - זכוכית Low-E", customer: "מלון הילטון חיפה", priority: "בינוני", category: "מידע טכני", assignee: "דנה לוי", opened: "2026-04-08 09:45", sla: "24 שעות", status: "בטיפול", channel: "אימייל" },
  { id: "TK-4504", subject: "תביעת אחריות - חלון שנתקע", customer: "דייר פרטי - משה כהן", priority: "גבוה", category: "אחריות", assignee: "רועי כהן", opened: "2026-04-07 14:20", sla: "24 שעות", status: "ממתין ללקוח", channel: "טלפון" },
  { id: "TK-4505", subject: "סטייה בצבע - אלקטרוסטטי לא תואם", customer: "פלדת אביב", priority: "בינוני", category: "איכות", assignee: "שרה אברהם", opened: "2026-04-07 11:00", sla: "48 שעות", status: "בטיפול", channel: "אימייל" },
  { id: "TK-4506", subject: "בקשת הצעת מחיר - חזית מבנה", customer: "עיריית חיפה", priority: "נמוך", category: "מכירות", assignee: "יוסי מזרחי", opened: "2026-04-07 10:30", sla: "48 שעות", status: "נסגר", channel: "אימייל" },
  { id: "TK-4507", subject: "רעש במנגנון תריס חשמלי", customer: "דייר פרטי - רונית לוי", priority: "בינוני", category: "אחריות", assignee: "אלי שמש", opened: "2026-04-06 16:00", sla: "48 שעות", status: "נסגר", channel: "טלפון" },
  { id: "TK-4508", subject: "בקשת החלפת חלק - ידית נשברה", customer: "חברת הבנייה שקד", priority: "נמוך", category: "חלקי חילוף", assignee: "בני גולן", opened: "2026-04-06 09:00", sla: "72 שעות", status: "נסגר", channel: "טלפון" },
];

const teamMembers = [
  { name: "רועי כהן", role: "מנהל תמיכה", open: 3, closed: 12, avgTime: "3.2 שעות", satisfaction: 96, sla: 94 },
  { name: "אבי מזרחי", role: "טכנאי בכיר", open: 2, closed: 8, avgTime: "4.1 שעות", satisfaction: 92, sla: 88 },
  { name: "דנה לוי", role: "מהנדסת תמיכה", open: 2, closed: 10, avgTime: "2.8 שעות", satisfaction: 98, sla: 96 },
  { name: "בני גולן", role: "טכנאי שטח", open: 1, closed: 6, avgTime: "5.5 שעות", satisfaction: 90, sla: 85 },
  { name: "שרה אברהם", role: "נציגת שירות", open: 1, closed: 9, avgTime: "2.1 שעות", satisfaction: 95, sla: 92 },
];

const statusColors: Record<string, string> = {
  "פתוח": "bg-red-500/20 text-red-300 border-red-500/30",
  "בטיפול": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "ממתין ללקוח": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "נסגר": "bg-green-500/20 text-green-300 border-green-500/30",
};

const priorityColors: Record<string, string> = {
  "דחוף": "bg-red-600/30 text-red-200",
  "גבוה": "bg-orange-500/20 text-orange-300",
  "בינוני": "bg-amber-500/20 text-amber-300",
  "נמוך": "bg-slate-500/20 text-slate-300",
};

export default function SupportDashboard() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  const kpis = useMemo(() => ({
    openTickets: tickets.filter(t => t.status !== "נסגר").length,
    inProgress: tickets.filter(t => t.status === "בטיפול").length,
    urgent: tickets.filter(t => t.priority === "דחוף" && t.status !== "נסגר").length,
    closedToday: tickets.filter(t => t.status === "נסגר" && t.opened.startsWith("2026-04")).length,
    avgResponseTime: "2.4 שעות",
    slaCompliance: 91,
  }), []);

  const filtered = useMemo(() => {
    if (!search) return tickets;
    const s = search.toLowerCase();
    return tickets.filter(t => t.subject.toLowerCase().includes(s) || t.customer.toLowerCase().includes(s) || t.id.toLowerCase().includes(s));
  }, [search]);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Headphones className="h-7 w-7 text-indigo-400" />
            מרכז תמיכה טכנית
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול טיקטים, SLA וביצועי צוות | טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Phone className="w-4 h-4 ml-1" />שיחה חדשה</Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700"><TicketCheck className="w-4 h-4 ml-1" />טיקט חדש</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="bg-gradient-to-br from-red-900/50 to-red-950 border-red-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-red-400">טיקטים פתוחים</p>
                <p className="text-2xl font-bold text-red-300">{kpis.openTickets}</p>
              </div>
              <TicketCheck className="h-7 w-7 text-red-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-900/50 to-blue-950 border-blue-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-400">בטיפול</p>
                <p className="text-2xl font-bold text-blue-300">{kpis.inProgress}</p>
              </div>
              <Clock className="h-7 w-7 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-900/50 to-orange-950 border-orange-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-orange-400">דחופים</p>
                <p className="text-2xl font-bold text-orange-300">{kpis.urgent}</p>
              </div>
              <AlertTriangle className="h-7 w-7 text-orange-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-900/50 to-green-950 border-green-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400">נסגרו החודש</p>
                <p className="text-2xl font-bold text-green-300">{kpis.closedToday}</p>
              </div>
              <CheckCircle2 className="h-7 w-7 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-900/50 to-cyan-950 border-cyan-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-cyan-400">זמן תגובה ממוצע</p>
                <p className="text-xl font-bold text-cyan-300">{kpis.avgResponseTime}</p>
              </div>
              <Timer className="h-7 w-7 text-cyan-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-900/50 to-purple-950 border-purple-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-purple-400">עמידה ב-SLA</p>
                <p className="text-2xl font-bold text-purple-300">{kpis.slaCompliance}%</p>
              </div>
              <BarChart3 className="h-7 w-7 text-purple-500" />
            </div>
            <Progress value={kpis.slaCompliance} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList className="bg-background/50">
            <TabsTrigger value="overview">טיקטים</TabsTrigger>
            <TabsTrigger value="team">ביצועי צוות</TabsTrigger>
            <TabsTrigger value="sla">SLA מעקב</TabsTrigger>
          </TabsList>
          <div className="relative">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input placeholder="חיפוש טיקט / לקוח..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-64 bg-background/50" />
          </div>
        </div>

        {/* Tickets Tab */}
        <TabsContent value="overview" className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס׳</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">נושא</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">לקוח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עדיפות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מטפל</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">נפתח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">SLA</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ערוץ</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(t => (
                      <tr key={t.id} className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${t.priority === "דחוף" ? "bg-red-950/10" : ""}`}>
                        <td className="p-3 font-mono text-xs text-foreground">{t.id}</td>
                        <td className="p-3 text-foreground font-medium max-w-[250px] truncate">{t.subject}</td>
                        <td className="p-3 text-muted-foreground">{t.customer}</td>
                        <td className="p-3"><Badge className={priorityColors[t.priority] || ""}>{t.priority}</Badge></td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{t.category}</Badge></td>
                        <td className="p-3 text-foreground">
                          <div className="flex items-center gap-1"><UserCheck className="w-3 h-3 text-muted-foreground" />{t.assignee}</div>
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{t.opened}</td>
                        <td className="p-3 text-foreground text-xs">{t.sla}</td>
                        <td className="p-3">
                          {t.channel === "טלפון" ? <Phone className="w-4 h-4 text-green-400" /> : <Mail className="w-4 h-4 text-blue-400" />}
                        </td>
                        <td className="p-3"><Badge className={statusColors[t.status] || ""}>{t.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Performance Tab */}
        <TabsContent value="team" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamMembers.map(m => (
              <Card key={m.name} className="bg-card/50 border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-600/30 flex items-center justify-center">
                      <Users className="w-5 h-5 text-indigo-300" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground">{m.name}</h3>
                      <p className="text-xs text-muted-foreground">{m.role}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2 rounded bg-muted/20">
                      <p className="text-xs text-muted-foreground">פתוחים</p>
                      <p className="text-lg font-bold text-red-300">{m.open}</p>
                    </div>
                    <div className="p-2 rounded bg-muted/20">
                      <p className="text-xs text-muted-foreground">נסגרו (שבוע)</p>
                      <p className="text-lg font-bold text-green-300">{m.closed}</p>
                    </div>
                    <div className="p-2 rounded bg-muted/20">
                      <p className="text-xs text-muted-foreground">זמן ממוצע</p>
                      <p className="text-sm font-bold text-cyan-300">{m.avgTime}</p>
                    </div>
                    <div className="p-2 rounded bg-muted/20">
                      <p className="text-xs text-muted-foreground">שביעות רצון</p>
                      <p className="text-sm font-bold text-amber-300">{m.satisfaction}%</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">עמידה ב-SLA</span>
                      <span className={m.sla >= 90 ? "text-green-400" : "text-amber-400"}>{m.sla}%</span>
                    </div>
                    <Progress value={m.sla} className="h-1.5" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* SLA Tab */}
        <TabsContent value="sla" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Timer className="w-4 h-4 text-cyan-400" />
                  הגדרות SLA לפי עדיפות
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { priority: "דחוף", response: "30 דקות", resolution: "4 שעות", compliance: 85 },
                  { priority: "גבוה", response: "1 שעה", resolution: "8 שעות", compliance: 90 },
                  { priority: "בינוני", response: "4 שעות", resolution: "24 שעות", compliance: 95 },
                  { priority: "נמוך", response: "8 שעות", resolution: "72 שעות", compliance: 98 },
                ].map(s => (
                  <div key={s.priority} className="flex items-center justify-between p-3 rounded bg-muted/20">
                    <div className="flex items-center gap-3">
                      <Badge className={priorityColors[s.priority] || ""}>{s.priority}</Badge>
                      <div className="text-xs text-muted-foreground">
                        <span>תגובה: {s.response}</span>
                        <span className="mx-2">|</span>
                        <span>פתרון: {s.resolution}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={s.compliance} className="h-2 w-20" />
                      <span className={`text-xs font-bold ${s.compliance >= 90 ? "text-green-400" : "text-amber-400"}`}>{s.compliance}%</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Star className="w-4 h-4 text-amber-400" />
                  שביעות רצון לקוחות
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { category: "איכות מוצר", score: 94 },
                  { category: "זמן תגובה", score: 88 },
                  { category: "פתרון בפנייה ראשונה", score: 76 },
                  { category: "מקצועיות הצוות", score: 96 },
                  { category: "ציון כולל", score: 91 },
                ].map(c => (
                  <div key={c.category} className="flex items-center justify-between p-2 rounded bg-muted/20">
                    <span className="text-sm text-foreground">{c.category}</span>
                    <div className="flex items-center gap-2">
                      <Progress value={c.score} className="h-2 w-24" />
                      <span className={`text-sm font-bold ${c.score >= 90 ? "text-green-400" : c.score >= 80 ? "text-amber-400" : "text-red-400"}`}>
                        {c.score}%
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
