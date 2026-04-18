import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FolderOpen, Plus, Search, X, Edit2, Trash2, FileText, Upload, Tag, Eye, Folder , Copy } from "lucide-react";
import { authFetch } from "@/lib/utils";
import { duplicateRecord } from "@/lib/duplicate-record";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { Badge } from "@/components/ui/badge";
import { useSmartPagination } from "@/hooks/use-smart-pagination";
import { SmartPagination } from "@/components/smart-pagination";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

const phases = [
  { key: "planning", label: "תכנון", color: "text-blue-400" },
  { key: "design", label: "עיצוב", color: "text-purple-400" },
  { key: "procurement", label: "רכש", color: "text-yellow-400" },
  { key: "execution", label: "ביצוע", color: "text-orange-400" },
  { key: "closeout", label: "סגירה", color: "text-green-400" },
];

const docTypes = ["general", "drawing", "specification", "contract", "photo", "report", "permit", "other"];
const docTypeLabels: Record<string, string> = {
  general: "כללי", drawing: "תשריט", specification: "מפרט", contract: "חוזה",
  photo: "תמונה", report: "דוח", permit: "היתר", other: "אחר",
};

function FileIcon({ type }: { type: string }) {
  const colors: Record<string, string> = { drawing: "text-blue-400", specification: "text-purple-400", contract: "text-green-400", photo: "text-yellow-400", report: "text-orange-400", permit: "text-red-400" };
  return <FileText className={`w-4 h-4 ${colors[type] || "text-muted-foreground"}`} />;
}

