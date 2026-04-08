import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Gauge, Activity, Package, TrendingUp, TrendingDown, Target, Shield, Zap, Recycle, Users, Truck, BarChart3, Bell, AlertTriangle, CheckCircle2, XCircle, Download } from "lucide-react";

const liveKpis = [
  { id: "production", name: "תפוקת ייצור", value: 1185, target: 1200, unit: "יח'/יום", icon: Package, color: "text-blue-400", trend: "+3.2%", lowerBetter: false, gauge: 98.8 },
  { id: "quality", name: "שיעור איכות", value: 97.8, target: 98.0, unit: "%", icon: CheckCircle2, color: "text-green-400", trend: "+0.3%", lowerBetter: false, gauge: 97.8 },
  { id: "oee", name: "OEE כולל", value: 82.5, target: 85.0, unit: "%", icon: Gauge, color: "text-purple-400", trend: "+1.8%", lowerBetter: false, gauge: 82.5 },
  { id: "delivery", name: "אספקה בזמן", value: 93.2, target: 95.0, unit: "%", icon: Truck, color: "text-cyan-400", trend: "-0.5%", lowerBetter: false, gauge: 93.2 },
  { id: "safety", name: "אירועי בטיחות", value: 0, target: 0, unit: "אירועים", icon: Shield, color: "text-emerald-400", trend: "0", lowerBetter: true, gauge: 100 },
  { id: "energy", name: "צריכת אנרגיה", value: 42.8, target: 40.0, unit: "kWh/יח'", icon: Zap, color: "text-amber-400", trend: "-1.2%", lowerBetter: true, gauge: 93.5 },
  { id: "labor", name: "יעילות עבודה", value: 88.5, target: 90.0, unit: "%", icon: Users, color: "text-indigo-400", trend: "+2.1%", lowerBetter: false, gauge: 88.5 },
  { id: "waste", name: "שיעור פסולת", value: 3.8, target: 3.0, unit: "%", icon: Recycle, color: "text-red-400", trend: "-0.4%", lowerBetter: true, gauge: 78.9 },
];

const weeklyTrends = [
  {
    kpi: "תפוקת ייצור",
    data: [
      { week: "שבוע 10", value: 1120, target: 1200 },
      { week: "שבוע 11", value: 1150, target: 1200 },
      { week: "שבוע 12", value: 1100, target: 1200 },
      { week: "שבוע 13", value: 1180, target: 1200 },
      { week: "שבוע 14", value: 1185, target: 1200 },
    ],
    unit: "יח'",
    trend: "עלייה",
  },
  {
    kpi: "שיעור איכות",
    data: [
      { week: "שבוע 10", value: 97.2, target: 98.0 },
      { week: "שבוע 11", value: 97.5, target: 98.0 },
      { week: "שבוע 12", value: 97.0, target: 98.0 },
      { week: "שבוע 13", value: 97.6, target: 98.0 },
      { week: "שבוע 14", value: 97.8, target: 98.0 },
    ],
    unit: "%",
    trend: "עלייה",
  },
  {
    kpi: "OEE כולל",
    data: [
      { week: "שבוע 10", value: 79.5, target: 85.0 },
      { week: "שבוע 11", value: 80.2, target: 85.0 },
      { week: "שבוע 12", value: 78.8, target: 85.0 },
      { week: "שבוע 13", value: 81.5, target: 85.0 },
      { week: "שבוע 14", value: 82.5, target: 85.0 },
    ],
    unit: "%",
    trend: "עלייה",
  },
  {
    kpi: "אספקה בזמן",
    data: [
      { week: "שבוע 10", value: 94.0, target: 95.0 },
      { week: "שבוע 11", value: 93.8, target: 95.0 },
      { week: "שבוע 12", value: 92.5, target: 95.0 },
      { week: "שבוע 13", value: 93.5, target: 95.0 },
      { week: "שבוע 14", value: 93.2, target: 95.0 },
    ],
    unit: "%",
    trend: "יציב",
  },
  {
    kpi: "צריכת אנרגיה",
    data: [
      { week: "שבוע 10", value: 45.2, target: 40.0 },
      { week: "שבוע 11", value: 44.5, target: 40.0 },
      { week: "שבוע 12", value: 44.0, target: 40.0 },
      { week: "שבוע 13", value: 43.2, target: 40.0 },
      { week: "שבוע 14", value: 42.8, target: 40.0 },
    ],
    unit: "kWh",
    trend: "ירידה (חיובי)",
  },
  {
    kpi: "שיעור פסולת",
    data: [
      { week: "שבוע 10", value: 4.5, target: 3.0 },
      { week: "שבוע 11", value: 4.2, target: 3.0 },
      { week: "שבוע 12", value: 4.0, target: 3.0 },
      { week: "שבוע 13", value: 4.1, target: 3.0 },
      { week: "שבוע 14", value: 3.8, target: 3.0 },
    ],
    unit: "%",
    trend: "ירידה (חיובי)",
  },
];

