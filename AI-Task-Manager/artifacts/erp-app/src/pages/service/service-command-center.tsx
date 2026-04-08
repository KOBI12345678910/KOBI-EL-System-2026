import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Headphones, AlertTriangle, Clock, Wrench, ShieldCheck, Timer,
  Users, DollarSign, Star, Phone, MapPin, CalendarClock, UserCheck,
  AlertCircle, CheckCircle, XCircle, TrendingUp
} from "lucide-react";

const FALLBACK_KPIS = [
  { label: "קריאות פתוחות", value: "18", icon: Phone, color: "text-blue-600", bg: "bg-blue-50" },
  { label: "קריטיות", value: "3", icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
  { label: "תיקונים היום", value: "5", icon: Wrench, color: "text-emerald-600", bg: "bg-emerald-50" },
  { label: "SLA עמידה", value: "87%", icon: ShieldCheck, color: "text-purple-600", bg: "bg-purple-50" },
  { label: "זמן תגובה ממוצע", value: "4.8 שעות", icon: Timer, color: "text-amber-600", bg: "bg-amber-50" },
  { label: "לקוחות באחריות", value: "89", icon: Users, color: "text-indigo-600", bg: "bg-indigo-50" },
  { label: "עלות שירות החודש", value: "₪34,500", icon: DollarSign, color: "text-orange-600", bg: "bg-orange-50" },
  { label: "שביעות רצון", value: "4.2/5", icon: Star, color: "text-yellow-600", bg: "bg-yellow-50" },
];

const FALLBACK_OPEN_CASES = [
  { id: "SRV-301", customer: "קבוצת אלון", project: "מגדלי הים", type: "נזילת חלון", urgency: "קריטי", technician: "מוחמד חלבי", sla: "2:15", status: "בטיפול" },
  { id: "SRV-302", customer: "אמות השקעות", project: "פארק עתידים", type: "תקלת מנעול", urgency: "גבוה", technician: "יוסי לוי", sla: "5:30", status: "בטיפול" },
  { id: "SRV-303", customer: "שיכון ובינוי", project: "שכונת הפארק", type: "רעש בתריס", urgency: "בינוני", technician: "—", sla: "12:00", status: "ממתין לשיבוץ" },
  { id: "SRV-304", customer: 'נדל"ן פלוס', project: "מתחם הבורסה", type: "זכוכית סדוקה", urgency: "קריטי", technician: "אבי כהן", sla: "1:45", status: "בדרך ללקוח" },
  { id: "SRV-305", customer: "אפריקה ישראל", project: "מגדל W", type: "ידית שבורה", urgency: "נמוך", technician: "—", sla: "22:00", status: "ממתין לחלק" },
  { id: "SRV-306", customer: "חברת חשמל", project: "תחנת רוטנברג", type: "אטימה לקויה", urgency: "גבוה", technician: "מוחמד חלבי", sla: "4:00", status: "ממתין לשיבוץ" },
  { id: "SRV-307", customer: "מליסרון", project: "קניון הנגב", type: "דלת לא נסגרת", urgency: "בינוני", technician: "דוד מזרחי", sla: "8:30", status: "בטיפול" },
  { id: "SRV-308", customer: "עזריאלי קבוצה", project: "מגדל עזריאלי 4", type: "חלון תקוע", urgency: "קריטי", technician: "יוסי לוי", sla: "0:45", status: "בטיפול" },
  { id: "SRV-309", customer: "קרדן נדל\"ן", project: "פרויקט גרין", type: "ציר דלת רופף", urgency: "נמוך", technician: "—", sla: "18:00", status: "ממתין לשיבוץ" },
  { id: "SRV-310", customer: "דמרי בנייה", project: "דמרי ים", type: "בעיית איטום", urgency: "גבוה", technician: "אבי כהן", sla: "3:20", status: "בדרך ללקוח" },
];

const FALLBACK_TODAY_SCHEDULE = [
  { time: "08:00", technician: "אבי כהן", customer: "דמרי בנייה", location: "אשדוד — דמרי ים", type: "בעיית איטום" },
  { time: "09:30", technician: "יוסי לוי", customer: "עזריאלי קבוצה", location: "תל אביב — מגדל עזריאלי 4", type: "חלון תקוע" },
  { time: "10:00", technician: "מוחמד חלבי", customer: "קבוצת אלון", location: "חיפה — מגדלי הים", type: "נזילת חלון" },
  { time: "12:30", technician: "דוד מזרחי", customer: "מליסרון", location: "באר שבע — קניון הנגב", type: "דלת לא נסגרת" },
  { time: "14:00", technician: "יוסי לוי", customer: "אמות השקעות", location: "רמת גן — פארק עתידים", type: "תקלת מנעול" },
  { time: "15:30", technician: "אבי כהן", customer: 'נדל"ן פלוס', location: "רמת גן — מתחם הבורסה", type: "זכוכית סדוקה" },
];

const FALLBACK_TECHNICIANS = [
  { name: "אבי כהן", calls: 42, avgTime: "3.2 שעות", sla: 94, satisfaction: 4.6, open: 3, specialty: "איטום + זכוכית" },
  { name: "יוסי לוי", calls: 38, avgTime: "4.1 שעות", sla: 88, satisfaction: 4.3, open: 2, specialty: "מנעולים + חלונות" },
  { name: "מוחמד חלבי", calls: 45, avgTime: "3.8 שעות", sla: 91, satisfaction: 4.5, open: 2, specialty: "אלומיניום + תריסים" },
  { name: "דוד מזרחי", calls: 30, avgTime: "5.0 שעות", sla: 80, satisfaction: 4.0, open: 1, specialty: "דלתות + הרכבה" },
];

const FALLBACK_SLA_BREACHES = [
  { id: "SRV-288", customer: "הראל ביטוח", breach: "24 שעות איחור", reason: "חלק חלופי לא במלאי", impact: "פיצוי ₪1,200", date: "2026-04-05" },
  { id: "SRV-291", customer: "כלל ביטוח", breach: "8 שעות איחור", reason: "טכנאי לא זמין", impact: "הנחה 10% בחידוש", date: "2026-04-06" },
  { id: "SRV-295", customer: "מנורה מבטחים", breach: "12 שעות איחור", reason: "אבחון שגוי — ביקור חוזר", impact: "פיצוי ₪800", date: "2026-04-06" },
  { id: "SRV-298", customer: "עיריית חיפה", breach: "6 שעות איחור", reason: "פקק בכביש 2 + ביקור מרחוק", impact: "התנצלות רשמית", date: "2026-04-07" },
  { id: "SRV-300", customer: "צמח המרמן", breach: "18 שעות איחור", reason: "חלק מיובא — עיכוב במכס", impact: "פיצוי ₪2,500", date: "2026-04-07" },
];

const FALLBACK_WARRANTY_CLAIMS = [
  { category: "חלונות אלומיניום", active: 34, totalCost: "₪18,200", avgAge: "8 חודשים", topIssue: "נזילה באיטום" },
  { category: "דלתות כניסה", active: 22, totalCost: "₪9,400", avgAge: "6 חודשים", topIssue: "בעיית מנעול" },
  { category: "תריסים חשמליים", active: 18, totalCost: "₪4,800", avgAge: "11 חודשים", topIssue: "מנוע שרוף" },
  { category: "זכוכית מחוסמת", active: 9, totalCost: "₪1,600", avgAge: "3 חודשים", topIssue: "סדק ספונטני" },
  { category: "פרגולות ומעקות", active: 6, totalCost: "₪500", avgAge: "14 חודשים", topIssue: "חלודה בריתוך" },
];

function urgencyBadge(urgency: string) {
  switch (urgency) {
    case "קריטי": return <Badge variant="destructive" className="text-[10px] px-1.5">{urgency}</Badge>;
    case "גבוה": return <Badge className="bg-orange-100 text-orange-700 text-[10px] px-1.5">{urgency}</Badge>;
    case "בינוני": return <Badge className="bg-yellow-100 text-yellow-700 text-[10px] px-1.5">{urgency}</Badge>;
    default: return <Badge variant="secondary" className="text-[10px] px-1.5">{urgency}</Badge>;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "בטיפול": return <Badge className="bg-blue-100 text-blue-700 text-[10px] px-1.5">{status}</Badge>;
    case "בדרך ללקוח": return <Badge className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5">{status}</Badge>;
    case "ממתין לשיבוץ": return <Badge className="bg-gray-100 text-gray-600 text-[10px] px-1.5">{status}</Badge>;
    case "ממתין לחלק": return <Badge className="bg-amber-100 text-amber-700 text-[10px] px-1.5">{status}</Badge>;
    default: return <Badge variant="outline" className="text-[10px] px-1.5">{status}</Badge>;
  }
}

export default function ServiceCommandCenter() {
  const { data: servicecommandcenterData } = useQuery({
    queryKey: ["service-command-center"],
    queryFn: () => authFetch("/api/service/service_command_center"),
    staleTime: 5 * 60 * 1000,
  });

  const kpis = servicecommandcenterData ?? FALLBACK_KPIS;

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Headphones className="h-7 w-7 text-primary" /> מרכז פיקוד שירות ואחריות
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">טכנו-כל עוזי | קריאות שירות | SLA | טכנאים | אחריות</p>
        </div>
        <Badge variant="outline" className="text-xs gap-1 px-2 py-1">
          <span className="h-2 w-2 rounded-full bg-green-500 inline-block animate-pulse" />
          LIVE
        </Badge>
      </div>

      {/* KPI Strip — 8 cards */}
      <div className="grid grid-cols-8 gap-2">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg}/40 border-0 shadow-sm`}>
              <CardContent className="pt-2 pb-1.5 text-center px-1">
                <Icon className={`h-3.5 w-3.5 mx-auto ${kpi.color} mb-0.5`} />
                <p className="text-[8px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-sm font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Live Queue */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            תור קריאות פתוחות — 10 קריאות
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px]">
                <TableHead className="text-right">מס׳</TableHead>
                <TableHead className="text-right">לקוח</TableHead>
                <TableHead className="text-right">פרויקט</TableHead>
                <TableHead className="text-right">סוג תקלה</TableHead>
                <TableHead className="text-right">דחיפות</TableHead>
                <TableHead className="text-right">טכנאי מטפל</TableHead>
                <TableHead className="text-right">SLA נותר</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {openCases.map((c) => (
                <TableRow key={c.id} className="text-xs">
                  <TableCell className="font-mono font-semibold text-blue-700">{c.id}</TableCell>
                  <TableCell>{c.customer}</TableCell>
                  <TableCell className="text-muted-foreground">{c.project}</TableCell>
                  <TableCell>{c.type}</TableCell>
                  <TableCell>{urgencyBadge(c.urgency)}</TableCell>
                  <TableCell>{c.technician === "—" ? <span className="text-muted-foreground italic">לא שובץ</span> : c.technician}</TableCell>
                  <TableCell>
                    <span className={`font-mono font-semibold ${parseFloat(c.sla) <= 2 ? "text-red-600" : parseFloat(c.sla) <= 6 ? "text-amber-600" : "text-emerald-600"}`}>
                      {c.sla}h
                    </span>
                  </TableCell>
                  <TableCell>{statusBadge(c.status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Today's Schedule */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-indigo-600" />
            לוח זמנים — היום
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="text-[10px]">
                <TableHead className="text-right">שעה</TableHead>
                <TableHead className="text-right">טכנאי</TableHead>
                <TableHead className="text-right">לקוח</TableHead>
                <TableHead className="text-right">מיקום</TableHead>
                <TableHead className="text-right">סוג עבודה</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todaySchedule.map((s, i) => (
                <TableRow key={i} className="text-xs">
                  <TableCell className="font-mono font-semibold">{s.time}</TableCell>
                  <TableCell className="flex items-center gap-1">
                    <UserCheck className="h-3 w-3 text-muted-foreground" /> {s.technician}
                  </TableCell>
                  <TableCell>{s.customer}</TableCell>
                  <TableCell className="text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {s.location}
                  </TableCell>
                  <TableCell>{s.type}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="overview" className="text-xs gap-1"><TrendingUp className="h-3.5 w-3.5" /> סקירה</TabsTrigger>
          <TabsTrigger value="sla" className="text-xs gap-1"><ShieldCheck className="h-3.5 w-3.5" /> SLA</TabsTrigger>
          <TabsTrigger value="technicians" className="text-xs gap-1"><Wrench className="h-3.5 w-3.5" /> טכנאים</TabsTrigger>
          <TabsTrigger value="breaches" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> חריגות</TabsTrigger>
          <TabsTrigger value="warranty" className="text-xs gap-1"><ShieldCheck className="h-3.5 w-3.5" /> אחריות</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-3">
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs">התפלגות דחיפות</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between"><span>קריטי</span><span className="font-mono font-bold text-red-600">3</span></div>
                <Progress value={30} className="h-1.5 [&>div]:bg-red-500" />
                <div className="flex justify-between"><span>גבוה</span><span className="font-mono font-bold text-orange-600">5</span></div>
                <Progress value={50} className="h-1.5 [&>div]:bg-orange-500" />
                <div className="flex justify-between"><span>בינוני</span><span className="font-mono font-bold text-yellow-600">6</span></div>
                <Progress value={60} className="h-1.5 [&>div]:bg-yellow-500" />
                <div className="flex justify-between"><span>נמוך</span><span className="font-mono font-bold text-gray-500">4</span></div>
                <Progress value={40} className="h-1.5 [&>div]:bg-gray-400" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs">סטטוס קריאות</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div className="flex justify-between"><span>בטיפול</span><span className="font-mono font-bold text-blue-600">7</span></div>
                <Progress value={39} className="h-1.5 [&>div]:bg-blue-500" />
                <div className="flex justify-between"><span>ממתין לשיבוץ</span><span className="font-mono font-bold text-gray-600">5</span></div>
                <Progress value={28} className="h-1.5 [&>div]:bg-gray-400" />
                <div className="flex justify-between"><span>בדרך ללקוח</span><span className="font-mono font-bold text-emerald-600">4</span></div>
                <Progress value={22} className="h-1.5 [&>div]:bg-emerald-500" />
                <div className="flex justify-between"><span>ממתין לחלק</span><span className="font-mono font-bold text-amber-600">2</span></div>
                <Progress value={11} className="h-1.5 [&>div]:bg-amber-500" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs">סיכום חודשי</CardTitle></CardHeader>
              <CardContent className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span>קריאות שנפתחו</span><span className="font-mono font-bold">62</span></div>
                <div className="flex justify-between"><span>קריאות שנסגרו</span><span className="font-mono font-bold text-emerald-600">44</span></div>
                <div className="flex justify-between"><span>עמידה ב-SLA</span><span className="font-mono font-bold text-purple-600">87%</span></div>
                <div className="flex justify-between"><span>עלות כוללת</span><span className="font-mono font-bold text-orange-600">₪34,500</span></div>
                <div className="flex justify-between"><span>זמן תגובה ממוצע</span><span className="font-mono font-bold text-amber-600">4.8h</span></div>
                <div className="flex justify-between"><span>שביעות רצון</span><span className="font-mono font-bold text-yellow-600">4.2/5</span></div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* SLA Tab */}
        <TabsContent value="sla" className="space-y-4 mt-3">
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "עמידה ב-SLA כללי", value: 87, color: "[&>div]:bg-purple-500" },
              { label: "SLA קריטי (4h)", value: 78, color: "[&>div]:bg-red-500" },
              { label: "SLA גבוה (8h)", value: 85, color: "[&>div]:bg-orange-500" },
              { label: "SLA בינוני (24h)", value: 95, color: "[&>div]:bg-emerald-500" },
            ].map((item, i) => (
              <Card key={i}>
                <CardContent className="pt-3 text-center space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">{item.label}</p>
                  <p className={`text-xl font-bold font-mono ${item.value >= 90 ? "text-emerald-600" : item.value >= 80 ? "text-amber-600" : "text-red-600"}`}>{item.value}%</p>
                  <Progress value={item.value} className={`h-2 ${item.color}`} />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader className="pb-1"><CardTitle className="text-xs">מגמת SLA — 7 ימים אחרונים</CardTitle></CardHeader>
            <CardContent className="text-xs space-y-1">
              {["יום א׳ — 90%", "יום ב׳ — 85%", "יום ג׳ — 82%", "יום ד׳ — 88%", "יום ה׳ — 91%", "יום ו׳ — 86%", "היום — 87%"].map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-24 text-muted-foreground">{d.split("—")[0]}</span>
                  <Progress value={parseInt(d.split("—")[1])} className="h-1.5 flex-1 [&>div]:bg-purple-500" />
                  <span className="font-mono font-semibold w-10 text-left">{d.split("—")[1]}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Technicians Tab */}
        <TabsContent value="technicians" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Wrench className="h-4 w-4 text-indigo-600" /> ביצועי טכנאים — החודש
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px]">
                    <TableHead className="text-right">טכנאי</TableHead>
                    <TableHead className="text-right">התמחות</TableHead>
                    <TableHead className="text-right">קריאות</TableHead>
                    <TableHead className="text-right">זמן ממוצע</TableHead>
                    <TableHead className="text-right">SLA %</TableHead>
                    <TableHead className="text-right">שביעות רצון</TableHead>
                    <TableHead className="text-right">פתוחות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {technicians.map((t) => (
                    <TableRow key={t.name} className="text-xs">
                      <TableCell className="font-semibold">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.specialty}</TableCell>
                      <TableCell className="font-mono">{t.calls}</TableCell>
                      <TableCell className="font-mono">{t.avgTime}</TableCell>
                      <TableCell>
                        <span className={`font-mono font-bold ${t.sla >= 90 ? "text-emerald-600" : t.sla >= 85 ? "text-amber-600" : "text-red-600"}`}>
                          {t.sla}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 font-mono">
                          <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" /> {t.satisfaction}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.open > 2 ? "destructive" : "secondary"} className="text-[10px]">{t.open}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Breaches Tab */}
        <TabsContent value="breaches" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" /> חריגות SLA — 5 אחרונות
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px]">
                    <TableHead className="text-right">מס׳</TableHead>
                    <TableHead className="text-right">תאריך</TableHead>
                    <TableHead className="text-right">לקוח</TableHead>
                    <TableHead className="text-right">חריגה</TableHead>
                    <TableHead className="text-right">סיבה</TableHead>
                    <TableHead className="text-right">השפעה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slaBreaches.map((b) => (
                    <TableRow key={b.id} className="text-xs">
                      <TableCell className="font-mono font-semibold text-red-700">{b.id}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{b.date}</TableCell>
                      <TableCell>{b.customer}</TableCell>
                      <TableCell>
                        <Badge variant="destructive" className="text-[10px] px-1.5">{b.breach}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">{b.reason}</TableCell>
                      <TableCell className="font-semibold text-orange-700">{b.impact}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Warranty Tab */}
        <TabsContent value="warranty" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-purple-600" /> סיכום תביעות אחריות
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="text-[10px]">
                    <TableHead className="text-right">קטגוריה</TableHead>
                    <TableHead className="text-right">תביעות פעילות</TableHead>
                    <TableHead className="text-right">עלות מצטברת</TableHead>
                    <TableHead className="text-right">גיל ממוצע</TableHead>
                    <TableHead className="text-right">תקלה מובילה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warrantyClaims.map((w) => (
                    <TableRow key={w.category} className="text-xs">
                      <TableCell className="font-semibold">{w.category}</TableCell>
                      <TableCell className="font-mono">{w.active}</TableCell>
                      <TableCell className="font-mono font-semibold text-orange-700">{w.totalCost}</TableCell>
                      <TableCell className="text-muted-foreground">{w.avgAge}</TableCell>
                      <TableCell>{w.topIssue}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <div className="px-4 pb-3 pt-2 border-t text-xs text-muted-foreground flex justify-between">
              <span>סה״כ תביעות פעילות: <strong className="text-foreground">89</strong></span>
              <span>סה״כ עלות אחריות: <strong className="text-orange-700">₪34,500</strong></span>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
