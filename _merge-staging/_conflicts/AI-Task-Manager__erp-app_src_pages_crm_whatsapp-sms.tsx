import { useState, useEffect } from "react";
import { MessageSquare, Phone, Send, Search, CheckCheck, Filter, RefreshCw, Database } from "lucide-react";
import { authFetch } from "@/lib/utils";
import RelatedRecords from "@/components/related-records";
import ActivityLog from "@/components/activity-log";
import AttachmentsSection from "@/components/attachments-section";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";

const TEMPLATES = [
  { name: "ברכת בוקר", text: "שלום [שם]! 👋 כיצד נוכל לסייע לך היום?" },
  { name: "מעקב הצעה", text: "שלום [שם], האם קיבלת את הצעת המחיר שלנו? אשמח לענות על שאלות 😊" },
  { name: "אישור פגישה", text: "שלום [שם], מאשרים פגישה ל-[תאריך] בשעה [שעה]. נשמח לראותך! 📅" },
  { name: "תזכורת תשלום", text: "שלום [שם], תזכורת ידידותית — חשבונית #[מספר] ממתינה לתשלום. 💳" },
  { name: "ליד חדש", text: "שלום! 🎉 קיבלנו את פנייתך ונחזור אליך בתוך שעה. צוות המכירות" },
];

interface Contact {
  id: number;
  name: string;
  phone: string;
  channel: "whatsapp" | "sms";
  deal?: string;
}

interface ChatMessage {
  id: number;
  from: "me" | "them";
  text: string;
  time: string;
  status: "sent" | "read";
}

interface RawLead {
  id: number;
  name?: string;
  full_name?: string;
  contact_name?: string;
  phone?: string;
  mobile?: string;
  phone_number?: string;
  deal_id?: number | string;
  [key: string]: unknown;
}

