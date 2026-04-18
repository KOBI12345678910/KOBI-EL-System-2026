import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Loader2, Bot, X, AlertTriangle, TrendingUp,
  Clock, ArrowUp, ArrowDown, Minus
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

interface PrioritizedNotification {
  original: any;
  score: number;
  priorityLabel: string;
  reasoning: string;
}

function computePriorityScore(n: any): { score: number; label: string; reason: string } {
  let score = 50;
  const reasons: string[] = [];

  const priority = (n.priority || "").toLowerCase();
  if (priority === "critical" || priority === "urgent") {
    score += 40;
    reasons.push("עדיפות קריטית");
  } else if (priority === "high") {
    score += 25;
    reasons.push("עדיפות גבוהה");
  } else if (priority === "medium") {
    score += 10;
  } else if (priority === "low") {
    score -= 10;
    reasons.push("עדיפות נמוכה");
  }

  if (!n.isRead) {
    score += 15;
    reasons.push("לא נקראה");
  }

  if (n.createdAt) {
    const ageHours = (Date.now() - new Date(n.createdAt).getTime()) / (1000 * 60 * 60);
    if (ageHours < 1) {
      score += 20;
      reasons.push("חדשה (פחות משעה)");
    } else if (ageHours < 6) {
      score += 10;
      reasons.push("מהיום");
    } else if (ageHours > 72) {
      score -= 5;
    }
  }

  const category = (n.category || "").toLowerCase();
  if (category.includes("error") || category.includes("alert") || category.includes("שגיאה")) {
    score += 20;
    reasons.push("שגיאה/התראה");
  } else if (category.includes("payment") || category.includes("תשלום") || category.includes("finance") || category.includes("כספים")) {
    score += 15;
    reasons.push("פיננסי");
  } else if (category.includes("deadline") || category.includes("דד-ליין")) {
    score += 15;
    reasons.push("דד-ליין");
  }

  const message = ((n.message || "") + " " + (n.title || "")).toLowerCase();
  if (message.includes("דחוף") || message.includes("urgent") || message.includes("מיידי")) {
    score += 15;
    reasons.push("מילות דחיפות בטקסט");
  }
  if (message.includes("כשל") || message.includes("fail") || message.includes("error") || message.includes("שגיאה")) {
    score += 10;
    reasons.push("כשל/שגיאה");
  }

  score = Math.max(0, Math.min(100, score));
  const label = score >= 80 ? "קריטי" : score >= 60 ? "גבוה" : score >= 40 ? "בינוני" : "נמוך";
  return { score, label, reason: reasons.length > 0 ? reasons.join(", ") : "רגיל" };
}

