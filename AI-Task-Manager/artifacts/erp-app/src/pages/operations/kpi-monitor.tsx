import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Target, Activity, Gauge, Timer, Package, Users } from "lucide-react";

export default function KPIMonitor() {
  const kpis = [
    { name: "OEE - יעילות ציוד", value: 82, target: 85, unit: "%", trend: "up", icon: Gauge, color: "text-blue-600" },
    { name: "זמן אספקה ממוצע", value: 3.2, target: 3.0, unit: "ימים", trend: "down", icon: Timer, color: "text-green-600" },
    { name: "שיעור פגמים", value: 1.8, target: 2.0, unit: "%", trend: "down", icon: Target, color: "text-amber-600" },
    { name: "עמידה בלו\"ז", value: 91, target: 95, unit: "%", trend: "up", icon: Activity, color: "text-purple-600" },
    { name: "תפוקה יומית", value: 1250, target: 1200, unit: "יח'", trend: "up", icon: Package, color: "text-indigo-600" },
    { name: "נוכחות עובדים", value: 94, target: 96, unit: "%", trend: "stable", icon: Users, color: "text-teal-600" },
  ];

  const getStatusColor = (value: number, target: number, lowerIsBetter: boolean = false) => {
    const ratio = lowerIsBetter ? target / value : value / target;
    if (ratio >= 1) return "text-green-600";
    if (ratio >= 0.9) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Gauge className="h-7 w-7" /> ניטור KPI תפעולי
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {kpis.map((kpi, i) => {
          const lowerIsBetter = kpi.name.includes("פגמים") || kpi.name.includes("זמן");
          const isOnTarget = lowerIsBetter ? kpi.value <= kpi.target : kpi.value >= kpi.target;
          const progressValue = lowerIsBetter
            ? Math.min(100, (kpi.target / kpi.value) * 100)
            : Math.min(100, (kpi.value / kpi.target) * 100);

          return (
            <Card key={i} className={isOnTarget ? "border-green-200" : "border-amber-200"}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                    {kpi.name}
                  </CardTitle>
                  {isOnTarget
                    ? <Badge className="bg-green-100 text-green-700">ביעד</Badge>
                    : <Badge className="bg-amber-100 text-amber-700">מתחת ליעד</Badge>
                  }
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 mb-3">
                  <span className={`text-4xl font-bold ${getStatusColor(kpi.value, kpi.target, lowerIsBetter)}`}>
                    {kpi.value}
                  </span>
                  <span className="text-muted-foreground mb-1">{kpi.unit}</span>
                  <span className="text-sm text-muted-foreground mb-1 mr-auto">יעד: {kpi.target}{kpi.unit}</span>
                  {kpi.trend === "up" && <TrendingUp className="h-5 w-5 text-green-500 mb-1" />}
                  {kpi.trend === "down" && <TrendingDown className="h-5 w-5 text-red-500 mb-1" />}
                </div>
                <Progress value={progressValue} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">{Math.round(progressValue)}% מהיעד</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
