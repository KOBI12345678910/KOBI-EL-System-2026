import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Brain, Server, Wrench, Activity, Clock, AlertTriangle,
  ShieldCheck, Wifi, WifiOff, CheckCircle2,
  XCircle, Timer, Hash, List, FileJson, User, Bot,
  Zap, Globe, Calendar, Database, Link2
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Static data — MCP Servers                                         */
/* ------------------------------------------------------------------ */
const mcpServers = [
  { name: "Ahrefs", status: "online", tools: 12, callsToday: 67, avgLatency: 145, lastHeartbeat: "לפני 12 שניות", version: "1.4.2", icon: Globe, color: "from-orange-500/20 to-amber-500/20", border: "border-orange-500/30" },
  { name: "Wix", status: "online", tools: 8, callsToday: 54, avgLatency: 120, lastHeartbeat: "לפני 8 שניות", version: "2.1.0", icon: Link2, color: "from-blue-500/20 to-cyan-500/20", border: "border-blue-500/30" },
  { name: "Make.com", status: "online", tools: 6, callsToday: 41, avgLatency: 210, lastHeartbeat: "לפני 15 שניות", version: "1.2.5", icon: Zap, color: "from-violet-500/20 to-purple-500/20", border: "border-violet-500/30" },
  { name: "n8n", status: "online", tools: 5, callsToday: 38, avgLatency: 195, lastHeartbeat: "לפני 20 שניות", version: "0.9.8", icon: Activity, color: "from-green-500/20 to-emerald-500/20", border: "border-green-500/30" },
  { name: "Google Calendar", status: "online", tools: 7, callsToday: 28, avgLatency: 160, lastHeartbeat: "לפני 5 שניות", version: "3.0.1", icon: Calendar, color: "from-red-500/20 to-pink-500/20", border: "border-red-500/30" },
  { name: "Airtable", status: "offline", tools: 4, callsToday: 6, avgLatency: 340, lastHeartbeat: "לפני 12 דקות", version: "1.0.3", icon: Database, color: "from-yellow-500/20 to-amber-500/20", border: "border-yellow-500/30" },
];

/* ------------------------------------------------------------------ */
/*  Static data — Tools Registry                                      */
/* ------------------------------------------------------------------ */
const toolsRegistry = [
  { name: "site-explorer-metrics", server: "Ahrefs", desc: "שליפת מדדי SEO לדומיין", inputFields: 3, callsToday: 18, avgDuration: "132ms", permissions: "admin, analyst" },
  { name: "site-audit-issues", server: "Ahrefs", desc: "בדיקת תקלות טכניות באתר", inputFields: 4, callsToday: 12, avgDuration: "245ms", permissions: "admin" },
  { name: "keywords-explorer", server: "Ahrefs", desc: "חיפוש מילות מפתח ונפחי חיפוש", inputFields: 5, callsToday: 14, avgDuration: "189ms", permissions: "admin, analyst" },
  { name: "CallWixSiteAPI", server: "Wix", desc: "קריאה ל-API של אתר Wix", inputFields: 6, callsToday: 22, avgDuration: "115ms", permissions: "admin, developer" },
  { name: "SearchInSite", server: "Wix", desc: "חיפוש תוכן באתר Wix", inputFields: 2, callsToday: 19, avgDuration: "98ms", permissions: "all" },
  { name: "GetBusinessDetails", server: "Wix", desc: "שליפת פרטי העסק מ-Wix", inputFields: 1, callsToday: 8, avgDuration: "72ms", permissions: "admin, analyst" },
  { name: "scenarios_run", server: "Make.com", desc: "הרצת תרחיש אוטומציה", inputFields: 3, callsToday: 15, avgDuration: "310ms", permissions: "admin" },
  { name: "scenarios_list", server: "Make.com", desc: "רשימת כל התרחישים", inputFields: 1, callsToday: 11, avgDuration: "85ms", permissions: "all" },
  { name: "execute_workflow", server: "n8n", desc: "הרצת Workflow ב-n8n", inputFields: 4, callsToday: 14, avgDuration: "275ms", permissions: "admin, developer" },
  { name: "search_workflows", server: "n8n", desc: "חיפוש Workflows קיימים", inputFields: 2, callsToday: 9, avgDuration: "62ms", permissions: "all" },
  { name: "gcal_list_events", server: "Google Calendar", desc: "שליפת אירועים מיומן Google", inputFields: 3, callsToday: 16, avgDuration: "140ms", permissions: "all" },
  { name: "gcal_create_event", server: "Google Calendar", desc: "יצירת אירוע חדש ביומן", inputFields: 7, callsToday: 6, avgDuration: "180ms", permissions: "admin, manager" },
  { name: "gcal_find_free_time", server: "Google Calendar", desc: "חיפוש זמן פנוי ביומן", inputFields: 4, callsToday: 5, avgDuration: "155ms", permissions: "all" },
  { name: "list_records", server: "Airtable", desc: "שליפת רשומות מטבלה", inputFields: 5, callsToday: 4, avgDuration: "320ms", permissions: "admin, analyst" },
  { name: "create_records", server: "Airtable", desc: "יצירת רשומות חדשות בטבלה", inputFields: 3, callsToday: 2, avgDuration: "350ms", permissions: "admin" },
];

