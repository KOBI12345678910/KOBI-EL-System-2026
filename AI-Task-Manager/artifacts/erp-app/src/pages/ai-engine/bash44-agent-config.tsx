import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Bot, Brain, Cpu, Settings2, FileText, GitBranch, Clock, Search,
  Power, PowerOff, Zap, Layers, ToggleLeft, ToggleRight, Play, Pause,
  RefreshCw, Calendar, Route, Mail, ShieldCheck, TrendingUp, Eye,
  MessageSquare, BarChart3, Sparkles, AlertTriangle, CheckCircle2
} from "lucide-react";

const agents = [
  { code: "AGT-001", name: "מנתח מסמכים", model: "claude-sonnet-4-6", format: "JSON", active: true, confidence: 92, escalation: 65, runs: 1847, lastRun: "08/04/2026 09:12" },
  { code: "AGT-002", name: "חיזוי מכירות", model: "gpt-5.2", format: "JSON", active: true, confidence: 88, escalation: 70, runs: 3214, lastRun: "08/04/2026 08:45" },
  { code: "AGT-003", name: "ניתוח סנטימנט", model: "claude-haiku-4-5", format: "טקסט", active: true, confidence: 85, escalation: 60, runs: 5621, lastRun: "08/04/2026 09:30" },
  { code: "AGT-004", name: "מיון לידים", model: "gemini-3-flash-preview", format: "JSON", active: true, confidence: 90, escalation: 75, runs: 2103, lastRun: "08/04/2026 07:55" },
  { code: "AGT-005", name: "חיזוי מלאי", model: "gpt-5-mini", format: "CSV", active: false, confidence: 78, escalation: 55, runs: 987, lastRun: "06/04/2026 22:10" },
  { code: "AGT-006", name: "ניתוח חשבוניות", model: "claude-sonnet-4-6", format: "JSON", active: true, confidence: 95, escalation: 80, runs: 4312, lastRun: "08/04/2026 09:05" },
  { code: "AGT-007", name: "זיהוי הונאות", model: "gpt-5.2", format: "JSON", active: true, confidence: 97, escalation: 90, runs: 8920, lastRun: "08/04/2026 09:31" },
  { code: "AGT-008", name: "סיכום פגישות", model: "kimi-k2.5", format: "טקסט", active: true, confidence: 82, escalation: 50, runs: 1456, lastRun: "07/04/2026 18:30" },
  { code: "AGT-009", name: "אופטימיזציית מחירים", model: "claude-opus-4-6", format: "JSON", active: false, confidence: 91, escalation: 85, runs: 632, lastRun: "05/04/2026 14:20" },
  { code: "AGT-010", name: "מענה לקוחות", model: "claude-haiku-4-5", format: "טקסט", active: true, confidence: 80, escalation: 55, runs: 12340, lastRun: "08/04/2026 09:32" },
  { code: "AGT-011", name: "בדיקת איכות", model: "gemini-2.5-pro", format: "JSON", active: true, confidence: 93, escalation: 70, runs: 3780, lastRun: "08/04/2026 08:20" },
  { code: "AGT-012", name: "תכנון ייצור", model: "gpt-5.3-codex", format: "JSON", active: true, confidence: 87, escalation: 65, runs: 2145, lastRun: "08/04/2026 06:00" },
  { code: "AGT-013", name: "ניתוח שוק", model: "claude-sonnet-4-6", format: "JSON", active: false, confidence: 84, escalation: 60, runs: 421, lastRun: "03/04/2026 11:45" },
  { code: "AGT-014", name: "אופטימיזציית שרשרת אספקה", model: "gpt-5.2", format: "CSV", active: true, confidence: 89, escalation: 75, runs: 1678, lastRun: "08/04/2026 07:30" },
  { code: "AGT-015", name: "ניהול סיכונים", model: "claude-opus-4-6", format: "JSON", active: true, confidence: 96, escalation: 88, runs: 934, lastRun: "08/04/2026 09:00" },
];

