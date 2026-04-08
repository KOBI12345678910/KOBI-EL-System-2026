import { useState, useMemo, useEffect, useCallback } from "react";
import { authFetch } from "@/lib/utils";
import {
  ShieldCheck, Clock, AlertTriangle, TrendingUp, Plus, Edit, Trash2, Bell, BarChart3,
  CheckCircle, XCircle, Timer, Activity, Target, Users, Zap, ChevronDown, ChevronUp,
  Mail, MessageSquare, Send, PhoneCall, X
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import ActivityLog from "@/components/activity-log";
import StatusTransition from "@/components/status-transition";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

type SlaRule = {
  id: number;
  name: string;
  ticketType: string;
  priority: string;
  firstResponseHours: number;
  resolutionHours: number;
  escalationHours: number;
  assignedTeam: string;
  active: boolean;
};

type Breach = {
  id: number;
  ticket: string;
  customer: string;
  breachType: "first_response" | "resolution";
  priority: string;
  assignedTo: string;
  hoursOverdue: number;
  status: "open" | "escalated" | "closed";
  createdAt: string;
};

const TICKET_TYPES = ["תמיכה טכנית", "חיוב", "תלונה", "שאלה כללית", "החזרה", "אחריות", "אחר"];
const PRIORITIES = ["urgent", "high", "medium", "low"];
const PRIORITY_LABELS: Record<string, string> = { urgent: "דחוף", high: "גבוה", medium: "בינוני", low: "נמוך" };
const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  low: "bg-muted/20 text-muted-foreground border-gray-500/30",
};

const INITIAL_RULES: SlaRule[] = [
  { id: 1, name: "SLA דחוף", ticketType: "תמיכה טכנית", priority: "urgent", firstResponseHours: 1, resolutionHours: 4, escalationHours: 2, assignedTeam: "צוות בכיר", active: true },
  { id: 2, name: "SLA גבוה", ticketType: "תמיכה טכנית", priority: "high", firstResponseHours: 4, resolutionHours: 24, escalationHours: 8, assignedTeam: "תמיכה רגילה", active: true },
  { id: 3, name: "SLA בינוני", ticketType: "שאלה כללית", priority: "medium", firstResponseHours: 8, resolutionHours: 48, escalationHours: 24, assignedTeam: "תמיכה רגילה", active: true },
  { id: 4, name: "SLA נמוך", ticketType: "שאלה כללית", priority: "low", firstResponseHours: 24, resolutionHours: 96, escalationHours: 72, assignedTeam: "תמיכה רגילה", active: true },
  { id: 5, name: "SLA תלונות", ticketType: "תלונה", priority: "high", firstResponseHours: 2, resolutionHours: 12, escalationHours: 6, assignedTeam: "מנהל שירות", active: true },
];

const INITIAL_BREACHES: Breach[] = [
  { id: 1, ticket: "TKT-1023", customer: "אבקה בע\"מ", breachType: "resolution", priority: "urgent", assignedTo: "יוסי כהן", hoursOverdue: 3.5, status: "escalated", createdAt: "2026-03-15" },
  { id: 2, ticket: "TKT-1018", customer: "מגדל ביטוח", breachType: "first_response", priority: "high", assignedTo: "שרה לוי", hoursOverdue: 1.2, status: "open", createdAt: "2026-03-16" },
  { id: 3, ticket: "TKT-1015", customer: "חברת גבע", breachType: "resolution", priority: "medium", assignedTo: "דוד מזרחי", hoursOverdue: 8.0, status: "open", createdAt: "2026-03-14" },
  { id: 4, ticket: "TKT-1009", customer: "קנדי בע\"מ", breachType: "resolution", priority: "high", assignedTo: "רחל אברהם", hoursOverdue: 12.5, status: "escalated", createdAt: "2026-03-13" },
  { id: 5, ticket: "TKT-1005", customer: "דלתא סיסטמס", breachType: "first_response", priority: "urgent", assignedTo: "יוסי כהן", hoursOverdue: 0.5, status: "closed", createdAt: "2026-03-12" },
];

type AlertChannel = "email" | "whatsapp" | "sms" | "system";
type AlertSeverity = "critical" | "high" | "medium" | "low";

type SlaAlertRule = {
  id: number;
  name: string;
  condition: string;
  channels: AlertChannel[];
  recipients: string[];
  severity: AlertSeverity;
  active: boolean;
};

type SlaAlertEvent = {
  id: number;
  ruleId: number;
  ruleName: string;
  ticket: string;
  customer: string;
  message: string;
  channels: AlertChannel[];
  sentAt: string;
  severity: AlertSeverity;
  acknowledged: boolean;
};

