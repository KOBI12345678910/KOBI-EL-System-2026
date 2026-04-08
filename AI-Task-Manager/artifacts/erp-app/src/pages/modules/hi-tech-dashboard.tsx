import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/utils";
import {
  Code2, Bug, TestTube2, Gauge, Shield, Server, Database,
  Lightbulb, Crown, Activity, CheckCircle2, Circle, Zap,
  ArrowLeft, Share2, X, Send, Bot, Loader2, Plus,
  Clock, Users, Cpu, TrendingUp, Package, Factory,
  BarChart3, FileText, Wallet, ShoppingCart, Wrench,
  UserCheck, Layers, Settings, AlertTriangle, HardHat,
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";

interface AgentStats {
  uptime: number;
  activeAgents: number;
  tasksCompleted: number;
  bugsFixed: number;
  employees: number;
  modules: number;
  entities: number;
  fields: number;
  suppliers: number;
  totalRecords: number;
  rawMaterials: number;
  salesOrders: number;
  salesCustomers: number;
  workOrders: number;
  journalEntries: number;
  expenses: number;
  crmLeads: number;
  crmCalls: number;
  auditLogs: number;
  accountsPayable: number;
  users: number;
}

interface AgentLog {
  id: string;
  agentId: string;
  timestamp: string;
  action: string;
  status: "success" | "error" | "info";
}

const AGENT_DEFINITIONS = [
  {
    id: "full-stack",
    nameHe: "מהנדס Full Stack",
    icon: Code2,
    color: "#3b82f6",
    gradientFrom: "from-blue-600",
    gradientTo: "to-cyan-500",
    bgGlow: "shadow-blue-500/30",
    borderColor: "border-blue-500/30",
    headerBg: "bg-blue-600/10",
    dotColor: "bg-blue-400",
    capabilities: [
      "בניית מודולים למפעל מתכת/אלומיניום",
      "פיתוח דפי React + API endpoints",
      "עדכון סכמת DB ושדות ישויות",
      "אינטגרציית ספקים, לקוחות, ייצור",
    ],
    systemPrompt: `אתה Full Stack Developer מומחה — סוכן AI אוטונומי של מערכת ERP "טכנו-כל עוזי".
המערכת: מפעל מתכת/אלומיניום/נירוסטה/זכוכית — 200 עובדים, 22 מודולים, 111 ישויות, 1,341 שדות.
התמחות: פיתוח features מקצה לקצה — frontend React+Vite, backend Express+TS, PostgreSQL+Drizzle.
מבנה: pnpm monorepo — FE: artifacts/erp-app/src/ | BE: artifacts/api-server/src/ | DB: lib/db/src/schema/
תהליך: קרא קוד → הבן → בנה/ערוך → בדוק.
מודולים במערכת: רכש, מכירות, ייצור, מחסן, כספים, HR, CRM, בקרת איכות, תחזוקה.
דבר בעברית תמיד. פעל מהר ובדיוק.`,
    channel: "development",
    suggestions: [
      "בנה דף לניהול הזמנות ייצור מגרות אלומיניום",
      "הוסף שדה 'סוג חומר' (ברזל/אלומיניום/נירוסטה/זכוכית) לישות מוצרים",
      "צור API endpoint לחישוב עלות ייצור מגרה",
      "בנה מודול ניהול קווי ייצור עם תחנות עבודה",
    ],
  },
  {
    id: "bug-hunter",
    nameHe: "צייד באגים",
    icon: Bug,
    color: "#ef4444",
    gradientFrom: "from-red-600",
    gradientTo: "to-orange-500",
    bgGlow: "shadow-red-500/30",
    borderColor: "border-red-500/30",
    headerBg: "bg-red-600/10",
    dotColor: "bg-red-400",
    capabilities: [
      "ציד באגים קריטיים במערכת ERP",
      "Root Cause Analysis ותיקון",
      "אבחון שגיאות DB ו-API",
      "בדיקת שלמות נתונים (26 ספקים, 53 חומרים)",
    ],
    systemPrompt: `אתה Bug Hunter אגרסיבי — סוכן AI מומחה לציד ותיקון באגים.
המערכת: ERP "טכנו-כל עוזי" — מפעל 200 עובדים, 26 ספקים, 53 חומרי גלם, 20 הזמנות מכירה.
DB: PostgreSQL — 22 מודולים, 111 ישויות, 261 רשומות.
תהליך: בדוק logs → חפש שגיאות → אבחן root cause → תקן → אמת.
בדוק: שגיאות runtime, שלמות DB, ישויות שבורות, routes שגויים, FK violations.
דבר בעברית. דווח על כל שלב בחקירה.`,
    channel: "testing",
    suggestions: [
      "בדוק שלמות נתונים בטבלאות ספקים וחומרי גלם",
      "מצא API endpoints שמחזירים שגיאות",
      "אבחן בעיות בזרימת הזמנות רכש",
      "בדוק consistency בין הזמנות מכירה ללקוחות",
    ],
  },
  {
    id: "qa-engineer",
    nameHe: "מהנדס QA",
    icon: TestTube2,
    color: "#22c55e",
    gradientFrom: "from-green-600",
    gradientTo: "to-emerald-500",
    bgGlow: "shadow-green-500/30",
    borderColor: "border-green-500/30",
    headerBg: "bg-green-600/10",
    dotColor: "bg-green-400",
    capabilities: [
      "בדיקות איכות למודולי ייצור ומכירות",
      "בדיקות שלמות 200 רשומות עובדים",
      "Test Coverage — כל 22 המודולים",
      "אימות תהליכי רכש→ייצור→מכירה",
    ],
    systemPrompt: `אתה QA Engineer מומחה — סוכן AI לבדיקות איכות מערכת ERP.
המערכת: "טכנו-כל עוזי" — 200 עובדים, 22 מודולים, 111 ישויות.
נתונים: 26 ספקים, 53 חומרים, 25 לקוחות, 20 הזמנות, 15 פקודות עבודה, 30 לידים CRM.
בדוק שיטתית: כל מודול, כל ישות, כל route, כל טופס.
תהליכים לבדיקה: ספק→הצעת מחיר→הזמנה→קבלה→חשבונית | לקוח→הצעה→הזמנה→ייצור→משלוח
דבר בעברית. תן דוח איכות מפורט עם ציון לכל מודול.`,
    channel: "testing",
    suggestions: [
      "הרץ בדיקת שלמות לכל 22 המודולים",
      "בדוק תהליך מכירה מקצה לקצה",
      "אמת שכל 200 רשומות העובדים תקינות",
      "בדוק תקינות כל שדות ישות חומרי גלם",
    ],
  },
  {
    id: "performance",
    nameHe: "מהנדס ביצועים",
    icon: Gauge,
    color: "#f59e0b",
    gradientFrom: "from-amber-600",
    gradientTo: "to-yellow-500",
    bgGlow: "shadow-amber-500/30",
    borderColor: "border-amber-500/30",
    headerBg: "bg-amber-600/10",
    dotColor: "bg-amber-400",
    capabilities: [
      "אופטימיזציית שאילתות DB (261+ רשומות)",
      "Profiling API endpoints — זמני תגובה",
      "בדיקת אינדקסים ב-PostgreSQL",
      "אסטרטגיית Caching למודולים כבדים",
    ],
    systemPrompt: `אתה Performance Engineer מומחה — סוכן AI לאופטימיזציית ביצועים.
המערכת: ERP "טכנו-כל עוזי" — PostgreSQL עם 22 מודולים, 111 ישויות.
DB: entity_records (261 רשומות), suppliers (26), raw_materials (53), sales_orders (20).
גישה: measure → identify bottlenecks → optimize → verify.
חפש: שאילתות איטיות (EXPLAIN ANALYZE), חסרי אינדקסים, N+1 queries, bundle size.
דבר בעברית. תן מדדים ספציפיים והמלצות מתועדפות.`,
    channel: "management",
    suggestions: [
      "בצע EXPLAIN ANALYZE על שאילתות entity_records",
      "מצא אינדקסים חסרים בטבלאות ליבה",
      "נתח זמני תגובה של API endpoints",
      "הצע אסטרטגיית caching למודול מחסן",
    ],
  },
  {
    id: "security",
    nameHe: "מהנדס אבטחה",
    icon: Shield,
    color: "#8b5cf6",
    gradientFrom: "from-violet-600",
    gradientTo: "to-purple-500",
    bgGlow: "shadow-violet-500/30",
    borderColor: "border-violet-500/30",
    headerBg: "bg-violet-600/10",
    dotColor: "bg-violet-400",
    capabilities: [
      "Security Audit — כל מודולי המערכת",
      "בדיקת הרשאות 4 משתמשים ו-RBAC",
      "סריקת פרצות: SQL injection, XSS",
      "הגנה על נתוני עובדים ולקוחות",
    ],
    systemPrompt: `אתה Security Engineer מומחה — סוכן AI לאבטחת מידע.
המערכת: ERP "טכנו-כל עוזי" — 200 עובדים, 25 לקוחות, 26 ספקים, 4 משתמשי מערכת.
אימות: PBKDF2-SHA512 + Bearer token. אין RBAC מלא עדיין.
בדוק: SQL injection, XSS, CSRF, broken auth, חשיפת נתונים רגישים, misconfig.
נתונים רגישים: תעודות זהות, חשבונות בנק, שכר עובדים, פרטי ספקים.
תן Security Score ורשימת ממצאים לפי חומרה (Critical/High/Medium/Low).
דבר בעברית תמיד.`,
    channel: "architecture",
    suggestions: [
      "בצע Security Audit מקיף למערכת",
      "בדוק הרשאות גישה לנתוני שכר עובדים",
      "סרוק API routes לפרצות injection",
      "הערך הגנת נתוני לקוחות וספקים",
    ],
  },
  {
    id: "devops",
    nameHe: "מהנדס DevOps",
    icon: Server,
    color: "#06b6d4",
    gradientFrom: "from-cyan-600",
    gradientTo: "to-sky-500",
    bgGlow: "shadow-cyan-500/30",
    borderColor: "border-cyan-500/30",
    headerBg: "bg-cyan-600/10",
    dotColor: "bg-cyan-400",
    capabilities: [
      "ניטור שרת ו-DB — מצב חיבורים",
      "Health Checks — API + Frontend",
      "ניהול גיבויים ו-DB maintenance",
      "ניטור ביצועי מערכת בזמן אמת",
    ],
    systemPrompt: `אתה DevOps Engineer מומחה — סוכן AI לתשתית ו-health monitoring.
המערכת: ERP "טכנו-כל עוזי" — pnpm monorepo, PostgreSQL, Express+TS, React+Vite.
workflows: api-server (Express), erp-app (Vite), erp-mobile (Expo).
בדוק: disk usage, memory, CPU, DB connections, API health, process status.
DB: 22 מודולים, גודל מדווח, חיבורים פעילים.
דבר בעברית. תן סטטוס מערכת מדויק עם מדדים ספציפיים.`,
    channel: "management",
    suggestions: [
      "בצע health check מלא — DB + API + Frontend",
      "הצג ניצול משאבי שרת (CPU, RAM, Disk)",
      "בדוק סטטיסטיקות חיבורי PostgreSQL",
      "סרוק לוגים אחרונים לשגיאות קריטיות",
    ],
  },
  {
    id: "data-engineer",
    nameHe: "מהנדס נתונים",
    icon: Database,
    color: "#10b981",
    gradientFrom: "from-emerald-600",
    gradientTo: "to-teal-500",
    bgGlow: "shadow-emerald-500/30",
    borderColor: "border-emerald-500/30",
    headerBg: "bg-emerald-600/10",
    dotColor: "bg-emerald-400",
    capabilities: [
      "ניתוח נתוני מפעל — 53 חומרי גלם, 26 ספקים",
      "ETL: ספק→רכש→ייצור→מכירה→כספים",
      "דוחות Analytics מנתוני ייצור ומכירות",
      "אופטימיזציית DB Schema ואינדקסים",
    ],
    systemPrompt: `אתה Data Engineer מומחה — סוכן AI לתשתית נתונים.
המערכת: ERP "טכנו-כל עוזי" — PostgreSQL.
נתונים: 200 עובדים, 26 ספקים, 53 חומרי גלם, 25 לקוחות, 20 הזמנות מכירה, 15 פקודות עבודה.
טבלאות ליבה: entity_records, suppliers, raw_materials, sales_orders, production_work_orders, expenses, journal_entries.
זרימה: ספק→הזמנת רכש→קבלת חומרים→ייצור→הזמנת מכירה→חשבונית→תשלום.
בנה: data pipelines, reports, analytics queries, views, indexes.
דבר בעברית. הצג תוצאות עם טבלאות.`,
    channel: "dataflow",
    suggestions: [
      "נתח מלאי חומרי גלם — מה חסר להזמין?",
      "בנה דוח רווחיות לפי לקוח",
      "הצג זרימת נתונים: רכש → ייצור → מכירה",
      "נתח איכות נתונים בכל הטבלאות",
    ],
  },
  {
    id: "product-manager",
    nameHe: "מנהל מוצר",
    icon: Lightbulb,
    color: "#f97316",
    gradientFrom: "from-orange-600",
    gradientTo: "to-amber-500",
    bgGlow: "shadow-orange-500/30",
    borderColor: "border-orange-500/30",
    headerBg: "bg-orange-600/10",
    dotColor: "bg-orange-400",
    capabilities: [
      "ניתוח צרכי מפעל מתכת 200 עובדים",
      "תעדוף פיצ'רים — Impact vs Effort",
      "Product Roadmap למערכת ERP",
      "User Stories למודולי ייצור ומכירות",
    ],
    systemPrompt: `אתה Product Manager מומחה — סוכן AI לניהול מוצר ERP.
המערכת: "טכנו-כל עוזי" — מפעל מתכת/אלומיניום/נירוסטה/זכוכית, 200 עובדים.
מודולים קיימים: רכש, מכירות, ייצור, מחסן, כספים, HR, CRM, בקרת איכות.
נתונים: 22 מודולים, 111 ישויות, 1,341 שדות.
חשוב: ROI, user impact, technical feasibility, מיקוד בתהליכי מפעל אמיתיים.
דבר בעברית. הצג priorities בצורה ברורה.`,
    channel: "development",
    suggestions: [
      "הצע פיצ'רים חסרים למפעל מתכת",
      "בנה Roadmap רבעוני למערכת",
      "כתוב User Stories למודול בקרת איכות",
      "תעדף את המודולים שצריכים שדרוג",
    ],
  },
  {
    id: "tech-lead",
    nameHe: "Tech Lead",
    icon: Crown,
    color: "#6366f1",
    gradientFrom: "from-indigo-600",
    gradientTo: "to-violet-500",
    bgGlow: "shadow-indigo-500/30",
    borderColor: "border-indigo-500/30",
    headerBg: "bg-indigo-600/10",
    dotColor: "bg-indigo-400",
    capabilities: [
      "סקירת ארכיטקטורת pnpm monorepo",
      "Code Review — React+Vite + Express+TS",
      "החלטות טכנולוגיות — Drizzle, PostgreSQL",
      "תכנון scalability ל-200+ משתמשים",
    ],
    systemPrompt: `אתה Tech Lead מומחה — סוכן AI למנהיגות טכנית ואדריכלות.
המערכת: "טכנו-כל עוזי" — pnpm monorepo.
Stack: React+Vite+Tailwind (FE), Express 5+TypeScript (BE), PostgreSQL+Drizzle ORM (DB).
מבנה: artifacts/erp-app (frontend), artifacts/api-server (backend), lib/db (schemas).
22 מודולים, 111 ישויות, metadata-driven architecture.
חשוב: scalability, maintainability, security, performance.
דבר בעברית. הנחה כמו CTO מנוסה.`,
    channel: "architecture",
    suggestions: [
      "סקור את ארכיטקטורת המערכת הנוכחית",
      "הצע שיפורים ל-DB schema design",
      "תכנן אסטרטגיית scaling ל-200 משתמשים",
      "בצע code review למודול ייצור",
    ],
  },
];

interface AgentChatModalProps {
  agent: (typeof AGENT_DEFINITIONS)[0];
  onClose: () => void;
}

function AgentChatModal({ agent, onClose }: AgentChatModalProps) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string; timestamp: Date }[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const AgentIcon = agent.icon;

  const sendMessage = async (text: string) => {
    const msg = text.trim();
    if (!msg || isLoading) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: msg, timestamp: new Date() }]);
    setIsLoading(true);

    try {
      const r = await authFetch(`${API}/claude/chat/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          channel: agent.channel,
          agentId: agent.id,
          agentSystemPrompt: agent.systemPrompt,
        }),
      });
      if (!r.ok) throw new Error("שגיאה בשליחה");
      const data = await r.json();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.response || data.message || "קיבלתי את הבקשה שלך.",
        timestamp: new Date(),
      }]);

      await authFetch(`${API}/claude/agents/${agent.id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: msg, status: "success" }),
      }).catch(() => {});
    } catch {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "מצטער, אירעה שגיאה. נסה שוב.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const shareReport = () => {
    const report = messages.map(m => `[${m.role === "user" ? "שאלה" : agent.nameHe}]: ${m.content}`).join("\n\n");
    const whatsappText = encodeURIComponent(`דוח סוכן ${agent.nameHe} — טכנו-כל עוזי:\n\n${report.substring(0, 1500)}`);
    window.open(`https://wa.me/?text=${whatsappText}`, "_blank");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-3xl h-[80vh] bg-card border border-border rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        dir="rtl"
      >
        <div className={`flex items-center justify-between px-5 py-4 border-b border-border ${agent.headerBg}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: agent.color + "20", border: `1px solid ${agent.color}40` }}>
              <AgentIcon className="w-5 h-5" style={{ color: agent.color }} />
            </div>
            <div>
              <h3 className="font-bold text-foreground">{agent.nameHe}</h3>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${agent.dotColor} animate-pulse`} />
                <span className="text-xs text-muted-foreground">פעיל — מחובר ל-Claude AI</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={shareReport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-green-400 border border-green-500/30 bg-green-500/10 hover:bg-green-500/20 transition-colors"
              >
                <Share2 className="w-3.5 h-3.5" />
                WhatsApp
              </button>
            )}
            <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground hover:bg-card/5 rounded-lg transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ backgroundColor: agent.color + "15", border: `1px solid ${agent.color}30` }}>
                <AgentIcon className="w-10 h-10" style={{ color: agent.color }} />
              </div>
              <div className="text-center">
                <h4 className="text-foreground font-bold text-lg mb-2">{agent.nameHe}</h4>
                <p className="text-muted-foreground text-sm mb-6 max-w-md">מה תרצה שאבצע? אני מחובר ל-Claude AI עם גישה מלאה ל-DB, קוד, וכלי המערכת של טכנו-כל עוזי.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
                  {agent.suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="text-right p-3 bg-card border border-border rounded-xl text-sm text-gray-300 hover:border-border hover:text-foreground transition-colors"
                    >
                      <Zap className="w-4 h-4 inline-block ml-1.5" style={{ color: agent.color }} />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${msg.role === "user" ? "bg-blue-600" : ""}`}
                style={msg.role === "assistant" ? { backgroundColor: agent.color + "20" } : {}}>
                {msg.role === "user"
                  ? <Users className="w-4 h-4 text-foreground" />
                  : <AgentIcon className="w-4 h-4" style={{ color: agent.color }} />}
              </div>
              <div className={`max-w-[80%] rounded-xl px-4 py-3 ${msg.role === "user" ? "bg-blue-600/20 border border-blue-600/30" : "bg-card border border-border"}`}>
                <p className="text-foreground text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{msg.timestamp.toLocaleTimeString("he-IL")}</p>
              </div>
            </motion.div>
          ))}

          {isLoading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: agent.color + "20" }}>
                <AgentIcon className="w-4 h-4" style={{ color: agent.color }} />
              </div>
              <div className="bg-card border border-border rounded-xl px-4 py-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">{agent.nameHe} מעבד עם Claude AI...</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        <div className="p-4 border-t border-border bg-card">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`שלח משימה ל-${agent.nameHe}...`}
                className="w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground placeholder-gray-500 resize-none focus:outline-none min-h-[48px] max-h-[150px] text-sm"
                rows={1}
                style={{ borderColor: input ? agent.color + "60" : undefined }}
                onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 150) + "px"; }}
                disabled={isLoading}
              />
            </div>
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center transition-colors disabled:bg-muted disabled:cursor-not-allowed text-foreground"
              style={{ backgroundColor: input.trim() && !isLoading ? agent.color : undefined }}
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function AgentCard({ agent, onActivate }: { agent: (typeof AGENT_DEFINITIONS)[0]; onActivate: () => void }) {
  const AgentIcon = agent.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -3 }}
      className={`relative bg-card border ${agent.borderColor} rounded-2xl overflow-hidden flex flex-col group cursor-pointer`}
      style={{ boxShadow: `0 0 30px ${agent.color}10` }}
      onClick={onActivate}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${agent.gradientFrom} ${agent.gradientTo} opacity-0 group-hover:opacity-5 transition-opacity pointer-events-none`} />

      <div className={`flex items-center justify-between px-5 py-4 ${agent.headerBg} border-b ${agent.borderColor}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: agent.color + "20" }}>
            <AgentIcon className="w-5 h-5" style={{ color: agent.color }} />
          </div>
          <div>
            <h3 className="font-bold text-foreground text-sm">{agent.nameHe}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${agent.dotColor} animate-pulse`} />
              <span className="text-[10px] text-muted-foreground">פעיל</span>
            </div>
          </div>
        </div>
        <CheckCircle2 className="w-4 h-4" style={{ color: agent.color }} />
      </div>

      <div className="flex-1 px-5 py-4">
        <ul className="space-y-1.5">
          {agent.capabilities.map((cap, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: agent.color }} />
              {cap}
            </li>
          ))}
        </ul>
      </div>

      <div className={`flex items-center justify-between px-5 py-3 border-t ${agent.borderColor} bg-black/20`}>
        <button
          onClick={e => { e.stopPropagation(); onActivate(); }}
          className="flex items-center gap-1.5 text-xs font-medium transition-colors hover:opacity-80"
          style={{ color: agent.color }}
        >
          <Bot className="w-3.5 h-3.5" />
          פרטים והפעלה
        </button>
        <button
          onClick={e => {
            e.stopPropagation();
            const text = encodeURIComponent(`סוכן ${agent.nameHe} — טכנו-כל עוזי\n\nיכולות:\n${agent.capabilities.join("\n")}`);
            window.open(`https://wa.me/?text=${text}`, "_blank");
          }}
          className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors"
        >
          <Share2 className="w-3.5 h-3.5" />
          WhatsApp
        </button>
      </div>
    </motion.div>
  );
}

