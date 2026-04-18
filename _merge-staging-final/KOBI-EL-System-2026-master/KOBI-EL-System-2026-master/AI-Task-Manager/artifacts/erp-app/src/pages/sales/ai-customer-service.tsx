import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import {
  Bot,
  Send,
  Loader2,
  Zap,
  Brain,
  Clock,
  Users,
  ArrowLeftRight,
  FileText,
  Globe,
  UserCheck,
  CheckCircle2,
  Star,
  HeadphonesIcon,
} from "lucide-react";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || "";
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

interface Stats {
  totalQuestions: number;
  resolvedTotal: number;
  automationRate: number;
  satisfactionScore: number;
  avgResponseSec: number;
}

interface Capability {
  icon: typeof Bot;
  title: string;
  description: string;
  color: string;
  bg: string;
}

const CAPABILITIES: Capability[] = [
  {
    icon: UserCheck,
    title: "העברה לאדם",
    description: "מענה מתי שדרוש מומחיות",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: Brain,
    title: "למידה מתמדת",
    description: "השתפרי עם כל שיחה",
    color: "text-purple-400",
    bg: "bg-purple-500/10",
  },
  {
    icon: Zap,
    title: "מענה מיידי",
    description: "תשובות תוך שניות 24/7",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    icon: FileText,
    title: "יצירת סיכומים",
    description: "סיכום טיקט אוטומטי",
    color: "text-green-400",
    bg: "bg-green-500/10",
  },
  {
    icon: ArrowLeftRight,
    title: "אינטגרציה מלאה",
    description: "מחובר למערכת CRM",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
  },
  {
    icon: Globe,
    title: "שפות מרובות",
    description: "עברית ואנגלית",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
  },
];

export default function AICustomerServicePage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Stats>({
    totalQuestions: 234,
    resolvedTotal: 234,
    automationRate: 68,
    satisfactionScore: 4.7,
    avgResponseSec: 45,
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    authFetch(`${API}/claude/customer-service/stats`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((d) => {
        if (d && typeof d.totalQuestions === "number") setStats(d);
      })
      .catch(() => {});
  }, []);

  const handleSend = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setAnswer("");
    setError("");

    try {
      const res = await authFetch(`${API}/claude/customer-service/ask`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "שגיאה בקבלת תשובה");
      } else {
        setAnswer(data.answer);
        setStats((prev) => ({
          ...prev,
          totalQuestions: prev.totalQuestions + 1,
        }));
      }
    } catch {
      setError("שגיאת רשת — אנא נסה שנית");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const kpis = [
    {
      label: "אוטומציה",
      value: `${stats.automationRate}%`,
      icon: Zap,
      color: "text-amber-400",
      gradient: "from-amber-500/20 to-amber-600/10",
    },
    {
      label: "שביעות רצון",
      value: `${stats.satisfactionScore}/5`,
      icon: Star,
      color: "text-yellow-400",
      gradient: "from-yellow-500/20 to-yellow-600/10",
    },
    {
      label: "זמן תגובה",
      value: `${stats.avgResponseSec} שניות`,
      icon: Clock,
      color: "text-blue-400",
      gradient: "from-blue-500/20 to-blue-600/10",
    },
    {
      label: "פניות שנפתרו",
      value: (stats.resolvedTotal ?? stats.totalQuestions).toLocaleString("he-IL"),
      icon: Users,
      color: "text-green-400",
      gradient: "from-green-500/20 to-green-600/10",
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-green-500/30 to-cyan-500/20 flex items-center justify-center border border-green-500/20">
          <HeadphonesIcon className="w-6 h-6 text-green-400" />
        </div>
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">
            AI לשירות לקוחות — תמיכה אוטומטית חכמה 24/7
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <div
            key={i}
            className={`bg-gradient-to-br ${k.gradient} border border-white/5 rounded-xl p-4 text-center`}
          >
            <k.icon className={`w-6 h-6 mx-auto mb-2 ${k.color}`} />
            <div className={`text-lg sm:text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="w-5 h-5 text-green-400" />
            <h2 className="font-semibold text-foreground">בדיקת AI Support</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            כתוב שאלה לבדיקה
          </p>
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="לדוגמה: מה זמן האספקה למוצרי אלומיניום?"
            className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:border-green-500 min-h-[90px]"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={!question.trim() || loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-muted disabled:cursor-not-allowed text-foreground rounded-lg text-sm font-medium transition-colors"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>ממתין לתשובה...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>שלח שאלה</span>
              </>
            )}
          </button>
        </div>

        <div className="bg-card border border-border rounded-xl p-5 space-y-3 min-h-[220px]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-cyan-400" />
            <h2 className="font-semibold text-foreground">תגובת AI</h2>
          </div>

          <AnimatePresence mode="wait">
            {loading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-8 gap-3"
              >
                <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-green-400 animate-spin" />
                </div>
                <p className="text-sm text-muted-foreground">AI מכין תשובה...</p>
              </motion.div>
            )}

            {!loading && error && (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
              >
                <p className="text-sm text-red-300">{error}</p>
              </motion.div>
            )}

            {!loading && !error && answer && (
              <motion.div
                key="answer"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-4 bg-green-500/5 border border-green-500/20 rounded-lg"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-green-400 font-medium">AI Support</span>
                </div>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{answer}</p>
              </motion.div>
            )}

            {!loading && !error && !answer && (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-8 gap-2"
              >
                <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">שלח שאלה לקבלת תשובה</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div>
        <h2 className="font-semibold text-foreground mb-3">יכולות AI Support</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {CAPABILITIES.map((cap, i) => (
            <div
              key={i}
              className={`${cap.bg} border border-white/5 rounded-xl p-4 flex flex-col items-center text-center gap-2`}
            >
              <cap.icon className={`w-7 h-7 ${cap.color}`} />
              <div className={`text-sm font-semibold ${cap.color}`}>{cap.title}</div>
              <div className="text-xs text-muted-foreground">{cap.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="ai-service" entityId="all" />
        <RelatedRecords entityType="ai-service" entityId="all" />
      </div>
    </div>
  );
}