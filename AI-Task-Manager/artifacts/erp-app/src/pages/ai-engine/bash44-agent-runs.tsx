import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Bot, Activity, CheckCircle2, XCircle, Clock, Zap, Search, RefreshCw,
  BarChart3, RotateCcw, Timer, TrendingUp, PlayCircle, CalendarClock,
  MousePointerClick, ListChecks, ShieldAlert, Layers
} from "lucide-react";

const FALLBACK_AGENTS = ["BASH-44-LEAD", "BASH-44-INV", "BASH-44-CRM", "BASH-44-HR", "BASH-44-PROD", "BASH-44-FIN", "BASH-44-QA"];
const FALLBACK_ENTITIES = ["לקוח", "הזמנה", "מוצר", "עובד", "ספק", "חשבונית", "פנייה", "משימה"];
const TRIGGERS: { key: string; label: string; icon: any }[] = [
  { key: "event", label: "אירוע", icon: Zap },
  { key: "scheduled", label: "מתוזמן", icon: CalendarClock },
  { key: "manual", label: "ידני", icon: MousePointerClick },
];
const FALLBACK_STATUSES = ["הצלחה", "נכשל", "ממתין", "רץ"];
const FALLBACK_ERRORS = [
  "חריגת זמן ריצה - timeout 30s", "שגיאת חיבור ל-API חיצוני",
  "נתוני קלט חסרים - שדה חובה ריק", "חריגת מגבלת זיכרון",
  "שגיאת אימות - token פג תוקף", "קונפליקט נתונים - רשומה כפולה",
];

function rand(a: number, b: number) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function rF(a: number, b: number) { return +(Math.random() * (b - a) + a).toFixed(1); }
function pick<T>(arr: T[]): T { return arr[rand(0, arr.length - 1)]; }

const allRuns = Array.from({ length: 20 }, (_, i) => {
  const now = Date.now();
  const status = i < 3 ? pick(["הצלחה", "הצלחה", "הצלחה", "נכשל"]) : i < 5 ? pick(["הצלחה", "ממתין"]) : pick(STATUSES);
  const agent = pick(AGENTS), trigger = pick(TRIGGERS), entityType = pick(ENTITIES);
  return {
    id: i + 1, agent, entityType, entityId: `${entityType.slice(0, 2).toUpperCase()}-${rand(1000, 9999)}`,
    trigger, status,
    confidence: status === "נכשל" ? rF(12, 45) : status === "ממתין" ? 0 : rF(72, 99),
    duration: status === "ממתין" ? 0 : status === "רץ" ? rand(100, 800) : rand(120, 4500),
    timestamp: new Date(now - rand(60000, 86400000)),
    error: status === "נכשל" ? pick(ERRORS) : null,
  };
});

const SS: Record<string, string> = {
  "הצלחה": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "נכשל": "bg-red-500/20 text-red-300 border-red-500/30",
  "ממתין": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "רץ": "bg-blue-500/20 text-blue-300 border-blue-500/30",
};
const SI: Record<string, any> = { "הצלחה": CheckCircle2, "נכשל": XCircle, "ממתין": Clock, "רץ": Activity };
const TS: Record<string, string> = {
  event: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  scheduled: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  manual: "bg-orange-500/20 text-orange-300 border-orange-500/30",
};

const suc = allRuns.filter(r => r.status === "הצלחה").length;
const fail = allRuns.filter(r => r.status === "נכשל").length;
const que = allRuns.filter(r => r.status === "ממתין").length;
const withConf = allRuns.filter(r => r.confidence > 0);
const withDur = allRuns.filter(r => r.duration > 0);
const avgC = (withConf.reduce((s, r) => s + r.confidence, 0) / (withConf.length || 1)).toFixed(1);
const avgD = Math.round(withDur.reduce((s, r) => s + r.duration, 0) / (withDur.length || 1));

