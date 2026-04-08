import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Users, DollarSign, TrendingUp, TrendingDown, Target, AlertTriangle,
  Flame, Award, BarChart3, Activity, CheckCircle, XCircle, Clock,
  ArrowUpRight, ArrowDownRight, Eye, ChevronRight, Crown, Skull,
  Phone, Calendar, Zap, Shield, Percent, Gauge, Hash,
  UserCheck, Ban, Star, Medal, ArrowRight
} from "lucide-react";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";

// ============================================================
// AGENT DATA - Full P&L per agent
// ============================================================
interface Agent {
  id: number;
  name: string;
  team: string;
  status: "active" | "probation" | "suspended";
  grade: string;
  photo?: string;

  // Volume
  leadsReceived: number;
  leadsHandled: number;
  leadsBurned: number;
  leadsConverted: number;

  // Activity
  callsMade: number;
  callsAnswered: number;
  meetings: number;
  meetingsHeld: number;
  meetingsNoShow: number;
  followupsDone: number;
  followupsMissed: number;
  proposalsSent: number;

  // Conversion
  dealsClosed: number;
  dealsLost: number;
  avgDealSize: number;
  avgDealCycleDays: number;

  // Financial
  revenue: number;
  grossProfit: number;
  costSalary: number;
  costCommission: number;
  costOverhead: number;
  costLeads: number;
  totalCost: number;
  netProfit: number;
  roi: number;
  isProfitable: boolean;

  // Waste
  burnRate: number;
  wastedLeadsValue: number;
  lostDealsValue: number;
  missedFollowupRate: number;
  noShowRate: number;

  // Speed
  avgResponseMinutes: number;
  avgTimeToFirstContact: number;
  avgTimeToCloseD: number;

  // Scores (0-100)
  revenueScore: number;
  conversionScore: number;
  efficiencyScore: number;
  wastePenalty: number;
  disciplineScore: number;
  profitabilityScore: number;
  overallScore: number;

  // Trend
  trend: "up" | "stable" | "down";
  revenueVsLastMonth: number;
  alerts: number;
  criticalAlerts: number;

  // Targets
  targetRevenue: number;
  targetMeetings: number;
  targetClosures: number;
  maxBurnRate: number;
}

