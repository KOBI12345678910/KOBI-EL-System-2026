import { useState, useEffect } from "react";
import { Mail, Search, Send, Paperclip, Star, Inbox, CheckCircle, Plus, RefreshCw, Filter, X, Database, FolderArchive, ArchiveRestore } from "lucide-react";
import { authFetch } from "@/lib/utils";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import ActivityLog from "@/components/activity-log";

const TEMPLATES = [
  { name: "הצעת מחיר ראשונית", body: "שלום [שם],\n\nבהתייחסות לשיחתנו, מצורפת הצעת מחיר ראשונית.\n\nנשמח לענות על כל שאלה.\n\nבברכה,\nצוות המכירות" },
  { name: "מעקב אחרי פגישה", body: "שלום [שם],\n\nתודה על הפגישה הנעימה היום.\n\nכפי שסיכמנו, אנו נשלח מסמכים נוספים בימים הקרובים.\n\nבברכה,\nצוות המכירות" },
  { name: "תזכורת תשלום", body: "שלום [שם],\n\nרצינו להזכיר כי חשבוניתכם מספר [מספר] לסכום [סכום] ₪ עומדת לפירעון.\n\nנשמח לקבל אישור על מועד התשלום.\n\nבברכה" },
];

const SIGNATURES = [
  { name: "חתימה רשמית", content: "בברכה,\nצוות המכירות\nחברת X\nטל: 03-XXXXXXX | sales@company.com" },
  { name: "חתימה קצרה", content: "בברכה,\nצוות המכירות" },
];

const DEMO_EMAILS: Email[] = [
  {
    id: 1001,
    from: "דניאל לוי",
    email: "daniel.levi@example.com",
    subject: "Accepted: פגישת תיאום Q2 — 15 אפריל",
    preview: "אני שמח לאשר את השתתפותי בפגישה. נתראה ב-15 אפריל בשעה 10:00.",
    body: "שלום,\n\nאני שמח לאשר את השתתפותי בפגישה.\nנתראה ב-15 אפריל בשעה 10:00.\n\nבברכה,\nדניאל לוי",
    date: "04/04/2026",
    time: "09:14",
    unread: true,
    starred: false,
    deal: "עסקת Q2 — לוי בע\"מ",
    status: "incoming",
    archived: false,
  },
  {
    id: 1002,
    from: "מיכל כהן",
    email: "michal.cohen@corp.co.il",
    subject: "Declined: סמינר מנהלים — 20 אפריל",
    preview: "מצטערת, לא אוכל להשתתף בסמינר בתאריך הנ\"ל עקב עומס לוחות זמנים.",
    body: "שלום,\n\nמצטערת, לא אוכל להשתתף בסמינר בתאריך הנ\"ל עקב עומס לוחות זמנים.\nאשמח לקבל סיכום לאחר הארוע.\n\nבברכה,\nמיכל כהן",
    date: "03/04/2026",
    time: "16:42",
    unread: false,
    starred: true,
    deal: null,
    status: "incoming",
    archived: false,
  },
  {
    id: 1003,
    from: "אורי שפירא",
    email: "uri.shapira@bizmail.com",
    subject: "Tentative: הצגת מוצר — 22 אפריל",
    preview: "ייתכן שאגיע, תלוי בסיום פרויקט נוכחי. אעדכן עד ה-18 בחודש.",
    body: "שלום,\n\nייתכן שאגיע, תלוי בסיום פרויקט נוכחי.\nאעדכן אתכם בהחלטה הסופית עד ה-18 באפריל.\n\nתודה,\nאורי שפירא",
    date: "02/04/2026",
    time: "11:05",
    unread: true,
    starred: false,
    deal: "פיילוט — שפירא טק",
    status: "incoming",
    archived: false,
  },
  {
    id: 1004,
    from: "רונית ברנר",
    email: "ronit.brenner@startup.io",
    subject: "בקשה להצעת מחיר — מערכת ERP",
    preview: "שלום, אנו מתעניינים ביישום מערכת ERP לחברתנו הצומחת. ניתן לקבל הצעת מחיר?",
    body: "שלום,\n\nאנו מתעניינים ביישום מערכת ERP לחברתנו הצומחת.\nנשמח לקבל הצעת מחיר ופרטים נוספים על המודולים הזמינים.\n\nבברכה,\nרונית ברנר\nCEO, StartUp.io",
    date: "01/04/2026",
    time: "08:30",
    unread: false,
    starred: false,
    deal: null,
    status: "incoming",
    archived: false,
  },
  {
    id: 1005,
    from: "יונתן אברהם",
    email: "yonatan.a@factory-ltd.co.il",
    subject: "אישור הזמנה #20456",
    preview: "ההזמנה שלכם אושרה ותישלח תוך 3–5 ימי עסקים. מצורף מסמך האישור.",
    body: "שלום,\n\nההזמנה שלכם מספר #20456 אושרה ותישלח תוך 3–5 ימי עסקים.\nמצורף מסמך אישור ההזמנה לעיונכם.\n\nתודה על אמונכם בנו,\nיונתן אברהם\nשירות לקוחות — Factory Ltd.",
    date: "31/03/2026",
    time: "14:20",
    unread: false,
    starred: false,
    deal: "הזמנה #20456",
    status: "incoming",
    archived: false,
  },
  {
    id: 1006,
    from: "צוות המכירות",
    email: "sales@company.com",
    subject: "RE: בקשה להצעת מחיר — מערכת ERP",
    preview: "שלום רונית, תודה על פנייתך! צרפנו הצעת מחיר מפורטת למייל זה.",
    body: "שלום רונית,\n\nתודה על פנייתך!\nצרפנו הצעת מחיר מפורטת למייל זה.\nנשמח לתאם שיחה קצרה להסבר המוצר.\n\nבברכה,\nצוות המכירות\nחברת X\nטל: 03-XXXXXXX",
    date: "01/04/2026",
    time: "10:15",
    unread: false,
    starred: false,
    deal: null,
    status: "outgoing",
    archived: false,
  },
];

