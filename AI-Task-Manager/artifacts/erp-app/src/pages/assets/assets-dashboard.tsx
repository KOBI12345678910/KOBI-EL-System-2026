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
  Building2, DollarSign, TrendingDown, Wrench, ShieldCheck, Clock,
  BarChart3, PackagePlus, Search, Download, Plus, Settings, MapPin,
  CalendarDays, AlertTriangle, Activity, Gauge, Factory, Eye
} from "lucide-react";

const FALLBACK_ASSETS = [
  { id: "A-001", name: "מסור CNC אלומיניום 600", category: "חיתוך", value: 285000, location: "אולם A - קו 1", status: "פעיל", acquired: "2021-03-15", depreciation: 57000, maintenance: 12400 },
  { id: "A-002", name: "מרכז עיבוד שבבי DMG", category: "עיבוד", value: 520000, location: "אולם A - קו 2", status: "פעיל", acquired: "2020-07-20", depreciation: 130000, maintenance: 18700 },
  { id: "A-003", name: "תנור ציפוי אלקטרוסטטי", category: "ציפוי", value: 340000, location: "אולם B - ציפוי", status: "פעיל", acquired: "2022-01-10", depreciation: 51000, maintenance: 8900 },
  { id: "A-004", name: "שולחן חיתוך זכוכית CNC", category: "חיתוך", value: 410000, location: "אולם C - זכוכית", status: "פעיל", acquired: "2019-11-05", depreciation: 123000, maintenance: 22100 },
  { id: "A-005", name: "תחנת ריתוך TIG אוטומטית", category: "ריתוך", value: 95000, location: "אולם A - קו 3", status: "בתחזוקה", acquired: "2021-09-12", depreciation: 23750, maintenance: 15600 },
  { id: "A-006", name: "ג'יג הרכבה מודולרי #1", category: "הרכבה", value: 45000, location: "אולם D - הרכבה", status: "פעיל", acquired: "2023-02-28", depreciation: 6750, maintenance: 3200 },
  { id: "A-007", name: "מלגזה חשמלית Toyota 3T", category: "לוגיסטיקה", value: 180000, location: "מחסן ראשי", status: "פעיל", acquired: "2022-06-15", depreciation: 36000, maintenance: 9800 },
  { id: "A-008", name: "מדחס בורגי 50HP", category: "תשתית", value: 125000, location: "חדר מדחסים", status: "פעיל", acquired: "2020-04-10", depreciation: 37500, maintenance: 7600 },
  { id: "A-009", name: "מסור CNC אלומיניום 400", category: "חיתוך", value: 195000, location: "אולם A - קו 1", status: "פעיל", acquired: "2022-08-20", depreciation: 29250, maintenance: 6100 },
  { id: "A-010", name: "מכונת כיפוף CNC 160T", category: "עיבוד", value: 310000, location: "אולם A - קו 2", status: "אחריות פגה", acquired: "2019-05-18", depreciation: 108500, maintenance: 24300 },
  { id: "A-011", name: "תנור חישול אלומיניום", category: "ציפוי", value: 275000, location: "אולם B - ציפוי", status: "פעיל", acquired: "2021-11-30", depreciation: 55000, maintenance: 11200 },
  { id: "A-012", name: "שולחן חיתוך זכוכית ידני", category: "חיתוך", value: 85000, location: "אולם C - זכוכית", status: "פעיל", acquired: "2023-05-10", depreciation: 8500, maintenance: 2800 },
  { id: "A-013", name: "תחנת ריתוך MIG רובוטית", category: "ריתוך", value: 380000, location: "אולם A - קו 3", status: "פעיל", acquired: "2023-08-25", depreciation: 38000, maintenance: 5400 },
  { id: "A-014", name: "מלגזה דיזל Hyster 5T", category: "לוגיסטיקה", value: 220000, location: "חצר טעינה", status: "בתחזוקה", acquired: "2020-12-01", depreciation: 66000, maintenance: 19500 },
  { id: "A-015", name: "מדחס בורגי 30HP גיבוי", category: "תשתית", value: 78000, location: "חדר מדחסים", status: "פעיל", acquired: "2024-01-15", depreciation: 5850, maintenance: 1800 },
];

const FALLBACK_DEPRECIATION_SCHEDULE = [
  { year: "2024", opening: 3543000, addition: 78000, depreciation: 776100, closing: 2844900 },
  { year: "2025", opening: 2844900, addition: 0, depreciation: 710000, closing: 2134900 },
  { year: "2026", opening: 2134900, addition: 150000, depreciation: 680000, closing: 1604900 },
];