const CHANNEL_LABELS: Record<AlertChannel, string> = {
  email: "מייל", whatsapp: "WhatsApp", sms: "SMS", system: "מערכת",
};
const CHANNEL_ICONS: Record<AlertChannel, React.ComponentType<{ className?: string }>> = {
  email: Mail, whatsapp: MessageSquare, sms: PhoneCall, system: Bell,
};
const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  critical: "קריטי", high: "גבוה", medium: "בינוני", low: "נמוך",
};
const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  high: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  medium: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  low: "bg-muted/20 text-muted-foreground border-gray-500/30",
};

const INITIAL_ALERT_RULES: SlaAlertRule[] = [
  { id: 1, name: "הפרת SLA דחוף", condition: "כרטיס דחוף חרג מ-SLA תגובה ראשונה", channels: ["email", "whatsapp", "system"], recipients: ["מנהל שירות", "צוות בכיר"], severity: "critical", active: true },
  { id: 2, name: "הסלמת SLA — לא נפתר", condition: "כרטיס לא נפתר תוך שעתיים מהפרה", channels: ["email", "sms"], recipients: ["מנהל שירות", "VP לקוחות"], severity: "high", active: true },
  { id: 3, name: "אזהרת SLA 80%", condition: "הגענו ל-80% מזמן ה-SLA ועדיין פתוח", channels: ["system"], recipients: ["נציג מוקצה"], severity: "medium", active: true },
  { id: 4, name: "הפרת SLA גבוה", condition: "כרטיס גבוה חרג מ-SLA פתרון", channels: ["email", "system"], recipients: ["מנהל שירות"], severity: "high", active: true },
  { id: 5, name: "דוח הפרות יומי", condition: "ריצה יומית — סיכום הפרות 24 שעות", channels: ["email"], recipients: ["הנהלה"], severity: "low", active: false },
];

const INITIAL_ALERT_EVENTS: SlaAlertEvent[] = [
  { id: 1, ruleId: 1, ruleName: "הפרת SLA דחוף", ticket: "TKT-1023", customer: "אבקה בע\"מ", message: "כרטיס TKT-1023 חרג ב-3.5 שעות מ-SLA פתרון עדיפות דחוף", channels: ["email", "whatsapp", "system"], sentAt: "2026-03-17 06:12:00", severity: "critical", acknowledged: false },
  { id: 2, ruleId: 2, ruleName: "הסלמת SLA — לא נפתר", ticket: "TKT-1009", customer: "קנדי בע\"מ", message: "TKT-1009 הוסלם — לא נפתר 12.5 שעות לאחר הפרת SLA", channels: ["email", "sms"], sentAt: "2026-03-17 05:44:00", severity: "high", acknowledged: true },
  { id: 3, ruleId: 3, ruleName: "אזהרת SLA 80%", ticket: "TKT-1031", customer: "ספרינט קום", message: "כרטיס TKT-1031 הגיע ל-80% מזמן SLA ועדיין פתוח", channels: ["system"], sentAt: "2026-03-17 04:30:00", severity: "medium", acknowledged: false },
  { id: 4, ruleId: 4, ruleName: "הפרת SLA גבוה", ticket: "TKT-1018", customer: "מגדל ביטוח", message: "TKT-1018 חרג מ-SLA תגובה ראשונה — עדיפות גבוה", channels: ["email", "system"], sentAt: "2026-03-17 03:15:00", severity: "high", acknowledged: false },
  { id: 5, ruleId: 1, ruleName: "הפרת SLA דחוף", ticket: "TKT-1015", customer: "חברת גבע", message: "כרטיס TKT-1015 חרג ב-8 שעות מ-SLA פתרון", channels: ["email", "whatsapp", "system"], sentAt: "2026-03-16 22:08:00", severity: "critical", acknowledged: true },
  { id: 6, ruleId: 5, ruleName: "דוח הפרות יומי", ticket: "—", customer: "—", message: "דוח יומי: 4 הפרות SLA ב-24 שעות האחרונות — ציות 87%", channels: ["email"], sentAt: "2026-03-16 08:00:00", severity: "low", acknowledged: true },
];

