import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Users, DollarSign, TrendingUp, TrendingDown, Target, AlertTriangle,
  Flame, Award, BarChart3, Activity, CheckCircle, XCircle, Clock,
  ArrowUpRight, ArrowDownRight, Eye, ChevronRight, Crown, Skull
} from "lucide-react";
import { useLocation } from "wouter";

// ============================================================
// AGENT DATA
// ============================================================
const agents = [
  {
    id: 1, name: "דני כהן", team: "צוות A", status: "active", grade: "A",
    leadsReceived: 85, leadsHandled: 78, leadsBurned: 5, meetings: 32, meetingsHeld: 28, dealsClosed: 12,
    revenue: 1850000, avgDeal: 154167, conversionRate: 14.1, burnRate: 5.9, closingRatio: 42.9,
    responseTimeMin: 12, efficiency: 88, costTotal: 42000, profit: 1808000, roi: 43.0,
    isProfitable: true, trend: "up", alerts: 0
  },
  {
    id: 2, name: "מיכל לוי", team: "צוות A", status: "active", grade: "B",
    leadsReceived: 72, leadsHandled: 65, leadsBurned: 8, meetings: 25, meetingsHeld: 20, dealsClosed: 8,
    revenue: 980000, avgDeal: 122500, conversionRate: 11.1, burnRate: 11.1, closingRatio: 40.0,
    responseTimeMin: 25, efficiency: 72, costTotal: 38000, profit: 942000, roi: 24.8,
    isProfitable: true, trend: "stable", alerts: 1
  },
  {
    id: 3, name: "יוסי אברהם", team: "צוות B", status: "active", grade: "C",
    leadsReceived: 60, leadsHandled: 42, leadsBurned: 15, meetings: 18, meetingsHeld: 14, dealsClosed: 4,
    revenue: 420000, avgDeal: 105000, conversionRate: 6.7, burnRate: 25.0, closingRatio: 28.6,
    responseTimeMin: 48, efficiency: 52, costTotal: 35000, profit: 385000, roi: 11.0,
    isProfitable: true, trend: "down", alerts: 3
  },
  {
    id: 4, name: "שרה גולד", team: "צוות B", status: "probation", grade: "D",
    leadsReceived: 55, leadsHandled: 30, leadsBurned: 22, meetings: 10, meetingsHeld: 6, dealsClosed: 1,
    revenue: 85000, avgDeal: 85000, conversionRate: 1.8, burnRate: 40.0, closingRatio: 16.7,
    responseTimeMin: 120, efficiency: 28, costTotal: 32000, profit: 53000, roi: 1.7,
    isProfitable: true, trend: "down", alerts: 5
  },
  {
    id: 5, name: "אלון דוד", team: "צוות A", status: "active", grade: "F",
    leadsReceived: 45, leadsHandled: 18, leadsBurned: 25, meetings: 5, meetingsHeld: 3, dealsClosed: 0,
    revenue: 0, avgDeal: 0, conversionRate: 0, burnRate: 55.6, closingRatio: 0,
    responseTimeMin: 240, efficiency: 12, costTotal: 30000, profit: -30000, roi: -100,
    isProfitable: false, trend: "down", alerts: 8
  },
];

const totalLeads = agents.reduce((s, a) => s + a.leadsReceived, 0);
const totalBurned = agents.reduce((s, a) => s + a.leadsBurned, 0);
const totalRevenue = agents.reduce((s, a) => s + a.revenue, 0);
const totalCost = agents.reduce((s, a) => s + a.costTotal, 0);
const avgConversion = totalLeads > 0 ? (agents.reduce((s, a) => s + a.dealsClosed, 0) / totalLeads * 100) : 0;
const avgBurnRate = totalLeads > 0 ? (totalBurned / totalLeads * 100) : 0;

