import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, X, Send, Loader2, Sparkles, Minimize2, Maximize2,
  MessageSquare, RotateCcw
} from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

interface CopilotMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

function getPageContext(location: string): { module?: string; entity?: string; entityId?: number; moduleId?: number; recordId?: number; page?: "list" | "form" | "detail" | "dashboard"; description: string } {
  if (location === "/") return { page: "dashboard", description: "דשבורד ראשי" };
  const builderMatch = location.match(/^\/builder\/data\/(\d+)(?:\/(\d+))?/);
  if (builderMatch) {
    const entityId = parseInt(builderMatch[1]);
    const recordId = builderMatch[2] ? parseInt(builderMatch[2]) : undefined;
    return { entityId, recordId, page: recordId ? "detail" : "list", description: recordId ? "תצוגת רשומה" : "תצוגת נתונים" };
  }
  const moduleMatch = location.match(/^\/module\/(\d+)/);
  if (moduleMatch) return { moduleId: parseInt(moduleMatch[1]), page: "list", description: "תצוגת מודול" };
  if (location.startsWith("/builder")) return { page: "form", description: "בונה מערכת" };
  if (location.startsWith("/suppliers")) return { module: "suppliers", description: "ניהול ספקים" };
  if (location.startsWith("/procurement")) return { module: "procurement", description: "רכש" };
  if (location.startsWith("/finance")) return { module: "finance", description: "חשבונאות" };
  if (location.startsWith("/hr")) return { module: "hr", description: "משאבי אנוש" };
  if (location.startsWith("/crm")) return { module: "crm", description: "לקוחות ומכירות" };
  if (location.startsWith("/reports")) return { description: "דוחות" };
  if (location.startsWith("/settings")) return { description: "הגדרות" };
  return { description: "מערכת ERP" };
}

