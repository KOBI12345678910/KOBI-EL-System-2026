import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Bot, Plus, Play, Save, Send, Settings, Search, FileText,
  Mail, Database, Globe, Shield, Terminal, Zap, Activity,
  Cpu, MessageSquare, Layers, CheckCircle2, AlertTriangle,
  Sparkles, Edit, Copy, Trash2, Circle, GitBranch, Thermometer,
  Book, Lock, Users, DollarSign, UserCog, ShoppingCart, Headphones, Target
} from "lucide-react";

type AgentStatus = "active" | "draft" | "testing";
type ModelType = "claude-opus-4" | "claude-sonnet-4" | "claude-haiku-4" | "gpt-4";
type Environment = "dev" | "staging" | "prod";

interface Agent {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
  model: ModelType;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  tools: string[];
  contextSources: string[];
  guardrails: string[];
  icon: any;
  color: string;
  bgHex: string;
  tokensUsed: number;
  tokensLimit: number;
  lastRun: string;
  successRate: number;
}

type TabKey = "general" | "prompt" | "tools" | "context" | "guardrails" | "testing";

const STATUS_CONFIG: Record<AgentStatus, { color: string; bgHex: string; label: string }> = {
  active: { color: "text-green-400", bgHex: "#22c55e", label: "פעיל" },
  draft: { color: "text-gray-400", bgHex: "#6b7280", label: "טיוטה" },
  testing: { color: "text-amber-400", bgHex: "#f59e0b", label: "בבדיקה" },
};

const AVAILABLE_TOOLS = [
  { id: "search", name: "Web Search", desc: "חיפוש ברשת", icon: Search, category: "מידע" },
  { id: "read_file", name: "Read File", desc: "קריאת קובץ", icon: FileText, category: "קבצים" },
  { id: "write_file", name: "Write File", desc: "כתיבת קובץ", icon: Edit, category: "קבצים" },
  { id: "sql_query", name: "SQL Query", desc: "שאילתות SQL", icon: Database, category: "נתונים" },
  { id: "send_email", name: "Send Email", desc: "שליחת מייל", icon: Mail, category: "תקשורת" },
  { id: "api_call", name: "API Call", desc: "קריאת API", icon: Globe, category: "אינטגרציה" },
  { id: "terminal", name: "Terminal", desc: "הרצת פקודות", icon: Terminal, category: "מערכת" },
  { id: "ontology", name: "Ontology Query", desc: "שאילתות אונטולוגיה", icon: GitBranch, category: "נתונים" },
  { id: "chart", name: "Chart Builder", desc: "בניית גרפים", icon: Activity, category: "ויזואליזציה" },
];

const CONTEXT_SOURCES = [
  { id: "crm_customers", name: "CRM Customers", type: "Dataset", rows: 4521, size: "12.4MB" },
  { id: "finance_docs", name: "Financial Documents", type: "Documents", rows: 892, size: "84.2MB" },
  { id: "procurement_db", name: "Procurement Database", type: "Dataset", rows: 15032, size: "45.8MB" },
  { id: "ontology_main", name: "Main Ontology", type: "Ontology", rows: 124, size: "3.2MB" },
  { id: "policies_doc", name: "Company Policies", type: "Documents", rows: 56, size: "8.1MB" },
  { id: "product_catalog", name: "Product Catalog", type: "Dataset", rows: 2340, size: "18.5MB" },
];

