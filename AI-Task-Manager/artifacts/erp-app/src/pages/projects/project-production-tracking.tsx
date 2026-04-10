import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Factory, ClipboardList, AlertTriangle, Timer, Gauge, Search, Layers, ShieldCheck, Wrench, Scissors, Flame, Paintbrush, GlassWater, Package, ArrowUpDown } from "lucide-react";

/* ─── נתוני ייצור ─── */
const FALLBACK_PRODUCTION_ORDERS = [
  { id: "PO-4001", project: "מגדל הים חיפה", projectId: "PRJ-101", taskRef: "TSK-210", workCenter: "חיתוך", drawingRef: "DWG-A101", qty: 240, status: "completed", plannedHrs: 48, actualHrs: 45, scrapQty: 3, scrapCost: 1250, reworkQty: 2, reworkCost: 800 },
  { id: "PO-4002", project: "מגדל הים חיפה", projectId: "PRJ-101", taskRef: "TSK-211", workCenter: "כיפוף", drawingRef: "DWG-A102", qty: 240, status: "completed", plannedHrs: 36, actualHrs: 38, scrapQty: 1, scrapCost: 420, reworkQty: 0, reworkCost: 0 },
  { id: "PO-4003", project: "מגדל הים חיפה", projectId: "PRJ-101", taskRef: "TSK-212", workCenter: "ריתוך", drawingRef: "DWG-A103", qty: 120, status: "in-progress", plannedHrs: 60, actualHrs: 42, scrapQty: 2, scrapCost: 1800, reworkQty: 3, reworkCost: 1500 },
  { id: "PO-4004", project: "קניון עזריאלי", projectId: "PRJ-102", taskRef: "TSK-310", workCenter: "חיתוך", drawingRef: "DWG-B201", qty: 520, status: "in-progress", plannedHrs: 96, actualHrs: 68, scrapQty: 8, scrapCost: 3200, reworkQty: 4, reworkCost: 2100 },
  { id: "PO-4005", project: "קניון עזריאלי", projectId: "PRJ-102", taskRef: "TSK-311", workCenter: "ציפוי", drawingRef: "DWG-B202", qty: 520, status: "planned", plannedHrs: 40, actualHrs: 0, scrapQty: 0, scrapCost: 0, reworkQty: 0, reworkCost: 0 },
  { id: "PO-4006", project: "קניון עזריאלי", projectId: "PRJ-102", taskRef: "TSK-312", workCenter: "זיגוג", drawingRef: "DWG-B203", qty: 520, status: "planned", plannedHrs: 72, actualHrs: 0, scrapQty: 0, scrapCost: 0, reworkQty: 0, reworkCost: 0 },
  { id: "PO-4007", project: "בית ספר אורט", projectId: "PRJ-103", taskRef: "TSK-410", workCenter: "חיתוך", drawingRef: "DWG-C301", qty: 86, status: "released", plannedHrs: 18, actualHrs: 0, scrapQty: 0, scrapCost: 0, reworkQty: 0, reworkCost: 0 },
  { id: "PO-4008", project: "בית ספר אורט", projectId: "PRJ-103", taskRef: "TSK-411", workCenter: "ריתוך", drawingRef: "DWG-C302", qty: 86, status: "released", plannedHrs: 24, actualHrs: 0, scrapQty: 0, scrapCost: 0, reworkQty: 0, reworkCost: 0 },
  { id: "PO-4009", project: "שיכון נוף", projectId: "PRJ-104", taskRef: "TSK-510", workCenter: "כיפוף", drawingRef: "DWG-D401", qty: 180, status: "in-progress", plannedHrs: 32, actualHrs: 24, scrapQty: 5, scrapCost: 1950, reworkQty: 2, reworkCost: 750 },
  { id: "PO-4010", project: "שיכון נוף", projectId: "PRJ-104", taskRef: "TSK-511", workCenter: "הרכבה", drawingRef: "DWG-D402", qty: 180, status: "qc", plannedHrs: 28, actualHrs: 30, scrapQty: 1, scrapCost: 600, reworkQty: 5, reworkCost: 2800 },
  { id: "PO-4011", project: "סינמה סיטי", projectId: "PRJ-105", taskRef: "TSK-610", workCenter: "ציפוי", drawingRef: "DWG-E501", qty: 64, status: "completed", plannedHrs: 14, actualHrs: 13, scrapQty: 0, scrapCost: 0, reworkQty: 1, reworkCost: 350 },
  { id: "PO-4012", project: "משרדים הרצליה", projectId: "PRJ-106", taskRef: "TSK-710", workCenter: "הרכבה", drawingRef: "DWG-F601", qty: 310, status: "in-progress", plannedHrs: 56, actualHrs: 35, scrapQty: 4, scrapCost: 2400, reworkQty: 3, reworkCost: 1650 },
];

