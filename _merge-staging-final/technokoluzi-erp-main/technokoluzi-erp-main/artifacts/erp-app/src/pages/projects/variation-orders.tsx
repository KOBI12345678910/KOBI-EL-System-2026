import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileEdit, Search, Plus, Eye, X, Save, Edit2, Trash2, ArrowUpDown, RefreshCw,
  Send, CheckCircle2, XCircle, Wrench, BarChart3, AlertTriangle, Clock, FileCheck
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : [];
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString("he-IL") : "—";

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "טיוטה", color: "bg-gray-500/20 text-gray-400", icon: FileEdit },
  submitted: { label: "הוגש", color: "bg-blue-500/20 text-blue-400", icon: Send },
  approved: { label: "אושר", color: "bg-green-500/20 text-green-400", icon: CheckCircle2 },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400", icon: XCircle },
  implemented: { label: "יושם", color: "bg-purple-500/20 text-purple-400", icon: Wrench },
};

const reasonMap: Record<string, string> = {
  scope_change: "שינוי היקף",
  design_change: "שינוי תכנון",
  client_request: "בקשת לקוח",
  site_condition: "תנאי שטח",
  regulation: "רגולציה",
  cost_saving: "חיסכון עלויות",
  error_correction: "תיקון שגיאה",
  other: "אחר",
};

const riskMap: Record<string, { label: string; color: string }> = {
  low: { label: "נמוך", color: "bg-green-500/20 text-green-400" },
  medium: { label: "בינוני", color: "bg-yellow-500/20 text-yellow-400" },
  high: { label: "גבוה", color: "bg-red-500/20 text-red-400" },
};

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-[#1a1a2e] p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}><Icon className="w-5 h-5" /></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold text-white">{value}</div></div>
    </motion.div>
  );
}

