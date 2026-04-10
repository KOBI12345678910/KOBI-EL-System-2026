import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Megaphone,
  Users,
  TrendingUp,
  DollarSign,
  BarChart3,
  CalendarDays,
  Search,
  Plus,
  Mail,
  Share2,
  PartyPopper,
  Printer,
  Eye,
  MousePointerClick,
} from "lucide-react";

const FALLBACK_CAMPAIGNS_DATA = [
  { id: 1, name: "השקת חלונות אלומיניום פרימיום", type: "אימייל", status: "פעיל", budget: 12000, spent: 8400, leads: 145, conversion: 12.3 },
  { id: 2, name: "מבצע קיץ - דלתות זכוכית", type: "רשתות חברתיות", status: "פעיל", budget: 8500, spent: 6200, leads: 98, conversion: 9.8 },
  { id: 3, name: "תערוכת בנייה תל אביב 2026", type: "אירוע", status: "מתוכנן", budget: 25000, spent: 5000, leads: 0, conversion: 0 },
  { id: 4, name: "קטלוג מוצרים חדש", type: "דפוס", status: "הושלם", budget: 15000, spent: 14800, leads: 210, conversion: 14.5 },
  { id: 5, name: "קמפיין גוגל - מעקות בטיחות", type: "אימייל", status: "פעיל", budget: 6000, spent: 4100, leads: 67, conversion: 8.2 },
  { id: 6, name: "פוסטים ממומנים - פייסבוק", type: "רשתות חברתיות", status: "פעיל", budget: 4500, spent: 3800, leads: 88, conversion: 11.1 },
  { id: 7, name: "כנס אדריכלים ירושלים", type: "אירוע", status: "הושלם", budget: 18000, spent: 17500, leads: 175, conversion: 15.8 },
  { id: 8, name: "ניוזלטר חודשי - לקוחות קיימים", type: "אימייל", status: "פעיל", budget: 2000, spent: 1600, leads: 34, conversion: 6.5 },
  { id: 9, name: "פליירים - אזורי תעשייה", type: "דפוס", status: "מושהה", budget: 7000, spent: 2100, leads: 22, conversion: 3.1 },
  { id: 10, name: "לינקדאין - B2B קבלנים", type: "רשתות חברתיות", status: "פעיל", budget: 5500, spent: 3900, leads: 56, conversion: 10.4 },
];

const FALLBACK_UPCOMING_CAMPAIGNS = [
  { name: "השקת קו ויטרינות חדש", date: "2026-04-20", type: "אימייל", budget: 9000 },
  { name: "יום פתוח במפעל", date: "2026-05-01", type: "אירוע", budget: 12000 },
  { name: "מבצע חורף - חלונות מבודדים", date: "2026-05-15", type: "רשתות חברתיות", budget: 7500 },
  { name: "פרסום במגזין בנייה", date: "2026-06-01", type: "דפוס", budget: 11000 },
  { name: "וובינר - פתרונות אלומיניום", date: "2026-06-10", type: "אימייל", budget: 3000 },
  { name: "תערוכת עיצוב חיפה", date: "2026-07-05", type: "אירוע", budget: 20000 },
];

const typeIcon = (type: string) => {
  switch (type) {
    case "אימייל": return <Mail className="h-4 w-4" />;
    case "רשתות חברתיות": return <Share2 className="h-4 w-4" />;
    case "אירוע": return <PartyPopper className="h-4 w-4" />;
    case "דפוס": return <Printer className="h-4 w-4" />;
    default: return <Megaphone className="h-4 w-4" />;
  }
};

const statusColor = (status: string) => {
  switch (status) {
    case "פעיל": return "bg-green-100 text-green-800";
    case "מתוכנן": return "bg-blue-100 text-blue-800";
    case "הושלם": return "bg-gray-100 text-gray-800";
    case "מושהה": return "bg-yellow-100 text-yellow-800";
    default: return "bg-gray-100 text-gray-800";
  }
};