const FALLBACK_AGENTS: Agent[] = [
  {
    id: 1, name: "דני כהן", team: "צוות A", status: "active", grade: "A+",
    leadsReceived: 85, leadsHandled: 82, leadsBurned: 3, leadsConverted: 12,
    callsMade: 245, callsAnswered: 198, meetings: 35, meetingsHeld: 32, meetingsNoShow: 2, followupsDone: 78, followupsMissed: 2, proposalsSent: 18,
    dealsClosed: 12, dealsLost: 3, avgDealSize: 158000, avgDealCycleDays: 22,
    revenue: 1896000, grossProfit: 417120, costSalary: 22000, costCommission: 28440, costOverhead: 8000, costLeads: 12750, totalCost: 71190, netProfit: 345930, roi: 486, isProfitable: true,
    burnRate: 3.5, wastedLeadsValue: 45000, lostDealsValue: 280000, missedFollowupRate: 2.5, noShowRate: 5.7,
    avgResponseMinutes: 8, avgTimeToFirstContact: 12, avgTimeToCloseD: 22,
    revenueScore: 95, conversionScore: 92, efficiencyScore: 94, wastePenalty: 5, disciplineScore: 96, profitabilityScore: 98, overallScore: 95,
    trend: "up", revenueVsLastMonth: 18.5, alerts: 0, criticalAlerts: 0,
    targetRevenue: 1500000, targetMeetings: 30, targetClosures: 10, maxBurnRate: 10,
  },
  {
    id: 2, name: "מיכל לוי", team: "צוות A", status: "active", grade: "B+",
    leadsReceived: 72, leadsHandled: 66, leadsBurned: 6, leadsConverted: 8,
    callsMade: 185, callsAnswered: 142, meetings: 28, meetingsHeld: 23, meetingsNoShow: 3, followupsDone: 62, followupsMissed: 5, proposalsSent: 14,
    dealsClosed: 8, dealsLost: 4, avgDealSize: 128000, avgDealCycleDays: 28,
    revenue: 1024000, grossProfit: 225280, costSalary: 20000, costCommission: 15360, costOverhead: 8000, costLeads: 10800, totalCost: 54160, netProfit: 171120, roi: 316, isProfitable: true,
    burnRate: 8.3, wastedLeadsValue: 90000, lostDealsValue: 420000, missedFollowupRate: 7.5, noShowRate: 10.7,
    avgResponseMinutes: 22, avgTimeToFirstContact: 35, avgTimeToCloseD: 28,
    revenueScore: 78, conversionScore: 72, efficiencyScore: 68, wastePenalty: 15, disciplineScore: 72, profitabilityScore: 82, overallScore: 76,
    trend: "stable", revenueVsLastMonth: 2.3, alerts: 1, criticalAlerts: 0,
    targetRevenue: 1200000, targetMeetings: 25, targetClosures: 8, maxBurnRate: 10,
  },
  {
    id: 3, name: "יוסי אברהם", team: "צוות B", status: "active", grade: "C",
    leadsReceived: 60, leadsHandled: 44, leadsBurned: 14, leadsConverted: 4,
    callsMade: 95, callsAnswered: 62, meetings: 18, meetingsHeld: 14, meetingsNoShow: 3, followupsDone: 38, followupsMissed: 12, proposalsSent: 8,
    dealsClosed: 4, dealsLost: 6, avgDealSize: 112000, avgDealCycleDays: 38,
    revenue: 448000, grossProfit: 98560, costSalary: 18000, costCommission: 6720, costOverhead: 8000, costLeads: 9000, totalCost: 41720, netProfit: 56840, roi: 136, isProfitable: true,
    burnRate: 23.3, wastedLeadsValue: 210000, lostDealsValue: 520000, missedFollowupRate: 24.0, noShowRate: 16.7,
    avgResponseMinutes: 55, avgTimeToFirstContact: 120, avgTimeToCloseD: 38,
    revenueScore: 45, conversionScore: 38, efficiencyScore: 35, wastePenalty: 42, disciplineScore: 38, profitabilityScore: 48, overallScore: 40,
    trend: "down", revenueVsLastMonth: -22.5, alerts: 4, criticalAlerts: 1,
    targetRevenue: 800000, targetMeetings: 20, targetClosures: 6, maxBurnRate: 10,
  },
  {
    id: 4, name: "שרה גולד", team: "צוות B", status: "probation", grade: "D",
    leadsReceived: 55, leadsHandled: 30, leadsBurned: 22, leadsConverted: 1,
    callsMade: 48, callsAnswered: 28, meetings: 10, meetingsHeld: 6, meetingsNoShow: 4, followupsDone: 18, followupsMissed: 15, proposalsSent: 3,
    dealsClosed: 1, dealsLost: 5, avgDealSize: 85000, avgDealCycleDays: 52,
    revenue: 85000, grossProfit: 18700, costSalary: 16000, costCommission: 1275, costOverhead: 8000, costLeads: 8250, totalCost: 33525, netProfit: -14825, roi: -44, isProfitable: false,
    burnRate: 40.0, wastedLeadsValue: 330000, lostDealsValue: 380000, missedFollowupRate: 45.5, noShowRate: 40.0,
    avgResponseMinutes: 180, avgTimeToFirstContact: 480, avgTimeToCloseD: 52,
    revenueScore: 15, conversionScore: 8, efficiencyScore: 12, wastePenalty: 72, disciplineScore: 15, profitabilityScore: 0, overallScore: 12,
    trend: "down", revenueVsLastMonth: -58.0, alerts: 6, criticalAlerts: 3,
    targetRevenue: 600000, targetMeetings: 15, targetClosures: 4, maxBurnRate: 10,
  },
  {
    id: 5, name: "אלון דוד", team: "צוות A", status: "suspended", grade: "F",
    leadsReceived: 45, leadsHandled: 15, leadsBurned: 28, leadsConverted: 0,
    callsMade: 12, callsAnswered: 5, meetings: 3, meetingsHeld: 2, meetingsNoShow: 1, followupsDone: 5, followupsMissed: 22, proposalsSent: 0,
    dealsClosed: 0, dealsLost: 2, avgDealSize: 0, avgDealCycleDays: 0,
    revenue: 0, grossProfit: 0, costSalary: 15000, costCommission: 0, costOverhead: 8000, costLeads: 6750, totalCost: 29750, netProfit: -29750, roi: -100, isProfitable: false,
    burnRate: 62.2, wastedLeadsValue: 420000, lostDealsValue: 180000, missedFollowupRate: 81.5, noShowRate: 33.3,
    avgResponseMinutes: 720, avgTimeToFirstContact: 1440, avgTimeToCloseD: 0,
    revenueScore: 0, conversionScore: 0, efficiencyScore: 0, wastePenalty: 95, disciplineScore: 0, profitabilityScore: 0, overallScore: 0,
    trend: "down", revenueVsLastMonth: -100, alerts: 8, criticalAlerts: 5,
    targetRevenue: 500000, targetMeetings: 15, targetClosures: 3, maxBurnRate: 10,
  },
];

