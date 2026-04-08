import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Users, ShieldCheck, AlertTriangle, CheckCircle2, Clock, TrendingUp,
  Star, Zap, Package, Truck, Award, BarChart3, ArrowDown, Crown,
} from "lucide-react";

const fmt = (v: number) => "₪" + v.toLocaleString("he-IL");

type Supplier = {
  name: string; price: number; leadDays: number; quality: number;
  risk: number; availability: number;
  rank: "cheapest" | "fastest" | "best_value" | "risky_but_cheap" | null;
};

type Material = {
  id: string; name: string; unit: string; qty: number;
  suppliers: Supplier[];
  recommended: string;
};

const FALLBACK_PROJECTS = [
  { id: "PRJ-1052", name: "שער כניסה Premium כפול", client: "אחוזת הגולן" },
  { id: "PRJ-1058", name: "מעקה בטיחות נירוסטה", client: "קבוצת עזריאלי" },
  { id: "PRJ-1063", name: "מבנה פלדה תעשייתי", client: "שופרסל לוגיסטיקה" },
];

const FALLBACK_MATERIALS: Material[] = [
  {
    id: "MAT-01", name: "פלדה מגולוונת 3 מ\"מ", unit: 'ק"ג', qty: 850,
    suppliers: [
      { name: "מתכות השרון", price: 18.5, leadDays: 7, quality: 92, risk: 12, availability: 95, rank: "best_value" },
      { name: "ברזל עוזי", price: 16.2, leadDays: 14, quality: 85, risk: 25, availability: 88, rank: "risky_but_cheap" },
      { name: "סטיל פרו", price: 19.8, leadDays: 5, quality: 96, risk: 8, availability: 98, rank: "fastest" },
    ],
    recommended: "מתכות השרון",
  },
  {
    id: "MAT-02", name: "מנוע חשמלי 1.5HP", unit: "יחידה", qty: 2,
    suppliers: [
      { name: "אלקטרו מוטורס", price: 2850, leadDays: 10, quality: 94, risk: 10, availability: 90, rank: "best_value" },
      { name: "מוטורים בע\"מ", price: 2400, leadDays: 21, quality: 82, risk: 30, availability: 75, rank: "cheapest" },
      { name: "PowerDrive IL", price: 3200, leadDays: 5, quality: 98, risk: 5, availability: 99, rank: "fastest" },
    ],
    recommended: "אלקטרו מוטורס",
  },
  {
    id: "MAT-03", name: "בקר אלקטרוני PLC", unit: "יחידה", qty: 1,
    suppliers: [
      { name: "אוטומציה פלוס", price: 4200, leadDays: 12, quality: 96, risk: 8, availability: 92, rank: "best_value" },
      { name: "טק-קונטרול", price: 3800, leadDays: 18, quality: 88, risk: 22, availability: 80, rank: "risky_but_cheap" },
    ],
    recommended: "אוטומציה פלוס",
  },
  {
    id: "MAT-04", name: "צבע אלקטרוסטטי RAL7016", unit: "ליטר", qty: 45,
    suppliers: [
      { name: "צבעי טמבור", price: 85, leadDays: 3, quality: 95, risk: 5, availability: 99, rank: "fastest" },
      { name: "קולורטק", price: 72, leadDays: 7, quality: 90, risk: 12, availability: 94, rank: "cheapest" },
      { name: "פיינט פרו", price: 78, leadDays: 5, quality: 93, risk: 8, availability: 97, rank: "best_value" },
    ],
    recommended: "פיינט פרו",
  },
  {
    id: "MAT-05", name: "בולוני חיבור נירוסטה M12", unit: "יחידה", qty: 120,
    suppliers: [
      { name: "ברגים בע\"מ", price: 3.8, leadDays: 3, quality: 94, risk: 6, availability: 99, rank: "best_value" },
      { name: "פיקס-אול", price: 3.2, leadDays: 5, quality: 88, risk: 15, availability: 92, rank: "cheapest" },
    ],
    recommended: "ברגים בע\"מ",
  },
];

