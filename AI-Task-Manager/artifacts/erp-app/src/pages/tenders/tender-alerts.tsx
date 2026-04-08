import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Bell, AlertTriangle, CheckCircle, Clock, TrendingUp, FileWarning,
  Shield, DollarSign, Users, Eye, Settings, Search, Filter, Building2,
  Calendar, ArrowUpRight, MapPin, Briefcase, BellRing, Mail, Phone
} from "lucide-react";
import { useState } from "react";

const alertTypes = {
  deadline: { label: "מועד אחרון מתקרב", icon: Clock, color: "text-orange-600 bg-orange-100" },
  new_tender: { label: "מכרז חדש פורסם", icon: Bell, color: "text-blue-600 bg-blue-100" },
  decision: { label: "החלטה ממתינה", icon: AlertTriangle, color: "text-yellow-600 bg-yellow-100" },
  document: { label: "מסמך חסר", icon: FileWarning, color: "text-red-600 bg-red-100" },
  price_review: { label: "סקירת מחיר נדרשת", icon: DollarSign, color: "text-purple-600 bg-purple-100" },
  competitor: { label: "פעילות מתחרה", icon: Users, color: "text-indigo-600 bg-indigo-100" },
  guarantee: { label: "ערבות פגה בקרוב", icon: Shield, color: "text-pink-600 bg-pink-100" },
  insurance: { label: "חידוש ביטוח", icon: Shield, color: "text-teal-600 bg-teal-100" },
};

type AlertType = keyof typeof alertTypes;
type Severity = "critical" | "high" | "medium" | "low";

