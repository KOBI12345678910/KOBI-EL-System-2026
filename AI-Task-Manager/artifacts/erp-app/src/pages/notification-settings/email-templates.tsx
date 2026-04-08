import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Mail, Plus, Trash2, Edit2, Eye, Check, X, Code, AlignRight, AlignLeft,
  ChevronDown, ChevronUp, Variable, Save, RefreshCw, Info
} from "lucide-react";
import { authFetch } from "@/lib/utils";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API_BASE = "/api";

const CATEGORIES = [
  { value: "system", label: "מערכת" },
  { value: "anomaly", label: "חריגות" },
  { value: "task", label: "משימות" },
  { value: "approval", label: "אישורים" },
  { value: "workflow", label: "תהליכים" },
  { value: "invoice", label: "חשבוניות" },
  { value: "order", label: "הזמנות" },
  { value: "shipment", label: "משלוחים" },
];

const VARIABLE_PRESETS = [
  "customer_name", "order_number", "invoice_number", "amount",
  "due_date", "system_url", "tracking_link", "payment_link",
  "product_name", "quantity", "price", "user_name", "date",
];

interface EmailTemplate {
  id: number;
  name: string;
  category: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  isRtl: boolean;
  variables: string[];
  attachmentConfig: Record<string, unknown> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TemplateForm {
  name: string;
  category: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  isRtl: boolean;
  variables: string[];
}

const DEFAULT_FORM: TemplateForm = {
  name: "",
  category: "system",
  subject: "{{subject}}",
  bodyHtml: `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:24px 40px;">
            <h1 style="margin:0;color:#fff;font-size:20px;">{{title}}</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0;color:#475569;font-size:15px;line-height:1.7;">{{message}}</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  bodyText: "{{title}}\n\n{{message}}",
  isRtl: true,
  variables: ["title", "message"],
};

function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, "").trim()))];
}

export default function EmailTemplatesPage() {
  const queryClient = useQueryClient();
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateForm>(DEFAULT_FORM);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewVars, setPreviewVars] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newVar, setNewVar] = useState("");
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const { data: templates = [], isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["email-templates"],
    queryFn: async () => {
      const r = await authFetch(`${API_BASE}/email-templates`);
      if (!r.ok) throw new Error("Failed to fetch");
      return r.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TemplateForm) => {
      const r = await authFetch(`${API_BASE}/email-templates`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to create");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setShowForm(false);
      setForm(DEFAULT_FORM);
      setEditingId(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<TemplateForm & { isActive: boolean }> }) => {
      const r = await authFetch(`${API_BASE}/email-templates/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["email-templates"] });
      setShowForm(false);
      setEditingId(null);
      setForm(DEFAULT_FORM);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API_BASE}/email-templates/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["email-templates"] }),
  });

  function startEdit(t: EmailTemplate) {
    setEditingId(t.id);
    setForm({
      name: t.name,
      category: t.category,
      subject: t.subject,
      bodyHtml: t.bodyHtml,
      bodyText: t.bodyText || "",
      isRtl: t.isRtl,
      variables: Array.isArray(t.variables) ? t.variables : [],
    });
    setShowForm(true);
    setPreviewMode(false);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setPreviewMode(false);
  }

  function handleSubmit() {
    const vars = extractVariables(form.bodyHtml + " " + form.subject);
    const finalForm = { ...form, variables: [...new Set([...form.variables, ...vars])] };
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: finalForm });
    } else {
      createMutation.mutate(finalForm);
    }
  }

  function insertVariable(varName: string) {
    if (!editorRef.current) return;
    const textarea = editorRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newValue = form.bodyHtml.slice(0, start) + `{{${varName}}}` + form.bodyHtml.slice(end);
    setForm(f => ({ ...f, bodyHtml: newValue }));
    setTimeout(() => {
      textarea.selectionStart = start + varName.length + 4;
      textarea.selectionEnd = start + varName.length + 4;
      textarea.focus();
    }, 0);
  }

  function addVariable() {
    const v = newVar.trim().replace(/\s+/g, "_");
    if (v && !form.variables.includes(v)) {
      setForm(f => ({ ...f, variables: [...f.variables, v] }));
    }
    setNewVar("");
  }

  function getPreviewHtml() {
    let html = form.bodyHtml;
    for (const [key, value] of Object.entries(previewVars)) {
      html = html.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), value || `[${key}]`);
    }
    const vars = extractVariables(form.bodyHtml);
    for (const v of vars) {
      html = html.replace(new RegExp(`\\{\\{\\s*${v}\\s*\\}\\}`, "g"), previewVars[v] || `[${v}]`);
    }
    return html;
  }

  const detectedVars = extractVariables(form.bodyHtml + " " + form.subject);

  return (
    <div className="space-y-4 sm:space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/20">
            <Mail className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-bold">תבניות אימייל</h1>
            <p className="text-sm text-muted-foreground">ניהול תבניות HTML לשליחת התראות אימייל עם משתנים דינמיים</p>
          </div>
        </div>
        <button
          onClick={() => { cancelForm(); setShowForm(!showForm); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          תבנית חדשה
        </button>
      </div>

      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-300/80">
          <strong className="text-blue-300">משתנים דינמיים:</strong> השתמש ב-<code className="bg-blue-500/20 px-1 rounded text-xs">{"{{variable_name}}"}</code> בתוך הנושא ותוכן המייל. בעת שליחה, המשתנים יוחלפו בערכים אמיתיים.
        </div>
      </div>

      {showForm && (
        <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
            <h2 className="text-sm font-semibold">{editingId ? "עריכת תבנית" : "תבנית חדשה"}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewMode(!previewMode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${previewMode ? "bg-primary/20 text-primary" : "bg-card/5 text-muted-foreground hover:bg-card/10"}`}
              >
                <Eye className="w-3.5 h-3.5" />
                {previewMode ? "עורך" : "תצוגה מקדימה"}
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs text-muted-foreground mb-1.5">שם התבנית</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="למשל: התראת תקציב, אישור הזמנה..."
                  className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">קטגוריה</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">נושא המייל</label>
              <input
                type="text"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="נושא עם {{variables}}..."
                className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                dir={form.isRtl ? "rtl" : "ltr"}
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => setForm(f => ({ ...f, isRtl: !f.isRtl }))}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${form.isRtl ? "bg-primary" : "bg-muted"}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${form.isRtl ? "right-0.5" : "right-5"}`} />
                </div>
                <span className="text-sm">כיוון RTL (עברית)</span>
              </label>
              <div className="flex items-center gap-1">
                {form.isRtl ? <AlignRight className="w-4 h-4 text-primary" /> : <AlignLeft className="w-4 h-4 text-muted-foreground" />}
                <span className="text-xs text-muted-foreground">{form.isRtl ? "מימין לשמאל" : "משמאל לימין"}</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-muted-foreground">תוכן HTML</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">הוסף משתנה:</span>
                  <select
                    value=""
                    onChange={e => { if (e.target.value) insertVariable(e.target.value); }}
                    className="px-2 py-1 bg-card/5 border border-border/50 rounded text-xs"
                  >
                    <option value="">בחר...</option>
                    {VARIABLE_PRESETS.map(v => <option key={v} value={v}>{`{{${v}}}`}</option>)}
                  </select>
                </div>
              </div>

              {previewMode ? (
                <div className="border border-border/50 rounded-lg overflow-hidden">
                  <div className="bg-card/5 px-3 py-2 border-b border-border/30 text-xs text-muted-foreground flex items-center gap-2">
                    <Eye className="w-3.5 h-3.5" />
                    תצוגה מקדימה — הזן ערכי משתנים:
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2 border-b border-border/30">
                    {[...new Set([...detectedVars, ...form.variables])].map(v => (
                      <div key={v} className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-24 truncate">{`{{${v}}}`}</span>
                        <input
                          type="text"
                          placeholder={v}
                          value={previewVars[v] || ""}
                          onChange={e => setPreviewVars(prev => ({ ...prev, [v]: e.target.value }))}
                          className="flex-1 px-2 py-1 bg-card/5 border border-border/30 rounded text-xs"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-b-lg" style={{ minHeight: "200px" }}>
                    <iframe
                      srcDoc={getPreviewHtml()}
                      className="w-full border-0 rounded-b-lg"
                      style={{ height: "400px" }}
                      title="Email Preview"
                    />
                  </div>
                </div>
              ) : (
                <textarea
                  ref={editorRef}
                  value={form.bodyHtml}
                  onChange={e => setForm(f => ({ ...f, bodyHtml: e.target.value }))}
                  className="w-full px-3 py-2 bg-card/5 border border-border/50 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary resize-y"
                  style={{ minHeight: "280px", direction: "ltr" }}
                  placeholder="HTML content..."
                />
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Variable className="w-3.5 h-3.5" />
                  משתנים מוגדרים
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newVar}
                    onChange={e => setNewVar(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && addVariable()}
                    placeholder="שם משתנה חדש..."
                    className="px-2 py-1 bg-card/5 border border-border/30 rounded text-xs w-36"
                  />
                  <button onClick={addVariable} className="px-2 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                    הוסף
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[...new Set([...form.variables, ...detectedVars])].map(v => (
                  <span key={v} className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs">
                    {`{{${v}}}`}
                    <button onClick={() => setForm(f => ({ ...f, variables: f.variables.filter(x => x !== v) }))} className="hover:text-red-400">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {form.variables.length === 0 && detectedVars.length === 0 && (
                  <span className="text-xs text-muted-foreground">אין משתנים — השתמש ב-{`{{variable}}`} בתוכן</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={cancelForm} className="px-4 py-2 text-sm rounded-lg bg-card/5 hover:bg-card/10 text-muted-foreground transition-colors">
                ביטול
              </button>
              <button
                onClick={handleSubmit}
                disabled={!form.name || !form.subject || !form.bodyHtml || createMutation.isPending || updateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {editingId ? "עדכן תבנית" : "צור תבנית"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">טוען תבניות...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Mail className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-lg font-medium mb-1">אין תבניות אימייל</p>
            <p className="text-sm">לחץ על "תבנית חדשה" כדי ליצור תבנית HTML לשליחת התראות</p>
          </div>
        ) : (
          templates.map(t => {
            const isExpanded = expandedId === t.id;
            const catLabel = CATEGORIES.find(c => c.value === t.category)?.label || t.category;
            const vars = Array.isArray(t.variables) ? t.variables : [];
            return (
              <div key={t.id} className={`bg-card border rounded-xl overflow-hidden ${t.isActive ? "border-border/50" : "border-border/20 opacity-60"}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${t.isActive ? "bg-emerald-500" : "bg-muted"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{t.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">{catLabel}</span>
                      {t.isRtl && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">RTL</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{t.subject}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {vars.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-card/5 text-muted-foreground border border-border/30 flex items-center gap-0.5">
                        <Variable className="w-3 h-3" />
                        {vars.length}
                      </span>
                    )}
                    <button onClick={() => setExpandedId(isExpanded ? null : t.id)} className="p-1.5 rounded-lg hover:bg-card/5 text-muted-foreground transition-colors">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button onClick={() => startEdit(t)} className="p-1.5 rounded-lg hover:bg-card/5 text-muted-foreground hover:text-foreground transition-colors">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => updateMutation.mutate({ id: t.id, data: { isActive: !t.isActive } })}
                      className={`p-1.5 rounded-lg transition-colors ${t.isActive ? "hover:bg-yellow-500/10 text-muted-foreground hover:text-yellow-400" : "hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-400"}`}
                      title={t.isActive ? "השבת" : "הפעל"}
                    >
                      {t.isActive ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={async () => {
                        if (window.globalConfirm?.("למחוק תבנית זו?") ?? confirm("למחוק תבנית זו?")) {
                          deleteMutation.mutate(t.id);
                        }
                      }}
                      className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t border-border/20 p-4 space-y-3">
                    {vars.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                          <Variable className="w-3 h-3" /> משתנים דינמיים:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {vars.map(v => (
                            <span key={v} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400">
                              {`{{${v}}}`}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5">
                        <Code className="w-3 h-3" /> תצוגה מקדימה:
                      </p>
                      <div className="border border-border/30 rounded-lg overflow-hidden bg-white" style={{ height: "200px" }}>
                        <iframe
                          srcDoc={t.bodyHtml}
                          className="w-full h-full border-0"
                          title={`Preview: ${t.name}`}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      עודכן: {new Date(t.updatedAt).toLocaleDateString("he-IL")}
                    </p>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