const rankLabel: Record<string, { text: string; color: string; icon: typeof Star }> = {
  cheapest: { text: "הכי זול", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", icon: ArrowDown },
  fastest: { text: "הכי מהיר", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Zap },
  best_value: { text: "ערך מיטבי", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: Crown },
  risky_but_cheap: { text: "זול אך מסוכן", color: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertTriangle },
};

const calcTotal = (strat: "cheapest" | "best_value" | "fastest") =>
  FALLBACK_MATERIALS.reduce((sum, m) => {
    const pick = strat === "cheapest"
      ? [...m.suppliers].sort((a, b) => a.price - b.price)[0]
      : strat === "fastest"
        ? [...m.suppliers].sort((a, b) => a.leadDays - b.leadDays)[0]
        : m.suppliers.find(s => s.name === m.recommended) || m.suppliers[0];
    return sum + pick.price * m.qty;
  }, 0);

const calcLead = (strat: "cheapest" | "best_value" | "fastest") =>
  FALLBACK_MATERIALS.reduce((mx, m) => {
    const pick = strat === "cheapest"
      ? [...m.suppliers].sort((a, b) => a.price - b.price)[0]
      : strat === "fastest"
        ? [...m.suppliers].sort((a, b) => a.leadDays - b.leadDays)[0]
        : m.suppliers.find(s => s.name === m.recommended) || m.suppliers[0];
    return Math.max(mx, pick.leadDays);
  }, 0);

const calcAvgQuality = (strat: "cheapest" | "best_value" | "fastest") => {
  const vals = FALLBACK_MATERIALS.map(m => {
    const pick = strat === "cheapest"
      ? [...m.suppliers].sort((a, b) => a.price - b.price)[0]
      : strat === "fastest"
        ? [...m.suppliers].sort((a, b) => a.leadDays - b.leadDays)[0]
        : m.suppliers.find(s => s.name === m.recommended) || m.suppliers[0];
    return pick.quality;
  });
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
};

const scenarios: { key: "cheapest" | "best_value" | "fastest"; label: string; icon: typeof Star; desc: string }[] = [
  { key: "cheapest", label: "הכי זול", icon: ArrowDown, desc: "בחירת הספק הזול ביותר לכל חומר" },
  { key: "best_value", label: "ערך מיטבי (מומלץ)", icon: Crown, desc: "איזון בין מחיר, איכות וזמן אספקה" },
  { key: "fastest", label: "הכי מהיר", icon: Zap, desc: "בחירת הספק עם זמן אספקה קצר ביותר" },
];

export default function SupplierComparisonProject() {

  const { data: apiData } = useQuery({
    queryKey: ["supplier_comparison_project"],
    queryFn: () => authFetch("/api/pricing/supplier-comparison-project").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const projects = apiData?.projects ?? FALLBACK_PROJECTS;
  const materials = apiData?.materials ?? FALLBACK_MATERIALS;
  const [tab, setTab] = useState("comparison");
  const [selProject] = useState(projects[0]);

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">השוואת ספקים לפרויקט</h1>
            <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניתוח ספקים וחומרים</p>
          </div>
        </div>
        <Badge className="bg-violet-500/20 text-violet-400 border-violet-500/30 text-sm px-3 py-1">
          <Package className="w-3.5 h-3.5 ml-1.5" /> {selProject.id}
        </Badge>
      </div>

      {/* Project selector */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-8 h-8 rounded bg-indigo-500/20 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <p className="font-semibold">{selProject.name}</p>
              <p className="text-xs text-muted-foreground">לקוח: {selProject.client} &bull; {materials.length} חומרים ב-BOM &bull; {materials.reduce((s, m) => s + m.suppliers.length, 0)} הצעות ספקים</p>
            </div>
            <div className="mr-auto flex gap-2">
              {projects.map(p => (
                <Badge key={p.id} variant={p.id === selProject.id ? "default" : "outline"} className="cursor-pointer text-xs">{p.id}</Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="comparison">השוואה</TabsTrigger>
          <TabsTrigger value="recommendation">המלצה</TabsTrigger>
          <TabsTrigger value="total_cost">עלות כוללת</TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Comparison Matrix ── */}
        <TabsContent value="comparison" className="space-y-4 mt-4">
          {materials.map(mat => (
            <Card key={mat.id} className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-400" />
                  {mat.name}
                  <span className="text-xs text-muted-foreground font-normal">({mat.qty} {mat.unit})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead className="text-right">ספק</TableHead>
                      <TableHead className="text-right">מחיר ליחידה</TableHead>
                      <TableHead className="text-right">סה"כ</TableHead>
                      <TableHead className="text-right">אספקה (ימים)</TableHead>
                      <TableHead className="text-right">איכות</TableHead>
                      <TableHead className="text-right">סיכון</TableHead>
                      <TableHead className="text-right">זמינות</TableHead>
                      <TableHead className="text-right">דירוג</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mat.suppliers.map(s => {
                      const isBest = s.name === mat.recommended;
                      return (
                        <TableRow key={s.name} className={isBest ? "bg-emerald-500/5 border-border" : "border-border"}>
                          <TableCell className="font-medium">
                            {s.name}
                            {isBest && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 inline mr-1.5" />}
                          </TableCell>
                          <TableCell>{fmt(s.price)}</TableCell>
                          <TableCell className={isBest ? "text-emerald-400 font-semibold" : ""}>{fmt(s.price * mat.qty)}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                              {s.leadDays}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <Progress value={s.quality} className="h-2 flex-1" />
                              <span className={`text-xs ${s.quality >= 90 ? "text-emerald-400" : s.quality >= 80 ? "text-amber-400" : "text-red-400"}`}>{s.quality}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={s.risk <= 10 ? "border-emerald-500/40 text-emerald-400" : s.risk <= 20 ? "border-amber-500/40 text-amber-400" : "border-red-500/40 text-red-400"}>
                              {s.risk}%
                            </Badge>
                          </TableCell>
                          <TableCell>{s.availability}%</TableCell>
                          <TableCell>
                            {s.rank && (() => {
                              const r = rankLabel[s.rank];
                              const Icon = r.icon;
                              return <Badge className={`${r.color} text-xs`}><Icon className="w-3 h-3 ml-1" />{r.text}</Badge>;
                            })()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── Tab 2: Recommendation ── */}
        <TabsContent value="recommendation" className="space-y-4 mt-4">
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="w-5 h-5 text-emerald-400" />
                אסטרטגיית מקורות מומלצת לפרויקט
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-right">חומר</TableHead>
                    <TableHead className="text-right">ספק מומלץ</TableHead>
                    <TableHead className="text-right">מחיר ליחידה</TableHead>
                    <TableHead className="text-right">סה"כ</TableHead>
                    <TableHead className="text-right">אספקה</TableHead>
                    <TableHead className="text-right">איכות</TableHead>
                    <TableHead className="text-right">נימוק</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map(mat => {
                    const s = mat.suppliers.find(x => x.name === mat.recommended)!;
                    const cheapest = [...mat.suppliers].sort((a, b) => a.price - b.price)[0];
                    const saving = s.price === cheapest.price ? null : ((s.price - cheapest.price) / cheapest.price * 100).toFixed(1);
                    return (
                      <TableRow key={mat.id} className="border-border">
                        <TableCell className="font-medium">{mat.name}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            {s.name}
                          </span>
                        </TableCell>
                        <TableCell>{fmt(s.price)}</TableCell>
                        <TableCell className="text-emerald-400 font-semibold">{fmt(s.price * mat.qty)}</TableCell>
                        <TableCell>{s.leadDays} ימים</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={s.quality} className="h-2 w-16" />
                            <span className="text-xs text-emerald-400">{s.quality}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px]">
                          {s.rank === "best_value" && "איזון אופטימלי בין מחיר, איכות ואמינות"}
                          {s.rank === "fastest" && "זמן אספקה קצר — מומלץ לדד-ליין הדוק"}
                          {s.rank === "cheapest" && "הצעת המחיר הנמוכה ביותר"}
                          {saving && <span className="text-amber-400 block">+{saving}% מהזול ביותר</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Totals summary for recommended */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-gradient-to-br from-emerald-600/20 to-emerald-900/10 border-emerald-500/30">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">עלות כוללת (מומלץ)</p>
                <p className="text-2xl font-bold text-emerald-400">{fmt(calcTotal("best_value"))}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-600/20 to-amber-900/10 border-amber-500/30">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">זמן אספקה מקסימלי</p>
                <p className="text-2xl font-bold text-amber-400">{calcLead("best_value")} ימים</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-600/20 to-blue-900/10 border-blue-500/30">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">ציון איכות ממוצע</p>
                <p className="text-2xl font-bold text-blue-400">{calcAvgQuality("best_value")}/100</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab 3: Total Cost per Scenario ── */}
        <TabsContent value="total_cost" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {scenarios.map(sc => {
              const total = calcTotal(sc.key);
              const lead = calcLead(sc.key);
              const qual = calcAvgQuality(sc.key);
              const Icon = sc.icon;
              const isBest = sc.key === "best_value";
              return (
                <Card key={sc.key} className={`border ${isBest ? "border-emerald-500/40 bg-emerald-500/5" : "bg-card border-border"}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Icon className={`w-5 h-5 ${isBest ? "text-emerald-400" : "text-muted-foreground"}`} />
                      {sc.label}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{sc.desc}</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-muted-foreground">עלות כוללת</span>
                      <span className={`text-xl font-bold ${isBest ? "text-emerald-400" : ""}`}>{fmt(total)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">אספקה מקסימלית</span>
                      <Badge variant="outline" className="text-xs">{lead} ימים</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">ציון איכות ממוצע</span>
                      <span className="text-sm">{qual}/100</span>
                    </div>
                    <Progress value={qual} className="h-2" />
                    {isBest && (
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 w-full justify-center mt-1">
                        <Star className="w-3.5 h-3.5 ml-1" /> תרחיש מומלץ
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Detailed breakdown per scenario */}
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                פירוט חומרים לפי תרחיש
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-right">חומר</TableHead>
                    {scenarios.map(sc => (
                      <TableHead key={sc.key} className="text-right">{sc.label}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {materials.map(mat => (
                    <TableRow key={mat.id} className="border-border">
                      <TableCell className="font-medium text-sm">{mat.name}</TableCell>
                      {scenarios.map(sc => {
                        const pick = sc.key === "cheapest"
                          ? [...mat.suppliers].sort((a, b) => a.price - b.price)[0]
                          : sc.key === "fastest"
                            ? [...mat.suppliers].sort((a, b) => a.leadDays - b.leadDays)[0]
                            : mat.suppliers.find(s => s.name === mat.recommended) || mat.suppliers[0];
                        const isBest = sc.key === "best_value";
                        return (
                          <TableCell key={sc.key}>
                            <div className={isBest ? "text-emerald-400" : ""}>
                              <span className="font-semibold text-sm">{fmt(pick.price * mat.qty)}</span>
                              <span className="block text-xs text-muted-foreground">{pick.name} &bull; {pick.leadDays}d &bull; Q{pick.quality}</span>
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  <TableRow className="border-border bg-muted/30 font-bold">
                    <TableCell>סה"כ פרויקט</TableCell>
                    {scenarios.map(sc => (
                      <TableCell key={sc.key} className={sc.key === "best_value" ? "text-emerald-400" : ""}>
                        {fmt(calcTotal(sc.key))}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Delta comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-2">הפרש מומלץ מול הזול ביותר</p>
                <p className="text-xl font-bold text-amber-400">+{fmt(calcTotal("best_value") - calcTotal("cheapest"))}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  תוספת של {((calcTotal("best_value") - calcTotal("cheapest")) / calcTotal("cheapest") * 100).toFixed(1)}% — עבור איכות ואמינות גבוהות יותר
                </p>
              </CardContent>
            </Card>
            <Card className="bg-card border-border">
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-2">הפרש מהיר מול מומלץ</p>
                <p className="text-xl font-bold text-blue-400">+{fmt(calcTotal("fastest") - calcTotal("best_value"))}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  חיסכון של {calcLead("best_value") - calcLead("fastest")} ימי אספקה בעלות נוספת של {((calcTotal("fastest") - calcTotal("best_value")) / calcTotal("best_value") * 100).toFixed(1)}%
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
