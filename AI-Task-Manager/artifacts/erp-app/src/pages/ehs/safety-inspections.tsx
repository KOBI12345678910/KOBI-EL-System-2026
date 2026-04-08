import { useState, useMemo, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { authFetch } from "@/lib/utils";
import { useFormValidation, FormFieldError, RequiredMark } from "@/hooks/use-form-validation";
import {
  ClipboardCheck, Plus, Search, X, Save, Eye, Edit2, Trash2,
  ChevronRight, ChevronLeft, Loader2, AlertTriangle, CheckCircle2,
  XCircle, Minus, LayoutTemplate, PlayCircle, Calendar
} from "lucide-react";

const API = "/api";

const INSPECTION_TYPES = ["בטיחות אש", "חשמל", "מכונות", "סדר וניקיון", "ציוד מגן", "עבודה בגובה", "מחסן", "כניסה למרחב מוגבל", "כלי רכב", "כללי"];
const FREQUENCIES = ["יומי", "שבועי", "חודשי", "רבעוני", "שנתי", "חד-פעמי"];

const STATUS_COLORS: Record<string, string> = {
  "completed": "bg-green-500/20 text-green-300",
  "in_progress": "bg-blue-500/20 text-blue-300",
  "scheduled": "bg-yellow-500/20 text-yellow-300",
  "overdue": "bg-red-500/20 text-red-300",
  "cancelled": "bg-gray-500/20 text-gray-300",
};

const STATUS_LABELS: Record<string, string> = {
  "completed": "הושלם",
  "in_progress": "בביצוע",
  "scheduled": "מתוכנן",
  "overdue": "באיחור",
  "cancelled": "בוטל",
};

const RESULT_COLORS: Record<string, string> = {
  "pass": "bg-green-500/20 text-green-400 border-green-500/30",
  "fail": "bg-red-500/20 text-red-400 border-red-500/30",
  "na": "bg-gray-500/20 text-gray-400 border-gray-500/30",
};

export default function SafetyInspections() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [checklistItems, setChecklistItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"inspections" | "templates" | "execute">("inspections");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [perPage] = useState(25);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [editTemplateId, setEditTemplateId] = useState<number | null>(null);
  const [editInspectionId, setEditInspectionId] = useState<number | null>(null);
  const [templateForm, setTemplateForm] = useState<any>({});
  const [inspectionForm, setInspectionForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const templateValidation = useFormValidation<{ template_name: string }>({
    template_name: { required: true, message: "שם התבנית חובה" },
  });
  const inspectionValidation = useFormValidation<{ inspection_date: string; inspector: string }>({
    inspection_date: { required: true, message: "תאריך ביקורת חובה" },
    inspector: { required: true, message: "שם המבקר חובה" },
  });
  const [error, setError] = useState<string | null>(null);
  const [selectedInspection, setSelectedInspection] = useState<any>(null);
  const [inspectionItemResults, setInspectionItemResults] = useState<any[]>([]);
  const [templateItems, setTemplateItems] = useState<any[]>([]);
  const [showAddTemplateItem, setShowAddTemplateItem] = useState(false);
  const [templateItemForm, setTemplateItemForm] = useState<any>({});
  const [executingInspectionId, setExecutingInspectionId] = useState<number | null>(null);
  const [executeItems, setExecuteItems] = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [templatesRes, inspectionsRes, itemsRes] = await Promise.all([
        authFetch(`${API}/hse-inspection-templates?limit=200`),
        authFetch(`${API}/hse-inspection-results?limit=200`),
        authFetch(`${API}/hse-inspection-checklist-items?limit=2000`),
      ]);
      if (templatesRes.ok) { const j = await templatesRes.json(); setTemplates(Array.isArray(j) ? j : j.data || []); }
      if (inspectionsRes.ok) { const j = await inspectionsRes.json(); setInspections(Array.isArray(j) ? j : j.data || []); }
      if (itemsRes.ok) { const j = await itemsRes.json(); setChecklistItems(Array.isArray(j) ? j : j.data || []); }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let d = [...inspections];
    if (search) d = d.filter(r => [r.template_name, r.inspector, r.area, r.department].some(f => f?.toLowerCase().includes(search.toLowerCase())));
    if (statusFilter !== "all") d = d.filter(r => r.status === statusFilter);
    return d;
  }, [inspections, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageData = filtered.slice((page - 1) * perPage, page * perPage);

  const stats = useMemo(() => ({
    total: inspections.length,
    completed: inspections.filter(i => i.status === "completed").length,
    inProgress: inspections.filter(i => i.status === "in_progress").length,
    overdue: inspections.filter(i => i.status === "overdue").length,
    templates: templates.length,
    findings: inspections.reduce((s, i) => s + (i.findings_count || 0), 0),
  }), [inspections, templates]);

  const saveTemplate = async () => {
    if (!templateValidation.validate(templateForm)) return;
    setSaving(true);
    setError(null);
    try {
      const url = editTemplateId ? `${API}/hse-inspection-templates/${editTemplateId}` : `${API}/hse-inspection-templates`;
      const res = await authFetch(url, { method: editTemplateId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(templateForm) });
      if (!res.ok) throw new Error("שגיאה בשמירה");
      setShowTemplateForm(false); setEditTemplateId(null); setTemplateForm({}); templateValidation.clearErrors();
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const saveInspection = async () => {
    if (!inspectionValidation.validate(inspectionForm)) return;
    setSaving(true);
    setError(null);
    try {
      const template = templates.find(t => t.id === parseInt(inspectionForm.template_id));
      const data = { ...inspectionForm, template_name: template?.template_name || inspectionForm.template_name };
      const url = editInspectionId ? `${API}/hse-inspection-results/${editInspectionId}` : `${API}/hse-inspection-results`;
      const res = await authFetch(url, { method: editInspectionId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("שגיאה בשמירה");
      setShowInspectionForm(false); setEditInspectionId(null); setInspectionForm({}); inspectionValidation.clearErrors();
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const saveTemplateItem = async () => {
    setSaving(true);
    try {
      const data = { ...templateItemForm, template_id: selectedInspection?.id || editTemplateId };
      await authFetch(`${API}/hse-inspection-checklist-items`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      setShowAddTemplateItem(false); setTemplateItemForm({});
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const startExecution = async (inspection: any) => {
    const templateItems = checklistItems.filter(i => i.template_id === inspection.template_id);
    const existingRes = await authFetch(`${API}/hse-inspection-item-results?inspection_id=${inspection.id}`).then(r => r.json()).catch(() => []);
    const items = templateItems.map(ti => {
      const existing = (Array.isArray(existingRes) ? existingRes : existingRes.data || []).find((er: any) => er.checklist_item_id === ti.id);
      return { ...ti, result: existing?.result || "pass", notes: existing?.notes || "", finding_description: existing?.finding_description || "", corrective_action: existing?.corrective_action || "", item_result_id: existing?.id || null };
    });
    setExecuteItems(items);
    setExecutingInspectionId(inspection.id);
    setActiveTab("execute");
  };

  const submitExecution = async () => {
    setSaving(true);
    try {
      const passCount = executeItems.filter(i => i.result === "pass").length;
      const failCount = executeItems.filter(i => i.result === "fail").length;
      const naCount = executeItems.filter(i => i.result === "na").length;
      const findingsCount = executeItems.filter(i => i.result === "fail" && i.finding_description).length;

      for (const item of executeItems) {
        const data = {
          inspection_id: executingInspectionId,
          checklist_item_id: item.id,
          item_description: item.description,
          category: item.category,
          result: item.result,
          notes: item.notes,
          finding_description: item.finding_description,
          corrective_action: item.corrective_action,
          corrective_action_status: item.result === "fail" ? "open" : "na",
        };
        if (item.item_result_id) {
          await authFetch(`${API}/hse-inspection-item-results/${item.item_result_id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        } else {
          await authFetch(`${API}/hse-inspection-item-results`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        }
      }

      await authFetch(`${API}/hse-inspection-results/${executingInspectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed", pass_count: passCount, fail_count: failCount, na_count: naCount, findings_count: findingsCount, overall_result: failCount === 0 ? "pass" : "fail", completed_at: new Date().toISOString() })
      });

      setExecutingInspectionId(null); setExecuteItems([]);
      setActiveTab("inspections");
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="p-6 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-blue-400" />
            ביקורות בטיחות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">רשימות בדיקה, ביצוע ביקורות ומעקב ממצאים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { setShowTemplateForm(true); setEditTemplateId(null); setTemplateForm({ is_active: true, frequency: "חודשי" }); templateValidation.clearErrors(); }} className="border-border text-gray-300 gap-1">
            <LayoutTemplate className="h-4 w-4" />תבנית חדשה
          </Button>
          <Button onClick={() => { setShowInspectionForm(true); setEditInspectionId(null); setInspectionForm({ inspection_date: new Date().toISOString().slice(0,10), status: "scheduled" }); inspectionValidation.clearErrors(); }} className="bg-blue-600 hover:bg-blue-700 gap-2">
            <Plus className="h-4 w-4" />ביקורת חדשה
          </Button>
        </div>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { l: "ביקורות", v: stats.total, c: "text-blue-400" },
          { l: "הושלמו", v: stats.completed, c: "text-green-400" },
          { l: "בביצוע", v: stats.inProgress, c: "text-yellow-400" },
          { l: "באיחור", v: stats.overdue, c: "text-red-400" },
          { l: "תבניות", v: stats.templates, c: "text-purple-400" },
          { l: "ממצאים", v: stats.findings, c: "text-orange-400" },
        ].map((k, i) => (
          <Card key={i} className="bg-card/80 border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{k.l}</p>
              <p className={`text-xl font-bold font-mono mt-1 ${k.c}`}>{loading ? "—" : k.v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex border-b border-border gap-0">
        {[
          { key: "inspections", label: "ביקורות", icon: ClipboardCheck },
          { key: "templates", label: "תבניות", icon: LayoutTemplate },
          ...(executingInspectionId ? [{ key: "execute", label: "בביצוע", icon: PlayCircle }] : []),
        ].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)} className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeTab === t.key ? "border-blue-400 text-blue-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="h-3.5 w-3.5" />{t.label}
          </button>
        ))}
      </div>

      {activeTab === "inspections" && (
        <>
          <Card className="bg-card/60 border-border">
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="חיפוש..." className="pr-9 bg-input border-border text-foreground" />
                </div>
                <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground">
                  <option value="all">כל הסטטוסים</option>
                  {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/80 border-border">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-background/50">
                      <th className="p-3 text-right text-muted-foreground font-medium">מספר</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">תבנית</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">תאריך</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">מבקר</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">אזור</th>
                      <th className="p-3 text-center text-muted-foreground font-medium">עבר</th>
                      <th className="p-3 text-center text-muted-foreground font-medium">נכשל</th>
                      <th className="p-3 text-center text-muted-foreground font-medium">ממצאים</th>
                      <th className="p-3 text-right text-muted-foreground font-medium">סטטוס</th>
                      <th className="p-3 text-center text-muted-foreground font-medium">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      Array.from({length: 5}).map((_, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td colSpan={10} className="p-3">
                            <div className="flex gap-4 animate-pulse">{Array.from({length:6}).map((_,j)=><div key={j} className="h-4 bg-muted rounded flex-1" />)}</div>
                          </td>
                        </tr>
                      ))
                    ) : pageData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-16 text-center">
                          <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                          <p className="text-muted-foreground">אין ביקורות</p>
                          <Button onClick={() => { setShowInspectionForm(true); setEditInspectionId(null); setInspectionForm({ inspection_date: new Date().toISOString().slice(0,10), status: "scheduled" }); inspectionValidation.clearErrors(); }} className="mt-3 bg-blue-600 hover:bg-blue-700 gap-2">
                            <Plus className="h-4 w-4" />ביקורת ראשונה
                          </Button>
                        </td>
                      </tr>
                    ) : pageData.map(row => (
                      <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-mono text-xs text-blue-400">{row.inspection_number || `INS-${row.id}`}</td>
                        <td className="p-3 text-foreground">{row.template_name || "—"}</td>
                        <td className="p-3 text-muted-foreground text-xs">{row.inspection_date?.slice(0,10) || "—"}</td>
                        <td className="p-3 text-muted-foreground">{row.inspector || "—"}</td>
                        <td className="p-3 text-muted-foreground">{row.area || "—"}</td>
                        <td className="p-3 text-center">
                          <span className="text-green-400 font-mono">{row.pass_count || 0}</span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="text-red-400 font-mono">{row.fail_count || 0}</span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`font-mono ${(row.findings_count || 0) > 0 ? "text-orange-400" : "text-muted-foreground"}`}>{row.findings_count || 0}</span>
                        </td>
                        <td className="p-3">
                          <Badge className={STATUS_COLORS[row.status] || "bg-gray-500/20 text-gray-300"}>
                            {STATUS_LABELS[row.status] || row.status}
                          </Badge>
                        </td>
                        <td className="p-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {row.status !== "completed" && (
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="בצע ביקורת" onClick={() => startExecution(row)}>
                                <PlayCircle className="h-3.5 w-3.5 text-green-400" />
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setInspectionForm({...row}); setEditInspectionId(row.id); inspectionValidation.clearErrors(); setShowInspectionForm(true); }}>
                              <Edit2 className="h-3.5 w-3.5 text-blue-400" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={async () => { await authFetch(`${API}/hse-inspection-results/${row.id}`, { method: "DELETE" }); await load(); }}>
                              <Trash2 className="h-3.5 w-3.5 text-red-400" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between p-3 border-t border-border">
                <span className="text-sm text-muted-foreground">מציג {Math.min(filtered.length,(page-1)*perPage+1)}-{Math.min(filtered.length,page*perPage)} מתוך {filtered.length}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" disabled={page<=1} onClick={() => setPage(p=>p-1)} className="h-8 w-8 p-0"><ChevronRight className="h-4 w-4" /></Button>
                  <span className="px-2 py-1 text-sm text-muted-foreground">{page}/{totalPages}</span>
                  <Button variant="ghost" size="sm" disabled={page>=totalPages} onClick={() => setPage(p=>p+1)} className="h-8 w-8 p-0"><ChevronLeft className="h-4 w-4" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {activeTab === "templates" && (
        <div className="space-y-4">
          {templates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <LayoutTemplate className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>אין תבניות ביקורת</p>
              <Button onClick={() => { setShowTemplateForm(true); setEditTemplateId(null); setTemplateForm({ is_active: true, frequency: "חודשי" }); templateValidation.clearErrors(); }} className="mt-3 bg-blue-600 hover:bg-blue-700 gap-2">
                <Plus className="h-4 w-4" />תבנית ראשונה
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map(tmpl => {
                const items = checklistItems.filter(i => i.template_id === tmpl.id);
                return (
                  <Card key={tmpl.id} className="bg-card/80 border-border">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-foreground font-medium">{tmpl.template_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{tmpl.inspection_type} • {tmpl.frequency}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setTemplateForm({...tmpl}); setEditTemplateId(tmpl.id); templateValidation.clearErrors(); setShowTemplateForm(true); }}>
                            <Edit2 className="h-3 w-3 text-blue-400" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={async () => { await authFetch(`${API}/hse-inspection-templates/${tmpl.id}`, { method: "DELETE" }); await load(); }}>
                            <Trash2 className="h-3 w-3 text-red-400" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground">{items.length} פריטי בדיקה</span>
                          <Button variant="ghost" size="sm" className="h-6 text-xs text-blue-400 gap-1 px-2" onClick={() => { setEditTemplateId(tmpl.id); setShowAddTemplateItem(true); setTemplateItemForm({ is_required: true, sort_order: items.length + 1 }); }}>
                            <Plus className="h-3 w-3" />הוסף פריט
                          </Button>
                        </div>
                        {items.length > 0 && (
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {items.map(item => (
                              <div key={item.id} className="flex items-center justify-between text-xs bg-input rounded p-2">
                                <span className="text-muted-foreground truncate flex-1">{item.description}</span>
                                <div className="flex gap-1 mr-2">
                                  {item.category && <Badge className="text-[9px] bg-blue-500/20 text-blue-300 h-4">{item.category}</Badge>}
                                  <Button variant="ghost" size="sm" className="h-4 w-4 p-0" onClick={async () => { await authFetch(`${API}/hse-inspection-checklist-items/${item.id}`, { method: "DELETE" }); await load(); }}>
                                    <X className="h-2.5 w-2.5 text-red-400" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === "execute" && executingInspectionId && (
        <Card className="bg-card/80 border-border">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-foreground font-medium">ביצוע ביקורת</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setExecutingInspectionId(null); setExecuteItems([]); setActiveTab("inspections"); }} className="border-border">ביטול</Button>
                <Button onClick={submitExecution} disabled={saving} size="sm" className="bg-green-600 hover:bg-green-700 gap-1">
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  סיום ביקורת
                </Button>
              </div>
            </div>
            {executeItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>אין פריטי בדיקה בתבנית זו</p>
              </div>
            ) : (
              <div className="space-y-3">
                {executeItems.map((item, idx) => (
                  <div key={idx} className="bg-input rounded-lg p-4 border border-border">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm text-foreground font-medium">{idx + 1}. {item.description}</p>
                        {item.category && <p className="text-xs text-blue-400 mt-0.5">{item.category}</p>}
                        {item.guidance && <p className="text-xs text-muted-foreground mt-1">{item.guidance}</p>}
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        {[
                          { val: "pass", label: "עבר", icon: CheckCircle2, color: "text-green-400" },
                          { val: "fail", label: "נכשל", icon: XCircle, color: "text-red-400" },
                          { val: "na", label: "לא רלוונטי", icon: Minus, color: "text-gray-400" },
                        ].map(opt => (
                          <button
                            key={opt.val}
                            onClick={() => setExecuteItems(prev => prev.map((it, i) => i === idx ? { ...it, result: opt.val } : it))}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${item.result === opt.val ? `${RESULT_COLORS[opt.val]} border-current` : "border-border text-muted-foreground hover:border-gray-500"}`}
                          >
                            <opt.icon className={`h-3 w-3 ${item.result === opt.val ? opt.color : ""}`} />
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {item.result === "fail" && (
                      <div className="mt-3 space-y-2">
                        <Input
                          value={item.finding_description || ""}
                          onChange={e => setExecuteItems(prev => prev.map((it, i) => i === idx ? { ...it, finding_description: e.target.value } : it))}
                          placeholder="תאר את הממצא..."
                          className="bg-card border-red-500/30 text-foreground text-xs"
                        />
                        <Input
                          value={item.corrective_action || ""}
                          onChange={e => setExecuteItems(prev => prev.map((it, i) => i === idx ? { ...it, corrective_action: e.target.value } : it))}
                          placeholder="פעולה מתקנת נדרשת..."
                          className="bg-card border-orange-500/30 text-foreground text-xs"
                        />
                      </div>
                    )}
                    <Input
                      value={item.notes || ""}
                      onChange={e => setExecuteItems(prev => prev.map((it, i) => i === idx ? { ...it, notes: e.target.value } : it))}
                      placeholder="הערות..."
                      className="mt-2 bg-card border-border text-foreground text-xs"
                    />
                  </div>
                ))}
              </div>
            )}
            <div className="pt-3 border-t border-border flex gap-6 text-sm">
              <span className="text-green-400">עבר: {executeItems.filter(i => i.result === "pass").length}</span>
              <span className="text-red-400">נכשל: {executeItems.filter(i => i.result === "fail").length}</span>
              <span className="text-gray-400">לא רלוונטי: {executeItems.filter(i => i.result === "na").length}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {showTemplateForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowTemplateForm(false); setEditTemplateId(null); }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">{editTemplateId ? "עריכת תבנית" : "תבנית ביקורת חדשה"}</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowTemplateForm(false); setEditTemplateId(null); }}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">שם התבנית <RequiredMark /></Label>
                  <Input value={templateForm.template_name || ""} onChange={e => setTemplateForm({...templateForm, template_name: e.target.value})} placeholder="ביקורת בטיחות אש חודשית" className={`bg-input border text-foreground mt-1 ${templateValidation.errors.template_name ? "border-red-500" : "border-border"}`} />
                  <FormFieldError error={templateValidation.errors.template_name} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">סוג ביקורת</Label>
                  <select value={templateForm.inspection_type || ""} onChange={e => setTemplateForm({...templateForm, inspection_type: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    <option value="">בחר...</option>
                    {INSPECTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תדירות</Label>
                  <select value={templateForm.frequency || "חודשי"} onChange={e => setTemplateForm({...templateForm, frequency: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">אזור</Label>
                  <Input value={templateForm.area || ""} onChange={e => setTemplateForm({...templateForm, area: e.target.value})} placeholder="אולם, מחסן..." className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מחלקה</Label>
                  <Input value={templateForm.department || ""} onChange={e => setTemplateForm({...templateForm, department: e.target.value})} placeholder="מחלקה" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">תיאור</Label>
                  <textarea value={templateForm.description || ""} onChange={e => setTemplateForm({...templateForm, description: e.target.value})} rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="תיאור התבנית..." />
                </div>
                <div className="flex items-center gap-3">
                  <input type="checkbox" checked={templateForm.is_active ?? true} onChange={e => setTemplateForm({...templateForm, is_active: e.target.checked})} className="rounded" />
                  <Label className="text-sm text-foreground">פעיל</Label>
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => { setShowTemplateForm(false); setEditTemplateId(null); }} className="border-border">ביטול</Button>
              <Button onClick={saveTemplate} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editTemplateId ? "עדכן" : "שמור"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showInspectionForm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setShowInspectionForm(false); setEditInspectionId(null); }}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">{editInspectionId ? "עריכת ביקורת" : "ביקורת חדשה"}</h2>
              <Button variant="ghost" size="sm" onClick={() => { setShowInspectionForm(false); setEditInspectionId(null); }}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">תבנית ביקורת</Label>
                  <select value={inspectionForm.template_id || ""} onChange={e => {
                    const t = templates.find(t => t.id === parseInt(e.target.value));
                    setInspectionForm({...inspectionForm, template_id: parseInt(e.target.value), template_name: t?.template_name || "", area: t?.area || inspectionForm.area || "", department: t?.department || inspectionForm.department || ""});
                  }} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    <option value="">ללא תבנית</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.template_name}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">תאריך ביקורת <RequiredMark /></Label>
                  <Input type="date" value={inspectionForm.inspection_date || ""} onChange={e => setInspectionForm({...inspectionForm, inspection_date: e.target.value})} className={`bg-input border text-foreground mt-1 ${inspectionValidation.errors.inspection_date ? "border-red-500" : "border-border"}`} />
                  <FormFieldError error={inspectionValidation.errors.inspection_date} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מבקר <RequiredMark /></Label>
                  <Input value={inspectionForm.inspector || ""} onChange={e => setInspectionForm({...inspectionForm, inspector: e.target.value})} placeholder="שם המבקר" className={`bg-input border text-foreground mt-1 ${inspectionValidation.errors.inspector ? "border-red-500" : "border-border"}`} />
                  <FormFieldError error={inspectionValidation.errors.inspector} />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">אזור</Label>
                  <Input value={inspectionForm.area || ""} onChange={e => setInspectionForm({...inspectionForm, area: e.target.value})} placeholder="אולם, מחסן..." className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">מחלקה</Label>
                  <Input value={inspectionForm.department || ""} onChange={e => setInspectionForm({...inspectionForm, department: e.target.value})} placeholder="מחלקה" className="bg-input border-border text-foreground mt-1" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">סטטוס</Label>
                  <select value={inspectionForm.status || "scheduled"} onChange={e => setInspectionForm({...inspectionForm, status: e.target.value})} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1">
                    {Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">ביקורת הבאה</Label>
                  <Input type="date" value={inspectionForm.next_inspection_date || ""} onChange={e => setInspectionForm({...inspectionForm, next_inspection_date: e.target.value})} className="bg-input border-border text-foreground mt-1" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs text-muted-foreground">הערות</Label>
                  <textarea value={inspectionForm.notes || ""} onChange={e => setInspectionForm({...inspectionForm, notes: e.target.value})} rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="הערות..." />
                </div>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => { setShowInspectionForm(false); setEditInspectionId(null); }} className="border-border">ביטול</Button>
              <Button onClick={saveInspection} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editInspectionId ? "עדכן" : "שמור"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showAddTemplateItem && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowAddTemplateItem(false)}>
          <div className="bg-card border border-border rounded-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-bold text-foreground">הוסף פריט לתבנית</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowAddTemplateItem(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground">תיאור פריט *</Label>
                <Input value={templateItemForm.description || ""} onChange={e => setTemplateItemForm({...templateItemForm, description: e.target.value})} placeholder="מה יש לבדוק..." className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">קטגוריה</Label>
                <Input value={templateItemForm.category || ""} onChange={e => setTemplateItemForm({...templateItemForm, category: e.target.value})} placeholder="גובה, חשמל..." className="bg-input border-border text-foreground mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">הנחיה / הסבר</Label>
                <textarea value={templateItemForm.guidance || ""} onChange={e => setTemplateItemForm({...templateItemForm, guidance: e.target.value})} rows={2} className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground mt-1 resize-none" placeholder="הסבר נוסף..." />
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={templateItemForm.is_required ?? true} onChange={e => setTemplateItemForm({...templateItemForm, is_required: e.target.checked})} className="rounded" />
                <Label className="text-sm text-foreground">חובה</Label>
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-border justify-end">
              <Button variant="outline" onClick={() => setShowAddTemplateItem(false)} className="border-border">ביטול</Button>
              <Button onClick={saveTemplateItem} disabled={saving} className="bg-blue-600 hover:bg-blue-700 gap-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                הוסף
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
