import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Wrench, Calendar, AlertTriangle, Clock, DollarSign,
  CheckCircle2, Timer, TrendingUp, Bell, Fuel, ShieldCheck, CircleDot
} from "lucide-react";

const TABS = ["לו\"ז", "היסטוריה", "עלויות", "התראות"] as const;
type Tab = typeof TABS[number];

const STATUS_COLORS: Record<string, string> = {
  "מתוכנן": "bg-blue-500/20 text-blue-300 border-blue-500/40",
  "בביצוע": "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  "הושלם": "bg-green-500/20 text-green-300 border-green-500/40",
  "באיחור": "bg-red-500/20 text-red-300 border-red-500/40",
};

const URGENCY_COLORS: Record<string, string> = {
  "גבוהה": "bg-red-500/20 text-red-300",
  "בינונית": "bg-yellow-500/20 text-yellow-300",
  "נמוכה": "bg-green-500/20 text-green-300",
};

const fmt = (n: number) => "₪" + n.toLocaleString("he-IL");

const scheduleData = [
  { vehicle: "משאית 12-345-67", type: "החלפת שמן", date: "2026-04-15", kmNext: 5200, urgency: "בינונית", status: "מתוכנן" },
  { vehicle: "משאית 23-456-78", type: "בלמים", date: "2026-04-10", kmNext: 1800, urgency: "גבוהה", status: "בביצוע" },
  { vehicle: "ואן 34-567-89", type: "צמיגים", date: "2026-04-20", kmNext: 8400, urgency: "נמוכה", status: "מתוכנן" },
  { vehicle: "פיקאפ 45-678-90", type: "טסט שנתי", date: "2026-04-12", kmNext: 0, urgency: "גבוהה", status: "באיחור" },
  { vehicle: "משאית 56-789-01", type: "כללי", date: "2026-04-25", kmNext: 12000, urgency: "נמוכה", status: "מתוכנן" },
  { vehicle: "ואן 67-890-12", type: "החלפת שמן", date: "2026-04-18", kmNext: 4600, urgency: "בינונית", status: "הושלם" },
  { vehicle: "משאית 78-901-23", type: "בלמים", date: "2026-04-08", kmNext: 900, urgency: "גבוהה", status: "בביצוע" },
  { vehicle: "פיקאפ 89-012-34", type: "צמיגים", date: "2026-04-30", kmNext: 15000, urgency: "נמוכה", status: "מתוכנן" },
];

const historyData = [
  { date: "2026-03-28", vehicle: "משאית 12-345-67", type: "החלפת שמן", garage: "מוסך אבי", cost: 850, parts: "פילטר שמן, שמן 10W-40", downtime: 0.5 },
  { date: "2026-03-22", vehicle: "ואן 34-567-89", type: "בלמים", garage: "מוסך המפרץ", cost: 2200, parts: "רפידות בלם קדמיות", downtime: 1 },
  { date: "2026-03-15", vehicle: "משאית 23-456-78", type: "צמיגים", garage: "צמיגי השרון", cost: 3600, parts: "4 צמיגים 315/80R22.5", downtime: 0.5 },
  { date: "2026-03-10", vehicle: "פיקאפ 45-678-90", type: "כללי", garage: "מוסך אבי", cost: 1500, parts: "רצועת טיימינג, משאבת מים", downtime: 2 },
  { date: "2026-03-05", vehicle: "משאית 56-789-01", type: "טסט שנתי", garage: "מכון בדיקה ראשי", cost: 320, parts: "-", downtime: 1 },
  { date: "2026-02-28", vehicle: "ואן 67-890-12", type: "החלפת שמן", garage: "מוסך המפרץ", cost: 650, parts: "פילטר שמן, פילטר אוויר", downtime: 0.5 },
  { date: "2026-02-20", vehicle: "משאית 78-901-23", type: "בלמים", garage: "מוסך אבי", cost: 2800, parts: "דיסקים ורפידות אחוריים", downtime: 1.5 },
  { date: "2026-02-15", vehicle: "פיקאפ 89-012-34", type: "כללי", garage: "מוסך המפרץ", cost: 1100, parts: "תרמוסטט, צינור מים", downtime: 1 },
  { date: "2026-02-08", vehicle: "משאית 12-345-67", type: "צמיגים", garage: "צמיגי השרון", cost: 4200, parts: "6 צמיגים 295/80R22.5", downtime: 1 },
  { date: "2026-01-30", vehicle: "ואן 34-567-89", type: "החלפת שמן", garage: "מוסך אבי", cost: 720, parts: "פילטר שמן", downtime: 0.5 },
];

