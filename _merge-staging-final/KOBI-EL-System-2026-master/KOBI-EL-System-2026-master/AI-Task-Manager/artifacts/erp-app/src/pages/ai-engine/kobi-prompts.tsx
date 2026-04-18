import { useState, useCallback, useEffect } from "react";
import { authFetch } from "@/lib/utils";
import {
  FileText, Plus, Edit2, Trash2, Search, X, Save,
  Loader2, CheckCircle2, XCircle, Copy, Eye, Brain,
  ChevronDown, ChevronUp, ToggleRight, ToggleLeft, Zap,
} from "lucide-react";

const API = "/api";

interface PromptTemplate {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  promptTemplate: string;
  systemPrompt: string | null;
  defaultModelId: number | null;
  variables: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  language: string | null;
  temperature: string | null;
}

const CATEGORY_OPTIONS = [
  { value: "kobi-system", label: "הוראות מערכת קובי" },
  { value: "kobi-task", label: "משימות קובי" },
  { value: "data-extraction", label: "חילוץ נתונים" },
  { value: "code", label: "קוד וייצור" },
  { value: "summarization", label: "סיכום" },
  { value: "translation", label: "תרגום" },
  { value: "general", label: "כללי" },
];

const CATEGORY_COLORS: Record<string, string> = {
  "kobi-system": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "kobi-task": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "data-extraction": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "code": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "summarization": "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "translation": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "general": "bg-gray-500/20 text-gray-300 border-gray-500/30",
};

