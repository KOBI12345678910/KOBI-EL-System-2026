import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileCheck, Search, Plus, Eye, X, Save, CheckCircle2, AlertTriangle,
  Pause, Play, BarChart3, ArrowUpDown, RefreshCw, ShieldCheck, ShieldAlert, ShieldX
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : [];
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  matched: { label: "תואם", color: "bg-green-500/20 text-green-400", icon: ShieldCheck },
  partial: { label: "חלקי", color: "bg-yellow-500/20 text-yellow-400", icon: ShieldAlert },
  mismatch: { label: "אי התאמה", color: "bg-red-500/20 text-red-400", icon: ShieldX },
  on_hold: { label: "מוקפא", color: "bg-purple-500/20 text-purple-400", icon: Pause },
  pending: { label: "ממתין", color: "bg-gray-500/20 text-gray-400", icon: RefreshCw },
};

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: any; color: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl border border-white/10 bg-[#1a1a2e] p-4 flex items-center gap-3`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}><Icon className="w-5 h-5" /></div>
      <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-lg font-bold text-white">{value}</div></div>
    </motion.div>
  );
}

export default function ThreeWayMatchPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortField, setSortField] = useState("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showForm, setShowForm] = useState(false);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [recRes, dashRes] = await Promise.all([
        authFetch(`${API}/three-way-match/records`),
        authFetch(`${API}/three-way-match/dashboard`),
      ]);
      if (recRes.ok) setRecords(safeArray(await recRes.json()));
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
    let data = records.filter(r =>
      (filterStatus === "all" || r.match_status === filterStatus) &&
      (!search || [r.po_number, r.invoice_number, r.receipt_number, r.supplier_name]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? "";
      const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return data;
  }, [records, filterStatus, search, sortField, sortDir]);

  const handleMatch = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`${API}/three-way-match/match`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) { setShowForm(false); setForm({}); load(); }
    } catch {}
    setSaving(false);
  };

  const handleAction = async (id: number, action: string, body: any = {}) => {
    setActionLoading(id);
    try {
      const res = await authFetch(`${API}/three-way-match/${id}/${action}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) load();
    } catch {}
    setActionLoading(null);
  };

  const loadDetail = async (id: number) => {
    try {
      const res = await authFetch(`${API}/three-way-match/records/${id}`);
      if (res.ok) setViewDetail(await res.json());
    } catch {}
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#101030] to-[#0a0a1a] text-white p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <FileCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">התאמה תלת-כיוונית</h1>
              <p className="text-sm text-muted-foreground">התאמת הזמנת רכש, קבלת סחורה וחשבונית</p>
            </div>
          </div>
          <button onClick={() => { setForm({}); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition">
            <Plus className="w-4 h-4" /> התאמה חדשה
          </button>
        </div>

        {/* Dashboard Cards */}
        {dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="סה״כ" value={fmtInt(dashboard.total)} icon={BarChart3} color="bg-blue-500/20 text-blue-400" />
            <StatCard label="תואם" value={fmtInt(dashboard.matched)} icon={ShieldCheck} color="bg-green-500/20 text-green-400" />
            <StatCard label="חלקי" value={fmtInt(dashboard.partial)} icon={ShieldAlert} color="bg-yellow-500/20 text-yellow-400" />
            <StatCard label="אי-התאמה" value={fmtInt(dashboard.mismatch)} icon={ShieldX} color="bg-red-500/20 text-red-400" />
            <StatCard label="מוקפא" value={fmtInt(dashboard.on_hold)} icon={Pause} color="bg-purple-500/20 text-purple-400" />
            <StatCard label="סטיית מחיר" value={`₪${fmt(dashboard.total_price_variance)}`} icon={AlertTriangle} color="bg-orange-500/20 text-orange-400" />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..."
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
              <div className="animate-spin w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground py-16">אין רשומות</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    {[
                      { key: "po_number", label: "הזמנת רכש" },
                      { key: "receipt_number", label: "קבלה" },
                      { key: "invoice_number", label: "חשבונית" },
                      { key: "supplier_name", label: "ספק" },
                      { key: "po_amount", label: "סכום הזמנה" },
                      { key: "invoice_amount", label: "סכום חשבונית" },
                      { key: "price_variance", label: "סטיית מחיר" },
                      { key: "qty_variance", label: "סטיית כמות" },
                      { key: "match_status", label: "סטטוס" },
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
                  {filtered.map(r => {
                    const st = statusMap[r.match_status] || statusMap.pending;
                    const hasVariance = parseFloat(r.price_variance || 0) > 0 || parseFloat(r.qty_variance || 0) > 0;
                    return (
                      <tr key={r.id} className="border-b border-white/5 hover:bg-white/5 transition">
                        <td className="px-3 py-3 font-mono text-xs">{r.po_number || "—"}</td>
                        <td className="px-3 py-3 font-mono text-xs">{r.receipt_number || "—"}</td>
                        <td className="px-3 py-3 font-mono text-xs">{r.invoice_number || "—"}</td>
                        <td className="px-3 py-3">{r.supplier_name || "—"}</td>
                        <td className="px-3 py-3 text-left font-mono">₪{fmt(r.po_amount)}</td>
                        <td className="px-3 py-3 text-left font-mono">₪{fmt(r.invoice_amount)}</td>
                        <td className={`px-3 py-3 text-left font-mono ${hasVariance ? "text-red-400" : "text-green-400"}`}>
                          ₪{fmt(r.price_variance)}
                        </td>
                        <td className={`px-3 py-3 text-left font-mono ${parseFloat(r.qty_variance || 0) > 0 ? "text-red-400" : "text-green-400"}`}>
                          {fmt(r.qty_variance)}
                        </td>
                        <td className="px-3 py-3">
                          <Badge className={`${st.color} text-xs`}>{st.label}</Badge>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => loadDetail(r.id)} className="p-1 rounded hover:bg-white/10"><Eye className="w-4 h-4" /></button>
                            {(r.match_status === "partial" || r.match_status === "mismatch") && (
                              <>
                                <button onClick={() => handleAction(r.id, "approve-variance", { approved_by: "admin" })}
                                  disabled={actionLoading === r.id}
                                  className="p-1 rounded hover:bg-green-500/20 text-green-400" title="אשר סטייה">
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleAction(r.id, "hold", { hold_reason: "בבדיקה", hold_by: "admin" })}
                                  disabled={actionLoading === r.id}
                                  className="p-1 rounded hover:bg-purple-500/20 text-purple-400" title="הקפא">
                                  <Pause className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {r.match_status === "on_hold" && (
                              <button onClick={() => handleAction(r.id, "release", { release_by: "admin" })}
                                disabled={actionLoading === r.id}
                                className="p-1 rounded hover:bg-blue-500/20 text-blue-400" title="שחרר">
                                <Play className="w-4 h-4" />
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

        {/* New Match Form Modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold">התאמה חדשה</h2>
                  <button onClick={() => setShowForm(false)} className="p-1 hover:bg-white/10 rounded"><X className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: "po_number", label: "מס׳ הזמנת רכש", type: "text" },
                    { key: "receipt_number", label: "מס׳ קבלה", type: "text" },
                    { key: "invoice_number", label: "מס׳ חשבונית", type: "text" },
                    { key: "supplier_name", label: "ספק", type: "text" },
                    { key: "po_amount", label: "סכום הזמנה", type: "number" },
                    { key: "receipt_amount", label: "סכום קבלה", type: "number" },
                    { key: "invoice_amount", label: "סכום חשבונית", type: "number" },
                    { key: "qty_ordered", label: "כמות הוזמנה", type: "number" },
                    { key: "qty_received", label: "כמות התקבלה", type: "number" },
                    { key: "qty_invoiced", label: "כמות חשבונית", type: "number" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs text-muted-foreground mb-1">{f.label}</label>
                      <input type={f.type} value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white" />
                    </div>
                  ))}
                  <div className="col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">הערות</label>
                    <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white h-20" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-white/10 text-sm">ביטול</button>
                  <button onClick={handleMatch} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50">
                    <Save className="w-4 h-4" /> {saving ? "שומר..." : "בצע התאמה"}
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
                className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold">פרטי התאמה #{viewDetail.id}</h2>
                  <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-white/10 rounded"><X className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><span className="text-muted-foreground">הזמנת רכש:</span> <span className="font-mono">{viewDetail.po_number || "—"}</span></div>
                  <div><span className="text-muted-foreground">קבלה:</span> <span className="font-mono">{viewDetail.receipt_number || "—"}</span></div>
                  <div><span className="text-muted-foreground">חשבונית:</span> <span className="font-mono">{viewDetail.invoice_number || "—"}</span></div>
                  <div><span className="text-muted-foreground">ספק:</span> {viewDetail.supplier_name || "—"}</div>
                  <div><span className="text-muted-foreground">סכום הזמנה:</span> ₪{fmt(viewDetail.po_amount)}</div>
                  <div><span className="text-muted-foreground">סכום קבלה:</span> ₪{fmt(viewDetail.receipt_amount)}</div>
                  <div><span className="text-muted-foreground">סכום חשבונית:</span> ₪{fmt(viewDetail.invoice_amount)}</div>
                  <div><span className="text-muted-foreground">ציון התאמה:</span> <span className="font-bold">{fmt(viewDetail.match_score)}%</span></div>
                  <div><span className="text-muted-foreground">סטיית מחיר:</span> <span className="text-red-400 font-mono">₪{fmt(viewDetail.price_variance)}</span></div>
                  <div><span className="text-muted-foreground">סטיית כמות:</span> <span className="text-red-400 font-mono">{fmt(viewDetail.qty_variance)}</span></div>
                  <div className="col-span-2"><span className="text-muted-foreground">סטטוס:</span> <Badge className={`${(statusMap[viewDetail.match_status] || statusMap.pending).color} mr-2`}>{(statusMap[viewDetail.match_status] || statusMap.pending).label}</Badge></div>
                  {viewDetail.hold_reason && <div className="col-span-2"><span className="text-muted-foreground">סיבת הקפאה:</span> {viewDetail.hold_reason}</div>}
                  {viewDetail.approved_by && <div className="col-span-2"><span className="text-muted-foreground">אושר ע״י:</span> {viewDetail.approved_by}</div>}
                  {viewDetail.notes && <div className="col-span-2"><span className="text-muted-foreground">הערות:</span> {viewDetail.notes}</div>}
                </div>
                {viewDetail.hold_logs?.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-bold mb-2">יומן פעולות</h3>
                    <div className="space-y-2">
                      {viewDetail.hold_logs.map((log: any) => (
                        <div key={log.id} className="text-xs p-2 rounded-lg bg-black/20 border border-white/5">
                          <span className="text-muted-foreground">{new Date(log.performed_at).toLocaleString("he-IL")}</span>
                          {" — "}<span className="font-medium">{log.action}</span> — {log.performed_by} {log.reason && `(${log.reason})`}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
