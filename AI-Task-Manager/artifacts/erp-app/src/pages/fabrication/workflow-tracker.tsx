import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Activity, Layers, CheckCircle2, Clock, AlertTriangle,
  Search, Filter, Zap, Package, ArrowLeft, Settings,
  Timer, Factory, Hammer, Paintbrush, Shield, BoxSelect,
  TrendingUp, RefreshCw, Eye
} from "lucide-react";

const STAGES = [
  { key: "cutting", name: "חיתוך", icon: Hammer, color: "text-amber-400", bg: "bg-amber-500" },
  { key: "welding", name: "ריתוך", icon: Zap, color: "text-orange-400", bg: "bg-orange-500" },
  { key: "assembly", name: "הרכבה", icon: Settings, color: "text-blue-400", bg: "bg-blue-500" },
  { key: "coating", name: "ציפוי", icon: Paintbrush, color: "text-purple-400", bg: "bg-purple-500" },
  { key: "qc", name: "בקרת איכות", icon: Shield, color: "text-cyan-400", bg: "bg-cyan-500" },
  { key: "packing", name: "אריזה", icon: Package, color: "text-green-400", bg: "bg-green-500" },
];

const orders = [
  { id: "WO-6001", product: "חלונות אלומיניום - מגדלי הים", qty: 240, currentStage: "welding", progress: 35, priority: "גבוהה", client: "שיכון ובינוי", startTime: "06:30" },
  { id: "WO-6002", product: "מעטפת זכוכית - עזריאלי", qty: 86, currentStage: "cutting", progress: 15, priority: "דחוף", client: "קבוצת עזריאלי", startTime: "07:00" },
  { id: "WO-6003", product: "דלתות מאובטחות - משהב״ט", qty: 52, currentStage: "assembly", progress: 58, priority: "גבוהה", client: "משרד הביטחון", startTime: "05:45" },
  { id: "WO-6004", product: "מעקות זכוכית - מגורים", qty: 120, currentStage: "coating", progress: 72, priority: "רגילה", client: "אפריקה ישראל", startTime: "06:00" },
  { id: "WO-6005", product: "פרגולות מתכת - פארק עירוני", qty: 34, currentStage: "qc", progress: 88, priority: "רגילה", client: "עיריית ת״א", startTime: "05:30" },
  { id: "WO-6006", product: "ויטרינות חנויות TLV", qty: 68, currentStage: "packing", progress: 95, priority: "רגילה", client: "אלוני חץ", startTime: "04:15" },
  { id: "WO-6007", product: "חיפוי מתכת - קניון הנגב", qty: 180, currentStage: "cutting", progress: 8, priority: "גבוהה", client: "ביג מרכזי קניות", startTime: "07:15" },
  { id: "WO-6008", product: "תקרות אלומיניום - איכילוב", qty: 96, currentStage: "welding", progress: 42, priority: "דחוף", client: "משרד הבריאות", startTime: "06:15" },
];

const priorityColors: Record<string, string> = {
  "דחוף": "bg-red-500/20 text-red-400 border-red-500/30",
  "גבוהה": "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "רגילה": "bg-green-500/20 text-green-400 border-green-500/30",
};

const stationStats = [
  { stage: "חיתוך", active: 2, capacity: 3, utilization: 67, avgCycle: "45 דק׳" },
  { stage: "ריתוך", active: 2, capacity: 2, utilization: 100, avgCycle: "62 דק׳" },
  { stage: "הרכבה", active: 1, capacity: 2, utilization: 50, avgCycle: "38 דק׳" },
  { stage: "ציפוי", active: 1, capacity: 2, utilization: 50, avgCycle: "55 דק׳" },
  { stage: "בקרת איכות", active: 1, capacity: 1, utilization: 100, avgCycle: "25 דק׳" },
  { stage: "אריזה", active: 1, capacity: 2, utilization: 50, avgCycle: "20 דק׳" },
];