function computeTotals(agents: Agent[]) {
  const t = {
    agents: agents.length,
    active: agents.filter(a => a.status === "active").length,
    leadsReceived: agents.reduce((s, a) => s + a.leadsReceived, 0),
    leadsBurned: agents.reduce((s, a) => s + a.leadsBurned, 0),
    revenue: agents.reduce((s, a) => s + a.revenue, 0),
    totalCost: agents.reduce((s, a) => s + a.totalCost, 0),
    netProfit: agents.reduce((s, a) => s + a.netProfit, 0),
    dealsClosed: agents.reduce((s, a) => s + a.dealsClosed, 0),
    wastedValue: agents.reduce((s, a) => s + a.wastedLeadsValue, 0),
    lostValue: agents.reduce((s, a) => s + a.lostDealsValue, 0),
    unprofitable: agents.filter(a => !a.isProfitable).length,
    criticalAlerts: agents.reduce((s, a) => s + a.criticalAlerts, 0),
    avgBurnRate: 0,
    avgConversion: 0,
    avgResponse: 0,
  };
  t.avgBurnRate = t.leadsReceived > 0 ? (t.leadsBurned / t.leadsReceived * 100) : 0;
  t.avgConversion = t.leadsReceived > 0 ? (t.dealsClosed / t.leadsReceived * 100) : 0;
  t.avgResponse = Math.round(agents.filter(a => a.status === "active").reduce((s, a) => s + a.avgResponseMinutes, 0) / Math.max(1, agents.filter(a => a.status === "active").length));
  return t;
}

const fmt = (v: number) => v >= 1000000 ? `₪${(v / 1000000).toFixed(2)}M` : v >= 1000 ? `₪${(v / 1000).toFixed(0)}K` : `₪${v.toLocaleString()}`;

const gradeConfig: Record<string, { color: string; bg: string }> = {
  "A+": { color: "text-emerald-800", bg: "bg-emerald-100 border-emerald-300" },
  "A": { color: "text-emerald-700", bg: "bg-emerald-100 border-emerald-300" },
  "B+": { color: "text-blue-700", bg: "bg-blue-100 border-blue-300" },
  "B": { color: "text-blue-700", bg: "bg-blue-100 border-blue-300" },
  "C": { color: "text-amber-700", bg: "bg-amber-100 border-amber-300" },
  "D": { color: "text-orange-700", bg: "bg-orange-100 border-orange-300" },
  "F": { color: "text-red-800", bg: "bg-red-100 border-red-300" },
};

function ScoreBar({ value, max = 100, color }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const c = color || (pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-blue-500" : pct >= 40 ? "bg-amber-500" : pct >= 20 ? "bg-orange-500" : "bg-red-500");
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${c}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-mono w-6">{value}</span>
    </div>
  );
}

