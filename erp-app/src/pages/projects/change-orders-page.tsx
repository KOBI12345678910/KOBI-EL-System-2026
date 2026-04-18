import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ClipboardList, Plus, Search, X, Edit2, Trash2, CheckCircle, XCircle, SendHorizonal, Eye, AlertTriangle } from "lucide-react";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { Badge } from "@/components/ui/badge";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);
const fmt = (v: any) => Number(v || 0).toLocaleString("he-IL");

const statusMap: Record<string, { label: string; color: string }> = {
  draft: { label: "טיוטה", color: "bg-gray-500/20 text-gray-400" },
  review: { label: "בבדיקה", color: "bg-yellow-500/20 text-yellow-400" },
  approved: { label: "מאושר", color: "bg-green-500/20 text-green-400" },
  rejected: { label: "נדחה", color: "bg-red-500/20 text-red-400" },
};

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="text-sm text-foreground font-medium">{value ?? "—"}</div>
    </div>
  );
}

export default function ChangeOrdersPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(20);

  const load = async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        authFetch(`${API}/project-change-orders`),
        authFetch(`${API}/project-change-orders-summary`),
      ]);
      if (r1.ok) setItems(safeArray(await r1.json()));
      if (r2.ok) setSummary(await r2.json());
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterStatus === "all" || i.status === filterStatus) &&
      (!search || [i.title, i.change_number, i.description, i.requested_by]
        .some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterStatus]);

  const openCreate = () => {
    setEditing(null);
    setForm({ status: "draft", scheduleImpact: 0, costImpact: 0 });
    setShowForm(true);
  };
  const openEdit = (r: any) => { setEditing(r); setForm({ ...r }); setShowForm(true); };

  const save = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/project-change-orders/${editing.id}` : `${API}/project-change-orders`;
      await authFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          reason: form.reason,
          scopeImpact: form.scope_impact || form.scopeImpact,
          scheduleImpact: form.schedule_impact ?? form.scheduleImpact ?? 0,
          costImpact: form.cost_impact ?? form.costImpact ?? 0,
          status: form.status || "draft",
          requestedBy: form.requested_by || form.requestedBy,
          projectId: form.project_id || form.projectId,
        }),
      });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const doAction = async (id: number, action: string) => {
    await authFetch(`${API}/project-change-orders/${id}/${action}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvedBy: "מנהל פרויקט" }),
    });
    load();
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק פקודת שינוי זו?")) {
      await authFetch(`${API}/project-change-orders/${id}`, { method: "DELETE" });
      load();
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardList className="text-orange-400 w-6 h-6" />
            פקודות שינוי
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול בקשות שינוי ואישורן</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> פקודת שינוי חדשה
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "סה\"כ פקודות", value: fmt(summary.total || 0), color: "text-blue-400" },
          { label: "ממתינות לאישור", value: fmt(summary.pending || 0), color: "text-yellow-400" },
          { label: "מאושרות", value: fmt(summary.approved || 0), color: "text-green-400" },
          { label: "השפעת עלות כוללת", value: `₪${fmt(summary.totalCostImpact || 0)}`, color: "text-orange-400" },
        ].map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="bg-card border border-border/50 rounded-2xl p-4">
            <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-xs text-muted-foreground mt-1">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש פקודת שינוי..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תוצאות</span>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-card border border-border/50 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין פקודות שינוי</p>
        </div>
      ) : (
        <>
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border/50">
                  <tr>
                    {["מספר", "כותרת", "תיאור היקף", "השפעת לוח זמנים", "השפעת עלות", "מבקש", "סטטוס", "פעולות"].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginate(filtered).map(r => (
                    <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.change_number || "—"}</td>
                      <td className="px-4 py-3 text-foreground font-medium cursor-pointer hover:text-primary" onClick={() => setViewDetail(r)}>{r.title}</td>
                      <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{r.scope_impact || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.schedule_impact ? <span className={Number(r.schedule_impact) > 0 ? "text-red-400" : "text-green-400"}>{r.schedule_impact} ימים</span> : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {r.cost_impact ? <span className={Number(r.cost_impact) > 0 ? "text-red-400" : "text-green-400"}>₪{fmt(r.cost_impact)}</span> : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.requested_by || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge className={`text-[10px] ${statusMap[r.status]?.color || "bg-muted/20 text-muted-foreground"}`}>
                          {statusMap[r.status]?.label || r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => setViewDetail(r)} title="פרטים" className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                          <button onClick={() => openEdit(r)} title="עריכה" className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button>
                          {r.status === "draft" && (
                            <button onClick={() => doAction(r.id, "submit")} title="שלח לאישור" className="p-1.5 hover:bg-muted rounded-lg"><SendHorizonal className="w-3.5 h-3.5 text-yellow-400" /></button>
                          )}
                          {r.status === "review" && (
                            <>
                              <button onClick={() => doAction(r.id, "approve")} title="אשר" className="p-1.5 hover:bg-muted rounded-lg"><CheckCircle className="w-3.5 h-3.5 text-green-400" /></button>
                              <button onClick={() => doAction(r.id, "reject")} title="דחה" className="p-1.5 hover:bg-muted rounded-lg"><XCircle className="w-3.5 h-3.5 text-red-400" /></button>
                            </>
                          )}
                          <button onClick={() => remove(r.id)} title="מחק" className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <SmartPagination pagination={pagination} />
        </>
      )}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{viewDetail.title}</h2>
                <button onClick={() => setViewDetail(null)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <Field label="מספר שינוי" value={viewDetail.change_number} />
                <Field label="סטטוס" value={statusMap[viewDetail.status]?.label || viewDetail.status} />
                <Field label="מבקש" value={viewDetail.requested_by} />
                <Field label="מאשר" value={viewDetail.approved_by} />
                <Field label="תאריך אישור" value={viewDetail.approval_date} />
                <Field label="השפעת לוח זמנים" value={viewDetail.schedule_impact ? `${viewDetail.schedule_impact} ימים` : null} />
                <Field label="השפעת עלות" value={viewDetail.cost_impact ? `₪${fmt(viewDetail.cost_impact)}` : null} />
                <div className="col-span-2"><Field label="סיבת שינוי" value={viewDetail.reason} /></div>
                <div className="col-span-2"><Field label="תיאור היקף" value={viewDetail.scope_impact} /></div>
                <div className="col-span-2"><Field label="תיאור" value={viewDetail.description} /></div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                {viewDetail.status === "draft" && (
                  <button onClick={() => { doAction(viewDetail.id, "submit"); setViewDetail(null); }}
                    className="px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm hover:bg-yellow-500/30">
                    שלח לאישור
                  </button>
                )}
                {viewDetail.status === "review" && (
                  <>
                    <button onClick={() => { doAction(viewDetail.id, "approve"); setViewDetail(null); }}
                      className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm hover:bg-green-500/30">
                      אשר
                    </button>
                    <button onClick={() => { doAction(viewDetail.id, "reject"); setViewDetail(null); }}
                      className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30">
                      דחה
                    </button>
                  </>
                )}
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת פקודת שינוי" : "פקודת שינוי חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">כותרת *</label>
                  <input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם פקודת השינוי" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">מבקש</label>
                  <input value={form.requestedBy || form.requested_by || ""} onChange={e => setForm({ ...form, requestedBy: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                  <select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">השפעת לוח זמנים (ימים)</label>
                  <input type="number" value={form.scheduleImpact ?? form.schedule_impact ?? 0} onChange={e => setForm({ ...form, scheduleImpact: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">השפעת עלות (₪)</label>
                  <input type="number" value={form.costImpact ?? form.cost_impact ?? 0} onChange={e => setForm({ ...form, costImpact: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סיבת שינוי</label>
                  <textarea value={form.reason || ""} onChange={e => setForm({ ...form, reason: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור היקף</label>
                  <textarea value={form.scope_impact || form.scopeImpact || ""} onChange={e => setForm({ ...form, scopeImpact: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור מפורט</label>
                  <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving || !form.title}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  {saving ? "שומר..." : editing ? "עדכון" : "שמירה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