const templates = [
  { agent: "AGT-001", name: "תבנית ניתוח מסמך כללי", version: "3.2", isDefault: true, preview: "נתח את המסמך הבא וחלץ: כותרת, תאריך, סכום, צדדים, סעיפים עיקריים. החזר JSON מובנה." },
  { agent: "AGT-003", name: "תבנית סנטימנט לקוח", version: "2.8", isDefault: true, preview: "סווג את הסנטימנט של ההודעה: חיובי/שלילי/ניטרלי. ציין ביטחון 0-100 ומילות מפתח." },
  { agent: "AGT-006", name: "תבנית ניתוח חשבונית", version: "4.1", isDefault: true, preview: "חלץ מהחשבונית: מספר, תאריך, ספק, פריטים, סכומים, מע\"מ, סה\"כ. אמת נכונות חישובים." },
  { agent: "AGT-007", name: "תבנית זיהוי חריגות", version: "5.0", isDefault: false, preview: "בדוק עסקה: סכום חריג, תדירות, מיקום גיאוגרפי, דפוס שימוש. סווג סיכון: נמוך/בינוני/גבוה/קריטי." },
  { agent: "AGT-010", name: "תבנית מענה סטנדרטי", version: "2.4", isDefault: true, preview: "ענה ללקוח בעברית תקנית. שמור על טון מקצועי ואדיב. הפנה לנציג אם נדרש מידע רגיש." },
  { agent: "AGT-012", name: "תבנית תכנון ייצור שבועי", version: "1.9", isDefault: true, preview: "בהינתן הזמנות פתוחות וקיבולת, צור תוכנית ייצור שבועית עם חלוקה ליום, קו וצוות." },
  { agent: "AGT-015", name: "תבנית הערכת סיכון פיננסי", version: "3.5", isDefault: false, preview: "הערך סיכון: נזילות, אשראי, שוק, תפעולי. ציין הסתברות, חומרה, ותוכנית מיטיגציה." },
];

const routing = [
  { event: "חשבונית חדשה התקבלה", agents: ["AGT-006", "AGT-007"], enabled: true },
  { event: "ליד חדש נכנס ל-CRM", agents: ["AGT-004", "AGT-003"], enabled: true },
  { event: "הזמנת לקוח בוצעה", agents: ["AGT-002", "AGT-014"], enabled: true },
  { event: "תלונת לקוח נפתחה", agents: ["AGT-003", "AGT-010"], enabled: true },
  { event: "פקודת ייצור חדשה", agents: ["AGT-012", "AGT-005"], enabled: false },
  { event: "חריגת תקציב זוהתה", agents: ["AGT-015", "AGT-007"], enabled: true },
  { event: "מסמך חוזה הועלה", agents: ["AGT-001"], enabled: true },
  { event: "פגישת צוות הסתיימה", agents: ["AGT-008"], enabled: true },
  { event: "שינוי מחיר ספק", agents: ["AGT-009", "AGT-014"], enabled: false },
  { event: "דוח איכות שלילי", agents: ["AGT-011", "AGT-015"], enabled: true },
  { event: "עדכון מלאי קריטי", agents: ["AGT-005", "AGT-014"], enabled: true },
  { event: "בקשת הצעת מחיר", agents: ["AGT-009", "AGT-002"], enabled: true },
];

const jobs = [
  { code: "JOB-01", freq: "כל שעה", time: "XX:00", agents: ["AGT-007", "AGT-015"], lastRun: "08/04 09:00", nextRun: "08/04 10:00", status: "פעיל" },
  { code: "JOB-02", freq: "יומי", time: "06:00", agents: ["AGT-002", "AGT-012"], lastRun: "08/04 06:00", nextRun: "09/04 06:00", status: "פעיל" },
  { code: "JOB-03", freq: "יומי", time: "23:00", agents: ["AGT-005", "AGT-014"], lastRun: "07/04 23:00", nextRun: "08/04 23:00", status: "פעיל" },
  { code: "JOB-04", freq: "שבועי", time: "ראשון 07:00", agents: ["AGT-012", "AGT-011"], lastRun: "06/04 07:00", nextRun: "13/04 07:00", status: "פעיל" },
  { code: "JOB-05", freq: "חודשי", time: "1 בחודש 05:00", agents: ["AGT-013", "AGT-009"], lastRun: "01/04 05:00", nextRun: "01/05 05:00", status: "מושהה" },
  { code: "JOB-06", freq: "כל 15 דקות", time: "XX:00/15/30/45", agents: ["AGT-010"], lastRun: "08/04 09:30", nextRun: "08/04 09:45", status: "פעיל" },
];