const targetsVsActual = [
  { kpi: "תפוקת ייצור יומית", actual: 1185, target: 1200, unit: "יח'", gap: -15, pctAchieved: 98.8, status: "קרוב ליעד" },
  { kpi: "שיעור איכות מצטבר", actual: 97.8, target: 98.0, unit: "%", gap: -0.2, pctAchieved: 99.8, status: "קרוב ליעד" },
  { kpi: "OEE ממוצע", actual: 82.5, target: 85.0, unit: "%", gap: -2.5, pctAchieved: 97.1, status: "מתחת ליעד" },
  { kpi: "אספקה בזמן", actual: 93.2, target: 95.0, unit: "%", gap: -1.8, pctAchieved: 98.1, status: "מתחת ליעד" },
  { kpi: "אירועי בטיחות", actual: 0, target: 0, unit: "אירועים", gap: 0, pctAchieved: 100, status: "ביעד" },
  { kpi: "צריכת אנרגיה (kWh/יח')", actual: 42.8, target: 40.0, unit: "kWh", gap: 2.8, pctAchieved: 93.5, status: "חריגה" },
  { kpi: "יעילות עבודה", actual: 88.5, target: 90.0, unit: "%", gap: -1.5, pctAchieved: 98.3, status: "קרוב ליעד" },
  { kpi: "שיעור פסולת", actual: 3.8, target: 3.0, unit: "%", gap: 0.8, pctAchieved: 78.9, status: "חריגה" },
];

const alerts = [
  { id: "AL-001", kpi: "שיעור פסולת", message: "שיעור פסולת 3.8% חורג מהיעד 3.0%", severity: "גבוה", time: "10:30", threshold: "3.0%", actual: "3.8%", action: "בדיקת קו ציפוי - פסולת גבוהה בציפוי אבקתי" },
  { id: "AL-002", kpi: "צריכת אנרגיה", message: "צריכת אנרגיה 42.8 kWh/יח' מעל יעד 40.0", severity: "בינוני", time: "09:15", threshold: "40.0 kWh", actual: "42.8 kWh", action: "בדיקת תנור ציפוי - צריכה חריגה מאז תקלת החימום" },
  { id: "AL-003", kpi: "OEE", message: "OEE 82.5% מתחת ליעד 85.0% - שבוע רצוף", severity: "גבוה", time: "08:00", threshold: "85.0%", actual: "82.5%", action: "קו ציפוי מוריד ממוצע - תחזוקה מתמשכת" },
  { id: "AL-004", kpi: "אספקה בזמן", message: "ירידה לרמת 93.2% - מתחת ליעד 95.0%", severity: "בינוני", time: "07:45", threshold: "95.0%", actual: "93.2%", action: "3 הזמנות מאחרות בגלל עיכוב בקו ציפוי" },
  { id: "AL-005", kpi: "תפוקה", message: "קו ציפוי - תפוקה אפס בגלל תחזוקת חירום", severity: "קריטי", time: "08:30", threshold: "200 יח'/יום", actual: "0 יח'", action: "תנור ציפוי בתחזוקת חירום - צפי חזרה 11:00" },
  { id: "AL-006", kpi: "יעילות עבודה", message: "משמרת לילה - יעילות 82% מתחת לממוצע", severity: "נמוך", time: "06:15", threshold: "90%", actual: "82%", action: "עובד חדש באימון - צפי לשיפור תוך שבוע" },
];