export default function WorkflowTracker() {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("all");

  const filtered = orders.filter((o) => {
    if (stageFilter !== "all" && o.currentStage !== stageFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return o.id.toLowerCase().includes(q) || o.product.includes(search) || o.client.includes(search);
    }
    return true;
  });

  const activeOrders = orders.length;
  const inProduction = orders.filter((o) => o.progress > 0 && o.progress < 100).length;
  const completedToday = 5;
  const avgCycleTime = "4.2 שעות";
  const bottleneck = stationStats.reduce((max, s) => (s.utilization > max.utilization ? s : max), stationStats[0]);

  const kpis = [
    { label: "הזמנות פעילות", value: activeOrders.toString(), icon: Layers, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "בייצור", value: inProduction.toString(), icon: Factory, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "הושלמו היום", value: completedToday.toString(), icon: CheckCircle2, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "זמן מחזור ממוצע", value: avgCycleTime, icon: Timer, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "צוואר בקבוק", value: bottleneck.stage, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  ];

  const getStageIndex = (stageKey: string) => STAGES.findIndex((s) => s.key === stageKey);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="h-7 w-7 text-emerald-400" />
            מעקב תהליכי ייצור - טכנו-כל עוזי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב חי אחר הזמנות בשלבי ייצור שונים</p>
        </div>
        <Button variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 ml-1" />
          רענן נתונים
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map((kpi, i) => (
          <Card key={i} className="bg-card/80 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground leading-tight">{kpi.label}</p>
                  <p className={`text-lg font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="bg-card/60 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי הזמנה, מוצר או לקוח..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9 bg-background/50"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="bg-background/50 border border-border rounded-md px-3 py-2 text-sm text-foreground"
              >
                <option value="all">כל השלבים</option>
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Tracker */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-400 animate-pulse" />
            מעקב חי - הזמנות בייצור
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {filtered.map((order) => {
            const stageIdx = getStageIndex(order.currentStage);
            const currentStageObj = STAGES[stageIdx];
            return (
              <div key={order.id} className="p-4 bg-muted/20 rounded-lg border border-border/30">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-foreground bg-muted/50 px-2 py-1 rounded">{order.id}</span>
                    <div>
                      <h4 className="text-sm font-medium text-foreground">{order.product}</h4>
                      <p className="text-[11px] text-muted-foreground">{order.client} | {order.qty} יח׳ | התחלה: {order.startTime}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={priorityColors[order.priority]}>{order.priority}</Badge>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Stage Progress */}
                <div className="flex items-center gap-1 mb-2">
                  {STAGES.map((stage, sIdx) => {
                    const isCompleted = sIdx < stageIdx;
                    const isCurrent = sIdx === stageIdx;
                    const isFuture = sIdx > stageIdx;
                    return (
                      <div key={stage.key} className="flex-1 flex flex-col items-center">
                        <div
                          className={`h-2 w-full rounded-full ${
                            isCompleted ? stage.bg : isCurrent ? `${stage.bg} animate-pulse` : "bg-muted/40"
                          }`}
                        />
                        <span className={`text-[9px] mt-1 ${
                          isCurrent ? stage.color + " font-bold" : isCompleted ? "text-muted-foreground" : "text-muted-foreground/50"
                        }`}>
                          {stage.name}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {currentStageObj && <currentStageObj.icon className={`h-4 w-4 ${currentStageObj.color}`} />}
                    <span className={`text-xs font-medium ${currentStageObj?.color}`}>
                      שלב נוכחי: {currentStageObj?.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Progress value={order.progress} className="h-2 w-24" />
                    <span className="text-xs font-mono text-muted-foreground">{order.progress}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Station Overview */}
      <Card className="bg-card/60 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Factory className="h-5 w-5 text-blue-400" />
            סקירת תחנות עבודה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {stationStats.map((station, idx) => {
              const stageObj = STAGES.find((s) => s.name === station.stage);
              const isBottleneck = station.utilization >= 100;
              return (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border text-center ${
                    isBottleneck
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-muted/20 border-border/30"
                  }`}
                >
                  <div className={`text-sm font-medium mb-2 ${stageObj?.color || "text-foreground"}`}>
                    {station.stage}
                  </div>
                  <div className="text-2xl font-bold font-mono text-foreground mb-1">
                    {station.active}/{station.capacity}
                  </div>
                  <Progress
                    value={station.utilization}
                    className="h-1.5 mb-2"
                  />
                  <div className="text-[10px] text-muted-foreground">ניצולת: {station.utilization}%</div>
                  <div className="text-[10px] text-muted-foreground">מחזור: {station.avgCycle}</div>
                  {isBottleneck && (
                    <Badge className="bg-red-500/20 text-red-400 text-[9px] mt-1">צוואר בקבוק</Badge>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