export default function Campaigns() {
  const { data: apiData } = useQuery<any>({
    queryKey: ["campaigns"],
    queryFn: () => authFetch("/api/marketing/campaigns"),
    staleTime: 5 * 60 * 1000,
  });

  const campaignsData: any[] = apiData ?? FALLBACK_CAMPAIGNS_DATA;
  const upcomingCampaigns = FALLBACK_UPCOMING_CAMPAIGNS;

  const [search, setSearch] = useState("");

  const activeCampaigns = campaignsData.filter((c) => c.status === "פעיל").length;
  const totalLeads = campaignsData.reduce((s, c) => s + c.leads, 0);
  const avgConversion = (campaignsData.filter((c) => c.conversion > 0).reduce((s, c) => s + c.conversion, 0) / campaignsData.filter((c) => c.conversion > 0).length).toFixed(1);
  const totalSpent = campaignsData.reduce((s, c) => s + c.spent, 0);
  const totalBudget = campaignsData.reduce((s, c) => s + c.budget, 0);
  const roi = ((totalLeads * 850 - totalSpent) / totalSpent * 100).toFixed(1);
  const thisQuarter = campaignsData.filter((c) => c.status === "פעיל" || c.status === "מתוכנן").length;

  const filtered = campaignsData.filter((c) => c.name.includes(search));

  const kpis = [
    { label: "קמפיינים פעילים", value: activeCampaigns, icon: Megaphone, color: "text-blue-600" },
    { label: "לידים שנוצרו", value: totalLeads.toLocaleString(), icon: Users, color: "text-green-600" },
    { label: "המרה ממוצעת", value: `${avgConversion}%`, icon: TrendingUp, color: "text-purple-600" },
    { label: "תקציב שנוצל", value: `₪${totalSpent.toLocaleString()}`, icon: DollarSign, color: "text-orange-600" },
    { label: "ROI", value: `${roi}%`, icon: BarChart3, color: "text-emerald-600" },
    { label: "קמפיינים ברבעון", value: thisQuarter, icon: CalendarDays, color: "text-indigo-600" },
  ];

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ניהול קמפיינים שיווקיים</h1>
          <p className="text-muted-foreground mt-1">טכנו-כל עוזי - מפעל אלומיניום, זכוכית ומתכת</p>
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
          <TabsTrigger value="performance">ביצועים</TabsTrigger>
          <TabsTrigger value="calendar">לוח שנה</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="חיפוש קמפיין..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
            </div>
          </div>
          <div className="space-y-3">
            {filtered.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {typeIcon(c.type)}
                      <div>
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-sm text-muted-foreground">{c.type}</div>
                      </div>
                    </div>
                    <Badge className={statusColor(c.status)}>{c.status}</Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">תקציב: </span>
                      <span className="font-medium">₪{c.budget.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">הוצא: </span>
                      <span className="font-medium">₪{c.spent.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      <span className="font-medium">{c.leads} לידים</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      <span className="font-medium">{c.conversion}% המרה</span>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Progress value={(c.spent / c.budget) * 100} className="h-2" />
                    <div className="text-xs text-muted-foreground mt-1">{((c.spent / c.budget) * 100).toFixed(0)}% מהתקציב נוצל</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>השוואת ROI לפי קמפיין</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {campaignsData.filter((c) => c.leads > 0).sort((a, b) => b.conversion - a.conversion).map((c) => {
                  const campRoi = ((c.leads * 850 - c.spent) / c.spent * 100).toFixed(0);
                  return (
                    <div key={c.id} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{c.name}</span>
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{c.leads} לידים</span>
                          <span className="flex items-center gap-1"><MousePointerClick className="h-3 w-3" />{c.conversion}%</span>
                          <Badge variant={Number(campRoi) > 100 ? "default" : "secondary"}>ROI: {campRoi}%</Badge>
                        </div>
                      </div>
                      <Progress value={Math.min(Number(campRoi), 300) / 3} className="h-2" />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle>לידים לפי סוג קמפיין</CardTitle></CardHeader>
              <CardContent>
                {["אימייל", "רשתות חברתיות", "אירוע", "דפוס"].map((type) => {
                  const typeLeads = campaignsData.filter((c) => c.type === type).reduce((s, c) => s + c.leads, 0);
                  return (
                    <div key={type} className="flex justify-between items-center py-2 border-b last:border-0">
                      <div className="flex items-center gap-2">{typeIcon(type)}<span>{type}</span></div>
                      <span className="font-bold">{typeLeads}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>ניצול תקציב לפי סוג</CardTitle></CardHeader>
              <CardContent>
                {["אימייל", "רשתות חברתיות", "אירוע", "דפוס"].map((type) => {
                  const typeBudget = campaignsData.filter((c) => c.type === type).reduce((s, c) => s + c.budget, 0);
                  const typeSpent = campaignsData.filter((c) => c.type === type).reduce((s, c) => s + c.spent, 0);
                  const pct = ((typeSpent / typeBudget) * 100).toFixed(0);
                  return (
                    <div key={type} className="py-2 border-b last:border-0">
                      <div className="flex justify-between text-sm mb-1">
                        <span>{type}</span>
                        <span>₪{typeSpent.toLocaleString()} / ₪{typeBudget.toLocaleString()} ({pct}%)</span>
                      </div>
                      <Progress value={Number(pct)} className="h-2" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>קמפיינים קרובים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingCampaigns.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-50 p-2 rounded-lg">
                        <CalendarDays className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="font-semibold">{c.name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          {typeIcon(c.type)}{c.type}
                        </div>
                      </div>
                    </div>
                    <div className="text-left">
                      <div className="font-medium">{c.date}</div>
                      <div className="text-sm text-muted-foreground">₪{c.budget.toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>סיכום תקציב קמפיינים עתידיים</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-blue-600">{upcomingCampaigns.length}</div>
                  <div className="text-sm text-muted-foreground">קמפיינים מתוכננים</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">₪{upcomingCampaigns.reduce((s, c) => s + c.budget, 0).toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">תקציב כולל</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-purple-600">₪{Math.round(upcomingCampaigns.reduce((s, c) => s + c.budget, 0) / upcomingCampaigns.length).toLocaleString()}</div>
                  <div className="text-sm text-muted-foreground">ממוצע לקמפיין</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