const severityBadge = (s: Severity) => {
  const map = {
    critical: "bg-red-600 text-white",
    high: "bg-orange-500 text-white",
    medium: "bg-yellow-500 text-white",
    low: "bg-blue-500 text-white",
  };
  const labels = { critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך" };
  return <Badge className={map[s]}>{labels[s]}</Badge>;
};

const alerts: { id: number; type: AlertType; severity: Severity; title: string; description: string; tender: string; date: string; resolved: boolean }[] = [
  { id: 1, type: "deadline", severity: "critical", title: "מועד הגשה ב-48 שעות", description: "מכרז אספקת אלומיניום למשרד הביטחון - יש להגיש עד 10/04", tender: "TND-042", date: "2026-04-08", resolved: false },
  { id: 2, type: "document", severity: "critical", title: "חסר אישור ISO מעודכן", description: "נדרש אישור ISO 9001 מעודכן לצורך הגשה למכרז עיריית חיפה", tender: "TND-038", date: "2026-04-08", resolved: false },
  { id: 3, type: "price_review", severity: "high", title: "סקירת הצעת מחיר", description: "הצעת מחיר לפרויקט חיפוי זכוכית דורשת אישור סופי מהנהלה", tender: "TND-045", date: "2026-04-07", resolved: false },
  { id: 4, type: "competitor", severity: "medium", title: "מתחרה הגיש הצעה", description: "אלומט בע\"מ הגישו הצעה למכרז ציפוי מתכת - רשות המים", tender: "TND-041", date: "2026-04-07", resolved: false },
  { id: 5, type: "guarantee", severity: "high", title: "ערבות בנקאית פגה ב-5 ימים", description: "ערבות ביצוע לפרויקט בניין עירייה פוקעת ב-13/04", tender: "TND-033", date: "2026-04-08", resolved: false },
  { id: 6, type: "new_tender", severity: "medium", title: "מכרז ממשלתי חדש", description: "משרד השיכון פרסם מכרז לעבודות אלומיניום - תקציב 3.2 מיליון", tender: "TND-NEW", date: "2026-04-07", resolved: false },
  { id: 7, type: "decision", severity: "high", title: "ממתין להחלטת ועדת מכרזים", description: "ועדת המכרזים טרם החליטה על מכרז תחזוקה שנתי - עיריית ר\"ג", tender: "TND-036", date: "2026-04-06", resolved: false },
  { id: 8, type: "insurance", severity: "medium", title: "חידוש ביטוח קבלנים", description: "פוליסת ביטוח קבלנים פגה ב-20/04 - נדרש חידוש לפני הגשה", tender: "TND-039", date: "2026-04-06", resolved: false },
  { id: 9, type: "deadline", severity: "low", title: "מועד אחרון בעוד 12 יום", description: "מכרז ספקי חומרי גלם - רכבת ישראל, הגשה עד 20/04", tender: "TND-044", date: "2026-04-05", resolved: false },
  { id: 10, type: "document", severity: "medium", title: "חסר אישור רשם קבלנים", description: "נדרש אישור סיווג קבלני מעודכן למכרז נתב\"ג", tender: "TND-040", date: "2026-04-05", resolved: false },
];

const opportunities = [
  { id: 1, title: "עבודות אלומיניום - בניין משרדים", source: "ממשלתי", org: "משרד השיכון", budget: 3200000, deadline: "2026-04-25", match: 94, region: "מרכז" },
  { id: 2, title: "חיפוי זכוכית - מגדל מגורים", source: "פרטי", org: "אלקטרה נדל\"ן", budget: 5800000, deadline: "2026-05-01", match: 88, region: "תל אביב" },
  { id: 3, title: "מעקות ומסגרות מתכת - פארק תעשייה", source: "ממשלתי", org: "רשות מקרקעי ישראל", budget: 1400000, deadline: "2026-04-20", match: 82, region: "צפון" },
  { id: 4, title: "חלונות אלומיניום - בית ספר", source: "ממשלתי", org: "עיריית באר שבע", budget: 900000, deadline: "2026-05-10", match: 79, region: "דרום" },
  { id: 5, title: "מחיצות זכוכית - מרכז רפואי", source: "פרטי", org: "קבוצת אסותא", budget: 2100000, deadline: "2026-04-28", match: 75, region: "מרכז" },
  { id: 6, title: "דלתות מתכת אש - מפעל", source: "פרטי", org: "תעשיות כימיות", budget: 680000, deadline: "2026-05-15", match: 71, region: "חיפה" },
];

export default function TenderAlertsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("active");

  const criticalCount = alerts.filter(a => a.severity === "critical" && !a.resolved).length;
  const activeCount = alerts.filter(a => !a.resolved).length;
  const resolvedToday = 3;
  const upcomingDeadlines = 5;
  const newOpportunities = opportunities.length;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BellRing className="h-7 w-7 text-orange-500" /> התראות מכרזים
        </h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="חיפוש התראות..." className="pr-9 w-64" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <Button variant="outline" size="sm"><Filter className="h-4 w-4 ml-1" /> סינון</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="pt-5 text-center">
            <Bell className="h-6 w-6 mx-auto text-orange-500 mb-1" />
            <p className="text-xs text-muted-foreground">התראות פעילות</p>
            <p className="text-3xl font-bold text-orange-600">{activeCount}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="pt-5 text-center">
            <AlertTriangle className="h-6 w-6 mx-auto text-red-500 mb-1" />
            <p className="text-xs text-muted-foreground">קריטיות</p>
            <p className="text-3xl font-bold text-red-600">{criticalCount}</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="pt-5 text-center">
            <CheckCircle className="h-6 w-6 mx-auto text-green-500 mb-1" />
            <p className="text-xs text-muted-foreground">טופלו היום</p>
            <p className="text-3xl font-bold text-green-600">{resolvedToday}</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="pt-5 text-center">
            <Clock className="h-6 w-6 mx-auto text-blue-500 mb-1" />
            <p className="text-xs text-muted-foreground">דדליינים ב-7 ימים</p>
            <p className="text-3xl font-bold text-blue-600">{upcomingDeadlines}</p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="pt-5 text-center">
            <TrendingUp className="h-6 w-6 mx-auto text-purple-500 mb-1" />
            <p className="text-xs text-muted-foreground">הזדמנויות חדשות</p>
            <p className="text-3xl font-bold text-purple-600">{newOpportunities}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="active">התראות פעילות ({activeCount})</TabsTrigger>
          <TabsTrigger value="opportunities">הזדמנויות ({newOpportunities})</TabsTrigger>
          <TabsTrigger value="settings">הגדרות התראות</TabsTrigger>
        </TabsList>

        {/* Active Alerts */}
        <TabsContent value="active" className="space-y-3 mt-4">
          {alerts.filter(a => !a.resolved).filter(a => !searchTerm || a.title.includes(searchTerm) || a.description.includes(searchTerm)).map(alert => {
            const typeInfo = alertTypes[alert.type];
            const Icon = typeInfo.icon;
            return (
              <Card key={alert.id} className={`${alert.severity === "critical" ? "border-red-300 bg-red-50/30" : ""}`}>
                <CardContent className="py-4 flex items-start gap-4">
                  <div className={`p-2.5 rounded-lg ${typeInfo.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {severityBadge(alert.severity)}
                      <Badge variant="outline">{typeInfo.label}</Badge>
                      <span className="text-xs text-muted-foreground mr-auto">{alert.tender}</span>
                    </div>
                    <p className="font-semibold text-sm">{alert.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{alert.description}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> {alert.date}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="outline"><Eye className="h-3.5 w-3.5 ml-1" /> צפה</Button>
                    <Button size="sm"><CheckCircle className="h-3.5 w-3.5 ml-1" /> טופל</Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* Opportunities */}
        <TabsContent value="opportunities" className="space-y-3 mt-4">
          {opportunities.map(opp => (
            <Card key={opp.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4 flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-600">
                  <Briefcase className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={opp.source === "ממשלתי" ? "bg-blue-500/20 text-blue-700" : "bg-gray-500/20 text-gray-700"}>{opp.source}</Badge>
                    <span className="text-sm font-semibold">{opp.title}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{opp.org}</span>
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{opp.region}</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />הגשה עד {opp.deadline}</span>
                    <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{(opp.budget / 1000000).toFixed(1)} מיליון ש"ח</span>
                  </div>
                </div>
                <div className="text-center shrink-0 w-20">
                  <p className="text-xs text-muted-foreground mb-1">התאמה</p>
                  <Progress value={opp.match} className="h-2 mb-1" />
                  <p className="text-sm font-bold text-emerald-600">{opp.match}%</p>
                </div>
                <Button size="sm"><ArrowUpRight className="h-3.5 w-3.5 ml-1" /> פרטים</Button>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Settings */}
        <TabsContent value="settings" className="mt-4">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Settings className="h-5 w-5" /> סף התראות</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {[
                  { label: "ימים לפני מועד אחרון", value: "7", desc: "התראה כשנותרו X ימים להגשה" },
                  { label: "ימים לפני פקיעת ערבות", value: "14", desc: "התראה לחידוש ערבות בנקאית" },
                  { label: "ימים לפני חידוש ביטוח", value: "30", desc: "תזכורת לחידוש פוליסת ביטוח" },
                  { label: "אחוז התאמה מינימלי", value: "70", desc: "הצגת הזדמנויות מעל סף התאמה" },
                  { label: "תקציב מינימלי (ש\"ח)", value: "500000", desc: "סינון מכרזים לפי תקציב מינימלי" },
                ].map((setting, i) => (
                  <div key={i} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium">{setting.label}</p>
                      <p className="text-xs text-muted-foreground">{setting.desc}</p>
                    </div>
                    <Input className="w-24 text-center" defaultValue={setting.value} />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><BellRing className="h-5 w-5" /> ערוצי התראות</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {[
                  { icon: Mail, label: "אימייל", desc: "שליחת התראות לכתובת דוא\"ל", active: true },
                  { icon: Phone, label: "SMS", desc: "הודעות טקסט להתראות קריטיות", active: true },
                  { icon: Bell, label: "התראות מערכת", desc: "התראות בתוך המערכת", active: true },
                  { icon: Users, label: "קבוצת וואטסאפ", desc: "שליחה לקבוצת מכרזים", active: false },
                ].map((channel, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <channel.icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{channel.label}</p>
                        <p className="text-xs text-muted-foreground">{channel.desc}</p>
                      </div>
                    </div>
                    <Badge className={channel.active ? "bg-green-500/20 text-green-700" : "bg-gray-500/20 text-gray-500"}>
                      {channel.active ? "פעיל" : "כבוי"}
                    </Badge>
                  </div>
                ))}
                <div className="pt-2 border-t">
                  <p className="text-sm font-medium mb-2">מקבלי התראות</p>
                  <div className="space-y-2">
                    {["עוזי כהן - מנכ\"ל", "דני לוי - מנהל מכרזים", "שרה אברהם - רכש"].map((person, i) => (
                      <div key={i} className="flex items-center justify-between text-sm p-2 bg-muted/50 rounded">
                        <span>{person}</span>
                        <Badge variant="outline">כל ההתראות</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card className="mt-4">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-5 w-5" /> לוח זמנים התראות</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: "בדיקת מכרזים חדשים", freq: "כל שעה", lastRun: "08/04 09:00" },
                  { label: "סריקת מועדי הגשה", freq: "פעמיים ביום", lastRun: "08/04 08:00" },
                  { label: "בדיקת ערבויות וביטוחים", freq: "יומי", lastRun: "08/04 06:00" },
                  { label: "ניתוח מתחרים", freq: "שבועי", lastRun: "06/04 10:00" },
                  { label: "סיכום שבועי למנהלים", freq: "ראשון 08:00", lastRun: "06/04 08:00" },
                  { label: "גיבוי נתוני מכרזים", freq: "יומי 23:00", lastRun: "07/04 23:00" },
                ].map((schedule, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{schedule.label}</p>
                      <p className="text-xs text-muted-foreground">תדירות: {schedule.freq}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-xs text-muted-foreground">ריצה אחרונה</p>
                      <p className="text-xs font-medium">{schedule.lastRun}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-end mt-4 gap-2">
            <Button variant="outline">איפוס ברירות מחדל</Button>
            <Button>שמור הגדרות</Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}