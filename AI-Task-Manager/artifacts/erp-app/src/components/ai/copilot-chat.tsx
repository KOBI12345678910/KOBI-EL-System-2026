import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Brain, Send, Copy, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/utils";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AILogEntry {
  action_type: string;
  prompt: string;
  response: string;
  execution_time_ms: number;
}

interface CopilotChatProps {
  role: string;
  title: string;
  context?: Record<string, unknown>;
  onLog?: (entry: AILogEntry) => void;
}

function getSystemPrompt(role: string): string {
  const prompts: Record<string, string> = {
    sales:
      "אתה עוזר AI למחלקת המכירות במפעל למתכת. עזור בניתוח לידים, הצעות מחיר, תמחור, וניהול לקוחות. השתמש בשפה מקצועית ובהירה בעברית.",
    production:
      "אתה עוזר AI למחלקת הייצור במפעל למתכת. עזור בתכנון ייצור, ניהול פקודות, אופטימיזציה של משאבים, ובקרת איכות. השתמש בטרמינולוגיה תעשייתית.",
    inventory:
      "אתה עוזר AI לניהול מלאי במפעל למתכת. עזור בניהול מלאי, הזמנות רכש, חיזוי צרכים, ואופטימיזציה של רמות מלאי.",
    finance:
      "אתה עוזר AI למחלקת הכספים במפעל למתכת. עזור בניתוח כספי, תזרים מזומנים, חשבוניות, תשלומים, ותקציבים. שמור על סודיות מלאה.",
    support:
      "אתה עוזר AI למחלקת התמיכה במפעל למתכת. עזור בטיפול בטיקטים, מענה ללקוחות, וניהול תקלות. היה אמפתי ומקצועי.",
    general:
      "אתה עוזר AI במפעל למתכת ואלומיניום. עזור בכל נושא שנדרש בצורה מקצועית ובהירה בעברית.",
  };
  return prompts[role] || prompts.general;
}

export default function CopilotChat({ role, title, context, onLog }: CopilotChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const startTime = Date.now();
      const contextPrompt = context ? `\n\nהקשר: ${JSON.stringify(context)}` : "";
      const systemPrompt = getSystemPrompt(role);

      const res = await authFetch("/api/ai/invoke-llm", {
        method: "POST",
        body: JSON.stringify({
          prompt: `${systemPrompt}\n\nשאלת המשתמש: ${input}${contextPrompt}`,
          add_context_from_internet: false,
        }),
      });
      const response = await res.text();

      const executionTime = Date.now() - startTime;
      const aiMessage: Message = { role: "assistant", content: response };
      setMessages((prev) => [...prev, aiMessage]);

      if (onLog) {
        onLog({
          action_type: "query",
          prompt: input,
          response,
          execution_time_ms: executionTime,
        });
      }
    } catch (error) {
      toast.error("שגיאה בתקשורת עם AI");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const copyMessage = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
    toast.success("הועתק");
  };

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-600" />
            {title}
          </CardTitle>
          <Badge variant="outline">{role}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-slate-500 py-8">
              <Brain className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>שלום! אני כאן לעזור. שאל אותי כל שאלה</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-900"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {msg.role === "assistant" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 mt-2"
                    onClick={() => copyMessage(msg.content, i)}
                  >
                    {copied === i ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 rounded-2xl px-4 py-3">
                <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="הקלד שאלה..."
              rows={2}
              className="resize-none"
              disabled={loading}
            />
            <Button onClick={sendMessage} disabled={loading || !input.trim()}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
