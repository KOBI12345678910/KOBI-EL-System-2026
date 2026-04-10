import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  CalendarDays,
  FileText,
  CheckCircle2,
  TrendingUp,
  Radio,
  Layers,
  Plus,
  Image,
  Video,
  PenLine,
  Share2,
  Instagram,
  Linkedin,
  Facebook,
  Globe,
} from "lucide-react";

const FALLBACK_CONTENT_ITEMS = [
  { id: 1, title: "מאמר: יתרונות אלומיניום תרמי", type: "מאמר", channel: "בלוג", status: "פורסם", date: "2026-03-20", engagement: 342 },
  { id: 2, title: "סרטון: תהליך ייצור חלונות", type: "וידאו", channel: "יוטיוב", status: "פורסם", date: "2026-03-22", engagement: 1280 },
  { id: 3, title: "פוסט: מבצע אביב דלתות", type: "פוסט", channel: "פייסבוק", status: "פורסם", date: "2026-03-25", engagement: 567 },
  { id: 4, title: "סטורי: מאחורי הקלעים במפעל", type: "תמונה", channel: "אינסטגרם", status: "פורסם", date: "2026-03-28", engagement: 890 },
  { id: 5, title: "מאמר: בידוד תרמי - המדריך המלא", type: "מאמר", channel: "בלוג", status: "פורסם", date: "2026-04-01", engagement: 215 },
  { id: 6, title: "פוסט: פרויקט מגדל השחר", type: "פוסט", channel: "לינקדאין", status: "פורסם", date: "2026-04-03", engagement: 423 },
  { id: 7, title: "אינפוגרפיקה: סוגי זכוכית", type: "תמונה", channel: "פייסבוק", status: "פורסם", date: "2026-04-05", engagement: 678 },
  { id: 8, title: "סרטון: התקנת מעקות בטיחות", type: "וידאו", channel: "יוטיוב", status: "בעריכה", date: "2026-04-10", engagement: 0 },
  { id: 9, title: "מאמר: תקנות בנייה ירוקה 2026", type: "מאמר", channel: "בלוג", status: "בכתיבה", date: "2026-04-12", engagement: 0 },
  { id: 10, title: "פוסט: צוות המפעל", type: "תמונה", channel: "אינסטגרם", status: "מתוכנן", date: "2026-04-15", engagement: 0 },
  { id: 11, title: "וובינר: פתרונות לקבלנים", type: "וידאו", channel: "אתר", status: "מתוכנן", date: "2026-04-18", engagement: 0 },
  { id: 12, title: "פוסט: לקוח מרוצה - בניין הים", type: "פוסט", channel: "פייסבוק", status: "מתוכנן", date: "2026-04-20", engagement: 0 },
  { id: 13, title: "מאמר: מגמות עיצוב חלונות", type: "מאמר", channel: "בלוג", status: "מתוכנן", date: "2026-04-22", engagement: 0 },
  { id: 14, title: "רילס: 60 שניות במפעל", type: "וידאו", channel: "אינסטגרם", status: "מתוכנן", date: "2026-04-25", engagement: 0 },
  { id: 15, title: "פוסט: שיתוף פעולה עם אדריכלים", type: "פוסט", channel: "לינקדאין", status: "מתוכנן", date: "2026-04-28", engagement: 0 },
];

const typeIcon = (type: string) => {
  switch (type) {
    case "מאמר": return <PenLine className="h-4 w-4" />;
    case "וידאו": return <Video className="h-4 w-4" />;
    case "תמונה": return <Image className="h-4 w-4" />;
    case "פוסט": return <Share2 className="h-4 w-4" />;
    default: return <FileText className="h-4 w-4" />;
  }
};