const models = [
  { type: "שפה גדול (LLM)", name: "Claude Sonnet 4.6", provider: "Anthropic", useCases: "ניתוח מסמכים, חיזוי, קוד", status: "פעיל", load: 74, latency: "1.2s", requests: "18,420" },
  { type: "שפה מהיר", name: "Claude Haiku 4.5", provider: "Anthropic", useCases: "סנטימנט, מענה לקוחות, סיווג", status: "פעיל", load: 89, latency: "0.4s", requests: "42,310" },
  { type: "חשיבה עמוקה", name: "Claude Opus 4.6", provider: "Anthropic", useCases: "סיכונים, אסטרטגיה, ניתוח מורכב", status: "פעיל", load: 42, latency: "3.8s", requests: "2,145" },
  { type: "מולטימודלי", name: "GPT-5.2 Vision", provider: "OpenAI", useCases: "חשבוניות, תמונות, OCR", status: "פעיל", load: 61, latency: "1.8s", requests: "8,932" },
  { type: "עברית מותאם", name: "Kimi K2.5", provider: "Moonshot", useCases: "סיכום פגישות, תרגום, טקסט עברי", status: "תחזוקה", load: 0, latency: "-", requests: "3,621" },
];

const kpis = [
  { label: "סוכנים פעילים", value: "12/15", icon: Bot, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  { label: "הרצות היום", value: "4,218", icon: Zap, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  { label: "ביטחון ממוצע", value: "89.1%", icon: ShieldCheck, color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  { label: "תבניות פעילות", value: "5/7", icon: FileText, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  { label: "ניתובים פעילים", value: "10/12", icon: Route, color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  { label: "משימות מתוזמנות", value: "5/6", icon: Calendar, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
];

export default function Bash44AgentConfig() {
  const [search, setSearch] = useState("");
  const [agentStates, setAgentStates] = useState<Record<string, boolean>>(
    Object.fromEntries(agents.map(a => [a.code, a.active]))
  );
  const [routeStates, setRouteStates] = useState<Record<number, boolean>>(
    Object.fromEntries(routing.map((r, i) => [i, r.enabled]))
  );

  const toggleAgent = (code: string) => {
    setAgentStates(prev => ({ ...prev, [code]: !prev[code] }));
  };
  const toggleRoute = (idx: number) => {
    setRouteStates(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const filteredAgents = agents.filter(a =>
    a.name.includes(search) || a.code.includes(search) || a.model.includes(search)
  );

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-[#0a0e1a] via-[#101829] to-[#0a0e1a] p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <div className="p-2 bg-violet-500/20 rounded-lg">
              <Settings2 className="h-6 w-6 text-violet-400" />
            </div>
            הגדרת סוכני AI - טכנו-כל עוזי
          </h1>
          <p className="text-slate-400 mt-1 text-sm">ניהול סוכנים, תבניות פרומפט, ניתוב אירועים ומשימות מתוזמנות</p>
        </div>
        <Button variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:bg-slate-800">
          <RefreshCw className="h-4 w-4 ml-2" />
          רענן נתונים
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className={`border ${k.bg} bg-[#0d1321]`}>
            <CardContent className="p-4 flex items-center gap-3">
              <k.icon className={`h-5 w-5 ${k.color}`} />
              <div>
                <div className="text-xs text-slate-400">{k.label}</div>
                <div className={`text-lg font-bold ${k.color}`}>{k.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="agents" className="space-y-4">
        <TabsList className="bg-[#0d1321] border border-slate-800 p-1">
          <TabsTrigger value="agents" className="data-[state=active]:bg-violet-600/30 data-[state=active]:text-violet-300 gap-2">
            <Bot className="h-4 w-4" /> סוכנים ({agents.length})
          </TabsTrigger>
          <TabsTrigger value="templates" className="data-[state=active]:bg-blue-600/30 data-[state=active]:text-blue-300 gap-2">
            <FileText className="h-4 w-4" /> תבניות פרומפט ({templates.length})
          </TabsTrigger>
          <TabsTrigger value="routing" className="data-[state=active]:bg-cyan-600/30 data-[state=active]:text-cyan-300 gap-2">
            <GitBranch className="h-4 w-4" /> ניתוב אירועים ({routing.length})
          </TabsTrigger>
          <TabsTrigger value="jobs" className="data-[state=active]:bg-amber-600/30 data-[state=active]:text-amber-300 gap-2">
            <Clock className="h-4 w-4" /> משימות מתוזמנות ({jobs.length})
          </TabsTrigger>
          <TabsTrigger value="models" className="data-[state=active]:bg-emerald-600/30 data-[state=active]:text-emerald-300 gap-2">
            <Layers className="h-4 w-4" /> מחסנית מודלים ({models.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Agents */}
        <TabsContent value="agents" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <Input
                placeholder="חיפוש סוכן..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-10 bg-[#0d1321] border-slate-700 text-slate-200"
              />
            </div>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
              {Object.values(agentStates).filter(Boolean).length} פעילים
            </Badge>
          </div>
          <div className="grid gap-3">
            {filteredAgents.map(a => (
              <Card key={a.code} className={`bg-[#0d1321] border-slate-800 ${agentStates[a.code] ? "" : "opacity-60"}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <Badge variant="outline" className="font-mono border-slate-600 text-slate-300 text-xs">{a.code}</Badge>
                        <span className="font-semibold text-white">{a.name}</span>
                      </div>
                      <Badge className="bg-slate-800 text-slate-300 text-xs">{a.model}</Badge>
                      <Badge variant="outline" className="border-slate-600 text-slate-400 text-xs">{a.format}</Badge>
                      <div className="flex items-center gap-2 min-w-[140px]">
                        <span className="text-xs text-slate-500">ביטחון:</span>
                        <Progress value={a.confidence} className="h-2 w-20" />
                        <span className="text-xs text-slate-300">{a.confidence}%</span>
                      </div>
                      <div className="flex items-center gap-1 min-w-[80px]">
                        <span className="text-xs text-slate-500">הסלמה:</span>
                        <span className="text-xs text-amber-400">{a.escalation}%</span>
                      </div>
                      <div className="flex items-center gap-1 min-w-[90px]">
                        <Play className="h-3 w-3 text-slate-500" />
                        <span className="text-xs text-slate-300">{a.runs.toLocaleString()}</span>
                      </div>
                      <span className="text-xs text-slate-500">{a.lastRun}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleAgent(a.code)}
                      className={agentStates[a.code] ? "text-emerald-400 hover:text-emerald-300" : "text-slate-500 hover:text-slate-400"}
                    >
                      {agentStates[a.code] ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                      <span className="text-xs mr-1">{agentStates[a.code] ? "פעיל" : "כבוי"}</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 2: Prompt Templates */}
        <TabsContent value="templates" className="space-y-4">
          <div className="grid gap-3">
            {templates.map((t, i) => (
              <Card key={i} className="bg-[#0d1321] border-slate-800">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-blue-400" />
                      <span className="font-semibold text-white">{t.name}</span>
                      <Badge variant="outline" className="font-mono border-slate-600 text-slate-400 text-xs">{t.agent}</Badge>
                      <Badge className="bg-slate-800 text-slate-300 text-xs">v{t.version}</Badge>
                      {t.isDefault ? (
                        <Badge className="bg-blue-500/20 text-blue-300 text-xs">ברירת מחדל</Badge>
                      ) : (
                        <Badge variant="outline" className="border-slate-600 text-slate-500 text-xs">משנית</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs">
                        <Eye className="h-3 w-3 ml-1" />
                        תצוגה מקדימה
                      </Button>
                    </div>
                  </div>
                  <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
                    <p className="text-sm text-slate-400 leading-relaxed">{t.preview}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Event Routing */}
        <TabsContent value="routing" className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
              {Object.values(routeStates).filter(Boolean).length} ניתובים פעילים
            </Badge>
            <Badge variant="outline" className="border-slate-600 text-slate-500">
              {Object.values(routeStates).filter(v => !v).length} מושבתים
            </Badge>
          </div>
          <div className="grid gap-3">
            {routing.map((r, i) => (
              <Card key={i} className={`bg-[#0d1321] border-slate-800 ${routeStates[i] ? "" : "opacity-60"}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Mail className="h-4 w-4 text-cyan-400" />
                      <span className="font-medium text-white min-w-[200px]">{r.event}</span>
                      <div className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3 text-slate-500" />
                        {r.agents.map(ag => (
                          <Badge key={ag} variant="outline" className="font-mono border-violet-500/30 text-violet-300 text-xs">{ag}</Badge>
                        ))}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleRoute(i)}
                      className={routeStates[i] ? "text-emerald-400 hover:text-emerald-300" : "text-red-400 hover:text-red-300"}
                    >
                      {routeStates[i] ? <Power className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
                      <span className="text-xs mr-1">{routeStates[i] ? "מופעל" : "מושבת"}</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 4: Scheduled Jobs */}
        <TabsContent value="jobs" className="space-y-4">
          <Card className="bg-[#0d1321] border-slate-800">
            <CardContent className="p-3 flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-amber-400" />
                <span className="text-sm text-slate-300">סה"כ משימות: <span className="text-white font-semibold">{jobs.length}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-slate-300">פעילות: <span className="text-emerald-400 font-semibold">{jobs.filter(j => j.status === "פעיל").length}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Pause className="h-4 w-4 text-amber-400" />
                <span className="text-sm text-slate-300">מושהות: <span className="text-amber-400 font-semibold">{jobs.filter(j => j.status === "מושהה").length}</span></span>
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-3">
            {jobs.map(j => (
              <Card key={j.code} className="bg-[#0d1321] border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <Badge variant="outline" className="font-mono border-amber-500/30 text-amber-300 text-xs">{j.code}</Badge>
                      <div className="flex items-center gap-2 min-w-[120px]">
                        <Clock className="h-3 w-3 text-slate-500" />
                        <span className="text-sm text-white">{j.freq}</span>
                      </div>
                      <Badge className="bg-slate-800 text-slate-300 text-xs">{j.time}</Badge>
                      <div className="flex items-center gap-1">
                        {j.agents.map(ag => (
                          <Badge key={ag} variant="outline" className="font-mono border-violet-500/30 text-violet-300 text-xs">{ag}</Badge>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>אחרון: {j.lastRun}</span>
                        <span className="text-slate-700">|</span>
                        <span>הבא: {j.nextRun}</span>
                      </div>
                    </div>
                    <Badge className={
                      j.status === "פעיל"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-amber-500/20 text-amber-300"
                    }>
                      {j.status === "פעיל" ? <Play className="h-3 w-3 ml-1" /> : <Pause className="h-3 w-3 ml-1" />}
                      {j.status}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 5: Model Stack */}
        <TabsContent value="models" className="space-y-4">
          <Card className="bg-[#0d1321] border-slate-800">
            <CardContent className="p-3 flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-slate-300">מודלים במחסנית: <span className="text-white font-semibold">{models.length}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm text-slate-300">פעילים: <span className="text-emerald-400 font-semibold">{models.filter(m => m.status === "פעיל").length}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-400" />
                <span className="text-sm text-slate-300">עומס ממוצע: <span className="text-blue-400 font-semibold">{Math.round(models.filter(m => m.load > 0).reduce((a, b) => a + b.load, 0) / models.filter(m => m.load > 0).length)}%</span></span>
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-3">
            {models.map((m, i) => (
              <Card key={i} className="bg-[#0d1321] border-slate-800">
                <CardHeader className="pb-2 pt-4 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Cpu className="h-5 w-5 text-emerald-400" />
                      <CardTitle className="text-base text-white">{m.name}</CardTitle>
                      <Badge className="bg-slate-800 text-slate-300 text-xs">{m.type}</Badge>
                    </div>
                    <Badge className={
                      m.status === "פעיל"
                        ? "bg-emerald-500/20 text-emerald-300"
                        : "bg-amber-500/20 text-amber-300"
                    }>
                      {m.status === "פעיל" ? <CheckCircle2 className="h-3 w-3 ml-1" /> : <AlertTriangle className="h-3 w-3 ml-1" />}
                      {m.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3 w-3 text-slate-500" />
                    <span className="text-sm text-slate-400">שימושים: {m.useCases}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">ספק: {m.provider}</Badge>
                      <span className="text-xs text-slate-500">זמן תגובה: <span className="text-slate-300">{m.latency}</span></span>
                      <span className="text-xs text-slate-500">בקשות החודש: <span className="text-slate-300">{m.requests}</span></span>
                    </div>
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <span className="text-xs text-slate-500">עומס:</span>
                      <Progress value={m.load} className="h-2 w-28" />
                      <span className={`text-xs font-medium ${
                        m.load > 80 ? "text-red-400" : m.load > 50 ? "text-amber-400" : m.load > 0 ? "text-emerald-400" : "text-slate-500"
                      }`}>{m.load}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
