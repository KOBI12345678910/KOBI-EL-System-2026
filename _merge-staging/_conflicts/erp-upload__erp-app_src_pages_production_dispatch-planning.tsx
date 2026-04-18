import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Truck, Search, Plus, Eye, X, Save, CheckCircle2, ArrowUpDown, RefreshCw,
  Package, MapPin, Clock, AlertTriangle, Camera, Pen, BarChart3, Loader2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/utils";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : [];
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (v: any) => Number(v || 0).toLocaleString("he-IL");
const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString("he-IL") : "—";
const fmtDateTime = (v: any) => v ? new Date(v).toLocaleString("he-IL") : "—";

const statusMap: Record<string, { label: string; color: string }> = {
  planning: { label: "תכנון", color: "bg-blue-500/20 text-blue-400" },
  loaded: { label: "נטען", color: "bg-indigo-500/20 text-indigo-400" },
  in_transit: { label: "בדרך", color: "bg-yellow-500/20 text-yellow-400" },
  delivered: { label: "נמסר", color: "bg-green-500/20 text-green-400" },
  exception: { label: "חריג", color: "bg-red-500/20 text-red-400" },
};

const priorityMap: Record<string, { label: string; color: string }> = {
  low: { label: "נמוך", color: "bg-gray-500/20 text-gray-400" },
  normal: { label: "רגיל", color: "bg-blue-500/20 text-blue-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  urgent: { label: "דחוף", color: "bg-red-500/20 text-red-400" },
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

export default function DispatchPlanningPage() {
  const [orders, setOrders] = useState<any[]>([]);
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
  const [tab, setTab] = useState("board");

  const load = async () => {
    setLoading(true);
    try {
      const [ordRes, dashRes] = await Promise.all([
        authFetch(`${API}/dispatch`),
        authFetch(`${API}/dispatch/dashboard`),
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
      (!search || [r.dispatch_number, r.driver, r.route, r.vehicle_plate, r.destination_location]
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

  const handleCreate = async () => {
    setSaving(true);
    try {
      const res = await authFetch(`${API}/dispatch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (res.ok) { setShowForm(false); setForm({}); load(); }
    } catch {}
    setSaving(false);
  };

  const handleAction = async (id: number, action: string, body: any = {}) => {
    setActionLoading(id);
    try {
      const res = await authFetch(`${API}/dispatch/${id}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) load();
    } catch {}
    setActionLoading(null);
  };

  const loadDetail = async (id: number) => {
    try {
      const res = await authFetch(`${API}/dispatch/${id}`);
      if (res.ok) setViewDetail(await res.json());
    } catch {}
  };

  // Board view - group by status
  const boardColumns = ["planning", "loaded", "in_transit", "delivered", "exception"];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a1a] via-[#101030] to-[#0a0a1a] text-white p-6" dir="rtl">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">תכנון שיגור ומשלוחים</h1>
              <p className="text-sm text-muted-foreground">ניהול הובלות, טעינה ומשלוחים</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-white/10 overflow-hidden">
              <button onClick={() => setTab("board")} className={`px-3 py-1.5 text-xs ${tab === "board" ? "bg-white/10 text-white" : "text-muted-foreground"}`}>לוח</button>
              <button onClick={() => setTab("table")} className={`px-3 py-1.5 text-xs ${tab === "table" ? "bg-white/10 text-white" : "text-muted-foreground"}`}>טבלה</button>
            </div>
            <button onClick={() => { setForm({}); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition">
              <Plus className="w-4 h-4" /> שיגור חדש
            </button>
          </div>
        </div>

        {/* Dashboard Cards */}
        {dashboard && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard label="בתכנון" value={fmtInt(dashboard.planning)} icon={Clock} color="bg-blue-500/20 text-blue-400" />
            <StatCard label="נטען" value={fmtInt(dashboard.loaded)} icon={Package} color="bg-indigo-500/20 text-indigo-400" />
            <StatCard label="בדרך" value={fmtInt(dashboard.in_transit)} icon={Truck} color="bg-yellow-500/20 text-yellow-400" />
            <StatCard label="נמסר" value={fmtInt(dashboard.delivered)} icon={CheckCircle2} color="bg-green-500/20 text-green-400" />
            <StatCard label="חריגים" value={fmtInt(dashboard.exceptions)} icon={AlertTriangle} color="bg-red-500/20 text-red-400" />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי מספר, נהג, יעד..."
              className="w-full pr-10 pl-4 py-2 rounded-lg bg-[#1a1a2e] border border-white/10 text-sm text-white placeholder:text-muted-foreground" />
          </div>
          {tab === "table" && (
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#1a1a2e] border border-white/10 text-sm text-white">
              <option value="all">כל הסטטוסים</option>
              {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          )}
          <button onClick={load} className="p-2 rounded-lg bg-[#1a1a2e] border border-white/10 hover:bg-white/5 transition">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full" />
          </div>
        ) : tab === "board" ? (
          /* Board View */
          <div className="grid grid-cols-5 gap-3 min-h-[400px]">
            {boardColumns.map(status => {
              const st = statusMap[status];
              const colOrders = orders.filter(o => o.status === status && (!search || [o.dispatch_number, o.driver, o.route].some(f => f?.toLowerCase().includes(search.toLowerCase()))));
              return (
                <div key={status} className="rounded-xl border border-white/10 bg-[#1a1a2e] p-3">
                  <div className="flex items-center justify-between mb-3">
                    <Badge className={`${st.color} text-xs`}>{st.label}</Badge>
                    <span className="text-xs text-muted-foreground">{colOrders.length}</span>
                  </div>
                  <div className="space-y-2">
                    {colOrders.map(o => (
                      <motion.div key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="rounded-lg border border-white/5 bg-black/20 p-3 cursor-pointer hover:bg-white/5 transition"
                        onClick={() => loadDetail(o.id)}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs text-blue-400">{o.dispatch_number}</span>
                          {o.priority && o.priority !== "normal" && (
                            <Badge className={`${(priorityMap[o.priority] || priorityMap.normal).color} text-[10px]`}>
                              {(priorityMap[o.priority] || priorityMap.normal).label}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-white">{o.driver || "לא שובץ"}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" /> {o.destination_location || o.route || "—"}
                        </div>
                        <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
                          <span>{o.total_items || 0} פריטים</span>
                          <span>{o.total_weight_kg || 0} ק״ג</span>
                        </div>
                        <div className="flex gap-1 mt-2">
                          {status === "planning" && (
                            <button onClick={e => { e.stopPropagation(); handleAction(o.id, "load", { loaded_by: "admin" }); }}
                              disabled={actionLoading === o.id}
                              className="flex-1 text-[10px] py-1 rounded bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30">
                              {actionLoading === o.id ? "..." : "טעינה"}
                            </button>
                          )}
                          {status === "loaded" && (
                            <button onClick={e => { e.stopPropagation(); handleAction(o.id, "depart"); }}
                              disabled={actionLoading === o.id}
                              className="flex-1 text-[10px] py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30">
                              {actionLoading === o.id ? "..." : "יציאה"}
                            </button>
                          )}
                          {status === "in_transit" && (
                            <button onClick={e => { e.stopPropagation(); handleAction(o.id, "deliver"); }}
                              disabled={actionLoading === o.id}
                              className="flex-1 text-[10px] py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30">
                              {actionLoading === o.id ? "..." : "נמסר"}
                            </button>
                          )}
                        </div>
                      </motion.div>
                    ))}
                    {colOrders.length === 0 && <div className="text-xs text-muted-foreground text-center py-4">אין פריטים</div>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="rounded-xl border border-white/10 bg-[#1a1a2e] overflow-hidden">
            {filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-16">אין הזמנות שיגור</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/5">
                      {[
                        { key: "dispatch_number", label: "מספר" },
                        { key: "driver", label: "נהג" },
                        { key: "vehicle_plate", label: "רכב" },
                        { key: "destination_location", label: "יעד" },
                        { key: "departure_date", label: "יציאה" },
                        { key: "total_items", label: "פריטים" },
                        { key: "total_weight_kg", label: "משקל" },
                        { key: "status", label: "סטטוס" },
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
                      const st = statusMap[o.status] || statusMap.planning;
                      return (
                        <tr key={o.id} className="border-b border-white/5 hover:bg-white/5 transition">
                          <td className="px-3 py-3 font-mono text-xs text-blue-400">{o.dispatch_number}</td>
                          <td className="px-3 py-3">{o.driver || "—"}</td>
                          <td className="px-3 py-3 font-mono text-xs">{o.vehicle_plate || "—"}</td>
                          <td className="px-3 py-3 text-xs">{o.destination_location || o.route || "—"}</td>
                          <td className="px-3 py-3 text-xs">{fmtDate(o.departure_date)}</td>
                          <td className="px-3 py-3 text-center">{o.total_items || 0}</td>
                          <td className="px-3 py-3 font-mono text-xs">{fmt(o.total_weight_kg)} ק״ג</td>
                          <td className="px-3 py-3"><Badge className={`${st.color} text-xs`}>{st.label}</Badge></td>
                          <td className="px-3 py-3">
                            <button onClick={() => loadDetail(o.id)} className="p-1 rounded hover:bg-white/10">
                              <Eye className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Create Form Modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                className="bg-[#1a1a2e] border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold">שיגור חדש</h2>
                  <button onClick={() => setShowForm(false)} className="p-1 hover:bg-white/10 rounded"><X className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: "driver", label: "נהג", type: "text" },
                    { key: "driver_phone", label: "טלפון נהג", type: "text" },
                    { key: "vehicle_plate", label: "לוחית רכב", type: "text" },
                    { key: "origin_location", label: "מוצא", type: "text" },
                    { key: "destination_location", label: "יעד", type: "text" },
                    { key: "route", label: "מסלול", type: "text" },
                    { key: "departure_date", label: "תאריך יציאה", type: "datetime-local" },
                    { key: "estimated_arrival", label: "הגעה משוערת", type: "datetime-local" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs text-muted-foreground mb-1">{f.label}</label>
                      <input type={f.type} value={form[f.key] || ""} onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">עדיפות</label>
                    <select value={form.priority || "normal"} onChange={e => setForm({ ...form, priority: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white">
                      {Object.entries(priorityMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">הערות</label>
                    <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm text-white h-20" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border border-white/10 text-sm">ביטול</button>
                  <button onClick={handleCreate} disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50">
                    <Save className="w-4 h-4" /> {saving ? "שומר..." : "צור שיגור"}
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
                    <h2 className="text-lg font-bold">{viewDetail.dispatch_number}</h2>
                    <Badge className={`${(statusMap[viewDetail.status] || statusMap.planning).color} text-xs mt-1`}>
                      {(statusMap[viewDetail.status] || statusMap.planning).label}
                    </Badge>
                  </div>
                  <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-white/10 rounded"><X className="w-5 h-5" /></button>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm mb-6">
                  <div><span className="text-muted-foreground block text-xs">נהג</span>{viewDetail.driver || "—"}</div>
                  <div><span className="text-muted-foreground block text-xs">רכב</span>{viewDetail.vehicle_plate || "—"}</div>
                  <div><span className="text-muted-foreground block text-xs">טלפון</span>{viewDetail.driver_phone || "—"}</div>
                  <div><span className="text-muted-foreground block text-xs">מוצא</span>{viewDetail.origin_location || "—"}</div>
                  <div><span className="text-muted-foreground block text-xs">יעד</span>{viewDetail.destination_location || "—"}</div>
                  <div><span className="text-muted-foreground block text-xs">יציאה</span>{fmtDateTime(viewDetail.departure_date)}</div>
                </div>

                {/* Items / Loading Checklist */}
                {viewDetail.items?.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold mb-2">רשימת פריטים ({viewDetail.items.length})</h3>
                    <div className="space-y-2">
                      {viewDetail.items.map((item: any) => (
                        <div key={item.id} className={`flex items-center gap-3 p-2 rounded-lg border ${item.loaded ? "border-green-500/30 bg-green-500/5" : "border-white/5 bg-black/20"}`}>
                          <div className={`w-6 h-6 rounded flex items-center justify-center text-xs ${item.loaded ? "bg-green-500/20 text-green-400" : "bg-white/10 text-muted-foreground"}`}>
                            {item.loaded ? <CheckCircle2 className="w-4 h-4" /> : "☐"}
                          </div>
                          <div className="flex-1">
                            <div className="text-xs text-white">{item.description || `פריט #${item.id}`}</div>
                            <div className="text-[10px] text-muted-foreground">{item.entity_type} {item.entity_number && `#${item.entity_number}`} | כמות: {item.qty} | {item.weight_kg} ק״ג</div>
                          </div>
                          {item.is_fragile && <Badge className="bg-orange-500/20 text-orange-400 text-[10px]">שביר</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Evidence */}
                {viewDetail.evidence?.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-2">ראיות מסירה ({viewDetail.evidence.length})</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {viewDetail.evidence.map((ev: any) => (
                        <div key={ev.id} className="p-2 rounded-lg border border-white/5 bg-black/20 text-xs">
                          <div className="flex items-center gap-1">
                            {ev.photo_url && <Camera className="w-3 h-3 text-blue-400" />}
                            {ev.signature_url && <Pen className="w-3 h-3 text-green-400" />}
                            <span className="text-muted-foreground">{fmtDateTime(ev.captured_at)}</span>
                          </div>
                          {ev.receiver_name && <div className="mt-1">מקבל: {ev.receiver_name}</div>}
                          {ev.condition_notes && <div className="text-muted-foreground mt-1">{ev.condition_notes}</div>}
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
