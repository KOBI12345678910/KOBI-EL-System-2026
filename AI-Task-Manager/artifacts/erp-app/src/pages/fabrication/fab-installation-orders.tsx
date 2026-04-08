import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Truck, Users, CheckCircle2, RotateCcw, MapPin, Package,
  Search, ClipboardList, AlertTriangle, Wrench, Phone, Clock,
  ChevronDown, Filter, Calendar, ArrowUpDown
} from "lucide-react";

const statusMap: Record<string, { label: string; color: string }> = {
  ready: { label: "מוכן לשיגור", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  dispatched: { label: "נשלח", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  installing: { label: "בהתקנה", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  completed: { label: "הושלם", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  "return-visit": { label: "ביקור חוזר", color: "bg-red-500/20 text-red-300 border-red-500/30" },
};

const FALLBACK_INSTALLATIONORDERS = [
  { id: "INS-4001", project: "מגדלי הים התיכון", site: "תל אביב - רח׳ הירקון 88", units: 24, team: "צוות אלפא", scheduled: "2026-04-10", status: "ready" },
  { id: "INS-4002", project: "פארק הייטק הרצליה", site: "הרצליה פיתוח - סגולה 5", units: 18, team: "צוות בטא", scheduled: "2026-04-09", status: "dispatched" },
  { id: "INS-4003", project: "מתחם מגורי נווה צדק", site: "תל אביב - שבזי 42", units: 12, team: "צוות גמא", scheduled: "2026-04-08", status: "installing" },
  { id: "INS-4004", project: "קניון גרנד מול", site: "באר שבע - דרך חברון 1", units: 36, team: "צוות דלתא", scheduled: "2026-04-07", status: "completed" },
  { id: "INS-4005", project: "בית חולים אסותא", site: "אשדוד - שד׳ הרפואה 12", units: 8, team: "צוות אלפא", scheduled: "2026-04-11", status: "ready" },
  { id: "INS-4006", project: "מלון רויאל ביץ׳", site: "אילת - שד׳ התמרים 30", units: 42, team: "צוות בטא", scheduled: "2026-04-06", status: "return-visit" },
  { id: "INS-4007", project: "משרדי חברת סייבר", site: "רעננה - אחוזה 100", units: 15, team: "צוות גמא", scheduled: "2026-04-12", status: "ready" },
  { id: "INS-4008", project: "בית ספר אורט", site: "חיפה - דרך הים 55", units: 20, team: "צוות דלתא", scheduled: "2026-04-08", status: "dispatched" },
  { id: "INS-4009", project: "מרכז מסחרי G", site: "גבעתיים - ויצמן 70", units: 28, team: "צוות אלפא", scheduled: "2026-04-13", status: "ready" },
  { id: "INS-4010", project: "פרויקט מגורי השרון", site: "נתניה - רח׳ הרצל 15", units: 32, team: "צוות בטא", scheduled: "2026-04-05", status: "completed" },
];

const FALLBACK_CHECKLISTITEMS = [
  { id: 1, category: "חומרים", item: "אריזת יחידות לפי הזמנה", status: "done", order: "INS-4001" },
  { id: 2, category: "חומרים", item: "בדיקת שלמות אריזות", status: "done", order: "INS-4001" },
  { id: 3, category: "חומרים", item: "תוויות זיהוי על כל יחידה", status: "done", order: "INS-4002" },
  { id: 4, category: "חומרה", item: "אימות ברגים ומחברים", status: "done", order: "INS-4001" },
  { id: 5, category: "חומרה", item: "בדיקת תקינות מסילות", status: "pending", order: "INS-4003" },
  { id: 6, category: "חומרה", item: "ערכות איטום ואטימה", status: "done", order: "INS-4002" },
  { id: 7, category: "כלים", item: "טעינת כלי חשמל", status: "done", order: "INS-4001" },
  { id: 8, category: "כלים", item: "מברגות ומפתחות ייעודיים", status: "pending", order: "INS-4005" },
  { id: 9, category: "כלים", item: "סולמות ופיגומים", status: "done", order: "INS-4002" },
  { id: 10, category: "גישה לאתר", item: "אישור כניסה מהמזמין", status: "done", order: "INS-4001" },
  { id: 11, category: "גישה לאתר", item: "תיאום מנוף / משאית", status: "pending", order: "INS-4007" },
  { id: 12, category: "גישה לאתר", item: "אישור בטיחות אתר", status: "done", order: "INS-4002" },
];

const FALLBACK_TEAMS = [
  { name: "צוות אלפא", leader: "דוד כהן", members: 5, phone: "050-1234567", currentOrder: "INS-4001", location: "מחסן מרכזי", status: "available", completedToday: 0 },
  { name: "צוות בטא", leader: "משה לוי", members: 4, phone: "050-2345678", currentOrder: "INS-4002", location: "הרצליה פיתוח", status: "on-site", completedToday: 1 },
  { name: "צוות גמא", leader: "יוסי אברהם", members: 6, phone: "050-3456789", currentOrder: "INS-4003", location: "תל אביב - נווה צדק", status: "on-site", completedToday: 0 },
  { name: "צוות דלתא", leader: "אבי ישראלי", members: 4, phone: "050-4567890", currentOrder: "INS-4008", location: "חיפה", status: "transit", completedToday: 1 },
];

const FALLBACK_SITEISSUES = [
  { id: "ISS-301", order: "INS-4006", site: "אילת - שד׳ התמרים 30", issue: "מידות פתח לא תואמות לתוכנית", severity: "high", reportedBy: "צוות בטא", date: "2026-04-06", resolution: "ביקור חוזר עם התאמות", resolved: false },
  { id: "ISS-302", order: "INS-4004", site: "באר שבע - דרך חברון 1", issue: "רטיבות בקיר מקבל", severity: "medium", reportedBy: "צוות דלתא", date: "2026-04-07", resolution: "תוקן באתר - איטום נוסף", resolved: true },
  { id: "ISS-303", order: "INS-4003", site: "תל אביב - שבזי 42", issue: "גישה חסומה לקומה 3", severity: "medium", reportedBy: "צוות גמא", date: "2026-04-08", resolution: "בהמתנה לתיאום עם קבלן ראשי", resolved: false },
  { id: "ISS-304", order: "INS-4010", site: "נתניה - רח׳ הרצל 15", issue: "חשמל לא מוכן בנקודות התקנה", severity: "high", reportedBy: "צוות בטא", date: "2026-04-05", resolution: "חשמלאי השלים חיבורים", resolved: true },
  { id: "ISS-305", order: "INS-4002", site: "הרצליה פיתוח - סגולה 5", issue: "רעש מעבודות סמוכות - עיכוב", severity: "low", reportedBy: "צוות בטא", date: "2026-04-09", resolution: "ממתינים לסיום עבודות", resolved: false },
  { id: "ISS-306", order: "INS-4008", site: "חיפה - דרך הים 55", issue: "חוסר בברגי עיגון מיוחדים", severity: "medium", reportedBy: "צוות דלתא", date: "2026-04-08", resolution: "נשלחו חלקים מהמחסן", resolved: false },
];

const teamStatusMap: Record<string, { label: string; color: string }> = {
  available: { label: "זמין", color: "bg-emerald-500/20 text-emerald-300" },
  "on-site": { label: "באתר", color: "bg-blue-500/20 text-blue-300" },
  transit: { label: "בדרך", color: "bg-amber-500/20 text-amber-300" },
};

const severityMap: Record<string, { label: string; color: string }> = {
  high: { label: "גבוהה", color: "bg-red-500/20 text-red-300" },
  medium: { label: "בינונית", color: "bg-amber-500/20 text-amber-300" },
  low: { label: "נמוכה", color: "bg-blue-500/20 text-blue-300" },
};

export default function FabInstallationOrders() {
  const { data: apiinstallationOrders } = useQuery({
    queryKey: ["/api/fabrication/fab-installation-orders/installationorders"],
    queryFn: () => authFetch("/api/fabrication/fab-installation-orders/installationorders").then(r => r.json()).catch(() => null),
  });
  const installationOrders = Array.isArray(apiinstallationOrders) ? apiinstallationOrders : (apiinstallationOrders?.data ?? apiinstallationOrders?.items ?? FALLBACK_INSTALLATIONORDERS);


  const { data: apichecklistItems } = useQuery({
    queryKey: ["/api/fabrication/fab-installation-orders/checklistitems"],
    queryFn: () => authFetch("/api/fabrication/fab-installation-orders/checklistitems").then(r => r.json()).catch(() => null),
  });
  const checklistItems = Array.isArray(apichecklistItems) ? apichecklistItems : (apichecklistItems?.data ?? apichecklistItems?.items ?? FALLBACK_CHECKLISTITEMS);


  const { data: apiteams } = useQuery({
    queryKey: ["/api/fabrication/fab-installation-orders/teams"],
    queryFn: () => authFetch("/api/fabrication/fab-installation-orders/teams").then(r => r.json()).catch(() => null),
  });
  const teams = Array.isArray(apiteams) ? apiteams : (apiteams?.data ?? apiteams?.items ?? FALLBACK_TEAMS);


  const { data: apisiteIssues } = useQuery({
    queryKey: ["/api/fabrication/fab-installation-orders/siteissues"],
    queryFn: () => authFetch("/api/fabrication/fab-installation-orders/siteissues").then(r => r.json()).catch(() => null),
  });
  const siteIssues = Array.isArray(apisiteIssues) ? apisiteIssues : (apisiteIssues?.data ?? apisiteIssues?.items ?? FALLBACK_SITEISSUES);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tab, setTab] = useState("orders");

  const activeOrders = installationOrders.filter(o => o.status !== "completed").length;
  const totalUnits = installationOrders.reduce((s, o) => s + o.units, 0);
  const teamsDeployed = teams.filter(t => t.status === "on-site" || t.status === "transit").length;
  const completedCount = installationOrders.filter(o => o.status === "completed").length;
  const completionRate = Math.round((completedCount / installationOrders.length) * 100);
  const readyChecks = checklistItems.filter(c => c.status === "done").length;
  const siteReadiness = Math.round((readyChecks / checklistItems.length) * 100);
  const returnVisits = installationOrders.filter(o => o.status === "return-visit").length;

  const filteredOrders = installationOrders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return o.id.toLowerCase().includes(q) || o.project.includes(search) || o.site.includes(search) || o.team.includes(search);
    }
    return true;
  });

  const kpis = [
    { label: "הזמנות פעילות", value: activeOrders, icon: ClipboardList, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "יחידות להתקנה", value: totalUnits, icon: Package, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "צוותות בשטח", value: teamsDeployed, icon: Users, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "אחוז השלמה", value: `${completionRate}%`, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "מוכנות אתר", value: `${siteReadiness}%`, icon: MapPin, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "ביקורים חוזרים", value: returnVisits, icon: RotateCcw, color: "text-red-400", bg: "bg-red-500/10" },
  ];

  const checkCategories = ["חומרים", "חומרה", "כלים", "גישה לאתר"];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Truck className="w-7 h-7 text-blue-400" />
            הזמנות התקנה - ייצור
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול הזמנות התקנה, צוותים ומעקב אתרים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Calendar className="w-4 h-4 ml-1" />לוח זמנים</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700"><Truck className="w-4 h-4 ml-1" />שיגור חדש</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
              </div>
              <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="orders" className="gap-1.5"><ClipboardList className="w-4 h-4" />הזמנות</TabsTrigger>
          <TabsTrigger value="checklist" className="gap-1.5"><CheckCircle2 className="w-4 h-4" />רשימת הכנה</TabsTrigger>
          <TabsTrigger value="dispatch" className="gap-1.5"><Users className="w-4 h-4" />שיגור צוותים</TabsTrigger>
          <TabsTrigger value="issues" className="gap-1.5"><AlertTriangle className="w-4 h-4" />תקלות אתר</TabsTrigger>
        </TabsList>

        {/* Tab 1: Orders */}
        <TabsContent value="orders">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-lg">הזמנות התקנה</CardTitle>
                <div className="flex gap-2 items-center">
                  <div className="relative">
                    <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                    <Input placeholder="חיפוש הזמנה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 w-56 bg-background/50" />
                  </div>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground">
                    <option value="all">כל הסטטוסים</option>
                    {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מס׳ הזמנה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פרויקט</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">אתר</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">יחידות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">צוות</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">תאריך מתוכנן</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="border-b border-border/30 hover:bg-card/80 transition-colors">
                        <td className="p-3 text-foreground font-mono font-medium">{order.id}</td>
                        <td className="p-3 text-foreground">{order.project}</td>
                        <td className="p-3 text-muted-foreground text-xs">{order.site}</td>
                        <td className="p-3 text-center text-foreground font-semibold">{order.units}</td>
                        <td className="p-3 text-foreground">{order.team}</td>
                        <td className="p-3 text-center text-muted-foreground">{order.scheduled}</td>
                        <td className="p-3 text-center">
                          <Badge className={`${statusMap[order.status].color} border`}>{statusMap[order.status].label}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredOrders.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Search className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>לא נמצאו הזמנות תואמות</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Preparation Checklist */}
        <TabsContent value="checklist">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {checkCategories.map(cat => {
              const items = checklistItems.filter(c => c.category === cat);
              const done = items.filter(c => c.status === "done").length;
              const pct = Math.round((done / items.length) * 100);
              const icon = cat === "חומרים" ? Package : cat === "חומרה" ? Wrench : cat === "כלים" ? Wrench : MapPin;
              const IconComp = icon;
              return (
                <Card key={cat} className="bg-card/50 border-border/50">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <IconComp className="w-5 h-5 text-blue-400" />
                        {cat}
                      </CardTitle>
                      <span className="text-sm text-muted-foreground">{done}/{items.length}</span>
                    </div>
                    <Progress value={pct} className="h-2 mt-2" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {items.map(item => (
                      <div key={item.id} className={`flex items-center justify-between p-2.5 rounded-lg border ${item.status === "done" ? "bg-emerald-500/5 border-emerald-500/20" : "bg-amber-500/5 border-amber-500/20"}`}>
                        <div className="flex items-center gap-2">
                          {item.status === "done"
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            : <Clock className="w-4 h-4 text-amber-400" />
                          }
                          <span className="text-sm text-foreground">{item.item}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">{item.order}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <Card className="bg-card/50 border-border/50 mt-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">מוכנות כוללת</div>
                  <div className="text-2xl font-bold text-foreground">{siteReadiness}%</div>
                </div>
                <Progress value={siteReadiness} className="h-3 w-64" />
                <div className="text-sm text-muted-foreground">{readyChecks} מתוך {checklistItems.length} פריטים הושלמו</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Team Dispatch */}
        <TabsContent value="dispatch">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teams.map(team => (
              <Card key={team.name} className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="w-5 h-5 text-purple-400" />
                      {team.name}
                    </CardTitle>
                    <Badge className={teamStatusMap[team.status].color}>{teamStatusMap[team.status].label}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">ראש צוות:</span>
                      <span className="text-foreground mr-1 font-medium">{team.leader}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">חברי צוות:</span>
                      <span className="text-foreground mr-1">{team.members}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-foreground text-xs" dir="ltr">{team.phone}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">הושלמו היום:</span>
                      <span className="text-foreground mr-1">{team.completedToday}</span>
                    </div>
                  </div>
                  <div className="border-t border-border/30 pt-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="text-muted-foreground">הזמנה נוכחית: </span>
                        <span className="text-foreground font-mono font-medium">{team.currentOrder}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5" />
                        {team.location}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1 text-xs">
                      <Phone className="w-3.5 h-3.5 ml-1" />התקשר
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 text-xs">
                      <ArrowUpDown className="w-3.5 h-3.5 ml-1" />שנה משימה
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-card/50 border-border/50 mt-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-around text-center">
                <div>
                  <div className="text-2xl font-bold text-emerald-400">{teams.filter(t => t.status === "available").length}</div>
                  <div className="text-xs text-muted-foreground">זמינים</div>
                </div>
                <div className="w-px h-10 bg-border/50" />
                <div>
                  <div className="text-2xl font-bold text-blue-400">{teams.filter(t => t.status === "on-site").length}</div>
                  <div className="text-xs text-muted-foreground">באתר</div>
                </div>
                <div className="w-px h-10 bg-border/50" />
                <div>
                  <div className="text-2xl font-bold text-amber-400">{teams.filter(t => t.status === "transit").length}</div>
                  <div className="text-xs text-muted-foreground">בדרך</div>
                </div>
                <div className="w-px h-10 bg-border/50" />
                <div>
                  <div className="text-2xl font-bold text-foreground">{teams.reduce((s, t) => s + t.members, 0)}</div>
                  <div className="text-xs text-muted-foreground">סה״כ אנשים</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Site Issues */}
        <TabsContent value="issues">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  תקלות מדווחות מהאתר
                </CardTitle>
                <div className="flex gap-2 text-sm">
                  <Badge className="bg-red-500/20 text-red-300">{siteIssues.filter(i => !i.resolved).length} פתוחות</Badge>
                  <Badge className="bg-emerald-500/20 text-emerald-300">{siteIssues.filter(i => i.resolved).length} נפתרו</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {siteIssues.map(issue => (
                <div key={issue.id} className={`p-4 rounded-lg border ${issue.resolved ? "bg-emerald-500/5 border-emerald-500/20" : "bg-card border-border/50"}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground font-mono text-sm font-medium">{issue.id}</span>
                      <Badge className={severityMap[issue.severity].color}>{severityMap[issue.severity].label}</Badge>
                      {issue.resolved && <Badge className="bg-emerald-500/20 text-emerald-300">נפתר</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground">{issue.date}</span>
                  </div>
                  <p className="text-sm text-foreground mb-2">{issue.issue}</p>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" />{issue.order}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{issue.site}</span>
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{issue.reportedBy}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <span className="text-xs text-muted-foreground">פתרון: </span>
                    <span className="text-xs text-foreground">{issue.resolution}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
