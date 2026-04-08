import { useState, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import {
  Zap, Plus, Edit, Trash2, X, Save, Mail, Phone, Bell, Clock,
  ChevronDown, ChevronUp, CheckCircle
} from "lucide-react";

const API = "/api";
const fmt = (n: any) => Number(n || 0).toLocaleString("he-IL");

const STAGES = [
  { key: "lead", label: "ליד" },
  { key: "qualified", label: "מוסמך" },
  { key: "proposal", label: "הצעה" },
  { key: "negotiation", label: "מו\"מ" },
  { key: "won", label: "נסגר" },
  { key: "lost", label: "אבוד" },
];

const STEP_TYPES = [
  { key: "email", label: "דוא\"ל", icon: Mail, color: "text-blue-400" },
  { key: "task", label: "משימה", icon: CheckCircle, color: "text-green-400" },
  { key: "notification", label: "התראה", icon: Bell, color: "text-amber-400" },
  { key: "call", label: "שיחת טלפון", icon: Phone, color: "text-purple-400" },
];

const STEP_TYPE_MAP = Object.fromEntries(STEP_TYPES.map(s => [s.key, s]));

function StepEditor({ step, onChange, onRemove }: { step: any; onChange: (s: any) => void; onRemove: () => void }) {
  const st = STEP_TYPE_MAP[step.type] || STEP_TYPES[0];
  return (
    <div className="bg-background border border-border/50 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1">
          <select value={step.type || "email"} onChange={e => onChange({ ...step, type: e.target.value })} className="bg-card border border-border rounded-lg px-2 py-1.5 text-xs">
            {STEP_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <input type="number" value={step.delay_days || 0} onChange={e => onChange({ ...step, delay_days: Number(e.target.value) })} className="w-12 bg-card border border-border rounded-lg px-2 py-1 text-xs text-center" min="0" />
            <span>ימים</span>
          </div>
        </div>
        <button onClick={onRemove} className="p-1 hover:bg-muted rounded-lg"><X className="w-3.5 h-3.5 text-red-400" /></button>
      </div>
      <input value={step.subject || ""} onChange={e => onChange({ ...step, subject: e.target.value })} placeholder={`כותרת / נושא (${st.label})`} className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-xs" />
      <textarea value={step.content || ""} onChange={e => onChange({ ...step, content: e.target.value })} placeholder="תוכן / הוראות..." rows={2} className="w-full bg-card border border-border rounded-lg px-3 py-1.5 text-xs resize-none" />
    </div>
  );
}

export default function NurtureSequences() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ status: "active", steps: [] });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = () => {
    setLoading(true);
    authFetch(`${API}/sales/nurture-sequences`).then(r => r.json()).then(d => setItems(Array.isArray(d) ? d : [])).catch(() => setItems([])).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", triggerStage: "lead", status: "active", steps: [] });
    setShowForm(true);
  };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({
      name: r.name, description: r.description, triggerStage: r.trigger_stage,
      status: r.status, steps: r.steps || [],
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/sales/nurture-sequences/${editing.id}` : `${API}/sales/nurture-sequences`;
      await authFetch(url, { method: editing ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setShowForm(false); load();
    } finally { setSaving(false); }
  };

  const remove = async (id: number, name: string) => {
    if (await globalConfirm(`למחוק רצף '${name}'?`)) { await authFetch(`${API}/sales/nurture-sequences/${id}`, { method: "DELETE" }); load(); }
  };

  const addStep = () => {
    setForm({ ...form, steps: [...(form.steps || []), { type: "email", delay_days: 1, subject: "", content: "" }] });
  };

  const updateStep = (i: number, s: any) => {
    const steps = [...(form.steps || [])];
    steps[i] = s;
    setForm({ ...form, steps });
  };

  const removeStep = (i: number) => {
    const steps = [...(form.steps || [])].filter((_, idx) => idx !== i);
    setForm({ ...form, steps });
  };

  const getStageLabel = (key: string) => STAGES.find(s => s.key === key)?.label || key;

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-400" />
            רצפי טיפוח לידים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">הגדר רצפי פעולות אוטומטיות מבוססי שלב בצנרת</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> רצף חדש
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
        {[
          { label: "סה\"כ רצפים", value: fmt(items.length), color: "text-blue-400" },
          { label: "רצפים פעילים", value: fmt(items.filter(r => r.status === "active").length), color: "text-green-400" },
          { label: "סה\"כ שלבים", value: fmt(items.reduce((s, r) => s + (r.total_steps || 0), 0)), color: "text-purple-400" },
        ].map((k, i) => (
          <div key={i} className="bg-card border border-border/50 rounded-2xl p-4 text-center">
            <div className={`text-2xl font-bold ${k.color}`}>{k.value}</div>
            <div className="text-xs text-muted-foreground">{k.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="bg-card border border-border/50 rounded-2xl p-5 animate-pulse h-24" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין רצפי טיפוח</p>
          <p className="text-sm mt-1">צור רצף ראשון להפעלה אוטומטית על לידים</p>
          <button onClick={openCreate} className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 text-sm font-medium flex items-center gap-2 mx-auto">
            <Plus className="w-4 h-4" /> רצף חדש
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(seq => {
            const isExpanded = expandedId === seq.id;
            const steps = Array.isArray(seq.steps) ? seq.steps : [];
            return (
              <div key={seq.id} className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/20" onClick={() => setExpandedId(isExpanded ? null : seq.id)}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${seq.status === "active" ? "bg-amber-500/20" : "bg-muted/20"}`}>
                      <Zap className={`w-5 h-5 ${seq.status === "active" ? "text-amber-400" : "text-muted-foreground"}`} />
                    </div>
                    <div>
                      <div className="font-medium text-foreground flex items-center gap-2">
                        {seq.name}
                        <span className={`text-xs px-1.5 py-0.5 rounded ${seq.status === "active" ? "bg-green-500/20 text-green-400" : "bg-muted/20 text-muted-foreground"}`}>
                          {seq.status === "active" ? "פעיל" : "לא פעיל"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        טריגר: <strong className="text-foreground">{getStageLabel(seq.trigger_stage)}</strong>
                        {" · "}{seq.total_steps} שלבים
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={e => { e.stopPropagation(); openEdit(seq); }} className="p-1.5 hover:bg-muted rounded-lg"><Edit className="w-4 h-4 text-blue-400" /></button>
                    <button onClick={e => { e.stopPropagation(); remove(seq.id, seq.name); }} className="p-1.5 hover:bg-muted rounded-lg"><Trash2 className="w-4 h-4 text-red-400" /></button>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-border/30 p-4">
                    {seq.description && <p className="text-sm text-muted-foreground mb-3">{seq.description}</p>}
                    {steps.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-sm">אין שלבים מוגדרים</div>
                    ) : (
                      <div className="space-y-2">
                        {steps.map((step: any, i: number) => {
                          const st = STEP_TYPE_MAP[step.type] || STEP_TYPES[0];
                          const Icon = st.icon;
                          return (
                            <div key={i} className="flex items-start gap-3 bg-muted/10 rounded-xl p-3">
                              <div className="flex flex-col items-center gap-1">
                                <div className={`w-8 h-8 rounded-lg bg-card flex items-center justify-center border border-border/50`}>
                                  <Icon className={`w-4 h-4 ${st.color}`} />
                                </div>
                                {i < steps.length - 1 && <div className="w-0.5 h-4 bg-border/30" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`text-xs font-medium ${st.color}`}>{st.label}</span>
                                  <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />יום {step.delay_days}</span>
                                </div>
                                {step.subject && <div className="text-sm font-medium mt-0.5">{step.subject}</div>}
                                {step.content && <div className="text-xs text-muted-foreground mt-0.5 truncate">{step.content}</div>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border flex justify-between items-center">
              <h2 className="text-lg font-bold">{editing ? "עריכת רצף" : "רצף טיפוח חדש"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-muted rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם הרצף *</label>
                <input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" placeholder="לדוגמה: טיפוח לאחר הצעת מחיר" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">טריגר — שלב בצנרת</label>
                  <select value={form.triggerStage || "lead"} onChange={e => setForm({ ...form, triggerStage: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סטטוס</label>
                  <select value={form.status || "active"} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    <option value="active">פעיל</option>
                    <option value="inactive">לא פעיל</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label>
                <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-medium text-muted-foreground">שלבי הרצף ({(form.steps || []).length})</label>
                  <button onClick={addStep} className="flex items-center gap-1.5 bg-primary/20 text-primary px-3 py-1.5 rounded-lg text-xs hover:bg-primary/30">
                    <Plus className="w-3.5 h-3.5" /> הוסף שלב
                  </button>
                </div>
                {(form.steps || []).length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-border/50 rounded-xl text-muted-foreground text-sm">
                    לחץ "הוסף שלב" להגדרת פעולות ברצף
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(form.steps || []).map((step: any, i: number) => (
                      <StepEditor key={i} step={step} onChange={s => updateStep(i, s)} onRemove={() => removeStep(i)} />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
              <button onClick={save} disabled={saving || !form.name} className="px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
                <Save className="w-3.5 h-3.5 inline ml-1" />{editing ? "עדכון" : "שמירה"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
