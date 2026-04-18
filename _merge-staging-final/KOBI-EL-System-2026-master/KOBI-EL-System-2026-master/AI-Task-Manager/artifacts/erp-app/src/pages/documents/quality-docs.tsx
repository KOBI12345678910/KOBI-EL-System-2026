import { useState, useMemo, useEffect } from "react";
import { ShieldCheck, Search, Plus, Edit2, Trash2, X, Save, CheckCircle2, Clock, AlertTriangle, Eye, Database } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { authFetch } from "@/lib/utils";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";
import ActivityLog from "@/components/activity-log";
import AttachmentsSection from "@/components/attachments-section";
import BulkActions, { useBulkSelection, BulkCheckbox, defaultBulkActions } from "@/components/bulk-actions";

const API = "/api";
const token = () => localStorage.getItem("erp_token") || localStorage.getItem("erp_token") || "";
const headers = () => ({ Authorization: `Bearer ${token()}`, "Content-Type": "application/json" });

const ENTITY_SLUG = "quality-documents";

type QDoc = {
  id: number; title: string; type: string; standard: string; department: string;
  version: string; status: string; reviewDate: string; owner: string; description: string;
};

const statusMap: Record<string, { label: string; color: string; icon: any }> = {
  draft: { label: "טיוטה", color: "bg-muted/50 text-foreground", icon: Clock },
  in_review: { label: "בבדיקה", color: "bg-blue-100 text-blue-700", icon: Eye },
  approved: { label: "מאושר", color: "bg-green-100 text-green-700", icon: CheckCircle2 },
  expired: { label: "פג תוקף", color: "bg-red-100 text-red-700", icon: AlertTriangle },
};

const typesList = ["נוהל", "הוראת עבודה", "מדיניות", "תעודת כיול", "טופס", "מפרט"];

function mapRecord(r: any): QDoc {
  return {
    id: r.id,
    title: r.data?.title || r.data?.name || "ללא כותרת",
    type: r.data?.type || r.data?.doc_type || "נוהל",
    standard: r.data?.standard || r.data?.iso_standard || "",
    department: r.data?.department || "",
    version: r.data?.version || "1.0",
    status: r.status || r.data?.status || "draft",
    reviewDate: r.data?.review_date || r.data?.reviewDate || "",
    owner: r.data?.owner || r.created_by || "",
    description: r.data?.description || "",
  };
}

