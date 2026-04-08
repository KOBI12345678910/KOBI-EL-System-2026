import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Mail,
  Eye,
  MousePointerClick,
  UserMinus,
  Users,
  ShieldCheck,
  Plus,
  Send,
  FileText,
  BarChart3,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

const emailCampaigns = [
  { id: 1, name: "ניוזלטר חודשי - מרץ 2026", status: "נשלח", sent: 2450, opened: 892, clicked: 234, unsubscribed: 5, date: "2026-03-15" },
  { id: 2, name: "מבצע אביב - חלונות אלומיניום", status: "נשלח", sent: 1800, opened: 756, clicked: 189, unsubscribed: 8, date: "2026-03-20" },
  { id: 3, name: "הזמנה לתערוכת בנייה", status: "נשלח", sent: 3200, opened: 1408, clicked: 512, unsubscribed: 3, date: "2026-03-25" },
  { id: 4, name: "עדכון מוצרים חדשים Q2", status: "נשלח", sent: 2100, opened: 819, clicked: 178, unsubscribed: 6, date: "2026-04-01" },
  { id: 5, name: "ניוזלטר חודשי - אפריל 2026", status: "בהכנה", sent: 0, opened: 0, clicked: 0, unsubscribed: 0, date: "2026-04-15" },
  { id: 6, name: "סקר שביעות רצון לקוחות", status: "טיוטה", sent: 0, opened: 0, clicked: 0, unsubscribed: 0, date: "2026-04-20" },
  { id: 7, name: "מבצע קיץ - דלתות זכוכית", status: "מתוכנן", sent: 0, opened: 0, clicked: 0, unsubscribed: 0, date: "2026-05-01" },
  { id: 8, name: "הצעות מיוחדות לקבלנים", status: "מתוכנן", sent: 0, opened: 0, clicked: 0, unsubscribed: 0, date: "2026-05-10" },
];

const templates = [
  { id: 1, name: "ניוזלטר חודשי", category: "ניוזלטר", lastUsed: "2026-04-01", usage: 12 },
  { id: 2, name: "מבצע מיוחד", category: "קידום מכירות", lastUsed: "2026-03-20", usage: 8 },
  { id: 3, name: "הזמנה לאירוע", category: "אירועים", lastUsed: "2026-03-25", usage: 5 },
  { id: 4, name: "עדכון מוצרים", category: "מוצרים", lastUsed: "2026-04-01", usage: 6 },
  { id: 5, name: "סקר לקוחות", category: "מחקר", lastUsed: "2026-02-15", usage: 3 },
  { id: 6, name: "ברכת חג", category: "כללי", lastUsed: "2026-03-14", usage: 4 },
];

const subscriberLists = [
  { name: "לקוחות פעילים", count: 2450, growth: 5.2, lastSent: "2026-04-01" },
  { name: "קבלנים ובנאים", count: 1800, growth: 8.1, lastSent: "2026-03-20" },
  { name: "אדריכלים ומעצבים", count: 980, growth: 12.3, lastSent: "2026-03-25" },
  { name: "ספקים ושותפים", count: 420, growth: 3.5, lastSent: "2026-03-15" },
  { name: "לידים חדשים", count: 1350, growth: 15.8, lastSent: "2026-04-01" },
  { name: "VIP - לקוחות מרכזיים", count: 180, growth: 2.1, lastSent: "2026-04-01" },
];