export default function SlaManagement() {
  const API = "/api";
  const token = () => document.cookie.match(/token=([^;]+)/)?.[1] || localStorage.getItem("erp_token") || "";
  const hdrs = { "Content-Type": "application/json", Authorization: `Bearer ${token()}` };

  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [rules, setRules] = useState<SlaRule[]>(INITIAL_RULES);
  const [breaches, setBreaches] = useState<Breach[]>(INITIAL_BREACHES);
  const [alertRules, setAlertRules] = useState<SlaAlertRule[]>(INITIAL_ALERT_RULES);
  const [alertEvents, setAlertEvents] = useState<SlaAlertEvent[]>(INITIAL_ALERT_EVENTS);
  const [slaStats, setSlaStats] = useState<{ activeBreaches: number; compliance: number; escalated: number; avgFirstResponse: number; avgResolution: number } | null>(null);
  const [activeTab, setActiveTab] = useState<"dashboard" | "rules" | "breaches" | "alerts" | "history">("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<SlaRule | null>(null);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const slaValidation = useFormValidation({ name: { required: true }, firstResponseHours: { min: 0 }, resolutionHours: { min: 0 } });
  const [detailTab, setDetailTab] = useState("details");
  const [viewDetailBreach, setViewDetailBreach] = useState<Breach | null>(null);
  const [form, setForm] = useState<Partial<SlaRule>>({});
  const [expandedRule, setExpandedRule] = useState<number | null>(null);
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const loadData = useCallback(() => {
    authFetch(`${API}/sla-rules`, { headers: hdrs }).then(r => r.json()).then((d: unknown) => {
      if (Array.isArray(d) && d.length > 0) {
        setRules((d as Record<string, unknown>[]).map(x => ({
          id: Number(x.id), name: String(x.name || ""), ticketType: String(x.ticket_type || ""),
          priority: String(x.priority || "medium"), firstResponseHours: Number(x.first_response_hours || 4),
          resolutionHours: Number(x.resolution_hours || 24), escalationHours: Number(x.escalation_hours || 8),
          assignedTeam: String(x.assigned_team || ""), active: Boolean(x.active),
        })));
      }
    }).catch(() => null);
    authFetch(`${API}/sla-breaches`, { headers: hdrs }).then(r => r.json()).then((d: unknown) => {
      if (Array.isArray(d) && d.length > 0) {
        setBreaches((d as Record<string, unknown>[]).map(x => ({
          id: Number(x.id), ticket: String(x.ticket || ""), customer: String(x.customer || ""),
          breachType: (x.breach_type as "first_response" | "resolution") || "resolution",
          priority: String(x.priority || "medium"), assignedTo: String(x.assigned_to || ""),
          hoursOverdue: Number(x.hours_overdue || 0), status: (x.status as "open" | "escalated" | "closed") || "open",
          createdAt: String(x.created_at || ""),
        })));
      }
    }).catch(() => null);
    authFetch(`${API}/sla-alert-rules`, { headers: hdrs }).then(r => r.json()).then((d: unknown) => {
      if (Array.isArray(d) && d.length > 0) {
        setAlertRules((d as Record<string, unknown>[]).map(x => ({
          id: Number(x.id), name: String(x.name || ""), condition: String(x.condition || ""),
          channels: (Array.isArray(x.channels) ? x.channels : []) as AlertChannel[],
          recipients: Array.isArray(x.recipients) ? x.recipients.map(String) : [],
          severity: (x.severity as AlertSeverity) || "medium", active: Boolean(x.active),
        })));
      }
    }).catch(() => null);
    authFetch(`${API}/sla-alert-events`, { headers: hdrs }).then(r => r.json()).then((d: unknown) => {
      if (Array.isArray(d) && d.length > 0) {
        setAlertEvents((d as Record<string, unknown>[]).map(x => ({
          id: Number(x.id), ruleId: Number(x.rule_id || 0), ruleName: String(x.rule_name || ""),
          ticket: String(x.ticket || ""), customer: String(x.customer || ""), message: String(x.message || ""),
          channels: (Array.isArray(x.channels) ? x.channels : []) as AlertChannel[],
          severity: (x.severity as AlertSeverity) || "medium", acknowledged: Boolean(x.acknowledged),
          sentAt: String(x.sent_at || ""),
        })));
      }
    }).catch(() => null);
    authFetch(`${API}/sla-stats`, { headers: hdrs }).then(r => r.json()).then((d: unknown) => {
      if (d && typeof d === "object") setSlaStats(d as typeof slaStats);
    }).catch(() => null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadData(); }, [loadData]);

  const kpis = useMemo(() => {
    if (slaStats) return slaStats;
    const activeBreaches = breaches.filter(b => b.status !== "closed");
    return { activeBreaches: activeBreaches.length, compliance: 87, avgFirstResponse: 2.3, avgResolution: 18.5, escalated: breaches.filter(b => b.status === "escalated").length };
  }, [breaches, slaStats]);

  const openCreate = () => {
    setEditingRule(null);
    setForm({ ticketType: "תמיכה טכנית", priority: "medium", firstResponseHours: 4, resolutionHours: 24, escalationHours: 8, active: true });
    setShowForm(true);
  };
  const openEdit = (rule: SlaRule) => {
    setEditingRule(rule);
    setForm({ ...rule });
    setShowForm(true);
  };
  const saveRule = async () => {
    if (!slaValidation.validate(form)) return;
    if (editingRule) {
      await authFetch(`${API}/sla-rules/${editingRule.id}`, { method: "PUT", headers: hdrs, body: JSON.stringify({
        name: form.name, ticketType: form.ticketType, priority: form.priority,
        firstResponseHours: form.firstResponseHours, resolutionHours: form.resolutionHours,
        escalationHours: form.escalationHours, assignedTeam: form.assignedTeam, active: form.active,
      }) }).catch(() => null);
      setRules(r => r.map(x => x.id === editingRule.id ? { ...editingRule, ...form } : x));
    } else {
      const res = await authFetch(`${API}/sla-rules`, { method: "POST", headers: hdrs, body: JSON.stringify({
        name: form.name || "כלל SLA חדש", ticketType: form.ticketType || "תמיכה טכנית",
        priority: form.priority || "medium", firstResponseHours: form.firstResponseHours ?? 4,
        resolutionHours: form.resolutionHours ?? 24, escalationHours: form.escalationHours ?? 8,
        assignedTeam: form.assignedTeam || "תמיכה רגילה", active: form.active !== false,
      }) }).then(r => r.json()).catch(() => null);
      if (res?.id) {
        loadData();
      } else {
        const newId = Math.max(...rules.map(r => r.id), 0) + 1;
        const newRule: SlaRule = {
          id: newId, name: form.name || "כלל SLA חדש", ticketType: form.ticketType || "תמיכה טכנית",
          priority: form.priority || "medium", firstResponseHours: form.firstResponseHours ?? 4,
          resolutionHours: form.resolutionHours ?? 24, escalationHours: form.escalationHours ?? 8,
          assignedTeam: form.assignedTeam || "תמיכה רגילה", active: form.active ?? true,
        };
        setRules(r => [...r, newRule]);
      }
    }
    setShowForm(false);
  };
  const deleteRule = async (id: number) => {
    if (await globalConfirm("למחוק כלל SLA?")) {
      await authFetch(`${API}/sla-rules/${id}`, { method: "DELETE", headers: hdrs }).catch(() => null);
      setRules(r => r.filter(x => x.id !== id));
    }
  };
  const toggleRule = async (id: number) => {
    await authFetch(`${API}/sla-rules/${id}`, { method: "PUT", headers: hdrs, body: JSON.stringify({
      ...rules.find(x => x.id === id), active: !rules.find(x => x.id === id)?.active,
    }) }).catch(() => null);
    setRules(r => r.map(x => x.id === id ? { ...x, active: !x.active } : x));
  };

  const filteredBreaches = breaches.filter(b => {
    if (filterPriority && b.priority !== filterPriority) return false;
    if (filterStatus && b.status !== filterStatus) return false;
    return true;
  });

  const complianceColor = kpis.compliance >= 90 ? "text-green-400" : kpis.compliance >= 75 ? "text-amber-400" : "text-red-400";
  const complianceBg = kpis.compliance >= 90 ? "bg-green-500" : kpis.compliance >= 75 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-7 h-7 text-primary" />ניהול SLA</h1>
          <p className="text-sm text-muted-foreground">הגדרת חוקי SLA, מעקב הפרות ודשבורד ביצועים</p>
        </div>
        <div className="flex gap-2">
          {activeTab === "rules" && (
            <button onClick={openCreate} className="btn btn-primary btn-sm flex items-center gap-1"><Plus className="w-4 h-4" />כלל SLA חדש</button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto pb-0">
        {(
          [
            { id: "dashboard", label: "דשבורד", icon: BarChart3 },
            { id: "rules", label: "כללי SLA", icon: ShieldCheck },
            { id: "breaches", label: "הפרות פעילות", icon: AlertTriangle },
            { id: "alerts", label: "התראות", icon: Bell },
            { id: "history", label: "היסטוריה", icon: Clock },
          ] as const
        ).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <tab.icon className="w-4 h-4" />{tab.label}
            {tab.id === "breaches" && kpis.activeBreaches > 0 && (
              <span className="bg-red-500 text-foreground text-xs px-1.5 py-0.5 rounded-full">{kpis.activeBreaches}</span>
            )}
            {tab.id === "alerts" && alertEvents.filter(e => !e.acknowledged).length > 0 && (
              <span className="bg-orange-500 text-foreground text-xs px-1.5 py-0.5 rounded-full">{alertEvents.filter(e => !e.acknowledged).length}</span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {[
              { label: "עמידה ב-SLA", value: `${kpis.compliance}%`, icon: CheckCircle, color: complianceColor, bg: "bg-green-500/10" },
              { label: "הפרות פעילות", value: kpis.activeBreaches, icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
              { label: "הסלמות פעילות", value: kpis.escalated, icon: Zap, color: "text-orange-400", bg: "bg-orange-500/10" },
              { label: "זמן תגובה ממוצע", value: `${kpis.avgFirstResponse}ש'`, icon: Clock, color: "text-blue-400", bg: "bg-blue-500/10" },
              { label: "זמן פתרון ממוצע", value: `${kpis.avgResolution}ש'`, icon: Timer, color: "text-purple-400", bg: "bg-purple-500/10" },
            ].map((k, i) => (
              <div key={i} className="bg-card border rounded-xl p-4">
                <div className={`w-10 h-10 rounded-lg ${k.bg} flex items-center justify-center mb-3`}>
                  <k.icon className={`w-5 h-5 ${k.color}`} />
                </div>
                <div className={`text-lg sm:text-2xl font-bold ${k.color}`}>{k.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{k.label}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card border rounded-xl p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><Target className="w-4 h-4 text-primary" />עמידה ב-SLA לפי עדיפות</h3>
              <div className="space-y-3">
                {[
                  { label: "דחוף", value: 72, color: "bg-red-500" },
                  { label: "גבוה", value: 85, color: "bg-orange-500" },
                  { label: "בינוני", value: 92, color: "bg-blue-500" },
                  { label: "נמוך", value: 97, color: "bg-green-500" },
                ].map((item, i) => (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{item.label}</span>
                      <span className="font-medium">{item.value}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.value}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border rounded-xl p-5">
              <h3 className="font-semibold mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-primary" />הפרות לפי קטגוריה</h3>
              <div className="space-y-2">
                {[
                  { label: "תמיכה טכנית", breaches: 8, total: 45, pct: 82 },
                  { label: "תלונות", breaches: 2, total: 12, pct: 83 },
                  { label: "חיוב", breaches: 1, total: 18, pct: 94 },
                  { label: "שאלה כללית", breaches: 0, total: 30, pct: 100 },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-sm">{item.label}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{item.breaches} הפרות מתוך {item.total}</span>
                      <span className={`text-sm font-bold ${item.pct >= 90 ? "text-green-400" : item.pct >= 75 ? "text-amber-400" : "text-red-400"}`}>{item.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-card border rounded-xl p-5">
            <h3 className="font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" />הפרות SLA פעילות</h3>
            <div className="space-y-2">
              {breaches.filter(b => b.status !== "closed").slice(0, 5).map(b => (
                <div key={b.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div>
                    <span className="font-medium text-sm">{b.ticket}</span>
                    <span className="text-xs text-muted-foreground mr-2">{b.customer}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs border ${PRIORITY_COLORS[b.priority]}`}>{PRIORITY_LABELS[b.priority]}</span>
                    <span className="text-xs text-red-400 font-medium">+{b.hoursOverdue}ש' באיחור</span>
                    {b.status === "escalated" && <span className="px-2 py-0.5 rounded text-xs bg-orange-500/20 text-orange-400">הוסלם</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3">
            {rules.map(rule => (
              <div key={rule.id} className={`bg-card border rounded-xl overflow-hidden ${!rule.active ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${rule.active ? "bg-green-500" : "bg-muted"}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{rule.name}</span>
                        <span className={`px-2 py-0.5 rounded text-xs border ${PRIORITY_COLORS[rule.priority]}`}>{PRIORITY_LABELS[rule.priority]}</span>
                        <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">{rule.ticketType}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                        <span>תגובה ראשונה: {rule.firstResponseHours}ש'</span>
                        <span>פתרון: {rule.resolutionHours}ש'</span>
                        <span>הסלמה: {rule.escalationHours}ש'</span>
                        <span>צוות: {rule.assignedTeam}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)} className="btn btn-ghost btn-xs">
                      {expandedRule === rule.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button onClick={() => toggleRule(rule.id)} className={`btn btn-ghost btn-xs ${rule.active ? "text-green-400" : "text-muted-foreground"}`}>
                      {rule.active ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    </button>
                    <button onClick={() => openEdit(rule)} className="btn btn-ghost btn-xs"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => deleteRule(rule.id)} className="btn btn-ghost btn-xs text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                {expandedRule === rule.id && (
                  <div className="border-t border-border bg-muted/20 p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-card rounded-lg p-3 text-center">
                        <Clock className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                        <div className="text-lg font-bold text-blue-400">{rule.firstResponseHours}ש'</div>
                        <div className="text-xs text-muted-foreground">תגובה ראשונה</div>
                      </div>
                      <div className="bg-card rounded-lg p-3 text-center">
                        <CheckCircle className="w-5 h-5 text-green-400 mx-auto mb-1" />
                        <div className="text-lg font-bold text-green-400">{rule.resolutionHours}ש'</div>
                        <div className="text-xs text-muted-foreground">פתרון מלא</div>
                      </div>
                      <div className="bg-card rounded-lg p-3 text-center">
                        <Zap className="w-5 h-5 text-orange-400 mx-auto mb-1" />
                        <div className="text-lg font-bold text-orange-400">{rule.escalationHours}ש'</div>
                        <div className="text-xs text-muted-foreground">הסלמה</div>
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-muted-foreground">
                      <Users className="w-4 h-4 inline ml-1" />צוות טיפול: <span className="font-medium text-foreground">{rule.assignedTeam}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "breaches" && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap">
            <select className="select select-bordered select-sm" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
              <option value="">כל העדיפויות</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </select>
            <select className="select select-bordered select-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">כל הסטטוסים</option>
              <option value="open">פתוח</option>
              <option value="escalated">הוסלם</option>
              <option value="closed">סגור</option>
            </select>
          </div>
          <BulkActions items={filteredBreaches} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
            defaultBulkActions.export(async (ids) => { const rows = filteredBreaches.filter(b => ids.has(b.id)); const csv = ["פנייה,לקוח,סוג,עדיפות,איחור,סטטוס", ...rows.map(b => `${b.ticket},${b.customer},${b.breachType},${b.priority},${b.hoursOverdue},${b.status}`)].join("\n"); const b = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "sla_breaches.csv"; a.click(); }),
          ]} />
          <div className="border rounded-xl overflow-auto">
            <table className="table table-sm w-full">
              <thead><tr className="bg-muted/50">
                <th className="w-10"><BulkCheckbox items={filteredBreaches} selectedIds={selectedIds} onToggleAll={toggleAll} mode="all" /></th>
                <th>פנייה</th><th>לקוח</th><th>סוג הפרה</th><th>עדיפות</th><th>מטפל</th><th>איחור</th><th>סטטוס</th><th>נפתח</th>
              </tr></thead>
              <tbody>
                {filteredBreaches.map(b => (
                  <tr key={b.id} className={`hover:bg-muted/30 ${isSelected(b.id) ? "bg-primary/5" : ""} ${b.status === "escalated" ? "border-r-2 border-r-orange-500" : b.priority === "urgent" ? "border-r-2 border-r-red-500" : ""}`}>
                    <td><BulkCheckbox id={b.id} selectedIds={selectedIds} onToggle={toggle} mode="single" /></td>
                    <td className="font-mono text-xs font-bold cursor-pointer hover:text-primary" onClick={() => setViewDetailBreach(b)}>{b.ticket}</td>
                    <td>{b.customer}</td>
                    <td className="text-xs">{b.breachType === "first_response" ? "תגובה ראשונה" : "פתרון"}</td>
                    <td><span className={`px-2 py-0.5 rounded text-xs border ${PRIORITY_COLORS[b.priority]}`}>{PRIORITY_LABELS[b.priority]}</span></td>
                    <td className="text-sm">{b.assignedTo}</td>
                    <td className="font-bold text-red-400">+{b.hoursOverdue}ש&apos;</td>
                    <td>
                      {b.status === "open" && <span className="px-2 py-0.5 rounded text-xs bg-blue-500/20 text-blue-400">פתוח</span>}
                      {b.status === "escalated" && <span className="px-2 py-0.5 rounded text-xs bg-orange-500/20 text-orange-400">הוסלם</span>}
                      {b.status === "closed" && <span className="px-2 py-0.5 rounded text-xs bg-muted/20 text-muted-foreground">סגור</span>}
                    </td>
                    <td className="text-xs text-muted-foreground">{b.createdAt}</td>
                  </tr>
                ))}
                {filteredBreaches.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">אין הפרות להצגה</td></tr>}
              </tbody>
            </table>
          </div>

          {viewDetailBreach && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setViewDetailBreach(null); setDetailTab("details"); }}>
              <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-border flex justify-between items-center">
                  <h2 className="text-lg font-bold text-foreground">{viewDetailBreach.ticket} — {viewDetailBreach.customer}</h2>
                  <button onClick={() => { setViewDetailBreach(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex border-b border-border/50">
                  {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                    <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
                  ))}
                </div>
                {detailTab === "details" && (
                  <>
                    <div className="p-5">
                      <StatusTransition currentStatus={viewDetailBreach.status} statuses={[{key:"open",label:"פתוח",color:"bg-blue-500/20 text-blue-400"},{key:"escalated",label:"הוסלם",color:"bg-orange-500/20 text-orange-400"},{key:"closed",label:"סגור",color:"bg-muted/20 text-muted-foreground"}]} transitions={{open:["escalated","closed"],escalated:["closed"],closed:[]}} onTransition={async (newStatus) => { await authFetch(`${API}/sla-breaches/${viewDetailBreach.id}`, { method: "PUT", headers: hdrs, body: JSON.stringify({ status: newStatus }) }).catch(() => null); setViewDetailBreach({ ...viewDetailBreach, status: newStatus as any }); loadData(); }} entityId={viewDetailBreach.id} />
                    </div>
                    <div className="p-5 grid grid-cols-2 gap-4 text-sm">
                      <div><span className="text-xs text-muted-foreground block">פנייה</span><span className="font-medium">{viewDetailBreach.ticket}</span></div>
                      <div><span className="text-xs text-muted-foreground block">לקוח</span><span>{viewDetailBreach.customer}</span></div>
                      <div><span className="text-xs text-muted-foreground block">סוג הפרה</span><span>{viewDetailBreach.breachType === "first_response" ? "תגובה ראשונה" : "פתרון"}</span></div>
                      <div><span className="text-xs text-muted-foreground block">עדיפות</span><span className={`px-2 py-0.5 rounded text-xs border ${PRIORITY_COLORS[viewDetailBreach.priority]}`}>{PRIORITY_LABELS[viewDetailBreach.priority]}</span></div>
                      <div><span className="text-xs text-muted-foreground block">מטפל</span><span>{viewDetailBreach.assignedTo}</span></div>
                      <div><span className="text-xs text-muted-foreground block">איחור</span><span className="text-red-400 font-bold">+{viewDetailBreach.hoursOverdue} שעות</span></div>
                    </div>
                  </>
                )}
                {detailTab === "related" && (
                  <div className="p-5"><RelatedRecords tabs={[{key:"tickets",label:"פניות",endpoint:`${API}/sla-breaches/${viewDetailBreach.id}/tickets`,columns:[{key:"ticket_number",label:"מספר"},{key:"subject",label:"נושא"},{key:"status",label:"סטטוס"}]},{key:"breaches",label:"הפרות קשורות",endpoint:`${API}/sla-breaches/${viewDetailBreach.id}/related`,columns:[{key:"ticket",label:"פנייה"},{key:"breach_type",label:"סוג"},{key:"hours_overdue",label:"איחור"}]}]} /></div>
                )}
                {detailTab === "docs" && (
                  <div className="p-5"><AttachmentsSection entityType="sla-breach" entityId={viewDetailBreach.id} /></div>
                )}
                {detailTab === "history" && (
                  <div className="p-5"><ActivityLog entityType="sla-breach" entityId={viewDetailBreach.id} /></div>
                )}
                <div className="p-5 border-t border-border flex justify-end"><button onClick={() => { setViewDetailBreach(null); setDetailTab("details"); }} className="btn btn-outline btn-sm">סגור</button></div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "history" && (
        <div className="bg-card border rounded-xl p-6">
          <h3 className="font-semibold mb-4">היסטוריית SLA — 30 ימים אחרונים</h3>
          <div className="space-y-3">
            {[
              { date: "2026-03-17", compliance: 89, breaches: 3, resolved: 45 },
              { date: "2026-03-16", compliance: 91, breaches: 2, resolved: 38 },
              { date: "2026-03-15", compliance: 85, breaches: 5, resolved: 52 },
              { date: "2026-03-14", compliance: 93, breaches: 1, resolved: 29 },
              { date: "2026-03-13", compliance: 87, breaches: 4, resolved: 41 },
              { date: "2026-03-12", compliance: 94, breaches: 1, resolved: 33 },
              { date: "2026-03-11", compliance: 78, breaches: 7, resolved: 48 },
            ].map((day, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                <span className="text-sm font-medium">{day.date}</span>
                <div className="flex items-center gap-6">
                  <span className="text-xs text-muted-foreground">{day.resolved} פניות נסגרו</span>
                  <span className="text-xs text-red-400">{day.breaches} הפרות</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${day.compliance >= 90 ? "bg-green-500" : day.compliance >= 75 ? "bg-amber-500" : "bg-red-500"}`}
                        style={{ width: `${day.compliance}%` }} />
                    </div>
                    <span className={`text-sm font-bold ${day.compliance >= 90 ? "text-green-400" : day.compliance >= 75 ? "text-amber-400" : "text-red-400"}`}>{day.compliance}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "alerts" && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-card border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2"><Bell className="w-4 h-4 text-primary" />כללי התראה</h3>
                <span className="text-xs text-muted-foreground">{alertRules.filter(r => r.active).length} פעילים</span>
              </div>
              <div className="space-y-3">
                {alertRules.map(rule => (
                  <div key={rule.id} className={`border rounded-lg p-3 ${!rule.active ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-medium text-sm">{rule.name}</span>
                          <span className={`px-2 py-0.5 rounded text-xs border ${SEVERITY_COLORS[rule.severity]}`}>{SEVERITY_LABELS[rule.severity]}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{rule.condition}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">ערוצים:</span>
                          {rule.channels.map(ch => {
                            const Icon = CHANNEL_ICONS[ch];
                            return (
                              <span key={ch} className="flex items-center gap-0.5 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                <Icon className="w-3 h-3" />{CHANNEL_LABELS[ch]}
                              </span>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-muted-foreground">נמענים:</span>
                          {rule.recipients.map(r => (
                            <span key={r} className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{r}</span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          await authFetch(`${API}/sla-alert-rules/${rule.id}`, { method: "PUT", headers: hdrs, body: JSON.stringify({ ...rule, active: !rule.active }) }).catch(() => null);
                          setAlertRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: !r.active } : r));
                        }}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors mr-2 flex-shrink-0 ${rule.active ? "bg-primary" : "bg-muted"}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-card transition-transform ${rule.active ? "translate-x-[-18px]" : "translate-x-[-4px]"}`} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-card border rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-orange-400" />התראות אחרונות</h3>
                <span className="text-xs text-orange-400 font-medium">{alertEvents.filter(e => !e.acknowledged).length} לא מאושרות</span>
              </div>
              <div className="space-y-3">
                {alertEvents.map(event => (
                  <div key={event.id} className={`border rounded-lg p-3 ${!event.acknowledged ? "border-orange-500/30 bg-orange-500/5" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`px-2 py-0.5 rounded text-xs border ${SEVERITY_COLORS[event.severity]}`}>{SEVERITY_LABELS[event.severity]}</span>
                          {event.ticket !== "—" && <span className="text-xs font-mono text-muted-foreground">{event.ticket}</span>}
                          {!event.acknowledged && <span className="text-xs bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">חדש</span>}
                        </div>
                        <p className="text-xs text-foreground mb-1">{event.message}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{event.sentAt}</span>
                          <span className="flex items-center gap-1">
                            {event.channels.map(ch => {
                              const Icon = CHANNEL_ICONS[ch];
                              return <Icon key={ch} className="w-3 h-3" />;
                            })}
                          </span>
                        </div>
                      </div>
                      {!event.acknowledged && (
                        <button
                          onClick={async () => {
                            await authFetch(`${API}/sla-alert-events/${event.id}/acknowledge`, { method: "PUT", headers: hdrs }).catch(() => null);
                            setAlertEvents(prev => prev.map(e => e.id === event.id ? { ...e, acknowledged: true } : e));
                          }}
                          className="btn btn-xs btn-outline flex-shrink-0"
                        >
                          <CheckCircle className="w-3 h-3" />אשר
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold">{editingRule ? "עריכת כלל SLA" : "כלל SLA חדש"}</h2>
            <div className="space-y-3">
              <div><label className="text-sm font-medium">שם הכלל <RequiredMark /></label>
                <input className="input input-bordered w-full h-9 text-sm mt-1" value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} /><FormFieldError error={slaValidation.errors.name} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-sm font-medium">סוג פנייה</label>
                  <select className="select select-bordered w-full select-sm mt-1" value={form.ticketType || ""} onChange={e => setForm({ ...form, ticketType: e.target.value })}>
                    {TICKET_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select></div>
                <div><label className="text-sm font-medium">עדיפות</label>
                  <select className="select select-bordered w-full select-sm mt-1" value={form.priority || ""} onChange={e => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                  </select></div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="text-sm font-medium">תגובה ראשונה (שעות)</label>
                  <input type="number" className="input input-bordered w-full h-9 text-sm mt-1" value={form.firstResponseHours || 0} onChange={e => setForm({ ...form, firstResponseHours: Number(e.target.value) })} /><FormFieldError error={slaValidation.errors.firstResponseHours} /></div>
                <div><label className="text-sm font-medium">פתרון (שעות)</label>
                  <input type="number" className="input input-bordered w-full h-9 text-sm mt-1" value={form.resolutionHours || 0} onChange={e => setForm({ ...form, resolutionHours: Number(e.target.value) })} /><FormFieldError error={slaValidation.errors.resolutionHours} /></div>
                <div><label className="text-sm font-medium">הסלמה (שעות)</label>
                  <input type="number" className="input input-bordered w-full h-9 text-sm mt-1" value={form.escalationHours || 0} onChange={e => setForm({ ...form, escalationHours: Number(e.target.value) })} /></div>
              </div>
              <div><label className="text-sm font-medium">צוות אחראי</label>
                <input className="input input-bordered w-full h-9 text-sm mt-1" value={form.assignedTeam || ""} onChange={e => setForm({ ...form, assignedTeam: e.target.value })} /></div>
              <div className="flex items-center gap-2">
                <input type="checkbox" className="checkbox checkbox-sm" checked={form.active !== false} onChange={e => setForm({ ...form, active: e.target.checked })} />
                <span className="text-sm">כלל פעיל</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="btn btn-outline btn-sm">ביטול</button>
              <button onClick={saveRule} className="btn btn-primary btn-sm">שמירה</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
