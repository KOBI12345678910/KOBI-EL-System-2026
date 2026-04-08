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
  Search, Layers, CheckCircle2, FolderOpen, Star, CalendarPlus, Archive,
  Thermometer, Volume2, Wind, Droplets, ShieldCheck, Lock, Wrench, Eye
} from "lucide-react";

type SystemFamily = {
  id: number;
  name: string;
  type: string;
  widthMM: number;
  profiles: number;
  glassOptions: number;
  hardwareCompat: string;
  thermalRating: string;
  status: "פעיל" | "חדש" | "הוצא משימוש";
  projectsUsing: number;
};

const FALLBACK_SYSTEMS: SystemFamily[] = [
  { id: 1, name: "Casement 50", type: "ציר", widthMM: 50, profiles: 28, glassOptions: 6, hardwareCompat: "Roto / Siegenia", thermalRating: "Uf=1.4", status: "פעיל", projectsUsing: 34 },
  { id: 2, name: "Sliding 70", type: "הזזה", widthMM: 70, profiles: 35, glassOptions: 8, hardwareCompat: "Hawa / GU", thermalRating: "Uf=1.6", status: "פעיל", projectsUsing: 41 },
  { id: 3, name: "Tilt & Turn 65", type: "ציר-הטיה", widthMM: 65, profiles: 32, glassOptions: 7, hardwareCompat: "Roto NT / Maco", thermalRating: "Uf=1.2", status: "פעיל", projectsUsing: 29 },
  { id: 4, name: "Curtain Wall 50", type: "קיר מסך", widthMM: 50, profiles: 44, glassOptions: 12, hardwareCompat: "Fischer / Hilti", thermalRating: "Uf=1.8", status: "פעיל", projectsUsing: 18 },
  { id: 5, name: "Folding Door", type: "מתקפלת", widthMM: 60, profiles: 22, glassOptions: 5, hardwareCompat: "Centor / Hawa", thermalRating: "Uf=1.5", status: "פעיל", projectsUsing: 15 },
  { id: 6, name: "Lift & Slide", type: "הרמה-הזזה", widthMM: 80, profiles: 30, glassOptions: 9, hardwareCompat: "Siegenia Aubi / GU", thermalRating: "Uf=1.3", status: "פעיל", projectsUsing: 22 },
  { id: 7, name: "Pivot Door", type: "ציר מרכזי", widthMM: 75, profiles: 18, glassOptions: 4, hardwareCompat: "FritsJurgens / Dorma", thermalRating: "Uf=1.7", status: "חדש", projectsUsing: 6 },
  { id: 8, name: "Shopfront", type: "חזית חנות", widthMM: 50, profiles: 24, glassOptions: 6, hardwareCompat: "Dorma / Geze", thermalRating: "Uf=2.0", status: "פעיל", projectsUsing: 27 },
  { id: 9, name: "Fire Rated", type: "עמידות אש", widthMM: 60, profiles: 20, glassOptions: 3, hardwareCompat: "Abloy / Dorma", thermalRating: "Uf=2.2", status: "פעיל", projectsUsing: 12 },
  { id: 10, name: "Bullet Proof", type: "עמידות בליסטית", widthMM: 90, profiles: 14, glassOptions: 2, hardwareCompat: "Kaba / Assa Abloy", thermalRating: "Uf=2.8", status: "הוצא משימוש", projectsUsing: 3 },
];

const STATUS_STYLE: Record<string, string> = {
  "פעיל": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "חדש": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "הוצא משימוש": "bg-red-500/20 text-red-300 border-red-500/30",
};

