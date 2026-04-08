import { useState, useEffect, useRef } from "react";
import { MessageSquare, Send, CheckCheck, Check, Clock, AlertCircle, RefreshCw, ChevronDown, X, Loader2 } from "lucide-react";
import { authFetch } from "@/lib/utils";

interface WaMessage {
  id: number;
  channel: string;
  direction: string;
  from_address: string;
  to_address: string;
  body: string;
  status: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface Props {
  entityType: "lead" | "customer";
  entityId: number;
  entityName: string;
  phone?: string;
  className?: string;
}

function StatusIcon({ status, readAt, deliveredAt }: { status: string; readAt?: string; deliveredAt?: string }) {
  if (readAt || status === "read") return <CheckCheck className="w-3 h-3 text-blue-400" />;
  if (deliveredAt || status === "delivered") return <CheckCheck className="w-3 h-3 text-gray-400" />;
  if (status === "sent") return <Check className="w-3 h-3 text-gray-400" />;
  if (status === "failed") return <AlertCircle className="w-3 h-3 text-red-400" />;
  return <Clock className="w-3 h-3 text-gray-400" />;
}

function formatTs(ts?: string): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
}

const QUICK_TEMPLATES = [
  { name: "ברכת בוקר", text: "שלום! כיצד נוכל לסייע לך היום? 👋" },
  { name: "מעקב הצעה", text: "שלום, האם קיבלת את הצעת המחיר שלנו? אשמח לענות על שאלות 😊" },
  { name: "אישור פגישה", text: "שלום, מאשרים את הפגישה שלנו! נשמח לראותך 📅" },
  { name: "תזכורת תשלום", text: "שלום, תזכורת ידידותית לגבי חשבונית פתוחה. ניתן לפנות אלינו בכל שאלה 💳" },
  { name: "ליד חדש", text: "שלום! 🎉 קיבלנו את פנייתך ונחזור אליך בתוך שעה. תודה!" },
];

export default function WhatsAppConversation({ entityType, entityId, entityName, phone, className = "" }: Props) {
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noConnection, setNoConnection] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`/api/crm/whatsapp/conversations/${entityType}/${entityId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(Array.isArray(data) ? data : []);
        setNoConnection(false);
      } else if (res.status === 503) {
        setNoConnection(true);
      }
    } catch {
      setError("שגיאה בטעינת שיחה");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!entityId) return;
    let active = true;
    const poll = async () => {
      if (!active) return;
      setError(null);
      try {
        const res = await authFetch(`/api/crm/whatsapp/conversations/${entityType}/${entityId}`);
        if (!active) return;
        if (res.ok) {
          const data = await res.json();
          setMessages(Array.isArray(data) ? data : []);
          setNoConnection(false);
        } else if (res.status === 503) {
          setNoConnection(true);
        }
      } catch {
        // non-critical polling error — ignore
      }
    };
    load();
    // Poll every 20 seconds for real-time sent/delivered/read status updates
    const interval = setInterval(poll, 20000);
    return () => { active = false; clearInterval(interval); };
  }, [entityType, entityId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!text.trim()) return;
    if (!phone) {
      setError("לא הוגדר מספר טלפון לגורם זה");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await authFetch("/api/crm/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: phone,
          message: text,
          entityType,
          entityId,
          entityName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setText("");
        await load();
      } else {
        setError(data.error || "שליחה נכשלה");
      }
    } catch {
      setError("שגיאת שליחה");
    }
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (noConnection) {
    return (
      <div className={`flex flex-col items-center justify-center py-8 text-center ${className}`}>
        <MessageSquare className="w-10 h-10 text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium text-foreground mb-1">WhatsApp לא מחובר</p>
        <p className="text-xs text-muted-foreground">יש להגדיר חיבור WhatsApp Business בהגדרות האינטגרציות</p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center justify-between p-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <p className="text-sm font-medium">{entityName}</p>
            {phone && <p className="text-xs text-muted-foreground" dir="ltr">{phone}</p>}
          </div>
        </div>
        <button onClick={load} className="p-1 hover:bg-muted rounded text-muted-foreground">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#0a0a14]" style={{ minHeight: "250px", maxHeight: "400px" }}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">אין הודעות בשיחה זו</p>
          </div>
        ) : (
          messages.map(msg => {
            const isOut = msg.direction === "outbound";
            return (
              <div key={msg.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${isOut ? "bg-green-600 text-foreground rounded-tr-sm" : "bg-[#1e1e2e] text-foreground rounded-tl-sm border border-border"}`}>
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>
                  <div className={`flex items-center gap-1 mt-1 ${isOut ? "justify-end" : "justify-start"}`}>
                    <span className="text-xs opacity-70">{formatTs(msg.created_at)}</span>
                    {isOut && <StatusIcon status={msg.status} readAt={msg.read_at} deliveredAt={msg.delivered_at} />}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-t border-red-500/20 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-xs text-red-400 flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-3 h-3 text-red-400" /></button>
        </div>
      )}

      {showTemplates && (
        <div className="border-t border-border bg-card p-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium">תבניות מהירות</span>
            <button onClick={() => setShowTemplates(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-1">
            {QUICK_TEMPLATES.map(t => (
              <button
                key={t.name}
                onClick={() => { setText(t.text); setShowTemplates(false); }}
                className="text-right text-xs px-2 py-1.5 rounded hover:bg-muted border border-border"
              >
                <span className="font-medium block">{t.name}</span>
                <span className="text-muted-foreground truncate block">{t.text.slice(0, 60)}...</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="p-3 border-t border-border bg-card">
        <div className="flex gap-2 items-end">
          <button
            onClick={() => setShowTemplates(v => !v)}
            className={`flex-shrink-0 p-2 rounded-lg border ${showTemplates ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"}`}
            title="תבניות"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={phone ? "כתוב הודעה... (Enter לשליחה)" : "לא הוגדר מספר טלפון"}
            disabled={!phone || sending}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary"
            rows={2}
          />
          <button
            onClick={send}
            disabled={!text.trim() || !phone || sending}
            className="flex-shrink-0 p-2 rounded-lg bg-green-600 text-foreground hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        {!phone && (
          <p className="text-xs text-amber-400 mt-1">יש להוסיף מספר טלפון כדי לשלוח WhatsApp</p>
        )}
      </div>
    </div>
  );
}
