import { useState, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import { Target, Plus, Pencil, Trash2, RefreshCw, CheckCircle2, XCircle, Zap, Sliders, Save } from "lucide-react";

const API = "/api";

const CRITERIA_PRESETS = [
  { group: "שדות מלאים", items: [
    { label: "יש אימייל", value: "has_email" },
    { label: "יש טלפון", value: "has_phone" },
    { label: "יש ערך עסקה", value: "has_value" },
    { label: "יש תאריך סגירה", value: "has_close_date" },
  ]},
  { group: "ערך עסקה", items: [
    { label: "ערך ≥ 10,000 ₪", value: "value:gte:10000" },
    { label: "ערך ≥ 50,000 ₪", value: "value:gte:50000" },
    { label: "ערך ≥ 100,000 ₪", value: "value:gte:100000" },
    { label: "ערך ≥ 500,000 ₪", value: "value:gte:500000" },
  ]},
  { group: "מקור ליד", items: [
    { label: "מקור = הפניה", value: "source:eq:referral" },
    { label: "מקור = אתר", value: "source:eq:website" },
    { label: "מקור = אירוע", value: "source:eq:event" },
    { label: "מקור = שיחה קרה", value: "source:eq:cold-call" },
  ]},
  { group: "שלב בצנרת", items: [
    { label: "שלב = מוסמך", value: "stage:eq:qualified" },
    { label: "שלב = הצעה", value: "stage:eq:proposal" },
    { label: "שלב = מו\"מ", value: "stage:eq:negotiation" },
  ]},
  { group: "טריטוריה", items: [
    { label: "טריטוריה מלאה", value: "territory:notempty:" },
    { label: "נציג מוקצה", value: "assigned_rep:notempty:" },
  ]},
  { group: "ניקוד ליד", items: [
    { label: "ניקוד ≥ 50", value: "lead_score:gte:50" },
    { label: "ניקוד ≥ 70", value: "lead_score:gte:70" },
    { label: "ניקוד ≥ 90", value: "lead_score:gte:90" },
  ]},
  { group: "סוג לקוח / ענף", items: [
    { label: "ענף: טכנולוגיה", value: "notes:contains:טכנולוגיה" },
    { label: "ענף: תעשייה", value: "notes:contains:תעשייה" },
    { label: "ענף: בנייה", value: "notes:contains:בנייה" },
    { label: "ענף: ריטייל", value: "notes:contains:ריטייל" },
    { label: "ענף: בריאות", value: "notes:contains:בריאות" },
  ]},
  { group: "מותאם אישית", items: [
    { label: "מותאם (הקלד ידנית)", value: "custom" },
  ]},
];

const ALL_PRESETS_FLAT = CRITERIA_PRESETS.flatMap(g => g.items);

const empty = {
  name: "", criteria: "", weight: 10, maxScore: 10, description: "", status: "active"
};

export default function SalesScoringPage() {
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recalcLoading, setRecalcLoading] = useState(false);
  const [recalcResult, setRecalcResult] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<any>({ ...empty });
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stages, setStages] = useState<any[]>([]);
  const [stagesLoading, setStagesLoading] = useState(true);
  const [stagesSaving, setStagesSaving] = useState(false);
  const [stageEdits, setStageEdits] = useState<Record<string, number>>({});
  const [stagesSaved, setStagesSaved] = useState(false);

  const load = () => {
    setLoading(true);
    authFetch(`${API}/sales/scoring-rules`)
      .then(r => r.json())
      .then(d => setRules(Array.isArray(d) ? d : []))
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  };

  const loadStages = () => {
    setStagesLoading(true);
    authFetch(`${API}/sales/stage-probabilities`)
      .then(r => r.json())
      .then(d => {
        const arr = Array.isArray(d) ? d : (d.stages || []);
        setStages(arr);
        const init: Record<string, number> = {};
        arr.forEach((s: any) => { init[s.stage_key || s.name] = Number(s.probability || 0); });
        setStageEdits(init);
      })
      .catch(() => setStages([]))
      .finally(() => setStagesLoading(false));
  };

  useEffect(() => { load(); loadStages(); }, []);

  const saveStages = async () => {
    setStagesSaving(true);
    setStagesSaved(false);
    try {
      await authFetch(`${API}/sales/stage-probabilities`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: Object.entries(stageEdits).map(([key, probability]) => ({ stage_key: key, probability })) }),
      });
      setStagesSaved(true);
      setTimeout(() => setStagesSaved(false), 3000);
      loadStages();
    } catch { }
    finally { setStagesSaving(false); }
  };

  const openNew = () => {
    setEditId(null);
    setForm({ ...empty });
    setError(null);
    setShowForm(true);
  };

  const openEdit = (rule: any) => {
    setEditId(rule.id);
    setForm({
      name: rule.name || "",
      criteria: rule.criteria || "",
      weight: rule.weight || 10,
      maxScore: rule.max_score || 10,
      description: rule.description || "",
      status: rule.status || "active",
    });
    setError(null);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name?.trim()) { setError("שם חובה"); return; }
    if (!form.criteria?.trim()) { setError("קריטריון חובה"); return; }
    setSaving(true);
    setError(null);
    try {
      const method = editId ? "PUT" : "POST";
      const url = editId ? `${API}/sales/scoring-rules/${editId}` : `${API}/sales/scoring-rules`;
      const r = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!d.success) { setError(d.error || "שגיאה בשמירה"); return; }
      setShowForm(false);
      load();
    } catch { setError("שגיאת רשת"); }
    finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    if (!confirm("למחוק כלל זה?")) return;
    await authFetch(`${API}/sales/scoring-rules/${id}`, { method: "DELETE" });
    load();
  };

  const recalcAll = async () => {
    setRecalcLoading(true);
    setRecalcResult(null);
    try {
      const r = await authFetch(`${API}/sales/scoring-rules/recalculate-all`, { method: "POST" });
      const d = await r.json();
      setRecalcResult(`עודכנו ${d.updated || 0} הזדמנויות`);
    } catch { setRecalcResult("שגיאה בחישוב"); }
    finally { setRecalcLoading(false); }
  };

  const totalWeight = rules.filter(r => r.status === "active").reduce((s, r) => s + Number(r.weight || 0), 0);

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="w-6 h-6 text-purple-400" />
            מודל דירוג לידים
          </h1>
          <p className="text-sm text-muted-foreground mt-1">הגדרת כללי ניקוד אוטומטי להזדמנויות — ניקוד מחושב מחדש בכל שינוי</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={recalcAll}
            disabled={recalcLoading}
            className="flex items-center gap-1.5 bg-purple-600/20 border border-purple-500/30 text-purple-300 px-3 py-2 rounded-xl text-sm hover:bg-purple-600/30"
          >
            <Zap className={`w-4 h-4 ${recalcLoading ? "animate-spin" : ""}`} />
            חשב מחדש הכל
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 bg-card border border-border px-3 py-2 rounded-xl text-sm hover:bg-muted"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            רענן
          </button>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            כלל חדש
          </button>
        </div>
      </div>

      {recalcResult && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-sm text-green-400 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {recalcResult}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-card border border-border/50 rounded-2xl p-4">
          <div className="text-xs text-muted-foreground mb-1">סה"כ כללים</div>
          <div className="text-2xl font-bold">{rules.length}</div>
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-4">
          <div className="text-xs text-muted-foreground mb-1">כללים פעילים</div>
          <div className="text-2xl font-bold text-green-400">{rules.filter(r => r.status === "active").length}</div>
        </div>
        <div className="bg-card border border-border/50 rounded-2xl p-4">
          <div className="text-xs text-muted-foreground mb-1">משקל כולל (פעיל)</div>
          <div className="text-2xl font-bold text-purple-400">{totalWeight}</div>
        </div>
      </div>

      {showForm && (
        <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
          <h2 className="text-lg font-semibold">{editId ? "עריכת כלל ניקוד" : "כלל ניקוד חדש"}</h2>
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-sm text-red-400 flex items-center gap-2">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">שם הכלל *</label>
              <input
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm"
                value={form.name}
                onChange={e => setForm((f: any) => ({ ...f, name: e.target.value }))}
                placeholder="לדוגמה: ערך עסקה גבוה"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">קריטריון *</label>
              <div className="flex gap-2">
                <select
                  className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-sm"
                  value={ALL_PRESETS_FLAT.find(p => p.value === form.criteria) ? form.criteria : "custom"}
                  onChange={e => {
                    if (e.target.value !== "custom") setForm((f: any) => ({ ...f, criteria: e.target.value }));
                    else setForm((f: any) => ({ ...f, criteria: "custom" }));
                  }}
                >
                  <option value="">בחר קריטריון</option>
                  {CRITERIA_PRESETS.map(g => (
                    <optgroup key={g.group} label={g.group}>
                      {g.items.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              {(form.criteria === "custom" || (form.criteria && !ALL_PRESETS_FLAT.find(p => p.value === form.criteria))) && (
                <input
                  className="w-full mt-1 bg-background border border-border rounded-xl px-3 py-2 text-sm font-mono"
                  value={form.criteria === "custom" ? "" : form.criteria}
                  onChange={e => setForm((f: any) => ({ ...f, criteria: e.target.value }))}
                  placeholder="שדה:אופרטור:ערך — לדוגמה: value:gte:5000"
                />
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">משקל (1-100)</label>
              <input
                type="number"
                min={1} max={100}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm"
                value={form.weight}
                onChange={e => setForm((f: any) => ({ ...f, weight: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">ניקוד מקסימלי</label>
              <input
                type="number"
                min={1} max={100}
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm"
                value={form.maxScore}
                onChange={e => setForm((f: any) => ({ ...f, maxScore: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">תיאור</label>
              <input
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm"
                value={form.description}
                onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))}
                placeholder="תיאור אופציונלי"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">סטטוס</label>
              <select
                className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm"
                value={form.status}
                onChange={e => setForm((f: any) => ({ ...f, status: e.target.value }))}
              >
                <option value="active">פעיל</option>
                <option value="inactive">לא פעיל</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-border rounded-xl text-sm hover:bg-muted"
            >
              ביטול
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90"
            >
              {saving ? "שומר..." : "שמור"}
            </button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse h-12 bg-muted/30 rounded-xl" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">אין כללי ניקוד מוגדרים</p>
            <p className="text-sm mt-1">הוסף כלל ניקוד כדי לחשב דירוג לידים אוטומטית</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground text-xs">
                <th className="text-right py-3 px-4 font-medium">שם</th>
                <th className="text-right py-3 px-4 font-medium">קריטריון</th>
                <th className="text-center py-3 px-4 font-medium">משקל</th>
                <th className="text-center py-3 px-4 font-medium">ניקוד מקסימלי</th>
                <th className="text-center py-3 px-4 font-medium">% מהכולל</th>
                <th className="text-center py-3 px-4 font-medium">סטטוס</th>
                <th className="text-center py-3 px-4 font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => {
                const w = Number(rule.weight || 0);
                const pct = totalWeight > 0 ? Math.round((w / totalWeight) * 100) : 0;
                return (
                  <tr key={rule.id} className="border-b border-border/30 hover:bg-muted/20">
                    <td className="py-3 px-4">
                      <div className="font-medium">{rule.name}</div>
                      {rule.description && <div className="text-xs text-muted-foreground">{rule.description}</div>}
                    </td>
                    <td className="py-3 px-4">
                      <code className="text-xs bg-muted/30 px-2 py-0.5 rounded font-mono">{rule.criteria}</code>
                    </td>
                    <td className="py-3 px-4 text-center font-bold">{rule.weight}</td>
                    <td className="py-3 px-4 text-center">{rule.max_score}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        <div className="w-16 bg-muted/20 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{pct}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center">
                      {rule.status === "active" ? (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> פעיל
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs bg-muted/30 text-muted-foreground px-2 py-0.5 rounded-full">
                          <XCircle className="w-3 h-3" /> לא פעיל
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => openEdit(rule)}
                          className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => remove(rule.id)}
                          className="p-1.5 hover:bg-red-500/10 rounded-lg text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-card border border-border/50 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><Sliders className="w-4 h-4 text-blue-400" />הגדרת הסתברות לפי שלב</h2>
            <p className="text-xs text-muted-foreground mt-0.5">עדכן את הסתברות הסגירה (%) לכל שלב בצנרת המכירה</p>
          </div>
          <div className="flex items-center gap-2">
            {stagesSaved && (
              <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />נשמר</span>
            )}
            <button
              onClick={saveStages}
              disabled={stagesSaving || stagesLoading}
              className="flex items-center gap-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 px-3 py-1.5 rounded-xl text-sm hover:bg-blue-600/30 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {stagesSaving ? "שומר..." : "שמור שינויים"}
            </button>
          </div>
        </div>
        {stagesLoading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted/20 rounded-xl animate-pulse" />)}</div>
        ) : stages.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">אין שלבים מוגדרים — צור הזדמנות ראשונה ושלבים יאותחלו אוטומטית</div>
        ) : (
          <div className="space-y-2">
            {stages.map((s: any) => {
              const key = s.stage_key || s.name;
              const val = stageEdits[key] ?? Number(s.probability || 0);
              return (
                <div key={key} className="flex items-center gap-3 bg-background/50 rounded-xl px-4 py-2.5">
                  <span className="flex-1 text-sm font-medium">{s.label || s.name || key}</span>
                  {s.is_won && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded">סגירה</span>}
                  {s.is_lost && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">הפסד</span>}
                  <div className="flex items-center gap-2 w-40">
                    <div className="flex-1 bg-muted/20 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${val}%` }} />
                    </div>
                    <input
                      type="number"
                      min={0} max={100}
                      value={val}
                      onChange={e => setStageEdits(prev => ({ ...prev, [key]: Math.min(100, Math.max(0, Number(e.target.value))) }))}
                      className="w-14 text-center bg-background border border-border rounded-lg px-1 py-1 text-sm"
                      disabled={s.is_won || s.is_lost}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-card border border-border/50 rounded-2xl p-5">
        <h2 className="font-semibold mb-3">פורמט קריטריונים</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
          <div>
            <p className="font-medium text-foreground mb-2">קריטריונים מיוחדים</p>
            <ul className="space-y-1">
              <li><code className="text-xs bg-muted/30 px-1 rounded">has_email</code> — שדה אימייל מלא</li>
              <li><code className="text-xs bg-muted/30 px-1 rounded">has_phone</code> — שדה טלפון מלא</li>
              <li><code className="text-xs bg-muted/30 px-1 rounded">has_value</code> — ערך עסקה {">"} 0</li>
              <li><code className="text-xs bg-muted/30 px-1 rounded">has_close_date</code> — תאריך סגירה קיים</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-foreground mb-2">פורמט שדה:אופרטור:ערך</p>
            <ul className="space-y-1">
              <li><code className="text-xs bg-muted/30 px-1 rounded">value:gte:10000</code> — ערך ≥ 10,000</li>
              <li><code className="text-xs bg-muted/30 px-1 rounded">stage:eq:qualified</code> — שלב = מוסמך</li>
              <li><code className="text-xs bg-muted/30 px-1 rounded">source:eq:referral</code> — מקור = הפניה</li>
              <li>אופרטורים: eq, neq, gte, lte, gt, lt, contains, notempty</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
