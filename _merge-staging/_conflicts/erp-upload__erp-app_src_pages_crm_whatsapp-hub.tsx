import { useState, useEffect, useRef } from "react";
import {
  MessageSquare, Send, Search, Bot, User, Settings, Filter,
  Phone, Clock, CheckCheck, AlertTriangle, BarChart3, RefreshCw,
  Zap, FileText, PlusCircle, Trash2, Edit2, Save, X, ChevronDown
} from "lucide-react";
import { authFetch } from "@/lib/utils";

interface Conversation {
  id: number;
  phone_number: string;
  customer_name: string;
  agent_type: string;
  current_intent: string;
  status: string;
  messages_count: number;
  last_message_at: string;
  last_message?: string;
}

interface Message {
  id: number;
  conversation_id: number;
  direction: string;
  sender_type: string;
  content: string;
  message_type: string;
  ai_intent_detected?: string;
  ai_confidence?: number;
  created_at: string;
}

interface Template {
  id: number;
  template_name: string;
  category: string;
  content: string;
  variables: any[];
  language: string;
  status: string;
}

interface AiConfig {
  id: number;
  agent_type: string;
  system_prompt: string;
  enabled: boolean;
  escalation_threshold: number;
  max_messages_before_escalate: number;
  business_hours_only: boolean;
}

interface Dashboard {
  conversations_by_status: { status: string; count: number }[];
  conversations_by_agent: { agent_type: string; count: number }[];
  conversations_today: number;
  ai_resolution_rate: number;
  avg_response_seconds: number;
}

const AGENT_LABELS: Record<string, string> = {
  ai_sales: "AI מכירות", ai_service: "AI שירות", ai_measurement: "AI מדידות", ai_installation: "AI התקנות", human: "נציג אנושי",
};
const INTENT_LABELS: Record<string, string> = {
  new_lead: "ליד חדש", quote_request: "בקשת הצעה", service_request: "קריאת שירות",
  measurement_schedule: "תיאום מדידה", installation_schedule: "תיאום התקנה", general: "כללי",
};
const STATUS_LABELS: Record<string, string> = { active: "פעילה", waiting: "ממתינה", resolved: "טופלה", escalated: "הועברה" };
const STATUS_COLORS: Record<string, string> = { active: "bg-green-100 text-green-800", waiting: "bg-yellow-100 text-yellow-800", resolved: "bg-blue-100 text-blue-800", escalated: "bg-red-100 text-red-800" };
const TEMPLATE_CATS: Record<string, string> = { welcome: "ברכה", followup: "מעקב", measurement_confirm: "אישור מדידה", installation_confirm: "אישור התקנה", payment_reminder: "תזכורת תשלום", feedback: "משוב", marketing: "שיווק" };

