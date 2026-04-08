import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Trash2, Copy, Edit2, FileText, X, Search, Eye, Code, Variable, ChevronDown
} from "lucide-react";
import ActivityLog from "@/components/activity-log";
import RelatedRecords from "@/components/related-records";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API = "/api";

interface ContentTemplate {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  entityId: number | null;
  category: string;
  templateContent: string;
  variables: any[];
  styles: any;
  settings: any;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Entity {
  id: number;
  name: string;
  slug: string;
  moduleId: number;
}

interface EntityField {
  id: number;
  entityId: number;
  name: string;
  slug: string;
  fieldType: string;
}

interface EntityRecord {
  id: number;
  entityId: number;
  data: Record<string, any>;
  status: string;
}

const CATEGORIES = [
  { value: "general", label: "כללי" },
  { value: "email", label: "אימייל" },
  { value: "notification", label: "התראה" },
  { value: "sms", label: "SMS" },
  { value: "letter", label: "מכתב" },
  { value: "report", label: "דוח" },
];

export default function TemplateBuilder() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [editingTemplate, setEditingTemplate] = useState<ContentTemplate | null>(null);
  const [showEditor, setShowEditor] = useState(false);

  const { data: templates = [], isLoading } = useQuery<ContentTemplate[]>({
    queryKey: ["content-templates"],
    queryFn: async () => {
      const r = await authFetch(`${API}/platform/content-templates`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`${API}/platform/content-templates/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete template");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["content-templates"] }),
  });

  const filtered = templates.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingTemplate(null);
    setShowEditor(true);
  };

  const openEdit = (t: ContentTemplate) => {
    setEditingTemplate(t);
    setShowEditor(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold">תבניות תוכן</h1>
          <p className="text-muted-foreground mt-1">
            ניהול תבניות טקסט עם משתנים דינמיים מישויות המערכת
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-5 h-5" />
          תבנית חדשה
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש תבניות..."
          className="w-full pr-10 pl-4 py-2.5 bg-card border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border/50 rounded-xl p-12 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">
            {search ? "לא נמצאו תבניות תואמות" : "אין תבניות תוכן. צור תבנית ראשונה."}
          </p>
          {!search && (
            <button onClick={openCreate} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium">
              צור תבנית
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((tmpl, i) => (
            <motion.div
              key={tmpl.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="bg-card border border-border rounded-2xl p-5 hover:border-primary/30 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Code className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{tmpl.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {CATEGORIES.find(c => c.value === tmpl.category)?.label || tmpl.category}
                    </p>
                  </div>
                </div>
              </div>

              {tmpl.description && (
                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{tmpl.description}</p>
              )}

              <div className="flex flex-wrap gap-1.5 mb-3">
                {tmpl.entityId && (
                  <span className="px-2 py-0.5 text-[10px] rounded bg-green-500/10 text-green-400 font-semibold">
                    ישות מקושרת
                  </span>
                )}
                {(tmpl.variables as any[])?.length > 0 && (
                  <span className="px-2 py-0.5 text-[10px] rounded bg-purple-500/10 text-purple-400 font-semibold">
                    {(tmpl.variables as any[]).length} משתנים
                  </span>
                )}
                <span className={`px-2 py-0.5 text-[10px] rounded font-semibold ${tmpl.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {tmpl.isActive ? "פעיל" : "לא פעיל"}
                </span>
              </div>

              <div className="bg-muted/10 rounded-lg p-2 border border-border/20 max-h-16 overflow-hidden mb-3">
                <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap line-clamp-3">
                  {tmpl.templateContent.substring(0, 150)}
                </pre>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-border/50">
                <button
                  onClick={() => openEdit(tmpl)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  עריכה
                </button>
                {isSuperAdmin && <button
                  onClick={async () => { const ok = await globalConfirm("למחוק?"); if (ok) deleteMutation.mutate(tmpl.id); }}
                  className="p-2 hover:bg-destructive/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showEditor && (
          <TemplateEditorModal
            template={editingTemplate}
            onClose={() => setShowEditor(false)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ["content-templates"] });
              setShowEditor(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function TemplateEditorModal({
  template,
  onClose,
  onSaved,
}: {
  template: ContentTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<"editor" | "preview">("editor");
  const [name, setName] = useState(template?.name || "");
  const [slug, setSlug] = useState(template?.slug || "");
  const [description, setDescription] = useState(template?.description || "");
  const [category, setCategory] = useState(template?.category || "general");
  const [entityId, setEntityId] = useState<number | null>(template?.entityId || null);
  const [content, setContent] = useState(template?.templateContent || "");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewRecordId, setPreviewRecordId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showVarPicker, setShowVarPicker] = useState(false);

  const { modules: _templateModules } = usePlatformModules();

  const { data: entities = [] } = useQuery<Entity[]>({
    queryKey: ["all-entities", _templateModules.map((m: any) => m.id)],
    queryFn: async () => {
      const allEntities: Entity[] = [];
      for (const mod of _templateModules) {
        const er = await authFetch(`${API}/platform/modules/${mod.id}/entities`);
        if (er.ok) {
          const ents = await er.json();
          allEntities.push(...ents);
        }
      }
      return allEntities;
    },
    enabled: _templateModules.length > 0,
  });

  const { data: fields = [] } = useQuery<EntityField[]>({
    queryKey: ["entity-fields", entityId],
    queryFn: async () => {
      if (!entityId) return [];
      const r = await authFetch(`${API}/platform/entities/${entityId}/fields`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!entityId,
  });

  const { data: records = [] } = useQuery<EntityRecord[]>({
    queryKey: ["entity-records-preview", entityId],
    queryFn: async () => {
      if (!entityId) return [];
      const r = await authFetch(`${API}/platform/entities/${entityId}/records?limit=20`);
      if (!r.ok) return [];
      const data = await r.json();
      return data.records || [];
    },
    enabled: !!entityId,
  });

  const autoSlug = (n: string) => n.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  const insertVariable = (varName: string) => {
    const el = editorRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const insertion = `{{${varName}}}`;
    const newContent = content.substring(0, start) + insertion + content.substring(end);
    setContent(newContent);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 0);
    setShowVarPicker(false);
  };

  const loadPreview = async () => {
    if (!template?.id && !name) return;
    const templateId = template?.id;
    if (templateId) {
      try {
        const r = await authFetch(`${API}/platform/content-templates/${templateId}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordId: previewRecordId }),
        });
        if (r.ok) {
          const data = await r.json();
          setPreviewHtml(data.html);
        }
      } catch {}
    } else {
      let html = content;
      setPreviewHtml(`<div dir="rtl" style="font-family: Arial; padding: 20px; line-height: 1.6;">${html}</div>`);
    }
  };

  useEffect(() => {
    if (tab === "preview") loadPreview();
  }, [tab, previewRecordId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name,
        slug: slug || autoSlug(name),
        description: description || undefined,
        entityId: entityId || undefined,
        category,
        templateContent: content,
        variables: fields.map(f => ({ slug: f.slug, name: f.name, fieldType: f.fieldType })),
        isActive,
      };

      const url = template
        ? `${API}/platform/content-templates/${template.id}`
        : `${API}/platform/content-templates`;
      const method = template ? "PUT" : "POST";

      const r = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) throw new Error("Failed to save template");
      onSaved();
    } catch (err: any) {
      alert(err?.message || "שגיאה בשמירת התבנית");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-card border border-border rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">{template ? "עריכת תבנית" : "תבנית חדשה"}</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">שם התבנית</label>
              <input
                value={name}
                onChange={e => { setName(e.target.value); if (!template) setSlug(autoSlug(e.target.value)); }}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                placeholder="תבנית אימייל ללקוח"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">מזהה</label>
              <input
                value={slug}
                onChange={e => setSlug(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                dir="ltr"
                placeholder="customer-email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">קטגוריה</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ישות מקושרת</label>
              <select
                value={entityId || ""}
                onChange={e => setEntityId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">ללא</option>
                {entities.map(ent => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">תיאור</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="תיאור קצר..."
            />
          </div>

          <div className="flex items-center gap-2 border-b border-border">
            <button
              onClick={() => setTab("editor")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === "editor" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Code className="w-4 h-4 inline-block ml-1" />
              עורך
            </button>
            <button
              onClick={() => setTab("preview")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === "preview" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="w-4 h-4 inline-block ml-1" />
              תצוגה מקדימה
            </button>
          </div>

          {tab === "editor" ? (
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">תוכן התבנית (HTML)</label>
                  <div className="relative">
                    <button
                      onClick={() => setShowVarPicker(!showVarPicker)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 text-purple-400 rounded-lg text-xs font-medium hover:bg-purple-500/20 transition-colors"
                    >
                      <Variable className="w-3.5 h-3.5" />
                      הכנס משתנה
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {showVarPicker && (
                      <div className="absolute left-0 top-full mt-1 w-64 bg-card border border-border rounded-xl shadow-xl z-10 max-h-60 overflow-auto">
                        <div className="p-2 border-b border-border">
                          <p className="text-xs font-semibold text-muted-foreground">משתני מערכת</p>
                        </div>
                        <button
                          onClick={() => insertVariable("_record_id")}
                          className="w-full text-right px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                        >
                          <span className="font-mono text-xs text-purple-400">{"{{_record_id}}"}</span>
                          <span className="text-muted-foreground mr-2">מזהה רשומה</span>
                        </button>
                        <button
                          onClick={() => insertVariable("_status")}
                          className="w-full text-right px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                        >
                          <span className="font-mono text-xs text-purple-400">{"{{_status}}"}</span>
                          <span className="text-muted-foreground mr-2">סטטוס</span>
                        </button>
                        <button
                          onClick={() => insertVariable("_created_at")}
                          className="w-full text-right px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                        >
                          <span className="font-mono text-xs text-purple-400">{"{{_created_at}}"}</span>
                          <span className="text-muted-foreground mr-2">תאריך יצירה</span>
                        </button>
                        {fields.length > 0 && (
                          <>
                            <div className="p-2 border-t border-b border-border">
                              <p className="text-xs font-semibold text-muted-foreground">שדות ישות</p>
                            </div>
                            {fields.map(f => {
                              const entityName = entities.find(e => e.id === entityId)?.slug || "entity";
                              const varKey = `${entityName}.${f.slug}`;
                              return (
                                <button
                                  key={f.slug}
                                  onClick={() => insertVariable(varKey)}
                                  className="w-full text-right px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                                >
                                  <span className="font-mono text-xs text-purple-400">{`{{${varKey}}}`}</span>
                                  <span className="text-muted-foreground mr-2">{f.name}</span>
                                  <span className="text-[10px] text-muted-foreground/60 mr-1">({f.fieldType})</span>
                                </button>
                              );
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <textarea
                  ref={editorRef}
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  className="w-full min-h-[350px] p-4 bg-background border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                  dir="ltr"
                  placeholder={'<h1>{{company_name}}</h1>\n<p>שלום {{contact_name}},</p>'}
                />
                <p className="text-xs text-muted-foreground">
                  {"השתמש ב- {{שם_שדה}} כדי להוסיף משתנים דינמיים. בחר ישות מקושרת כדי לראות שדות זמינים."}
                </p>
              </div>

              {fields.length > 0 && (
                <div className="w-56 space-y-2">
                  <p className="text-sm font-medium">שדות זמינים</p>
                  <div className="bg-muted/10 border border-border rounded-xl p-2 max-h-[350px] overflow-auto space-y-1">
                    {fields.map(f => {
                      const entitySlug = entities.find(e => e.id === entityId)?.slug || "entity";
                      const varKey = `${entitySlug}.${f.slug}`;
                      return (
                        <button
                          key={f.slug}
                          onClick={() => insertVariable(varKey)}
                          className="w-full text-right px-2 py-1.5 text-xs hover:bg-primary/10 rounded-lg transition-colors flex items-center justify-between"
                        >
                          <span className="text-muted-foreground">{f.name}</span>
                          <span className="font-mono text-[10px] text-purple-400">{varKey}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {entityId && records.length > 0 && (
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium">רשומה לתצוגה מקדימה:</label>
                  <select
                    value={previewRecordId || ""}
                    onChange={e => setPreviewRecordId(e.target.value ? Number(e.target.value) : null)}
                    className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
                  >
                    <option value="">רשומה ראשונה (אוטומטי)</option>
                    {records.map(r => (
                      <option key={r.id} value={r.id}>
                        רשומה #{r.id} - {Object.values(r.data || {}).slice(0, 2).join(", ")}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={loadPreview}
                    className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-sm font-medium hover:bg-primary/20"
                  >
                    רענן
                  </button>
                </div>
              )}
              <div className="bg-card rounded-xl p-6 text-foreground min-h-[300px] border border-border">
                {previewHtml ? (
                  <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                ) : (
                  <p className="text-muted-foreground text-center py-10">שמור את התבנית ולחץ על ״תצוגה מקדימה״ לצפייה</p>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="rounded"
              />
              פעיל
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? "שומר..." : "שמור תבנית"}
          </button>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
        <ActivityLog entityType="templates" />
        <RelatedRecords entityType="templates" />
      </div>
      </motion.div>
    </motion.div>
  );
}
