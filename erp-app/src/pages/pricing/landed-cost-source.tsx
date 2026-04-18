import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Globe, Ship, ArrowLeftRight, TrendingDown, TrendingUp, CheckCircle2,
  AlertTriangle, DollarSign, Package, BarChart3, RefreshCw, Scale,
} from "lucide-react";

const fmt = (v: number) => "₪" + v.toLocaleString("he-IL");
const fmtUsd = (v: number) => "$" + v.toLocaleString("en-US");
const pct = (v: number) => v.toFixed(1) + "%";

const FALLBACK_PROJECTS = [
  { id: "PRJ-1048", name: "שער כניסה Premium — קבוצת אלון" },
  { id: "PRJ-1035", name: "מעקה נירוסטה — עזריאלי" },
  { id: "PRJ-1051", name: "מבנה פלדה — שופרסל לוגיסטיקה" },
];

type Material = {
  name: string; origin: string; supplier: string;
  fob: number; freight: number; insurance: number; customs: number; portFees: number;
  totalLanded: number; perMeter: number; perKg: number;
  exchangeRate: number; date: string; localPrice: number;
};

const FALLBACK_MATERIALS: Material[] = [
  { name: "פלדה S355 - 10mm", origin: "טורקיה", supplier: "Erdemir Steel", fob: 820, freight: 95, insurance: 18, customs: 62, portFees: 35, totalLanded: 1030, perMeter: 128.75, perKg: 6.87, exchangeRate: 3.64, date: "2026-03-28", localPrice: 1180 },
  { name: "צינור נירוסטה 316L", origin: "אירופה (גרמניה)", supplier: "ThyssenKrupp", fob: 1420, freight: 140, insurance: 32, customs: 98, portFees: 42, totalLanded: 1732, perMeter: 216.50, perKg: 22.15, exchangeRate: 3.92, date: "2026-03-25", localPrice: 1950 },
  { name: "אלומיניום 6063-T5", origin: "סין", supplier: "Henan Mingtai", fob: 580, freight: 125, insurance: 22, customs: 78, portFees: 38, totalLanded: 843, perMeter: 105.38, perKg: 9.25, exchangeRate: 3.64, date: "2026-03-30", localPrice: 920 },
  { name: "פרופיל ברזל U100", origin: "טורקיה", supplier: "Tosyali Holding", fob: 640, freight: 88, insurance: 15, customs: 52, portFees: 30, totalLanded: 825, perMeter: 103.13, perKg: 5.50, exchangeRate: 3.64, date: "2026-03-28", localPrice: 910 },
  { name: "חומר מילוי אש EI60", origin: "אירופה (דנמרק)", supplier: "Rockwool", fob: 2100, freight: 180, insurance: 45, customs: 155, portFees: 48, totalLanded: 2528, perMeter: 316.00, perKg: 42.13, exchangeRate: 3.92, date: "2026-03-22", localPrice: 2820 },
  { name: "מנוע חשמלי תעשייתי", origin: "איטליה", supplier: "CAME BPT", fob: 3200, freight: 210, insurance: 68, customs: 240, portFees: 55, totalLanded: 3773, perMeter: 0, perKg: 188.65, exchangeRate: 3.92, date: "2026-03-20", localPrice: 4250 },
];

const FALLBACK_EXCHANGE_SCENARIOS = [
  { label: "שער נמוך ($1 = ₪3.45)", rate: 3.45, delta: -5.2 },
  { label: "שער נוכחי ($1 = ₪3.64)", rate: 3.64, delta: 0 },
  { label: "שער גבוה ($1 = ₪3.85)", rate: 3.85, delta: +5.8 },
  { label: "שער קיצוני ($1 = ₪4.05)", rate: 4.05, delta: +11.3 },
];

const totalImport = FALLBACK_MATERIALS.reduce((s, m) => s + m.totalLanded, 0);
const totalLocal = FALLBACK_MATERIALS.reduce((s, m) => s + m.localPrice, 0);
const totalSavings = totalLocal - totalImport;