async function fetchStructuredContext(pageContext: ReturnType<typeof getPageContext>): Promise<string> {
  const body: any = {};
  if (pageContext.moduleId) body.moduleId = pageContext.moduleId;
  if (pageContext.entityId) body.entityId = pageContext.entityId;
  if (pageContext.recordId) body.recordId = pageContext.recordId;
  if (pageContext.page) body.page = pageContext.page;

  if (!body.moduleId && !body.entityId) {
    return `[הקשר: המשתמש נמצא ב${pageContext.description}${pageContext.module ? ` (מודול: ${pageContext.module})` : ""}]`;
  }

  try {
    const r = await authFetch(`${API}/claude/context/resolve`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("context resolve failed");
    const ctx = await r.json();
    const parts: string[] = [`[הקשר מובנה מהמערכת]`];
    if (ctx.module) parts.push(`מודול: ${ctx.module.nameHe || ctx.module.name} (ID: ${ctx.module.id})`);
    if (ctx.entity) parts.push(`ישות: ${ctx.entity.nameHe || ctx.entity.name} (ID: ${ctx.entity.id})`);
    if (ctx.recordCount !== undefined) parts.push(`סה"כ רשומות: ${ctx.recordCount}`);
    if (ctx.fields?.length) parts.push(`שדות: ${ctx.fields.slice(0, 15).map((f: any) => f.nameHe || f.name).join(", ")}`);
    if (ctx.statuses?.length) parts.push(`סטטוסים: ${ctx.statuses.map((s: any) => s.nameHe || s.name).join(", ")}`);
    if (ctx.record) parts.push(`רשומה #${ctx.record.id}: ${JSON.stringify(ctx.record.data || {}).slice(0, 200)}`);
    return parts.join("\n");
  } catch {
    return `[הקשר: המשתמש נמצא ב${pageContext.description}]`;
  }
}

function CopilotMessageContent({ content }: { content: string | any }) {
  const [copied, setCopied] = useState(false);
  const parts: JSX.Element[] = [];
  
  // Type guard: ensure content is a string
  const contentStr = typeof content === "string" ? content : JSON.stringify(content || "");
  const lines = contentStr.split("\n");
  let key = 0;

  for (const line of lines) {
    if (line.startsWith("### ")) {
      parts.push(<h4 key={key++} className="text-sm font-bold text-white mt-2 mb-1">{line.slice(4)}</h4>);
    } else if (line.startsWith("## ")) {
      parts.push(<h3 key={key++} className="text-base font-bold text-white mt-2 mb-1">{line.slice(3)}</h3>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      parts.push(<li key={key++} className="text-gray-200 mr-4 list-disc list-inside text-sm">{formatInline(line.slice(2))}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      parts.push(<li key={key++} className="text-gray-200 mr-4 list-decimal list-inside text-sm">{formatInline(line.replace(/^\d+\.\s/, ""))}</li>);
    } else if (line.trim() === "") {
      parts.push(<div key={key++} className="h-1.5" />);
    } else {
      parts.push(<p key={key++} className="text-gray-200 text-sm leading-relaxed">{formatInline(line)}</p>);
    }
  }

  return <div className="space-y-0.5">{parts}</div>;
}

function formatInline(text: string): (string | JSX.Element)[] {
  const result: (string | JSX.Element)[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match;
  let k = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) result.push(text.slice(lastIndex, match.index));
    const m = match[0];
    if (m.startsWith("`")) {
      result.push(<code key={k++} className="bg-gray-800 text-blue-300 px-1 py-0.5 rounded text-xs font-mono">{m.slice(1, -1)}</code>);
    } else if (m.startsWith("**")) {
      result.push(<strong key={k++} className="text-white font-semibold">{m.slice(2, -2)}</strong>);
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) result.push(text.slice(lastIndex));
  return result;
}

const QUICK_ACTIONS = [
  "תסכם לי את המצב הנוכחי",
  "מה דורש תשומת לב?",
  "תציע שיפורים",
  "עזור לי למצוא נתונים",
];

export default function AICopilot() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<CopilotMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [lastFailedMsg, setLastFailedMsg] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [location] = useLocation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pageContext = getPageContext(location);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending, streamingText]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isSending) return;
    setIsSending(true);
    setSendError(null);
    setLastFailedMsg(null);
    setStreamingText("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let accumulated = "";

    try {
      const contextPrefix = await fetchStructuredContext(pageContext);
      const r = await authFetch(`${API}/claude/chat/send-stream`, {
        method: "POST",
        body: JSON.stringify({
          message: contextPrefix + "\n\n" + text,
          channel: "support",
        }),
        signal: ctrl.signal,
      } as RequestInit);

      if (!r.ok || !r.body) {
        let errMsg = "שגיאה בשליחה";
        try { const err = await r.json(); errMsg = err.error || errMsg; } catch {}
        throw new Error(errMsg);
      }

      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          const lines = part.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7).trim();
            else if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!data) continue;
          try {
            const parsed = JSON.parse(data);
            if (event === "text") {
              accumulated += parsed.text;
              setStreamingText(accumulated);
            } else if (event === "done") {
              setMessages(prev => [...prev, {
                role: "assistant",
                content: accumulated || "קיבלתי את הבקשה שלך.",
                timestamp: new Date(),
              }]);
            } else if (event === "error") {
              throw new Error(parsed.error || "שגיאה לא ידועה");
            }
          } catch (parseErr) {
            if (event === "error") throw parseErr;
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      const errMsg = err instanceof Error ? err.message : "אירעה שגיאה";
      setSendError(errMsg);
      setLastFailedMsg(text);
    } finally {
      setIsSending(false);
      setStreamingText(null);
      abortRef.current = null;
    }
  };

  const handleSend = (msg?: string) => {
    const text = (msg || input).trim();
    if (!text || isSending) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: text, timestamp: new Date() }]);
    sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const resetChat = () => {
    setMessages([]);
    setSendError(null);
    setLastFailedMsg(null);
  };

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-2xl shadow-violet-500/30 flex items-center justify-center hover:from-violet-500 hover:to-indigo-500 transition-all group"
          >
            <Bot className="w-6 h-6 group-hover:scale-110 transition-transform" />
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-background animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`fixed z-50 bg-[#0d0f14] border border-gray-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden ${
              isExpanded
                ? "bottom-4 left-4 right-4 top-4 md:left-auto md:right-4 md:top-4 md:bottom-4 md:w-[600px]"
                : "bottom-6 left-6 w-[380px] h-[550px]"
            }`}
           
          >
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-l from-violet-600/20 to-indigo-600/20 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-violet-600/30 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">AI Copilot</h3>
                  <p className="text-muted-foreground text-[10px]">{pageContext.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={resetChat} className="p-1.5 text-muted-foreground hover:text-white hover:bg-card/10 rounded-lg transition-colors" title="שיחה חדשה">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setIsExpanded(!isExpanded)} className="p-1.5 text-muted-foreground hover:text-white hover:bg-card/10 rounded-lg transition-colors">
                  {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setIsOpen(false)} className="p-1.5 text-muted-foreground hover:text-white hover:bg-card/10 rounded-lg transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-2xl bg-violet-600/20 flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="w-7 h-7 text-violet-400" />
                  </div>
                  <h4 className="text-white font-semibold mb-1">איך אפשר לעזור?</h4>
                  <p className="text-muted-foreground text-xs mb-4">אני מכיר את ההקשר של הדף הנוכחי</p>
                  <div className="space-y-2">
                    {QUICK_ACTIONS.map((action, i) => (
                      <button
                        key={i}
                        onClick={() => handleSend(action)}
                        className="w-full text-right px-3 py-2 bg-[#1a1d23] border border-gray-800 rounded-xl text-xs text-gray-300 hover:border-violet-500/30 hover:text-white transition-colors"
                      >
                        <Sparkles className="w-3 h-3 text-violet-400 inline-block ml-1.5" />
                        {action}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center ${
                    msg.role === "user" ? "bg-blue-600" : "bg-violet-600/30"
                  }`}>
                    {msg.role === "user"
                      ? <MessageSquare className="w-3 h-3 text-white" />
                      : <Bot className="w-3 h-3 text-violet-400" />
                    }
                  </div>
                  <div className={`max-w-[85%] px-3 py-2 rounded-xl ${
                    msg.role === "user"
                      ? "bg-blue-600/20 border border-blue-600/30"
                      : "bg-[#1a1d23] border border-gray-800"
                  }`}>
                    {msg.role === "user"
                      ? <p className="text-gray-200 text-sm whitespace-pre-wrap">{msg.content}</p>
                      : <CopilotMessageContent content={msg.content} />
                    }
                  </div>
                </motion.div>
              ))}

              {isSending && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-2">
                  <div className="w-6 h-6 rounded-md bg-violet-600/30 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3 h-3 text-violet-400" />
                  </div>
                  <div className="bg-[#1a1d23] border border-gray-800 rounded-xl px-3 py-2 max-w-[85%]">
                    {streamingText ? (
                      <div className="text-gray-200 text-sm whitespace-pre-wrap">{streamingText}<span className="inline-block w-1 h-3.5 bg-violet-400 animate-pulse ml-0.5 align-middle" /></div>
                    ) : (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span className="text-xs">חושב...</span>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {sendError && (
              <div className="mx-3 mb-1 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs flex items-center justify-between gap-2">
                <span className="flex-1 min-w-0 truncate">שגיאה: {sendError}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {lastFailedMsg && (
                    <button onClick={() => { setSendError(null); sendMessage(lastFailedMsg); }} className="text-violet-300 hover:text-violet-200 underline flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" />נסה שוב
                    </button>
                  )}
                  <button onClick={() => setSendError(null)} className="text-red-300 hover:text-red-200 underline">סגור</button>
                </div>
              </div>
            )}
            <div className="p-3 border-t border-gray-800 bg-[#0a0c10]">
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="שאל שאלה או בקש פעולה..."
                    className="w-full bg-[#1a1d23] border border-gray-700 rounded-xl px-3 py-2 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-violet-500 text-sm min-h-[40px] max-h-[120px]"
                    rows={1}
                    onInput={(e) => { const t = e.currentTarget; t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; }}
                    disabled={isSending}
                  />
                </div>
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isSending}
                  className="flex-shrink-0 w-9 h-9 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors"
                >
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
