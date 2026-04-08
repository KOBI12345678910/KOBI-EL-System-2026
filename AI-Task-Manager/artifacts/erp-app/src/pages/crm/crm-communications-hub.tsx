import { useState, useEffect, useMemo } from "react";
import {
  MessageSquare, Mail, Phone, Zap, BarChart3, Plus, Edit, Trash2,
  CheckCircle, XCircle, Play, Search, RefreshCw, Send,
  Clock, AlertCircle, Users, ArrowRight, X, Loader2,
  Bell
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

type Tab = "rules" | "templates" | "conversations" | "analytics";

const API = "/api";
const h = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);

const TRIGGER_TYPES = [
  { value: "event", label: "אירוע לקוח" },
  { value: "inaction", label: "חוסר פעילות (Inaction)" },
];

const TRIGGER_EVENTS = [
  { value: "order_placed", label: "הזמנה נרשמה" },
  { value: "payment_received", label: "תשלום התקבל" },
  { value: "quote_sent", label: "הצעת מחיר נשלחה" },
  { value: "lead_created", label: "ליד חדש נוצר" },
  { value: "lead_converted", label: "ליד הומר ללקוח" },
  { value: "lead_lost", label: "ליד אבוד" },
  { value: "meeting_scheduled", label: "פגישה נקבעה" },
  { value: "invoice_overdue", label: "חשבונית באיחור" },
  { value: "delivery_shipped", label: "משלוח יצא" },
];

const INACTION_TYPES = [
  { value: "no_order", label: "ללא הזמנה" },
  { value: "quote_not_responded", label: "הצעת מחיר לא נענתה" },
  { value: "lead_stale", label: "ליד ללא פעילות" },
  { value: "no_contact", label: "ללא תקשורת" },
];

const ACTION_TYPES = [
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "text-green-400" },
  { value: "email", label: "אימייל", icon: Mail, color: "text-blue-400" },
  { value: "sms", label: "SMS", icon: Phone, color: "text-amber-400" },
];

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "text-green-400" },
  { value: "email", label: "אימייל", icon: Mail, color: "text-blue-400" },
  { value: "sms", label: "SMS", icon: Phone, color: "text-amber-400" },
];

const TEMPLATE_CATEGORIES = [
  "אישור הזמנה", "עדכון משלוח", "תזכורת תשלום", "הצעה מיוחדת",
  "ברכה", "מעקב", "שיווק", "כללי"
];

const DEFAULT_TEMPLATES = [
  {
    name: "ברכת ליד חדש",
    channel: "whatsapp",
    category: "ברכה",
    body_he: "שלום {{name}}! 🎉 קיבלנו את פנייתך ונחזור אליך בהקדם. צוות המכירות",
    body_en: "Hello {{name}}! 🎉 We received your inquiry and will get back to you shortly.",
    variables: ["name"],
  },
  {
    name: "אישור הזמנה",
    channel: "whatsapp",
    category: "אישור הזמנה",
    wa_template_name: "order_confirmation",
    body_he: "שלום {{name}}, הזמנתך #{{orderNumber}} על סך {{amount}} אושרה! נעדכן אותך כשהיא תישלח. תודה! 🙏",
    body_en: "Hello {{name}}, your order #{{orderNumber}} for {{amount}} has been confirmed!",
    variables: ["name", "orderNumber", "amount"],
  },
  {
    name: "תזכורת תשלום",
    channel: "whatsapp",
    category: "תזכורת תשלום",
    wa_template_name: "payment_reminder",
    body_he: "שלום {{name}}, תזכורת ידידותית — חשבונית #{{invoiceNumber}} על סך {{amount}} תפקע ב-{{dueDate}}. 💳",
    body_en: "Hello {{name}}, friendly reminder — invoice #{{invoiceNumber}} for {{amount}} is due {{dueDate}}.",
    variables: ["name", "invoiceNumber", "amount", "dueDate"],
  },
  {
    name: "עדכון משלוח",
    channel: "whatsapp",
    category: "עדכון משלוח",
    wa_template_name: "delivery_update",
    body_he: "שלום {{name}}, הזמנתך בדרך! מספר מעקב: {{trackingNumber}}. צפי הגעה: {{estimatedDate}} 🚚",
    body_en: "Hello {{name}}, your order is on the way! Tracking: {{trackingNumber}}. ETA: {{estimatedDate}} 🚚",
    variables: ["name", "trackingNumber", "estimatedDate"],
  },
  {
    name: "מעקב הצעת מחיר",
    channel: "email",
    category: "מעקב",
    subject: "מעקב — הצעת המחיר שלנו",
    body_he: "שלום {{name}},\n\nשלחנו לך הצעת מחיר לפני מספר ימים ואנחנו רוצים לוודא שקיבלת אותה.\n\nאנחנו כאן לכל שאלה!\n\nבברכה,\nצוות המכירות",
    variables: ["name"],
  },
  {
    name: "הצעה מיוחדת",
    channel: "whatsapp",
    category: "שיווק",
    wa_template_name: "promotional_offer",
    body_he: "שלום {{name}}! 🎉 יש לנו הצעה מיוחדת עבורך: {{offerDescription}}. בתוקף עד {{expiryDate}}!",
    variables: ["name", "offerDescription", "expiryDate"],
  },
];