const alerts = [
  { vehicle: "פיקאפ 45-678-90", message: "טסט שנתי באיחור של 4 ימים!", urgency: "גבוהה", date: "2026-04-08" },
  { vehicle: "משאית 78-901-23", message: "טיפול בלמים - ק\"מ קריטי (900 ק\"מ נותרו)", urgency: "גבוהה", date: "2026-04-08" },
  { vehicle: "משאית 12-345-67", message: "החלפת שמן מתוכננת בעוד 7 ימים", urgency: "בינונית", date: "2026-04-15" },
  { vehicle: "ואן 34-567-89", message: "החלפת צמיגים מתוכננת בעוד 12 יום", urgency: "נמוכה", date: "2026-04-20" },
  { vehicle: "משאית 56-789-01", message: "טיפול כללי מתוכנן בעוד 17 יום", urgency: "נמוכה", date: "2026-04-25" },
];

const kpis = [
  { label: "טיפולים מתוכננים", value: "4", icon: Calendar, color: "text-blue-400" },
  { label: "בוצעו החודש", value: "3", icon: CheckCircle2, color: "text-green-400" },
  { label: "חירום", value: "1", icon: AlertTriangle, color: "text-red-400" },
  { label: "עלות תחזוקה חודשית", value: fmt(8200), icon: DollarSign, color: "text-amber-400" },
  { label: "ממוצע זמן השבתה", value: "1.5 ימים", icon: Timer, color: "text-purple-400" },
];

