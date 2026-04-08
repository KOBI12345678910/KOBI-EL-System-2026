import { useState, useEffect, useMemo } from "react";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import {
  UserPlus, Search, TrendingUp, Target, Plus, Edit, Trash2, Download, Printer,
  ArrowUpDown, DollarSign, AlertTriangle, Clock, Users, Star, Phone, Mail,
  Building2, MapPin, Globe, Linkedin, MessageSquare, BarChart3, Tag, Calendar,
  Briefcase, Award, Activity, ChevronDown, ChevronUp, User, Heart, Loader2, Eye, X, Copy
} from "lucide-react";
import { EmptyState } from "@/components/ui/unified-states";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { useApiAction, ActionButton } from "@/hooks/use-api-action";
import ImportButton from "@/components/import-button";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import RelatedRecords from "@/components/related-records";
import AttachmentsSection from "@/components/attachments-section";
import ActivityLog from "@/components/activity-log";
import StatusTransition from "@/components/status-transition";
import CommunicationTimeline from "@/components/communication-timeline";
import WhatsAppConversation from "@/components/whatsapp-conversation";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const getHeaders = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("erp_token") || ""}` });
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);
const fmtC = (n: number) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", minimumFractionDigits: 0 }).format(n);
type Lead = any;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  new: { label: "חדש", color: "bg-blue-500/20 text-blue-400" },
  contacted: { label: "נוצר קשר", color: "bg-cyan-500/20 text-cyan-400" },
  qualified: { label: "מוסמך", color: "bg-purple-500/20 text-purple-400" },
  proposal: { label: "הצעה נשלחה", color: "bg-amber-500/20 text-amber-400" },
  negotiation: { label: "משא ומתן", color: "bg-orange-500/20 text-orange-400" },
  converted: { label: "הומר ללקוח", color: "bg-green-500/20 text-green-400" },
  lost: { label: "אבוד", color: "bg-red-500/20 text-red-400" },
};
const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  low: { label: "נמוך", color: "bg-muted/20 text-muted-foreground" },
  medium: { label: "בינוני", color: "bg-blue-500/20 text-blue-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  urgent: { label: "דחוף", color: "bg-red-500/20 text-red-400" },
};
const SOURCES = ["אתר", "טלפון", "הפניה", "פייסבוק", "גוגל", "תערוכה", "סוכן שטח", "לינקדאין", "דוא\"ל", "WhatsApp", "אחר"];
const INDUSTRIES = ["טכנולוגיה", "מסחר קמעונאי", "תעשייה", "בנייה ונדל\"ן", "שירותים פיננסיים", "בריאות", "חינוך", "פרסום ושיווק", "לוגיסטיקה", "מזון ומשקאות", "אחר"];
const COMPANY_SIZES = ["מיקרו (1-9)", "קטנה (10-49)", "בינונית (50-249)", "גדולה (250-999)", "ענק (1000+)"];
const BUDGETS = ["עד ₪5,000", "₪5,000-₪20,000", "₪20,000-₪50,000", "₪50,000-₪100,000", "מעל ₪100,000"];
const TIMELINES = ["מיידי", "תוך חודש", "1-3 חודשים", "3-6 חודשים", "מעל 6 חודשים"];
const CONTACT_PREFS = ["טלפון", "אימייל", "WhatsApp", "פגישה", "זום"];
const LEAD_TEMPS = ["קר", "פושר", "חם", "לוהט"];

const FIELD_GROUPS = [
  { id: "contact", label: "פרטי קשר", icon: Phone },
  { id: "business", label: "מידע עסקי", icon: Building2 },
  { id: "source", label: "מקור ושיווק", icon: Globe },
  { id: "score", label: "ציון וסיכויים", icon: BarChart3 },
  { id: "social", label: "רשתות חברתיות", icon: Linkedin },
  { id: "preferences", label: "העדפות ותקציב", icon: Heart },
  { id: "history", label: "היסטוריה ומעקב", icon: Activity },
  { id: "custom", label: "שדות מותאמים", icon: Tag },
];

export default function LeadsManagement() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<Lead[]>([]);
  const [stats, setStats] = useState<any>({});
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [form, setForm] = useState<any>({});
  const [activeGroup, setActiveGroup] = useState("contact");
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [tableLoading, setTableLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState(false);
  const pagination = useSmartPagination(25);
  const { executeSave, executeDelete, loading } = useApiAction();
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected, isAllSelected, isSomeSelected } = useBulkSelection();
  const validation = useFormValidation({ firstName: { required: true }, lastName: { required: true } });
  const [detailTab, setDetailTab] = useState("details");
  const [viewDetail, setViewDetail] = useState<Lead | null>(null);

  const load = () => {
    setTableLoading(true);
    setLoadError(null);
    const leadsPromise = authFetch(`${API}/crm-leads`, { headers: getHeaders() })
      .then(res => { if (!res.ok) throw new Error(`שגיאת שרת: ${res.status}`); return res.json(); })
      .then(d => setItems((Array.isArray(d) ? d : []).filter(x => x !== null && x !== undefined && typeof x === "object")))
      .catch(err => { setItems([]); throw err instanceof Error ? err : new Error("שגיאה בטעינת הלידים"); });
    setStatsError(false);
    const statsPromise = authFetch(`${API}/crm-leads/stats`, { headers: getHeaders() })
      .then(res => res.ok ? res.json() : Promise.resolve(null))
      .then(d => { if (d === null) { setStatsError(true); setStats({}); } else { setStats(d && typeof d === "object" ? d : {}); } })
      .catch(() => { setStatsError(true); setStats({}); });
    Promise.all([leadsPromise, statsPromise])
      .catch((err) => setLoadError(err?.message || "שגיאה בטעינת הנתונים"))
      .finally(() => setTableLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    let f = items.filter(r => {
      if (!r || typeof r !== "object" || r.id == null) return false;
      const s = `${r.first_name ?? ""} ${r.last_name ?? ""} ${r.company ?? ""} ${r.lead_number ?? ""} ${r.phone ?? ""} ${r.email ?? ""}`.toLowerCase();
      if (search && !s.includes(search.toLowerCase())) return false;
      if (filterStatus && (r.status ?? "") !== filterStatus) return false;
      if (filterPriority && (r.priority ?? "") !== filterPriority) return false;
      return true;
    });
    f.sort((a: any, b: any) => {
      if (!a || !b) return 0;
      const v = String(a[sortField] ?? "") > String(b[sortField] ?? "") ? 1 : -1;
      return sortDir === "asc" ? v : -v;
    });
    return f;
  }, [items, search, filterStatus, filterPriority, sortField, sortDir]);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "new", priority: "medium", source: "טלפון", estimatedValue: 0, leadScore: 50, leadTemp: "פושר" });
    setActiveGroup("contact");
    setShowForm(true);
  };
  const openEdit = (r: Lead) => {
    setEditing(r);
    setForm({
      firstName: r.first_name, lastName: r.last_name, company: r.company, phone: r.phone, email: r.email,
      source: r.source, status: r.status, priority: r.priority, assignedTo: r.assigned_to,
      estimatedValue: r.estimated_value, productInterest: r.product_interest, address: r.address,
      city: r.city, notes: r.notes, nextFollowUp: r.next_follow_up?.slice(0, 10),
      lastContactDate: r.last_contact_date?.slice(0, 10), tags: r.tags, lostReason: r.lost_reason,
      jobTitle: r.job_title, industry: r.industry, companySize: r.company_size, website: r.website,
      linkedinUrl: r.linkedin_url, facebookUrl: r.facebook_url, whatsapp: r.whatsapp,
      budget: r.budget, timeline: r.timeline, contactPreference: r.contact_preference,
      leadTemp: r.lead_temp, leadScore: r.lead_score || 50, competitors: r.competitors,
      painPoints: r.pain_points, referredBy: r.referred_by, campaignName: r.campaign_name,
      utmSource: r.utm_source, utmMedium: r.utm_medium, utmCampaign: r.utm_campaign,
      firstContactDate: r.first_contact_date?.slice(0, 10), meetingDate: r.meeting_date?.slice(0, 10),
      proposalDate: r.proposal_date?.slice(0, 10), decisionDate: r.decision_date?.slice(0, 10),
      country: r.country, zipCode: r.zip_code, region: r.region, contactsCount: r.contacts_count,
      annualRevenue: r.annual_revenue, numberOfEmployees: r.number_of_employees,
      customField1: r.custom_field_1, customField2: r.custom_field_2, customField3: r.custom_field_3,
      customField4: r.custom_field_4, customField5: r.custom_field_5,
      interactionCount: r.interaction_count, emailOpenRate: r.email_open_rate,
      proposalValue: r.proposal_value, discountOffered: r.discount_offered,
      probability: r.probability || 0, expectedCloseDate: r.expected_close_date?.slice(0, 10),
    });
    setActiveGroup("contact");
    setShowForm(true);
  };
  const save = async () => {
    if (!validation.validate(form)) return;
    const url = editing ? `${API}/crm-leads/${editing.id}` : `${API}/crm-leads`;
    await executeSave(
      () => fetch(url, { method: editing ? "PUT" : "POST", headers: getHeaders(), body: JSON.stringify(form) }),
      !!editing,
      {
        successMessage: editing ? "ליד עודכן בהצלחה" : "ליד נוצר בהצלחה",
        onSuccess: async (saved) => {
          const savedId = editing ? editing.id : (saved.id || saved.insertId);
          if (savedId) {
            await authFetch(`${API}/crm-leads/${savedId}/extended`, {
              method: "PUT", headers: getHeaders(),
              body: JSON.stringify({
                whatsapp: form.whatsapp, phone2: form.phone2, region: form.region,
                zip: form.zipCode, country: form.country, contactPreference: form.contactPreference,
                website: form.website, industry: form.industry, companySize: form.companySize,
                annualRevenue: form.annualRevenue, employeesCount: form.numberOfEmployees,
                competitors: form.competitors, painPoints: form.painPoints,
                referralName: form.referredBy, campaign: form.campaignName,
                utmSource: form.utmSource, utmMedium: form.utmMedium, utmCampaign: form.utmCampaign,
                leadScore: form.leadScore, leadTemperature: form.leadTemp,
                probability: form.probability, expectedCloseDate: form.expectedCloseDate,
                budget: form.budget, timeline: form.timeline, linkedin: form.linkedinUrl,
                facebook: form.facebookUrl, instagram: form.instagram, twitter: form.twitter,
                contactsCount: form.contactsCount, preferredLanguage: form.preferredLanguage,
                meetingType: form.meetingType, firstContactDate: form.firstContactDate,
                meetingDate: form.meetingDate, proposalDate: form.proposalDate,
                decisionDate: form.decisionDate, interactionCount: form.interactionCount,
                emailOpenRate: form.emailOpenRate,
                customField1: form.customField1, customField2: form.customField2,
                customField3: form.customField3, customField4: form.customField4, customField5: form.customField5,
              }),
            }).catch(() => null);
          }
          setShowForm(false); load();
        }
      }
    );
  };
  const remove = async (id: number) => {
    await executeDelete(
      () => authFetch(`${API}/crm-leads/${id}`, { method: "DELETE", headers: getHeaders() }),
      { confirm: "למחוק ליד?", successMessage: "ליד נמחק בהצלחה", onSuccess: load }
    );
  };
  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const kpis = [
    { label: "סה\"כ לידים", value: fmt(stats.total || 0), icon: Users, color: "text-blue-600" },
    { label: "לידים חדשים", value: fmt(stats.new_count || 0), icon: UserPlus, color: "text-cyan-600" },
    { label: "הומרו ללקוחות", value: fmt(stats.converted || 0), icon: Target, color: "text-green-600" },
    { label: "אחוז המרה", value: `${stats.conversion_rate || 0}%`, icon: TrendingUp, color: "text-purple-600" },
    { label: "ערך צנרת", value: fmtC(stats.total_value || 0), icon: DollarSign, color: "text-amber-600" },
    { label: "עדיפות גבוהה", value: fmt(stats.high_priority || 0), icon: AlertTriangle, color: "text-red-600" },
    { label: "מעקב באיחור", value: fmt(stats.overdue_followups || 0), icon: Clock, color: "text-orange-600" },
    { label: "חדשים השבוע", value: fmt(stats.new_this_week || 0), icon: Star, color: "text-indigo-600" },
  ];

  const exportCSV = () => {
    const csv = ["מספר,שם,חברה,טלפון,מקור,סטטוס,ערך,ציון",
      ...filtered.map(r => `${r.lead_number},${r.first_name} ${r.last_name},${r.company || ""},${r.phone || ""},${r.source || ""},${STATUS_MAP[r.status]?.label || r.status},${r.estimated_value || 0},${r.lead_score || 0}`)
    ].join("\n");
    const b = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "leads.csv"; a.click();
  };

  const getScoreColor = (score: number) => score >= 80 ? "text-green-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  const getTempColor = (temp: string) => {
    if (temp === "לוהט") return "bg-red-500/20 text-red-400";
    if (temp === "חם") return "bg-orange-500/20 text-orange-400";
    if (temp === "פושר") return "bg-blue-500/20 text-blue-400";
    return "bg-muted/20 text-muted-foreground";
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <div><h1 className="text-lg sm:text-2xl font-bold">ניהול לידים</h1><p className="text-sm text-muted-foreground">ניהול, מעקב והמרת לידים — 50+ שדות מותאמים</p></div>
        <div className="flex gap-2">
          <ImportButton apiRoute="/api/crm-leads" onSuccess={load} />
          <button onClick={exportCSV} className="btn btn-outline btn-sm flex items-center gap-1"><Download className="w-4 h-4" />ייצוא</button>
          <button onClick={() => window.print()} className="btn btn-outline btn-sm flex items-center gap-1"><Printer className="w-4 h-4" />הדפסה</button>
          <button onClick={openCreate} className="btn btn-primary btn-sm flex items-center gap-1"><Plus className="w-4 h-4" />ליד חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((k, i) => (<div key={i} className="bg-card border rounded-lg p-3 text-center"><k.icon className={`w-5 h-5 mx-auto mb-1 ${k.color}`} /><div className="text-lg font-bold">{k.value}</div><div className="text-xs text-muted-foreground">{k.label}</div></div>))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]"><Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" /><input className="input input-bordered w-full pr-9 h-9 text-sm" placeholder="חיפוש לפי שם, חברה, טלפון..." value={search} onChange={e => { setSearch(e.target.value); pagination.setPage(1); }} /></div>
        <select className="select select-bordered select-sm" value={filterStatus} onChange={e => { setFilterStatus(e.target.value); pagination.setPage(1); }}><option value="">כל הסטטוסים</option>{Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
        <select className="select select-bordered select-sm" value={filterPriority} onChange={e => { setFilterPriority(e.target.value); pagination.setPage(1); }}><option value="">כל העדיפויות</option>{Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      </div>

      <BulkActions items={filtered} selectedIds={selectedIds} onSelectionChange={setSelectedIds} actions={[
        defaultBulkActions.duplicate(async (ids) => { for (const id of ids) { await duplicateRecord(`${API}/crm-leads`, id, { defaultStatus: "new" }); } load(); }),
        defaultBulkActions.delete(async (ids) => { await Promise.allSettled(ids.map(id => authFetch(`${API}/crm-leads/${id}`, { method: "DELETE", headers: getHeaders() }))); load(); }),
        defaultBulkActions.export(async (ids) => { const idSet = new Set(ids); const rows = filtered.filter(r => idSet.has(r.id)); const csv = ["שם,חברה,טלפון,מקור,סטטוס,ערך", ...rows.map(r => `${r?.first_name ?? ""} ${r?.last_name ?? ""},${r?.company||""},${r?.phone||""},${r?.source||""},${r?.status||""},${r?.estimated_value||0}`)].join("\n"); const b = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "leads_export.csv"; a.click(); }),
      ]} />

      {loadError && (
        <div className="border border-red-500/30 bg-red-500/10 rounded-lg p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-red-400"><AlertTriangle className="w-5 h-5 shrink-0" /><span className="text-sm">{loadError}</span></div>
          <button onClick={load} className="btn btn-outline btn-sm text-red-400 border-red-500/30 hover:bg-red-500/10">נסה שוב</button>
        </div>
      )}
      {!loadError && statsError && (
        <div className="border border-amber-500/30 bg-amber-500/10 rounded-lg px-4 py-2 flex items-center gap-2 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" /><span>נתוני סטטיסטיקה אינם זמינים כרגע</span>
        </div>
      )}

      <div className="border rounded-lg overflow-auto relative">
        {tableLoading && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10">
            <div className="flex items-center gap-2 bg-background border rounded-lg px-4 py-2 shadow-lg"><Loader2 className="w-4 h-4 animate-spin text-primary" /><span className="text-sm">טוען נתונים...</span></div>
          </div>
        )}
        <table className="table table-sm w-full"><thead><tr className="bg-muted/50">
          <th className="w-10"><BulkCheckbox checked={isAllSelected(filtered)} partial={isSomeSelected(filtered)} onChange={() => toggleAll(filtered)} /></th>
          {[["lead_number", "מספר"], ["first_name", "שם"], ["company", "חברה"], ["phone", "טלפון"], ["source", "מקור"], ["status", "סטטוס"], ["priority", "עדיפות"], ["lead_score", "ציון"], ["lead_temp", "טמפ'"], ["estimated_value", "ערך"], ["next_follow_up", "מעקב"]].map(([f, l]) => (
            <th key={f} className="cursor-pointer whitespace-nowrap" onClick={() => toggleSort(f)}><span className="flex items-center gap-1">{l}<ArrowUpDown className="w-3 h-3" /></span></th>
          ))}
          <th>פעולות</th>
        </tr></thead><tbody>
          {!tableLoading && pagination.paginate(filtered).length === 0 ? (
            <tr><td colSpan={13}>
              <EmptyState
                icon={UserPlus}
                title="עדיין אין לידים במערכת"
                subtitle="הוסף את הליד הראשון שלך ותתחיל לעקוב אחר הזדמנויות מכירה"
                ctaLabel="➕ הוסף ליד ראשון"
                onCtaClick={openCreate}
              />
            </td></tr>
          ) : pagination.paginate(filtered).map(r => (
            <tr key={r?.id} className={`hover:bg-muted/30 ${isSelected(r?.id) ? "bg-primary/5" : ""}`}>
              <td><BulkCheckbox checked={isSelected(r?.id)} onChange={() => toggle(r?.id)} /></td>
              <td className="font-mono text-xs">{r?.lead_number ?? "-"}</td>
              <td className="font-medium">{r?.first_name ?? ""} {r?.last_name ?? ""}</td>
              <td>{r?.company || "-"}</td>
              <td dir="ltr">{r?.phone || "-"}</td>
              <td>{r?.source || "-"}</td>
              <td><span className={`px-2 py-0.5 rounded text-xs ${STATUS_MAP[r?.status]?.color || ""}`}>{STATUS_MAP[r?.status]?.label || r?.status || "-"}</span></td>
              <td><span className={`px-2 py-0.5 rounded text-xs ${PRIORITY_MAP[r?.priority]?.color || ""}`}>{PRIORITY_MAP[r?.priority]?.label || r?.priority || "-"}</span></td>
              <td><span className={`font-bold text-sm ${getScoreColor(r?.lead_score || 0)}`}>{r?.lead_score || "-"}</span></td>
              <td>{r?.lead_temp ? <span className={`px-1.5 py-0.5 rounded text-xs ${getTempColor(r.lead_temp)}`}>{r.lead_temp}</span> : "-"}</td>
              <td>{r?.estimated_value ? fmtC(r.estimated_value) : "-"}</td>
              <td>{r?.next_follow_up?.slice(0, 10) || "-"}</td>
              <td><div className="flex gap-1"><button onClick={() => setViewDetail(r)} className="btn btn-ghost btn-xs"><Eye className="w-3.5 h-3.5" /></button><button onClick={() => openEdit(r)} className="btn btn-ghost btn-xs"><Edit className="w-3.5 h-3.5" /></button><button onClick={async () => { const _dup = await duplicateRecord(`${API}/crm-leads`, r?.id); if (_dup.ok) { load(); } else { alert("שגיאה בשכפול: " + _dup.error); } }} className="btn btn-ghost btn-xs" title="שכפול"><Copy className="w-3.5 h-3.5" /></button>{isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r?.first_name || r?.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r?.id)}} className="btn btn-ghost btn-xs text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}</div></td>
            </tr>
          ))}
        </tbody></table>
      </div>
      <SmartPagination pagination={pagination} />

      {viewDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setViewDetail(null); setDetailTab("details"); }}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-bold text-foreground">{viewDetail?.first_name ?? ""} {viewDetail?.last_name ?? ""}{viewDetail?.lead_number ? ` — ${viewDetail.lead_number}` : ""}</h2>
              <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex border-b border-border/50 overflow-x-auto">
              {[{key:"details",label:"פרטים"},{key:"related",label:"רשומות קשורות"},{key:"timeline",label:"📨 ציר תקשורת"},{key:"whatsapp",label:"💬 WhatsApp"},{key:"docs",label:"מסמכים"},{key:"history",label:"היסטוריה"}].map(t => (
                <button key={t.key} onClick={() => setDetailTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap ${detailTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t.label}</button>
              ))}
            </div>
            {detailTab === "details" && (
              <>
                <div className="p-5">
                  <StatusTransition currentStatus={viewDetail.status} statuses={[{key:"new",label:"חדש",color:"bg-blue-500/20 text-blue-400"},{key:"contacted",label:"נוצר קשר",color:"bg-cyan-500/20 text-cyan-400"},{key:"qualified",label:"מוסמך",color:"bg-green-500/20 text-green-400"},{key:"converted",label:"הומר",color:"bg-emerald-500/20 text-emerald-400"},{key:"lost",label:"אבוד",color:"bg-red-500/20 text-red-400"}]} transitions={{new:["contacted","lost"],contacted:["qualified","lost"],qualified:["converted","lost"],converted:[],lost:[]}} onTransition={async (newStatus) => { await authFetch(`${API}/crm-leads/${viewDetail.id}`, { method: "PUT", headers: getHeaders(), body: JSON.stringify({ status: newStatus }) }); setViewDetail({ ...viewDetail, status: newStatus }); load(); }} entityId={viewDetail.id} />
                </div>
                <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div><span className="text-xs text-muted-foreground block">שם</span><span className="font-medium">{viewDetail?.first_name ?? ""} {viewDetail?.last_name ?? ""}</span></div>
                  <div><span className="text-xs text-muted-foreground block">חברה</span><span>{viewDetail?.company || "—"}</span></div>
                  <div><span className="text-xs text-muted-foreground block">טלפון</span><span dir="ltr">{viewDetail?.phone || "—"}</span></div>
                  <div><span className="text-xs text-muted-foreground block">דוא״ל</span><span dir="ltr">{viewDetail?.email || "—"}</span></div>
                  <div><span className="text-xs text-muted-foreground block">מקור</span><span>{viewDetail?.source || "—"}</span></div>
                  <div><span className="text-xs text-muted-foreground block">סטטוס</span><span className={`px-2 py-0.5 rounded text-xs ${STATUS_MAP[viewDetail?.status]?.color || ""}`}>{STATUS_MAP[viewDetail?.status]?.label || viewDetail?.status || "—"}</span></div>
                  <div><span className="text-xs text-muted-foreground block">עדיפות</span><span className={`px-2 py-0.5 rounded text-xs ${PRIORITY_MAP[viewDetail?.priority]?.color || ""}`}>{PRIORITY_MAP[viewDetail?.priority]?.label || viewDetail?.priority || "—"}</span></div>
                  <div><span className="text-xs text-muted-foreground block">ציון</span><span className={`font-bold ${getScoreColor(viewDetail?.lead_score || 0)}`}>{viewDetail?.lead_score || "—"}</span></div>
                  <div><span className="text-xs text-muted-foreground block">ערך מוערך</span><span>{viewDetail?.estimated_value ? fmtC(viewDetail.estimated_value) : "—"}</span></div>
                  <div><span className="text-xs text-muted-foreground block">מעקב הבא</span><span>{viewDetail?.next_follow_up?.slice(0, 10) || "—"}</span></div>
                  <div><span className="text-xs text-muted-foreground block">אחראי</span><span>{viewDetail?.assigned_to || "—"}</span></div>
                  <div><span className="text-xs text-muted-foreground block">טמפרטורה</span><span>{viewDetail?.lead_temp || "—"}</span></div>
                  <div className="col-span-full"><span className="text-xs text-muted-foreground block">הערות</span><span>{viewDetail?.notes || "—"}</span></div>
                </div>
              </>
            )}
            {detailTab === "related" && (
              <div className="p-5"><RelatedRecords tabs={[{key:"activities",label:"פעילויות",endpoint:`${API}/crm-leads/${viewDetail.id}/activities`,columns:[{key:"type",label:"סוג"},{key:"description",label:"תיאור"},{key:"date",label:"תאריך"}]},{key:"quotes",label:"הצעות מחיר",endpoint:`${API}/crm-leads/${viewDetail.id}/quotes`,columns:[{key:"quote_number",label:"מספר"},{key:"amount",label:"סכום"},{key:"status",label:"סטטוס"}]},{key:"contacts",label:"אנשי קשר",endpoint:`${API}/crm-leads/${viewDetail.id}/contacts`,columns:[{key:"name",label:"שם"},{key:"phone",label:"טלפון"},{key:"role",label:"תפקיד"}]}]} /></div>
            )}
            {detailTab === "timeline" && (
              <div className="p-5">
                <CommunicationTimeline entityType="lead" entityId={viewDetail.id} />
              </div>
            )}
            {detailTab === "whatsapp" && (
              <div className="h-[500px]">
                <WhatsAppConversation
                  entityType="lead"
                  entityId={viewDetail.id}
                  entityName={`${viewDetail.first_name} ${viewDetail.last_name}`}
                  phone={viewDetail.phone || viewDetail.whatsapp}
                  className="h-full"
                />
              </div>
            )}
            {detailTab === "docs" && (
              <div className="p-5"><AttachmentsSection entityType="lead" entityId={viewDetail.id} /></div>
            )}
            {detailTab === "history" && (
              <div className="p-5"><ActivityLog entityType="lead" entityId={viewDetail.id} /></div>
            )}
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => { setViewDetail(null); setDetailTab("details"); }} className="btn btn-outline btn-sm">סגור</button>
              <button onClick={() => { openEdit(viewDetail); setViewDetail(null); setDetailTab("details"); }} className="btn btn-primary btn-sm">עריכה</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border rounded-xl p-0 w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-xl font-bold">{editing ? "עריכת ליד" : "ליד חדש"} — כרטיס מורחב</h2>
              <button onClick={() => setShowForm(false)} className="btn btn-ghost btn-sm">✕</button>
            </div>

            <div className="flex gap-0 flex-1 overflow-hidden">
              <div className="w-48 border-l bg-muted/20 flex-shrink-0 overflow-y-auto">
                {FIELD_GROUPS.map(g => (
                  <button key={g.id} onClick={() => setActiveGroup(g.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm text-right transition-colors ${activeGroup === g.id ? "bg-primary/10 text-primary border-l-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/30"}`}>
                    <g.icon className="w-4 h-4" />{g.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {activeGroup === "contact" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-sm font-medium">שם פרטי <RequiredMark /></label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.firstName || ""} onChange={e => setForm({ ...form, firstName: e.target.value })} /><FormFieldError error={validation.errors.firstName} /></div>
                    <div><label className="text-sm font-medium">שם משפחה <RequiredMark /></label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.lastName || ""} onChange={e => setForm({ ...form, lastName: e.target.value })} /><FormFieldError error={validation.errors.lastName} /></div>
                    <div><label className="text-sm font-medium">תפקיד</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.jobTitle || ""} onChange={e => setForm({ ...form, jobTitle: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">טלפון</label><input className="input input-bordered w-full h-9 text-sm mt-1" dir="ltr" value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">נייד / WhatsApp</label><input className="input input-bordered w-full h-9 text-sm mt-1" dir="ltr" value={form.whatsapp || ""} onChange={e => setForm({ ...form, whatsapp: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">דוא"ל</label><input type="email" className="input input-bordered w-full h-9 text-sm mt-1" dir="ltr" value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">כתובת</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">עיר</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.city || ""} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">אזור</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.region || ""} onChange={e => setForm({ ...form, region: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">מיקוד</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.zipCode || ""} onChange={e => setForm({ ...form, zipCode: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">מדינה</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.country || "ישראל"} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">העדפת קשר</label>
                      <select className="select select-bordered w-full select-sm mt-1" value={form.contactPreference || ""} onChange={e => setForm({ ...form, contactPreference: e.target.value })}>
                        <option value="">בחר</option>{CONTACT_PREFS.map(c => <option key={c} value={c}>{c}</option>)}
                      </select></div>
                  </div>
                )}

                {activeGroup === "business" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-sm font-medium">חברה</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.company || ""} onChange={e => setForm({ ...form, company: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">ענף עסקי</label>
                      <select className="select select-bordered w-full select-sm mt-1" value={form.industry || ""} onChange={e => setForm({ ...form, industry: e.target.value })}>
                        <option value="">בחר</option>{INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                      </select></div>
                    <div><label className="text-sm font-medium">גודל חברה</label>
                      <select className="select select-bordered w-full select-sm mt-1" value={form.companySize || ""} onChange={e => setForm({ ...form, companySize: e.target.value })}>
                        <option value="">בחר</option>{COMPANY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select></div>
                    <div><label className="text-sm font-medium">אתר אינטרנט</label><input dir="ltr" className="input input-bordered w-full h-9 text-sm mt-1" value={form.website || ""} onChange={e => setForm({ ...form, website: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">הכנסה שנתית (₪)</label><input type="number" className="input input-bordered w-full h-9 text-sm mt-1" value={form.annualRevenue || ""} onChange={e => setForm({ ...form, annualRevenue: Number(e.target.value) })} /></div>
                    <div><label className="text-sm font-medium">מספר עובדים</label><input type="number" className="input input-bordered w-full h-9 text-sm mt-1" value={form.numberOfEmployees || ""} onChange={e => setForm({ ...form, numberOfEmployees: Number(e.target.value) })} /></div>
                    <div><label className="text-sm font-medium">ערך מוערך (₪)</label><input type="number" className="input input-bordered w-full h-9 text-sm mt-1" value={form.estimatedValue || 0} onChange={e => setForm({ ...form, estimatedValue: Number(e.target.value) })} /></div>
                    <div><label className="text-sm font-medium">ערך הצעה (₪)</label><input type="number" className="input input-bordered w-full h-9 text-sm mt-1" value={form.proposalValue || ""} onChange={e => setForm({ ...form, proposalValue: Number(e.target.value) })} /></div>
                    <div><label className="text-sm font-medium">הנחה מוצעת (%)</label><input type="number" className="input input-bordered w-full h-9 text-sm mt-1" value={form.discountOffered || ""} onChange={e => setForm({ ...form, discountOffered: Number(e.target.value) })} /></div>
                    <div><label className="text-sm font-medium">מוצר/עניין</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.productInterest || ""} onChange={e => setForm({ ...form, productInterest: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">מתחרים</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.competitors || ""} onChange={e => setForm({ ...form, competitors: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">כאבים/צרכים</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.painPoints || ""} onChange={e => setForm({ ...form, painPoints: e.target.value })} /></div>
                    <div className="md:col-span-3"><label className="text-sm font-medium">סטטוס</label>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        <select className="select select-bordered select-sm" value={form.status || ""} onChange={e => setForm({ ...form, status: e.target.value })}>{Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                        <select className="select select-bordered select-sm" value={form.priority || ""} onChange={e => setForm({ ...form, priority: e.target.value })}>{Object.entries(PRIORITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
                        <input className="input input-bordered h-8 text-sm" placeholder="אחראי" value={form.assignedTo || ""} onChange={e => setForm({ ...form, assignedTo: e.target.value })} />
                      </div></div>
                    {form.status === "lost" && <div className="md:col-span-3"><label className="text-sm font-medium">סיבת אובדן</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.lostReason || ""} onChange={e => setForm({ ...form, lostReason: e.target.value })} /></div>}
                  </div>
                )}

                {activeGroup === "source" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-sm font-medium">מקור ליד</label>
                      <select className="select select-bordered w-full select-sm mt-1" value={form.source || ""} onChange={e => setForm({ ...form, source: e.target.value })}>
                        <option value="">בחר</option>{SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select></div>
                    <div><label className="text-sm font-medium">הופנה על ידי</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.referredBy || ""} onChange={e => setForm({ ...form, referredBy: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">שם קמפיין</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.campaignName || ""} onChange={e => setForm({ ...form, campaignName: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">UTM Source</label><input dir="ltr" className="input input-bordered w-full h-9 text-sm mt-1" value={form.utmSource || ""} onChange={e => setForm({ ...form, utmSource: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">UTM Medium</label><input dir="ltr" className="input input-bordered w-full h-9 text-sm mt-1" value={form.utmMedium || ""} onChange={e => setForm({ ...form, utmMedium: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">UTM Campaign</label><input dir="ltr" className="input input-bordered w-full h-9 text-sm mt-1" value={form.utmCampaign || ""} onChange={e => setForm({ ...form, utmCampaign: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">תגיות</label><input className="input input-bordered w-full h-9 text-sm mt-1" placeholder="תג1, תג2, תג3" value={form.tags || ""} onChange={e => setForm({ ...form, tags: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">אחוז פתיחת מיילים</label><input type="number" className="input input-bordered w-full h-9 text-sm mt-1" value={form.emailOpenRate || ""} onChange={e => setForm({ ...form, emailOpenRate: Number(e.target.value) })} /></div>
                    <div><label className="text-sm font-medium">מספר אינטראקציות</label><input type="number" className="input input-bordered w-full h-9 text-sm mt-1" value={form.interactionCount || ""} onChange={e => setForm({ ...form, interactionCount: Number(e.target.value) })} /></div>
                  </div>
                )}

                {activeGroup === "score" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-sm font-medium">ציון ליד (0-100)</label>
                      <div className="flex gap-2 mt-1 items-center">
                        <input type="range" min="0" max="100" className="flex-1" value={form.leadScore || 50} onChange={e => setForm({ ...form, leadScore: Number(e.target.value) })} />
                        <span className={`text-lg font-bold min-w-[40px] text-center ${getScoreColor(form.leadScore || 50)}`}>{form.leadScore || 50}</span>
                      </div></div>
                    <div><label className="text-sm font-medium">חום ליד</label>
                      <select className="select select-bordered w-full select-sm mt-1" value={form.leadTemp || ""} onChange={e => setForm({ ...form, leadTemp: e.target.value })}>
                        <option value="">בחר</option>{LEAD_TEMPS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                    <div><label className="text-sm font-medium">הסתברות המרה (%)</label><input type="number" min="0" max="100" className="input input-bordered w-full h-9 text-sm mt-1" value={form.probability || 0} onChange={e => setForm({ ...form, probability: Number(e.target.value) })} /></div>
                    <div><label className="text-sm font-medium">תאריך סגירה צפוי</label><input type="date" className="input input-bordered w-full h-9 text-sm mt-1" value={form.expectedCloseDate || ""} onChange={e => setForm({ ...form, expectedCloseDate: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">תקציב ליד</label>
                      <select className="select select-bordered w-full select-sm mt-1" value={form.budget || ""} onChange={e => setForm({ ...form, budget: e.target.value })}>
                        <option value="">בחר</option>{BUDGETS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select></div>
                    <div><label className="text-sm font-medium">ציר זמן קנייה</label>
                      <select className="select select-bordered w-full select-sm mt-1" value={form.timeline || ""} onChange={e => setForm({ ...form, timeline: e.target.value })}>
                        <option value="">בחר</option>{TIMELINES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                  </div>
                )}

                {activeGroup === "social" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div><label className="text-sm font-medium">LinkedIn</label><input dir="ltr" className="input input-bordered w-full h-9 text-sm mt-1" placeholder="https://linkedin.com/in/..." value={form.linkedinUrl || ""} onChange={e => setForm({ ...form, linkedinUrl: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">Facebook</label><input dir="ltr" className="input input-bordered w-full h-9 text-sm mt-1" placeholder="https://facebook.com/..." value={form.facebookUrl || ""} onChange={e => setForm({ ...form, facebookUrl: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">אינסטגרם</label><input dir="ltr" className="input input-bordered w-full h-9 text-sm mt-1" placeholder="@username" value={form.instagram || ""} onChange={e => setForm({ ...form, instagram: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">טוויטר/X</label><input dir="ltr" className="input input-bordered w-full h-9 text-sm mt-1" placeholder="@username" value={form.twitter || ""} onChange={e => setForm({ ...form, twitter: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">מספר אנשי קשר בחברה</label><input type="number" className="input input-bordered w-full h-9 text-sm mt-1" value={form.contactsCount || ""} onChange={e => setForm({ ...form, contactsCount: Number(e.target.value) })} /></div>
                  </div>
                )}

                {activeGroup === "preferences" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-sm font-medium">תקציב מוערך</label>
                      <select className="select select-bordered w-full select-sm mt-1" value={form.budget || ""} onChange={e => setForm({ ...form, budget: e.target.value })}>
                        <option value="">בחר</option>{BUDGETS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select></div>
                    <div><label className="text-sm font-medium">ציר זמן רכישה</label>
                      <select className="select select-bordered w-full select-sm mt-1" value={form.timeline || ""} onChange={e => setForm({ ...form, timeline: e.target.value })}>
                        <option value="">בחר</option>{TIMELINES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select></div>
                    <div><label className="text-sm font-medium">שפה מועדפת</label>
                      <select className="select select-bordered w-full select-sm mt-1" value={form.preferredLanguage || ""} onChange={e => setForm({ ...form, preferredLanguage: e.target.value })}>
                        <option value="">בחר</option>
                        <option value="עברית">עברית</option>
                        <option value="ערבית">ערבית</option>
                        <option value="אנגלית">אנגלית</option>
                        <option value="רוסית">רוסית</option>
                      </select></div>
                    <div><label className="text-sm font-medium">אופן פגישה מועדף</label>
                      <select className="select select-bordered w-full select-sm mt-1" value={form.meetingType || ""} onChange={e => setForm({ ...form, meetingType: e.target.value })}>
                        <option value="">בחר</option>
                        <option value="פנים אל פנים">פנים אל פנים</option>
                        <option value="זום">זום</option>
                        <option value="טלפון">טלפון</option>
                        <option value="מרחוק">מרחוק</option>
                      </select></div>
                    <div className="md:col-span-3"><label className="text-sm font-medium">כאבים ואתגרים</label><textarea className="textarea textarea-bordered w-full text-sm mt-1" rows={2} value={form.painPoints || ""} onChange={e => setForm({ ...form, painPoints: e.target.value })} /></div>
                    <div className="md:col-span-3"><label className="text-sm font-medium">הערות כלליות</label><textarea className="textarea textarea-bordered w-full text-sm mt-1" rows={3} value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
                  </div>
                )}

                {activeGroup === "history" && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><label className="text-sm font-medium">תאריך קשר ראשון</label><input type="date" className="input input-bordered w-full h-9 text-sm mt-1" value={form.firstContactDate || ""} onChange={e => setForm({ ...form, firstContactDate: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">קשר אחרון</label><input type="date" className="input input-bordered w-full h-9 text-sm mt-1" value={form.lastContactDate || ""} onChange={e => setForm({ ...form, lastContactDate: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">מעקב הבא</label><input type="date" className="input input-bordered w-full h-9 text-sm mt-1" value={form.nextFollowUp || ""} onChange={e => setForm({ ...form, nextFollowUp: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">תאריך פגישה</label><input type="date" className="input input-bordered w-full h-9 text-sm mt-1" value={form.meetingDate || ""} onChange={e => setForm({ ...form, meetingDate: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">תאריך הצעת מחיר</label><input type="date" className="input input-bordered w-full h-9 text-sm mt-1" value={form.proposalDate || ""} onChange={e => setForm({ ...form, proposalDate: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">תאריך החלטה</label><input type="date" className="input input-bordered w-full h-9 text-sm mt-1" value={form.decisionDate || ""} onChange={e => setForm({ ...form, decisionDate: e.target.value })} /></div>
                    <div><label className="text-sm font-medium">מספר אינטראקציות</label><input type="number" className="input input-bordered w-full h-9 text-sm mt-1" value={form.interactionCount || 0} onChange={e => setForm({ ...form, interactionCount: Number(e.target.value) })} /></div>
                    <div><label className="text-sm font-medium">אחוז פתיחת מיילים</label><input type="number" className="input input-bordered w-full h-9 text-sm mt-1" value={form.emailOpenRate || 0} onChange={e => setForm({ ...form, emailOpenRate: Number(e.target.value) })} /></div>
                  </div>
                )}

                {activeGroup === "custom" && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">שדות מותאמים אישית — למידע ספציפי לתחום העסק שלך</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div><label className="text-sm font-medium">שדה מותאם 1</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.customField1 || ""} onChange={e => setForm({ ...form, customField1: e.target.value })} /></div>
                      <div><label className="text-sm font-medium">שדה מותאם 2</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.customField2 || ""} onChange={e => setForm({ ...form, customField2: e.target.value })} /></div>
                      <div><label className="text-sm font-medium">שדה מותאם 3</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.customField3 || ""} onChange={e => setForm({ ...form, customField3: e.target.value })} /></div>
                      <div><label className="text-sm font-medium">שדה מותאם 4</label><input className="input input-bordered w-full h-9 text-sm mt-1" value={form.customField4 || ""} onChange={e => setForm({ ...form, customField4: e.target.value })} /></div>
                      <div className="md:col-span-2"><label className="text-sm font-medium">שדה מותאם 5 (טקסט חופשי)</label><textarea className="textarea textarea-bordered w-full text-sm mt-1" rows={2} value={form.customField5 || ""} onChange={e => setForm({ ...form, customField5: e.target.value })} /></div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center px-6 py-4 border-t bg-muted/20">
              <div className="flex gap-2">
                {FIELD_GROUPS.map((g, i) => (
                  <button key={g.id} onClick={() => setActiveGroup(g.id)}
                    className={`w-2 h-2 rounded-full transition-colors ${activeGroup === g.id ? "bg-primary" : "bg-muted-foreground/30"}`} />
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowForm(false)} className="btn btn-outline btn-sm">ביטול</button>
                <ActionButton onClick={save} loading={loading} variant="primary" size="sm">שמירה</ActionButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
