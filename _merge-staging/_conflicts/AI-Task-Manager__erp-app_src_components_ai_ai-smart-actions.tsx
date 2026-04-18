import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, BarChart3, AlertTriangle, FileText, Zap,
  Loader2, X, ChevronDown, Bot
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

interface AISmartActionsProps {
  entityName: string;
  entityId: number;
  records: any[];
  fields: any[];
}

const SMART_ACTIONS = [
  { id: "analyze", label: "נתח נתונים", icon: BarChart3, color: "text-blue-400", bg: "bg-blue-500/10" },
  { id: "anomalies", label: "זהה חריגות", icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10" },
  { id: "report", label: "צור דוח", icon: FileText, color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { id: "automate", label: "הצע אוטומציה", icon: Zap, color: "text-violet-400", bg: "bg-violet-500/10" },
];

export default function AISmartActions({ entityName, entityId, records, fields }: AISmartActionsProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [resultTitle, setResultTitle] = useState("");

  const actionMutation = useMutation({
    mutationFn: async (actionId: string) => {
      const sampleRecords = records.slice(0, 10).map(r => {
        const data = r.data || {};
        const summary: Record<string, any> = {};
        fields.filter(f => f.showInList).slice(0, 6).forEach(f => {
          if (data[f.slug] !== undefined && data[f.slug] !== null) {
            summary[f.name] = String(data[f.slug]).slice(0, 50);
          }
        });
        summary["סטטוס"] = r.status || "–";
        return summary;
      });

      const prompts: Record<string, string> = {
        analyze: `[ניתוח נתונים]\nנתח את הנתונים של ישות "${entityName}" (${records.length} רשומות).\n\nדוגמאות:\n${JSON.stringify(sampleRecords, null, 2)}\n\nספק ניתוח קצר: התפלגות סטטוסים, מגמות, ונקודות מעניינות.`,
        anomalies: `[זיהוי חריגות]\nבדוק את הנתונים של "${entityName}" (${records.length} רשומות) וזהה חריגות.\n\nדוגמאות:\n${JSON.stringify(sampleRecords, null, 2)}\n\nזהה ערכים חריגים, חוסרים, ודפוסים לא רגילים.`,
        report: `[יצירת דוח]\nצור דוח סיכום קצר על "${entityName}" (${records.length} רשומות).\n\nדוגמאות:\n${JSON.stringify(sampleRecords, null, 2)}\n\nכלול: סה"כ, התפלגות, ממוצעים, ונקודות חשובות.`,
        automate: `[הצעת אוטומציה]\nהצע אוטומציות חכמות עבור "${entityName}" על בסיס ${records.length} רשומות.\n\nשדות: ${fields.map(f => f.name).join(", ")}\n\nהצע 3-5 אוטומציות מעשיות: כללי ולידציה, התראות, שינויי סטטוס אוטומטיים, חישובים.`,
      };

      const r = await authFetch(`${API}/claude/chat/send`, {
        method: "POST",
        body: JSON.stringify({
          message: prompts[actionId] || prompts.analyze,
          channel: "support",
        }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (data) => {
      setResult(data.response || data.message || "אין תוצאות.");
    },
    onError: () => {
      setResult("אירעה שגיאה. נסה שוב.");
    },
  });

  const handleAction = (action: typeof SMART_ACTIONS[0]) => {
    setShowDropdown(false);
    setResultTitle(action.label);
    setResult(null);
    actionMutation.mutate(action.id);
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-1.5 px-3 py-2 bg-violet-600/10 text-violet-400 hover:bg-violet-600/20 border border-violet-500/20 rounded-xl text-sm font-medium transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          פעולות AI
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDropdown ? "rotate-180" : ""}`} />
        </button>

        <AnimatePresence>
          {showDropdown && (
            <motion.div
              initial={{ opacity: 0, y: -5, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.95 }}
              className="absolute top-full mt-1 left-0 bg-card border border-border rounded-xl shadow-xl z-30 py-1 min-w-[180px]"
            >
              {SMART_ACTIONS.map(action => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={() => handleAction(action)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-card/5 transition-colors text-right text-sm"
                  >
                    <div className={`w-7 h-7 rounded-lg ${action.bg} flex items-center justify-center`}>
                      <Icon className={`w-3.5 h-3.5 ${action.color}`} />
                    </div>
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {(actionMutation.isPending || result) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => { setResult(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-6 w-full max-w-xl max-h-[80vh] overflow-y-auto"
             
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-violet-400" />
                  <h3 className="text-lg font-bold">{resultTitle}</h3>
                </div>
                <button onClick={() => setResult(null)} className="p-1.5 hover:bg-muted rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {actionMutation.isPending ? (
                <div className="flex items-center justify-center gap-3 py-8">
                  <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                  <span className="text-muted-foreground">AI מנתח {records.length} רשומות...</span>
                </div>
              ) : result ? (
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <Bot className="w-5 h-5 text-violet-400 flex-shrink-0 mt-1" />
                    <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {result}
                    </div>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
