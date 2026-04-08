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
  Hammer, Wrench, Settings, AlertTriangle, PackagePlus, DollarSign,
  Search, Download, Plus, Eye, Clock, Gauge, ShoppingCart,
  CalendarDays, ArrowUpCircle, CircleDot, Drill, Cog
} from "lucide-react";

const FALLBACK_TOOLS = [
  { id: "TL-001", name: "תבנית חיתוך פרופיל 40x40", type: "תבנית חיתוך", condition: "תקין", cycles: 12400, maxCycles: 20000, location: "אולם A - מסור 600", lastService: "2026-02-10", cost: 8500 },
  { id: "TL-002", name: "תבנית חיתוך פרופיל 60x60", type: "תבנית חיתוך", condition: "טעון השחזה", cycles: 17200, maxCycles: 20000, location: "אולם A - מסור 400", lastService: "2025-12-15", cost: 9200 },
  { id: "TL-003", name: "כלי כרסום קרביד D12", type: "כלי כרסום", condition: "תקין", cycles: 3200, maxCycles: 8000, location: "אולם A - מרכז עיבוד DMG", lastService: "2026-03-20", cost: 2800 },
  { id: "TL-004", name: "כלי כרסום קרביד D20", type: "כלי כרסום", condition: "תקין", cycles: 5100, maxCycles: 8000, location: "אולם A - מרכז עיבוד DMG", lastService: "2026-01-18", cost: 3400 },
  { id: "TL-005", name: "מקדח HSS 8 מ\"מ (סט 10)", type: "מקדחים", condition: "תקין", cycles: 1800, maxCycles: 5000, location: "מחסן כלים", lastService: "2026-03-01", cost: 1200 },
  { id: "TL-006", name: "מקדח HSS 12 מ\"מ (סט 10)", type: "מקדחים", condition: "בשימוש", cycles: 3600, maxCycles: 5000, location: "אולם D - הרכבה", lastService: "2026-02-20", cost: 1500 },
  { id: "TL-007", name: "ג'יג ריתוך מסגרת 1200x800", type: "ג'יג", condition: "תקין", cycles: 8500, maxCycles: 15000, location: "אולם A - ריתוך", lastService: "2026-01-05", cost: 12000 },
  { id: "TL-008", name: "ג'יג ריתוך פינות 90°", type: "ג'יג", condition: "בתיקון", cycles: 11200, maxCycles: 15000, location: "מחסן כלים", lastService: "2026-03-28", cost: 6500 },
  { id: "TL-009", name: "פיקסצ'ר חיתוך זכוכית 2000mm", type: "פיקסצ'ר", condition: "תקין", cycles: 4200, maxCycles: 10000, location: "אולם C - זכוכית", lastService: "2026-03-10", cost: 15000 },
  { id: "TL-010", name: "פיקסצ'ר הרכבה מודולרי", type: "פיקסצ'ר", condition: "בשימוש", cycles: 6800, maxCycles: 12000, location: "אולם D - הרכבה", lastService: "2026-02-28", cost: 9500 },
  { id: "TL-011", name: "להב חיתוך יהלום זכוכית", type: "להב חיתוך", condition: "טעון החלפה", cycles: 4800, maxCycles: 5000, location: "אולם C - שולחן CNC", lastService: "2025-11-20", cost: 4200 },
  { id: "TL-012", name: "סט תבניות כיפוף V-Die", type: "תבנית כיפוף", condition: "תקין", cycles: 9300, maxCycles: 25000, location: "אולם A - מכונת כיפוף", lastService: "2026-03-15", cost: 18000 },
];

const FALLBACK_MAINTENANCE_SCHEDULE = [
  { tool: "תבנית חיתוך פרופיל 60x60", action: "השחזה", dueDate: "2026-04-12", priority: "גבוה", estimatedCost: 850, tech: "אברהם סדן" },
  { tool: "להב חיתוך יהלום זכוכית", action: "החלפה", dueDate: "2026-04-10", priority: "דחוף", estimatedCost: 4200, tech: "הזמנה מספק" },
  { tool: "ג'יג ריתוך פינות 90°", action: "תיקון + כיול", dueDate: "2026-04-15", priority: "גבוה", estimatedCost: 1200, tech: "אברהם סדן" },
  { tool: "כלי כרסום קרביד D20", action: "השחזה", dueDate: "2026-04-20", priority: "בינוני", estimatedCost: 450, tech: "אברהם סדן" },
  { tool: "מקדח HSS 12 מ\"מ", action: "השחזה", dueDate: "2026-04-25", priority: "בינוני", estimatedCost: 200, tech: "פנימי" },
  { tool: "פיקסצ'ר הרכבה מודולרי", action: "כיול ובדיקה", dueDate: "2026-05-01", priority: "נמוך", estimatedCost: 350, tech: "פנימי" },
];