export default function VehicleMaintenance() {
  const [tab, setTab] = useState<Tab>("לו\"ז");

  const totalHistoryCost = historyData.reduce((s, h) => s + h.cost, 0);
  const preventiveCost = historyData
    .filter(h => ["החלפת שמן", "צמיגים", "טסט שנתי"].includes(h.type))
    .reduce((s, h) => s + h.cost, 0);
  const breakdownCost = totalHistoryCost - preventiveCost;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-orange-500/20 rounded-lg">
          <Wrench className="w-6 h-6 text-orange-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">תחזוקת כלי רכב</h1>
          <p className="text-sm text-muted-foreground">טכנו-כל עוזי — ניהול תחזוקה מונעת ותיקונים</p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="bg-card/50 border-border/50">
            <CardContent className="p-4 flex flex-col items-center text-center gap-1">
              <k.icon className={`w-5 h-5 ${k.color}`} />
              <span className="text-xl font-bold text-foreground">{k.value}</span>
              <span className="text-xs text-muted-foreground">{k.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Preventive vs Breakdown */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            תחזוקה מונעת מול תיקוני תקלות
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <ShieldCheck className="w-5 h-5 text-green-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-green-300">80%</div>
              <div className="text-xs text-muted-foreground">תחזוקה מונעת</div>
              <div className="text-sm font-semibold text-green-400 mt-1">{fmt(preventiveCost)}</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-5 h-5 text-red-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-red-300">20%</div>
              <div className="text-xs text-muted-foreground">תיקוני תקלות</div>
              <div className="text-sm font-semibold text-red-400 mt-1">{fmt(breakdownCost)}</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <DollarSign className="w-5 h-5 text-blue-400 mx-auto mb-1" />
              <div className="text-lg font-bold text-blue-300">{fmt(totalHistoryCost)}</div>
              <div className="text-xs text-muted-foreground">סה״כ עלות תחזוקה</div>
              <div className="text-sm text-muted-foreground mt-1">10 טיפולים</div>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>תחזוקה מונעת</span>
              <span>80%</span>
            </div>
            <Progress value={80} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted/30 rounded-lg w-fit">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "לו\"ז" && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              לוח זמנים — טיפולים מתוכננים
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="text-right py-3 px-2 font-medium">רכב</th>
                    <th className="text-right py-3 px-2 font-medium">סוג טיפול</th>
                    <th className="text-right py-3 px-2 font-medium">תאריך מתוכנן</th>
                    <th className="text-right py-3 px-2 font-medium">ק״מ לטיפול הבא</th>
                    <th className="text-right py-3 px-2 font-medium">דחיפות</th>
                    <th className="text-right py-3 px-2 font-medium">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleData.map((r, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-2.5 px-2 font-medium text-foreground">{r.vehicle}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{r.type}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{r.date}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">
                        {r.kmNext > 0 ? r.kmNext.toLocaleString("he-IL") : "—"}
                      </td>
                      <td className="py-2.5 px-2">
                        <Badge className={URGENCY_COLORS[r.urgency]}>{r.urgency}</Badge>
                      </td>
                      <td className="py-2.5 px-2">
                        <Badge className={STATUS_COLORS[r.status]}>{r.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "היסטוריה" && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-400" />
              היסטוריית תחזוקה
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="text-right py-3 px-2 font-medium">תאריך</th>
                    <th className="text-right py-3 px-2 font-medium">רכב</th>
                    <th className="text-right py-3 px-2 font-medium">סוג טיפול</th>
                    <th className="text-right py-3 px-2 font-medium">מוסך</th>
                    <th className="text-right py-3 px-2 font-medium">עלות</th>
                    <th className="text-right py-3 px-2 font-medium">חלקים שהוחלפו</th>
                    <th className="text-right py-3 px-2 font-medium">ימי השבתה</th>
                  </tr>
                </thead>
                <tbody>
                  {historyData.map((r, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                      <td className="py-2.5 px-2 text-muted-foreground">{r.date}</td>
                      <td className="py-2.5 px-2 font-medium text-foreground">{r.vehicle}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{r.type}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{r.garage}</td>
                      <td className="py-2.5 px-2 font-semibold text-amber-400">{fmt(r.cost)}</td>
                      <td className="py-2.5 px-2 text-muted-foreground text-xs">{r.parts}</td>
                      <td className="py-2.5 px-2 text-muted-foreground">{r.downtime}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "עלויות" && (
        <div className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" />
                פירוט עלויות לפי סוג טיפול
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {["החלפת שמן", "בלמים", "צמיגים", "טסט שנתי", "כללי"].map(type => {
                const items = historyData.filter(h => h.type === type);
                const total = items.reduce((s, h) => s + h.cost, 0);
                const pct = totalHistoryCost > 0 ? Math.round((total / totalHistoryCost) * 100) : 0;
                return (
                  <div key={type} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-muted-foreground">{type}</span>
                    <div className="flex-1">
                      <Progress value={pct} className="h-2" />
                    </div>
                    <span className="w-20 text-left text-sm font-semibold text-foreground">{fmt(total)}</span>
                    <span className="w-12 text-left text-xs text-muted-foreground">{pct}%</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Fuel className="w-4 h-4 text-blue-400" />
                עלות לפי רכב
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from(new Set(historyData.map(h => h.vehicle))).map(v => {
                const total = historyData.filter(h => h.vehicle === v).reduce((s, h) => s + h.cost, 0);
                const pct = totalHistoryCost > 0 ? Math.round((total / totalHistoryCost) * 100) : 0;
                return (
                  <div key={v} className="flex items-center gap-3">
                    <span className="w-36 text-sm text-muted-foreground truncate">{v}</span>
                    <div className="flex-1">
                      <Progress value={pct} className="h-2" />
                    </div>
                    <span className="w-20 text-left text-sm font-semibold text-foreground">{fmt(total)}</span>
                    <span className="w-12 text-left text-xs text-muted-foreground">{pct}%</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "התראות" && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-red-400" />
              התראות תחזוקה קרובה
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.map((a, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border ${
                  a.urgency === "גבוהה"
                    ? "bg-red-500/10 border-red-500/30"
                    : a.urgency === "בינונית"
                    ? "bg-yellow-500/10 border-yellow-500/30"
                    : "bg-blue-500/10 border-blue-500/30"
                }`}
              >
                <CircleDot className={`w-4 h-4 mt-0.5 ${
                  a.urgency === "גבוהה" ? "text-red-400" : a.urgency === "בינונית" ? "text-yellow-400" : "text-blue-400"
                }`} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm">{a.vehicle}</span>
                    <Badge className={URGENCY_COLORS[a.urgency] + " text-xs"}>{a.urgency}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{a.message}</p>
                  <span className="text-xs text-muted-foreground">{a.date}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
