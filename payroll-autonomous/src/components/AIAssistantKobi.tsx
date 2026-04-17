/**
 * עוזר קובי — AI Personal Assistant for Kobi Elkayam
 * CEO / Real-Estate & Business Owner
 * Palantir dark theme, Hebrew RTL
 */

import React, { useState, useRef, useEffect } from "react";

const KOBI_SYSTEM_PROMPT = `אתה עוזר קובי — העוזר האישי החכם של קובי אלקיים, מנכ"ל טכנו כל עוזי בע"מ ובעלים של קובי אלקיים נדל"ן בע"מ.

הפרופיל של קובי:
- מנכ"ל חברת מתכת ותיקה (80 שנה) — מעקות, שערים, פרגולות, גדרות, ריתוך, התקנות
- משקיע נדל"ן יוקרה — לקוחות בינלאומיים (ישראל / צרפת / ארה"ב)
- מנהל 30 עובדים, קבלני משנה, ספקים ולקוחות
- דובר עברית — מעדיף תשובות קצרות, ישירות, מעשיות

תפקידך:
- לסכם נתוני ERP (פרויקטים, תקציב, עובדים, חוזים)
- לייעץ בנושאי אסטרטגיה, תמחור, ניהול
- לנסח מסמכים (הצעות מחיר, חוזים, מכתבים)
- לנתח סיכונים עסקיים
- לזהות הזדמנויות בנדל"ן

תמיד ענה בעברית אלא אם התבקשת אחרת. היה תמיד ישיר ומעשי.`;

type Message = { role: "user" | "assistant"; content: string; ts: Date };

const QUICK_ACTIONS = [
  { label: "📊 סיכום עסקי יומי", prompt: "תן לי סיכום עסקי יומי קצר — מה חשוב לדעת היום?" },
  { label: "💰 ניתוח תזרים", prompt: "נתח את מצב התזרים הנוכחי ומה הסיכונים?" },
  { label: "📝 נסח הצעת מחיר", prompt: "עזור לי לנסח הצעת מחיר מקצועית לפרויקט מעקות" },
  { label: "🏠 ניתוח נדל\"ן", prompt: "מה הנקודות החשובות להציג למשקיע נדל\"ן בינלאומי?" },
  { label: "👥 ניהול עובדים", prompt: "מה הדרך הטובה לנהל ולתמרץ עובדי ייצור?" },
  { label: "⚡ סיכון דחוף", prompt: "יש לי פרויקט שעלול להתעכב — מה לעשות?" },
];

