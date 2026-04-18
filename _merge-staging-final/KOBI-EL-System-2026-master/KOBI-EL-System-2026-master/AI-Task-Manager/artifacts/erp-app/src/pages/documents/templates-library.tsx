import { useState, useMemo } from "react";
import type { ComponentType } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/utils";
import {
  LayoutTemplate, Search, Plus, Edit2, Trash2, X, Save, FileText,
  FileSignature, Eye, Download, Send, Tag, ChevronDown, ChevronUp,
  Loader2, RefreshCw, Variable
} from "lucide-react";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";

const API = "/api";

type IconComponent = ComponentType<{ size?: number; className?: string }>;
type TemplateVariable = { name: string; label?: string; defaultValue?: string };
type SignatureField = { name: string; label?: string; required?: boolean };

const CATEGORY_CONFIG: Record<string, { label: string; color: string; icon: IconComponent }> = {
  sales_agreement: { label: "הסכם מכירה", color: "text-green-400 bg-green-500/10", icon: FileSignature },
  purchase_order: { label: "הזמנת רכש", color: "text-blue-400 bg-blue-500/10", icon: FileText },
  nda: { label: "הסכם סודיות", color: "text-purple-400 bg-purple-500/10", icon: FileSignature },
  employment: { label: "חוזה העסקה", color: "text-orange-400 bg-orange-500/10", icon: FileText },
  service_agreement: { label: "הסכם שירות", color: "text-cyan-400 bg-cyan-500/10", icon: FileText },
  subcontractor: { label: "קבלן משנה", color: "text-pink-400 bg-pink-500/10", icon: FileSignature },
};

type Template = {
  id: number; name: string; description: string | null; category: string | null;
  current_version: number; is_active: boolean; template_variables: TemplateVariable[];
  signature_fields: SignatureField[]; created_at: string; updated_at: string;
};

