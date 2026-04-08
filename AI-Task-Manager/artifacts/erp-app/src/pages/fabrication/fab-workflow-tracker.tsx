import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Activity, Package, AlertTriangle, Clock, CheckCircle2, Gauge,
  Search, RefreshCw, ArrowLeftRight, Zap, TrendingUp, TrendingDown,
  Timer, BarChart3, Layers, ChevronLeft, ChevronRight
} from "lucide-react";

const STATIONS = ["חיתוך", "עיבוד שבבי", "הרכבה", "זיגוג", "ציפוי", "בקרת איכות", "אריזה"] as const;
type Station = typeof STATIONS[number];

const STATION_COLORS: Record<Station, string> = {
  "חיתוך": "bg-red-500/20 text-red-300 border-red-500/30",
  "עיבוד שבבי": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "הרכבה": "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  "זיגוג": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "ציפוי": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "בקרת איכות": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "אריזה": "bg-green-500/20 text-green-300 border-green-500/30",
};

interface Order {
  id: string; customer: string; product: string; station: Station;
  progress: number; timeAtStation: string; delay: string | null; priority: "רגיל" | "דחוף" | "קריטי";
}

const ORDERS: Order[] = [
  { id: "WO-4401", customer: "אלומיניום הגליל", product: "חלון דו-כנפי 180x150", station: "ציפוי", progress: 71, timeAtStation: "2:15 שעות", delay: null, priority: "רגיל" },
  { id: "WO-4402", customer: "קבוצת שפיר", product: "דלת כניסה מחוזקת", station: "הרכבה", progress: 43, timeAtStation: "3:40 שעות", delay: "עיכוב חומרים - 45 דק'", priority: "דחוף" },
  { id: "WO-4403", customer: "מנרב הנדסה", product: "ויטרינה מסחרית 300x250", station: "חיתוך", progress: 14, timeAtStation: "0:50 שעות", delay: null, priority: "רגיל" },
  { id: "WO-4404", customer: "דניה סיבוס", product: "מערכת חלונות משרדית", station: "בקרת איכות", progress: 86, timeAtStation: "1:10 שעות", delay: null, priority: "קריטי" },
  { id: "WO-4405", customer: "אפקון", product: "דלת הזזה אוטומטית", station: "עיבוד שבבי", progress: 29, timeAtStation: "4:20 שעות", delay: "תקלת מכונה - 1:30 שעות", priority: "דחוף" },
  { id: "WO-4406", customer: "אשטרום", product: "חלון ממ\"ד 120x80", station: "זיגוג", progress: 57, timeAtStation: "1:45 שעות", delay: null, priority: "רגיל" },
  { id: "WO-4407", customer: "סולל בונה", product: "פרגולה אלומיניום 400x300", station: "אריזה", progress: 93, timeAtStation: "0:35 שעות", delay: null, priority: "רגיל" },
  { id: "WO-4408", customer: "לפידות", product: "תריס חשמלי 200x160", station: "ציפוי", progress: 64, timeAtStation: "2:50 שעות", delay: "עיכוב ייבוש - 30 דק'", priority: "רגיל" },
  { id: "WO-4409", customer: "פרי הנדסה", product: "מעקה זכוכית 5 מטר", station: "חיתוך", progress: 7, timeAtStation: "0:20 שעות", delay: null, priority: "דחוף" },
  { id: "WO-4410", customer: "אזורים", product: "חלון ציר עליון 100x60", station: "עיבוד שבבי", progress: 36, timeAtStation: "1:55 שעות", delay: null, priority: "רגיל" },
];

interface WorkStation {
  name: Station; queue: number; throughputPerHour: number;
  efficiency: number; operator: string; status: "פעיל" | "עומס" | "תחזוקה";
}