const FALLBACK_MAINTENANCE_HISTORY = [
  { id: "M-301", asset: "מסור CNC אלומיניום 600", type: "מונעת", date: "2026-03-15", cost: 3200, tech: "יוסי כהן", status: "הושלם" },
  { id: "M-302", asset: "תחנת ריתוך TIG אוטומטית", type: "מתקנת", date: "2026-04-01", cost: 8500, tech: "אבי לוי", status: "בביצוע" },
  { id: "M-303", asset: "מלגזה דיזל Hyster 5T", type: "מתקנת", date: "2026-04-05", cost: 6200, tech: "משה דוד", status: "בביצוע" },
  { id: "M-304", asset: "שולחן חיתוך זכוכית CNC", type: "מונעת", date: "2026-04-12", cost: 4100, tech: "יוסי כהן", status: "מתוכנן" },
  { id: "M-305", asset: "מרכז עיבוד שבבי DMG", type: "מונעת", date: "2026-04-18", cost: 5800, tech: "אבי לוי", status: "מתוכנן" },
  { id: "M-306", asset: "מכונת כיפוף CNC 160T", type: "מונעת", date: "2026-04-25", cost: 3900, tech: "משה דוד", status: "מתוכנן" },
  { id: "M-307", asset: "תנור ציפוי אלקטרוסטטי", type: "שנתית", date: "2026-05-01", cost: 7200, tech: "חברת שירות", status: "מתוכנן" },
];

const FALLBACK_UTILIZATION_DATA = [
  { asset: "מסור CNC אלומיניום 600", hours: 168, available: 192, oee: 87, downtime: 6, quality: 96 },
  { asset: "מרכז עיבוד שבבי DMG", hours: 176, available: 192, oee: 91, downtime: 4, quality: 98 },
  { asset: "תנור ציפוי אלקטרוסטטי", hours: 144, available: 168, oee: 85, downtime: 8, quality: 94 },
  { asset: "שולחן חיתוך זכוכית CNC", hours: 160, available: 192, oee: 83, downtime: 10, quality: 92 },
  { asset: "תחנת ריתוך MIG רובוטית", hours: 152, available: 192, oee: 79, downtime: 12, quality: 95 },
  { asset: "מכונת כיפוף CNC 160T", hours: 140, available: 192, oee: 73, downtime: 15, quality: 90 },
  { asset: "מסור CNC אלומיניום 400", hours: 164, available: 192, oee: 85, downtime: 7, quality: 97 },
];

const statusColor: Record<string, string> = {
  "פעיל": "bg-emerald-500/20 text-emerald-300",
  "בתחזוקה": "bg-amber-500/20 text-amber-300",
  "אחריות פגה": "bg-red-500/20 text-red-300",
  "הושלם": "bg-emerald-500/20 text-emerald-300",
  "בביצוע": "bg-blue-500/20 text-blue-300",
  "מתוכנן": "bg-purple-500/20 text-purple-300",
};

