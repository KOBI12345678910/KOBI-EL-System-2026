import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Truck, Search, Plus, Download, Eye, Edit2, CheckCircle2,
  Clock, AlertTriangle, Package, ArrowUpFromLine, ArrowDownToLine,
  Timer, MapPin, Calendar, Weight
} from "lucide-react";

const FALLBACK_DOCKS = [
  { id: "D-01", name: "רציף 1 - כניסה ראשית", type: "טעינה + פריקה", capacity: "עד 20 טון", status: "פנוי", vehicle: "—", driver: "—", company: "—", scheduledTime: "—", eta: "—" },
  { id: "D-02", name: "רציף 2 - חומרי גלם", type: "פריקה", capacity: "עד 30 טון", status: "בפריקה", vehicle: "משאית 45-678-90", driver: "חסן א.", company: "אלומיניום הצפון", scheduledTime: "08:00", eta: "סיום: 11:30" },
  { id: "D-03", name: "רציף 3 - מוצר מוגמר", type: "טעינה", capacity: "עד 25 טון", status: "בטעינה", vehicle: "שלייה 12-345-67", driver: "יוסי מ.", company: "קונסטרקט מהנדסים", scheduledTime: "09:00", eta: "סיום: 12:00" },
  { id: "D-04", name: "רציף 4 - זכוכית", type: "פריקה", capacity: "עד 15 טון (זהירות)", status: "תפוס", vehicle: "מנוף 78-901-23", driver: "דוד כ.", company: "זכוכית ים תיכון", scheduledTime: "10:00", eta: "ממתין לפריקה" },
  { id: "D-05", name: "רציף 5 - כללי", type: "טעינה + פריקה", capacity: "עד 20 טון", status: "פנוי", vehicle: "—", driver: "—", company: "—", scheduledTime: "—", eta: "—" },
  { id: "D-06", name: "רציף 6 - חירום/גדול", type: "טעינה + פריקה", capacity: "עד 40 טון", status: "בתחזוקה", vehicle: "—", driver: "—", company: "—", scheduledTime: "—", eta: "צפי חזרה: 14:00" },
];

const FALLBACK_SCHEDULE = [
  { time: "06:00", dock: "D-02", type: "פריקה", company: "פלדת אביב", vehicle: "משאית 11-222-33", items: "לוחות פלדה 4x2", weight: "18 טון", status: "הושלם" },
  { time: "08:00", dock: "D-02", type: "פריקה", company: "אלומיניום הצפון", vehicle: "משאית 45-678-90", items: "פרופילי אלומיניום", weight: "12 טון", status: "בביצוע" },
  { time: "09:00", dock: "D-03", type: "טעינה", company: "קונסטרקט מהנדסים", vehicle: "שלייה 12-345-67", items: "חלונות מוגמרים", weight: "8 טון", status: "בביצוע" },
  { time: "10:00", dock: "D-04", type: "פריקה", company: "זכוכית ים תיכון", vehicle: "מנוף 78-901-23", items: "זכוכית מחוסמת", weight: "6 טון", status: "ממתין" },
  { time: "11:00", dock: "D-01", type: "טעינה", company: "לקוח - מלון הילטון", vehicle: "משאית 44-555-66", items: "דלתות + מסגרות", weight: "4 טון", status: "מתוכנן" },
  { time: "13:00", dock: "D-05", type: "פריקה", company: "גז-טכני ישראל", vehicle: "צובר 77-888-99", items: "גז ארגון תעשייתי", weight: "2 טון", status: "מתוכנן" },
  { time: "14:00", dock: "D-01", type: "טעינה", company: "ארקיטקט פלוס", vehicle: "טנדר 33-444-55", items: "דגמי חזית", weight: "1.5 טון", status: "מתוכנן" },
  { time: "15:30", dock: "D-03", type: "טעינה", company: "עיריית חיפה", vehicle: "משאית 66-777-88", items: "מעקות בטיחות", weight: "10 טון", status: "מתוכנן" },
];

const statusColors: Record<string, string> = {
  "פנוי": "bg-green-500/20 text-green-300 border-green-500/30",
  "בטעינה": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "בפריקה": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "תפוס": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "בתחזוקה": "bg-red-500/20 text-red-300 border-red-500/30",
};

const schedStatusColors: Record<string, string> = {
  "הושלם": "bg-green-500/20 text-green-300",
  "בביצוע": "bg-blue-500/20 text-blue-300",
  "ממתין": "bg-amber-500/20 text-amber-300",
  "מתוכנן": "bg-slate-500/20 text-slate-300",
};

