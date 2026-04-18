import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Send, Loader2, Sparkles, MessageSquare, RotateCcw,
  CheckCircle2, XCircle, Calendar, Package, ClipboardList,
  Truck, Users, Factory, ChevronRight, AlertCircle, X
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  requiresAction?: boolean;
  action?: string;
  actionParams?: any;
  confirmMessage?: string;
}

const QUICK_ACTIONS = [
  { label: "כמה ימי חופשה נותרו לי?", icon: Calendar },
  { label: "מה המלאי הנוכחי?", icon: Package },
  { label: "הזמנות רכש פתוחות", icon: ClipboardList },
  { label: "רשימת ספקים פעילים", icon: Truck },
  { label: "לקוחות הגדולים ביותר", icon: Users },
  { label: "מה הסטטוס של הייצור?", icon: Factory },
];

function MessageContent({ content }: { content: string }) {
  const lines = content.split("\n");
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        if (line.startsWith("### ")) return <h4 key={i} className="text-sm font-bold text-foreground mt-2 mb-1">{line.slice(4)}</h4>;
        if (line.startsWith("## ")) return <h3 key={i} className="text-base font-bold text-foreground mt-2 mb-1">{line.slice(3)}</h3>;
        if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="text-foreground mr-4 list-disc list-inside text-sm">{line.slice(2)}</li>;
        if (/^\d+\.\s/.test(line)) return <li key={i} className="text-foreground mr-4 list-decimal list-inside text-sm">{line.replace(/^\d+\.\s/, "")}</li>;
        if (line.trim() === "") return <div key={i} className="h-1.5" />;
        return <p key={i} className="text-foreground text-sm leading-relaxed">{line}</p>;
      })}
    </div>
  );
}

