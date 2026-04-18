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
  KeyRound, Search, Edit2, Trash2, X, Eye, ArrowUpDown, AlertTriangle,
  CheckCircle2, XCircle, Clock, Shield, UserCheck, Users, Plus, Save, Filter
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const DetailField = ({ label, value, children }: any) => (
  <div><span className="text-xs text-muted-foreground">{label}</span><div className="text-sm text-foreground mt-0.5">{children || value || "—"}</div></div>
);

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: "ממתין", color: "bg-yellow-500/20 text-yellow-400", icon: Clock },
  approved: { label: "אושר", color: "bg-green-500/20 text-green-400", icon: CheckCircle2 },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400", icon: XCircle },
};

const accessTypeMap: Record<string, string> = {
  read: "קריאה בלבד",
  write: "קריאה וכתיבה",
  admin: "מנהל",
  full: "גישה מלאה",
};

export default function AccessRequestsSection() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterModule, setFilterModule] = useState("all");
  const [sortField, setSortField] = useState("requested_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const pagination = useSmartPagination(25);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();
  const [detailTab, setDetailTab] = useState("details");

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API}/settings/access-requests`);
      if (res.ok) setItems(safeArray(await res.json()));
      else throw new Error("שגיאה בטעינת בקשות גישה");
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSort = (f: string) => { if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortField(f); setSortDir("desc"); } };

  const uniqueModules = useMemo(() => [...new Set(items.map(i => i.module).filter(Boolean))], [items]);

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (filterModule === "all" || i.module === filterModule) &&
      (!search || [i.user, i.user_name, i.module, i.access_type, i.reason].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    data.sort((a: any, b: any) => {
      const va = a[sortField] ?? ""; const vb = b[sortField] ?? "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "he");
      return sortDir === "asc" ? cmp : -cmp;
    });
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus, filterModule, sortField, sortDir]);

  const updateStatus = async (id: number, status: string) => {
    await authFetch(`${API}/settings/access-requests/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    setViewDetail(null); load();
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק בקשת גישה?")) {
      await authFetch(`${API}/settings/access-requests/${id}`, { method: "DELETE" }); load();
    }
  };

  const openCreate = () => { setEditing(null); setForm({ user: "", module: "", access_type: "read", reason: "" }); setShowForm(true); };
  const openEdit = (r: any) => { setEditing(r); setForm({ user: r.user || r.user_name || "", module: r.module || "", access_type: r.access_type || r.accessType || "read", reason: r.reason || "", status: r.status || "pending" }); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/settings/access-requests/${editing.id}` : `${API}/settings/access-requests`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } catch {}
    setSaving(false);
  };

  const pendingCount = items.filter(i => i.status === "pending").length;
  const approvedCount = items.filter(i => i.status === "approved").length;
  const rejectedCount = items.filter(i => i.status === "rejected").length;

  const kpis = [
    { label: 'סה"כ בקשות', value: fmt(items.length), icon: KeyRound, color: "text-blue-400" },
    { label: "ממתינות", value: fmt(pendingCount), icon: Clock, color: "text-yellow-400" },
    { label: "אושרו", value: fmt(approvedCount), icon: CheckCircle2, color: "text-green-400" },
    { label: "נדחו", value: fmt(rejectedCount), icon: XCircle, color: "text-red-400" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2"><KeyRound className="text-yellow-400 w-6 h-6" /> בקשות גישה</h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול בקשות גישה — אישור, דחייה והיסטוריה</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ExportDropdown data={filtered} headers={{ user: "משתמש", module: "מודול", access_type: "סוג גישה", status: "סטטוס", requested_at: "תאריך" }} filename="access_requests" />
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium"><Plus className="w-4 h-4" /> בקשה חדשה</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="bg-card border border-border/50 rounded-2xl p-4">
            <kpi.icon className={`${kpi.color} w-5 h-5 mb-2`} /><div className="text-xl font-bold text-foreground">{kpi.value}</div><div className="text-xs text-muted-foreground">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש לפי משתמש או מודול..." className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {uniqueModules.length > 0 && (
          <select value={filterModule} onChange={e => setFilterModule(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
            <option value="all">כל המודולים</option>{uniqueModules.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-4"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">{Array.from({length:6}).map((_,i)=><div key={i} className="bg-card border border-border/50 rounded-2xl p-4 animate-pulse"><div className="h-5 w-5 bg-muted/30 rounded mb-2" /><div className="h-6 w-20 bg-muted/30 rounded mb-1" /><div className="h-3 w-16 bg-muted/30 rounded" /></div>)}</div><div className="h-10 bg-muted/20 rounded-xl animate-pulse" /><div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><table className="w-full"><tbody>{Array.from({length:8}).map((_,i)=><tr key={i} className="border-b border-border/20"><td className="p-3" colSpan={99}><div className="flex items-center gap-4 animate-pulse"><div className="h-4 w-4 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-32 bg-muted/30 rounded" /><div className="h-4 w-24 bg-muted/30 rounded" /><div className="h-4 w-20 bg-muted/30 rounded" /><div className="h-4 w-16 bg-muted/30 rounded" /><div className="h-4 w-28 bg-muted/30 rounded" /></div></td></tr>)}</tbody></table></div></div>
      ) : error ? (
        <div className="text-center py-16 text-red-400"><AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-50" /><p className="font-medium">{error}</p><button onClick={load} className="mt-4 px-4 py-2 bg-primary/20 text-primary rounded-lg text-sm">נסה שנית</button></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground"><KeyRound className="w-12 h-12 mx-auto mb-3 opacity-30" /><p className="font-medium">אין בקשות גישה</p><p className="text-sm mt-1">נסה לשנות סינון או ליצור בקשה חדשה</p></div>
      ) : (<>
        <BulkActions selectedIds={selectedIds} onClear={clear} entityName="בקשות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/settings/access-requests`)} />
        <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden"><div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50"><tr>
              <th className="px-2 py-3 w-10"><BulkCheckbox allIds={filtered.map((r: any) => r.id)} selectedIds={selectedIds} toggleAll={toggleAll} /></th>
              {[{ key: "user", label: "משתמש" }, { key: "module", label: "מודול" }, { key: "access_type", label: "סוג גישה" }, { key: "requested_at", label: "תאריך" }, { key: "status", label: "סטטוס" }].map(col => (
                <th key={col.key} onClick={() => toggleSort(col.key)} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground"><div className="flex items-center gap-1">{col.label}<ArrowUpDown className="w-3 h-3" /></div></th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">פעולות</th>
            </tr></thead>
            <tbody>{pagination.paginate(filtered).map(r => {
              const cfg = statusMap[r.status] || statusMap.pending;
              return (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                <td className="px-2 py-3 w-10"><BulkCheckbox id={r.id} selectedIds={selectedIds} toggle={toggle} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">{(r.user || r.user_name || "?").charAt(0)}</div>
                    <span className="text-foreground font-medium">{r.user || r.user_name || "—"}</span>
                  </div>
                </td>
                <td className="px-4 py-3"><Badge className="text-[10px] bg-muted/50 text-muted-foreground">{r.module || "—"}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{accessTypeMap[r.access_type || r.accessType] || r.access_type || r.accessType || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{r.requested_at || r.requestedAt || r.created_at?.slice(0, 16) || "—"}</td>
                <td className="px-4 py-3"><Badge className={`text-[10px] ${cfg.color}`}>{cfg.label}</Badge></td>
                <td className="px-4 py-3"><div className="flex gap-1">
                  <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                  {r.status === "pending" && (<>
                    <button onClick={() => updateStatus(r.id, "approved")} className="p-1.5 hover:bg-green-500/10 rounded-lg" title="אשר"><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /></button>
                    <button onClick={() => updateStatus(r.id, "rejected")} className="p-1.5 hover:bg-red-500/10 rounded-lg" title="דחה"><XCircle className="w-3.5 h-3.5 text-red-400" /></button>
                  </>)}
                  <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                  {isSuperAdmin && <button onClick={async()=>{if(await globalConfirm(`למחוק את '${r.id || r.id}'? פעולה זו אינה ניתנת לביטול.`))remove(r.id)}} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                </div></td>
              </tr>);
            })}</tbody>
          </table>
        </div></div>
        <SmartPagination pagination={pagination} />
      </>)}

      <AnimatePresence>{viewDetail && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground flex items-center gap-2"><Shield className="w-5 h-5 text-yellow-400" /> פרטי בקשת גישה</h2><button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 grid grid-cols-2 gap-4">
              <DetailField label="משתמש" value={viewDetail.user || viewDetail.user_name} />
              <DetailField label="מודול" value={viewDetail.module} />
              <DetailField label="סוג גישה" value={accessTypeMap[viewDetail.access_type || viewDetail.accessType] || viewDetail.access_type || viewDetail.accessType} />
              <DetailField label="תאריך" value={viewDetail.requested_at || viewDetail.requestedAt || viewDetail.created_at?.slice(0, 16)} />
              <DetailField label="סטטוס"><Badge className={statusMap[viewDetail.status]?.color}>{statusMap[viewDetail.status]?.label}</Badge></DetailField>
              <DetailField label="מזהה" value={String(viewDetail.id)} />
              <div className="col-span-2"><DetailField label="סיבה" value={viewDetail.reason} /></div>
            </div>
            {viewDetail.status === "pending" && (
              <div className="p-5 border-t border-border flex gap-3">
                <button onClick={() => updateStatus(viewDetail.id, "approved")} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-foreground rounded-lg text-sm flex items-center justify-center gap-2"><CheckCircle2 className="w-4 h-4" /> אשר</button>
                <button onClick={() => updateStatus(viewDetail.id, "rejected")} className="flex-1 px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-red-500/10"><XCircle className="w-4 h-4 text-red-400" /> דחה</button>
              </div>
            )}
            <div className="border-t border-border">
              <div className="flex gap-2 px-5 pt-3">
                {[{ id: "details", label: "פרטים" }, { id: "related", label: "רשומות קשורות" }, { id: "attachments", label: "קבצים" }, { id: "log", label: "לוג פעילות" }].map(tab => (
                  <button key={tab.id} onClick={() => setDetailTab(tab.id)} className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${detailTab === tab.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/30"}`}>{tab.label}</button>
                ))}
              </div>
              <div className="p-5">
                {detailTab === "details" && (
                  <div className="flex justify-end gap-2">
                    <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm hover:bg-blue-500/30"><Edit2 className="w-3.5 h-3.5 inline ml-1" /> עריכה</button>
                    <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
                  </div>
                )}
                {detailTab === "related" && <RelatedRecords entityType="access-requests" entityId={viewDetail.id} />}
                {detailTab === "attachments" && <AttachmentsSection entityType="access-requests" entityId={viewDetail.id} />}
                {detailTab === "log" && <ActivityLog entityType="access-requests" entityId={viewDetail.id} />}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>

      <AnimatePresence>{showForm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center"><h2 className="text-lg font-bold text-foreground">{editing ? "עריכת בקשה" : "בקשת גישה חדשה"}</h2><button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5 space-y-4">
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">משתמש *</label><input value={form.user || ""} onChange={e => setForm({ ...form, user: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם משתמש" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">מודול *</label><input value={form.module || ""} onChange={e => setForm({ ...form, module: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם מודול" /></div>
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג גישה</label>
                <select value={form.access_type || "read"} onChange={e => setForm({ ...form, access_type: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                  {Object.entries(accessTypeMap).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {editing && (
                <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                  <select value={form.status || "pending"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              )}
              <div><label className="block text-sm font-medium text-muted-foreground mb-1.5">סיבה</label><textarea value={form.reason || ""} onChange={e => setForm({ ...form, reason: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm h-20 resize-none" placeholder="סיבת הבקשה" /></div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={save} disabled={saving || !form.user || !form.module} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"><Save className="w-4 h-4" />{saving ? "שומר..." : editing ? "עדכון" : "שליחה"}</button>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="access-requests" />
        <RelatedRecords entityType="access-requests" />
      </div>
    </div>
  );
}
