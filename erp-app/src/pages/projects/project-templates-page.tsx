import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutTemplate, Plus, Search, X, Edit2, Trash2, Copy, Eye, CheckCircle2, ArrowRight } from "lucide-react";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { Badge } from "@/components/ui/badge";

const API = "/api";
const safeArray = (d: any) => Array.isArray(d) ? d : (d?.data || d?.items || []);

const projectTypeMap: Record<string, { label: string; color: string }> = {
  general: { label: "כללי", color: "bg-gray-500/20 text-gray-400" },
  installation: { label: "התקנה", color: "bg-blue-500/20 text-blue-400" },
  manufacturing: { label: "ייצור", color: "bg-orange-500/20 text-orange-400" },
  service: { label: "שירות", color: "bg-green-500/20 text-green-400" },
  construction: { label: "בנייה", color: "bg-yellow-500/20 text-yellow-400" },
  it: { label: "IT", color: "bg-purple-500/20 text-purple-400" },
};

function TemplateCard({ tmpl, onView, onEdit, onDelete, onUse }: any) {
  const td = tmpl.template_data || {};
  const tasks = td.tasks || [];
  const riskCats = td.riskCategories || [];
  const type = projectTypeMap[tmpl.project_type] || projectTypeMap.general;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border/50 rounded-2xl p-5 flex flex-col gap-3 hover:border-border transition-colors">
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1">
          <h3 className="text-foreground font-bold text-base mb-1">{tmpl.name}</h3>
          <p className="text-sm text-muted-foreground">{tmpl.description || "ללא תיאור"}</p>
        </div>
        <Badge className={`text-[10px] shrink-0 ${type.color}`}>{type.label}</Badge>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {tasks.length > 0 && <span className="bg-muted/30 px-2 py-0.5 rounded-full">{tasks.length} משימות</span>}
        {riskCats.length > 0 && <span className="bg-muted/30 px-2 py-0.5 rounded-full">{riskCats.length} קטגוריות סיכון</span>}
        {td.budgetCategories?.length > 0 && <span className="bg-muted/30 px-2 py-0.5 rounded-full">{td.budgetCategories.length} קטגוריות תקציב</span>}
      </div>
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => onUse(tmpl)}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-medium hover:bg-primary/90">
          <Copy className="w-3.5 h-3.5" /> השתמש בתבנית
        </button>
        <button onClick={() => onView(tmpl)} className="p-2 hover:bg-muted rounded-xl"><Eye className="w-4 h-4 text-muted-foreground" /></button>
        <button onClick={() => onEdit(tmpl)} className="p-2 hover:bg-muted rounded-xl"><Edit2 className="w-4 h-4 text-blue-400" /></button>
        <button onClick={() => onDelete(tmpl.id)} className="p-2 hover:bg-muted rounded-xl"><Trash2 className="w-4 h-4 text-red-400" /></button>
      </div>
    </motion.div>
  );
}