const FALLBACK_CONSUMPTION_DATA = [
  { month: "ינואר", cutting: 12, milling: 8, drill: 15, blades: 3, total: 38, cost: 18500 },
  { month: "פברואר", cutting: 10, milling: 6, drill: 12, blades: 2, total: 30, cost: 14200 },
  { month: "מרץ", cutting: 14, milling: 10, drill: 18, blades: 4, total: 46, cost: 22800 },
  { month: "אפריל (חזוי)", cutting: 11, milling: 7, drill: 14, blades: 3, total: 35, cost: 17000 },
];

const FALLBACK_ORDER_NEEDED = [
  { tool: "להב חיתוך יהלום זכוכית", qty: 3, unitCost: 4200, supplier: "גלובל דיימונד", leadTime: "5 ימים", urgency: "דחוף" },
  { tool: "מקדח HSS 8 מ\"מ (סט 10)", qty: 2, unitCost: 1200, supplier: "כלי חיתוך בע\"מ", leadTime: "3 ימים", urgency: "רגיל" },
  { tool: "מקדח HSS 12 מ\"מ (סט 10)", qty: 2, unitCost: 1500, supplier: "כלי חיתוך בע\"מ", leadTime: "3 ימים", urgency: "רגיל" },
  { tool: "כלי כרסום קרביד D12", qty: 4, unitCost: 2800, supplier: "סנדוויק ישראל", leadTime: "7 ימים", urgency: "בינוני" },
  { tool: "כלי כרסום קרביד D20", qty: 3, unitCost: 3400, supplier: "סנדוויק ישראל", leadTime: "7 ימים", urgency: "בינוני" },
];

const conditionColor: Record<string, string> = {
  "תקין": "bg-emerald-500/20 text-emerald-300",
  "בשימוש": "bg-blue-500/20 text-blue-300",
  "טעון השחזה": "bg-amber-500/20 text-amber-300",
  "בתיקון": "bg-orange-500/20 text-orange-300",
  "טעון החלפה": "bg-red-500/20 text-red-300",
};

const priorityColor: Record<string, string> = {
  "דחוף": "bg-red-500/20 text-red-300",
  "גבוה": "bg-orange-500/20 text-orange-300",
  "בינוני": "bg-amber-500/20 text-amber-300",
  "נמוך": "bg-blue-500/20 text-blue-300",
  "רגיל": "bg-blue-500/20 text-blue-300",
};