export default function WhatsAppHubPage() {
  const [tab, setTab] = useState<"inbox" | "templates" | "ai_config" | "dashboard">("inbox");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [newMsg, setNewMsg] = useState("");
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [loading, setLoading] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Template | null>(null);
  const [editConfig, setEditConfig] = useState<AiConfig | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const token = localStorage.getItem("erp_token") || "";

  useEffect(() => { loadConversations(); }, [filterStatus, filterAgent]);
  useEffect(() => { if (tab === "templates") loadTemplates(); }, [tab]);
  useEffect(() => { if (tab === "ai_config") loadConfigs(); }, [tab]);
  useEffect(() => { if (tab === "dashboard") loadDashboard(); }, [tab]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function loadConversations() {
    setLoading(true);
    try {
      let url = `/api/whatsapp/conversations?token=${token}`;
      if (filterStatus) url += `&status=${filterStatus}`;
      if (filterAgent) url += `&agent_type=${filterAgent}`;
      const r = await authFetch(url); const d = await r.json();
      setConversations(d.conversations || []);
    } catch { setConversations([]); }
    setLoading(false);
  }

  async function loadMessages(conv: Conversation) {
    setSelectedConv(conv);
    try {
      const r = await authFetch(`/api/whatsapp/conversations/${conv.id}/messages?token=${token}`);
      const d = await r.json(); setMessages(d.messages || []);
    } catch { setMessages([]); }
  }

  async function sendMessage() {
    if (!newMsg.trim() || !selectedConv) return;
    try {
      await authFetch(`/api/whatsapp/send?token=${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: selectedConv.id, content: newMsg }),
      });
      setNewMsg(""); loadMessages(selectedConv);
    } catch {}
  }

  async function triggerAI() {
    if (!selectedConv) return;
    try {
      const r = await authFetch(`/api/whatsapp/ai/process-message?token=${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: selectedConv.id }),
      });
      await r.json(); loadMessages(selectedConv); loadConversations();
    } catch {}
  }

  async function loadTemplates() {
    try { const r = await authFetch(`/api/whatsapp/templates?token=${token}`); const d = await r.json(); setTemplates(d.templates || []); } catch {}
  }
  async function saveTemplate(t: Template) {
    try {
      const method = t.id ? "PUT" : "POST";
      const url = t.id ? `/api/whatsapp/templates/${t.id}?token=${token}` : `/api/whatsapp/templates?token=${token}`;
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) });
      setEditTemplate(null); loadTemplates();
    } catch {}
  }
  async function deleteTemplate(id: number) {
    try { await authFetch(`/api/whatsapp/templates/${id}?token=${token}`, { method: "DELETE" }); loadTemplates(); } catch {}
  }

  async function loadConfigs() {
    try { const r = await authFetch(`/api/whatsapp/ai-config?token=${token}`); const d = await r.json(); setConfigs(d.configs || []); } catch {}
  }
  async function saveConfig(c: AiConfig) {
    try {
      const method = c.id ? "PUT" : "POST";
      const url = c.id ? `/api/whatsapp/ai-config/${c.id}?token=${token}` : `/api/whatsapp/ai-config?token=${token}`;
      await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(c) });
      setEditConfig(null); loadConfigs();
    } catch {}
  }

  async function loadDashboard() {
    try { const r = await authFetch(`/api/whatsapp/dashboard?token=${token}`); const d = await r.json(); setDashboard(d); } catch {}
  }

  const filtered = conversations.filter(c =>
    !search || (c.customer_name || "").includes(search) || c.phone_number.includes(search)
  );

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="p-4 bg-white border-b shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-7 h-7 text-green-600" />
            <h1 className="text-2xl font-bold text-gray-800">מרכז וואטסאפ ביזנס + AI</h1>
          </div>
          <div className="flex gap-2">
            {(["inbox", "templates", "ai_config", "dashboard"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>
                {t === "inbox" ? "תיבת שיחות" : t === "templates" ? "תבניות" : t === "ai_config" ? "הגדרות AI" : "דשבורד"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "inbox" && (
        <div className="flex h-[calc(100vh-80px)]">
          {/* Conversations list */}
          <div className="w-96 bg-white border-l overflow-y-auto">
            <div className="p-3 border-b space-y-2">
              <div className="relative">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
                  className="w-full pr-9 pl-3 py-2 border rounded-lg text-sm" />
              </div>
              <div className="flex gap-2">
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="flex-1 text-xs border rounded px-2 py-1">
                  <option value="">כל הסטטוסים</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)} className="flex-1 text-xs border rounded px-2 py-1">
                  <option value="">כל הנציגים</option>
                  {Object.entries(AGENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            {loading && <div className="p-4 text-center text-gray-400">טוען...</div>}
            {filtered.map(c => (
              <div key={c.id} onClick={() => loadMessages(c)}
                className={`p-3 border-b cursor-pointer hover:bg-green-50 transition ${selectedConv?.id === c.id ? "bg-green-50 border-r-4 border-r-green-500" : ""}`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{c.customer_name || c.phone_number}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status] || "bg-gray-100"}`}>
                    {STATUS_LABELS[c.status] || c.status}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500">{AGENT_LABELS[c.agent_type] || c.agent_type}</span>
                  <span className="text-xs text-gray-400">{c.messages_count} הודעות</span>
                </div>
                {c.last_message && <p className="text-xs text-gray-600 mt-1 truncate">{c.last_message}</p>}
              </div>
            ))}
          </div>

          {/* Chat view */}
          <div className="flex-1 flex flex-col">
            {selectedConv ? (
              <>
                <div className="p-3 bg-white border-b flex items-center justify-between">
                  <div>
                    <h3 className="font-bold">{selectedConv.customer_name || selectedConv.phone_number}</h3>
                    <div className="flex gap-2 text-xs text-gray-500">
                      <span>{INTENT_LABELS[selectedConv.current_intent] || selectedConv.current_intent}</span>
                      <span>|</span>
                      <span>{AGENT_LABELS[selectedConv.agent_type] || selectedConv.agent_type}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={triggerAI} className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700">
                      <Bot className="w-4 h-4" /> עיבוד AI
                    </button>
                    <button onClick={() => loadMessages(selectedConv)} className="p-1.5 bg-gray-100 rounded-lg hover:bg-gray-200">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-100">
                  {messages.map(m => (
                    <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-md px-4 py-2 rounded-2xl text-sm ${
                        m.direction === "inbound"
                          ? "bg-green-200 text-gray-900 rounded-tr-none"
                          : m.sender_type === "ai"
                            ? "bg-purple-100 text-gray-900 rounded-tl-none"
                            : "bg-white text-gray-900 rounded-tl-none"
                      }`}>
                        <div className="flex items-center gap-1 mb-1">
                          {m.sender_type === "ai" && <Bot className="w-3 h-3 text-purple-600" />}
                          {m.sender_type === "agent" && <User className="w-3 h-3 text-blue-600" />}
                          <span className="text-xs font-medium text-gray-500">
                            {m.sender_type === "customer" ? "לקוח" : m.sender_type === "ai" ? "AI" : "נציג"}
                          </span>
                        </div>
                        <p>{m.content}</p>
                        {m.ai_intent_detected && (
                          <div className="mt-1 text-xs text-purple-600">
                            זיהוי: {INTENT_LABELS[m.ai_intent_detected] || m.ai_intent_detected} ({Math.round((m.ai_confidence || 0) * 100)}%)
                          </div>
                        )}
                        <div className="text-xs text-gray-400 mt-1 text-left">{new Date(m.created_at).toLocaleTimeString("he-IL")}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-3 bg-white border-t flex gap-2">
                  <input value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()}
                    placeholder="הקלד הודעה..." className="flex-1 border rounded-lg px-4 py-2 text-sm" />
                  <button onClick={sendMessage} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <MessageSquare className="w-16 h-16 mx-auto mb-3 opacity-30" />
                  <p>בחר שיחה מהרשימה</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "templates" && (
        <div className="p-6 max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">תבניות הודעות</h2>
            <button onClick={() => setEditTemplate({ id: 0, template_name: "", category: "welcome", content: "", variables: [], language: "he", status: "draft" })}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
              <PlusCircle className="w-4 h-4" /> תבנית חדשה
            </button>
          </div>
          {editTemplate && (
            <div className="bg-white p-4 rounded-xl shadow mb-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <input value={editTemplate.template_name} onChange={e => setEditTemplate({ ...editTemplate, template_name: e.target.value })}
                  placeholder="שם תבנית" className="border rounded px-3 py-2 text-sm" />
                <select value={editTemplate.category} onChange={e => setEditTemplate({ ...editTemplate, category: e.target.value })} className="border rounded px-3 py-2 text-sm">
                  {Object.entries(TEMPLATE_CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={editTemplate.status} onChange={e => setEditTemplate({ ...editTemplate, status: e.target.value })} className="border rounded px-3 py-2 text-sm">
                  <option value="draft">טיוטה</option><option value="approved">מאושר</option><option value="active">פעיל</option>
                </select>
              </div>
              <textarea value={editTemplate.content} onChange={e => setEditTemplate({ ...editTemplate, content: e.target.value })}
                placeholder="תוכן ההודעה... השתמש ב-{{שם_משתנה}} למשתנים" className="w-full border rounded px-3 py-2 text-sm h-24" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditTemplate(null)} className="px-3 py-1.5 bg-gray-100 rounded text-sm"><X className="w-4 h-4" /></button>
                <button onClick={() => saveTemplate(editTemplate)} className="flex items-center gap-1 px-4 py-1.5 bg-green-600 text-white rounded text-sm"><Save className="w-4 h-4" /> שמור</button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="bg-white p-4 rounded-xl shadow-sm flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-green-600" />
                    <span className="font-semibold text-sm">{t.template_name}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">{TEMPLATE_CATS[t.category] || t.category}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100"}`}>{t.status}</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{t.content}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditTemplate(t)} className="p-1.5 hover:bg-gray-100 rounded"><Edit2 className="w-4 h-4 text-gray-500" /></button>
                  <button onClick={() => deleteTemplate(t.id)} className="p-1.5 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "ai_config" && (
        <div className="p-6 max-w-4xl mx-auto">
          <h2 className="text-xl font-bold mb-4">הגדרות סוכני AI</h2>
          {editConfig && (
            <div className="bg-white p-4 rounded-xl shadow mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <select value={editConfig.agent_type} onChange={e => setEditConfig({ ...editConfig, agent_type: e.target.value })} className="border rounded px-3 py-2 text-sm">
                  {Object.entries(AGENT_LABELS).filter(([k]) => k !== "human").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={editConfig.enabled} onChange={e => setEditConfig({ ...editConfig, enabled: e.target.checked })} />
                  <span className="text-sm">מופעל</span>
                </label>
              </div>
              <textarea value={editConfig.system_prompt} onChange={e => setEditConfig({ ...editConfig, system_prompt: e.target.value })}
                placeholder="System prompt..." className="w-full border rounded px-3 py-2 text-sm h-32" />
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-gray-500">סף הסלמה</label>
                  <input type="number" step="0.1" min="0" max="1" value={editConfig.escalation_threshold}
                    onChange={e => setEditConfig({ ...editConfig, escalation_threshold: parseFloat(e.target.value) })} className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-gray-500">מקס הודעות לפני הסלמה</label>
                  <input type="number" min="1" value={editConfig.max_messages_before_escalate}
                    onChange={e => setEditConfig({ ...editConfig, max_messages_before_escalate: parseInt(e.target.value) })} className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <label className="flex items-center gap-2 mt-4">
                  <input type="checkbox" checked={editConfig.business_hours_only} onChange={e => setEditConfig({ ...editConfig, business_hours_only: e.target.checked })} />
                  <span className="text-sm">שעות פעילות בלבד</span>
                </label>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditConfig(null)} className="px-3 py-1.5 bg-gray-100 rounded text-sm">ביטול</button>
                <button onClick={() => saveConfig(editConfig)} className="px-4 py-1.5 bg-purple-600 text-white rounded text-sm">שמור</button>
              </div>
            </div>
          )}
          {!editConfig && (
            <button onClick={() => setEditConfig({ id: 0, agent_type: "ai_sales", system_prompt: "", enabled: true, escalation_threshold: 0.3, max_messages_before_escalate: 10, business_hours_only: false })}
              className="mb-4 flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm">
              <PlusCircle className="w-4 h-4" /> הוסף סוכן
            </button>
          )}
          <div className="space-y-3">
            {configs.map(c => (
              <div key={c.id} className="bg-white p-4 rounded-xl shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Bot className="w-5 h-5 text-purple-600" />
                    <span className="font-semibold">{AGENT_LABELS[c.agent_type] || c.agent_type}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${c.enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {c.enabled ? "פעיל" : "מושבת"}
                    </span>
                  </div>
                  <button onClick={() => setEditConfig(c)} className="p-1.5 hover:bg-gray-100 rounded"><Settings className="w-4 h-4" /></button>
                </div>
                <p className="text-sm text-gray-600 mt-2 truncate">{c.system_prompt || "—"}</p>
                <div className="flex gap-4 mt-2 text-xs text-gray-500">
                  <span>סף: {c.escalation_threshold}</span>
                  <span>מקס: {c.max_messages_before_escalate} הודעות</span>
                  <span>{c.business_hours_only ? "שעות פעילות" : "24/7"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "dashboard" && dashboard && (
        <div className="p-6 max-w-5xl mx-auto">
          <h2 className="text-xl font-bold mb-4">דשבורד וואטסאפ</h2>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
              <MessageSquare className="w-6 h-6 mx-auto text-green-600 mb-1" />
              <div className="text-2xl font-bold">{dashboard.conversations_today}</div>
              <div className="text-xs text-gray-500">שיחות היום</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
              <Bot className="w-6 h-6 mx-auto text-purple-600 mb-1" />
              <div className="text-2xl font-bold">{dashboard.ai_resolution_rate}%</div>
              <div className="text-xs text-gray-500">פתירה ע"י AI</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
              <Clock className="w-6 h-6 mx-auto text-blue-600 mb-1" />
              <div className="text-2xl font-bold">{dashboard.avg_response_seconds}s</div>
              <div className="text-xs text-gray-500">זמן תגובה ממוצע</div>
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm text-center">
              <AlertTriangle className="w-6 h-6 mx-auto text-orange-600 mb-1" />
              <div className="text-2xl font-bold">
                {(dashboard.conversations_by_status.find(s => s.status === "escalated")?.count) || 0}
              </div>
              <div className="text-xs text-gray-500">הסלמות</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-xl shadow-sm">
              <h3 className="font-bold mb-3">לפי סטטוס</h3>
              {dashboard.conversations_by_status.map(s => (
                <div key={s.status} className="flex items-center justify-between py-1">
                  <span className={`text-sm px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status] || "bg-gray-100"}`}>{STATUS_LABELS[s.status] || s.status}</span>
                  <span className="font-semibold">{s.count}</span>
                </div>
              ))}
            </div>
            <div className="bg-white p-4 rounded-xl shadow-sm">
              <h3 className="font-bold mb-3">לפי סוכן</h3>
              {dashboard.conversations_by_agent.map(a => (
                <div key={a.agent_type} className="flex items-center justify-between py-1">
                  <span className="text-sm">{AGENT_LABELS[a.agent_type] || a.agent_type}</span>
                  <span className="font-semibold">{a.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