export default function HiTechDashboard() {
  const [selectedAgent, setSelectedAgent] = useState<(typeof AGENT_DEFINITIONS)[0] | null>(null);
  const [, setLocation] = useLocation();
  const [uptimeSeconds, setUptimeSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setUptimeSeconds(s => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: stats } = useQuery<AgentStats>({
    queryKey: ["agent-stats"],
    queryFn: async () => {
      const r = await authFetch(`${API}/claude/agents/stats`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const { data: logs = [] } = useQuery<AgentLog[]>({
    queryKey: ["agent-logs"],
    queryFn: async () => {
      const r = await authFetch(`${API}/claude/agents/logs`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  const formatUptime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const topStats = [
    { label: "עובדים פעילים", value: stats?.employees?.toLocaleString() ?? "...", icon: Users, color: "text-blue-400", bg: "bg-blue-400/10", sub: "מתוך 200 עובדי מפעל" },
    { label: "מודולי ERP", value: `${stats?.modules ?? "..."} / ${stats?.entities ?? "..."}`, icon: Layers, color: "text-violet-400", bg: "bg-violet-400/10", sub: `${stats?.fields?.toLocaleString() ?? "..."} שדות פעילים` },
    { label: "סוכני AI", value: `${stats?.activeAgents ?? 9} / 9`, icon: Cpu, color: "text-cyan-400", bg: "bg-cyan-400/10", sub: "מוכנים לפעולה" },
    { label: "System Uptime", value: `${stats?.uptime ?? 99.9}%`, icon: Activity, color: "text-green-400", bg: "bg-green-400/10", sub: formatUptime(uptimeSeconds) },
  ];

  const dataStats = [
    { label: "ספקים", value: stats?.suppliers ?? 0, icon: ShoppingCart, color: "text-orange-400", link: "/procurement-dashboard" },
    { label: "חומרי גלם", value: stats?.rawMaterials ?? 0, icon: Package, color: "text-emerald-400", link: "/inventory" },
    { label: "לקוחות", value: stats?.salesCustomers ?? 0, icon: UserCheck, color: "text-blue-400", link: "/sales/customers" },
    { label: "הזמנות מכירה", value: stats?.salesOrders ?? 0, icon: FileText, color: "text-sky-400", link: "/sales/orders" },
    { label: "פקודות עבודה", value: stats?.workOrders ?? 0, icon: Wrench, color: "text-amber-400", link: "/production" },
    { label: "לידים CRM", value: stats?.crmLeads ?? 0, icon: TrendingUp, color: "text-pink-400", link: "/crm" },
    { label: "הוצאות", value: stats?.expenses ?? 0, icon: Wallet, color: "text-red-400", link: "/finance" },
    { label: "פקודות יומן", value: stats?.journalEntries ?? 0, icon: BarChart3, color: "text-indigo-400", link: "/finance" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(59, 130, 246, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.03) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <Cpu className="w-5 h-5 text-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground tracking-tight">דאשבורד הייטק — טכנו-כל עוזי</h1>
                <p className="text-muted-foreground text-xs">Autonomous AI Agents System — מפעל מתכת/אלומיניום/נירוסטה/זכוכית</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-green-400 text-xs font-medium">Live</span>
              <span className="text-muted-foreground text-xs">|</span>
              <span className="text-muted-foreground text-xs">9 סוכני AI אוטונומיים | Claude AI | {stats?.totalRecords ?? "..."} רשומות במערכת</span>
            </div>
          </div>

          <button
            onClick={() => setLocation("/claude-chat")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-400 hover:bg-violet-600/30 transition-colors text-sm"
          >
            <Bot className="w-4 h-4" />
            <span>Claude Chat</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Top Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {topStats.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-card border border-border rounded-2xl p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                    <Icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                  <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                </div>
                <div className="font-black text-2xl text-foreground mb-0.5 tabular-nums">{stat.value}</div>
                <div className="text-muted-foreground text-xs">{stat.label}</div>
                <div className={`text-xs mt-1 ${stat.color} font-mono`}>{stat.sub}</div>
              </motion.div>
            );
          })}
        </div>

        {/* Data Overview */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Factory className="w-5 h-5 text-muted-foreground" />
              נתוני מפעל בזמן אמת
            </h2>
            <span className="text-xs text-muted-foreground">{stats?.auditLogs ?? 0} פעולות AI תועדו</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {dataStats.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + i * 0.05 }}
                  onClick={() => setLocation(item.link)}
                  className="bg-card border border-border rounded-xl p-3 text-right hover:border-border transition-colors group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`w-4 h-4 ${item.color} group-hover:scale-110 transition-transform`} />
                    <ArrowLeft className="w-3 h-3 text-foreground group-hover:text-muted-foreground transition-colors" />
                  </div>
                  <div className="font-bold text-xl text-foreground tabular-nums">{item.value}</div>
                  <div className="text-muted-foreground text-[11px]">{item.label}</div>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Agents Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-foreground">סוכני AI מתמחים</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>לחץ על סוכן להפעלה ישירה עם Claude AI</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AGENT_DEFINITIONS.map((agent, i) => (
              <motion.div key={agent.id} transition={{ delay: i * 0.06 }}>
                <AgentCard agent={agent} onActivate={() => setSelectedAgent(agent)} />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        {logs.length > 0 && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <h3 className="font-bold text-foreground text-sm">פעולות אחרונות של סוכני AI</h3>
              <span className="text-xs text-muted-foreground">({logs.length} לוגים)</span>
            </div>
            <div className="divide-y divide-gray-800/50">
              {logs.slice(0, 8).map((log: any, i: number) => (
                <div key={log.id || i} className="flex items-center gap-4 px-5 py-3">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.status === "success" ? "bg-green-400" : log.status === "error" ? "bg-red-400" : "bg-blue-400"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">{log.action}</p>
                    <p className="text-xs text-muted-foreground">{AGENT_DEFINITIONS.find(a => a.id === log.agentId)?.nameHe || log.agentId}</p>
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {log.timestamp ? new Date(log.timestamp).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <RelatedRecords
          tabs={[
            {
              key: "agents",
              label: "סוכני AI",
              endpoint: `${API}/claude/agents/logs`,
              columns: [
                { key: "agentId", label: "סוכן" },
                { key: "action", label: "פעולה" },
                { key: "status", label: "סטטוס" },
                { key: "timestamp", label: "זמן" },
              ],
            },
            {
              key: "audit",
              label: "לוג ביקורת",
              endpoint: `${API}/audit-logs?limit=10`,
              columns: [
                { key: "action", label: "פעולה" },
                { key: "entityType", label: "ישות" },
                { key: "createdAt", label: "זמן" },
              ],
            },
          ]}
        />

        <ActivityLog entityType="ai-agents" />

        {/* Quick Navigation */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            ניווט מהיר
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "מנוע AI", path: "/ai-engine", icon: Cpu, color: "text-violet-400" },
              { label: "צ'אט Claude", path: "/claude-chat", icon: Bot, color: "text-blue-400" },
              { label: "ניתוח שיחות", path: "/ai-engine/call-nlp", icon: BarChart3, color: "text-green-400" },
              { label: "דירוג לידים", path: "/ai-engine/lead-scoring", icon: TrendingUp, color: "text-amber-400" },
              { label: "ניהול ספקים", path: "/procurement-dashboard", icon: ShoppingCart, color: "text-orange-400" },
              { label: "ניהול מכירות", path: "/sales/orders", icon: FileText, color: "text-sky-400" },
              { label: "ניהול ייצור", path: "/production", icon: Factory, color: "text-emerald-400" },
              { label: "ניהול HR", path: "/hr", icon: Users, color: "text-pink-400" },
            ].map((nav, i) => {
              const NavIcon = nav.icon;
              return (
                <button
                  key={i}
                  onClick={() => setLocation(nav.path)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-card border border-border hover:border-border transition-colors text-sm text-gray-300 hover:text-foreground"
                >
                  <NavIcon className={`w-4 h-4 ${nav.color}`} />
                  {nav.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Agent Chat Modal */}
      <AnimatePresence>
        {selectedAgent && (
          <AgentChatModal agent={selectedAgent} onClose={() => setSelectedAgent(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