export default function TemplatesLibraryPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [previewRendered, setPreviewRendered] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showSignForm, setShowSignForm] = useState<Template | null>(null);
  const [sigFormData, setSigFormData] = useState({ signerName: "", signerEmail: "", contractId: "" });
  const [form, setForm] = useState<{
    name: string; category: string; description: string; templateContent: string;
  }>({ name: "", category: "service_agreement", description: "", templateContent: "" });

  const { data: templatesData = { templates: [] }, isLoading, refetch } = useQuery({
    queryKey: ["contract-templates"],
    queryFn: async () => {
      const r = await authFetch(`${API}/contract-templates?isActive=all`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const templates: Template[] = templatesData.templates || [];

  const filtered = useMemo(() => templates.filter(t => {
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) &&
      !(t.description || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [templates, categoryFilter, search]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const r = await authFetch(`${API}/contract-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          category: data.category,
          description: data.description,
          templateContent: data.templateContent || `<div dir="rtl"><h1>{{title}}</h1><p>{{content}}</p></div>`,
        }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "תבנית נוצרה", description: "התבנית החדשה נוספה לספרייה." });
      setShowForm(false);
      setForm({ name: "", category: "service_agreement", description: "", templateContent: "" });
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
    },
    onError: () => toast({ title: "שגיאה", description: "יצירת התבנית נכשלה.", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof form }) => {
      const r = await authFetch(`${API}/contract-templates/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, description: data.description, category: data.category, templateContent: data.templateContent }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "עודכן", description: "התבנית עודכנה בהצלחה." });
      setShowForm(false);
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/contract-templates/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      toast({ title: "נמחק", description: "התבנית הוסרה." });
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
    },
  });

  const sendSignatureMutation = useMutation({
    mutationFn: async ({ template, signer }: { template: Template; signer: typeof sigFormData }) => {
      const wRes = await authFetch(`${API}/e-signature-workflow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowName: `${template.name} — ${signer.signerName}`,
          provider: "local",
          templateId: template.id,
          contractId: signer.contractId ? Number(signer.contractId) : null,
        }),
      });
      if (!wRes.ok) throw new Error("Failed to create workflow");
      const wf = await wRes.json();

      const inviteRes = await authFetch(`${API}/e-signature/${wf.workflow.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signeeEmail: signer.signerEmail, signeeName: signer.signerName, signatureField: "signature", provider: "local" }),
      });
      if (!inviteRes.ok) {
        const err = await inviteRes.json().catch(() => ({ error: "שגיאה בשליחת ההזמנה" }));
        throw new Error(err.error || "שגיאה בשליחת ההזמנה");
      }
      return wf;
    },
    onSuccess: () => {
      toast({ title: "בקשת חתימה נשלחה", description: "החותם יקבל הזמנה לחתום." });
      setShowSignForm(null);
      setSigFormData({ signerName: "", signerEmail: "", contractId: "" });
    },
    onError: () => toast({ title: "שגיאה", description: "שליחת בקשת חתימה נכשלה.", variant: "destructive" }),
  });

  const handlePreview = async (tpl: Template) => {
    setPreviewTemplate(tpl);
    setPreviewLoading(true);
    try {
      const r = await authFetch(`${API}/contract-templates/${tpl.id}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mergeFields: {} }),
      });
      if (r.ok) {
        const data = await r.json();
        setPreviewRendered(data.rendered);
      } else {
        setPreviewRendered(null);
      }
    } catch (err) {
      console.warn("[Templates] Preview render failed:", err);
      setPreviewRendered(null);
    }
    setPreviewLoading(false);
  };

  const openEdit = async (t: Template) => {
    setEditing(t);
    setForm({ name: t.name, category: t.category || "service_agreement", description: t.description || "", templateContent: "" });
    setShowForm(true);
    try {
      const r = await authFetch(`${API}/contract-templates/${t.id}`);
      if (r.ok) {
        const data = await r.json();
        setForm(f => ({ ...f, templateContent: data.template_content || "" }));
      }
    } catch (err) {
      console.warn("[Templates] Failed to load template content:", err);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", category: "service_agreement", description: "", templateContent: "" });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (await globalConfirm("למחוק תבנית זו?")) deleteMutation.mutate(id);
  };

  const kpis = [
    { label: "סה\"כ תבניות", value: templates.length, color: "text-cyan-400" },
    { label: "קטגוריות", value: new Set(templates.map(t => t.category).filter(Boolean)).size, color: "text-blue-400" },
    { label: "שדות חתימה", value: templates.reduce((s, t) => s + (t.signature_fields?.length || 0), 0), color: "text-green-400" },
    { label: "עודכנו השבוע", value: templates.filter(t => t.updated_at && new Date(t.updated_at) > new Date(Date.now() - 7 * 86400000)).length, color: "text-orange-400" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div className="flex justify-between items-start flex-wrap gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold flex items-center gap-2">
            <LayoutTemplate className="text-cyan-500" /> ספריית תבניות חוזים
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">תבניות מוכנות עם שדות מיזוג לחוזים, הסכמים ומסמכים משפטיים</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => refetch()} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2">
            <RefreshCw size={14} /> רענן
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 bg-cyan-600 text-foreground px-4 py-2 rounded-lg hover:bg-cyan-700 text-sm">
            <Plus size={16} /> תבנית חדשה
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((kpi, i) => (
          <div key={i} className="bg-card rounded-xl border p-4">
            <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
          <Search className="absolute right-3 top-2.5 text-muted-foreground" size={18} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="חיפוש תבניות..."
            className="w-full pr-10 pl-4 py-2 border rounded-lg bg-background text-foreground" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="border rounded-lg px-3 py-2 bg-background text-foreground text-sm">
          <option value="all">כל הקטגוריות</option>
          {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 size={20} className="animate-spin" /> טוען תבניות...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <LayoutTemplate size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg">אין תבניות</p>
          <p className="text-sm mt-1">צור תבנית חדשה או שנה את הסינון</p>
          <button onClick={openCreate} className="mt-4 flex items-center gap-2 bg-cyan-600 text-foreground px-4 py-2 rounded-lg hover:bg-cyan-700 text-sm mx-auto">
            <Plus size={16} /> תבנית חדשה
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(t => {
            const cfg = CATEGORY_CONFIG[t.category || ""] || { label: t.category || "כללי", color: "text-gray-400 bg-gray-500/10", icon: FileText };
            const Icon = cfg.icon;
            const variables: TemplateVariable[] = t.template_variables || [];
            const sigFields: SignatureField[] = t.signature_fields || [];

            return (
              <div key={t.id} className="bg-card rounded-xl border hover:shadow-md transition-shadow flex flex-col">
                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${cfg.color.split(" ")[1]}`}>
                        <Icon size={16} className={cfg.color.split(" ")[0]} />
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{t.name}</div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(t)} className="p-1.5 hover:bg-blue-500/10 rounded text-muted-foreground hover:text-blue-400">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDelete(t.id)} className="p-1.5 hover:bg-red-500/10 rounded text-muted-foreground hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {t.description && <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{t.description}</p>}

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {variables.length > 0 && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
                        <Variable size={10} /> {variables.length} שדות
                      </span>
                    )}
                    {sigFields.length > 0 && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                        <FileSignature size={10} /> {sigFields.length} חתימות
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted/30 text-muted-foreground">
                      v{t.current_version}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>עודכן: {t.updated_at ? new Date(t.updated_at).toLocaleDateString("he-IL") : "—"}</span>
                    <span className={`px-2 py-0.5 rounded-full ${t.is_active ? "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400" : "bg-muted/50 text-muted-foreground"}`}>
                      {t.is_active ? "פעיל" : "לא פעיל"}
                    </span>
                  </div>
                </div>

                <div className="border-t p-3 flex gap-2">
                  <button onClick={() => handlePreview(t)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-500/10 rounded-lg py-1.5 font-medium">
                    <Eye size={12} /> תצוגה מקדימה
                  </button>
                  <button onClick={() => { setShowSignForm(t); setSigFormData({ signerName: "", signerEmail: "", contractId: "" }); }}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs text-green-600 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg py-1.5 font-medium">
                    <Send size={12} /> שלח לחתימה
                  </button>
                  <button className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:bg-muted/30 rounded-lg px-2 py-1.5">
                    <Download size={12} /> הפק
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => { setShowForm(false); setEditing(null); }}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editing ? "עריכת תבנית" : "תבנית חדשה"}</h2>
              <button onClick={() => { setShowForm(false); setEditing(null); }}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">שם התבנית *</label>
                <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 bg-background text-foreground" placeholder="שם התבנית" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">קטגוריה</label>
                <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 bg-background text-foreground text-sm">
                  {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">תיאור</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2} className="w-full border rounded-lg px-3 py-2 bg-background text-foreground resize-none" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">שדות מיזוג — לחץ להוספה</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {[
                    { field: "customer_name", label: "שם לקוח" },
                    { field: "supplier_name", label: "שם ספק" },
                    { field: "contract_number", label: "מספר חוזה" },
                    { field: "contract_date", label: "תאריך חוזה" },
                    { field: "contract_value", label: "ערך חוזה" },
                    { field: "currency", label: "מטבע" },
                    { field: "start_date", label: "תאריך התחלה" },
                    { field: "end_date", label: "תאריך סיום" },
                    { field: "signature", label: "חתימה" },
                  ].map(({ field, label }) => (
                    <button key={field} type="button"
                      onClick={() => {
                        const el = document.getElementById("template-content-textarea") as HTMLTextAreaElement | null;
                        if (el) {
                          const start = el.selectionStart ?? el.value.length;
                          const end = el.selectionEnd ?? el.value.length;
                          const tag = `{{${field}}}`;
                          const newVal = el.value.slice(0, start) + tag + el.value.slice(end);
                          setForm(f => ({ ...f, templateContent: newVal }));
                          setTimeout(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length); }, 0);
                        } else {
                          setForm(f => ({ ...f, templateContent: f.templateContent + `{{${field}}}` }));
                        }
                      }}
                      className="text-xs px-2 py-1 rounded border border-cyan-500/40 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 flex items-center gap-1">
                      <Variable size={10} /> {label}
                    </button>
                  ))}
                </div>
                <label className="block text-sm font-medium mb-1">תוכן תבנית (HTML)</label>
                <textarea id="template-content-textarea" value={form.templateContent} onChange={e => setForm({ ...form, templateContent: e.target.value })}
                  rows={8} placeholder='<div dir="rtl"><h1>{{customer_name}}</h1>...</div>'
                  className="w-full border rounded-lg px-3 py-2 bg-background text-foreground font-mono text-xs resize-none" />
                <p className="text-xs text-muted-foreground mt-1">לחץ על שדה מיזוג לעיל להכנסתו במיקום הסמן</p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => editing ? updateMutation.mutate({ id: editing.id, data: form }) : createMutation.mutate(form)}
                disabled={!form.name || createMutation.isPending || updateMutation.isPending}
                className="flex items-center gap-2 bg-cyan-600 text-foreground px-6 py-2 rounded-lg hover:bg-cyan-700 disabled:opacity-50">
                {(createMutation.isPending || updateMutation.isPending) ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {editing ? "עדכון" : "שמירה"}
              </button>
              <button onClick={() => { setShowForm(false); setEditing(null); }} className="px-6 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
            </div>
          </div>
        </div>
      )}

      {previewTemplate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => { setPreviewTemplate(null); setPreviewRendered(null); }}>
          <div className="bg-white dark:bg-card border rounded-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-bold">{previewTemplate.name}</h2>
              <button onClick={() => { setPreviewTemplate(null); setPreviewRendered(null); }} className="text-muted-foreground hover:text-foreground"><X size={20} /></button>
            </div>
            <div className="p-6">
              {previewLoading ? (
                <div className="flex items-center justify-center p-12 text-muted-foreground gap-2">
                  <Loader2 size={20} className="animate-spin" /> טוען תצוגה מקדימה...
                </div>
              ) : previewRendered ? (
                <div className="bg-white rounded-lg p-6 shadow-inner border" dangerouslySetInnerHTML={{ __html: previewRendered }} />
              ) : (
                <p className="text-muted-foreground text-center">לא ניתן לטעון תצוגה מקדימה</p>
              )}
            </div>
          </div>
        </div>
      )}

      {showSignForm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowSignForm(null)}>
          <div className="bg-card border rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">שלח לחתימה: {showSignForm.name}</h2>
              <button onClick={() => setShowSignForm(null)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">שם החותם *</label>
                <input value={sigFormData.signerName} onChange={e => setSigFormData(f => ({ ...f, signerName: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 bg-background text-foreground" placeholder="שם מלא" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">אימייל *</label>
                <input type="email" value={sigFormData.signerEmail} onChange={e => setSigFormData(f => ({ ...f, signerEmail: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 bg-background text-foreground" placeholder="email@example.com" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">מזהה חוזה (אופציונלי)</label>
                <input type="number" value={sigFormData.contractId} onChange={e => setSigFormData(f => ({ ...f, contractId: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 bg-background text-foreground" placeholder="מספר חוזה" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => sendSignatureMutation.mutate({ template: showSignForm, signer: sigFormData })}
                disabled={!sigFormData.signerName || !sigFormData.signerEmail || sendSignatureMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600 text-foreground py-2 rounded-lg hover:bg-green-700 disabled:opacity-50">
                {sendSignatureMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                שלח לחתימה
              </button>
              <button onClick={() => setShowSignForm(null)} className="px-4 py-2 border rounded-lg hover:bg-muted/30">ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
