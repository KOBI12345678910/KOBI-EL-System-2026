import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sparkles, FileText, Mail, TrendingUp, AlertCircle, Loader2, LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/utils";

interface Action {
  label: string;
  icon: LucideIcon;
  type: string;
  template: string;
  needsContext?: boolean;
}

interface AILogEntry {
  action_type: string;
  prompt: string;
  response: string;
  execution_time_ms: number;
  context_entities?: Array<{ entity_type: string; entity_id: unknown }>;
}

interface QuickActionsProps {
  role: string;
  context?: Record<string, unknown>;
  entityType?: string;
  onLog?: (entry: AILogEntry) => void;
}

function getActionsForRole(role: string): Action[] {
  const actionsByRole: Record<string, Action[]> = {
    sales: [
      { label: "סכם ליד", icon: FileText, type: "summarize", template: "summarize_lead" },
      { label: "הצע פעולה הבאה", icon: TrendingUp, type: "suggest_actions", template: "suggest_next" },
      { label: "צור הצעת מחיר", icon: FileText, type: "generate_doc", template: "generate_quote" },
      { label: "כתוב מייל", icon: Mail, type: "generate_message", template: "email_template" },
    ],
    production: [
      { label: "סכם פקודה", icon: FileText, type: "summarize", template: "summarize_po" },
      { label: "זהה בעיות", icon: AlertCircle, type: "detect_anomaly", template: "detect_issues" },
      { label: "אופטימיזציה", icon: TrendingUp, type: "suggest_actions", template: "optimize" },
      { label: "דוח איכות", icon: FileText, type: "generate_doc", template: "qc_report" },
    ],
    inventory: [
      { label: "נתח מלאי", icon: TrendingUp, type: "detect_anomaly", template: "analyze_stock" },
      { label: "המלץ הזמנה", icon: FileText, type: "suggest_actions", template: "reorder" },
      { label: "חזה צריכה", icon: TrendingUp, type: "suggest_actions", template: "forecast", needsContext: true },
      { label: "דוח מלאי", icon: FileText, type: "generate_doc", template: "stock_report" },
    ],
    finance: [
      { label: "סכם חשבונית", icon: FileText, type: "summarize", template: "summarize_invoice" },
      { label: "זהה חריגות", icon: AlertCircle, type: "detect_anomaly", template: "detect_anomalies" },
      { label: "נתח תזרים", icon: TrendingUp, type: "suggest_actions", template: "cashflow" },
      { label: "תזכורת תשלום", icon: Mail, type: "generate_message", template: "payment_reminder" },
    ],
    support: [
      { label: "סכם טיקט", icon: FileText, type: "summarize", template: "summarize_ticket" },
      { label: "הצע פתרון", icon: TrendingUp, type: "suggest_actions", template: "suggest_solution" },
      { label: "תשובה ללקוח", icon: Mail, type: "generate_message", template: "customer_response" },
      { label: "דרג דחיפות", icon: AlertCircle, type: "detect_anomaly", template: "urgency" },
    ],
  };
  return actionsByRole[role] || [];
}

function buildPrompt(
  action: Action,
  context?: Record<string, unknown>,
  _entityType?: string
): string {
  const contextStr = context ? JSON.stringify(context, null, 2) : "אין";
  const templates: Record<string, string> = {
    summarize_lead: `סכם את הליד הבא בצורה תמציתית ומקצועית:\n\n${contextStr}`,
    suggest_next: `על סמך הנתונים הבאים, הצע 3 פעולות הבאות מומלצות:\n\n${contextStr}`,
    generate_quote: `צור טיוטת הצעת מחיר מקצועית בעברית על סמך:\n\n${contextStr}`,
    email_template: `כתוב מייל מקצועי ואדיב ללקוח על סמך:\n\n${contextStr}`,
    summarize_po: `סכם את פקודת הייצור בצורה מפורטת:\n\n${contextStr}`,
    detect_issues: `נתח את הנתונים וזהה בעיות או סיכונים פוטנציאליים:\n\n${contextStr}`,
    optimize: `הצע דרכים לאופטימיזציה והשבחה:\n\n${contextStr}`,
    qc_report: `צור דוח בקרת איכות מפורט:\n\n${contextStr}`,
    analyze_stock: `נתח את מצב המלאי וזהה חריגות:\n\n${contextStr}`,
    reorder: `המלץ על פריטים שיש להזמין מחדש:\n\n${contextStr}`,
    forecast: `חזה את הצריכה העתידית בהתבסס על מגמות:\n\n${contextStr}`,
    stock_report: `צור דוח מלאי מסודר:\n\n${contextStr}`,
    summarize_invoice: `סכם את החשבונית:\n\n${contextStr}`,
    detect_anomalies: `זהה חריגות כספיות או דפוסים חשודים:\n\n${contextStr}`,
    cashflow: `נתח את תזרים המזומנים והמלץ:\n\n${contextStr}`,
    payment_reminder: `כתוב תזכורת תשלום מנומסת ומקצועית:\n\n${contextStr}`,
    summarize_ticket: `סכם את הטיקט והבעיה:\n\n${contextStr}`,
    suggest_solution: `הצע פתרון לבעיה:\n\n${contextStr}`,
    customer_response: `כתוב תגובה מקצועית ואמפתית ללקוח:\n\n${contextStr}`,
    urgency: `דרג את רמת הדחיפות והסבר:\n\n${contextStr}`,
  };
  return templates[action.template] || `${action.label}:\n\n${contextStr}`;
}

export default function QuickActions({ role, context, entityType, onLog }: QuickActionsProps) {
  const [loading, setLoading] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [result, setResult] = useState("");

  const actions = getActionsForRole(role);

  const executeAction = async (action: Action) => {
    setLoading(true);
    try {
      const startTime = Date.now();
      const prompt = buildPrompt(action, context, entityType);

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          add_context_from_internet: action.needsContext,
        }),
      });
      const response = await res.text();

      const executionTime = Date.now() - startTime;
      setResult(response);
      setResultOpen(true);

      if (onLog) {
        onLog({
          action_type: action.type,
          prompt: action.label,
          response,
          execution_time_ms: executionTime,
          context_entities: context
            ? [{ entity_type: entityType || "", entity_id: context.id }]
            : [],
        });
      }

      toast.success("הפעולה הושלמה");
    } catch (error) {
      toast.error("שגיאה בביצוע הפעולה");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span className="font-semibold text-sm">פעולות AI מהירות</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {actions.map((action, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                onClick={() => executeAction(action)}
                disabled={loading}
                className="justify-start"
              >
                {loading ? (
                  <Loader2 className="w-3 h-3 ml-2 animate-spin" />
                ) : (
                  <action.icon className="w-3 h-3 ml-2" />
                )}
                {action.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>תוצאה</DialogTitle>
          </DialogHeader>
          <div className="whitespace-pre-wrap bg-slate-50 p-4 rounded-lg">{result}</div>
          <Button
            onClick={() => {
              navigator.clipboard.writeText(result);
              toast.success("הועתק");
            }}
          >
            העתק
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