const COMPAT_MATRIX: { accessory: string; systems: Record<number, "full" | "partial" | "none"> }[] = [
  { accessory: "ידיות Roto", systems: { 1: "full", 2: "none", 3: "full", 4: "none", 5: "partial", 6: "full", 7: "none", 8: "none", 9: "none", 10: "none" } },
  { accessory: "מנעולים GU", systems: { 1: "partial", 2: "full", 3: "partial", 4: "none", 5: "none", 6: "full", 7: "none", 8: "partial", 9: "none", 10: "none" } },
  { accessory: "גומיות EPDM", systems: { 1: "full", 2: "full", 3: "full", 4: "full", 5: "full", 6: "full", 7: "full", 8: "full", 9: "partial", 10: "partial" } },
  { accessory: "ציר Siegenia", systems: { 1: "full", 2: "none", 3: "full", 4: "none", 5: "partial", 6: "partial", 7: "none", 8: "none", 9: "partial", 10: "none" } },
  { accessory: "מעצור Geze", systems: { 1: "none", 2: "partial", 3: "none", 4: "partial", 5: "full", 6: "none", 7: "full", 8: "full", 9: "full", 10: "partial" } },
  { accessory: "סף תרמי", systems: { 1: "full", 2: "full", 3: "full", 4: "full", 5: "partial", 6: "full", 7: "partial", 8: "none", 9: "partial", 10: "none" } },
  { accessory: "זיגוג כפול", systems: { 1: "full", 2: "full", 3: "full", 4: "full", 5: "full", 6: "full", 7: "full", 8: "full", 9: "partial", 10: "full" } },
  { accessory: "רשת יתושים", systems: { 1: "full", 2: "full", 3: "full", 4: "none", 5: "partial", 6: "full", 7: "none", 8: "none", 9: "none", 10: "none" } },
];

const FALLBACK_PERF_SPECS: { systemId: number; thermal: number; acoustic: number; wind: number; water: number }[] = [
  { systemId: 1, thermal: 78, acoustic: 72, wind: 80, water: 85 },
  { systemId: 2, thermal: 65, acoustic: 60, wind: 70, water: 75 },
  { systemId: 3, thermal: 88, acoustic: 82, wind: 85, water: 90 },
  { systemId: 4, thermal: 60, acoustic: 55, wind: 95, water: 92 },
  { systemId: 5, thermal: 70, acoustic: 65, wind: 60, water: 70 },
  { systemId: 6, thermal: 82, acoustic: 75, wind: 72, water: 80 },
  { systemId: 7, thermal: 62, acoustic: 58, wind: 68, water: 65 },
  { systemId: 8, thermal: 50, acoustic: 48, wind: 75, water: 70 },
  { systemId: 9, thermal: 45, acoustic: 70, wind: 88, water: 82 },
  { systemId: 10, thermal: 35, acoustic: 90, wind: 96, water: 95 },
];

const FALLBACK_PROJECT_USAGE: { project: string; client: string; systems: number[]; units: number; year: number }[] = [
  { project: "מגדל אופק TLV", client: "אזורים", systems: [2, 4, 6], units: 820, year: 2025 },
  { project: "פארק הים חיפה", client: "חג'ג'", systems: [1, 3, 5], units: 540, year: 2026 },
  { project: "קניון גרנד ב\"ש", client: "BIG", systems: [4, 8], units: 310, year: 2025 },
  { project: "משרדי HiTech הרצליה", client: "אמות", systems: [3, 4, 6], units: 680, year: 2026 },
  { project: "מגורי פרימיום נתניה", client: "גינדי", systems: [1, 2, 3], units: 430, year: 2026 },
  { project: "שגרירות — בניין A", client: "ממשלתי", systems: [9, 10], units: 95, year: 2024 },
  { project: "מלון רויאל ים המלח", client: "פתאל", systems: [1, 5, 7], units: 370, year: 2025 },
  { project: "בית ספר ירוק ראשל\"צ", client: "עירייה", systems: [1, 3], units: 210, year: 2026 },
];

const COMPAT_CELL: Record<string, string> = {
  full: "bg-emerald-500/30 text-emerald-200",
  partial: "bg-amber-500/30 text-amber-200",
  none: "bg-zinc-700/30 text-zinc-500",
};
const COMPAT_LABEL: Record<string, string> = { full: "מלא", partial: "חלקי", none: "---" };