export default function QualityDocsPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<QDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [entityId, setEntityId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<QDoc | null>(null);
  const [form, setForm] = useState<Partial<QDoc>>({});
  const [saving, setSaving] = useState(false);
  const validation = useFormValidation<Partial<QDoc>>({
    title: { required: true, message: "כותרת מסמך חובה" },
  });
  const [selectedDoc, setSelectedDoc] = useState<QDoc | null>(null);
  const [detailTab, setDetailTab] = useState<"details" | "attachments" | "activity">("details");
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

  const filtered = useMemo(() => items.filter(d =>
    (filterStatus === "all" || d.status === filterStatus) &&
    (filterType === "all" || d.type === filterType) &&
    (!search || d.title.includes(search) || d.owner.includes(search) || d.standard.includes(search))
  ), [items, search, filterStatus, filterType]);

  const kpis = [
    { label: "סה\"כ מסמכים", value: items.length, color: "text-blue-600" },
    { label: "מאושרים", value: items.filter(d => d.status === "approved").length, color: "text-green-600" },
    { label: "בבדיקה", value: items.filter(d => d.status === "in_review").length, color: "text-blue-600" },
    { label: "טיוטות", value: items.filter(d => d.status === "draft").length, color: "text-muted-foreground" },
    { label: "פג תוקף", value: items.filter(d => d.status === "expired").length, color: "text-red-600" },
  ];

  const openCreate = () => { setEditing(null); setForm({ type: "נוהל", status: "draft", version: "1.0" }); validation.clearErrors(); setShowForm(true); };
  const openEdit = (d: QDoc) => { setEditing(d); setForm({ ...d }); validation.clearErrors(); setShowForm(true); };

  const save = async () => {
    if (!validation.validate(form)) return;
    setSaving(true);
    try {
      const data = {
        title: form.title, type: form.type, standard: form.standard, department: form.department,
        version: form.version, review_date: form.reviewDate, owner: form.owner, description: form.description,
      };
      if (editing) {
        await authFetch(`${API}/platform/records/${editing.id}`, {
          method: "PUT", headers: headers(), body: JSON.stringify({ data, status: form.status }),
        });
        setItems(items.map(i => i.id === editing.id ? { ...i, ...form } as QDoc : i));
      } else if (entityId) {
        const res = await authFetch(`${API}/platform/entities/${entityId}/records`, {
          method: "POST", headers: headers(), body: JSON.stringify({ data, status: form.status || "draft" }),
        });
        const newRec = await res.json();
        setItems([...items, mapRecord(newRec)]);
      }
      setShowForm(false);
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (!(await globalConfirm("למחוק?"))) return;
    await authFetch(`${API}/platform/records/${id}`, { method: "DELETE", headers: headers() });
    setItems(items.filter(i => i.id !== id));
  };

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2"><ShieldCheck className="text-cyan-600" /> ניהול מסמכי איכות</h1>
          <p className="text-muted-foreground mt-1">ISO, נהלי עבודה, הוראות, ביקורות, תעודות כיול</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-cyan-600 text-foreground px-4 py-2 rounded-lg hover:bg-cyan-700 shadow-lg text-sm">
          <Plus size={16} /> מסמך חדש
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map((kpi, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="bg-card rounded-xl shadow-sm border p-4">
            <div className={`text-lg sm:text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{kpi.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש..." className="w-full pr-10 pl-4 py-2 border rounded-lg" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className="border rounded-lg px-3 py-2">
          <option value="all">כל הסוגים</option>
          {typesList.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <BulkActions selectedIds={selectedIds} onClear={clear} entityName="מסמכי איכות" actions={defaultBulkActions(selectedIds, clear, load, `${API}/platform/records`)} />

      <div className="bg-card rounded-xl shadow-sm border overflow-x-auto">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">טוען מסמכים...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Database size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg">אין מסמכי איכות</p>
            <p className="text-sm mt-1">הוסף מסמך איכות ראשון</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b">
              <tr>
                <th className="px-3 py-3 text-right w-8"><BulkCheckbox checked={selectedIds.length === filtered.length && filtered.length > 0} onChange={() => toggleAll(filtered)} partial={selectedIds.length > 0 && selectedIds.length < filtered.length} /></th>
                <th className="px-3 py-3 text-right">כותרת</th>
                <th className="px-3 py-3 text-right">סוג</th>
                <th className="px-3 py-3 text-right">תקן</th>
                <th className="px-3 py-3 text-right">מחלקה</th>
                <th className="px-3 py-3 text-right">גרסה</th>
                <th className="px-3 py-3 text-right">בעלים</th>
                <th className="px-3 py-3 text-right">סקירה הבאה</th>
                <th className="px-3 py-3 text-right">סטטוס</th>
                <th className="px-3 py-3 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const s = statusMap[d.status] || { label: d.status, color: "bg-muted/50 text-foreground", icon: Clock };
                return (
                  <tr key={d.id} className="border-b hover:bg-cyan-50/30 cursor-pointer" onClick={() => setSelectedDoc(d)}>
                    <td className="px-3 py-2" onClick={e => e.stopPropagation()}><BulkCheckbox checked={isSelected(d.id)} onChange={() => toggle(d.id)} /></td>
                    <td className="px-3 py-2 font-medium">{d.title}</td>
                    <td className="px-3 py-2">{d.type}</td>
                    <td className="px-3 py-2 text-xs font-mono">{d.standard}</td>
                    <td className="px-3 py-2">{d.department}</td>
                    <td className="px-3 py-2 font-mono">v{d.version}</td>
                    <td className="px-3 py-2">{d.owner}</td>
                    <td className="px-3 py-2">{d.reviewDate}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${s.color}`}>{s.label}</span></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(d)} className="p-1 hover:bg-blue-500/10 rounded"><Edit2 size={14} /></button>
                        <button onClick={() => remove(d.id)} className="p-1 hover:bg-red-500/10 rounded text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="text-sm text-muted-foreground px-4 py-2">סה"כ: {filtered.length} מסמכים</div>
      </div>

      {selectedDoc && (
        <div className="space-y-4">
          <div className="flex gap-2 border-b border-border/50 pb-2">
            {(["details", "attachments", "activity"] as const).map(tab => (
              <button key={tab} onClick={() => setDetailTab(tab)} className={`px-3 py-1.5 text-sm rounded-lg ${detailTab === tab ? "bg-cyan-600 text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}>
                {tab === "details" ? "פרטים" : tab === "attachments" ? "קבצים מצורפים" : "היסטוריה"}
              </button>
            ))}
          </div>
          {detailTab === "attachments" && <AttachmentsSection entityType="quality-documents" entityId={selectedDoc.id} />}
          {detailTab === "activity" && <ActivityLog entityType="quality-documents" entityId={selectedDoc.id} />}
        </div>
      )}

      <ActivityLog entityType="quality-documents" compact />

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-card border border-border text-foreground rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">{editing ? "עריכת מסמך" : "מסמך חדש"}</h2>
                <button onClick={() => setShowForm(false)}><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">כותרת <RequiredMark /></label><input value={form.title || ""} onChange={e => setForm({ ...form, title: e.target.value })} className={`w-full border rounded-lg px-3 py-2 ${validation.errors.title ? "border-red-500" : ""}`} /><FormFieldError error={validation.errors.title} /></div>
                <div><label className="block text-sm font-medium mb-1">סוג</label><select value={form.type || "נוהל"} onChange={e => setForm({ ...form, type: e.target.value })} className="w-full border rounded-lg px-3 py-2">{typesList.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">סטטוס</label><select value={form.status || "draft"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border rounded-lg px-3 py-2">{Object.entries(statusMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
                <div><label className="block text-sm font-medium mb-1">תקן</label><input value={form.standard || ""} onChange={e => setForm({ ...form, standard: e.target.value })} placeholder="ISO 9001" className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">גרסה</label><input value={form.version || "1.0"} onChange={e => setForm({ ...form, version: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">מחלקה</label><input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div><label className="block text-sm font-medium mb-1">בעלים</label><input value={form.owner || ""} onChange={e => setForm({ ...form, owner: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">תאריך סקירה הבאה</label><input type="date" value={form.reviewDate || ""} onChange={e => setForm({ ...form, reviewDate: e.target.value })} className="w-full border rounded-lg px-3 py-2" /></div>
                <div className="col-span-2"><label className="block text-sm font-medium mb-1">תיאור</label><textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} className="w-full border rounded-lg px-3 py-2" /></div>
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