export default function KobiPromptsPage() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<PromptTemplate | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const [form, setForm] = useState({
    name: "",
    slug: "",
    category: "kobi-system",
    description: "",
    systemPrompt: "",
    promptTemplate: "",
    variables: "",
    isActive: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(`${API}/ai-prompt-templates`);
      if (!res.ok) throw new Error("שגיאה בטעינת פרומפטים");
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = templates.filter(t => {
    if (!search) return true;
    const s = search.toLowerCase();
    return t.name.toLowerCase().includes(s) ||
      (t.description || "").toLowerCase().includes(s) ||
      t.category.toLowerCase().includes(s) ||
      t.slug.toLowerCase().includes(s);
  });

  const openCreate = () => {
    setEditItem(null);
    setForm({ name: "", slug: "", category: "kobi-system", description: "", systemPrompt: "", promptTemplate: "", variables: "", isActive: true });
    setShowForm(true);
  };

  const openEdit = (t: PromptTemplate) => {
    setEditItem(t);
    setForm({
      name: t.name,
      slug: t.slug,
      category: t.category,
      description: t.description || "",
      systemPrompt: t.systemPrompt || "",
      promptTemplate: t.promptTemplate,
      variables: t.variables || "",
      isActive: t.isActive,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.promptTemplate.trim()) return;
    setSaving(true);
    try {
      const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const payload = { ...form, slug };
      const url = editItem ? `${API}/ai-prompt-templates/${editItem.id}` : `${API}/ai-prompt-templates`;
      const method = editItem ? "PUT" : "POST";
      const res = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה בשמירה");
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await authFetch(`${API}/ai-prompt-templates/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("שגיאה במחיקה");
      setDeleteConfirm(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleToggleActive = async (t: PromptTemplate) => {
    try {
      await authFetch(`${API}/ai-prompt-templates/${t.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !t.isActive }),
      });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Brain className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">פרומפטים של קובי AI</h1>
            <p className="text-sm text-muted-foreground">ניהול תבניות פרומפט, הוראות מערכת ומשימות עבור קובי</p>
          </div>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">
          <Plus className="w-4 h-4" />
          פרומפט חדש
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="mr-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש פרומפט..."
            className="w-full pr-10 pl-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground"
          />
        </div>
        <div className="text-sm text-muted-foreground">
          {filtered.length} תבניות
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>אין תבניות פרומפט{search ? " התואמות לחיפוש" : ""}</p>
          {!search && <button onClick={openCreate} className="mt-3 text-purple-400 hover:text-purple-300">צור פרומפט ראשון</button>}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => (
            <div key={t.id} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <button onClick={() => handleToggleActive(t)} title={t.isActive ? "פעיל" : "כבוי"}>
                  {t.isActive
                    ? <ToggleRight className="w-5 h-5 text-green-400" />
                    : <ToggleLeft className="w-5 h-5 text-gray-500" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{t.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[t.category] || CATEGORY_COLORS.general}`}>
                      {CATEGORY_OPTIONS.find(c => c.value === t.category)?.label || t.category}
                    </span>
                  </div>
                  {t.description && <p className="text-sm text-muted-foreground mt-0.5 truncate">{t.description}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setExpandedId(expandedId === t.id ? null : t.id)} className="p-1.5 hover:bg-white/5 rounded text-muted-foreground">
                    {expandedId === t.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <button onClick={() => copyToClipboard(t.promptTemplate)} className="p-1.5 hover:bg-white/5 rounded text-muted-foreground" title="העתק">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-white/5 rounded text-muted-foreground" title="ערוך">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {deleteConfirm === t.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(t.id)} className="p-1.5 hover:bg-red-500/20 rounded text-red-400" title="אשר מחיקה">
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => setDeleteConfirm(null)} className="p-1.5 hover:bg-white/5 rounded text-muted-foreground" title="ביטול">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirm(t.id)} className="p-1.5 hover:bg-red-500/10 rounded text-muted-foreground" title="מחק">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              {expandedId === t.id && (
                <div className="border-t border-border p-4 space-y-3 bg-black/20">
                  {t.systemPrompt && (
                    <div>
                      <div className="flex items-center gap-2 text-xs text-purple-400 mb-1">
                        <Brain className="w-3 h-3" /> הוראות מערכת
                      </div>
                      <pre className="text-sm text-muted-foreground whitespace-pre-wrap bg-black/30 p-3 rounded-lg max-h-48 overflow-y-auto">{t.systemPrompt}</pre>
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2 text-xs text-blue-400 mb-1">
                      <Zap className="w-3 h-3" /> תבנית פרומפט
                    </div>
                    <pre className="text-sm text-muted-foreground whitespace-pre-wrap bg-black/30 p-3 rounded-lg max-h-48 overflow-y-auto">{t.promptTemplate}</pre>
                  </div>
                  {t.variables && (
                    <div>
                      <div className="text-xs text-amber-400 mb-1">משתנים</div>
                      <code className="text-sm text-muted-foreground">{t.variables}</code>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    slug: {t.slug} · נוצר: {new Date(t.createdAt).toLocaleDateString("he-IL")}
                    {t.updatedAt && ` · עודכן: ${new Date(t.updatedAt).toLocaleDateString("he-IL")}`}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">{editItem ? "עריכת פרומפט" : "פרומפט חדש"}</h2>
              <button onClick={() => setShowForm(false)} className="p-1 hover:bg-white/5 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">שם *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" placeholder="שם הפרומפט" />
                </div>
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">קטגוריה</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm">
                    {CATEGORY_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-muted-foreground mb-1">slug</label>
                  <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" placeholder="auto-generated" dir="ltr" />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <button onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))} className="flex items-center gap-2">
                    {form.isActive ? <ToggleRight className="w-5 h-5 text-green-400" /> : <ToggleLeft className="w-5 h-5 text-gray-500" />}
                    <span className="text-sm">{form.isActive ? "פעיל" : "כבוי"}</span>
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">תיאור</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" placeholder="תיאור קצר" />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">הוראות מערכת (System Prompt)</label>
                <textarea value={form.systemPrompt} onChange={e => setForm(f => ({ ...f, systemPrompt: e.target.value }))} rows={4} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono" placeholder="הוראות מערכת לקובי..." dir="rtl" />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">תבנית פרומפט *</label>
                <textarea value={form.promptTemplate} onChange={e => setForm(f => ({ ...f, promptTemplate: e.target.value }))} rows={6} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono" placeholder={'השתמש ב-{{variable}} עבור משתנים'} dir="rtl" />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">משתנים (מופרדים בפסיק)</label>
                <input value={form.variables} onChange={e => setForm(f => ({ ...f, variables: e.target.value }))} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm" placeholder="name, context, data" dir="ltr" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">ביטול</button>
              <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.promptTemplate.trim()} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {editItem ? "עדכן" : "צור"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
