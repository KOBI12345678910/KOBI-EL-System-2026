import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3, Target, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Layers, Building2, Home, Factory, Wrench,
  PieChart, Activity, Search
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const fmt = (v: number) => v.toLocaleString("he-IL");
const fmtC = (v: number) => "₪" + fmt(v);
const fmtP = (v: number) => v.toFixed(1) + "%";

// [id, name, type, client, contract, materials, labor, sub, overhead, expectedMargin, status]
const FALLBACK_RAW_PROJECTS: any[][] = [
  [1,"מגדל אופק רמת גן","residential","אופק נכסים",2850000,855000,570000,342000,171000,32,"active"],
  [2,"קניון הנגב באר שבע","commercial","נגב מרכזי קניות",4200000,1386000,840000,504000,252000,29,"active"],
  [3,"מפעל אלביט כרמיאל","industrial","אלביט מערכות",3600000,1080000,720000,432000,216000,32,"active"],
  [4,"שיפוץ לובי מלון דן","renovation","מלונות דן",890000,311500,178000,89000,62300,28,"completed"],
  [5,"בניין מגורים חולון","residential","גינדי השקעות",1950000,624000,409500,214500,136500,29,"active"],
  [6,"משרדי הייטק הרצליה","commercial","אמות השקעות",3100000,930000,651000,341000,217000,31,"active"],
  [7,"מחסן לוגיסטי אשדוד","industrial","שילוח ישראל",1800000,612000,360000,198000,126000,28,"completed"],
  [8,"שיפוץ חזית בניין ת״א","renovation","עירית תל אביב",1200000,444000,252000,132000,96000,23,"active"],
  [9,"פרויקט מגורים נתניה","residential","אזורים חברה",2400000,720000,504000,264000,168000,31,"active"],
  [10,"מרכז מסחרי מודיעין","commercial","ביג מרכזי קניות",5100000,1632000,1020000,561000,357000,30,"active"],
  [11,"מפעל מזון רהט","industrial","תנובה",2700000,864000,540000,297000,189000,30,"completed"],
  [12,"שיפוץ כיתות אוניברסיטה","renovation","אוניברסיטת בן גוריון",680000,217600,149600,74800,54400,27,"active"],
];
const FALLBACK_PROJECTS = FALLBACK_RAW_PROJECTS.map(r => ({
  id: r[0], name: r[1], type: r[2], client: r[3], contract: r[4],
  materials: r[5], labor: r[6], sub: r[7], overhead: r[8], expectedMargin: r[9], status: r[10],
}));

const FALLBACK_MONTHLY_TRENDS = [
  { month: "אוק׳ 25", avgMargin: 28.2, quoteMargin: 30.5, erosion: -2.3 },
  { month: "נוב׳ 25", avgMargin: 27.8, quoteMargin: 30.5, erosion: -2.7 },
  { month: "דצמ׳ 25", avgMargin: 29.1, quoteMargin: 30.5, erosion: -1.4 },
  { month: "ינו׳ 26", avgMargin: 29.5, quoteMargin: 30.5, erosion: -1.0 },
  { month: "פבר׳ 26", avgMargin: 30.2, quoteMargin: 30.5, erosion: -0.3 },
  { month: "מרץ 26", avgMargin: 30.8, quoteMargin: 30.5, erosion: 0.3 },
];

const typeLabels: Record<string, string> = { residential: "מגורים", commercial: "מסחרי", industrial: "תעשייתי", renovation: "שיפוצים" };
const typeIcons: Record<string, any> = { residential: Home, commercial: Building2, industrial: Factory, renovation: Wrench };