const channelIcon = (channel: string) => {
  switch (channel) {
    case "פייסבוק": return <Facebook className="h-4 w-4 text-blue-600" />;
    case "אינסטגרם": return <Instagram className="h-4 w-4 text-pink-600" />;
    case "לינקדאין": return <Linkedin className="h-4 w-4 text-blue-800" />;
    case "בלוג": return <PenLine className="h-4 w-4 text-green-600" />;
    case "יוטיוב": return <Video className="h-4 w-4 text-red-600" />;
    case "אתר": return <Globe className="h-4 w-4 text-gray-600" />;
    default: return <Globe className="h-4 w-4" />;
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case "פורסם": return "bg-green-100 text-green-800";
    case "בעריכה": return "bg-yellow-100 text-yellow-800";
    case "בכתיבה": return "bg-orange-100 text-orange-800";
    case "מתוכנן": return "bg-blue-100 text-blue-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

const FALLBACK_CALENDAR_WEEKS = [
  { week: "שבוע 1 אפריל", items: contentItems.filter((c) => c.date >= "2026-04-01" && c.date <= "2026-04-07") },
  { week: "שבוע 2 אפריל", items: contentItems.filter((c) => c.date >= "2026-04-08" && c.date <= "2026-04-14") },
  { week: "שבוע 3 אפריל", items: contentItems.filter((c) => c.date >= "2026-04-15" && c.date <= "2026-04-21") },
  { week: "שבוע 4 אפריל", items: contentItems.filter((c) => c.date >= "2026-04-22" && c.date <= "2026-04-30") },
];


const contentItems = FALLBACK_CONTENT_ITEMS;

export default function ContentCalendar() {
  const { data: contentcalendarData } = useQuery({
    queryKey: ["content-calendar"],
    queryFn: () => authFetch("/api/marketing/content_calendar"),
    staleTime: 5 * 60 * 1000,
  });

  const contentItems = contentcalendarData ?? FALLBACK_CONTENT_ITEMS;
  const calendarWeeks = FALLBACK_CALENDAR_WEEKS;

  const [tab, setTab] = useState("calendar");

  const planned = contentItems.filter((c) => c.status === "מתוכנן").length;
  const published = contentItems.filter((c) => c.status === "פורסם").length;
  const totalEngagement = contentItems.reduce((s, c) => s + c.engagement, 0);
  const channels = new Set(contentItems.map((c) => c.channel)).size;
  const types = new Set(contentItems.map((c) => c.type)).size;

  const kpis = [
    { label: "תכנים מתוכננים", value: planned, icon: CalendarDays, color: "text-blue-600" },
    { label: "פורסמו", value: published, icon: CheckCircle2, color: "text-green-600" },
    { label: "מעורבות כוללת", value: totalEngagement.toLocaleString(), icon: TrendingUp, color: "text-purple-600" },
    { label: "ערוצים", value: channels, icon: Radio, color: "text-orange-600" },
    { label: "סוגי תוכן", value: types, icon: Layers, color: "text-indigo-600" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">לוח תוכן שיווקי</h1>
          <p className="text-muted-foreground mt-1">טכנו-כל עוזי - ניהול תוכן ופרסום</p>
        </div>
        <Button><Plus className="h-4 w-4 ml-2" />תוכן חדש</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4 text-center">
              <kpi.icon className={`h-8 w-8 mx-auto mb-2 ${kpi.color}`} />
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="calendar">לוח שנה</TabsTrigger>
          <TabsTrigger value="content">רשימת תכנים</TabsTrigger>
          <TabsTrigger value="analytics">אנליטיקס</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="space-y-4">
          {calendarWeeks.map((week) => (
            <Card key={week.week}>
              <CardHeader><CardTitle className="text-lg">{week.week}</CardTitle></CardHeader>
              <CardContent>
                {week.items.length === 0 ? (
                  <p className="text-muted-foreground text-sm">אין תכנים מתוכננים לשבוע זה</p>
                ) : (
                  <div className="space-y-2">
                    {week.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="bg-gray-50 p-2 rounded">{typeIcon(item.type)}</div>
                          <div>
                            <div className="font-medium text-sm">{item.title}</div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {channelIcon(item.channel)}<span>{item.channel}</span>
                              <span className="text-gray-300">|</span>
                              <span>{item.date}</span>
                            </div>
                          </div>
                        </div>
                        <Badge className={statusColor(item.status)}>{item.status}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="content" className="space-y-3">
          {contentItems.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-gray-50 p-2 rounded">{typeIcon(item.type)}</div>
                    <div>
                      <div className="font-semibold">{item.title}</div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">{channelIcon(item.channel)}{item.channel}</span>
                        <span>{item.type}</span>
                        <span>{item.date}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.engagement > 0 && <span className="text-sm font-medium">{item.engagement.toLocaleString()} מעורבות</span>}
                    <Badge className={statusColor(item.status)}>{item.status}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>מעורבות לפי ערוץ</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {["פייסבוק", "אינסטגרם", "לינקדאין", "בלוג", "יוטיוב"].map((ch) => {
                  const chEng = contentItems.filter((c) => c.channel === ch).reduce((s, c) => s + c.engagement, 0);
                  return (
                    <div key={ch} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="flex items-center gap-2">{channelIcon(ch)}{ch}</span>
                        <span className="font-bold">{chEng.toLocaleString()}</span>
                      </div>
                      <Progress value={Math.min((chEng / 1500) * 100, 100)} className="h-2" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>סטטוס תכנים</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {["פורסם", "בעריכה", "בכתיבה", "מתוכנן"].map((st) => {
                  const count = contentItems.filter((c) => c.status === st).length;
                  return (
                    <div key={st} className="flex justify-between items-center py-2 border-b last:border-0">
                      <Badge className={statusColor(st)}>{st}</Badge>
                      <span className="font-bold text-lg">{count}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle>מעורבות לפי סוג תוכן</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {["מאמר", "וידאו", "תמונה", "פוסט"].map((type) => {
                const typeEng = contentItems.filter((c) => c.type === type).reduce((s, c) => s + c.engagement, 0);
                const typeCount = contentItems.filter((c) => c.type === type).length;
                return (
                  <div key={type} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">{typeIcon(type)}<span>{type}</span><span className="text-muted-foreground text-sm">({typeCount} פריטים)</span></div>
                    <div className="text-left">
                      <div className="font-bold">{typeEng.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground">ממוצע: {typeCount > 0 ? Math.round(typeEng / typeCount).toLocaleString() : 0}</div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
