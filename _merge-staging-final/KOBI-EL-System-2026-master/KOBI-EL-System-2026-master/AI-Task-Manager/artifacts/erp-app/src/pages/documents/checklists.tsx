import { useState, useMemo, useEffect } from "react";
import { CheckSquare, Search, Plus, Trash2, X, Save, CheckCircle2, Clock, Camera, MessageSquare, ChevronDown, ChevronUp, Database } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import BulkActions, { useBulkSelection, defaultBulkActions } from "@/components/bulk-actions";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || localStorage.getItem("erp_token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

const ENTITY_SLUG = "checklists";

type CheckItem = { id: string; text: string; checked: boolean; requirePhoto: boolean; requireNote: boolean; };
type Checklist = { id: number; title: string; category: string; assignee: string; dueDate: string; status: string; completedItems: number; totalItems: number; items: CheckItem[]; };

const statusMap: Record<string, { label: string; color: string }> = {
  open: { label: "פתוח", color: "bg-blue-100 text-blue-700" },
  completed: { label: "הושלם", color: "bg-green-100 text-green-700" },
  overdue: { label: "באיחור", color: "bg-red-100 text-red-700" },
};

function mapRecord(r: any): Checklist {
  const items: CheckItem[] = Array.isArray(r.data?.items) ? r.data.items : [];
  return {
    id: r.id,
    title: r.data?.title || r.data?.name || "ללא כותרת",
    category: r.data?.category || "",
    assignee: r.data?.assignee || r.created_by || "",
    dueDate: r.data?.due_date || r.data?.dueDate || "",
    status: r.status || r.data?.status || "open",
    completedItems: items.filter(i => i.checked).length,
    totalItems: items.length,
    items,
  };
}

export default function ChecklistsPage() {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityId, setEntityId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newDue, setNewDue] = useState("");
  const [saving, setSaving] = useState(false);
  const { selectedIds, toggle, toggleAll, clear, isSelected } = useBulkSelection();

  const load = async () => {
    setLoading(true);
    try {
      const entRes = await authFetch(`${API}/platform/entities?slug=${ENTITY_SLUG}`, { headers: headers() });
      const entities = await entRes.json();
      const entity = Array.isArray(entities) ? entities.find((e: any) => e.slug === ENTITY_SLUG) : null;
      if (entity) {
        setEntityId(entity.id);
        const recRes = await authFetch(`${API}/platform/entities/${entity.id}/records`, { headers: headers() });
        const records = await recRes.json();
        const rows = (Array.isArray(records) ? records : records?.records || []).map(mapRecord);
        setChecklists(rows);
      } else {
        setChecklists([]);
      }
    } catch {
      setChecklists([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => checklists.filter(c =>
    !search || c.title.includes(search) || c.category.includes(search) || c.assignee.includes(search)
  ), [checklists, search]);

  const kpis = [
    { label: "סה\"כ רשימות", value: checklists.length },
    { label: "הושלמו", value: checklists.filter(c => c.status === "completed").length },
    { label: "פתוחים", value: checklists.filter(c => c.status === "open").length },
    { label: "פריטים פתוחים", value: checklists.reduce((s, c) => s + (c.totalItems - c.completedItems), 0) },
  ];

  const toggleItem = async (checklistId: number, itemId: string) => {
    const cl = checklists.find(c => c.id === checklistId);
    if (!cl) return;
    const items = cl.items.map(i => i.id === itemId ? { ...i, checked: !i.checked } : i);
    const completed = items.filter(i => i.checked).length;
    const status = completed === items.length && items.length > 0 ? "completed" : "open";
    setChecklists(checklists.map(c => c.id === checklistId ? { ...c, items, completedItems: completed, status } : c));
    try {
      await authFetch(`${API}/platform/records/${checklistId}`, {
        method: "PUT", headers: headers(),
        body: JSON.stringify({ data: { ...cl, items }, status }),
      });
    } catch {}
  };

  const saveNew = async () => {
    if (!newTitle) return;
    setSaving(true);
    try {
      const data = { title: newTitle, category: newCategory, assignee: newAssignee, due_date: newDue, items: [] };
      if (entityId) {
        const res = await authFetch(`${API}/platform/entities/${entityId}/records`, {
          method: "POST", headers: headers(), body: JSON.stringify({ data, status: "open" }),
        });
        const newRec = await res.json();
        setChecklists([...checklists, mapRecord(newRec)]);
      }
      setNewTitle(""); setNewCategory(""); setNewAssignee(""); setNewDue("");
      setShowForm(false);
    } catch {}
    setSaving(false);
  };

  const deleteChecklist = async (id: number) => {
    await authFetch(`${API}/platform/records/${id}`, { method: "DELETE", headers: headers() });
    setChecklists(checklists.filter(c => c.id !== id));
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><CheckSquare className="text-cyan-600" /> רשימות בדיקה (צ'קליסט)</h1>
          <p className="text-muted-foreground mt-1">יצירה וניהול רשימות בדיקה עם מעקב השלמה</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 bg-cyan-600 text-foreground px-4 py-2 rounded-lg hover:bg-cyan-700 shadow-lg text-sm">
          <Plus size={16} /> רשימה חדשה
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bg-card rounded-xl shadow-sm border p-4">
            <div className="text-lg sm:text-2xl font-bold text-cyan-600">{kpi.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש רשימות..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Database size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg">אין רשימות בדיקה</p>
          <p className="text-sm mt-1">הוסף רשימת בדיקה ראשונה</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(cl => {
            const pct = cl.totalItems ? Math.round((cl.completedItems / cl.totalItems) * 100) : 0;
            const st = statusMap[cl.status] || { label: cl.status, color: "bg-muted/50 text-foreground" };
            const expanded = expandedId === cl.id;
            return (
              <motion.div key={cl.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-xl shadow-sm border">
                <div className="p-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <button onClick={() => setExpandedId(expanded ? null : cl.id)} className="p-1 hover:bg-muted/50 rounded">
                        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                      <div>
                        <div className="font-semibold">{cl.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{cl.category} · {cl.assignee} · עד: {cl.dueDate}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-sm font-medium">{cl.completedItems}/{cl.totalItems} הושלמו</div>
                      <span className={`px-2 py-0.5 rounded-full text-xs ${st.color}`}>{st.label}</span>
                      <button onClick={() => deleteChecklist(cl.id)} className="p-1 hover:bg-red-500/10 rounded text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {cl.totalItems > 0 && (
                    <div className="mt-3">
                      <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{pct}% הושלם</div>
                    </div>
                  )}
                </div>
                {expanded && cl.items.length > 0 && (
                  <div className="border-t px-4 py-3 space-y-2">
                    {cl.items.map(item => (
                      <div key={item.id} className={`flex items-start gap-3 p-2 rounded-lg ${item.checked ? "bg-green-50" : "bg-muted/30"}`}>
                        <button onClick={() => toggleItem(cl.id, item.id)} className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border-2 flex-shrink-0 ${item.checked ? "bg-green-500 border-green-500 text-foreground" : "border-border"}`}>
                          {item.checked && <CheckCircle2 size={12} />}
                        </button>
                        <div className="flex-1">
                          <span className={item.checked ? "line-through text-muted-foreground" : ""}>{item.text}</span>
                          <div className="flex gap-2 mt-1">
                            {item.requirePhoto && <span className="flex items-center gap-1 text-xs text-orange-500"><Camera size={10} /> נדרשת תמונה</span>}
                            {item.requireNote && <span className="flex items-center gap-1 text-xs text-blue-500"><MessageSquare size={10} /> נדרשת הערה</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {expanded && cl.items.length === 0 && (
                  <div className="border-t px-4 py-4 text-center text-muted-foreground text-sm">אין פריטים ברשימה</div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="רשימות בדיקה" actions={defaultBulkActions(selectedIds, clear, load, `${API}/platform/records`)} />

      <ActivityLog entityType="checklists" compact />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">רשימת בדיקה חדשה</h2>
                <button onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <div><label className="block text-sm font-medium mb-1">כותרת *</label><input value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">קטגוריה</label><input value={newCategory} onChange={e => setNewCategory(e.target.value)} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">ממונה</label><input value={newAssignee} onChange={e => setNewAssignee(e.target.value)} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך יעד</label><input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={saveNew} disabled={saving} className="flex items-center gap-2 bg-cyan-600 text-foreground px-6 py-2 rounded-lg hover:bg-cyan-700 disabled:opacity-50"><Save size={16} /> שמירה</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