export default function EmployeeChatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingAction, setPendingAction] = useState<Message | null>(null);
  const [actionExecuting, setActionExecuting] = useState(false);
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isSending) return;
    setIsSending(true);
    setError(null);

    const userMsg: Message = { role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
      const r = await authFetch(`${API}/employee-chatbot/chat`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ message: text, history }),
      });

      if (!r.ok) throw new Error("שגיאה בשליחה");
      const data = await r.json();

      const assistantMsg: Message = {
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
        requiresAction: data.requiresAction,
        action: data.action,
        actionParams: data.actionParams,
        confirmMessage: data.confirmMessage,
      };
      setMessages(prev => [...prev, assistantMsg]);

      if (data.requiresAction) {
        setPendingAction(assistantMsg);
      }
    } catch (e: any) {
      setError(e.message || "אירעה שגיאה");
    } finally {
      setIsSending(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendMessage(text);
  };

  const executeAction = async () => {
    if (!pendingAction) return;
    setActionExecuting(true);

    try {
      const r = await authFetch(`${API}/employee-chatbot/execute-action`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          action: pendingAction.action,
          params: pendingAction.actionParams,
        }),
      });
      const data = await r.json();
      setActionResult(data.result || "הפעולה בוצעה בהצלחה");
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `✅ ${data.result || "הפעולה בוצעה בהצלחה"}`,
        timestamp: new Date(),
      }]);
    } catch (e: any) {
      setActionResult("❌ " + (e.message || "הפעולה נכשלה"));
    } finally {
      setActionExecuting(false);
      setPendingAction(null);
    }
  };

  const cancelAction = () => {
    setPendingAction(null);
    setMessages(prev => [...prev, {
      role: "assistant",
      content: "בסדר, הפעולה בוטלה. אפשר לעזור לך עם משהו אחר?",
      timestamp: new Date(),
    }]);
  };

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
          <Bot className="w-5 h-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">צ'אטבוט ERP לעובדים</h1>
          <p className="text-xs text-muted-foreground">שאל שאלות, בדוק נתונים, צור הזמנות — הכל בשיחה טבעית בעברית</p>
        </div>
        <div className="mr-auto flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 text-xs font-medium">מחובר ל-ERP</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl flex flex-col h-[600px]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-gradient-to-l from-violet-600/10 to-indigo-600/10">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-violet-600/30 flex items-center justify-center">
                <Bot className="w-4 h-4 text-violet-400" />
              </div>
              <div>
                <span className="text-foreground text-sm font-semibold">עוזר ERP</span>
                <p className="text-muted-foreground text-[10px]">גישה לנתוני מערכת בזמן אמת</p>
              </div>
            </div>
            <button
              onClick={() => { setMessages([]); setError(null); setPendingAction(null); }}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
              title="שיחה חדשה"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="w-14 h-14 rounded-2xl bg-violet-600/20 flex items-center justify-center mx-auto mb-3">
                  <Sparkles className="w-7 h-7 text-violet-400" />
                </div>
                <h4 className="text-foreground font-semibold mb-1">שלום! אני עוזר ה-ERP שלך</h4>
                <p className="text-muted-foreground text-xs mb-4">שאל אותי על מלאי, הזמנות, לקוחות, עובדים ועוד</p>
              </div>
            )}

            {messages.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${msg.role === "user" ? "bg-blue-600" : "bg-violet-600/30"}`}>
                  {msg.role === "user"
                    ? <MessageSquare className="w-3 h-3 text-foreground" />
                    : <Bot className="w-3 h-3 text-violet-400" />}
                </div>
                <div className={`max-w-[85%] px-3 py-2 rounded-xl ${msg.role === "user" ? "bg-blue-600/20 border border-blue-600/30" : "bg-card border border-border"}`}>
                  {msg.role === "user"
                    ? <p className="text-foreground text-sm">{msg.content}</p>
                    : <MessageContent content={msg.content} />}

                  {msg.requiresAction && msg === messages[messages.length - 1] && (
                    <div className="mt-3 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                      <div className="flex items-start gap-2 mb-2">
                        <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-amber-300 text-xs">{msg.confirmMessage || "האם לבצע את הפעולה?"}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={executeAction}
                          disabled={actionExecuting}
                          className="flex-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-foreground text-xs rounded-lg flex items-center justify-center gap-1 transition-colors"
                        >
                          {actionExecuting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                          אישור
                        </button>
                        <button
                          onClick={cancelAction}
                          className="flex-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs rounded-lg flex items-center justify-center gap-1 border border-red-500/30 transition-colors"
                        >
                          <XCircle className="w-3 h-3" />
                          ביטול
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}

            {isSending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
                <div className="w-6 h-6 rounded-md bg-violet-600/30 flex items-center justify-center">
                  <Bot className="w-3 h-3 text-violet-400" />
                </div>
                <div className="bg-card border border-border rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-xs">מחפש בנתוני המערכת...</span>
                  </div>
                </div>
              </motion.div>
            )}

            {error && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs">
                <X className="w-3.5 h-3.5" />
                שגיאה: {error}
              </div>
            )}

            {actionResult && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {actionResult}
                </motion.div>
              </AnimatePresence>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t border-border bg-card">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                  placeholder="שאל שאלה על המערכת..."
                  className="w-full bg-card border border-border rounded-xl px-3 py-2 text-foreground placeholder-gray-500 resize-none focus:outline-none focus:border-violet-500 text-sm min-h-[40px] max-h-[120px]"
                  rows={1}
                  onInput={e => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }}
                  disabled={isSending}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || isSending}
                className="w-9 h-9 bg-violet-600 hover:bg-violet-500 disabled:bg-muted disabled:cursor-not-allowed text-foreground rounded-xl flex items-center justify-center transition-colors"
              >
                {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-foreground">שאלות מהירות</h3>
            </div>
            <div className="space-y-2">
              {QUICK_ACTIONS.map((qa, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(""); sendMessage(qa.label); }}
                  disabled={isSending}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-muted/20 border border-border hover:border-violet-500/40 hover:bg-violet-500/5 rounded-xl text-sm text-gray-300 hover:text-foreground transition-all text-right disabled:opacity-50"
                >
                  <qa.icon className="w-4 h-4 text-violet-400 flex-shrink-0" />
                  <span className="flex-1">{qa.label}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">דוגמאות לשאלות</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <p className="p-2 bg-muted/10 rounded-lg">"כמה יחידות פרופיל אלומיניום 40x40 במלאי?"</p>
              <p className="p-2 bg-muted/10 rounded-lg">"מה הסטטוס של הזמנת רכש מספר PO-2024-001?"</p>
              <p className="p-2 bg-muted/10 rounded-lg">"צור הזמנת רכש ל-100 ברגים מספק דוד"</p>
              <p className="p-2 bg-muted/10 rounded-lg">"כמה ימי חופשה נשארו לי?"</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">יכולות הבוט</h3>
            <div className="space-y-1.5">
              {[
                "שאילתות HR — חופש, מחלה, נוכחות",
                "בדיקת מלאי ומוצרים",
                "יצירת הזמנות רכש (עם אישור)",
                "מידע על לקוחות וספקים",
                "סטטוס הזמנות ומשלוחים",
                "נתוני ייצור ועבודה",
              ].map((cap, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  {cap}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