export default function WhatsAppSMSPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [filterChannel, setFilterChannel] = useState("all");
  const [detailTab, setDetailTab] = useState("details");
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const [sending, setSending] = useState(false);
  const [sentNotice, setSentNotice] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [integrationMissing, setIntegrationMissing] = useState(false);
  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const loadContacts = async () => {
    setLoadingContacts(true);
    try {
      const res = await authFetch("/api/crm/leads", { headers });
      if (res.ok) {
        const data = await res.json();
        const leads: RawLead[] = Array.isArray(data) ? data : (data?.leads || data?.data || []);
        const mapped: Contact[] = leads.map((l) => ({
          id: l.id,
          name: l.name || l.full_name || l.contact_name || "ליד",
          phone: l.phone || l.mobile || l.phone_number || "",
          channel: (l.phone || l.mobile) ? "whatsapp" as const : "sms" as const,
          deal: l.deal_id ? `עסקה #${l.deal_id}` : undefined,
        })).filter((c) => c.phone);
        setContacts(mapped);
      }
    } catch {}
    setLoadingContacts(false);
  };

  const loadMessages = async (contactId: number) => {
    setLoadingMessages(true);
    setMessages([]);
    try {
      const res = await authFetch(`/api/messaging/conversations/${contactId}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const msgs = Array.isArray(data) ? data : (data?.messages || []);
        setMessages(msgs);
        setIntegrationMissing(false);
      } else if (res.status === 404 || res.status === 501) {
        setIntegrationMissing(true);
      }
    } catch {
      setIntegrationMissing(true);
    }
    setLoadingMessages(false);
  };

  useEffect(() => { loadContacts(); }, []);

  useEffect(() => {
    if (selected) loadMessages(selected.id);
  }, [selected]);

  const filtered = contacts.filter(c => {
    if (search && !`${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterChannel !== "all" && c.channel !== filterChannel) return false;
    return true;
  });

  const sendMessage = async () => {
    if (!message.trim() || !selected) return;
    setSending(true);
    try {
      const res = await authFetch("/api/messaging/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          contactId: selected.id,
          channel: selected.channel,
          phone: selected.phone,
          message,
        }),
      });
      if (res.ok) {
        const sent: ChatMessage = {
          id: Date.now(),
          from: "me",
          text: message,
          time: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
          status: "sent",
        };
        setMessages(prev => [...prev, sent]);
        setSentNotice(`ההודעה נשלחה בהצלחה ל-${selected.name}`);
        setMessage("");
      } else {
        setSentNotice("שליחת הודעות דורשת הגדרת אינטגרציית WhatsApp/SMS. לחץ על 'אינטגרציות' בתפריט.");
        setIntegrationMissing(true);
      }
    } catch {
      setSentNotice("שליחת הודעות דורשת הגדרת אינטגרציית WhatsApp/SMS. לחץ על 'אינטגרציות' בתפריט.");
      setIntegrationMissing(true);
    } finally {
      setSending(false);
      setTimeout(() => setSentNotice(""), 6000);
    }
  };

  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    setMessage(t.text.replace("[שם]", selected?.name || ""));
    setShowTemplates(false);
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="w-6 h-6 text-green-400" />WhatsApp Business / SMS
          </h1>
          <p className="text-sm text-muted-foreground">שליחת הודעות ללידים ולקוחות מ-CRM</p>
        </div>
        <button onClick={loadContacts} className="btn btn-outline btn-sm flex items-center gap-1">
          <RefreshCw className={`w-3.5 h-3.5 ${loadingContacts ? "animate-spin" : ""}`} />
          רענן
        </button>
      </div>

      {integrationMissing && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 flex items-center gap-2 text-amber-400 text-sm">
          <Database className="w-4 h-4 shrink-0" />
          <span>
            היסטוריית הודעות ושליחה דורשים הגדרת אינטגרציית <strong>WhatsApp Business</strong> או <strong>SMS</strong>.
            גש לתפריט <strong>אינטגרציות</strong> להגדרה.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border rounded-xl overflow-hidden h-[600px]">
        <div className="border-l bg-card flex flex-col">
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <input className="input input-bordered w-full pr-9 h-9 text-sm" placeholder="חיפוש לפי שם או טלפון..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="select select-bordered select-sm w-full" value={filterChannel} onChange={e => setFilterChannel(e.target.value)}>
              <option value="all">כל הערוצים</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingContacts ? (
              <div className="flex justify-center items-center h-32">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground px-4">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">אין אנשי קשר</p>
                <p className="text-xs mt-1">הוסף לידים עם מספר טלפון במודול ה-CRM</p>
              </div>
            ) : (
              filtered.map(c => (
                <div key={c.id} onClick={() => setSelected(c)}
                  className={`flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/30 border-b transition-colors ${selected?.id === c.id ? "bg-primary/10" : ""}`}>
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary">{c.name[0]}</div>
                    <div className={`absolute -bottom-0.5 -left-0.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-foreground ${c.channel === "whatsapp" ? "bg-green-500" : "bg-blue-500"}`}>
                      {c.channel === "whatsapp" ? "W" : "S"}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium truncate">{c.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{c.phone}</div>
                    {c.deal && <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">{c.deal}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-2 flex flex-col bg-muted/10">
          {selected ? (
            <>
              <div className="flex items-center gap-3 p-4 border-b bg-card">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">{selected.name[0]}</div>
                <div>
                  <div className="font-medium">{selected.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <Phone className="w-3 h-3" />{selected.phone}
                    {selected.deal && <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">{selected.deal}</span>}
                  </div>
                </div>
                <div className="mr-auto">
                  <button onClick={() => setShowTemplates(!showTemplates)} className="btn btn-outline btn-xs flex items-center gap-1">
                    <Filter className="w-3 h-3" />תבניות
                  </button>
                </div>
              </div>

              {showTemplates && (
                <div className="bg-card border-b p-3 grid grid-cols-2 gap-1">
                  {TEMPLATES.map((t, i) => (
                    <button key={i} onClick={() => applyTemplate(t)} className="text-right text-xs px-2 py-1.5 bg-muted/50 hover:bg-muted rounded truncate">
                      {t.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMessages ? (
                  <div className="flex justify-center items-center h-32">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    {integrationMissing ? (
                      <>
                        <p className="text-sm">היסטוריית שיחות אינה זמינה</p>
                        <p className="text-xs mt-1">חבר אינטגרציית WhatsApp/SMS לצפייה בהיסטוריה</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm">אין הודעות עדיין</p>
                        <p className="text-xs mt-1">התחל שיחה על ידי שליחת הודעה</p>
                      </>
                    )}
                  </div>
                ) : (
                  messages.map(m => (
                    <div key={m.id} className={`flex ${m.from === "me" ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-xs rounded-2xl px-4 py-2 text-sm ${m.from === "me" ? "bg-green-500/20 text-green-50 rounded-tl-sm" : "bg-card border rounded-tr-sm"}`}>
                        <p>{m.text}</p>
                        <div className={`flex items-center gap-1 mt-1 text-xs ${m.from === "me" ? "text-green-400/70 justify-start" : "text-muted-foreground justify-end"}`}>
                          {m.time}
                          {m.from === "me" && <CheckCheck className="w-3 h-3" />}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 border-t bg-card">
                {sentNotice && (
                  <div className="mb-2 text-xs px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                    {sentNotice}
                  </div>
                )}
                <div className="flex gap-2">
                  <textarea
                    className="textarea textarea-bordered flex-1 text-sm resize-none h-12"
                    placeholder={`שלח הודעה ${selected.channel === "whatsapp" ? "WhatsApp" : "SMS"} ל-${selected.name}...`}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  />
                  <button onClick={sendMessage} disabled={sending || !message.trim()} className="btn btn-primary h-12 px-4 disabled:opacity-50">
                    {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">ערוץ: {selected.channel === "whatsapp" ? "WhatsApp Business" : "SMS"}</span>
                  {message.length > 0 && <span className="text-xs text-muted-foreground mr-auto">{message.length} תווים</span>}
                </div>
              </div>

              <div className="border-t">
                <div className="flex border-b border-border/50">
                  {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                    <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2 text-xs font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                  ))}
                </div>
                {detailTab === "details" && (
                  <div className="p-4 grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-xs text-muted-foreground block">שם</span><span className="font-medium">{selected.name}</span></div>
                    <div><span className="text-xs text-muted-foreground block">טלפון</span><span dir="ltr">{selected.phone}</span></div>
                    <div><span className="text-xs text-muted-foreground block">ערוץ</span><span>{selected.channel === "whatsapp" ? "WhatsApp" : "SMS"}</span></div>
                    <div><span className="text-xs text-muted-foreground block">עסקה</span><span>{selected.deal || "—"}</span></div>
                  </div>
                )}
                {detailTab === "related" && (
                  <div className="p-4"><RelatedRecords tabs={[{key:"contacts",label:"אנשי קשר",endpoint:`/api/crm/messaging/${selected.id}/contacts`,columns:[{key:"name",label:"שם"},{key:"phone",label:"טלפון"},{key:"channel",label:"ערוץ"}]},{key:"templates",label:"תבניות",endpoint:`/api/crm/messaging/${selected.id}/templates`,columns:[{key:"name",label:"שם"},{key:"content",label:"תוכן"},{key:"usage",label:"שימוש"}]}]} /></div>
                )}
                {detailTab === "docs" && (
                  <div className="p-4"><AttachmentsSection entityType="messaging" entityId={selected.id} /></div>
                )}
                {detailTab === "history" && (
                  <div className="p-4"><ActivityLog entityType="messaging" entityId={selected.id} /></div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p>{contacts.length > 0 ? "בחר איש קשר להצגה" : "הוסף לידים עם מספר טלפון ב-CRM"}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