const workCenters = [
  { name: "חיתוך", icon: Scissors, capacityHrs: 160, color: "text-red-400" },
  { name: "כיפוף", icon: ArrowUpDown, color: "text-orange-400", capacityHrs: 140 },
  { name: "ריתוך", icon: Flame, color: "text-amber-400", capacityHrs: 150 },
  { name: "ציפוי", icon: Paintbrush, color: "text-cyan-400", capacityHrs: 120 },
  { name: "זיגוג", icon: GlassWater, color: "text-blue-400", capacityHrs: 130 },
  { name: "הרכבה", icon: Package, color: "text-green-400", capacityHrs: 160 },
];

/* ─── עזרים ─── */
const statusMap: Record<string, { label: string; badge: string }> = {
  planned: { label: "מתוכנן", badge: "bg-slate-500/20 text-slate-400" },
  released: { label: "שוחרר", badge: "bg-blue-500/20 text-blue-400" },
  "in-progress": { label: "בייצור", badge: "bg-amber-500/20 text-amber-400" },
  qc: { label: "בקרת איכות", badge: "bg-violet-500/20 text-violet-400" },
  completed: { label: "הושלם", badge: "bg-emerald-500/20 text-emerald-400" },
};
const fmt = (n: number) => "₪" + new Intl.NumberFormat("he-IL").format(n);
const pct = (a: number, b: number) => b === 0 ? 0 : Math.round((a / b) * 100);
function buildProductionKpis(productionOrders: any[]) {
  const activeOrders = productionOrders.filter(o => ["in-progress","qc","released"].includes(o.status)).length;
  const unitsInProduction = productionOrders.filter(o => o.status === "in-progress").reduce((s: number, o: any) => s + o.qty, 0);
  const completedOnTime = productionOrders.filter(o => o.status === "completed" && o.actualHrs <= o.plannedHrs).length;
  const totalCompleted = productionOrders.filter(o => o.status === "completed").length;
  const onTimePct = totalCompleted > 0 ? Math.round((completedOnTime / totalCompleted) * 100) : 0;
  const totalScrapCost = productionOrders.reduce((s: number, o: any) => s + o.scrapCost, 0);
  const totalReworkCost = productionOrders.reduce((s: number, o: any) => s + o.reworkCost, 0);
  const totalPlanned = productionOrders.filter(o => o.status !== "planned").reduce((s: number, o: any) => s + o.plannedHrs, 0);
  const totalActual = productionOrders.filter(o => o.status !== "planned").reduce((s: number, o: any) => s + o.actualHrs, 0);
  const utilization = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 100) : 0;
  return [
    { label: "הזמנות פעילות", value: activeOrders.toString(), icon: ClipboardList, color: "text-blue-400" },
    { label: "יחידות בייצור", value: unitsInProduction.toLocaleString("he-IL"), icon: Factory, color: "text-amber-400" },
    { label: "אחוז בזמן", value: onTimePct + "%", icon: Timer, color: "text-green-400" },
    { label: "עלות פחת", value: fmt(totalScrapCost), icon: AlertTriangle, color: "text-red-400" },
    { label: "עלות תיקון", value: fmt(totalReworkCost), icon: Wrench, color: "text-orange-400" },
    { label: "ניצולת מרכזי עבודה", value: utilization + "%", icon: Gauge, color: "text-cyan-400" },
  ];
}

function buildProjectGroups(productionOrders: any[]) {
  return Object.values(
    productionOrders.reduce((acc: any, o: any) => {
      if (!acc[o.projectId]) acc[o.projectId] = { projectId: o.projectId, project: o.project, orders: [] };
      acc[o.projectId].orders.push(o);
      return acc;
    }, {} as Record<string, any>)
  );
}