interface Email {
  id: number;
  from: string;
  email: string;
  subject: string;
  preview: string;
  body?: string;
  date: string;
  time: string;
  unread: boolean;
  starred: boolean;
  deal?: string | null;
  status: "incoming" | "outgoing";
  archived?: boolean;
}

interface EmailAccount {
  name: string;
  connected: boolean;
}

function getRsvpBadge(subject: string) {
  if (subject.startsWith("Accepted:")) return { label: "אושר", className: "bg-green-500/20 text-green-400 border border-green-500/30" };
  if (subject.startsWith("Declined:")) return { label: "סורב", className: "bg-red-500/20 text-red-400 border border-red-500/30" };
  if (subject.startsWith("Tentative:")) return { label: "אולי", className: "bg-amber-500/20 text-amber-400 border border-amber-500/30" };
  return null;
}

export default function EmailSyncPage() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [selected, setSelected] = useState<Email | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCompose, setShowCompose] = useState(false);
  const [composeData, setComposeData] = useState({ to: "", subject: "", body: "", signature: 0 });
  const [activeTab, setActiveTab] = useState("inbox");
  const [showTemplates, setShowTemplates] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendNotice, setSendNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [integrationMissing, setIntegrationMissing] = useState(false);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const token = localStorage.getItem("erp_token") || "";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const loadEmails = async () => {
    setLoading(true);
    try {
      const [emailsRes, accountsRes] = await Promise.allSettled([
        authFetch("/api/email/inbox", { headers }).then(r => r.ok ? r.json() : Promise.reject(r.status)),
        authFetch("/api/email/accounts", { headers }).then(r => r.ok ? r.json() : []),
      ]);

      let hasConnectedAccount = false;

      if (accountsRes.status === "fulfilled") {
        const accs: EmailAccount[] = Array.isArray(accountsRes.value) ? accountsRes.value : [];
        setAccounts(accs);
        hasConnectedAccount = accs.some(a => a.connected);
      }

      if (emailsRes.status === "fulfilled") {
        const data = emailsRes.value;
        const list = Array.isArray(data) ? data : (data?.emails || data?.messages || data?.data || []);
        if (list.length > 0) {
          setEmails(list.map((e: Email) => ({ ...e, archived: e.archived ?? false })));
        } else if (!hasConnectedAccount) {
          setEmails(DEMO_EMAILS);
        } else {
          setEmails([]);
        }
        setIntegrationMissing(!hasConnectedAccount);
      } else {
        if (!hasConnectedAccount) {
          setEmails(DEMO_EMAILS);
        } else {
          setEmails([]);
        }
        setIntegrationMissing(!hasConnectedAccount);
      }
    } catch {
      setEmails(DEMO_EMAILS);
      setIntegrationMissing(true);
    }
    setLoading(false);
  };

  useEffect(() => { loadEmails(); }, []);

  const archiveEmail = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEmails(prev => prev.map(email => email.id === id ? { ...email, archived: true } : email));
    if (selected?.id === id) setSelected(null);
  };

  const unarchiveEmail = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEmails(prev => prev.map(email => email.id === id ? { ...email, archived: false } : email));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, archived: false } : null);
  };

  const inboxCount = emails.filter(e => e.status === "incoming" && !e.archived).length;
  const sentCount = emails.filter(e => e.status === "outgoing" && !e.archived).length;
  const starredCount = emails.filter(e => e.starred && !e.archived).length;
  const archivedCount = emails.filter(e => e.archived).length;

  const filtered = emails.filter(e => {
    if (search && !`${e.from} ${e.subject} ${e.preview}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus === "unread" && !e.unread) return false;
    if (filterStatus === "starred" && !e.starred) return false;
    if (activeTab === "inbox" && (e.status !== "incoming" || e.archived)) return false;
    if (activeTab === "sent" && (e.status !== "outgoing" || e.archived)) return false;
    if (activeTab === "starred" && (!e.starred || e.archived)) return false;
    if (activeTab === "archived" && !e.archived) return false;
    return true;
  });

  const sendEmail = async () => {
    if (!composeData.to || !composeData.subject) {
      setSendNotice("נא למלא נמען ונושא");
      return;
    }
    setSending(true);
    try {
      const signature = SIGNATURES[composeData.signature]?.content || "";
      const res = await authFetch("/api/email/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          to: composeData.to,
          subject: composeData.subject,
          body: composeData.body + (signature ? `\n\n${signature}` : ""),
        }),
      });
      if (res.ok) {
        setSendNotice("האימייל נשלח בהצלחה");
        setShowCompose(false);
        setComposeData({ to: "", subject: "", body: "", signature: 0 });
        await loadEmails();
      } else {
        setSendNotice("שליחת אימיילים דורשת הגדרת חשבון מייל. גש לתפריט 'אינטגרציות' לחיבור.");
        setIntegrationMissing(true);
      }
    } catch {
      setSendNotice("שליחת אימיילים דורשת הגדרת חשבון מייל. גש לתפריט 'אינטגרציות' לחיבור.");
      setIntegrationMissing(true);
    } finally {
      setSending(false);
      setTimeout(() => setSendNotice(""), 6000);
    }
  };

  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    setComposeData(d => ({ ...d, body: t.body }));
    setShowTemplates(false);
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><Mail className="w-6 h-6 text-blue-400" />Email Sync</h1>
          <p className="text-sm text-muted-foreground">סנכרון אימיילים, שליחה, תבניות וחיבור לעסקאות</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadEmails} className="btn btn-outline btn-sm flex items-center gap-1">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />סנכרון
          </button>
          <button onClick={() => setShowCompose(true)} className="btn btn-primary btn-sm flex items-center gap-1">
            <Send className="w-4 h-4" />אימייל חדש
          </button>
        </div>
      </div>

      {integrationMissing && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-3 flex items-center gap-2 text-amber-400 text-sm">
          <Database className="w-4 h-4 shrink-0" />
          <span>
            תיבת הדואר אינה מחוברת — מוצגים <strong>מיילי דמו</strong> לדוגמה. חבר חשבון <strong>Gmail</strong> או <strong>Outlook</strong> דרך תפריט <strong>אינטגרציות</strong> לצפייה בדוא"ל האמיתי ולשליחה.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-card border rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-bold text-muted-foreground">חשבונות מחוברים</h3>
            {accounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין חשבונות מחוברים</p>
            ) : (
              accounts.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle className={`w-4 h-4 ${a.connected ? "text-green-400" : "text-muted-foreground"}`} />
                  <div>
                    <div className="text-xs font-medium">{a.name}</div>
                    <div className={`text-xs ${a.connected ? "text-green-400" : "text-muted-foreground"}`}>{a.connected ? "מחובר" : "מנותק"}</div>
                  </div>
                </div>
              ))
            )}
            <button className="btn btn-outline btn-xs w-full mt-2 flex items-center gap-1 justify-center">
              <Plus className="w-3 h-3" />חיבור חשבון נוסף
            </button>
          </div>

          <div className="bg-card border rounded-xl p-4 space-y-1">
            {[
              { id: "inbox", label: "דואר נכנס", icon: Inbox, count: inboxCount },
              { id: "sent", label: "נשלח", icon: Send, count: sentCount },
              { id: "starred", label: "מסומן", icon: Star, count: starredCount },
              { id: "archived", label: "ארכיון", icon: FolderArchive, count: archivedCount },
            ].map(tab => (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setFilterStatus("all"); }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${activeTab === tab.id ? "bg-primary/20 text-primary" : "hover:bg-muted/50"}`}>
                <div className="flex items-center gap-2"><tab.icon className="w-4 h-4" />{tab.label}</div>
                <span className="text-xs bg-muted rounded-full px-2 py-0.5">{tab.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="lg:col-span-3 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <input className="input input-bordered w-full pr-9 h-9 text-sm" placeholder="חיפוש באימיילים..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="select select-bordered select-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="all">כל האימיילים</option>
              <option value="unread">לא נקראו</option>
              <option value="starred">מסומנים</option>
            </select>
          </div>

          <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
            defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch("/api/email/" + id, { method: "DELETE", headers }))); loadEmails(); }),
            defaultBulkActions.export(async (ids) => { const rows = filtered.filter(e => ids.includes(e.id)); const csv = ["שולח,נושא,תאריך", ...rows.map(e => `${e.from},${e.subject},${e.date}`)].join("\n"); const b = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "emails.csv"; a.click(); }),
          ]} />
          <div className="border rounded-xl overflow-hidden">
            {loading ? (
              <div className="flex justify-center items-center h-32">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Mail className="w-12 h-12 mx-auto mb-3 opacity-30" />
                {activeTab === "archived" ? (
                  <p className="text-sm">אין מיילים בארכיון</p>
                ) : (
                  <p>לא נמצאו אימיילים</p>
                )}
              </div>
            ) : (
              filtered.map(email => {
                const rsvp = getRsvpBadge(email.subject);
                return (
                  <div key={email.id} onClick={() => setSelected(email === selected ? null : email)}
                    className={`flex items-start gap-3 p-4 border-b last:border-b-0 cursor-pointer transition-colors ${selected?.id === email.id ? "bg-primary/10" : "hover:bg-muted/30"} ${email.unread ? "bg-blue-500/5" : ""}`}>
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary">
                      {email.from[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <span className={`text-sm ${email.unread ? "font-bold" : "font-medium"}`}>{email.from}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {email.deal && <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs">{email.deal}</span>}
                          <span>{email.time}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`text-sm ${email.unread ? "font-semibold" : ""} truncate`}>{email.subject}</div>
                        {rsvp && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${rsvp.className}`}>{rsvp.label}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{email.preview}</div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {email.starred && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}
                      {activeTab === "archived" ? (
                        <button
                          onClick={(e) => unarchiveEmail(email.id, e)}
                          title="שחזר מארכיון"
                          className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground hover:text-blue-400"
                        >
                          <ArchiveRestore className="w-4 h-4" />
                        </button>
                      ) : (
                        <button
                          onClick={(e) => archiveEmail(email.id, e)}
                          title="העבר לארכיון"
                          className="p-1 rounded hover:bg-muted/60 transition-colors text-muted-foreground hover:text-gray-400"
                        >
                          <FolderArchive className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {selected && (
            <div className="bg-card border rounded-xl p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg">{selected.subject}</h3>
                    {getRsvpBadge(selected.subject) && (
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${getRsvpBadge(selected.subject)!.className}`}>
                        {getRsvpBadge(selected.subject)!.label}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">מאת: {selected.from} &lt;{selected.email}&gt;</div>
                  <div className="text-xs text-muted-foreground">{selected.date} {selected.time}</div>
                </div>
                <button onClick={() => setSelected(null)} className="btn btn-ghost btn-xs"><X className="w-4 h-4" /></button>
              </div>
              {selected.deal && (
                <div className="flex items-center gap-2 text-sm bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                  <CheckCircle className="w-4 h-4 text-blue-400" />
                  <span>מחובר ל-{selected.deal}</span>
                </div>
              )}
              <div className="bg-muted/30 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap">
                {selected.body || selected.preview}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowCompose(true); setComposeData(d => ({ ...d, to: selected.email, subject: `RE: ${selected.subject}` })); }}
                  className="btn btn-primary btn-sm flex items-center gap-1">
                  <Send className="w-4 h-4" />השב
                </button>
                <button className="btn btn-outline btn-sm">העבר</button>
                {!selected.archived ? (
                  <button
                    onClick={(e) => archiveEmail(selected.id, e)}
                    className="btn btn-outline btn-sm flex items-center gap-1 text-muted-foreground"
                  >
                    <FolderArchive className="w-4 h-4" />ארכיון
                  </button>
                ) : (
                  <button
                    onClick={(e) => unarchiveEmail(selected.id, e)}
                    className="btn btn-outline btn-sm flex items-center gap-1 text-blue-400"
                  >
                    <ArchiveRestore className="w-4 h-4" />שחזר
                  </button>
                )}
              </div>

              <div className="flex border-b border-border/50 mt-4">
                {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                  <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2 text-xs font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                ))}
              </div>
              {detailTab === "details" && (
                <div className="grid grid-cols-2 gap-3 text-sm mt-3">
                  <div><span className="text-xs text-muted-foreground block">שולח</span><span className="font-medium">{selected.from}</span></div>
                  <div><span className="text-xs text-muted-foreground block">אימייל</span><span dir="ltr">{selected.email}</span></div>
                  <div><span className="text-xs text-muted-foreground block">נושא</span><span>{selected.subject}</span></div>
                  <div><span className="text-xs text-muted-foreground block">תאריך</span><span>{selected.date} {selected.time}</span></div>
                  <div><span className="text-xs text-muted-foreground block">סטטוס</span><span>{selected.unread ? "לא נקרא" : "נקרא"}</span></div>
                  <div><span className="text-xs text-muted-foreground block">עסקה</span><span>{selected.deal || "—"}</span></div>
                </div>
              )}
              {detailTab === "related" && (
                <div className="mt-3"><RelatedRecords tabs={[{key:"contacts",label:"אנשי קשר",endpoint:`/api/email/${selected.id}/contacts`,columns:[{key:"name",label:"שם"},{key:"email",label:"אימייל"},{key:"role",label:"תפקיד"}]},{key:"threads",label:"שרשורים",endpoint:`/api/email/${selected.id}/threads`,columns:[{key:"subject",label:"נושא"},{key:"count",label:"הודעות"},{key:"last_date",label:"תאריך אחרון"}]}]} /></div>
              )}
              {detailTab === "docs" && (
                <div className="mt-3"><AttachmentsSection entityType="email" entityId={selected.id} /></div>
              )}
              {detailTab === "history" && (
                <div className="mt-3"><ActivityLog entityType="email" entityId={selected.id} /></div>
              )}
            </div>
          )}
        </div>
      </div>

      {showCompose && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-end z-50 p-4">
          <div className="bg-card border rounded-xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-bold">הודעה חדשה</h3>
              <div className="flex gap-2">
                <button onClick={() => setShowTemplates(!showTemplates)} className="btn btn-outline btn-xs flex items-center gap-1">
                  <Filter className="w-3 h-3" />תבניות
                </button>
                <button onClick={() => setShowCompose(false)} className="btn btn-ghost btn-xs"><X className="w-4 h-4" /></button>
              </div>
            </div>
            {showTemplates && (
              <div className="p-3 bg-muted/30 border-b space-y-1">
                {TEMPLATES.map((t, i) => (
                  <button key={i} onClick={() => applyTemplate(t)} className="w-full text-right text-sm px-3 py-1.5 hover:bg-muted/50 rounded">{t.name}</button>
                ))}
              </div>
            )}
            <div className="p-4 space-y-3">
              <input className="input input-bordered w-full h-9 text-sm" placeholder="נמען" value={composeData.to} onChange={e => setComposeData(d => ({ ...d, to: e.target.value }))} />
              <input className="input input-bordered w-full h-9 text-sm" placeholder="נושא" value={composeData.subject} onChange={e => setComposeData(d => ({ ...d, subject: e.target.value }))} />
              <textarea className="textarea textarea-bordered w-full text-sm" rows={8} placeholder="תוכן הודעה..." value={composeData.body} onChange={e => setComposeData(d => ({ ...d, body: e.target.value }))} />
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">חתימה:</span>
                <select className="select select-bordered select-xs" value={composeData.signature} onChange={e => setComposeData(d => ({ ...d, signature: Number(e.target.value) }))}>
                  {SIGNATURES.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
                </select>
              </div>
              <div className="bg-muted/20 rounded p-2 text-xs text-muted-foreground whitespace-pre-line">{SIGNATURES[composeData.signature]?.content}</div>
            </div>
            {sendNotice && (
              <div className="mx-4 mb-2 text-xs px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                {sendNotice}
              </div>
            )}
            <div className="flex justify-between items-center p-4 border-t">
              <button className="btn btn-outline btn-sm flex items-center gap-1"><Paperclip className="w-4 h-4" />צרף קובץ</button>
              <div className="flex gap-2">
                <button onClick={() => setShowCompose(false)} className="btn btn-outline btn-sm">ביטול</button>
                <button onClick={sendEmail} disabled={sending} className="btn btn-primary btn-sm flex items-center gap-1 disabled:opacity-50">
                  {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                  שלח
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
