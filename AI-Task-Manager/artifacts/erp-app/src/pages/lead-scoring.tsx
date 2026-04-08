import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { authFetch } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell, Legend, FunnelChart, Funnel, LabelList,
} from "recharts";
import {
  Target, Users, TrendingUp, TrendingDown, Award, RefreshCw,
  ArrowUp, ArrowDown, Minus, Star, BarChart3, Filter, ChevronDown,
} from "lucide-react";

const API = "/api";

/* ── Types ─────────────────────────────────────────────── */
interface Lead {
  id: number;
  name: string;
  score: number;
  tier: "A" | "B" | "C" | "D";
  source: string;
  conversionProbability: number;
  recommendedAction: string;
  factors: {
    source: number;
    budget: number;
    urgency: number;
    engagement: number;
    location: number;
    productInterest: number;
  };
}

interface Agent {
  id: number;
  name: string;
  leadsReceived: number;
  contactRate: number;
  meetingRate: number;
  closeRate: number;
  revenue: number;
  valueScore: number;
  rank: number;
}

interface FunnelStep {
  name: string;
  value: number;
  fill: string;
  dropOff: number;
}

interface LostReason {
  reason: string;
  count: number;
}

/* ── Helpers ───────────────────────────────────────────── */
const fmt = (v: number) =>
  new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(v);

const pct = (v: number) => `${v.toFixed(1)}%`;

function scoreColor(score: number): string {
  if (score < 20) return "text-red-500";
  if (score < 50) return "text-orange-500";
  if (score < 80) return "text-yellow-500";
  return "text-green-500";
}

function scoreBg(score: number): string {
  if (score < 20) return "bg-red-500/20";
  if (score < 50) return "bg-orange-500/20";
  if (score < 80) return "bg-yellow-500/20";
  return "bg-green-500/20";
}

function tierVariant(tier: string): "default" | "secondary" | "destructive" | "outline" {
  switch (tier) {
    case "A": return "default";
    case "B": return "secondary";
    case "C": return "outline";
    default: return "destructive";
  }
}

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
const PIE_COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#8b5cf6", "#22c55e", "#ec4899", "#06b6d4"];

/* ── Mock data generators ──────────────────────────────── */
function generateLeads(): Lead[] {
  const names = ["אבי כהן", "שרה לוי", "דוד ברוך", "רחל מזרחי", "יוסי פרץ", "מיכל אדלר", "עמית גולן", "נועה שמש", "אלון דהן", "תמר רוזן", "איתי שפירא", "ליאת ביטון", "רון אברהם", "הדס פלד", "גיל מלכה"];
  const sources = ["אתר", "הפניה", "פרסום", "LinkedIn", "תערוכה", "שיחה קרה"];
  const actions = ["שיחת מעקב", "שליחת הצעה", "פגישה", "הדגמה", "ניתוח צרכים", "העברה לסגירה"];
  return names.map((name, i) => {
    const score = Math.floor(Math.random() * 100);
    const tier = score >= 80 ? "A" : score >= 50 ? "B" : score >= 20 ? "C" : "D";
    return {
      id: i + 1,
      name,
      score,
      tier,
      source: sources[i % sources.length],
      conversionProbability: Math.round(score * 0.85 + Math.random() * 10),
      recommendedAction: actions[i % actions.length],
      factors: {
        source: Math.floor(Math.random() * 100),
        budget: Math.floor(Math.random() * 100),
        urgency: Math.floor(Math.random() * 100),
        engagement: Math.floor(Math.random() * 100),
        location: Math.floor(Math.random() * 100),
        productInterest: Math.floor(Math.random() * 100),
      },
    };
  });
}

function generateAgents(): Agent[] {
  const names = ["משה לוי", "דנה כהן", "אורי שמש", "שירה ברק", "עידו פרץ", "מיכל דהן", "רועי אדלר", "נועם ביטון"];
  return names.map((name, i) => ({
    id: i + 1,
    name,
    leadsReceived: Math.floor(Math.random() * 80) + 20,
    contactRate: Math.round(Math.random() * 40 + 60),
    meetingRate: Math.round(Math.random() * 30 + 30),
    closeRate: Math.round(Math.random() * 25 + 10),
    revenue: Math.floor(Math.random() * 500000) + 100000,
    valueScore: Math.round(Math.random() * 40 + 60),
    rank: i + 1,
  })).sort((a, b) => b.valueScore - a.valueScore).map((a, i) => ({ ...a, rank: i + 1 }));
}

