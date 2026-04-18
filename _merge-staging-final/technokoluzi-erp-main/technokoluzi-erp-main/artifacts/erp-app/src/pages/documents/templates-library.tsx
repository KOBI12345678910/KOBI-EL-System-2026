import { useState, useMemo, useEffect } from "react";
import { LayoutTemplate, Search, Plus, Edit2, Trash2, X, Save, FileText, FileSignature, ClipboardList, BarChart3, Download, Copy, Eye, Database } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { globalConfirm } from "@/components/confirm-dialog";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, defaultBulkActions } from "@/components/bulk-actions";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || localStorage.getItem("erp_token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

type Template = {
  id: number; name: string; slug: string; document_type?: string; description?: string;
  is_active?: boolean; created_at?: string; updated_at?: string;
  usageCount?: number; category?: string;
};

const typeConfig: Record<string, { color: string; icon: any }> = {
  "חוזה": { color: "bg-purple-100 text-purple-700", icon: FileSignature },
  "נוהל": { color: "bg-blue-100 text-blue-700", icon: ClipboardList },
  "דוח": { color: "bg-orange-100 text-orange-700", icon: BarChart3 },
  "טופס": { color: "bg-green-100 text-green-700", icon: FileText },
  "invoice": { color: "bg-green-100 text-green-700", icon: FileText },
  "quote": { color: "bg-blue-100 text-blue-700", icon: FileSignature },
  "report": { color: "bg-orange-100 text-orange-700", icon: BarChart3 },
  "contract": { color: "bg-purple-100 text-purple-700", icon: ClipboardList },
};

const types = ["חוזה", "נוהל", "דוח", "טופס"];

export default function TemplatesLibraryPage() {
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState<{ name?: string; document_type?: string; description?: string }>({});
  const [saving, setSaving] = useState(false);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/platform/document-templates`, { headers: headers() });
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter(t =>
    (filterType === "all" || t.document_type === filterType) &&
    (!search || (t.name || "").toLowerCase().includes(search.toLowerCase()) || (t.description || "").toLowerCase().includes(search.toLowerCase()))
  ), [items, search, filterType]);

  const openCreate = () => { setEditing(null); setForm({ document_type: "נוהל" }); setShowForm(true); };
  const openEdit = (t: Template) => { setEditing(t); setForm({ name: t.name, document_type: t.document_type, description: t.description }); setShowForm(true); };

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      if (editing) {
        const res = await authFetch(`${API}/platform/document-templates/${editing.id}`, {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify({ ...form, slug: form.name?.toLowerCase().replace(/\s+/g, "-") }),
        });
        const updated = await res.json();
        setItems(items.map(i => i.id === editing.id ? updated : i));
      } else {
        const res = await authFetch(`${API}/platform/document-templates`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ ...form, slug: form.name?.toLowerCase().replace(/\s+/g, "-") || `template-${Date.now()}` }),
        });
        const created = await res.json();
        setItems([created, ...items]);
      }
      setShowForm(false);
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (!(await globalConfirm("למחוק תבנית?"))) return;
    await authFetch(`${API}/platform/document-templates/${id}`, { method: "DELETE", headers: headers() });
    setItems(items.filter(i => i.id !== id));
  };

  const kpis = [
    { label: "סה\"כ תבניות", value: items.length },
    { label: "פעילות", value: items.filter(t => t.is_active !== false).length },
    { label: "סוגים", value: new Set(items.map(t => t.document_type).filter(Boolean)).size },
    { label: "עודכנו לאחרונה", value: items.filter(t => t.updated_at && new Date(t.updated_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><LayoutTemplate className="text-cyan-600" /> תבניות מסמכים</h1>
          <p className="text-muted-foreground mt-1">ספריית תבניות מוכנות ליצירת מסמכים חדשים</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded-lg hover:bg-cyan-700 shadow-lg text-sm">
          <Plus size={16} /> תבנית חדשה
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bg-card rounded-xl shadow-sm border p-4">
            <div className="text-xl font-bold text-cyan-600">{kpi.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש תבניות..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="all">כל הסוגים</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">טוען תבניות...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Database size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg">אין תבניות</p>
          <p className="text-sm mt-1">צור תבנית חדשה להתחלה</p>
          <button onClick={openCreate} className="mt-4 flex items-center gap-2 bg-cyan-600 text-white px-4 py-2 rounded-lg hover:bg-cyan-700 text-sm mx-auto">
            <Plus size={16} /> תבנית חדשה
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(t => {
            const cfg = typeConfig[t.document_type || ""] || { color: "bg-muted/50 text-foreground", icon: FileText };
            const Icon = cfg.icon;
            return (
              <motion.div key={t.id} initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-card rounded-xl shadow-sm border hover:shadow-md transition-shadow">
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-cyan-50"><Icon size={18} className="text-cyan-600" /></div>
                      <div>
                        <div className="font-semibold text-sm">{t.name}</div>
                        {t.document_type && <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>{t.document_type}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(t)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={13} /></button>
                      <button onClick={() => remove(t.id)} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={13} /></button>
                    </div>
                  </div>
                  {t.description && <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{t.description}</p>}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>עודכן: {t.updated_at ? new Date(t.updated_at).toLocaleDateString("he-IL") : "—"}</span>
                    <span className={`px-2 py-0.5 rounded-full ${t.is_active !== false ? "bg-green-100 text-green-700" : "bg-muted/50 text-foreground"}`}>
                      {t.is_active !== false ? "פעיל" : "לא פעיל"}
                    </span>
                  </div>
                </div>
                <div className="border-t p-3 flex gap-2">
                  <button className="flex-1 flex items-center justify-center gap-1.5 text-xs text-cyan-600 hover:bg-cyan-50 rounded-lg py-1.5 font-medium"><Eye size={13} /> תצוגה מקדימה</button>
                  <button className="flex-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:bg-muted/30 rounded-lg py-1.5 font-medium"><Download size={13} /> שימוש בתבנית</button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="תבניות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/platform/document-templates`)} />

      <ActivityLog entityType="document-templates" compact />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת תבנית" : "תבנית חדשה"}</h2>
                <button onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <div><label className="block text-sm font-medium mb-1">שם התבנית *</label><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סוג</label><select value={form.document_type || "נוהל"} onChange={e => setForm({ ...form, document_type: e.target.value })} className="w-full border rounded-lg px-3 py-2">{types.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-cyan-600 text-white px-6 py-2 rounded-lg hover:bg-cyan-700 disabled:opacity-50"><Save size={16} /> {editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
