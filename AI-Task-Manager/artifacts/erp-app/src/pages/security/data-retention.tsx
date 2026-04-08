import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Plus, Save, X, Play, RefreshCw, AlertTriangle, CheckCircle, Edit2 } from "lucide-react";
import { authFetch } from "@/lib/utils";

const API = "/api";

const ACTION_MAP: Record<string, { label: string; color: string }> = {
  archive: { label: "ארכוב", color: "bg-blue-500/20 text-blue-400" },
  purge: { label: "מחיקה מוחלטת", color: "bg-red-500/20 text-red-400" },
  anonymize: { label: "אנונימיזציה", color: "bg-purple-500/20 text-purple-400" },
  flag: { label: "סימון לבדיקה", color: "bg-amber-500/20 text-amber-400" },
};

function daysToText(days: number): string {
  if (days >= 365) return `${Math.round(days / 365)} שנה`;
  if (days >= 30) return `${Math.round(days / 30)} חודשים`;
  return `${days} ימים`;
}

export default function DataRetentionPage() {
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<number | null>(null);
  const [runResult, setRunResult] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`${API}/security/retention-policies`);
      if (res.ok) setPolicies(await res.json());
    } catch { }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ retention_days: 730, action_on_expiry: "archive", is_active: true });
    setShowForm(true);
  };

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({ ...p });
    setShowForm(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const url = editing ? `${API}/security/retention-policies/${editing.id}` : `${API}/security/retention-policies`;
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

  const runPolicy = async (id: number) => {
    setRunning(id);
    setRunResult(null);
    try {
      const res = await authFetch(`${API}/security/retention-policies/${id}/run`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
      });
      if (res.ok) {
        const d = await res.json();
        setRunResult(d);
        load();
      }
    } catch { }
    setRunning(null);
  };

  const totalPolicies = policies.length;
  const activePolicies = policies.filter(p => p.is_active).length;
  const totalFlagged = policies.reduce((s, p) => s + (p.records_flagged || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="text-amber-400" size={26} />
            מדיניות שמירת נתונים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">ניהול תקופות שמירה, ארכוב ומחיקה אוטומטית לפי ישות וחוק</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground btn-ghost">
            <RefreshCw size={13} /> רענון
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium">
            <Plus size={16} /> פוליסה חדשה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <Clock size={18} className="text-amber-400 mb-2" />
          <div className="text-xl font-bold text-foreground">{totalPolicies}</div>
          <div className="text-xs text-muted-foreground">סה"כ פוליסות</div>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <CheckCircle size={18} className="text-green-400 mb-2" />
          <div className="text-xl font-bold text-foreground">{activePolicies}</div>
          <div className="text-xs text-muted-foreground">פעילות</div>
        </div>
        <div className="bg-card border border-border/50 rounded-xl p-4">
          <AlertTriangle size={18} className="text-red-400 mb-2" />
          <div className="text-xl font-bold text-foreground">{totalFlagged.toLocaleString("he-IL")}</div>
          <div className="text-xs text-muted-foreground">רשומות שסומנו</div>
        </div>
      </div>

      {runResult && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle size={16} className="text-green-400 mt-0.5 shrink-0" />
          <div>
            <div className="text-sm font-medium text-green-300">הפוליסה הופעלה בהצלחה</div>
            <div className="text-xs text-muted-foreground mt-1">
              טבלה: <span className="font-mono text-foreground">{runResult.policy}</span> |
              נמצאו {runResult.flagged} רשומות לפני {new Date(runResult.cutoff).toLocaleDateString("he-IL")}
            </div>
          </div>
          <button onClick={() => setRunResult(null)} className="mr-auto p-1 hover:bg-muted rounded"><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-16 bg-muted/20 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="border border-border/50 rounded-2xl overflow-hidden bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">ישות</th>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">טבלה</th>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">תקופת שמירה</th>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">בסיס משפטי</th>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">פעולה בפקיעה</th>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">סטטוס</th>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">רשומות שסומנו</th>
                <th className="px-4 py-3 text-right text-xs text-muted-foreground font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {policies.map(p => {
                const action = ACTION_MAP[p.action_on_expiry] || ACTION_MAP.archive;
                return (
                  <tr key={p.id} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{p.entity_name_he || p.entity_name}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.table_name}</td>
                    <td className="px-4 py-3 text-foreground font-medium">{daysToText(p.retention_days)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{p.legal_basis || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${action.color}`}>{action.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${p.is_active ? "bg-green-500/20 text-green-400" : "bg-muted/40 text-muted-foreground"}`}>
                        {p.is_active ? "פעיל" : "לא פעיל"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{(p.records_flagged || 0).toLocaleString("he-IL")}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-muted rounded-lg" title="עריכה">
                          <Edit2 size={13} className="text-blue-400" />
                        </button>
                        <button onClick={() => runPolicy(p.id)} disabled={running === p.id} className="p-1.5 hover:bg-muted rounded-lg disabled:opacity-50" title="הפעל עכשיו">
                          {running === p.id ? (
                            <div className="w-3.5 h-3.5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Play size={13} className="text-green-400" />
                          )}
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

      <div className="bg-card border border-border/50 rounded-2xl p-5">
        <h3 className="font-bold text-foreground mb-3 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-400" /> תקני שמירת נתונים נפוצים בישראל</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {[
            { title: "חוק ביטוח לאומי", desc: "7 שנים לרישומי שכר ועובדים" },
            { title: "חוק מס הכנסה", desc: "7 שנים לרישומים פיננסיים" },
            { title: "חוק הגנת הפרטיות", desc: "מינימום שמירה לפי מטרה — מחיקה כשמטרה נסגרה" },
            { title: "חוק ניירות ערך", desc: "5-7 שנים לחברות ציבוריות" },
            { title: "חוק עבודה", desc: "7 שנים לחוזים ותנאי העסקה" },
            { title: "GDPR", desc: "שמירה רק כל עוד נחוצה למטרה המקורית" },
          ].map((item, i) => (
            <div key={i} className="bg-background rounded-lg p-3">
              <div className="font-medium text-foreground mb-0.5">{item.title}</div>
              <div className="text-muted-foreground">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-card border border-border rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="font-bold text-foreground">{editing ? "עריכת פוליסה" : "פוליסת שמירה חדשה"}</h2>
                <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">שם ישות (אנגלית) *</label>
                    <input value={form.entity_name || ""} onChange={e => setForm({ ...form, entity_name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" dir="ltr" placeholder="Employees" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">שם ישות (עברית)</label>
                    <input value={form.entity_name_he || ""} onChange={e => setForm({ ...form, entity_name_he: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" placeholder="עובדים" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">שם טבלה *</label>
                    <input value={form.table_name || ""} onChange={e => setForm({ ...form, table_name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" dir="ltr" placeholder="employees" />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">תקופת שמירה (ימים) *</label>
                    <input type="number" min={1} value={form.retention_days || ""} onChange={e => setForm({ ...form, retention_days: Number(e.target.value) })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1.5">בסיס משפטי</label>
                    <input value={form.legal_basis || ""} onChange={e => setForm({ ...form, legal_basis: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm" placeholder="חוק מס הכנסה, חוק עבודה..." />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">פעולה בפקיעה</label>
                    <select value={form.action_on_expiry || "archive"} onChange={e => setForm({ ...form, action_on_expiry: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm">
                      {Object.entries(ACTION_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <input type="checkbox" id="is_active" checked={!!form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 rounded" />
                    <label htmlFor="is_active" className="text-sm text-muted-foreground">פוליסה פעילה</label>
                  </div>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving || !form.entity_name || !form.table_name} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  <Save size={14} />{saving ? "שומר..." : "שמור"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
