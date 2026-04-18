import { useState, useMemo, useEffect } from "react";
import { FolderArchive, Search, Plus, Edit2, Trash2, X, Save, AlertTriangle, FileText, Download, Database } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import ActivityLog from "@/components/activity-log";
import AttachmentsSection from "@/components/attachments-section";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || localStorage.getItem("erp_token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

const ENTITY_SLUG = "archive-files";

type ArchiveFile = {
  id: number; name: string; classification: string; retentionYears: number;
  destructionDate: string; department: string; size: string; format: string;
  archivedDate: string; archivedBy: string; notes: string;
};

const classMap: Record<string, string> = {
  "חסוי": "bg-red-100 text-red-700",
  "מוגבל": "bg-orange-100 text-orange-700",
  "פנימי": "bg-blue-100 text-blue-700",
  "ציבורי": "bg-green-100 text-green-700",
};

const today = new Date();
const nearDeletion = (d: string) => { if (!d) return false; const diff = (new Date(d).getTime() - today.getTime()) / (1000 * 60 * 60 * 24); return diff <= 365 && diff >= 0; };
const overdue = (d: string) => d && new Date(d) < today;

function mapRecord(r: any): ArchiveFile {
  return {
    id: r.id,
    name: r.data?.name || r.data?.file_name || "ללא שם",
    classification: r.data?.classification || "פנימי",
    retentionYears: Number(r.data?.retention_years || r.data?.retentionYears || 7),
    destructionDate: r.data?.destruction_date || r.data?.destructionDate || "",
    department: r.data?.department || "",
    size: r.data?.size || "",
    format: r.data?.format || "",
    archivedDate: r.data?.archived_date || r.data?.archivedDate || r.created_at?.slice(0, 10) || "",
    archivedBy: r.data?.archived_by || r.data?.archivedBy || r.created_by || "",
    notes: r.data?.notes || "",
  };
}

export default function ArchiveFilesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<ArchiveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityId, setEntityId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ArchiveFile | null>(null);
  const [form, setForm] = useState<Partial<ArchiveFile>>({});
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState<"details" | "attachments" | "activity">("details");
  const [selectedItem, setSelectedItem] = useState<ArchiveFile | null>(null);
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
        setItems(rows);
      } else {
        setItems([]);
      }
    } catch {
      setItems([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => items.filter(f =>
    (filterClass === "all" || f.classification === filterClass) &&
    (!search || f.name.includes(search) || f.department.includes(search))
  ), [items, search, filterClass]);

  const kpis = [
    { label: "סה\"כ קבצים", value: items.length },
    { label: "לפני השמדה (שנה)", value: items.filter(f => nearDeletion(f.destructionDate)).length },
    { label: "לשמדה מיידית", value: items.filter(f => overdue(f.destructionDate)).length },
    { label: "חסויים", value: items.filter(f => f.classification === "חסוי").length },
  ];

  const openCreate = () => { setEditing(null); setForm({ classification: "פנימי", retentionYears: 7 }); setShowForm(true); };
  const openEdit = (f: ArchiveFile) => { setEditing(f); setForm({ ...f }); setShowForm(true); };

  const save = async () => {
    setSaving(true);
    try {
      const data = {
        name: form.name, classification: form.classification, retention_years: form.retentionYears,
        destruction_date: form.destructionDate, department: form.department, size: form.size,
        format: form.format, archived_date: form.archivedDate, archived_by: form.archivedBy, notes: form.notes,
      };
      if (editing) {
        await authFetch(`${API}/platform/records/${editing.id}`, {
          method: "PUT", headers: headers(), body: JSON.stringify({ data }),
        });
        setItems(items.map(i => i.id === editing.id ? { ...i, ...form } as ArchiveFile : i));
      } else if (entityId) {
        const res = await authFetch(`${API}/platform/entities/${entityId}/records`, {
          method: "POST", headers: headers(), body: JSON.stringify({ data, status: "active" }),
        });
        const newRec = await res.json();
        setItems([...items, mapRecord(newRec)]);
      }
      setShowForm(false);
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (!(await globalConfirm("למחוק קובץ?"))) return;
    await authFetch(`${API}/platform/records/${id}`, { method: "DELETE", headers: headers() });
    setItems(items.filter(i => i.id !== id));
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><FolderArchive className="text-cyan-600" /> קובצי ארכיון</h1>
          <p className="text-muted-foreground mt-1">ניהול קבצים ארכיוניים עם סיווג, תאריכי שמירה ומדיניות השמדה</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-cyan-600 text-foreground px-4 py-2 rounded-lg hover:bg-cyan-700 shadow-lg text-sm">
          <Plus size={16} /> קובץ חדש
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className={`rounded-xl shadow-sm border p-4 ${i === 2 ? "bg-red-50 border-red-200" : i === 1 ? "bg-orange-50 border-orange-200" : "bg-card"}`}>
            <div className={`text-lg sm:text-2xl font-bold ${i === 2 ? "text-red-600" : i === 1 ? "text-orange-600" : "text-cyan-600"}`}>{kpi.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{kpi.label}</div>
            {i === 2 && kpi.value > 0 && <div className="flex items-center gap-1 text-xs text-red-500 mt-1"><AlertTriangle size={12} /> דורש טיפול</div>}
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש קבצים..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
        </div>
        <select value={filterClass} onChange={e => setFilterClass(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="all">כל הסיווגים</option>
          {Object.keys(classMap).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="קבצי ארכיון" actions={defaultBulkActions(selectedIds, clear, load, `${API}/platform/records`)} />

      <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">טוען קבצים...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Database size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg">אין קבצי ארכיון</p>
            <p className="text-sm mt-1">הוסף קובץ ארכיון ראשון</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b">
              <tr>
                <th className="px-3 py-3 text-right w-8"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>
                <th className="px-3 py-3 text-right">שם קובץ</th>
                <th className="px-3 py-3 text-right">סיווג</th>
                <th className="px-3 py-3 text-right">מחלקה</th>
                <th className="px-3 py-3 text-right">שנות שמירה</th>
                <th className="px-3 py-3 text-right">תאריך השמדה</th>
                <th className="px-3 py-3 text-right">גודל</th>
                <th className="px-3 py-3 text-right">ארכיב ע"י</th>
                <th className="px-3 py-3 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id} className={`border-b hover:bg-cyan-50/30 cursor-pointer ${overdue(f.destructionDate) ? "bg-red-50" : nearDeletion(f.destructionDate) ? "bg-orange-50" : ""}`} onClick={() => setSelectedItem(f)}>
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}><BulkCheckbox checked={isSelected(f.id)} onChange={() => toggle(f.id)} /></td>
                  <td className="px-3 py-2 flex items-center gap-2"><FileText size={16} className="text-cyan-500 flex-shrink-0" />{f.name}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${classMap[f.classification] || "bg-muted/50"}`}>{f.classification}</span></td>
                  <td className="px-3 py-2">{f.department}</td>
                  <td className="px-3 py-2">{f.retentionYears} שנים</td>
                  <td className="px-3 py-2">
                    <span className={overdue(f.destructionDate) ? "text-red-600 font-bold" : nearDeletion(f.destructionDate) ? "text-orange-600 font-medium" : ""}>
                      {f.destructionDate}
                      {overdue(f.destructionDate) && <AlertTriangle size={12} className="inline mr-1" />}
                    </span>
                  </td>
                  <td className="px-3 py-2">{f.size}</td>
                  <td className="px-3 py-2">{f.archivedBy}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(f)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={14} /></button>
                      <button onClick={() => remove(f.id)} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="text-sm text-muted-foreground px-4 py-2">סה"כ: {filtered.length} קבצים</div>
      </div>

      {selectedItem && (
        <div className="space-y-4">
          <div className="flex gap-2 border-b border-border/50 pb-2">
            {(["details", "attachments", "activity"] as const).map(tab => (
              <button key={tab} onClick={() => setDetailTab(tab)} className={`px-3 py-1.5 text-sm rounded-lg ${detailTab === tab ? "bg-cyan-600 text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>
                {tab === "details" ? "פרטים" : tab === "attachments" ? "קבצים מצורפים" : "היסטוריה"}
              </button>
            ))}
          </div>
          {detailTab === "attachments" && <AttachmentsSection entityType="archive-files" entityId={selectedItem.id} />}
          {detailTab === "activity" && <ActivityLog entityType="archive-files" entityId={selectedItem.id} />}
        </div>
      )}

      <ActivityLog entityType="archive-files" compact />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת קובץ" : "קובץ חדש"}</h2>
                <button onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">שם קובץ *</label><input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">סיווג</label><select value={form.classification || "פנימי"} onChange={e => setForm({ ...form, classification: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.keys(classMap).map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">שנות שמירה</label><input type="number" value={form.retentionYears || 7} onChange={e => setForm({ ...form, retentionYears: +e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך השמדה</label><input type="date" value={form.destructionDate || ""} onChange={e => setForm({ ...form, destructionDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">גודל</label><input value={form.size || ""} onChange={e => setForm({ ...form, size: e.target.value })} placeholder="12 MB" className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">פורמט</label><input value={form.format || ""} onChange={e => setForm({ ...form, format: e.target.value })} placeholder="PDF" className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">הערות</label><textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border rounded-lg px-3 py-2" /></div>
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