const MOCK_AGENTS: Agent[] = [
  {
    id: "a1",
    name: "Finance Agent",
    description: "סוכן פיננסי אוטומטי - ניתוח דוחות, תזרים מזומנים, התאמות בנק",
    status: "active",
    model: "claude-opus-4",
    temperature: 0.3,
    maxTokens: 4096,
    systemPrompt: "אתה סוכן פיננסי מקצועי. תפקידך לנתח דוחות כספיים, לזהות חריגות, ולהכין סיכומים.\nפעל בזהירות ותמיד אמת נתונים מול מספר מקורות.\nכשאתה משתמש בנתונים רגישים - וודא הרשאה.",
    tools: ["sql_query", "read_file", "chart", "send_email"],
    contextSources: ["crm_customers", "finance_docs"],
    guardrails: ["אל תבצע העברות כספים", "אל תחשוף מידע חסוי", "דרוש אישור לפעולות מעל 100K"],
    icon: DollarSign,
    color: "text-green-400",
    bgHex: "#22c55e",
    tokensUsed: 842000,
    tokensLimit: 1000000,
    lastRun: "2026-04-10T09:15",
    successRate: 96.4,
  },
  {
    id: "a2",
    name: "Procurement Bot",
    description: "בוט רכש - הזמנות אוטומטיות, השוואת ספקים, אופטימיזציה",
    status: "active",
    model: "claude-sonnet-4",
    temperature: 0.4,
    maxTokens: 2048,
    systemPrompt: "אתה בוט רכש חכם. עזור למצוא את הספקים הטובים ביותר, להשוות מחירים, ולאופטם הזמנות.\nתן עדיפות לספקים מקומיים ובעלי היסטוריה טובה.",
    tools: ["sql_query", "api_call", "search", "send_email"],
    contextSources: ["procurement_db", "product_catalog"],
    guardrails: ["אל תבצע הזמנות מעל ₪50K ללא אישור", "בדוק תמיד דרגת ספק"],
    icon: ShoppingCart,
    color: "text-blue-400",
    bgHex: "#3b82f6",
    tokensUsed: 456000,
    tokensLimit: 500000,
    lastRun: "2026-04-10T08:42",
    successRate: 94.1,
  },
  {
    id: "a3",
    name: "HR Assistant",
    description: "עוזר משאבי אנוש - גיוס, הדרכה, ניהול עובדים",
    status: "active",
    model: "claude-sonnet-4",
    temperature: 0.5,
    maxTokens: 3072,
    systemPrompt: "אתה עוזר HR אנושי ואמפתי. עזור לעובדים עם שאלות, תהליכי גיוס, והדרכות.\nתמיד שמור על דיסקרטיות וגישה מכבדת.",
    tools: ["read_file", "send_email", "search"],
    contextSources: ["policies_doc"],
    guardrails: ["אל תחשוף שכר", "אל תדון במידע אישי", "העבר תלונות לאנוש"],
    icon: UserCog,
    color: "text-purple-400",
    bgHex: "#a855f7",
    tokensUsed: 234000,
    tokensLimit: 400000,
    lastRun: "2026-04-10T07:30",
    successRate: 98.2,
  },
  {
    id: "a4",
    name: "QA Inspector",
    description: "בודק איכות - ניתוח ליקויים, דוחות QC, המלצות",
    status: "testing",
    model: "claude-opus-4",
    temperature: 0.2,
    maxTokens: 4096,
    systemPrompt: "אתה מפקח איכות מדויק. נתח דוחות QC, זהה מגמות, והצע פתרונות.\nהיה מדויק ואובייקטיבי בכל הערכה.",
    tools: ["sql_query", "chart", "read_file"],
    contextSources: ["product_catalog"],
    guardrails: ["בסס כל טענה על נתונים", "אל תסיק מדגמים קטנים"],
    icon: CheckCircle2,
    color: "text-amber-400",
    bgHex: "#f59e0b",
    tokensUsed: 120000,
    tokensLimit: 300000,
    lastRun: "2026-04-09T16:20",
    successRate: 91.7,
  },
  {
    id: "a5",
    name: "Customer Support",
    description: "תמיכת לקוחות 24/7 - שאלות נפוצות, פתרון בעיות",
    status: "active",
    model: "claude-haiku-4",
    temperature: 0.6,
    maxTokens: 1024,
    systemPrompt: "אתה נציג תמיכה חם ומועיל. ענה על שאלות לקוחות בצורה ברורה ומהירה.\nאם אתה לא יודע - העבר לנציג אנושי.",
    tools: ["search", "read_file", "send_email"],
    contextSources: ["crm_customers", "policies_doc"],
    guardrails: ["אל תבטיח הנחות ללא אישור", "העבר תלונות חמורות"],
    icon: Headphones,
    color: "text-cyan-400",
    bgHex: "#06b6d4",
    tokensUsed: 1450000,
    tokensLimit: 2000000,
    lastRun: "2026-04-10T09:45",
    successRate: 93.5,
  },
  {
    id: "a6",
    name: "Sales Closer",
    description: "סוכן מכירות - סגירת עסקאות, הצעות מחיר, follow-up",
    status: "active",
    model: "claude-opus-4",
    temperature: 0.7,
    maxTokens: 3072,
    systemPrompt: "אתה איש מכירות נלהב ומשכנע. עזור לסגור עסקאות, להכין הצעות מחיר, ולעקוב אחרי לידים.",
    tools: ["sql_query", "send_email", "chart"],
    contextSources: ["crm_customers", "product_catalog"],
    guardrails: ["אל תציע מחירים מתחת לסף", "אשר הנחות מעל 15%"],
    icon: Target,
    color: "text-orange-400",
    bgHex: "#f97316",
    tokensUsed: 623000,
    tokensLimit: 800000,
    lastRun: "2026-04-10T09:10",
    successRate: 89.4,
  },
  {
    id: "a7",
    name: "Document Parser",
    description: "מנתח מסמכים - חוזים, חשבוניות, אישורים",
    status: "testing",
    model: "claude-sonnet-4",
    temperature: 0.1,
    maxTokens: 4096,
    systemPrompt: "אתה מנתח מסמכים מדויק. חלץ מידע מובנה ממסמכים, אמת נתונים, וצור סיכומים.",
    tools: ["read_file", "sql_query", "ontology"],
    contextSources: ["finance_docs", "ontology_main"],
    guardrails: ["אל תשנה מסמכי מקור", "דווח על חוסרים"],
    icon: FileText,
    color: "text-indigo-400",
    bgHex: "#6366f1",
    tokensUsed: 189000,
    tokensLimit: 500000,
    lastRun: "2026-04-09T14:30",
    successRate: 97.8,
  },
  {
    id: "a8",
    name: "Legal Reviewer",
    description: "בוחן משפטי - סקירת חוזים, זיהוי סיכונים",
    status: "draft",
    model: "claude-opus-4",
    temperature: 0.2,
    maxTokens: 4096,
    systemPrompt: "אתה סוקר משפטי זהיר. סקור חוזים, זהה סיכונים, והצע תיקונים.\nתמיד הוסף דיסקליימר שהתוצאה לא מחליפה ייעוץ משפטי.",
    tools: ["read_file", "search", "ontology"],
    contextSources: ["policies_doc"],
    guardrails: ["זה לא ייעוץ משפטי", "העבר חוזים קריטיים ליועץ אנושי"],
    icon: Shield,
    color: "text-red-400",
    bgHex: "#ef4444",
    tokensUsed: 0,
    tokensLimit: 200000,
    lastRun: "מעולם לא רץ",
    successRate: 0,
  },
  {
    id: "a9",
    name: "Data Analyst",
    description: "אנליסט נתונים - ניתוחים מתקדמים, דוחות, תובנות",
    status: "active",
    model: "claude-opus-4",
    temperature: 0.3,
    maxTokens: 4096,
    systemPrompt: "אתה אנליסט נתונים מיומן. בצע ניתוחים סטטיסטיים, זהה מגמות, וצור תובנות עסקיות.",
    tools: ["sql_query", "chart", "read_file", "ontology"],
    contextSources: ["crm_customers", "finance_docs", "procurement_db"],
    guardrails: ["תעד תמיד את המתודולוגיה", "הבחן בין קורלציה לסיבתיות"],
    icon: Activity,
    color: "text-teal-400",
    bgHex: "#14b8a6",
    tokensUsed: 891000,
    tokensLimit: 1200000,
    lastRun: "2026-04-10T08:55",
    successRate: 95.6,
  },
  {
    id: "a10",
    name: "Marketing Writer",
    description: "כותב שיווקי - תוכן, מיילים, רשתות חברתיות",
    status: "active",
    model: "claude-sonnet-4",
    temperature: 0.8,
    maxTokens: 2048,
    systemPrompt: "אתה כותב שיווקי יצירתי. צור תוכן משכנע, מעניין, ומותאם לקהל היעד.",
    tools: ["search", "send_email", "write_file"],
    contextSources: ["product_catalog"],
    guardrails: ["שמור על ה-tone של המותג", "אל תבטיח הבטחות לא אפשריות"],
    icon: Edit,
    color: "text-pink-400",
    bgHex: "#ec4899",
    tokensUsed: 567000,
    tokensLimit: 700000,
    lastRun: "2026-04-10T08:20",
    successRate: 92.3,
  },
  {
    id: "a11",
    name: "Security Monitor",
    description: "צופה אבטחה - מעקב לוגים, זיהוי אנומליות, התראות",
    status: "active",
    model: "claude-opus-4",
    temperature: 0.1,
    maxTokens: 4096,
    systemPrompt: "אתה מפקח אבטחה ערני. נתח לוגים, זהה אנומליות, והתרע על איומים פוטנציאליים.",
    tools: ["sql_query", "read_file", "send_email", "api_call"],
    contextSources: ["ontology_main"],
    guardrails: ["אל תחסום משתמשים אוטומטית", "תעד כל התראה", "העבר לאבטחת מידע"],
    icon: Lock,
    color: "text-rose-400",
    bgHex: "#f43f5e",
    tokensUsed: 1120000,
    tokensLimit: 1500000,
    lastRun: "2026-04-10T09:50",
    successRate: 99.1,
  },
  {
    id: "a12",
    name: "Knowledge Keeper",
    description: "שומר ידע - ניהול אונטולוגיה, גיבוי מידע, Q&A",
    status: "draft",
    model: "claude-haiku-4",
    temperature: 0.4,
    maxTokens: 2048,
    systemPrompt: "אתה שומר הידע של הארגון. עזור לנהל אונטולוגיה, לענות על שאלות, ולשמור על עקביות מידע.",
    tools: ["ontology", "read_file", "write_file", "search"],
    contextSources: ["ontology_main", "policies_doc"],
    guardrails: ["אל תשנה אונטולוגיה ללא אישור", "תעד שינויים"],
    icon: Book,
    color: "text-yellow-400",
    bgHex: "#facc15",
    tokensUsed: 45000,
    tokensLimit: 300000,
    lastRun: "2026-04-08T10:20",
    successRate: 88.9,
  },
];

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  time: string;
}

