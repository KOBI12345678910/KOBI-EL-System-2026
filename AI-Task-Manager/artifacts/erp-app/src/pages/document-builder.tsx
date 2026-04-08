import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal, Label, Card } from "@/components/ui-components";
import { authFetch } from "@/lib/utils";
import { usePlatformModules } from "@/hooks/usePlatformModules";
import {
  Plus, Edit2, Trash2, FileText, Eye, Download, Receipt, FileSignature,
  ScrollText, Variable, ChevronDown, Printer, X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { globalConfirm } from "@/components/confirm-dialog";
import { usePermissions } from "@/hooks/use-permissions";

const API_BASE = "/api";

interface DocTemplate {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  documentType: string;
  entityId: number | null;
  templateContent: string;
  headerContent: string | null;
  footerContent: string | null;
  placeholders: any[];
  styles: any;
  pageSettings: any;
  sampleData: any;
  isActive: boolean;
  createdAt: string;
}

interface Entity {
  id: number;
  name: string;
  slug: string;
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

const DOC_TYPES = [
  { value: "invoice", label: "חשבונית", icon: Receipt },
  { value: "quote", label: "הצעת מחיר", icon: FileText },
  { value: "contract", label: "חוזה", icon: FileSignature },
  { value: "receipt", label: "קבלה", icon: ScrollText },
  { value: "other", label: "אחר", icon: FileText },
];

export default function DocumentBuilderPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showDesigner, setShowDesigner] = useState(false);
  const { permissions } = usePermissions();
  const isSuperAdmin = permissions?.isSuperAdmin === true;
  const [editingTemplate, setEditingTemplate] = useState<DocTemplate | null>(null);
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const [generateTemplateId, setGenerateTemplateId] = useState<number | null>(null);
  const [generateRecordId, setGenerateRecordId] = useState<number | null>(null);
  const [generateData, setGenerateData] = useState<Record<string, string>>({});

  const { data: templates = [], isLoading } = useQuery<DocTemplate[]>({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/platform/document-templates`);
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${API_BASE}/platform/document-templates/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-templates"] });
      toast({ title: "נמחק", description: "התבנית הוסרה." });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async ({ templateId, data, recordId }: { templateId: number; data: Record<string, string>; recordId?: number | null }) => {
      const r = await fetch(`${API_BASE}/platform/document-templates/${templateId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, recordId }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (doc) => {
      setGenerateTemplateId(null);
      setPreviewDoc(doc);
      toast({ title: "מסמך נוצר", description: `מסמך מספר ${doc.documentNumber} נוצר בהצלחה.` });
    },
  });

  const openCreate = () => {
    setEditingTemplate(null);
    setShowDesigner(true);
  };

  const openEdit = (tpl: DocTemplate) => {
    setEditingTemplate(tpl);
    setShowDesigner(true);
  };

  const openGenerate = (tpl: DocTemplate) => {
    setGenerateTemplateId(tpl.id);
    setGenerateRecordId(null);
    const data: Record<string, string> = {};
    ((tpl.placeholders as any[]) || []).forEach((p: any) => {
      data[p.key] = p.defaultValue || "";
    });
    const matches = tpl.templateContent.match(/\{\{([\w.]+)\}\}/g) || [];
    matches.forEach(m => {
      const key = m.replace(/\{\{|\}\}/g, "").trim();
      if (!data[key]) data[key] = "";
    });
    setGenerateData(data);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground">בונה מסמכים</h1>
          <p className="text-muted-foreground mt-1">
            עיצוב תבניות מסמכים עם header/body/footer, מיפוי שדות מישויות, ותצוגת הדפסה
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-5 h-5" /> צור תבנית חדשה
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">טוען תבניות...</div>
      ) : templates.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-2">אין תבניות מסמכים</h3>
          <p className="text-sm text-muted-foreground mb-4">צור תבנית ראשונה להפקת מסמכים אוטומטית</p>
          <Button onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> צור תבנית</Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map(tpl => {
            const typeInfo = DOC_TYPES.find(d => d.value === tpl.documentType) || DOC_TYPES[4];
            const TypeIcon = typeInfo.icon;
            return (
              <Card key={tpl.id} className="flex flex-col hover:border-primary/30 transition-colors">
                <div className="p-5 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-xl bg-orange-500/10">
                      <TypeIcon className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-foreground">{tpl.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{tpl.description || typeInfo.label}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(tpl)} className="p-2 text-muted-foreground hover:bg-card/10 hover:text-foreground rounded-lg transition-colors">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {isSuperAdmin && <button onClick={async () => { const ok = await globalConfirm("למחוק?"); if (ok) deleteMutation.mutate(tpl.id); }} className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-lg transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>}
                  </div>
                </div>
                <div className="px-5 pb-3 flex flex-wrap gap-2">
                  <span className="px-2 py-0.5 text-[10px] rounded bg-orange-500/10 text-orange-400 font-semibold uppercase tracking-wider">
                    {typeInfo.label}
                  </span>
                  {tpl.entityId && (
                    <span className="px-2 py-0.5 text-[10px] rounded bg-green-500/10 text-green-400 font-semibold">
                      ישות מקושרת
                    </span>
                  )}
                  {(tpl.placeholders as any[])?.length > 0 && (
                    <span className="px-2 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-400 font-semibold">
                      {(tpl.placeholders as any[]).length} placeholders
                    </span>
                  )}
                </div>
                <div className="px-5 pb-4">
                  <div className="bg-muted/10 rounded-lg p-3 border border-border/20 max-h-24 overflow-hidden">
                    <pre className="text-[11px] text-muted-foreground font-mono whitespace-pre-wrap line-clamp-4">{tpl.templateContent.substring(0, 200)}</pre>
                  </div>
                </div>
                <div className="p-4 border-t border-border/30 flex justify-between items-center">
                  <button onClick={() => openGenerate(tpl)} className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium transition-colors">
                    <Download className="w-4 h-4" /> הפק מסמך
                  </button>
                  <button onClick={() => openEdit(tpl)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
                    <Eye className="w-4 h-4" /> עריכה
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {showDesigner && (
        <DocumentDesigner
          template={editingTemplate}
          onClose={() => setShowDesigner(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["document-templates"] });
            setShowDesigner(false);
          }}
        />
      )}

      {generateTemplateId && (
        <GenerateDocModal
          templateId={generateTemplateId}
          template={templates.find(t => t.id === generateTemplateId)!}
          data={generateData}
          recordId={generateRecordId}
          onDataChange={setGenerateData}
          onRecordIdChange={setGenerateRecordId}
          onGenerate={(templateId, data, recordId) => generateMutation.mutate({ templateId, data, recordId })}
          onClose={() => setGenerateTemplateId(null)}
          isLoading={generateMutation.isPending}
        />
      )}

      {previewDoc && (
        <Modal isOpen={!!previewDoc} onClose={() => setPreviewDoc(null)} title={`מסמך ${previewDoc.documentNumber || ""}`}>
          <div className="space-y-4">
            <div className="bg-card rounded-lg p-6 text-foreground max-h-[60vh] overflow-auto">
              <div dangerouslySetInnerHTML={{ __html: previewDoc.generatedHtml || "" }} />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="ghost" onClick={() => setPreviewDoc(null)}>סגור</Button>
              <Button onClick={() => {
                const printWindow = window.open("", "_blank");
                if (printWindow) {
                  printWindow.document.write(previewDoc.generatedHtml || "");
                  printWindow.document.close();
                  printWindow.print();
                }
              }}>
                <Printer className="w-4 h-4 mr-2" /> הדפס / PDF
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function GenerateDocModal({
  templateId,
  template,
  data,
  recordId,
  onDataChange,
  onRecordIdChange,
  onGenerate,
  onClose,
  isLoading,
}: {
  templateId: number;
  template: DocTemplate;
  data: Record<string, string>;
  recordId: number | null;
  onDataChange: (data: Record<string, string>) => void;
  onRecordIdChange: (id: number | null) => void;
  onGenerate: (templateId: number, data: Record<string, string>, recordId?: number | null) => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  const { data: records = [] } = useQuery<EntityRecord[]>({
    queryKey: ["entity-records-generate", template.entityId],
    queryFn: async () => {
      if (!template.entityId) return [];
      const r = await fetch(`${API_BASE}/platform/entities/${template.entityId}/records?limit=50`);
      if (!r.ok) return [];
      const d = await r.json();
      return d.records || [];
    },
    enabled: !!template.entityId,
  });

  return (
    <Modal isOpen={true} onClose={onClose} title="הפקת מסמך">
      <div className="space-y-4">
        {template.entityId && records.length > 0 && (
          <div className="space-y-1">
            <Label>בחר רשומה (אופציונלי)</Label>
            <select
              value={recordId || ""}
              onChange={e => onRecordIdChange(e.target.value ? Number(e.target.value) : null)}
              className="w-full h-12 rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary"
            >
              <option value="">ללא — מלא ידנית</option>
              {records.map(r => (
                <option key={r.id} value={r.id}>
                  #{r.id} - {Object.values(r.data || {}).slice(0, 3).join(", ")}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">בחירת רשומה תמלא את השדות אוטומטית</p>
          </div>
        )}

        {!recordId && (
          <>
            <p className="text-sm text-muted-foreground">מלא את הנתונים ליצירת המסמך:</p>
            {Object.entries(data).map(([key, value]) => (
              <div key={key} className="space-y-1">
                <Label>{key}</Label>
                <Input
                  value={value}
                  onChange={e => onDataChange({ ...data, [key]: e.target.value })}
                  placeholder={`ערך עבור ${key}`}
                />
              </div>
            ))}
          </>
        )}

        {recordId && (
          <p className="text-sm text-emerald-400 bg-emerald-500/10 rounded-lg p-3">
            הנתונים יילקחו אוטומטית מהרשומה שנבחרה
          </p>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-border/50">
          <Button type="button" variant="ghost" onClick={onClose}>ביטול</Button>
          <Button
            onClick={() => {
              const sendData = recordId ? {} : data;
              onGenerate(templateId, sendData, recordId);
            }}
            disabled={isLoading}
          >
            {isLoading ? "מפיק..." : "הפק מסמך"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DocumentDesigner({
  template,
  onClose,
  onSaved,
}: {
  template: DocTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const headerRef = useRef<HTMLTextAreaElement>(null);
  const footerRef = useRef<HTMLTextAreaElement>(null);
  const [activeSection, setActiveSection] = useState<"header" | "body" | "footer">("body");
  const [showVarPicker, setShowVarPicker] = useState(false);
  const [tab, setTab] = useState<"editor" | "preview">("editor");

  const [name, setName] = useState(template?.name || "");
  const [slug, setSlug] = useState(template?.slug || "");
  const [description, setDescription] = useState(template?.description || "");
  const [documentType, setDocumentType] = useState(template?.documentType || "invoice");
  const [entityId, setEntityId] = useState<number | null>(template?.entityId || null);
  const [headerContent, setHeaderContent] = useState(template?.headerContent || "");
  const [bodyContent, setBodyContent] = useState(
    template?.templateContent ||
    `<div style="text-align: center; margin-bottom: 30px;">
  <h1>{{company_name}}</h1>
  <p>{{company_address}}</p>
</div>
<h2>חשבונית מס׳ {{invoice_number}}</h2>
<p>תאריך: {{date}}</p>
<p>לכבוד: {{client_name}}</p>
<hr/>
<table style="width: 100%; border-collapse: collapse;">
  <tr style="background: #f5f5f5;">
    <th style="border: 1px solid #ddd; padding: 8px;">פריט</th>
    <th style="border: 1px solid #ddd; padding: 8px;">כמות</th>
    <th style="border: 1px solid #ddd; padding: 8px;">מחיר</th>
    <th style="border: 1px solid #ddd; padding: 8px;">סה״כ</th>
  </tr>
  <tr>
    <td style="border: 1px solid #ddd; padding: 8px;">{{item_name}}</td>
    <td style="border: 1px solid #ddd; padding: 8px;">{{quantity}}</td>
    <td style="border: 1px solid #ddd; padding: 8px;">{{price}}</td>
    <td style="border: 1px solid #ddd; padding: 8px;">{{total}}</td>
  </tr>
</table>
<p style="text-align: left; font-weight: bold; margin-top: 20px;">סה״כ לתשלום: {{grand_total}}</p>`
  );
  const [footerContent, setFooterContent] = useState(
    template?.footerContent || '<p style="text-align: center; color: #888; font-size: 12px;">מסמך זה הופק אוטומטית</p>'
  );
  const [placeholders, setPlaceholders] = useState<any[]>(
    (template?.placeholders as any[])?.length
      ? template!.placeholders
      : [{ key: "", label: "", defaultValue: "" }]
  );
  const [saving, setSaving] = useState(false);

  const autoSlug = (n: string) => n.toLowerCase().replace(/[^\w\u0590-\u05ff]+/g, "-").replace(/^-|-$/g, "");

  const { modules: _docModules } = usePlatformModules();

  const { data: entities = [] } = useQuery<Entity[]>({
    queryKey: ["all-entities-doc", _docModules.map((m: any) => m.id)],
    queryFn: async () => {
      const results = await Promise.allSettled(
        _docModules.map((mod: any) => authFetch(`${API_BASE}/platform/modules/${mod.id}/entities`).then(r => r.ok ? r.json() : []))
      );
      return results.flatMap(r => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : [])) as Entity[];
    },
    enabled: _docModules.length > 0,
  });

  const { data: fields = [] } = useQuery<EntityField[]>({
    queryKey: ["entity-fields-doc", entityId],
    queryFn: async () => {
      if (!entityId) return [];
      const r = await fetch(`${API_BASE}/platform/entities/${entityId}/fields`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!entityId,
  });

  const insertVariable = (varName: string) => {
    const refs = { header: headerRef, body: bodyRef, footer: footerRef };
    const setters = { header: setHeaderContent, body: setBodyContent, footer: setFooterContent };
    const getters = { header: headerContent, body: bodyContent, footer: footerContent };

    const el = refs[activeSection].current;
    const setter = setters[activeSection];
    const currentContent = getters[activeSection];

    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const insertion = `{{${varName}}}`;
    const newContent = currentContent.substring(0, start) + insertion + currentContent.substring(end);
    setter(newContent);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + insertion.length, start + insertion.length);
    }, 0);
    setShowVarPicker(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name,
        slug: slug || autoSlug(name),
        description: description || undefined,
        documentType,
        entityId: entityId || undefined,
        templateContent: bodyContent,
        headerContent: headerContent || undefined,
        footerContent: footerContent || undefined,
        placeholders: placeholders.filter(p => p.key),
        isActive: true,
      };

      const url = template
        ? `${API_BASE}/platform/document-templates/${template.id}`
        : `${API_BASE}/platform/document-templates`;
      const method = template ? "PUT" : "POST";

      const r = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!r.ok) throw new Error("Failed to save template");
      toast({ title: template ? "עודכן" : "נוצר", description: "תבנית המסמך נשמרה." });
      onSaved();
    } catch (err: any) {
      toast({ title: "שגיאה", description: err?.message || "שמירה נכשלה" });
    } finally {
      setSaving(false);
    }
  };

  const previewHtml = `
    <div style="font-family: Arial, sans-serif; direction: rtl; max-width: 800px; margin: 0 auto; padding: 30px;">
      ${headerContent ? `<div style="margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 15px;">${headerContent}</div>` : ""}
      <div>${bodyContent}</div>
      ${footerContent ? `<div style="margin-top: 30px; border-top: 1px solid #ccc; padding-top: 15px; font-size: 12px; color: #666;">${footerContent}</div>` : ""}
    </div>
  `;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-bold">{template ? "עריכת תבנית מסמך" : "תבנית מסמך חדשה"}</h2>
          <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label>שם התבנית</Label>
              <Input
                value={name}
                onChange={e => { setName(e.target.value); if (!template) setSlug(autoSlug(e.target.value)); }}
                placeholder="חשבונית מס"
              />
            </div>
            <div>
              <Label>מזהה</Label>
              <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="tax-invoice" dir="ltr" className="text-left" />
            </div>
            <div>
              <Label>סוג מסמך</Label>
              <select
                value={documentType}
                onChange={e => setDocumentType(e.target.value)}
                className="w-full h-12 rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary"
              >
                {DOC_TYPES.map(dt => <option key={dt.value} value={dt.value}>{dt.label}</option>)}
              </select>
            </div>
            <div>
              <Label>ישות מקושרת</Label>
              <select
                value={entityId || ""}
                onChange={e => setEntityId(e.target.value ? Number(e.target.value) : null)}
                className="w-full h-12 rounded-xl border-2 border-border bg-background/50 px-3 text-sm focus-visible:outline-none focus-visible:border-primary"
              >
                <option value="">ללא</option>
                {entities.map(ent => <option key={ent.id} value={ent.id}>{ent.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <Label>תיאור</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="תיאור קצר..." />
          </div>

          <div className="flex items-center gap-2 border-b border-border">
            <button
              onClick={() => setTab("editor")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === "editor" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
              }`}
            >
              עורך
            </button>
            <button
              onClick={() => setTab("preview")}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === "preview" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
              }`}
            >
              <Eye className="w-4 h-4 inline-block ml-1" />
              תצוגה מקדימה
            </button>
          </div>

          {tab === "editor" ? (
            <div className="flex gap-4">
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {(["header", "body", "footer"] as const).map(section => (
                      <button
                        key={section}
                        onClick={() => setActiveSection(section)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          activeSection === section
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {section === "header" ? "כותרת עליונה" : section === "body" ? "גוף המסמך" : "כותרת תחתונה"}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setShowVarPicker(!showVarPicker)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 text-purple-400 rounded-lg text-xs font-medium hover:bg-purple-500/20"
                    >
                      <Variable className="w-3.5 h-3.5" />
                      הכנס שדה
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {showVarPicker && (
                      <div className="absolute left-0 top-full mt-1 w-64 bg-card border border-border rounded-xl shadow-xl z-10 max-h-60 overflow-auto">
                        <div className="p-2 border-b border-border">
                          <p className="text-xs font-semibold text-muted-foreground">משתני מערכת</p>
                        </div>
                        {["_record_id", "_status", "_created_at"].map(v => (
                          <button key={v} onClick={() => insertVariable(v)} className="w-full text-right px-3 py-2 text-sm hover:bg-muted/50">
                            <span className="font-mono text-xs text-purple-400">{`{{${v}}}`}</span>
                          </button>
                        ))}
                        {fields.length > 0 && (
                          <>
                            <div className="p-2 border-t border-b border-border">
                              <p className="text-xs font-semibold text-muted-foreground">שדות ישות</p>
                            </div>
                            {fields.map(f => {
                              const entSlug = entities.find(e => e.id === entityId)?.slug || "entity";
                              const varKey = `${entSlug}.${f.slug}`;
                              return (
                                <button key={f.slug} onClick={() => insertVariable(varKey)} className="w-full text-right px-3 py-2 text-sm hover:bg-muted/50">
                                  <span className="font-mono text-xs text-purple-400">{`{{${varKey}}}`}</span>
                                  <span className="text-muted-foreground mr-2">{f.name}</span>
                                </button>
                              );
                            })}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {activeSection === "header" && (
                  <textarea
                    ref={headerRef}
                    value={headerContent}
                    onChange={e => setHeaderContent(e.target.value)}
                    className="w-full min-h-[80px] p-3 bg-background border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                    dir="ltr"
                    placeholder='<div style="text-align: center;"><h2>שם החברה</h2></div>'
                  />
                )}

                {activeSection === "body" && (
                  <textarea
                    ref={bodyRef}
                    value={bodyContent}
                    onChange={e => setBodyContent(e.target.value)}
                    className="w-full min-h-[250px] p-3 bg-background border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                    dir="ltr"
                    placeholder="<h1>{{company_name}}</h1>"
                  />
                )}

                {activeSection === "footer" && (
                  <textarea
                    ref={footerRef}
                    value={footerContent}
                    onChange={e => setFooterContent(e.target.value)}
                    className="w-full min-h-[80px] p-3 bg-background border border-border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                    dir="ltr"
                    placeholder='<p style="text-align: center;">חתימה</p>'
                  />
                )}

                <p className="text-xs text-muted-foreground">
                  {"השתמש ב- {{שם_שדה}} כדי להגדיר placeholders. בחר ישות מקושרת כדי למפות שדות אוטומטית."}
                </p>

                <div className="space-y-2">
                  <Label>Placeholders ידניים</Label>
                  {placeholders.map((ph, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={ph.key}
                        onChange={e => {
                          const phs = [...placeholders];
                          phs[i] = { ...phs[i], key: e.target.value };
                          setPlaceholders(phs);
                        }}
                        placeholder="key"
                        dir="ltr"
                        className="text-left flex-1"
                      />
                      <Input
                        value={ph.label}
                        onChange={e => {
                          const phs = [...placeholders];
                          phs[i] = { ...phs[i], label: e.target.value };
                          setPlaceholders(phs);
                        }}
                        placeholder="תווית"
                        className="flex-1"
                      />
                      {placeholders.length > 1 && (
                        <button onClick={() => setPlaceholders(placeholders.filter((_, idx) => idx !== i))}
                          className="p-2 text-destructive hover:bg-destructive/10 rounded-lg text-sm">✕</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setPlaceholders([...placeholders, { key: "", label: "", defaultValue: "" }])}
                    className="text-xs text-primary hover:text-primary/80 font-medium">+ הוסף placeholder</button>
                </div>
              </div>

              {fields.length > 0 && (
                <div className="w-48 space-y-2">
                  <p className="text-sm font-medium">שדות ישות</p>
                  <div className="bg-muted/10 border border-border rounded-xl p-2 max-h-[350px] overflow-auto space-y-1">
                    {fields.map(f => {
                      const entSlug = entities.find(e => e.id === entityId)?.slug || "entity";
                      const varKey = `${entSlug}.${f.slug}`;
                      return (
                        <button
                          key={f.slug}
                          onClick={() => insertVariable(varKey)}
                          className="w-full text-right px-2 py-1.5 text-xs hover:bg-primary/10 rounded-lg transition-colors"
                        >
                          <span className="text-muted-foreground block">{f.name}</span>
                          <span className="font-mono text-[10px] text-purple-400">{varKey}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card rounded-xl p-6 text-foreground min-h-[400px] border border-border overflow-auto">
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground">ביטול</button>
          <Button onClick={handleSave} disabled={saving || !name}>
            {saving ? "שומר..." : "שמור תבנית"}
          </Button>
        </div>
      </div>
    </div>
  );
}