export default function AIAssistantKobi() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "שלום קובי! 👋\nאני העוזר האישי שלך. איך אני יכול לעזור לך היום?\nאתה יכול לשאול אותי על הפרויקטים, הכספים, העובדים, הנדל\"ן — הכל.",
      ts: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    const userMsg: Message = { role: "user", content, ts: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      // Try Claude API via backend proxy
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          system: KOBI_SYSTEM_PROMPT,
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          model: "claude-opus-4-5",
          max_tokens: 1024,
        }),
      });

      let reply = "";
      if (res.ok) {
        const data = await res.json();
        reply = data?.content?.[0]?.text ?? data?.reply ?? data?.message ?? JSON.stringify(data);
      } else {
        reply = await buildFallbackReply(content);
      }

      setMessages((prev) => [...prev, { role: "assistant", content: reply, ts: new Date() }]);
    } catch {
      const reply = await buildFallbackReply(content);
      setMessages((prev) => [...prev, { role: "assistant", content: reply, ts: new Date() }]);
    } finally {
      setLoading(false);
    }
  }

  function buildFallbackReply(q: string): string {
    const low = q.toLowerCase();
    if (low.includes("תזרים") || low.includes("כסף") || low.includes("כספ"))
      return "💰 **ניתוח תזרים:**\n• בדוק חשבוניות פתוחות מעל 30 יום\n• עקוב אחר צ'קים דחויים\n• ודא שהזמנות רכש מאושרות לפני ביצוע\n• שקול דחיית תשלומים לספקים לא דחופים";
    if (low.includes("עובד") || low.includes("שכר"))
      return "👥 **ניהול עובדים:**\n• קבע יעדים ברורים לכל עובד\n• בצע 1:1 שבועי עם מנהלי ביניים\n• הישמר משעות נוספות לא מאושרות\n• שכר מותנה בביצועים = תמריץ חיובי";
    if (low.includes("נדל\"ן") || low.includes("נדלן") || low.includes("דירה"))
      return "🏠 **נדל\"ן יוקרה:**\n• הדגש ROI ברור בשקלים/אירו/דולר\n• הצג השוואה לשוק הצרפתי/אמריקאי\n• הכן מצגת עם תמונות + פרויקציה 5 שנים\n• ודא תרגום חוזה מלא לצרפתית/אנגלית";
    if (low.includes("הצעת מחיר") || low.includes("תמחור"))
      return "📝 **הצעת מחיר מקצועית:**\n• פרט כל פריט (חומר + עבודה + פסולת)\n• הוסף מע\"מ בנפרד\n• ציין זמן אספקה + תנאי תשלום\n• כלול אחריות + תנאים מיוחדים\n• חתום + חותמת חברה";
    return "🤖 **עוזר קובי:**\nאני כאן לעזור! שאל אותי על פרויקטים, כספים, עובדים, נדל\"ן, ניהול — הכל.\nחיבור ל-AI מלא פעיל כשהשרת מחובר.";
  }

  const theme = {
    bg: "#0b0d10", panel: "#13171c", panel2: "#1a2028",
    border: "#2a3340", text: "#e6edf3", textDim: "#8b96a5",
    accent: "#4a9eff", gold: "#f0b429",
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: theme.bg, color: theme.text, fontFamily: "Heebo, sans-serif", direction: "rtl" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${theme.border}`, background: theme.panel, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg, ${theme.gold}, #e67e22)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
          👑
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>עוזר קובי</div>
          <div style={{ fontSize: 12, color: theme.textDim }}>עוזר AI אישי • קובי אלקיים • מנכ"ל</div>
        </div>
        <div style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3fb950" }} />
          <span style={{ fontSize: 11, color: "#3fb950" }}>פעיל</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${theme.border}`, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => sendMessage(a.prompt)}
            disabled={loading}
            style={{
              background: theme.panel2, color: theme.text, border: `1px solid ${theme.border}`,
              borderRadius: 16, padding: "4px 10px", fontSize: 11, cursor: "pointer",
              whiteSpace: "nowrap", transition: "all 0.15s",
            }}
            onMouseOver={e => (e.currentTarget.style.borderColor = theme.gold)}
            onMouseOut={e => (e.currentTarget.style.borderColor = theme.border)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: m.role === "user" ? "row-reverse" : "row", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.role === "user" ? `linear-gradient(135deg, ${theme.gold}, #e67e22)` : `linear-gradient(135deg, #4a9eff, #6366f1)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
              {m.role === "user" ? "👑" : "🤖"}
            </div>
            <div style={{
              maxWidth: "72%", padding: "10px 14px", borderRadius: m.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
              background: m.role === "user" ? `rgba(240,180,41,0.12)` : theme.panel2,
              border: `1px solid ${m.role === "user" ? "rgba(240,180,41,0.3)" : theme.border}`,
              fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap",
            }}>
              {m.content}
              <div style={{ fontSize: 10, color: theme.textDim, marginTop: 4 }}>
                {m.ts.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #4a9eff, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🤖</div>
            <div style={{ padding: "10px 14px", background: theme.panel2, borderRadius: "4px 16px 16px 16px", border: `1px solid ${theme.border}` }}>
              <span style={{ color: theme.textDim, fontSize: 13 }}>חושב...</span>
              <span style={{ animation: "blink 1s infinite" }}>●●●</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: "12px 16px", borderTop: `1px solid ${theme.border}`, background: theme.panel, display: "flex", gap: 10 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder="שאל אותי כל שאלה עסקית, פיננסית, ניהולית..."
          disabled={loading}
          style={{
            flex: 1, background: theme.panel2, color: theme.text, border: `1px solid ${theme.border}`,
            borderRadius: 8, padding: "10px 14px", fontSize: 14, fontFamily: "inherit", outline: "none",
          }}
        />
        <button
          onClick={() => sendMessage()}
          disabled={loading || !input.trim()}
          style={{
            background: loading || !input.trim() ? theme.panel2 : `linear-gradient(135deg, ${theme.gold}, #e67e22)`,
            color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
            fontSize: 14, cursor: loading || !input.trim() ? "not-allowed" : "pointer", fontWeight: 700,
            transition: "all 0.15s",
          }}
        >
          שלח ➤
        </button>
      </div>
    </div>
  );
}