const INITIAL_CHAT: ChatMessage[] = [
  { role: "user", text: "מה מצב תזרים המזומנים שלנו החודש?", time: "09:15" },
  { role: "assistant", text: "בדקתי את הנתונים הפיננסיים העדכניים. תזרים המזומנים נטו לחודש אפריל הוא ₪1.84M חיובי, עלייה של 12% לעומת מרץ. הגידול העיקרי מגיע מתקבולים מטבע ואלקטרה. ישנה חריגה קלה בהוצאות משכורות - 3% מעל התחזית. האם תרצה פירוט?", time: "09:15" },
  { role: "user", text: "כן, תוציא דוח מפורט", time: "09:16" },
  { role: "assistant", text: "מכין דוח מפורט... הדוח ישלח אליך באימייל תוך דקה. הוא כולל: 1) פירוט לפי קטגוריות, 2) השוואה לחודש קודם, 3) המלצות לחיסכון, 4) תחזית ל-Q2.", time: "09:16" },
];

export default function AIPAgentStudio() {
  const [selectedAgentId, setSelectedAgentId] = useState<string>("a1");
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [environment, setEnvironment] = useState<Environment>("staging");
  const [chatInput, setChatInput] = useState("");
  const [chat] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [editedSystemPrompt, setEditedSystemPrompt] = useState("");

  const { data } = useQuery({
    queryKey: ["aip-agents"],
    queryFn: async () => {
      try {
        const res = await authFetch("/api/palantir/aip-agent-studio");
        if (!res.ok) throw new Error("fallback");
        return await res.json();
      } catch {
        return { agents: MOCK_AGENTS };
      }
    },
  });

  const agents: Agent[] = data?.agents || MOCK_AGENTS;
  const selected = agents.find((a) => a.id === selectedAgentId) || agents[0];
  const SelectedIcon = selected.icon;
  const usagePct = (selected.tokensUsed / selected.tokensLimit) * 100;

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: "general", label: "הגדרות כלליות", icon: Settings },
    { key: "prompt", label: "System Prompt", icon: MessageSquare },
    { key: "tools", label: "כלים", icon: Zap },
    { key: "context", label: "מקורות הקשר", icon: Database },
    { key: "guardrails", label: "מגבלות", icon: Shield },
    { key: "testing", label: "Testing", icon: Play },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0e1a] text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/40">
            <Bot className="h-7 w-7 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AIP Agent Studio — בניית סוכני AI</h1>
            <p className="text-sm text-gray-400">פלטפורמה להגדרה, בדיקה ופריסה של סוכני AI חכמים</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={environment} onChange={(e) => setEnvironment(e.target.value as Environment)} className="bg-[#111827] border border-[#1f2937] rounded-md px-3 py-2 text-xs h-9">
            <option value="dev">סביבת פיתוח</option>
            <option value="staging">סביבת staging</option>
            <option value="prod">סביבת פרודקשן</option>
          </select>
          <Button className="h-9 bg-violet-600 hover:bg-violet-700 text-xs">
            <Sparkles className="h-3.5 w-3.5 ml-1" /> Deploy to {environment}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-3">
            <div className="text-[10px] text-gray-400">סה"כ סוכנים</div>
            <div className="text-xl font-bold text-violet-400">{agents.length}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-3">
            <div className="text-[10px] text-gray-400">פעילים</div>
            <div className="text-xl font-bold text-green-400">{agents.filter((a) => a.status === "active").length}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-3">
            <div className="text-[10px] text-gray-400">בבדיקה</div>
            <div className="text-xl font-bold text-amber-400">{agents.filter((a) => a.status === "testing").length}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-3">
            <div className="text-[10px] text-gray-400">טיוטות</div>
            <div className="text-xl font-bold text-gray-400">{agents.filter((a) => a.status === "draft").length}</div>
          </CardContent>
        </Card>
        <Card className="bg-[#111827] border-[#1f2937]">
          <CardContent className="p-3">
            <div className="text-[10px] text-gray-400">סה"כ טוקנים חודשי</div>
            <div className="text-xl font-bold text-fuchsia-400">{(agents.reduce((s, a) => s + a.tokensUsed, 0) / 1000000).toFixed(1)}M</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* LEFT: Agent list */}
        <div className="col-span-3">
          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-white text-sm">
                  <Layers className="h-4 w-4 text-violet-400" />
                  סוכנים
                </CardTitle>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-violet-500/10">
                  <Plus className="h-4 w-4 text-violet-400" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[750px] overflow-y-auto">
                {agents.map((agent) => {
                  const Icon = agent.icon;
                  const status = STATUS_CONFIG[agent.status];
                  const isSelected = agent.id === selectedAgentId;
                  return (
                    <div
                      key={agent.id}
                      onClick={() => { setSelectedAgentId(agent.id); setActiveTab("general"); }}
                      className={`px-3 py-3 border-b border-[#1f2937] cursor-pointer hover:bg-[#0a0e1a] ${isSelected ? "bg-violet-500/10 border-r-2 border-r-violet-500" : ""}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className="p-1.5 rounded-md flex-shrink-0" style={{ backgroundColor: agent.bgHex + "20" }}>
                          <Icon className={`h-4 w-4 ${agent.color}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <div className="text-xs font-bold truncate">{agent.name}</div>
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: status.bgHex }} />
                          </div>
                          <div className="text-[10px] text-gray-500 truncate mt-0.5">{agent.description}</div>
                          <div className="flex items-center gap-1.5 mt-1.5">
                            <Badge variant="outline" className="h-4 text-[9px] border-[#1f2937]" style={{ color: status.bgHex }}>
                              {status.label}
                            </Badge>
                            <span className="text-[9px] text-gray-600">{agent.model.split("-").slice(0, 2).join(" ")}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* CENTER: Agent editor */}
        <div className="col-span-6">
          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg" style={{ backgroundColor: selected.bgHex + "20", border: `1px solid ${selected.bgHex}40` }}>
                    <SelectedIcon className={`h-5 w-5 ${selected.color}`} />
                  </div>
                  <div>
                    <CardTitle className="text-white text-base">{selected.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="h-4 text-[9px] border-[#1f2937]" style={{ color: STATUS_CONFIG[selected.status].bgHex }}>
                        {STATUS_CONFIG[selected.status].label}
                      </Badge>
                      <span className="text-[10px] text-gray-500">• {selected.model}</span>
                      <span className="text-[10px] text-gray-500">• {selected.successRate}% הצלחה</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Copy className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Save className="h-3.5 w-3.5 text-green-400" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0"><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 mt-4 border-b border-[#1f2937]">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = tab.key === activeTab;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs border-b-2 transition-colors ${
                        isActive
                          ? "border-violet-500 text-violet-400"
                          : "border-transparent text-gray-400 hover:text-white"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent>
              {/* General tab */}
              {activeTab === "general" && (
                <div className="space-y-4">
                  <div>
                    <label className="text-[11px] text-gray-400 mb-1 block">שם הסוכן</label>
                    <Input value={selected.name} className="bg-[#0a0e1a] border-[#1f2937] h-9 text-xs" readOnly />
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 mb-1 block">תיאור</label>
                    <Textarea value={selected.description} className="bg-[#0a0e1a] border-[#1f2937] text-xs min-h-[60px]" readOnly />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-gray-400 mb-1 block">מודל</label>
                      <select defaultValue={selected.model} className="w-full bg-[#0a0e1a] border border-[#1f2937] rounded-md px-3 py-2 text-xs h-9">
                        <option value="claude-opus-4">Claude Opus 4</option>
                        <option value="claude-sonnet-4">Claude Sonnet 4</option>
                        <option value="claude-haiku-4">Claude Haiku 4</option>
                        <option value="gpt-4">GPT-4</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 mb-1 block">Max Tokens</label>
                      <Input type="number" defaultValue={selected.maxTokens} className="bg-[#0a0e1a] border-[#1f2937] h-9 text-xs" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-gray-400 mb-1 flex items-center justify-between">
                      <span>Temperature</span>
                      <span className="text-violet-400 font-bold">{selected.temperature}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <Thermometer className="h-3.5 w-3.5 text-gray-500" />
                      <input type="range" min="0" max="1" step="0.1" defaultValue={selected.temperature} className="flex-1 accent-violet-500" />
                    </div>
                    <div className="flex justify-between text-[9px] text-gray-600 mt-1">
                      <span>דטרמיניסטי</span>
                      <span>יצירתי</span>
                    </div>
                  </div>

                  {/* Token usage meter */}
                  <div className="p-3 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">שימוש בטוקנים (חודשי)</span>
                      <span className="text-xs font-bold text-violet-400">{(selected.tokensUsed / 1000).toFixed(0)}K / {(selected.tokensLimit / 1000).toFixed(0)}K</span>
                    </div>
                    <div className="h-2 bg-[#111827] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${usagePct}%`,
                          backgroundColor: usagePct > 90 ? "#ef4444" : usagePct > 70 ? "#f59e0b" : "#22c55e",
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                      <span>0</span>
                      <span className={usagePct > 80 ? "text-red-400" : ""}>{usagePct.toFixed(1)}%</span>
                      <span>Limit</span>
                    </div>
                  </div>
                </div>
              )}

              {/* System Prompt tab */}
              {activeTab === "prompt" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] text-gray-400">System Prompt</label>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="h-4 text-[9px] border-[#1f2937] text-gray-400">
                        {selected.systemPrompt.length} תווים
                      </Badge>
                      <Badge variant="outline" className="h-4 text-[9px] border-[#1f2937] text-violet-400">
                        ~{Math.round(selected.systemPrompt.length / 4)} טוקנים
                      </Badge>
                    </div>
                  </div>
                  <div className="rounded-lg border border-[#1f2937] overflow-hidden">
                    <div className="bg-[#0a0e1a] px-3 py-1.5 border-b border-[#1f2937] flex items-center gap-2 text-[10px] text-gray-500">
                      <Circle className="h-2 w-2 fill-red-500 text-red-500" />
                      <Circle className="h-2 w-2 fill-amber-500 text-amber-500" />
                      <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                      <span className="ml-auto font-mono">system.md</span>
                    </div>
                    <textarea
                      value={editedSystemPrompt || selected.systemPrompt}
                      onChange={(e) => setEditedSystemPrompt(e.target.value)}
                      className="w-full bg-[#0a0e1a] text-xs p-3 font-mono text-gray-300 border-0 outline-none min-h-[320px] resize-none"
                      dir="rtl"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" className="h-8 text-xs bg-violet-600 hover:bg-violet-700">
                      <Save className="h-3 w-3 ml-1" /> שמור prompt
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs border-[#1f2937]">
                      <Sparkles className="h-3 w-3 ml-1" /> AI הצעות שיפור
                    </Button>
                  </div>
                </div>
              )}

              {/* Tools tab */}
              {activeTab === "tools" && (
                <div className="space-y-3">
                  <div className="text-[11px] text-gray-400">בחר את הכלים שהסוכן יכול להשתמש בהם:</div>
                  <div className="grid grid-cols-2 gap-2">
                    {AVAILABLE_TOOLS.map((tool) => {
                      const Icon = tool.icon;
                      const active = selected.tools.includes(tool.id);
                      return (
                        <label
                          key={tool.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                            active ? "bg-violet-500/10 border-violet-500/40" : "bg-[#0a0e1a] border-[#1f2937] hover:border-[#374151]"
                          }`}
                        >
                          <input type="checkbox" checked={active} readOnly className="accent-violet-500" />
                          <div className="p-1.5 rounded" style={{ backgroundColor: active ? "#8b5cf620" : "#1f2937" }}>
                            <Icon className={`h-3.5 w-3.5 ${active ? "text-violet-400" : "text-gray-500"}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold">{tool.name}</div>
                            <div className="text-[10px] text-gray-500">{tool.desc}</div>
                          </div>
                          <Badge variant="outline" className="h-4 text-[9px] border-[#1f2937] text-gray-400">
                            {tool.category}
                          </Badge>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Context tab */}
              {activeTab === "context" && (
                <div className="space-y-3">
                  <div className="text-[11px] text-gray-400">מקורות מידע שהסוכן יכול לגשת אליהם:</div>
                  <div className="space-y-2">
                    {CONTEXT_SOURCES.map((src) => {
                      const active = selected.contextSources.includes(src.id);
                      return (
                        <label
                          key={src.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                            active ? "bg-violet-500/10 border-violet-500/40" : "bg-[#0a0e1a] border-[#1f2937]"
                          }`}
                        >
                          <input type="checkbox" checked={active} readOnly className="accent-violet-500" />
                          <Database className={`h-4 w-4 ${active ? "text-violet-400" : "text-gray-500"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold">{src.name}</div>
                            <div className="text-[10px] text-gray-500">{src.type} • {src.rows.toLocaleString()} רשומות • {src.size}</div>
                          </div>
                          {active && <CheckCircle2 className="h-4 w-4 text-violet-400" />}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Guardrails tab */}
              {activeTab === "guardrails" && (
                <div className="space-y-3">
                  <div className="text-[11px] text-gray-400">חוקים וגבולות שהסוכן חייב לציית:</div>
                  {selected.guardrails.map((rule, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                      <Shield className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 text-xs text-gray-300">{rule}</div>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0"><Edit className="h-3 w-3" /></Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="w-full h-8 text-xs border-dashed border-[#1f2937]">
                    <Plus className="h-3 w-3 ml-1" /> הוסף מגבלה
                  </Button>
                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 mt-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 mt-0.5" />
                      <div className="text-[11px] text-gray-400">
                        המגבלות נאכפות דרך שכבת Policy Enforcement ומתועדות ב-Audit Log.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Testing tab */}
              {activeTab === "testing" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[11px] text-gray-400">קונסולת בדיקה אינטראקטיבית</div>
                    <Button size="sm" variant="outline" className="h-7 text-[10px] border-[#1f2937]">
                      <Activity className="h-3 w-3 ml-1" /> נקה היסטוריה
                    </Button>
                  </div>
                  <div className="rounded-lg bg-[#0a0e1a] border border-[#1f2937] max-h-[340px] overflow-y-auto p-3 space-y-3">
                    {chat.map((msg, i) => (
                      <div key={i} className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                        <div className={`p-1.5 rounded flex-shrink-0 ${msg.role === "user" ? "bg-blue-500/20" : "bg-violet-500/20"}`}>
                          {msg.role === "user" ? <Users className="h-3 w-3 text-blue-400" /> : <Bot className="h-3 w-3 text-violet-400" />}
                        </div>
                        <div className={`flex-1 max-w-[85%] ${msg.role === "user" ? "text-left" : ""}`}>
                          <div className={`p-2.5 rounded-lg text-xs leading-relaxed ${
                            msg.role === "user"
                              ? "bg-blue-500/10 border border-blue-500/20 text-gray-200"
                              : "bg-violet-500/10 border border-violet-500/20 text-gray-200"
                          }`}>
                            {msg.text}
                          </div>
                          <div className="text-[9px] text-gray-600 mt-0.5">{msg.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="שלח הודעה לבדיקה..."
                      className="bg-[#0a0e1a] border-[#1f2937] text-xs"
                    />
                    <Button size="sm" className="h-9 bg-violet-600 hover:bg-violet-700">
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Live preview chat */}
        <div className="col-span-3">
          <Card className="bg-[#111827] border-[#1f2937]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white text-sm">
                <MessageSquare className="h-4 w-4 text-violet-400" />
                תצוגה מקדימה
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-2 rounded-lg bg-[#0a0e1a] border border-[#1f2937]">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-[11px] text-gray-400">חי בסביבת {environment}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">סך טוקנים (היום)</span>
                  <span className="text-violet-400 font-bold">124K</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">קריאות API</span>
                  <span className="text-cyan-400 font-bold">432</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">זמן תגובה ממוצע</span>
                  <span className="text-green-400 font-bold">1.8s</span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">שגיאות</span>
                  <span className="text-red-400 font-bold">3</span>
                </div>
              </div>

              <div className="pt-3 border-t border-[#1f2937]">
                <div className="text-[11px] text-gray-400 mb-2">כלים פעילים:</div>
                <div className="flex flex-wrap gap-1">
                  {selected.tools.map((tool) => (
                    <Badge key={tool} variant="outline" className="h-5 text-[9px] border-violet-500/40 text-violet-400">
                      {tool}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-[#1f2937]">
                <div className="text-[11px] text-gray-400 mb-2">מקורות קשורים:</div>
                <div className="flex flex-wrap gap-1">
                  {selected.contextSources.map((src) => (
                    <Badge key={src} variant="outline" className="h-5 text-[9px] border-cyan-500/40 text-cyan-400">
                      {src}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-[#1f2937] space-y-2">
                <Button className="w-full h-8 text-xs bg-green-600 hover:bg-green-700">
                  <Play className="h-3 w-3 ml-1" /> הפעל סוכן
                </Button>
                <Button variant="outline" className="w-full h-8 text-xs border-[#1f2937]">
                  <Activity className="h-3 w-3 ml-1" /> צפה בלוגים
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#111827] border-[#1f2937] mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-white text-sm">
                <Cpu className="h-4 w-4 text-fuchsia-400" />
                מדדי ביצוע
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-gray-400">Success Rate</span>
                  <span className="text-green-400 font-bold">{selected.successRate}%</span>
                </div>
                <div className="h-1.5 bg-[#0a0e1a] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500" style={{ width: `${selected.successRate}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-gray-400">Cost Efficiency</span>
                  <span className="text-cyan-400 font-bold">87%</span>
                </div>
                <div className="h-1.5 bg-[#0a0e1a] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500" style={{ width: `87%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-gray-400">Accuracy</span>
                  <span className="text-violet-400 font-bold">94%</span>
                </div>
                <div className="h-1.5 bg-[#0a0e1a] rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `94%` }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