const criticalAlerts = [
  { agent: "אלון דוד", type: "🔥 שריפת לידים קריטית", detail: "55.6% burn rate - 25 לידים שרופים", severity: "critical" },
  { agent: "אלון דוד", type: "❌ ROI שלילי", detail: "₪-30,000 הפסד - אפס סגירות", severity: "critical" },
  { agent: "אלון דוד", type: "⏰ זמן תגובה איטי", detail: "240 דקות ממוצע (יעד: 30)", severity: "critical" },
  { agent: "שרה גולד", type: "🔥 burn rate גבוה", detail: "40% - 22 לידים שרופים", severity: "high" },
  { agent: "שרה גולד", type: "📉 המרה נמוכה", detail: "1.8% (יעד: 10%)", severity: "high" },
  { agent: "יוסי אברהם", type: "📉 מגמת ירידה", detail: "הכנסות ירדו 25% מחודש קודם", severity: "medium" },
  { agent: "מיכל לוי", type: "⚠️ burn rate עולה", detail: "11.1% - מעל יעד 10%", severity: "medium" },
];

const fmt = (v: number) => v >= 1000000 ? `₪${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `₪${(v / 1000).toFixed(0)}K` : `₪${v}`;

const gradeColor = (g: string) => {
  if (g === "A" || g === "A_plus") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (g === "B") return "bg-blue-100 text-blue-800 border-blue-300";
  if (g === "C") return "bg-amber-100 text-amber-800 border-amber-300";
  if (g === "D") return "bg-orange-100 text-orange-800 border-orange-300";
  return "bg-red-100 text-red-800 border-red-300";
};

export default function AgentControlDashboard() {
  const [, navigate] = useLocation();
  const [period, setPeriod] = useState("monthly");

  return (
    <div className="p-6 space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" /> Agent Control Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            שליטה מלאה | כל סוכן = השקעה | burn rate | ROI | profitability
          </p>
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="daily">יומי</SelectItem>
            <SelectItem value="weekly">שבועי</SelectItem>
            <SelectItem value="monthly">חודשי</SelectItem>
            <SelectItem value="quarterly">רבעוני</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-7 gap-2">
        {[
          { label: "סוכנים", value: String(agents.length), icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "לידים", value: String(totalLeads), icon: Target, color: "text-indigo-600", bg: "bg-indigo-50" },
          { label: "הכנסות", value: fmt(totalRevenue), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "המרה", value: `${avgConversion.toFixed(1)}%`, icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "🔥 Burn Rate", value: `${avgBurnRate.toFixed(1)}%`, icon: Flame, color: "text-red-600", bg: "bg-red-50" },
          { label: "עלות כוללת", value: fmt(totalCost), icon: TrendingDown, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "התראות", value: String(criticalAlerts.filter(a => a.severity === "critical").length), icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg}/40`}>
              <CardContent className="pt-2 pb-1.5 text-center">
                <Icon className={`h-4 w-4 mx-auto ${kpi.color} mb-0.5`} />
                <p className="text-[9px] text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-bold font-mono">{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs defaultValue="table">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="table" className="text-xs gap-1"><BarChart3 className="h-3.5 w-3.5" /> טבלת סוכנים</TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs gap-1"><AlertTriangle className="h-3.5 w-3.5" /> התראות ({criticalAlerts.length})</TabsTrigger>
          <TabsTrigger value="leaderboard" className="text-xs gap-1"><Crown className="h-3.5 w-3.5" /> דירוג</TabsTrigger>
          <TabsTrigger value="burn" className="text-xs gap-1"><Flame className="h-3.5 w-3.5" /> שריפת לידים</TabsTrigger>
        </TabsList>

        {/* Agent Performance Table */}
        <TabsContent value="table">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead className="text-right text-[10px] font-semibold">Grade</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">סוכן</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">לידים</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">🔥 שרופים</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">פגישות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">סגירות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">הכנסות</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">המרה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">Burn %</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">תגובה</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">ROI</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">רווח</TableHead>
                      <TableHead className="text-right text-[10px] font-semibold">מגמה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agents.sort((a, b) => b.revenue - a.revenue).map(agent => (
                      <TableRow
                        key={agent.id}
                        className={`cursor-pointer hover:bg-accent ${!agent.isProfitable ? "bg-red-50/40" : agent.grade === "A" ? "bg-emerald-50/20" : ""}`}
                        onClick={() => navigate(`/crm/agent/${agent.id}`)}
                      >
                        <TableCell>
                          <Badge className={`${gradeColor(agent.grade)} text-xs font-bold w-8 justify-center`}>{agent.grade}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="text-xs font-medium">{agent.name}</p>
                            <p className="text-[9px] text-muted-foreground">{agent.team}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{agent.leadsReceived}</TableCell>
                        <TableCell className={`font-mono text-xs font-bold ${agent.burnRate > 20 ? "text-red-600" : agent.burnRate > 10 ? "text-amber-600" : "text-emerald-600"}`}>
                          {agent.leadsBurned}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{agent.meetingsHeld}/{agent.meetings}</TableCell>
                        <TableCell className="font-mono text-xs font-bold">{agent.dealsClosed}</TableCell>
                        <TableCell className="font-mono text-xs font-bold">{fmt(agent.revenue)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[9px] font-mono ${agent.conversionRate >= 10 ? "text-emerald-600" : agent.conversionRate >= 5 ? "text-amber-600" : "text-red-600"}`}>
                            {agent.conversionRate.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[9px] font-mono ${agent.burnRate > 20 ? "bg-red-100 text-red-700" : agent.burnRate > 10 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                            {agent.burnRate.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className={`font-mono text-[10px] ${agent.responseTimeMin > 60 ? "text-red-600 font-bold" : ""}`}>
                          {agent.responseTimeMin}m
                        </TableCell>
                        <TableCell className={`font-mono text-xs font-bold ${agent.roi < 0 ? "text-red-600" : agent.roi > 20 ? "text-emerald-600" : ""}`}>
                          {agent.roi.toFixed(0)}%
                        </TableCell>
                        <TableCell className={`font-mono text-xs font-bold ${agent.profit < 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {fmt(agent.profit)}
                        </TableCell>
                        <TableCell>
                          {agent.trend === "up" ? <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                            : agent.trend === "down" ? <ArrowDownRight className="h-4 w-4 text-red-500" />
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts */}
        <TabsContent value="alerts">
          <Card>
            <CardContent className="pt-4">
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {criticalAlerts.map((alert, i) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${
                      alert.severity === "critical" ? "border-red-300 bg-red-50/50" :
                      alert.severity === "high" ? "border-orange-300 bg-orange-50/50" :
                      "border-amber-300 bg-amber-50/50"
                    }`}>
                      {alert.severity === "critical" ? <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                        : alert.severity === "high" ? <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0" />
                        : <Clock className="h-5 w-5 text-amber-500 shrink-0" />}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{alert.agent}</span>
                          <span className="text-xs">{alert.type}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{alert.detail}</p>
                      </div>
                      <Badge className={
                        alert.severity === "critical" ? "bg-red-100 text-red-700" :
                        alert.severity === "high" ? "bg-orange-100 text-orange-700" :
                        "bg-amber-100 text-amber-700"
                      }>{alert.severity}</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Leaderboard */}
        <TabsContent value="leaderboard">
          <div className="grid grid-cols-2 gap-4">
            {/* Top Performers */}
            <Card className="border-emerald-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" /> Top Performers</CardTitle>
              </CardHeader>
              <CardContent>
                {agents.filter(a => a.grade === "A" || a.grade === "B").sort((a, b) => b.revenue - a.revenue).map((a, i) => (
                  <div key={a.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <span className="text-lg font-bold text-amber-500 w-6">#{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-[10px] text-muted-foreground">{fmt(a.revenue)} | {a.conversionRate}% conversion | ROI {a.roi}%</p>
                    </div>
                    <Badge className={gradeColor(a.grade)}>{a.grade}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Underperformers */}
            <Card className="border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Skull className="h-4 w-4 text-red-500" /> נדרש שיפור / החלפה</CardTitle>
              </CardHeader>
              <CardContent>
                {agents.filter(a => a.grade === "D" || a.grade === "F").sort((a, b) => a.roi - b.roi).map((a, i) => (
                  <div key={a.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                    <Flame className="h-5 w-5 text-red-500" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-[10px] text-red-600">
                        Burn: {a.burnRate}% | ROI: {a.roi}% | {a.leadsBurned} לידים שרופים | {a.alerts} התראות
                      </p>
                    </div>
                    <Badge className={gradeColor(a.grade)}>{a.grade}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Burn Analysis */}
        <TabsContent value="burn">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2"><Flame className="h-4 w-4 text-red-500" /> ניתוח שריפת לידים 🔥</CardTitle>
              <CardDescription>כל ליד שרוף = כסף שאבד</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <Card className="border-red-200 bg-red-50/30">
                  <CardContent className="pt-3 pb-2 text-center">
                    <p className="text-[10px] text-red-700">לידים שרופים</p>
                    <p className="text-3xl font-bold text-red-800">{totalBurned}</p>
                    <p className="text-[10px] text-red-600">{avgBurnRate.toFixed(1)}% מכלל הלידים</p>
                  </CardContent>
                </Card>
                <Card className="border-red-200 bg-red-50/30">
                  <CardContent className="pt-3 pb-2 text-center">
                    <p className="text-[10px] text-red-700">ערך אבוד (משוער)</p>
                    <p className="text-3xl font-bold font-mono text-red-800">{fmt(totalBurned * 15000)}</p>
                    <p className="text-[10px] text-red-600">ב-₪15K ממוצע לליד</p>
                  </CardContent>
                </Card>
                <Card className="border-amber-200 bg-amber-50/30">
                  <CardContent className="pt-3 pb-2 text-center">
                    <p className="text-[10px] text-amber-700">הסוכן הכי שורף</p>
                    <p className="text-xl font-bold text-amber-800">אלון דוד</p>
                    <p className="text-[10px] text-red-600">55.6% burn rate</p>
                  </CardContent>
                </Card>
              </div>

              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-right text-[10px]">סוכן</TableHead>
                    <TableHead className="text-right text-[10px]">לידים</TableHead>
                    <TableHead className="text-right text-[10px]">🔥 שרופים</TableHead>
                    <TableHead className="text-right text-[10px]">Burn Rate</TableHead>
                    <TableHead className="text-right text-[10px]">ערך אבוד</TableHead>
                    <TableHead className="text-right text-[10px] w-32">חומרה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.sort((a, b) => b.burnRate - a.burnRate).map(a => (
                    <TableRow key={a.id} className={a.burnRate > 20 ? "bg-red-50/30" : ""}>
                      <TableCell className="font-medium text-xs">{a.name}</TableCell>
                      <TableCell className="font-mono text-xs">{a.leadsReceived}</TableCell>
                      <TableCell className="font-mono text-xs font-bold text-red-600">{a.leadsBurned}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Progress value={a.burnRate} className={`h-2 w-16 ${a.burnRate > 20 ? "[&>div]:bg-red-500" : a.burnRate > 10 ? "[&>div]:bg-amber-500" : ""}`} />
                          <span className="font-mono text-[10px] font-bold">{a.burnRate.toFixed(1)}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-red-600">{fmt(a.leadsBurned * 15000)}</TableCell>
                      <TableCell>
                        <Progress value={Math.min(100, a.burnRate * 2)} className={`h-3 ${a.burnRate > 30 ? "[&>div]:bg-red-600" : a.burnRate > 15 ? "[&>div]:bg-orange-500" : a.burnRate > 8 ? "[&>div]:bg-amber-400" : "[&>div]:bg-emerald-400"}`} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
