import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ExportDropdown from "@/components/export-dropdown";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";
import { Badge } from "@/components/ui/badge";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import {
  Users, Plus, Search, TrendingUp, Target, Phone, Mail, Calendar,
  ArrowUpDown, Eye, X, AlertTriangle, Clock, MessageSquare, Filter,
  LayoutGrid, Table2, ChevronDown, ChevronLeft, ChevronRight, Pencil,
  Trash2, UserPlus, Send, CheckCircle2, XCircle, Star, MapPin,
  FileText, Zap, BarChart3, GripVertical, RefreshCw
} from "lucide-react";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (n: number) => new Intl.NumberFormat("he-IL").format(n);

const LEAD_STATUS: Record<string, { label: string; color: string; order: number }> = {
  new: { label: "חדש", color: "bg-blue-500/20 text-blue-400 border-blue-500/30", order: 0 },
  contacted: { label: "יצירת קשר", color: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30", order: 1 },
  meeting_scheduled: { label: "פגישה נקבעה", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", order: 2 },
  meeting_done: { label: "פגישה בוצעה", color: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30", order: 3 },
  quote_sent: { label: "הצעת מחיר נשלחה", color: "bg-amber-500/20 text-amber-400 border-amber-500/30", order: 4 },
  negotiation: { label: "משא ומתן", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", order: 5 },
  closed_won: { label: "נסגר - זכייה", color: "bg-green-500/20 text-green-400 border-green-500/30", order: 6 },
  closed_lost: { label: "נסגר - הפסד", color: "bg-red-500/20 text-red-400 border-red-500/30", order: 7 },
};

const LEAD_SOURCES = ["אתר", "פייסבוק", "גוגל", "הפניה", "טלפון", "תערוכה", "LinkedIn", "WhatsApp", "אחר"];
const URGENCY_MAP: Record<string, { label: string; color: string }> = {
  low: { label: "נמוכה", color: "text-green-400" },
  medium: { label: "בינונית", color: "text-amber-400" },
  high: { label: "גבוהה", color: "text-orange-400" },
  critical: { label: "קריטית", color: "text-red-400" },
};

const emptyForm: any = {
  leadNumber: "", fullName: "", phone: "", email: "", city: "", address: "", source: "", productInterest: "",
  status: "new", agentId: "", notes: "", urgency: "medium", budget: "", companyName: "",
  qualityScore: 0, estimatedValue: 0, nextFollowUp: "", tags: "",
};

const REQUIRED_FIELDS: Record<string, any> = { fullName: { required: true }, phone: { required: true }, source: { required: true }, status: { required: true } };

function KPICard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl p-4 border border-white/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={`w-4 h-4 ${color || "text-blue-400"}`} />
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </motion.div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? "text-green-400 bg-green-500/10" : score >= 60 ? "text-amber-400 bg-amber-500/10" : score >= 40 ? "text-orange-400 bg-orange-500/10" : "text-red-400 bg-red-500/10";
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{score}</span>;
}

export default function LeadsUltimatePage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterCity, setFilterCity] = useState("all");
  const [filterUrgency, setFilterUrgency] = useState("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState<any>(emptyForm);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const pagination = useSmartPagination(25);
  const { selectedIds, setSelectedIds, toggle, toggleAll, isSelected } = useBulkSelection();
  const validation = useFormValidation(REQUIRED_FIELDS);

  const load = async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        authFetch(`${API}/crm-ultimate/leads`),
        authFetch(`${API}/crm-ultimate/leads/stats`),
        authFetch(`${API}/crm-ultimate/agents`),
      ]);
      if (r1.ok) setItems(safeArray(await r1.json()));
      if (r2.ok) setStats((await r2.json()) || {});
      if (r3.ok) setAgents(safeArray(await r3.json()));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const cities = useMemo(() => Array.from(new Set(items.map(i => i.city).filter(Boolean))).sort(), [items]);

  const filtered = useMemo(() => {
    let f = [...items];
    if (search) {
      const s = search.toLowerCase();
      f = f.filter(i => i.fullName?.toLowerCase().includes(s) || i.phone?.includes(s) || i.leadNumber?.includes(s) || i.email?.toLowerCase().includes(s));
    }
    if (filterStatus !== "all") f = f.filter(i => i.status === filterStatus);
    if (filterSource !== "all") f = f.filter(i => i.source === filterSource);
    if (filterAgent !== "all") f = f.filter(i => String(i.agentId) === filterAgent);
    if (filterCity !== "all") f = f.filter(i => i.city === filterCity);
    if (filterUrgency !== "all") f = f.filter(i => i.urgency === filterUrgency);
    if (filterDateFrom) f = f.filter(i => (i.created_at || "") >= filterDateFrom);
    if (filterDateTo) f = f.filter(i => (i.created_at || "") <= filterDateTo);
    f.sort((a, b) => {
      const av = a[sortField] ?? "", bv = b[sortField] ?? "";
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return f;
  }, [items, search, filterStatus, filterSource, filterAgent, filterCity, filterUrgency, filterDateFrom, filterDateTo, sortField, sortDir]);

  const paged = useMemo(() => {
    const start = (pagination.page - 1) * pagination.perPage;
    return filtered.slice(start, start + pagination.perPage);
  }, [filtered, pagination.page, pagination.perPage]);

  const kpis = useMemo(() => ({
    total: items.length,
    new: items.filter(i => i.status === "new").length,
    contacted: items.filter(i => i.status === "contacted").length,
    meetingScheduled: items.filter(i => i.status === "meeting_scheduled").length,
    quoteSent: items.filter(i => i.status === "quote_sent").length,
    closedWon: items.filter(i => i.status === "closed_won").length,
    closedLost: items.filter(i => i.status === "closed_lost").length,
  }), [items]);

  const statusStats = useMemo(() => {
    const map: Record<string, number> = {};
    items.forEach(i => { map[i.status] = (map[i.status] || 0) + 1; });
    return map;
  }, [items]);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const handleSave = async () => {
    if (!validation.validateAll(form)) return;
    const url = editItem ? `${API}/crm-ultimate/leads/${editItem.id}` : `${API}/crm-ultimate/leads`;
    try {
      await authFetch(url, { method: editItem ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); setEditItem(null); setForm(emptyForm); validation.clearErrors(); load();
    } catch {}
  };

  const handleDelete = async (id: number) => {
    const ok = await globalConfirm({ title: "מחיקת ליד", message: "למחוק ליד זה?", confirmText: "מחק", variant: "destructive" });
    if (!ok) return;
    try { await authFetch(`${API}/crm-ultimate/leads/${id}`, { method: "DELETE" }); load(); } catch {}
  };

  const handleBulkAction = async (action: string) => {
    if (action === "assign") {
      // would open agent picker
    } else if (action === "status") {
      // would open status picker
    } else if (action === "sms") {
      // would trigger SMS
    }
  };

  const openEdit = (item: any) => { setEditItem(item); setForm({ ...emptyForm, ...item }); setShowForm(true); };
  const openCreate = () => { setEditItem(null); setForm(emptyForm); validation.clearErrors(); setShowForm(true); };

  const daysSince = (dateStr: string) => {
    if (!dateStr) return "—";
    const d = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
    return d === 0 ? "היום" : `${d} ימים`;
  };

  const kanbanColumns = useMemo(() => {
    const cols: Record<string, any[]> = {};
    Object.keys(LEAD_STATUS).forEach(k => { cols[k] = []; });
    filtered.forEach(item => {
      if (cols[item.status]) cols[item.status].push(item);
      else if (cols.new) cols.new.push(item);
    });
    return cols;
  }, [filtered]);

  return (
    <div dir="rtl" className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Target className="w-6 h-6 text-blue-400" /> ניהול לידים - Ultimate</h1>
          <p className="text-sm text-muted-foreground mt-1">מעקב מלא אחרי כל הלידים, סטטוסים וביצועים</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-lg bg-card border border-white/10 text-muted-foreground hover:text-foreground"><RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /></button>
          <ExportDropdown data={items} filename="leads-ultimate" />
          <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-foreground rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2"><Plus className="w-4 h-4" /> ליד חדש</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPICard icon={Users} label="סה״כ לידים" value={fmt(kpis.total)} color="text-blue-400" />
        <KPICard icon={Zap} label="חדשים היום" value={fmt(kpis.new)} color="text-cyan-400" />
        <KPICard icon={Phone} label="יצירת קשר" value={fmt(kpis.contacted)} color="text-teal-400" />
        <KPICard icon={Calendar} label="פגישה נקבעה" value={fmt(kpis.meetingScheduled)} color="text-purple-400" />
        <KPICard icon={FileText} label="הצעת מחיר" value={fmt(kpis.quoteSent)} color="text-amber-400" />
        <KPICard icon={CheckCircle2} label="נסגר - זכייה" value={fmt(kpis.closedWon)} color="text-green-400" />
        <KPICard icon={XCircle} label="נסגר - הפסד" value={fmt(kpis.closedLost)} color="text-red-400" />
      </div>

      {/* Filters & Controls */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי שם / טלפון / מספר ליד..." className="w-full bg-card border border-white/10 rounded-lg pr-10 pl-3 py-2 text-sm text-foreground placeholder:text-muted-foreground" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground">
            <option value="all">כל הסטטוסים</option>
            {Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)} className="bg-card border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground">
            <option value="all">כל המקורות</option>
            {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => setShowFilters(!showFilters)} className={`px-3 py-2 rounded-lg text-xs border flex items-center gap-1 ${showFilters ? "bg-blue-600 text-foreground border-blue-500" : "bg-card border-white/10 text-muted-foreground"}`}>
            <Filter className="w-3 h-3" /> פילטרים נוספים
          </button>
          <div className="flex items-center gap-1 bg-card border border-white/10 rounded-lg p-0.5">
            <button onClick={() => setViewMode("table")} className={`px-3 py-1.5 rounded text-xs flex items-center gap-1 ${viewMode === "table" ? "bg-blue-600 text-foreground" : "text-muted-foreground"}`}><Table2 className="w-3 h-3" /> טבלה</button>
            <button onClick={() => setViewMode("kanban")} className={`px-3 py-1.5 rounded text-xs flex items-center gap-1 ${viewMode === "kanban" ? "bg-blue-600 text-foreground" : "text-muted-foreground"}`}><LayoutGrid className="w-3 h-3" /> קנבן</button>
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap items-center gap-3 bg-card/50 rounded-lg p-3 border border-white/5">
              <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)} className="bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground">
                <option value="all">כל הסוכנים</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name || a.fullName}</option>)}
              </select>
              <select value={filterCity} onChange={e => setFilterCity(e.target.value)} className="bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground">
                <option value="all">כל הערים</option>
                {cities.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={filterUrgency} onChange={e => setFilterUrgency(e.target.value)} className="bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground">
                <option value="all">כל הדחיפויות</option>
                {Object.entries(URGENCY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">מתאריך:</span>
                <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="bg-background border border-white/10 rounded-lg px-2 py-1.5 text-sm text-foreground" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">עד תאריך:</span>
                <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="bg-background border border-white/10 rounded-lg px-2 py-1.5 text-sm text-foreground" />
              </div>
              <button onClick={() => { setFilterAgent("all"); setFilterCity("all"); setFilterUrgency("all"); setFilterDateFrom(""); setFilterDateTo(""); }} className="text-xs text-red-400 hover:text-red-300">נקה פילטרים</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-600/10 border border-blue-500/20 rounded-lg p-3 flex items-center justify-between">
          <span className="text-sm text-blue-400">{selectedIds.size} לידים נבחרו</span>
          <div className="flex items-center gap-2">
            <button onClick={() => handleBulkAction("assign")} className="px-3 py-1.5 bg-blue-600 text-foreground rounded text-xs hover:bg-blue-700"><UserPlus className="w-3 h-3 inline ml-1" />שיוך סוכן</button>
            <button onClick={() => handleBulkAction("status")} className="px-3 py-1.5 bg-amber-600 text-foreground rounded text-xs hover:bg-amber-700">שנה סטטוס</button>
            <button onClick={() => handleBulkAction("sms")} className="px-3 py-1.5 bg-green-600 text-foreground rounded text-xs hover:bg-green-700"><Send className="w-3 h-3 inline ml-1" />שלח SMS</button>
            <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 bg-card text-muted-foreground rounded text-xs border border-white/10">ביטול</button>
          </div>
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <div className="bg-card rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-muted-foreground">
                <th className="p-3 w-8"><input type="checkbox" onChange={e => toggleAll(paged.map(i => i.id), e.target.checked)} className="rounded" /></th>
                {[
                  { key: "leadNumber", label: "מס׳ ליד" }, { key: "fullName", label: "שם" }, { key: "phone", label: "טלפון" },
                  { key: "city", label: "עיר" }, { key: "source", label: "מקור" }, { key: "productInterest", label: "עניין מוצר" },
                  { key: "agentId", label: "סוכן" }, { key: "status", label: "סטטוס" }, { key: "qualityScore", label: "ציון" },
                  { key: "created_at", label: "ימים מיצירה" }, { key: "lastContact", label: "קשר אחרון" }, { key: "nextFollowUp", label: "מעקב הבא" },
                ].map(col => (
                  <th key={col.key} onClick={() => toggleSort(col.key)} className="p-3 text-right cursor-pointer hover:text-foreground whitespace-nowrap">
                    <span className="flex items-center gap-1">{col.label} <ArrowUpDown className="w-3 h-3" /></span>
                  </th>
                ))}
                <th className="p-3 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {paged.map(item => {
                const st = LEAD_STATUS[item.status] || LEAD_STATUS.new;
                const urg = URGENCY_MAP[item.urgency];
                const agent = agents.find(a => a.id === item.agentId);
                return (
                  <tr key={item.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="p-3"><input type="checkbox" checked={isSelected(item.id)} onChange={() => toggle(item.id)} className="rounded" /></td>
                    <td className="p-3 text-blue-400 font-mono text-xs">{item.leadNumber || `#${item.id}`}</td>
                    <td className="p-3">
                      <button onClick={() => setViewDetail(item)} className="text-foreground font-medium hover:text-blue-400">{item.fullName}</button>
                      {item.companyName && <div className="text-xs text-muted-foreground">{item.companyName}</div>}
                    </td>
                    <td className="p-3 text-foreground font-mono text-xs direction-ltr">{item.phone}</td>
                    <td className="p-3 text-muted-foreground text-xs">{item.city || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{item.source || "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{item.productInterest || "—"}</td>
                    <td className="p-3 text-xs text-foreground">{agent?.name || agent?.fullName || "—"}</td>
                    <td className="p-3"><Badge className={`text-[10px] ${st.color}`}>{st.label}</Badge></td>
                    <td className="p-3">{item.qualityScore ? <ScoreBadge score={item.qualityScore} /> : "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{daysSince(item.created_at)}</td>
                    <td className="p-3 text-xs text-muted-foreground">{item.lastContact ? daysSince(item.lastContact) : "—"}</td>
                    <td className="p-3 text-xs">{item.nextFollowUp ? <span className="text-amber-400">{item.nextFollowUp}</span> : "—"}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setViewDetail(item)} className="p-1 hover:text-blue-400 text-muted-foreground"><Eye className="w-3.5 h-3.5" /></button>
                        <button onClick={() => openEdit(item)} className="p-1 hover:text-amber-400 text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(item.id)} className="p-1 hover:text-red-400 text-muted-foreground"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > pagination.perPage && (
            <div className="p-3 border-t border-white/10">
              <SmartPagination total={filtered.length} pagination={pagination} />
            </div>
          )}
        </div>
      )}

      {/* Kanban View */}
      {viewMode === "kanban" && (
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
          {Object.entries(LEAD_STATUS).map(([statusKey, statusConfig]) => (
            <div key={statusKey} className="min-w-[280px] max-w-[300px] flex-shrink-0">
              <div className={`rounded-t-lg p-3 border border-white/10 bg-card flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <Badge className={`text-[10px] ${statusConfig.color}`}>{statusConfig.label}</Badge>
                  <span className="text-xs text-muted-foreground">({kanbanColumns[statusKey]?.length || 0})</span>
                </div>
                <GripVertical className="w-3 h-3 text-muted-foreground" />
              </div>
              <div className="space-y-2 p-2 bg-background/50 border-x border-b border-white/10 rounded-b-lg min-h-[200px]">
                {(kanbanColumns[statusKey] || []).slice(0, 20).map(item => {
                  const agent = agents.find(a => a.id === item.agentId);
                  return (
                    <motion.div key={item.id} layout className="bg-card rounded-lg p-3 border border-white/10 hover:border-blue-500/30 cursor-pointer" onClick={() => setViewDetail(item)}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground">{item.fullName}</span>
                        {item.qualityScore && <ScoreBadge score={item.qualityScore} />}
                      </div>
                      <div className="text-xs text-muted-foreground mb-1 font-mono direction-ltr text-right">{item.phone}</div>
                      {item.city && <div className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{item.city}</div>}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[10px] text-muted-foreground">{agent?.name || "לא משויך"}</span>
                        <span className="text-[10px] text-muted-foreground">{daysSince(item.created_at)}</span>
                      </div>
                    </motion.div>
                  );
                })}
                {(kanbanColumns[statusKey]?.length || 0) > 20 && (
                  <div className="text-xs text-center text-muted-foreground py-2">+{kanbanColumns[statusKey].length - 20} נוספים</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lead Status Statistics */}
      <div className="bg-card rounded-xl border border-white/10 p-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4"><BarChart3 className="w-4 h-4 text-blue-400" /> סטטיסטיקת סטטוסים</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-muted-foreground">
                <th className="p-2 text-right">סטטוס</th>
                <th className="p-2 text-right">כמות</th>
                <th className="p-2 text-right">אחוז</th>
                <th className="p-2 text-right">גרף</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(LEAD_STATUS).map(([k, v]) => {
                const count = statusStats[k] || 0;
                const pct = items.length ? Math.round(count / items.length * 100) : 0;
                return (
                  <tr key={k} className="border-b border-white/5">
                    <td className="p-2"><Badge className={`text-[10px] ${v.color}`}>{v.label}</Badge></td>
                    <td className="p-2 text-foreground font-medium">{fmt(count)}</td>
                    <td className="p-2 text-muted-foreground">{pct}%</td>
                    <td className="p-2 w-1/3">
                      <div className="h-3 bg-background rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${k.includes("won") ? "bg-green-500" : k.includes("lost") ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-card rounded-xl border border-white/10 p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-foreground mb-4">{editItem ? "עריכת ליד" : "ליד חדש"}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Full Name - Required */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">שם מלא <RequiredMark /></label>
                  <input value={form.fullName} onChange={e => { setForm((f: any) => ({ ...f, fullName: e.target.value })); validation.clearField("fullName"); }}
                    className={`w-full bg-background border rounded-lg px-3 py-2 text-sm text-foreground ${validation.errors.fullName ? "border-red-500" : "border-white/10"}`} placeholder="שם מלא" />
                  <FormFieldError error={validation.errors.fullName} />
                </div>
                {/* Phone - Required */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">טלפון <RequiredMark /></label>
                  <input value={form.phone} onChange={e => { setForm((f: any) => ({ ...f, phone: e.target.value })); validation.clearField("phone"); }}
                    className={`w-full bg-background border rounded-lg px-3 py-2 text-sm text-foreground ${validation.errors.phone ? "border-red-500" : "border-white/10"}`} placeholder="050-0000000" />
                  <FormFieldError error={validation.errors.phone} />
                </div>
                {/* Email */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">אימייל</label>
                  <input type="email" value={form.email} onChange={e => setForm((f: any) => ({ ...f, email: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground" placeholder="email@example.com" />
                </div>
                {/* City */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">עיר</label>
                  <input value={form.city} onChange={e => setForm((f: any) => ({ ...f, city: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground" placeholder="עיר" />
                </div>
                {/* Address */}
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">כתובת</label>
                  <input value={form.address} onChange={e => setForm((f: any) => ({ ...f, address: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground" placeholder="כתובת מלאה" />
                </div>
                {/* Source - Required */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">מקור <RequiredMark /></label>
                  <select value={form.source} onChange={e => { setForm((f: any) => ({ ...f, source: e.target.value })); validation.clearField("source"); }}
                    className={`w-full bg-background border rounded-lg px-3 py-2 text-sm text-foreground ${validation.errors.source ? "border-red-500" : "border-white/10"}`}>
                    <option value="">בחר מקור</option>
                    {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <FormFieldError error={validation.errors.source} />
                </div>
                {/* Product Interest */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">עניין מוצר</label>
                  <input value={form.productInterest} onChange={e => setForm((f: any) => ({ ...f, productInterest: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground" placeholder="מוצר / שירות" />
                </div>
                {/* Status - Required */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">סטטוס <RequiredMark /></label>
                  <select value={form.status} onChange={e => { setForm((f: any) => ({ ...f, status: e.target.value })); validation.clearField("status"); }}
                    className={`w-full bg-background border rounded-lg px-3 py-2 text-sm text-foreground ${validation.errors.status ? "border-red-500" : "border-white/10"}`}>
                    {Object.entries(LEAD_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <FormFieldError error={validation.errors.status} />
                </div>
                {/* Agent */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">סוכן</label>
                  <select value={form.agentId} onChange={e => setForm((f: any) => ({ ...f, agentId: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground">
                    <option value="">בחר סוכן</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name || a.fullName}</option>)}
                  </select>
                </div>
                {/* Urgency */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">דחיפות</label>
                  <select value={form.urgency} onChange={e => setForm((f: any) => ({ ...f, urgency: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground">
                    {Object.entries(URGENCY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                {/* Budget */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">תקציב משוער</label>
                  <input type="number" value={form.budget} onChange={e => setForm((f: any) => ({ ...f, budget: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground" placeholder="0" />
                </div>
                {/* Company */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">חברה</label>
                  <input value={form.companyName} onChange={e => setForm((f: any) => ({ ...f, companyName: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground" placeholder="שם חברה" />
                </div>
                {/* Next Follow Up */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">מעקב הבא</label>
                  <input type="date" value={form.nextFollowUp} onChange={e => setForm((f: any) => ({ ...f, nextFollowUp: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground" />
                </div>
                {/* Tags */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">תגיות</label>
                  <input value={form.tags} onChange={e => setForm((f: any) => ({ ...f, tags: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground" placeholder="תגית1, תגית2" />
                </div>
                {/* Notes */}
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">הערות</label>
                  <textarea rows={3} value={form.notes} onChange={e => setForm((f: any) => ({ ...f, notes: e.target.value }))} className="w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm text-foreground resize-none" placeholder="הערות..." />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={handleSave} className="flex-1 py-2 bg-blue-600 text-foreground rounded-lg text-sm hover:bg-blue-700">{editItem ? "עדכן" : "צור ליד"}</button>
                <button onClick={() => { setShowForm(false); setEditItem(null); setForm(emptyForm); validation.clearErrors(); }} className="flex-1 py-2 bg-background text-foreground rounded-lg text-sm border border-white/10">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* View Detail Modal */}
      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} onClick={e => e.stopPropagation()} className="bg-card rounded-xl border border-white/10 p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-foreground">{viewDetail.fullName}</h3>
                  <div className="text-sm text-muted-foreground">{viewDetail.phone} | {viewDetail.email}</div>
                </div>
                <Badge className={`${(LEAD_STATUS[viewDetail.status] || LEAD_STATUS.new).color}`}>{(LEAD_STATUS[viewDetail.status] || LEAD_STATUS.new).label}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                  { l: "מספר ליד", v: viewDetail.leadNumber || `#${viewDetail.id}` },
                  { l: "עיר", v: viewDetail.city },
                  { l: "מקור", v: viewDetail.source },
                  { l: "עניין מוצר", v: viewDetail.productInterest },
                  { l: "חברה", v: viewDetail.companyName },
                  { l: "דחיפות", v: URGENCY_MAP[viewDetail.urgency]?.label },
                  { l: "ציון איכות", v: viewDetail.qualityScore },
                  { l: "תקציב", v: viewDetail.budget ? fmt(viewDetail.budget) : "—" },
                  { l: "מעקב הבא", v: viewDetail.nextFollowUp },
                  { l: "סוכן", v: agents.find(a => a.id === viewDetail.agentId)?.name || "—" },
                ].map(f => (
                  <div key={f.l} className="bg-background rounded-lg p-2">
                    <div className="text-[10px] text-muted-foreground">{f.l}</div>
                    <div className="text-sm text-foreground">{f.v || "—"}</div>
                  </div>
                ))}
              </div>
              {viewDetail.notes && (
                <div className="bg-background rounded-lg p-3 mb-4">
                  <div className="text-xs text-muted-foreground mb-1">הערות</div>
                  <div className="text-sm text-foreground whitespace-pre-wrap">{viewDetail.notes}</div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="flex-1 py-2 bg-amber-600 text-foreground rounded-lg text-sm hover:bg-amber-700"><Pencil className="w-3 h-3 inline ml-1" />ערוך</button>
                <button onClick={() => setViewDetail(null)} className="flex-1 py-2 bg-background text-foreground rounded-lg text-sm border border-white/10">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading && <div className="text-center py-8 text-muted-foreground">טוען נתונים...</div>}
      {!loading && filtered.length === 0 && <div className="text-center py-8 text-muted-foreground">לא נמצאו לידים</div>}
    </div>
  );
}