export default function CrmCommunicationsHub() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [tab, setTab] = useState<Tab>("rules");

  const [rules, setRules] = useState<any[]>([]);
  const [rulesStats, setRulesStats] = useState<any>({});
  const [rulesLoading, setRulesLoading] = useState(true);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [ruleForm, setRuleForm] = useState<any>({});

  const [templates, setTemplates] = useState<any[]>([]);
  const [templateStats, setTemplateStats] = useState<any>({});
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [templateForm, setTemplateForm] = useState<any>({});
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateChannelFilter, setTemplateChannelFilter] = useState("all");

  const [conversations, setConversations] = useState<any[]>([]);
  const [convsLoading, setConvsLoading] = useState(true);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [convMessages, setConvMessages] = useState<any[]>([]);
  const [convMsgsLoading, setConvMsgsLoading] = useState(false);
  const [sendText, setSendText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [analytics, setAnalytics] = useState<any>({ byChannel: [], totals: {}, followupStats: {} });
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsDays, setAnalyticsDays] = useState(30);

  const [error, setError] = useState<string | null>(null);

  const loadRules = async () => {
    setRulesLoading(true);
    try {
      const [rRes, sRes] = await Promise.all([
        authFetch(`${API}/crm/followup-rules`, { headers: h() }),
        authFetch(`${API}/crm/followup-rules/stats`, { headers: h() }),
      ]);
      if (rRes.ok) setRules(await rRes.json());
      if (sRes.ok) setRulesStats(await sRes.json());
    } catch {}
    setRulesLoading(false);
  };

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const [tRes, sRes] = await Promise.all([
        authFetch(`${API}/crm/comm-templates`, { headers: h() }),
        authFetch(`${API}/crm/comm-templates/stats`, { headers: h() }),
      ]);
      if (tRes.ok) setTemplates(await tRes.json());
      if (sRes.ok) setTemplateStats(await sRes.json());
    } catch {}
    setTemplatesLoading(false);
  };

  const loadConversations = async () => {
    setConvsLoading(true);
    try {
      const res = await authFetch(`${API}/crm/whatsapp/conversations`, { headers: h() });
      if (res.ok) setConversations(await res.json());
    } catch {}
    setConvsLoading(false);
  };

  const loadConvMessages = async (conv: any) => {
    if (!conv) return;
    setConvMsgsLoading(true);
    try {
      const res = await authFetch(`${API}/crm/whatsapp/conversations/${conv.entity_type}/${conv.entity_id}`, { headers: h() });
      if (res.ok) setConvMessages(await res.json());
    } catch {}
    setConvMsgsLoading(false);
  };

  const loadAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const res = await authFetch(`${API}/crm/comm-analytics/summary?days=${analyticsDays}`, { headers: h() });
      if (res.ok) setAnalytics(await res.json());
    } catch {}
    setAnalyticsLoading(false);
  };

  // Load rules + templates eagerly so template selection works from rules tab without visiting templates tab first
  useEffect(() => { loadRules(); loadTemplates(); }, []);
  useEffect(() => { if (tab === "conversations") loadConversations(); }, [tab]);
  useEffect(() => { if (tab === "analytics") loadAnalytics(); }, [tab, analyticsDays]);

  const selectConv = (conv: any) => {
    setSelectedConv(conv);
    setConvMessages([]);
    setSendText("");
    setSendError(null);
    loadConvMessages(conv);
  };

  const sendMessage = async () => {
    if (!sendText.trim() || !selectedConv) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await authFetch(`${API}/crm/whatsapp/send`, {
        method: "POST",
        headers: h(),
        body: JSON.stringify({
          to: selectedConv.entity_phone || selectedConv.entity_inbound_phone || selectedConv.from_address || "",
          message: sendText,
          entityType: selectedConv.entity_type,
          entityId: selectedConv.entity_id,
          entityName: selectedConv.entity_name,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSendText("");
        await loadConvMessages(selectedConv);
      } else {
        setSendError(data.error || "שליחה נכשלה");
      }
    } catch {
      setSendError("שגיאת שליחה");
    }
    setSending(false);
  };

  const saveRule = async () => {
    if (!ruleForm.name?.trim()) return;
    try {
      const url = editingRule ? `${API}/crm/followup-rules/${editingRule.id}` : `${API}/crm/followup-rules`;
      const method = editingRule ? "PUT" : "POST";
      const res = await authFetch(url, { method, headers: h(), body: JSON.stringify(ruleForm) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setShowRuleForm(false);
      setEditingRule(null);
      setRuleForm({});
      loadRules();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleRule = async (id: number) => {
    try {
      await authFetch(`${API}/crm/followup-rules/${id}/toggle`, { method: "POST", headers: h() });
      loadRules();
    } catch {}
  };

  const deleteRule = async (id: number) => {
    if (!await globalConfirm("למחוק כלל מעקב זה?")) return;
    try {
      await authFetch(`${API}/crm/followup-rules/${id}`, { method: "DELETE", headers: h() });
      loadRules();
    } catch {}
  };

  const saveTemplate = async () => {
    if (!templateForm.name?.trim() || !templateForm.bodyHe?.trim()) return;
    try {
      const url = editingTemplate ? `${API}/crm/comm-templates/${editingTemplate.id}` : `${API}/crm/comm-templates`;
      const method = editingTemplate ? "PUT" : "POST";
      const vars = (templateForm.bodyHe || "").match(/\{\{(\w+)\}\}/g)?.map((v: string) => v.replace(/\{\{|\}\}/g, "")) || [];
      const res = await authFetch(url, { method, headers: h(), body: JSON.stringify({ ...templateForm, variables: vars }) });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setShowTemplateForm(false);
      setEditingTemplate(null);
      setTemplateForm({});
      loadTemplates();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteTemplate = async (id: number) => {
    if (!await globalConfirm("למחוק תבנית זו?")) return;
    try {
      await authFetch(`${API}/crm/comm-templates/${id}`, { method: "DELETE", headers: h() });
      loadTemplates();
    } catch {}
  };

  const seedDefaultTemplates = async () => {
    for (const t of DEFAULT_TEMPLATES) {
      try {
        await authFetch(`${API}/crm/comm-templates`, { method: "POST", headers: h(), body: JSON.stringify({ ...t, bodyHe: t.body_he, bodyEn: t.body_en }) });
      } catch {}
    }
    loadTemplates();
  };

  const filteredTemplates = useMemo(() => templates.filter(t => {
    if (templateChannelFilter !== "all" && t.channel !== templateChannelFilter) return false;
    if (templateSearch && !`${t.name} ${t.category} ${t.body_he}`.toLowerCase().includes(templateSearch.toLowerCase())) return false;
    return true;
  }), [templates, templateSearch, templateChannelFilter]);

  const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: "rules", label: "כללי מעקב", icon: Zap },
    { key: "templates", label: "תבניות הודעה", icon: MessageSquare },
    { key: "conversations", label: "שיחות WhatsApp", icon: Phone },
    { key: "analytics", label: "אנליטיקס תקשורת", icon: BarChart3 },
  ];

  const inp = "input input-bordered w-full input-sm text-sm";
  const sel = "select select-bordered w-full select-sm text-sm";

  return (
    <div className="p-4 sm:p-6 space-y-4" dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">מרכז תקשורת CRM</h1>
          <p className="text-sm text-muted-foreground">WhatsApp, אימייל ו-SMS — מעקב, תבניות ואנליטיקס</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-400 flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4 text-red-400" /></button>
        </div>
      )}

      <div className="flex gap-1 flex-wrap border-b border-border pb-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-t-lg transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
          >
            <t.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* RULES TAB */}
      {tab === "rules" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "סה\"כ כללים", value: fmt(Number(rulesStats.total || 0)), icon: Zap, color: "text-blue-400" },
              { label: "פעילים", value: fmt(Number(rulesStats.active || 0)), icon: CheckCircle, color: "text-green-400" },
              { label: "טריגר אירוע", value: fmt(Number(rulesStats.event_triggers || 0)), icon: Bell, color: "text-purple-400" },
              { label: "טריגר חוסר פעילות", value: fmt(Number(rulesStats.inaction_triggers || 0)), icon: Clock, color: "text-amber-400" },
            ].map((s, i) => (
              <div key={i} className="bg-card border rounded-lg p-3 text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
                <div className="text-lg font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button onClick={() => { setEditingRule(null); setRuleForm({ triggerType: "event", actionType: "whatsapp", triggerEntity: "lead", delayHours: 0, priority: 0, isActive: true }); setShowRuleForm(true); }} className="btn btn-primary btn-sm flex items-center gap-1">
              <Plus className="w-4 h-4" />כלל חדש
            </button>
          </div>

          {rulesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : rules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg">
              <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">אין כללי מעקב מוגדרים</p>
              <p className="text-sm mt-1">צור כלל ראשון כדי להפעיל מעקב אוטומטי</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map(rule => {
                const ActionIcon = ACTION_TYPES.find(a => a.value === rule.action_type)?.icon || MessageSquare;
                const actionColor = ACTION_TYPES.find(a => a.value === rule.action_type)?.color || "text-muted-foreground";
                return (
                  <div key={rule.id} className={`border rounded-lg p-4 ${rule.is_active ? "bg-card" : "bg-muted/10 opacity-70"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <ActionIcon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${actionColor}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{rule.name}</span>
                            <span className={`px-1.5 py-0.5 rounded text-xs ${rule.is_active ? "bg-green-500/20 text-green-400" : "bg-muted/20 text-muted-foreground"}`}>
                              {rule.is_active ? "פעיל" : "מושהה"}
                            </span>
                          </div>
                          {rule.description && <p className="text-sm text-muted-foreground mt-0.5">{rule.description}</p>}
                          <div className="flex gap-3 mt-2 flex-wrap text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <ArrowRight className="w-3 h-3" />
                              {rule.trigger_type === "event"
                                ? `אירוע: ${TRIGGER_EVENTS.find(e => e.value === rule.trigger_event)?.label || rule.trigger_event}`
                                : `חוסר פעילות: ${rule.inaction_days} ימים`}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {rule.delay_hours === 0 ? "מיידי" : `עיכוב: ${rule.delay_hours} שעות`}
                            </span>
                            <span className="flex items-center gap-1">
                              <Send className="w-3 h-3" />
                              {ACTION_TYPES.find(a => a.value === rule.action_type)?.label}
                            </span>
                            {rule.run_count > 0 && (
                              <span className="flex items-center gap-1">
                                <Play className="w-3 h-3" />
                                {fmt(rule.run_count)} הפעלות
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => toggleRule(rule.id)} className={`btn btn-xs ${rule.is_active ? "btn-ghost text-amber-400" : "btn-ghost text-green-400"}`} title={rule.is_active ? "השהה" : "הפעל"}>
                          {rule.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                        <button onClick={() => { setEditingRule(rule); setRuleForm({ name: rule.name, description: rule.description, triggerType: rule.trigger_type, triggerEvent: rule.trigger_event, triggerEntity: rule.trigger_entity, inactionDays: rule.inaction_days, delayHours: rule.delay_hours, actionType: rule.action_type, templateId: rule.template_id, customMessage: rule.custom_message, priority: rule.priority, isActive: rule.is_active }); setShowRuleForm(true); }} className="btn btn-ghost btn-xs">
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => deleteRule(rule.id)} className="btn btn-ghost btn-xs text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TEMPLATES TAB */}
      {tab === "templates" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "סה\"כ תבניות", value: fmt(Number(templateStats.total || 0)), icon: MessageSquare, color: "text-blue-400" },
              { label: "WhatsApp", value: fmt(Number(templateStats.whatsapp || 0)), icon: MessageSquare, color: "text-green-400" },
              { label: "אימייל", value: fmt(Number(templateStats.email || 0)), icon: Mail, color: "text-blue-400" },
              { label: "מאושרות Meta", value: fmt(Number(templateStats.meta_approved || 0)), icon: CheckCircle, color: "text-emerald-400" },
            ].map((s, i) => (
              <div key={i} className="bg-card border rounded-lg p-3 text-center">
                <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
                <div className="text-lg font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 items-center justify-between">
            <div className="flex gap-2 flex-1 flex-wrap">
              <div className="relative">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <input className={`${inp} pr-9 w-48`} placeholder="חיפוש תבנית..." value={templateSearch} onChange={e => setTemplateSearch(e.target.value)} />
              </div>
              <select className={`${sel} w-36`} value={templateChannelFilter} onChange={e => setTemplateChannelFilter(e.target.value)}>
                <option value="all">כל הערוצים</option>
                {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              {templates.length === 0 && (
                <button onClick={seedDefaultTemplates} className="btn btn-outline btn-sm flex items-center gap-1">
                  <Plus className="w-4 h-4" />הוסף תבניות ברירת מחדל
                </button>
              )}
              <button onClick={() => { setEditingTemplate(null); setTemplateForm({ channel: "whatsapp", isActive: true, waLanguage: "he" }); setShowTemplateForm(true); }} className="btn btn-primary btn-sm flex items-center gap-1">
                <Plus className="w-4 h-4" />תבנית חדשה
              </button>
            </div>
          </div>

          {templatesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border rounded-lg">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">אין תבניות</p>
              <p className="text-sm mt-1">צור תבנית חדשה או הוסף תבניות ברירת מחדל</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredTemplates.map(tmpl => {
                const ChIcon = CHANNELS.find(c => c.value === tmpl.channel)?.icon || MessageSquare;
                const chColor = CHANNELS.find(c => c.value === tmpl.channel)?.color || "text-muted-foreground";
                return (
                  <div key={tmpl.id} className="border rounded-lg p-4 bg-card flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <ChIcon className={`w-4 h-4 ${chColor}`} />
                        <span className="font-medium text-sm">{tmpl.name}</span>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditingTemplate(tmpl); setTemplateForm({ name: tmpl.name, channel: tmpl.channel, category: tmpl.category, subject: tmpl.subject, bodyHe: tmpl.body_he, bodyEn: tmpl.body_en, isActive: tmpl.is_active, waTemplateName: tmpl.wa_template_name, waLanguage: tmpl.wa_language, metaApproved: tmpl.meta_approved }); setShowTemplateForm(true); }} className="btn btn-ghost btn-xs"><Edit className="w-3 h-3" /></button>
                        <button onClick={() => deleteTemplate(tmpl.id)} className="btn btn-ghost btn-xs text-red-400"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                    {tmpl.category && <span className="px-1.5 py-0.5 rounded text-xs bg-muted/30 text-muted-foreground w-fit">{tmpl.category}</span>}
                    <p className="text-xs text-muted-foreground line-clamp-3">{tmpl.body_he}</p>
                    <div className="flex flex-wrap gap-1">
                      {(tmpl.variables || []).map((v: string) => (
                        <span key={v} className="px-1.5 py-0.5 rounded text-xs bg-primary/10 text-primary border border-primary/20">{`{{${v}}}`}</span>
                      ))}
                    </div>
                    {tmpl.meta_approved && (
                      <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle className="w-3 h-3" />מאושר ע״י Meta</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CONVERSATIONS TAB */}
      {tab === "conversations" && (
        <div className="flex gap-4" style={{ height: "600px" }}>
          <div className="w-72 flex-shrink-0 border rounded-lg flex flex-col">
            <div className="p-3 border-b">
              <h3 className="font-medium text-sm">שיחות WhatsApp</h3>
            </div>
            <div className="flex-1 overflow-y-auto">
              {convsLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : conversations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">אין שיחות קיימות</div>
              ) : (
                conversations.map(conv => (
                  <button
                    key={`${conv.entity_type}-${conv.entity_id}`}
                    onClick={() => selectConv(conv)}
                    className={`w-full text-right p-3 border-b hover:bg-muted/30 transition-colors ${selectedConv?.entity_id === conv.entity_id ? "bg-primary/10 border-l-2 border-l-primary" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm truncate">{conv.entity_name || `#${conv.entity_id}`}</span>
                      {conv.unread_count > 0 && (
                        <span className="w-5 h-5 rounded-full bg-green-500 text-foreground text-xs flex items-center justify-center flex-shrink-0">{conv.unread_count}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{conv.last_message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground/60">{conv.entity_type === "lead" ? "ליד" : "לקוח"}</span>
                      <span className="text-xs text-muted-foreground/60">{conv.message_count} הודעות</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 border rounded-lg flex flex-col overflow-hidden">
            {!selectedConv ? (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>בחר שיחה מהרשימה</p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3 border-b flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-green-500/20 flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{selectedConv.entity_name || `#${selectedConv.entity_id}`}</p>
                    <p className="text-xs text-muted-foreground">{selectedConv.entity_type === "lead" ? "ליד" : "לקוח"} · {selectedConv.message_count} הודעות</p>
                  </div>
                  <button onClick={() => loadConvMessages(selectedConv)} className="mr-auto p-1 hover:bg-muted rounded text-muted-foreground">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-input">
                  {convMsgsLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin" /></div>
                  ) : convMessages.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">אין הודעות בשיחה זו</div>
                  ) : convMessages.map(msg => {
                    const isOut = msg.direction === "outbound";
                    return (
                      <div key={msg.id} className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${isOut ? "bg-green-700 text-foreground rounded-tr-sm" : "bg-card border border-border text-foreground rounded-tl-sm"}`}>
                          <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                          <div className={`flex items-center gap-1 mt-0.5 ${isOut ? "justify-end" : "justify-start"}`}>
                            <span className="text-xs opacity-60">{new Date(msg.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {sendError && (
                  <div className="px-3 py-1.5 bg-red-500/10 border-t border-red-500/20 text-xs text-red-400 flex justify-between">
                    <span>{sendError}</span>
                    <button onClick={() => setSendError(null)}><X className="w-3 h-3" /></button>
                  </div>
                )}

                <div className="p-3 border-t flex gap-2">
                  <textarea
                    value={sendText}
                    onChange={e => setSendText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="כתוב הודעה..."
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary"
                    rows={2}
                  />
                  <button onClick={sendMessage} disabled={!sendText.trim() || sending} className="px-3 bg-green-600 text-foreground rounded-lg hover:bg-green-700 disabled:opacity-50">
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ANALYTICS TAB */}
      {tab === "analytics" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground">תקופה:</label>
            <select className="select select-bordered select-sm" value={analyticsDays} onChange={e => setAnalyticsDays(Number(e.target.value))}>
              <option value={7}>7 ימים</option>
              <option value={30}>30 ימים</option>
              <option value={90}>90 ימים</option>
              <option value={365}>שנה</option>
            </select>
            <button onClick={loadAnalytics} className="btn btn-ghost btn-sm"><RefreshCw className="w-4 h-4" /></button>
          </div>

          {analyticsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "הודעות יוצאות", value: fmt(Number(analytics.totals.total_outbound || 0)), icon: Send, color: "text-blue-400" },
                  { label: "הודעות נכנסות", value: fmt(Number(analytics.totals.total_inbound || 0)), icon: ArrowRight, color: "text-green-400" },
                  { label: "איש קשר ייחודי", value: fmt(Number(analytics.totals.unique_contacts || 0)), icon: Users, color: "text-purple-400" },
                  { label: "סה\"כ מעקב אוטו'", value: fmt(Number(analytics.followupStats.total_executions || 0)), icon: Zap, color: "text-amber-400" },
                ].map((s, i) => (
                  <div key={i} className="bg-card border rounded-lg p-3 text-center">
                    <s.icon className={`w-5 h-5 mx-auto mb-1 ${s.color}`} />
                    <div className="text-lg font-bold">{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="table table-sm w-full">
                  <thead>
                    <tr className="bg-muted/50">
                      <th>ערוץ</th>
                      <th>נשלח</th>
                      <th>נמסר</th>
                      <th>נפתח</th>
                      <th>נכשל</th>
                      <th>תגובות</th>
                      <th>שיעור פתיחה</th>
                      <th>שיעור תגובה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.byChannel.length === 0 ? (
                      <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">אין נתונים לתקופה זו</td></tr>
                    ) : analytics.byChannel.map((row: any, i: number) => {
                      const ChIcon = CHANNELS.find(c => c.value === row.channel)?.icon || MessageSquare;
                      const chColor = CHANNELS.find(c => c.value === row.channel)?.color || "text-muted-foreground";
                      const chLabel = CHANNELS.find(c => c.value === row.channel)?.label || row.channel;
                      return (
                        <tr key={i} className="hover:bg-muted/20">
                          <td>
                            <div className="flex items-center gap-2">
                              <ChIcon className={`w-4 h-4 ${chColor}`} />
                              <span>{chLabel}</span>
                            </div>
                          </td>
                          <td>{fmt(Number(row.total_sent || 0))}</td>
                          <td>{fmt(Number(row.delivered || 0))}</td>
                          <td>{fmt(Number(row.opened || 0))}</td>
                          <td className="text-red-400">{fmt(Number(row.failed || 0))}</td>
                          <td>{fmt(Number(row.replies_received || 0))}</td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(Number(row.open_rate || 0), 100)}%` }} />
                              </div>
                              <span className="text-xs">{row.open_rate || 0}%</span>
                            </div>
                          </td>
                          <td>
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(Number(row.response_rate || 0), 100)}%` }} />
                              </div>
                              <span className="text-xs">{row.response_rate || 0}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { label: "WhatsApp", value: fmt(Number(analytics.totals.whatsapp_total || 0)), color: "bg-green-500/20 text-green-400", percent: analytics.totals.total_outbound ? Math.round(Number(analytics.totals.whatsapp_total || 0) / Number(analytics.totals.total_outbound) * 100) : 0 },
                  { label: "אימייל", value: fmt(Number(analytics.totals.email_total || 0)), color: "bg-blue-500/20 text-blue-400", percent: analytics.totals.total_outbound ? Math.round(Number(analytics.totals.email_total || 0) / Number(analytics.totals.total_outbound) * 100) : 0 },
                  { label: "SMS", value: fmt(Number(analytics.totals.sms_total || 0)), color: "bg-amber-500/20 text-amber-400", percent: analytics.totals.total_outbound ? Math.round(Number(analytics.totals.sms_total || 0) / Number(analytics.totals.total_outbound) * 100) : 0 },
                ].map((ch, i) => (
                  <div key={i} className="bg-card border rounded-lg p-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-sm">{ch.label}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${ch.color}`}>{ch.percent}% מסך הכל</span>
                    </div>
                    <div className="text-2xl font-bold">{ch.value}</div>
                    <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${ch.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Conversion Attribution per follow-up rule */}
              {analytics.conversionAttribution && analytics.conversionAttribution.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    ייחוס המרות לכללי מעקב אוטומטי
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="table table-sm w-full">
                      <thead>
                        <tr className="bg-muted/50">
                          <th>כלל</th>
                          <th>ערוץ</th>
                          <th>נשלח</th>
                          <th>המרות (לידים)</th>
                          <th>המרות (לקוחות)</th>
                          <th>סה"כ המרות</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.conversionAttribution.map((row: any, i: number) => {
                          const ChIcon = CHANNELS.find(c => c.value === row.channel)?.icon || MessageSquare;
                          const chColor = CHANNELS.find(c => c.value === row.channel)?.color || "text-muted-foreground";
                          const chLabel = CHANNELS.find(c => c.value === row.channel)?.label || row.channel;
                          const totalConv = Number(row.conversions_lead || 0) + Number(row.conversions_customer || 0);
                          return (
                            <tr key={i} className="hover:bg-muted/20">
                              <td className="font-medium text-sm">{row.rule_name}</td>
                              <td>
                                <div className="flex items-center gap-1">
                                  <ChIcon className={`w-3.5 h-3.5 ${chColor}`} />
                                  <span className="text-xs">{chLabel}</span>
                                </div>
                              </td>
                              <td>{fmt(Number(row.total_sent || 0))}</td>
                              <td className="text-green-400">{fmt(Number(row.conversions_lead || 0))}</td>
                              <td className="text-blue-400">{fmt(Number(row.conversions_customer || 0))}</td>
                              <td>
                                <span className={`font-bold ${totalConv > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                                  {fmt(totalConv)}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* RULE FORM MODAL */}
      {showRuleForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowRuleForm(false)}>
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex justify-between items-center">
              <h2 className="font-bold">{editingRule ? "ערוך כלל מעקב" : "כלל מעקב חדש"}</h2>
              <button onClick={() => setShowRuleForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">שם הכלל *</label>
                <input className={inp} value={ruleForm.name || ""} onChange={e => setRuleForm({ ...ruleForm, name: e.target.value })} placeholder="לדוגמה: מעקב ליד לא מגיב" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">תיאור</label>
                <textarea className="textarea textarea-bordered w-full text-sm" rows={2} value={ruleForm.description || ""} onChange={e => setRuleForm({ ...ruleForm, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">סוג טריגר</label>
                  <select className={sel} value={ruleForm.triggerType || "event"} onChange={e => setRuleForm({ ...ruleForm, triggerType: e.target.value })}>
                    {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">גורם</label>
                  <select className={sel} value={ruleForm.triggerEntity || "lead"} onChange={e => setRuleForm({ ...ruleForm, triggerEntity: e.target.value })}>
                    <option value="lead">ליד</option>
                    <option value="customer">לקוח</option>
                    <option value="both">שניהם</option>
                  </select>
                </div>
              </div>

              {ruleForm.triggerType === "event" ? (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">אירוע מפעיל</label>
                  <select className={sel} value={ruleForm.triggerEvent || ""} onChange={e => setRuleForm({ ...ruleForm, triggerEvent: e.target.value })}>
                    <option value="">בחר אירוע...</option>
                    {TRIGGER_EVENTS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">סוג חוסר פעילות</label>
                    <select className={sel} value={ruleForm.triggerEvent || ""} onChange={e => setRuleForm({ ...ruleForm, triggerEvent: e.target.value })}>
                      <option value="">בחר...</option>
                      {INACTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">אחרי כמה ימים</label>
                    <input type="number" className={inp} min="1" value={ruleForm.inactionDays || ""} onChange={e => setRuleForm({ ...ruleForm, inactionDays: Number(e.target.value) })} placeholder="ימים" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">פעולה</label>
                  <select className={sel} value={ruleForm.actionType || "whatsapp"} onChange={e => setRuleForm({ ...ruleForm, actionType: e.target.value })}>
                    {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">עיכוב (שעות)</label>
                  <input type="number" className={inp} min="0" value={ruleForm.delayHours || 0} onChange={e => setRuleForm({ ...ruleForm, delayHours: Number(e.target.value) })} />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">תבנית הודעה</label>
                <select className={sel} value={ruleForm.templateId || ""} onChange={e => setRuleForm({ ...ruleForm, templateId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">הודעה מותאמת</option>
                  {templates.filter(t => t.channel === ruleForm.actionType).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              {!ruleForm.templateId && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">הודעה מותאמת</label>
                  <textarea className="textarea textarea-bordered w-full text-sm" rows={3} value={ruleForm.customMessage || ""} onChange={e => setRuleForm({ ...ruleForm, customMessage: e.target.value })} placeholder="שלום {{name}}, ..." />
                  <p className="text-xs text-muted-foreground mt-1">ניתן להשתמש ב-{'{{name}}'}, {'{{amount}}'}, {'{{orderNumber}}'} וכד׳</p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={ruleForm.isActive !== false} onChange={e => setRuleForm({ ...ruleForm, isActive: e.target.checked })} className="checkbox checkbox-sm" />
                  <span className="text-sm">כלל פעיל</span>
                </label>
              </div>
            </div>
            <div className="p-5 border-t flex justify-end gap-2">
              <button onClick={() => setShowRuleForm(false)} className="btn btn-ghost btn-sm">ביטול</button>
              <button onClick={saveRule} disabled={!ruleForm.name?.trim()} className="btn btn-primary btn-sm">שמור</button>
            </div>
          </div>
        </div>
      )}

      {/* TEMPLATE FORM MODAL */}
      {showTemplateForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowTemplateForm(false)}>
          <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b flex justify-between items-center">
              <h2 className="font-bold">{editingTemplate ? "ערוך תבנית" : "תבנית חדשה"}</h2>
              <button onClick={() => setShowTemplateForm(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">שם התבנית *</label>
                  <input className={inp} value={templateForm.name || ""} onChange={e => setTemplateForm({ ...templateForm, name: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">ערוץ</label>
                  <select className={sel} value={templateForm.channel || "whatsapp"} onChange={e => setTemplateForm({ ...templateForm, channel: e.target.value })}>
                    {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">קטגוריה</label>
                  <select className={sel} value={templateForm.category || ""} onChange={e => setTemplateForm({ ...templateForm, category: e.target.value })}>
                    <option value="">ללא קטגוריה</option>
                    {TEMPLATE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {templateForm.channel === "whatsapp" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">שם תבנית WhatsApp (Meta)</label>
                    <input className={inp} value={templateForm.waTemplateName || ""} onChange={e => setTemplateForm({ ...templateForm, waTemplateName: e.target.value })} placeholder="order_confirmation" />
                  </div>
                )}
              </div>
              {(templateForm.channel === "email" || templateForm.channel === "gmail") && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">נושא האימייל</label>
                  <input className={inp} value={templateForm.subject || ""} onChange={e => setTemplateForm({ ...templateForm, subject: e.target.value })} />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">תוכן (עברית) *</label>
                <textarea className="textarea textarea-bordered w-full text-sm" rows={5} value={templateForm.bodyHe || ""} onChange={e => setTemplateForm({ ...templateForm, bodyHe: e.target.value })} placeholder="שלום {{name}}, ..." />
                <p className="text-xs text-muted-foreground mt-1">השתמש ב-{'{{name}}'}, {'{{amount}}'} וכד׳ לשדות דינמיים</p>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">תוכן (אנגלית)</label>
                <textarea className="textarea textarea-bordered w-full text-sm" rows={3} value={templateForm.bodyEn || ""} onChange={e => setTemplateForm({ ...templateForm, bodyEn: e.target.value })} placeholder="Hello {{name}}, ..." />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={templateForm.isActive !== false} onChange={e => setTemplateForm({ ...templateForm, isActive: e.target.checked })} className="checkbox checkbox-sm" />
                  <span className="text-sm">תבנית פעילה</span>
                </label>
                {templateForm.channel === "whatsapp" && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={templateForm.metaApproved === true} onChange={e => setTemplateForm({ ...templateForm, metaApproved: e.target.checked })} className="checkbox checkbox-sm" />
                    <span className="text-sm">מאושר ע״י Meta</span>
                  </label>
                )}
              </div>
            </div>
            <div className="p-5 border-t flex justify-end gap-2">
              <button onClick={() => setShowTemplateForm(false)} className="btn btn-ghost btn-sm">ביטול</button>
              <button onClick={saveTemplate} disabled={!templateForm.name?.trim() || !templateForm.bodyHe?.trim()} className="btn btn-primary btn-sm">שמור</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
