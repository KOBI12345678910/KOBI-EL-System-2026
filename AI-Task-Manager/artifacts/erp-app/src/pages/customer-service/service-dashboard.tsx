import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Headphones, MessageSquare, Clock, Star, TrendingUp, AlertTriangle,
  CheckCircle, Users, Shield, RotateCcw, Inbox, Phone, Mail, Search,
  ArrowUpRight, ArrowDownRight, Timer, BarChart3, UserCheck
} from "lucide-react";

const FALLBACK_KPIS = [
  { label: "פניות פתוחות", value: 23, icon: MessageSquare, color: "text-blue-500", bg: "bg-blue-50", change: "+3", up: true },
  { label: "נפתרו היום", value: 14, icon: CheckCircle, color: "text-green-500", bg: "bg-green-50", change: "+5", up: true },
  { label: "זמן תגובה ממוצע", value: "1.4 שעות", icon: Clock, color: "text-amber-500", bg: "bg-amber-50", change: "-12%", up: false },
  { label: "ציון CSAT", value: "4.7/5", icon: Star, color: "text-yellow-500", bg: "bg-yellow-50", change: "+0.2", up: true },
  { label: "עמידה ב-SLA", value: "94.2%", icon: Shield, color: "text-indigo-500", bg: "bg-indigo-50", change: "+1.8%", up: true },
  { label: "הסלמות", value: 3, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50", change: "-2", up: false },
  { label: "פתרון במגע ראשון", value: "78%", icon: RotateCcw, color: "text-teal-500", bg: "bg-teal-50", change: "+4%", up: true },
  { label: "צבר ממתין", value: 9, icon: Inbox, color: "text-purple-500", bg: "bg-purple-50", change: "-1", up: false },
];

const FALLBACK_TICKETS = [
  { id: "TK-1001", customer: "אלומיניום הצפון בע\"מ", subject: "עיכוב באספקת פרופילים", priority: "גבוהה", status: "פתוח", channel: "טלפון", agent: "דנה כהן", created: "08/04/2026 09:15" },
  { id: "TK-1002", customer: "זגוגית השרון", subject: "סדק בזכוכית מחוסמת", priority: "דחוף", status: "בטיפול", channel: "מייל", agent: "יוסי לוי", created: "08/04/2026 08:30" },
  { id: "TK-1003", customer: "מתכת פלוס", subject: "שאלה על מפרט טכני", priority: "רגילה", status: "ממתין ללקוח", channel: "צ'אט", agent: "מיכל אברהם", created: "07/04/2026 16:45" },
  { id: "TK-1004", customer: "בניין ירוק בע\"מ", subject: "חלון שלא נסגר כראוי", priority: "גבוהה", status: "בטיפול", channel: "טלפון", agent: "רועי דוד", created: "07/04/2026 14:20" },
  { id: "TK-1005", customer: "קבלן שמעון אלון", subject: "בקשת הצעת מחיר", priority: "נמוכה", status: "פתוח", channel: "מייל", agent: "שרה מזרחי", created: "07/04/2026 11:00" },
  { id: "TK-1006", customer: "פרויקט מגדלי ים", subject: "אי התאמה במידות", priority: "דחוף", status: "הסלמה", channel: "טלפון", agent: "דנה כהן", created: "07/04/2026 10:30" },
  { id: "TK-1007", customer: "סטודיו אדריכלים לב", subject: "בקשת דגימת צבע", priority: "נמוכה", status: "ממתין ללקוח", channel: "מייל", agent: "יוסי לוי", created: "06/04/2026 15:10" },
  { id: "TK-1008", customer: "חברת בנייה אופק", subject: "תקלה בדלת הזזה", priority: "גבוהה", status: "פתוח", channel: "טלפון", agent: "אמיר חסן", created: "06/04/2026 13:45" },
  { id: "TK-1009", customer: "אלומטל תעשיות", subject: "עדכון סטטוס הזמנה", priority: "רגילה", status: "נסגר", channel: "צ'אט", agent: "מיכל אברהם", created: "06/04/2026 09:20" },
  { id: "TK-1010", customer: "זכוכית אילת", subject: "בעיה בחשבונית", priority: "רגילה", status: "בטיפול", channel: "מייל", agent: "שרה מזרחי", created: "05/04/2026 17:00" },
  { id: "TK-1011", customer: "מפעלי גולן מתכת", subject: "תלונה על איכות ריתוך", priority: "גבוהה", status: "הסלמה", channel: "טלפון", agent: "רועי דוד", created: "05/04/2026 14:30" },
  { id: "TK-1012", customer: "קליל תעשיות", subject: "שינוי כתובת משלוח", priority: "נמוכה", status: "נסגר", channel: "מייל", agent: "אמיר חסן", created: "05/04/2026 10:15" },
];

const FALLBACK_AGENTS = [
  { name: "דנה כהן", role: "ראש צוות", open: 5, resolved: 18, avgTime: "1.1 שעות", csat: 97, status: "מחוברת" },
  { name: "יוסי לוי", role: "נציג בכיר", open: 4, resolved: 15, avgTime: "1.6 שעות", csat: 93, status: "מחובר" },
  { name: "מיכל אברהם", role: "נציגה", open: 3, resolved: 12, avgTime: "1.3 שעות", csat: 98, status: "מחוברת" },
  { name: "רועי דוד", role: "נציג", open: 4, resolved: 10, avgTime: "2.0 שעות", csat: 90, status: "בהפסקה" },
  { name: "שרה מזרחי", role: "נציגה", open: 3, resolved: 11, avgTime: "1.5 שעות", csat: 95, status: "מחוברת" },
  { name: "אמיר חסן", role: "נציג", open: 4, resolved: 9, avgTime: "1.8 שעות", csat: 91, status: "מחובר" },
];

const FALLBACK_SLA_CATEGORIES = [
  { category: "תקלות דחופות", target: "2 שעות", compliance: 91, total: 22, met: 20, breached: 2 },
  { category: "תלונות איכות", target: "4 שעות", compliance: 95, total: 40, met: 38, breached: 2 },
  { category: "שאלות טכניות", target: "8 שעות", compliance: 97, total: 65, met: 63, breached: 2 },
  { category: "בקשות מידע", target: "24 שעות", compliance: 99, total: 80, met: 79, breached: 1 },
  { category: "החזרות/RMA", target: "12 שעות", compliance: 88, total: 16, met: 14, breached: 2 },
  { category: "חשבוניות/תשלום", target: "24 שעות", compliance: 100, total: 30, met: 30, breached: 0 },
];

const priorityColor: Record<string, string> = {
  "דחוף": "bg-red-100 text-red-700 border-red-300",
  "גבוהה": "bg-orange-100 text-orange-700 border-orange-300",
  "רגילה": "bg-blue-100 text-blue-700 border-blue-300",
  "נמוכה": "bg-gray-100 text-gray-600 border-gray-300",
};

const statusColor: Record<string, string> = {
  "פתוח": "bg-blue-100 text-blue-700",
  "בטיפול": "bg-amber-100 text-amber-700",
  "ממתין ללקוח": "bg-purple-100 text-purple-700",
  "הסלמה": "bg-red-100 text-red-700",
  "נסגר": "bg-green-100 text-green-700",
};

const channelIcon: Record<string, typeof Phone> = {
  "טלפון": Phone,
  "מייל": Mail,
  "צ'אט": MessageSquare,
};

const FALLBACK_TICKET_DISTRIBUTION = [
  { label: "פתוחות", count: 8, color: "bg-blue-500", pct: 35 },
  { label: "בטיפול", count: 6, color: "bg-amber-500", pct: 26 },
  { label: "ממתין ללקוח", count: 3, color: "bg-purple-500", pct: 13 },
  { label: "הסלמה", count: 2, color: "bg-red-500", pct: 9 },
  { label: "נסגרו", count: 4, color: "bg-green-500", pct: 17 },
];

export default function ServiceDashboard() {
  const { data: servicedashboardData } = useQuery({
    queryKey: ["service-dashboard"],
    queryFn: () => authFetch("/api/customer-service/service_dashboard"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = servicedashboardData ?? FALLBACK_KPIS;
  const agents = FALLBACK_AGENTS;
  const slaCategories = FALLBACK_SLA_CATEGORIES;
  const ticketDistribution = FALLBACK_TICKET_DISTRIBUTION;
  const tickets = FALLBACK_TICKETS;

  const [search, setSearch] = useState("");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Headphones className="h-7 w-7 text-blue-600" />
            מרכז שירות לקוחות - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מרכז פיקוד שירות - ניטור בזמן אמת</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><BarChart3 className="h-4 w-4 ml-1" />דוחות</Button>
          <Button size="sm"><MessageSquare className="h-4 w-4 ml-1" />פניה חדשה</Button>
        </div>
      </div>

      {/* 8 KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={i}>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${k.bg}`}>
                    <Icon className={`h-5 w-5 ${k.color}`} />
                  </div>
                  <span className={`text-xs font-medium flex items-center gap-0.5 ${k.up ? "text-green-600" : "text-red-600"}`}>
                    {k.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {k.change}
                  </span>
                </div>
                <p className="text-2xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">סקירה כללית</TabsTrigger>
          <TabsTrigger value="tickets">פניות</TabsTrigger>
          <TabsTrigger value="team">צוות</TabsTrigger>
          <TabsTrigger value="sla">SLA</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Ticket Distribution */}
            <Card>
              <CardHeader><CardTitle className="text-lg">התפלגות פניות</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {ticketDistribution.map((d, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{d.label}</span>
                      <span className="text-muted-foreground">{d.count} ({d.pct}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5">
                      <div className={`h-2.5 rounded-full ${d.color}`} style={{ width: `${d.pct}%` }} />
                    </div>
                  </div>
                ))}
                <div className="pt-2 border-t flex items-center justify-between text-sm font-medium">
                  <span>סה"כ פניות פעילות</span>
                  <span>23</span>
                </div>
              </CardContent>
            </Card>

            {/* Team Performance */}
            <Card>
              <CardHeader><CardTitle className="text-lg">ביצועי צוות - סיכום יומי</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {agents.slice(0, 4).map((a, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                      {a.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{a.name}</span>
                        <Badge variant="outline" className="text-xs">{a.resolved} נפתרו</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Timer className="h-3 w-3" />{a.avgTime}</span>
                        <span className="flex items-center gap-1"><Star className="h-3 w-3 text-yellow-500" />{a.csat}%</span>
                        <span className="flex items-center gap-1"><Inbox className="h-3 w-3" />{a.open} פתוחות</span>
                      </div>
                      <Progress value={a.csat} className="h-1.5 mt-1.5" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Channel summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { channel: "טלפון", icon: Phone, count: 12, pct: 52, avgWait: "0:45" },
              { channel: "מייל", icon: Mail, count: 8, pct: 35, avgWait: "2.1 שעות" },
              { channel: "צ'אט", icon: MessageSquare, count: 3, pct: 13, avgWait: "0:20" },
            ].map((ch, i) => {
              const Icon = ch.icon;
              return (
                <Card key={i}>
                  <CardContent className="pt-5 flex items-center gap-4">
                    <div className="p-3 rounded-lg bg-blue-50">
                      <Icon className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-bold text-lg">{ch.channel}</p>
                      <p className="text-sm text-muted-foreground">{ch.count} פניות ({ch.pct}%)</p>
                      <p className="text-xs text-muted-foreground">המתנה ממוצעת: {ch.avgWait}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tickets Tab */}
        <TabsContent value="tickets" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">רשימת פניות</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="חיפוש פניה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right p-3 font-medium text-muted-foreground">מזהה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">לקוח</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">נושא</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">עדיפות</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סטטוס</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">ערוץ</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">נציג</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">תאריך</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets
                      .filter(t => !search || Object.values(t).some(v => v.includes(search)))
                      .map((t, i) => {
                        const ChIcon = channelIcon[t.channel] || MessageSquare;
                        return (
                          <tr key={i} className="border-b hover:bg-muted/50 transition-colors">
                            <td className="p-3 font-mono text-xs font-bold">{t.id}</td>
                            <td className="p-3 font-medium">{t.customer}</td>
                            <td className="p-3">{t.subject}</td>
                            <td className="p-3"><Badge variant="outline" className={priorityColor[t.priority]}>{t.priority}</Badge></td>
                            <td className="p-3"><Badge className={statusColor[t.status]}>{t.status}</Badge></td>
                            <td className="p-3"><ChIcon className="h-4 w-4 text-muted-foreground inline" /></td>
                            <td className="p-3">{t.agent}</td>
                            <td className="p-3 text-xs text-muted-foreground">{t.created}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((a, i) => (
              <Card key={i}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
                      {a.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold">{a.name}</p>
                      <p className="text-sm text-muted-foreground">{a.role}</p>
                    </div>
                    <Badge variant="outline" className={`mr-auto ${a.status === "בהפסקה" ? "border-amber-300 text-amber-600" : "border-green-300 text-green-600"}`}>
                      {a.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center">
                    <div className="bg-blue-50 rounded-lg p-2">
                      <p className="text-lg font-bold text-blue-700">{a.open}</p>
                      <p className="text-xs text-muted-foreground">פניות פתוחות</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2">
                      <p className="text-lg font-bold text-green-700">{a.resolved}</p>
                      <p className="text-xs text-muted-foreground">נפתרו השבוע</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">זמן תגובה ממוצע</span>
                      <span className="font-medium">{a.avgTime}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">שביעות רצון</span>
                      <span className="font-medium">{a.csat}%</span>
                    </div>
                    <Progress value={a.csat} className="h-2" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* SLA Tab */}
        <TabsContent value="sla" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><Shield className="h-5 w-5 text-indigo-500" />עמידה ב-SLA לפי קטגוריה</CardTitle>
                <Badge className="bg-green-100 text-green-700">ממוצע כללי: 94.2%</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-right p-3 font-medium text-muted-foreground">קטגוריה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">יעד SLA</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">עמידה</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סה"כ פניות</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">עמדו ביעד</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">חריגות</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slaCategories.map((s, i) => (
                      <tr key={i} className="border-b hover:bg-muted/50">
                        <td className="p-3 font-medium">{s.category}</td>
                        <td className="p-3">{s.target}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={s.compliance} className="h-2 flex-1" />
                            <span className="font-bold text-sm w-12">{s.compliance}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-center">{s.total}</td>
                        <td className="p-3 text-center text-green-600 font-medium">{s.met}</td>
                        <td className="p-3 text-center text-red-600 font-medium">{s.breached}</td>
                        <td className="p-3">
                          <Badge className={s.compliance >= 95 ? "bg-green-100 text-green-700" : s.compliance >= 90 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}>
                            {s.compliance >= 95 ? "תקין" : s.compliance >= 90 ? "אזהרה" : "חריגה"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-5 text-center">
                <UserCheck className="h-8 w-8 mx-auto text-green-500 mb-2" />
                <p className="text-3xl font-bold text-green-600">94.2%</p>
                <p className="text-sm text-muted-foreground">עמידה כוללת ב-SLA</p>
                <p className="text-xs text-muted-foreground mt-1">יעד: 92%</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <Timer className="h-8 w-8 mx-auto text-amber-500 mb-2" />
                <p className="text-3xl font-bold">1.4 שעות</p>
                <p className="text-sm text-muted-foreground">זמן תגובה ממוצע</p>
                <p className="text-xs text-muted-foreground mt-1">יעד: 2 שעות</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 text-center">
                <AlertTriangle className="h-8 w-8 mx-auto text-red-500 mb-2" />
                <p className="text-3xl font-bold text-red-600">7</p>
                <p className="text-sm text-muted-foreground">חריגות SLA החודש</p>
                <p className="text-xs text-muted-foreground mt-1">ירידה של 30% מהחודש הקודם</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
