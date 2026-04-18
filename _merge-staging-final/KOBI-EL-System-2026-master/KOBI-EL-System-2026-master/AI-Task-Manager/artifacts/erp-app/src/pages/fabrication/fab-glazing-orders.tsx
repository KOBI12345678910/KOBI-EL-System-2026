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
  Search, Package, Layers, ShieldCheck, Scissors, AlertTriangle,
  CheckCircle2, Clock, ThermometerSun, Droplets, Eye, BarChart3
} from "lucide-react";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30" },
  cutting: { label: "חיתוך", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
  glazing: { label: "בזיגוג", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
  sealing: { label: "איטום", color: "bg-orange-500/20 text-orange-300 border-orange-500/30" },
  qc: { label: "בדיקת איכות", color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30" },
  done: { label: "הושלם", color: "bg-green-500/20 text-green-300 border-green-500/30" },
};

const GLASS_TYPES: Record<string, string> = {
  float: "שטוח (Float)",
  tempered: "מחוסם",
  laminated: "למינציה",
  igu: "IGU תרמי",
};

const FALLBACK_GLAZINGORDERS = [
  { id: "GZ-4001", product: "חלון דו-כנפי 180x150", glassType: "tempered", dims: "85x145", thickness: 6, spacer: "-", gasFill: "-", qty: 24, status: "done" },
  { id: "GZ-4002", product: "דלת מרפסת הזזה 300x220", glassType: "igu", dims: "145x215", thickness: 8, spacer: "16mm אלומ'", gasFill: "ארגון", qty: 8, status: "glazing" },
  { id: "GZ-4003", product: "חלון סורג קיפ 60x120", glassType: "float", dims: "55x115", thickness: 4, spacer: "-", gasFill: "-", qty: 40, status: "cutting" },
  { id: "GZ-4004", product: "ויטרינה קבועה 250x200", glassType: "laminated", dims: "245x195", thickness: 10, spacer: "-", gasFill: "-", qty: 6, status: "sealing" },
  { id: "GZ-4005", product: "חלון ציר עליון 100x60", glassType: "tempered", dims: "95x55", thickness: 5, spacer: "-", gasFill: "-", qty: 32, status: "done" },
  { id: "GZ-4006", product: "דלת כניסה + צוהר 110x220", glassType: "igu", dims: "40x180", thickness: 6, spacer: "12mm נירו'", gasFill: "ארגון", qty: 12, status: "qc" },
  { id: "GZ-4007", product: "חלון תריס גלילה 140x160", glassType: "float", dims: "135x155", thickness: 4, spacer: "-", gasFill: "-", qty: 18, status: "pending" },
  { id: "GZ-4008", product: "מעקה זכוכית מרפסת 400x110", glassType: "laminated", dims: "195x105", thickness: 12, spacer: "-", gasFill: "-", qty: 10, status: "glazing" },
  { id: "GZ-4009", product: "חלון פינתי 90+90x150", glassType: "igu", dims: "85x145", thickness: 6, spacer: "16mm אלומ'", gasFill: "קריפטון", qty: 4, status: "cutting" },
  { id: "GZ-4010", product: "דלת הזזה 200x220", glassType: "tempered", dims: "95x215", thickness: 8, spacer: "-", gasFill: "-", qty: 14, status: "sealing" },
  { id: "GZ-4011", product: "חלון אלומיניום 120x100", glassType: "float", dims: "115x95", thickness: 5, spacer: "-", gasFill: "-", qty: 28, status: "pending" },
  { id: "GZ-4012", product: "ויטרינה חנות 350x280", glassType: "laminated", dims: "170x275", thickness: 10, spacer: "-", gasFill: "-", qty: 4, status: "qc" },
];

const FALLBACK_GLASSINVENTORY = [
  { type: "float", thickness: 4, availableM2: 320, sheets: 64, location: "מחסן A-1" },
  { type: "float", thickness: 5, availableM2: 185, sheets: 37, location: "מחסן A-2" },
  { type: "float", thickness: 6, availableM2: 210, sheets: 42, location: "מחסן A-3" },
  { type: "tempered", thickness: 5, availableM2: 145, sheets: 29, location: "מחסן B-1" },
  { type: "tempered", thickness: 6, availableM2: 270, sheets: 54, location: "מחסן B-2" },
  { type: "tempered", thickness: 8, availableM2: 160, sheets: 32, location: "מחסן B-3" },
  { type: "laminated", thickness: 10, availableM2: 95, sheets: 19, location: "מחסן C-1" },
  { type: "laminated", thickness: 12, availableM2: 68, sheets: 14, location: "מחסן C-2" },
  { type: "igu", thickness: 6, availableM2: 180, sheets: 36, location: "מחסן D-1" },
  { type: "igu", thickness: 8, availableM2: 110, sheets: 22, location: "מחסן D-2" },
];

const FALLBACK_QUALITYTESTS = [
  { id: "QC-801", order: "GZ-4006", test: "שלמות איטום", result: "עבר", score: 98, inspector: "דני לוי", date: "2026-04-07" },
  { id: "QC-802", order: "GZ-4012", test: "בדיקה חזותית", result: "עבר", score: 100, inspector: "מיכל כהן", date: "2026-04-07" },
  { id: "QC-803", order: "GZ-4006", test: "אימות מילוי גז IGU", result: "עבר", score: 96, inspector: "דני לוי", date: "2026-04-07" },
  { id: "QC-804", order: "GZ-4012", test: "שלמות איטום", result: "לתיקון", score: 72, inspector: "מיכל כהן", date: "2026-04-06" },
  { id: "QC-805", order: "GZ-4001", test: "בדיקה חזותית", result: "עבר", score: 100, inspector: "אורי שמש", date: "2026-04-06" },
  { id: "QC-806", order: "GZ-4001", test: "עמידות לחץ", result: "עבר", score: 94, inspector: "אורי שמש", date: "2026-04-06" },
  { id: "QC-807", order: "GZ-4005", test: "שלמות איטום", result: "עבר", score: 97, inspector: "דני לוי", date: "2026-04-05" },
  { id: "QC-808", order: "GZ-4005", test: "אימות מילוי גז IGU", result: "לא רלוונטי", score: 0, inspector: "-", date: "2026-04-05" },
];

const FALLBACK_CUTTINGPLANS = [
  { id: "CP-301", glassType: "float", thickness: 4, sheetSize: "321x225 cm", pieces: 12, efficiency: 91, waste: "2.1 מ\"ר", order: "GZ-4003" },
  { id: "CP-302", glassType: "tempered", thickness: 8, sheetSize: "321x225 cm", pieces: 6, efficiency: 87, waste: "3.8 מ\"ר", order: "GZ-4010" },
  { id: "CP-303", glassType: "igu", thickness: 6, sheetSize: "250x180 cm", pieces: 4, efficiency: 93, waste: "1.4 מ\"ר", order: "GZ-4009" },
  { id: "CP-304", glassType: "laminated", thickness: 10, sheetSize: "321x225 cm", pieces: 3, efficiency: 78, waste: "5.6 מ\"ר", order: "GZ-4004" },
  { id: "CP-305", glassType: "float", thickness: 5, sheetSize: "250x180 cm", pieces: 8, efficiency: 89, waste: "2.7 מ\"ר", order: "GZ-4011" },
  { id: "CP-306", glassType: "laminated", thickness: 12, sheetSize: "321x225 cm", pieces: 5, efficiency: 82, waste: "4.2 מ\"ר", order: "GZ-4008" },
];

export default function FabGlazingOrders() {
  const { data: apiglazingOrders } = useQuery({
    queryKey: ["/api/fabrication/fab-glazing-orders/glazingorders"],
    queryFn: () => authFetch("/api/fabrication/fab-glazing-orders/glazingorders").then(r => r.json()).catch(() => null),
  });
  const glazingOrders = Array.isArray(apiglazingOrders) ? apiglazingOrders : (apiglazingOrders?.data ?? apiglazingOrders?.items ?? FALLBACK_GLAZINGORDERS);


  const { data: apiglassInventory } = useQuery({
    queryKey: ["/api/fabrication/fab-glazing-orders/glassinventory"],
    queryFn: () => authFetch("/api/fabrication/fab-glazing-orders/glassinventory").then(r => r.json()).catch(() => null),
  });
  const glassInventory = Array.isArray(apiglassInventory) ? apiglassInventory : (apiglassInventory?.data ?? apiglassInventory?.items ?? FALLBACK_GLASSINVENTORY);


  const { data: apiqualityTests } = useQuery({
    queryKey: ["/api/fabrication/fab-glazing-orders/qualitytests"],
    queryFn: () => authFetch("/api/fabrication/fab-glazing-orders/qualitytests").then(r => r.json()).catch(() => null),
  });
  const qualityTests = Array.isArray(apiqualityTests) ? apiqualityTests : (apiqualityTests?.data ?? apiqualityTests?.items ?? FALLBACK_QUALITYTESTS);


  const { data: apicuttingPlans } = useQuery({
    queryKey: ["/api/fabrication/fab-glazing-orders/cuttingplans"],
    queryFn: () => authFetch("/api/fabrication/fab-glazing-orders/cuttingplans").then(r => r.json()).catch(() => null),
  });
  const cuttingPlans = Array.isArray(apicuttingPlans) ? apicuttingPlans : (apicuttingPlans?.data ?? apicuttingPlans?.items ?? FALLBACK_CUTTINGPLANS);

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("orders");

  const filteredOrders = glazingOrders.filter(
    (o) =>
      o.id.toLowerCase().includes(search.toLowerCase()) ||
      o.product.includes(search) ||
      GLASS_TYPES[o.glassType]?.includes(search)
  );

  const totalUnits = glazingOrders.reduce((s, o) => s + o.qty, 0);
  const glazedToday = glazingOrders.filter((o) => o.status === "done").reduce((s, o) => s + o.qty, 0);
  const glassTypesInUse = new Set(glazingOrders.map((o) => o.glassType)).size;
  const pendingCount = glazingOrders.filter((o) => o.status === "pending").length;
  const breakageRate = 1.8;
  const sealQuality = 96.5;

  const kpis = [
    { title: "הזמנות פעילות", value: glazingOrders.length, icon: Package, color: "text-blue-400", bg: "bg-blue-500/10" },
    { title: "יחידות זוגגו היום", value: glazedToday, suffix: `/ ${totalUnits}`, icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
    { title: "סוגי זכוכית בשימוש", value: glassTypesInUse, icon: Layers, color: "text-purple-400", bg: "bg-purple-500/10" },
    { title: "אחוז שבירה", value: `${breakageRate}%`, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
    { title: "איכות איטום", value: `${sealQuality}%`, icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { title: "ממתינים לזיגוג", value: pendingCount, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">הזמנות זיגוג</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול זיגוג חלונות ודלתות -- חיתוך, הרכבה, בקרת איכות</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><BarChart3 className="w-4 h-4 ml-1" />דוח יומי</Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">+ הזמנה חדשה</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="bg-[#0d1117] border-white/10">
            <CardContent className="p-4">
              <div className={`p-2 rounded-lg ${kpi.bg} w-fit mb-2`}><kpi.icon className={`w-4 h-4 ${kpi.color}`} /></div>
              <div className="text-2xl font-bold text-white">{kpi.value}{kpi.suffix && <span className="text-sm text-muted-foreground mr-1">{kpi.suffix}</span>}</div>
              <div className="text-xs text-muted-foreground mt-1">{kpi.title}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList className="bg-[#161b22]">
            <TabsTrigger value="orders"><Package className="w-4 h-4 ml-1" />הזמנות</TabsTrigger>
            <TabsTrigger value="inventory"><Layers className="w-4 h-4 ml-1" />מלאי זכוכית</TabsTrigger>
            <TabsTrigger value="quality"><ShieldCheck className="w-4 h-4 ml-1" />בקרת איכות</TabsTrigger>
            <TabsTrigger value="cutting"><Scissors className="w-4 h-4 ml-1" />אופטימיזציית חיתוך</TabsTrigger>
          </TabsList>
          <div className="relative w-64">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 bg-[#0d1117] border-white/10"
            />
          </div>
        </div>

        {/* Orders Tab */}
        <TabsContent value="orders" className="space-y-4">
          <Card className="bg-[#0d1117] border-white/10">
            <CardHeader className="pb-3"><CardTitle className="text-lg text-white">הזמנות זיגוג פעילות</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10">
                    {["מס' הזמנה","מוצר","סוג זכוכית","מידות (ס\"מ)","עובי (מ\"מ)","ספייסר","מילוי גז","כמות","סטטוס","פעולות"].map((h,i) => (
                      <th key={h} className={`${i >= 4 && i <= 4 || i >= 7 ? "text-center" : "text-right"} p-3 text-muted-foreground font-medium`}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filteredOrders.map((o) => (
                      <tr key={o.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-3 text-blue-400 font-mono font-medium">{o.id}</td>
                        <td className="p-3 text-white">{o.product}</td>
                        <td className="p-3 text-white">{GLASS_TYPES[o.glassType]}</td>
                        <td className="p-3 text-muted-foreground">{o.dims}</td>
                        <td className="p-3 text-center text-muted-foreground">{o.thickness}</td>
                        <td className="p-3 text-muted-foreground">{o.spacer}</td>
                        <td className="p-3 text-muted-foreground">{o.gasFill}</td>
                        <td className="p-3 text-center text-white font-medium">{o.qty}</td>
                        <td className="p-3 text-center"><Badge className={`${STATUS_MAP[o.status].color} border text-xs`}>{STATUS_MAP[o.status].label}</Badge></td>
                        <td className="p-3 text-center"><Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(GLASS_TYPES).map((type) => {
              const items = glassInventory.filter((i) => i.type === type);
              const totalM2 = items.reduce((s, i) => s + i.availableM2, 0);
              return (
                <Card key={type} className="bg-[#0d1117] border-white/10">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-white">{GLASS_TYPES[type]}</CardTitle>
                      <Badge variant="outline" className="text-xs border-white/20 text-muted-foreground">
                        {totalM2} מ"ר סה"כ
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                        <div>
                          <div className="text-sm text-white font-medium">עובי {item.thickness} מ"מ</div>
                          <div className="text-xs text-muted-foreground">{item.location} -- {item.sheets} גיליונות</div>
                        </div>
                        <div className="text-left">
                          <div className="text-sm font-bold text-white">{item.availableM2} מ"ר</div>
                          <Progress value={Math.min((item.availableM2 / 350) * 100, 100)} className="w-20 h-1.5 mt-1" />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Quality Tab */}
        <TabsContent value="quality" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {[
              { icon: ShieldCheck, color: "text-green-400", val: qualityTests.filter((t) => t.result === "עבר").length, label: "בדיקות שעברו" },
              { icon: AlertTriangle, color: "text-red-400", val: qualityTests.filter((t) => t.result === "לתיקון").length, label: "דורשים תיקון" },
              { icon: ThermometerSun, color: "text-cyan-400", val: (qualityTests.filter((t) => t.score > 0).reduce((s, t) => s + t.score, 0) / qualityTests.filter((t) => t.score > 0).length).toFixed(1), label: "ציון ממוצע" },
            ].map((m) => (
              <Card key={m.label} className="bg-[#0d1117] border-white/10">
                <CardContent className="p-4 text-center">
                  <m.icon className={`w-8 h-8 mx-auto ${m.color} mb-2`} />
                  <div className="text-2xl font-bold text-white">{m.val}</div>
                  <div className="text-xs text-muted-foreground">{m.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-[#0d1117] border-white/10">
            <CardHeader className="pb-3"><CardTitle className="text-lg text-white">בדיקות איכות אחרונות</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-white/10">
                    {["מזהה","הזמנה","סוג בדיקה","ציון","תוצאה","בודק","תאריך"].map((h,i) => (
                      <th key={h} className={`${i===3||i===4 ? "text-center" : "text-right"} p-3 text-muted-foreground font-medium`}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {qualityTests.map((t) => (
                      <tr key={t.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <td className="p-3 text-blue-400 font-mono">{t.id}</td>
                        <td className="p-3 text-white">{t.order}</td>
                        <td className="p-3 text-white">{t.test}</td>
                        <td className="p-3 text-center">
                          {t.score > 0
                            ? <span className={`font-bold ${t.score >= 90 ? "text-green-400" : t.score >= 75 ? "text-yellow-400" : "text-red-400"}`}>{t.score}</span>
                            : <span className="text-muted-foreground">--</span>}
                        </td>
                        <td className="p-3 text-center">
                          <Badge className={`border text-xs ${t.result === "עבר" ? "bg-green-500/20 text-green-300 border-green-500/30" : t.result === "לתיקון" ? "bg-red-500/20 text-red-300 border-red-500/30" : "bg-gray-500/20 text-gray-300 border-gray-500/30"}`}>{t.result}</Badge>
                        </td>
                        <td className="p-3 text-muted-foreground">{t.inspector}</td>
                        <td className="p-3 text-muted-foreground">{t.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cutting Optimization Tab */}
        <TabsContent value="cutting" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {[
              { icon: Scissors, color: "text-blue-400", val: cuttingPlans.length, label: "תוכניות חיתוך" },
              { icon: BarChart3, color: "text-green-400", val: `${(cuttingPlans.reduce((s, c) => s + c.efficiency, 0) / cuttingPlans.length).toFixed(1)}%`, label: "יעילות ממוצעת" },
              { icon: Droplets, color: "text-amber-400", val: `${cuttingPlans.reduce((s, c) => s + parseFloat(c.waste), 0).toFixed(1)} מ"ר`, label: "פחת כולל" },
            ].map((m) => (
              <Card key={m.label} className="bg-[#0d1117] border-white/10">
                <CardContent className="p-4 text-center">
                  <m.icon className={`w-8 h-8 mx-auto ${m.color} mb-2`} />
                  <div className="text-2xl font-bold text-white">{m.val}</div>
                  <div className="text-xs text-muted-foreground">{m.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="bg-[#0d1117] border-white/10">
            <CardHeader className="pb-3"><CardTitle className="text-lg text-white">תוכניות חיתוך -- Nesting</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {cuttingPlans.map((cp) => (
                <div key={cp.id} className="flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-white/[0.07] transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="text-blue-400 font-mono font-medium text-sm">{cp.id}</div>
                    <div>
                      <div className="text-sm text-white font-medium">
                        {GLASS_TYPES[cp.glassType]} -- {cp.thickness} מ"מ
                      </div>
                      <div className="text-xs text-muted-foreground">
                        גיליון {cp.sheetSize} -- {cp.pieces} חתיכות -- הזמנה {cp.order}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-left min-w-[100px]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">יעילות</span>
                        <span className={`text-sm font-bold ${cp.efficiency >= 90 ? "text-green-400" : cp.efficiency >= 80 ? "text-yellow-400" : "text-red-400"}`}>
                          {cp.efficiency}%
                        </span>
                      </div>
                      <Progress value={cp.efficiency} className="h-2" />
                    </div>
                    <div className="text-left min-w-[70px]">
                      <div className="text-xs text-muted-foreground">פחת</div>
                      <div className="text-sm text-amber-400 font-medium">{cp.waste}</div>
                    </div>
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