export default function FabSystems() {
  const { data: apiSYSTEMS } = useQuery({
    queryKey: ["/api/fabrication/fab-systems/systems"],
    queryFn: () => authFetch("/api/fabrication/fab-systems/systems").then(r => r.json()).catch(() => null),
  });
  const SYSTEMS = Array.isArray(apiSYSTEMS) ? apiSYSTEMS : (apiSYSTEMS?.data ?? apiSYSTEMS?.items ?? FALLBACK_SYSTEMS);


  const { data: apiPERF_SPECS } = useQuery({
    queryKey: ["/api/fabrication/fab-systems/perf-specs"],
    queryFn: () => authFetch("/api/fabrication/fab-systems/perf-specs").then(r => r.json()).catch(() => null),
  });
  const PERF_SPECS = Array.isArray(apiPERF_SPECS) ? apiPERF_SPECS : (apiPERF_SPECS?.data ?? apiPERF_SPECS?.items ?? FALLBACK_PERF_SPECS);


  const { data: apiPROJECT_USAGE } = useQuery({
    queryKey: ["/api/fabrication/fab-systems/project-usage"],
    queryFn: () => authFetch("/api/fabrication/fab-systems/project-usage").then(r => r.json()).catch(() => null),
  });
  const PROJECT_USAGE = Array.isArray(apiPROJECT_USAGE) ? apiPROJECT_USAGE : (apiPROJECT_USAGE?.data ?? apiPROJECT_USAGE?.items ?? FALLBACK_PROJECT_USAGE);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("systems");

  const activeSystems = SYSTEMS.filter(s => s.status === "פעיל").length;
  const totalProjects = [...new Set(PROJECT_USAGE.map(p => p.project))].length;
  const mostPopular = [...SYSTEMS].sort((a, b) => b.projectsUsing - a.projectsUsing)[0];
  const newThisYear = SYSTEMS.filter(s => s.status === "חדש").length;
  const deprecated = SYSTEMS.filter(s => s.status === "הוצא משימוש").length;

  const filtered = SYSTEMS.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.type.includes(search)
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">ניהול משפחות מערכות חלון/דלת</h1>
          <p className="text-sm text-muted-foreground mt-1">הגדרת פרופילים, תאימות, וביצועים לכל משפחת מערכת</p>
        </div>
        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1">
          <Layers className="w-4 h-4" />
          הוספת מערכת
        </Button>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "סה\"כ מערכות", value: SYSTEMS.length, icon: Layers, color: "text-blue-400" },
          { label: "מערכות פעילות", value: activeSystems, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "פרויקטים משתמשים", value: totalProjects, icon: FolderOpen, color: "text-purple-400" },
          { label: "מערכת פופולרית", value: mostPopular.name, icon: Star, color: "text-amber-400" },
          { label: "חדשות השנה", value: newThisYear, icon: CalendarPlus, color: "text-cyan-400" },
          { label: "הוצאו משימוש", value: deprecated, icon: Archive, color: "text-red-400" },
        ].map((kpi, i) => (
          <Card key={i} className="bg-[#0d1526] border-white/10">
            <CardContent className="p-4 flex flex-col items-center text-center gap-1">
              <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
              <span className="text-xl font-bold text-white">{kpi.value}</span>
              <span className="text-[11px] text-muted-foreground">{kpi.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#0d1526] border border-white/10">
          <TabsTrigger value="systems">משפחות מערכות</TabsTrigger>
          <TabsTrigger value="compatibility">מטריצת תאימות</TabsTrigger>
          <TabsTrigger value="performance">מפרטי ביצועים</TabsTrigger>
          <TabsTrigger value="projects">שימוש בפרויקטים</TabsTrigger>
        </TabsList>

        {/* Tab 1 - Systems */}
        <TabsContent value="systems" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש מערכת..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-9 bg-[#0d1526] border-white/10"
            />
          </div>

          <div className="grid gap-3">
            {filtered.map(sys => (
              <Card key={sys.id} className="bg-[#0d1526] border-white/10 hover:border-blue-500/40 transition-colors">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 font-bold text-sm">
                        {sys.widthMM}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{sys.name}</h3>
                        <span className="text-xs text-muted-foreground">{sys.type} &bull; {sys.widthMM}mm</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <div className="text-center">
                        <div className="text-white font-medium">{sys.profiles}</div>
                        <div className="text-[10px] text-muted-foreground">פרופילים</div>
                      </div>
                      <div className="text-center">
                        <div className="text-white font-medium">{sys.glassOptions}</div>
                        <div className="text-[10px] text-muted-foreground">אופציות זכוכית</div>
                      </div>
                      <div className="text-center max-w-[120px]">
                        <div className="text-white font-medium text-xs">{sys.hardwareCompat}</div>
                        <div className="text-[10px] text-muted-foreground">חומרה תואמת</div>
                      </div>
                      <div className="text-center">
                        <div className="text-white font-medium">{sys.thermalRating}</div>
                        <div className="text-[10px] text-muted-foreground">מקדם תרמי</div>
                      </div>
                      <Badge className={STATUS_STYLE[sys.status]}>{sys.status}</Badge>
                      <div className="text-center">
                        <div className="text-white font-medium">{sys.projectsUsing}</div>
                        <div className="text-[10px] text-muted-foreground">פרויקטים</div>
                      </div>
                      <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 2 - Compatibility Matrix */}
        <TabsContent value="compatibility" className="space-y-4">
          <Card className="bg-[#0d1526] border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-400" />
                מטריצת תאימות — מערכות מול אביזרים / חומרה / אטמים
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-right p-2 text-muted-foreground font-medium min-w-[120px]">אביזר</th>
                    {SYSTEMS.map(s => (
                      <th key={s.id} className="p-2 text-muted-foreground font-medium text-center min-w-[80px]">{s.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {COMPAT_MATRIX.map((row, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="p-2 text-white font-medium">{row.accessory}</td>
                      {SYSTEMS.map(s => {
                        const val = row.systems[s.id] || "none";
                        return (
                          <td key={s.id} className="p-2 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${COMPAT_CELL[val]}`}>
                              {COMPAT_LABEL[val]}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-4 mt-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500/30" /> מלא</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500/30" /> חלקי</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-zinc-700/30" /> לא תואם</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3 - Performance Specs */}
        <TabsContent value="performance" className="space-y-4">
          <Card className="bg-[#0d1526] border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                דירוגי ביצועים — תרמי / אקוסטי / רוח / מים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {SYSTEMS.map(sys => {
                const spec = PERF_SPECS.find(p => p.systemId === sys.id);
                if (!spec) return null;
                return (
                  <div key={sys.id} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-white">{sys.name} <span className="text-muted-foreground font-normal">({sys.type})</span></h4>
                      <Badge className={STATUS_STYLE[sys.status]}>{sys.status}</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: "תרמי", value: spec.thermal, icon: Thermometer, color: "bg-orange-500" },
                        { label: "אקוסטי", value: spec.acoustic, icon: Volume2, color: "bg-purple-500" },
                        { label: "עמידות רוח", value: spec.wind, icon: Wind, color: "bg-cyan-500" },
                        { label: "אטימות מים", value: spec.water, icon: Droplets, color: "bg-blue-500" },
                      ].map((m, j) => (
                        <div key={j} className="bg-[#111b30] rounded-lg p-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <m.icon className="w-3 h-3" /> {m.label}
                            </span>
                            <span className="text-xs font-bold text-white">{m.value}%</span>
                          </div>
                          <Progress value={m.value} className="h-1.5" />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4 - Project Usage */}
        <TabsContent value="projects" className="space-y-4">
          <Card className="bg-[#0d1526] border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-purple-400" />
                שימוש מערכות בפרויקטים
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-right p-3 text-muted-foreground font-medium">פרויקט</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">לקוח</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">מערכות</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">יח'</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">שנה</th>
                  </tr>
                </thead>
                <tbody>
                  {PROJECT_USAGE.map((p, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="p-3 text-white font-medium">{p.project}</td>
                      <td className="p-3 text-muted-foreground">{p.client}</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {p.systems.map(sid => {
                            const s = SYSTEMS.find(x => x.id === sid);
                            return s ? (
                              <Badge key={sid} variant="outline" className="text-[10px] border-blue-500/30 text-blue-300">
                                {s.name}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </td>
                      <td className="p-3 text-center text-white font-medium">{p.units.toLocaleString()}</td>
                      <td className="p-3 text-center text-muted-foreground">{p.year}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Systems popularity summary */}
          <Card className="bg-[#0d1526] border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                פופולריות מערכות לפי מספר פרויקטים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[...SYSTEMS].sort((a, b) => b.projectsUsing - a.projectsUsing).map(sys => (
                <div key={sys.id} className="flex items-center gap-3">
                  <span className="text-xs text-white w-28 truncate">{sys.name}</span>
                  <div className="flex-1">
                    <Progress value={(sys.projectsUsing / 45) * 100} className="h-2" />
                  </div>
                  <span className="text-xs text-muted-foreground w-12 text-left">{sys.projectsUsing} פרו'</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
