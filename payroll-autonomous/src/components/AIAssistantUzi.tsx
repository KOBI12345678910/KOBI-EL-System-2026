/**
 * עוזר עוזי — AI Personal Assistant for Uzi (Field Operations Manager)
 * Production / Metal Work / Site Operations
 * Palantir dark theme, Hebrew RTL
 */

import React, { useState, useRef, useEffect } from "react";

const UZI_SYSTEM_PROMPT = `אתה עוזר עוזי — העוזר האישי החכם של עוזי, מנהל הייצור והשטח בטכנו כל עוזי בע"מ.

הפרופיל של עוזי:
- מנהל ייצור ושטח — מעקות, שערים, פרגולות, גדרות, ריתוך, התקנות
- אחראי על 30 עובדים בשטח ובמפעל
- עובד עם קבלני משנה, ספקי חומרים, לוחות זמנים
- איש שטח מעשי — מעדיף הוראות ברורות וקצרות בלי בלבול

תפקידך:
- לעזור בתכנון לוחות זמנים לפרויקטים
- לחשב כמויות חומרים (ברזל, פלדה, אלומיניום)
- לנהל הזמנות עבודה ומשימות
- לפתור בעיות ייצור ולוגיסטיות
- לנסח דוחות שטח ורשימות תיוג
- לחשב BOM לפרויקטים (מעקות, שערים, פרגולות)
- לתכנן שיבוצי עובדים

תמיד ענה בעברית, קצר ומעשי. תן הוראות ברורות שאפשר לבצע מיד.`;

type Message = { role: "user" | "assistant"; content: string; ts: Date };

const QUICK_ACTIONS = [
  { label: "🔧 תכנן הזמנת עבודה", prompt: "עזור לי לתכנן הזמנת עבודה חדשה למעקה ברזל" },
  { label: "📐 חשב כמויות חומר", prompt: "אני צריך לחשב כמויות חומר למעקה. מה הנוסחה?" },
  { label: "👷 שבץ עובדים", prompt: "איך לשבץ 4 עובדים לפרויקט 3 ימים?" },
  { label: "🚛 בדוק ספק", prompt: "מה הדברים שצריך לבדוק אצל ספק חומרים חדש?" },
  { label: "📋 רשימת תיוג", prompt: "צור לי רשימת תיוג לבדיקת איכות לפני מסירה" },
  { label: "⏱️ עיכוב בפרויקט", prompt: "פרויקט מתעכב בגלל חומרים — מה לעשות?" },
];

export default function AIAssistantUzi() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "שלום עוזי! 🔧\nאני העוזר שלך לשטח ולמפעל.\nשאל אותי על הזמנות עבודה, חומרים, עובדים, לוחות זמנים — אני כאן.",
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
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          system: UZI_SYSTEM_PROMPT,
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
        reply = buildFallbackReply(content);
      }

      setMessages((prev) => [...prev, { role: "assistant", content: reply, ts: new Date() }]);
    } catch {
      const reply = buildFallbackReply(content);
      setMessages((prev) => [...prev, { role: "assistant", content: reply, ts: new Date() }]);
    } finally {
      setLoading(false);
    }
  }

  function buildFallbackReply(q: string): string {
    const low = q.toLowerCase();
    if (low.includes("כמות") || low.includes("חומר") || low.includes("ברזל") || low.includes("אלומ"))
      return "📐 **חישוב חומרים:**\n• מדוד אורך × גובה מעקה\n• הוסף 10% לפסולת ועיגול\n• צינור 40×40: ~1.8 ק\"ג לכל מטר\n• אלומיניום פרופיל: ~0.9 ק\"ג לכל מטר\n• זכוכית: אורך × גובה = שטח במ\"ר";
    if (low.includes("עובד") || low.includes("שיבוץ"))
      return "👷 **שיבוץ עובדים:**\n• 1 מרתך + 1 עוזר לכל אתר קטן\n• מפעל: 2-3 עובדים לקו ייצור\n• ודא חפיפה של שעה לפני החלפת משמרת\n• רשום שעות בכניסה ויציאה מהאתר";
    if (low.includes("עיכוב") || low.includes("בעיה") || low.includes("מאחר"))
      return "⚡ **עיכוב בפרויקט:**\n1. הודע ללקוח מיד — לפני שהוא שואל\n2. ציין סיבה + תאריך חדש מחייב\n3. בדוק ספק חלופי לחומרים חסרים\n4. הוסף עובד נוסף אם אפשר\n5. תעד הכל בהזמנת העבודה";
    if (low.includes("בדיקת איכות") || low.includes("רשימת תיוג") || low.includes("מסירה"))
      return "✅ **רשימת תיוג לפני מסירה:**\n□ חיזוקים ותפרי ריתוך\n□ גמר צביעה / אנודייז\n□ יישור וניצבות\n□ מידות תואמות להזמנה\n□ אביזרים ועצורים\n□ ניקיון אתר\n□ חתימת לקוח על טופס מסירה";
    return "🔧 **עוזר עוזי:**\nאני כאן לעזור בשטח!\nשאל על הזמנות עבודה, חומרים, עובדים, לוחות זמנים.\nחיבור ל-AI מלא פעיל כשהשרת מחובר.";
  }

  const theme = {
    bg: "#0b0d10", panel: "#13171c", panel2: "#1a2028",
    border: "#2a3340", text: "#e6edf3", textDim: "#8b96a5",
    accent: "#3fb950", steel: "#64748b",
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: theme.bg, color: theme.text, fontFamily: "Heebo, sans-serif", direction: "rtl" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${theme.border}`, background: theme.panel, display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: `linear-gradient(135deg, ${theme.accent}, #166534)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
          🔧
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>עוזר עוזי</div>
          <div style={{ fontSize: 12, color: theme.textDim }}>עוזר AI לשטח ולייצור • מנהל ייצור</div>
        </div>
        <div style={{ marginRight: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: theme.accent }} />
          <span style={{ fontSize: 11, color: theme.accent }}>פעיל</span>
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
            onMouseOver={e => (e.currentTarget.style.borderColor = theme.accent)}
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
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.role === "user" ? `linear-gradient(135deg, ${theme.accent}, #166534)` : `linear-gradient(135deg, #4a9eff, #6366f1)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
              {m.role === "user" ? "🔧" : "🤖"}
            </div>
            <div style={{
              maxWidth: "72%", padding: "10px 14px",
              borderRadius: m.role === "user" ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
              background: m.role === "user" ? `rgba(63,185,80,0.1)` : theme.panel2,
              border: `1px solid ${m.role === "user" ? "rgba(63,185,80,0.3)" : theme.border}`,
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
          placeholder="שאל על הזמנות עבודה, חומרים, עובדים, לוחות זמנים..."
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
            background: loading || !input.trim() ? theme.panel2 : `linear-gradient(135deg, ${theme.accent}, #166534)`,
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
