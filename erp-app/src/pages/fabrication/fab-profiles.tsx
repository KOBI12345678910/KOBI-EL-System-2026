import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Layers, Activity, Weight, Truck, Factory, AlertTriangle, Search, Plus, Download, Eye, Settings2, Thermometer, Ruler } from "lucide-react";

const kpis = [
  { label: "סה\"כ פרופילים", value: "248", icon: Layers, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "סדרות פעילות", value: "5", icon: Activity, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { label: "מלאי משקל (טון)", value: "34.7", icon: Weight, color: "text-purple-400", bg: "bg-purple-500/10" },
  { label: "ספקים", value: "8", icon: Truck, color: "text-orange-400", bg: "bg-orange-500/10" },
  { label: "בייצור כעת", value: "42", icon: Factory, color: "text-cyan-400", bg: "bg-cyan-500/10" },
  { label: "התראות מלאי נמוך", value: "7", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
];

const FALLBACK_PROFILES = [
  { code: "PR-4520", series: "כנף", dims: "45x20 מ\"מ", weightM: "0.62", alloy: "6063", tb: true, surface: "אנודייז כסף", stockM: 1240, status: "פעיל" },
  { code: "PR-6530", series: "הזזה", dims: "65x30 מ\"מ", weightM: "1.15", alloy: "6063", tb: false, surface: "צביעה אלקטרוסטטית", stockM: 870, status: "פעיל" },
  { code: "PR-7240", series: "ציר-סובב", dims: "72x40 מ\"מ", weightM: "1.38", alloy: "6063", tb: true, surface: "אנודייז ברונזה", stockM: 560, status: "פעיל" },
  { code: "PR-8050", series: "קיר מסך", dims: "80x50 מ\"מ", weightM: "1.92", alloy: "6061", tb: true, surface: "PVDF לבן", stockM: 320, status: "בייצור" },
  { code: "PR-5525", series: "דלת", dims: "55x25 מ\"מ", weightM: "0.88", alloy: "6063", tb: false, surface: "צביעה RAL 7016", stockM: 95, status: "מלאי נמוך" },
  { code: "PR-4518", series: "כנף", dims: "45x18 מ\"מ", weightM: "0.55", alloy: "6063", tb: false, surface: "אנודייז טבעי", stockM: 1680, status: "פעיל" },
  { code: "PR-6035", series: "הזזה", dims: "60x35 מ\"מ", weightM: "1.22", alloy: "6063", tb: true, surface: "דמוי עץ אלון", stockM: 410, status: "פעיל" },
  { code: "PR-7845", series: "ציר-סובב", dims: "78x45 מ\"מ", weightM: "1.55", alloy: "6061", tb: true, surface: "צביעה RAL 9005", stockM: 680, status: "בייצור" },
  { code: "PR-9060", series: "קיר מסך", dims: "90x60 מ\"מ", weightM: "2.35", alloy: "6061", tb: true, surface: "PVDF שחור", stockM: 180, status: "פעיל" },
  { code: "PR-5020", series: "דלת", dims: "50x20 מ\"מ", weightM: "0.74", alloy: "6063", tb: false, surface: "אנודייז כסף", stockM: 60, status: "מלאי נמוך" },
  { code: "PR-4822", series: "כנף", dims: "48x22 מ\"מ", weightM: "0.68", alloy: "6063", tb: true, surface: "צביעה RAL 7016", stockM: 920, status: "פעיל" },
  { code: "PR-7038", series: "הזזה", dims: "70x38 מ\"מ", weightM: "1.45", alloy: "6061", tb: true, surface: "דמוי עץ מהגוני", stockM: 340, status: "בייצור" },
  { code: "PR-8248", series: "ציר-סובב", dims: "82x48 מ\"מ", weightM: "1.72", alloy: "6061", tb: true, surface: "PVDF אפור", stockM: 45, status: "מלאי נמוך" },
  { code: "PR-10070", series: "קיר מסך", dims: "100x70 מ\"מ", weightM: "2.80", alloy: "6061", tb: true, surface: "אנודייז ברונזה", stockM: 150, status: "פעיל" },
  { code: "PR-6228", series: "דלת", dims: "62x28 מ\"מ", weightM: "0.95", alloy: "6063", tb: true, surface: "צביעה RAL 9010", stockM: 780, status: "פעיל" },
];

const FALLBACK_SERIESDATA = [
  { name: "כנף (Casement)", count: 52, apps: "חלונות כנף, חלונות קיפ, אוורור צד" },
  { name: "הזזה (Sliding)", count: 48, apps: "דלתות הזזה, חלונות הזזה, מרפסות" },
  { name: "ציר-סובב (Tilt & Turn)", count: 45, apps: "חלונות ציר-סובב, חלונות ניקוי, בנייני מגורים" },
  { name: "קיר מסך (Curtain Wall)", count: 38, apps: "חזיתות מסחריות, מגדלי משרדים, קניונים" },
  { name: "דלת (Door)", count: 65, apps: "דלתות כניסה, דלתות פנים, דלתות חירום, דלתות מרפסת" },
];

const FALLBACK_STOCKDATA = [
  { code: "PR-4520", name: "כנף 45x20", stock: 1240, min: 200, max: 2000 },
  { code: "PR-6530", name: "הזזה 65x30", stock: 870, min: 300, max: 1500 },
  { code: "PR-7240", name: "ציר-סובב 72x40", stock: 560, min: 200, max: 1200 },
  { code: "PR-8050", name: "קיר מסך 80x50", stock: 320, min: 150, max: 800 },
  { code: "PR-5525", name: "דלת 55x25", stock: 95, min: 150, max: 1000 },
  { code: "PR-4518", name: "כנף 45x18", stock: 1680, min: 200, max: 2000 },
  { code: "PR-6035", name: "הזזה 60x35", stock: 410, min: 200, max: 1200 },
  { code: "PR-5020", name: "דלת 50x20", stock: 60, min: 100, max: 800 },
  { code: "PR-8248", name: "ציר-סובב 82x48", stock: 45, min: 100, max: 600 },
];

const FALLBACK_TECHSPECS = [
  { code: "PR-4520", series: "כנף", ix: 12.4, iy: 5.8, area: 2.32, uf: 3.1, ufTb: 1.8 as number | null, span: "1.2 מ'" },
  { code: "PR-6530", series: "הזזה", ix: 28.6, iy: 14.2, area: 4.31, uf: 3.4, ufTb: null, span: "1.8 מ'" },
  { code: "PR-7240", series: "ציר-סובב", ix: 42.1, iy: 22.5, area: 5.17, uf: 3.2, ufTb: 1.6 as number | null, span: "1.5 מ'" },
  { code: "PR-8050", series: "קיר מסך", ix: 68.3, iy: 38.9, area: 7.19, uf: 2.9, ufTb: 1.4 as number | null, span: "2.5 מ'" },
  { code: "PR-5525", series: "דלת", ix: 18.7, iy: 9.1, area: 3.30, uf: 3.3, ufTb: null, span: "1.1 מ'" },
  { code: "PR-9060", series: "קיר מסך", ix: 95.2, iy: 52.4, area: 8.81, uf: 2.7, ufTb: 1.3 as number | null, span: "3.0 מ'" },
  { code: "PR-7845", series: "ציר-סובב", ix: 55.8, iy: 30.1, area: 5.81, uf: 3.0, ufTb: 1.5 as number | null, span: "1.8 מ'" },
  { code: "PR-6228", series: "דלת", ix: 22.3, iy: 11.6, area: 3.56, uf: 3.1, ufTb: 1.7 as number | null, span: "1.3 מ'" },
];

const SC: Record<string, string> = {
  "פעיל": "bg-green-500/20 text-green-300 border-green-500/30",
  "בייצור": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "מלאי נמוך": "bg-red-500/20 text-red-300 border-red-500/30",
};

export default function FabProfiles() {
  const { data: apiprofiles } = useQuery({
    queryKey: ["/api/fabrication/fab-profiles/profiles"],
    queryFn: () => authFetch("/api/fabrication/fab-profiles/profiles").then(r => r.json()).catch(() => null),
  });
  const profiles = Array.isArray(apiprofiles) ? apiprofiles : (apiprofiles?.data ?? apiprofiles?.items ?? FALLBACK_PROFILES);


  const { data: apiseriesData } = useQuery({
    queryKey: ["/api/fabrication/fab-profiles/seriesdata"],
    queryFn: () => authFetch("/api/fabrication/fab-profiles/seriesdata").then(r => r.json()).catch(() => null),
  });
  const seriesData = Array.isArray(apiseriesData) ? apiseriesData : (apiseriesData?.data ?? apiseriesData?.items ?? FALLBACK_SERIESDATA);


  const { data: apistockData } = useQuery({
    queryKey: ["/api/fabrication/fab-profiles/stockdata"],
    queryFn: () => authFetch("/api/fabrication/fab-profiles/stockdata").then(r => r.json()).catch(() => null),
  });
  const stockData = Array.isArray(apistockData) ? apistockData : (apistockData?.data ?? apistockData?.items ?? FALLBACK_STOCKDATA);


  const { data: apitechSpecs } = useQuery({
    queryKey: ["/api/fabrication/fab-profiles/techspecs"],
    queryFn: () => authFetch("/api/fabrication/fab-profiles/techspecs").then(r => r.json()).catch(() => null),
  });
  const techSpecs = Array.isArray(apitechSpecs) ? apitechSpecs : (apitechSpecs?.data ?? apitechSpecs?.items ?? FALLBACK_TECHSPECS);

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("catalog");
  const filtered = profiles.filter(p => !search || p.code.includes(search) || p.series.includes(search) || p.surface.includes(search));

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">קטלוג פרופילי אלומיניום</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול פרופילים, סדרות, מלאי ומפרטים טכניים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />יצוא</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700"><Plus className="w-4 h-4 ml-1" />פרופיל חדש</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/60 border-border/40">
            <CardContent className="p-4">
              <div className={`p-2 rounded-lg ${k.bg} w-fit mb-2`}><k.icon className={`w-4 h-4 ${k.color}`} /></div>
              <div className="text-2xl font-bold text-white">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-card/60 border border-border/40">
          <TabsTrigger value="catalog">קטלוג פרופילים</TabsTrigger>
          <TabsTrigger value="series">ניהול סדרות</TabsTrigger>
          <TabsTrigger value="stock">רמות מלאי</TabsTrigger>
          <TabsTrigger value="tech">מפרט טכני</TabsTrigger>
        </TabsList>

        {/* Catalog */}
        <TabsContent value="catalog" className="mt-4">
          <Card className="bg-card/60 border-border/40">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-white">קטלוג פרופילים</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש קוד, סדרה, גימור..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-border/50">
                    {["קוד פרופיל","סדרה","מידות","משקל/מ' (ק\"ג)","סגסוגת"].map(h => <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>)}
                    <th className="text-center p-3 text-muted-foreground font-medium">גשר תרמי</th>
                    {["גימור משטח","מלאי (מ')"].map(h => <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>)}
                    <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    <th className="text-center p-3 text-muted-foreground font-medium">פעולות</th>
                  </tr></thead>
                  <tbody>
                    {filtered.map(p => (
                      <tr key={p.code} className="border-b border-border/20 hover:bg-white/[0.02]">
                        <td className="p-3 text-white font-mono font-medium">{p.code}</td>
                        <td className="p-3 text-foreground">{p.series}</td>
                        <td className="p-3 text-foreground">{p.dims}</td>
                        <td className="p-3 text-foreground">{p.weightM}</td>
                        <td className="p-3"><Badge variant="outline" className="text-xs">{p.alloy}</Badge></td>
                        <td className="p-3 text-center">
                          <Badge className={`text-xs ${p.tb ? "bg-green-500/20 text-green-300 border-green-500/30" : "bg-zinc-500/20 text-zinc-400 border-zinc-500/30"}`}>{p.tb ? "כן" : "לא"}</Badge>
                        </td>
                        <td className="p-3 text-foreground text-xs">{p.surface}</td>
                        <td className="p-3 text-foreground font-medium">{p.stockM.toLocaleString()}</td>
                        <td className="p-3 text-center"><Badge className={`${SC[p.status] || ""} text-xs`}>{p.status}</Badge></td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Eye className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Settings2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/30">מציג {filtered.length} מתוך {profiles.length} פרופילים</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Series */}
        <TabsContent value="series" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {seriesData.map(s => (
              <Card key={s.name} className="bg-card/60 border-border/40">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base text-white">{s.name}</CardTitle>
                    <Badge variant="outline" className="text-xs">{s.count} פרופילים</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">יישומים</div>
                    <div className="text-sm text-foreground">{s.apps}</div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-muted-foreground">נתח מהקטלוג</span>
                      <span className="text-white font-medium">{Math.round((s.count / 248) * 100)}%</span>
                    </div>
                    <Progress value={Math.round((s.count / 248) * 100)} className="h-2" />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1 text-xs h-8"><Eye className="w-3 h-3 ml-1" />צפייה</Button>
                    <Button variant="outline" size="sm" className="flex-1 text-xs h-8"><Settings2 className="w-3 h-3 ml-1" />עריכה</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-card/60 border-border/40">
            <CardHeader><CardTitle className="text-lg text-white">סיכום סדרות</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border/50">
                  {["סדרה","מס' פרופילים","יישומים עיקריים","נתח"].map(h => <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>)}
                </tr></thead>
                <tbody>
                  {seriesData.map(s => (
                    <tr key={s.name} className="border-b border-border/20 hover:bg-white/[0.02]">
                      <td className="p-3 text-white font-medium">{s.name}</td>
                      <td className="p-3 text-foreground">{s.count}</td>
                      <td className="p-3 text-foreground text-xs">{s.apps}</td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Progress value={Math.round((s.count / 248) * 100)} className="h-1.5 w-16" />
                          <span className="text-xs text-muted-foreground">{Math.round((s.count / 248) * 100)}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stock */}
        <TabsContent value="stock" className="space-y-4 mt-4">
          <Card className="bg-card/60 border-border/40">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg text-white">רמות מלאי לפי פרופיל</CardTitle>
                <Badge className="bg-red-500/20 text-red-300 border-red-500/30"><AlertTriangle className="w-3 h-3 ml-1" />3 מתחת למינימום</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {stockData.map(s => {
                const pct = Math.min(100, Math.round((s.stock / s.max) * 100));
                const low = s.stock < s.min;
                return (
                  <div key={s.code} className={`p-3 rounded-lg border ${low ? "border-red-500/40 bg-red-500/5" : "border-border/30 bg-white/[0.02]"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-white font-medium">{s.code}</span>
                        <span className="text-sm text-foreground">{s.name}</span>
                        {low && <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs"><AlertTriangle className="w-3 h-3 ml-1" />דרוש הזמנה</Badge>}
                      </div>
                      <span className={`text-sm font-bold ${low ? "text-red-400" : "text-white"}`}>{s.stock.toLocaleString()} מטר</span>
                    </div>
                    <div className="relative">
                      <Progress value={pct} className={`h-3 ${low ? "[&>div]:bg-red-500" : ""}`} />
                      <div className="absolute top-0 h-3 border-r-2 border-dashed border-yellow-500" style={{ right: `${100 - Math.round((s.min / s.max) * 100)}%` }} />
                    </div>
                    <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                      <span>מינ': {s.min}</span><span>מקס': {s.max.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border/40">
            <CardHeader><CardTitle className="text-lg text-white">התראות הזמנה מחדש</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border/50">
                  {["קוד","פרופיל","מלאי נוכחי","מינימום","חוסר"].map(h => <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>)}
                  <th className="text-center p-3 text-muted-foreground font-medium">פעולה</th>
                </tr></thead>
                <tbody>
                  {stockData.filter(s => s.stock < s.min).map(s => (
                    <tr key={s.code} className="border-b border-border/20 bg-red-500/5">
                      <td className="p-3 font-mono text-white">{s.code}</td>
                      <td className="p-3 text-foreground">{s.name}</td>
                      <td className="p-3 text-red-400 font-bold">{s.stock}</td>
                      <td className="p-3 text-foreground">{s.min}</td>
                      <td className="p-3 text-red-400 font-medium">{s.min - s.stock} מטר</td>
                      <td className="p-3 text-center"><Button size="sm" className="bg-red-600 hover:bg-red-700 text-xs h-7">הזמן עכשיו</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Technical */}
        <TabsContent value="tech" className="space-y-4 mt-4">
          <Card className="bg-card/60 border-border/40">
            <CardHeader>
              <div className="flex items-center gap-2"><Ruler className="w-5 h-5 text-blue-400" /><CardTitle className="text-lg text-white">מפרט טכני - חתכים ומומנטי אינרציה</CardTitle></div>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border/50">
                  {["קוד פרופיל","סדרה","Ix (cm4)","Iy (cm4)","שטח חתך (cm2)","טווח מקסימלי"].map(h => <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>)}
                </tr></thead>
                <tbody>
                  {techSpecs.map(t => (
                    <tr key={t.code} className="border-b border-border/20 hover:bg-white/[0.02]">
                      <td className="p-3 font-mono text-white font-medium">{t.code}</td>
                      <td className="p-3 text-foreground">{t.series}</td>
                      <td className="p-3 text-foreground font-mono">{t.ix.toFixed(1)}</td>
                      <td className="p-3 text-foreground font-mono">{t.iy.toFixed(1)}</td>
                      <td className="p-3 text-foreground font-mono">{t.area.toFixed(2)}</td>
                      <td className="p-3 text-foreground">{t.span}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <Card className="bg-card/60 border-border/40">
            <CardHeader>
              <div className="flex items-center gap-2"><Thermometer className="w-5 h-5 text-orange-400" /><CardTitle className="text-lg text-white">ערכי U-Value (מקדם מעבר חום)</CardTitle></div>
            </CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-border/50">
                  {["קוד פרופיל","סדרה","Uf ללא גשר (W/m2K)","Uf עם גשר (W/m2K)","שיפור"].map(h => <th key={h} className="text-right p-3 text-muted-foreground font-medium">{h}</th>)}
                  <th className="text-center p-3 text-muted-foreground font-medium">תקן SI 1045</th>
                </tr></thead>
                <tbody>
                  {techSpecs.map(t => {
                    const imp = t.ufTb ? Math.round(((t.uf - t.ufTb) / t.uf) * 100) : null;
                    const ok = t.ufTb ? t.ufTb <= 2.0 : t.uf <= 2.0;
                    return (
                      <tr key={t.code} className="border-b border-border/20 hover:bg-white/[0.02]">
                        <td className="p-3 font-mono text-white font-medium">{t.code}</td>
                        <td className="p-3 text-foreground">{t.series}</td>
                        <td className="p-3 text-foreground font-mono">{t.uf.toFixed(1)}</td>
                        <td className="p-3">{t.ufTb ? <span className="text-green-400 font-mono font-bold">{t.ufTb.toFixed(1)}</span> : <span className="text-muted-foreground">--</span>}</td>
                        <td className="p-3">{imp !== null ? <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-xs">{imp}% שיפור</Badge> : <span className="text-muted-foreground text-xs">ללא גשר</span>}</td>
                        <td className="p-3 text-center"><Badge className={`text-xs ${ok ? "bg-green-500/20 text-green-300 border-green-500/30" : "bg-red-500/20 text-red-300 border-red-500/30"}`}>{ok ? "עומד" : "לא עומד"}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg text-xs text-blue-300">
                <strong>הערה:</strong> ערכי U-Value מחושבים לפי תקן SI 1045 חלק 4. פרופילים עם גשר תרמי מציגים שיפור משמעותי בבידוד. דרישת התקן: Uf &le; 2.0 W/m2K לבנייה חדשה.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}