export default function LandedCostSource() {

  const { data: apiData } = useQuery({
    queryKey: ["landed_cost_source"],
    queryFn: () => authFetch("/api/pricing/landed-cost-source").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const projects = apiData?.projects ?? FALLBACK_PROJECTS;
  const materials = apiData?.materials ?? FALLBACK_MATERIALS;
  const exchangeScenarios = apiData?.exchangeScenarios ?? FALLBACK_EXCHANGE_SCENARIOS;
  const [tab, setTab] = useState("landed");
  const [selectedProject, setSelectedProject] = useState(projects[0].id);

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">מקורות Landed Cost לתמחור</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניתוח עלויות יבוא בפועל</p>
          </div>
        </div>
        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-sm px-3 py-1">
          <Ship className="w-3.5 h-3.5 ml-1.5" /> {materials.length} חומרים מיובאים
        </Badge>
      </div>

      {/* Project Selector */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 rounded bg-cyan-500/20 flex items-center justify-center">
                <Package className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <div className="font-semibold text-base">{projects.find(p => p.id === selectedProject)?.name}</div>
                <div className="text-sm text-muted-foreground">
                  שער: $1 = ₪3.64 &nbsp;|&nbsp; עדכון אחרון: 30/03/2026 &nbsp;|&nbsp; {materials.length} חומרים ב-BOM
                </div>
              </div>
            </div>
            <select
              value={selectedProject}
              onChange={e => setSelectedProject(e.target.value)}
              className="bg-muted/50 border border-border rounded-md px-3 py-1.5 text-sm"
            >
              {projects.map(p => <option key={p.id} value={p.id}>{p.id} — {p.name}</option>)}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-600/30 to-blue-900/10 border-blue-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><Ship className="w-4 h-4 text-blue-400" /><span className="text-sm text-muted-foreground">סה"כ עלות יבוא</span></div>
            <div className="text-2xl font-bold text-blue-400">{fmt(totalImport)}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-600/30 to-amber-900/10 border-amber-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><DollarSign className="w-4 h-4 text-amber-400" /><span className="text-sm text-muted-foreground">עלות ספק מקומי</span></div>
            <div className="text-2xl font-bold text-amber-400">{fmt(totalLocal)}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-600/30 to-emerald-900/10 border-emerald-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><TrendingDown className="w-4 h-4 text-emerald-400" /><span className="text-sm text-muted-foreground">חיסכון ביבוא</span></div>
            <div className="text-2xl font-bold text-emerald-400">{fmt(totalSavings)}</div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-violet-600/30 to-violet-900/10 border-violet-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2"><Scale className="w-4 h-4 text-violet-400" /><span className="text-sm text-muted-foreground">% חיסכון ממוצע</span></div>
            <div className="text-2xl font-bold text-violet-400">{pct((totalSavings / totalLocal) * 100)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="landed">Landed Cost</TabsTrigger>
          <TabsTrigger value="compare">השוואה</TabsTrigger>
          <TabsTrigger value="exchange">שער חליפין</TabsTrigger>
        </TabsList>

        {/* Tab 1: Landed Cost Table */}
        <TabsContent value="landed" className="space-y-4 mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Ship className="w-4 h-4 text-cyan-400" /> פירוט Landed Cost — חומרים מיובאים
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">חומר</TableHead>
                    <TableHead className="text-right">ארץ מקור</TableHead>
                    <TableHead className="text-right">ספק</TableHead>
                    <TableHead className="text-center">FOB ($)</TableHead>
                    <TableHead className="text-center">הובלה</TableHead>
                    <TableHead className="text-center">ביטוח</TableHead>
                    <TableHead className="text-center">מכס</TableHead>
                    <TableHead className="text-center">נמל</TableHead>
                    <TableHead className="text-center">Landed/יח׳</TableHead>
                    <TableHead className="text-center">₪/מטר</TableHead>
                    <TableHead className="text-center">₪/ק"ג</TableHead>
                    <TableHead className="text-center">שער</TableHead>
                    <TableHead className="text-center">תאריך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map((m, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{m.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{m.origin}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{m.supplier}</TableCell>
                      <TableCell className="text-center font-mono text-sm">{fmtUsd(m.fob)}</TableCell>
                      <TableCell className="text-center font-mono text-sm">{fmt(m.freight)}</TableCell>
                      <TableCell className="text-center font-mono text-sm">{fmt(m.insurance)}</TableCell>
                      <TableCell className="text-center font-mono text-sm">{fmt(m.customs)}</TableCell>
                      <TableCell className="text-center font-mono text-sm">{fmt(m.portFees)}</TableCell>
                      <TableCell className="text-center font-bold text-cyan-400">{fmt(m.totalLanded)}</TableCell>
                      <TableCell className="text-center font-mono text-sm">{m.perMeter > 0 ? fmt(m.perMeter) : "—"}</TableCell>
                      <TableCell className="text-center font-mono text-sm">{fmt(m.perKg)}</TableCell>
                      <TableCell className="text-center text-sm">{m.exchangeRate.toFixed(2)}</TableCell>
                      <TableCell className="text-center text-xs text-muted-foreground">{m.date}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2: Comparison — Import vs Local */}
        <TabsContent value="compare" className="space-y-4 mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-amber-400" /> השוואה: יבוא מול ספק מקומי
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {materials.map((m, i) => {
                const saving = m.localPrice - m.totalLanded;
                const savePct = (saving / m.localPrice) * 100;
                const importCheaper = saving > 0;
                return (
                  <div key={i} className="flex items-center gap-4 p-3 rounded-lg bg-muted/20 border border-border/50">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{m.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{m.supplier} ({m.origin})</div>
                    </div>
                    <div className="text-center w-24">
                      <div className="text-xs text-muted-foreground">יבוא</div>
                      <div className="font-bold text-cyan-400 text-sm">{fmt(m.totalLanded)}</div>
                    </div>
                    <div className="text-center w-24">
                      <div className="text-xs text-muted-foreground">מקומי</div>
                      <div className="font-bold text-amber-400 text-sm">{fmt(m.localPrice)}</div>
                    </div>
                    <div className="w-32">
                      <Progress value={savePct} className="h-2" />
                    </div>
                    <div className="w-28 text-left">
                      <Badge className={importCheaper
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                        : "bg-red-500/20 text-red-400 border-red-500/30"
                      }>
                        {importCheaper ? <CheckCircle2 className="w-3 h-3 ml-1" /> : <AlertTriangle className="w-3 h-3 ml-1" />}
                        {importCheaper ? "יבוא זול ב-" : "מקומי זול ב-"}{pct(Math.abs(savePct))}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Summary box */}
          <Card className="bg-gradient-to-br from-emerald-600/20 to-emerald-900/10 border-emerald-500/30">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold">סיכום השוואה לפרויקט</span>
              </div>
              <div className="grid grid-cols-3 gap-6 text-center">
                <div>
                  <div className="text-sm text-muted-foreground">סה"כ עלות יבוא</div>
                  <div className="text-xl font-bold text-cyan-400">{fmt(totalImport)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">סה"כ עלות מקומית</div>
                  <div className="text-xl font-bold text-amber-400">{fmt(totalLocal)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">חיסכון מיבוא</div>
                  <div className="text-xl font-bold text-emerald-400">{fmt(totalSavings)} ({pct((totalSavings / totalLocal) * 100)})</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Exchange Rate Simulation */}
        <TabsContent value="exchange" className="space-y-4 mt-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-violet-400" /> סימולציית שער חליפין — השפעה על Landed Cost
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">תרחיש</TableHead>
                    <TableHead className="text-center">שער $/₪</TableHead>
                    <TableHead className="text-center">שינוי %</TableHead>
                    <TableHead className="text-center">סה"כ Landed Cost</TableHead>
                    <TableHead className="text-center">הפרש מבסיס</TableHead>
                    <TableHead className="text-center">חיסכון מול מקומי</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exchangeScenarios.map((s, i) => {
                    const factor = s.rate / 3.64;
                    const adjTotal = Math.round(totalImport * factor);
                    const diff = adjTotal - totalImport;
                    const savVsLocal = totalLocal - adjTotal;
                    const stillCheaper = savVsLocal > 0;
                    return (
                      <TableRow key={i} className={s.delta === 0 ? "bg-muted/20" : "hover:bg-muted/30"}>
                        <TableCell className="font-medium">{s.label}</TableCell>
                        <TableCell className="text-center font-mono">{s.rate.toFixed(2)}</TableCell>
                        <TableCell className="text-center">
                          {s.delta === 0
                            ? <Badge variant="outline">בסיס</Badge>
                            : <span className={s.delta > 0 ? "text-red-400" : "text-emerald-400"}>
                                {s.delta > 0 ? "+" : ""}{pct(s.delta)}
                              </span>
                          }
                        </TableCell>
                        <TableCell className="text-center font-bold">{fmt(adjTotal)}</TableCell>
                        <TableCell className="text-center">
                          {diff === 0 ? "—" : (
                            <span className={diff > 0 ? "text-red-400" : "text-emerald-400"}>
                              {diff > 0 ? "+" : ""}{fmt(diff)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          <span className={stillCheaper ? "text-emerald-400" : "text-red-400"}>
                            {stillCheaper ? fmt(savVsLocal) : fmt(savVsLocal)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          {stillCheaper
                            ? <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 ml-1" />יבוא עדיף</Badge>
                            : <Badge className="bg-red-500/20 text-red-400 border-red-500/30"><AlertTriangle className="w-3 h-3 ml-1" />מקומי עדיף</Badge>
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Insight card */}
          <Card className="bg-gradient-to-br from-violet-600/20 to-violet-900/10 border-violet-500/30">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <TrendingUp className="w-5 h-5 text-violet-400" />
                <span className="font-semibold">תובנה</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                בשער הנוכחי ($1 = ₪3.64) יבוא חומרים חוסך <span className="text-emerald-400 font-bold">{fmt(totalSavings)}</span> לפרויקט.
                גם בתרחיש שער קיצוני ($1 = ₪4.05) היבוא עדיין משתלם — נקודת האיזון מוערכת בשער של כ-₪4.35 לדולר.
                מומלץ לבצע גידור מט"ח (forward) עבור רכישות מעל $10,000.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