const WORKSTATIONS: WorkStation[] = [
  { name: "חיתוך", queue: 4, throughputPerHour: 12, efficiency: 88, operator: "יוסי כהן", status: "פעיל" },
  { name: "עיבוד שבבי", queue: 7, throughputPerHour: 8, efficiency: 72, operator: "מוחמד חסן", status: "עומס" },
  { name: "הרכבה", queue: 3, throughputPerHour: 6, efficiency: 81, operator: "דני לוי", status: "פעיל" },
  { name: "זיגוג", queue: 2, throughputPerHour: 10, efficiency: 91, operator: "איגור פטרוב", status: "פעיל" },
  { name: "ציפוי", queue: 5, throughputPerHour: 9, efficiency: 78, operator: "עלי מנסור", status: "פעיל" },
  { name: "בקרת איכות", queue: 1, throughputPerHour: 15, efficiency: 95, operator: "רונית שמש", status: "פעיל" },
  { name: "אריזה", queue: 2, throughputPerHour: 14, efficiency: 89, operator: "אנדריי קוז'", status: "פעיל" },
  { name: "עיבוד שבבי", queue: 6, throughputPerHour: 7, efficiency: 65, operator: "סרגיי ב.", status: "תחזוקה" },
];

const BOTTLENECKS = [
  { station: "עיבוד שבבי", avgWait: "47 דק'", maxWait: "1:32 שעות", queueDepth: 13, recommendation: "הוספת משמרת שנייה או מכונת CNC נוספת" },
  { station: "ציפוי", avgWait: "28 דק'", maxWait: "0:55 שעות", queueDepth: 5, recommendation: "אופטימיזציה של תהליך הייבוש — מייבש UV" },
  { station: "הרכבה", avgWait: "22 דק'", maxWait: "0:40 שעות", queueDepth: 3, recommendation: "תקנון חומרים מראש (Kit) לכל הזמנה" },
];

const DAILY_THROUGHPUT = [
  { day: "א'", completed: 42, target: 45 }, { day: "ב'", completed: 48, target: 45 },
  { day: "ג'", completed: 38, target: 45 }, { day: "ד'", completed: 51, target: 45 },
  { day: "ה'", completed: 44, target: 45 }, { day: "ו'", completed: 29, target: 30 },
];

const WEEKLY_CYCLE = [
  { week: "שבוע 10", avgCycle: 6.2, target: 5.5 }, { week: "שבוע 11", avgCycle: 5.8, target: 5.5 },
  { week: "שבוע 12", avgCycle: 5.4, target: 5.5 }, { week: "שבוע 13", avgCycle: 5.9, target: 5.5 },
  { week: "שבוע 14", avgCycle: 5.1, target: 5.5 },
];

const priorityColor: Record<string, string> = {
  "רגיל": "bg-slate-500/20 text-slate-300", "דחוף": "bg-amber-500/20 text-amber-300", "קריטי": "bg-red-500/20 text-red-300",
};
const stationStatusColor: Record<string, string> = {
  "פעיל": "bg-emerald-500/20 text-emerald-300", "עומס": "bg-amber-500/20 text-amber-300", "תחזוקה": "bg-red-500/20 text-red-300",
};

