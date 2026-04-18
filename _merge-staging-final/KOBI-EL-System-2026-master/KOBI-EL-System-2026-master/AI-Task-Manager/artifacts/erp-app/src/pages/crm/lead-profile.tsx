import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";
import {
  User, Phone, Mail, MapPin, Calendar, Clock, FileText, MessageSquare,
  Send, Star, ArrowRight, Plus, Pencil, Trash2, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, AlertTriangle, DollarSign, Building2, Tag,
  PhoneCall, MessageCircle, Video, Globe, History, ClipboardList,
  Upload, Download, Eye, RefreshCw, Target, TrendingUp, Zap,
  ArrowLeft, ExternalLink, Copy, MoreHorizontal
} from "lucide-react";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("he-IL") : "—";
const fmtDateTime = (d: string) => d ? new Date(d).toLocaleString("he-IL") : "—";

const LEAD_STATUS: Record<string, { label: string; color: string }> = {
  new: { label: "חדש", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  contacted: { label: "יצירת קשר", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" },
  meeting_scheduled: { label: "פגישה נקבעה", color: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  meeting_done: { label: "פגישה בוצעה", color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30" },
  quote_sent: { label: "הצעת מחיר נשלחה", color: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  negotiation: { label: "משא ומתן", color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  closed_won: { label: "נסגר - זכייה", color: "bg-green-500/20 text-green-400 border-green-500/30" },
  closed_lost: { label: "נסגר - הפסד", color: "bg-red-500/20 text-red-400 border-red-500/30" },
};

const ACTIVITY_ICONS: Record<string, any> = {
  call: PhoneCall, meeting: Video, email: Mail, whatsapp: MessageCircle,
  sms: MessageSquare, note: FileText, status_change: History, quote: DollarSign,
  task: ClipboardList, document: Upload,
};

const TABS = [
  { key: "details", label: "פרטים", icon: User },
  { key: "activity", label: "פעילות", icon: MessageSquare },
  { key: "quotes", label: "הצעות מחיר", icon: DollarSign },
  { key: "documents", label: "מסמכים", icon: FileText },
  { key: "tasks", label: "משימות", icon: ClipboardList },
  { key: "history", label: "היסטוריה", icon: History },
];

// Mock data for a single lead
const mockLead: any = {
  id: 1, leadNumber: "LD-2024-0042", fullName: "ישראל ישראלי", phone: "050-1234567",
  email: "israel@example.com", city: "תל אביב", address: "רח' הרצל 45, תל אביב",
  source: "גוגל", productInterest: "דירת 4 חדרים", status: "meeting_scheduled",
  qualityScore: 82, agentId: 2, agentName: "דנה לוי", urgency: "high",
  budget: 2500000, estimatedValue: 2800000, companyName: "ישראלי נדל״ן בע״מ",
  notes: "מתעניין בדירת 4 חדרים באזור המרכז. תקציב גמיש. מעוניין בקרבה לתחבורה ציבורית.",
  created_at: "2024-12-15T10:30:00", lastContact: "2025-03-20T14:00:00",
  nextFollowUp: "2025-03-27", tags: "נדל״ן, מרכז, דירה",
  idNumber: "123456789", dateOfBirth: "1985-06-15", maritalStatus: "נשוי",
  numberOfChildren: 2, occupation: "מהנדס תוכנה", income: 25000,
  preferredContactMethod: "whatsapp", preferredContactTime: "ערב",
  referredBy: "אתר גוגל", campaign: "קמפיין אביב 2025",
  projectName: "פרויקט השרון", projectType: "דירה", numberOfRooms: 4,
  floor: "גבוה", parking: true, storage: true, balcony: true,
  mortgageApproved: true, mortgageAmount: 1800000, downPayment: 700000,
};

const mockActivities: any[] = [
  { id: 1, type: "call", description: "שיחה יוצאת - דיון על מיקומים מועדפים", user: "דנה לוי", timestamp: "2025-03-20T14:00:00", duration: "8 דק'" },
  { id: 2, type: "whatsapp", description: "נשלחו תמונות של הפרויקט", user: "דנה לוי", timestamp: "2025-03-19T11:30:00" },
  { id: 3, type: "meeting", description: "פגישה במשרד - הצגת פרויקט השרון", user: "דנה לוי", timestamp: "2025-03-17T10:00:00", duration: "45 דק'", location: "משרד ראשי" },
  { id: 4, type: "email", description: "נשלח מייל עם חומרים שיווקיים", user: "מערכת", timestamp: "2025-03-15T09:00:00" },
  { id: 5, type: "note", description: "הלקוח ביקש לבדוק אפשרויות מימון נוספות", user: "דנה לוי", timestamp: "2025-03-14T16:30:00" },
  { id: 6, type: "status_change", description: "סטטוס שונה: חדש → יצירת קשר", user: "מערכת", timestamp: "2025-03-10T08:00:00" },
  { id: 7, type: "sms", description: "SMS - תזכורת לפגישה מחר", user: "מערכת", timestamp: "2025-03-16T18:00:00" },
  { id: 8, type: "call", description: "שיחה ראשונה - בירור צרכים", user: "דנה לוי", timestamp: "2025-03-10T08:30:00", duration: "12 דק'" },
];

const mockQuotes: any[] = [
  { id: 1, quoteNumber: "Q-2025-0015", version: 3, amount: 2750000, status: "sent", created_at: "2025-03-18T10:00:00", validUntil: "2025-04-18", description: "הצעת מחיר - דירת 4 חדרים, קומה 8" },
  { id: 2, quoteNumber: "Q-2025-0015", version: 2, amount: 2850000, status: "revised", created_at: "2025-03-15T14:00:00", validUntil: "2025-04-15", description: "הצעת מחיר מעודכנת - כולל חניה" },
  { id: 3, quoteNumber: "Q-2025-0015", version: 1, amount: 2900000, status: "expired", created_at: "2025-03-10T09:00:00", validUntil: "2025-03-20", description: "הצעת מחיר ראשונית" },
];

const mockDocuments: any[] = [
  { id: 1, name: "תעודת זהות.pdf", type: "pdf", size: "2.1 MB", uploaded_at: "2025-03-15T10:00:00", uploadedBy: "דנה לוי" },
  { id: 2, name: "אישור הכנסה.pdf", type: "pdf", size: "1.5 MB", uploaded_at: "2025-03-16T11:00:00", uploadedBy: "דנה לוי" },
  { id: 3, name: "אישור משכנתא.pdf", type: "pdf", size: "3.2 MB", uploaded_at: "2025-03-18T09:00:00", uploadedBy: "ישראל ישראלי" },
  { id: 4, name: "תמונות פרויקט.zip", type: "zip", size: "15.4 MB", uploaded_at: "2025-03-19T14:00:00", uploadedBy: "מערכת" },
];

const mockTasks: any[] = [
  { id: 1, title: "לשלוח הצעת מחיר מעודכנת", status: "pending", dueDate: "2025-03-27", assignee: "דנה לוי", priority: "high" },
  { id: 2, title: "לתאם פגישה שנייה", status: "pending", dueDate: "2025-03-28", assignee: "דנה לוי", priority: "medium" },
  { id: 3, title: "בדיקת אישור משכנתא", status: "done", dueDate: "2025-03-20", assignee: "דנה לוי", priority: "high" },
  { id: 4, title: "שליחת חומרים שיווקיים", status: "done", dueDate: "2025-03-15", assignee: "מערכת", priority: "low" },
];

const mockHistory: any[] = [
  { id: 1, field: "status", oldValue: "contacted", newValue: "meeting_scheduled", user: "דנה לוי", timestamp: "2025-03-17T10:45:00" },
  { id: 2, field: "qualityScore", oldValue: "65", newValue: "82", user: "מערכת AI", timestamp: "2025-03-17T10:46:00" },
  { id: 3, field: "budget", oldValue: "2000000", newValue: "2500000", user: "דנה לוי", timestamp: "2025-03-17T10:30:00" },
  { id: 4, field: "notes", oldValue: "", newValue: "מתעניין בדירת 4 חדרים...", user: "דנה לוי", timestamp: "2025-03-14T16:30:00" },
  { id: 5, field: "agentId", oldValue: "—", newValue: "דנה לוי", user: "מנהל", timestamp: "2025-03-10T08:00:00" },
  { id: 6, field: "status", oldValue: "new", newValue: "contacted", user: "מערכת", timestamp: "2025-03-10T08:30:00" },
  { id: 7, field: "created", oldValue: "", newValue: "ליד נוצר", user: "מערכת", timestamp: "2025-12-15T10:30:00" },
];

const FIELD_LABELS: Record<string, string> = {
  status: "סטטוס", qualityScore: "ציון איכות", budget: "תקציב", notes: "הערות",
  agentId: "סוכן", phone: "טלפון", email: "אימייל", fullName: "שם",
  city: "עיר", source: "מקור", created: "יצירה",
};

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-400 bg-green-500/10" : score >= 60 ? "text-amber-400 bg-amber-500/10" : "text-red-400 bg-red-500/10";
  return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold ${color}`}><Star className="w-3.5 h-3.5" />{score}</span>;
}

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="bg-background rounded-lg p-3">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      {children || <div className="text-sm text-foreground font-medium">{value || "—"}</div>}
    </div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3 mt-2">
      <Icon className="w-4 h-4 text-blue-400" />
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
    </div>
  );
}

export default function LeadProfilePage() {
  const [lead, setLead] = useState<any>(mockLead);
  const [activities, setActivities] = useState<any[]>(mockActivities);
  const [quotes, setQuotes] = useState<any[]>(mockQuotes);
  const [documents, setDocuments] = useState<any[]>(mockDocuments);
  const [tasks, setTasks] = useState<any[]>(mockTasks);
  const [history, setHistory] = useState<any[]>(mockHistory);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: "", dueDate: "", priority: "medium" });

  // Extract leadId from URL (e.g. ?id=1 or /lead-profile/1)
  const leadId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || params.get("leadId") || "1";
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [r1, r2, r3, r4, r5, r6] = await Promise.all([
        authFetch(`${API}/crm-ultimate/leads/${leadId}`),
        authFetch(`${API}/crm-ultimate/leads/${leadId}/activities`),
        authFetch(`${API}/crm-ultimate/leads/${leadId}/quotes`),
        authFetch(`${API}/crm-ultimate/leads/${leadId}/documents`),
        authFetch(`${API}/crm-ultimate/leads/${leadId}/tasks`),
        authFetch(`${API}/crm-ultimate/leads/${leadId}/history`),
      ]);
      if (r1.ok) { const d = await r1.json(); if (d && d.id) setLead(d); }
      if (r2.ok) { const d = safeArray(await r2.json()); if (d.length) setActivities(d); }
      if (r3.ok) { const d = safeArray(await r3.json()); if (d.length) setQuotes(d); }
      if (r4.ok) { const d = safeArray(await r4.json()); if (d.length) setDocuments(d); }
      if (r5.ok) { const d = safeArray(await r5.json()); if (d.length) setTasks(d); }
      if (r6.ok) { const d = safeArray(await r6.json()); if (d.length) setHistory(d); }
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, [leadId]);

  const handleStatusChange = async (newStatus: string) => {
    try {
      await authFetch(`${API}/crm-ultimate/leads/${lead.id}/status`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }),
      });
      setLead((l: any) => ({ ...l, status: newStatus }));
      setShowStatusModal(false);
      load();
    } catch {}
  };

  const handleAddNote = async () => {
    if (!noteText.trim()) return;
    try {
      await authFetch(`${API}/crm-ultimate/leads/${lead.id}/activities`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "note", description: noteText }),
      });
      setNoteText(""); setShowNoteModal(false); load();
    } catch {}
  };

  const handleAddTask = async () => {
    if (!taskForm.title.trim()) return;
    try {
      await authFetch(`${API}/crm-ultimate/leads/${lead.id}/tasks`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(taskForm),
      });
      setTaskForm({ title: "", dueDate: "", priority: "medium" }); setShowTaskModal(false); load();
    } catch {}
  };

  const handleConvertToCustomer = async () => {
    try {
      await authFetch(`${API}/crm-ultimate/leads/${lead.id}/convert`, { method: "POST" });
      load();
    } catch {}
  };

  if (loading && !lead?.id) return <div className="p-6 text-center text-muted-foreground">טוען...</div>;

  const st = LEAD_STATUS[lead.status] || LEAD_STATUS.new;

  return (
    <div dir="rtl" className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="bg-card rounded-xl border border-white/10 p-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold text-xl flex-shrink-0">
              {lead.fullName?.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-xl font-bold text-foreground">{lead.fullName}</h1>
                <Badge className={`${st.color}`}>{st.label}</Badge>
                <ScoreBadge score={lead.qualityScore || 0} />
              </div>
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-blue-400 cursor-pointer"><Phone className="w-3.5 h-3.5" />{lead.phone}</a>
                {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-blue-400 cursor-pointer"><Mail className="w-3.5 h-3.5" />{lead.email}</a>}
                {lead.city && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{lead.city}</span>}
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>מספר ליד: <span className="text-blue-400 font-mono">{lead.leadNumber}</span></span>
                <span>סוכן: <span className="text-foreground">{lead.agentName || "לא משויך"}</span></span>
                <span>נוצר: {fmtDate(lead.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowNoteModal(true)} className="px-3 py-2 bg-blue-600 text-foreground rounded-lg text-xs hover:bg-blue-700 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> שלח הודעה</button>
            <button className="px-3 py-2 bg-purple-600 text-foreground rounded-lg text-xs hover:bg-purple-700 flex items-center gap-1"><Calendar className="w-3 h-3" /> קבע פגישה</button>
            <button className="px-3 py-2 bg-amber-600 text-foreground rounded-lg text-xs hover:bg-amber-700 flex items-center gap-1"><DollarSign className="w-3 h-3" /> שלח הצעת מחיר</button>
            <button onClick={handleConvertToCustomer} className="px-3 py-2 bg-green-600 text-foreground rounded-lg text-xs hover:bg-green-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> המר ללקוח</button>
            <button onClick={() => setShowStatusModal(true)} className="px-3 py-2 bg-background text-foreground rounded-lg text-xs border border-white/10 hover:border-white/20 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> עדכן סטטוס</button>
          </div>
        </div>

        {/* Communication Buttons */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-white/10">
          <a href={`https://wa.me/${lead.phone?.replace(/\D/g, "")}`} target="_blank" rel="noopener" className="px-3 py-1.5 rounded-lg text-xs bg-green-600/20 text-green-400 border border-green-500/30 hover:bg-green-600/30 flex items-center gap-1">
            <MessageCircle className="w-3 h-3" /> WhatsApp
          </a>
          <a href={`mailto:${lead.email}`} className="px-3 py-1.5 rounded-lg text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30 hover:bg-blue-600/30 flex items-center gap-1">
            <Mail className="w-3 h-3" /> Email
          </a>
          <a href={`sms:${lead.phone}`} className="px-3 py-1.5 rounded-lg text-xs bg-cyan-600/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-600/30 flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> SMS
          </a>
          <a href={`tel:${lead.phone}`} className="px-3 py-1.5 rounded-lg text-xs bg-purple-600/20 text-purple-400 border border-purple-500/30 hover:bg-purple-600/30 flex items-center gap-1">
            <PhoneCall className="w-3 h-3" /> טלפון
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto bg-card rounded-xl border border-white/10 p-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm whitespace-nowrap transition-colors ${activeTab === tab.key ? "bg-blue-600 text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}>
              <Icon className="w-4 h-4" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {/* DETAILS TAB */}
        {activeTab === "details" && (
          <motion.div key="details" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* Personal Information */}
            <div className="bg-card rounded-xl border border-white/10 p-4">
              <SectionTitle icon={User} title="פרטים אישיים" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <DetailField label="שם מלא" value={lead.fullName} />
                <DetailField label="תעודת זהות" value={lead.idNumber} />
                <DetailField label="תאריך לידה" value={fmtDate(lead.dateOfBirth)} />
                <DetailField label="מצב משפחתי" value={lead.maritalStatus} />
                <DetailField label="ילדים" value={lead.numberOfChildren?.toString()} />
                <DetailField label="עיסוק" value={lead.occupation} />
                <DetailField label="הכנסה חודשית" value={lead.income ? fmtC(lead.income) : undefined} />
                <DetailField label="תגיות" value={lead.tags} />
              </div>
            </div>

            {/* Contact Information */}
            <div className="bg-card rounded-xl border border-white/10 p-4">
              <SectionTitle icon={Phone} title="פרטי קשר" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <DetailField label="טלפון" value={lead.phone} />
                <DetailField label="אימייל" value={lead.email} />
                <DetailField label="עיר" value={lead.city} />
                <DetailField label="כתובת" value={lead.address} />
                <DetailField label="אופן יצירת קשר מועדף" value={lead.preferredContactMethod} />
                <DetailField label="זמן מועדף" value={lead.preferredContactTime} />
              </div>
            </div>

            {/* Project Interest */}
            <div className="bg-card rounded-xl border border-white/10 p-4">
              <SectionTitle icon={Building2} title="עניין בפרויקט" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <DetailField label="מוצר / שירות" value={lead.productInterest} />
                <DetailField label="שם פרויקט" value={lead.projectName} />
                <DetailField label="סוג נכס" value={lead.projectType} />
                <DetailField label="מספר חדרים" value={lead.numberOfRooms?.toString()} />
                <DetailField label="קומה" value={lead.floor} />
                <DetailField label="חניה">{lead.parking ? <span className="text-green-400 text-sm">כן</span> : <span className="text-red-400 text-sm">לא</span>}</DetailField>
                <DetailField label="מחסן">{lead.storage ? <span className="text-green-400 text-sm">כן</span> : <span className="text-red-400 text-sm">לא</span>}</DetailField>
                <DetailField label="מרפסת">{lead.balcony ? <span className="text-green-400 text-sm">כן</span> : <span className="text-red-400 text-sm">לא</span>}</DetailField>
              </div>
            </div>

            {/* Financial */}
            <div className="bg-card rounded-xl border border-white/10 p-4">
              <SectionTitle icon={DollarSign} title="מידע פיננסי" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <DetailField label="תקציב" value={lead.budget ? fmtC(lead.budget) : undefined} />
                <DetailField label="ערך משוער עסקה" value={lead.estimatedValue ? fmtC(lead.estimatedValue) : undefined} />
                <DetailField label="משכנתא מאושרת">{lead.mortgageApproved ? <span className="text-green-400 text-sm">כן</span> : <span className="text-red-400 text-sm">לא</span>}</DetailField>
                <DetailField label="סכום משכנתא" value={lead.mortgageAmount ? fmtC(lead.mortgageAmount) : undefined} />
                <DetailField label="הון עצמי" value={lead.downPayment ? fmtC(lead.downPayment) : undefined} />
              </div>
            </div>

            {/* Agent Assignment */}
            <div className="bg-card rounded-xl border border-white/10 p-4">
              <SectionTitle icon={Target} title="שיוך סוכן ומקור" />
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                <DetailField label="סוכן אחראי" value={lead.agentName} />
                <DetailField label="מקור ליד" value={lead.source} />
                <DetailField label="הופנה ע״י" value={lead.referredBy} />
                <DetailField label="קמפיין" value={lead.campaign} />
                <DetailField label="ציון איכות">{lead.qualityScore && <ScoreBadge score={lead.qualityScore} />}</DetailField>
                <DetailField label="דחיפות" value={lead.urgency === "high" ? "גבוהה" : lead.urgency === "critical" ? "קריטית" : lead.urgency === "medium" ? "בינונית" : "נמוכה"} />
                <DetailField label="קשר אחרון" value={fmtDateTime(lead.lastContact)} />
                <DetailField label="מעקב הבא" value={fmtDate(lead.nextFollowUp)} />
              </div>
            </div>

            {/* Notes */}
            {lead.notes && (
              <div className="bg-card rounded-xl border border-white/10 p-4">
                <SectionTitle icon={FileText} title="הערות" />
                <div className="bg-background rounded-lg p-3 text-sm text-foreground whitespace-pre-wrap">{lead.notes}</div>
              </div>
            )}
          </motion.div>
        )}

        {/* ACTIVITY TAB */}
        {activeTab === "activity" && (
          <motion.div key="activity" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-card rounded-xl border border-white/10 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><MessageSquare className="w-4 h-4 text-blue-400" /> פעילויות ({activities.length})</h3>
              <button onClick={() => setShowNoteModal(true)} className="px-3 py-1.5 bg-blue-600 text-foreground rounded-lg text-xs hover:bg-blue-700 flex items-center gap-1"><Plus className="w-3 h-3" /> הוסף פעילות</button>
            </div>
            <div className="relative">
              <div className="absolute right-4 top-0 bottom-0 w-px bg-white/10" />
              <div className="space-y-4">
                {activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(act => {
                  const Icon = ACTIVITY_ICONS[act.type] || FileText;
                  return (
                    <div key={act.id} className="relative pr-10">
                      <div className="absolute right-2 top-2 w-5 h-5 rounded-full bg-card border border-white/20 flex items-center justify-center z-10">
                        <Icon className="w-3 h-3 text-blue-400" />
                      </div>
                      <div className="bg-background rounded-lg p-3 border border-white/5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-foreground font-medium">{act.description}</span>
                          <span className="text-[10px] text-muted-foreground">{fmtDateTime(act.timestamp)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{act.user}</span>
                          {act.duration && <span>משך: {act.duration}</span>}
                          {act.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{act.location}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* QUOTES TAB */}
        {activeTab === "quotes" && (
          <motion.div key="quotes" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-card rounded-xl border border-white/10 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><DollarSign className="w-4 h-4 text-amber-400" /> הצעות מחיר ({quotes.length})</h3>
              <button className="px-3 py-1.5 bg-amber-600 text-foreground rounded-lg text-xs hover:bg-amber-700 flex items-center gap-1"><Plus className="w-3 h-3" /> הצעה חדשה</button>
            </div>
            <div className="space-y-3">
              {quotes.map(q => (
                <div key={q.id} className="bg-background rounded-lg p-4 border border-white/5">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{q.quoteNumber}</span>
                        <Badge className="text-[10px] bg-blue-500/20 text-blue-400">גרסה {q.version}</Badge>
                        <Badge className={`text-[10px] ${q.status === "sent" ? "bg-green-500/20 text-green-400" : q.status === "revised" ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                          {q.status === "sent" ? "נשלח" : q.status === "revised" ? "תוקן" : "פג תוקף"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{q.description}</div>
                    </div>
                    <div className="text-left">
                      <div className="text-lg font-bold text-foreground">{fmtC(q.amount)}</div>
                      <div className="text-xs text-muted-foreground">בתוקף עד: {fmtDate(q.validUntil)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>נוצר: {fmtDateTime(q.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* DOCUMENTS TAB */}
        {activeTab === "documents" && (
          <motion.div key="documents" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-card rounded-xl border border-white/10 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><FileText className="w-4 h-4 text-green-400" /> מסמכים ({documents.length})</h3>
              <button className="px-3 py-1.5 bg-green-600 text-foreground rounded-lg text-xs hover:bg-green-700 flex items-center gap-1"><Upload className="w-3 h-3" /> העלאת מסמך</button>
            </div>
            <div className="space-y-2">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between bg-background rounded-lg p-3 border border-white/5 hover:border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-sm text-foreground font-medium">{doc.name}</div>
                      <div className="text-xs text-muted-foreground">{doc.size} | הועלה ע״י {doc.uploadedBy} | {fmtDate(doc.uploaded_at)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-1.5 hover:text-blue-400 text-muted-foreground"><Eye className="w-4 h-4" /></button>
                    <button className="p-1.5 hover:text-green-400 text-muted-foreground"><Download className="w-4 h-4" /></button>
                    <button className="p-1.5 hover:text-red-400 text-muted-foreground"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* TASKS TAB */}
        {activeTab === "tasks" && (
          <motion.div key="tasks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-card rounded-xl border border-white/10 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><ClipboardList className="w-4 h-4 text-purple-400" /> משימות ({tasks.length})</h3>
              <button onClick={() => setShowTaskModal(true)} className="px-3 py-1.5 bg-purple-600 text-foreground rounded-lg text-xs hover:bg-purple-700 flex items-center gap-1"><Plus className="w-3 h-3" /> משימה חדשה</button>
            </div>
            <div className="space-y-2">
              {tasks.map(task => (
                <div key={task.id} className={`flex items-center justify-between bg-background rounded-lg p-3 border ${task.status === "done" ? "border-green-500/20 opacity-60" : "border-white/5"}`}>
                  <div className="flex items-center gap-3">
                    <button className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${task.status === "done" ? "border-green-500 bg-green-500/20" : "border-white/20"}`}>
                      {task.status === "done" && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                    </button>
                    <div>
                      <div className={`text-sm font-medium ${task.status === "done" ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{task.assignee}</span>
                        <span>עד: {fmtDate(task.dueDate)}</span>
                        <Badge className={`text-[10px] ${task.priority === "high" ? "bg-red-500/20 text-red-400" : task.priority === "medium" ? "bg-amber-500/20 text-amber-400" : "bg-green-500/20 text-green-400"}`}>
                          {task.priority === "high" ? "גבוהה" : task.priority === "medium" ? "בינונית" : "נמוכה"}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <button className="p-1 text-muted-foreground hover:text-foreground"><MoreHorizontal className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* HISTORY TAB */}
        {activeTab === "history" && (
          <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-card rounded-xl border border-white/10 p-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4"><History className="w-4 h-4 text-indigo-400" /> היסטוריית שינויים</h3>
            <div className="space-y-2">
              {history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(h => (
                <div key={h.id} className="bg-background rounded-lg p-3 border border-white/5">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <History className="w-3 h-3 text-indigo-400" />
                      <span className="text-sm text-foreground font-medium">{FIELD_LABELS[h.field] || h.field}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{fmtDateTime(h.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {h.oldValue && <span className="text-red-400 line-through">{LEAD_STATUS[h.oldValue]?.label || h.oldValue}</span>}
                    {h.oldValue && h.newValue && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                    <span className="text-green-400">{LEAD_STATUS[h.newValue]?.label || h.newValue}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">ע״י: {h.user}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Status Change Modal */}
      <AnimatePresence>
        {showStatusModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowStatusModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-card rounded-xl border border-white/10 p-6 w-full max-w-sm">
              <h3 className="text-lg font-bold text-foreground mb-4">עדכון סטטוס</h3>
              <div className="space-y-2">
                {Object.entries(LEAD_STATUS).map(([k, v]) => (
                  <button key={k} onClick={() => handleStatusChange(k)}
                    className={`w-full p-3 rounded-lg text-right text-sm flex items-center justify-between border ${lead.status === k ? "border-blue-500 bg-blue-500/10" : "border-white/10 bg-background hover:border-white/20"}`}>
                    <Badge className={`${v.color}`}>{v.label}</Badge>
                    {lead.status === k && <CheckCircle2 className="w-4 h-4 text-blue-400" />}
                  </button>
                ))}
              </div>
              <button onClick={() => setShowStatusModal(false)} className="w-full mt-4 py-2 bg-background text-foreground rounded-lg text-sm border border-white/10">ביטול</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Note Modal */}
      <AnimatePresence>
        {showNoteModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowNoteModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-card rounded-xl border border-white/10 p-6 w-full max-w-md">
              <h3 className="text-lg font-bold text-foreground mb-4">הוספת הערה / פעילות</h3>
              <textarea rows={4} value={noteText} onChange={e => setNoteText(e.target.value)} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground resize-none" placeholder="תוכן ההערה..." />
              <div className="flex gap-2 mt-4">
                <button onClick={handleAddNote} className="flex-1 py-2 bg-blue-600 text-foreground rounded-lg text-sm hover:bg-blue-700">שמור</button>
                <button onClick={() => { setShowNoteModal(false); setNoteText(""); }} className="flex-1 py-2 bg-background text-foreground rounded-lg text-sm border border-white/10">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Task Modal */}
      <AnimatePresence>
        {showTaskModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowTaskModal(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-card rounded-xl border border-white/10 p-6 w-full max-w-md">
              <h3 className="text-lg font-bold text-foreground mb-4">משימה חדשה</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">כותרת</label>
                  <input value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground" placeholder="כותרת משימה" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">תאריך יעד</label>
                  <input type="date" value={taskForm.dueDate} onChange={e => setTaskForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">עדיפות</label>
                  <select value={taskForm.priority} onChange={e => setTaskForm(f => ({ ...f, priority: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground">
                    <option value="low">נמוכה</option>
                    <option value="medium">בינונית</option>
                    <option value="high">גבוהה</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={handleAddTask} className="flex-1 py-2 bg-purple-600 text-foreground rounded-lg text-sm hover:bg-purple-700">צור משימה</button>
                <button onClick={() => setShowTaskModal(false)} className="flex-1 py-2 bg-background text-foreground rounded-lg text-sm border border-white/10">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
