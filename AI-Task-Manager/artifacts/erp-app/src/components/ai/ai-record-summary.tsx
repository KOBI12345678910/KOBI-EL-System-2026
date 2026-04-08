import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronDown, ChevronUp, Loader2, RefreshCcw, Bot } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

interface AIRecordSummaryProps {
  record: any;
  entityName: string;
  entityId: number;
  fields: any[];
}

export default function AIRecordSummary({ record, entityName, entityId, fields }: AIRecordSummaryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const summarizeMutation = useMutation({
    mutationFn: async () => {
      const data = record.data || {};
      const fieldsSummary = fields
        .filter(f => data[f.slug] !== undefined && data[f.slug] !== null && data[f.slug] !== "")
        .map(f => `${f.name}: ${String(data[f.slug]).slice(0, 100)}`)
        .join("\n");

      const r = await authFetch(`${API}/claude/chat/send`, {
        method: "POST",
        body: JSON.stringify({
          message: `[סיכום רשומה אוטומטי]\nסכם את הרשומה הבאה בקצרה (3-5 משפטים) בעברית. הדגש נקודות חשובות, סטטוס, ופעולות נדרשות אם יש.\n\nישות: ${entityName}\nמזהה: #${record.id}\nסטטוס: ${record.status || "לא הוגדר"}\nנוצר: ${new Date(record.createdAt).toLocaleDateString("he-IL")}\nעודכן: ${new Date(record.updatedAt).toLocaleDateString("he-IL")}\n\nשדות:\n${fieldsSummary}`,
          channel: "support",
        }),
      });
      if (!r.ok) throw new Error("Failed to generate summary");
      return r.json();
    },
    onSuccess: (data) => {
      setSummary(data.response || data.message || "לא ניתן ליצור סיכום.");
    },
    onError: () => {
      setSummary("לא ניתן ליצור סיכום כרגע. נסה שוב מאוחר יותר.");
    },
  });

  const handleToggle = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    if (newExpanded && !summary && !summarizeMutation.isPending) {
      summarizeMutation.mutate();
    }
  };

  return (
    <div className="bg-gradient-to-l from-violet-500/5 to-indigo-500/5 border border-violet-500/20 rounded-xl overflow-hidden">
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-card/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-medium text-violet-300">סיכום AI</span>
        </div>
        <div className="flex items-center gap-1">
          {summarizeMutation.isPending && <Loader2 className="w-3.5 h-3.5 text-violet-400 animate-spin" />}
          {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3">
              {summarizeMutation.isPending ? (
                <div className="flex items-center gap-2 py-3 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                  <span className="text-sm">מייצר סיכום...</span>
                </div>
              ) : summary ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Bot className="w-4 h-4 text-violet-400 flex-shrink-0 mt-1" />
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{summary}</p>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={(e) => { e.stopPropagation(); summarizeMutation.mutate(); }}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-violet-400 transition-colors"
                    >
                      <RefreshCcw className="w-3 h-3" />
                      רענן סיכום
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