function generateFunnel(): FunnelStep[] {
  const steps = [
    { name: "לידים", value: 1200, fill: "#3b82f6" },
    { name: "נוצר קשר", value: 840, fill: "#22c55e" },
    { name: "פגישה", value: 420, fill: "#f59e0b" },
    { name: "הצעת מחיר", value: 210, fill: "#8b5cf6" },
    { name: "סגירה", value: 84, fill: "#ec4899" },
  ];
  return steps.map((s, i) => ({
    ...s,
    dropOff: i === 0 ? 0 : Math.round((1 - s.value / steps[i - 1].value) * 100),
  }));
}

function generateLostReasons(): LostReason[] {
  return [
    { reason: "מחיר גבוה", count: 34 },
    { reason: "בחרו מתחרה", count: 28 },
    { reason: "לא רלוונטי", count: 22 },
    { reason: "עיתוי לא מתאים", count: 18 },
    { reason: "חוסר תקציב", count: 15 },
    { reason: "אחר", count: 8 },
  ];
}

/* ── Component ─────────────────────────────────────────── */
export default function LeadScoringPage() {
  const [activeTab, setActiveTab] = useState("leads");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [compareAgents, setCompareAgents] = useState<number[]>([]);
  const [filterTier, setFilterTier] = useState<string>("all");
  const queryClient = useQueryClient();

  const { data: leadsRaw } = useQuery({
    queryKey: ["lead-scoring"],
    queryFn: async () => {
      try {
        const res = await authFetch(`${API}/lead-scoring`);
        if (!res.ok) throw new Error();
        return await res.json();
      } catch {
        return null;
      }
    },
  });

  const { data: agentsRaw } = useQuery({
    queryKey: ["agent-rankings"],
    queryFn: async () => {
      try {
        const res = await authFetch(`${API}/agent-rankings`);
        if (!res.ok) throw new Error();
        return await res.json();
      } catch {
        return null;
      }
    },
  });

  const leads: Lead[] = useMemo(() => leadsRaw ?? generateLeads(), [leadsRaw]);
  const agents: Agent[] = useMemo(() => agentsRaw ?? generateAgents(), [agentsRaw]);
  const funnel = useMemo(() => generateFunnel(), []);
  const lostReasons = useMemo(() => generateLostReasons(), []);

  const filteredLeads = filterTier === "all" ? leads : leads.filter((l) => l.tier === filterTier);

  const recalcMutation = useMutation({
    mutationFn: async () => {
      await authFetch(`${API}/lead-scoring/recalculate`, { method: "POST" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lead-scoring"] }),
  });

  const radarData = selectedLead
    ? [
        { factor: "מקור", value: selectedLead.factors.source },
        { factor: "תקציב", value: selectedLead.factors.budget },
        { factor: "דחיפות", value: selectedLead.factors.urgency },
        { factor: "מעורבות", value: selectedLead.factors.engagement },
        { factor: "מיקום", value: selectedLead.factors.location },
        { factor: "עניין במוצר", value: selectedLead.factors.productInterest },
      ]
    : [];

  const toggleCompare = (id: number) => {
    setCompareAgents((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 3 ? [...prev, id] : prev
    );
  };

  /* ── KPI summary ─────────────────────────────────────── */
  const totalLeads = leads.length;
  const avgScore = Math.round(leads.reduce((s, l) => s + l.score, 0) / totalLeads);
  const tierA = leads.filter((l) => l.tier === "A").length;
  const avgConversion = Math.round(leads.reduce((s, l) => s + l.conversionProbability, 0) / totalLeads);

  return (
    <div className="min-h-screen bg-background p-6 space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">ניקוד לידים וניתוח סוכנים</h1>
          <p className="text-muted-foreground mt-1">ניתוח ביצועי לידים, סוכנים ומשפך מכירות</p>
        </div>
        <Button onClick={() => recalcMutation.mutate()} disabled={recalcMutation.isPending}>
          <RefreshCw className={`h-4 w-4 ml-2 ${recalcMutation.isPending ? "animate-spin" : ""}`} />
          חישוב מחדש
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/10"><Target className="h-6 w-6 text-blue-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">סה"כ לידים</p>
              <p className="text-2xl font-bold">{totalLeads}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-500/10"><Star className="h-6 w-6 text-green-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">ציון ממוצע</p>
              <p className={`text-2xl font-bold ${scoreColor(avgScore)}`}>{avgScore}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/10"><Award className="h-6 w-6 text-purple-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">לידים דירוג A</p>
              <p className="text-2xl font-bold text-purple-500">{tierA}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-500/10"><TrendingUp className="h-6 w-6 text-amber-500" /></div>
            <div>
              <p className="text-sm text-muted-foreground">יחס המרה ממוצע</p>
              <p className="text-2xl font-bold text-amber-500">{avgConversion}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="leads">ניקוד לידים</TabsTrigger>
          <TabsTrigger value="agents">דירוג סוכנים</TabsTrigger>
          <TabsTrigger value="compare">השוואת סוכנים</TabsTrigger>
          <TabsTrigger value="funnel">משפך מכירות</TabsTrigger>
          <TabsTrigger value="lost">ניתוח לידים שאבדו</TabsTrigger>
        </TabsList>

        {/* ── Leads Tab ───────────────────────────────── */}
        <TabsContent value="leads" className="space-y-4">
          <div className="flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterTier} onValueChange={setFilterTier}>
              <SelectTrigger className="w-40"><SelectValue placeholder="סנן דירוג" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="A">דירוג A</SelectItem>
                <SelectItem value="B">דירוג B</SelectItem>
                <SelectItem value="C">דירוג C</SelectItem>
                <SelectItem value="D">דירוג D</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">שם ליד</TableHead>
                    <TableHead className="text-center">ציון</TableHead>
                    <TableHead className="text-center">דירוג</TableHead>
                    <TableHead className="text-right">מקור</TableHead>
                    <TableHead className="text-center">סיכוי המרה</TableHead>
                    <TableHead className="text-right">פעולה מומלצת</TableHead>
                    <TableHead className="text-center">פירוט</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLeads.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">{lead.name}</TableCell>
                      <TableCell className="text-center">
                        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-bold text-sm ${scoreBg(lead.score)} ${scoreColor(lead.score)}`}>
                          {lead.score}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={tierVariant(lead.tier)}>{lead.tier}</Badge>
                      </TableCell>
                      <TableCell>{lead.source}</TableCell>
                      <TableCell className="text-center font-mono">{lead.conversionProbability}%</TableCell>
                      <TableCell>{lead.recommendedAction}</TableCell>
                      <TableCell className="text-center">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => setSelectedLead(lead)}>
                              פירוט ציון
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-lg" dir="rtl">
                            <DialogHeader>
                              <DialogTitle>פירוט ציון – {lead.name}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="flex items-center gap-3">
                                <span className={`text-4xl font-bold ${scoreColor(lead.score)}`}>{lead.score}</span>
                                <Badge variant={tierVariant(lead.tier)} className="text-lg px-3 py-1">דירוג {lead.tier}</Badge>
                              </div>
                              <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                  <RadarChart data={radarData}>
                                    <PolarGrid />
                                    <PolarAngleAxis dataKey="factor" tick={{ fontSize: 12 }} />
                                    <PolarRadiusAxis angle={30} domain={[0, 100]} />
                                    <Radar name="ציון" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                                  </RadarChart>
                                </ResponsiveContainer>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-sm">
                                {radarData.map((f) => (
                                  <div key={f.factor} className="flex justify-between bg-muted/50 rounded p-2">
                                    <span>{f.factor}</span>
                                    <span className="font-mono font-bold">{f.value}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Agent Ranking Tab ──────────────────────── */}
        <TabsContent value="agents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> דירוג סוכנים</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-center w-16">דירוג</TableHead>
                    <TableHead className="text-right">שם סוכן</TableHead>
                    <TableHead className="text-center">לידים שהתקבלו</TableHead>
                    <TableHead className="text-center">יחס יצירת קשר</TableHead>
                    <TableHead className="text-center">יחס פגישות</TableHead>
                    <TableHead className="text-center">יחס סגירה</TableHead>
                    <TableHead className="text-center">הכנסה</TableHead>
                    <TableHead className="text-center">ציון ערך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agents.map((agent) => (
                    <TableRow key={agent.id} className={agent.rank <= 3 ? "bg-yellow-500/5" : ""}>
                      <TableCell className="text-center">
                        {agent.rank <= 3 ? (
                          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-600 font-bold">
                            {agent.rank}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{agent.rank}</span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{agent.name}</TableCell>
                      <TableCell className="text-center">{agent.leadsReceived}</TableCell>
                      <TableCell className="text-center">{agent.contactRate}%</TableCell>
                      <TableCell className="text-center">{agent.meetingRate}%</TableCell>
                      <TableCell className="text-center">{agent.closeRate}%</TableCell>
                      <TableCell className="text-center font-mono">{fmt(agent.revenue)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={agent.valueScore >= 80 ? "default" : agent.valueScore >= 60 ? "secondary" : "destructive"}>
                          {agent.valueScore}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Agent Comparison Tab ───────────────────── */}
        <TabsContent value="compare" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>השוואת סוכנים (בחר 2-3)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-6">
                {agents.map((a) => (
                  <Button
                    key={a.id}
                    variant={compareAgents.includes(a.id) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleCompare(a.id)}
                  >
                    {a.name}
                  </Button>
                ))}
              </div>
              {compareAgents.length >= 2 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { metric: "יצירת קשר", ...Object.fromEntries(compareAgents.map((id) => [agents.find((a) => a.id === id)!.name, agents.find((a) => a.id === id)!.contactRate])) },
                          { metric: "פגישות", ...Object.fromEntries(compareAgents.map((id) => [agents.find((a) => a.id === id)!.name, agents.find((a) => a.id === id)!.meetingRate])) },
                          { metric: "סגירה", ...Object.fromEntries(compareAgents.map((id) => [agents.find((a) => a.id === id)!.name, agents.find((a) => a.id === id)!.closeRate])) },
                          { metric: "ציון ערך", ...Object.fromEntries(compareAgents.map((id) => [agents.find((a) => a.id === id)!.name, agents.find((a) => a.id === id)!.valueScore])) },
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                        <XAxis dataKey="metric" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {compareAgents.map((id, i) => (
                          <Bar key={id} dataKey={agents.find((a) => a.id === id)!.name} fill={COLORS[i]} radius={[4, 4, 0, 0]} />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3">
                    {compareAgents.map((id, i) => {
                      const a = agents.find((x) => x.id === id)!;
                      return (
                        <Card key={id} className="border-r-4" style={{ borderRightColor: COLORS[i] }}>
                          <CardContent className="p-4 grid grid-cols-3 gap-3 text-sm">
                            <div className="col-span-3 font-bold text-lg">{a.name}</div>
                            <div><span className="text-muted-foreground">לידים:</span> {a.leadsReceived}</div>
                            <div><span className="text-muted-foreground">סגירה:</span> {a.closeRate}%</div>
                            <div><span className="text-muted-foreground">הכנסה:</span> {fmt(a.revenue)}</div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-12">בחר לפחות 2 סוכנים להשוואה</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Funnel Tab ─────────────────────────────── */}
        <TabsContent value="funnel" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> משפך מכירות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Visual funnel bars */}
                <div className="space-y-3">
                  {funnel.map((step, i) => {
                    const maxVal = funnel[0].value;
                    const widthPct = (step.value / maxVal) * 100;
                    return (
                      <div key={step.name} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{step.name}</span>
                          <span className="flex items-center gap-2">
                            <span className="font-mono font-bold">{step.value.toLocaleString("he-IL")}</span>
                            {step.dropOff > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                -{step.dropOff}%
                              </Badge>
                            )}
                          </span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-8 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 flex items-center justify-center text-foreground text-xs font-bold"
                            style={{ width: `${widthPct}%`, backgroundColor: step.fill }}
                          >
                            {widthPct > 15 && `${widthPct.toFixed(0)}%`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Conversion rates summary */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-lg">שיעורי המרה</h3>
                  {funnel.slice(1).map((step, i) => (
                    <div key={step.name} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm">
                        {funnel[i].name} → {step.name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-lg">{(100 - step.dropOff).toFixed(0)}%</span>
                        {step.dropOff > 50 ? (
                          <ArrowDown className="h-4 w-4 text-red-500" />
                        ) : (
                          <ArrowUp className="h-4 w-4 text-green-500" />
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                    <p className="text-sm text-muted-foreground">יחס המרה כולל</p>
                    <p className="text-3xl font-bold text-primary">
                      {((funnel[funnel.length - 1].value / funnel[0].value) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Lost Leads Tab ─────────────────────────── */}
        <TabsContent value="lost" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>ניתוח לידים שאבדו</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={lostReasons}
                        dataKey="count"
                        nameKey="reason"
                        cx="50%"
                        cy="50%"
                        outerRadius={120}
                        label={({ reason, percent }) => `${reason} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {lostReasons.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg mb-4">פירוט סיבות</h3>
                  {lostReasons.map((r, i) => {
                    const total = lostReasons.reduce((s, x) => s + x.count, 0);
                    const pctVal = ((r.count / total) * 100).toFixed(1);
                    return (
                      <div key={r.reason} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i] }} />
                        <div className="flex-1 flex justify-between items-center">
                          <span className="text-sm">{r.reason}</span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{r.count}</span>
                            <Badge variant="outline">{pctVal}%</Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="mt-6 p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                    <p className="text-sm font-medium text-red-500">תובנה עיקרית</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      מחיר גבוה ובחירת מתחרה מהווים {((lostReasons[0].count + lostReasons[1].count) / lostReasons.reduce((s, x) => s + x.count, 0) * 100).toFixed(0)}% מסיבות האיבוד. מומלץ לבחון מחדש את מדיניות התמחור.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