export default function ProjectDocumentsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPhase, setFilterPhase] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const pagination = useSmartPagination(25);

  const load = async (phaseFilter?: string, searchTerm?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (phaseFilter && phaseFilter !== "all") params.set("phase", phaseFilter);
      if (searchTerm) params.set("search", searchTerm);
      const r = await authFetch(`${API}/project-documents?${params}`);
      if (r.ok) setItems(safeArray(await r.json()));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let data = items.filter(i =>
      (filterPhase === "all" || i.phase === filterPhase) &&
      (filterType === "all" || i.document_type === filterType) &&
      (!search || [i.name, i.tags, i.description, i.uploaded_by].some(f => f?.toLowerCase().includes(search.toLowerCase())))
    );
    pagination.setTotalItems(data.length);
    return data;
  }, [items, search, filterPhase, filterType]);

  const byPhase = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(i => { counts[i.phase] = (counts[i.phase] || 0) + 1; });
    return counts;
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm({ phase: filterPhase !== "all" ? filterPhase : "planning", document_type: "general", version: "1.0", uploaded_by: "system" });
    setShowForm(true);
  };
  const openEdit = (r: any) => { setEditing(r); setForm({ ...r }); setShowForm(true); };

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/project-documents/${editing.id}` : `${API}/project-documents`;
      await authFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק מסמך זה?")) {
      await authFetch(`${API}/project-documents/${id}`, { method: "DELETE" });
      load();
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <FolderOpen className="text-yellow-400 w-6 h-6" />
            ניהול מסמכי פרויקט
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול מסמכים לפי שלב פרויקט</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> מסמך חדש
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {phases.map(p => (
          <button key={p.key} onClick={() => setFilterPhase(filterPhase === p.key ? "all" : p.key)}
            className={`bg-card border rounded-2xl p-3 text-center transition-colors ${filterPhase === p.key ? "border-primary" : "border-border/50 hover:border-border"}`}>
            <Folder className={`w-5 h-5 mx-auto mb-1 ${p.color}`} />
            <div className="text-xs font-medium text-foreground">{p.label}</div>
            <div className="text-xs text-muted-foreground">{byPhase[p.key] || 0} מסמכים</div>
          </button>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש שם, תגית, תיאור..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>
          {docTypes.map(t => <option key={t} value={t}>{docTypeLabels[t]}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} מסמכים</span>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-card border border-border/50 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין מסמכים</p>
          <p className="text-sm mt-1">{search || filterPhase !== "all" ? "נסה לשנות סינון" : "לחץ 'מסמך חדש' להתחלה"}</p>
        </div>
      ) : (
        <>
          <div className="border border-border/50 rounded-2xl bg-card/50 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border/50">
                  <tr>
                    {["סוג", "שם", "שלב", "גרסה", "תגיות", "הועלה ע\"י", "תאריך", "פעולות"].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagination.paginate(filtered).map(r => {
                    const phaseInfo = phases.find(p => p.key === r.phase);
                    return (
                      <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <FileIcon type={r.document_type} />
                            <span className="text-xs text-muted-foreground">{docTypeLabels[r.document_type] || r.document_type}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-foreground font-medium cursor-pointer hover:text-primary" onClick={() => setViewDetail(r)}>{r.name}</td>
                        <td className="px-4 py-3">
                          <Badge className={`text-[10px] bg-muted/20 ${phaseInfo?.color || "text-muted-foreground"}`}>
                            {phaseInfo?.label || r.phase}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{r.version || "1.0"}</td>
                        <td className="px-4 py-3">
                          {r.tags && r.tags.split(",").slice(0, 2).map((t: string, i: number) => (
                            <Badge key={i} className="text-[10px] bg-blue-500/20 text-blue-400 ml-1">{t.trim()}</Badge>
                          ))}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{r.uploaded_by || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{r.created_at?.slice(0, 10) || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => setViewDetail(r)} className="p-1.5 hover:bg-muted rounded-lg"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></button>
                            <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg"><Edit2 className="w-3.5 h-3.5 text-blue-400" /></button><button title="שכפול" onClick={async () => { const res = await duplicateRecord(`${API}/project-documents`, r.id); if (res.ok) { load(); } else { alert("שגיאה בשכפול: " + res.error); } }} className="p-1.5 hover:bg-muted rounded-lg"><Copy className="w-3.5 h-3.5 text-slate-400" /></button>
                            <button onClick={() => remove(r.id)} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                  <FileIcon type={viewDetail.document_type} /> {viewDetail.name}
                </h2>
                <button onClick={() => setViewDetail(null)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-xs text-muted-foreground">שלב</div><div className="text-sm text-foreground">{phases.find(p => p.key === viewDetail.phase)?.label || viewDetail.phase}</div></div>
                  <div><div className="text-xs text-muted-foreground">סוג</div><div className="text-sm text-foreground">{docTypeLabels[viewDetail.document_type] || viewDetail.document_type}</div></div>
                  <div><div className="text-xs text-muted-foreground">גרסה</div><div className="text-sm text-foreground font-mono">{viewDetail.version || "1.0"}</div></div>
                  <div><div className="text-xs text-muted-foreground">הועלה ע"י</div><div className="text-sm text-foreground">{viewDetail.uploaded_by || "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">תאריך</div><div className="text-sm text-foreground">{viewDetail.created_at?.slice(0, 10) || "—"}</div></div>
                </div>
                {viewDetail.tags && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">תגיות</div>
                    <div className="flex flex-wrap gap-1">
                      {viewDetail.tags.split(",").map((t: string, i: number) => (
                        <Badge key={i} className="text-[10px] bg-blue-500/20 text-blue-400">{t.trim()}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {viewDetail.description && (
                  <div><div className="text-xs text-muted-foreground mb-1">תיאור</div><div className="text-sm text-foreground">{viewDetail.description}</div></div>
                )}
                {viewDetail.file_path && (
                  <div><div className="text-xs text-muted-foreground mb-1">נתיב קובץ</div><div className="text-sm text-muted-foreground font-mono text-xs">{viewDetail.file_path}</div></div>
                )}
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openEdit(viewDetail); }} className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm">עריכה</button>
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
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת מסמך" : "מסמך חדש"}</h2>
                <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם המסמך *</label>
                  <input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="שם המסמך" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">שלב פרויקט</label>
                  <select value={form.phase || "planning"} onChange={e => setForm({ ...form, phase: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {phases.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג מסמך</label>
                  <select value={form.document_type || "general"} onChange={e => setForm({ ...form, document_type: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {docTypes.map(t => <option key={t} value={t}>{docTypeLabels[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">גרסה</label>
                  <input value={form.version || "1.0"} onChange={e => setForm({ ...form, version: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="1.0" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">הועלה ע"י</label>
                  <input value={form.uploaded_by || ""} onChange={e => setForm({ ...form, uploaded_by: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תגיות (מופרדות בפסיק)</label>
                  <input value={form.tags || ""} onChange={e => setForm({ ...form, tags: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="תשריט, קומה 1, גשר" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">נתיב/קישור קובץ</label>
                  <input value={form.file_path || ""} onChange={e => setForm({ ...form, file_path: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="https://... או /path/to/file" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label>
                  <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving || !form.name}
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
