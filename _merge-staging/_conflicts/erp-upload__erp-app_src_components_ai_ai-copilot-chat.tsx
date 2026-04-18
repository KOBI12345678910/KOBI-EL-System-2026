import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Brain, Send, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { entityList } from "@/lib/entity-api";
import { authFetch } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AICopilotChatProps {
  context?: Record<string, unknown>;
}

export default function AICopilotChat({ context = {} }: AICopilotChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        'שלום! אני העוזר החכם שלך. אני יכול לעזור לך עם:\n\n- ניתוח לידים והמלצות\n- חיזוי מכירות והזדמנויות\n- אופטימיזציה של תהליכים\n- תשובות לשאלות על הנתונים\n\nמה אוכל לעזור?',
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions] = useState([
    "מה המגמות במכירות השבוע?",
    "איזה לידים דורשים טיפול דחוף?",
    "תן לי המלצות לשיפור הקונברסיה",
    "נתח את ביצועי הצוות שלי",
  ]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setLoading(true);

    try {
      const contextData = await buildContext();

      const prompt = `
אתה עוזר AI חכם למערכת CRM/ERP.

קונטקסט עסקי נוכחי:
${JSON.stringify(contextData, null, 2)}

שאלת המשתמש: ${userMessage}

תן תשובה מקצועית, ממוקדת ומעשית. כלול:
- ניתוח הנתונים הרלוונטיים
- המלצות קונקרטיות
- צעדי פעולה ברורים
- מספרים ותובנות

תשובה בעברית:
      `;

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          add_context_from_internet: false,
        }),
      });
      const response = await res.text();

      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
    } catch (error) {
      console.error("AI Copilot error:", error);
      toast.error("שגיאה בתקשורת עם AI");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "מצטער, נתקלתי בבעיה. נסה שוב.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const buildContext = async () => {
    try {
      const [leads, orders, tasks, invoices] = await Promise.all([
        entityList<Record<string, unknown>>("leads", "-created_date", 20),
        entityList<Record<string, unknown>>("sales-orders", "-created_date", 20),
        entityList<Record<string, unknown>>("tasks", "-created_date", 30),
        entityList<Record<string, unknown>>("invoices", "-created_date", 20),
      ]);

      return {
        leads: {
          total: leads.length,
          new: leads.filter((l) => l.stage === "new").length,
          hot: leads.filter((l) => l.grade === "hot").length,
          conversion_rate:
            leads.length > 0
              ? ((leads.filter((l) => l.stage === "won").length / leads.length) * 100).toFixed(1)
              : 0,
        },
        sales: {
          total_orders: orders.length,
          pending: orders.filter((o) => o.status === "pending").length,
          revenue: orders.reduce((sum, o) => sum + ((o.total as number) || 0), 0),
        },
        tasks: {
          total: tasks.length,
          overdue: tasks.filter(
            (t) =>
              t.due_date &&
              new Date(t.due_date as string) < new Date() &&
              t.status === "todo"
          ).length,
          completed_today: tasks.filter(
            (t) =>
              t.completed_at &&
              new Date(t.completed_at as string).toDateString() === new Date().toDateString()
          ).length,
        },
        finance: {
          total_invoices: invoices.length,
          paid: invoices.filter((i) => i.status === "paid").length,
          collection_rate:
            invoices.length > 0
              ? (
                  (invoices.filter((i) => i.status === "paid").length / invoices.length) *
                  100
                ).toFixed(1)
              : 0,
        },
        context,
      };
    } catch (error) {
      console.error("Context building error:", error);
      return {};
    }
  };

  const useSuggestion = (suggestion: string) => {
    setInput(suggestion);
  };

  return (
    <Card className="border-0 shadow-2xl bg-gradient-to-br from-white via-purple-50/30 to-indigo-50/30 h-[600px] flex flex-col">
      <CardHeader className="bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 text-white border-b-0">
        <CardTitle className="text-lg flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Brain className="w-5 h-5 animate-pulse" />
          </div>
          AI Copilot
          <Badge className="bg-white/20 text-white border-white/30 mr-auto">
            <Sparkles className="w-3 h-3 ml-1" />
            GPT-4 Enhanced
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0">
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl p-4 ${
                  msg.role === "user"
                    ? "bg-gradient-to-br from-indigo-600 to-purple-600 text-white"
                    : "bg-white border border-slate-200 text-slate-800"
                }`}
              >
                {msg.role === "assistant" ? (
                  <ReactMarkdown className="text-sm prose prose-sm max-w-none">
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  <p className="text-sm">{msg.content}</p>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 rounded-2xl p-4">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
              </div>
            </div>
          )}
        </div>

        {/* Suggestions */}
        <div className="p-4 bg-slate-50 border-t">
          <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
            {suggestions.map((sug, idx) => (
              <Button
                key={idx}
                variant="outline"
                size="sm"
                onClick={() => useSuggestion(sug)}
                className="whitespace-nowrap text-xs bg-white hover:bg-indigo-50"
              >
                <Sparkles className="w-3 h-3 ml-1" />
                {sug}
              </Button>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              placeholder="שאל אותי כל דבר..."
              className="flex-1"
              disabled={loading}
            />
            <Button
              onClick={handleSend}
              disabled={loading || !input.trim()}
              className="bg-gradient-to-r from-indigo-600 to-purple-600"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