/* ------------------------------------------------------------------ */
/*  Static data — Permissions Matrix                                  */
/* ------------------------------------------------------------------ */
const roles = ["מנהל (Admin)", "מפתח (Developer)", "אנליסט (Analyst)", "משתמש (User)"];
const permTools = [
  "site-explorer-metrics", "site-audit-issues", "CallWixSiteAPI", "SearchInSite",
  "scenarios_run", "scenarios_list", "execute_workflow", "gcal_create_event",
  "list_records", "create_records",
];
const permMatrix: Record<string, boolean[]> = {
  "מנהל (Admin)":       [true, true, true, true, true, true, true, true, true, true],
  "מפתח (Developer)":   [true, false, true, true, false, true, true, true, false, false],
  "אנליסט (Analyst)":   [true, true, false, true, false, true, false, false, true, false],
  "משתמש (User)":       [false, false, false, true, false, true, false, false, false, false],
};

/* ------------------------------------------------------------------ */
/*  Static data — Recent Logs                                         */
/* ------------------------------------------------------------------ */
const recentLogs = [
  { ts: "08/04/2026 09:42:15", tool: "site-explorer-metrics", caller: "עוזי (user)", input: '{ domain: "techno-kol.co.il" }', status: "success", duration: "128ms" },
  { ts: "08/04/2026 09:41:02", tool: "gcal_list_events", caller: "system", input: '{ timeMin: "2026-04-08" }', status: "success", duration: "145ms" },
  { ts: "08/04/2026 09:39:48", tool: "scenarios_run", caller: "עוזי (user)", input: '{ scenarioId: "sc_201" }', status: "success", duration: "312ms" },
  { ts: "08/04/2026 09:38:30", tool: "SearchInSite", caller: "system", input: '{ query: "מבצע אביב" }', status: "success", duration: "92ms" },
  { ts: "08/04/2026 09:37:11", tool: "execute_workflow", caller: "עוזי (user)", input: '{ workflowId: "wf_55" }', status: "success", duration: "268ms" },
  { ts: "08/04/2026 09:35:55", tool: "list_records", caller: "system", input: '{ table: "leads" }', status: "error", duration: "340ms" },
  { ts: "08/04/2026 09:34:22", tool: "keywords-explorer", caller: "עוזי (user)", input: '{ keyword: "טכנו-כל" }', status: "success", duration: "195ms" },
  { ts: "08/04/2026 09:33:01", tool: "gcal_create_event", caller: "עוזי (user)", input: '{ summary: "פגישת ספקים" }', status: "success", duration: "175ms" },
  { ts: "08/04/2026 09:31:40", tool: "CallWixSiteAPI", caller: "system", input: '{ endpoint: "/products" }', status: "success", duration: "110ms" },
  { ts: "08/04/2026 09:30:18", tool: "scenarios_list", caller: "system", input: '{ limit: 50 }', status: "success", duration: "78ms" },
];

