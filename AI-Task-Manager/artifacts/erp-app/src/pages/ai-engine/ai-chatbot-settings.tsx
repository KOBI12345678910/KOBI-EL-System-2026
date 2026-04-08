import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { authFetch } from "@/lib/utils";
import {
  Bot, MessageSquare, Settings, Zap, CheckCircle2, Clock, User,
  Send, Phone, Globe, Bell, Save, ToggleLeft, ToggleRight, Trash2, Plus
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || document.cookie.match(/token=([^;]+)/)?.[1] || "";
const headers = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${token()}` });

const DEFAULT_AUTO_RESPONSES = [
  { id: 1, trigger: "מחיר / עלות / כמה עולה", response: "נשמח לספק הצעת מחיר מפורטת. אנא שלח מידות ופרטי הפרויקט ונציג שלנו יחזור אליך.", active: true },
  { id: 2, trigger: "זמן אספקה / מתי מוכן", response: "זמן אספקה רגיל הוא 3-4 שבועות מרגע אישור ההזמנה. לפרויקטים גדולים יש לתאם מראש.", active: true },
  { id: 3, trigger: "שעות פעילות / פתוח / עובדים", response: "טכנו-כל עוזי פתוחים א-ה 7:00-17:00, שישי 7:00-12:00. מפעל הייצור פעיל במשמרות.", active: true },
  { id: 4, trigger: "ביטול / החזרה / תלונה", response: "לגבי ביטול, החזרה או תלונה, אנא פנה ישירות למנהל שירות הלקוחות בטלפון 03-XXXXXXX.", active: true },
  { id: 5, trigger: "אלומיניום / חלונות / דלתות", response: "אנחנו מייצרים מגוון מוצרי אלומיניום: חלונות, דלתות, ויטרינות, חזיתות ותריסים. איזה מוצר מעניין אותך?", active: true },
  { id: 6, trigger: "פלדה / ברזל / מסגרות / מעקות", response: "המפעל שלנו מתמחה גם בעבודות פלדה: מעקות, שערים, קונסטרוקציות ומדרגות. נשמח לפרט.", active: true },
  { id: 7, trigger: "זכוכית / ויטרינה / חזית", response: "אנו מתקינים זכוכית בטיחותית, ויטרינות חנויות, חזיתות זכוכית ומחיצות. מה הפרויקט שלך?", active: true },
  { id: 8, trigger: "נירוסטה / אל-חלד / סטיינלס", response: "מחלקת הנירוסטה שלנו מייצרת ציוד למטבחים מסחריים, משטחי עבודה, מעקות ומוצרים בהתאמה אישית.", active: true },
];

export default function AIChatbotSettings() {
  const [tab, setTab] = useState<"settings" | "responses" | "log">("settings");
  const [botEnabled, setBotEnabled] = useState(true);
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);
  const [websiteEnabled, setWebsiteEnabled] = useState(true);
  const [language, setLanguage] = useState("עברית");
  const [model, setModel] = useState("GPT-4 Turbo");
  const [autoResponses, setAutoResponses] = useState(DEFAULT_AUTO_RESPONSES);
  const [newTrigger, setNewTrigger] = useState("");
  const [newResponse, setNewResponse] = useState("");
  const [saved, setSaved] = useState(false);
  const [calls, setCalls] = useState<any[]>([]);
  const [loadingCalls, setLoadingCalls] = useState(true);

  useEffect(() => {
    setLoadingCalls(true);
    authFetch(`${API}/crm/calls`, { headers: headers() })
      .then(r => r.json())
      .then(d => setCalls(d.calls || []))
      .catch(() => setCalls([]))
      .finally(() => setLoadingCalls(false));
  }, []);

  const resolvedCalls = calls.filter(c => c.result && c.result !== "לא ממשיך");
  const answeredPct = calls.length > 0 ? Math.round(resolvedCalls.length / calls.length * 100) : 0;
  const avgSentiment = calls.length > 0
    ? Math.round(calls.filter(c => c.sentiment).reduce((a: number, b: any) => a + (b.sentiment || 0), 0) / Math.max(calls.filter(c => c.sentiment).length, 1))
    : 0;

  const BOT_STATS = [
    { label: "שיחות שנרשמו", value: String(calls.length), icon: MessageSquare, color: "text-blue-400" },
    { label: "אחוז טיפול", value: `${answeredPct}%`, icon: CheckCircle2, color: "text-emerald-400" },
    { label: "ממוצע סנטימנט", value: avgSentiment > 0 ? `${avgSentiment}%` : "—", icon: User, color: "text-amber-400" },
    { label: "זמן תגובה ממוצע", value: "< 2 שנ'", icon: Clock, color: "text-violet-400" },
  ];

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggleResponse = (id: number) => {
    setAutoResponses(prev => prev.map(r => r.id === id ? { ...r, active: !r.active } : r));
  };

  const addResponse = () => {
    if (!newTrigger.trim() || !newResponse.trim()) return;
    setAutoResponses(prev => [...prev, { id: Date.now(), trigger: newTrigger, response: newResponse, active: true }]);
    setNewTrigger("");
    setNewResponse("");
  };

  const removeResponse = (id: number) => {
    setAutoResponses(prev => prev.filter(r => r.id !== id));
  };

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Bot className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">AI Chatbot Settings</h1>
            <p className="text-xs text-muted-foreground">הגדרות בוט GPT-4 Turbo, WhatsApp ואתר — טכנו-כל עוזי</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${botEnabled ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-muted/20 text-muted-foreground border border-border"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${botEnabled ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground"}`} />
            {botEnabled ? "פעיל" : "מושבת"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {BOT_STATS.map((s, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-3 text-center">
            <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
            <div className="text-xl font-bold text-foreground">{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        {[
          { id: "settings", label: "הגדרות", icon: Settings },
          { id: "responses", label: "תגובות אוטומטיות", icon: Zap },
          { id: "log", label: "לוג שיחות אחרונות", icon: MessageSquare },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id ? "bg-primary text-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "settings" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-5 space-y-5">
            <h3 className="font-semibold text-foreground text-sm">הגדרות כלליות</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-foreground font-medium">בוט AI מופעל</p>
                <p className="text-xs text-muted-foreground">הפעלה/כיבוי של כל מנוע הבוט</p>
              </div>
              <button onClick={() => setBotEnabled(!botEnabled)} className={`transition-colors ${botEnabled ? "text-emerald-400" : "text-muted-foreground"}`}>
                {botEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Phone className="w-5 h-5 text-green-400" />
                <div>
                  <p className="text-sm text-foreground font-medium">WhatsApp Business</p>
                  <p className="text-xs text-muted-foreground">תגובות אוטומטיות ב-WhatsApp</p>
                </div>
              </div>
              <button onClick={() => setWhatsappEnabled(!whatsappEnabled)} className={`transition-colors ${whatsappEnabled ? "text-emerald-400" : "text-muted-foreground"}`}>
                {whatsappEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-blue-400" />
                <div>
                  <p className="text-sm text-foreground font-medium">צ'אט באתר</p>
                  <p className="text-xs text-muted-foreground">ווידג'ט בוט בדף האינטרנט של החברה</p>
                </div>
              </div>
              <button onClick={() => setWebsiteEnabled(!websiteEnabled)} className={`transition-colors ${websiteEnabled ? "text-emerald-400" : "text-muted-foreground"}`}>
                {websiteEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
              </button>
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3 className="font-semibold text-foreground text-sm">הגדרות מודל AI</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">מודל AI</label>
                <select className="select select-bordered w-full select-sm" value={model} onChange={e => setModel(e.target.value)}>
                  <option>GPT-4 Turbo</option>
                  <option>GPT-4</option>
                  <option>GPT-3.5 Turbo</option>
                  <option>Claude 3.5 Sonnet</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">שפת תגובה</label>
                <select className="select select-bordered w-full select-sm" value={language} onChange={e => setLanguage(e.target.value)}>
                  <option>עברית</option>
                  <option>ערבית</option>
                  <option>אנגלית</option>
                  <option>רב-לשוני</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">הוראות מותאמות לבוט</label>
              <textarea
                className="textarea textarea-bordered w-full text-sm"
                rows={3}
                defaultValue="אתה נציג שירות לקוחות של חברת טכנו-כל עוזי — מפעל מתכת, אלומיניום, פלדה, זכוכית ונירוסטה. ענה בעברית תמיד. היה ידידותי ומקצועי. הפנה שאלות מחיר מורכבות לנציג אנושי. ציין שהמפעל ממוקם באזור התעשייה ומייצר בהתאמה אישית."
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              className={`btn btn-primary btn-sm flex items-center gap-2 ${saved ? "btn-success" : ""}`}
            >
              {saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {saved ? "נשמר!" : "שמור הגדרות"}
            </button>
          </div>
        </motion.div>
      )}

      {tab === "responses" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm">תגובות אוטומטיות — מותאמות למפעל מתכת/אלומיניום</h3>
            </div>
            <div className="divide-y divide-border/30">
              {autoResponses.map((r) => (
                <div key={r.id} className={`p-4 ${!r.active ? "opacity-50" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">מפעיל:</span>
                        <span className="text-sm text-foreground font-medium">{r.trigger}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{r.response}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => toggleResponse(r.id)} className={`transition-colors ${r.active ? "text-emerald-400" : "text-muted-foreground"}`}>
                        {r.active ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                      </button>
                      <button onClick={() => removeResponse(r.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
              <Plus className="w-4 h-4 text-primary" /> הוסף תגובה אוטומטית
            </h3>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">מילות מפתח מפעילות</label>
              <input
                className="input input-bordered w-full h-9 text-sm"
                placeholder="לדוגמה: התקנה / משלוח / אחריות"
                value={newTrigger}
                onChange={e => setNewTrigger(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">תגובת הבוט</label>
              <textarea
                className="textarea textarea-bordered w-full text-sm"
                rows={2}
                placeholder="הכנס תגובה אוטומטית..."
                value={newResponse}
                onChange={e => setNewResponse(e.target.value)}
              />
            </div>
            <button onClick={addResponse} className="btn btn-primary btn-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> הוסף תגובה
            </button>
          </div>
        </motion.div>
      )}

      {tab === "log" && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground text-sm">שיחות ואינטראקציות אחרונות (מתוך CRM)</h3>
            </div>
            {loadingCalls ? (
              <div className="p-12 text-center text-muted-foreground text-sm">טוען...</div>
            ) : calls.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">אין שיחות רשומות</p>
                <p className="text-xs mt-1">שיחות ואינטראקציות יופיעו כאן כאשר יירשמו במערכת</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {calls.slice(0, 10).map((call: any, i: number) => (
                  <motion.div
                    key={call.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.04 }}
                    className="p-4 hover:bg-card/[0.02]"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                          <User className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="font-medium text-foreground text-sm">{call.lead}</span>
                        {call.direction && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${call.direction === "נכנסת" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" : "bg-violet-500/10 text-violet-400 border border-violet-500/20"}`}>
                            {call.direction}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{call.date || "—"}</span>
                        {call.result
                          ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          : <Clock className="w-3.5 h-3.5 text-amber-400" />
                        }
                      </div>
                    </div>
                    <div className="space-y-1 mr-9">
                      {call.summary && (
                        <p className="text-xs text-muted-foreground">{call.summary}</p>
                      )}
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        {call.duration && <span>משך: {call.duration}</span>}
                        {call.agent && <span>נציג: {call.agent}</span>}
                        {call.result && <span>תוצאה: {call.result}</span>}
                      </div>
                      {call.keywords && (Array.isArray(call.keywords) ? call.keywords : typeof call.keywords === "string" ? call.keywords.split(",").map((s: string) => s.trim()).filter(Boolean) : []).length > 0 && (
                        <div className="flex gap-1 flex-wrap mt-1">
                          {(Array.isArray(call.keywords) ? call.keywords : typeof call.keywords === "string" ? call.keywords.split(",").map((s: string) => s.trim()).filter(Boolean) : []).map((kw: string, ki: number) => (
                            <span key={ki} className="text-[10px] px-1.5 py-0.5 rounded bg-muted/20 text-muted-foreground border border-border">{kw}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="ai-chatbot" />
        <RelatedRecords entityType="ai-chatbot" />
      </div>
    </div>
  );
}