const ASEV: Record<string, string> = {
  "קריטי": "bg-red-500/20 text-red-400 border-red-500/30",
  "גבוה": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "בינוני": "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "נמוך": "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const TSTAT: Record<string, string> = {
  "ביעד": "bg-green-500/20 text-green-400",
  "קרוב ליעד": "bg-yellow-500/20 text-yellow-400",
  "מתחת ליעד": "bg-orange-500/20 text-orange-400",
  "חריגה": "bg-red-500/20 text-red-400",
};

export default function KpiMonitor() {
  const [selectedKpi, setSelectedKpi] = useState("all");

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Gauge className="w-7 h-7 text-blue-400" />
            ניטור KPI תפעולי - זמן אמת
          </h1>
          <p className="text-sm text-muted-foreground mt-1">טכנו-כל עוזי - 8 מדדי ביצוע מרכזיים בזמן אמת</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download className="w-4 h-4 ml-1" />ייצוא</Button>
          <Button variant="outline" size="sm" className="relative">
            <Bell className="w-4 h-4 ml-1" />
            התראות
            <span className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">{alerts.length}</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {liveKpis.map((kpi) => {
          const isOnTarget = kpi.lowerBetter ? kpi.value <= kpi.target : kpi.value >= kpi.target;
          const nearTarget = kpi.lowerBetter
            ? kpi.value <= kpi.target * 1.1
            : kpi.value >= kpi.target * 0.95;
          return (
            <Card key={kpi.id} className={`bg-card/50 border-border/50 ${!isOnTarget && !nearTarget ? 'border-red-500/30' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                  <Badge className={isOnTarget ? "bg-green-500/20 text-green-400" : nearTarget ? "bg-yellow-500/20 text-yellow-400" : "bg-red-500/20 text-red-400"}>
                    {isOnTarget ? "ביעד" : nearTarget ? "קרוב" : "חריגה"}
                  </Badge>
                </div>
                <div className="text-2xl font-bold text-foreground">{kpi.value}<span className="text-sm text-muted-foreground mr-1">{kpi.unit}</span></div>
                <div className="text-xs text-muted-foreground mt-1">{kpi.name}</div>
                <div className="mt-2">
                  <Progress value={kpi.gauge} className="h-2" />
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">יעד: {kpi.target}{kpi.unit.includes('%') ? '%' : ` ${kpi.unit}`}</span>
                    <span className={`text-xs flex items-center gap-0.5 ${kpi.trend.includes('+') ? (kpi.lowerBetter ? 'text-red-400' : 'text-green-400') : kpi.trend.includes('-') ? (kpi.lowerBetter ? 'text-green-400' : 'text-red-400') : 'text-muted-foreground'}`}>
                      {kpi.trend.includes('+') ? <TrendingUp className="w-3 h-3" /> : kpi.trend.includes('-') ? <TrendingDown className="w-3 h-3" /> : null}
                      {kpi.trend}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="live" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="live">דשבורד חי</TabsTrigger>
          <TabsTrigger value="trends">מגמות שבועיות</TabsTrigger>
          <TabsTrigger value="targets">יעדים מול ביצוע</TabsTrigger>
          <TabsTrigger value="alerts">התראות ({alerts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {liveKpis.map((kpi) => {
              const isOnTarget = kpi.lowerBetter ? kpi.value <= kpi.target : kpi.value >= kpi.target;
              return (
                <Card key={kpi.id} className="bg-card/50 border-border/50">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                        <span className="font-medium text-foreground">{kpi.name}</span>
                      </div>
                      <Badge className={isOnTarget ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>
                        {isOnTarget ? "ביעד" : "חריגה"}
                      </Badge>
                    </div>
                    <div className="flex items-end gap-3 mb-3">
                      <span className={`text-4xl font-bold ${kpi.color}`}>{kpi.value}</span>
                      <span className="text-sm text-muted-foreground mb-1">{kpi.unit}</span>
                      <span className="mr-auto text-sm text-muted-foreground mb-1">יעד: {kpi.target}</span>
                    </div>
                    <Progress value={kpi.gauge} className="h-3 mb-2" />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>השגת יעד: {kpi.gauge.toFixed(1)}%</span>
                      <span className={`flex items-center gap-0.5 ${kpi.trend.includes('+') ? (kpi.lowerBetter ? 'text-red-400' : 'text-green-400') : kpi.trend.includes('-') ? (kpi.lowerBetter ? 'text-green-400' : 'text-red-400') : 'text-muted-foreground'}`}>
                        מגמה: {kpi.trend}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {weeklyTrends.map((t, i) => (
              <Card key={i} className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{t.kpi}</span>
                    <Badge variant="outline" className="text-xs">{t.trend}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {t.data.map((d, j) => {
                      const pct = (d.value / d.target) * 100;
                      return (
                        <div key={j} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-16">{d.week}</span>
                          <Progress value={Math.min(pct, 100)} className="h-2 flex-1" />
                          <span className={`text-xs font-medium w-16 text-left ${pct >= 100 ? 'text-green-400' : pct >= 95 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {d.value} {t.unit}
                          </span>
                        </div>
                      );
                    })}
                    <div className="text-xs text-muted-foreground mt-1 pt-1 border-t border-border/30">
                      יעד: {t.data[0].target} {t.unit}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="targets" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target className="w-5 h-5 text-blue-400" />יעדים מול ביצוע בפועל</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-right p-3 text-muted-foreground font-medium">KPI</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">בפועל</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">יעד</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">פער</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">השגה</th>
                      <th className="text-center p-3 text-muted-foreground font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targetsVsActual.map((t, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-card/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{t.kpi}</td>
                        <td className="p-3 text-foreground font-medium">{t.actual} {t.unit}</td>
                        <td className="p-3 text-muted-foreground">{t.target} {t.unit}</td>
                        <td className="p-3">
                          <span className={t.gap === 0 ? 'text-green-400' : t.gap < 0 ? 'text-amber-400' : 'text-red-400'}>
                            {t.gap > 0 ? '+' : ''}{t.gap} {t.unit}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <Progress value={t.pctAchieved} className="h-2 w-20" />
                            <span className="text-xs font-medium">{t.pctAchieved}%</span>
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <Badge className={TSTAT[t.status]}>{t.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-400" />התראות חריגה ממדדים ({alerts.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {alerts.map(a => (
                  <div key={a.id} className={`p-4 rounded-lg border ${ASEV[a.severity].includes('red') ? 'bg-red-500/5 border-red-500/20' : ASEV[a.severity].includes('orange') ? 'bg-orange-500/5 border-orange-500/20' : ASEV[a.severity].includes('yellow') ? 'bg-yellow-500/5 border-yellow-500/20' : 'bg-blue-500/5 border-blue-500/20'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Badge className={ASEV[a.severity]}>{a.severity}</Badge>
                        <span className="font-medium text-foreground">{a.kpi}</span>
                        <span className="text-xs text-muted-foreground">{a.time}</span>
                      </div>
                      <Badge variant="outline" className="text-xs font-mono">{a.id}</Badge>
                    </div>
                    <p className="text-sm text-foreground mb-2">{a.message}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>סף: {a.threshold}</span>
                      <span>בפועל: <span className="text-red-400">{a.actual}</span></span>
                    </div>
                    <div className="mt-2 p-2 rounded bg-background/30 text-xs text-muted-foreground">
                      <span className="text-foreground font-medium">פעולה נדרשת: </span>{a.action}
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