/* ------------------------------------------------------------------ */
/*  KPI Card                                                          */
/* ------------------------------------------------------------------ */
function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <Card className="bg-[#0d1117] border-[#1e293b]">
      <CardContent className="flex items-center gap-3 py-4 px-5">
        <div className={`rounded-lg p-2 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-bold text-white">{value}</span>
          <span className="text-xs text-gray-400">{label}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================== */
/*  MAIN COMPONENT                                                    */
/* ================================================================== */
export default function McpHub() {
  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e14] text-white p-6 space-y-6">
      {/* ---- Header ---- */}
      <div className="flex items-center gap-4 mb-2">
        <div className="rounded-xl bg-gradient-to-br from-violet-600/30 to-fuchsia-600/30 p-3 border border-violet-500/30">
          <Brain className="h-8 w-8 text-violet-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">MCP Hub &mdash; Model Context Protocol</h1>
          <p className="text-sm text-gray-400">ניהול שרתי MCP, כלים, הרשאות ולוגים &mdash; טכנו-כל עוזי</p>
        </div>
      </div>

      {/* ---- Protocol status banner ---- */}
      <Card className="bg-gradient-to-l from-[#0d1117] via-violet-950/20 to-[#0d1117] border-violet-500/20">
        <CardContent className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4 px-5">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-violet-300 flex items-center gap-2">
              <Wifi className="h-4 w-4" /> פרוטוקול MCP &mdash; סטטוס כללי
            </p>
            <p className="text-xs text-gray-400 leading-relaxed max-w-xl">
              Model Context Protocol מאפשר לסוכני AI לתקשר עם כלים חיצוניים בצורה מאובטחת.
              כל קריאה עוברת אימות הרשאות, rate-limiting ולוגינג מלא.
              הגרסה הנוכחית: <span className="font-mono text-cyan-300">MCP v2.1</span> &mdash;
              Transport: <span className="font-mono text-cyan-300">stdio + SSE</span>
            </p>
          </div>
          <div className="flex items-center gap-6 text-xs text-gray-300">
            <div className="flex flex-col items-center gap-1">
              <span className="text-green-400 font-bold text-lg">5</span>
              <span className="text-gray-500">Online</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-red-400 font-bold text-lg">1</span>
              <span className="text-gray-500">Offline</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-amber-400 font-bold text-lg">99.6%</span>
              <span className="text-gray-500">Uptime 30d</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---- KPI Strip ---- */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="MCP Servers" value={6} icon={Server} color="bg-blue-500/20 text-blue-400" />
        <KpiCard label="Tools רשומים" value={42} icon={Wrench} color="bg-emerald-500/20 text-emerald-400" />
        <KpiCard label="קריאות היום" value={234} icon={Activity} color="bg-amber-500/20 text-amber-400" />
        <KpiCard label="Latency ממוצע" value="180ms" icon={Timer} color="bg-cyan-500/20 text-cyan-400" />
        <KpiCard label="שגיאות" value={1} icon={AlertTriangle} color="bg-red-500/20 text-red-400" />
        <KpiCard label="הרשאות מוגדרות" value={18} icon={ShieldCheck} color="bg-violet-500/20 text-violet-400" />
      </div>

      {/* ---- Tabs ---- */}
      <Tabs defaultValue="servers" className="space-y-4">
        <TabsList className="bg-[#161b22] border border-[#1e293b] gap-1">
          <TabsTrigger value="servers" className="data-[state=active]:bg-violet-600/30 data-[state=active]:text-violet-300 gap-1.5">
            <Server className="h-4 w-4" /> Servers
          </TabsTrigger>
          <TabsTrigger value="tools" className="data-[state=active]:bg-emerald-600/30 data-[state=active]:text-emerald-300 gap-1.5">
            <Wrench className="h-4 w-4" /> Tools Registry
          </TabsTrigger>
          <TabsTrigger value="permissions" className="data-[state=active]:bg-amber-600/30 data-[state=active]:text-amber-300 gap-1.5">
            <ShieldCheck className="h-4 w-4" /> הרשאות
          </TabsTrigger>
          <TabsTrigger value="logs" className="data-[state=active]:bg-cyan-600/30 data-[state=active]:text-cyan-300 gap-1.5">
            <List className="h-4 w-4" /> Logs
          </TabsTrigger>
        </TabsList>

        {/* ======================== SERVERS TAB ======================== */}
        <TabsContent value="servers">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mcpServers.map((s) => {
              const Icon = s.icon;
              const online = s.status === "online";
              return (
                <Card key={s.name} className={`bg-gradient-to-br ${s.color} border ${s.border} hover:shadow-lg transition-shadow`}>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon className="h-6 w-6 text-white/80" />
                      <CardTitle className="text-lg font-semibold">{s.name}</CardTitle>
                    </div>
                    <Badge variant={online ? "default" : "destructive"} className={online ? "bg-green-600/80 text-white" : ""}>
                      {online ? <Wifi className="h-3 w-3 mr-1" /> : <WifiOff className="h-3 w-3 mr-1" />}
                      {online ? "Online" : "Offline"}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-gray-200">
                      <div className="flex items-center gap-1.5"><Wrench className="h-3.5 w-3.5 text-gray-400" /> כלים: <span className="font-mono font-bold">{s.tools}</span></div>
                      <div className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-gray-400" /> קריאות: <span className="font-mono font-bold">{s.callsToday}</span></div>
                      <div className="flex items-center gap-1.5"><Timer className="h-3.5 w-3.5 text-gray-400" /> Latency: <span className="font-mono font-bold">{s.avgLatency}ms</span></div>
                      <div className="flex items-center gap-1.5"><Hash className="h-3.5 w-3.5 text-gray-400" /> v{s.version}</div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Clock className="h-3 w-3" /> Heartbeat: {s.lastHeartbeat}
                    </div>
                    <Progress value={online ? Math.min(100, (s.callsToday / 70) * 100) : 8} className="h-1.5" />
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Server aggregate summary */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-[#0d1117] border-[#1e293b]">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-lg font-bold font-mono text-green-400">
                  {mcpServers.filter((s) => s.status === "online").length}/{mcpServers.length}
                </p>
                <p className="text-[11px] text-gray-500">שרתים פעילים</p>
              </CardContent>
            </Card>
            <Card className="bg-[#0d1117] border-[#1e293b]">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-lg font-bold font-mono text-cyan-400">
                  {mcpServers.reduce((sum, s) => sum + s.tools, 0)}
                </p>
                <p className="text-[11px] text-gray-500">סה״כ כלים רשומים</p>
              </CardContent>
            </Card>
            <Card className="bg-[#0d1117] border-[#1e293b]">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-lg font-bold font-mono text-amber-400">
                  {mcpServers.reduce((sum, s) => sum + s.callsToday, 0)}
                </p>
                <p className="text-[11px] text-gray-500">קריאות סה״כ היום</p>
              </CardContent>
            </Card>
            <Card className="bg-[#0d1117] border-[#1e293b]">
              <CardContent className="py-3 px-4 text-center">
                <p className="text-lg font-bold font-mono text-violet-400">
                  {Math.round(mcpServers.reduce((sum, s) => sum + s.avgLatency, 0) / mcpServers.length)}ms
                </p>
                <p className="text-[11px] text-gray-500">Latency ממוצע כולל</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ======================== TOOLS REGISTRY TAB ======================== */}
        <TabsContent value="tools">
          <Card className="bg-[#0d1117] border-[#1e293b]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><FileJson className="h-5 w-5 text-emerald-400" /> רישום כלים — 15 כלים פעילים</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e293b] text-gray-400">
                    <TableHead className="text-right">שם כלי</TableHead>
                    <TableHead className="text-right">שרת</TableHead>
                    <TableHead className="text-right">תיאור</TableHead>
                    <TableHead className="text-center">שדות קלט</TableHead>
                    <TableHead className="text-center">קריאות היום</TableHead>
                    <TableHead className="text-center">זמן ממוצע</TableHead>
                    <TableHead className="text-right">הרשאות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {toolsRegistry.map((t) => (
                    <TableRow key={t.name} className="border-[#1e293b] hover:bg-white/5">
                      <TableCell className="font-mono text-sm text-cyan-300">{t.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="border-gray-600 text-gray-300 text-xs">{t.server}</Badge>
                      </TableCell>
                      <TableCell className="text-gray-300 text-xs max-w-[200px]">{t.desc}</TableCell>
                      <TableCell className="text-center font-mono">{t.inputFields}</TableCell>
                      <TableCell className="text-center font-mono font-bold">{t.callsToday}</TableCell>
                      <TableCell className="text-center font-mono text-amber-300">{t.avgDuration}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {t.permissions.split(", ").map((p) => (
                            <Badge key={p} variant="secondary" className="text-[10px] bg-violet-900/40 text-violet-300 border-violet-500/30">{p}</Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================== PERMISSIONS TAB ======================== */}
        <TabsContent value="permissions">
          <Card className="bg-[#0d1117] border-[#1e293b]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-amber-400" /> מטריצת הרשאות — תפקידים x כלים</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e293b] text-gray-400">
                    <TableHead className="text-right sticky right-0 bg-[#0d1117] z-10 min-w-[140px]">תפקיד</TableHead>
                    {permTools.map((t) => (
                      <TableHead key={t} className="text-center px-2">
                        <span className="font-mono text-[10px] text-cyan-300 block leading-tight">{t}</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roles.map((role) => (
                    <TableRow key={role} className="border-[#1e293b] hover:bg-white/5">
                      <TableCell className="font-semibold sticky right-0 bg-[#0d1117] z-10">{role}</TableCell>
                      {permMatrix[role].map((allowed, i) => (
                        <TableCell key={i} className="text-center">
                          {allowed ? (
                            <CheckCircle2 className="h-4 w-4 text-green-400 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-400/60 mx-auto" />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ======================== LOGS TAB ======================== */}
        <TabsContent value="logs">
          <Card className="bg-[#0d1117] border-[#1e293b]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2"><List className="h-5 w-5 text-cyan-400" /> לוג קריאות MCP אחרונות</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-[#1e293b] text-gray-400">
                    <TableHead className="text-right">זמן</TableHead>
                    <TableHead className="text-right">כלי</TableHead>
                    <TableHead className="text-right">קורא</TableHead>
                    <TableHead className="text-right">קלט (תצוגה מקדימה)</TableHead>
                    <TableHead className="text-center">סטטוס</TableHead>
                    <TableHead className="text-center">משך</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentLogs.map((log, idx) => (
                    <TableRow key={idx} className="border-[#1e293b] hover:bg-white/5">
                      <TableCell className="font-mono text-xs text-gray-400 whitespace-nowrap">{log.ts}</TableCell>
                      <TableCell className="font-mono text-sm text-cyan-300">{log.tool}</TableCell>
                      <TableCell className="text-sm">
                        <span className="flex items-center gap-1.5">
                          {log.caller.includes("user") ? <User className="h-3.5 w-3.5 text-blue-400" /> : <Bot className="h-3.5 w-3.5 text-violet-400" />}
                          {log.caller}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-gray-400 max-w-[220px] truncate">{log.input}</TableCell>
                      <TableCell className="text-center">
                        {log.status === "success" ? (
                          <Badge className="bg-green-900/50 text-green-300 border-green-500/30 text-xs">OK</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">Error</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono text-amber-300 text-xs">{log.duration}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Log summary footer */}
              <div className="mt-4 flex flex-wrap items-center gap-6 border-t border-[#1e293b] pt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  {recentLogs.filter((l) => l.status === "success").length} הצלחות
                </span>
                <span className="flex items-center gap-1.5">
                  <XCircle className="h-3.5 w-3.5 text-red-400" />
                  {recentLogs.filter((l) => l.status === "error").length} שגיאות
                </span>
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-blue-400" />
                  {recentLogs.filter((l) => l.caller.includes("user")).length} קריאות משתמש
                </span>
                <span className="flex items-center gap-1.5">
                  <Bot className="h-3.5 w-3.5 text-violet-400" />
                  {recentLogs.filter((l) => l.caller.includes("system")).length} קריאות מערכת
                </span>
                <span className="mr-auto font-mono text-gray-600">
                  Last refresh: 08/04/2026 09:42:15
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