export default function ProjectTemplatesPage() {
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewDetail, setViewDetail] = useState<any>(null);
  const [showUseWizard, setShowUseWizard] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [useForm, setUseForm] = useState<any>({ name: "", startDate: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);
  const [createSuccess, setCreateSuccess] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await authFetch(`${API}/project-templates`);
      if (r.ok) setItems(safeArray(await r.json()));
    } catch {}
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i =>
    (filterType === "all" || i.project_type === filterType) &&
    (!search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase()))
  );

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", project_type: "general", template_data: { tasks: [], riskCategories: [], budgetCategories: [] } });
    setShowForm(true);
  };
  const openEdit = (r: any) => {
    setEditing(r);
    setForm({ ...r, template_data: r.template_data || { tasks: [], riskCategories: [], budgetCategories: [] } });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const url = editing ? `${API}/project-templates/${editing.id}` : `${API}/project-templates`;
      await authFetch(url, {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, templateData: form.template_data }),
      });
      setShowForm(false);
      load();
    } catch {}
    setSaving(false);
  };

  const remove = async (id: number) => {
    if (await globalConfirm("למחוק תבנית זו?")) {
      await authFetch(`${API}/project-templates/${id}`, { method: "DELETE" });
      load();
    }
  };

  const openUseWizard = (tmpl: any) => {
    setSelectedTemplate(tmpl);
    setUseForm({ name: `פרויקט מ-${tmpl.name}`, startDate: new Date().toISOString().slice(0, 10) });
    setCreateSuccess(false);
    setShowUseWizard(true);
  };

  const createFromTemplate = async () => {
    if (!useForm.name || !selectedTemplate) return;
    setSaving(true);
    try {
      const r = await authFetch(`${API}/project-templates/${selectedTemplate.id}/create-project`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: useForm.name, startDate: useForm.startDate, description: useForm.description }),
      });
      if (r.ok) setCreateSuccess(true);
    } catch {}
    setSaving(false);
  };

  const tdStr = (td: any) => {
    if (!td) return "{}";
    if (typeof td === "string") return td;
    try { return JSON.stringify(td, null, 2); } catch { return "{}"; }
  };

  return (
    <div className="p-4 md:p-6 space-y-5" dir="rtl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground flex items-center gap-2">
            <LayoutTemplate className="text-purple-400 w-6 h-6" />
            ספריית תבניות פרויקט
          </h1>
          <p className="text-sm text-muted-foreground mt-1">תבניות לפרויקטי התקנה, ייצור ושירות</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-xl hover:bg-primary/90 shadow-lg text-sm font-medium">
          <Plus className="w-4 h-4" /> תבנית חדשה
        </button>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש תבנית..."
            className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-card border border-border rounded-xl px-3 py-2.5 text-sm">
          <option value="all">כל הסוגים</option>
          {Object.entries(projectTypeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} תבניות</span>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-48 bg-card border border-border/50 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <LayoutTemplate className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">אין תבניות</p>
          <p className="text-sm mt-1">{search ? "נסה לשנות חיפוש" : "לחץ 'תבנית חדשה' להוספה"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(tmpl => (
            <TemplateCard key={tmpl.id} tmpl={tmpl} onView={setViewDetail} onEdit={openEdit} onDelete={remove} onUse={openUseWizard} />
          ))}
        </div>
      )}

      <AnimatePresence>
        {viewDetail && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setViewDetail(null)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{viewDetail.name}</h2>
                <button onClick={() => setViewDetail(null)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-xs text-muted-foreground">סוג פרויקט</div><div className="text-sm text-foreground">{projectTypeMap[viewDetail.project_type]?.label || viewDetail.project_type}</div></div>
                  <div><div className="text-xs text-muted-foreground">נוצר ע"י</div><div className="text-sm text-foreground">{viewDetail.created_by || "—"}</div></div>
                  <div className="col-span-2"><div className="text-xs text-muted-foreground">תיאור</div><div className="text-sm text-foreground">{viewDetail.description || "—"}</div></div>
                </div>
                {viewDetail.template_data?.tasks?.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-foreground mb-2">משימות ({viewDetail.template_data.tasks.length})</div>
                    <div className="space-y-1">
                      {viewDetail.template_data.tasks.map((t: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <ArrowRight className="w-3 h-3 text-muted-foreground/50" />
                          <span>{t.title}</span>
                          {t.duration && <span className="text-xs bg-muted/20 px-1.5 py-0.5 rounded">{t.duration} ימים</span>}
                          {t.phase && <Badge className="text-[10px] bg-muted/20 text-muted-foreground">{t.phase}</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {viewDetail.template_data?.riskCategories?.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-foreground mb-2">קטגוריות סיכון</div>
                    <div className="flex flex-wrap gap-1">
                      {viewDetail.template_data.riskCategories.map((c: string, i: number) => (
                        <Badge key={i} className="text-[10px] bg-red-500/20 text-red-400">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {viewDetail.template_data?.budgetCategories?.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-foreground mb-2">קטגוריות תקציב</div>
                    <div className="flex flex-wrap gap-1">
                      {viewDetail.template_data.budgetCategories.map((c: string, i: number) => (
                        <Badge key={i} className="text-[10px] bg-green-500/20 text-green-400">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => { setViewDetail(null); openUseWizard(viewDetail); }}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">השתמש בתבנית</button>
                <button onClick={() => setViewDetail(null)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">סגור</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showUseWizard && selectedTemplate && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => !createSuccess && setShowUseWizard(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">יצירת פרויקט מתבנית</h2>
                <button onClick={() => setShowUseWizard(false)}><X className="w-5 h-5" /></button>
              </div>
              {createSuccess ? (
                <div className="p-8 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <h3 className="text-foreground font-bold text-lg mb-1">פרויקט נוצר בהצלחה!</h3>
                  <p className="text-muted-foreground text-sm">הפרויקט "{useForm.name}" נוצר מהתבנית.</p>
                  <button onClick={() => setShowUseWizard(false)} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">סגור</button>
                </div>
              ) : (
                <>
                  <div className="p-5 space-y-4">
                    <div className="bg-muted/20 border border-border/50 rounded-xl p-3">
                      <div className="text-xs text-muted-foreground">תבנית נבחרת</div>
                      <div className="text-sm text-foreground font-medium mt-0.5">{selectedTemplate.name}</div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם הפרויקט *</label>
                      <input value={useForm.name} onChange={e => setUseForm({ ...useForm, name: e.target.value })}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1.5">תאריך התחלה</label>
                      <input type="date" value={useForm.startDate} onChange={e => setUseForm({ ...useForm, startDate: e.target.value })}
                        className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור (אופציונלי)</label>
                      <textarea value={useForm.description || ""} onChange={e => setUseForm({ ...useForm, description: e.target.value })}
                        rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                    </div>
                  </div>
                  <div className="p-5 border-t border-border flex justify-end gap-2">
                    <button onClick={() => setShowUseWizard(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                    <button onClick={createFromTemplate} disabled={saving || !useForm.name}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                      {saving ? "יוצר..." : "צור פרויקט"}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
              <div className="p-5 border-b border-border flex justify-between items-center">
                <h2 className="text-lg font-bold text-foreground">{editing ? "עריכת תבנית" : "תבנית חדשה"}</h2>
                <button onClick={() => setShowForm(false)}><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">שם התבנית *</label>
                  <input value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">סוג פרויקט</label>
                  <select value={form.project_type || "general"} onChange={e => setForm({ ...form, project_type: e.target.value })}
                    className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm">
                    {Object.entries(projectTypeMap).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">תיאור</label>
                  <textarea value={form.description || ""} onChange={e => setForm({ ...form, description: e.target.value })}
                    rows={2} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">נתוני תבנית (JSON)</label>
                  <textarea value={tdStr(form.template_data)} onChange={e => {
                    try { setForm({ ...form, template_data: JSON.parse(e.target.value) }); } catch { setForm({ ...form, _tdStr: e.target.value }); }
                  }}
                    rows={8} className="w-full bg-background border border-border rounded-xl px-3 py-2.5 text-sm font-mono text-xs" />
                  <p className="text-xs text-muted-foreground mt-1">דוגמה: {`{"tasks":[{"title":"...", "duration":5, "phase":"planning"}],"riskCategories":["טכני"]}`}</p>
                </div>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-muted text-muted-foreground rounded-lg text-sm">ביטול</button>
                <button onClick={save} disabled={saving || !form.name}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm disabled:opacity-50">
                  {saving ? "שומר..." : editing ? "עדכון" : "שמירה"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