function generateDailySummary(notifications: any[]): string {
  const today = new Date();
  const todayStr = today.toLocaleDateString("he-IL");
  const total = notifications.length;
  const unread = notifications.filter(n => !n.isRead).length;

  const byCat: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let recentCount = 0;

  for (const n of notifications) {
    const cat = n.category || "כללי";
    byCat[cat] = (byCat[cat] || 0) + 1;
    const { label } = computePriorityScore(n);
    byPriority[label] = (byPriority[label] || 0) + 1;

    if (n.createdAt) {
      const ageHours = (Date.now() - new Date(n.createdAt).getTime()) / (1000 * 60 * 60);
      if (ageHours < 24) recentCount++;
    }
  }

  const lines: string[] = [
    `סיכום יומי — ${todayStr}`,
    `סה"כ התראות: ${total} (${unread} לא נקראו)`,
    `התראות מ-24 שעות אחרונות: ${recentCount}`,
    "",
    "לפי עדיפות:",
  ];

  for (const [label, count] of Object.entries(byPriority).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${label}: ${count}`);
  }

  lines.push("", "לפי קטגוריה:");
  for (const [cat, count] of Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
    lines.push(`  ${cat}: ${count}`);
  }

  return lines.join("\n");
}

export default function AISmartNotifications({ notifications }: { notifications: any[] }) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"priority" | "summary" | "ai">("priority");

  const prioritized = useMemo<PrioritizedNotification[]>(() => {
    return notifications
      .map(n => {
        const { score, label, reason } = computePriorityScore(n);
        return { original: n, score, priorityLabel: label, reasoning: reason };
      })
      .sort((a, b) => b.score - a.score);
  }, [notifications]);

  const dailySummary = useMemo(() => generateDailySummary(notifications), [notifications]);

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const notifSummary = prioritized.slice(0, 15).map(p => ({
        title: p.original.title,
        message: (p.original.message || "").slice(0, 100),
        priority: p.original.priority,
        category: p.original.category,
        isRead: p.original.isRead,
        date: p.original.createdAt,
        aiScore: p.score,
        aiPriority: p.priorityLabel,
      }));

      const r = await authFetch(`${API}/claude/chat/send`, {
        method: "POST",
        body: JSON.stringify({
          message: `[ניתוח התראות חכם עם תעדוף]\nנתח את ההתראות האחרונות (כבר מדורגות לפי AI):\n\n${JSON.stringify(notifSummary, null, 2)}\n\nסיכום יומי:\n${dailySummary}\n\nענה בעברית:\n1. מה דורש תשומת לב מיידית? (ציין פריטים ספציפיים)\n2. דפוסים ומגמות בהתראות\n3. המלצות לפעולה עם סדר עדיפויות\n4. סיכום יומי — מה השתנה ומה חשוב`,
          channel: "support",
        }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (data) => {
      setAnalysis(data.response || data.message || "אין ניתוח זמין.");
      setActiveTab("ai");
      setShowAnalysis(true);
    },
    onError: () => {
      setAnalysis("לא ניתן לנתח את ההתראות כרגע.");
      setActiveTab("ai");
      setShowAnalysis(true);
    },
  });

  if (notifications.length === 0) return null;

  const criticalCount = prioritized.filter(p => p.priorityLabel === "קריטי").length;
  const highCount = prioritized.filter(p => p.priorityLabel === "גבוה").length;

  const PriorityIcon = ({ label }: { label: string }) => {
    if (label === "קריטי") return <ArrowUp className="w-3 h-3 text-red-400" />;
    if (label === "גבוה") return <ArrowUp className="w-3 h-3 text-orange-400" />;
    if (label === "בינוני") return <Minus className="w-3 h-3 text-yellow-400" />;
    return <ArrowDown className="w-3 h-3 text-green-400" />;
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => { setShowAnalysis(true); setActiveTab("priority"); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/10 text-violet-400 hover:bg-violet-600/20 border border-violet-500/20 rounded-lg text-xs font-medium transition-colors"
        >
          <TrendingUp className="w-3 h-3" />
          תעדוף חכם
          {criticalCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 min-w-[16px] text-center">{criticalCount}</span>
          )}
        </button>
        <button
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/10 text-violet-400 hover:bg-violet-600/20 border border-violet-500/20 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
        >
          {analyzeMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          ניתוח AI
        </button>
      </div>

      <AnimatePresence>
        {showAnalysis && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
            onClick={() => setShowAnalysis(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
             
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-violet-400" />
                  <h3 className="font-bold">התראות חכמות</h3>
                </div>
                <button onClick={() => setShowAnalysis(false)} className="p-1 hover:bg-muted rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex border-b border-border/50 px-4">
                {[
                  { id: "priority" as const, label: "תעדוף", icon: TrendingUp },
                  { id: "summary" as const, label: "סיכום יומי", icon: Clock },
                  { id: "ai" as const, label: "ניתוח AI", icon: Bot },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? "border-violet-400 text-violet-400"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <tab.icon className="w-3 h-3" />
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {activeTab === "priority" && (
                  <div className="space-y-2">
                    <div className="flex gap-2 mb-3">
                      {criticalCount > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px]">
                          <AlertTriangle className="w-3 h-3" /> {criticalCount} קריטי
                        </span>
                      )}
                      {highCount > 0 && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-orange-500/10 text-orange-400 rounded text-[10px]">
                          <ArrowUp className="w-3 h-3" /> {highCount} גבוה
                        </span>
                      )}
                    </div>
                    {prioritized.slice(0, 10).map((p, i) => (
                      <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg border ${
                        p.priorityLabel === "קריטי" ? "border-red-500/30 bg-red-500/5" :
                        p.priorityLabel === "גבוה" ? "border-orange-500/30 bg-orange-500/5" :
                        "border-border/30 bg-muted/20"
                      }`}>
                        <PriorityIcon label={p.priorityLabel} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{p.original.title}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{p.reasoning}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          p.priorityLabel === "קריטי" ? "bg-red-500/20 text-red-400" :
                          p.priorityLabel === "גבוה" ? "bg-orange-500/20 text-orange-400" :
                          p.priorityLabel === "בינוני" ? "bg-yellow-500/20 text-yellow-400" :
                          "bg-green-500/20 text-green-400"
                        }`}>{p.score}</span>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab === "summary" && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-violet-400" />
                      <h4 className="font-medium text-sm">סיכום יומי</h4>
                    </div>
                    <pre className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap font-sans">{dailySummary}</pre>
                  </div>
                )}

                {activeTab === "ai" && (
                  <div className="space-y-3">
                    {analysis ? (
                      <div className="flex items-start gap-2">
                        <Bot className="w-4 h-4 text-violet-400 flex-shrink-0 mt-1" />
                        <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{analysis}</p>
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <Bot className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">לחץ על "ניתוח AI" ליצירת ניתוח מעמיק</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