const FALLBACK_KPIS = [
  { label: "ריצות היום", value: "20", icon: Bot, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { label: "אחוז הצלחה", value: `${((suc / 20) * 100).toFixed(1)}%`, icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { label: "ביטחון ממוצע", value: `${avgC}%`, icon: TrendingUp, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  { label: "משך ממוצע", value: `${avgD}ms`, icon: Timer, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  { label: "ריצות שנכשלו", value: `${fail}`, icon: XCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  { label: "ממתינים בתור", value: `${que}`, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
];

function buildStats() {
  const m: Record<string, { r: number; s: number; tc: number; cc: number; td: number; dc: number }> = {};
  allRuns.forEach(r => {
    if (!m[r.agent]) m[r.agent] = { r: 0, s: 0, tc: 0, cc: 0, td: 0, dc: 0 };
    const a = m[r.agent]; a.r++;
    if (r.status === "הצלחה") a.s++;
    if (r.confidence > 0) { a.tc += r.confidence; a.cc++; }
    if (r.duration > 0) { a.td += r.duration; a.dc++; }
  });
  return Object.entries(m).map(([agent, s]) => ({
    agent, runs: s.r, successRate: s.r > 0 ? ((s.s / s.r) * 100).toFixed(1) : "0",
    avgConf: s.cc > 0 ? (s.tc / s.cc).toFixed(1) : "0", avgDur: s.dc > 0 ? Math.round(s.td / s.dc) : 0,
  }));
}
const stats = buildStats();
const failedRuns = allRuns.filter(r => r.status === "נכשל");
const confColor = (v: number) => v >= 80 ? "text-emerald-400" : v >= 50 ? "text-amber-400" : "text-red-400";
const durColor = (v: number) => v < 1000 ? "text-emerald-400" : v < 2500 ? "text-amber-400" : "text-red-400";

export default function Bash44AgentRuns() {

  const { data: apiData } = useQuery({
    queryKey: ["bash44_agent_runs"],
    queryFn: () => authFetch("/api/ai/bash44-agent-runs").then(r => r.json()),
    staleTime: 60_000,
    retry: 1,
  });
  const AGENTS = apiData?.AGENTS ?? FALLBACK_AGENTS;
  const ENTITIES = apiData?.ENTITIES ?? FALLBACK_ENTITIES;
  const STATUSES = apiData?.STATUSES ?? FALLBACK_STATUSES;
  const ERRORS = apiData?.ERRORS ?? FALLBACK_ERRORS;
  const kpis = apiData?.kpis ?? FALLBACK_KPIS;
  const [search, setSearch] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [tab, setTab] = useState("log");

  const filtered = allRuns.filter(r => {
    if (search && !r.agent.toLowerCase().includes(search.toLowerCase()) && !r.entityType.includes(search) && !r.entityId.includes(search)) return false;
    return !filterAgent || r.agent === filterAgent;
  });

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#0d1325] to-[#0a0e1a] text-white p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Bot className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-l from-blue-400 to-violet-400 bg-clip-text text-transparent">היסטוריית ריצות סוכנים - BASH-44</h1>
            <p className="text-sm text-slate-400">מעקב ריצות, ביצועים וכשלונות של כל סוכני המערכת</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800">
          <RefreshCw className="w-4 h-4" /> רענון
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <Card key={i} className={`border ${k.bg} bg-[#111827]/80 backdrop-blur`}>
              <CardContent className="p-4 text-center space-y-2">
                <Icon className={`w-6 h-6 mx-auto ${k.color}`} />
                <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
                <div className="text-xs text-slate-400">{k.label}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-[#111827] border border-slate-700/50 p-1">
          <TabsTrigger value="log" className="gap-2 data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300"><ListChecks className="w-4 h-4" /> יומן ריצות</TabsTrigger>
          <TabsTrigger value="agents" className="gap-2 data-[state=active]:bg-violet-600/20 data-[state=active]:text-violet-300"><Layers className="w-4 h-4" /> לפי סוכן</TabsTrigger>
          <TabsTrigger value="failures" className="gap-2 data-[state=active]:bg-red-600/20 data-[state=active]:text-red-300"><ShieldAlert className="w-4 h-4" /> כשלונות</TabsTrigger>
          <TabsTrigger value="performance" className="gap-2 data-[state=active]:bg-emerald-600/20 data-[state=active]:text-emerald-300"><BarChart3 className="w-4 h-4" /> ביצועים</TabsTrigger>
        </TabsList>

        {/* Tab 1 - Runs Log */}
        <TabsContent value="log" className="space-y-4">
          <Card className="bg-[#111827]/80 border-slate-700/50 backdrop-blur">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <CardTitle className="text-lg text-slate-200 flex items-center gap-2">
                  <ListChecks className="w-5 h-5 text-blue-400" /> יומן ריצות ({filtered.length})
                </CardTitle>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <Input placeholder="חיפוש לפי סוכן, ישות..." value={search} onChange={e => setSearch(e.target.value)}
                      className="pr-9 bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-500 w-full sm:w-64" />
                  </div>
                  <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)}
                    className="bg-slate-800/50 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300">
                    <option value="">כל הסוכנים</option>
                    {AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 text-slate-400">
                      {["#", "סוכן", "ישות", "טריגר", "סטטוס", "ביטחון", "משך", "זמן"].map(h => (
                        <th key={h} className="py-3 px-2 text-right">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => {
                      const SIcon = SI[r.status] || Activity, TIcon = r.trigger.icon;
                      return (
                        <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-2 text-slate-500 font-mono">{r.id}</td>
                          <td className="py-3 px-2">
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/30 font-mono text-xs">{r.agent}</Badge>
                          </td>
                          <td className="py-3 px-2">
                            <div className="text-slate-200 text-xs">{r.entityType}</div>
                            <div className="text-slate-500 text-xs font-mono">{r.entityId}</div>
                          </td>
                          <td className="py-3 px-2">
                            <Badge variant="outline" className={`${TS[r.trigger.key]} text-xs gap-1`}><TIcon className="w-3 h-3" /> {r.trigger.label}</Badge>
                          </td>
                          <td className="py-3 px-2">
                            <Badge variant="outline" className={`${SS[r.status]} text-xs gap-1`}><SIcon className="w-3 h-3" /> {r.status}</Badge>
                          </td>
                          <td className="py-3 px-2">
                            {r.confidence > 0 ? (
                              <div className="flex items-center gap-2">
                                <Progress value={r.confidence} className="h-1.5 w-16 bg-slate-700" />
                                <span className={`text-xs font-mono ${confColor(r.confidence)}`}>{r.confidence}%</span>
                              </div>
                            ) : <span className="text-slate-600 text-xs">-</span>}
                          </td>
                          <td className="py-3 px-2 text-xs font-mono text-slate-300">{r.duration > 0 ? `${r.duration}ms` : "-"}</td>
                          <td className="py-3 px-2 text-xs text-slate-400" dir="ltr">
                            {r.timestamp.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 2 - By Agent */}
        <TabsContent value="agents" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.map((s, i) => {
              const agentRuns = allRuns.filter(r => r.agent === s.agent);
              return (
                <Card key={i} className="bg-[#111827]/80 border-slate-700/50 backdrop-blur">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base text-slate-200 flex items-center gap-2">
                        <Bot className="w-5 h-5 text-violet-400" /><span className="font-mono">{s.agent}</span>
                      </CardTitle>
                      <Badge variant="outline" className="bg-slate-700/50 text-slate-300 border-slate-600">{s.runs} ריצות</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <div className="text-lg font-bold text-emerald-400">{s.successRate}%</div>
                        <div className="text-[10px] text-slate-400">הצלחה</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                        <div className="text-lg font-bold text-violet-400">{s.avgConf}%</div>
                        <div className="text-[10px] text-slate-400">ביטחון ממוצע</div>
                      </div>
                      <div className="text-center p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                        <div className="text-lg font-bold text-cyan-400">{s.avgDur}ms</div>
                        <div className="text-[10px] text-slate-400">משך ממוצע</div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      {agentRuns.slice(0, 3).map((r, j) => {
                        const SIcon = SI[r.status] || Activity;
                        return (
                          <div key={j} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-slate-800/40">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={`${SS[r.status]} text-[10px] gap-0.5 px-1.5`}><SIcon className="w-2.5 h-2.5" /> {r.status}</Badge>
                              <span className="text-slate-400">{r.entityType} {r.entityId}</span>
                            </div>
                            <span className="text-slate-500 font-mono">{r.duration > 0 ? `${r.duration}ms` : "-"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Tab 3 - Failures */}
        <TabsContent value="failures" className="space-y-4">
          <Card className="bg-[#111827]/80 border-slate-700/50 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-red-300 flex items-center gap-2"><ShieldAlert className="w-5 h-5" /> ריצות שנכשלו ({failedRuns.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {failedRuns.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-emerald-500/40" />
                  <p>אין כשלונות! כל הריצות הושלמו בהצלחה</p>
                </div>
              ) : failedRuns.map((r, i) => (
                <div key={i} className="border border-red-500/20 rounded-xl bg-red-500/5 p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                        <XCircle className="w-5 h-5 text-red-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-slate-200">{r.agent}</span>
                          <Badge variant="outline" className="bg-red-500/20 text-red-300 border-red-500/30 text-xs">נכשל</Badge>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">{r.entityType} {r.entityId} | {r.trigger.label} | {r.timestamp.toLocaleTimeString("he-IL")}</div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="gap-1.5 border-red-500/30 text-red-300 hover:bg-red-500/10 text-xs">
                      <RotateCcw className="w-3.5 h-3.5" /> הרצה מחדש
                    </Button>
                  </div>
                  <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/40">
                    <div className="text-xs text-slate-500 mb-1">פרטי שגיאה:</div>
                    <div className="text-sm text-red-300 font-mono" dir="ltr">{r.error}</div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Timer className="w-3 h-3" /> משך: {r.duration}ms</span>
                    <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> ביטחון: {r.confidence}%</span>
                    <span className="flex items-center gap-1"><PlayCircle className="w-3 h-3" /> ניסיון: 1/3</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 4 - Performance */}
        <TabsContent value="performance" className="space-y-4">
          <Card className="bg-[#111827]/80 border-slate-700/50 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-slate-200 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-emerald-400" /> השוואת ביצועי סוכנים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 text-slate-400">
                      {["סוכן", "ריצות", "ביטחון ממוצע", "משך ממוצע", "אחוז הצלחה", "דירוג"].map(h => (
                        <th key={h} className="py-3 px-3 text-right">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...stats].sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate)).map((s, i) => {
                      const rate = parseFloat(s.successRate), conf = parseFloat(s.avgConf);
                      const medal = i === 0 ? "\u{1F947}" : i === 1 ? "\u{1F948}" : i === 2 ? "\u{1F949}" : null;
                      return (
                        <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${i === 0 ? "bg-amber-500/20" : i === 1 ? "bg-slate-400/20" : i === 2 ? "bg-orange-500/20" : "bg-slate-700/30"}`}>
                                <Bot className={`w-4 h-4 ${i === 0 ? "text-amber-400" : i === 1 ? "text-slate-300" : i === 2 ? "text-orange-400" : "text-slate-500"}`} />
                              </div>
                              <span className="font-mono text-sm text-slate-200">{s.agent}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3"><Badge variant="outline" className="bg-slate-700/40 text-slate-300 border-slate-600">{s.runs}</Badge></td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <Progress value={conf} className="h-2 w-20 bg-slate-700" />
                              <span className={`text-xs font-mono ${confColor(conf)}`}>{s.avgConf}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-3"><span className={`text-sm font-mono ${durColor(s.avgDur)}`}>{s.avgDur}ms</span></td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <Progress value={rate} className="h-2 w-20 bg-slate-700" />
                              <span className={`text-xs font-mono ${confColor(rate)}`}>{s.successRate}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center">{medal ? <span className="text-lg">{medal}</span> : <span className="text-slate-600 text-sm font-mono">#{i + 1}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(() => {
              const sorted = [...stats].sort((a, b) => parseFloat(b.successRate) - parseFloat(a.successRate));
              const fastest = [...stats].filter(s => s.avgDur > 0).sort((a, b) => a.avgDur - b.avgDur)[0];
              const confTop = [...stats].sort((a, b) => parseFloat(b.avgConf) - parseFloat(a.avgConf))[0];
              const cards = [
                { title: "הסוכן הטוב ביותר", icon: CheckCircle2, border: "border-emerald-500/20", tc: "text-emerald-300", vc: "text-emerald-400", agent: sorted[0], sub: `הצלחה: ${sorted[0]?.successRate}% | ביטחון: ${sorted[0]?.avgConf}%` },
                { title: "הסוכן המהיר ביותר", icon: Zap, border: "border-cyan-500/20", tc: "text-cyan-300", vc: "text-cyan-400", agent: fastest, sub: `משך: ${fastest?.avgDur}ms | הצלחה: ${fastest?.successRate}%` },
                { title: "הביטחון הגבוה ביותר", icon: TrendingUp, border: "border-violet-500/20", tc: "text-violet-300", vc: "text-violet-400", agent: confTop, sub: `ביטחון: ${confTop?.avgConf}% | ריצות: ${confTop?.runs}` },
              ];
              return cards.map((c, i) => (
                <Card key={i} className={`bg-[#111827]/80 ${c.border} backdrop-blur`}>
                  <CardHeader className="pb-2">
                    <CardTitle className={`text-sm ${c.tc} flex items-center gap-2`}><c.icon className="w-4 h-4" /> {c.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className={`text-xl font-bold font-mono ${c.vc}`}>{c.agent?.agent || "-"}</div>
                    <div className="text-xs text-slate-400 mt-1">{c.sub}</div>
                  </CardContent>
                </Card>
              ));
            })()}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
