import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Plus, Search, Eye, Shield, RefreshCw, X, Save, Key, RotateCcw, Edit2, Database, CheckCircle, XCircle } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  encrypted: { label: "מוצפן", color: "bg-green-500/20 text-green-400" },
  partial: { label: "חלקי", color: "bg-amber-500/20 text-amber-400" },
  unencrypted: { label: "לא מוצפן", color: "bg-red-500/20 text-red-400" },
  rotating: { label: "סיבוב מפתח", color: "bg-blue-500/20 text-blue-400" },
};

const SENSITIVITY_MAP: Record<string, { label: string; color: string }> = {
  critical: { label: "קריטי", color: "bg-red-500/20 text-red-400" },
  high: { label: "גבוה", color: "bg-orange-500/20 text-orange-400" },
  medium: { label: "בינוני", color: "bg-amber-500/20 text-amber-400" },
  low: { label: "נמוך", color: "bg-green-500/20 text-green-400" },
};

const ALGORITHMS = ["AES-256-GCM", "AES-256-CBC", "RSA-2048", "PBKDF2+SHA512", "ChaCha20-Poly1305", "SHA-256"];

export default function EncryptionManagementPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterSensitivity, setFilterSensitivity] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState<number | null>(null);
  const [selected, setSelected] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/security/encryption`);
      if (res.ok) setItems(await res.json());
    } catch { }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return items.filter(r =>
      (!search || `${r.field_name} ${r.table_name} ${r.algorithm}`.toLowerCase().includes(search.toLowerCase())) &&
      (filterStatus === "all" || r.status === filterStatus) &&
      (filterSensitivity === "all" || r.sensitivity === filterSensitivity)
    );
  }, [items, search, filterStatus, filterSensitivity]);

  const encCount = items.filter(r => r.status === "encrypted").length;
  const covPct = items.length > 0 ? Math.round((encCount / items.length) * 100) : 0;

  const openCreate = () => {
    setEditing(null);
    setForm({ field_name: "", table_name: "", algorithm: "AES-256-GCM", status: "unencrypted", sensitivity: "medium", key_rotation_days: 90 });
    setShowForm(true);
  };

  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ ...r });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/security/encryption/${editing.id}` : `${API}/security/encryption`;
      await authFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setForm({});
      load();
    } catch { }
    setSaving(false);
  };

  const rotateKey = async (id: number) => {
    setRotating(id);
    try {
      await authFetch(`${API}/security/encryption/${id}/rotate-key`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
      });
      load();
    } catch { }
    setRotating(null);
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Lock className="text-green-400" size={26} />
            ניהול הצפנה
          </h1>
          <p className="text-sm text-muted-foreground mt-1">הגדרת הצפנת שדות PII ופיננסיים, ניהול מפתחות וסיבוב</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground btn-ghost"><RefreshCw size={13} /> רענון</button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium"><Plus size={16} /> שדה חדש</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <Database size={18} className="text-blue-400 mb-2" />
          <div className="text-xl font-bold text-foreground">{items.length}</div>
          <div className="text-xs text-muted-foreground">שדות מוגדרים</div>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <CheckCircle size={18} className="text-green-400 mb-2" />
          <div className="text-xl font-bold text-foreground">{encCount}</div>
          <div className="text-xs text-muted-foreground">מוצפנים</div>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <XCircle size={18} className="text-red-400 mb-2" />
          <div className="text-xl font-bold text-foreground">{items.filter(r => r.status === "unencrypted").length}</div>
          <div className="text-xs text-muted-foreground">לא מוצפנים</div>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <Shield size={18} className="text-purple-400 mb-2" />
          <div className="text-xl font-bold text-foreground">{covPct}%</div>
          <div className="text-xs text-muted-foreground">כיסוי הצפנה</div>
        </div>
      </div>

      <div className="bg-card border border-border/50 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground text-sm flex items-center gap-2"><Shield size={15} className="text-green-400" /> כיסוי הצפנה לפי סטטוס</h3>
        </div>
        <div className="space-y-2">
          {Object.entries(STATUS_MAP).map(([k, v]) => {
            const c = items.filter(r => r.status === k).length;
            return (
              <div key={k} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-24">{v.label}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${k === "encrypted" ? "bg-green-500" : k === "partial" ? "bg-amber-500" : k === "unencrypted" ? "bg-red-500" : "bg-blue-500"}`}
                    style={{ width: `${items.length > 0 ? (c / items.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-foreground font-medium w-6 text-left">{c}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-0 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש שדה, טבלה, אלגוריתם..." className="w-full pr-9 pl-3 py-2 bg-card border border-border rounded-xl text-sm" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
          <option value="all">כל הסטטוסים</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterSensitivity} onChange={e => setFilterSensitivity(e.target.value)} className="bg-card border border-border rounded-xl px-3 py-2 text-sm">
          <option value="all">כל הרגישויות</option>
          {Object.entries(SENSITIVITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{filtered.length} שדות</span>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 bg-muted/20 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="border border-border/50 rounded-2xl overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">שדה</th>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">טבלה</th>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">אלגוריתם</th>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">רגישות</th>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">סיבוב מפתח</th>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">סטטוס</th>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center p-8 text-muted-foreground">אין שדות להצגה</td></tr>
              ) : filtered.map(r => {
                const st = STATUS_MAP[r.status] || STATUS_MAP.unencrypted;
                const sens = SENSITIVITY_MAP[r.sensitivity] || SENSITIVITY_MAP.medium;
                return (
                  <tr key={r.id} className={`border-b border-border/20 hover:bg-muted/20 ${r.status === "unencrypted" && r.sensitivity === "critical" ? "bg-red-500/5" : ""}`}>
                    <td className="px-4 py-3 font-medium text-foreground flex items-center gap-2"><Lock size={13} className="text-muted-foreground" />{r.field_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{r.table_name}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs font-mono">{r.algorithm}</span></td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${sens.color}`}>{sens.label}</span></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.key_rotation_days ? `${r.key_rotation_days} ימים` : "—"}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs ${st.color}`}>{st.label}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setSelected(r)} className="p-1.5 hover:bg-muted rounded-lg" title="פרטים"><Eye size={13} className="text-muted-foreground" /></button>
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה"><Edit2 size={13} className="text-blue-400" /></button>
                        <button onClick={() => rotateKey(r.id)} disabled={rotating === r.id} className="p-1.5 hover:bg-muted rounded-lg disabled:opacity-50" title="סיבוב מפתח">
                          {rotating === r.id ? <div className="w-3.5 h-3.5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" /> : <RotateCcw size={13} className="text-green-400" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="font-bold text-foreground">{editing ? "עריכת הצפנה" : "הגדרת הצפנה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X size={18} /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">שם שדה *</label>
                  <input value={form.field_name || ""} onChange={e => setForm({ ...form, field_name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="credit_card_number" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">טבלה *</label>
                  <input value={form.table_name || ""} onChange={e => setForm({ ...form, table_name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="customers" dir="ltr" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">אלגוריתם</label>
                  <select value={form.algorithm || "AES-256-GCM"} onChange={e => setForm({ ...form, algorithm: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {ALGORITHMS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">רגישות</label>
                  <select value={form.sensitivity || "medium"} onChange={e => setForm({ ...form, sensitivity: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(SENSITIVITY_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">סטטוס</label>
                  <select value={form.status || "unencrypted"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1.5">סיבוב מפתח (ימים)</label>
                  <input type="number" min={1} value={form.key_rotation_days || ""} onChange={e => setForm({ ...form, key_rotation_days: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="90" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1.5">הערות</label>
                  <textarea value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm resize-none" />
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving || !form.field_name || !form.table_name} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Save size={14} />{saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="font-bold text-foreground flex items-center gap-2"><Lock size={16} className="text-green-400" /> {selected.field_name}</h2>
                <button onClick={() => setSelected(null)} className="p-1 hover:bg-muted rounded-lg"><X size={18} /></button>
              </div>
              <div className="p-5 grid grid-cols-2 gap-3">
                {[
                  ["שדה", selected.field_name],
                  ["טבלה", selected.table_name],
                  ["אלגוריתם", selected.algorithm],
                  ["רגישות", SENSITIVITY_MAP[selected.sensitivity]?.label || selected.sensitivity],
                  ["סיבוב מפתח", selected.key_rotation_days ? `${selected.key_rotation_days} ימים` : "—"],
                  ["סיבוב אחרון", selected.last_rotated_at ? new Date(selected.last_rotated_at).toLocaleDateString("he-IL") : "—"],
                  ["סטטוס", STATUS_MAP[selected.status]?.label || selected.status],
                ].map(([label, val]) => (
                  <div key={label} className="bg-background rounded-lg p-3">
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="text-sm text-foreground font-medium mt-0.5">{val}</div>
                  </div>
                ))}
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setSelected(null); openEdit(selected); }} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm"><Edit2 size={13} /> עריכה</button>
                <button onClick={() => { rotateKey(selected.id); setSelected(null); }} className="flex items-center gap-1.5 px-3 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm"><Key size={13} /> סיבוב מפתח</button>
                <button onClick={() => setSelected(null)} className="px-3 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