export default function ProjectProductionTracking() {
  const [tab, setTab] = useState("orders");
  const [search, setSearch] = useState("");

  const { data: apiProd } = useQuery({
    queryKey: ["project-production-tracking"],
    queryFn: async () => { const r = await authFetch("/api/projects/production"); return r.json(); },
  });
  const productionOrders = Array.isArray(apiProd) ? apiProd : (apiProd?.data ?? apiProd?.productionOrders ?? FALLBACK_PRODUCTION_ORDERS);
  const kpis = buildProductionKpis(productionOrders);
  const projectGroups = buildProjectGroups(productionOrders);

  const filtered = productionOrders.filter(o =>
    o.id.includes(search) || o.project.includes(search) || o.workCenter.includes(search) || o.drawingRef.includes(search)
  );

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* כותרת */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Factory className="w-7 h-7 text-amber-400" /> מעקב ייצור לפי פרויקט
        </h1>
        <p className="text-sm text-slate-400 mt-1">טכנו-כל עוזי — הזמנות ייצור, מרכזי עבודה, איכות וקיבולת</p>
      </div>

      {/* KPI שורה */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-[#1e293b] border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`w-8 h-8 ${k.color}`} />
              <div>
                <p className="text-2xl font-bold text-white">{k.value}</p>
                <p className="text-xs text-slate-400">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* טאבים */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-[#1e293b] border border-slate-700">
          <TabsTrigger value="orders">הזמנות ייצור</TabsTrigger>
          <TabsTrigger value="byProject">לפי פרויקט</TabsTrigger>
          <TabsTrigger value="quality">איכות</TabsTrigger>
          <TabsTrigger value="capacity">קיבולת</TabsTrigger>
        </TabsList>

        {/* ═══ טאב 1: הזמנות ייצור ═══ */}
        <TabsContent value="orders" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-500" />
              <Input
                placeholder="חיפוש הזמנה, פרויקט, מרכז עבודה..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-9 bg-[#0f172a] border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>
            <Badge className="bg-blue-500/20 text-blue-400">{filtered.length} הזמנות</Badge>
          </div>

          <Card className="bg-[#1e293b] border-slate-700">
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="p-3 text-right font-medium">מס׳ הזמנה</th>
                    <th className="p-3 text-right font-medium">פרויקט</th>
                    <th className="p-3 text-right font-medium">משימה</th>
                    <th className="p-3 text-right font-medium">מרכז עבודה</th>
                    <th className="p-3 text-right font-medium">שרטוט</th>
                    <th className="p-3 text-center font-medium">כמות</th>
                    <th className="p-3 text-center font-medium">סטטוס</th>
                    <th className="p-3 text-center font-medium">מתוכנן (שעות)</th>
                    <th className="p-3 text-center font-medium">בפועל (שעות)</th>
                    <th className="p-3 text-center font-medium">התקדמות</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const prog = o.plannedHrs > 0 ? pct(o.actualHrs, o.plannedHrs) : 0;
                    const overrun = o.actualHrs > o.plannedHrs;
                    return (
                      <tr key={o.id} className="border-b border-slate-700/50 hover:bg-slate-800/40">
                        <td className="p-3 text-white font-mono font-semibold">{o.id}</td>
                        <td className="p-3 text-white">{o.project}</td>
                        <td className="p-3 text-slate-300 font-mono text-xs">{o.taskRef}</td>
                        <td className="p-3 text-slate-300">{o.workCenter}</td>
                        <td className="p-3 text-slate-400 font-mono text-xs">{o.drawingRef}</td>
                        <td className="p-3 text-center text-white">{o.qty}</td>
                        <td className="p-3 text-center">
                          <Badge className={statusMap[o.status]?.badge}>{statusMap[o.status]?.label}</Badge>
                        </td>
                        <td className="p-3 text-center text-slate-300">{o.plannedHrs}</td>
                        <td className={`p-3 text-center font-semibold ${overrun ? "text-red-400" : "text-white"}`}>{o.actualHrs}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={Math.min(prog, 100)} className="h-2 flex-1" />
                            <span className="text-xs text-slate-400 w-10 text-left">{prog}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ טאב 2: לפי פרויקט ═══ */}
        <TabsContent value="byProject" className="space-y-4">
          {projectGroups.map(g => {
            const done = g.orders.filter(o => o.status === "completed").length;
            const total = g.orders.length;
            const prog = pct(done, total);
            const totalQty = g.orders.reduce((s, o) => s + o.qty, 0);
            const grpScrap = g.orders.reduce((s, o) => s + o.scrapCost, 0);
            const grpRework = g.orders.reduce((s, o) => s + o.reworkCost, 0);
            return (
              <Card key={g.projectId} className="bg-[#1e293b] border-slate-700">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-white flex items-center gap-2">
                      <Layers className="w-5 h-5 text-blue-400" />
                      {g.project}
                      <span className="text-xs text-slate-500 font-mono">{g.projectId}</span>
                    </CardTitle>
                    <div className="flex items-center gap-3">
                      <Badge className="bg-slate-500/20 text-slate-300">{totalQty} יח׳</Badge>
                      <Badge className="bg-emerald-500/20 text-emerald-400">{done}/{total} הושלמו</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <Progress value={prog} className="h-2.5 flex-1" />
                    <span className="text-sm font-semibold text-white">{prog}%</span>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    {[
                      { l: "הזמנות", v: total, c: "text-white" }, { l: "סה״כ יח׳", v: totalQty, c: "text-white" },
                      { l: "עלות פחת", v: fmt(grpScrap), c: "text-red-400" }, { l: "עלות תיקון", v: fmt(grpRework), c: "text-orange-400" },
                    ].map(s => (
                      <div key={s.l} className="bg-[#0f172a] rounded-lg p-3">
                        <p className="text-xs text-slate-500">{s.l}</p>
                        <p className={`text-lg font-bold ${s.c}`}>{s.v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {g.orders.map(o => (
                      <div key={o.id} className="flex items-center gap-3 bg-[#0f172a] rounded-lg px-3 py-2">
                        <span className="text-xs font-mono text-slate-500 w-20">{o.id}</span>
                        <span className="text-sm text-slate-300 w-16">{o.workCenter}</span>
                        <Badge className={`${statusMap[o.status]?.badge} text-xs`}>{statusMap[o.status]?.label}</Badge>
                        <span className="text-xs text-slate-500 mr-auto">{o.drawingRef}</span>
                        <span className="text-xs text-slate-400">{o.qty} יח׳</span>
                        <Progress value={o.plannedHrs > 0 ? pct(o.actualHrs, o.plannedHrs) : 0} className="h-1.5 w-20" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        {/* ═══ טאב 3: איכות ═══ */}
        <TabsContent value="quality" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { l: "סה״כ פחת (יח׳)", v: productionOrders.reduce((s: number, o: any) => s + o.scrapQty, 0).toString(), c: "text-red-400" },
              { l: "עלות פחת כוללת", v: fmt(productionOrders.reduce((s: number, o: any) => s + (o.scrapQty * (o.unitCost || 0)), 0)), c: "text-red-400" },
              { l: "סה״כ תיקונים (יח׳)", v: productionOrders.reduce((s: number, o: any) => s + o.reworkQty, 0).toString(), c: "text-orange-400" },
              { l: "עלות תיקונים כוללת", v: fmt(productionOrders.reduce((s: number, o: any) => s + (o.reworkQty * (o.reworkCostPerUnit || 0)), 0)), c: "text-orange-400" },
            ].map((q: any) => (
              <Card key={q.l} className="bg-[#1e293b] border-slate-700">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-slate-500">{q.l}</p>
                  <p className={`text-3xl font-bold ${q.c}`}>{q.v}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-[#1e293b] border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-violet-400" /> מעקב פחת ותיקון לפי הזמנה
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400">
                    <th className="p-3 text-right font-medium">הזמנה</th>
                    <th className="p-3 text-right font-medium">פרויקט</th>
                    <th className="p-3 text-right font-medium">מרכז עבודה</th>
                    <th className="p-3 text-center font-medium">כמות</th>
                    <th className="p-3 text-center font-medium">פחת (יח׳)</th>
                    <th className="p-3 text-center font-medium">עלות פחת</th>
                    <th className="p-3 text-center font-medium">% פחת</th>
                    <th className="p-3 text-center font-medium">תיקון (יח׳)</th>
                    <th className="p-3 text-center font-medium">עלות תיקון</th>
                    <th className="p-3 text-center font-medium">% תיקון</th>
                  </tr>
                </thead>
                <tbody>
                  {productionOrders.filter(o => o.scrapQty > 0 || o.reworkQty > 0).map(o => {
                    const scrapPct = pct(o.scrapQty, o.qty);
                    const reworkPct = pct(o.reworkQty, o.qty);
                    return (
                      <tr key={o.id} className="border-b border-slate-700/50 hover:bg-slate-800/40">
                        <td className="p-3 text-white font-mono font-semibold">{o.id}</td>
                        <td className="p-3 text-white">{o.project}</td>
                        <td className="p-3 text-slate-300">{o.workCenter}</td>
                        <td className="p-3 text-center text-white">{o.qty}</td>
                        <td className="p-3 text-center text-red-400 font-semibold">{o.scrapQty}</td>
                        <td className="p-3 text-center text-red-400">{fmt(o.scrapCost)}</td>
                        <td className="p-3 text-center">
                          <Badge className={scrapPct > 3 ? "bg-red-500/20 text-red-400" : "bg-slate-500/20 text-slate-400"}>{scrapPct}%</Badge>
                        </td>
                        <td className="p-3 text-center text-orange-400 font-semibold">{o.reworkQty}</td>
                        <td className="p-3 text-center text-orange-400">{fmt(o.reworkCost)}</td>
                        <td className="p-3 text-center">
                          <Badge className={reworkPct > 2 ? "bg-orange-500/20 text-orange-400" : "bg-slate-500/20 text-slate-400"}>{reworkPct}%</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* סיכום לפי מרכז עבודה */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {workCenters.map(wc => {
              const wo = productionOrders.filter(o => o.workCenter === wc.name);
              const WcIcon = wc.icon;
              return (
                <Card key={wc.name} className="bg-[#1e293b] border-slate-700">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <WcIcon className={`w-4 h-4 ${wc.color}`} />
                      <span className="text-xs font-semibold text-white">{wc.name}</span>
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="flex justify-between"><span className="text-slate-500">פחת</span><span className="text-red-400">{wo.reduce((s, o) => s + o.scrapQty, 0)} / {fmt(wo.reduce((s, o) => s + o.scrapCost, 0))}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">תיקון</span><span className="text-orange-400">{wo.reduce((s, o) => s + o.reworkQty, 0)} / {fmt(wo.reduce((s, o) => s + o.reworkCost, 0))}</span></div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ═══ טאב 4: קיבולת ═══ */}
        <TabsContent value="capacity" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workCenters.map(wc => {
              const wcOrders = productionOrders.filter(o => o.workCenter === wc.name && o.status !== "completed");
              const loadHrs = wcOrders.reduce((s, o) => s + (o.plannedHrs - o.actualHrs), 0);
              const loadPct = pct(loadHrs, wc.capacityHrs);
              const WcIcon = wc.icon;
              const loadColor = loadPct > 90 ? "text-red-400" : loadPct > 70 ? "text-amber-400" : "text-green-400";
              const barColor = loadPct > 90 ? "bg-red-500" : loadPct > 70 ? "bg-amber-500" : "bg-green-500";
              return (
                <Card key={wc.name} className="bg-[#1e293b] border-slate-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white flex items-center gap-2">
                      <WcIcon className={`w-5 h-5 ${wc.color}`} />
                      {wc.name}
                      <Badge className={`mr-auto ${loadPct > 90 ? "bg-red-500/20 text-red-400" : loadPct > 70 ? "bg-amber-500/20 text-amber-400" : "bg-green-500/20 text-green-400"}`}>
                        {loadPct > 90 ? "עומס גבוה" : loadPct > 70 ? "עומס בינוני" : "תקין"}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-end gap-2">
                      <span className={`text-4xl font-bold ${loadColor}`}>{loadPct}%</span>
                      <span className="text-sm text-slate-500 mb-1">ניצולת</span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-3">
                      <div className={`${barColor} h-3 rounded-full transition-all`} style={{ width: `${Math.min(loadPct, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs px-1">
                      <span className="text-slate-500">עומס: <span className="text-white font-semibold">{loadHrs}h</span></span>
                      <span className="text-slate-500">קיבולת: <span className="text-white font-semibold">{wc.capacityHrs}h</span></span>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs text-slate-500 font-medium">הזמנות פעילות:</p>
                      {wcOrders.length === 0 && <p className="text-xs text-slate-600">אין הזמנות פעילות</p>}
                      {wcOrders.map(o => (
                        <div key={o.id} className="flex items-center gap-2 bg-[#0f172a] rounded px-2 py-1.5">
                          <span className="text-xs font-mono text-slate-500">{o.id}</span>
                          <span className="text-xs text-white">{o.project}</span>
                          <Badge className={`${statusMap[o.status]?.badge} text-[10px] mr-auto`}>{statusMap[o.status]?.label}</Badge>
                          <span className="text-xs text-slate-400">{o.plannedHrs - o.actualHrs}h</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* סיכום קיבולת — שורה תחתונה */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {workCenters.map(wc => {
              const rem = productionOrders.filter(o => o.workCenter === wc.name && o.status !== "completed").reduce((s, o) => s + (o.plannedHrs - o.actualHrs), 0);
              const free = Math.max(0, wc.capacityHrs - rem);
              const WcIcon = wc.icon;
              return (
                <Card key={wc.name} className="bg-[#1e293b] border-slate-700">
                  <CardContent className="p-3 text-center">
                    <WcIcon className={`w-5 h-5 ${wc.color} mx-auto mb-1`} />
                    <p className="text-xs text-slate-400">{wc.name}</p>
                    <p className="text-lg font-bold text-green-400">{free}h</p>
                    <p className="text-[10px] text-slate-500">פנוי מתוך {wc.capacityHrs}h</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}