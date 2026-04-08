import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, Check, X, Wand2 } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

interface AIFormFillProps {
  fields: any[];
  formData: Record<string, any>;
  entityName: string;
  onApplySuggestions: (suggestions: Record<string, any>) => void;
}

interface FieldSuggestion {
  fieldSlug: string;
  fieldName: string;
  suggestedValue: any;
  reason: string;
}

export default function AIFormFill({ fields, formData, entityName, onApplySuggestions }: AIFormFillProps) {
  const [suggestions, setSuggestions] = useState<FieldSuggestion[]>([]);
  const [acceptedFields, setAcceptedFields] = useState<Set<string>>(new Set());
  const [rejectedFields, setRejectedFields] = useState<Set<string>>(new Set());
  const [showSuggestions, setShowSuggestions] = useState(false);

  const fillMutation = useMutation({
    mutationFn: async () => {
      const emptyFields = fields.filter(f => {
        if (f.isReadOnly || f.fieldType === "auto_number" || f.fieldType === "formula" || f.fieldType === "computed") return false;
        const val = formData[f.slug];
        return val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0);
      });

      const filledFields = fields.filter(f => {
        const val = formData[f.slug];
        return val !== undefined && val !== null && val !== "" && !(Array.isArray(val) && val.length === 0);
      });

      if (emptyFields.length === 0) {
        throw new Error("כל השדות כבר מלאים");
      }

      const emptyFieldsInfo = emptyFields.map(f => `- ${f.name} (${f.slug}): סוג ${f.fieldType}${f.options ? `, אפשרויות: ${JSON.stringify(f.options)}` : ""}${f.helpText ? `, עזרה: ${f.helpText}` : ""}`).join("\n");
      const filledFieldsInfo = filledFields.map(f => `- ${f.name}: ${String(formData[f.slug]).slice(0, 100)}`).join("\n");

      const r = await authFetch(`${API}/claude/chat/send`, {
        method: "POST",
        body: JSON.stringify({
          message: `[מילוי טופס חכם]\nעזור למלא את השדות הריקים בטופס של ישות "${entityName}".\n\nשדות שכבר מלאים:\n${filledFieldsInfo || "אין"}\n\nשדות ריקים שצריך למלא:\n${emptyFieldsInfo}\n\nענה בפורמט JSON בלבד:\n[{"fieldSlug": "slug", "value": "ערך מוצע", "reason": "סיבה"}]\n\nאם אין לך מספיק מידע לשדה מסוים, דלג עליו. התאם את סוג הערך לסוג השדה (מספר, טקסט, תאריך וכו').`,
          channel: "support",
        }),
      });
      if (!r.ok) throw new Error("Failed to get suggestions");
      return r.json();
    },
    onSuccess: (data) => {
      const response = data.response || data.message || "";
      try {
        const jsonMatch = response.match(/\[[\s\S]*?\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const fieldSuggestions: FieldSuggestion[] = parsed
            .filter((s: any) => s.fieldSlug && s.value !== undefined)
            .map((s: any) => {
              const field = fields.find(f => f.slug === s.fieldSlug);
              return {
                fieldSlug: s.fieldSlug,
                fieldName: field?.name || s.fieldSlug,
                suggestedValue: s.value,
                reason: s.reason || "",
              };
            });
          setSuggestions(fieldSuggestions);
          setAcceptedFields(new Set());
          setRejectedFields(new Set());
          setShowSuggestions(true);
        } else {
          setSuggestions([]);
          setShowSuggestions(true);
        }
      } catch {
        setSuggestions([]);
        setShowSuggestions(true);
      }
    },
  });

  const handleAccept = (slug: string) => {
    setAcceptedFields(prev => { const n = new Set(prev); n.add(slug); return n; });
    setRejectedFields(prev => { const n = new Set(prev); n.delete(slug); return n; });
  };

  const handleReject = (slug: string) => {
    setRejectedFields(prev => { const n = new Set(prev); n.add(slug); return n; });
    setAcceptedFields(prev => { const n = new Set(prev); n.delete(slug); return n; });
  };

  const applyAccepted = () => {
    const toApply: Record<string, any> = {};
    suggestions.forEach(s => {
      if (acceptedFields.has(s.fieldSlug) || (!rejectedFields.has(s.fieldSlug) && !acceptedFields.size)) {
        toApply[s.fieldSlug] = s.suggestedValue;
      }
    });
    if (Object.keys(toApply).length > 0) {
      onApplySuggestions(toApply);
    }
    setShowSuggestions(false);
    setSuggestions([]);
  };

  const acceptAll = () => {
    const all = new Set(suggestions.map(s => s.fieldSlug));
    setAcceptedFields(all);
    setRejectedFields(new Set());
  };

  return (
    <>
      <button
        onClick={() => fillMutation.mutate()}
        disabled={fillMutation.isPending}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
      >
        {fillMutation.isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Wand2 className="w-3.5 h-3.5" />
        )}
        מילוי AI חכם
      </button>

      <AnimatePresence>
        {showSuggestions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
            onClick={() => setShowSuggestions(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card border border-border rounded-2xl p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto"
             
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-violet-400" />
                  <h3 className="text-lg font-bold">הצעות מילוי AI</h3>
                </div>
                <button onClick={() => setShowSuggestions(false)} className="p-1 hover:bg-muted rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {suggestions.length === 0 ? (
                <p className="text-center text-muted-foreground py-6">לא נמצאו הצעות מילוי. נסה למלא כמה שדות ידנית ולנסות שוב.</p>
              ) : (
                <>
                  <div className="space-y-3 mb-4">
                    {suggestions.map(s => {
                      const isAccepted = acceptedFields.has(s.fieldSlug);
                      const isRejected = rejectedFields.has(s.fieldSlug);
                      return (
                        <div
                          key={s.fieldSlug}
                          className={`p-3 rounded-xl border transition-colors ${
                            isAccepted ? "border-emerald-500/30 bg-emerald-500/5" :
                            isRejected ? "border-red-500/30 bg-red-500/5 opacity-50" :
                            "border-border bg-muted/5"
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{s.fieldName}</p>
                              <p className="text-xs text-primary font-mono mt-1 bg-primary/10 px-2 py-0.5 rounded inline-block">
                                {typeof s.suggestedValue === "object" ? JSON.stringify(s.suggestedValue) : String(s.suggestedValue)}
                              </p>
                              {s.reason && <p className="text-[10px] text-muted-foreground mt-1">{s.reason}</p>}
                            </div>
                            <div className="flex items-center gap-1 mr-2">
                              <button
                                onClick={() => handleAccept(s.fieldSlug)}
                                className={`p-1 rounded-lg transition-colors ${isAccepted ? "bg-emerald-500 text-white" : "text-muted-foreground hover:text-emerald-400 hover:bg-emerald-500/10"}`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleReject(s.fieldSlug)}
                                className={`p-1 rounded-lg transition-colors ${isRejected ? "bg-red-500 text-white" : "text-muted-foreground hover:text-red-400 hover:bg-red-500/10"}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-border">
                    <button
                      onClick={acceptAll}
                      className="px-3 py-2 text-xs font-medium text-violet-400 hover:bg-violet-500/10 rounded-lg transition-colors"
                    >
                      אשר הכל
                    </button>
                    <button
                      onClick={applyAccepted}
                      className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      החל הצעות ({acceptedFields.size || suggestions.filter(s => !rejectedFields.has(s.fieldSlug)).length})
                    </button>
                    <button
                      onClick={() => setShowSuggestions(false)}
                      className="px-3 py-2 text-xs text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                    >
                      ביטול
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