export default function AssetsDashboard() {
  const { data: assetsdashboardData } = useQuery({
    queryKey: ["assets-dashboard"],
    queryFn: () => authFetch("/api/assets/assets_dashboard"),
    staleTime: 5 * 60 * 1000,
  });

  const assets = assetsdashboardData ?? FALLBACK_ASSETS;
  const depreciationSchedule = FALLBACK_DEPRECIATION_SCHEDULE;
  const maintenanceHistory = FALLBACK_MAINTENANCE_HISTORY;
  const utilizationData = FALLBACK_UTILIZATION_DATA;

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("registry");

  const totalValue = assets.reduce((s, a) => s + a.value, 0);
  const totalDepreciation = assets.reduce((s, a) => s + a.depreciation, 0);
  const totalMaintenance = assets.reduce((s, a) => s + a.maintenance, 0);
  const inMaintenance = assets.filter(a => a.status === "בתחזוקה").length;
  const warrantyExpiring = assets.filter(a => a.status === "אחריות פגה").length;
  const avgUtilization = Math.round(utilizationData.reduce((s, u) => s + u.oee, 0) / utilizationData.length);
  const newAcquisitions = assets.filter(a => a.acquired >= "2024-01-01").length;

  const filteredAssets = assets.filter(a =>
    a.name.includes(search) || a.category.includes(search) || a.location.includes(search) || a.id.includes(search)
  );

  const kpis = [
    { label: "סה\"כ נכסים", value: assets.length, icon: Building2, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "שווי נכסים", value: `${(totalValue / 1000000).toFixed(1)}M ₪`, icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "פחת השנה", value: `${(totalDepreciation / 1000).toFixed(0)}K ₪`, icon: TrendingDown, color: "text-orange-400", bg: "bg-orange-500/10" },
    { label: "עלות תחזוקה", value: `${(totalMaintenance / 1000).toFixed(0)}K ₪`, icon: Wrench, color: "text-red-400", bg: "bg-red-500/10" },
    { label: "נכסים בתחזוקה", value: inMaintenance, icon: Settings, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "אחריות פגה", value: warrantyExpiring, icon: ShieldCheck, color: "text-pink-400", bg: "bg-pink-500/10" },
    { label: "ניצולת ממוצעת", value: `${avgUtilization}%`, icon: Gauge, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "רכישות חדשות", value: newAcquisitions, icon: PackagePlus, color: "text-violet-400", bg: "bg-violet-500/10" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Factory className="w-7 h-7 text-blue-400" />
            דשבורד ניהול נכסים - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול רכוש קבוע, פחת, תחזוקה וניצולת ציוד מפעל מתכת/אלומיניום/זכוכית</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />נכס חדש</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{k.value}</p>
                </div>
                <div className={`p-2.5 rounded-lg ${k.bg}`}>
                  <k.icon className={`w-5 h-5 ${k.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="registry">מרשם נכסים</TabsTrigger>
          <TabsTrigger value="depreciation">פחת</TabsTrigger>
          <TabsTrigger value="maintenance">תחזוקה</TabsTrigger>
          <TabsTrigger value="utilization">ניצולת</TabsTrigger>
        </TabsList>

        {/* Tab 1: Asset Registry */}
        <TabsContent value="registry" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">מרשם נכסי מפעל ({assets.length})</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש נכס..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מזהה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שם הנכס</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קטגוריה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שווי ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מיקום</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תאריך רכישה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAssets.map(a => (
                      <tr key={a.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 text-foreground font-mono text-xs">{a.id}</td>
                        <td className="p-3 text-foreground font-medium">{a.name}</td>
                        <td className="p-3 text-muted-foreground">{a.category}</td>
                        <td className="p-3 text-foreground">{a.value.toLocaleString()}</td>
                        <td className="p-3 text-muted-foreground">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{a.location}</span>
                        </td>
                        <td className="p-3 text-muted-foreground">{a.acquired}</td>
                        <td className="p-3"><Badge className={statusColor[a.status] || "bg-gray-500/20 text-gray-300"}>{a.status}</Badge></td>
                        <td className="p-3 text-center">
                          <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Summary by category */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {["חיתוך", "עיבוד", "ציפוי", "ריתוך", "הרכבה", "לוגיסטיקה", "תשתית"].map(cat => {
              const catAssets = assets.filter(a => a.category === cat);
              const catValue = catAssets.reduce((s, a) => s + a.value, 0);
              return (
                <Card key={cat} className="bg-card/50 border-border/50">
                  <CardContent className="p-4">
                    <p className="text-sm font-medium text-foreground">{cat}</p>
                    <p className="text-lg font-bold text-foreground mt-1">{catAssets.length} נכסים</p>
                    <p className="text-xs text-muted-foreground">{catValue.toLocaleString()} ₪</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 2: Depreciation */}
        <TabsContent value="depreciation" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingDown className="w-5 h-5 text-orange-400" />
                לוח זמנים לפחת
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">שנה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">יתרת פתיחה ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תוספות ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פחת שנתי ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">יתרת סגירה ₪</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depreciationSchedule.map(d => (
                      <tr key={d.year} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 text-foreground font-bold">{d.year}</td>
                        <td className="p-3 text-foreground">{d.opening.toLocaleString()}</td>
                        <td className="p-3 text-emerald-400">{d.addition > 0 ? `+${d.addition.toLocaleString()}` : "—"}</td>
                        <td className="p-3 text-red-400">-{d.depreciation.toLocaleString()}</td>
                        <td className="p-3 text-foreground font-medium">{d.closing.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">שווי בספרים לפי נכס</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {assets.map(a => {
                  const bookValue = a.value - a.depreciation;
                  const depPct = Math.round((a.depreciation / a.value) * 100);
                  return (
                    <div key={a.id} className="flex items-center gap-4">
                      <div className="w-48 text-sm text-foreground truncate">{a.name}</div>
                      <div className="flex-1">
                        <Progress value={depPct} className="h-2" />
                      </div>
                      <div className="w-24 text-left text-sm text-muted-foreground">{depPct}% פחת</div>
                      <div className="w-28 text-left text-sm font-medium text-foreground">{bookValue.toLocaleString()} ₪</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Maintenance */}
        <TabsContent value="maintenance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-emerald-400">{maintenanceHistory.filter(m => m.status === "הושלם").length}</p>
                <p className="text-sm text-muted-foreground mt-1">הושלמו</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-blue-400">{maintenanceHistory.filter(m => m.status === "בביצוע").length}</p>
                <p className="text-sm text-muted-foreground mt-1">בביצוע</p>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-purple-400">{maintenanceHistory.filter(m => m.status === "מתוכנן").length}</p>
                <p className="text-sm text-muted-foreground mt-1">מתוכננות</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-400" />
                היסטוריית תחזוקה ותחזוקה מתוכננת
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מזהה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">נכס</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תאריך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עלות ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">טכנאי</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenanceHistory.map(m => (
                      <tr key={m.id} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 text-foreground font-mono text-xs">{m.id}</td>
                        <td className="p-3 text-foreground">{m.asset}</td>
                        <td className="p-3 text-muted-foreground">{m.type}</td>
                        <td className="p-3 text-muted-foreground flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />{m.date}
                        </td>
                        <td className="p-3 text-foreground">{m.cost.toLocaleString()}</td>
                        <td className="p-3 text-muted-foreground">{m.tech}</td>
                        <td className="p-3"><Badge className={statusColor[m.status] || "bg-gray-500/20 text-gray-300"}>{m.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50 border-amber-500/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                תחזוקה מונעת קרובה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {maintenanceHistory.filter(m => m.status === "מתוכנן").map(m => (
                  <div key={m.id} className="flex items-center justify-between p-3 rounded-lg bg-background/30 border border-border/30">
                    <div>
                      <p className="text-sm font-medium text-foreground">{m.asset}</p>
                      <p className="text-xs text-muted-foreground">{m.type} | {m.tech}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">{m.date}</p>
                      <p className="text-xs text-muted-foreground">{m.cost.toLocaleString()} ₪ משוער</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Utilization */}
        <TabsContent value="utilization" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-cyan-400" />
                מעקב ניצולת ו-OEE לפי מכונה
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מכונה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שעות עבודה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שעות זמינות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">OEE %</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">השבתה (שעות)</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">איכות %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {utilizationData.map(u => (
                      <tr key={u.asset} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 text-foreground font-medium">{u.asset}</td>
                        <td className="p-3 text-foreground">{u.hours}</td>
                        <td className="p-3 text-muted-foreground">{u.available}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={u.oee} className="h-2 w-20" />
                            <span className={`text-sm font-bold ${u.oee >= 85 ? "text-emerald-400" : u.oee >= 75 ? "text-amber-400" : "text-red-400"}`}>{u.oee}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-red-400">{u.downtime}</td>
                        <td className="p-3">
                          <span className={`font-medium ${u.quality >= 95 ? "text-emerald-400" : "text-amber-400"}`}>{u.quality}%</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">סיכום ניצולת חודשי</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">OEE ממוצע</span>
                    <span className="text-lg font-bold text-cyan-400">{avgUtilization}%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">סה"כ שעות עבודה</span>
                    <span className="text-lg font-bold text-foreground">{utilizationData.reduce((s, u) => s + u.hours, 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">סה"כ שעות השבתה</span>
                    <span className="text-lg font-bold text-red-400">{utilizationData.reduce((s, u) => s + u.downtime, 0)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">איכות ממוצעת</span>
                    <span className="text-lg font-bold text-emerald-400">{Math.round(utilizationData.reduce((s, u) => s + u.quality, 0) / utilizationData.length)}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">מכונות בעייתיות</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {utilizationData.filter(u => u.oee < 80).map(u => (
                    <div key={u.asset} className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-foreground">{u.asset}</span>
                        <Badge className="bg-red-500/20 text-red-300">OEE {u.oee}%</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">השבתה: {u.downtime} שעות | איכות: {u.quality}%</p>
                    </div>
                  ))}
                  {utilizationData.filter(u => u.oee < 80).length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">כל המכונות בניצולת תקינה</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