export default function FabWorkflowTracker() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("live");

  const filteredOrders = useMemo(() => {
    if (!search) return ORDERS;
    const q = search.toLowerCase();
    return ORDERS.filter(o => o.id.toLowerCase().includes(q) || o.customer.includes(search) || o.product.includes(search));
  }, [search]);

  const kpis = [
    { label: "תהליכים פעילים", value: "10", icon: Activity, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "הזמנות בייצור", value: "24", icon: Package, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "תחנת צוואר בקבוק", value: "עיבוד שבבי", icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
    { label: "זמן מחזור ממוצע", value: "5.1 שעות", icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "אחוז עמידה בזמנים", value: "87.3%", icon: CheckCircle2, color: "text-teal-400", bg: "bg-teal-500/10" },
    { label: "ניצולת קיבולת", value: "82%", icon: Gauge, color: "text-rose-400", bg: "bg-rose-500/10" },
  ];

  const maxBar = Math.max(...DAILY_THROUGHPUT.map(d => Math.max(d.completed, d.target)));

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">מעקב תהליכי ייצור</h1>
          <p className="text-sm text-muted-foreground mt-1">ניטור בזמן אמת של זרימת הזמנות במפעל</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><RefreshCw className="w-4 h-4 ml-1" />רענון</Button>
          <Button size="sm" className="bg-primary"><ArrowLeftRight className="w-4 h-4 ml-1" />העבר תחנה</Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-lg ${k.bg}`}><k.icon className={`w-4 h-4 ${k.color}`} /></div>
              </div>
              <div className="text-xl font-bold text-foreground">{k.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card/50 border border-border/50">
          <TabsTrigger value="live">מעקב חי</TabsTrigger>
          <TabsTrigger value="stations">סקירת תחנות</TabsTrigger>
          <TabsTrigger value="bottleneck">ניתוח צווארי בקבוק</TabsTrigger>
          <TabsTrigger value="history">היסטוריה</TabsTrigger>
        </TabsList>

        {/* TAB 1 — Live Tracker */}
        <TabsContent value="live" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-400" />זרימת הזמנות בזמן אמת
                </CardTitle>
                <div className="relative w-64">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="חיפוש הזמנה..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9 bg-background/50" />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Station flow header */}
              <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-2">
                {STATIONS.map((s, i) => (
                  <div key={s} className="flex items-center gap-1">
                    <Badge variant="outline" className={`whitespace-nowrap text-xs ${STATION_COLORS[s]}`}>{s}</Badge>
                    {i < STATIONS.length - 1 && <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                {filteredOrders.map(order => (
                  <div key={order.id} className="flex items-center gap-4 p-3 rounded-lg bg-background/30 border border-border/30 hover:border-border/60 transition-colors">
                    <div className="w-24 shrink-0">
                      <span className="font-mono font-semibold text-sm text-foreground">{order.id}</span>
                      <Badge className={`${priorityColor[order.priority]} text-[10px] mr-1 mt-0.5`}>{order.priority}</Badge>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">{order.product}</div>
                      <div className="text-xs text-muted-foreground">{order.customer}</div>
                    </div>
                    <Badge className={`${STATION_COLORS[order.station]} whitespace-nowrap`}>{order.station}</Badge>
                    <div className="w-32 shrink-0">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>{order.progress}%</span>
                      </div>
                      <Progress value={order.progress} className="h-2" />
                    </div>
                    <div className="text-xs text-muted-foreground w-24 text-center shrink-0">
                      <Timer className="w-3 h-3 inline ml-1" />{order.timeAtStation}
                    </div>
                    {order.delay ? (
                      <Badge className="bg-red-500/20 text-red-300 text-xs whitespace-nowrap"><AlertTriangle className="w-3 h-3 ml-1" />{order.delay}</Badge>
                    ) : (
                      <Badge className="bg-emerald-500/20 text-emerald-300 text-xs whitespace-nowrap">תקין</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2 — Station Overview */}
        <TabsContent value="stations" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {WORKSTATIONS.map((ws, i) => (
              <Card key={`${ws.name}-${i}`} className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{ws.name}</CardTitle>
                    <Badge className={stationStatusColor[ws.status]}>{ws.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">עומק תור</span>
                    <span className={`font-semibold ${ws.queue > 5 ? "text-amber-400" : "text-foreground"}`}>{ws.queue} הזמנות</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">תפוקה / שעה</span>
                    <span className="font-semibold text-foreground">{ws.throughputPerHour} יח'</span>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">יעילות</span>
                      <span className={`font-semibold ${ws.efficiency >= 85 ? "text-emerald-400" : ws.efficiency >= 70 ? "text-amber-400" : "text-red-400"}`}>{ws.efficiency}%</span>
                    </div>
                    <Progress value={ws.efficiency} className="h-2" />
                  </div>
                  <div className="flex justify-between text-sm pt-1 border-t border-border/30">
                    <span className="text-muted-foreground">מפעיל</span>
                    <span className="text-foreground">{ws.operator}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 3 — Bottleneck Analysis */}
        <TabsContent value="bottleneck" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />ניתוח צווארי בקבוק — תחנות עם זמני המתנה גבוהים
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {BOTTLENECKS.map((b, i) => (
                <div key={b.station} className={`p-4 rounded-lg border ${i === 0 ? "bg-red-500/5 border-red-500/30" : "bg-background/30 border-border/30"}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${i === 0 ? "bg-red-500/20 text-red-300" : "bg-amber-500/20 text-amber-300"}`}>{i + 1}</div>
                      <div>
                        <div className="font-semibold text-foreground">{b.station}</div>
                        <div className="text-xs text-muted-foreground">עומק תור: {b.queueDepth} הזמנות</div>
                      </div>
                    </div>
                    <div className="flex gap-6 text-sm">
                      <div className="text-center">
                        <div className="text-muted-foreground text-xs">המתנה ממוצעת</div>
                        <div className="font-semibold text-amber-400">{b.avgWait}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-muted-foreground text-xs">המתנה מקסימלית</div>
                        <div className="font-semibold text-red-400">{b.maxWait}</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-2 rounded bg-background/50">
                    <Zap className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs text-muted-foreground">המלצה: </span>
                      <span className="text-sm text-foreground">{b.recommendation}</span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4 — Historical */}
        <TabsContent value="history" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Daily throughput */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-400" />תפוקה יומית — שבוע נוכחי</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {DAILY_THROUGHPUT.map(d => (
                    <div key={d.day} className="flex items-center gap-3">
                      <span className="w-8 text-sm text-muted-foreground font-medium">{d.day}</span>
                      <div className="flex-1 flex items-center gap-2">
                        <div className="flex-1 h-6 bg-background/30 rounded-full overflow-hidden relative">
                          <div className="h-full bg-blue-500/60 rounded-full transition-all" style={{ width: `${(d.completed / maxBar) * 100}%` }} />
                          <div className="absolute top-0 h-full border-l-2 border-dashed border-amber-400/50" style={{ left: `${(d.target / maxBar) * 100}%` }} />
                        </div>
                        <span className={`text-sm font-semibold w-8 ${d.completed >= d.target ? "text-emerald-400" : "text-red-400"}`}>{d.completed}</span>
                      </div>
                      {d.completed >= d.target ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/30 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-500/60" />בפועל</div>
                  <div className="flex items-center gap-1"><div className="w-3 h-0.5 border-t-2 border-dashed border-amber-400/50" style={{ width: 12 }} />יעד</div>
                </div>
              </CardContent>
            </Card>

            {/* Weekly cycle time */}
            <Card className="bg-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-purple-400" />זמן מחזור ממוצע — 5 שבועות אחרונים</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {WEEKLY_CYCLE.map(w => (
                    <div key={w.week} className="flex items-center gap-3">
                      <span className="w-20 text-sm text-muted-foreground">{w.week}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Progress value={(1 - (w.avgCycle - 4) / 3) * 100} className="h-3 flex-1" />
                          <span className={`text-sm font-semibold w-16 ${w.avgCycle <= w.target ? "text-emerald-400" : "text-amber-400"}`}>{w.avgCycle} שעות</span>
                        </div>
                      </div>
                      {w.avgCycle <= w.target ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Clock className="w-4 h-4 text-amber-400" />}
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">יעד זמן מחזור</span>
                  <span className="font-semibold text-foreground">5.5 שעות</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-muted-foreground">מגמה</span>
                  <span className="font-semibold text-emerald-400 flex items-center gap-1"><TrendingDown className="w-4 h-4" />שיפור של 17.7%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