function AgentPnl({ agent }: { agent: Agent }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[10px]">
      <div className="flex justify-between"><span className="text-muted-foreground">הכנסות</span><span className="font-mono font-bold text-emerald-600">{fmt(agent.revenue)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">רווח גולמי</span><span className="font-mono">{fmt(agent.grossProfit)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">שכר</span><span className="font-mono text-red-600">-{fmt(agent.costSalary)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">עמלות</span><span className="font-mono text-red-600">-{fmt(agent.costCommission)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">תקורות</span><span className="font-mono text-red-600">-{fmt(agent.costOverhead)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">עלות לידים</span><span className="font-mono text-red-600">-{fmt(agent.costLeads)}</span></div>
      <div className="flex justify-between border-t pt-1"><span className="font-medium">עלות כוללת</span><span className="font-mono font-bold text-red-600">-{fmt(agent.totalCost)}</span></div>
      <div className="flex justify-between border-t pt-1"><span className="font-medium">רווח נקי</span><span className={`font-mono font-bold ${agent.netProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmt(agent.netProfit)}</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">ROI</span><span className={`font-mono font-bold ${agent.roi >= 0 ? "text-emerald-600" : "text-red-600"}`}>{agent.roi}%</span></div>
      <div className="flex justify-between"><span className="text-muted-foreground">ערך לידים אבודים</span><span className="font-mono text-red-600">{fmt(agent.wastedLeadsValue)}</span></div>
    </div>
  );
}

export default function AgentControlDashboard() {
  const { data: apiAgents } = useQuery<Agent[]>({
    queryKey: ["crm-agent-control-dashboard"],
    queryFn: async () => { const res = await authFetch("/api/crm/agents"); if (!res.ok) throw new Error("API error"); return res.json(); },
  });
  const agents = apiAgents ?? FALLBACK_AGENTS;
  const totals = useMemo(() => computeTotals(agents), [agents]);

  const [, navigate] = useLocation();
  const [period, setPeriod] = useState("monthly");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [sortBy, setSortBy] = useState("overallScore");

  const sorted = useMemo(() =>
    [...agents].sort((a: any, b: any) => {
      if (sortBy === "burnRate") return b.burnRate - a.burnRate;
      return (b[sortBy] || 0) - (a[sortBy] || 0);
    }),
    [sortBy]
  );

  return (
    <div className="p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" /> Agent Control Center
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            כל סוכן = השקעה | P&L per agent | Burn Rate | ROI | Worth Score
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">יומי</SelectItem>
              <SelectItem value="weekly">שבועי</SelectItem>
              <SelectItem value="monthly">חודשי</SelectItem>
              <SelectItem value="quarterly">רבעוני</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="overallScore">Overall Score</SelectItem>
              <SelectItem value="revenue">הכנסות</SelectItem>
              <SelectItem value="netProfit">רווח נקי</SelectItem>
              <SelectItem value="roi">ROI</SelectItem>
              <SelectItem value="burnRate">🔥 Burn Rate</SelectItem>
              <SelectItem value="dealsClosed">סגירות</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Company-level KPIs */}
      <div className="grid grid-cols-8 gap-2">
        {[
          { label: "סוכנים", value: `${totals.active}/${totals.agents}`, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "הכנסות", value: fmt(totals.revenue), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "רווח נקי", value: fmt(totals.netProfit), icon: TrendingUp, color: totals.netProfit >= 0 ? "text-emerald-600" : "text-red-600", bg: totals.netProfit >= 0 ? "bg-emerald-50" : "bg-red-50" },
          { label: "המרה", value: `${totals.avgConversion.toFixed(1)}%`, icon: Target, color: "text-purple-600", bg: "bg-purple-50" },
          { label: "🔥 Burn Rate", value: `${totals.avgBurnRate.toFixed(1)}%`, icon: Flame, color: totals.avgBurnRate > 15 ? "text-red-600" : "text-amber-600", bg: totals.avgBurnRate > 15 ? "bg-red-50" : "bg-amber-50" },
          { label: "ערך אבוד", value: fmt(totals.wastedValue), icon: Skull, color: "text-red-600", bg: "bg-red-50" },
          { label: "תגובה ממוצע", value: `${totals.avgResponse}m`, icon: Clock, color: totals.avgResponse > 30 ? "text-red-600" : "text-emerald-600", bg: totals.avgResponse > 30 ? "bg-red-50" : "bg-emerald-50" },
          { label: "לא רווחיים", value: String(totals.unprofitable), icon: AlertTriangle, color: totals.unprofitable > 0 ? "text-red-600" : "text-emerald-600", bg: totals.unprofitable > 0 ? "bg-red-50" : "bg-emerald-50" },
        ].map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <Card key={i} className={`${kpi.bg}/40 border-0 shadow-sm`}>
              <CardContent className="pt-2 pb-1.5 text-center px-1">
                <Icon className={`h-3.5 w-3.5 mx-auto ${kpi.color} mb-0.5`} />
                <p className="text-[8px] text-muted-foreground leading-tight">{kpi.label}</p>
                <p className={`text-sm font-bold font-mono ${kpi.color}`}>{kpi.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Agent Table */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          <ScrollArea className="max-h-[calc(100vh-340px)]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 sticky top-0 z-10">
                  <TableHead className="text-right text-[9px] font-bold w-[140px] sticky right-0 bg-muted/50 z-20">סוכן</TableHead>
                  <TableHead className="text-center text-[9px] font-bold w-10">Score</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">לידים</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">🔥 שרופים</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">פגישות</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">סגירות</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">הכנסות</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">עלות</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">רווח</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">ROI</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">Burn%</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">תגובה</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">יעד</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">מגמה</TableHead>
                  <TableHead className="text-center text-[9px] font-bold">⚠️</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(agent => {
                  const gc = gradeConfig[agent.grade] || gradeConfig["C"];
                  const revenueProgress = Math.min(100, (agent.revenue / agent.targetRevenue) * 100);

                  return (
                    <TableRow
                      key={agent.id}
                      className={`cursor-pointer hover:bg-accent transition-colors ${
                        !agent.isProfitable ? "bg-red-50/30" :
                        agent.grade === "A+" || agent.grade === "A" ? "bg-emerald-50/10" :
                        agent.status === "suspended" ? "bg-gray-50/50 opacity-50" : ""
                      }`}
                      onClick={() => setSelectedAgent(selectedAgent?.id === agent.id ? null : agent)}
                    >
                      {/* Agent */}
                      <TableCell className="sticky right-0 bg-background z-10">
                        <div className="flex items-center gap-2">
                          <Badge className={`${gc.bg} ${gc.color} text-[10px] font-bold w-7 justify-center border`}>{agent.grade}</Badge>
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{agent.name}</p>
                            <div className="flex items-center gap-1">
                              <span className="text-[8px] text-muted-foreground">{agent.team}</span>
                              {agent.status !== "active" && (
                                <Badge className={`text-[7px] h-3 px-1 ${agent.status === "probation" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>
                                  {agent.status === "probation" ? "ניסיון" : "מושעה"}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Overall Score */}
                      <TableCell className="text-center p-1">
                        <div className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center text-[10px] font-bold text-white ${
                          agent.overallScore >= 80 ? "bg-emerald-500" : agent.overallScore >= 60 ? "bg-blue-500" : agent.overallScore >= 40 ? "bg-amber-500" : agent.overallScore >= 20 ? "bg-orange-500" : "bg-red-500"
                        }`}>
                          {agent.overallScore}
                        </div>
                      </TableCell>

                      {/* Leads */}
                      <TableCell className="text-center font-mono text-[10px]">{agent.leadsReceived}</TableCell>

                      {/* Burned */}
                      <TableCell className="text-center p-1">
                        <Badge className={`text-[9px] font-mono ${agent.burnRate > 20 ? "bg-red-100 text-red-700" : agent.burnRate > 10 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                          {agent.leadsBurned} ({agent.burnRate.toFixed(0)}%)
                        </Badge>
                      </TableCell>

                      {/* Meetings */}
                      <TableCell className="text-center font-mono text-[10px]">{agent.meetingsHeld}/{agent.meetings}</TableCell>

                      {/* Deals */}
                      <TableCell className="text-center font-mono text-[10px] font-bold">{agent.dealsClosed}</TableCell>

                      {/* Revenue */}
                      <TableCell className="text-center font-mono text-[10px] font-bold">{fmt(agent.revenue)}</TableCell>

                      {/* Cost */}
                      <TableCell className="text-center font-mono text-[10px] text-red-600">{fmt(agent.totalCost)}</TableCell>

                      {/* Net Profit */}
                      <TableCell className={`text-center font-mono text-[10px] font-bold ${agent.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {fmt(agent.netProfit)}
                      </TableCell>

                      {/* ROI */}
                      <TableCell className={`text-center font-mono text-[10px] font-bold ${agent.roi >= 100 ? "text-emerald-600" : agent.roi >= 0 ? "text-amber-600" : "text-red-600"}`}>
                        {agent.roi}%
                      </TableCell>

                      {/* Burn Rate */}
                      <TableCell className="p-1">
                        <div className="flex items-center gap-1">
                          <div className="w-12 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${agent.burnRate > 30 ? "bg-red-500" : agent.burnRate > 15 ? "bg-orange-500" : agent.burnRate > 8 ? "bg-amber-400" : "bg-emerald-400"}`}
                              style={{ width: `${Math.min(100, agent.burnRate * 1.5)}%` }} />
                          </div>
                        </div>
                      </TableCell>

                      {/* Response */}
                      <TableCell className={`text-center font-mono text-[10px] ${agent.avgResponseMinutes > 60 ? "text-red-600 font-bold" : agent.avgResponseMinutes > 30 ? "text-amber-600" : "text-emerald-600"}`}>
                        {agent.avgResponseMinutes >= 60 ? `${(agent.avgResponseMinutes / 60).toFixed(0)}h` : `${agent.avgResponseMinutes}m`}
                      </TableCell>

                      {/* Target Progress */}
                      <TableCell className="p-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1">
                              <Progress value={revenueProgress} className={`h-2 w-12 ${revenueProgress >= 80 ? "" : "[&>div]:bg-amber-500"}`} />
                              <span className="text-[8px] font-mono">{revenueProgress.toFixed(0)}%</span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">{fmt(agent.revenue)} / {fmt(agent.targetRevenue)}</TooltipContent>
                        </Tooltip>
                      </TableCell>

                      {/* Trend */}
                      <TableCell className="text-center">
                        {agent.trend === "up" ? <ArrowUpRight className="h-4 w-4 text-emerald-500 mx-auto" />
                          : agent.trend === "down" ? <ArrowDownRight className="h-4 w-4 text-red-500 mx-auto" />
                          : <span className="text-[10px] text-muted-foreground">→</span>}
                      </TableCell>

                      {/* Alerts */}
                      <TableCell className="text-center">
                        {agent.criticalAlerts > 0 ? (
                          <Badge className="bg-red-500 text-white text-[8px] h-4 px-1 animate-pulse">{agent.criticalAlerts}</Badge>
                        ) : agent.alerts > 0 ? (
                          <Badge className="bg-amber-100 text-amber-700 text-[8px] h-4 px-1">{agent.alerts}</Badge>
                        ) : (
                          <CheckCircle className="h-3.5 w-3.5 text-emerald-400 mx-auto" />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}

                {/* Totals Row */}
                <TableRow className="bg-primary/5 font-bold border-t-2 border-primary/30 sticky bottom-0">
                  <TableCell className="sticky right-0 bg-primary/5 z-10 text-xs">סה"כ</TableCell>
                  <TableCell />
                  <TableCell className="text-center font-mono text-[10px]">{totals.leadsReceived}</TableCell>
                  <TableCell className="text-center font-mono text-[10px] text-red-600">{totals.leadsBurned} ({totals.avgBurnRate.toFixed(0)}%)</TableCell>
                  <TableCell className="text-center font-mono text-[10px]">{agents.reduce((s, a) => s + a.meetingsHeld, 0)}</TableCell>
                  <TableCell className="text-center font-mono text-[10px]">{totals.dealsClosed}</TableCell>
                  <TableCell className="text-center font-mono text-[10px]">{fmt(totals.revenue)}</TableCell>
                  <TableCell className="text-center font-mono text-[10px] text-red-600">{fmt(totals.totalCost)}</TableCell>
                  <TableCell className={`text-center font-mono text-[10px] ${totals.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{fmt(totals.netProfit)}</TableCell>
                  <TableCell className="text-center font-mono text-[10px]">{totals.revenue > 0 ? Math.round((totals.netProfit / totals.totalCost) * 100) : 0}%</TableCell>
                  <TableCell colSpan={5} />
                </TableRow>
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Expanded Agent P&L */}
      {selectedAgent && (
        <Card className="border-primary/30 shadow-lg">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge className={`${gradeConfig[selectedAgent.grade]?.bg} ${gradeConfig[selectedAgent.grade]?.color} text-lg font-bold w-10 h-10 justify-center border`}>
                  {selectedAgent.grade}
                </Badge>
                <div>
                  <CardTitle className="text-base">{selectedAgent.name} — Agent P&L</CardTitle>
                  <CardDescription>{selectedAgent.team} | {selectedAgent.status} | Score: {selectedAgent.overallScore}/100</CardDescription>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge className={selectedAgent.isProfitable ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}>
                  {selectedAgent.isProfitable ? "✓ רווחי" : "✗ הפסדי"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-6">
              {/* P&L */}
              <div>
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">דו"ח רווח והפסד</h4>
                <AgentPnl agent={selectedAgent} />
              </div>

              {/* Funnel */}
              <div>
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Funnel</h4>
                <div className="space-y-1.5">
                  {[
                    { label: "לידים שהתקבלו", value: selectedAgent.leadsReceived, max: selectedAgent.leadsReceived },
                    { label: "טופלו", value: selectedAgent.leadsHandled, max: selectedAgent.leadsReceived },
                    { label: "פגישות נקבעו", value: selectedAgent.meetings, max: selectedAgent.leadsReceived },
                    { label: "פגישות התקיימו", value: selectedAgent.meetingsHeld, max: selectedAgent.meetings },
                    { label: "הצעות נשלחו", value: selectedAgent.proposalsSent, max: selectedAgent.meetingsHeld },
                    { label: "סגירות", value: selectedAgent.dealsClosed, max: selectedAgent.proposalsSent || 1 },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[9px] w-24 text-muted-foreground">{step.label}</span>
                      <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                        <div className="h-full bg-primary/60 rounded" style={{ width: `${(step.value / selectedAgent.leadsReceived) * 100}%` }} />
                      </div>
                      <span className="text-[9px] font-mono w-6 text-left">{step.value}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 border-t pt-1">
                    <span className="text-[9px] w-24 text-red-600 font-bold">🔥 שרופים</span>
                    <div className="flex-1 h-4 bg-gray-100 rounded overflow-hidden">
                      <div className="h-full bg-red-400 rounded" style={{ width: `${selectedAgent.burnRate}%` }} />
                    </div>
                    <span className="text-[9px] font-mono w-6 text-left text-red-600">{selectedAgent.leadsBurned}</span>
                  </div>
                </div>
              </div>

              {/* Scores */}
              <div>
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Scorecard</h4>
                <div className="space-y-2">
                  {[
                    { label: "Revenue", score: selectedAgent.revenueScore },
                    { label: "Conversion", score: selectedAgent.conversionScore },
                    { label: "Efficiency", score: selectedAgent.efficiencyScore },
                    { label: "Discipline", score: selectedAgent.disciplineScore },
                    { label: "Profitability", score: selectedAgent.profitabilityScore },
                    { label: "Waste Penalty", score: selectedAgent.wastePenalty, inverse: true },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[9px] w-20 text-muted-foreground">{s.label}</span>
                      <ScoreBar value={s.score} color={s.inverse ? (s.score > 50 ? "bg-red-500" : "bg-emerald-500") : undefined} />
                    </div>
                  ))}
                  <div className="border-t pt-2 flex items-center gap-2">
                    <span className="text-[9px] w-20 font-bold">OVERALL</span>
                    <ScoreBar value={selectedAgent.overallScore} />
                  </div>
                </div>
              </div>

              {/* Speed & Waste */}
              <div>
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">מהירות & בזבוז</h4>
                <div className="space-y-1.5 text-[10px]">
                  {[
                    ["זמן תגובה ממוצע", `${selectedAgent.avgResponseMinutes}m`, selectedAgent.avgResponseMinutes > 30 ? "text-red-600 font-bold" : "text-emerald-600"],
                    ["זמן עד מגע ראשון", `${selectedAgent.avgTimeToFirstContact}m`, selectedAgent.avgTimeToFirstContact > 60 ? "text-red-600" : ""],
                    ["ימים לסגירה", `${selectedAgent.avgTimeToCloseD}d`, ""],
                    ["Follow-ups שהוחמצו", `${selectedAgent.missedFollowupRate}%`, selectedAgent.missedFollowupRate > 10 ? "text-red-600" : ""],
                    ["No-show rate", `${selectedAgent.noShowRate}%`, selectedAgent.noShowRate > 15 ? "text-red-600" : ""],
                    ["ערך לידים אבודים", fmt(selectedAgent.wastedLeadsValue), "text-red-600"],
                    ["ערך עסקאות אבודות", fmt(selectedAgent.lostDealsValue), "text-red-600"],
                    ["שינוי MoM", `${selectedAgent.revenueVsLastMonth > 0 ? "+" : ""}${selectedAgent.revenueVsLastMonth}%`, selectedAgent.revenueVsLastMonth > 0 ? "text-emerald-600" : "text-red-600"],
                  ].map(([label, value, cls], i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`font-mono font-semibold ${cls}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