export default function ToolsDies() {
  const { data: toolsdiesData } = useQuery({
    queryKey: ["tools-dies"],
    queryFn: () => authFetch("/api/assets/tools_dies"),
    staleTime: 5 * 60 * 1000,
  });

  const tools = toolsdiesData ?? FALLBACK_TOOLS;

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("registry");

  const inUse = tools.filter(t => t.condition === "בשימוש").length;
  const inMaintenance = tools.filter(t => t.condition === "בתיקון" || t.condition === "טעון השחזה" || t.condition === "טעון החלפה").length;
  const avgLifeRemaining = Math.round(tools.reduce((s, t) => s + ((t.maxCycles - t.cycles) / t.maxCycles) * 100, 0) / tools.length);
  const newThisMonth = 0;
  const replacementCost = tools.reduce((s, t) => s + t.cost, 0);

  const filteredTools = tools.filter(t =>
    t.name.includes(search) || t.type.includes(search) || t.location.includes(search) || t.id.includes(search)
  );

  const kpis = [
    { label: "סה\"כ כלים", value: tools.length, icon: Hammer, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "בשימוש", value: inUse, icon: Cog, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "בתחזוקה/החלפה", value: inMaintenance, icon: Wrench, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "חיי כלי נותרים", value: `${avgLifeRemaining}%`, icon: Gauge, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "כלים חדשים החודש", value: newThisMonth, icon: PackagePlus, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "עלות החלפה כוללת", value: `${(replacementCost / 1000).toFixed(0)}K ₪`, icon: DollarSign, color: "text-red-400", bg: "bg-red-500/10" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Hammer className="w-7 h-7 text-blue-400" />
            ניהול כלים ותבניות - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">כלי חיתוך, תבניות, מקדחים, ג'יגים ופיקסצ'רים - מעקב מצב, תחזוקה והזמנות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button size="sm" className="bg-primary"><Plus className="w-4 h-4 ml-1" />כלי חדש</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
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
          <TabsTrigger value="registry">מרשם כלים</TabsTrigger>
          <TabsTrigger value="maintenance">תחזוקה</TabsTrigger>
          <TabsTrigger value="consumption">צריכה</TabsTrigger>
          <TabsTrigger value="ordering">הזמנות</TabsTrigger>
        </TabsList>

        {/* Tab 1: Tools Registry */}
        <TabsContent value="registry" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">מרשם כלים ותבניות ({tools.length})</CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש כלי..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">מזהה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">שם הכלי</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סוג</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מצב</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מחזורים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חיים נותרים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מיקום</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עלות ₪</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTools.map(t => {
                      const lifeRemaining = Math.round(((t.maxCycles - t.cycles) / t.maxCycles) * 100);
                      return (
                        <tr key={t.id} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                          <td className="p-3 text-foreground font-mono text-xs">{t.id}</td>
                          <td className="p-3 text-foreground font-medium">{t.name}</td>
                          <td className="p-3 text-muted-foreground">{t.type}</td>
                          <td className="p-3"><Badge className={conditionColor[t.condition] || "bg-gray-500/20 text-gray-300"}>{t.condition}</Badge></td>
                          <td className="p-3 text-foreground">{t.cycles.toLocaleString()} / {t.maxCycles.toLocaleString()}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <Progress value={lifeRemaining} className="h-2 w-16" />
                              <span className={`text-xs font-bold ${lifeRemaining >= 50 ? "text-emerald-400" : lifeRemaining >= 20 ? "text-amber-400" : "text-red-400"}`}>{lifeRemaining}%</span>
                            </div>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">{t.location}</td>
                          <td className="p-3 text-foreground">{t.cost.toLocaleString()}</td>
                          <td className="p-3 text-center">
                            <Button variant="ghost" size="sm"><Eye className="w-3.5 h-3.5" /></Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* By type summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {["תבנית חיתוך", "כלי כרסום", "מקדחים", "ג'יג", "פיקסצ'ר", "להב חיתוך"].map(type => {
              const typeTools = tools.filter(t => t.type === type);
              return (
                <Card key={type} className="bg-card/50 border-border/50">
                  <CardContent className="p-3 text-center">
                    <p className="text-xs text-muted-foreground">{type}</p>
                    <p className="text-lg font-bold text-foreground mt-1">{typeTools.length}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 2: Maintenance */}
        <TabsContent value="maintenance" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-400" />
                לוח השחזות / החלפות / תיקונים
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">כלי</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פעולה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">תאריך יעד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עדיפות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עלות משוערת ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">טכנאי / ספק</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maintenanceSchedule.map((m, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 text-foreground font-medium">{m.tool}</td>
                        <td className="p-3 text-foreground">{m.action}</td>
                        <td className="p-3 text-muted-foreground flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />{m.dueDate}
                        </td>
                        <td className="p-3"><Badge className={priorityColor[m.priority] || "bg-gray-500/20 text-gray-300"}>{m.priority}</Badge></td>
                        <td className="p-3 text-foreground">{m.estimatedCost.toLocaleString()}</td>
                        <td className="p-3 text-muted-foreground">{m.tech}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <p className="text-sm text-amber-300">
                  עלות תחזוקה משוערת קרובה: {maintenanceSchedule.reduce((s, m) => s + m.estimatedCost, 0).toLocaleString()} ₪
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">כלים הדורשים תשומת לב מיידית</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {tools.filter(t => t.condition === "טעון החלפה" || t.condition === "טעון השחזה" || t.condition === "בתיקון").map(t => {
                  const lifeRemaining = Math.round(((t.maxCycles - t.cycles) / t.maxCycles) * 100);
                  return (
                    <div key={t.id} className="flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                      <div>
                        <p className="text-sm font-medium text-foreground">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.type} | {t.location}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={conditionColor[t.condition]}>{t.condition}</Badge>
                        <span className="text-xs text-red-400">{lifeRemaining}% חיים נותרים</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Consumption */}
        <TabsContent value="consumption" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CircleDot className="w-5 h-5 text-purple-400" />
                מעקב צריכת כלים חודשית
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">חודש</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">חיתוך</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">כרסום</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">קידוח</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">להבים</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סה"כ</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">עלות ₪</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consumptionData.map(c => (
                      <tr key={c.month} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 text-foreground font-medium">{c.month}</td>
                        <td className="p-3 text-foreground">{c.cutting}</td>
                        <td className="p-3 text-foreground">{c.milling}</td>
                        <td className="p-3 text-foreground">{c.drill}</td>
                        <td className="p-3 text-foreground">{c.blades}</td>
                        <td className="p-3 text-foreground font-bold">{c.total}</td>
                        <td className="p-3 text-foreground">{c.cost.toLocaleString()}</td>
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
                <CardTitle className="text-lg">סיכום רבעוני</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-background/30">
                    <span className="text-sm text-muted-foreground">סה"כ כלים שנצרכו</span>
                    <span className="text-lg font-bold text-foreground">{consumptionData.reduce((s, c) => s + c.total, 0)}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-background/30">
                    <span className="text-sm text-muted-foreground">עלות רבעונית</span>
                    <span className="text-lg font-bold text-orange-400">{consumptionData.reduce((s, c) => s + c.cost, 0).toLocaleString()} ₪</span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-background/30">
                    <span className="text-sm text-muted-foreground">ממוצע חודשי</span>
                    <span className="text-lg font-bold text-blue-400">{Math.round(consumptionData.reduce((s, c) => s + c.cost, 0) / consumptionData.length).toLocaleString()} ₪</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-lg">צריכה לפי סוג</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: "כלי חיתוך", total: consumptionData.reduce((s, c) => s + c.cutting, 0) },
                    { label: "כלי כרסום", total: consumptionData.reduce((s, c) => s + c.milling, 0) },
                    { label: "מקדחים", total: consumptionData.reduce((s, c) => s + c.drill, 0) },
                    { label: "להבים", total: consumptionData.reduce((s, c) => s + c.blades, 0) },
                  ].map(item => {
                    const allTotal = consumptionData.reduce((s, c) => s + c.total, 0);
                    const pct = Math.round((item.total / allTotal) * 100);
                    return (
                      <div key={item.label} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-foreground">{item.label}</span>
                          <span className="text-muted-foreground">{item.total} ({pct}%)</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab 4: Ordering */}
        <TabsContent value="ordering" className="space-y-4">
          <Card className="bg-card/50 border-border/50 border-red-500/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-red-400" />
                כלים הדורשים הזמנה / החלפה ({orderNeeded.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">כלי</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">כמות</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">מחיר יח' ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">סה"כ ₪</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">ספק</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">זמן אספקה</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">דחיפות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderNeeded.map((o, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30">
                        <td className="p-3 text-foreground font-medium">{o.tool}</td>
                        <td className="p-3 text-foreground">{o.qty}</td>
                        <td className="p-3 text-foreground">{o.unitCost.toLocaleString()}</td>
                        <td className="p-3 text-foreground font-bold">{(o.qty * o.unitCost).toLocaleString()}</td>
                        <td className="p-3 text-muted-foreground">{o.supplier}</td>
                        <td className="p-3 text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />{o.leadTime}
                        </td>
                        <td className="p-3"><Badge className={priorityColor[o.urgency] || "bg-gray-500/20 text-gray-300"}>{o.urgency}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                <p className="text-sm text-red-300 font-medium">
                  סה"כ עלות הזמנה: {orderNeeded.reduce((s, o) => s + o.qty * o.unitCost, 0).toLocaleString()} ₪
                </p>
                <Button size="sm" className="bg-primary">
                  <ShoppingCart className="w-4 h-4 ml-1" />
                  שלח הזמנה
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">ספקים מועדפים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: "סנדוויק ישראל", category: "כרסום + חיתוך", rating: 95, orders: 12 },
                  { name: "כלי חיתוך בע\"מ", category: "מקדחים + כלי יד", rating: 88, orders: 18 },
                  { name: "גלובל דיימונד", category: "להבי יהלום", rating: 92, orders: 6 },
                ].map(s => (
                  <div key={s.name} className="flex items-center justify-between p-3 rounded-lg bg-background/30 border border-border/30">
                    <div>
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.category} | {s.orders} הזמנות השנה</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">דירוג:</span>
                      <span className={`text-sm font-bold ${s.rating >= 90 ? "text-emerald-400" : "text-amber-400"}`}>{s.rating}%</span>
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