export default function LoadingDock() {
  const { data: docks = FALLBACK_DOCKS } = useQuery({
    queryKey: ["logistics-docks"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/loading-dock/docks");
      if (!res.ok) return FALLBACK_DOCKS;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_DOCKS;
    },
    staleTime: 30_000,
    retry: 1,
  });

  const { data: schedule = FALLBACK_SCHEDULE } = useQuery({
    queryKey: ["logistics-schedule"],
    queryFn: async () => {
      const res = await authFetch("/api/logistics/loading-dock/schedule");
      if (!res.ok) return FALLBACK_SCHEDULE;
      const json = await res.json();
      return Array.isArray(json) ? json : json.data || json.items || FALLBACK_SCHEDULE;
    },
    staleTime: 30_000,
    retry: 1,
  });


  const [activeTab, setActiveTab] = useState("overview");
  const [search, setSearch] = useState("");

  const kpis = useMemo(() => ({
    totalDocks: docks.length,
    available: docks.filter(d => d.status === "פנוי").length,
    activeLoads: docks.filter(d => d.status === "בטעינה" || d.status === "בפריקה").length,
    scheduledToday: schedule.length,
    completed: schedule.filter(s => s.status === "הושלם").length,
  }), []);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Truck className="h-7 w-7 text-orange-400" />
            ניהול רציפי טעינה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">תזמון וניהול רציפי טעינה ופריקה | טכנו-כל עוזי</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-orange-600 hover:bg-orange-700"><Plus className="w-4 h-4 ml-1" />תזמון חדש</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">סה״כ רציפים</p>
                <p className="text-2xl font-bold text-white">{kpis.totalDocks}</p>
              </div>
              <MapPin className="h-8 w-8 text-slate-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-900/50 to-green-950 border-green-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400">רציפים פנויים</p>
                <p className="text-2xl font-bold text-green-300">{kpis.available}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-900/50 to-blue-950 border-blue-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-400">פעולות פעילות</p>
                <p className="text-2xl font-bold text-blue-300">{kpis.activeLoads}</p>
              </div>
              <Package className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-900/50 to-amber-950 border-amber-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-400">מתוזמנים היום</p>
                <p className="text-2xl font-bold text-amber-300">{kpis.scheduledToday}</p>
              </div>
              <Calendar className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-900/50 to-emerald-950 border-emerald-800/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-400">הושלמו היום</p>
                <p className="text-2xl font-bold text-emerald-300">{kpis.completed}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <Progress value={(kpis.completed / kpis.scheduledToday) * 100} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-background/50">
          <TabsTrigger value="overview">סקירת רציפים</TabsTrigger>
          <TabsTrigger value="schedule">לוח זמנים</TabsTrigger>
          <TabsTrigger value="active">פעולות פעילות</TabsTrigger>
        </TabsList>

        {/* Dock Overview */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {docks.map(dock => (
              <Card key={dock.id} className={`border ${dock.status === "פנוי" ? "border-green-800/50" : dock.status === "בתחזוקה" ? "border-red-800/50" : "border-blue-800/50"}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-bold">{dock.name}</CardTitle>
                    <Badge className={statusColors[dock.status] || ""}>{dock.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1"><Package className="w-3 h-3" /> סוג: {dock.type}</div>
                    <div className="flex items-center gap-1"><Weight className="w-3 h-3" /> {dock.capacity}</div>
                  </div>
                  {dock.status !== "פנוי" && dock.status !== "בתחזוקה" && (
                    <div className="mt-2 p-2 rounded bg-muted/20 space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-muted-foreground">רכב:</span><span className="text-foreground font-mono">{dock.vehicle}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">נהג:</span><span className="text-foreground">{dock.driver}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">חברה:</span><span className="text-foreground">{dock.company}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">מתוזמן:</span><span className="text-foreground">{dock.scheduledTime}</span></div>
                    </div>
                  )}
                  {dock.eta !== "—" && (
                    <div className="flex items-center gap-1 text-xs mt-1">
                      <Timer className="w-3 h-3 text-amber-400" />
                      <span className="text-amber-300">{dock.eta}</span>
                    </div>
                  )}
                  <div className="flex gap-1 mt-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs"><Eye className="w-3 h-3 ml-1" />צפייה</Button>
                    <Button variant="outline" size="sm" className="flex-1 text-xs"><Edit2 className="w-3 h-3 ml-1" />עדכון</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Schedule Tab */}
        <TabsContent value="schedule" className="mt-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                לוח זמנים - היום (8 באפריל 2026)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-right p-3 text-muted-foreground font-medium">שעה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">רציף</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חברה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">רכב</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פריטים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">משקל</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                        <td className="p-3 font-mono text-foreground font-bold">{row.time}</td>
                        <td className="p-3 text-foreground">{row.dock}</td>
                        <td className="p-3">
                          <Badge variant="outline" className={row.type === "טעינה" ? "text-blue-300 border-blue-500" : "text-amber-300 border-amber-500"}>
                            {row.type === "טעינה" ? <ArrowUpFromLine className="w-3 h-3 ml-1" /> : <ArrowDownToLine className="w-3 h-3 ml-1" />}
                            {row.type}
                          </Badge>
                        </td>
                        <td className="p-3 text-foreground">{row.company}</td>
                        <td className="p-3 font-mono text-xs text-muted-foreground">{row.vehicle}</td>
                        <td className="p-3 text-foreground">{row.items}</td>
                        <td className="p-3 text-muted-foreground">{row.weight}</td>
                        <td className="p-3"><Badge className={schedStatusColors[row.status] || ""}>{row.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Active Loads Tab */}
        <TabsContent value="active" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {docks.filter(d => d.status === "בטעינה" || d.status === "בפריקה" || d.status === "תפוס").map(dock => (
              <Card key={dock.id} className="bg-card/50 border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-foreground">{dock.name}</h3>
                    <Badge className={statusColors[dock.status] || ""}>{dock.status}</Badge>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">רכב:</span><span className="text-foreground font-mono">{dock.vehicle}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">נהג:</span><span className="text-foreground">{dock.driver}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">ספק/לקוח:</span><span className="text-foreground">{dock.company}</span></div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">התקדמות:</span>
                      <div className="flex items-center gap-2">
                        <Progress value={dock.status === "בטעינה" ? 65 : dock.status === "בפריקה" ? 40 : 10} className="h-2 w-24" />
                        <span className="text-xs text-foreground">{dock.status === "בטעינה" ? "65%" : dock.status === "בפריקה" ? "40%" : "10%"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs mt-3 text-amber-300">
                    <Timer className="w-3 h-3" />
                    {dock.eta}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