const statusColor = (status: string) => {
  switch (status) {
    case "נשלח": return "bg-green-100 text-green-800";
    case "בהכנה": return "bg-yellow-100 text-yellow-800";
    case "טיוטה": return "bg-gray-100 text-gray-800";
    case "מתוכנן": return "bg-blue-100 text-blue-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

export default function EmailMarketing() {
  const [search, setSearch] = useState("");

  const sentCampaigns = emailCampaigns.filter((c) => c.status === "נשלח");
  const totalSent = sentCampaigns.reduce((s, c) => s + c.sent, 0);
  const totalOpened = sentCampaigns.reduce((s, c) => s + c.opened, 0);
  const totalClicked = sentCampaigns.reduce((s, c) => s + c.clicked, 0);
  const totalUnsub = sentCampaigns.reduce((s, c) => s + c.unsubscribed, 0);
  const listSize = subscriberLists.reduce((s, l) => s + l.count, 0);
  const openRate = ((totalOpened / totalSent) * 100).toFixed(1);
  const clickRate = ((totalClicked / totalSent) * 100).toFixed(1);
  const deliverability = 98.7;

  const kpis = [
    { label: "קמפיינים שנשלחו", value: sentCampaigns.length, icon: Send, color: "text-blue-600" },
    { label: "שיעור פתיחה", value: `${openRate}%`, icon: Eye, color: "text-green-600" },
    { label: "שיעור הקלקה", value: `${clickRate}%`, icon: MousePointerClick, color: "text-purple-600" },
    { label: "הסרות מרשימה", value: totalUnsub, icon: UserMinus, color: "text-red-600" },
    { label: "גודל רשימה", value: listSize.toLocaleString(), icon: Users, color: "text-orange-600" },
    { label: "אחוז מסירה", value: `${deliverability}%`, icon: ShieldCheck, color: "text-emerald-600" },
  ];

  const filtered = emailCampaigns.filter((c) => c.name.includes(search));

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">שיווק בדוא"ל</h1>
          <p className="text-muted-foreground mt-1">טכנו-כל עוזי - ניהול קמפיינים ודיוור</p>
        </div>
        <Button><Plus className="h-4 w-4 ml-2" />קמפיין חדש</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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

      <Tabs defaultValue="campaigns" className="space-y-4">
        <TabsList>
          <TabsTrigger value="campaigns">קמפיינים</TabsTrigger>
          <TabsTrigger value="templates">תבניות</TabsTrigger>
          <TabsTrigger value="lists">רשימות תפוצה</TabsTrigger>
          <TabsTrigger value="analytics">אנליטיקס</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <Input placeholder="חיפוש קמפיין..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="space-y-3">
            {filtered.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-blue-600" />
                      <div>
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{c.date}</div>
                      </div>
                    </div>
                    <Badge className={statusColor(c.status)}>{c.status}</Badge>
                  </div>
                  {c.status === "נשלח" && (
                    <div className="grid grid-cols-4 gap-4 text-sm">
                      <div className="text-center p-2 bg-gray-50 rounded">
                        <div className="font-bold text-lg">{c.sent.toLocaleString()}</div>
                        <div className="text-xs text-muted-foreground">נשלחו</div>
                      </div>
                      <div className="text-center p-2 bg-green-50 rounded">
                        <div className="font-bold text-lg text-green-700">{((c.opened / c.sent) * 100).toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">פתיחה</div>
                      </div>
                      <div className="text-center p-2 bg-blue-50 rounded">
                        <div className="font-bold text-lg text-blue-700">{((c.clicked / c.sent) * 100).toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">הקלקה</div>
                      </div>
                      <div className="text-center p-2 bg-red-50 rounded">
                        <div className="font-bold text-lg text-red-700">{c.unsubscribed}</div>
                        <div className="text-xs text-muted-foreground">הסרות</div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="templates" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="bg-blue-50 p-2 rounded"><FileText className="h-5 w-5 text-blue-600" /></div>
                    <div>
                      <div className="font-semibold">{t.name}</div>
                      <Badge variant="outline" className="mt-1">{t.category}</Badge>
                    </div>
                  </div>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>שימוש אחרון: {t.lastUsed}</span>
                    <span>{t.usage} שימושים</span>
                  </div>
                  <Button variant="outline" className="w-full mt-3" size="sm">השתמש בתבנית</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="lists" className="space-y-3">
          {subscriberLists.map((list, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-50 p-2 rounded"><Users className="h-5 w-5 text-purple-600" /></div>
                    <div>
                      <div className="font-semibold">{list.name}</div>
                      <div className="text-sm text-muted-foreground">שליחה אחרונה: {list.lastSent}</div>
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-xl font-bold">{list.count.toLocaleString()}</div>
                    <div className="text-sm text-green-600">+{list.growth}% גדילה</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader><CardTitle>סיכום רשימות</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">{listSize.toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">סה"כ נרשמים</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{subscriberLists.length}</div>
                  <div className="text-sm text-muted-foreground">רשימות פעילות</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">{(subscriberLists.reduce((s, l) => s + l.growth, 0) / subscriberLists.length).toFixed(1)}%</div>
                  <div className="text-sm text-muted-foreground">גדילה ממוצעת</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>ביצועים לפי קמפיין</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {sentCampaigns.map((c) => (
                  <div key={c.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium truncate max-w-[200px]">{c.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-green-600">{((c.opened / c.sent) * 100).toFixed(0)}% פתיחה</span>
                        <span className="text-blue-600">{((c.clicked / c.sent) * 100).toFixed(0)}% הקלקה</span>
                      </span>
                    </div>
                    <Progress value={(c.opened / c.sent) * 100} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>מדדים מרכזיים</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-green-600" /><span>שיעור פתיחה</span></div>
                  <span className="text-xl font-bold text-green-700">{openRate}%</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-2"><MousePointerClick className="h-5 w-5 text-blue-600" /><span>שיעור הקלקה</span></div>
                  <span className="text-xl font-bold text-blue-700">{clickRate}%</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
                  <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-purple-600" /><span>הקלקה מפתיחה</span></div>
                  <span className="text-xl font-bold text-purple-700">{((totalClicked / totalOpened) * 100).toFixed(1)}%</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                  <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-orange-600" /><span>שיעור הסרה</span></div>
                  <span className="text-xl font-bold text-orange-700">{((totalUnsub / totalSent) * 100).toFixed(2)}%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