export default function VariationOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [ordRes, dashRes] = await Promise.all([
        authFetch(`${API}/variation-orders`),
        authFetch(`${API}/variation-orders/dashboard`),
      ]);
      if (ordRes.ok) setOrders(safeArray(await ordRes.json()));
      if (dashRes.ok) setDashboard(await dashRes.json());
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    let data = orders.filter(r =>
      (filterStatus === "all" || r.status === filterStatus) &&
      (!search || [r.vo_number, r.title, r.project_name, r.requested_by]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [orders, filterStatus, search, sortField, sortDir]);

  const openCreate = () => { setEditing(null); setForm({}); setShowForm(true); };
  const openEdit = (o: any) => { setEditing(o); setForm({ ...o }); setShowForm(true); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/variation-orders/${editing.id}` : `${API}/variation-orders`;
      const method = editing ? "PUT" : "POST";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) { setShowForm(false); setForm({}); setEditing(null); load(); }
    } catch {}
    setSaving(false);
  };

  const handleAction = async (id: number, action: string, body: any = {}) => {
    setActionLoading(id);
    try {
      const res = await authFetch(`${API}/variation-orders/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { load(); if (viewDetail?.id === id) loadDetail(id); }
    } catch {}
    setActionLoading(null);
  };

  const handleDelete = async (id: number) => {
    try {
      await authFetch(`${API}/variation-orders/${id}`, { method: "DELETE" });
      load();
    } catch {}
  };

  const loadDetail = async (id: number) => {
    try {
      const res = await authFetch(`${API}/variation-orders/${id}`);
      if (res.ok) setViewDetail(await res.json());
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#101030] to-[#0a0a1a] text-white p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <FileEdit className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">צווי שינוי</h1>
              <p className="text-sm text-muted-foreground">ניהול צווי שינוי והזמנות שינוי בפרויקטים</p>
            </div>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition">
            <Plus className="w-4 h-4" /> צו שינוי חדש
          </button>
        </div>

        {/* Dashboard Cards */}
        {dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="טיוטות" value={fmtInt(dashboard.draft)} icon={FileEdit} color="bg-gray-500/20 text-gray-400" />
            <StatCard label="ממתינים" value={fmtInt(dashboard.submitted)} icon={Send} color="bg-blue-500/20 text-blue-400" />
            <StatCard label="מאושרים" value={fmtInt(dashboard.approved)} icon={CheckCircle2} color="bg-green-500/20 text-green-400" />
            <StatCard label="נדחו" value={fmtInt(dashboard.rejected)} icon={XCircle} color="bg-red-500/20 text-red-400" />
            <StatCard label="יושמו" value={fmtInt(dashboard.implemented)} icon={Wrench} color="bg-purple-500/20 text-purple-400" />
            <StatCard label="שווי שינויים" value={`₪${fmt(dashboard.total_price_delta)}`} icon={BarChart3} color="bg-amber-500/20 text-amber-400" />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מספר, כותרת, פרויקט..."
              className="w-full pr-10 pl-4 py-2 rounded-lg bg-[#1a1a2e] border border-white/10 text-sm text-white placeholder:text-muted-foreground" />
          </div>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#1a1a2e] border border-white/10 text-sm text-white">
            <option value="all">כל הסטטוסים</option>
            {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={load} className="p-2 rounded-lg bg-[#1a1a2e] border border-white/10 hover:bg-white/5 transition">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-white/10 bg-[#1a1a2e] overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">אין צווי שינוי</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    {[
                      { key: "vo_number", label: "מספר" },
                      { key: "title", label: "כותרת" },
                      { key: "project_name", label: "פרויקט" },
                      { key: "reason", label: "סיבה" },
                      { key: "price_delta", label: "שינוי מחיר" },
                      { key: "schedule_delta_days", label: "ימי לו\"ז" },
                      { key: "risk_level", label: "סיכון" },
                      { key: "status", label: "סטטוס" },
                      { key: "customer_signoff", label: "חתימת לקוח" },
                    ].map(col => (
                      <th key={col.key} className="px-3 py-3 text-right font-medium text-muted-foreground cursor-pointer hover:text-white"
                        onClick={() => toggleSort(col.key)}>
                        <span className="flex items-center gap-1">{col.label} <ArrowUpDown className="w-3 h-3" /></span>
                      </th>
                    ))}
                    <th className="px-3 py-3 text-right font-medium text-muted-foreground">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o => {
                    const st = statusMap[o.status] || statusMap.draft;
                    const risk = riskMap[o.risk_level] || riskMap.low;
                    const priceDelta = parseFloat(o.price_delta || 0);
                    return (
                      <tr key={o.id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="px-3 py-3 font-mono text-xs text-amber-400">{o.vo_number}</td>
                        <td className="px-3 py-3 max-w-[200px] truncate">{o.title}</td>
                        <td className="px-3 py-3 text-xs">{o.project_name || "—"}</td>
                        <td className="px-3 py-3 text-xs">{reasonMap[o.reason] || o.reason || "—"}</td>
                        <td className={`px-3 py-3 font-mono text-xs ${priceDelta > 0 ? "text-red-400" : priceDelta < 0 ? "text-green-400" : "text-muted-foreground"}`}>
                          {priceDelta > 0 ? "+" : ""}₪{fmt(o.price_delta)}
                        </td>
                        <td className={`px-3 py-3 text-center ${(o.schedule_delta_days || 0) > 0 ? "text-orange-400" : "text-muted-foreground"}`}>
                          {o.schedule_delta_days || 0}
                        </td>
                        <td className="px-3 py-3"><Badge className={`${risk.color} text-xs`}>{risk.label}</Badge></td>
                        <td className="px-3 py-3"><Badge className={`${st.color} text-xs`}>{st.label}</Badge></td>
                        <td className="px-3 py-3 text-center">
                          {o.customer_signoff ? <CheckCircle2 className="w-4 h-4 text-green-400 inline" /> : <span className="text-muted-foreground text-xs">—</span>}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => loadDetail(o.id)} className="p-1 rounded hover:bg-white/10"><Eye className="w-4 h-4" /></button>
                            {o.status === "draft" && (
                              <>
                                <button onClick={() => openEdit(o)} className="p-1 rounded hover:bg-blue-500/20 text-blue-400"><Edit2 className="w-4 h-4" /></button>
                                <button onClick={() => handleAction(o.id, "submit", { submitted_by: "admin" })}
                                  disabled={actionLoading === o.id}
                                  className="p-1 rounded hover:bg-blue-500/20 text-blue-400" title="הגש">
                                  <Send className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDelete(o.id)} className="p-1 rounded hover:bg-red-500/20 text-red-400"><Trash2 className="w-4 h-4" /></button>
                              </>
                            )}
                            {o.status === "submitted" && (
                              <>
                                <button onClick={() => handleAction(o.id, "approve", { approved_by: "admin" })}
                                  disabled={actionLoading === o.id}
                                  className="p-1 rounded hover:bg-green-500/20 text-green-400" title="אשר">
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleAction(o.id, "reject", { rejected_by: "admin", rejection_reason: "נדחה" })}
                                  disabled={actionLoading === o.id}
                                  className="p-1 rounded hover:bg-red-500/20 text-red-400" title="דחה">
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {o.status === "approved" && (
                              <button onClick={() => handleAction(o.id, "implement", { implemented_by: "admin" })}
                                disabled={actionLoading === o.id}
                                className="p-1 rounded hover:bg-purple-500/20 text-purple-400" title="יישם">
                                <Wrench className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Create/Edit Modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold">{editing ? "עריכת צו שינוי" : "צו שינוי חדש"}</h2>
                  <button onClick={() => setShowForm(false)} className="p-1 hover:bg-white/10 rounded"><X className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">כותרת *</label>
                    <input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white" />
                  </div>
                  {[
                    { key: "project_name", label: "שם פרויקט" },
                    { key: "contract_number", label: "מספר חוזה" },
                    { key: "requested_by", label: "מבקש" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs text-muted-foreground mb-1">{f.label}</label>
                      <input value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">סיבה</label>
                    <select value={form.reason || "scope_change"} onChange={e => setForm({ ...form, reason: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white">
                      {Object.entries(reasonMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  {[
                    { key: "original_contract_value", label: "ערך חוזה מקורי", type: "number" },
                    { key: "price_delta", label: "שינוי מחיר (₪)", type: "number" },
                    { key: "schedule_delta_days", label: "שינוי לו״ז (ימים)", type: "number" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs text-muted-foreground mb-1">{f.label}</label>
                      <input type={f.type} value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">רמת סיכון</label>
                    <select value={form.risk_level || "low"} onChange={e => setForm({ ...form, risk_level: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white">
                      {Object.entries(riskMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">תיאור</label>
                    <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white h-20" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">שינוי היקף</label>
                    <textarea value={form.scope_delta || ""} onChange={e => setForm({ ...form, scope_delta: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white h-16" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">הערות</label>
                    <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white h-16" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-white/10 text-sm">ביטול</button>
                  <button onClick={handleSave} disabled={saving || !form.title}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50">
                    <Save className="w-4 h-4" /> {saving ? "שומר..." : editing ? "עדכן" : "צור צו שינוי"}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Detail Modal */}
        <AnimatePresence>
          {viewDetail && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setViewDetail(null)}>
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-lg font-bold">{viewDetail.vo_number} - {viewDetail.title}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={`${(statusMap[viewDetail.status] || statusMap.draft).color} text-xs`}>
                        {(statusMap[viewDetail.status] || statusMap.draft).label}
                      </Badge>
                      {viewDetail.risk_level && (
                        <Badge className={`${(riskMap[viewDetail.risk_level] || riskMap.low).color} text-xs`}>
                          סיכון: {(riskMap[viewDetail.risk_level] || riskMap.low).label}
                        </Badge>
                      )}
                      {viewDetail.customer_signoff && (
                        <Badge className="bg-green-500/20 text-green-400 text-xs">חתימת לקוח</Badge>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-white/10 rounded"><X className="w-5 h-5" /></button>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm mb-6">
                  <div><span className="text-muted-foreground block text-xs">פרויקט</span>{viewDetail.project_name || "—"}</div>
                  <div><span className="text-muted-foreground block text-xs">חוזה</span>{viewDetail.contract_number || "—"}</div>
                  <div><span className="text-muted-foreground block text-xs">מבקש</span>{viewDetail.requested_by || "—"}</div>
                  <div><span className="text-muted-foreground block text-xs">סיבה</span>{reasonMap[viewDetail.reason] || viewDetail.reason || "—"}</div>
                  <div><span className="text-muted-foreground block text-xs">שינוי מחיר</span>
                    <span className={parseFloat(viewDetail.price_delta || 0) > 0 ? "text-red-400" : "text-green-400"}>
                      ₪{fmt(viewDetail.price_delta)}
                    </span>
                  </div>
                  <div><span className="text-muted-foreground block text-xs">שינוי לו״ז</span>{viewDetail.schedule_delta_days || 0} ימים</div>
                  <div><span className="text-muted-foreground block text-xs">ערך חוזה מקורי</span>₪{fmt(viewDetail.original_contract_value)}</div>
                  <div><span className="text-muted-foreground block text-xs">ערך חדש</span>₪{fmt(viewDetail.new_contract_value)}</div>
                  <div><span className="text-muted-foreground block text-xs">תאריך</span>{fmtDate(viewDetail.created_at)}</div>
                </div>

                {viewDetail.description && (
                  <div className="mb-4">
                    <span className="text-xs text-muted-foreground">תיאור</span>
                    <p className="text-sm mt-1">{viewDetail.description}</p>
                  </div>
                )}

                {viewDetail.scope_delta && (
                  <div className="mb-4">
                    <span className="text-xs text-muted-foreground">שינוי היקף</span>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{viewDetail.scope_delta}</p>
                  </div>
                )}

                {/* Line Items */}
                {viewDetail.line_items?.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold mb-2">פריטי שורה ({viewDetail.line_items.length})</h3>
                    <div className="rounded-lg border border-white/10 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-white/5 border-b border-white/10">
                            <th className="px-2 py-2 text-right">סוג</th>
                            <th className="px-2 py-2 text-right">תיאור</th>
                            <th className="px-2 py-2 text-right">כמות</th>
                            <th className="px-2 py-2 text-right">מחיר יחידה</th>
                            <th className="px-2 py-2 text-right">סה״כ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {viewDetail.line_items.map((li: any) => (
                            <tr key={li.id} className="border-b border-white/5">
                              <td className="px-2 py-2">
                                <Badge className={`text-[10px] ${li.item_type === "addition" ? "bg-green-500/20 text-green-400" : li.item_type === "deduction" ? "bg-red-500/20 text-red-400" : "bg-blue-500/20 text-blue-400"}`}>
                                  {li.item_type === "addition" ? "תוספת" : li.item_type === "deduction" ? "ניכוי" : "שינוי"}
                                </Badge>
                              </td>
                              <td className="px-2 py-2">{li.description || "—"}</td>
                              <td className="px-2 py-2 font-mono">{li.quantity} {li.unit}</td>
                              <td className="px-2 py-2 font-mono">₪{fmt(li.unit_price)}</td>
                              <td className="px-2 py-2 font-mono font-bold">₪{fmt(li.total_price)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Approvals */}
                {viewDetail.approvals?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-2">היסטוריית אישורים</h3>
                    <div className="space-y-2">
                      {viewDetail.approvals.map((a: any) => {
                        const actionLabels: Record<string, string> = { submit: "הגשה", approve: "אישור", reject: "דחייה", implement: "יישום" };
                        return (
                          <div key={a.id} className="text-xs p-2 rounded-lg bg-black/20 border border-white/5 flex items-center gap-2">
                            <span className="text-muted-foreground">{fmtDate(a.decision_date)}</span>
                            <Badge className="text-[10px] bg-white/10">{actionLabels[a.action] || a.action}</Badge>
                            <span className="font-medium">{a.approver_name}</span>
                            {a.approver_role && <span className="text-muted-foreground">({a.approver_role})</span>}
                            {a.comments && <span className="text-muted-foreground">- {a.comments}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Actions in detail */}
                <div className="flex gap-2 mt-6 pt-4 border-t border-white/10">
                  {viewDetail.status === "draft" && (
                    <button onClick={() => handleAction(viewDetail.id, "submit", { submitted_by: "admin" })}
                      disabled={actionLoading === viewDetail.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs">
                      <Send className="w-3 h-3" /> הגש לאישור
                    </button>
                  )}
                  {viewDetail.status === "submitted" && (
                    <>
                      <button onClick={() => handleAction(viewDetail.id, "approve", { approved_by: "admin" })}
                        disabled={actionLoading === viewDetail.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs">
                        <CheckCircle2 className="w-3 h-3" /> אשר
                      </button>
                      <button onClick={() => handleAction(viewDetail.id, "reject", { rejected_by: "admin", rejection_reason: "נדחה" })}
                        disabled={actionLoading === viewDetail.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs">
                        <XCircle className="w-3 h-3" /> דחה
                      </button>
                    </>
                  )}
                  {viewDetail.status === "approved" && (
                    <button onClick={() => handleAction(viewDetail.id, "implement", { implemented_by: "admin" })}
                      disabled={actionLoading === viewDetail.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs">
                      <Wrench className="w-3 h-3" /> יישם
                    </button>
                  )}
                  {!viewDetail.customer_signoff && viewDetail.status !== "draft" && (
                    <button onClick={() => handleAction(viewDetail.id, "customer-signoff", { customer_signoff_by: "לקוח" })}
                      disabled={actionLoading === viewDetail.id}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs">
                      <FileCheck className="w-3 h-3" /> חתימת לקוח
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