function MarginBar({ actual, expected }: { actual: number; expected: number }) {
  const c = actual >= expected ? "bg-emerald-500" : actual >= expected - 3 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden relative">
        <div className={`h-full rounded-full ${c}`} style={{ width: `${Math.min(actual * 2.5, 100)}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-white/60" style={{ right: `${100 - expected * 2.5}%` }} />
      </div>
      <span className={`text-xs font-bold min-w-[40px] text-left ${actual >= expected ? "text-emerald-400" : "text-red-400"}`}>{fmtP(actual)}</span>
    </div>);
}

export default function ProjectProfitabilityPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: apiProfit } = useQuery({
    queryKey: ["project-profitability"],
    queryFn: async () => { const r = await authFetch("/api/projects/profitability"); return r.json(); },
  });
  const projects = apiProfit?.projects ?? apiProfit?.data?.projects ?? FALLBACK_PROJECTS;
  const monthlyTrends = apiProfit?.monthlyTrends ?? apiProfit?.data?.monthlyTrends ?? FALLBACK_MONTHLY_TRENDS;

  const enriched = useMemo(() => projects.map((p: any) => {
    const totalCost = p.materials + p.labor + p.sub + p.overhead;
    const gp = p.contract - totalCost, margin = (gp / p.contract) * 100;
    return { ...p, totalCost, gp, margin, marginDelta: margin - p.expectedMargin };
  }), [projects]);

  const filtered = useMemo(() => enriched
    .filter(p => typeFilter === "all" || p.type === typeFilter)
    .filter(p => !search || p.name.includes(search) || p.client.includes(search)),
  [enriched, search, typeFilter]);

  const totalGP = enriched.reduce((s, p) => s + p.gp, 0);
  const avgMargin = enriched.reduce((s, p) => s + p.margin, 0) / enriched.length;
  const best = enriched.reduce((a, b) => a.margin > b.margin ? a : b);
  const worst = enriched.reduce((a, b) => a.margin < b.margin ? a : b);
  const erosionCount = enriched.filter(p => p.marginDelta < -2).length;
  const latestTrend = monthlyTrends[monthlyTrends.length - 1].avgMargin - monthlyTrends[monthlyTrends.length - 2].avgMargin;

  const categoryStats = useMemo(() => {
    const types = ["residential", "commercial", "industrial", "renovation"];
    return types.map(type => {
      const items = enriched.filter(p => p.type === type);
      const totalContract = items.reduce((s, p) => s + p.contract, 0);
      const totalGP = items.reduce((s, p) => s + p.gp, 0);
      const avgM = items.length > 0 ? items.reduce((s, p) => s + p.margin, 0) / items.length : 0;
      return { type, label: typeLabels[type], count: items.length, totalContract, totalGP, avgMargin: avgM };
    });
  }, [enriched]);

  const avgCostBreakdown = useMemo(() => {
    const t = enriched.reduce((a, p) => ({ m: a.m + (p.materials / p.totalCost) * 100, l: a.l + (p.labor / p.totalCost) * 100,
      s: a.s + (p.sub / p.totalCost) * 100, o: a.o + (p.overhead / p.totalCost) * 100 }), { m: 0, l: 0, s: 0, o: 0 });
    const n = enriched.length;
    return { materials: t.m / n, labor: t.l / n, sub: t.s / n, overhead: t.o / n };
  }, [enriched]);

  return (
    <div dir="rtl" className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ניתוח רווחיות פרויקטים</h1>
          <p className="text-sm text-muted-foreground mt-1">ניתוח חוצה פרויקטים - מרווח גולמי, מגמות ושחיקה</p>
        </div>
        <Badge variant="outline" className="text-xs">{enriched.length} פרויקטים</Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { icon: BarChart3, bg: "bg-blue-500/20", ic: "text-blue-400", label: "מרווח ממוצע", main: fmtP(avgMargin) },
          { icon: TrendingUp, bg: "bg-emerald-500/20", ic: "text-emerald-400", label: "הכי רווחי", main: best.name.split(" ").slice(0, 2).join(" "), sub: fmtP(best.margin), mainClass: "text-sm text-emerald-400" },
          { icon: TrendingDown, bg: "bg-red-500/20", ic: "text-red-400", label: "מרווח נמוך", main: worst.name.split(" ").slice(0, 2).join(" "), sub: fmtP(worst.margin), mainClass: "text-sm text-red-400" },
          { icon: DollarSign, bg: "bg-green-500/20", ic: "text-green-400", label: "סה״כ רווח גולמי", main: fmtC(totalGP) },
          { icon: AlertTriangle, bg: "bg-amber-500/20", ic: "text-amber-400", label: "שחיקת מרווח", main: String(erosionCount), sub: "פרויקטים", mainClass: "text-xl font-bold text-amber-400" },
          { icon: Activity, bg: "bg-purple-500/20", ic: "text-purple-400", label: "מגמת שיפור", main: (latestTrend >= 0 ? "+" : "") + fmtP(latestTrend), mainClass: `text-xl font-bold ${latestTrend >= 0 ? "text-emerald-400" : "text-red-400"}` },
        ].map((kpi, i) => (
          <Card key={i} className="border-border/50 bg-muted/30">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${kpi.bg}`}><kpi.icon className={`w-4 h-4 ${kpi.ic}`} /></div>
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <div className={kpi.mainClass || "text-xl font-bold text-foreground"}>{kpi.main}</div>
              {kpi.sub && <div className="text-xs text-muted-foreground">{kpi.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="projects" className="space-y-4">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="projects">לפי פרויקט</TabsTrigger>
          <TabsTrigger value="category">לפי קטגוריה</TabsTrigger>
          <TabsTrigger value="costs">פירוט עלויות</TabsTrigger>
          <TabsTrigger value="trends">מגמות מרווח</TabsTrigger>
        </TabsList>

        {/* Tab 1: By Project */}
        <TabsContent value="projects" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="חיפוש פרויקט..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
            </div>
            <div className="flex gap-1">
              {["all", "residential", "commercial", "industrial", "renovation"].map(t => (
                <Button key={t} size="sm" variant={typeFilter === t ? "default" : "outline"}
                  onClick={() => setTypeFilter(t)} className="text-xs">
                  {t === "all" ? "הכל" : typeLabels[t]}
                </Button>
              ))}
            </div>
          </div>
          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>{["פרויקט","סוג","ערך חוזה","עלויות","רווח גולמי","מרווח %","סטייה"].map(h => (
                  <th key={h} className="text-right p-3 font-medium text-muted-foreground">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="p-3">
                      <div className="font-medium text-foreground">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.client}</div>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">{typeLabels[p.type]}</Badge>
                    </td>
                    <td className="p-3 font-medium text-foreground">{fmtC(p.contract)}</td>
                    <td className="p-3 text-muted-foreground">{fmtC(p.totalCost)}</td>
                    <td className="p-3 font-medium text-emerald-400">{fmtC(p.gp)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground min-w-[32px]">{p.expectedMargin}%</span>
                        <MarginBar actual={p.margin} expected={p.expectedMargin} />
                      </div>
                    </td>
                    <td className="p-3">
                      <span className={`flex items-center gap-1 text-xs font-bold ${p.marginDelta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {p.marginDelta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {p.marginDelta >= 0 ? "+" : ""}{fmtP(p.marginDelta)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tab 2: By Category */}
        <TabsContent value="category" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {categoryStats.map(cat => {
              const Icon = typeIcons[cat.type];
              const color = cat.avgMargin >= 30 ? "emerald" : cat.avgMargin >= 27 ? "amber" : "red";
              return (
                <Card key={cat.type} className="border-border/50 bg-muted/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg bg-${color}-500/20`}>
                          <Icon className={`w-5 h-5 text-${color}-400`} />
                        </div>
                        <CardTitle className="text-base">{cat.label}</CardTitle>
                      </div>
                      <Badge variant="outline" className="text-xs">{cat.count} פרויקטים</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {[
                      { l: "סה״כ חוזים", v: fmtC(cat.totalContract), c: "text-foreground" },
                      { l: "רווח גולמי", v: fmtC(cat.totalGP), c: "text-emerald-400" },
                    ].map(r => (
                      <div key={r.l} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{r.l}</span>
                        <span className={`font-medium ${r.c}`}>{r.v}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">מרווח ממוצע</span>
                      <span className={`font-bold text-${color}-400`}>{fmtP(cat.avgMargin)}</span>
                    </div>
                    <Progress value={cat.avgMargin * 2.5} className="h-2" />
                    <div className="pt-2 border-t border-border/50">
                      {enriched.filter(p => p.type === cat.type).map(p => (
                        <div key={p.id} className="flex justify-between items-center py-1 text-xs">
                          <span className="text-muted-foreground truncate ml-2">{p.name}</span>
                          <span className={`font-medium ${p.margin >= p.expectedMargin ? "text-emerald-400" : "text-red-400"}`}>{fmtP(p.margin)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 3: Cost Breakdown */}
        <TabsContent value="costs" className="space-y-4">
          <Card className="border-border/50 bg-muted/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="w-5 h-5 text-blue-400" />
                התפלגות עלויות ממוצעת
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: "חומרים", value: avgCostBreakdown.materials, bg: "bg-blue-500", tx: "text-blue-400" },
                  { label: "עבודה", value: avgCostBreakdown.labor, bg: "bg-emerald-500", tx: "text-emerald-400" },
                  { label: "קב״מ", value: avgCostBreakdown.sub, bg: "bg-amber-500", tx: "text-amber-400" },
                  { label: "תקורה", value: avgCostBreakdown.overhead, bg: "bg-purple-500", tx: "text-purple-400" },
                ].map(i => (
                  <div key={i.label} className="text-center p-3 rounded-xl border border-border/50">
                    <div className={`text-2xl font-bold ${i.tx}`}>{fmtP(i.value)}</div>
                    <div className="text-xs text-muted-foreground mt-1">{i.label}</div>
                    <div className="h-2 rounded-full bg-muted mt-2 overflow-hidden">
                      <div className={`h-full rounded-full ${i.bg}`} style={{ width: `${i.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-muted/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-purple-400" />
                פירוט עלויות לפי פרויקט
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {enriched.map(p => {
                  const pcts = [p.materials, p.labor, p.sub, p.overhead].map(v => (v / p.totalCost) * 100);
                  const colors = ["bg-blue-500","bg-emerald-500","bg-amber-500","bg-purple-500"];
                  return (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className="min-w-[180px] text-sm text-foreground truncate">{p.name}</div>
                      <div className="flex-1 h-6 rounded-full overflow-hidden flex bg-muted">
                        {pcts.map((pct, i) => <div key={i} className={`${colors[i]} h-full`} style={{ width: `${pct}%` }} />)}
                      </div>
                      <div className="min-w-[80px] text-xs text-muted-foreground text-left">{fmtC(p.totalCost)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/50 justify-center">
                {[["חומרים","bg-blue-500"],["עבודה","bg-emerald-500"],["קב״מ","bg-amber-500"],["תקורה","bg-purple-500"]].map(([l,c]) => (
                  <div key={l} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className={`w-3 h-3 rounded ${c}`} />{l}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4: Margin Trends */}
        <TabsContent value="trends" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border-border/50 bg-muted/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                  מגמת מרווח חודשית
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {monthlyTrends.map((m, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="min-w-[70px] text-sm text-muted-foreground">{m.month}</div>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${m.avgMargin >= m.quoteMargin ? "bg-emerald-500" : "bg-blue-500"}`}
                            style={{ width: `${m.avgMargin * 2.8}%` }} />
                        </div>
                        <span className="text-xs font-bold text-foreground min-w-[40px]">{fmtP(m.avgMargin)}</span>
                      </div>
                      <span className={`text-xs font-medium min-w-[48px] text-left ${m.erosion >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {m.erosion >= 0 ? "+" : ""}{fmtP(m.erosion)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                  <span>יעד מרווח: <span className="text-foreground font-medium">{fmtP(30.5)}</span></span>
                  <span>מגמה: <span className={`font-medium ${latestTrend >= 0 ? "text-emerald-400" : "text-red-400"}`}>{latestTrend >= 0 ? "שיפור" : "ירידה"}</span></span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-muted/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-amber-400" />
                  מרווח בהצעה vs בפועל
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[...enriched].sort((a, b) => a.marginDelta - b.marginDelta).map(p => (
                    <div key={p.id} className="flex items-center gap-3">
                      <div className="min-w-[140px] text-xs text-foreground truncate">{p.name}</div>
                      <span className="text-[10px] text-muted-foreground min-w-[28px]">{p.expectedMargin}%</span>
                      <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden relative">
                        <div className="h-full bg-muted-foreground/20 rounded-full absolute" style={{ width: `${p.expectedMargin * 2.5}%` }} />
                        <div className={`h-full rounded-full relative z-10 ${p.margin >= p.expectedMargin ? "bg-emerald-500" : "bg-red-500"}`}
                          style={{ width: `${p.margin * 2.5}%` }} />
                      </div>
                      <span className={`text-[10px] font-bold min-w-[32px] ${p.margin >= p.expectedMargin ? "text-emerald-400" : "text-red-400"}`}>
                        {fmtP(p.margin)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50 bg-muted/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                ניתוח שחיקת מרווח
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {enriched.filter(p => p.marginDelta < 0).sort((a, b) => a.marginDelta - b.marginDelta).map(p => (
                  <div key={p.id} className={`p-3 rounded-xl border ${p.marginDelta < -3 ? "border-red-500/30 bg-red-500/5" : p.marginDelta < -1 ? "border-amber-500/30 bg-amber-500/5" : "border-yellow-500/30 bg-yellow-500/5"}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">{p.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {p.marginDelta < -3 ? "קריטי" : p.marginDelta < -1 ? "בינוני" : "קל"}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div><div className="text-muted-foreground">צפוי</div><div className="font-medium">{fmtP(p.expectedMargin)}</div></div>
                      <div><div className="text-muted-foreground">בפועל</div><div className="font-medium">{fmtP(p.margin)}</div></div>
                      <div><div className="text-muted-foreground">שחיקה</div><div className="font-bold text-red-400">{fmtP(p.marginDelta)}</div></div>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      אובדן רווח: <span className="text-red-400 font-medium">{fmtC(Math.round(p.contract * Math.abs(p.marginDelta) / 100))}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}