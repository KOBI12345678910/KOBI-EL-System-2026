import { useState, useEffect } from "react";
import { BookOpen, Plus, Edit2, Trash2, X, Save, GitBranch, ChevronRight, ChevronDown, Database } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import AttachmentsSection from "@/components/attachments-section";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || localStorage.getItem("erp_token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

const ENTITY_SLUG = "system-spec-chapters";

type Chapter = { id: number; number: string; title: string; content: string; version: string; lastModified: string; author: string; };

export default function SystemSpecPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityId, setEntityId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Chapter | null>(null);
  const [form, setForm] = useState<Partial<Chapter>>({});
  const [activeTab, setActiveTab] = useState<"chapters" | "history">("chapters");
  const [saving, setSaving] = useState(false);

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
        const rows = (Array.isArray(records) ? records : records?.records || []).map((r: any) => ({
          id: r.id,
          number: r.data?.number || r.data?.chapter_number || String(r.id),
          title: r.data?.title || r.data?.name || "ללא כותרת",
          content: r.data?.content || r.data?.description || "",
          version: r.data?.version || "1.0",
          lastModified: r.data?.last_modified || r.updated_at?.slice(0, 10) || "",
          author: r.data?.author || r.created_by || "לא ידוע",
        }));
        setChapters(rows);
      } else {
        setChapters([]);
      }
    } catch {
      setChapters([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ version: "1.0", lastModified: new Date().toISOString().slice(0, 10) }); setShowForm(true); };
  const openEdit = (c: Chapter) => { setEditing(c); setForm({ ...c }); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      const data = {
        number: form.number, title: form.title, content: form.content,
        version: form.version, last_modified: form.lastModified, author: form.author,
      };
      if (editing) {
        await authFetch(`${API}/platform/records/${editing.id}`, {
          method: "PUT", headers: headers(), body: JSON.stringify({ data }),
        });
        setChapters(chapters.map(c => c.id === editing.id ? { ...c, ...form } as Chapter : c));
      } else if (entityId) {
        const res = await authFetch(`${API}/platform/entities/${entityId}/records`, {
          method: "POST", headers: headers(), body: JSON.stringify({ data, status: "active" }),
        });
        const newRec = await res.json();
        setChapters([...chapters, { id: newRec.id, ...form } as Chapter]);
      }
      setShowForm(false);
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (!(await globalConfirm("למחוק פרק?"))) return;
    await authFetch(`${API}/platform/records/${id}`, { method: "DELETE", headers: headers() });
    setChapters(chapters.filter(c => c.id !== id));
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><BookOpen className="text-cyan-600" /> ספר איפיון מערכת</h1>
          <p className="text-muted-foreground mt-1">מסמך מרכזי לאיפיון מערכות עם פרקים, גרסאות, ומעקב שינויים</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-cyan-600 text-foreground px-4 py-2 rounded-lg hover:bg-cyan-700 shadow-lg text-sm">
          <Plus size={16} /> פרק חדש
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:grid-cols-4">
        {[
          { label: "פרקים", value: chapters.length },
          { label: "גרסה נוכחית", value: chapters.length > 0 ? (chapters.sort((a, b) => b.version.localeCompare(a.version))[0]?.version || "—") : "—" },
          { label: "כותבים", value: new Set(chapters.map(c => c.author)).size },
          { label: "עודכן לאחרונה", value: chapters.length > 0 ? chapters.sort((a, b) => b.lastModified.localeCompare(a.lastModified))[0]?.lastModified || "—" : "—" },
        ].map((k, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bg-card rounded-xl shadow-sm border p-4">
            <div className="text-lg sm:text-2xl font-bold text-cyan-600">{k.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{k.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-2 border-b">
        <button onClick={() => setActiveTab("chapters")} className={`px-4 py-2 font-medium text-sm border-b-2 ${activeTab === "chapters" ? "border-cyan-600 text-cyan-600" : "border-transparent text-muted-foreground"}`}>פרקי המסמך</button>
        <button onClick={() => setActiveTab("history")} className={`px-4 py-2 font-medium text-sm border-b-2 ${activeTab === "history" ? "border-cyan-600 text-cyan-600" : "border-transparent text-muted-foreground"}`}>היסטוריית גרסאות</button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">טוען...</div>
      ) : activeTab === "chapters" && (
        <div className="space-y-3">
          {chapters.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Database size={48} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg">אין פרקים</p>
              <p className="text-sm mt-1">הוסף פרק ראשון לספר האיפיון</p>
            </div>
          ) : chapters.map(ch => (
            <motion.div key={ch.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card rounded-xl shadow-sm border">
              <div className="p-4 flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(expandedId === ch.id ? null : ch.id)}>
                <div className="flex items-center gap-3">
                  {expandedId === ch.id ? <ChevronDown size={18} className="text-cyan-600" /> : <ChevronRight size={18} className="text-muted-foreground" />}
                  <div className="w-8 h-8 rounded-lg bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700 font-bold text-sm">{ch.number}</div>
                  <div>
                    <div className="font-semibold">{ch.title}</div>
                    <div className="text-xs text-muted-foreground">גרסה {ch.version} · {ch.lastModified} · {ch.author}</div>
                  </div>
                </div>
                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => openEdit(ch)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={14} /></button>
                  <button onClick={() => remove(ch.id)} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={14} /></button>
                </div>
              </div>
              {expandedId === ch.id && (
                <div className="px-4 pb-4 border-t pt-3">
                  <p className="text-muted-foreground text-sm leading-relaxed">{ch.content || "אין תוכן"}</p>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {!loading && activeTab === "history" && (
        <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b">
              <tr>
                <th className="px-4 py-3 text-right">גרסה</th>
                <th className="px-4 py-3 text-right">תאריך</th>
                <th className="px-4 py-3 text-right">כותב</th>
                <th className="px-4 py-3 text-right">כותרת</th>
              </tr>
            </thead>
            <tbody>
              {chapters.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">אין היסטוריה</td></tr>
              ) : chapters.sort((a, b) => b.version.localeCompare(a.version)).map((ch, i) => (
                <tr key={i} className="border-b hover:bg-cyan-50/30">
                  <td className="px-4 py-2"><span className="flex items-center gap-1"><GitBranch size={14} className="text-cyan-500" /> <span className="font-mono font-bold text-cyan-700">{ch.version}</span></span></td>
                  <td className="px-4 py-2">{ch.lastModified}</td>
                  <td className="px-4 py-2">{ch.author}</td>
                  <td className="px-4 py-2 text-muted-foreground">{ch.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <AttachmentsSection entityType="system-spec" entityId={1} compact />
        <ActivityLog entityType="system-spec" compact />
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת פרק" : "פרק חדש"}</h2>
                <button onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><label className="block text-sm font-medium mb-1">מספר פרק</label><input value={form.number || ""} onChange={e => setForm({ ...form, number: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                  <div><label className="block text-sm font-medium mb-1">גרסה</label><input value={form.version || "1.0"} onChange={e => setForm({ ...form, version: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                </div>
                <div><label className="block text-sm font-medium mb-1">כותרת *</label><input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">כותב</label><input value={form.author || ""} onChange={e => setForm({ ...form, author: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תוכן</label><textarea value={form.content || ""} onChange={e => setForm({ ...form, content: e.target.value })} rows={6} className="w-full border rounded-lg px-3 py-2" /></div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-cyan-600 text-foreground px-6 py-2 rounded-lg hover:bg-cyan-700 disabled:opacity-50"><Save size={16} /> {editing ? "עדכון" : "שמירה"}</button>
                <button onClick={() => setShowForm(false)} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
